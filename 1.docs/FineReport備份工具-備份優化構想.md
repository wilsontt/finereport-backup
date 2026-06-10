# FineReport 備份工具 — 備份優化構想

> 本文件彙整備份流程的已知問題與優化計畫，作為後續實作（PLAN → 詳細設計 → 程式碼）的依據。

---

## 1. 目的

改善備份流程在「大量小檔效能」「進度可視性」「中斷後可靠性」三方面的不足，確保：

- `schedule` 等大量小檔目錄能在合理時間內完成傳送。
- 使用者隨時能看出備份目前的實際狀況（而非畫面像當機）。
- 任何中斷情境（前端重整、後端重啟、任務卡死）都能有明確的結果與報告。

## 2. 範圍

- 後端：`backend/src/services/backupService.ts`、`backend/src/services/backupExecutor.ts`、`backend/src/routes/backup.ts`
- 前端：`frontend/src/App.tsx`、`frontend/src/api/backup.ts`、`frontend/src/components/BackupProgress.tsx`
- 不含：驗證流程（SSH/sudo/NAS/人為驗證）與既有 NAS 掛載／smbclient 備援邏輯（除非報告需寫入 NAS）。

## 3. 現況問題分析

### 3.1 備份內容觀察
1. `mysqldata`、`tomcat` 備份正常。
2. `WEB-INF`：
   - `embed`（finedb 目錄）正常。
   - `schedule`（自動定時執行）**檔案／子目錄數量龐大**，是目前效能瓶頸。
3. `webroot` 正常。

### 3.2 SFTP 下載無進度、效能差
- `sftp.downloadDir` 為單一阻塞呼叫，下載期間 **完全不回報進度**，`schedule` 期間畫面長時間停在約 60%，像當機。
- `downloadDir` 逐檔下載，每個小檔一次往返；`schedule` 動輒數千至上萬個小檔，耗時極長。

### 3.3 中斷情境下的報告問題
| 中斷類型 | 後端任務 | 報告 | 使用者可見 |
|----------|----------|------|-----------|
| A. 前端重整／關分頁 | 繼續執行至完成 | 正常產生（記憶體＋NAS） | **否**：`backupId` 僅存於 React state，重整即遺失 |
| B. 後端程序重啟／崩潰 | 中止 | **消失**：狀態全存記憶體 Map | 否 |
| C. 任務卡死（SFTP 不 resolve） | 永久停住 | **永不產生**：`percent` 到不了 100 | 進度條凍住 |

- 補充：後端 SSE（`/progress/:backupId`）為「重播式」，只要 `backupId` 還在且後端未重啟，重新連線即可補送歷史進度並取得最終報告 → A 情境只差「前端記住 backupId」即可救回。
- 目前失敗報告（`backupExecutor` catch）僅存記憶體，**不寫入 NAS**。
- 目前 SFTP／整體任務 **無逾時保護**。

## 4. 優化項目與優先順序

| # | 項目 | 目標 | 狀態 | 主要檔案 |
|---|------|------|------|----------|
| 1 | `schedule` 遠端打包下載 | 大量小檔加速 | ✅ P0 已完成 | `backupService.ts` |
| 2 | 進度條 animated + 經過秒數 | 可視性 | ✅ P0 已完成 | `BackupProgress.tsx` |
| 3a | 前端記住 `backupId`、自動重連 | 解 A 情境 | ✅ P0 已完成 | `App.tsx`、`BackupProgress.tsx` |
| 3b | 報告必產生＋完成度＋失敗也寫 NAS | 可靠性 | ✅ P0 已完成 | `backupService.ts`、`backupExecutor.ts` |
| 3c | SFTP／整體逾時保護 | 解 C 情境 | ✅ P1 已完成 | `backupService.ts`、`backupExecutor.ts` |
| 4 | 進度／日誌／報告持久化 | 解 B 情境（根治） | P2（後續里程碑） | 後端 + 儲存層 |

## 5. 作業內容（技術設計重點）

### 5.1 項目 1：schedule 遠端打包下載
- 對大量小檔的來源（先針對 `schedule`），改為：
  1. 遠端 `sudo tar czf <staging>/WEB-INF/schedule.tgz -C <staging>/WEB-INF schedule`
  2. SFTP 下載**單一** `schedule.tgz`（可評估 `useFastget`）
  3. 本機解壓至目的目錄，刪除暫存 `.tgz`
- 可設定門檻（如檔案數 > N）自動切換打包模式，其餘來源維持逐檔。

### 5.2 項目 2：進度條與經過秒數
- 長任務（SFTP 下載／SMB 上傳）改為不確定進度動畫（animated）。
- 以 `startBackup` 起算顯示「已經過 mm:ss」。
- 可選：逐檔進度（監聽 `ssh2-sftp-client` 的 `download` 事件）顯示「已完成 X 個檔案」。

### 5.3 項目 3a：前端記住 backupId
- `startBackup` 成功後寫入 `sessionStorage`（鍵如 `finereport-backup-id`）。
- App 啟動時若偵測到未完成的 `backupId`，直接進入 `backup` 步驟並重連 SSE。
- 任務結束（done）後清除該鍵。

### 5.4 項目 3b：報告必產生
- 以 `try/catch/finally` 確保任何結束路徑都 `setReport`。
- 報告增加「完成度」：`已完成 X / 共 Y 個來源`，逐項標記成功／未完成。
- 失敗報告同步寫入 NAS（掛載點或 smbclient 上傳），即使前端失聯仍有紀錄。

### 5.5 項目 3c：逾時保護
- 為 `sftp.downloadDir` 與整體任務加逾時，逾時 reject → 進失敗報告流程並送 `done`，避免永久卡死。

### 5.6 項目 4：持久化（後續）
- 將 `progressMap`／`logMap`／`reportMap` 落地為檔（如 staging 或 NAS 上 `.jsonl` / `備份報告.md`），後端重啟後可讀回。
- 評估是否引入輕量持久化（檔案即可，暫不需 DB）。

## 6. 驗證方式

- 項目 1：以 `schedule` 實測，比較打包前後總耗時；驗證解壓後檔案數與遠端一致（`find ... -type f | wc -l`）。
- 項目 2：長任務期間畫面有動畫與秒數遞增。
- 項目 3a：備份途中重整頁面，能自動回到進度畫面並接續顯示／取得報告。
- 項目 3b：模擬上傳失敗，確認記憶體與 NAS 皆有失敗報告且含完成度與作業日誌。
- 項目 3c：模擬 SFTP 卡住（中斷網路），確認逾時後產生失敗報告並結束。

## 7. 文件影響

- `README.md`：更新備份流程（schedule 打包、報告必產生、可重連）。
- `CLAUDE.md`：標明「報告必產生／可重連／schedule 打包」行為。
- 本文件：實作完成後將各項標記為「已完成」，項目 4 視情況另立里程碑。
