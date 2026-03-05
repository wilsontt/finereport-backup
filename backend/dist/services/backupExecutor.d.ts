import type { OperationLog } from './backupService.js';
export interface BackupProgress {
    step: string;
    percent: number;
    message: string;
    reportPath?: string;
}
export declare function createBackupId(): string;
export declare function addProgress(backupId: string, progress: BackupProgress): void;
export declare function getProgressList(backupId: string): BackupProgress[];
export declare function getLastProgress(backupId: string): BackupProgress | undefined;
export declare function addLog(backupId: string, log: OperationLog): void;
export declare function getLogs(backupId: string): OperationLog[];
export declare function setReport(backupId: string, content: string): void;
export declare function getReport(backupId: string): string | undefined;
/**
 * 非同步執行備份流程（SFTP 下載 + SMB 上傳）
 */
export declare function runBackupAsync(backupId: string, options: {
    sessionId: string;
    stagingPath: string;
    sources: unknown[];
    nasPath: string;
    deleteOldBackup: boolean;
    retentionMonths: number;
}): void;
//# sourceMappingURL=backupExecutor.d.ts.map