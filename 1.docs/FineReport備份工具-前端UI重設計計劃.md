# FineReport 備份工具 — 前端 UI 重設計計劃（UI Only, Logic Frozen）

![版本](https://img.shields.io/badge/版本-v1.0.0-blue)
![狀態](https://img.shields.io/badge/狀態-設計中-yellow)
![文件類型](https://img.shields.io/badge/文件類型-UI_PLAN-blue)

**專案**：FineReport 備份工具  
**主題**：前端 UI 重設計（僅 View，不修改程式邏輯）  
**參考基準**：
- UI UX Pro Max 設計系統（Minimalism & Soft UI，Micro-interactions）
- 內部範本：`16-Micro-interactions.html`

---

## 1. 目的

在**不修改任何前端/後端程式邏輯**的前提下，重新設計 FineReport 備份工具前端 UI，使其達到：

- Figma 級別的結構清晰度（Layout / Component Hierarchy / Token 化樣式）
- 一致的 Design System（顏色、字體、間距、圓角、陰影、動效）
- 對應備份流程的「導覽清晰度」與「錯誤可理解度」

本計劃僅針對 React Component 的 **JSX 結構與 CSS / className** 進行調整，不更動：

- `useState` / `useEffect` 等狀態管理
- `backupApi` 呼叫邏輯
- 型別定義與資料流向

---

## 2. 範圍

### 2.1 涵蓋元件

| 區塊 | 檔案 | 說明 |
|------|------|------|
| 憑證輸入（SSH / sudo / NAS） | `frontend/src/components/CredentialForm.tsx` | 三階段導覽式表單 |
| 人機驗證 | `frontend/src/components/HumanVerification.tsx` | 4 碼驗證碼 |
| 路徑確認與瀏覽 | `frontend/src/components/PathSelector.tsx` | 遠端來源 + NAS 根目錄 + Modal Browser |
| 備份執行與進度 | `frontend/src/components/BackupProgress.tsx` | 進度條 / 日誌 / 報告 |
| 頁面框架 | `frontend/src/App.tsx` | Stepper / 頂部 Header |

### 2.2 不在範圍（禁止變更）

- 任何 `backupApi` 呼叫與參數結構
- 後端 API 與 Schema (`backend/src/**`)
- 業務邏輯（例如：何時允許進入下一步、何時發送請求）

---

## 3. UI 設計策略（對齊 UI UX Pro Max）

### 3.1 整體風格與 Layout

- **Style**：Minimalism + Soft UI Evolution  
  - 背景：`bg-slate-50` / `bg-slate-900` 頂欄  
  - 卡片：大圓角 `rounded-2xl`、柔和陰影 `shadow-xl shadow-slate-200/60`
  - 文字：`text-slate-800` 主要文字、`text-slate-500` 次要說明
- **Layout**：
  - 中央卡片寬度 `max-w-2xl`，上下留白 `py-8`，適應 1366 / 1920 解析度
  - 上方固定 Header（系統名稱 + 標籤），下方為內容卡片

### 3.2 Stepper 與流程引導

- 使用 UI UX Pro Max 推薦的「**橫向 Stepper + 縱向 Flow**」混合：
  - 頁面頂部橫向 Stepper（4 個步驟）：`憑證 / 安全驗證 / 目錄 / 備份`
  - 卡片內部採用縱向時間軸樣式，左側為 Icon + 線，右側為表單卡片
- 動態狀態：
  - 當前步驟：實心色塊 + 外圈 `ring` 動畫
  - 已完成：實心淺藍背景 + 勾勾或淺色 Icon
  - 未到達：灰階 + 降低不透明度 + `pointer-events-none`

### 3.3 表單與錯誤狀態

- 表單欄位採用一致樣式：
  - `bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5`
  - Focus 時加上 `ring-2 ring-blue-500/20 border-blue-500`
- 錯誤提示：
  - 單一欄位錯誤：紅色文字 `text-red-500 text-xs mt-1`，邊框使用 `border-red-400 bg-red-50`
  - 全域錯誤：卡片下方使用 `alertError` 元件，含 icon + 文案

### 3.4 Micro-interactions（參考 `16-Micro-interactions.html`）

針對每個關鍵操作加入小型互動：

- 按鈕：
  - Hover：背景色從 `bg-slate-900` 緩動至 `bg-slate-800`（150–200ms）
  - Active：縮小 `scale-95` 回彈
  - Loading：顯示 `Loader2` 轉圈 + 文案切換為「驗證中…」
- 密碼顯示切換：
  - `Eye / EyeOff` icon 具 hover 色彩變化，避免突兀
- Step 切換：
  - 卡片進出時採用 `slide-in-from-top` / `slide-in-from-bottom` 等 Tailwind 動畫 class
- 進度條：
  - 前景色加上 `pulse` 動畫表現進行中狀態

---

## 4. 元件別設計重點（UI / JSX 結構）

### 4.1 `CredentialForm`（本次優先實作）

- **結構**：
  - 外層：`<div className="animate-in ...">`
  - 卡片：`UI_PRO_MAX.card`（集中管理 card 樣式）
  - Header：Icon + 標題 + 說明文字（`UI_PRO_MAX.cardHeader`）
  - Body：垂直時間軸，三個 Step 區塊：
    1. SSH 連線表單
    2. sudo 密碼 + 警示 Banner
    3. NAS 帳密 + Share + Path
- **狀態表示**：
  - 透過 `step` 改變各 Step 的樣式與 `pointer-events`
  - Field Error 透過 `fieldErrors` 物件集中管理，避免重複 state

### 4.2 其他元件（之後依序套用）

僅列要點，不在本次改動範圍的程式碼：  
（後續若需要會依相同設計模式補上）

- `HumanVerification`：放大四碼數字、加入成功動畫與「繼續」按鈕
- `PathSelector`：使用 Split Layout（左側遠端來源 / 右側 NAS），Modal 走 Full-screen Overlay + Card
- `BackupProgress`：進度卡片 + 終端機風格日誌 + 報告卡片，全部用 Design System class 統一。

---

## 5. 任務拆解（UI-Only）

### 5.1 第一階段（當前要做）

- [x] 建立 Design System 常數（`UI_PRO_MAX`）— 已完成
- [x] 重寫 `CredentialForm` 的 JSX / className：
  - 不修改任何 `useState` 或 `backupApi` 呼叫
  - 僅重構 DOM 結構與 CSS class

### 5.2 後續可選（未在本次請求中執行）

- [ ] 套用同一套 Design System 至 `HumanVerification` / `PathSelector` / `BackupProgress`
- [ ] 整合設計系統文件到專案總體文件（例如：企業入口網站整體 Design System）

---

## 6. 驗證方式

1. 前後端啟動方式不變（依現有 README 說明）。  
2. 進入 FineReport 備份工具頁面，操作 **憑證輸入三步驟**：
   - SSH 無輸入帳密時顯示欄位錯誤（紅框 + 說明文字），不觸發 API。
   - sudo 密碼缺漏時僅顯示單行錯誤，不進下一步。
   - NAS 帳密錯誤時，後端回傳錯誤，前端以 alert 卡顯示紅色錯誤。
3. 確認畫面所有變化皆為樣式與結構，沒有多發或少發任何 API。

---

## 7. 文件影響說明

- 本文件為 FineReport 備份工具前端 UI 重設計之主控文件。  
- 若未來將 UI 規模擴大為整個「企業入口網站」級別 Design System，建議在 `0.docs/` 下新增統一的 `DesignSystem-前端介面規格.md`，並自本文件抽取共通段落（色彩、字體、按鈕樣式等）作為全站規範。

