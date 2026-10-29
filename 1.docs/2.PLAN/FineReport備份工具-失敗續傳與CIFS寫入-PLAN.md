# 失敗續傳與 CIFS 寫入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修復 CIFS 掛載寫成 0 byte；未核對成功的遠端打包檔不刪；單次作業傳完所有檔再結束（不 fail-fast）；失敗後可同一 Session 只補未成功檔或全部重來；每次備份報告獨立檔名不覆蓋。

**Architecture:** 純函式（報告檔名、resume 略過規則）先單測；`nasService` 補 Linux CIFS 選項；`backupService` 改 stream 寫入＋單檔 smbclient 備援、延後 `rm` 遠端產物、讀寫 manifest、依 `mode` 分支；路由與前端失敗畫面接 `mode`／`last-job`。

**Tech Stack:** Node.js / TypeScript、`node:stream/promises`、`node:test`、Express、React

**設計規格：** [FineReport備份工具-失敗續傳與CIFS寫入-設計.md](../3.實作/FineReport備份工具-失敗續傳與CIFS寫入-設計.md)

## Global Constraints

- TypeScript 禁用 `any`；一律 async/await
- 前端 UUID 維持 `crypto.randomUUID` 能力檢查 + `getRandomValues` fallback（本功能若新增 UUID 必須遵守）
- 文件與 UI 文案使用繁體中文
- 勿在 commit／manifest／日誌寫入密碼
- `NAS_CHUNK_BYTES` 維持 `30 * 1024 * 1024`（本版不下修）
- 單次執行 **傳完所有檔再結束**：單一檔重試失敗後繼續下一檔／下一來源；整份結束後若有任一失敗才寫失敗報告。`mode=resume` 只補 `nasVerified === false` 的檔，同樣傳完待補檔再結束
- 使用者未要求前不自動 git commit

---

## File Map

| 檔案 | 職責 |
|------|------|
| `backend/src/lib/backupReportName.ts` | 報告檔名（含失敗後綴、時分秒） |
| `backend/src/lib/backupReportName.test.ts` | 檔名單測 |
| `backend/src/lib/backupResume.ts` | resume 略過／路徑一致性純函式 |
| `backend/src/lib/backupResume.test.ts` | 略過規則單測 |
| `backend/src/lib/backupJobManifest.ts` | manifest 型別與 parse／serialize |
| `backend/src/lib/backupJobManifest.test.ts` | 拒絕含密碼欄位、schemaVersion |
| `backend/src/lib/cifsCopy.ts` | stream 複製到目的檔 + fsync |
| `backend/src/lib/cifsCopy.test.ts` | 本機暫存目錄複製 size 核對 |
| `backend/src/services/nasService.ts` | Linux mount `-o` 追加 vers／cache／noserverino |
| `backend/src/services/backupService.ts` | 刪檔時機、deliverLocalToNas 備援、mode、manifest、報告檔名 |
| `backend/src/lib/sessionStore.ts` | `lastJob` |
| `backend/src/routes/backup.ts` | `mode`、`GET /last-job` |
| `frontend/src/api/backup.ts` | start 帶 mode、getLastJob |
| `frontend/src/App.tsx` | 失敗後不強制回 credentials；還原 last-job |
| `frontend/src/components/BackupProgress.tsx` | 續傳／全部重來按鈕 |
| `README.md`、`CLAUDE.md`、`1.docs/2.PLAN/FineReport備份工具-備份優化構想.md` | 文件同步 |

---

## Task 1: 報告檔名純函式

**Files:**
- Create: `backend/src/lib/backupReportName.ts`
- Create: `backend/src/lib/backupReportName.test.ts`

**Interfaces:**
- Produces: `formatTaipeiCompactDate(d: Date): string` → `yyyyMMdd`
- Produces: `formatTaipeiCompactTime(d: Date): string` → `HHmmss`
- Produces: `buildBackupReportFileName(d: Date, backupMonth: string, failed: boolean): string`

- [ ] 實作 `backupReportName.ts`（時區 `Asia/Taipei`，`Intl.DateTimeFormat` `en-CA` + `hour12: false`，與現有 `formatTaipeiDate` 相同風格）

```ts
export function buildBackupReportFileName(
  d: Date,
  backupMonth: string,
  failed: boolean
): string {
  const date = formatTaipeiCompactDate(d);
  const time = formatTaipeiCompactTime(d);
  const suffix = failed ? '_失敗' : '';
  return `${date}_${time}_${backupMonth}_FineReport備份報告${suffix}.md`;
}
```

- [ ] 測試：固定一個 `Date`（用已知 UTC instant），斷言字串符合 `^\d{8}_\d{6}_\d{6}_FineReport備份報告(_失敗)?\.md$`；`failed === true` 含 `_失敗`；`false` 不含。

- [ ] 執行：`cd backend && npm test`

Expected: PASS

---

## Task 2: manifest 型別與 resume 純函式

**Files:**
- Create: `backend/src/lib/backupJobManifest.ts`
- Create: `backend/src/lib/backupJobManifest.test.ts`
- Create: `backend/src/lib/backupResume.ts`
- Create: `backend/src/lib/backupResume.test.ts`

**Interfaces:**
- Produces 型別（匯出，後續 Task 必須同名）：

```ts
export type BackupRunMode = 'full' | 'resume';
export type JobStatus = 'running' | 'success' | 'failed';

export interface ArtifactRecord {
  fileName: string;
  size: number;
  remotePath: string;
  nasRelPath: string;
  nasVerified: boolean;
}

export interface SourceRecord {
  id: string;
  label: string;
  destPath: string;
  sourcePath: string;
  chunked: boolean;
  status: 'pending' | 'packed' | 'success' | 'failed' | 'skipped';
  artifacts: ArtifactRecord[];
}

export interface BackupJobManifest {
  schemaVersion: 1;
  backupId: string;
  mode: BackupRunMode;
  status: JobStatus;
  stagingPath: string;
  nasPath: string;
  backupMonth: string;
  startedAt: string;
  endedAt: string | null;
  reportFileName: string | null;
  previousReportFileName: string | null;
  sources: SourceRecord[];
}
```

- Produces: `parseJobManifest(raw: string): BackupJobManifest`（JSON.parse 後檢查 `schemaVersion === 1`、`sources` 為陣列；缺欄位 throw）
- Produces: `serializeJobManifest(m: BackupJobManifest): string`（`JSON.stringify` pretty 2 空格）
- Produces: `assertResumeCompatible(manifest: BackupJobManifest, stagingPath: string, nasPath: string, sourceIds: string[]): void`
  - staging／nas 必須全等（字串 trim 後）
  - `sourceIds` 排序後與 manifest 的 `sources[].id` 全等，否則 throw 訊息含「來源清單與上次不同」
- Produces: `shouldSkipArtifact(a: ArtifactRecord, nasSize: number | null): boolean`
  - `nasVerified && nasSize === a.size && nasSize > 0`
- Produces: `shouldReuseRemoteArchive(a: ArtifactRecord, remoteSize: number | null): boolean`
  - `!a.nasVerified && remoteSize === a.size && remoteSize > 0`

- [ ] 測試 parse 缺 `schemaVersion` 要 throw
- [ ] 測試 `shouldSkipArtifact`：未核對、size 0、size 不符 → false；核對且 size 相符 → true
- [ ] 測試 `assertResumeCompatible`：路徑不同、id 集合不同要 throw
- [ ] `cd backend && npm test`

---

## Task 3: stream 複製（禁止 copyFile 寫 NAS）

**Files:**
- Create: `backend/src/lib/cifsCopy.ts`
- Create: `backend/src/lib/cifsCopy.test.ts`

**Interfaces:**
- Produces: `async function copyFileViaStream(srcPath: string, destPath: string): Promise<void>`
  - `fs.mkdirSync(dirname(dest), { recursive: true })`
  - `pipeline(fs.createReadStream(srcPath), fs.createWriteStream(destPath))`
  - 關閉後對 dest `openSync('r+')` + `fsyncSync` + `closeSync`
- 檔案內註解註明：**禁止**對 CIFS／NAS 掛載點使用 `fs.copyFile`／`copyFileSync`

- [ ] 測試：暫存目錄寫入隨機 64KiB，複製後 `stat.size` 相等且內容 `Buffer.equals`
- [ ] `cd backend && npm test`

---

## Task 4: Linux CIFS mount 選項

**Files:**
- Modify: `backend/src/services/nasService.ts`（`mountNas` Linux 分支，現約 `opts = username=...,password=...,domain=...`）

- [ ] Linux `-o` 改為：

```ts
const opts = [
  `username=${username}`,
  `password=${password}`,
  `domain=${domain}`,
  'vers=3.0',
  'cache=strict',
  'noserverino',
].join(',');
```

- [ ] Darwin `mount_smbfs` 分支不改這些鍵
- [ ] 作業日誌不印出含 password 的完整 `-o` 字串（若現有 log 會印 opts，改成只記 `vers=3.0,cache=strict,noserverino`）

---

## Task 5: backupService — 寫入、刪檔、報告檔名、manifest、mode

**Files:**
- Modify: `backend/src/services/backupService.ts`
- Modify: `backend/src/services/backupExecutor.ts`（`runBackup` options 轉傳 `mode`、結束時把 manifest 摘要寫入 session）

**Interfaces:**
- Consumes: Task 1–3 函式與型別
- `BackupOptions` 新增 `mode: BackupRunMode`（預設 `'full'`）
- `downloadArtifactToLocal`：**刪除**成功後的 `rm -f` 遠端；改由呼叫端在 NAS 核對成功後刪
- `deliverLocalToNas`：掛載分支改 `copyFileViaStream`；`assertLocalSize` 失敗則同一 `withAttempts` 迴圈重試；三次後若仍失敗且原本 `useSmbclient === false`，再以 smbclient 對該檔 `withAttempts` 3 次；log 標「NAS 掛載寫入失敗，改 smbclient put {fileName}」
- 報告檔名改呼叫 `buildBackupReportFileName`；`generateReport` 成功時若 `previousReportFileName` 有值，在目錄結構前加一行 `先前失敗報告：...`
- 階段一結束與每個產物 NAS 核對變更後：把 manifest 寫到遠端 `{stagingPath}/.finereport-backup-job.json`（sudo tee／或先寫本機再 sftp put）以及 NAS 目的目錄同名檔
- **取消 fail-fast：** 階段一某來源打包失敗 → 記錄該來源失敗，繼續後續來源打包。階段二某檔 SFTP／NAS 失敗（含 3 次 stream + smbclient 仍失敗）→ 該檔 `nasVerified=false`、來源可為 failed（部分檔已成功則 `uploadedCount` < `partCount`），**不得 throw 中止迴圈、不得 `markRemainingSkipped`**。時間軸寫「上傳失敗：…」但**禁止**「中止後續來源」。全部檔嘗試完後，若有任一失敗才進失敗報告；全部成功才成功報告。
- `mode === 'resume'`：
  1. 從遠端讀 manifest，`assertResumeCompatible`
  2. 對 `nasVerified` 且 NAS size 仍正確的檔：略過，不 `cp`、不 `tar`、不 `clearDestinationArtifacts` 該來源已成功檔
  3. 只傳未核對檔；遠端產物 size 相符則跳過 tar
  4. 失敗檔若 NAS 為 0 byte：刪該目的檔後重傳
  5. 補傳時同樣不因單一檔失敗而中止其餘待補檔
- `mode === 'full'`：維持 `clearDestinationArtifacts`；`cp`+`tar` 全跑；上傳同樣傳完所有檔再結束
- 整份成功：依 manifest 刪所有仍存在的 `remotePath`
- 搜尋本檔確認沒有對 NAS 路徑呼叫 `copyFileSync`／`copyFile(`
- 刪除或停用 `markRemainingSkipped` 在「前一來源傳輸失敗」路徑的呼叫（打包／傳輸迴圈皆然；整體逾時／行程崩潰除外）

**Session：** `sessionStore.ts` 新增：

```ts
lastJob?: BackupJobManifest;
```

`setLastJob`／`getLastJob`。`runBackup` 的 `finally`（在寫完報告檔名後）更新 `status`／`endedAt`／`reportFileName` 並 `setLastJob`。

- [ ] `cd backend && npm run lint && npm run build && npm test`

---

## Task 6: API

**Files:**
- Modify: `backend/src/routes/backup.ts`
- Modify: `backend/src/schemas/backup.ts`（可選：把 `start` 改 Zod；若維持手寫 schema 則加 `mode`）

- [ ] `POST /start` body 增加 `mode`：缺省或 `'full'`／`'resume'`；其他值 `400`
- [ ] `resume` 時若 `getLastJob(sessionId)` 為空或 `status !== 'failed'` → `400`「沒有可續傳的失敗作業」
- [ ] `GET /last-job`：需 `isHumanVerified`；回 `{ job: BackupJobManifest | null }`（無則 `job: null`，HTTP 200）
- [ ] `runBackupAsync` 傳入 `mode`

- [ ] `cd backend && npm run lint && npm run build`

---

## Task 7: 前端失敗後續傳／全部重來

**Files:**
- Modify: `frontend/src/api/backup.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/BackupProgress.tsx`

**Interfaces:**
- `startBackup` body 增加 `mode?: 'full' | 'resume'`
- `getLastJob()` → `GET /last-job`
- `BackupProgress` props 增加：
  - `onRetryResume: () => void`
  - `onRetryFull: () => void`
  - 或自行再呼叫 `startBackup`（需能拿到 `stagingPath`／`sources`／`nasPath`／`deleteOldBackup`）

行為：

1. `done && backupFailed`：報告區塊下方兩個按鈕「從失敗處續傳」「全部重來」
2. 續傳：`mode: 'resume'`，**不要**要求使用者再按「建立暫存目錄」；沿用此次畫面已有的 `stagingPath`
3. 全部重來：重置進度 UI（`backupId` 清掉或新一輪），`mode: 'full'`，`stagingCreated` 維持 true（同一暫存路徑）
4. 點擊後新 `backupId`、重連 SSE（沿用現有 `onStart`）
5. `App.tsx`：mount 時除了進行中的 `finereport-backup-id`，若無進行中作業則 `getLastJob`；若 `job.status === 'failed'` 且現在 `step === 'credentials'` 且 session 仍 verified（last-job 非 403），將 `sources`／`nasPath` 從 job 還原並 `setStep('backup')`，讓使用者看到兩按鈕。若 `403` 則維持連線設定、不顯示續傳。
6. 新 UUID 若有，必須走現有 `generateUUID` fallback，不得直接 `crypto.randomUUID()`

- [ ] `cd frontend && npm run lint && npm run build`

無瀏覽器 MCP 時：用 lint/build 作為本 Task 的機械驗證；實作完成總驗證再對失敗畫面做人工／瀏覽器走一遍。

---

## Task 8: 文件同步

**Files:**
- Modify: `README.md`（備份流程、報告檔名、失敗續傳、CIFS 0 byte 對策、大檔 SMB 段）
- Modify: `CLAUDE.md`（流程第 3–5 點、報告檔名、續傳）
- Modify: `1.docs/2.PLAN/FineReport備份工具-備份優化構想.md`（新增項目 6 狀態 ✅）
- Modify: `1.docs/3.實作/FineReport備份工具-失敗續傳與CIFS寫入-設計.md` 狀態徽章改「已實作」
- Modify: `1.docs/3.實作/FineReport備份工具-NAS分卷上傳設計.md` 風險「NAS 仍寫成 0 byte」緩解改為 stream + 單檔 smbclient

README 必寫：

- 報告檔名格式含時分秒與 `_失敗`
- 遠端產物：NAS 核對成功才刪
- 失敗後兩按鈕；後端重啟須重驗
- 單一檔失敗不中止後續檔；報告無「前一來源傳輸失敗，未執行」
- 掛載寫入改 stream；0 byte 改 put

---

## Task 9: 建置與驗收清單

- [ ] `cd backend && npm test && npm run lint && npm run build`
- [ ] `cd frontend && npm run lint && npm run build`
- [ ] 全文搜尋 `copyFileSync`／`fs.copyFile(`：後端不得對 NAS／掛載路徑使用（測試用本機 temp 除外）
- [ ] 對齊設計規格第 2 節非目標：沒有做 DB 持久化、沒有改 30MB 閾值

**運維驗收（文字，實作後執行）：**

1. 模擬掛載寫入 0 byte：該檔應改 put 或標失敗且遠端 `.tgz` 仍在；**後面來源仍須上傳**，報告不得出現「前一來源傳輸失敗，未執行」。
2. 失敗報告與成功報告同日不同秒，NAS 上兩份 `.md` 並存。
3. 失敗畫面按續傳：已成功的 `webroot/jar/*` 不被刪掉重傳；只補未核對檔。
4. 全部重來：該來源目的路徑舊 `.tgz` 仍會先清再傳；舊失敗報告檔仍在。

---

## 驗收標準

1. Linux CIFS 掛載選項含 `vers=3.0,cache=strict,noserverino`。
2. 寫入掛載點不走 `copyFile`；0 byte／size 不符會重試再 smbclient put。
3. SFTP 成功不刪遠端；NAS 核對成功才刪該遠端產物。
4. 單一檔失敗不中止後續檔／來源；整份結束後才寫一份報告。
5. 失敗 UI 可續傳（只補未成功檔）／全部重來，不重走 SSH／sudo／NAS／4 碼（Session 仍在時）。
6. 同日兩次報告檔名不同，互不覆蓋。
7. README／CLAUDE／優化構想已更新。

---

## 實作啟動條件

**請使用者確認本 PLAN 與設計文件後**，再指示「依 PLAN 實作」。確認前不改應用程式碼。
