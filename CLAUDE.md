# CLAUDE.md

此檔案提供 Claude Code（claude.ai/code）在操作本專案時的使用指引。

## 專案簡介

FineReport 備份工具 — 用來備份 FineReport 伺服器的網頁工具。使用者透過 SSH（含 sudo）連線，驗證 NAS（SMB）後，系統會透過 SFTP 將 FineReport 相關檔案複製至 NAS。

## 開發指令

### 後端（`backend/`）
```bash
cd backend
npm install
npm run dev          # tsx watch（熱重載）
npm run build        # tsc → dist/
npm start            # node dist/index.js
npm run lint         # eslint src --ext .ts
```

### 前端（`frontend/`）
```bash
cd frontend
npm install
npm run dev          # vite 開發伺服器
npm run build        # tsc -b && vite build
npm run preview      # 預覽正式建置結果
npm run lint         # eslint
```

### Docker
```bash
docker build -f Dockerfile.backend -t finereport-backup-backend .
docker build -f Dockerfile.frontend -t finereport-backup-frontend .
```
- 後端對外埠號為 **3000**；前端（nginx）對外埠號為 **80**
- 前端 Dockerfile 需要 Node **22**（Vite 7 的限制）

## 系統架構

### 後端（`backend/src/`）

以 Express 為基礎的 API 伺服器（`src/index.ts`），路由統一掛載於 `/api/backup`（`routes/backup.ts`）。

**多步驟驗證流程** — 所有狀態以 `X-Session-Id` 標頭為索引鍵，保存於記憶體中的 Session 儲存庫（`lib/sessionStore.ts`）：
1. `POST /verify-ssh` → 儲存 SSH 憑證
2. `POST /verify-sudo` → 透過 SSH Session 驗證 sudo 密碼
3. `POST /verify-nas` → 儲存 NAS（SMB）憑證
4. `POST /verify-human`，`action: "get"` → 產生 4 位數驗證碼；`action: "verify"` → 標記 Session 已通過人工驗證

所有變更資料或啟動備份的路由，均需 `isHumanVerified(sessionId) === true`。

**備份執行流程**（`services/backupService.ts` + `services/backupExecutor.ts`）：
1. 以 `mount_smbfs`（macOS）或 `mount -t cifs`（Linux）掛載 NAS；若掛載失敗，改用 `smbclient` 作為備援
2. SSH 連至遠端 → 以 sudo 執行 `cp -R`，將檔案複製至遠端暫存路徑
3. 透過 SFTP 從遠端暫存路徑下載至本機（NAS 掛載點或暫存目錄）
4. 若使用 smbclient 備援：透過 `smbclient put` 從暫存目錄上傳至 NAS
5. 對暫存目錄執行 `chown`、依設定刪除舊備份、產生 Markdown 備份報告

**SSE 進度串流**：`GET /progress/:backupId` 透過 Server-Sent Events 推送 `event: progress` 與 `event: done`。備份 ID 為一組 UUID，在非同步工作啟動前即已建立。

**主要服務檔案：**
- `services/sshService.ts` — SSH 連線、`execWithSudo`、`listRemoteDirectory`、`verifySudo`
- `services/nasService.ts` — `mountNas` / `unmountNas`、`verifyNas`、`listNasDirectory`、`createNasDirectory`（目錄操作使用 `smbclient`）
- `services/backupService.ts` — `runBackup`（整體備份流程的協調入口）
- `services/backupExecutor.ts` — 記憶體內的進度、日誌與報告映射；`runBackupAsync` 包裝函式
- `schemas/backup.ts` — 所有請求本體的 Zod 驗證 Schema
- `lib/response.ts` — `success()` / `error()` 回應輔助函式

**後端主機的系統相依套件：** `smbclient`（用於 NAS 目錄操作與備援上傳）、`mount_smbfs` 或 `mount -t cifs`（用於掛載 NAS）。

### 前端（`frontend/src/`）

以 Vite 7 + Tailwind CSS 4 建置的 React + TypeScript 單頁應用程式（SPA）。

**4 步驟精靈流程**（狀態集中於 `App.tsx`）：
| 步驟 | 元件 | 用途 |
|------|------|------|
| `credentials` | `CredentialForm` | 填寫 SSH、sudo 及 NAS 憑證 |
| `human` | `HumanVerification` | 輸入 4 位數驗證碼 |
| `paths` | `PathSelector` | 選擇遠端來源路徑與 NAS 目的地 |
| `backup` | `BackupProgress` | 啟動備份，顯示 SSE 進度串流 |

**API 層**（`api/backup.ts`）：所有呼叫均透過單一 `request()` 輔助函式發出，逾時設定為 25 秒，並附帶 `X-Session-Id` 標頭。Session ID 儲存於 `sessionStorage`。基礎 URL 為 `/finereport-backup/api/backup`（正式環境由 nginx 代理轉發）。

**預設備份來源**定義於 `backend/src/constants/defaultBackupSources.ts`，由 `GET /api/backup/sources` 提供。`isAbsoluteSource: true` 的來源使用原始 `sourcePath`；其餘來源則相對於 FineReport 的 webroot。

### Session 安全性說明

SSH 密碼、sudo 密碼及 NAS 密碼均以明文形式保存於後端記憶體中，生命週期與程序相同。人工驗證碼的有效期限為 5 分鐘。系統不使用持久化 Session 儲存——重啟伺服器將清除所有 Session 資料。
