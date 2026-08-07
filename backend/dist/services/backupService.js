/**
 * 備份服務：遠端複製 + 打包分卷 + SFTP 本機暫存 + NAS 寫入
 * 1. SSH 遠端 cp / chown
 * 2. 全部來源先遠端 tar（>30MB 則 split），產物留在 FineReport
 * 3. 逐檔：SFTP→容器本機暫存（核對大小／重試）→ 掛載 copy 或 smbclient put（核對／重試）
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import SftpClient from 'ssh2-sftp-client';
import { execWithSudo } from './sshService.js';
import { fileURLToPath } from 'url';
import { mountNas, unmountNas, createNasDirectory, resolveSmbclientBin, listNasDirectory } from './nasService.js';
import { NAS_CHUNK_BYTES, shouldChunkArchive, partFilePrefix, formatRestoreHint, } from '../lib/nasChunk.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SMB_CONF_PATH = path.join(__dirname, '..', '..', 'smb.conf');
/** 單一檔／分卷 SFTP 或 NAS 寫入逾時 */
const SOURCE_PART_TIMEOUT_MS = 5 * 60 * 1000;
/** 單一來源下載＋上傳總逾時 */
const SOURCE_TOTAL_TIMEOUT_MS = 45 * 60 * 1000;
/** 單卷傳輸失敗時的最大嘗試次數（含首次） */
const NAS_TRANSFER_MAX_ATTEMPTS = 3;
async function ensureNasPath(creds, fullPath) {
    const parts = fullPath.replace(/\\/g, '/').split('/').filter(Boolean);
    let parent = '.';
    for (const p of parts) {
        try {
            await createNasDirectory(creds, parent, p);
        }
        catch (e) {
            if (e.message !== 'ERR_NAS_EXISTS')
                throw e;
        }
        parent = parent === '.' ? p : `${parent}/${p}`;
    }
}
/**
 * 透過 smbclient 將單一檔案上傳至 NAS 指定目錄，失敗時依 smbclient 輸出內容分類錯誤原因
 */
async function smbclientPutFile(creds, localFilePath, nasTargetDir, remoteFileName, onLog) {
    const host = creds.host.replace(/^smb:\/\//, '').trim();
    const address = `//${host}/${creds.share}`;
    const args = ['-s', SMB_CONF_PATH, address, '-U', `${creds.username}%${creds.password}`];
    if (creds.domain && creds.domain !== 'WORKGROUP') {
        args.splice(3, 0, '-W', creds.domain);
    }
    const cdEsc = nasTargetDir.replace(/"/g, '\\"');
    const localEsc = localFilePath.replace(/"/g, '\\"');
    const putCmd = `cd "${cdEsc}"; put "${localEsc}" "${remoteFileName}"`;
    const proc = spawn(resolveSmbclientBin(), [...args, '-c', putCmd], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
        // smbclient 常把連線錯誤（如 do_connect ... NT_STATUS_HOST_UNREACHABLE）寫到 stdout，
        // 故 stdout、stderr 都要收集，否則失敗時錯誤訊息會是空字串。
        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', (d) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            if (code !== 0) {
                const combined = `${stdout}\n${stderr}`.trim();
                const detail = combined || `(smbclient 無輸出，exit=${code})`;
                const msg = combined.toLowerCase();
                // 失敗時記錄詳細日誌：檔名、目的路徑、exit code、smbclient 完整輸出（指令不含密碼）
                onLog?.(`SMB 上傳失敗 (${remoteFileName})`, `smbclient put "${remoteFileName}" -> ${nasTargetDir} (exit=${code})`, detail);
                if (msg.includes('logon_failure') || msg.includes('auth')) {
                    reject(new Error(`ERR_NAS_AUTH: ${detail}`));
                }
                else if (msg.includes('host_unreachable') ||
                    msg.includes('no route to host') ||
                    msg.includes('host is down') ||
                    msg.includes('connection refused') ||
                    msg.includes('connection to') // do_connect: Connection to <host> failed
                ) {
                    reject(new Error(`ERR_NAS_UNREACHABLE: ${detail}`));
                }
                else if (msg.includes('no such file') ||
                    msg.includes('access denied') ||
                    msg.includes('object_name_not_found')) {
                    reject(new Error(`ERR_NAS_PATH: ${detail}`));
                }
                else {
                    reject(new Error(`ERR_NAS_UPLOAD: ${detail}`));
                }
            }
            else
                resolve();
        });
        proc.on('error', (e) => {
            if (e.code === 'ENOENT') {
                onLog?.(`SMB 上傳失敗 (${remoteFileName})`, 'smbclient', 'ERR_NAS_SMBCLIENT_NOT_FOUND: 找不到 smbclient 可執行檔');
                reject(new Error('ERR_NAS_SMBCLIENT_NOT_FOUND'));
            }
            else {
                onLog?.(`SMB 上傳失敗 (${remoteFileName})`, 'smbclient', e.message);
                reject(e);
            }
        });
    });
}
async function uploadDirViaSmbclient(creds, targetPath, localDir, onFileProgress, onLog) {
    const files = collectFiles(localDir);
    if (files.length === 0)
        return;
    for (let i = 0; i < files.length; i++) {
        const f = files[i];
        onFileProgress?.(i, files.length, f.relPath);
        const dirPart = path.dirname(f.relPath);
        const filePart = path.basename(f.relPath);
        const cdPath = dirPart && dirPart !== '.' ? `${targetPath}/${dirPart.replace(/\\/g, '/')}` : targetPath;
        await ensureNasPath(creds, cdPath);
        await smbclientPutFile(creds, f.localPath, cdPath, filePart, onLog);
    }
}
/**
 * 透過 smbclient 將單一檔案上傳至 NAS 指定目錄（自動建立目錄）
 */
async function uploadFileViaSmbclient(creds, nasTargetDir, localFilePath, onLog) {
    await ensureNasPath(creds, nasTargetDir);
    await smbclientPutFile(creds, localFilePath, nasTargetDir, path.basename(localFilePath), onLog);
}
/** 刪除 NAS 上單一檔案（smbclient del；不存在則忽略） */
async function smbclientDelFile(creds, nasTargetDir, remoteFileName, onLog) {
    const host = creds.host.replace(/^smb:\/\//, '').trim();
    const address = `//${host}/${creds.share}`;
    const args = ['-s', SMB_CONF_PATH, address, '-U', `${creds.username}%${creds.password}`];
    if (creds.domain && creds.domain !== 'WORKGROUP') {
        args.splice(3, 0, '-W', creds.domain);
    }
    const cdEsc = nasTargetDir.replace(/"/g, '\\"');
    const nameEsc = remoteFileName.replace(/"/g, '\\"');
    const delCmd = `cd "${cdEsc}"; del "${nameEsc}"`;
    const proc = spawn(resolveSmbclientBin(), [...args, '-c', delCmd], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', (d) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            const combined = `${stdout}\n${stderr}`.toLowerCase();
            if (code === 0 ||
                combined.includes('nt_status_object_name_not_found') ||
                combined.includes('no such file')) {
                resolve();
                return;
            }
            onLog?.(`SMB 刪除略過 (${remoteFileName})`, `del ${remoteFileName} @ ${nasTargetDir} (exit=${code})`, `${stdout}\n${stderr}`.trim());
            resolve(); // 清舊檔失敗不阻断備份
        });
        proc.on('error', () => resolve());
    });
}
/**
 * 上傳前清除目的路徑上的舊 .tgz／分卷，避免與前次殘留混淆。
 */
async function clearDestinationArtifacts(nas, nasTargetDir, baseTgzName, chunked, nasAbsDir, useSmbclient, onLog) {
    const shouldRemove = (name) => {
        if (chunked) {
            return name === baseTgzName || name.startsWith(`${baseTgzName}.part`);
        }
        return name === baseTgzName || name.startsWith(`${baseTgzName}.part`);
    };
    onLog?.('清除 NAS 舊產物', `${nasTargetDir}（${baseTgzName}${chunked ? ' / 分卷' : ''}）`);
    if (!useSmbclient && nasAbsDir) {
        ensureWritableDir(nasAbsDir);
        try {
            const entries = fs.readdirSync(nasAbsDir, { withFileTypes: true });
            for (const ent of entries) {
                if (!ent.isFile() || !shouldRemove(ent.name))
                    continue;
                const p = path.join(nasAbsDir, ent.name);
                try {
                    fs.rmSync(p, { force: true });
                    onLog?.('已刪除舊檔 (掛載點)', p);
                }
                catch (e) {
                    onLog?.('刪除舊檔失敗 (掛載點)', p, e.message);
                }
            }
        }
        catch (e) {
            onLog?.('列出掛載目錄失敗（略過清除）', nasAbsDir, e.message);
        }
        return;
    }
    try {
        await ensureNasPath(nas, nasTargetDir);
        const entries = await listNasDirectory(nas, nasTargetDir);
        for (const ent of entries) {
            if (ent.isDir || !shouldRemove(ent.name))
                continue;
            await smbclientDelFile(nas, nasTargetDir, ent.name, onLog);
            onLog?.('已刪除舊檔 (smbclient)', `${nasTargetDir}/${ent.name}`);
        }
    }
    catch (e) {
        onLog?.('清除 NAS 舊產物略過', nasTargetDir, e.message);
    }
}
/**
 * 遞迴收集目錄下所有檔案（相對路徑）
 */
function collectFiles(dir, base = '') {
    const results = [];
    const entries = fs.readdirSync(path.join(dir, base), { withFileTypes: true });
    for (const e of entries) {
        const rel = base ? `${base}/${e.name}` : e.name;
        const local = path.join(dir, rel);
        if (e.isDirectory()) {
            results.push(...collectFiles(dir, rel));
        }
        else {
            results.push({ relPath: rel, localPath: local });
        }
    }
    return results;
}
function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`TIMEOUT: ${label} 逾時（${ms / 1000}s）`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
function fsyncFile(filePath) {
    const fd = fs.openSync(filePath, 'r+');
    try {
        fs.fsyncSync(fd);
    }
    finally {
        fs.closeSync(fd);
    }
}
async function sftpFastGet(sftp, remotePath, localPath) {
    await sftp.fastGet(remotePath, localPath);
}
async function remoteFileSizeBytes(creds, sudoPassword, remoteFile) {
    const esc = remoteFile.replace(/"/g, '\\"');
    const cmd = `stat -c%s "${esc}" 2>/dev/null || wc -c < "${esc}"`;
    const { code, stdout, stderr } = await execWithSudo(creds, sudoPassword, cmd, true);
    const n = parseInt((stdout || '').trim().split(/\s+/).pop() ?? '', 10);
    if (code !== 0 || !Number.isFinite(n) || n < 0) {
        throw new Error(`無法取得遠端檔案大小 (${remoteFile}): ${stderr?.trim() || stdout?.trim() || `exit=${code}`}`);
    }
    return n;
}
function assertLocalSize(localPath, expectedSize, label) {
    fsyncFile(localPath);
    const size = fs.statSync(localPath).size;
    if (size === 0) {
        throw new Error(`${label} 大小為 0：${localPath}`);
    }
    if (size !== expectedSize) {
        throw new Error(`${label} 大小不符：期望 ${expectedSize}，實際 ${size}（${localPath}）`);
    }
}
async function withAttempts(maxAttempts, label, onLog, fn) {
    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await fn(attempt);
            return;
        }
        catch (e) {
            lastErr = e;
            onLog?.(`傳輸重試 ${label}`, `第 ${attempt}/${maxAttempts} 次失敗`, lastErr.message);
            if (attempt < maxAttempts) {
                await new Promise((r) => setTimeout(r, 1000 * attempt));
            }
        }
    }
    throw lastErr ?? new Error(`${label} 傳輸失敗`);
}
/**
 * 階段一：遠端 tar（必要時 split），產物留在 FineReport 暫存，不下載。
 */
async function prepareRemoteArchive(creds, sudoPassword, remoteSrc, onLog, onProgress) {
    const lastSlash = remoteSrc.lastIndexOf('/');
    const remoteParentDir = remoteSrc.substring(0, lastSlash);
    const baseName = remoteSrc.substring(lastSlash + 1);
    const remoteTgz = `${remoteSrc}.tgz`;
    const baseTgzName = `${baseName}.tgz`;
    onProgress?.(`遠端打包 ${baseName}`);
    const escParent = remoteParentDir.replace(/"/g, '\\"');
    const escBase = baseName.replace(/"/g, '\\"');
    const escTgz = remoteTgz.replace(/"/g, '\\"');
    const tarCmd = `tar czf "${escTgz}" -C "${escParent}" "${escBase}"`;
    onLog?.(`遠端打包 ${baseName}`, tarCmd);
    const { code: tarCode, stderr: tarStderr } = await execWithSudo(creds, sudoPassword, tarCmd, true);
    if (tarCode !== 0) {
        throw new Error(`遠端打包失敗 (${baseName}): ${tarStderr?.trim() || `exit=${tarCode}`}`);
    }
    const archiveSize = await remoteFileSizeBytes(creds, sudoPassword, remoteTgz);
    onLog?.(`遠端壓縮包大小 ${baseName}`, `${archiveSize} bytes（閾值 ${NAS_CHUNK_BYTES}）`);
    if (!shouldChunkArchive(archiveSize)) {
        return {
            chunked: false,
            baseTgzName,
            artifacts: [{ remotePath: remoteTgz, fileName: baseTgzName, size: archiveSize }],
        };
    }
    const splitPrefix = `${remoteTgz}.part`;
    const escPrefix = splitPrefix.replace(/"/g, '\\"');
    const splitCmd = `split -b ${NAS_CHUNK_BYTES} -d -a 3 "${escTgz}" "${escPrefix}"`;
    onProgress?.(`遠端分卷 ${baseName}（每卷 ${NAS_CHUNK_BYTES} bytes）`);
    onLog?.(`遠端分卷 ${baseName}`, splitCmd);
    const { code: splitCode, stderr: splitStderr } = await execWithSudo(creds, sudoPassword, splitCmd, true);
    if (splitCode !== 0) {
        throw new Error(`遠端分卷失敗 (${baseName}): ${splitStderr?.trim() || `exit=${splitCode}`}`);
    }
    await execWithSudo(creds, sudoPassword, `rm -f "${escTgz}"`, true);
    const listCmd = `ls -1 "${escTgz}.part"[0-9][0-9][0-9] 2>/dev/null | sort`;
    const { code: listCode, stdout: listOut } = await execWithSudo(creds, sudoPassword, listCmd, true);
    const remoteParts = (listOut || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    if (listCode !== 0 || remoteParts.length === 0) {
        throw new Error(`遠端分卷後找不到 part 檔 (${baseName})，prefix=${partFilePrefix(baseTgzName)}`);
    }
    onLog?.(`遠端分卷清單 ${baseName}`, `${remoteParts.length} 卷`, remoteParts.join('\n'));
    const artifacts = [];
    for (const remotePart of remoteParts) {
        const fileName = path.posix.basename(remotePart);
        const size = await remoteFileSizeBytes(creds, sudoPassword, remotePart);
        artifacts.push({ remotePath: remotePart, fileName, size });
    }
    return { chunked: true, baseTgzName, artifacts };
}
/**
 * SFTP 下載至容器本機暫存並核對大小（含重試）
 */
async function downloadArtifactToLocal(sftp, creds, sudoPassword, artifact, localPath, onLog, onProgress) {
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    await withAttempts(NAS_TRANSFER_MAX_ATTEMPTS, `SFTP ${artifact.fileName}`, onLog, async (attempt) => {
        onProgress?.(attempt > 1
            ? `SFTP 重試 ${attempt}/${NAS_TRANSFER_MAX_ATTEMPTS}：${artifact.fileName}`
            : `SFTP 下載 ${artifact.fileName}`);
        try {
            fs.rmSync(localPath, { force: true });
        }
        catch {
            /* ignore */
        }
        onLog?.(`SFTP 下載 ${artifact.fileName}`, `fastGet ${artifact.remotePath} -> ${localPath}（${artifact.size} bytes，嘗試 ${attempt}）`);
        await withTimeout(sftpFastGet(sftp, artifact.remotePath, localPath), SOURCE_PART_TIMEOUT_MS, `SFTP 下載 ${artifact.fileName}`);
        assertLocalSize(localPath, artifact.size, `本機暫存 ${artifact.fileName}`);
    });
    const esc = artifact.remotePath.replace(/"/g, '\\"');
    await execWithSudo(creds, sudoPassword, `rm -f "${esc}"`, true);
    onLog?.(`驗證本機 ${artifact.fileName}`, `${artifact.size} bytes`);
}
function isDir(p) {
    try {
        return fs.existsSync(p) && fs.statSync(p).isDirectory();
    }
    catch {
        return false;
    }
}
/**
 * 建立目錄；CIFS／Finder 掛載常對「已存在」回 EACCES，此時若目錄已存在則視為成功。
 */
function ensureWritableDir(dirPath) {
    if (isDir(dirPath))
        return;
    try {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    catch (e) {
        const err = e;
        if (isDir(dirPath))
            return;
        if (err.code === 'EEXIST' && isDir(dirPath))
            return;
        throw e;
    }
    if (!isDir(dirPath)) {
        throw new Error(`無法建立目錄：${dirPath}`);
    }
}
/**
 * 自本機暫存寫入 NAS（掛載 copy 或 smbclient put），含重試與目的大小核對
 */
async function deliverLocalToNas(localPath, fileName, expectedSize, nasAbsFilePath, nas, nasTargetDir, useSmbclient, onLog, onProgress) {
    // 掛載寫入前先以 smbclient 建立遠端目錄（Finder /Volumes mkdir 常不穩）
    await ensureNasPath(nas, nasTargetDir);
    await withAttempts(NAS_TRANSFER_MAX_ATTEMPTS, `NAS ${fileName}`, onLog, async (attempt) => {
        onProgress?.(attempt > 1
            ? `NAS 重試 ${attempt}/${NAS_TRANSFER_MAX_ATTEMPTS}：${fileName}`
            : `寫入 NAS ${fileName}`);
        if (useSmbclient) {
            onLog?.(`SMB 上傳 ${fileName}`, `smbclient put ${fileName} -> ${nasTargetDir}（${expectedSize} bytes，嘗試 ${attempt}）`);
            await uploadFileViaSmbclient(nas, nasTargetDir, localPath, onLog);
        }
        else {
            if (!nasAbsFilePath)
                throw new Error('缺少 NAS 掛載目的路徑');
            ensureWritableDir(path.dirname(nasAbsFilePath));
            try {
                fs.rmSync(nasAbsFilePath, { force: true });
            }
            catch {
                /* ignore */
            }
            onLog?.(`複製至 NAS 掛載點 ${fileName}`, `${localPath} -> ${nasAbsFilePath}（嘗試 ${attempt}）`);
            fs.copyFileSync(localPath, nasAbsFilePath);
            assertLocalSize(nasAbsFilePath, expectedSize, `NAS 寫入核對 ${fileName}`);
        }
    });
}
/**
 * 執行完整備份流程
 */
export async function runBackup(options) {
    const { backupId, stagingPath, sources, nasPath, deleteOldBackup, retentionMonths, ssh, sudoPassword, nas, onProgress, onLog, } = options;
    const sourceResults = sources.map((src) => ({
        id: src.id,
        label: src.label || src.id,
        status: 'pending',
        uploadedFiles: [],
        uploadedCount: 0,
    }));
    const timeline = [];
    const pushTimeline = (message) => {
        timeline.push({ time: formatTaipei(new Date()), message });
    };
    let backupDestPath = '';
    let overallError = null;
    const log = (label, command, output) => {
        onLog?.({ label, command, output });
    };
    const markRemainingSkipped = (fromExclusiveId, reason) => {
        let skip = fromExclusiveId === null;
        for (const r of sourceResults) {
            if (!skip) {
                if (r.id === fromExclusiveId)
                    skip = true;
                continue;
            }
            if (r.status === 'pending' || r.status === 'packed') {
                r.status = 'skipped';
                r.error = reason;
                r.completedAt = formatTaipei(new Date());
            }
        }
    };
    const startTime = new Date();
    pushTimeline('備份作業開始');
    log('刪除設定', `deleteOldBackup=${deleteOldBackup}, retentionMonths=${retentionMonths}`);
    const backupMonth = stagingPath.split('/').filter(Boolean).pop() ?? '';
    const reportFileName = `${formatTaipeiDate(new Date())}_${backupMonth}_FineReport備份報告.md`;
    const nasPathClean = nasPath.replace(/^\//, '').replace(/\/$/, '');
    const backupDestPathRel = `${nasPathClean}/${backupMonth}`;
    const mountPoint = path.join(os.tmpdir(), `finereport-nas-${backupId}`);
    const tempRoot = path.join(os.tmpdir(), `finereport-backup-${backupId}`);
    let nasMounted = false;
    let useSmbclientFallback = false;
    let actualMountPath = '';
    try {
        onProgress(2, '掛載 NAS');
        log('掛載 NAS', `mount ${nas.host}/${nas.share} -> ${mountPoint}`);
        try {
            const result = await mountNas(nas, mountPoint);
            nasMounted = true;
            actualMountPath = result.path;
            if (result.didMount) {
                log('掛載 NAS', `mount 成功 -> ${actualMountPath}`);
            }
            else {
                log('掛載 NAS', `使用既有可寫掛載點 -> ${actualMountPath}`);
            }
        }
        catch (mountErr) {
            const errMsg = mountErr.message;
            console.error('[runBackup] mount 失敗，改用 smbclient 上傳:', errMsg);
            log('掛載 NAS', `mount 失敗，改用 smbclient 上傳。原因: ${errMsg}`);
            useSmbclientFallback = true;
            fs.mkdirSync(path.join(tempRoot, 'staging'), { recursive: true });
        }
        onProgress(5, '建立備份目錄結構');
        const remoteStaging = stagingPath;
        // 依備份作業步驟：在備份月份下建立 mysqldata、tomcat、WEB-INF、webroot 四個目錄
        const mkdirCmd = `mkdir -p ${remoteStaging}/mysqldata ${remoteStaging}/tomcat ${remoteStaging}/WEB-INF ${remoteStaging}/webroot`;
        log('建立備份目錄 (mysqldata, tomcat, WEB-INF, webroot)', mkdirCmd);
        const { code: mkdirCode } = await execWithSudo(ssh, sudoPassword, mkdirCmd, true);
        if (mkdirCode !== 0) {
            throw new Error('無法在遠端建立備份目錄');
        }
        const total = sources.length;
        let completed = 0;
        for (const src of sources) {
            const label = src.label || src.id;
            const destPath = resolveDestPath(src);
            const remoteDest = `${remoteStaging}/${destPath}`;
            const cpCmdDisplay = `cp -R ${src.sourcePath} ${remoteDest}`;
            onProgress(5 + Math.floor((completed / total) * 25), `遠端複製 ${label}: ${cpCmdDisplay}`);
            const escSrc = src.sourcePath.replace(/"/g, '\\"');
            const escDest = remoteDest.replace(/"/g, '\\"');
            const cpCmdExec = `cp -R "${escSrc}" "${escDest}"`;
            log(`遠端複製 ${label}`, cpCmdDisplay);
            const { code: cpCode, stderr: cpStderr } = await execWithSudo(ssh, sudoPassword, cpCmdExec, true);
            if (cpCode !== 0) {
                // 過濾 sudo 的 stderr（[sudo] password for xxx:）避免誤導；實際錯誤為 cp 的 Permission denied
                const cleanErr = (cpStderr || '')
                    .replace(/^\[sudo\] password for \S+:\s*/gm, '')
                    .trim();
                const hint = cleanErr.includes('Permission denied')
                    ? '來源路徑權限不足或不存在，請在遠端以 root 執行 ls 確認路徑'
                    : '';
                throw new Error(`遠端複製失敗 (${label}): ${cleanErr || 'cp 執行失敗'}${hint ? ` (${hint})` : ''}`);
            }
            // 驗證遠端至少有檔案（避免空目錄導致後續只建立 NAS 目錄而無檔案）
            const findCmd = `find "${escDest}" -type f 2>/dev/null | head -1`;
            const findCmdDisplay = `find ${remoteDest} -type f | head -1`;
            const { stdout: findOut } = await execWithSudo(ssh, sudoPassword, findCmd, true);
            log(`驗證 ${label}`, findCmdDisplay, findOut.trim() || undefined);
            if (!findOut.trim()) {
                throw new Error(`遠端複製後無檔案 (${label})，請檢查來源路徑: ${src.sourcePath}`);
            }
            completed++;
        }
        // 全部複製完成後，一次對暫存目錄做 chown
        const chownUser = ssh.username.replace(/"/g, '\\"');
        const escStaging = remoteStaging.replace(/"/g, '\\"');
        const chownCmd = `chown -R ${chownUser}:${chownUser} "${escStaging}" 2>/dev/null || true`;
        const chownCmdDisplay = `chown -R ${ssh.username}:${ssh.username} ${remoteStaging}`;
        log('chown 暫存目錄', chownCmdDisplay);
        await execWithSudo(ssh, sudoPassword, chownCmd, true);
        backupDestPath = nasMounted
            ? path.join(actualMountPath, nasPathClean, backupMonth)
            : path.join(tempRoot, 'staging');
        if (nasMounted) {
            fs.mkdirSync(backupDestPath, { recursive: true });
        }
        const transferRoot = path.join(tempRoot, 'transfer');
        fs.mkdirSync(transferRoot, { recursive: true });
        const sftp = new SftpClient();
        await sftp.connect({
            host: ssh.host,
            port: 22,
            username: ssh.username,
            password: ssh.password,
        });
        // —— 階段一：全部來源遠端打包／分卷（產物留在 FineReport）——
        onProgress(35, '遠端打包與分卷');
        pushTimeline('開始遠端打包與分卷');
        const prepared = [];
        for (let si = 0; si < sources.length; si++) {
            const src = sources[si];
            const label = src.label || src.id;
            const destPath = resolveDestPath(src);
            const remoteSrc = `${remoteStaging}/${destPath}`.replace(/\/+/g, '/').replace(/\/$/, '');
            onProgress(35 + Math.floor((si / total) * 15), `遠端打包 ${label}（${si + 1}/${total}）`);
            try {
                const pack = await withTimeout(prepareRemoteArchive(ssh, sudoPassword, remoteSrc, log, (msg) => onProgress(35 + Math.floor((si / total) * 15), msg)), SOURCE_TOTAL_TIMEOUT_MS, `遠端打包 ${label}`);
                prepared.push({
                    id: src.id,
                    label,
                    destPath,
                    chunked: pack.chunked,
                    baseTgzName: pack.baseTgzName,
                    artifacts: pack.artifacts,
                });
                const planned = plannedDestRelativePaths(destPath, pack.chunked, pack.artifacts);
                const resultIdx = sourceResults.findIndex((r) => r.id === src.id);
                if (resultIdx !== -1) {
                    sourceResults[resultIdx].status = 'packed';
                    sourceResults[resultIdx].chunked = pack.chunked;
                    sourceResults[resultIdx].partCount = pack.artifacts.length;
                    sourceResults[resultIdx].plannedFiles = planned;
                    sourceResults[resultIdx].packedAt = formatTaipei(new Date());
                }
                pushTimeline(`打包完成：${label}（${pack.chunked ? `分卷 ${pack.artifacts.length} 檔` : '單檔'}）`);
                log(`打包完成 ${label}`, pack.chunked
                    ? `已分卷 ${pack.artifacts.length} 個檔`
                    : `未分卷 1 個檔（${pack.artifacts[0]?.size ?? 0} bytes）`);
            }
            catch (e) {
                const resultIdx = sourceResults.findIndex((r) => r.id === src.id);
                if (resultIdx !== -1) {
                    sourceResults[resultIdx].status = 'failed';
                    sourceResults[resultIdx].error = e.message;
                    sourceResults[resultIdx].completedAt = formatTaipei(new Date());
                }
                markRemainingSkipped(src.id, '前一來源打包失敗，未執行');
                pushTimeline(`打包失敗：${label} — ${e.message}`);
                await sftp.end();
                throw new Error(`遠端打包失敗 (${label}): ${e.message}`);
            }
        }
        pushTimeline('全部來源打包完成，開始上傳 NAS');
        // —— 階段二：逐來源、逐檔：SFTP→本機暫存→寫入 NAS（含重試）——
        onProgress(50, useSmbclientFallback ? '下載並 SMB 上傳' : '下載並寫入 NAS');
        for (let si = 0; si < prepared.length; si++) {
            const prep = prepared[si];
            const destDirRel = path.posix.dirname(prep.destPath);
            const nasTargetDir = prep.chunked
                ? `${backupDestPathRel}/${prep.destPath}`.replace(/\/+/g, '/')
                : `${backupDestPathRel}/${destDirRel}`.replace(/\/\.$/, '');
            const resultIdx = sourceResults.findIndex((r) => r.id === prep.id);
            const planned = plannedDestRelativePaths(prep.destPath, prep.chunked, prep.artifacts);
            if (resultIdx !== -1) {
                sourceResults[resultIdx].transferStartedAt = formatTaipei(new Date());
                sourceResults[resultIdx].plannedFiles = planned;
                sourceResults[resultIdx].uploadedFiles = [];
                sourceResults[resultIdx].uploadedCount = 0;
            }
            const nasAbsDir = nasMounted
                ? path.join(backupDestPath, prep.chunked ? prep.destPath : destDirRel === '.' ? '' : destDirRel)
                : null;
            try {
                await withTimeout((async () => {
                    await clearDestinationArtifacts(nas, nasTargetDir, prep.baseTgzName, prep.chunked, nasAbsDir, useSmbclientFallback || !nasMounted, log);
                    pushTimeline(`清除舊產物後開始上傳：${prep.label}`);
                    for (let fi = 0; fi < prep.artifacts.length; fi++) {
                        const art = prep.artifacts[fi];
                        const relDest = prep.chunked
                            ? `${prep.destPath}/${art.fileName}`
                            : destDirRel === '.'
                                ? art.fileName
                                : `${destDirRel}/${art.fileName}`;
                        const localTemp = path.join(transferRoot, prep.chunked ? prep.destPath : destDirRel === '.' ? '' : destDirRel, art.fileName);
                        const progressBase = 50 + Math.floor(((si + fi / Math.max(prep.artifacts.length, 1)) / prepared.length) * 37);
                        try {
                            await downloadArtifactToLocal(sftp, ssh, sudoPassword, art, localTemp, log, (msg) => onProgress(progressBase, `${prep.label}: ${msg}`));
                            const nasAbs = nasMounted
                                ? path.join(backupDestPath, prep.chunked ? prep.destPath : destDirRel === '.' ? '' : destDirRel, art.fileName)
                                : null;
                            await deliverLocalToNas(localTemp, art.fileName, art.size, nasAbs, nas, nasTargetDir, useSmbclientFallback, log, (msg) => onProgress(progressBase, `${prep.label}: ${msg}`));
                            try {
                                fs.rmSync(localTemp, { force: true });
                            }
                            catch {
                                /* ignore */
                            }
                            if (resultIdx !== -1) {
                                sourceResults[resultIdx].uploadedFiles = [
                                    ...(sourceResults[resultIdx].uploadedFiles ?? []),
                                    relDest,
                                ];
                                sourceResults[resultIdx].uploadedCount =
                                    (sourceResults[resultIdx].uploadedCount ?? 0) + 1;
                            }
                            pushTimeline(`上傳成功：${prep.label} ${fi + 1}/${prep.artifacts.length} ${art.fileName}`);
                            log(`已完成 ${prep.label}`, `${fi + 1}/${prep.artifacts.length} ${art.fileName}（${art.size} bytes）-> ${nasTargetDir}`);
                        }
                        catch (fileErr) {
                            if (resultIdx !== -1) {
                                sourceResults[resultIdx].status = 'failed';
                                sourceResults[resultIdx].failedFile = relDest;
                                sourceResults[resultIdx].error = fileErr.message;
                                sourceResults[resultIdx].completedAt = formatTaipei(new Date());
                            }
                            pushTimeline(`上傳失敗：${prep.label} @ ${art.fileName} — ${fileErr.message}`);
                            throw fileErr;
                        }
                    }
                })(), SOURCE_TOTAL_TIMEOUT_MS, `傳輸 ${prep.label}`);
            }
            catch (e) {
                if (resultIdx !== -1 && sourceResults[resultIdx].status !== 'failed') {
                    sourceResults[resultIdx].status = 'failed';
                    sourceResults[resultIdx].error = e.message;
                    sourceResults[resultIdx].completedAt = formatTaipei(new Date());
                }
                markRemainingSkipped(prep.id, '前一來源傳輸失敗，未執行');
                pushTimeline(`中止後續來源：因 ${prep.label} 失敗`);
                await sftp.end();
                throw new Error(`傳輸失敗 (${prep.label}): ${e.message}`);
            }
            if (resultIdx !== -1) {
                sourceResults[resultIdx].status = 'success';
                sourceResults[resultIdx].chunked = prep.chunked;
                sourceResults[resultIdx].partCount = prep.artifacts.length;
                sourceResults[resultIdx].completedAt = formatTaipei(new Date());
            }
            pushTimeline(`來源完成：${prep.label}`);
        }
        pushTimeline('全部來源上傳完成');
        const deleteActions = [];
        if (deleteOldBackup === true && retentionMonths > 0) {
            const stagingParts = remoteStaging.replace(/\/$/, '').split('/').filter(Boolean);
            stagingParts.pop();
            const remoteBackupBase = stagingParts.length ? `/${stagingParts.join('/')}` : '/home/crownap/backup';
            onProgress(87, '刪除遠端舊備份');
            const cutoffDate = new Date();
            cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths);
            const cutoffYm = cutoffDate.getFullYear() * 100 + (cutoffDate.getMonth() + 1);
            const listCmd = `ls -1 "${remoteBackupBase}" 2>/dev/null || true`;
            const { stdout: dirList } = await execWithSudo(ssh, sudoPassword, listCmd, true);
            const dirs = (dirList || '').trim().split(/\s+/).filter(Boolean);
            for (const d of dirs) {
                const m = d.match(/^(\d{4})(\d{2})$/);
                if (!m)
                    continue;
                const ym = parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
                if (ym < cutoffYm) {
                    const rmDir = `${remoteBackupBase}/${d}`;
                    const rmCmd = `rm -rf "${rmDir}" 2>/dev/null || true`;
                    log('刪除遠端舊備份', rmCmd);
                    deleteActions.push({ label: '刪除遠端舊備份', command: rmCmd });
                    await execWithSudo(ssh, sudoPassword, rmCmd, true);
                }
            }
            // 不刪除本次備份月份（remoteStaging）：保留期內應保留，僅刪除超過保留期的舊目錄
        }
        else {
            log('略過遠端清理', 'deleteOldBackup 未勾選，保留遠端備份');
        }
        await sftp.end();
        onProgress(90, '產生報告');
        pushTimeline('產生備份報告');
        const report = generateReport(backupId, backupMonth, backupDestPathRel, sources, startTime, deleteOldBackup, retentionMonths, deleteActions, sourceResults, timeline, null);
        if (nasMounted) {
            fs.writeFileSync(path.join(backupDestPath, reportFileName), report, 'utf8');
        }
        else {
            const reportDir = path.join(tempRoot, 'report');
            fs.mkdirSync(reportDir, { recursive: true });
            fs.writeFileSync(path.join(reportDir, reportFileName), report, 'utf8');
            await ensureNasPath(nas, backupDestPathRel);
            await uploadDirViaSmbclient(nas, backupDestPathRel, reportDir, undefined, log);
        }
        options.onReport(report, false);
        pushTimeline('備份完成');
        onProgress(100, '備份完成');
    }
    catch (e) {
        overallError = e;
        markRemainingSkipped(null, '作業失敗中止，未執行');
        pushTimeline(`作業失敗：${overallError.message}`);
        const failReport = generateReport(backupId, backupMonth, backupDestPathRel, sources, startTime, deleteOldBackup, retentionMonths, [], sourceResults, timeline, overallError);
        try {
            options.onReport(failReport, true);
        }
        catch { /* don't mask original error */ }
        // 嘗試將失敗報告寫入 NAS（不影響原始錯誤拋出）
        try {
            if (nasMounted && backupDestPath) {
                fs.mkdirSync(backupDestPath, { recursive: true });
                fs.writeFileSync(path.join(backupDestPath, reportFileName), failReport, 'utf8');
                log('寫入失敗報告 (NAS 掛載點)', path.join(backupDestPath, reportFileName));
            }
            else if (useSmbclientFallback && backupDestPath) {
                const reportDir = path.join(tempRoot, 'report');
                fs.mkdirSync(reportDir, { recursive: true });
                fs.writeFileSync(path.join(reportDir, reportFileName), failReport, 'utf8');
                try {
                    await ensureNasPath(nas, backupDestPathRel);
                    await uploadDirViaSmbclient(nas, backupDestPathRel, reportDir, undefined, log);
                    log('寫入失敗報告 (smbclient)', `${backupDestPathRel}/${reportFileName}`);
                }
                catch (uploadErr) {
                    console.error('[runBackup] 失敗報告 smbclient 上傳失敗:', uploadErr);
                }
            }
        }
        catch (reportWriteErr) {
            console.error('[runBackup] 失敗報告寫入 NAS 失敗:', reportWriteErr);
        }
    }
    finally {
        if (nasMounted && actualMountPath === mountPoint) {
            try {
                await unmountNas(mountPoint);
                log('卸載 NAS', `umount ${mountPoint}`);
            }
            catch (e) {
                console.error('[backupService] umount 失敗:', e);
            }
        }
        try {
            fs.rmSync(mountPoint, { recursive: true, force: true });
        }
        catch {
            // ignore
        }
        try {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
        catch {
            // ignore
        }
        if (overallError)
            throw overallError;
    }
}
/**
 * 解析 destPath：mysqldata 需加上子目錄（finedb、mysql）
 */
/** 格式化為 Asia/Taipei 時區，格式：YYYY-MM-DD HH:mm:ss（無 T、Z） */
function formatTaipei(d) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}
/** 格式化為 Asia/Taipei 時區的日期，格式：YYYYMMDD（用於報告檔名） */
function formatTaipeiDate(d) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('year')}${get('month')}${get('day')}`;
}
function resolveDestPath(src) {
    const base = src.destPath.replace(/\/$/, '');
    if (base === 'mysqldata') {
        const leaf = path.basename(src.sourcePath.replace(/\/$/, ''));
        return `mysqldata/${leaf}`;
    }
    return base;
}
function plannedDestRelativePaths(destPath, chunked, artifacts) {
    const dirRel = path.posix.dirname(destPath);
    return artifacts.map((a) => chunked
        ? `${destPath}/${a.fileName}`
        : dirRel === '.'
            ? a.fileName
            : `${dirRel}/${a.fileName}`);
}
function statusLabel(status) {
    switch (status) {
        case 'success':
            return '成功';
        case 'failed':
            return '失敗';
        case 'skipped':
            return '未執行';
        case 'packed':
            return '未執行';
        case 'pending':
        default:
            return '未執行';
    }
}
function generateReport(backupId, backupMonth, destPath, sources, startTime, deleteOldBackup, retentionMonths, deleteActions, sourceResults, timeline, overallError) {
    const endTime = new Date();
    const isFailure = overallError !== null;
    const anyChunked = sourceResults.some((r) => r.chunked);
    const successCount = sourceResults.filter((r) => r.status === 'success').length;
    const failedCount = sourceResults.filter((r) => r.status === 'failed').length;
    const skippedCount = sourceResults.filter((r) => r.status === 'skipped' || r.status === 'pending' || r.status === 'packed').length;
    const totalCount = sourceResults.length;
    // 目錄結構：僅列實際成功上傳的檔案；失敗列註記 + 失敗檔
    const dirsMap = new Map();
    for (const r of sourceResults) {
        const uploaded = r.uploadedFiles ?? [];
        for (const f of uploaded) {
            const top = f.split('/')[0];
            if (!top)
                continue;
            const rest = f.startsWith(`${top}/`) ? f.slice(top.length + 1) : path.posix.basename(f);
            if (!dirsMap.has(top))
                dirsMap.set(top, []);
            dirsMap.get(top).push(rest);
        }
        if (r.status === 'failed' && r.failedFile) {
            const f = r.failedFile;
            const top = f.split('/')[0];
            if (top) {
                const rest = f.startsWith(`${top}/`) ? f.slice(top.length + 1) : path.posix.basename(f);
                if (!dirsMap.has(top))
                    dirsMap.set(top, []);
                dirsMap.get(top).push(`${rest}（寫入失敗）`);
            }
        }
    }
    const topLevelDirs = Array.from(dirsMap.keys()).sort();
    const completionSection = `## 完成度

成功 ${successCount}／失敗 ${failedCount}／未執行 ${skippedCount}（共 ${totalCount} 個來源）

| 來源 | 應傳數 | 已成功數 | 狀態 | 失敗檔案／原因 |
|------|--------|----------|------|----------------|
${sourceResults
        .map((r) => {
        const expected = typeof r.partCount === 'number'
            ? String(r.partCount)
            : r.plannedFiles && r.plannedFiles.length > 0
                ? String(r.plannedFiles.length)
                : '—';
        const done = String(r.uploadedCount ?? r.uploadedFiles?.length ?? 0);
        const st = statusLabel(r.status);
        let detail = '—';
        if (r.status === 'failed') {
            const parts = [];
            if (r.failedFile)
                parts.push(r.failedFile);
            if (r.error)
                parts.push(r.error);
            detail = parts.join(' — ') || '未知錯誤';
        }
        else if (r.status === 'skipped' && r.error) {
            detail = r.error;
        }
        return `| ${r.label} | ${expected} | ${done} | ${st} | ${detail} |`;
    })
        .join('\n')}
`;
    const timelineSection = `## 時間軸（Asia/Taipei）

| 時間 | 事件 |
|------|------|
| ${formatTaipei(startTime)} | 開始作業 |
${timeline.map((e) => `| ${e.time} | ${e.message} |`).join('\n')}
| ${formatTaipei(endTime)} | ${isFailure ? '失敗結束' : '完成結束'} |
`;
    const treeBody = topLevelDirs.length === 0
        ? '（尚無成功寫入 NAS 的檔案）'
        : topLevelDirs
            .map((d) => `├── ${d}/\n${dirsMap.get(d).map((f) => `│   ├── ${f}`).join('\n')}`)
            .join('\n');
    const plannedVsActual = sourceResults
        .filter((r) => (r.plannedFiles?.length ?? 0) > 0 || (r.uploadedFiles?.length ?? 0) > 0)
        .map((r) => {
        const planned = (r.plannedFiles ?? []).join(', ') || '—';
        const actual = (r.uploadedFiles ?? []).join(', ') || '（無）';
        return `| ${r.label} | ${planned} | ${actual} |`;
    })
        .join('\n');
    const deleteSection = deleteActions.length > 0
        ? `## 遠端刪除動作（保留期 ${retentionMonths} 個月）

| 動作 | 指令 |
|------|------|
${deleteActions.map((a) => `| ${a.label} | \`${a.command}\` |`).join('\n')}
`
        : `## 遠端刪除

未執行刪除（使用者選擇保留遠端備份）。
`;
    const restoreSection = anyChunked
        ? `## 分卷還原

超過 30MB 的來源會拆成 \`.tgz.part000\` 起之連續分卷，並放在與來源目的路徑同名之子目錄（例如 \`webroot/jar/\`）。還原範例：

\`\`\`bash
cd webroot/jar
${formatRestoreHint('jar.tgz')}
\`\`\`

（將目錄與 \`jar.tgz\` 換成實際的目的路徑／檔名前綴即可。）
`
        : '';
    const titleLine = isFailure
        ? `# FineReport 備份報告（失敗）\n\n失敗原因：${overallError.message}\n`
        : `# FineReport 備份報告\n`;
    const destFileCell = (s) => {
        const r = sourceResults.find((x) => x.id === s.id);
        if (r?.uploadedFiles && r.uploadedFiles.length > 0) {
            return r.uploadedFiles.join('<br>');
        }
        if (r?.plannedFiles && r.plannedFiles.length > 0) {
            return `${r.plannedFiles.join('<br>')}（計畫，未全數上傳）`;
        }
        return `${resolveDestPath(s)}.tgz`;
    };
    return `${titleLine}
備份 ID: ${backupId}
備份月份: ${backupMonth}
目的路徑: ${destPath}

## 作業時間（Asia/Taipei）

| 項目 | 時間 |
|------|------|
| 開始作業 | ${formatTaipei(startTime)} |
| ${isFailure ? '失敗時間' : '完成時間'} | ${formatTaipei(endTime)} |

${completionSection}
${timelineSection}
## 備份目錄結構（實際寫入 NAS）

\`\`\`
${destPath}/
${treeBody}
\`\`\`

### 計畫 vs 實際

| 來源 | 計畫檔案 | 實際已上傳 |
|------|----------|------------|
${plannedVsActual || '| — | — | — |'}

各 .tgz（或 .tgz.part* 分卷）為對應來源目錄的壓縮檔，系統不會自動解壓。單一分卷請 \`tar xzf\`；多分卷請先 \`cat\` 合併再解壓。上傳前會清除同路徑舊的 \`.tgz\`／\`.tgz.part*\`。

${restoreSection}## 備份來源

| 項目 | 來源路徑 | 目的檔案（實際／說明） |
|------|----------|------------------------|
${sources.map((s) => `| ${s.label || s.id} | ${s.sourcePath} | ${destFileCell(s)} |`).join('\n')}

---
${deleteSection}
`;
}
//# sourceMappingURL=backupService.js.map