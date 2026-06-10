/**
 * 備份執行器
 */
import { randomUUID } from 'crypto';
const OVERALL_BACKUP_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 小時
const progressMap = new Map();
const reportMap = new Map();
const logMap = new Map();
export function createBackupId() {
    return randomUUID();
}
export function addProgress(backupId, progress) {
    const list = progressMap.get(backupId) ?? [];
    list.push(progress);
    progressMap.set(backupId, list);
}
export function getProgressList(backupId) {
    return progressMap.get(backupId) ?? [];
}
export function getLastProgress(backupId) {
    const list = progressMap.get(backupId);
    return list?.length ? list[list.length - 1] : undefined;
}
export function addLog(backupId, log) {
    const list = logMap.get(backupId) ?? [];
    list.push(log);
    logMap.set(backupId, list);
}
export function getLogs(backupId) {
    return logMap.get(backupId) ?? [];
}
export function setReport(backupId, content) {
    reportMap.set(backupId, content);
}
export function getReport(backupId) {
    return reportMap.get(backupId);
}
function withTimeoutExec(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`OVERALL_TIMEOUT: 整體備份逾時（${ms / 1000 / 60} 分鐘）`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
/**
 * 非同步執行備份流程（SFTP 下載 + SMB 上傳）
 */
export function runBackupAsync(backupId, options) {
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
        const onProgress = (percent, message) => {
            addProgress(backupId, { step: 'backup', percent, message });
        };
        const onLog = (log) => {
            addLog(backupId, log);
        };
        try {
            await withTimeoutExec(runBackup({
                backupId,
                stagingPath,
                sources: sources,
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
            }), OVERALL_BACKUP_TIMEOUT_MS);
            // runBackup 成功：onReport 回呼已呼叫 setReport
        }
        catch (err) {
            const msg = err.message;
            addProgress(backupId, { step: 'error', percent: 100, message: msg });
            // 失敗報告已由 runBackup catch 區塊透過 onReport 回呼呼叫 setReport
            // 若 session 問題導致 runBackup 未能呼叫 onReport，補一個保底
            if (!getReport(backupId)) {
                setReport(backupId, `# 備份失敗\n\n${msg}\n\n請檢查憑證與網路連線後重試。\n`);
            }
        }
    })();
}
//# sourceMappingURL=backupExecutor.js.map