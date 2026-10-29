# FineReport 備份工具｜202610 Node.js 緊急安全更新收尾 PLAN

**建立日期**：2026-10-27
**修訂**：v0.2（依專案負責人 2026-10-27 指示：本機測試環境先驗證 → 手動部署正式機 → 最後才同步文件；commit 由負責人手動執行）
**依據文件**：`0.docs/2.資安弱點漏洞處理/202610_Node.js-Go緊急安全更新處置.md`（v1.4.1）
**狀態**：草案，待對齊 §5.5 決策點後定稿

## 1. 目的

依處置文件 §5.5 結案條件，確認「4.FineReport備份工具」升級完成度，並依「本機驗證 → 正式機 → 文件」順序訂出收尾步驟與驗收方式。

## 2. 範圍

- 納入：`backend/`、`frontend/`、`Dockerfile.backend`、`Dockerfile.frontend`、`.nvmrc`；本機啟動前後端服務驗證（不做 docker build）；正式機 `finereport-backup-backend`、`finereport-backup-frontend`；最後階段的文件同步。
- 不納入：其他子專案、`0.shared-ui` 本身、`nginx` 入口層、Go／PHP（不適用）、`node_modules`／`dist` 版控整理與 `eslint` 缺口（另案）。
- 本 PLAN 不含程式碼變更。所有 git commit／push／merge 由專案負責人手動執行。

## 3. 權責

| 角色 | 權責 |
|------|------|
| 專案負責人 | 本機驗證結果判定、手動 commit／合併、手動部署正式機、決定進入文件階段 |
| Claude（協助） | 提供驗證指令與檢查表、協助判讀驗證輸出、文件階段產出 diff 供審閱 |

## 4. 名詞解釋

| 名詞 | 說明 |
|------|------|
| 修補版 | Node 22.x ≥ `22.23.4`；24.x ≥ `24.22.1` |
| 執行期服務 | 容器內以 Node 進程對外服務者；本專案為 `finereport-backup-backend` |
| builder | 多階段建置中僅用於編譯的 Node 階段；本專案前端 runtime 為 nginx，無 Node |

## 5. 作業內容

### 5.1 結論

**程式碼面的升級已完成，且兩個 Dockerfile 皆符合處置文件，無違規。** 尚待：本機 Docker 驗證 → 正式機重建 → 文件同步。

### 5.2 Dockerfile 符合性檢查

| 檔案 | 現況 | 處置文件要求（§5.3.2.1） | 判定 |
|------|------|--------------------------|------|
| `Dockerfile.backend` | `node:22.23.4-bookworm-slim` | 後端／執行期維持 22 線，釘 `22.23.4`（不使用 shared-ui，不需 24） | **符合**，不需再升級 |
| `Dockerfile.frontend` | `node:24.22.1-alpine` | 會編譯 `0.shared-ui` 的 builder 用 24.22.1 | **符合** |

說明：`22.23.4` 即 22 線的修補版，Brotli 漏洞（CVE-2026-111497）已修復；後端升到 24 並非處置文件要求，且會擴大變更面，不建議。此項不需另提 PLAN。

### 5.3 現況盤點

| 結案條件（處置文件 §5.5） | 現況 | 判定 |
|---|---|---|
| `.nvmrc`／`engines` | `24.22.1`／前後端 `>=22.23.4` | 完成 |
| Dockerfile 釘版 | 見 §5.2 | 完成 |
| 本機建置驗證（npm） | 既有報告：backend `build`、`test` 15/15、frontend `build` 通過 | 完成（Docker 映像層級**未驗證**） |
| 本機服務啟動與功能驗證（不做 docker build） | 沙箱部分已通過（見 Phase A-1）；本機 Node 24.22.1＋真實 SSH／NAS 測試尚未執行 | **Phase A-2 待做** |
| 修補進入主線 | 分支 `security/202610-node-patch` 領先 `main` 3 筆（`653421c`、`3928073`、`138957f`） | 由負責人手動處理 |
| 正式機重建與 `node --version` 驗證 | 無紀錄 | **Phase B 待做** |
| 文件同步、§7 表單 | 見 Phase C | **Phase C 待做（最後）** |

### 5.4 執行步驟

#### Phase A：本機開發環境驗證（不做 docker build；通過後才進 Phase B）

直接於本機啟動前後端服務測試。`<ROOT>` 為「企業入口網站」根目錄（含 `0.shared-ui/`）。

**A-1 已由 Claude 在沙箱完成（2026-10-27，Node v22.23.4，乾淨 `npm ci`）**

| 項目 | 結果 |
|------|------|
| backend `npm ci`／`npm run build` | 通過 |
| backend `npm test` | 15/15 通過 |
| frontend `npm ci`／`npm run build`（含 `0.shared-ui`） | 通過，352 modules |
| backend 啟動（`node dist/index.js`，port 3000） | 啟動成功；警告找不到 `smbclient`（沙箱無此套件，非程式問題） |
| API 煙霧：`verify-human` 前置未完成 | 400 `ERR_HUMAN_NOT_READY`（符合預期） |
| API 煙霧：`last-job`、`start` 未人工驗證 | 403 `ERR_NOT_VERIFIED`（符合預期） |
| API 煙霧：`verify-ssh` 參數缺漏 | 400 `ERR_VALIDATION`（符合預期） |
| API 煙霧：`verify-ssh` 不可達主機 | 500 `ERR_SSH_CONNECT`，服務未 crash |
| `ssh2` 載入 | OK（`cpu-features` 原生模組未載入，退回純 JS，屬 optional） |
| frontend dev server（port 5174，base `/finereport-backup/`） | HTML、`main.tsx` 皆 200 |

沙箱的限制：Node 為 22.23.4（非本機 24.22.1）、無 `smbclient`／CIFS、無法連你的測試 SSH 主機與 NAS，也看不到瀏覽器畫面。因此下列 A-2 必須由你在本機執行。

**A-2 由你在本機執行**

| 步驟 | 內容 | 驗收 |
|------|------|------|
| A2-1 | `cd <ROOT>/4.FineReport備份工具 && nvm use`（讀 `.nvmrc`）；`node -v` | `v24.22.1` |
| A2-2 | 後端：`cd backend && npm ci && npm run build && npm test` | 15/15 通過 |
| A2-3 | 前端：`cd ../frontend && npm ci && npm run build` | 通過，無 `EBADENGINE` 警告 |
| A2-4 | 啟動後端：`cd backend && npm run dev`（port 3000）；啟動日誌無 `smbclient` 警告（本機已裝） | 「FineReport 備份 API 已啟動」 |
| A2-5 | 啟動前端：`cd frontend && npm run dev`，瀏覽器開 `http://localhost:5174/finereport-backup/` | 頁面正常載入 |
| A2-6 | UI 功能測試（用測試 SSH 主機與 NAS，不得用正式機憑證）：SSH＋sudo 驗證 → NAS 驗證與目錄瀏覽 → 4 碼人工驗證 → 小型來源完整備份（SFTP→NAS 寫入→報告產生） | 備份完成、NAS 有檔案與報告 |
| A2-7 | 失敗續傳：備份中途讓它失敗（例如中斷網路）→ 「從失敗處續傳」→ 「全部重來」各一次 | 兩種模式皆可完成 |
| A2-8 | 重整頁面測試前端重連（`sessionStorage` 的 `backupId`）與 SSE 進度顯示 | 進度可恢復 |

**A-2 執行紀錄（本機 Mac，Node v24.22.1／npm 11.19.1，2026-10-28）**

| 步驟 | 結果 |
|------|------|
| A2-1 `nvm use` | 通過：`v24.22.1` |
| A2-2 backend `npm ci`／`build`／`test` | 通過：`tsc` 無錯誤，15/15 測試通過 |
| A2-3 frontend `npm ci`／`build` | 通過：`tsc -b && vite build`，352 modules |
| A2-4～A2-8 | 待執行 |

**事件紀錄（2026-10-28 15:11）**：本機執行 `npm audit fix` 後，`backend/package.json` 的 `zod` 由 `^3.22.4` 被升為 `^4.6.7`，前後端 `package-lock.json` 一併被改寫。zod 4 移除 `ZodError.errors`，造成 `src/routes/backup.ts` L242 `TS2339` 而 backend build 失敗。處置：將 `backend/package.json`、`backend/package-lock.json`、`frontend/package-lock.json` 還原至 HEAD（zod 回到 `^3.22.4`）後重跑，A2-1～A2-3 通過。**與 Node 升級無關；後續不得再對本專案執行 `npm audit fix`。**

**依賴漏洞（`npm ci` 後 `npm audit` 提示，未處理）**：backend 7 項（1 low、2 moderate、3 high、1 critical）；frontend 12 項（2 low、2 moderate、8 high）。屬依賴套件漏洞，不在 202610 Node 公告範圍，建議 Node 收尾後另案評估，不併入本次。

**Phase A 完成條件**：A2-1～A2-8 全數通過。任一失敗 → 停止，不進 Phase B，把終端輸出貼給我判讀。

**注意**：本機直接執行不會涵蓋 Docker 層（`bookworm-slim` 內 `apt` 安裝、`ssh2` 原生模組編譯、`CAP_SYS_ADMIN` CIFS 掛載、`node:24.22.1-alpine` tag），這些風險首次出現在正式機，因此 Phase B 採「先 build、確認成功再換容器」。

#### Phase B：正式機（由你手動處理，Phase A 通過後）

| 步驟 | 內容 | 驗收 |
|------|------|------|
| B0 | 備份 `DATA_ROOT`；`docker exec enterprise-finereport-backup-backend node --version` 記錄升級前版本（預期 v18.x）；確認沒有進行中的備份工作 | 實測值記錄 |
| B1 | 將已 commit 的程式碼同步到正式機；`grep -n 'FROM node:' …/Dockerfile.*` 確認釘版 | 後端 `22.23.4-bookworm-slim`、前端 `24.22.1-alpine` |
| B2 | 保留舊映像供回滾：`docker tag <現行 image id> finereport-backup-backend:pre-202610` | 標籤存在 |
| B3 | 先無快取 build，**build 成功再** `up -d` 換容器；build 失敗則舊容器不受影響 | build 成功、容器 running |
| B4 | 驗證 `node --version`、`smbclient`／`mount.cifs`、日誌、HTTP 200、**經入口 nginx 的 `/finereport-backup/api/` 回 403 而非 502**；再做與 A2-6、A2-7 相同的功能煙霧測試 | 全通過 |

```bash
# B3
cd /opt/apps/enterprise-portal/deploy
DOCKER_BUILDKIT=0 docker compose build --no-cache finereport-backup-backend finereport-backup-frontend 2>&1 | tee /tmp/build-finereport.log
docker compose up -d finereport-backup-backend finereport-backup-frontend

# B4
docker exec enterprise-finereport-backup-backend node --version               # 須 ≥ v22.23.4
docker compose ps finereport-backup-backend finereport-backup-frontend
docker logs --tail 80 enterprise-finereport-backup-backend                    # 不應出現 ERR_NAS_MOUNT
docker exec enterprise-finereport-backup-backend which smbclient mount.cifs
curl -s -o /dev/null -w "%{http_code}\n" http://localhost/finereport-backup/  # 200
```

**回滾**：compose 的 `image:` 指回 `finereport-backup-backend:pre-202610`，`docker compose up -d finereport-backup-backend`。

#### Phase B 事件紀錄（2026-10-28 正式機）

| 項目 | 內容 |
|------|------|
| 現象 | 重建 `finereport-backup-backend`／`-frontend` 後，頁面可載入，但 `/finereport-backup/api/*`（`last-job`、`verify-ssh`）回 **502 Bad Gateway** |
| 排除 | 後端容器本身正常：`node --version` = v22.23.4、`localhost:3000/health` healthy、`smbclient`／`mount.cifs` 存在；前端 bundle 載入 200 |
| 證據 | `enterprise-portal-nginx` 錯誤日誌：`host.docker.internal could not be resolved (3: Host not found)`；容器內 `getent hosts host.docker.internal` = `172.17.0.1`（成功），`nslookup host.docker.internal 127.0.0.11` = `NXDOMAIN`，`wget http://host.docker.internal:3000/health`（系統解析）成功 |
| 根因 | `deploy/nginx/nginx.conf` 該 location 使用「變數型 `proxy_pass`」，nginx 改走全域 `resolver 127.0.0.11`（Docker 內建 DNS）；`host.docker.internal` 只存在於 `extra_hosts` 寫入的 `/etc/hosts`，內建 DNS 回 NXDOMAIN。**與 Node 升級無關**；該設定檔最後修改為 2026-09-26 |
| 修正 | 該 location 改為固定字串型 `proxy_pass http://host.docker.internal:3000/api/;`，移除 `set` 與 `rewrite`（nginx 啟動時以系統解析讀 `/etc/hosts`；host-gateway IP 不隨後端容器重建而變） |
| 驗證補強 | B4 增列：**經入口 nginx** 呼叫 `curl -s -o /dev/null -w "%{http_code}\n" http://localhost/finereport-backup/api/backup/last-job`，預期 **403**（`ERR_NOT_VERIFIED`，代表已打到後端）；502 代表入口到後端不通。先前只測後端本身與前端頁面，漏掉入口到後端這一段 |

#### Phase C：文件同步（Phase B 全數通過後才進行）

| 步驟 | 內容 | 驗收 |
|------|------|------|
| C1 | 修正 3 處殘留：`CLAUDE.md` L37、`README.md` L418（「前端 Dockerfile 需要 Node 22」→ 前端 builder 為 `node:24.22.1-alpine`，因 shared-ui `engines >=24.22.1`）；`1.docs/2.PLAN/FineReport備份工具-開發計畫.md` L11 badge `18+` → `22+`。**由我先給 diff，你審閱後套用** | grep 無舊敘述 |
| C2 | 回填處置文件 §7 表單一列（欄位見 §7） | 表單有本專案列 |
| C3 | 通知處置文件負責人更新 §5.5 結案勾選 | — |

### 5.5 待對齊決策點

| # | 問題 | 我的建議 |
|---|------|----------|
| D1 | Phase A 的 A2-6 功能測試要用哪組測試 SSH 主機與 NAS？ | 請指定；不得使用正式機憑證 |
| D2 | 正式機部署採「先合併 `main` 再部署」或「直接部署修補分支」？（由你手動操作） | 先合併再部署，避免正式機與主線分歧 |
| D3 | 正式機維護窗時間？ | 非尖峰；備份工作執行中不得重建 |

### 5.6 風險

- 本機驗證不含 Docker 層：Node 18→22 後 `ssh2` 原生模組在 bookworm-slim 內的編譯／載入、`node:24.22.1-alpine` tag 是否存在、容器內 CIFS 掛載（需 `SYS_ADMIN`）都要到正式機 build 才首次驗證。緩解：B3 先 build 後換容器、B2 保留舊映像、B4 立即煙霧測試，失敗即依回滾步驟還原。
- 沙箱驗證使用 Node 22.23.4，與本機 24.22.1 不同；A2-1～A2-3 即為補這個差異。

## 6. 參考文件

| 文件 | 說明 |
|------|------|
| `0.docs/2.資安弱點漏洞處理/202610_Node.js-Go緊急安全更新處置.md` | 結案條件 §5.5 |
| `0.docs/2.資安弱點漏洞處理/202610_Node.js-Go緊急安全更新_正式機Docker升級操作清單.md` | §5.3 專案 4 正式機步驟 |
| `0.docs/2.資安弱點漏洞處理/202610_Node.js-Go緊急安全更新_各專案執行結果報告.md` | §5.3 本專案升級明細 |
| `0.docs/2.資安弱點漏洞處理/202610_Node.js-Go緊急安全更新_收尾PLAN.md` | 全案收尾 PLAN |

## 7. 使用表單

Phase C2 回填處置文件 §7 表單，本專案填寫如下（Phase B 完成後填入實測值）：

| 欄位 | 內容 |
|---|---|
| 設備／主機名稱 | 正式機（容器 `enterprise-finereport-backup-backend`／`-frontend`） |
| 負責人 | 專案負責人 |
| 環境類型 | 容器 |
| 升級前 Node.js 版本 | B0 實測（預期 v18.x） |
| 升級後 Node.js 版本 | B4 `node --version` 實測 |
| 驗證項目 | Phase A（A-1 沙箱、A2-1～A2-8 本機）＋ Phase B（B4） |
| 結果 | 通過／未通過 |
| 備註 | 分支 `security/202610-node-patch`；commit `653421c`、`3928073`、`138957f`。2026-10-28 本機執行 `npm audit fix` 造成 `zod` 被升至 4.x 而 backend build 失敗（`ZodError.errors` 已移除），已還原 `package.json`／`package-lock.json` 至 HEAD 後通過；與 Node 升級無關。依賴漏洞（backend 7、frontend 12 項）另案處理 |
