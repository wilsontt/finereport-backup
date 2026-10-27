# FineReport 備份工具｜202610 Node.js 緊急安全更新收尾 PLAN

**建立日期**：2026-10-27
**依據文件**：`0.docs/2.資安弱點漏洞處理/202610_Node.js-Go緊急安全更新處置.md`（v1.4.1）
**狀態**：草案，待與專案負責人對齊 §5.4 決策點後定稿

## 1. 目的

依處置文件 §5.5 結案條件，確認「4.FineReport備份工具」的升級完成度，並訂出補齊缺口的步驟與驗收方式。

## 2. 範圍

- 納入：`backend/`、`frontend/`、`Dockerfile.backend`、`Dockerfile.frontend`、`.nvmrc`、本專案 README／CLAUDE.md／`1.docs`，以及正式機 `finereport-backup-backend`、`finereport-backup-frontend` 兩個服務。
- 不納入：其他子專案、`0.shared-ui` 本身、`nginx` 入口層（另案）、Go／PHP（本專案不適用）。
- 本 PLAN 不含程式碼變更；待對齊後另行實作。

## 3. 權責

| 角色 | 權責 |
|------|------|
| 專案負責人 | 決定 §5.4 決策點、審閱並合併 `security/202610-node-patch` |
| 開發人員 | 文件殘留修正、推送分支 |
| 建置／部署負責人 | 正式機 `--no-cache` 重建、煙霧測試、回填處置文件 §7 表單 |

## 4. 名詞解釋

| 名詞 | 說明 |
|------|------|
| 修補版 | Node 22.x ≥ `22.23.4`；24.x ≥ `24.22.1` |
| 執行期服務 | 容器內以 Node 進程對外服務者；本專案為 `finereport-backup-backend` |
| builder | 多階段建置中僅用於編譯的 Node 階段；本專案前端 runtime 為 nginx，無 Node |

## 5. 作業內容

### 5.1 結論

**Repo 內升級已完成，但整體尚未結案。** 缺口為：正式機未重建（P0）、修補分支未合併且疑似未推送、3 處文件殘留、§7 表單未登記。

### 5.2 現況盤點（2026-10-27 實測）

| 結案條件（處置文件 §5.5） | 現況 | 判定 |
|---|---|---|
| `.nvmrc` 納入版控 | 根目錄 `.nvmrc` = `24.22.1`，已 commit（`653421c`） | 完成 |
| `engines` | `backend/package.json`、`frontend/package.json` 皆 `>=22.23.4` | 完成 |
| `Dockerfile.backend` 釘版 | `node:22.23.4-bookworm-slim`（原 `node:18-bookworm-slim`，跨 major 18→22） | 完成 |
| `Dockerfile.frontend` 釘版 | `node:24.22.1-alpine`（符合 shared-ui `engines >=24.22.1`） | 完成 |
| 本機建置驗證 | 既有報告：backend `build`、`test` 15/15、frontend `build` 通過（Node 22.23.4）；`lint` 因 `eslint` 未列依賴而不適用（既有缺口） | 完成 |
| 本機 Node 版本 | 開發機僅裝 `v24.22.1` | 完成 |
| 修補進入主線 | 分支 `security/202610-node-patch` 領先 `main` 3 筆（`653421c`、`3928073`、`138957f`）；`main` 尚無修補。本機無 `origin/security/...` 追蹤分支，**推送狀態需你確認**（我這邊無法連 GitHub） | **未完成** |
| 文件同步 | 見下方殘留清單 | **未完成** |
| **正式機 `--no-cache` 重建並換容器** | 無任何執行紀錄 | **未完成（P0）** |
| 正式機 `docker exec … node --version` | 無驗證紀錄 | **未完成（P0）** |
| §7 表單登記 | 尚無本專案列 | **未完成** |

**文件殘留（grep 實測）**

| 檔案 | 位置 | 現況 | 應改為 |
|---|---|---|---|
| `CLAUDE.md` | L37 | 「前端 Dockerfile 需要 Node **22**（Vite 7 的限制）」 | 前端 builder 為 `node:24.22.1-alpine`（shared-ui `engines >=24.22.1`） |
| `README.md` | L418 | 同上句 | 同上 |
| `1.docs/FineReport備份工具-開發計畫.md` | L11 | Node.js badge `18+` | `22+` |

`README.md` L381 為歷史錯誤日誌引用（`FROM node:22-alpine`），依既有報告決定不改。

### 5.3 執行步驟

| 步驟 | 優先 | 內容 | 負責 | 驗收 |
|---|---|---|---|---|
| S0 | P0 | 取得正式機現況：`docker exec enterprise-finereport-backup-backend node --version`（預期仍為 v18.x）、`docker compose ps` | 部署 | 實測版本記錄 |
| S1 | P2 | 修正上表 3 處文件殘留（單一 commit：`docs(security): …`） | 開發 | `grep -rnE "Node \*\*22\*\*\|Node.js-18" --exclude-dir=node_modules .` 無結果 |
| S2 | P0 | 推送 `security/202610-node-patch`，審閱後合併 `main`（見 D2） | 專案負責人 | `git log origin/main` 含上述 4 筆 commit |
| S3 | P0 | 正式機同步程式碼（依部署手冊），先確認 tag 存在：`docker pull node:24.22.1-alpine && docker pull node:22.23.4-bookworm-slim` | 部署 | 兩個 tag 皆 pull 成功 |
| S4 | P0 | 備份 `DATA_ROOT` 後無快取重建並換容器（指令見下） | 部署 | build 成功、容器 running |
| S5 | P0 | 驗證與煙霧測試（指令見下） | 部署 | 全項通過 |
| S6 | P1 | 回填處置文件 §7 表單一列 | 部署／文件 | 表單有「正式機：finereport-backup」列 |

**S4 指令**（正式機，非尖峰時段）：

```bash
cd /opt/apps/enterprise-portal/deploy
DOCKER_BUILDKIT=0 docker compose build --no-cache \
  finereport-backup-backend finereport-backup-frontend 2>&1 | tee /tmp/build-finereport.log
docker compose up -d finereport-backup-backend finereport-backup-frontend
```

**S5 驗證**：

```bash
docker exec enterprise-finereport-backup-backend node --version          # 須 ≥ v22.23.4
docker compose ps finereport-backup-backend finereport-backup-frontend   # running
docker logs --tail 80 enterprise-finereport-backup-backend               # 不應出現 ERR_NAS_MOUNT: Unable to apply new capability set
docker exec enterprise-finereport-backup-backend which smbclient mount.cifs   # 兩者皆存在
curl -s -o /dev/null -w "%{http_code}\n" http://localhost/finereport-backup/   # 200
```

功能煙霧測試（Node 18→22 跨 major，風險集中於此）：
1. SSH 驗證 + sudo 驗證（`ssh2` 原生模組 `cpu-features`／`sshcrypto` 於 22 載入正常）
2. NAS 驗證與目錄瀏覽（`smbclient`）
3. 對一個小型來源執行完整備份：SFTP → CIFS 掛載寫入 → 報告產生
4. 失敗後「從失敗處續傳」可執行（驗證 `POST /start` `mode`）

**回滾**：重建前以 `docker tag <現行 image id> finereport-backup-backend:pre-202610` 保留舊映像；失敗時改 compose `image:` 指回該 tag 並 `up -d`。

### 5.4 待對齊決策點

| # | 問題 | 我的建議 |
|---|---|---|
| D1 | `security/202610-node-patch` 是否已推送到 GitHub？ | 請你確認；若未推送，S2 先推送 |
| D2 | 正式機「先合併 `main` 再部署」或「直接部署修補分支」？ | 先合併再部署，避免正式機與主線分歧 |
| D3 | 重建維護窗時間？ | 非尖峰；備份工作執行中不得重建（會中斷 SSE 與進行中的 job） |
| D4 | S1 的 3 處文件修正是否由我直接做並先給 diff？ | 是，先給 diff 你審閱後再套用 |
| D5 | 是否另案處理：`backend/node_modules`、`frontend/node_modules`、`dist` 被 git 追蹤（目前工作區 200+ 筆雜訊變更）、`eslint` 未列依賴？ | 與本次資安無關，建議另案，不併入本次 |

### 5.5 風險

- Node 18→22 後原生模組在 bookworm-slim 內的編譯／載入尚未在實際映像驗證（既有報告環境無 docker）；`ssh2` 的 `cpu-features` 為 optional，失敗時會退回純 JS，但仍應以 S5 煙霧測試確認。
- `node:24.22.1-alpine` tag 是否存在於 registry 尚未驗證；S3 必須先 pull。

## 6. 參考文件

| 文件 | 說明 |
|---|---|
| `0.docs/2.資安弱點漏洞處理/202610_Node.js-Go緊急安全更新處置.md` | 結案條件 §5.5 |
| `0.docs/2.資安弱點漏洞處理/202610_Node.js-Go緊急安全更新_正式機Docker升級操作清單.md` | §5.3 專案 4 逐步指令 |
| `0.docs/2.資安弱點漏洞處理/202610_Node.js-Go緊急安全更新_各專案執行結果報告.md` | §5.3 本專案升級明細 |
| `0.docs/2.資安弱點漏洞處理/202610_Node.js-Go緊急安全更新_收尾PLAN.md` | 全案收尾 PLAN |

## 7. 使用表單

回填處置文件 §7 表單，本專案建議填寫如下（待 S5 完成後填入實測值）：

| 欄位 | 內容 |
|---|---|
| 設備／主機名稱 | 正式機（容器 `enterprise-finereport-backup-backend`／`-frontend`） |
| 負責人 | 建置／部署負責人 |
| 環境類型 | 容器 |
| 升級前 Node.js 版本 | S0 實測（預期 v18.x） |
| 升級後 Node.js 版本 | S5 `node --version` 實測 |
| 驗證項目 | S5 指令 5 項＋功能煙霧測試 4 項 |
| 結果 | 通過／未通過 |
| 備註 | 分支 `security/202610-node-patch`；commit `653421c`、`3928073`、`138957f` |
