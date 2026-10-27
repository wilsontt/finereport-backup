# FineReport 備份優化實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 實作四項備份優化：大量小檔打包下載加速、進度條動畫＋經過秒數、前端記住 backupId 可重連、報告必產生＋完成度＋失敗也寫 NAS，以及 SFTP/整體逾時保護。

**Architecture:** 後端 `backupService.ts` 加入 tar 打包下載、per-source timeout、try/catch 保證報告；`backupExecutor.ts` 加整體 timeout 並接收 `onReport` 回呼；前端 `BackupProgress.tsx` 加動畫與計時器，`App.tsx` 加 sessionStorage 重連。

**Tech Stack:** Node.js/TypeScript (backend), React/TypeScript (frontend), `spawn('tar')` for local extract, `sftp.fastGet` for single-file SFTP, `sessionStorage` for backupId persistence.

---

## 檔案修改清單

| 檔案 | 任務 | 變更性質 |
|------|------|---------|
| `backend/src/services/backupService.ts` | 1, 3b, 3c | 加常數、helpers、`SourceResult`、`onReport` 回呼、try/catch、`generateReport` 新增完成度 |
| `backend/src/services/backupExecutor.ts` | 3b, 3c | 加整體 timeout、改傳 `onReport`、簡化 catch 的報告邏輯 |
| `frontend/src/components/BackupProgress.tsx` | 2, 3a | 加 elapsed timer、animated 進度條、SSE done 清除 sessionStorage |
| `frontend/src/App.tsx` | 3a | mount 時恢復 backupId、`onBackupStart` 寫入 sessionStorage |
| `README.md` | 4 | 更新備份流程說明 |
| `CLAUDE.md` | 4 | 更新架構說明 |
| `1.docs/FineReport備份工具-備份優化構想.md` | 4 | 標記已完成項目 |

---

## Task 1：schedule 遠端打包下載

**Files:**
- Modify: `backend/src/services/backupService.ts`

### 背景

`sftp.downloadDir` 逐檔下載，`schedule` 有數千個小檔，耗時極長。改為遠端 `tar czf`、SFTP 下載單一 `.tgz`、本機解壓，可大幅縮短時間。觸發門檻：遠端檔案數 > 500（`LARGE_DIR_FILE_THRESHOLD`）。

- [ ] **Step 1.1：加常數**

在 `import` 區塊之後、`interface BackupSource` 之前加入：

```typescript
const LARGE_DIR_FILE_THRESHOLD = 500;
const SOURCE_DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000; // 5 分鐘（每個來源）
```

- [ ] **Step 1.2：加 `withTimeout` 工具函式**

在 `collectFiles` 函式之後加入：

```typescript
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
```

- [ ] **Step 1.3：加 `countRemoteFiles` helper**

緊接 `withTimeout` 之後加入：

```typescript
async function countRemoteFiles(
  creds: SshCredentials,
  sudoPassword: string,
  remotePath: string
): Promise<number> {
  const esc = remotePath.replace(/"/g, '\\"');
  const { stdout, code } = await execWithSudo(
    creds,
    sudoPassword,
    `find "${esc}" -type f 2>/dev/null | wc -l`,
    true
  );
  if (code !== 0) return 0;
  return parseInt(stdout.trim(), 10) || 0;
}
```

- [ ] **Step 1.4：加 `extractTgz` helper**

緊接 `countRemoteFiles` 之後加入：

```typescript
async function extractTgz(tgzPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('tar', ['xzf', tgzPath, '-C', destDir], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      code === 0
        ? resolve()
        : reject(new Error(`tar 解壓失敗 (exit=${code}): ${stderr.trim()}`));
    });
    proc.on('error', reject);
  });
}
```

- [ ] **Step 1.5：加 `downloadDirWithTar` helper**

緊接 `extractTgz` 之後加入：

```typescript
async function downloadDirWithTar(
  sftp: SftpClient,
  creds: SshCredentials,
  sudoPassword: string,
  remoteSrc: string,
  localDir: string,
  remoteFileCount: number,
  onLog?: (label: string, command: string, output?: string) => void,
  onProgress?: (msg: string) => void
): Promise<void> {
  const lastSlash = remoteSrc.lastIndexOf('/');
  const remoteParentDir = remoteSrc.substring(0, lastSlash);
  const baseName = remoteSrc.substring(lastSlash + 1);
  const remoteTgz = `${remoteSrc}.tgz`;
  const localTgz = `${localDir}.tgz`;
  const localParentDir = path.dirname(localDir);

  // 1. 遠端打包
  onProgress?.(`遠端打包 ${baseName}（${remoteFileCount} 個檔案）`);
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

  // 2. SFTP 下載 .tgz（單一大檔，遠比逐檔快）
  onProgress?.(`下載壓縮包 ${baseName}.tgz`);
  onLog?.(`SFTP 下載 ${baseName}.tgz`, `fastGet ${remoteTgz} -> ${localTgz}`);
  try {
    await sftp.fastGet(remoteTgz, localTgz);
  } catch (e) {
    throw new Error(`SFTP 下載 .tgz 失敗 (${baseName}): ${(e as Error).message}`);
  }

  // 3. 刪除遠端暫存 .tgz
  await execWithSudo(ssh, sudoPassword, `rm -f "${escTgz}"`, true);

  // 4. 本機解壓
  onProgress?.(`解壓 ${baseName}`);
  fs.mkdirSync(localParentDir, { recursive: true });
  onLog?.(`本機解壓 ${baseName}`, `tar xzf ${localTgz} -C ${localParentDir}`);
  try {
    await extractTgz(localTgz, localParentDir);
  } finally {
    try { fs.rmSync(localTgz); } catch { /* ignore */ }
  }

  // 5. 驗證本機檔案數與遠端一致
  const localCount = collectFiles(localDir).length;
  if (localCount !== remoteFileCount) {
    throw new Error(
      `解壓後檔案數不符 (${baseName}): 遠端 ${remoteFileCount} 個，本機 ${localCount} 個`
    );
  }
  onLog?.(`驗證 ${baseName}`, `本機 ${localCount} 個，符合遠端數量`);
}
```

> 注意：`downloadDirWithTar` 內的 `ssh` 是閉包引用 `runBackup` 的 `ssh` 參數（`creds` 形參已傳入），但函式體內第 3 步直接寫了 `ssh`——請改為使用形參 `creds`：
> ```typescript
> await execWithSudo(creds, sudoPassword, `rm -f "${escTgz}"`, true);
> ```

- [ ] **Step 1.6：修改 SFTP 下載迴圈**

找到現有的 SFTP 下載迴圈（约在 `await sftp.connect` 之後的 `for (const src of sources)` 迴圈），將 `downloadDir` 那段替換為：

```typescript
// 計算遠端檔案數，決定是否使用打包模式
const remoteFileCount = await countRemoteFiles(ssh, sudoPassword, remoteSrc);
log(
  `計算檔案數 ${label}`,
  `find ${remoteSrc} -type f | wc -l`,
  String(remoteFileCount)
);

if (remoteFileCount > LARGE_DIR_FILE_THRESHOLD) {
  onProgress(
    40 + Math.floor((completed / total) * 45),
    `打包下載 ${label}（${remoteFileCount} 個檔案）`
  );
  log(`打包下載模式 ${label}`, `檔案數 ${remoteFileCount} > ${LARGE_DIR_FILE_THRESHOLD}`);
  try {
    await withTimeout(
      downloadDirWithTar(
        sftp, ssh, sudoPassword,
        remoteSrc, localDirAbs,
        remoteFileCount,
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
} else {
  try {
    await withTimeout(
      sftp.downloadDir(remoteSrc, localDirAbs, { useFastget: false }),
      SOURCE_DOWNLOAD_TIMEOUT_MS,
      `SFTP 下載 ${label}`
    );
  } catch (e) {
    await sftp.end();
    throw new Error(`SFTP 下載失敗 (${label}): ${(e as Error).message}`);
  }
}
```

- [ ] **Step 1.7：Build & lint**

```bash
cd backend && npm run build && npm run lint
```

期望：`0 errors`，`0 warnings`（或只有既有警告）。

---

## Task 2：進度條 animated + 經過秒數

**Files:**
- Modify: `frontend/src/components/BackupProgress.tsx`

- [ ] **Step 2.1：加 `useRef` import 與 elapsed 狀態**

將檔案頂部的 React import 改為：

```typescript
import { useState, useEffect, useRef } from 'react';
```

在現有 `useState` 宣告區塊末尾加入：

```typescript
const [elapsedSeconds, setElapsedSeconds] = useState(0);
const startTimeRef = useRef<number | null>(null);
```

- [ ] **Step 2.2：加計時器 useEffect**

在 SSE 的 `useEffect([backupId])` 之後加入：

```typescript
useEffect(() => {
  if (!backupId || done) return;
  if (startTimeRef.current === null) {
    startTimeRef.current = Date.now();
  }
  const timer = setInterval(() => {
    if (startTimeRef.current !== null) {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }
  }, 1000);
  return () => clearInterval(timer);
}, [backupId, done]);
```

- [ ] **Step 2.3：加 `formatElapsed` helper 與 `isIndeterminate` 判斷**

在 `if (!backupId)` 之前加入：

```typescript
const formatElapsed = (s: number) => {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

// 35–90% 是 SFTP 下載或 SMB 上傳的長任務範圍，顯示不確定進度動畫
const isIndeterminate = !done && percent >= 35 && percent < 90;
```

- [ ] **Step 2.4：更新進度條 div 為動畫版本**

找到現有的進度條內層 `<div style={{ height: '100%', width: ...` 並整段替換為：

```tsx
<>
  <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
  <div
    style={{
      height: '100%',
      width: `${percent}%`,
      background: backupFailed
        ? 'var(--color-error-text)'
        : percent >= 100
          ? 'var(--color-success)'
          : 'var(--color-primary)',
      transition: isIndeterminate ? 'none' : 'width 0.3s ease',
      backgroundImage: isIndeterminate
        ? 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)'
        : 'none',
      backgroundSize: isIndeterminate ? '200% 100%' : 'auto',
      animation: isIndeterminate ? 'shimmer 1.5s linear infinite' : 'none',
    }}
  />
</>
```

- [ ] **Step 2.5：在進度區塊下方顯示經過秒數**

在顯示 `currentMessage` 的 `<p>` 標籤之後加入：

```tsx
{!done && backupId && (
  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
    已經過 {formatElapsed(elapsedSeconds)}
  </p>
)}
```

- [ ] **Step 2.6：Build & lint**

```bash
cd frontend && npm run build && npm run lint
```

期望：TypeScript `tsc -b` 無錯誤。

---

## Task 3a：前端記住 backupId，自動重連

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/BackupProgress.tsx`

- [ ] **Step 3a.1：App.tsx — mount 時恢復 backupId**

在 `App.tsx` 頂部確保有 `useEffect` import（若無則加入）：

```typescript
import { useState, useEffect } from 'react';
```

在 `function App()` 內，`const [step, ...` 等 useState 之後加入：

```typescript
useEffect(() => {
  const savedId = sessionStorage.getItem('finereport-backup-id');
  if (savedId) {
    setBackupId(savedId);
    setStep('backup');
  }
}, []);
```

- [ ] **Step 3a.2：App.tsx — `onBackupStart` 寫入 sessionStorage**

將現有的 `onBackupStart` 改為：

```typescript
const onBackupStart = (id: string) => {
  sessionStorage.setItem('finereport-backup-id', id);
  setBackupId(id);
};
```

- [ ] **Step 3a.3：BackupProgress.tsx — SSE done 時清除 sessionStorage**

在 SSE 的 `done` 事件處理器第一行加入 `sessionStorage.removeItem`：

```typescript
es.addEventListener('done', (e: MessageEvent) => {
  sessionStorage.removeItem('finereport-backup-id');  // ← 加這行
  try {
    // ... 原有 done 處理邏輯不變 ...
  }
});
```

- [ ] **Step 3a.4：Build & lint**

```bash
cd frontend && npm run build && npm run lint
```

---

## Task 3b：報告必產生＋完成度＋失敗也寫 NAS

**Files:**
- Modify: `backend/src/services/backupService.ts`
- Modify: `backend/src/services/backupExecutor.ts`

### 設計說明

- 在 `BackupOptions` 新增 `onReport` 回呼，讓 executor 接收報告內容（成功或失敗）。
- `runBackup` 改為 `Promise<void>`，不再 return 字串。
- 在 `catch` 區塊：產生失敗報告 → 呼叫 `onReport` → 嘗試寫入 NAS → rethrow。
- `backupDestPath` 移至 outer scope 以便 catch 可存取。
- `generateReport` 新增 `sourceResults` 與 `overallError` 參數，輸出完成度區塊。

- [ ] **Step 3b.1：加 `SourceResult` interface 並更新 `BackupOptions`**

在 `interface BackupSource` 之後加入：

```typescript
interface SourceResult {
  id: string;
  label: string;
  success: boolean;
  error?: string;
}
```

在 `interface BackupOptions` 末尾加入 `onReport` 欄位：

```typescript
onReport: (report: string, isFailure: boolean) => void;
```

- [ ] **Step 3b.2：`runBackup` — 加外層 `let` 變數並初始化 `sourceResults`**

在 `runBackup` 函式體最前方（`const log = ...` 之前）加入：

```typescript
const sourceResults: SourceResult[] = sources.map((src) => ({
  id: src.id,
  label: src.label || src.id,
  success: false,
}));
let backupDestPath = '';
let overallError: Error | null = null;
```

- [ ] **Step 3b.3：將 `const backupDestPath` 改為賦值**

找到現有的：
```typescript
const backupDestPath = nasMounted
  ? path.join(actualMountPath, nasPathClean, backupMonth)
  : path.join(tempRoot, 'staging');
```

改為（使用已宣告的 `let backupDestPath`）：
```typescript
backupDestPath = nasMounted
  ? path.join(actualMountPath, nasPathClean, backupMonth)
  : path.join(tempRoot, 'staging');
```

- [ ] **Step 3b.4：在下載迴圈中標記 `sourceResults`**

在現有的 SFTP 下載迴圈（Task 1 修改後的版本），找到 `completed++` 之前（每個來源下載完成後），加入：

```typescript
const resultIdx = sourceResults.findIndex((r) => r.id === src.id);
if (resultIdx !== -1) sourceResults[resultIdx].success = true;
```

- [ ] **Step 3b.5：更新 `generateReport` 函式簽名與內容**

更新函式簽名：

```typescript
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
): string
```

在函式體內，`const endTime = new Date();` 之後，加入完成度計算：

```typescript
const completedCount = sourceResults.filter((r) => r.success).length;
const totalCount = sourceResults.length;
const completionSection = `## 完成度

已完成 ${completedCount} / 共 ${totalCount} 個來源

| 來源 | 狀態 |
|------|------|
${sourceResults.map((r) => `| ${r.label} | ${r.success ? '✅ 成功' : `❌ 未完成${r.error ? `（${r.error}）` : ''}`} |`).join('\n')}
`;
```

更新函式 return 值的標題（在 `return` 模板字串中）：
- 如果 `overallError` 不為 null，標題改為 `# FineReport 備份報告（失敗）\n\n失敗原因：${overallError.message}\n`
- 在「## 備份來源」之後插入 `${completionSection}`

最終 return 結構：

```typescript
const isFailure = overallError !== null;
const titleSection = isFailure
  ? `# FineReport 備份報告（失敗）\n\n失敗原因：${overallError!.message}\n`
  : `# FineReport 備份報告\n`;

return `${titleSection}
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
${topLevelDirs.map((d) => `├── ${d}/`).join('\n')}
\`\`\`

## 備份來源

| 項目 | 來源路徑 | 目的路徑 |
|------|----------|----------|
${sources.map((s) => `| ${s.label || s.id} | ${s.sourcePath} | ${resolveDestPath(s)} |`).join('\n')}

---
${deleteSection}
`;
```

- [ ] **Step 3b.6：在 `try` 末尾呼叫 `generateReport` 時加新參數**

找到現有的 `generateReport(backupId, ...)` 呼叫（在 `onProgress(90, '產生報告')` 附近），更新為傳入新參數：

```typescript
const report = generateReport(
  backupId, backupMonth, backupDestPathRel, sources, startTime,
  deleteOldBackup, retentionMonths, deleteActions,
  sourceResults, null  // ← 新增：sourceResults, overallError
);
```

在 `onProgress(100, '備份完成')` 之後加入：
```typescript
options.onReport(report, false);
```

移除末尾的 `return report;`（改為 `return;`，因為函式現在是 `Promise<void>`）。

- [ ] **Step 3b.7：加 `catch` 區塊生成失敗報告並嘗試寫 NAS**

在現有 `try { ... } finally { ... }` 的中間插入 `catch`，使結構變為 `try/catch/finally`：

```typescript
} catch (e) {
  overallError = e as Error;
  const failReport = generateReport(
    backupId, backupMonth, backupDestPathRel, sources, startTime,
    deleteOldBackup, retentionMonths, [],
    sourceResults, overallError
  );
  options.onReport(failReport, true);
  // 嘗試將失敗報告寫入 NAS（不影響原始錯誤的拋出）
  try {
    if (nasMounted && backupDestPath) {
      fs.mkdirSync(backupDestPath, { recursive: true });
      fs.writeFileSync(path.join(backupDestPath, '備份報告.md'), failReport, 'utf8');
      log('寫入失敗報告 (NAS)', path.join(backupDestPath, '備份報告.md'));
    } else if (useSmbclientFallback && backupDestPath) {
      const reportDir = path.join(tempRoot, 'report');
      fs.mkdirSync(reportDir, { recursive: true });
      fs.writeFileSync(path.join(reportDir, '備份報告.md'), failReport, 'utf8');
      await ensureNasPath(nas, backupDestPathRel);
      await uploadDirViaSmbclient(nas, backupDestPathRel, reportDir, undefined, log);
      log('寫入失敗報告 (smbclient)', `${backupDestPathRel}/備份報告.md`);
    }
  } catch (reportErr) {
    console.error('[runBackup] 失敗報告寫入 NAS 失敗:', reportErr);
  }
} finally {
```

並在 `finally` 區塊末尾（現有清理邏輯之後）加入：

```typescript
  if (overallError) throw overallError;
```

- [ ] **Step 3b.8：更新 `runBackup` 回傳型別為 `void`**

將函式簽名改為：

```typescript
export async function runBackup(options: BackupOptions): Promise<void>
```

- [ ] **Step 3b.9：更新 `backupExecutor.ts`**

加入整體逾時常數（在 import 之後）：

```typescript
const OVERALL_BACKUP_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 小時
```

加入 executor 內部的 `withTimeout` 函式（與 `runBackupAsync` 同層）：

```typescript
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`OVERALL_TIMEOUT: 整體備份逾時（${ms / 1000 / 60} 分鐘）`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}
```

更新 `runBackupAsync` 的 `try` 區塊，改為傳入 `onReport` 並加整體逾時：

```typescript
try {
  await withTimeout(
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
  // runBackup 成功：onReport 已透過回呼呼叫 setReport
} catch (err) {
  const msg = (err as Error).message;
  addProgress(backupId, { step: 'error', percent: 100, message: msg });
  // 失敗報告已由 runBackup 的 catch 區塊透過 onReport 回呼呼叫 setReport
  // 若 session 憑證問題導致 runBackup 未能呼叫 onReport，在此補一個最終保底
  if (!getReport(backupId)) {
    setReport(backupId, `# 備份失敗\n\n${msg}\n\n請檢查憑證與網路連線後重試。\n`);
  }
}
```

移除舊的 `const report = await runBackup(...)` 和 `setReport(backupId, report)` 以及舊 `catch` 中的 `setReport` 呼叫。

- [ ] **Step 3b.10：Build & lint**

```bash
cd backend && npm run build && npm run lint
```

---

## Task 3c：SFTP/整體逾時保護

Task 3c 已整合進 Task 1（per-source `withTimeout`）與 Task 3b（executor 整體 `withTimeout`）中，本任務確認兩個 timeout 常數已定義且正確使用：

- [ ] **Step 3c.1：確認常數存在且值合理**

`backupService.ts` 應有：
```typescript
const SOURCE_DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000; // 5 分鐘
```

`backupExecutor.ts` 應有：
```typescript
const OVERALL_BACKUP_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 小時
```

- [ ] **Step 3c.2：確認 `withTimeout` 包覆 `downloadDir` 與 `downloadDirWithTar`**

在 Task 1 Step 1.6 的 SFTP 迴圈中，`downloadDir` 和 `downloadDirWithTar` 都應被 `withTimeout(..., SOURCE_DOWNLOAD_TIMEOUT_MS, ...)` 包覆。

- [ ] **Step 3c.3：確認 executor 的整體逾時包覆 `runBackup`**

在 Task 3b Step 3b.9 中，`runBackup(...)` 應被 `withTimeout(..., OVERALL_BACKUP_TIMEOUT_MS)` 包覆。

- [ ] **Step 3c.4：最終 Build & lint（前後端）**

```bash
cd backend && npm run build && npm run lint
cd ../frontend && npm run build && npm run lint
```

兩端均應無新增錯誤。

---

## Task 4：文件同步

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `1.docs/FineReport備份工具-備份優化構想.md`

- [ ] **Step 4.1：更新 `README.md` — 備份流程段落**

找到「## 備份執行流程」並更新內容，在步驟 3（SFTP 下載）加入括號說明：

```markdown
## 備份執行流程

1. 以 `mount_smbfs`（macOS）或 `mount -t cifs`（Linux）掛載 NAS；失敗則以 `smbclient` 備援。
2. SSH 連至遠端，以 `sudo cp -R` 複製 FineReport 檔案至遠端暫存路徑。
3. 透過 SFTP 下載至本機（NAS 掛載點或本機暫存目錄）：
   - 若遠端檔案數 > 500（如 `schedule`），改用遠端 `tar czf` 打包 → SFTP 下載單一 `.tgz` → 本機 `tar xzf` 解壓並驗證檔案數，大幅加速大量小檔傳輸。
   - 否則使用 `sftp.downloadDir` 逐檔下載。
   - 每個來源下載逾時 5 分鐘；整體任務逾時 2 小時。
4. 若使用 smbclient 備援：透過 `smbclient put` 上傳至 NAS。
5. 依設定刪除舊備份（保留月數）、產生 Markdown 備份報告。
   - 報告無論成功或失敗都會產生，並寫入 NAS；報告包含完成度（已完成 X / 共 Y 個來源）。

**可靠性說明：**
- 前端備份中重整頁面：`backupId` 保存於 `sessionStorage`，重新整理後自動恢復到備份進度畫面並重連 SSE，直到取得最終報告。
- 任務卡死：逾時後自動產生失敗報告並結束。
```

- [ ] **Step 4.2：更新 `CLAUDE.md` — 備份執行流程**

在「備份執行流程」段落（項目 3）加入 schedule 打包說明，並在末尾加入可靠性機制說明（同 README，保持 CLAUDE.md 口吻即可）。

- [ ] **Step 4.3：更新優化構想文件**

在 `1.docs/FineReport備份工具-備份優化構想.md` 的「4. 優化項目與優先順序」表格中，將項目 1–3c 標記為已完成：

```markdown
| 1 | `schedule` 遠端打包下載 | 大量小檔加速 | P0 ✅ | `backupService.ts` |
| 2 | 進度條 animated + 經過秒數 | 可視性 | P0 ✅ | `BackupProgress.tsx` |
| 3a | 前端記住 `backupId`、自動重連 | 解 A 情境 | P0 ✅ | `App.tsx`、`api/backup.ts` |
| 3b | 報告必產生＋完成度＋失敗也寫 NAS | 可靠性 | P0 ✅ | `backupService.ts`、`backupExecutor.ts` |
| 3c | SFTP／整體逾時保護 | 解 C 情境 | P1 ✅ | `backupService.ts` |
| 4 | 進度／日誌／報告持久化 | 解 B 情境（根治） | **P2（後續里程碑）** | 後端 + 儲存層 |
```

---

## 手動驗證步驟

完成實作後，以下場景應逐一驗證：

1. **schedule 打包加速**：啟動備份，觀察日誌出現「打包下載模式」，且完成後報告顯示 schedule 成功；比較打包前後耗時。
2. **進度動畫與計時**：備份進行 35–90% 時進度條呈現 shimmer 動畫；右方顯示 `mm:ss` 遞增。
3. **重整可重連**：備份啟動後重整頁面，應直接跳至備份進度畫面，SSE 重連後繼續顯示進度與最終報告。
4. **失敗報告寫 NAS**：將 NAS path 改為不存在路徑模擬失敗，備份失敗後 NAS 上應有「備份報告.md」（含失敗原因與完成度）。
5. **逾時保護**：在開發環境將 `SOURCE_DOWNLOAD_TIMEOUT_MS` 暫時改為極小值（如 100ms），驗證逾時後產生失敗報告並送出 SSE `done`。
