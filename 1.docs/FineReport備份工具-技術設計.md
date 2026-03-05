# FineReport 備份工具 — 技術設計

![版本](https://img.shields.io/badge/版本-v1.0.0-blue)
![狀態](https://img.shields.io/badge/狀態-開發中-yellow)
![文件類型](https://img.shields.io/badge/文件類型-技術設計-blue)

**專案**：FineReport 備份工具  
**版本**：v1.0.0  
**最後更新**：2026-03-02  
**關聯文件**：[開發計畫](./FineReport備份工具-開發計畫.md)、[PRD](./FineReport備份工具-PRD.md)

---

## 1. 目的

本文件提供 FineReport 備份工具之技術設計細化，包含 API 規格、錯誤碼與資料結構，供程式碼實作依據。

---

## 2. API 規格書

**Base URL**：`/finereport-backup/api`（經 Nginx 轉發至後端 `/api`）

### 2.1 統一回應格式

**成功**：
```json
{
  "error": false,
  "data": { ... }
}
```

**失敗**：
```json
{
  "error": true,
  "code": "ERR_XXXX",
  "message": "詳細描述"
}
```

---

### 2.2 POST /api/backup/verify-ssh

驗證 SSH 連線。

**Request**：
```json
{
  "host": "10.9.82.57",
  "username": "crownap",
  "password": "xxx"
}
```

**Response 成功**：
```json
{
  "error": false,
  "data": { "ok": true }
}
```

**Response 失敗**：`code`: `ERR_SSH_CONNECT`、`ERR_SSH_AUTH`

---

### 2.3 POST /api/backup/verify-sudo

驗證 sudo 密碼取得 root。需先完成 verify-ssh，憑證存於 session。

**Request**：
```json
{
  "sudoPassword": "xxx"
}
```

**Response 成功**：
```json
{
  "error": false,
  "data": { "ok": true }
}
```

**Response 失敗**：`code`: `ERR_SSH_NOT_CONNECTED`、`ERR_SUDO_FAILED`

---

### 2.4 POST /api/backup/verify-nas

驗證 NAS 連線。

**Request**：
```json
{
  "host": "10.9.82.22",
  "username": "xxx",
  "password": "xxx",
  "share": "KE20.4.軟硬體系統備份記錄",
  "path": "4.備份記錄/KE"
}
```

**Response 成功**：
```json
{
  "error": false,
  "data": {
    "ok": true,
    "fullPath": "\\\\10.9.82.22\\KE20.4.軟硬體系統備份記錄\\4.備份記錄\\KE"
  }
}
```

**Response 失敗**：`code`: `ERR_NAS_CONNECT`、`ERR_NAS_AUTH`、`ERR_NAS_PATH`

---

### 2.5 POST /api/backup/verify-human

取得 4 碼驗證碼或驗證使用者輸入。需先完成 verify-ssh、verify-sudo、verify-nas。

**取得驗證碼 Request**：
```json
{
  "action": "get"
}
```

**取得驗證碼 Response**：
```json
{
  "error": false,
  "data": {
    "code": "1234",
    "expiresIn": 300
  }
}
```

**驗證 Request**：
```json
{
  "action": "verify",
  "code": "1234"
}
```

**驗證 Response 成功**：
```json
{
  "error": false,
  "data": { "ok": true }
}
```

**Response 失敗**：`code`: `ERR_HUMAN_NOT_READY`、`ERR_HUMAN_MISMATCH`、`ERR_HUMAN_EXPIRED`

---

### 2.6 POST /api/backup/discover-remote

探索遠端目錄，解析 `{latest}`。需先完成所有驗證（含 verify-human）。

**Request**：
```json
{
  "basePath": "/opt/tomcat/webapps/webroot/backup"
}
```

**Response 成功**：
```json
{
  "error": false,
  "data": {
    "sources": [
      {
        "id": "config",
        "label": "平台設定",
        "sourcePath": "/opt/tomcat/webapps/webroot/backup/config/auto/2025.01.03_02.00.00_31913",
        "destPath": "webroot/config",
        "resolved": true
      }
    ]
  }
}
```

**Response 失敗**：`code`: `ERR_DISCOVER_FAILED`、`ERR_NOT_VERIFIED`

---

### 2.7 GET /api/backup/sources

取得預設 + 自訂備份來源。

**Response**：
```json
{
  "error": false,
  "data": {
    "sources": [
      {
        "id": "config",
        "label": "平台設定",
        "sourcePath": "config/auto/{latest}",
        "destPath": "webroot/config",
        "isAbsoluteSource": false
      }
    ]
  }
}
```

---

### 2.8 POST /api/backup/sources

新增自訂備份來源。

**Request**：
```json
{
  "label": "自訂目錄",
  "sourcePath": "/opt/custom/path",
  "destPath": "webroot/custom",
  "isAbsoluteSource": true
}
```

**Response**：
```json
{
  "error": false,
  "data": {
    "id": "custom-xxx",
    "label": "自訂目錄",
    "sourcePath": "/opt/custom/path",
    "destPath": "webroot/custom",
    "isAbsoluteSource": true
  }
}
```

---

### 2.9 POST /api/backup/start

開始備份。

**Request**：
```json
{
  "backupMonth": "202503",
  "sources": [
    {
      "id": "config",
      "sourcePath": "/opt/tomcat/.../config/auto/2025.01.03_02.00.00_31913",
      "destPath": "webroot/config"
    }
  ],
  "nasPath": "4.備份記錄/KE/2026/FineReport",
  "deleteOldBackup": false,
  "retentionMonths": 0
}
```

**Response 成功**：
```json
{
  "error": false,
  "data": {
    "backupId": "uuid-xxx",
    "status": "running"
  }
}
```

**Response 失敗**：`code`: `ERR_BACKUP_START`、`ERR_NOT_VERIFIED`

---

### 2.10 GET /api/backup/progress/:backupId

SSE 進度串流。

**Response**：`Content-Type: text/event-stream`

```
event: progress
data: {"step":"create_dirs","percent":10,"message":"建立目錄中..."}

event: progress
data: {"step":"copy","percent":50,"message":"複製 config..."}

event: done
data: {"step":"complete","percent":100,"reportPath":"..."}
```

---

### 2.11 GET /api/backup/report/:backupId

取得完成報告內容。

**Response 成功**：
```json
{
  "error": false,
  "data": {
    "content": "# FineReport 備份報告\n\n...",
    "format": "markdown",
    "backupId": "uuid-xxx",
    "backupMonth": "202503"
  }
}
```

---

## 3. 錯誤碼定義

| 錯誤碼 | HTTP 狀態 | 說明 |
|--------|-----------|------|
| `ERR_SSH_CONNECT` | 500 | SSH 連線失敗 |
| `ERR_SSH_AUTH` | 401 | SSH 認證失敗 |
| `ERR_SSH_NOT_CONNECTED` | 400 | 尚未完成 SSH 連線 |
| `ERR_SUDO_FAILED` | 401 | sudo 密碼錯誤或無 root 權限 |
| `ERR_NAS_CONNECT` | 500 | NAS 連線失敗 |
| `ERR_NAS_AUTH` | 401 | NAS 認證失敗 |
| `ERR_NAS_PATH` | 400 | NAS 路徑不存在或無權限 |
| `ERR_HUMAN_NOT_READY` | 400 | 尚未完成 SSH/sudo/NAS 驗證 |
| `ERR_HUMAN_MISMATCH` | 401 | 4 碼驗證輸入錯誤 |
| `ERR_HUMAN_EXPIRED` | 401 | 4 碼驗證已過期 |
| `ERR_DISCOVER_FAILED` | 500 | 探索遠端目錄失敗 |
| `ERR_NOT_VERIFIED` | 403 | 未完成必要驗證（含 4 碼） |
| `ERR_BACKUP_START` | 500 | 備份啟動失敗 |
| `ERR_BACKUP_NOT_FOUND` | 404 | 備份任務不存在 |
| `ERR_VALIDATION` | 400 | 請求參數驗證失敗 |
| `NOT_FOUND` | 404 | 找不到請求的資源 |

---

## 4. 資料結構（Schema）

### 4.1 BackupSourceItem

```typescript
interface BackupSourceItem {
  id: string;
  label: string;
  sourcePath: string;
  destPath: string;
  isAbsoluteSource?: boolean;
  resolved?: boolean;  // discover 後為 true，sourcePath 已解析
}
```

### 4.2 VerifySshRequest

```typescript
interface VerifySshRequest {
  host: string;      // IP 或 hostname
  username: string;
  password: string;
}
```

### 4.3 VerifySudoRequest

```typescript
interface VerifySudoRequest {
  sudoPassword: string;
}
```

### 4.4 VerifyNasRequest

```typescript
interface VerifyNasRequest {
  host: string;      // 預設 10.9.82.22
  username: string;
  password: string;
  share: string;     // 如 KE20.4.軟硬體系統備份記錄
  path: string;      // 如 4.備份記錄/KE
}
```

### 4.5 VerifyHumanRequest

```typescript
interface VerifyHumanRequest {
  action: 'get' | 'verify';
  code?: string;     // action=verify 時必填
}
```

### 4.6 StartBackupRequest

```typescript
interface StartBackupRequest {
  backupMonth: string;     // 如 202503
  sources: BackupSourceItem[];
  nasPath: string;         // NAS 相對路徑，如 4.備份記錄/KE/2026/FineReport
  deleteOldBackup: boolean;
  retentionMonths: number; // 0=不刪除, 3, 6, 12, 24
}
```

### 4.7 ProgressEvent

```typescript
interface ProgressEvent {
  step: string;      // create_dirs | copy | chown | download | report | complete
  percent: number;
  message: string;
  reportPath?: string;
}
```

### 4.8 RetentionOption

```typescript
const RETENTION_OPTIONS = [
  { value: 'none', label: '不執行刪除', months: 0 },
  { value: '3', label: '保留 3 個月', months: 3 },
  { value: '6', label: '保留 6 個月', months: 6 },
  { value: '12', label: '保留 1 年', months: 12 },
  { value: '24', label: '保留 2 年', months: 24 },
] as const;
```

---

## 5. Session 與狀態管理

| 狀態 | 說明 | 儲存方式 |
|------|------|----------|
| SSH 連線 | 驗證成功後保持 | 記憶體 Map，key 為 sessionId |
| Sudo 密碼 | 僅用於執行指令，不持久化 | 當次請求使用後清除 |
| NAS 憑證 | 備份時使用，不持久化 | 當次請求使用後清除 |
| 4 碼驗證碼 | 產生後 5 分鐘有效 | 記憶體 Map，key 為 sessionId |
| 備份進度 | backupId 對應進度 | 記憶體 Map |

**SessionId**：可由前端產生 UUID 並於每次請求 Header 傳遞，或使用 cookie。建議 `X-Session-Id` header。

---

## 6. 參考文件

| 文件 | 路徑 |
|------|------|
| 開發計畫 | 1.docs/FineReport備份工具-開發計畫.md |
| PRD | 1.docs/FineReport備份工具-PRD.md |
| 需求確認紀錄 | 1.docs/FineReport備份工具-需求確認紀錄.md |
