/**
 * 備份執行器
 */
import { randomUUID } from 'crypto';
import type { OperationLog } from './backupService.js';

export interface BackupProgress {
  step: string;
  percent: number;
  message: string;
  reportPath?: string;
}

const progressMap = new Map<string, BackupProgress[]>();
const reportMap = new Map<string, string>();
const logMap = new Map<string, OperationLog[]>();

export function createBackupId(): string {
  return randomUUID();
}

export function addProgress(backupId: string, progress: BackupProgress): void {
  const list = progressMap.get(backupId) ?? [];
  list.push(progress);
  progressMap.set(backupId, list);
}

export function getProgressList(backupId: string): BackupProgress[] {
  return progressMap.get(backupId) ?? [];
}

export function getLastProgress(backupId: string): BackupProgress | undefined {
  const list = progressMap.get(backupId);
  return list?.length ? list[list.length - 1] : undefined;
}

export function addLog(backupId: string, log: OperationLog): void {
  const list = logMap.get(backupId) ?? [];
  list.push(log);
  logMap.set(backupId, list);
}

export function getLogs(backupId: string): OperationLog[] {
  return logMap.get(backupId) ?? [];
}

export function setReport(backupId: string, content: string): void {
  reportMap.set(backupId, content);
}

export function getReport(backupId: string): string | undefined {
  return reportMap.get(backupId);
}

/**
 * 非同步執行備份流程（SFTP 下載 + SMB 上傳）
 */
export function runBackupAsync(
  backupId: string,
  options: {
    sessionId: string;
    stagingPath: string;
    sources: unknown[];
    nasPath: string;
    deleteOldBackup: boolean;
    retentionMonths: number;
  }
): void {
  const { sessionId, stagingPath, sources, nasPath, deleteOldBackup, retentionMonths } = options;

  void (async () => {
    const { getOrCreateSession } = await import('../lib/sessionStore.js');
    const { runBackup } = await import('./backupService.js');

    const sess = getOrCreateSession(sessionId);
    if (!sess.ssh || !sess.sudoPassword || !sess.nas) {
      addProgress(backupId, { step: 'error', percent: 0, message: 'Session 憑證遺失，請重新驗證' });
      setReport(backupId, `# 備份失敗\n\nSession 憑證遺失，請重新完成驗證流程。`);
      return;
    }

    const onProgress = (percent: number, message: string) => {
      addProgress(backupId, { step: 'backup', percent, message });
    };

    const onLog = (log: OperationLog) => {
      addLog(backupId, log);
    };

    try {
      const report = await runBackup({
        backupId,
        stagingPath,
        sources: sources as Array<{ id: string; sourcePath: string; destPath: string; label?: string }>,
        nasPath,
        deleteOldBackup,
        retentionMonths,
        ssh: sess.ssh,
        sudoPassword: sess.sudoPassword,
        nas: sess.nas,
        onProgress,
        onLog,
      });
      setReport(backupId, report);
    } catch (err) {
      const msg = (err as Error).message;
      addProgress(backupId, { step: 'error', percent: 100, message: msg });
      setReport(backupId, `# 備份失敗\n\n${msg}\n\n請檢查憑證與網路連線後重試。`);
    }
  })();
}
