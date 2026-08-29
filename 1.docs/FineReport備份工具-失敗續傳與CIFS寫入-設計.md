# FineReport 備份工具 — 失敗續傳與 CIFS 寫入

![版本](https://img.shields.io/badge/版本-v0.1-blue)
![狀態](https://img.shields.io/badge/狀態-待對齊-yellow)
![文件類型](https://img.shields.io/badge/文件類型-技術設計-blue)

**專案**：FineReport 備份工具  
**版本**：v0.1  
**最後更新**：2026-08-29（已改：傳完所有檔再結束，取消 fail-fast）  
**關聯文件**：[PLAN](./FineReport備份工具-失敗續傳與CIFS寫入-PLAN.md)、[NAS 分卷上傳設計](./FineReport備份工具-NAS分卷上傳設計.md)、[備份優化構想](./FineReport備份工具-備份優化構想.md)、[NAS 掛載設計](./FineReport備份工具-NAS掛載設計.md)

---

## 1. 目的

因應 2026-08-29 實測：前 4 個來源已成功寫入 NAS，第 5 個 `schedule.tgz` 在 CIFS 掛載點被寫成 **0 byte**，後續來源被 fail-fast 中止而沒傳。第二次手動排除已成功來源後能完成。本版改為 **傳完所有檔再結束**，不再因單一檔失敗而中止後面檔案／來源。

本設計規定：

1. **CIFS 掛載寫入不再使用 `fs.copyFileSync`**，改為 stream 複製；核對失敗則該檔改走 `smbclient put`。
2. **遠端打包產物**僅在「該檔已寫入 NAS 且 size 核對通過」後才刪除，失敗時留下供續傳或人工下載。
3. 失敗畫面提供 **從失敗處續傳** 與 **全部重來**，同一 Session 不重走連線／人為驗證。
4. **每次執行一份獨立報告檔**，不得覆蓋先前成功或失敗報告。

Linux CIFS 掛載補上 `vers=3.0,cache=strict,noserverino`。

---

## 2. 範圍

| 項目 | 說明 |
|------|------|
| **變更** | 掛載寫入方式、Linux mount 選項、遠端產物刪除時機、作業清單（manifest）、**取消 fail-fast（傳完所有檔再結束）**、`POST /start` 的 `mode`、失敗後 UI、報告檔名 |
| **不變** | 4 步驟精靈順序、SSH／sudo／NAS／4 碼驗證、分卷閾值 30MB、目的端不解壓 |
| **目標環境** | 開發：macOS `mount_smbfs`；正式：Docker Linux CIFS |

**非目標（本版不做）：**

- 進度／日誌持久化到 DB（優化構想項目 4）
- 後端重啟後免重驗（記憶體 Session 仍會遺失）
- 自動合併 NAS 上的 `.tgz.part*`
- 將分卷閾值從 30MB 下修（stream + smbclient 備援已覆蓋 16–30MB 單檔）

---

## 3. 權責

| 角色 | 權責 |
|------|------|
| `nasService` | Linux CIFS mount 選項；既有 smbclient put 供單檔備援 |
| `backupService` | stream 寫入、NAS 核對、0 byte 改 put、遠端刪檔時機、resume／full 流程、報告檔名、manifest 讀寫 |
| 備份報告 | 每次獨立檔名；成功報告可註記先前失敗報告檔名 |
| 前端 `BackupProgress` | 失敗後兩個按鈕；續傳／重跑不重填憑證 |
| 運維／使用者 | 後端重啟後須重走驗證；可依報告路徑從 FineReport 暫存手動下載殘留 `.tgz`／分卷 |

---

## 4. 名詞解釋

| 名詞 | 定義 |
|------|------|
| **作業清單（manifest）** | JSON，記錄本次（或上次未完成）各來源產物路徑、size、NAS 是否已核對成功。**不含密碼**。 |
| **mode=`full`** | 全部重來：重新 `cp`／`tar`／`split`，上傳前仍清該來源目的路徑舊 `.tgz`／分卷 |
| **mode=`resume`** | 只補傳尚未 NAS 核對成功的檔：已成功檔略過；遠端仍有產物則跳過該來源的 `tar`／`split`；未打包者才重壓 |
| **傳完再結束** | 單一檔（含重試與 smbclient 備援）仍失敗時，**不中止**同來源剩餘分卷、也不中止後續來源；全部嘗試完才寫報告 |
| **NAS 核對成功** | 目的檔 `stat.size === expectedSize` 且 `size > 0` |
| **單檔 SMB 備援** | 掛載 `copy` 核對失敗（含 0 byte）後，對**該檔**改 `smbclient put` 再核對；不是整份作業改備援 |

---

## 5. 作業內容

### 5.1 現況問題

```
SFTP 成功 → 立刻 rm 遠端 .tgz／part
掛載：fs.copyFileSync（Linux 可能走 copy_file_range → CIFS 寫成 0 byte）
單次失敗 → 後面來源全部 skipped（本版取消）
報告檔名僅 yyyyMMdd_備份月_… → 同一天第二次覆蓋
失敗畫面無按鈕 → 重整後精靈回到連線設定
```

實測錯誤原文：`NAS 寫入核對 schedule.tgz 大小為 0`（本機暫存已核對通過）。

### 5.2 目標流程

```
階段一：cp（resume 時略過已成功來源）→ tar／split（遠端已有完整產物則略過）
        → 寫入／更新 manifest（遠端暫存 + NAS 目的目錄各一份）

階段二：逐檔（不因失敗中止迴圈）
  若 NAS 已核對成功 → 略過
  否則 SFTP → 本機暫存核對
  → 掛載：stream 複製 + fsync + stat
     失敗（含 0 byte）→ 最多 3 次 stream 重試
     → 仍失敗 → smbclient put 該檔 + 核對
  → 該檔仍失敗：記錄錯誤、該來源可標失敗／部分失敗，**繼續下一檔／下一來源**
  → NAS 核對成功才 rm 遠端該產物與本機暫存
  → 更新 manifest

全部來源的全部檔都嘗試完後才結束
結束：寫獨立檔名之 Markdown 報告（任一檔失敗 → 整份作業失敗報告；全部成功 → 成功報告）
失敗 UI：〔從失敗處續傳〕〔全部重來〕（同一 Session，不重驗）
```

**禁止**再呼叫「中止後續來源／前一來源傳輸失敗，未執行」。報告完成度中不應再出現因前一檔失敗而產生的「未執行」，只應有：成功、失敗（含該來源部分檔失敗）、或打包本身失敗（該來源無產物可傳）。

階段一打包：某一來源 `tar`／`split` 失敗時，該來源標失敗並記錄原因，**仍繼續打包後續來源**，再進入階段二（只傳已有產物的來源）。

### 5.3 CIFS 寫入

| 項目 | 規定 |
|------|------|
| 禁止 | `fs.copyFile`／`copyFileSync` 寫入掛載點 |
| 改用 | `stream/promises.pipeline(createReadStream, createWriteStream)`，關閉後 `fsync` 再 `stat` |
| 備援 | 同一 `deliverLocalToNas`：掛載路徑連續失敗後，該檔 `useSmbclient=true` 再試最多 3 次 |
| Linux mount `-o` | 既有 `username,password,domain` **加上** `vers=3.0,cache=strict,noserverino`（macOS `mount_smbfs` 不改此組） |

### 5.4 遠端產物生命週期

| 時機 | 遠端 `.tgz`／`.part*` |
|------|----------------------|
| 分卷成功後 | 可刪遠端**整包** `.tgz`（已有 part，與現況相同） |
| SFTP 成功 | **不刪** |
| 該檔 NAS 核對成功 | **刪該檔**遠端產物 |
| 整份成功 | 再掃 manifest，刪任何殘留產物 |
| 整份失敗 | 未核對成功的遠端產物保留；報告寫明遠端路徑 |

### 5.5 作業清單（manifest）

檔名：`.finereport-backup-job.json`  
位置：

1. 遠端暫存：`{stagingPath}/.finereport-backup-job.json`（續傳以這份為準，含 `remotePath`）
2. NAS：`{nasPath}/{backupMonth}/.finereport-backup-job.json`（給只看 NAS 的人）

結構（欄位固定，實作不得省略）：

```json
{
  "schemaVersion": 1,
  "backupId": "uuid",
  "mode": "full",
  "status": "failed",
  "stagingPath": "/home/crownap/backup/202608",
  "nasPath": "4.備份記錄/KE/2026/FineReport",
  "backupMonth": "202608",
  "startedAt": "2026-08-29 10:52:14",
  "endedAt": "2026-08-29 10:56:29",
  "reportFileName": "20260829_105629_202608_FineReport備份報告_失敗.md",
  "previousReportFileName": null,
  "sources": [
    {
      "id": "schedule",
      "label": "自動定時執行",
      "destPath": "WEB-INF/schedule",
      "sourcePath": "/opt/tomcat/webapps/webroot/WEB-INF/schedule",
      "chunked": false,
      "status": "failed",
      "artifacts": [
        {
          "fileName": "schedule.tgz",
          "size": 12345,
          "remotePath": "/home/crownap/backup/202608/WEB-INF/schedule.tgz",
          "nasRelPath": "WEB-INF/schedule.tgz",
          "nasVerified": false
        }
      ]
    }
  ]
}
```

禁止寫入 SSH／sudo／NAS 密碼。

Session 記憶體另存 `lastJob` 摘要（同結構或精簡指標），供 `GET /api/backup/last-job`。後端重啟後此 API 回空，前端提示須重走驗證。

### 5.6 續傳／全部重來

`POST /api/backup/start` 新增：

```ts
mode?: 'full' | 'resume'  // 預設 'full'
```

| 條件 | 行為 |
|------|------|
| `resume` 但無 manifest／`lastJob` | `400`，訊息：沒有可續傳的失敗作業 |
| `resume` 但 `stagingPath` 或 `nasPath` 與 manifest 不同 | `400`，請用全部重來或改回原路徑 |
| `resume` 但來源清單（id 集合）與上次不同 | `400` |
| 後端無憑證或未人為驗證 | 與現況相同 `403` |

**整份作業成敗：** 所有檔都嘗試完後，若存在任一 `nasVerified === false` 或任一來源打包失敗 → `status=failed` 並寫失敗報告；全部核對成功 → `status=success`。

**resume 略過規則（逐檔）：**

1. 該檔 `nasVerified === true` 且 NAS 上現有 size 仍等於 `size` → 略過 SFTP／寫入。
2. 否則若遠端 `remotePath` 存在且 size 相符 → 略過該來源打包，只傳未核對檔。
3. 否則該來源重新 `cp`（若 staging 目錄缺）+ `tar`／`split`。
4. NAS 上 0 byte 或 size 不符 → 視為未成功，刪該目的檔後重傳（不清其他已成功檔）。
5. 續傳同樣 **傳完所有待補檔再結束**（單一補傳失敗不中止其餘待補檔）。

**full：** 現況完整流程；上傳前仍 `clearDestinationArtifacts`；報告新檔名；可把本次 `previousReportFileName` 設成 Session 內上一份報告檔名（若有）。

同一 Session、同一瀏覽器分頁：失敗結束後直接按按鈕，**不回到 credentials／human／paths**。

頁面重整：若 Session 仍在且 `last-job.status === 'failed'`，可恢復到備份步驟並顯示兩按鈕（前端需還原 `sources`、`nasPath`、`stagingPath`，來自 last-job）。若 Session 已沒 → 必須重走驗證。

### 5.7 報告檔名

Asia/Taipei：

```text
成功：{yyyyMMdd}_{HHmmss}_{備份月}_FineReport備份報告.md
失敗：{yyyyMMdd}_{HHmmss}_{備份月}_FineReport備份報告_失敗.md
```

禁止再使用無時分秒的舊格式當寫入檔名（讀舊檔不轉換）。

成功報告「備份目錄結構」開頭加一行（若有）：`先前失敗報告：{previousReportFileName}`。

### 5.8 前端

失敗且 `done` 後，報告下方兩個按鈕：

- **從失敗處續傳** → `startBackup({ ..., mode: 'resume' })`，沿用上次 `stagingPath`／`sources`／`nasPath`
- **全部重來** → `mode: 'full'`，仍不重驗；須再按「開始備份」前維持已建立的暫存目錄（resume 不需再按「建立暫存目錄」）

成功結束：不顯示續傳。可保留「回到路徑選擇」作新作業（既有若無則本版可不加，避免範圍膨脹）。

按鈕樣式沿用既有 `btn btn-primary`／`btn-secondary`，不新導入視覺系統。

### 5.9 風險

| 風險 | 緩解 |
|------|------|
| FineReport 磁碟被未刪產物佔滿 | 單檔 NAS 成功即刪該檔；僅失敗檔留下 |
| 傳完再結束拉長總時間 | 可接受；進度／時間軸須標出哪個檔失敗、哪個繼續 |
| resume 讀到過期 staging | remote size 不符則重壓 |
| CIFS stream 仍 0 byte | 該檔 smbclient put |
| 密碼含 `,` 破壞 mount `-o` | 本版不改認證傳遞；若實測踩到另案處理 |

---

## 6. 參考文件

- [FineReport備份工具-失敗續傳與CIFS寫入-PLAN.md](./FineReport備份工具-失敗續傳與CIFS寫入-PLAN.md)
- [FineReport備份工具-NAS分卷上傳設計.md](./FineReport備份工具-NAS分卷上傳設計.md)
- [FineReport備份工具-備份優化構想.md](./FineReport備份工具-備份優化構想.md)
- [README.md](../README.md)

---

## 7. 使用表單（欄位說明）

本功能無新增憑證欄位。API／報告新增：

| 欄位 | 說明 | 必填 | 範例 |
|------|------|------|------|
| `mode` | `full`／`resume` | 否（預設 full） | `resume` |
| 報告檔名時分秒 | 避免覆蓋 | 是 | `20260829_105629` |
| 失敗畫面按鈕 | 續傳／全部重來 | 條件（失敗時） | 從失敗處續傳 |
| manifest `nasVerified` | 該產物是否已在 NAS 核對成功 | 是 | `false` |
| 完成度．狀態 | 成功／失敗（可部分檔失敗）；不得因前一檔失敗而標「未執行」 | 是 | 失敗 1／9 檔 |

---

## 审批

請確認本設計與 [PLAN](./FineReport備份工具-失敗續傳與CIFS寫入-PLAN.md) 後，於 Agent 模式指示「依 PLAN 實作」開始改程式。
