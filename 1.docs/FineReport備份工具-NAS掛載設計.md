# FineReport 備份工具 — NAS 掛載設計

![版本](https://img.shields.io/badge/版本-v0.1-blue)
![狀態](https://img.shields.io/badge/狀態-已實作-green)
![文件類型](https://img.shields.io/badge/文件類型-技術設計-blue)

**專案**：FineReport 備份工具  
**版本**：v0.1  
**最後更新**：2026-03-02  
**關聯文件**：[需求確認紀錄](./FineReport備份工具-需求確認紀錄.md)、[技術設計](./FineReport備份工具-技術設計.md)

---

## 1. 目的

本文件整理「NAS 掛載」方案之設計，取代現有「SFTP 下載至 temp + smbclient 上傳」流程，使備份流程與手動 FileZilla 操作一致，並消除 smbclient、smb.conf 依賴。

---

## 2. 範圍

| 項目 | 說明 |
|------|------|
| **變更範圍** | NAS 驗證步驟、備份執行流程 |
| **不變** | SSH、sudo、遠端複製、4 碼驗證、備份來源探索 |
| **目標環境** | 開發：macOS；正式：企業入口網站 Server（Linux） |

---

## 3. 背景與現況

### 3.1 現有流程（smbclient）

```
FineReport 伺服器 (10.9.82.57)           Backend 機器 (Mac / 入口網站 Server)      NAS (10.9.82.22)
        │                                        │                                │
        │  1. cp -R source → staging             │                                │
        │  2. chown -R crownap:crownap           │                                │
        │                                        │                                │
        │  3. SFTP download ──────────────────>  │  /var/folders/.../temp         │
        │                                        │                                │
        │                                        │  4. smbclient put ───────────> │
        │                                        │                                │
        │  5. rm -rf staging                     │  6. cleanup temp               │
```

**問題**：
- smbclient 需 smb.conf（macOS Homebrew samba 預設找 `/usr/local/etc/smb.conf`，易報錯）
- 檔案經過 Backend 機器，多一層轉傳
- 與手動 FileZilla 流程不一致

### 3.2 手動 FileZilla 流程（參考）

1. SSH 登入 FineReport 伺服器
2. `cp -R` 來源 → `/home/crownap/backup/YYYYMM`
3. `chown -R crownap:crownap`
4. FileZilla：SFTP 從遠端下載到 NAS 掛載路徑（如 `/Volumes/KE20.4.軟硬體系統備份記錄/...`）

**關鍵**：NAS 已掛載在 Mac 上，FileZilla 的「本機」即為 NAS 路徑。

---

## 4. 掛載方案設計

### 4.1 新流程

```
FineReport 伺服器 (10.9.82.57)           Backend 機器 (Mac / 入口網站 Server)      NAS (10.9.82.22)
        │                                        │                                │
        │                                        │  0. 驗證 NAS 時：掛載 NAS ─────> │
        │                                        │     掛載點：/tmp/finereport-nas-{sessionId}
        │                                        │                                │
        │  1. cp -R source → staging             │                                │
        │  2. chown -R crownap:crownap           │                                │
        │                                        │                                │
        │  3. SFTP download ──────────────────>  │  {掛載點}/4.備份記錄/KE/2026/FineReport/202602/
        │     （直接寫入 NAS）                     │                                │
        │                                        │                                │
        │  4. rm -rf staging                     │  5. umount 掛載點               │
```

### 4.2 變更點

| 步驟 | 現有 | 掛載後 |
|------|------|--------|
| **1. NAS 驗證** | smbclient ls 或 @awo00/smb2 驗證 | 改為實際掛載 NAS；掛載成功即驗證成功 |
| **2. SFTP 下載** | 下載到 `os.tmpdir()` | 下載到 `{掛載點}/{nasPath}/{YYYYMM}` |
| **3. 上傳** | smbclient put | **移除**（直接寫入掛載的 NAS） |
| **4. 清理** | 刪除 temp | umount 掛載點 |

### 4.3 掛載時機與生命週期

| 時機 | 動作 |
|------|------|
| **驗證 NAS** | 使用 NAS 憑證執行 mount，掛載成功後回傳 `ok: true` |
| **備份執行** | 使用已掛載的掛載點作為 SFTP 下載目標 |
| **備份完成** | umount 掛載點 |
| **備份失敗** | 仍須 umount，避免掛載殘留 |

**掛載點**：`/tmp/finereport-nas-{sessionId}` 或 `/tmp/finereport-nas-{backupId}`

- 需確保 sessionId/backupId 與備份流程綁定
- 若有多個並行備份，各自獨立掛載點

### 4.4 掛載指令

**macOS**：
```bash
mount_smbfs "//${username}:${password}@${host}/${share}" /tmp/finereport-nas-xxx
# 若有 domain：mount_smbfs -d ${domain} "//${username}:${password}@${host}/${share}" /tmp/finereport-nas-xxx
```

**Linux**：
```bash
mount -t cifs "//${host}/${share}" /tmp/finereport-nas-xxx -o username=${username},password=${password},domain=${domain}
```

**卸載**：
```bash
umount /tmp/finereport-nas-xxx
```

**注意**：掛載前需確保目錄存在且為空（或未掛載），避免覆蓋既有目錄。

### 4.5 路徑對應

| 項目 | 範例 |
|------|------|
| `nasPath`（使用者選擇） | `4.備份記錄/KE/2026/FineReport` |
| `backupMonth` | `202602` |
| 備份目標完整路徑 | `{掛載點}/4.備份記錄/KE/2026/FineReport/202602/` |
| SFTP 下載目標 | `{掛載點}/4.備份記錄/KE/2026/FineReport/202602/{destPath}` |

**目錄建立**：掛載後為本機檔案系統，使用 `fs.mkdirSync(path, { recursive: true })` 建立 `{掛載點}/{nasPath}/{backupMonth}` 及子目錄，無需 smbclient mkdir。

---

## 5. 待確認事項

### 5.1 權限

| 項目 | 說明 |
|------|------|
| **mount/umount** | 通常需 root 或 sudo。Backend 若以一般使用者執行，需評估是否需 sudo。 |
| **Docker** | 容器內 mount 需 `--privileged` 或 `--cap-add SYS_ADMIN`，可能影響部署。 |

### 5.2 掛載時機與狀態持久化

**方案 A（本設計）**：驗證 NAS 時掛載，Session 儲存 `mountPoint`，備份完成後 umount。
- 優點：驗證即掛載，流程單純
- 缺點：驗證後至開始備份可能間隔較久，掛載需持久化

**方案 B（替代）**：驗證 NAS 時僅做 mount+umount 快速測試；開始備份時再掛載，完成後 umount。
- 優點：掛載生命週期短，僅在備份執行期間
- 缺點：驗證與實際掛載分離，需重複 mount 邏輯

| 項目 | 說明 |
|------|------|
| **Session 儲存** | 需儲存 `mountPoint`、`nasCredentials`（備份時需用） |
| **Session 逾時** | 需確保逾時時 umount，避免掛載殘留 |
| **使用者驗證後離開** | 若驗證 NAS 後未點「開始備份」即關閉頁面，需有逾時機制 umount |

### 5.3 替代方案：使用者預先掛載

若 NAS 已由使用者手動掛載（如 Finder 連線後出現在 `/Volumes/KE20.4.軟硬體系統備份記錄`）：

- 可新增選項：「NAS 已掛載」+ 輸入本機路徑
- 不需 NAS 憑證，不需程式內 mount
- 與 FileZilla 手動流程完全一致

**取捨**：需使用者手動掛載，較不自動化；但部署較單純，無 mount 權限問題。

### 5.4 錯誤處理

| 情境 | 預期行為 |
|------|----------|
| 掛載失敗 | 回傳 `ERR_NAS_MOUNT`，提示檢查憑證與網路 |
| 掛載成功但無寫入權限 | SFTP 下載時會失敗，需明確錯誤訊息 |
| 備份中斷 | 仍須 umount，避免掛載殘留 |
| umount 失敗 | 記錄 log，可考慮重試或提示手動處理 |

---

## 6. 與現有文件差異

| 文件 | 需更新項目 |
|------|------------|
| **需求確認紀錄** | 2.2 NAS 連線：連線時機改為「驗證時掛載」 |
| **技術設計** | verify-nas 行為、StartBackupRequest 不再需 NAS 憑證（若掛載時已存） |
| **backupService.ts** | 移除 uploadDirViaPut、ensureNasPath；SFTP 下載目標改為掛載點 |

---

## 7. 結論

掛載方案可達成：
- 移除 smbclient、smb.conf 依賴
- 與手動 FileZilla 流程一致
- 減少中間轉傳

**需確認**：
1. 正式環境（企業入口網站 Server）是否具備 mount 權限
2. Docker 部署時是否可接受 privileged 或 cap-add
3. 是否採用「使用者預先掛載」作為替代或並行選項

---

## 8. 檢視清單（設計確認用）

| # | 項目 | 狀態 |
|---|------|------|
| 1 | 正式環境（企業入口網站 Server）是否具備 mount/umount 權限 | 待確認 |
| 2 | Docker 部署是否可接受 `--privileged` 或 `--cap-add SYS_ADMIN` | 待確認 |
| 3 | Session 儲存 mountPoint 之資料結構與生命週期 | 待設計 |
| 4 | 驗證後未備份即離開之逾時 umount 機制 | 待設計 |
| 5 | Share 名稱含中文或特殊字元之 mount 指令相容性 | 待驗證 |
| 6 | 是否提供「使用者預先掛載」作為替代選項 | 待決策 |

---

## 9. 參考文件

| 文件 | 路徑 |
|------|------|
| 需求確認紀錄 | 1.docs/FineReport備份工具-需求確認紀錄.md |
| 技術設計 | 1.docs/FineReport備份工具-技術設計.md |
| PRD | 1.docs/FineReport備份工具-PRD.md |
