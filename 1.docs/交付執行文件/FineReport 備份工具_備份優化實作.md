你是一位資深全端工程師，請在「FineReport 備份工具」專案中，依既有優化構想文件完成一輪備份流程優化。

# 必讀規則與文件（開始前先讀）
- 專案根目錄：/Users/wilson/5.Projects/3.企業入口網站/4.FineReport備份工具
- 先讀 CLAUDE.md（專案架構與指令）、README.md（部署與備份流程）、.cursor/rules/ 下所有規則。
- 計畫主文件：1.docs/FineReport備份工具-備份優化構想.md（本次實作以此為準）。
- 全程使用繁體中文溝通與註解；TypeScript 嚴禁使用 any；採 async/await；命名遵循 camelCase/PascalCase/CONSTANT_CASE；遵守 SOLID/KISS/DRY。
- 安全：嚴禁硬編碼密碼/金鑰；密碼不得寫入任何日誌或報告。
- crypto：若使用 randomUUID 必須有非 Secure Context 的 fallback（見 web-crypto 規則）。

# 背景現況（已確認）
- 後端 backend/src/services/backupService.ts 的 runBackup() 是備份主流程：遠端 sudo cp -R → SFTP 下載 → （掛載失敗時）smbclient 上傳 → 產生報告。
- SFTP 下載使用 sftp.downloadDir（約 backupService.ts 第 305 行），為單一阻塞呼叫、下載期間完全不回報進度；schedule（WEB-INF/schedule）底下有大量小檔，逐檔下載極慢，畫面長時間停在約 60% 像當機。
- 進度與日誌、報告皆存於 backend/src/services/backupExecutor.ts 的記憶體 Map（progressMap/logMap/reportMap），以 backupId 為 key。
- 後端 SSE /progress/:backupId（backend/src/routes/backup.ts）為「重播式」：只要 backupId 還在且後端未重啟，重連即可補送歷史進度並送出 done。
- 前端 backupId 只存在 React state（frontend/src/App.tsx），頁面重整即遺失，導致看不到進行中任務與最終報告。
- 失敗報告目前僅存記憶體、不寫入 NAS；SFTP/整體任務目前無逾時保護。
- ssh2-sftp-client 版本 ^10（backend/package.json），downloadDir 過程會 emit 'download' 事件，可用於逐檔進度。

# 本次實作範圍（P0 + P1，請全部完成）

## 項目 1：schedule 遠端打包下載（加速大量小檔）
- 在 runBackup 的 SFTP 下載迴圈中，對「檔案數龐大」的來源改為打包傳輸：
  1. 遠端以 sudo 執行 tar 打包：tar czf <staging>/<dest>.tgz -C <父目錄> <目錄名>
  2. SFTP 下載單一 .tgz
  3. 本機解壓至目的目錄，完成後刪除本機與遠端暫存 .tgz
- 觸發策略：可用遠端 find <src> -type f | wc -l 取得檔案數，超過門檻（例如 500，定義為 CONSTANT_CASE 常數）才走打包模式；其餘來源維持現行逐檔 downloadDir。
- 需相容兩種目的地：NAS 已掛載（直接寫掛載點）與 smbclient 備援（寫 tempRoot 後再上傳）。打包/解壓邏輯不可破壞既有 smbclient 上傳流程。
- 解壓後須驗證檔案數與遠端一致；不一致則視為失敗。

## 項目 2：進度條 animated + 經過秒數
- 檔案 frontend/src/components/BackupProgress.tsx。
- 長任務（SFTP 下載、SMB 上傳）期間，進度條呈現不確定進度動畫（animated）效果。
- 顯示「已經過 mm:ss」，自開始備份起算，每秒更新；備份結束停止計時。
- 維持現有「作業日誌（最新在最上面、字體較大）」樣式，不要改回小字。

## 項目 3a：前端記住 backupId 並自動重連
- 檔案 frontend/src/App.tsx、frontend/src/api/backup.ts。
- startBackup 成功後，將 backupId 寫入 sessionStorage（鍵名如 finereport-backup-id）。
- App 啟動時若 sessionStorage 有未完成的 backupId，直接進入 backup 步驟並重連 SSE（getProgressStream），補顯示進度並可取得報告。
- 任務結束（SSE done）後清除該鍵。
- 注意：sessionStorage 內已有 finereport-session-id，請沿用同一 session 機制，不要破壞既有驗證流程。

## 項目 3b：報告必產生＋完成度＋失敗也寫 NAS
- 檔案 backend/src/services/backupService.ts、backend/src/services/backupExecutor.ts。
- 確保任何結束路徑（成功/失敗/逾時）都會 setReport，使用 try/catch/finally。
- 報告內容新增「完成度」：已完成 X / 共 Y 個來源，並逐項標記成功／未完成。
- 失敗報告除了存記憶體，也要寫入 NAS（掛載點則寫檔；smbclient 備援則上傳），即使前端失聯仍有紀錄。失敗報告需包含已累積的完整作業日誌（目前 backupExecutor catch 已附日誌，請沿用並確保涵蓋所有失敗路徑）。

## 項目 3c：SFTP／整體逾時保護
- 檔案 backend/src/services/backupService.ts。
- 為 sftp.downloadDir 與整體任務加上合理逾時（定義為常數，例如單一來源下載逾時、整體逾時）；逾時即 reject，進入失敗報告流程並送出 done，避免永久卡死。

# 不在本次範圍
- 項目 4（進度/日誌/報告持久化以對抗後端重啟）本次不實作，僅在構想文件保留為後續里程碑。

# 驗證（完成後務必執行並回報結果）
- 後端：cd backend && npm run build（必須通過）、npm run lint。
- 前端：cd frontend && npm run build（tsc -b 必須通過）、npm run lint。
- 修改過的檔案需通過 lint 無新增錯誤。
- 在回覆中說明：每個項目改了哪些檔、關鍵邏輯、如何手動驗證（含 schedule 打包前後耗時比較、重整頁面可重連、模擬失敗時 NAS 有失敗報告、模擬卡住時逾時產生報告）。

# 文件同步（必做）
- 更新 README.md 備份流程段落（schedule 打包、報告必產生、可重連、逾時）。
- 更新 CLAUDE.md 對應行為說明。
- 更新 1.docs/FineReport備份工具-備份優化構想.md：將已完成項目標記為完成，項目 4 維持為後續里程碑。

# 工作方式
- 先列出實作計畫（todo），逐項完成並自我檢查；不要一次大改難以審查。
- 變更前後保持可編譯；每完成一個項目就 build 驗證。
- 不要提交 git commit，除非我明確要求。