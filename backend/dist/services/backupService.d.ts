import type { SshCredentials } from './sshService.js';
import type { NasCredentials } from './nasService.js';
interface BackupSource {
    id: string;
    sourcePath: string;
    destPath: string;
    label?: string;
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
}
/**
 * 執行完整備份流程
 */
export declare function runBackup(options: BackupOptions): Promise<string>;
export {};
//# sourceMappingURL=backupService.d.ts.map