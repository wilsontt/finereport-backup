# NAS 分卷上傳 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 遠端打包後若 `.tgz` > 30MB，一律拆成 30MB 分卷再下載／寫入 NAS（掛載與 smbclient 備援皆適用），並以目的檔大小核對避免誤報成功。

**Architecture:** 在 `backupService.ts` 擴充打包傳輸流程：遠端 `tar czf` → `stat` 大小 → 超標則遠端 `split` → 逐卷 SFTP 至掛載點或 temp → 備援則逐卷 `smbclient put` → 每卷驗證 size。報告與 README 同步說明還原方式。

**Tech Stack:** Node.js / TypeScript、ssh2-sudo exec、ssh2-sftp-client、smbclient、遠端 GNU `split`

**設計規格：** [FineReport備份工具-NAS分卷上傳設計.md](./FineReport備份工具-NAS分卷上傳設計.md)

## Global Constraints

- `NAS_CHUNK_BYTES = 30 * 1024 * 1024`（固定，掛載／備援不分支省略）
- 分卷命名：`{base}.tgz.part` + `-d -a 3` → `.part000`、`.part001`…
- TypeScript 禁用 `any`；async/await
- 文件與 README 使用繁體中文
- 勿在 commit 中放入密碼／憑證

---

## File Map

| 檔案 | 職責 |
|------|------|
| `backend/src/services/backupService.ts` | 分卷／傳輸／驗證／報告 |
| `backend/src/lib/nasChunk.ts`（建議新增） | 純函式：閾值、應否分卷、part 檔名樣式、還原文案（易單測） |
| `backend/src/lib/nasChunk.test.ts`（建議新增） | 上述純函式單元測試 |
| `README.md` | 流程與還原、疑難排解 |
| `1.docs/FineReport備份工具-備份優化構想.md` | 項目列狀態 |

---

## Task 1: 純函式與單元測試

**Files:**
- Create: `backend/src/lib/nasChunk.ts`
- Create: `backend/src/lib/nasChunk.test.ts`（若專案尚無 test runner，改以可匯出函式 + 最小 `node --test`／或先略過測試改 Task 註記；優先檢查 `backend/package.json` scripts）

- [x] 確認 `backend/package.json` 是否已有測試指令；若無，使用 Node 內建 `node --test` 或補上最小測試腳本
- [x] 實作並匯出：
  - `NAS_CHUNK_BYTES`
  - `shouldChunkArchive(sizeBytes: number): boolean`
  - `partFilePrefix(tgzPathOrName: string): string` → e.g. `jar.tgz.part`
  - `formatRestoreHint(baseTgzName: string): string`
- [x] 撰寫測試：0、30MiB 邊界、30MiB+1、命名與還原文案
- [x] 執行測試通過

---

## Task 2: 遠端打包後分卷 + 逐卷下載

**Files:**
- Modify: `backend/src/services/backupService.ts`

- [x] 將 `downloadSourceAsTgz` 重構（或新建 `transferSourceArchive`）為：
  1. 遠端 `tar czf`
  2. 遠端 `stat -c%s`（若失敗再試 `wc -c < file`）取得大小並寫入作業日誌
  3. `size > NAS_CHUNK_BYTES`：
     - `split -b ${NAS_CHUNK_BYTES} -d -a 3 "${remoteTgz}" "${remoteTgz}.part"`
     - `rm -f` 遠端整包 `.tgz`
     - 列出 `*.tgz.part[0-9][0-9][0-9]`（穩定排序）
     - 對每個 part：`fastGet` → 目的路徑（掛載最終目錄或 temp 對應目錄）
     - 比對本機 size 與遠端 size；失敗 throw
     - 刪遠端該 part
  4. 否則：維持單一 `.tgz` 下載（現況）
- [x] 來源級逾時：單卷 5 分鐘；來源總計建議 45 分鐘
- [x] 作業日誌含：遠端分卷、各 part 下載與大小

---

## Task 3: 掛載／備援一律逐卷寫入 NAS

**Files:**
- Modify: `backend/src/services/backupService.ts`

- [x] **掛載成功**：各檔（整包或 part）的 `localPath` 即為掛載點下路徑；下載後 `fsync`（開啟檔案 `fs.openSync` + `fs.fsyncSync`）再 `stat` 確認 size
- [x] **備援**：對每個本地檔呼叫既有 `uploadFileViaSmbclient`；成功後可刪本地暫存
- [x] 禁止「多分卷時只 put 第一個就標成功」；全部 part 完成才 `sourceResults[].success = true`
- [x] 進度 message 顯示 `分卷上傳 ${i+1}/${n}：檔名`

---

## Task 4: 備份報告文案

**Files:**
- Modify: `backend/src/services/backupService.ts`（`generateReport`）

- [x] 擴充 `SourceResult`（或並列結構）記錄實際目的檔列表／是否分卷
- [x] 目錄結構與「目的檔案」欄正確列出 `.tgz` 或 `.tgz.part000`…
- [x] 若任一來源分卷，報告加一節「分卷還原」含 `cat` 範例

---

## Task 5: 文件同步

**Files:**
- Modify: `README.md`
- Modify: `1.docs/FineReport備份工具-備份優化構想.md`
- Modify: `1.docs/FineReport備份工具-NAS分卷上傳設計.md`（狀態改「實作中／已實作」）

- [x] README 備份流程改為：>30MB 遠端 split、逐卷傳、還原指令
- [x] README「大檔 SMB」段補充：已改分卷；仍建議 CIFS 權限
- [x] 優化構想表新增項目「NAS 30MB 分卷上傳」狀態
- [x] 設計文件狀態徽章更新

---

## Task 6: 建置驗證

- [x] `cd backend && npm run lint && npm run build`（及測試若有）
- [x] 以文字驗證清單提供運維：小檔 <30MB 仍單一 `.tgz`；大檔出現 `.part000+`；NAS 檔案 size 非 0

---

## 驗收標準

1. 壓縮後 ≤30MB → NAS 上為單一 `.tgz`，size 正確。  
2. 壓縮後 >30MB（掛載）→ 僅有 `.tgz.part*`，每一卷 ≤30MB 且 NAS size 與日誌一致、非 0。  
3. 同上在 smbclient 備援路徑亦成立。  
4. 任一卷失敗 → 來源未標成功，失敗報告可讀。  
5. README／報告可依指示手動還原。

---

## 實作啟動條件

**請使用者確認本 PLAN 與設計文件後**，再於 Agent 模式指示「依 PLAN 實作」開始改程式。
