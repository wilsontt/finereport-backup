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
3. 透過 SFTP 將暫存檔案下載至本機（NAS 掛載點或本機暫存目錄）。
4. 若使用 smbclient 備援：透過 `smbclient put` 上傳至 NAS。
5. 依設定刪除舊備份（保留月數）、產生 Markdown 備份報告。

**後端主機系統需求**：`smbclient`、`mount_smbfs`（macOS）或 `mount -t cifs`（Linux）。

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

```bash
# 後端（port 3000）
docker build -f Dockerfile.backend -t finereport-backup-backend .

# 前端（nginx，port 80/443）
docker build -f Dockerfile.frontend -t finereport-backup-frontend .
```

> 前端 Dockerfile 需要 Node **22**（Vite 7 的限制）。  
> 若部署後靜態資源出現 403，請確認 Nginx 階段有執行 `chmod -R a+r /usr/share/nginx/html`。

### HTTPS（Docker 單機最小配置）

前端容器預設採用：
- `80`：自動導向 HTTPS
- `443`：TLS 服務（憑證路徑固定為 `/etc/nginx/certs/fullchain.pem` 與 `/etc/nginx/certs/privkey.pem`）

請以 volume 掛載憑證，不要把私鑰打包進 image：

```bash
docker run -d --name finereport-backup-frontend \
  -p 80:80 -p 443:443 \
  -v /path/to/certs:/etc/nginx/certs:ro \
  finereport-backup-frontend
```

檢查指令：

```bash
# HTTP 是否 301 到 HTTPS
curl -I http://<host>/finereport-backup/

# HTTPS 是否可服務（自簽章可先加 -k）
curl -k -I https://<host>/finereport-backup/
```

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
