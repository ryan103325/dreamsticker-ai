# Contributing to DreamSticker AI

感謝你對 DreamSticker AI 有興趣！Thanks for your interest in contributing!

## 開發環境 / Development Setup

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # TypeScript check
npm run build      # production build
```

需要一把 [Google Gemini API Key](https://aistudio.google.com/app/apikey) 才能實際測試生成功能（首頁輸入即可，僅存於瀏覽器）。

## 專案結構 / Project Layout

```
src/
  App.tsx                     主流程（4 步驟精靈）
  i18n.ts                     所有 UI 文案（zh / en 兩份，新增字串請兩邊都加）
  types.ts                    貼圖規格（STICKER_SPECS / EMOJI_SPECS）
  services/
    geminiService.ts          Gemini 引擎 + 模型設定/品質模式/引擎分派
    openaiImageService.ts     OpenAI GPT Image 引擎
    hfImageService.ts         Hugging Face 開源模型引擎
    opencvService.ts          綠幕切割（輪廓 + 間隙聚類）
    utils.ts                  去背 worker、打包、canvas 工具
    persistence.ts            IndexedDB 作品保存
  components/                 UI 元件
```

## 送 PR 前 / Before You Submit

1. `npm run typecheck` 與 `npm run build` 必須通過。
2. UI 文案改動需同步 `i18n.ts` 的 zh 與 en 兩個區塊。
3. 色彩請使用既有的調色盤（`src/index.css` 的 `@theme` 區塊），避免引入新色相。
4. 涉及生圖 prompt 的改動，請在 PR 描述附上實測結果截圖。

## 回報問題 / Reporting Issues

請使用 Issue 模板，並盡量附上：瀏覽器版本、使用的引擎（Gemini/OpenAI/HF）、生成模式（整張底圖/逐張）、以及失敗的大圖（若是切割問題）。
