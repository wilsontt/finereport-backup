/**
 * FineReport 備份 API 路由
 */
import { Router } from 'express';
import { randomInt } from 'crypto';
import { getOrCreateSession, setSession, setHumanCode, verifyHumanCode, isHumanVerified, hasSshCredentials, hasNasCredentials, } from '../lib/sessionStore.js';
import { success, error } from '../lib/response.js';
import { DEFAULT_BACKUP_SOURCES } from '../constants/defaultBackupSources.js';
import { verifySsh, verifySudo, listRemoteDirectory } from '../services/sshService.js';
import { verifyNas, listNasDirectory, createNasDirectory } from '../services/nasService.js';
import { discoverRemote } from '../services/pathDiscovery.js';
import { verifySshSchema, verifySudoSchema, verifyNasSchema, verifyHumanSchema, discoverRemoteSchema, remoteBrowseSchema, createNasDirSchema, addSourceSchema, } from '../schemas/backup.js';
import { createBackupId, addProgress, getProgressList, getLastProgress, getLogs, getReport, runBackupAsync, } from '../services/backupExecutor.js';
const startBackupSchema = {
    stagingPath: (v) => typeof v === 'string' && v.length > 0,
    sources: (v) => Array.isArray(v),
    nasPath: (v) => typeof v === 'string',
    deleteOldBackup: (v) => typeof v === 'boolean',
    retentionMonths: (v) => typeof v === 'number',
};
export const backupRouter = Router();
function getSessionId(req) {
    const id = req.headers['x-session-id'] ||
        req.query.sessionId;
    return id || `default-${Date.now()}`;
}
/** 取得預設 + 自訂備份來源 */
backupRouter.get('/sources', (req, res) => {
    success(res, { sources: DEFAULT_BACKUP_SOURCES });
});
/** 驗證 SSH */
backupRouter.post('/verify-ssh', async (req, res) => {
    const parsed = verifySshSchema.safeParse(req.body);
    if (!parsed.success) {
        return error(res, 'ERR_VALIDATION', '參數驗證失敗', 400);
    }
    try {
        await verifySsh(parsed.data);
        const sessionId = getSessionId(req);
        setSession(sessionId, {
            ssh: {
                host: parsed.data.host,
                username: parsed.data.username,
                password: parsed.data.password,
            },
        });
        success(res, { ok: true });
    }
    catch (err) {
        const code = err.message;
        const status = code === 'ERR_SSH_AUTH' ? 401 : 500;
        return error(res, code, code === 'ERR_SSH_AUTH' ? 'SSH 認證失敗' : 'SSH 連線失敗', status);
    }
});
/** 驗證 sudo */
backupRouter.post('/verify-sudo', async (req, res) => {
    const parsed = verifySudoSchema.safeParse(req.body);
    if (!parsed.success) {
        return error(res, 'ERR_VALIDATION', '參數驗證失敗', 400);
    }
    const sessionId = getSessionId(req);
    const sess = getOrCreateSession(sessionId);
    if (!sess.ssh) {
        return error(res, 'ERR_SSH_NOT_CONNECTED', '請先完成 SSH 驗證', 400);
    }
    try {
        const creds = sess.ssh;
        await verifySudo(creds, parsed.data.sudoPassword);
        setSession(sessionId, { sudoPassword: parsed.data.sudoPassword });
        success(res, { ok: true });
    }
    catch {
        return error(res, 'ERR_SUDO_FAILED', 'sudo 密碼錯誤或無 root 權限', 401);
    }
});
/** 驗證 NAS */
backupRouter.post('/verify-nas', async (req, res) => {
    const parsed = verifyNasSchema.safeParse(req.body);
    if (!parsed.success) {
        return error(res, 'ERR_VALIDATION', '參數驗證失敗', 400);
    }
    try {
        const result = await verifyNas(parsed.data);
        const sessionId = getSessionId(req);
        setSession(sessionId, {
            nas: {
                host: parsed.data.host,
                username: parsed.data.username,
                password: parsed.data.password,
                share: parsed.data.share,
                path: parsed.data.path,
                domain: parsed.data.domain,
            },
        });
        success(res, result);
    }
    catch (err) {
        const code = err.message;
        const status = code === 'ERR_NAS_AUTH' ? 401
            : code === 'ERR_NAS_PATH' ? 400
                : code === 'ERR_NAS_TIMEOUT' ? 504
                    : typeof code === 'string' && code.startsWith('ERR_NAS_MOUNT') ? 500
                        : code === 'ERR_NAS_SMBCLIENT_NOT_FOUND' ? 503
                            : 500;
        const msg = code === 'ERR_NAS_AUTH'
            ? 'NAS 認證失敗'
            : code === 'ERR_NAS_PATH'
                ? 'NAS 路徑不存在或無權限'
                : code === 'ERR_NAS_TIMEOUT'
                    ? '逾時原因：NAS 在 20 秒內無回應。請檢查 NAS 是否可達、網路是否正常，修正後再驗證'
                    : typeof code === 'string' && code.startsWith('ERR_NAS_MOUNT')
                        ? 'NAS 掛載失敗，請檢查憑證與網路連線'
                        : code === 'ERR_NAS_SMBCLIENT_NOT_FOUND'
                            ? 'smbclient 未安裝，請在伺服器執行: brew install samba'
                            : 'NAS 連線失敗';
        return error(res, code, msg, status);
    }
});
/** 4 碼數字驗證 */
backupRouter.post('/verify-human', async (req, res) => {
    const parsed = verifyHumanSchema.safeParse(req.body);
    if (!parsed.success) {
        return error(res, 'ERR_VALIDATION', '參數驗證失敗', 400);
    }
    const sessionId = getSessionId(req);
    if (parsed.data.action === 'get') {
        const sess = getOrCreateSession(sessionId);
        if (!hasSshCredentials(sessionId) || !sess.sudoPassword || !hasNasCredentials(sessionId)) {
            return error(res, 'ERR_HUMAN_NOT_READY', '請先完成 SSH、sudo、NAS 驗證', 400);
        }
        const code = String(randomInt(0, 10000)).padStart(4, '0');
        setHumanCode(sessionId, code);
        return success(res, { code, expiresIn: 300 });
    }
    if (parsed.data.action === 'verify') {
        if (!parsed.data.code) {
            return error(res, 'ERR_VALIDATION', '請輸入 4 碼驗證碼', 400);
        }
        if (!verifyHumanCode(sessionId, parsed.data.code)) {
            const sess = getOrCreateSession(sessionId);
            if (sess.humanExpiresAt && Date.now() > sess.humanExpiresAt) {
                return error(res, 'ERR_HUMAN_EXPIRED', '驗證碼已過期，請重新取得', 401);
            }
            return error(res, 'ERR_HUMAN_MISMATCH', '驗證碼錯誤', 401);
        }
        return success(res, { ok: true });
    }
    return error(res, 'ERR_VALIDATION', '無效的 action', 400);
});
/** 取得 NAS 預設路徑（驗證時輸入的 path） */
backupRouter.get('/nas-default-path', (req, res) => {
    const sessionId = getSessionId(req);
    const sess = getOrCreateSession(sessionId);
    if (!sess.nas) {
        return error(res, 'ERR_NAS_NOT_VERIFIED', '請先完成 NAS 驗證', 400);
    }
    success(res, { path: sess.nas.path });
});
/** 瀏覽 NAS 目錄 */
backupRouter.post('/nas-browse', async (req, res) => {
    const sessionId = getSessionId(req);
    if (!isHumanVerified(sessionId)) {
        return error(res, 'ERR_NOT_VERIFIED', '請先完成 4 碼數字驗證', 403);
    }
    const sess = getOrCreateSession(sessionId);
    if (!sess.nas) {
        return error(res, 'ERR_NAS_NOT_VERIFIED', '請先完成 NAS 驗證', 400);
    }
    const path = req.body?.path;
    try {
        const entries = await listNasDirectory(sess.nas, path ?? '');
        success(res, { entries });
    }
    catch (err) {
        const code = err.message;
        const status = code === 'ERR_NAS_AUTH' ? 401 : code === 'ERR_NAS_PATH' ? 400 : 500;
        const msg = code === 'ERR_NAS_AUTH' ? 'NAS 認證失敗' : code === 'ERR_NAS_PATH' ? 'NAS 路徑不存在或無權限' : 'NAS 瀏覽失敗';
        return error(res, code, msg, status);
    }
});
/** 新增 NAS 目錄 */
backupRouter.post('/nas-mkdir', async (req, res) => {
    const parsed = createNasDirSchema.safeParse(req.body);
    if (!parsed.success) {
        return error(res, 'ERR_VALIDATION', parsed.error.errors[0]?.message ?? '參數驗證失敗', 400);
    }
    const sessionId = getSessionId(req);
    if (!isHumanVerified(sessionId)) {
        return error(res, 'ERR_NOT_VERIFIED', '請先完成 4 碼數字驗證', 403);
    }
    const sess = getOrCreateSession(sessionId);
    if (!sess.nas) {
        return error(res, 'ERR_NAS_NOT_VERIFIED', '請先完成 NAS 驗證', 400);
    }
    try {
        await createNasDirectory(sess.nas, parsed.data.path, parsed.data.dirName);
        success(res, { ok: true });
    }
    catch (err) {
        const code = err.message;
        const status = code === 'ERR_NAS_AUTH' ? 401
            : code === 'ERR_NAS_PATH' ? 400
                : code === 'ERR_NAS_EXISTS' ? 409
                    : code === 'ERR_NAS_INVALID_NAME' ? 400
                        : 500;
        const msg = code === 'ERR_NAS_AUTH' ? 'NAS 認證失敗'
            : code === 'ERR_NAS_PATH' ? 'NAS 路徑不存在或無權限'
                : code === 'ERR_NAS_EXISTS' ? '目錄已存在'
                    : code === 'ERR_NAS_INVALID_NAME' ? '目錄名稱無效'
                        : '新增目錄失敗';
        return error(res, code, msg, status);
    }
});
/** 瀏覽遠端目錄（SSH） */
backupRouter.post('/remote-browse', async (req, res) => {
    const parsed = remoteBrowseSchema.safeParse(req.body);
    if (!parsed.success) {
        return error(res, 'ERR_VALIDATION', '參數驗證失敗', 400);
    }
    const sessionId = getSessionId(req);
    if (!isHumanVerified(sessionId)) {
        return error(res, 'ERR_NOT_VERIFIED', '請先完成 4 碼數字驗證', 403);
    }
    const sess = getOrCreateSession(sessionId);
    if (!sess.ssh || !sess.sudoPassword) {
        return error(res, 'ERR_NOT_VERIFIED', '請先完成 SSH 與 sudo 驗證', 403);
    }
    try {
        const entries = await listRemoteDirectory(sess.ssh, sess.sudoPassword, parsed.data.path);
        success(res, { entries });
    }
    catch (err) {
        const code = err.message;
        const status = code === 'ERR_REMOTE_PATH' ? 400 : 500;
        const msg = code === 'ERR_REMOTE_PATH' ? '遠端路徑不存在或無權限' : '瀏覽遠端目錄失敗';
        return error(res, code, msg, status);
    }
});
/** 探索遠端目錄 */
backupRouter.post('/discover-remote', async (req, res) => {
    const parsed = discoverRemoteSchema.safeParse(req.body);
    if (!parsed.success) {
        return error(res, 'ERR_VALIDATION', '參數驗證失敗', 400);
    }
    const sessionId = getSessionId(req);
    if (!isHumanVerified(sessionId)) {
        return error(res, 'ERR_NOT_VERIFIED', '請先完成 4 碼數字驗證', 403);
    }
    const sess = getOrCreateSession(sessionId);
    if (!sess.ssh || !sess.sudoPassword) {
        return error(res, 'ERR_NOT_VERIFIED', '請先完成 SSH 與 sudo 驗證', 403);
    }
    try {
        const sources = await discoverRemote(sess.ssh, sess.sudoPassword, parsed.data.basePath);
        success(res, { sources });
    }
    catch (err) {
        const msg = err.message;
        return error(res, 'ERR_DISCOVER_FAILED', msg || '探索遠端目錄失敗', 500);
    }
});
/** 取得預設暫存目錄路徑（供前端預填） */
backupRouter.get('/staging-default-path', (req, res) => {
    const sessionId = getSessionId(req);
    const sess = getOrCreateSession(sessionId);
    if (!sess.ssh) {
        return success(res, { path: `/home/crownap/backup/${new Date().toISOString().slice(0, 7).replace('-', '')}` });
    }
    const backupMonth = new Date().toISOString().slice(0, 7).replace('-', '');
    const path = `/home/${sess.ssh.username}/backup/${backupMonth}`;
    success(res, { path });
});
/** 建立遠端暫存目錄（由使用者選擇的路徑） */
backupRouter.post('/create-staging-dir', async (req, res) => {
    const sessionId = getSessionId(req);
    if (!isHumanVerified(sessionId)) {
        return error(res, 'ERR_NOT_VERIFIED', '請先完成 4 碼數字驗證', 403);
    }
    const body = req.body;
    const stagingPath = typeof body.stagingPath === 'string' ? body.stagingPath.trim() : '';
    if (!stagingPath) {
        return error(res, 'ERR_VALIDATION', '請輸入暫存目錄路徑', 400);
    }
    if (!/^\/[a-zA-Z0-9/_.-]+$/.test(stagingPath)) {
        return error(res, 'ERR_VALIDATION', '暫存目錄路徑格式錯誤（應為絕對路徑）', 400);
    }
    const sess = getOrCreateSession(sessionId);
    if (!sess.ssh || !sess.sudoPassword) {
        return error(res, 'ERR_NOT_VERIFIED', '請先完成 SSH 與 sudo 驗證', 403);
    }
    const { execWithSudo } = await import('../services/sshService.js');
    const escPath = stagingPath.replace(/"/g, '\\"');
    const mkdirCmd = `mkdir -p "${escPath}"`;
    const { code } = await execWithSudo(sess.ssh, sess.sudoPassword, mkdirCmd, true);
    if (code !== 0) {
        return error(res, 'ERR_STAGING_CREATE', '無法在遠端建立暫存目錄', 500);
    }
    const backupMonth = stagingPath.split('/').filter(Boolean).pop() ?? '';
    success(res, { ok: true, path: stagingPath, backupMonth });
});
/** 開始備份 */
backupRouter.post('/start', async (req, res) => {
    const sessionId = getSessionId(req);
    if (!isHumanVerified(sessionId)) {
        return error(res, 'ERR_NOT_VERIFIED', '請先完成 4 碼數字驗證', 403);
    }
    const body = req.body;
    if (!startBackupSchema.stagingPath(body.stagingPath) ||
        !startBackupSchema.sources(body.sources) ||
        !startBackupSchema.nasPath(body.nasPath) ||
        !startBackupSchema.deleteOldBackup(body.deleteOldBackup) ||
        !startBackupSchema.retentionMonths(body.retentionMonths)) {
        return error(res, 'ERR_VALIDATION', '參數驗證失敗', 400);
    }
    const backupId = createBackupId();
    addProgress(backupId, { step: 'create_dirs', percent: 0, message: '備份已啟動' });
    runBackupAsync(backupId, {
        sessionId,
        stagingPath: body.stagingPath,
        sources: body.sources,
        nasPath: body.nasPath,
        deleteOldBackup: body.deleteOldBackup === true,
        retentionMonths: Number(body.retentionMonths) || 0,
    });
    success(res, { backupId, status: 'running' }, 202);
});
/** SSE 進度串流（持續推送直到備份完成） */
backupRouter.get('/progress/:backupId', (req, res) => {
    const { backupId } = req.params;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    let lastSent = 0;
    const sendNewProgress = () => {
        const list = getProgressList(backupId);
        const logs = getLogs(backupId);
        for (let i = lastSent; i < list.length; i++) {
            const p = list[i];
            res.write(`event: progress\ndata: ${JSON.stringify({ ...p, logs })}\n\n`);
        }
        lastSent = list.length;
        const last = getLastProgress(backupId);
        if (last && last.percent >= 100) {
            const success = last.step !== 'error';
            res.write(`event: done\ndata: ${JSON.stringify({ step: last.step, percent: 100, success, error: last.step === 'error' ? last.message : undefined, logs: getLogs(backupId) })}\n\n`);
            res.end();
            return true;
        }
        return false;
    };
    if (sendNewProgress())
        return;
    const timer = setInterval(() => {
        if (res.writableEnded) {
            clearInterval(timer);
            return;
        }
        if (sendNewProgress())
            clearInterval(timer);
    }, 800);
    req.on('close', () => clearInterval(timer));
});
/** 取得完成報告 */
backupRouter.get('/report/:backupId', (req, res) => {
    const { backupId } = req.params;
    const content = getReport(backupId) ?? `# FineReport 備份報告\n\n備份 ID: ${backupId}\n\n（報告產生中）`;
    success(res, { content, format: 'markdown', backupId, backupMonth: '' });
});
/** 新增自訂來源 */
backupRouter.post('/sources', (req, res) => {
    const parsed = addSourceSchema.safeParse(req.body);
    if (!parsed.success) {
        return error(res, 'ERR_VALIDATION', '參數驗證失敗', 400);
    }
    const id = `custom-${Date.now()}`;
    const item = {
        id,
        label: parsed.data.label,
        sourcePath: parsed.data.sourcePath,
        destPath: parsed.data.destPath,
        isAbsoluteSource: parsed.data.isAbsoluteSource ?? true,
    };
    success(res, item, 201);
});
//# sourceMappingURL=backup.js.map