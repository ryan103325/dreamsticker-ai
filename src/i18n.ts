export type LanguageCode = 'zh' | 'en';

export const translations = {
    zh: {
        // Landing Page
        landingTitle: "打造您的專屬 Line 貼圖 IP",
        landingSubtitle: "從 0 到 1 打造您的專屬貼圖完整教學",
        apiKeyLabel: "Google Gemini API Key",
        apiKeyPlaceholder: "請輸入您的 API KEY...",
        startBtn: "開始創作",
        noKey: "沒有 API Key?",
        getKey: "前往 Google AI Studio 免費獲取",
        localSave: "為了您的資訊安全，Key 僅保留於本次連線 (Session)，重整網頁後需重新輸入。",
        invalidKey: "請輸入有效的 API Key",

        // Navbar
        changeKey: "更換 Key",
        confirmChangeKey: "確定要更換 API Key 嗎？這將會清除目前的連線設定。",
        language: "語言 (Language)",

        // Steps
        stepInit: "初始設定",
        stepIP: "IP 角色設定",
        stepCopy: "文案發想",
        stepSticker: "貼圖產出",
        stepPack: "上架打包",
        stepEditor: "圖片編輯",

        // Main App
        backStep: "返回上一步",
        nextStep: "下一步",
        mainTitle: "創造您的專屬 IP 角色",
        mainSubtitle: "選擇一種方式開始，AI 將為您打造獨一無二的貼圖主角",

        // Modes
        stickerMode: "一般貼圖 (Stickers)",
        emojiMode: "LINE 表情貼 (Emojis)",
        emojiNote: "＊表情貼模式：尺寸 180x180 px，無白邊，適合連續輸入",

        // Input Modes
        modePhoto: "照片轉 IP",
        modePhotoDesc: "支援單人、雙人、多人合照，自動轉換為卡通形象。",
        modeExisting: "延伸現有 IP",
        modeExistingDesc: "上傳一張角色圖，AI 幫您畫出不同動作的貼圖。",
        modeText: "文字生成 IP",
        modeTextDesc: "輸入文字描述，AI 為您從零設計全新角色。",
        modeUtility: "上傳底圖 (切割工具)",
        modeUtilityDesc: "已有拼圖底稿？純粹使用自動切割與打包功能。",

        // Character Generation
        uploadTitle: "上傳參考圖片",
        uploadHint: "支援 JPG, PNG。建議使用正面、清晰的照片。",
        charCount: "設定角色數量",
        charCountSingle: "單人",
        charCountDual: "雙人",
        charComposition: "角色組成",
        autoDetect: "自動辨識",
        analyzing: "分析中...",
        analyzeSuccess: "分析成功！",
        analyzeFail: "分析失敗，請重試。",
        styleSetting: "畫風設定",
        keywordLabel: "主角特徵關鍵字 (選填)",
        keywordPlaceholder: "例如：快樂的柴犬、戴眼鏡的工程師...",
        generateIP: "✨ 由 AI 生成 IP",
        generating: "正在生成...",
        regenerate: "重新生成",
        confirmUse: "確認使用此圖",

        // Copywriting
        copyTitle: "貼圖文案與情境發想",
        copySubtitle: "AI 因應您的 IP 角色，自動發想適合的貼圖內容。",
        copyPromptLabel: "文案提示詞 (Prompt)",
        copyPromptPlaceholder: "例如：職場社畜日常、情侶放閃專用...",
        generatePlan: "生成貼圖企劃",
        smartParse: "分析並自動填入",
        manualEdit: "手動編輯",
        quantity: "貼圖張數",

        // Sticker Grid
        gridTitle: "貼圖列表",
        gridSubtitle: "點擊單張圖片可進行編輯或重繪。",
        downloadAll: "打包下載 (ZIP)",
        generatingStickers: "貼圖繪製中...",
        waiting: "等待中...",

        // Editor
        editorTitle: "圖片編輯器",
        magicWand: "魔術棒去背",
        manualEraser: "手動橡皮擦",
        brushSize: "筆刷大小",
        undo: "復原",
        save: "儲存",
        cancel: "取消",

        // Pack
        packTitle: "上架打包資訊",
        packSubtitle: "以下資訊可直接用於 LINE Creators Market 上架。",
        packName: "貼圖標題 (Title)",
        packDesc: "貼圖說明 (Description)",
        mainImage: "主要圖片 (Main)",
        tabImage: "標籤圖片 (Tab)",
        downloadZip: "下載上架包 (ZIP)",

        // Common
        error: "發生錯誤",
        success: "成功",
        processing: "處理中...",

        // Missing App Keys
        charType: "角色類型",
        clickUpload: "點擊上傳",
        uploadSupport: "支援 JPG, PNG 格式",
        uploadRefImage: "上傳參考圖",
        descPlaceholder: "描述角色的外觀特徵...",
        artStyleLabel: "畫風設定",
        clickUploadSheet: "點擊上傳底圖",
        uploadSheetSupport: "支援已去背 PNG",

        // Additional Keys
        descLabel: "外觀描述 (必填)",
        randomTitle: "隨機產生靈感",
        sheetQtyLabel: "設定貼圖張數",
        sheetQtyHint: "(影響切割網格)",
        previewLabel: "AI 提示詞預覽",
        copyBtn: "一鍵複製提示詞",

        // Prompt Generator
        promptGenTitle: "還沒有底圖？ AI 輔助生成提示詞",
        promptGenSubtitle: "為外部工具產生的 Prompt Generator",
        promptGenContent: "文字內容",
        promptGenPlaceholder: "輸入貼圖文字，例如：\n1.早安\n2.晚安\n3.謝謝",
        promptGenFormat: "智慧格式化",
        promptGenQuantity: "生成數量",
        promptGenGrid: "對應網格",
        promptGenStyle: "畫風設定",
        promptGenStylePlaceholder: "預設：Q版日本動漫",
        promptGenPreview: "AI 提示詞預覽",
        promptGenCopy: "一鍵複製提示詞",

        // Loading Messages
        loadingProcessingChar: "正在分析圖片與設計角色 (約需 15-20 秒)...",
        loadingAnalyzingImage: "正在分析圖片內容...",
        loadingDrawingChar: "正在繪製您的 IP 角色...",
        drawingSheetPrefix: "正在繪製第 ",
        drawingSheetSuffix: " 張底圖...",
    },
    en: {
        // Landing Page
        landingTitle: "Create Your Exclusive Line Sticker IP",
        landingSubtitle: "A complete guide to building your sticker pack from scratch",
        apiKeyLabel: "Google Gemini API Key",
        apiKeyPlaceholder: "Enter your API KEY here...",
        startBtn: "Start Creating",
        noKey: "No API Key?",
        getKey: "Get one for free at Google AI Studio",
        localSave: "For your security, the Key is used for this session only and will be cleared on refresh.",
        invalidKey: "Please enter a valid API Key",

        // Navbar
        changeKey: "Change Key",
        confirmChangeKey: "Are you sure you want to change the API Key? This will clear your current session.",
        language: "Language",

        // Steps
        stepInit: "Setup",
        stepIP: "IP Character",
        stepCopy: "Copywriting",
        stepSticker: "Production",
        stepPack: "Packaging",
        stepEditor: "Editor",

        // Main App
        backStep: "Back",
        nextStep: "Next Step",
        mainTitle: "Create Your Exclusive IP Character",
        mainSubtitle: "Choose a method to start, AI will build a unique character for you",

        // Modes
        stickerMode: "Standard Stickers",
        emojiMode: "LINE Emojis",
        emojiNote: "*Emoji Mode: 180x180 px, full bleed, suitable for inline messaging",

        // Input Modes
        modePhoto: "Photo to IP",
        modePhotoDesc: "Convert selfies or pet photos into cartoon characters.",
        modeExisting: "Extend Existing IP",
        modeExistingDesc: "Upload a character image, AI generates new poses.",
        modeText: "Text to IP",
        modeTextDesc: "Describe a character, AI designs it from scratch.",
        modeUtility: "Upload Sheet (Utility)",
        modeUtilityDesc: "Have a sprite sheet? Use purely for slicing and packing.",

        // Character Generation
        uploadTitle: "Upload Reference Image",
        uploadHint: "Supports JPG, PNG. Front-facing, clear photos recommended.",
        charCount: "Character Count",
        charCountSingle: "Single",
        charCountDual: "Dual",
        charComposition: "Composition",
        autoDetect: "Auto Detect",
        analyzing: "Analyzing...",
        analyzeSuccess: "Analysis Successful!",
        analyzeFail: "Analysis Failed.",
        styleSetting: "Art Style",
        keywordLabel: "Character Keywords (Optional)",
        keywordPlaceholder: "e.g., Happy Shiba Inu, Engineer with glasses...",
        generateIP: "✨ Generate IP by AI",
        generating: "Generating...",
        regenerate: "Regenerate",
        confirmUse: "Confirm & Use",

        // Copywriting
        copyTitle: "Sticker Copywriting & Ideas",
        copySubtitle: "AI generates sticker content based on your IP character.",
        copyPromptLabel: "Theme Prompt",
        copyPromptPlaceholder: "e.g., Office life, Couple love...",
        generatePlan: "Generate Plan",
        smartParse: "Parse & Fill",
        manualEdit: "Manual Edit",
        quantity: "Quantity",

        // Sticker Grid
        gridTitle: "Sticker List",
        gridSubtitle: "Click an image to edit or regenerate.",
        downloadAll: "Download All (ZIP)",
        generatingStickers: "Generating Stickers...",
        waiting: "Waiting...",

        // Editor
        editorTitle: "Image Editor",
        magicWand: "Magic Wand",
        manualEraser: "Eraser",
        brushSize: "Brush Size",
        undo: "Undo",
        save: "Save",
        cancel: "Cancel",

        // Pack
        packTitle: "Packaging Info",
        packSubtitle: "Ready for LINE Creators Market.",
        packName: "Title",
        packDesc: "Description",
        mainImage: "Main Image",
        tabImage: "Tab Image",
        downloadZip: "Download ZIP",

        // Common
        error: "Error",
        success: "Success",
        processing: "Processing...",

        // Missing App Keys
        charType: "Character Type",
        clickUpload: "Click to Upload",
        uploadSupport: "Support JPG, PNG",
        uploadRefImage: "Upload Image",
        descPlaceholder: "Describe appearance...",
        artStyleLabel: "Art Style",
        clickUploadSheet: "Click to upload sheet",
        uploadSheetSupport: "Support transparent PNG",

        // Additional Keys
        descLabel: "Appearance (Required)",
        randomTitle: "Random Inspiration",
        sheetQtyLabel: "Sticker Quantity",
        sheetQtyHint: "(Affects Grid)",
        previewLabel: "AI Prompt Preview",
        copyBtn: "Copy Prompt",

        // Prompt Generator
        promptGenTitle: "No base image? AI Prompt Generator",
        promptGenSubtitle: "Prompt Generator for external tools",
        promptGenContent: "Sticker Text",
        promptGenPlaceholder: "Enter text, e.g.:\n1. Hi\n2. Bye\n3. Thanks",
        promptGenFormat: "Smart Format",
        promptGenQuantity: "Quantity",
        promptGenGrid: "Grid Layout",
        promptGenStyle: "Art Style",
        promptGenStylePlaceholder: "Default: Chibi Anime",
        promptGenPreview: "Prompt Preview",
        promptGenCopy: "Copy Prompt",

        // Loading Messages
        loadingProcessingChar: "Analyzing image & designing character (approx 15-20s)...",
        loadingAnalyzingImage: "Analyzing image content...",
        loadingDrawingChar: "Drawing your IP character...",
        drawingSheetPrefix: "Drawing sheet ",
        drawingSheetSuffix: "...",
    }
};
