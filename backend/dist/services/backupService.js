/**
 * 備份服務：遠端複製 + SFTP 下載 + NAS 寫入
 * 1. SSH 在遠端複製至 staging（需 root 讀取的路徑）
 * 2. 優先掛載 NAS，SFTP 直接寫入掛載點；若掛載失敗則 fallback 至 temp + smbclient 上傳
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import SftpClient from 'ssh2-sftp-client';
import { execWithSudo } from './sshService.js';
import { fileURLToPath } from 'url';
import { mountNas, unmountNas, createNasDirectory, resolveSmbclientBin } from './nasService.js';
import { NAS_CHUNK_BYTES, shouldChunkArchive, partFilePrefix, formatRestoreHint, } from '../lib/nasChunk.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SMB_CONF_PATH = path.join(__dirname, '..', '..', 'smb.conf');
/** 單一檔／分卷傳輸逾時 */
const SOURCE_PART_TIMEOUT_MS = 5 * 60 * 1000;
/** 單一來源（含多分卷）總逾時 */
const SOURCE_TOTAL_TIMEOUT_MS = 45 * 60 * 1000;
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
/**
 * 遠端打包為 .tgz；超過 NAS_CHUNK_BYTES 則遠端 split 後逐卷下載。
 * 目的端保留壓縮檔／分卷不解壓。
 */
async function transferSourceArchive(sftp, creds, sudoPassword, remoteSrc, localTgzPath, onLog, onProgress) {
    const lastSlash = remoteSrc.lastIndexOf('/');
    const remoteParentDir = remoteSrc.substring(0, lastSlash);
    const baseName = remoteSrc.substring(lastSlash + 1);
    const remoteTgz = `${remoteSrc}.tgz`;
    const baseTgzName = `${baseName}.tgz`;
    const destDir = path.dirname(localTgzPath);
    fs.mkdirSync(destDir, { recursive: true });
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
        onProgress?.(`下載壓縮包 ${baseTgzName}`);
        onLog?.(`SFTP 下載 ${baseTgzName}`, `fastGet ${remoteTgz} -> ${localTgzPath}`);
        await withTimeout(sftpFastGet(sftp, remoteTgz, localTgzPath), SOURCE_PART_TIMEOUT_MS, `SFTP 下載 ${baseTgzName}`);
        await execWithSudo(creds, sudoPassword, `rm -f "${escTgz}"`, true);
        assertLocalSize(localTgzPath, archiveSize, `驗證 ${baseTgzName}`);
        onLog?.(`驗證 ${baseName}`, `本機壓縮包大小 ${archiveSize} bytes`);
        return {
            chunked: false,
            baseTgzName,
            files: [{ fileName: baseTgzName, localPath: localTgzPath, size: archiveSize }],
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
    const files = [];
    for (let i = 0; i < remoteParts.length; i++) {
        const remotePart = remoteParts[i];
        const fileName = path.posix.basename(remotePart);
        const localPart = path.join(destDir, fileName);
        const partSize = await remoteFileSizeBytes(creds, sudoPassword, remotePart);
        onProgress?.(`分卷下載 ${i + 1}/${remoteParts.length}：${fileName}`);
        onLog?.(`SFTP 下載 ${fileName}`, `fastGet ${remotePart} -> ${localPart}（${partSize} bytes）`);
        await withTimeout(sftpFastGet(sftp, remotePart, localPart), SOURCE_PART_TIMEOUT_MS, `SFTP 下載 ${fileName}`);
        const escPart = remotePart.replace(/"/g, '\\"');
        await execWithSudo(creds, sudoPassword, `rm -f "${escPart}"`, true);
        assertLocalSize(localPart, partSize, `驗證 ${fileName}`);
        onLog?.(`驗證 ${fileName}`, `本機分卷大小 ${partSize} bytes`);
        files.push({ fileName, localPath: localPart, size: partSize });
    }
    return { chunked: true, baseTgzName, files };
}
/**
 * 執行完整備份流程
 */
export async function runBackup(options) {
    const { backupId, stagingPath, sources, nasPath, deleteOldBackup, retentionMonths, ssh, sudoPassword, nas, onProgress, onLog, } = options;
    const sourceResults = sources.map((src) => ({
        id: src.id,
        label: src.label || src.id,
        success: false,
    }));
    let backupDestPath = '';
    let overallError = null;
    const log = (label, command, output) => {
        onLog?.({ label, command, output });
    };
    const startTime = new Date();
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
                log('掛載 NAS', `使用既有掛載點 -> ${actualMountPath}`);
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
        onProgress(35, useSmbclientFallback ? 'SFTP 下載' : 'SFTP 下載至 NAS');
        const sftp = new SftpClient();
        await sftp.connect({
            host: ssh.host,
            port: 22,
            username: ssh.username,
            password: ssh.password,
        });
        completed = 0;
        for (const src of sources) {
            const label = src.label || src.id;
            const destPath = resolveDestPath(src);
            const remoteSrc = `${remoteStaging}/${destPath}`.replace(/\/+/g, '/').replace(/\/$/, '');
            const localPath = path.join(backupDestPath, destPath);
            onProgress(40 + Math.floor((completed / total) * 45), `打包下載 ${label}`);
            const localPathAbs = path.resolve(localPath);
            fs.mkdirSync(path.dirname(localPathAbs), { recursive: true });
            const localTgzPath = `${localPathAbs}.tgz`;
            const nasTargetDir = `${backupDestPathRel}/${path.dirname(destPath)}`.replace(/\/\.$/, '');
            const destDirRel = path.posix.dirname(destPath);
            const toDestRel = (fileName) => !destDirRel || destDirRel === '.' ? fileName : `${destDirRel}/${fileName}`;
            let transfer;
            try {
                transfer = await withTimeout(transferSourceArchive(sftp, ssh, sudoPassword, remoteSrc, localTgzPath, log, (msg) => onProgress(40 + Math.floor((completed / total) * 45), msg)), SOURCE_TOTAL_TIMEOUT_MS, `打包傳輸 ${label}`);
            }
            catch (e) {
                await sftp.end();
                throw new Error(`打包下載失敗 (${label}): ${e.message}`);
            }
            if (useSmbclientFallback) {
                for (let i = 0; i < transfer.files.length; i++) {
                    const f = transfer.files[i];
                    const progressLabel = transfer.files.length > 1
                        ? `分卷上傳 ${i + 1}/${transfer.files.length}：${f.fileName}`
                        : `SMB 上傳 ${f.fileName}`;
                    onProgress(40 + Math.floor(((completed + (i + 1) / transfer.files.length) / total) * 45), progressLabel);
                    log(`SMB 上傳 ${label}`, `smbclient put ${f.fileName} -> ${nasTargetDir} (${f.size} bytes)`);
                    await uploadFileViaSmbclient(nas, nasTargetDir, f.localPath, log);
                    try {
                        fs.rmSync(f.localPath);
                    }
                    catch {
                        /* ignore */
                    }
                }
            }
            else {
                for (const f of transfer.files) {
                    assertLocalSize(f.localPath, f.size, `NAS 寫入核對 ${f.fileName}`);
                    log(`已寫入 NAS ${label}`, `${f.fileName} (${f.size} bytes) -> ${nasTargetDir}`);
                }
            }
            const resultIdx = sourceResults.findIndex((r) => r.id === src.id);
            if (resultIdx !== -1) {
                sourceResults[resultIdx].success = true;
                sourceResults[resultIdx].chunked = transfer.chunked;
                sourceResults[resultIdx].destFiles = transfer.files.map((f) => toDestRel(f.fileName));
            }
            completed++;
        }
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
        const report = generateReport(backupId, backupMonth, backupDestPathRel, sources, startTime, deleteOldBackup, retentionMonths, deleteActions, sourceResults, null);
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
        onProgress(100, '備份完成');
    }
    catch (e) {
        overallError = e;
        const failReport = generateReport(backupId, backupMonth, backupDestPathRel, sources, startTime, deleteOldBackup, retentionMonths, [], sourceResults, overallError);
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
        if (useSmbclientFallback) {
            try {
                fs.rmSync(tempRoot, { recursive: true, force: true });
            }
            catch {
                // ignore
            }
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
function generateReport(backupId, backupMonth, destPath, sources, startTime, deleteOldBackup, retentionMonths, deleteActions, sourceResults, overallError) {
    const dirsMap = new Map();
    for (const src of sources) {
        const rel = resolveDestPath(src);
        const top = rel.split('/')[0];
        if (!top)
            continue;
        const result = sourceResults.find((r) => r.id === src.id);
        const names = result?.destFiles && result.destFiles.length > 0
            ? result.destFiles.map((f) => path.posix.basename(f))
            : [`${path.basename(rel)}.tgz`];
        if (!dirsMap.has(top))
            dirsMap.set(top, []);
        dirsMap.get(top).push(...names);
    }
    const topLevelDirs = Array.from(dirsMap.keys()).sort();
    const endTime = new Date();
    const completedCount = sourceResults.filter((r) => r.success).length;
    const totalCount = sourceResults.length;
    const isFailure = overallError !== null;
    const anyChunked = sourceResults.some((r) => r.chunked);
    const completionSection = `## 完成度

已完成 ${completedCount} / 共 ${totalCount} 個來源

| 來源 | 狀態 |
|------|------|
${sourceResults
        .map((r) => `| ${r.label} | ${r.success ? '✅ 成功' : `❌ 未完成${r.error ? `（${r.error}）` : ''}`} |`)
        .join('\n')}
`;
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

超過 30MB 的來源會拆成 \`.tgz.part000\` 起之連續分卷。還原範例：

\`\`\`bash
${formatRestoreHint('jar.tgz')}
\`\`\`

（將 \`jar.tgz\` 換成實際檔名前綴即可。）
`
        : '';
    const titleLine = isFailure
        ? `# FineReport 備份報告（失敗）\n\n失敗原因：${overallError.message}\n`
        : `# FineReport 備份報告\n`;
    const destFileCell = (s) => {
        const r = sourceResults.find((x) => x.id === s.id);
        if (r?.destFiles && r.destFiles.length > 0) {
            return r.destFiles.join('<br>');
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
## 備份目錄結構

\`\`\`
${destPath}/
${topLevelDirs
        .map((d) => `├── ${d}/\n${dirsMap.get(d).map((f) => `│   ├── ${f}`).join('\n')}`)
        .join('\n')}
\`\`\`

各 .tgz（或 .tgz.part* 分卷）為對應來源目錄的壓縮檔，系統不會自動解壓。單一分卷請 \`tar xzf\`；多分卷請先 \`cat\` 合併再解壓。

${restoreSection}## 備份來源

| 項目 | 來源路徑 | 目的檔案 |
|------|----------|----------|
${sources.map((s) => `| ${s.label || s.id} | ${s.sourcePath} | ${destFileCell(s)} |`).join('\n')}

---
${deleteSection}
`;
}
//# sourceMappingURL=backupService.js.map