# DreamSticker AI 工作清單（Roadmap）

> 本文件是交接用的完整工作清單。執行前請先讀 `CONTRIBUTING.md`（開發環境、專案結構、PR 規範）。
> 每個任務都附有「驗收標準」與「地雷區」——地雷區是已知會出問題的地方，動工前務必讀完。

---

## 0. 現況摘要（2026-07 已完成）

| 領域 | 狀態 |
|------|------|
| 生圖引擎 | 三引擎可切換：Gemini（`gemini-3-pro-image` / `gemini-3.1-flash-image`）、OpenAI（`gpt-image-2`→`gpt-image-1.5` 降級）、Hugging Face（`Qwen/Qwen-Image` 系列）。模型 ID 全部可用 `VITE_*` 環境變數覆寫。 |
| 生成策略 | 整張網格底圖（省成本）＋逐張生成（高成功率，鎖定經濟模型）。prompt 畫布規格由程式依 API 實際輸出計算（見 `sheetDimsFor`/`pickSheetImageSize`）。 |
| 切割管線 | 綠幕 HSV 遮罩 → 輪廓偵測 → 同格碎片合併 → 間隙聚類（失敗退回均勻網格）→ alpha 柔邊 → despill 去綠邊 → 高品質重採樣輸出。 |
| 解析度保證 | 密網格自動升 4K，確保每格 ≥ 目標尺寸 1.3 倍，全管線只縮小不放大。 |
| UI/UX | 暖色調色盤（`index.css` 的 `@theme` 區塊，一處改全站）、Stepper、Toast、深色模式（`.dark` override sheet）、IndexedDB 作品保存、Google 登入（選用）。 |
| 部署 | GitHub Pages，push main 自動部署。 |

**關鍵檔案地圖**：規格表在 `src/types.ts`（`STICKER_SPECS`/`EMOJI_SPECS`）；引擎分派在 `src/services/geminiService.ts`；切割在 `src/services/opencvService.ts`；打包在 `src/services/utils.ts` 的 `generateFrameZip`；逐張生成流程在 `App.tsx` 的 `generateOneSticker`/`handleGenerateIndividual`。

---

## 1. Phase 1：多平台靜態貼圖支援 ⭐ 最高優先

### 1.0 全局架構原則（動工前必讀的「地雷區」）

**生成 → 切割 → 壓縮是一條連續管線，每個平台的差異必須在「最上游」就決定，不能只在輸出端換尺寸。** 具體來說：

1. **格子比例必須跟著平台走，否則解析度會被白白浪費。**
   切割器用 CONTAIN 模式把切出的格子塞進目標畫布。LINE 的格子是 370:320（比例 1.156，微橫向），但 Telegram/WhatsApp/Discord 都是 1:1 正方形。如果拿 LINE 的網格佈局去生成、再 CONTAIN 進 512×512，一張「寬 > 高」的貼圖上下會留大片空白，等效解析度直接打折。
   → **網格佈局（rows/cols/AR 桶）必須依平台的格子比例重新計算**，不能沿用 `STICKER_SPECS`。

2. **512px 平台的解析度鏈比 LINE 嚴苛得多。**
   規則是「切出的格子 ≥ 目標尺寸 × 1.3」。LINE 目標 370px，2K 大圖就夠；Telegram/WhatsApp 目標 512px → 每格需要 ≥ 666px → **4 欄網格在 2K 完全不夠（2048/4=512 < 666），一定會觸發 4K**（`pickSheetImageSize` 會自動處理，但成本上升：Pro 4K ≈ $0.24/張）。
   → 512 平台建議：(a) 預設推薦「逐張生成」（1:1 一張 1024px，餘裕充足，Qwen 引擎逐張 40 張也只要 ~$1.2）；或 (b) 網格模式限制在 3 欄以下。UI 要依平台給出正確的預設與提示。

3. **WebP 編碼不是免費的。**
   Telegram/WhatsApp 要 WebP。Chrome/Edge 的 `canvas.toDataURL('image/webp', q)` 原生支援，**Safari 不支援**（會默默回傳 PNG！必須檢查回傳的 MIME 而不是假設成功）。
   → 需要特性偵測 + wasm 後備（建議 `@jsquash/webp`，動態 import 以免撐大 bundle）。

4. **WhatsApp 的 100KB 上限需要壓縮迴圈，而壓縮會跟去背柔邊打架。**
   我們的去背輸出帶 8-bit alpha 柔邊。WebP lossy 壓 alpha 邊緣會出現雜訊 artifacts（綠邊處理過但 lossy 可能引入新的邊緣髒點）。
   → 壓縮策略必須是階梯式：先試 **lossless** WebP（512px 卡通圖 lossless 通常 <100KB，平塗色塊壓縮率很好）→ 超標才降 lossy q=0.9 → 0.8 → …→ q<0.5 仍超標則把畫布縮到 480/448px 重試。做成通用函式 `encodeWithBudget(canvas, format, maxBytes)`。

5. **表情貼（emoji）類是 COVER 滿版，貼圖類是 CONTAIN 留白邊——每個平台要標記清楚屬於哪種**，錯了會裁掉角色或多出白框。

6. **白色描邊規則因平台而異。** LINE 貼圖慣例厚白邊；Telegram 也流行白邊但非必須；WhatsApp 官方建議內容與邊界留 16px margin。生成 prompt 的描邊指令要做成 platform 參數（見 `generateSingleSticker` 的 `outlineRule` 與 sheet prompt 的 SAFETY BARRIER 段落）。

### 1.1 平台規格註冊表

新增 `src/platforms.ts`，單一資料來源，所有下游（生成、切割、壓縮、打包、UI）都讀它：

```ts
interface PlatformSpec {
  id: 'LINE_STICKER' | 'LINE_EMOJI' | 'TELEGRAM' | 'WHATSAPP' | 'DISCORD_STICKER' | 'DISCORD_EMOJI' | 'WECHAT';
  name: string;              // UI 顯示名
  cell: { w: number; h: number };   // 目標輸出尺寸
  fit: 'CONTAIN' | 'COVER';         // 貼圖=CONTAIN，emoji=COVER
  padding: number;
  format: 'png' | 'webp';
  maxBytes?: number;                // 單張大小上限（WhatsApp 100KB 等）
  outline: 'thick-white' | 'thin-white' | 'none';  // 生成 prompt 用
  extras: Array<{ file: string; w: number; h: number; format: 'png' }>; // main/tab/tray
  packNote: string;          // 打包內附說明檔的上架教學文字
  marketUrl: string;
}
```

**平台資料（2026-07 查核，動工時請再驗一次官方文件）：**

| 平台 | cell | 格式 | 上限 | extras | 上架方式 |
|------|------|------|------|--------|---------|
| LINE 貼圖 | 370×320 CONTAIN | PNG | — | main 240×240、tab 96×74 | Creators Market 網頁上傳 |
| LINE 表情貼 | 180×180 COVER | PNG | — | tab 96×74 | 同上 |
| Telegram 貼圖 | 512×512 CONTAIN（至少一邊=512） | WebP | 512KB | — | @Stickers bot 逐張上傳 |
| WhatsApp | 512×512 CONTAIN | WebP | **100KB** | tray 96×96 PNG <50KB | 需第三方 App（Sticker Maker 等）匯入 |
| Discord 貼圖 | 320×320 CONTAIN | PNG | 512KB | — | 伺服器設定逐張上傳 |
| Discord emoji | 128×128 COVER | PNG | 256KB | — | 同上 |
| 微信 | 240×240 CONTAIN | PNG | — | — | 微信表情開放平台 |

- [ ] 建立 `platforms.ts` 與上表資料
- [ ] `types.ts` 的 `STICKER_SPECS`/`EMOJI_SPECS` 改為由平台 cell 比例動態計算網格（`generateLayoutFor(platform, qty)`：找 rows×cols 使 sheet 比例最接近支援的 AR 桶、cell 比例最接近 platform.cell 比例）
- [ ] 既有 LINE 流程整體遷移到 registry（LINE_STICKER/LINE_EMOJI 是第一批「吃自己狗糧」的平台）

**驗收**：切換平台後，網格佈局、逐張生成尺寸、打包內容全部正確；LINE 行為與現狀完全一致（回歸）。

### 1.2 生成端參數化

- [ ] `generateStickerSheet`：把寫死的 370/320/180（`targetCellW/H`）與白邊 prompt 段落改讀 platform
- [ ] `generateSingleSticker`：`outlineRule`、aspect（512 平台用 1:1）改讀 platform
- [ ] OpenAI 引擎的 `exactSize` 格子尺寸（現為 464×400/256×256）改為 `platform.cell × 1.25` 後取 16 倍數
- [ ] 逐張生成後的 `fitImageToCanvas` 呼叫改讀 platform 的 cell/fit/padding

**地雷**：`App.tsx` 的 `handleAutoProcess` 內 slice 尺寸也寫死了 370/320/180/0，要一併改。

### 1.3 WebP 編碼與大小預算

- [ ] `encodeWithBudget(canvas, format, maxBytes?)` 工具：
  - format=png 直接輸出
  - format=webp：特性偵測（toDataURL 後檢查回傳 MIME 前綴），不支援則動態 import `@jsquash/webp`
  - 有 maxBytes：lossless → lossy q 0.9~0.5 階梯 → 縮邊長 512→480→448 重試 → 全部失敗回傳最小結果並在 UI toast 警告
- [ ] 單元測試：模擬大圖確認階梯邏輯（Node 環境可用假 encoder 測分支）

**驗收**：Chrome 與 Safari 都能輸出合法 WebP；WhatsApp 全部貼圖 <100KB、tray <50KB。

### 1.4 打包端

- [ ] `generateFrameZip` 依 platform 決定：檔名規則、格式、extras、以及 zip 內附 `README.txt`（用 `packNote` 寫「這包東西怎麼上架」的逐步教學，Telegram 是發給 @Stickers bot、WhatsApp 是用第三方 App 匯入——使用者不知道這些會直接卡死）
- [ ] main/tab/tray 這類衍生圖走 platform.extras 迴圈生成，移除現在的 if STATIC/EMOJI 硬编碼

### 1.5 UI

- [ ] 首頁的「一般貼圖/表情貼」切換器升級為平台選擇器（下拉或卡片；LINE 兩項 + 新平台）
- [ ] 平台切換連動：成本徽章、網格數量選項、策略預設（512 平台預設逐張並顯示原因提示）
- [ ] i18n：所有新字串 zh/en 兩份（規範見 CONTRIBUTING.md）
- [ ] 成果頁的「前往上架」連結改讀 `platform.marketUrl`

### 1.6 端到端驗證（人工，需真 API Key）

- [ ] 每個平台實際生成一組 8 張 → 上架到目標平台驗證通過（Telegram 最快，先測它）
- [ ] Safari 全流程跑一次（WebP 後備路徑）

---

## 2. Phase 2：動態貼圖

> 難度高，Phase 1 完成後再動工。

- [ ] **幀生成策略研究**（先做 spike，不要直接開寫）：候選方案 (a) 主貼圖 → 讓模型生成同角色 2~4 個微變化幀（眨眼、彈跳）；(b) 一張大圖生成 sprite strip 再切；(c) 影片模型（Veo/Kling）生首尾幀間補。以 (a) 起步最務實。
- [ ] APNG 合成：`upng-js` 已在依賴中（`UPNG.encode(frames, w, h, cnum, delays)`）
- [ ] LINE 動態貼圖規格：320×270、5~20 幀、播放 ≤4 秒、**檔案 ≤300KB**（300KB 對 APNG 很緊，需要減色 cnum≤256 與幀數控制）
- [ ] 微信 GIF 輸出（gif.js 或 wasm encoder）
- [ ] Telegram 動態（WebM VP9 512×512 ≤3s ≤256KB）：需要 wasm 影片編碼器，成本效益最低，放最後
- [ ] UI：幀預覽播放器、幀管理（重生單幀）

**地雷**：動態貼圖的去背要逐幀做且結果要穩定（幀間閃爍很明顯）；despill 參數對每幀要一致。

---

## 3. 工程債與品質（可穿插進行，每項獨立）

依優先序：

- [ ] **OpenCV 自行打包**：目前從 `docs.opencv.org` 載入 4.5.0（不是 CDN、隨時可能失效）。改用 npm 套件（如 `@techstark/opencv-js`）或 self-host wasm 到 `public/`。注意 bundle 大小，維持 lazy load。
- [ ] **Service Worker / PWA 完成**：離線殼層 + 資源快取（生成功能離線無意義，但 app 殼要能開）。完成後手機「加入主畫面」即類原生體驗。
- [ ] **CI 加 typecheck**：deploy.yml 的 build 前加 `npm run typecheck`（現在 vite build 不做型別檢查）。
- [ ] **生成等待體驗**：全屏 Loader 改為階段式進度（分析 → 構圖 → 上色 → 切割），逐張模式已有卡片狀態可參考。
- [ ] **icon 系統化**：emoji 圖示（📸🖼️📝📂）換 `lucide-react`（或保留 emoji 作為風格決策，二擇一並統一）。
- [ ] **手機 RWD**:固定底欄遮內容問題、navbar 小螢幕擁擠。
- [ ] **錯誤回報**：接 Sentry（免費額度夠用）；GA4 或 PostHog 基本埋點（頁面、生成成功率、引擎分佈）。
- [ ] **i18n 檢查腳本**：`scripts/check-i18n.mjs` 掃描 `t('...')` 用量 vs 字典，缺鍵時 CI 失敗（歷史上發生過 39 個鍵缺失直接顯示鍵名的事故）。
- [ ] **E2E 冒煙測試**：Playwright 腳本已有雛形（會話紀錄中），正式化放進 repo + CI。
- [ ] **深色模式長期方案**：現在是 `.dark` override sheet（`index.css`），可用但屬於過渡方案；長期應逐步遷移到 `dark:` variants。**不急，能用**。
- [ ] **逐張生成的佇列管理**：目前並行 2、無取消功能；補「停止生成」按鈕與佇列取消。
- [ ] **模型健康檢查**：啟動時輕量 ping 一次模型（或首次失敗時），preview 模型下架時給使用者明確提示而非默默降級。

---

## 4. 遠期（想清楚再做）

- [ ] 託管版商業模式：後端代理（Cloudflare Workers）+ 帳號 + 免費層（Qwen）/訂閱層（Pro）。開源核心 + 付費託管（參考 Excalidraw 模式）。
- [ ] 商店上架（Play TWA / iOS Capacitor）：前置條件是託管版；Apple 4.2 條款風險見會話紀錄。
- [ ] 社群功能：作品分享畫廊、模板市集。

---

## 附錄：交接注意事項

1. **改 UI 文案必須同步 `i18n.ts` 的 zh 和 en 兩個區塊**，缺鍵會直接把鍵名顯示在畫面上。
2. **色彩只用現有調色盤**（`index.css` `@theme`），不要引入新色相；改品牌色只改那一個區塊。
3. **所有生圖 prompt 的修改都要附實測截圖**到 PR。
4. **成本敏感**：任何讓 API 呼叫次數或解析度上升的改動，都要在 PR 說明成本影響（參考 README 的成本表）。
5. `npm run typecheck && npm run build` 綠燈才能合併；main 一推就會自動部署到 Pages（等同直接上線）。
