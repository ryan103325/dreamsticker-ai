# DreamSticker AI

這是一個基於 AI 的 Line 貼圖生成工具，使用 Google Gemini 模型來發想、設計與生成貼圖。

## 功能特色
- **自動發想**：輸入主題，AI 自動產生貼圖點子。
- **角色設計**：上傳參考圖或描述，產生一致的角色設計圖。
- **貼圖生成**：支援單張生成與 T-Layout 團體貼圖生成。
- **自動去背**：透過 OpenCV 自動處理綠幕去背。

## 快速開始 (Getting Started)

### 1. 安裝環境
請確保您已安裝 Node.js (建議 v20+)。

```bash
# 安裝依賴套件
npm install
```

### 2. 設定 Environment Variables (可選)
本專案支援兩種 API Key 輸入方式：
1. **介面輸入 (推薦)**：直接啟動網頁，在首頁 Landing Page 輸入您的 Gemini API Key。Key 會儲存在瀏覽器的 `localStorage` 中，不會上傳至伺服器。
2. **環境變數 (開發用)**：您也可以在專案根目錄建立 `.env.local` 檔案來預設 Key：

```bash
# .env.local
VITE_GEMINI_API_KEY=你的_Google_Gemini_API_Key
```

**注意**：此專案的 `.gitignore` 已設定忽略 `.env` 相關檔案。

### 3. 啟動開發伺服器
```bash
npm run dev
```

### 4. 建置生產版本
```bash
npm run build
```

## 部署 (Deployment)

本專案已設定 GitHub Actions 自動部署至 GitHub Pages。

1. **Push 程式碼**：將程式碼推送到 GitHub 的 `main` 分支。
2. **GitHub 設定**：
   - 進入 GitHub Repository 的 **Settings** > **Pages**。
   - Source 選擇 **GitHub Actions**。
   - 進入 **Settings** > **Secrets and variables** > **Actions**。
   - 新增 Repository secret: `GEMINI_API_KEY` (如果你的 CI/CD 流程需要它來測試，否則純前端部署通常在 Runtime 需要使用者輸入，或是在 Build time 注入 `VITE_` 變數)。
     - *本專案目前的邏輯是執行時讀取，部署後您可以選擇在介面輸入 Key，或是利用 VITE_ 前綴注入。*

## 技術架構
- **Frontend**: React 19, Vite, TypeScript
- **Styling**: Tailwind CSS
- **AI**: Google Gemini API (`@google/genai`)
- **Image Processing**: OpenCV.js, jszip, upng-js

## 授權
MIT
