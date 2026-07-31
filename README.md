# FineReport 備份工具

![版本](https://img.shields.io/badge/版本-v1.2.1-blue) ![狀態](https://img.shields.io/badge/狀態-維護中-green)

透過瀏覽器以 SSH（含 sudo）連線至 FineReport 伺服器，驗證 NAS（SMB）後，系統自動將 FineReport 相關檔案透過 SFTP 複製至 NAS，並產生 Markdown 備份報告。

---

## 目錄結構

```
4.FineReport備份工具/
├── frontend/                   # React + Vite 前端
│   ├── src/
│   │   ├── App.tsx             # 4 步驟精靈主元件
│   │   ├── api/backup.ts       # API 呼叫層
│   │   ├── components/
│   │   │   ├── TopTitleNav.tsx     # 頂部導覽列（shared-ui）
│   │   │   ├── StepIndicator.tsx   # 步驟指示器
│   │   │   ├── CredentialForm.tsx  # 步驟 1：填寫憑證
│   │   │   ├── HumanVerification.tsx # 步驟 2：4 碼人工驗證
│   │   │   ├── PathSelector.tsx    # 步驟 3：選擇路徑
│   │   │   └── BackupProgress.tsx  # 步驟 4：備份進度
│   │   └── constants/appVersion.ts # 版號（由 Vite 建置時注入）
│   ├── vite.config.ts          # @shared-ui 別名、版號注入
│   └── tsconfig.json           # shared-ui 型別路徑
├── backend/                    # Express + TypeScript 後端
│   └── src/
│       ├── index.ts            # 伺服器入口
│       ├── routes/backup.ts    # 所有 API 路由
│       ├── services/
│       │   ├── sshService.ts       # SSH 連線與 sudo 執行
│       │   ├── nasService.ts       # SMB 掛載與 smbclient 操作
│       │   ├── backupService.ts    # 備份流程協調
│       │   ├── backupExecutor.ts   # 進度／日誌／報告管理
│       │   └── pathDiscovery.ts    # 遠端路徑探索
│       ├── lib/
│       │   ├── sessionStore.ts     # 記憶體 Session 儲存
│       │   └── response.ts         # success() / error() 輔助
│       ├── schemas/backup.ts       # Zod 請求驗證
│       └── constants/defaultBackupSources.ts
├── 1.docs/                     # 規格與設計文件
├── Dockerfile.backend
├── Dockerfile.frontend
├── CLAUDE.md
└── README.md
```

---

## 技術棧

| 層 | 技術 |
|----|------|
| 前端 | React 19 · TypeScript · Vite 7 · Tailwind CSS 4 |
| 後端 | Node.js · Express · TypeScript · Zod · ssh2 / ssh2-sftp-client |
| 共用 UI | `0.shared-ui`（`PortalTopNav`、`CrownBrand`、`NavCalendarCluster`、`PortalFooter`） |
| 部署 | Docker + Nginx |

---

## 開發

### 前置：安裝 shared-ui 依賴

```bash
cd ../0.shared-ui
npm install
```

### 後端

```bash
cd backend
npm install
npm run dev        # tsx watch（熱重載）
npm run build      # tsc → dist/
npm start          # node dist/index.js
npm run lint
```

後端監聽 **port 3000**，路由掛載於 `/api/backup`。

### 前端

```bash
cd frontend
npm install
npm run dev        # Vite 開發伺服器（port 5174）
npm run build      # tsc -b && vite build
npm run preview
npm run lint
```

開發伺服器會將 `/finereport-backup/api` 代理至 `http://localhost:3000`。

---

## 4 步驟精靈流程

```
credentials → human → paths → backup
```

| 步驟 | 元件 | 說明 |
|------|------|------|
| `credentials` | `CredentialForm` | 填寫 SSH host／帳密、sudo 密碼、NAS SMB 憑證 |
| `human` | `HumanVerification` | 輸入後端傳回的 4 位數驗證碼（有效期 5 分鐘） |
| `paths` | `PathSelector` | 選擇遠端備份來源路徑與 NAS 目的地目錄 |
| `backup` | `BackupProgress` | 啟動備份、透過 SSE 顯示即時進度與日誌 |

Session ID 以 `X-Session-Id` 標頭傳遞，儲存於瀏覽器 `sessionStorage`；後端保存於記憶體，重啟即清除。

---

## API 端點

所有端點皆掛載於 `/api/backup`。

| 方法 | 路徑 | 說明 | 需人工驗證 |
|------|------|------|-----------|
| GET | `/sources` | 取得預設備份來源清單 | — |
| POST | `/verify-ssh` | 驗證 SSH 連線並儲存憑證 | — |
| POST | `/verify-sudo` | 驗證 sudo 密碼 | — |
| POST | `/verify-nas` | 驗證 NAS SMB 連線並儲存憑證 | — |
| POST | `/verify-human` | 產生（`action: "get"`）或驗證（`action: "verify"`）4 碼驗證碼 | — |
| POST | `/discover-remote` | 探索遠端目錄下的 FineReport 路徑 | ✓ |
| GET | `/browse-remote` | 列出遠端目錄內容 | ✓ |
| GET | `/browse-nas` | 列出 NAS 目錄內容 | ✓ |
| POST | `/create-nas-dir` | 在 NAS 建立新目錄 | ✓ |
| POST | `/add-source` | 新增自訂備份來源 | ✓ |
| POST | `/start` | 啟動備份，回傳 `backupId` | ✓ |
| GET | `/progress/:backupId` | SSE 串流進度事件 | — |
| GET | `/logs/:backupId` | 取得備份日誌 | — |
| GET | `/report/:backupId` | 取得 Markdown 備份報告 | — |

---

## 備份執行流程

1. 以 `mount_smbfs`（macOS）或 `mount -t cifs`（Linux）掛載 NAS；失敗則以 `smbclient` 備援。
2. SSH 連至遠端，以 `sudo cp -R` 複製 FineReport 檔案至遠端暫存路徑。
3. 每個來源目錄統一以遠端 `tar czf` 打包，再透過 SFTP `fastGet` 下載**單一 `.tgz`** 至本機（NAS 掛載點或本機暫存目錄），下載完成後刪除遠端暫存的 `.tgz`：
   - 目的端**不會自動解壓**，僅保留 `.tgz` 壓縮檔——加速大量小檔傳輸、避免深層路徑問題，同時節省 NAS 空間；如需查看內容請自行手動 `tar xzf` 解壓。
   - 僅需建立目的目錄的第一層（如 `webroot/`、`mysqldata/`），不需重建來源內部的目錄結構。
   - 每個來源下載逾時 5 分鐘；整體任務逾時 2 小時。
4. 若使用 smbclient 備援：透過 `smbclient put` 將各來源的 `.tgz` 上傳至 NAS。
5. 依設定刪除舊備份（保留月數）、產生 Markdown 備份報告（檔名格式：`yyyyMMdd_備份年月_FineReport備份報告.md`）。

**可靠性說明：**
- **備份中重整頁面**：`backupId` 保存於 `sessionStorage`，重整後自動恢復到備份進度畫面並重連 SSE，直到取得最終報告。
- **任務卡死**：逾時（5 分鐘/來源，整體 2 小時）後自動產生失敗報告並結束。
- **失敗報告**：備份失敗時，報告（含完成度與作業日誌）仍會嘗試寫入 NAS，即使前端失聯也有紀錄。

**後端主機系統需求**：`smbclient`、`mount_smbfs`（macOS）或 `mount -t cifs`（Linux）。

> `smbclient` 為**必要元件**：NAS 瀏覽、建立目錄、smbclient 備援上傳皆依賴它。詳見下方〈smbclient 安裝與疑難排解〉。

---

## smbclient 安裝與疑難排解

### 為什麼會出現「smbclient 未安裝」？

NAS 驗證採兩段式策略（見 `backend/src/services/nasService.ts` 的 `verifyNas`）：

1. **先嘗試掛載**：macOS 用 `mount_smbfs`、Linux 用 `mount -t cifs`。
2. **掛載失敗則退回 `smbclient`**：若此時系統找不到 `smbclient` 可執行檔，Node.js `spawn` 會回報 `ENOENT`，後端轉成錯誤碼 `ERR_NAS_SMBCLIENT_NOT_FOUND`，前端顯示安裝指引。

常見根因有二：

1. **Docker 部署：smbclient 要裝在「容器」內，不是 host**。後端跑在容器中，即使 host（如 Ubuntu）已 `apt-get install smbclient` 也無效——容器映像若沒裝，照樣 ENOENT。本專案 `Dockerfile.backend` 已內建安裝（見下方〈Docker 部署情境〉）。
2. **`PATH` 不含 smbclient 所在目錄**。以 Homebrew 安裝時，`smbclient` 位於 `/opt/homebrew/bin`（Apple Silicon）或 `/usr/local/bin`（Intel）；但以 launchd／systemd 啟動的後端，`PATH` 常不含這些目錄，導致「明明裝了卻還是 ENOENT」。此時用 `SMBCLIENT_PATH` 指定絕對路徑即可。

### 安裝指令

| 平台 | 指令 |
|------|------|
| macOS（Homebrew） | `brew install samba` |
| Debian / Ubuntu | `sudo apt-get update && sudo apt-get install -y smbclient cifs-utils` |
| RHEL / CentOS | `sudo yum install -y samba-client cifs-utils` |

### 環境變數設定（解決 PATH 問題）

後端支援以環境變數 **`SMBCLIENT_PATH`** 指定 `smbclient` 的絕對路徑，優先於自動偵測。若已安裝卻仍報錯，請先確認路徑再設定：

```bash
# 1. 確認 smbclient 絕對路徑
which smbclient        # 例如 /opt/homebrew/bin/smbclient

# 2. 於後端 .env 設定（或部署環境變數）
echo "SMBCLIENT_PATH=/opt/homebrew/bin/smbclient" >> backend/.env
```

> 後端會依序解析：`SMBCLIENT_PATH` → 常見路徑（`/opt/homebrew/bin`、`/usr/local/bin`、`/usr/bin`、`/bin`）→ 退回沿用 `PATH` 的 `smbclient`。解析邏輯見 `resolveSmbclientBin()`（`backend/src/services/nasService.ts`）。

### Docker 部署情境（最常見）

後端容器 **必須** 內含 smbclient。`Dockerfile.backend` 採 `node:18-bookworm-slim` 並安裝 `smbclient`、`cifs-utils`：

```dockerfile
RUN apt-get update \
  && apt-get install -y --no-install-recommends smbclient cifs-utils \
  && rm -rf /var/lib/apt/lists/*
```

> 改用 Debian slim（非 Alpine）的原因：NAS 分享名稱含中文（如 `KE20.4.軟硬體系統備份記錄`），Alpine 的 musl libc 對 CJK 編碼處理易出問題；Debian glibc 與 host（Ubuntu）一致，最可靠。

更版（在 `enterprise-portal/deploy`）：

```bash
cd /opt/apps/enterprise-portal/deploy
docker compose build --no-cache finereport-backup-backend
docker compose up -d --force-recreate finereport-backup-backend

# 驗證容器內已可呼叫 smbclient
docker compose exec finereport-backup-backend smbclient --version
docker compose logs finereport-backup-backend | grep "啟動檢測"
```

#### CIFS 掛載權限（建議必設，避免大檔走 smbclient）

`Dockerfile.backend` 已安裝 `cifs-utils`，但容器預設**沒有**掛載權限。未設定時 log 會出現：

```text
ERR_NAS_MOUNT: Unable to apply new capability set
→ mount 失敗，改用 smbclient 上傳
```

小檔可能仍成功；**GB 級**（如 `jar.tgz`）用 `smbclient get/put` 常出現 `NT_STATUS_CONNECTION_RESET` / `CONNECTION_DISCONNECTED`，備份失敗。

在 **正式** `enterprise-portal/deploy/docker-compose.yml` 的 **`finereport-backup-backend`**（不是 frontend）加入：

```yaml
finereport-backup-backend:
  cap_add:
    - SYS_ADMIN
  security_opt:
    - apparmor:unconfined
  # 若仍 Unable to apply new capability set，改用：
  # privileged: true
```

套用後：

```bash
cd /opt/apps/enterprise-portal/deploy
docker compose up -d --force-recreate finereport-backup-backend
docker compose logs finereport-backup-backend --tail=30 | grep -iE 'mount|NAS|啟動'
```

成功時備份作業日誌應為 `mount 成功`／`使用既有掛載點`，**不應**再出現「改用 smbclient 上傳」。  
範例片段見 `deploy/docker-compose.finereport-backup.example.yml`。

### NAS 連線：容器 `NT_STATUS_HOST_UNREACHABLE` / `IO_TIMEOUT`（host 主機可連、容器不可連）

**症狀**：備份在 SMB 上傳階段失敗，作業日誌出現空白的 `ERR_NAS_UPLOAD:` 或 `do_connect: Connection to <NAS> failed (Error NT_STATUS_HOST_UNREACHABLE)`；但在 ds1 **主機**上 `ping`、`nc -vz <NAS> 445` 皆正常。

**根因**：後端容器走 bridge 網路（NAT），來源 IP 為 Docker 網段（如 `172.18.0.0/16`）；NAS 或中間防火牆未放行此網段，導致容器到 NAS 的 TCP 445 不通（主機 IP 則被放行）。

**快速判定**（容器內，免裝 ping）：

```bash
docker compose exec finereport-backup-backend bash -c \
  "timeout 5 bash -c 'cat < /dev/null > /dev/tcp/10.9.82.22/445' && echo 445_OK || echo 445_FAIL"
```

`445_FAIL` 即為容器出網被擋。

**解法 A（採用中）：後端改用 host 網路**，讓備份流量以主機 IP 出網。`deploy/docker-compose.yml`：

```yaml
finereport-backup-backend:
  network_mode: host          # 取代 networks: - portal-network
```

> host 模式下後端會 listen 在主機 `0.0.0.0:3000`，已脫離 `portal-network`，故 **nginx 必須改以 `host.docker.internal:3000` 連線**：
>
> - `deploy/nginx/nginx.conf`：`upstream finereport-backup-backend { server host.docker.internal:3000; }`
> - `deploy/docker-compose.yml` 的 `nginx` service 加 `extra_hosts: ["host.docker.internal:host-gateway"]`
>
> **安全**：host 模式會把 3000 直接暴露於主機所有介面，請以防火牆限制僅本機／內網存取（對外只走 nginx 的 80）。

**解法 B（較乾淨）：維持 bridge，由網管在 NAS／防火牆放行 Docker 網段**（如 `172.18.0.0/16`）到 NAS 的 445/tcp，即不需改 `network_mode`。

> 備份失敗時，後端會將 smbclient 的 stdout/stderr 完整輸出寫入「作業日誌」與「備份失敗報告」，可據此區分是 `NT_STATUS_HOST_UNREACHABLE`／`IO_TIMEOUT`（網路）、`NT_STATUS_LOGON_FAILURE`（認證）或 `NT_STATUS_ACCESS_DENIED`（權限）。

### 大檔 SMB：`NT_STATUS_CONNECTION_RESET` / `CONNECTION_DISCONNECTED`

**症狀**：445 已通、`smbclient ls` 成功、小檔／備份報告可寫入 NAS，但 `jar.tgz`（約 1GB+）在 `smbclient put`（或手動 `get`）中途失敗；本機／容器內殘檔遠小於完整大小（例如只下到數十 MB）。

**根因**：掛載失敗後走 smbclient 備援，長時間大檔傳輸不穩（與防火牆「完全不通」不同）。

**解法**：依上方〈CIFS 掛載權限〉讓容器成功 `mount -t cifs`，讓 SFTP 直接寫入掛載點，避開大檔 `smbclient put`。

**手動重現**（不必重新打包；可用既有月份的 `jar.tgz`）：

```bash
# 若 get 也 RESET 且檔案只有數十 MB，即證實大檔 smbclient 不穩
smbclient "//10.9.82.22/<share>" -A /tmp/smbauth -c \
  "cd \"4.備份記錄/KE/2026/FineReport/202606/webroot\"; get jar.tgz /tmp/jar-test.tgz"
ls -lh /tmp/jar-test.tgz   # 完整約 1.x GB；若只有 ~40MB 即中斷
```

### 啟動自我檢測

後端啟動時會自動檢測 smbclient 並輸出日誌：

```
[啟動檢測] smbclient 可用：/opt/homebrew/bin/smbclient
# 或
[啟動檢測] 警告：找不到 smbclient，NAS 瀏覽／建立目錄／上傳將失敗。...
```

### 驗證安裝是否生效

```bash
smbclient -L //10.9.82.22 -U <使用者>
```

能列出共用清單即代表 `smbclient` 可正常被呼叫，重新整理頁面再驗證 NAS 即可。

---

## 共用 UI（`0.shared-ui`）接入

本專案使用 `@shared-ui` 別名（`vite.config.ts` 自動偵測 `0.shared-ui` 位置）。

已接入模組：

| 模組 | 元件 |
|------|------|
| `portal-nav` | `PortalTopNav`、`NavCalendarCluster` |
| `crown-brand` | `CrownBrand`、`CROWN_logo.png` |
| `portal-footer` | `PortalFooter`（頁尾置底，`leading` 版權、`trailing` 版號） |

`tsconfig.json` 的 `include` 已涵蓋上述三個模組與 `calendar-icon/cn.ts`。

---

## Docker 部署

### 獨立建置（本機驗證）

```bash
# 後端（在 4.FineReport備份工具 目錄內）
docker build -f Dockerfile.backend -t finereport-backup-backend .

# 前端（build context 須為 enterprise-portal 根目錄，含 0.shared-ui）
cd ..
docker build -f 4.FineReport備份工具/Dockerfile.frontend -t finereport-backup-frontend .
```

### 企業入口網站 docker-compose（重要）

前後端 **build 設定不可混用**。常見錯誤：後端 service 誤指向前端 Dockerfile，建置時出現：

```text
Step 1/15 : FROM node:22-alpine AS builder
COPY failed: no source files were specified
```

這代表 `finereport-backup-backend` 用了 `Dockerfile.frontend`（`node:22-alpine` + `COPY 4.FineReport備份工具/frontend/...`），而非 `Dockerfile.backend`（`node:18-bookworm-slim` + `COPY backend/...`）。

**正確設定**（完整範例見 `deploy/docker-compose.finereport-backup.example.yml`）：

```yaml
services:
  finereport-backup-frontend:
    build:
      context: ..                                          # enterprise-portal 根目錄
      dockerfile: 4.FineReport備份工具/Dockerfile.frontend

  finereport-backup-backend:
    build:
      context: ../4.FineReport備份工具                      # 僅本專案目錄
      dockerfile: Dockerfile.backend
```

在伺服器上修正後重建：

```bash
cd /opt/apps/enterprise-portal/deploy

# 確認後端 service 的 dockerfile 是否正確
grep -A6 'finereport-backup-backend' docker-compose.yml

docker compose build --no-cache finereport-backup-backend
docker compose up -d --force-recreate finereport-backup-backend

# 驗證容器內 smbclient
docker compose exec finereport-backup-backend smbclient --version
docker compose logs finereport-backup-backend | grep "啟動檢測"
```

> 前端 Dockerfile 需要 Node **22**（Vite 7 的限制）。  
> 後端 Dockerfile 使用 **Debian bookworm-slim**，並內建 `smbclient`、`cifs-utils`。  
> `0.shared-ui` 在映像內複製至 `frontend/0.shared-ui`，讓 `tsc` 能自 `frontend/node_modules` 解析型別（與出勤系統相同）。  
> 若部署後靜態資源出現 403，請確認 Nginx 階段有執行 `chmod -R a+r /usr/share/nginx/html`。

### 企業入口網站整合部署注意事項

在企業入口網站的反向代理架構中：

- `finereport-backup-frontend` 容器僅提供 `80`
- TLS（HTTPS）由入口 `deploy/nginx/nginx.conf` 對外統一處理

若在容器內啟用 `443 ssl` 但未掛憑證，會導致容器重啟（`cannot load certificate /etc/nginx/certs/fullchain.pem`）。

#### 無快取更版（建議）

```bash
cd /opt/apps/enterprise-portal/deploy
docker compose build --no-cache finereport-backup-frontend
docker compose up -d --force-recreate finereport-backup-frontend
```

#### 發布後驗證（避免誤發 attendance 產物）

```bash
docker compose exec finereport-backup-frontend sh -c "sed -n '1,40p' /usr/share/nginx/html/index.html"
```

檢查重點：
- 應出現 `/finereport-backup/assets/...`
- 不可出現 `/attendance/assets/...`

---

## 參考文件

| 文件 | 路徑 |
|------|------|
| 開發計畫 | `1.docs/FineReport備份工具-開發計畫.md` |
| PRD | `1.docs/FineReport備份工具-PRD.md` |
| 技術設計 | `1.docs/FineReport備份工具-技術設計.md` |
| NAS 掛載設計 | `1.docs/FineReport備份工具-NAS掛載設計.md` |
| 前端 UI 重設計計畫 | `1.docs/FineReport備份工具-前端UI重設計計畫.md` |
| 需求確認紀錄 | `1.docs/FineReport備份工具-需求確認紀錄.md` |
| SDD 開發進度清單 | `1.docs/FineReport備份工具-SDD開發進度清單.md` |
