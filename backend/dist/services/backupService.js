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
import { mountNas, unmountNas, createNasDirectory } from './nasService.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SMB_CONF_PATH = path.join(__dirname, '..', '..', 'smb.conf');
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
async function uploadDirViaSmbclient(creds, targetPath, localDir, onFileProgress) {
    const host = creds.host.replace(/^smb:\/\//, '').trim();
    const address = `//${host}/${creds.share}`;
    const args = ['-s', SMB_CONF_PATH, address, '-U', `${creds.username}%${creds.password}`, '-N'];
    if (creds.domain && creds.domain !== 'WORKGROUP') {
        args.splice(3, 0, '-W', creds.domain);
    }
    const files = collectFiles(localDir);
    if (files.length === 0)
        return;
    for (let i = 0; i < files.length; i++) {
        const f = files[i];
        onFileProgress?.(i, files.length, f.relPath);
        const dirPart = path.dirname(f.relPath);
        const filePart = path.basename(f.relPath);
        const cdPath = dirPart ? `${targetPath}/${dirPart.replace(/\\/g, '/')}` : targetPath;
        await ensureNasPath(creds, cdPath);
        const cdEsc = cdPath.replace(/"/g, '\\"');
        const localEsc = f.localPath.replace(/"/g, '\\"');
        const putCmd = `cd "${cdEsc}"; put "${localEsc}" "${filePart}"`;
        const proc = spawn('smbclient', [...args, '-c', putCmd], { stdio: ['ignore', 'pipe', 'pipe'] });
        await new Promise((resolve, reject) => {
            let stderr = '';
            proc.stderr?.on('data', (d) => { stderr += d.toString(); });
            proc.on('close', (code) => {
                if (code !== 0) {
                    const msg = stderr.toLowerCase();
                    if (msg.includes('auth') || msg.includes('nt_status_logon_failure'))
                        reject(new Error('ERR_NAS_AUTH'));
                    else if (msg.includes('no such file') || msg.includes('access denied'))
                        reject(new Error('ERR_NAS_PATH'));
                    else
                        reject(new Error(`ERR_NAS_UPLOAD: ${stderr}`));
                }
                else
                    resolve();
            });
            proc.on('error', (e) => {
                if (e.code === 'ENOENT')
                    reject(new Error('ERR_NAS_SMBCLIENT_NOT_FOUND'));
                else
                    reject(e);
            });
        });
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
/**
 * 執行完整備份流程
 */
export async function runBackup(options) {
    const { backupId, stagingPath, sources, nasPath, deleteOldBackup, retentionMonths, ssh, sudoPassword, nas, onProgress, onLog, } = options;
    const log = (label, command, output) => {
        onLog?.({ label, command, output });
    };
    const startTime = new Date();
    log('刪除設定', `deleteOldBackup=${deleteOldBackup}, retentionMonths=${retentionMonths}`);
    const backupMonth = stagingPath.split('/').filter(Boolean).pop() ?? '';
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
        const backupDestPath = nasMounted
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
            const localDir = path.join(backupDestPath, destPath);
            const sftpCmdDisplay = `sftp.downloadDir ${remoteSrc} -> ${path.join(backupDestPath, destPath)}`;
            onProgress(40 + Math.floor((completed / total) * 45), `SFTP 下載 ${label}: ${sftpCmdDisplay}`);
            const localDirAbs = path.resolve(localDir);
            fs.mkdirSync(localDirAbs, { recursive: true });
            log(`SFTP 下載 ${label}`, `sftp.downloadDir ${remoteSrc} -> ${localDirAbs}`);
            try {
                await sftp.downloadDir(remoteSrc, localDirAbs, { useFastget: false });
            }
            catch (e) {
                await sftp.end();
                throw new Error(`SFTP 下載失敗 (${label}): ${e.message}`);
            }
            const fileCount = collectFiles(localDirAbs).length;
            if (fileCount === 0) {
                await sftp.end();
                throw new Error(`SFTP 下載後無檔案 (${label})，請檢查遠端路徑: ${remoteSrc}`);
            }
            if (useSmbclientFallback) {
                const nasTargetPath = `${backupDestPathRel}/${destPath}`;
                onProgress(40 + Math.floor(((completed + 0.5) / total) * 45), `SMB 上傳 ${label}: smbclient put (${fileCount} 個檔案) -> ${nasTargetPath}`);
                log(`SMB 上傳 ${label}`, `smbclient put (${fileCount} 個檔案) -> ${nasTargetPath}`);
                await ensureNasPath(nas, nasTargetPath);
                await uploadDirViaSmbclient(nas, nasTargetPath, localDirAbs, (fileIdx, totalFiles, fileName) => {
                    const pct = 40 + Math.floor(((completed + fileIdx / totalFiles) / total) * 45);
                    onProgress(pct, `SMB 上傳 ${label}: ${fileName}`);
                });
            }
            else {
                log(`已寫入 NAS ${label}`, `${fileCount} 個檔案 -> ${backupDestPathRel}/${destPath}`);
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
        const report = generateReport(backupId, backupMonth, backupDestPathRel, sources, startTime, deleteOldBackup, retentionMonths, deleteActions);
        if (nasMounted) {
            fs.writeFileSync(path.join(backupDestPath, '備份報告.md'), report, 'utf8');
        }
        else {
            const reportDir = path.join(tempRoot, 'report');
            fs.mkdirSync(reportDir, { recursive: true });
            fs.writeFileSync(path.join(reportDir, '備份報告.md'), report, 'utf8');
            await ensureNasPath(nas, backupDestPathRel);
            await uploadDirViaSmbclient(nas, backupDestPathRel, reportDir);
        }
        onProgress(100, '備份完成');
        return report;
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
function resolveDestPath(src) {
    const base = src.destPath.replace(/\/$/, '');
    if (base === 'mysqldata') {
        const leaf = path.basename(src.sourcePath.replace(/\/$/, ''));
        return `mysqldata/${leaf}`;
    }
    return base;
}
function generateReport(backupId, backupMonth, destPath, sources, startTime, deleteOldBackup, retentionMonths, deleteActions) {
    const dirs = new Set();
    for (const src of sources) {
        const base = resolveDestPath(src).split('/')[0];
        if (base)
            dirs.add(base);
    }
    const topLevelDirs = Array.from(dirs).sort();
    const endTime = new Date();
    const deleteSection = deleteActions.length > 0
        ? `## 遠端刪除動作（保留期 ${retentionMonths} 個月）

| 動作 | 指令 |
|------|------|
${deleteActions.map((a) => `| ${a.label} | \`${a.command}\` |`).join('\n')}
`
        : `## 遠端刪除

未執行刪除（使用者選擇保留遠端備份）。
`;
    return `# FineReport 備份報告

備份 ID: ${backupId}
備份月份: ${backupMonth}
目的路徑: ${destPath}

## 作業時間（Asia/Taipei）

| 項目 | 時間 |
|------|------|
| 開始作業 | ${formatTaipei(startTime)} |
| 完成時間 | ${formatTaipei(endTime)} |

## 備份目錄結構

\`\`\`
${destPath}/
${topLevelDirs.map((d) => `├── ${d}/`).join('\n')}
\`\`\`

## 備份來源

| 項目 | 來源路徑 | 目的路徑 |
|------|----------|----------|
${sources.map((s) => `| ${s.label || s.id} | ${s.sourcePath} | ${resolveDestPath(s)} |`).join('\n')}

---
${deleteSection}
`;
}
//# sourceMappingURL=backupService.js.map