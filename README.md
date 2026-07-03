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

### 2.5 生圖引擎、品質與成本

主畫面提供引擎與品質切換（設定會記住）。2026 年 7 月的模型選型分析：

| 模型 | 排名* | 約略成本/張 | 優勢 | 弱點（對本專案） |
|------|------|-----------|------|----------------|
| **Gemini 3 Pro Image**（Nano Banana Pro，預設高品質） | 前段 | $0.13–0.24 | 複雜版面/網格遵循、長文與中文字渲染最強、4K | 最貴 |
| **Gemini 3.1 Flash Image**（Nano Banana 2，預設經濟） | #3 | $0.045–0.15 | 性價比最高、支援 4K 與寬幅、角色一致性佳 | 複雜網格稍遜 Pro |
| **GPT Image 2**（OpenAI，選用引擎） | #1 | $0.05（中）/$0.21（高）；含參考圖 ×2–3 | 指令遵循全場最佳、可到 3840px | 需組織驗證、參考圖計費貴 |
| Seedream 4.5（ByteDance） | 前段 | ~$0.04 | 文字渲染極強、4K、便宜 | 無瀏覽器直連 BYOK 通道（需經 fal/BytePlus 代理） |
| FLUX.2（BFL） | 前段 | 中 | 開放權重、最多 10 張參考圖 | API 無瀏覽器 CORS，需後端 |
| Imagen 4 Ultra（Google） | 前段 | ~$0.03–0.06 | 寫實最強 | 無法用參考圖維持角色一致性 |

\* 生圖競技場盲測排名。**結論**：純前端 + 使用者自帶 Key 的架構下，Gemini 系列（CORS 開放、單一 Key、中文字與網格最強）仍是主引擎最佳解，GPT Image 2 作為進階選用引擎。

模型 ID 可用環境變數覆寫（模型更版時不需改程式碼）：

```bash
# .env.local（皆為選填）
VITE_IMAGE_MODEL_PRO=gemini-3-pro-image
VITE_IMAGE_MODEL_FLASH=gemini-3.1-flash-image
VITE_IMAGE_MODEL_LEGACY=gemini-2.5-flash-image
VITE_TEXT_MODEL=gemini-2.5-flash
VITE_OPENAI_IMAGE_MODEL=gpt-image-2
VITE_OPENAI_IMAGE_MODEL_FALLBACK=gpt-image-1.5
```

### 2.6 生成方式（Strategy）與成本

生圖 API 按「輸出圖片張數」計費，一張 2K 大圖與一張小圖價格相近，因此大圖切割便宜得不成比例：

| 方式 | 流程 | 40 張整組成本 |
|------|------|-------------|
| 🧩 整張底圖（預設，推薦） | 一次生成網格大圖 → 輪廓偵測自動切割 | **~$0.10–0.24** |
| 🎯 逐張生成 | 每張獨立生成（自動鎖定經濟模型，並行 2 路）→ 去背 → 直接輸出 LINE 規格 | ~$2.7（貴 10 倍以上） |

**推薦工作流**：底圖模式生成 → 只對切壞/畫壞的貼圖按「重試」（重試走單張路徑，每次僅 ~$0.07），兼顧成本與成功率。設定頁會即時顯示預估成本。

### 2.7 影像管線

- **切割**：輪廓偵測 + 網格歸位（取代逐行掃描），對版面漂移更穩健；同格的分離元素（角色 + 漂浮文字）會自動合併。
- **去背**：HSV 綠幕遮罩（自動偵測非綠背景改用色差模式）＋ alpha 高斯柔邊。
- **去綠邊（Despill）**：柔邊帶內偏綠像素的綠色通道會被壓制到 max(R,B)，消除綠色鑲邊。

### 2.8 Google 帳號登入（選用）
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
