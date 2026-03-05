/**
 * 遠端目錄探索服務
 */
import type { SshCredentials } from './sshService.js';
import type { BackupSourceItem } from '../constants/defaultBackupSources.js';
/**
 * 探索遠端目錄，解析 {latest}
 */
export declare function discoverRemote(creds: SshCredentials, sudoPassword: string, basePath?: string): Promise<BackupSourceItem[]>;
//# sourceMappingURL=pathDiscovery.d.ts.map