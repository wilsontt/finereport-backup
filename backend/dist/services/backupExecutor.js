/**
 * 備份執行器
 */
import { randomUUID } from 'crypto';
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
            const report = await runBackup({
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
            });
            setReport(backupId, report);
        }
        catch (err) {
            const msg = err.message;
            addProgress(backupId, { step: 'error', percent: 100, message: msg });
            // 失敗時一併保留完整作業日誌，方便事後查 smbclient／SSH 等實際錯誤輸出
            const logs = getLogs(backupId);
            const logSection = logs.length
                ? logs
                    .map((l) => {
                    const out = l.output != null && l.output !== '' ? `\n\n輸出：\n\`\`\`\n${l.output}\n\`\`\`` : '';
                    return `### ${l.label}\n\n\`\`\`\n${l.command}\n\`\`\`${out}`;
                })
                    .join('\n\n')
                : '（無作業日誌）';
            setReport(backupId, `# 備份失敗\n\n${msg}\n\n請檢查憑證與網路連線後重試。\n\n---\n\n## 作業日誌（失敗前完整紀錄）\n\n${logSection}\n`);
        }
    })();
}
//# sourceMappingURL=backupExecutor.js.map