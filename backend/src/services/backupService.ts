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
import type { SshCredentials } from './sshService.js';
import type { NasCredentials } from './nasService.js';
import { fileURLToPath } from 'url';
import { mountNas, unmountNas, createNasDirectory, resolveSmbclientBin } from './nasService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SMB_CONF_PATH = path.join(__dirname, '..', '..', 'smb.conf');

const SOURCE_DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000; // 5 分鐘（每個來源）

interface BackupSource {
  id: string;
  sourcePath: string;
  destPath: string;
  label?: string;
}

interface SourceResult {
  id: string;
  label: string;
  success: boolean;
  error?: string;
}

export interface OperationLog {
  label: string;
  command: string;
  output?: string;
}

interface BackupOptions {
  backupId: string;
  stagingPath: string;
  sources: BackupSource[];
  nasPath: string;
  deleteOldBackup: boolean;
  retentionMonths: number;
  ssh: SshCredentials;
  sudoPassword: string;
  nas: NasCredentials;
  onProgress: (percent: number, message: string) => void;
  onLog?: (log: OperationLog) => void;
  onReport: (report: string, isFailure: boolean) => void;
}

async function ensureNasPath(creds: NasCredentials, fullPath: string): Promise<void> {
  const parts = fullPath.replace(/\\/g, '/').split('/').filter(Boolean);
  let parent = '.';
  for (const p of parts) {
    try {
      await createNasDirectory(creds, parent, p);
    } catch (e) {
      if ((e as Error).message !== 'ERR_NAS_EXISTS') throw e;
    }
    parent = parent === '.' ? p : `${parent}/${p}`;
  }
}

/**
 * 透過 smbclient 將單一檔案上傳至 NAS 指定目錄，失敗時依 smbclient 輸出內容分類錯誤原因
 */
async function smbclientPutFile(
  creds: NasCredentials,
  localFilePath: string,
  nasTargetDir: string,
  remoteFileName: string,
  onLog?: (label: string, command: string, output?: string) => void
): Promise<void> {
  const host = creds.host.replace(/^smb:\/\//, '').trim();
  const address = `//${host}/${creds.share}`;
  const args = ['-s', SMB_CONF_PATH, address, '-U', `${creds.username}%${creds.password}`, '-N'];
  if (creds.domain && creds.domain !== 'WORKGROUP') {
    args.splice(3, 0, '-W', creds.domain);
  }
  const cdEsc = nasTargetDir.replace(/"/g, '\\"');
  const localEsc = localFilePath.replace(/"/g, '\\"');
  const putCmd = `cd "${cdEsc}"; put "${localEsc}" "${remoteFileName}"`;
  const proc = spawn(resolveSmbclientBin(), [...args, '-c', putCmd], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise<void>((resolve, reject) => {
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
        onLog?.(
          `SMB 上傳失敗 (${remoteFileName})`,
          `smbclient put "${remoteFileName}" -> ${nasTargetDir} (exit=${code})`,
          detail
        );
        if (msg.includes('logon_failure') || msg.includes('auth')) {
          reject(new Error(`ERR_NAS_AUTH: ${detail}`));
        } else if (
          msg.includes('host_unreachable') ||
          msg.includes('no route to host') ||
          msg.includes('host is down') ||
          msg.includes('connection refused') ||
          msg.includes('connection to') // do_connect: Connection to <host> failed
        ) {
          reject(new Error(`ERR_NAS_UNREACHABLE: ${detail}`));
        } else if (
          msg.includes('no such file') ||
          msg.includes('access denied') ||
          msg.includes('object_name_not_found')
        ) {
          reject(new Error(`ERR_NAS_PATH: ${detail}`));
        } else {
          reject(new Error(`ERR_NAS_UPLOAD: ${detail}`));
        }
      } else resolve();
    });
    proc.on('error', (e) => {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        onLog?.(`SMB 上傳失敗 (${remoteFileName})`, 'smbclient', 'ERR_NAS_SMBCLIENT_NOT_FOUND: 找不到 smbclient 可執行檔');
        reject(new Error('ERR_NAS_SMBCLIENT_NOT_FOUND'));
      } else {
        onLog?.(`SMB 上傳失敗 (${remoteFileName})`, 'smbclient', (e as Error).message);
        reject(e);
      }
    });
  });
}

async function uploadDirViaSmbclient(
  creds: NasCredentials,
  targetPath: string,
  localDir: string,
  onFileProgress?: (fileIdx: number, totalFiles: number, fileName: string) => void,
  onLog?: (label: string, command: string, output?: string) => void
): Promise<void> {
  const files = collectFiles(localDir);
  if (files.length === 0) return;
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
async function uploadFileViaSmbclient(
  creds: NasCredentials,
  nasTargetDir: string,
  localFilePath: string,
  onLog?: (label: string, command: string, output?: string) => void
): Promise<void> {
  await ensureNasPath(creds, nasTargetDir);
  await smbclientPutFile(creds, localFilePath, nasTargetDir, path.basename(localFilePath), onLog);
}

/**
 * 遞迴收集目錄下所有檔案（相對路徑）
 */
function collectFiles(dir: string, base = ''): Array<{ relPath: string; localPath: string }> {
  const results: Array<{ relPath: string; localPath: string }> = [];
  const entries = fs.readdirSync(path.join(dir, base), { withFileTypes: true });
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    const local = path.join(dir, rel);
    if (e.isDirectory()) {
      results.push(...collectFiles(dir, rel));
    } else {
      results.push({ relPath: rel, localPath: local });
    }
  }
  return results;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`TIMEOUT: ${label} 逾時（${ms / 1000}s）`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}


/**
 * 將遠端來源目錄打包為 .tgz 並透過 SFTP 下載至本機，目的端保留壓縮檔不解壓。
 * 解壓縮交由使用者依需要自行手動執行（部分來源檔案數量極大，例如 schedule
 * 目錄可能有數萬個小檔案，本機解壓會大幅拖慢備份流程）。
 */
async function downloadSourceAsTgz(
  sftp: SftpClient,
  creds: SshCredentials,
  sudoPassword: string,
  remoteSrc: string,
  localTgzPath: string,
  onLog?: (label: string, command: string, output?: string) => void,
  onProgress?: (msg: string) => void
): Promise<void> {
  const lastSlash = remoteSrc.lastIndexOf('/');
  const remoteParentDir = remoteSrc.substring(0, lastSlash);
  const baseName = remoteSrc.substring(lastSlash + 1);
  const remoteTgz = `${remoteSrc}.tgz`;

  // 1. 遠端打包
  onProgress?.(`遠端打包 ${baseName}`);
  const escParent = remoteParentDir.replace(/"/g, '\\"');
  const escBase = baseName.replace(/"/g, '\\"');
  const escTgz = remoteTgz.replace(/"/g, '\\"');
  const tarCmd = `tar czf "${escTgz}" -C "${escParent}" "${escBase}"`;
  onLog?.(`遠端打包 ${baseName}`, tarCmd);
  const { code: tarCode, stderr: tarStderr } = await execWithSudo(
    creds, sudoPassword, tarCmd, true
  );
  if (tarCode !== 0) {
    throw new Error(`遠端打包失敗 (${baseName}): ${tarStderr?.trim() || `exit=${tarCode}`}`);
  }

  // 2. SFTP 下載 .tgz
  onProgress?.(`下載壓縮包 ${baseName}.tgz`);
  onLog?.(`SFTP 下載 ${baseName}.tgz`, `fastGet ${remoteTgz} -> ${localTgzPath}`);
  try {
    // ssh2-sftp-client 的 fastGet 存在於執行期但未列入型別宣告，以型別斷言繞過
    await (sftp as unknown as { fastGet: (r: string, l: string) => Promise<string> }).fastGet(remoteTgz, localTgzPath);
  } catch (e) {
    throw new Error(`SFTP 下載 .tgz 失敗 (${baseName}): ${(e as Error).message}`);
  }

  // 3. 刪除遠端暫存 .tgz
  const escTgzClean = remoteTgz.replace(/"/g, '\\"');
  await execWithSudo(creds, sudoPassword, `rm -f "${escTgzClean}"`, true);

  // 4. 驗證本機壓縮檔存在且非空
  const stat = fs.statSync(localTgzPath);
  if (stat.size === 0) {
    throw new Error(`下載壓縮包為空 (${baseName}.tgz)，請檢查遠端來源路徑`);
  }
  onLog?.(`驗證 ${baseName}`, `本機壓縮包大小 ${stat.size} bytes`);
}

/**
 * 執行完整備份流程
 */
export async function runBackup(options: BackupOptions): Promise<void> {
  const {
    backupId,
    stagingPath,
    sources,
    nasPath,
    deleteOldBackup,
    retentionMonths,
    ssh,
    sudoPassword,
    nas,
    onProgress,
    onLog,
  } = options;

  const sourceResults: SourceResult[] = sources.map((src) => ({
    id: src.id,
    label: src.label || src.id,
    success: false,
  }));
  let backupDestPath = '';
  let overallError: Error | null = null;

  const log = (label: string, command: string, output?: string) => {
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
      } else {
        log('掛載 NAS', `使用既有掛載點 -> ${actualMountPath}`);
      }
    } catch (mountErr) {
      const errMsg = (mountErr as Error).message;
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
      const { code: cpCode, stderr: cpStderr } = await execWithSudo(
        ssh,
        sudoPassword,
        cpCmdExec,
        true
      );
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
      const { stdout: findOut } = await execWithSudo(
        ssh,
        sudoPassword,
        findCmd,
        true
      );
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
      try {
        await withTimeout(
          downloadSourceAsTgz(
            sftp, ssh, sudoPassword,
            remoteSrc, localTgzPath,
            log,
            (msg) => onProgress(40 + Math.floor((completed / total) * 45), msg)
          ),
          SOURCE_DOWNLOAD_TIMEOUT_MS,
          `打包下載 ${label}`
        );
      } catch (e) {
        await sftp.end();
        throw new Error(`打包下載失敗 (${label}): ${(e as Error).message}`);
      }

      const tgzFileName = path.basename(localTgzPath);
      const nasTargetDir = `${backupDestPathRel}/${path.dirname(destPath)}`.replace(/\/\.$/, '');

      if (useSmbclientFallback) {
        onProgress(40 + Math.floor(((completed + 0.5) / total) * 45), `SMB 上傳 ${label}: smbclient put ${tgzFileName} -> ${nasTargetDir}`);
        log(`SMB 上傳 ${label}`, `smbclient put ${tgzFileName} -> ${nasTargetDir}`);
        await uploadFileViaSmbclient(nas, nasTargetDir, localTgzPath, log);
        try { fs.rmSync(localTgzPath); } catch { /* ignore */ }
      } else {
        const stat = fs.statSync(localTgzPath);
        log(`已寫入 NAS ${label}`, `${tgzFileName} (${stat.size} bytes) -> ${nasTargetDir}`);
      }
      const resultIdx = sourceResults.findIndex((r) => r.id === src.id);
      if (resultIdx !== -1) sourceResults[resultIdx].success = true;
      completed++;
    }

    const deleteActions: Array<{ label: string; command: string }> = [];
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
        if (!m) continue;
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
    } else {
      log('略過遠端清理', 'deleteOldBackup 未勾選，保留遠端備份');
    }
    await sftp.end();

    onProgress(90, '產生報告');
    const report = generateReport(
      backupId, backupMonth, backupDestPathRel, sources, startTime,
      deleteOldBackup, retentionMonths, deleteActions,
      sourceResults, null
    );
    if (nasMounted) {
      fs.writeFileSync(path.join(backupDestPath, reportFileName), report, 'utf8');
    } else {
      const reportDir = path.join(tempRoot, 'report');
      fs.mkdirSync(reportDir, { recursive: true });
      fs.writeFileSync(path.join(reportDir, reportFileName), report, 'utf8');
      await ensureNasPath(nas, backupDestPathRel);
      await uploadDirViaSmbclient(nas, backupDestPathRel, reportDir, undefined, log);
    }
    options.onReport(report, false);
    onProgress(100, '備份完成');
  } catch (e) {
    overallError = e as Error;
    const failReport = generateReport(
      backupId, backupMonth, backupDestPathRel, sources, startTime,
      deleteOldBackup, retentionMonths, [],
      sourceResults, overallError
    );
    try {
      options.onReport(failReport, true);
    } catch { /* don't mask original error */ }
    // 嘗試將失敗報告寫入 NAS（不影響原始錯誤拋出）
    try {
      if (nasMounted && backupDestPath) {
        fs.mkdirSync(backupDestPath, { recursive: true });
        fs.writeFileSync(path.join(backupDestPath, reportFileName), failReport, 'utf8');
        log('寫入失敗報告 (NAS 掛載點)', path.join(backupDestPath, reportFileName));
      } else if (useSmbclientFallback && backupDestPath) {
        const reportDir = path.join(tempRoot, 'report');
        fs.mkdirSync(reportDir, { recursive: true });
        fs.writeFileSync(path.join(reportDir, reportFileName), failReport, 'utf8');
        try {
          await ensureNasPath(nas, backupDestPathRel);
          await uploadDirViaSmbclient(nas, backupDestPathRel, reportDir, undefined, log);
          log('寫入失敗報告 (smbclient)', `${backupDestPathRel}/${reportFileName}`);
        } catch (uploadErr) { console.error('[runBackup] 失敗報告 smbclient 上傳失敗:', uploadErr); }
      }
    } catch (reportWriteErr) {
      console.error('[runBackup] 失敗報告寫入 NAS 失敗:', reportWriteErr);
    }
  } finally {
    if (nasMounted && actualMountPath === mountPoint) {
      try {
        await unmountNas(mountPoint);
        log('卸載 NAS', `umount ${mountPoint}`);
      } catch (e) {
        console.error('[backupService] umount 失敗:', e);
      }
    }
    try {
      fs.rmSync(mountPoint, { recursive: true, force: true });
    } catch {
      // ignore
    }
    if (useSmbclientFallback) {
      try {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    if (overallError) throw overallError;
  }
}

/**
 * 解析 destPath：mysqldata 需加上子目錄（finedb、mysql）
 */
/** 格式化為 Asia/Taipei 時區，格式：YYYY-MM-DD HH:mm:ss（無 T、Z） */
function formatTaipei(d: Date): string {
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
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/** 格式化為 Asia/Taipei 時區的日期，格式：YYYYMMDD（用於報告檔名） */
function formatTaipeiDate(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}`;
}

function resolveDestPath(src: BackupSource): string {
  const base = src.destPath.replace(/\/$/, '');
  if (base === 'mysqldata') {
    const leaf = path.basename(src.sourcePath.replace(/\/$/, ''));
    return `mysqldata/${leaf}`;
  }
  return base;
}

function generateReport(
  backupId: string,
  backupMonth: string,
  destPath: string,
  sources: BackupSource[],
  startTime: Date,
  deleteOldBackup: boolean,
  retentionMonths: number,
  deleteActions: Array<{ label: string; command: string }>,
  sourceResults: SourceResult[],
  overallError: Error | null
): string {
  const dirsMap = new Map<string, string[]>();
  for (const src of sources) {
    const rel = resolveDestPath(src);
    const top = rel.split('/')[0];
    if (!top) continue;
    const tgzName = `${path.basename(rel)}.tgz`;
    if (!dirsMap.has(top)) dirsMap.set(top, []);
    dirsMap.get(top)!.push(tgzName);
  }
  const topLevelDirs = Array.from(dirsMap.keys()).sort();
  const endTime = new Date();

  const completedCount = sourceResults.filter((r) => r.success).length;
  const totalCount = sourceResults.length;
  const isFailure = overallError !== null;
  const completionSection = `## 完成度

已完成 ${completedCount} / 共 ${totalCount} 個來源

| 來源 | 狀態 |
|------|------|
${sourceResults
  .map((r) => `| ${r.label} | ${r.success ? '✅ 成功' : `❌ 未完成${r.error ? `（${r.error}）` : ''}`} |`)
  .join('\n')}
`;

  const deleteSection =
    deleteActions.length > 0
      ? `## 遠端刪除動作（保留期 ${retentionMonths} 個月）

| 動作 | 指令 |
|------|------|
${deleteActions.map((a) => `| ${a.label} | \`${a.command}\` |`).join('\n')}
`
      : `## 遠端刪除

未執行刪除（使用者選擇保留遠端備份）。
`;

  const titleLine = isFailure
    ? `# FineReport 備份報告（失敗）\n\n失敗原因：${overallError!.message}\n`
    : `# FineReport 備份報告\n`;

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
  .map((d) => `├── ${d}/\n${dirsMap.get(d)!.map((f) => `│   ├── ${f}`).join('\n')}`)
  .join('\n')}
\`\`\`

各 .tgz 為對應來源目錄的壓縮檔，系統不會自動解壓，如需查看內容請自行手動解壓縮（\`tar xzf 檔名.tgz\`）。

## 備份來源

| 項目 | 來源路徑 | 目的檔案 |
|------|----------|----------|
${sources.map((s) => `| ${s.label || s.id} | ${s.sourcePath} | ${resolveDestPath(s)}.tgz |`).join('\n')}

---
${deleteSection}
`;
}
