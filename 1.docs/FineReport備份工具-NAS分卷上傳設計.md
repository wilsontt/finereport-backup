# FineReport 備份工具 — NAS 分卷上傳設計

![版本](https://img.shields.io/badge/版本-v0.1-blue)
![狀態](https://img.shields.io/badge/狀態-已實作-green)
![文件類型](https://img.shields.io/badge/文件類型-技術設計-blue)

**專案**：FineReport 備份工具  
**版本**：v0.1  
**最後更新**：2026-08-06  
**關聯文件**：[備份優化構想](./FineReport備份工具-備份優化構想.md)、[NAS 掛載設計](./FineReport備份工具-NAS掛載設計.md)、[技術設計](./FineReport備份工具-技術設計.md)、[PLAN](./FineReport備份工具-NAS分卷上傳-PLAN.md)

---

## 1. 目的

因應 NAS 傳輸（`smbclient put` 與 CIFS 掛載寫入）對單檔約 **>40MB** 易中斷或不完整（`NT_STATUS_CONNECTION_RESET`、報告成功但 NAS 為 0 byte）之問題，規定：

- 遠端打包後，單一壓縮產物若 **> 30MB**，一律拆成 **30MB** 分卷再傳至 NAS。
- **掛載路徑與 smbclient 備援路徑皆適用**，不依「是否穩定」分支省略分卷。
- 降低單次傳輸體積，提高備份成功率；並讓報告／還原方式明確。

---

## 2. 範圍

| 項目 | 說明 |
|------|------|
| **變更** | 遠端打包後分卷、SFTP／NAS 寫入改為逐分卷、備份報告產物說明、README／優化構想 |
| **不變** | SSH／sudo／NAS／人為驗證精靈；遠端 `cp -R` + `chown`；目的端不解壓業務內容 |
| **目標環境** | 開發：macOS；正式：Docker 後端（Linux，含 CIFS 掛載能力） |

**非目標（本版不做）**：

- 自動在 NAS 上合併回單一 `.tgz`
- 變更 gzip 壓縮等級／改用 xz、zstd
- 修復「既有掛載點重用 `/tmp/nas-mount-test`」以外的掛載策略重構（僅在實作注意事項標註）

---

## 3. 權責

| 角色 | 權責 |
|------|------|
| 後端 `backupService` | 遠端 `tar`／`split`、下載分卷、寫入 NAS、大小驗證、作業日誌 |
| 備份報告 | 標示分卷檔名與還原指令 |
| 運維／使用者 | 需還原時手動 `cat …part* > ….tgz` 後再 `tar xzf` |
| 前端 | 本版可不改 UI（進度文案由後端 message／log 帶出即可） |

---

## 4. 名詞解釋

| 名詞 | 定義 |
|------|------|
| **分卷閾值** | `NAS_CHUNK_BYTES = 30 * 1024 * 1024`（30 MiB） |
| **整包** | 遠端 `tar czf` 產出之 `{來源}.tgz` |
| **分卷** | `split` 產出之 `{來源}.tgz.part000`、`.part001`…（十進位、3 位寬），存放於目的路徑子目錄 `{destPath}/`（例如 `webroot/plugins/plugins.tgz.part000`） |
| **掛載路徑** | NAS CIFS 掛載成功，檔案寫入掛載點 |
| **備援路徑** | 掛載失敗，本機 temp + `smbclient put` |

---

## 5. 作業內容

### 5.1 現況（變更前）

```
遠端 tar czf → 單一 .tgz
  → SFTP fastGet 至掛載點或 temp
  →（備援）smbclient put 整包
  → 本機 stat 非 0 即標成功
```

問題：整包 >40MB 時 SMB／部分 CIFS 寫入不穩；且僅本機 `stat` 易誤報成功。

### 5.2 目標流程

```
遠端 cp -R 全部來源 → chown
  →【階段一】每個來源：tar czf →（>30MB 則 split）產物留在 FineReport
  →【階段二】每個 .tgz／part：
        SFTP → 容器本機暫存（核對 size，失敗重試最多 3 次）
        → 掛載 copy 或 smbclient put 至 NAS（再核對／重試）
        → 刪遠端暫存與本機暫存
```

分卷 NAS 路徑：`{destPath}/{name}.tgz.partNNN`（例如 `webroot/plugins/plugins.tgz.part000`）。  
未分卷：`{dirname(destPath)}/{name}.tgz`。

**為何改為兩階段**：打包與上傳分離，便於先統計拆檔數；SFTP 不直寫 CIFS，避免掛載寫入截斷（4MiB／16MiB／0 byte）。

### 5.3 命名與還原

| 產物 | 範例 |
|------|------|
| 未超標 | `webroot/jar.tgz` |
| 超標分卷 | `webroot/jar/jar.tgz.part000`、`jar.tgz.part001`…（置於 `destPath` 子目錄） |

還原（使用者手動）：

```bash
cd webroot/jar
cat jar.tgz.part* > jar.tgz
tar xzf jar.tgz
```

### 5.4 驗證規則（成功條件）

每個寫入 NAS 的檔案（整包或分卷）必須：

1. 本機下載後 `size > 0` 且與遠端 `stat` 大小一致（允許在 SFTP 後比對）。
2. 寫入 NAS 後再次確認目的檔大小（掛載：`fs.statSync` + 建議 `fsync`；備援：put 成功且可選擇再 `smbclient` 查 size；**至少** put／copy 後本機來源與預期 byte 數一致，目的端能 `stat` 到相同 size）。
3. 任一分卷失敗 → 該來源失敗，不標整來源成功。

### 5.5 逾時

- 單一分卷傳輸逾時：沿用或設定 `SOURCE_PART_TIMEOUT_MS`（建議 5 分鐘／卷）。
- 單一來源含多分卷之總逾時：建議放寬至 **45 分鐘**（`SOURCE_TOTAL_TIMEOUT_MS`），避免 1GB+ 多卷合計逾時。

### 5.6 報告與日誌

- 作業日誌：記錄 `遠端分卷`、`SFTP 下載 partNNN`、`已寫入 NAS partNNN (bytes)`。
- 報告「備份目錄結構／目的檔案」：分卷時列出 `xxx.tgz.part*` 或註明「已分卷（30MB）」。
- 報告備註還原之 `cat` 指令。

### 5.7 主要改動檔案

| 檔案 | 變更 |
|------|------|
| `backend/src/services/backupService.ts` | 分卷邏輯、驗證、逾時、報告文案 |
| `README.md` | 備份流程、分卷還原、大檔疑難 |
| `1.docs/FineReport備份工具-備份優化構想.md` | 新增項目狀態 |
| （可選）單元測試 | 純函式：是否分卷、命名、報告字串 |

### 5.8 風險與緩解

| 風險 | 緩解 |
|------|------|
| 遠端無 GNU `split` | 實作前以 FineReport 主機確認；失敗時明確錯誤 |
| 殘留測試掛載被重用 | 日誌標「使用既有掛載點」；運維勿留 `/tmp/nas-mount-test` |
| 分卷數多、總時間長 | 放寬來源總逾時；進度 message 顯示 part 序號 |
| NAS 仍寫成 0 byte | 強制目的 size 核對，失敗則來源失敗 |

---

## 6. 參考文件

- [FineReport備份工具-備份優化構想.md](./FineReport備份工具-備份優化構想.md)
- [FineReport備份工具-NAS掛載設計.md](./FineReport備份工具-NAS掛載設計.md)
- [FineReport備份工具-技術設計.md](./FineReport備份工具-技術設計.md)
- [README.md](../README.md)

---

## 7. 使用表單（欄位說明）

本功能無新增前端表單欄位。備份報告相關欄位：

| 欄位／區塊 | 說明 | 必填 | 範例 |
|------------|------|------|------|
| 目的檔案 | 實際成功寫入的檔名（失敗報告另附計畫對照） | 是 | `webroot/jar/jar.tgz.part000` … |
| 還原說明 | 分卷合併指令 | 條件（有分卷時） | `cd webroot/jar` + `cat …` |
| 完成度．應傳數 | 該來源應傳檔數（未拆＝1） | 是 | `12` |
| 完成度．已成功數 | 實際寫入 NAS 筆數 | 是 | `3` |
| 完成度．狀態 | `成功`／`失敗`／`未執行` | 是 | `失敗` |
| 完成度．失敗檔案／原因 | 失敗或未執行時的說明 | 條件 | `…part003 — Connection reset` |
| 時間軸 | 打包／清舊／上傳／中止事件 | 是 | `上傳失敗：Java @ …` |
| 計畫 vs 實際 | 計畫檔列表與實際上傳列表 | 是 | 計畫 12、實際 3 |
| 分卷閾值（程式常數） | 非 UI | — | 30 MiB |
| 上傳前清舊 | 寫入前刪同路徑舊 `.tgz`／`.tgz.part*` | — | 自動 |

---

## 审批

請確認本設計後，依 [PLAN](./FineReport備份工具-NAS分卷上傳-PLAN.md) 實作。
