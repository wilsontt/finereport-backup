/**
 * 備份執行器
 */
import { randomUUID } from 'crypto';
import type { OperationLog } from './backupService.js';

const OVERALL_BACKUP_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 小時

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

function withTimeoutExec<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`OVERALL_TIMEOUT: 整體備份逾時（${ms / 1000 / 60} 分鐘）`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
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
      await withTimeoutExec(
        runBackup({
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
          onReport: (report) => {
            setReport(backupId, report);
          },
        }),
        OVERALL_BACKUP_TIMEOUT_MS
      );
      // runBackup 成功：onReport 回呼已呼叫 setReport
    } catch (err) {
      const msg = (err as Error).message;
      addProgress(backupId, { step: 'error', percent: 100, message: msg });
      // 失敗報告已由 runBackup catch 區塊透過 onReport 回呼呼叫 setReport
      // 若 session 問題導致 runBackup 未能呼叫 onReport，補一個保底
      if (!getReport(backupId)) {
        setReport(
          backupId,
          `# 備份失敗\n\n${msg}\n\n請檢查憑證與網路連線後重試。\n`
        );
      }
    }
  })();
}
