/**
 * 遠端目錄探索服務
 */
import type { SshCredentials } from './sshService.js';
import { execWithSudo } from './sshService.js';
import { DEFAULT_BACKUP_SOURCES } from '../constants/defaultBackupSources.js';
import type { BackupSourceItem } from '../constants/defaultBackupSources.js';

const BACKUP_BASE = '/opt/tomcat/webapps/webroot/backup';

/**
 * 取得 auto 目錄下最新時間戳子目錄
 */
async function getLatestInAuto(
  creds: SshCredentials,
  sudoPassword: string,
  relPath: string
): Promise<string> {
  const fullPath = `${BACKUP_BASE}/${relPath}`;
  const { stdout, code } = await execWithSudo(
    creds,
    sudoPassword,
    `ls -1 "${fullPath}" 2>/dev/null | sort -r | head -1`
  );
  if (code !== 0 || !stdout.trim()) {
    throw new Error(`無法取得 ${relPath} 最新目錄`);
  }
  return stdout.trim();
}

/**
 * 探索遠端目錄，解析 {latest}
 */
export async function discoverRemote(
  creds: SshCredentials,
  sudoPassword: string,
  basePath: string = BACKUP_BASE
): Promise<BackupSourceItem[]> {
  const results: BackupSourceItem[] = [];

  for (const src of DEFAULT_BACKUP_SOURCES) {
    let sourcePath = src.sourcePath;

    if (src.sourcePath.includes('{latest}')) {
      const relPath = src.sourcePath.replace('{latest}', '').replace(/\/$/, '');
      try {
        const latest = await getLatestInAuto(creds, sudoPassword, relPath);
        sourcePath = src.isAbsoluteSource
          ? src.sourcePath.replace('{latest}', latest)
          : `${basePath}/${relPath}/${latest}`;
      } catch {
        sourcePath = src.sourcePath;
      }
    } else if (!src.isAbsoluteSource) {
      sourcePath = `${basePath}/${src.sourcePath}`;
    }

    results.push({
      ...src,
      sourcePath,
      resolved: true,
    } as BackupSourceItem & { resolved?: boolean });
  }

  return results;
}
