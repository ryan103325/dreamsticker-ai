# DreamSticker AI

AI 貼圖生成工具：輸入主題，自動發想點子、設計一致的角色、產出成套 LINE 貼圖。純前端跑，使用你自己的 Gemini API Key（BYOK），不會經過任何伺服器。

## 功能

- **自動發想**：輸入主題，AI 產生貼圖點子
- **角色設計**：上傳參考圖或描述，產生一致的角色設計圖
- **貼圖生成**：支援單張生成，也支援 T-Layout 整組網格生成
- **自動去背**：OpenCV 處理綠幕去背，含去綠邊（despill）

## 快速開始

需要 Node.js v20+。

```bash
npm install
npm run dev
```

啟動後在首頁輸入你的 Gemini API Key 即可開始使用：

- Key 預設只留在記憶體，重新整理頁面就會清空
- 勾選「記住 API Key」會以 Base64 存進瀏覽器 `localStorage`，只留在你的裝置，不會上傳到任何地方

```bash
npm run typecheck   # TypeScript 型別檢查
npm run build        # 產出 dist/
```

## 部署

已設定 GitHub Actions 自動部署到 GitHub Pages，push 到 `main` 就會觸發。因為是 BYOK 架構，部署時**不需要**在 Repository Secrets 裡放任何 API Key——使用者會在網頁上自行輸入，金鑰不會進到 build 產物裡。

## 生圖引擎與成本

主畫面提供引擎與品質切換（設定會記住）。2026 年 7 月的模型選型分析：

| 模型 | 排名* | 約略成本/張 | 優勢 | 弱點（對本專案） |
|---|---|---|---|---|
| **Gemini 3 Pro Image**（Nano Banana Pro，預設高品質） | 前段 | $0.13–0.24 | 複雜版面/網格遵循、長文與中文字渲染最強、4K | 最貴 |
| **Gemini 3.1 Flash Image**（Nano Banana 2，預設經濟） | #3 | $0.045–0.15 | 性價比最高、支援 4K 與寬幅、角色一致性佳 | 複雜網格稍遜 Pro |
| **GPT Image 2**（OpenAI，選用引擎） | #1 | $0.05（中）/$0.21（高）；含參考圖 ×2–3 | 指令遵循全場最佳、可到 3840px | 需組織驗證、參考圖計費貴 |
| **Qwen-Image / Qwen-Image-Edit**（開源，經 HF 引擎） | 開源前段 | **~$0.02–0.05** | 開源模型中中文字渲染最強、HF 附每月免費額度 | 複雜網格較弱、單參考圖 |
| Seedream 4.5（ByteDance） | 前段 | ~$0.04 | 文字渲染極強、4K、便宜 | 無瀏覽器直連 BYOK 通道（需經 fal/BytePlus 代理） |
| FLUX.2（BFL） | 前段 | 中 | 開放權重、最多 10 張參考圖 | API 無瀏覽器 CORS，需後端 |
| Imagen 4 Ultra（Google） | 前段 | ~$0.03–0.06 | 寫實最強 | 無法用參考圖維持角色一致性 |

\* 生圖競技場盲測排名。結論：純前端 + BYOK 架構下，Gemini 系列（CORS 開放、單一 Key、中文字與網格最強）仍是主引擎最佳解，GPT Image 2 作為進階選用引擎。

模型 ID 可用環境變數覆寫（模型更版時不需改程式碼），在 `.env.local` 設定（皆為選填）：

```bash
VITE_IMAGE_MODEL_PRO=gemini-3-pro-image
VITE_IMAGE_MODEL_FLASH=gemini-3.1-flash-image
VITE_IMAGE_MODEL_LEGACY=gemini-2.5-flash-image
VITE_TEXT_MODEL=gemini-2.5-flash
VITE_OPENAI_IMAGE_MODEL=gpt-image-2
VITE_OPENAI_IMAGE_MODEL_FALLBACK=gpt-image-1.5
VITE_HF_IMAGE_MODEL=Qwen/Qwen-Image
VITE_HF_EDIT_MODEL=Qwen/Qwen-Image-Edit
```

**第三引擎：Hugging Face 開源模型（最省錢）**——在首頁「進階選項」填入 HF Token（[huggingface.co](https://huggingface.co) 免費註冊 → Settings → Access Tokens，Read 權限）即可切換到 Qwen-Image 引擎。每月附免費推論額度，之後按供應商原價計費、HF 不加成。透過 HF Inference Providers 路由，模型可用環境變數換成任何開源模型（如 FLUX.1-Kontext-dev）。

### 生成方式與成本

生圖 API 按輸出圖片張數計費，一張 2K 大圖與一張小圖價格相近，因此大圖切割便宜得不成比例：

| 方式 | 流程 | 40 張整組成本 |
|---|---|---|
| 🧩 整張底圖（預設，推薦） | 一次生成網格大圖 → 輪廓偵測自動切割 | **~$0.10–0.24** |
| 🎯 逐張生成 | 每張獨立生成（自動鎖定經濟模型，並行 2 路）→ 去背 → 直接輸出 LINE 規格 | ~$2.7（貴 10 倍以上） |

推薦工作流：底圖模式生成 → 只對切壞/畫壞的貼圖按「重試」（重試走單張路徑，每次僅 ~$0.07），兼顧成本與成功率。設定頁會即時顯示預估成本。

### 影像管線

- **切割**：輪廓偵測 + 網格歸位（取代逐行掃描），對版面漂移更穩健；同格的分離元素（角色 + 漂浮文字）會自動合併
- **去背**：HSV 綠幕遮罩（自動偵測非綠背景改用色差模式）＋ alpha 高斯柔邊
- **去綠邊（Despill）**：柔邊帶內偏綠像素的綠色通道會被壓制到 max(R,B)，消除綠色鑲邊

### Google 帳號登入（選用）

可讓使用者以 Google 帳號登入（顯示頭像與名稱、個人化體驗）。登入不能取代 Gemini API Key，Key 仍需自行提供。

1. 前往 [Google Cloud Console → API 和服務 → 憑證](https://console.cloud.google.com/apis/credentials)
2. 建立「OAuth 2.0 用戶端 ID」，應用程式類型選「網頁應用程式」
3. 在「已授權的 JavaScript 來源」加入你的網域（例如 `http://localhost:3000` 與 GitHub Pages 網址）
4. 設定環境變數：

```bash
# .env.local
VITE_GOOGLE_CLIENT_ID=你的-client-id.apps.googleusercontent.com
```

未設定時登入按鈕會自動隱藏，功能不受影響；部署時記得把這個值加進 Repository Secrets 並在 workflow 傳入。

## 技術架構

- **Frontend**：React 19、Vite、TypeScript
- **Styling**：Tailwind CSS
- **AI**：Google Gemini API（`@google/genai`）、OpenAI GPT Image、Hugging Face Inference
- **Image Processing**：OpenCV.js、jszip、upng-js

## 授權

MIT
