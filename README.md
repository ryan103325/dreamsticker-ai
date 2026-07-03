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

### 2. 設定 API Key
直接啟動網頁，在首頁 Landing Page 輸入您的 Gemini API Key。
- 預設 Key 僅保留於本次連線（記憶體），重新整理後需重新輸入。
- 勾選「記住 API Key」後，Key 會以 Base64 形式儲存在瀏覽器的 `localStorage`，僅存於您的裝置，不會上傳至任何伺服器。

### 2.5 生成品質 / 成本模式
主畫面提供兩種生圖模式（可隨時切換，設定會記住）：

| 模式 | 使用模型 | 特性 | 約略成本 |
|------|---------|------|---------|
| 💎 高品質 | `gemini-3-pro-image-preview` | 網格/版面遵循度最佳，支援 2K/4K | ~$0.13–0.24 / 張大圖 |
| 🪙 經濟 | `gemini-2.5-flash-image` | 便宜 3~6 倍，1024px，適合 8–16 張小套組 | ~$0.04 / 張大圖 |

高品質模式生成失敗時會自動降級改用經濟模型重試。模型 ID 可用環境變數覆寫（因 preview 模型可能更版）：

```bash
# .env.local（皆為選填）
VITE_IMAGE_MODEL_PRO=gemini-3-pro-image-preview
VITE_IMAGE_MODEL_FLASH=gemini-2.5-flash-image
VITE_TEXT_MODEL=gemini-2.5-flash
```

### 2.6 Google 帳號登入（選用）
可讓使用者以 Google 帳號登入（顯示頭像與名稱、個人化體驗）。注意：登入不能取代 Gemini API Key，Key 仍需自行提供。

設定步驟：
1. 前往 [Google Cloud Console → API 和服務 → 憑證](https://console.cloud.google.com/apis/credentials)。
2. 建立「OAuth 2.0 用戶端 ID」，應用程式類型選「網頁應用程式」。
3. 在「已授權的 JavaScript 來源」加入您的網域（例如 `http://localhost:3000` 與 GitHub Pages 網址）。
4. 將取得的 Client ID 設定為環境變數：

```bash
# .env.local
VITE_GOOGLE_CLIENT_ID=你的-client-id.apps.googleusercontent.com
```

未設定時，登入按鈕會自動隱藏，功能不受影響。GitHub Actions 部署時請將其加入 Repository Secrets 並在 workflow 傳入。

### 3. 啟動開發伺服器
```bash
npm run dev
```

### 4. 建置生產版本
```bash
npm run typecheck   # TypeScript 型別檢查
npm run build       # 產出 dist/
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
