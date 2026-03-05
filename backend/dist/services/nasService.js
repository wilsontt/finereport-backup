/**
 * NAS SMB 連線服務
 * 1. 驗證 NAS：使用 mount 掛載，掛載成功即驗證成功
 * 2. 瀏覽/建立目錄：使用 smbclient（listNasDirectory、createNasDirectory）
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** macOS Homebrew samba 若無 smb.conf 會報錯，使用專案內最小設定檔 */
const SMB_CONF_PATH = path.join(__dirname, '..', '..', 'smb.conf');
const fullPath = (host, share, p) => `\\\\${host}\\${share}\\${p.replace(/\//g, '\\')}`;
const isDarwin = () => process.platform === 'darwin';
/**
 * 掛載 NAS SMB 分享至本機目錄
 * @param creds NAS 憑證
 * @param mountPoint 掛載點（需已存在且為空）
 */
/**
 * 檢查該 NAS share 是否已掛載（如 Finder 手動掛載），若有則回傳掛載點
 * "File exists" 通常表示同一 share 已掛載於他處
 */
async function findExistingNasMount(host, share) {
    return new Promise((resolve) => {
        const proc = spawn('df', [], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        proc.stdout?.on('data', (d) => { stdout += d.toString(); });
        proc.on('close', (code) => {
            if (code !== 0) {
                resolve(null);
                return;
            }
            const lines = stdout.split('\n');
            for (const line of lines) {
                if (line.includes(host) && (line.includes(share) || line.includes(encodeURIComponent(share)))) {
                    const cols = line.trim().split(/\s+/);
                    if (cols.length >= 6) {
                        resolve(cols[cols.length - 1]);
                        return;
                    }
                }
            }
            resolve(null);
        });
        proc.on('error', () => resolve(null));
    });
}
export async function mountNas(creds, mountPoint) {
    const host = creds.host.replace(/^smb:\/\//, '').trim();
    const share = creds.share;
    const username = creds.username;
    const password = creds.password;
    const domain = creds.domain ?? 'WORKGROUP';
    const existingMount = await findExistingNasMount(host, share);
    if (existingMount) {
        return { path: existingMount, didMount: false };
    }
    if (fs.existsSync(mountPoint)) {
        try {
            await unmountNas(mountPoint);
        }
        catch {
            // 非掛載點或已卸載
        }
        try {
            fs.rmSync(mountPoint, { recursive: true, force: true });
        }
        catch {
            // ignore
        }
    }
    fs.mkdirSync(mountPoint, { recursive: true });
    return new Promise((resolve, reject) => {
        if (isDarwin()) {
            // macOS: mount_smbfs "//user:password@host/share" mountPoint
            // 密碼與 share 需 URL 編碼（含中文、特殊字元 ?@:% 等）
            const escapedPassword = encodeURIComponent(password);
            const escapedShare = encodeURIComponent(share);
            const url = `//${username}:${escapedPassword}@${host}/${escapedShare}`;
            const proc = spawn('mount_smbfs', [url, mountPoint], { stdio: ['ignore', 'pipe', 'pipe'] });
            let stderr = '';
            proc.stderr?.on('data', (d) => { stderr += d.toString(); });
            proc.on('close', async (code) => {
                if (code === 0) {
                    resolve({ path: mountPoint, didMount: true });
                    return;
                }
                console.error('[mountNas] mount_smbfs 失敗:', stderr);
                const msg = stderr.toLowerCase();
                if (msg.includes('file exists')) {
                    const existing = await findExistingNasMount(host, share);
                    if (existing) {
                        resolve({ path: existing, didMount: false });
                        return;
                    }
                }
                if (msg.includes('auth') || msg.includes('denied') || msg.includes('logon')) {
                    reject(new Error('ERR_NAS_AUTH'));
                }
                else if (msg.includes('no such file') || msg.includes('not found') || msg.includes('url parsing')) {
                    reject(new Error('ERR_NAS_PATH'));
                }
                else {
                    reject(new Error(`ERR_NAS_MOUNT: ${stderr}`));
                }
            });
            proc.on('error', (e) => {
                if (e.code === 'ENOENT') {
                    reject(new Error('ERR_NAS_MOUNT: mount_smbfs 未找到，請確認系統支援'));
                }
                else
                    reject(e);
            });
        }
        else {
            // Linux: mount -t cifs
            const opts = `username=${username},password=${password},domain=${domain}`;
            const proc = spawn('mount', ['-t', 'cifs', `//${host}/${share}`, mountPoint, '-o', opts], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            let stderr = '';
            proc.stderr?.on('data', (d) => { stderr += d.toString(); });
            proc.on('close', (code) => {
                if (code === 0) {
                    resolve({ path: mountPoint, didMount: true });
                    return;
                }
                const msg = stderr.toLowerCase();
                if (msg.includes('auth') || msg.includes('denied') || msg.includes('permission denied')) {
                    reject(new Error('ERR_NAS_AUTH'));
                }
                else if (msg.includes('no such file') || msg.includes('mount point')) {
                    reject(new Error('ERR_NAS_PATH'));
                }
                else {
                    reject(new Error(`ERR_NAS_MOUNT: ${stderr}`));
                }
            });
            proc.on('error', (e) => {
                reject(new Error(`ERR_NAS_MOUNT: ${e.message}`));
            });
        }
    });
}
/**
 * 卸載 NAS 掛載點
 */
export async function unmountNas(mountPoint) {
    return new Promise((resolve, reject) => {
        const proc = spawn('umount', [mountPoint], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`ERR_NAS_UMOUNT: ${stderr}`));
        });
        proc.on('error', reject);
    });
}
/**
 * 驗證 NAS：掛載後立即卸載，成功即驗證通過
 */
async function verifyViaMount(creds) {
    const mountPoint = path.join(os.tmpdir(), `finereport-nas-verify-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    try {
        const result = await mountNas(creds, mountPoint);
        if (result.didMount) {
            await unmountNas(result.path);
        }
        const host = creds.host.replace(/^smb:\/\//, '').trim();
        return { ok: true, fullPath: fullPath(host, creds.share, creds.path) };
    }
    finally {
        try {
            fs.rmSync(mountPoint, { recursive: true, force: true });
        }
        catch {
            // ignore
        }
    }
}
/**
 * Fallback：使用系統 smbclient 驗證（當 mount 不可用時）
 */
async function verifyViaSmbclient(creds) {
    const host = creds.host.replace(/^smb:\/\//, '').trim();
    const address = `//${host}/${creds.share}`;
    const path = creds.path.replace(/\\/g, '/') || '.';
    return new Promise((resolve, reject) => {
        const args = [
            '-s', SMB_CONF_PATH,
            address,
            '-U', `${creds.username}%${creds.password}`,
            '-c', `ls "${path}"`,
        ];
        if (creds.domain && creds.domain !== 'WORKGROUP') {
            args.splice(3, 0, '-W', creds.domain);
        }
        const proc = spawn('smbclient', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ ok: true, fullPath: fullPath(host, creds.share, creds.path) });
            }
            else {
                const msg = stderr.toLowerCase();
                if (msg.includes('auth') || msg.includes('nt_status_logon_failure')) {
                    reject(new Error('ERR_NAS_AUTH'));
                }
                else if (msg.includes('bad network name') || msg.includes('access denied')) {
                    reject(new Error('ERR_NAS_PATH'));
                }
                else {
                    reject(new Error('ERR_NAS_CONNECT'));
                }
            }
        });
        proc.on('error', (e) => {
            if (e.code === 'ENOENT') {
                reject(new Error('ERR_NAS_SMBCLIENT_NOT_FOUND'));
            }
            else {
                reject(new Error('ERR_NAS_CONNECT'));
            }
        });
    });
}
const VERIFY_NAS_TIMEOUT_MS = 20000;
/**
 * 驗證 NAS 連線（優先掛載測試，失敗則 fallback smbclient）
 * 含 20 秒逾時，避免 NAS 無回應時卡住
 */
export async function verifyNas(creds) {
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('ERR_NAS_TIMEOUT')), VERIFY_NAS_TIMEOUT_MS));
    const verifyPromise = (async () => {
        try {
            return await verifyViaMount(creds);
        }
        catch (mountErr) {
            console.error('[NAS verifyNas] mount 失敗，嘗試 smbclient fallback:', mountErr.message);
            return await verifyViaSmbclient(creds);
        }
    })();
    return Promise.race([verifyPromise, timeoutPromise]);
}
/**
 * 列出 NAS 目錄內容（供瀏覽用，使用 smbclient）
 * smbclient ls 需先 cd 到目標路徑，ls 的參數是 mask 不是路徑
 * 輸出格式：  filename    DHS        0  Mon Oct  5 16:08:57 2020
 * 屬性 D=目錄, A=檔案, H=隱藏, R=唯讀, S=系統
 */
export async function listNasDirectory(creds, path) {
    const host = creds.host.replace(/^smb:\/\//, '').trim();
    const address = `//${host}/${creds.share}`;
    const dirPath = (path || creds.path || '.').replace(/\\/g, '/');
    return new Promise((resolve, reject) => {
        const escapedPath = dirPath.replace(/"/g, '\\"');
        const args = [
            '-s', SMB_CONF_PATH,
            address,
            '-U', `${creds.username}%${creds.password}`,
            '-c', `cd "${escapedPath}"; ls`,
        ];
        if (creds.domain && creds.domain !== 'WORKGROUP') {
            args.splice(3, 0, '-W', creds.domain);
        }
        const proc = spawn('smbclient', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', (d) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            if (code !== 0) {
                const msg = stderr.toLowerCase();
                if (msg.includes('auth') || msg.includes('nt_status_logon_failure')) {
                    reject(new Error('ERR_NAS_AUTH'));
                }
                else if (msg.includes('bad network name') || msg.includes('access denied') || msg.includes('no such file')) {
                    reject(new Error('ERR_NAS_PATH'));
                }
                else {
                    reject(new Error('ERR_NAS_CONNECT'));
                }
                return;
            }
            const entries = [];
            const lines = stdout.split('\n').filter((l) => l.trim());
            for (const line of lines) {
                const m = line.match(/^\s+(.+?)\s+([A-Z]+)\s+\d+/);
                if (m) {
                    const name = m[1].trim();
                    const attrs = m[2];
                    if (name && name !== '.' && name !== '..') {
                        entries.push({ name, isDir: attrs.includes('D') });
                    }
                }
            }
            resolve(entries);
        });
        proc.on('error', (e) => {
            if (e.code === 'ENOENT') {
                reject(new Error('ERR_NAS_SMBCLIENT_NOT_FOUND'));
            }
            else {
                reject(new Error('ERR_NAS_CONNECT'));
            }
        });
    });
}
/**
 * 在 NAS 指定路徑下新增目錄（使用 smbclient mkdir）
 */
export async function createNasDirectory(creds, parentPath, dirName) {
    const host = creds.host.replace(/^smb:\/\//, '').trim();
    const address = `//${host}/${creds.share}`;
    const dirPath = (parentPath || creds.path || '.').replace(/\\/g, '/');
    const safeName = dirName.replace(/[/\\*?"<>|]/g, '').trim();
    if (!safeName) {
        throw new Error('ERR_NAS_INVALID_NAME');
    }
    return new Promise((resolve, reject) => {
        const escapedPath = dirPath.replace(/"/g, '\\"');
        const escapedName = safeName.replace(/"/g, '\\"');
        const args = [
            '-s', SMB_CONF_PATH,
            address,
            '-U', `${creds.username}%${creds.password}`,
            '-c', `cd "${escapedPath}"; mkdir "${escapedName}"`,
        ];
        if (creds.domain && creds.domain !== 'WORKGROUP') {
            args.splice(3, 0, '-W', creds.domain);
        }
        const proc = spawn('smbclient', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            if (code !== 0) {
                const msg = stderr.toLowerCase();
                if (msg.includes('auth') || msg.includes('nt_status_logon_failure')) {
                    reject(new Error('ERR_NAS_AUTH'));
                }
                else if (msg.includes('already exists') || msg.includes('file exists')) {
                    reject(new Error('ERR_NAS_EXISTS'));
                }
                else if (msg.includes('access denied') || msg.includes('permission')) {
                    reject(new Error('ERR_NAS_PATH'));
                }
                else {
                    reject(new Error('ERR_NAS_CONNECT'));
                }
                return;
            }
            resolve();
        });
        proc.on('error', (e) => {
            if (e.code === 'ENOENT') {
                reject(new Error('ERR_NAS_SMBCLIENT_NOT_FOUND'));
            }
            else {
                reject(new Error('ERR_NAS_CONNECT'));
            }
        });
    });
}
//# sourceMappingURL=nasService.js.map