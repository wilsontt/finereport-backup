# FineReport 備份工具 — 前端 UI 重設計計畫

![版本](https://img.shields.io/badge/版本-v1.0.0-blue)
![狀態](https://img.shields.io/badge/狀態-已完成-green)
![文件類型](https://img.shields.io/badge/文件類型-UI_PLAN-blue)

**專案**：FineReport 備份工具  
**主題**：前端 UI 重設計（僅 View，不修改程式邏輯）  
**完成日期**：2026-03-14

---

## 1. 目的

在**不修改任何前端/後端程式邏輯、狀態管理或 API 呼叫**的前提下，依照參考圖片，將 FineReport 備份工具的前端 UI 全面翻新為現代化、簡潔的卡片式設計。

---

## 2. 範圍

| 區塊 | 檔案 | 說明 |
|------|------|------|
| 全域樣式 | `frontend/src/index.css` | 引入 CSS 變數與共用類別 |
| 頁面框架 | `frontend/src/App.tsx` | 主佈局與背景調整 |
| 憑證輸入 | `frontend/src/components/CredentialForm.tsx` | 套用卡片與雙欄設計 |
| 路徑確認 | `frontend/src/components/PathSelector.tsx` | 重構 Modal 與表單列表 |
| 人機驗證 | `frontend/src/components/HumanVerification.tsx` | 同步視覺風格 |
| 備份進度 | `frontend/src/components/BackupProgress.tsx` | 同步視覺風格 |

---

## 3. UI 設計策略

### 3.1 全域樣式設定 (`index.css`)

- **色彩計畫**：引入現代化的色彩變數：
  - 主要藍色：`#2563eb`
  - 背景淺灰：`#f8f9fa`
  - 邊框灰：`#e5e7eb`
  - 文字深灰：`#1f2937`
  - 次要文字灰：`#6b7280`
- **共用元件類別**：
  - `.card`：白色背景、圓角（`12px`）、柔和陰影、內部留白。
  - `.input-group`：處理 Label 與 Input 的上下排列與間距。
  - `.input-field`：統一的輸入框樣式（圓角、邊框、Focus 時的藍色光暈）。
  - `.btn-primary` / `.btn-secondary`：主按鈕（滿版藍色、白字、圓角）與次要按鈕（灰字或外框）。
  - `.grid-2-col`：用於達成左右兩排的表單佈局。

### 3.2 主佈局調整 (`App.tsx`)

- 將原本單調的白底改為淺灰底色（`#f8f9fa`），讓內容卡片更加凸顯。
- 調整主容器的置中對齊與最大寬度（`768px`），使其在桌面版與寬螢幕上有更好的閱讀體驗。

### 3.3 憑證輸入表單 (`CredentialForm.tsx`)

- **捨棄舊版垂直步驟條**：改用單一焦點的卡片設計。
- **標題區塊**：加入大標題「輸入存取憑證」與副標題「請依序輸入伺服器與儲存裝置的驗證資訊」。
- **區塊標題**：加入圖示（如 SSH 終端機、Root 盾牌、NAS 硬碟 SVG 圖示）與粗體文字。
- **雙欄表單佈局**：將主機、網域、使用者、密碼等欄位，套用 `.grid-2-col` 達成左右並排。
- **密碼欄位**：加入右側的「眼睛」SVG 圖示，用於切換顯示/隱藏密碼。
- **按鈕**：改為滿版的藍色主按鈕。

### 3.4 瀏覽路徑 Modal (`PathSelector.tsx`)

- **Modal 容器**：套用 `.modal-overlay` 與 `.modal-content`，加入圓角與明顯的浮凸陰影。
- **標題列**：左側為標題，右側加入「X」關閉按鈕。
- **目錄列表**：將原本的純文字按鈕改為帶有資料夾 SVG 圖示的列表，並加入了 Hover 效果。
- **錯誤訊息**：改為帶有淺紅背景與紅字的提示區塊。
- **底部按鈕**：將「取消」與「選擇此路徑」靠右對齊，並分別套用次要與主要按鈕樣式。

### 3.5 其他元件視覺同步 (`HumanVerification.tsx` & `BackupProgress.tsx`)

- **4 碼數字驗證**：套用卡片設計，將驗證碼顯示改為明顯的大字體與間距，並將輸入框置中對齊。
- **備份進度**：
  - 將進度條改為更細緻的圓角樣式。
  - 作業日誌與完成報告的區塊加入了圓角、邊框與背景色區分。
  - 勾選「刪除遠端舊備份」的選項也套用了更清晰的排版。

---

## 4. 執行確認

此計畫已執行完畢，完全沒有更動到 `useState`、`useEffect`、API 呼叫或任何業務邏輯，純粹進行了視覺與排版的重構，並已通過編譯檢查。