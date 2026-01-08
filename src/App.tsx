
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    GeneratedImage,
    AppStep,
    DEFAULT_STYLE,
    StickerConfig,
    DEFAULT_STICKER_CONFIGS,
    InputMode,
    StickerType,
    FontConfig,
    LANGUAGES,
    FONT_STYLES,
    GenerationStatus,
    StickerQuantity,
    StickerSheet,
    generateDefaultConfigs,
    SheetLayout,
    getStickerSpec,
    StickerPackageInfo,
    STICKER_SPECS,
    EMOJI_SPECS,
    CharacterInput
} from './types';
import { useLanguage } from './LanguageContext';
import { generateIPCharacter, generateStickerSheet, editSticker, parseStickerIdeas, generateStickerPackageInfo, generateRandomCharacterPrompt, generateVisualDescription, generateGroupCharacterSheet, analyzeImageForCharacterDescription, generateCharacterDescriptionFromKeyword, translateActionToEnglish, generateStickerPlan, parseStructuredStickerPlan, analyzeImageSubject } from './services/geminiService';
import { loadApiKey, clearApiKey } from './services/storageUtils';
import { generateFrameZip, wait, resizeImage, extractDominantColors, blobToDataUrl, getFontFamily, processGreenScreenImage, generateTabImage } from './services/utils';
import { processGreenScreenAndSlice, waitForOpenCV } from './services/opencvService';
import { PromptGeneratorModal } from './components/PromptGeneratorModal';
import { Loader } from './components/Loader';
import { MagicEditor } from './components/MagicEditor';
import { HelpModal } from './components/HelpModal';
import { UploadIcon, MagicWandIcon, StickerIcon, DownloadIcon, RefreshIcon, EditIcon, CloseIcon, HelpIcon, StarIcon, CopyIcon, ExternalLinkIcon, FolderOpenIcon, DiceIcon, TrashIcon, ArrowLeftIcon } from './components/Icons';
import { LandingPage } from './components/LandingPage';
import { setApiKey } from './services/geminiService';

// Add new step for Smart Crop Preview
const SHEET_EDITOR_STEP = AppStep.SHEET_EDITOR;

// Predefined Art Styles for Quick Selection
const ART_STYLES = [
    'artStyle_chibi',
    'artStyle_3d',
    'artStyle_anime',
    'artStyle_photo',
    'artStyle_watercolor',
    'artStyle_crayon',
    'artStyle_minimal',
    'artStyle_pixel',
    'artStyle_ghibli'
];

// Predefined Font Options for Quick Selection
const FONT_OPTIONS = [
    "華康布丁體",
    "思源黑體",
    "俐方體",
    "粉圓體",
    "華康少女文字",
    "懶狗狗體",
    "激燃體",
    "M+字體"
];

const CopyBtn = ({ text, label = "複製", successLabel = "已複製" }: { text: string, label?: string, successLabel?: string }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button
            onClick={handleCopy}
            className={`px-4 border rounded-xl font-bold transition-all duration-200 flex items-center gap-1 min-w-[80px] justify-center text-xs sm:text-sm
                ${copied
                    ? 'bg-green-500 text-white border-green-500'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
        >
            {copied ? (
                <><span>✓</span> {successLabel}</>
            ) : (
                <>{label}</>
            )}
        </button>
    );
};

interface StickerCardProps {
    sticker: GeneratedImage;
    countdown: number;
    isMain: boolean;
    onRetry: () => void;
    onDownload: () => void;
    onEdit: () => void;
    onSetMain: () => void;
}

const StickerCard: React.FC<StickerCardProps> = ({
    sticker,
    countdown,
    isMain,
    onRetry,
    onDownload,
    onEdit,
    onSetMain
}) => {
    return (
        <div className={`bg-white rounded-xl shadow-md overflow-hidden relative group border-2 transition-all
            ${sticker.status === 'ERROR' ? 'border-red-200' : (isMain ? 'border-amber-400 ring-2 ring-amber-100' : 'border-transparent')}
            ${sticker.status === 'GENERATING' ? 'ring-2 ring-indigo-400 border-indigo-100' : ''}
            ${sticker.status === 'COOLDOWN' ? 'border-amber-200 bg-amber-50' : ''}
        `}>
            {isMain && (
                <div className="absolute top-2 left-2 z-10 bg-amber-400 text-white text-xs font-bold px-2 py-1 rounded shadow-md flex items-center gap-1">
                    <StarIcon filled={true} />
                    MAIN
                </div>
            )}

            <div className="aspect-square p-4 flex items-center justify-center bg-gray-[50] relative bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==')]">
                {sticker.status === 'PENDING' && (
                    <div className="flex flex-col items-center justify-center text-gray-400">
                        <span className="text-3xl mb-2 opacity-20">⏳</span>
                        <span className="text-xs font-medium">等待中...</span>
                    </div>
                )}
                {sticker.status === 'GENERATING' && (
                    <div className="flex flex-col items-center justify-center text-indigo-600">
                        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3"></div>
                        <span className="text-xs font-bold animate-pulse">處理中...</span>
                    </div>
                )}
                {sticker.status === 'COOLDOWN' && (
                    <div className="flex flex-col items-center justify-center text-amber-600">
                        <div className="text-2xl mb-2 animate-bounce font-mono font-bold">{countdown}s</div>
                        <span className="text-xs font-bold">AI 休息中...</span>
                    </div>
                )}
                {sticker.status === 'ERROR' && (
                    <div className="flex flex-col items-center justify-center text-red-500 px-4 text-center">
                        <span className="text-2xl mb-2">⚠️</span>
                        <span className="text-xs font-bold">失敗</span>
                        <button onClick={onRetry} className="mt-3 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-full text-xs font-bold transition-colors">重試</button>
                    </div>
                )}
                {sticker.status === 'SUCCESS' && (
                    <>
                        <img src={sticker.url} alt={sticker.emotion} className="max-w-full max-h-full object-contain drop-shadow-sm" />

                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]">
                            <button onClick={onSetMain} className={`p-2 rounded-full transition-colors shadow-lg ${isMain ? 'bg-amber-400 text-white' : 'bg-white text-gray-400 hover:text-amber-400 hover:bg-amber-50'}`} title="設為主圖 (Main/Tab)">
                                <StarIcon filled={isMain} />
                            </button>

                            <button onClick={onEdit} className="p-2 bg-white text-gray-800 rounded-full hover:bg-purple-50 hover:text-purple-600 transition-colors shadow-lg" title="魔法修復">
                                <MagicWandIcon />
                            </button>

                            <button onClick={onDownload} className="p-2 bg-white text-gray-800 rounded-full hover:bg-green-50 hover:text-green-600 transition-colors shadow-lg" title="下載">
                                <DownloadIcon />
                            </button>
                        </div>
                    </>
                )}

                {sticker.status === 'SUCCESS' && (
                    <div className="absolute bottom-2 left-0 w-full px-2">
                        <div className="bg-black/50 backdrop-blur-md rounded-lg py-1 px-2 text-center">
                            <p className="text-[10px] text-white font-bold truncate">{sticker.emotion}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Custom Text Toggle Component
const TextToggle = ({ enabled, onChange }: { enabled: boolean, onChange: (val: boolean) => void }) => (
    <div className="flex items-center gap-3 p-2 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
        <span className="text-sm font-bold text-slate-600">文字 (Text)</span>
        <div
            className={`relative w-16 h-8 rounded-full cursor-pointer transition-colors duration-300 shadow-inner ${enabled ? 'bg-green-500' : 'bg-slate-300'}`}
            onClick={() => onChange(!enabled)}
        >
            {/* Knob */}
            <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all duration-300 flex items-center justify-center text-[10px] font-bold text-slate-600
                ${enabled ? 'left-1' : 'left-9'}`}
            >
            </div>
            {/* Label inside track */}
            <span className={`absolute top-1/2 -translate-y-1/2 text-[10px] font-black text-white transition-opacity duration-300
                ${enabled ? 'right-2 opacity-100' : 'right-2 opacity-0'}`}>
                ON
            </span>
            <span className={`absolute top-1/2 -translate-y-1/2 text-[10px] font-black text-white transition-opacity duration-300
                ${enabled ? 'left-2 opacity-0' : 'left-2 opacity-100'}`}>
                OFF
            </span>
        </div>
    </div>
);

// External Prompt Generator Component
const ExternalPromptGenerator = ({ onApply, isProcessing, characterType }: { onApply: (text: string) => void, isProcessing: boolean, characterType: string }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [qty, setQty] = useState(8);
    const [category, setCategory] = useState("綜合"); // Default to Mixed
    const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

    const categories = ["綜合", "職場生存", "投資韭菜", "親密關係", "吃貨日常", "迷因嘴砲", "厭世躺平"];

    const handleAIGenerate = async () => {
        setIsGeneratingPlan(true);
        try {
            // Apply expanded definition for "Mixed" invisibly to the user
            let finalCategory = category;
            if (category === "綜合") {
                finalCategory = "綜合:職場生存(15%)、投資韭菜(15%)、親密關係(15%)、吃貨日常(15%)、迷因嘴砲(20%)、厭世躺平(20%)";
            }

            // Pass characterType to service
            const plan = await generateStickerPlan(qty, finalCategory, characterType);
            if (plan) {
                onApply(plan);
                alert("文案已生成並填入！請點擊上方「分析並自動填入」來套用設定。");
            }
        } catch (e) {
            alert("生成失敗，請稍後再試。");
            console.error(e);
        } finally {
            setIsGeneratingPlan(false);
        }
    };

    const generatePrompt = () => {
        let displayCategory = category;
        // Don't show the expanded logic in the preview if user just selected "Mixed", 
        // OR do show it if we want them to know. User said "just don't show in dropdown".
        // Let's show the expanded version in the prompt PREVIEW so they know what they are getting?
        // User said: "In the dropdown, don't let the user see it".
        // prompt preview shows what is SENT.
        if (category === "綜合") {
            displayCategory = "綜合:職場生存(15%)、投資韭菜(15%)、親密關係(15%)、吃貨日常(15%)、迷因嘴砲(20%)、厭世躺平(20%)";
        }

        return `# Role: 專業 LINE 貼圖創意總監與 Prompt 工程師

# Context
使用者希望產出一組 LINE 貼圖的創意企劃，包含「貼圖文字」、「中文畫面指令」與「英文畫面指令」。你需要根據指定的「數量」與「主題風格」進行發想。

# Input Data
請使用者填入以下參數：
1. **生成數量**：${qty}
2. **文案種類**：${displayCategory}
3. **主角設定**：${characterType || "未指定 (請自由發揮，但需保持一致)"}

# Constraints & Rules
1. **格式嚴格限制**：必須嚴格遵守下方 Output Format 的結構，不得更改標點符號或換行方式。
2. **禁止 Emoji**：輸出內容中嚴禁出現任何表情符號（Emoji）。
3. **視覺一致性**：英文指令（Prompt）必須是針對 AI 繪圖工具（如 Midjourney）可理解的視覺描述，而非僅僅是文意翻譯，必須精確描述表情、肢體動作與氛圍。
4. **角色一致性**：既然已經指定了「主角設定」，所有的英文 Prompt 必須嚴格遵循此角色設定 (例如若是 Animal，就不能寫 person)。
5. **文字簡潔**：貼圖上的文字（Text）必須短促有力，適合手機畫面閱讀。

# Output Format
請依序條列，格式如下：
1. 貼圖文字(中文畫面指令與表情描述)(English visual prompt describing the pose and expression matching the Chinese instruction)
2. 貼圖文字(中文畫面指令與表情描述)(English visual prompt describing the pose and expression matching the Chinese instruction)
...（依此類推直到達到指定數量）

# Execution
請根據 Input Data 中的參數，開始執行任務，並以文字框呈現。`;
    };

    return (
        <div className="border-t border-indigo-100 pt-4 mt-4">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between text-xs font-bold text-indigo-500 hover:text-indigo-700 transition-colors"
            >
                <span>✨ AI 文案生成助手 (AI Copywriter)</span>
                <span>{isOpen ? '▲' : '▼'}</span>
            </button>

            {isOpen && (
                <div className="mt-3 space-y-3 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                    <div className="flex gap-2 text-xs items-center">
                        <label className="font-bold text-slate-500">數量:</label>
                        <select value={qty} onChange={(e) => setQty(Number(e.target.value))} className="p-1 rounded border-slate-200 text-slate-700 font-bold">
                            {[8, 16, 24, 32, 40].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <label className="font-bold text-slate-500 ml-2">種類:</label>
                        <select value={category} onChange={(e) => setCategory(e.target.value)} className="p-1 rounded border-slate-200 text-slate-700 font-bold flex-1">
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    <div className="flex gap-2">
                        {/* AI Generate Button (Full Width now since mixed button is gone) */}
                        <button
                            onClick={handleAIGenerate}
                            disabled={isProcessing || isGeneratingPlan}
                            className="w-full py-2 text-xs bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold rounded shadow-md hover:shadow-lg disabled:opacity-50"
                        >
                            {isGeneratingPlan ? '生成中...' : '✨ 由 AI 生成'}
                        </button>
                    </div>

                    <div className="relative">
                        <textarea
                            readOnly
                            value={generatePrompt()}
                            className="w-full h-24 p-2 text-[10px] bg-white border border-slate-200 rounded-lg resize-none text-slate-500 font-mono focus:outline-none"
                        />
                        <div className="absolute bottom-2 right-2">
                            <CopyBtn text={generatePrompt()} label="複製 Prompt" />
                        </div>
                    </div>
                    <p className="text-[10px] text-slate-400 text-center">生成結果會自動填入上方文字框，請務必點擊「分析並自動填入」按鈕。</p>
                </div>
            )}
        </div>
    );
};

import { useTheme } from './ThemeContext';

export const App = () => {
    // const [apiKeyReady, setApiKeyReady] = useState(false); // Removed
    const { language: sysLang, setLanguage: setSysLang, t } = useLanguage();
    const { theme, toggleTheme } = useTheme();

    // const [sysLang, setSysLang] = useState<LanguageCode>('zh'); // System UI Language
    // const t = translations[sysLang]; // I18n Helper

    const [appStep, setAppStep] = useState<AppStep | number>(AppStep.UPLOAD);
    const [inputMode, setInputMode] = useState<InputMode | null>(null);

    // Single Character States
    const [sourceImage, setSourceImage] = useState<string | null>(null);
    const [promptText, setPromptText] = useState("");
    const [subjectKeyword, setSubjectKeyword] = useState(""); // New state for keyword input
    const [isGeneratingDescription, setIsGeneratingDescription] = useState(false); // State for keyword loading

    // Group Character States
    const [charCount, setCharCount] = useState<number>(1);
    const [charComposition, setCharComposition] = useState("Animal (動物)"); // New State
    const [groupChars, setGroupChars] = useState<CharacterInput[]>([
        { id: '1', description: '' },
        { id: '2', description: '' }
    ]);
    const [analyzingCharId, setAnalyzingCharId] = useState<string | null>(null); // Track which char is being analyzed

    const [stylePrompt, setStylePrompt] = useState(DEFAULT_STYLE);
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadingMsg, setLoadingMsg] = useState("");

    const [generatedChar, setGeneratedChar] = useState<GeneratedImage | null>(null);
    const [variationSeed, setVariationSeed] = useState(0);

    // Sticker Configs
    const [stickerQuantity, setStickerQuantity] = useState<StickerQuantity>(8);
    const [stickerConfigs, setStickerConfigs] = useState<StickerConfig[]>(DEFAULT_STICKER_CONFIGS);

    // Product Type State (Sticker vs Emoji)
    const [stickerType, setStickerType] = useState<StickerType>('STATIC');

    const [fontConfig, setFontConfig] = useState<FontConfig>({
        language: LANGUAGES[0],
        style: FONT_STYLES[1],
        color: "#000000"
    });
    const [customFont, setCustomFont] = useState<string>("");

    // No Text Mode
    const [includeText, setIncludeText] = useState(true);

    // Prompt Generator State
    const [isPromptGeneratorOpen, setIsPromptGeneratorOpen] = useState(false);
    const [promptTextListInput, setPromptTextListInput] = useState("");
    const [promptFontStyleInput, setPromptFontStyleInput] = useState(""); // Kept for state compatibility but UI removed
    const [promptGenQuantity, setPromptGenQuantity] = useState<StickerQuantity>(40); // Default to 40
    const [promptArtStyleInput, setPromptArtStyleInput] = useState("");

    // Sheet & Preview Data
    const [rawSheetUrls, setRawSheetUrls] = useState<string[]>([]);
    const [currentSheetIndex, setCurrentSheetIndex] = useState(0);

    const [finalStickers, setFinalStickers] = useState<GeneratedImage[]>([]);
    const [mainStickerId, setMainStickerId] = useState<string | null>(null);
    const [zipFileName, setZipFileName] = useState("MyStickers");

    const [stickerPackageInfo, setStickerPackageInfo] = useState<StickerPackageInfo | null>(null);
    const [smartInputText, setSmartInputText] = useState("");
    const [optimizingId, setOptimizingId] = useState<string | null>(null);

    const [magicEditorOpen, setMagicEditorOpen] = useState(false);
    const [editingStickerId, setEditingStickerId] = useState<string | null>(null); // Null if editing full sheet
    const [editorImage, setEditorImage] = useState<string>("");

    const [helpOpen, setHelpOpen] = useState(false);

    // Random Dice State
    const [showDiceMenu, setShowDiceMenu] = useState(false);
    const [diceLoading, setDiceLoading] = useState(false);


    const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
    const [promptModalTarget, setPromptModalTarget] = useState<'SMART_INPUT' | 'SHEET_INPUT' | null>(null);




    // OpenCV State
    const [isOpenCVReady, setIsOpenCVReady] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const sheetInputRef = useRef<HTMLInputElement>(null);

    const [hasKey, setHasKey] = useState(false);

    const setKeyAndStart = (key: string) => {
        setApiKey(key);
        setHasKey(true);
    };

    // Security update: No auto-loading of keys.
    // useEffect(() => { ... }, []);

    // 2. OpenCV Check
    useEffect(() => {
        waitForOpenCV().then(ready => setIsOpenCVReady(ready));
    }, []);



    const handleBack = () => {
        if (appStep === AppStep.CANDIDATE_SELECTION) {
            setAppStep(AppStep.UPLOAD);
        } else if (appStep === AppStep.STICKER_CONFIG) {
            setAppStep(AppStep.CANDIDATE_SELECTION);
        } else if (appStep === AppStep.SHEET_EDITOR) {
            if (inputMode === 'UPLOAD_SHEET') {
                setAppStep(AppStep.UPLOAD);
                setRawSheetUrls([]);
            } else {
                setAppStep(AppStep.STICKER_CONFIG);
            }
        } else if (appStep === AppStep.STICKER_PROCESSING) {
            setAppStep(AppStep.SHEET_EDITOR);
            setFinalStickers([]);
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsProcessing(true);
            setLoadingMsg("圖片上傳中...");

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const result = event.target?.result as string;
                    const resized = await resizeImage(result, 1024);
                    setSourceImage(resized);

                    const colors = await extractDominantColors(resized);
                    if (colors.length > 0) {
                        setFontConfig(prev => ({ ...prev, color: colors[0] }));
                    }
                } catch (e) {
                    console.error(e);
                    alert("圖片載入失敗");
                } finally {
                    setIsProcessing(false);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleGroupCharImageUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsProcessing(true);
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const result = event.target?.result as string;
                    const resized = await resizeImage(result, 1024);
                    setGroupChars(prev => {
                        const newChars = [...prev];
                        newChars[index] = { ...newChars[index], image: resized };
                        return newChars;
                    });
                } catch (e) { console.error(e); } finally { setIsProcessing(false); }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleAutoAnalyzeChar = async (id: string, image: string | undefined) => {
        if (!image) return;
        setAnalyzingCharId(id);
        try {
            const description = await analyzeImageForCharacterDescription(image);
            setGroupChars(prev => prev.map(c => c.id === id ? { ...c, description } : c));
        } catch (e) {
            console.error(e);
            alert("分析失敗，請檢查 API Key 或網路連線");
        } finally {
            setAnalyzingCharId(null);
        }
    };

    const handleCharCountChange = (count: number) => {
        setCharCount(count);
        if (count > 1) {
            setGroupChars(prev => {
                if (count > prev.length) {
                    // Add
                    const added = Array.from({ length: count - prev.length }, (_, i) => ({
                        id: (prev.length + i + 1).toString(),
                        description: ''
                    }));
                    return [...prev, ...added];
                } else {
                    // Remove
                    return prev.slice(0, count);
                }
            });
        }
    };

    const handleSheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsProcessing(true);
            setLoadingMsg("圖片上傳中...");

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const result = event.target?.result as string;
                    const resized = await resizeImage(result, 4096);
                    setRawSheetUrls([resized]);
                    setCurrentSheetIndex(0);
                    const defaults = generateDefaultConfigs(stickerQuantity);
                    setStickerConfigs(defaults);
                    setAppStep(SHEET_EDITOR_STEP);
                } catch (e) {
                    console.error(e);
                    alert("底圖載入失敗");
                } finally {
                    setIsProcessing(false);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleQuantityChange = (qty: StickerQuantity) => {
        setStickerQuantity(qty);
        const newConfigs = generateDefaultConfigs(qty);
        setStickerConfigs(newConfigs);
    };

    const validQuantities: StickerQuantity[] = [8, 16, 24, 32, 40];

    const handleSmartInput = () => {
        if (!smartInputText.trim()) return;
        setIsProcessing(true);
        setLoadingMsg("正在解析貼圖設定...");

        try {
            // Local Parsing for structured plan
            const ideas = parseStructuredStickerPlan(smartInputText);

            if (ideas.length > 0) {
                const validQ = [8, 16, 24, 32, 40];
                let newQty = validQ.find(q => q >= ideas.length);
                if (!newQty) newQty = 40;

                setStickerQuantity(newQty as StickerQuantity);

                const newConfigs = generateDefaultConfigs(newQty);
                ideas.forEach((idea, index) => {
                    if (index < newConfigs.length) {
                        newConfigs[index].text = idea.text;
                        newConfigs[index].emotionPrompt = idea.emotionPrompt;
                        newConfigs[index].emotionPromptCN = idea.emotionPromptCN;
                        newConfigs[index].showText = includeText && !!idea.text;
                    }
                });
                setStickerConfigs(newConfigs);
                alert(`已成功解析 ${ideas.length} 個貼圖設定並填入！`);
            } else {
                alert("無法解析內容。請確認格式是否為：1. 文字(中文指令)(English Prompt)");
            }
        } catch (e) {
            console.error(e);
            alert("解析失敗");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleTranslatePrompt = async (id: string, text: string) => {
        if (!text.trim()) return;
        setOptimizingId(id);
        try {
            const englishPrompt = await translateActionToEnglish(text);
            setStickerConfigs(prev => prev.map(c =>
                c.id === id ? { ...c, emotionPrompt: englishPrompt } : c
            ));
        } catch (e) {
            console.error(e);
            alert("翻譯失敗，請檢查網路");
        } finally {
            setOptimizingId(null);
        }
    };

    const handleOptimizePrompt = async (id: string, text: string) => {
        if (!text.trim()) return;
        setOptimizingId(id);
        try {
            const visualPrompt = await generateVisualDescription(text);
            setStickerConfigs(prev => prev.map(c =>
                c.id === id ? { ...c, emotionPrompt: visualPrompt } : c
            ));
        } catch (e) {
            console.error(e);
            alert("優化失敗，請稍後再試");
        } finally {
            setOptimizingId(null);
        }
    };

    const handleDiceRoll = async (type: 'ANIMAL' | 'PERSON') => {
        setShowDiceMenu(false);
        setDiceLoading(true);
        try {
            const prompt = await generateRandomCharacterPrompt(type, "");
            setPromptText(prompt);
        } catch (e) {
            console.error(e);
            alert("靈感生成失敗，請再試一次");
        } finally {
            setDiceLoading(false);
        }
    };

    const handleGenerateDescriptionFromKeyword = async () => {
        if (!subjectKeyword.trim()) return;
        setIsGeneratingDescription(true);
        try {
            const description = await generateCharacterDescriptionFromKeyword(subjectKeyword);
            setPromptText(description);
        } catch (e) {
            console.error(e);
            alert("描述生成失敗，請檢查網路連線");
        } finally {
            setIsGeneratingDescription(false);
        }
    };



    const handleGenerateCharacter = async () => {
        if (!inputMode) return;

        // Check validation for Group Mode
        if (inputMode === 'PHOTO') {
            // PHOTO Mode: Image is required, Description is OPTIONAL (from keyword input)
            if (charCount > 1 && groupChars.some(c => !c.image)) return alert("請為所有角色上傳圖片！");
            if (charCount === 1 && !sourceImage) return alert("請上傳圖片！");
        } else if (!sourceImage && inputMode !== 'TEXT_PROMPT') {
            // EXISTING_IP or UPLOAD_SHEET: Image required
            return alert("請先上傳圖片！");
        } else if (inputMode === 'TEXT_PROMPT' && !promptText) {
            // TEXT_PROMPT: Prompt required
            return alert("請輸入描述！");
        }

        setIsProcessing(true);
        setLoadingMsg(t('loadingProcessingChar'));

        let activeComposition = charComposition;

        try {
            // Auto-detect Logic
            if (inputMode === 'PHOTO') {
                setLoadingMsg(t('loadingAnalyzingImage'));
                try {
                    let detectedType = "";
                    if (charCount === 1 && sourceImage) {
                        const type = await analyzeImageSubject(sourceImage);
                        if (type === 'Animal') detectedType = 'Animal (動物)';
                        else if (type.includes('Person')) detectedType = 'Person (人物)';

                        console.log(`[Auto-Detect] Single: ${type} -> ${detectedType}`);
                    } else if (charCount === 2 && groupChars.length >= 2) {
                        const [res1, res2] = await Promise.all([
                            analyzeImageSubject(groupChars[0].image!),
                            analyzeImageSubject(groupChars[1].image!)
                        ]);

                        const isMale = (s: string) => s.includes('Male') && !s.includes('Female');
                        const isFemale = (s: string) => s.includes('Female');
                        const isAnimal = (s: string) => s.includes('Animal');

                        if (isAnimal(res1) || isAnimal(res2)) {
                            detectedType = 'Animals (動物)';
                        } else {
                            const m1 = isMale(res1);
                            const f1 = isFemale(res1);
                            const m2 = isMale(res2);
                            const f2 = isFemale(res2);

                            if (m1 && m2) detectedType = 'Person (2 Male / 兩男)';
                            else if (f1 && f2) detectedType = 'Person (2 Female / 兩女)';
                            else detectedType = 'Person (Male + Female / 男女)';
                        }
                        console.log(`[Auto-Detect] Dual: ${res1}+${res2} -> ${detectedType}`);
                    }

                    if (detectedType) {
                        activeComposition = detectedType;
                        setCharComposition(detectedType);
                    }
                } catch (e) {
                    console.error("Auto mapping failed", e);
                }
            }

            setLoadingMsg(t('loadingDrawingChar'));

            let result;

            // Inject Composition Rule into Style Prompt (Invisible to user, but guides AI)
            const compositionRule = `[Character Composition Requirement: ${activeComposition}]`;
            const finalStylePrompt = `${compositionRule} ${stylePrompt}`;

            if (inputMode === 'PHOTO' && charCount > 1) {
                result = await generateGroupCharacterSheet(groupChars, finalStylePrompt);
            } else {
                result = await generateIPCharacter(
                    inputMode === 'TEXT_PROMPT' ? promptText : sourceImage!,
                    finalStylePrompt,
                    inputMode,
                    variationSeed
                );
            }

            setGeneratedChar(result);
            setAppStep(AppStep.CANDIDATE_SELECTION);
        } catch (error) {
            console.error(error);
            alert("生成失敗，請稍後再試。");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleGenerateStickers = async () => {
        if (inputMode === 'UPLOAD_SHEET') {
            setAppStep(SHEET_EDITOR_STEP);
            return;
        }
        if (!generatedChar) return;
        setIsProcessing(true);
        setLoadingMsg(t('generating'));

        try {
            const generatedSheets: string[] = [];

            let stickersPerSheet: number = stickerQuantity;
            let layout: SheetLayout;

            const spec = getStickerSpec(stickerQuantity);
            layout = { rows: spec.rows, cols: spec.cols, width: spec.width, height: spec.height };

            const batches = [];
            for (let i = 0; i < stickerConfigs.length; i += stickersPerSheet) {
                batches.push(stickerConfigs.slice(i, i + stickersPerSheet));
            }

            for (let i = 0; i < batches.length; i++) {
                setLoadingMsg(`${t('drawingSheetPrefix')}${i + 1} / ${batches.length}${t('drawingSheetSuffix')}`);
                const batchConfigs = batches[i];

                const cleanConfigs = batchConfigs.map(c => ({
                    ...c,
                    showText: c.showText && includeText
                }));

                const sheetResult = await generateStickerSheet(
                    generatedChar.url,
                    cleanConfigs,
                    stylePrompt,
                    i, batches.length, layout, fontConfig,
                    stickerType // PASS STICKER TYPE
                );

                generatedSheets.push(sheetResult.url);
            }

            setRawSheetUrls(generatedSheets);
            setCurrentSheetIndex(0);
            setAppStep(SHEET_EDITOR_STEP);
        } catch (error) {
            console.error(error);
            alert("生成失敗，請檢查網路連線或 API Key。");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAutoProcess = async () => {
        if (rawSheetUrls.length === 0) return;
        if (!isOpenCVReady) {
            alert("OpenCV 尚未載入完成，請稍候再試。");
            return;
        }

        setIsProcessing(true);
        setLoadingMsg("正在自動偵測、去背、裁切...");

        try {
            let allSlicedImages: string[] = [];
            const targetW = 370;
            const targetH = 320;
            const spec = getStickerSpec(stickerQuantity);
            const rows = spec.rows;
            const cols = spec.cols;

            for (let i = 0; i < rawSheetUrls.length; i++) {
                const url = rawSheetUrls[i];
                // EMOJI: 180x180, Padding 0. STICKER: 370x320, Padding 2.
                const sliceW = stickerType === 'EMOJI' ? 180 : 370;
                const sliceH = stickerType === 'EMOJI' ? 180 : 320;
                const slicePad = stickerType === 'EMOJI' ? 0 : 2;

                const cvSliced = await processGreenScreenAndSlice(url, rows, cols, sliceW, sliceH, slicePad);
                if (cvSliced.length === 0) {
                    console.warn(`Sheet ${i + 1}: OpenCV returned no objects.`);
                }
                allSlicedImages = [...allSlicedImages, ...cvSliced];
            }

            if (allSlicedImages.length === 0) {
                alert("OpenCV 未偵測到任何物件，請確認背景是否為綠色。");
                setIsProcessing(false);
                return;
            }

            const newStickers: GeneratedImage[] = allSlicedImages.map((url, idx) => ({
                id: stickerConfigs[idx]?.id || `s-${idx}`,
                url,
                type: stickerType,
                status: 'SUCCESS',
                emotion: stickerConfigs[idx]?.text || `Sticker ${idx + 1}`
            }));

            setFinalStickers(newStickers);
            if (newStickers.length > 0) setMainStickerId(newStickers[0].id);
            setAppStep(AppStep.STICKER_PROCESSING);

        } catch (e) {
            console.error(e);
            alert("自動處理失敗：" + (e as Error).message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleOpenSheetMagicEditor = () => {
        setEditingStickerId(null);
        setEditorImage(rawSheetUrls[currentSheetIndex]);
        setMagicEditorOpen(true);
    };

    const handleMagicEdit = (stickerId: string) => {
        const sticker = finalStickers.find(s => s.id === stickerId);
        if (sticker) {
            setEditingStickerId(stickerId);
            setEditorImage(sticker.url);
            setMagicEditorOpen(true);
        }
    };

    const handleMagicGenerate = async (maskedImage: string, prompt: string) => {
        setIsProcessing(true);
        setLoadingMsg("施展魔法修復中...");
        try {
            const result = await editSticker(maskedImage, prompt);
            if (editingStickerId === null) {
                const newSheets = [...rawSheetUrls];
                newSheets[currentSheetIndex] = result.url;
                setRawSheetUrls(newSheets);
                setMagicEditorOpen(false);
            } else {
                const cleanUrl = await processGreenScreenImage(result.url);
                setFinalStickers(prev => prev.map(s => s.id === editingStickerId ? { ...s, url: cleanUrl, status: 'SUCCESS' } : s));
                setMagicEditorOpen(false);
            }
        } catch (error) {
            console.error(error); alert("修復失敗");
        } finally {
            setIsProcessing(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            alert("已複製到剪貼簿！");
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    };

    const currentSpec = STICKER_SPECS[stickerQuantity] || STICKER_SPECS[8];

    const handleFormatTextList = () => {
        if (!promptTextListInput.trim()) return;
        const items = promptTextListInput.split(/[\n,，、]+/)
            .map(s => s.replace(/^[\s]*(\d+[\.\)]?|[\-\*•\(\)\[\]])\s*/g, '').trim())
            .filter(s => s !== "");
        setPromptTextListInput(items.join('、'));
    };

    const formattedTextList = useMemo(() => {
        if (!includeText) return "【無文字模式】";
        if (!promptTextListInput.trim()) return "【早安、晚安、謝謝、不客氣...】";
        const items = promptTextListInput.split(/[\s,，\n]+/).filter(Boolean);
        return `【${items.join('、')}】`;
    }, [promptTextListInput, includeText]);

    const fontStyleDisplay = "可愛 Q 版 Pop Art 字型"; // Hardcoded default
    const artStyleDisplay = promptArtStyleInput || "可愛、活潑、2D平面";
    const promptSpec = stickerType === 'EMOJI'
        ? (EMOJI_SPECS[promptGenQuantity] || EMOJI_SPECS[40])
        : (STICKER_SPECS[promptGenQuantity] || STICKER_SPECS[20]);

    const promptSegments = useMemo(() => {
        const isEmoji = stickerType === 'EMOJI';

        // Common variables (Highlighed)
        const vQty = { text: String(promptGenQuantity), highlight: true };
        const vW = { text: String(promptSpec.width), highlight: true };
        const vH = { text: String(promptSpec.height), highlight: true };
        const vCols = { text: String(promptSpec.cols), highlight: true };
        const vRows = { text: String(promptSpec.rows), highlight: true };
        const vArt = { text: artStyleDisplay, highlight: true };
        const vFont = { text: fontStyleDisplay, highlight: true };
        const vTextList = { text: formattedTextList, highlight: true };

        if (isEmoji) {
            return [
                "# LINE 表情貼 ", vQty, " 格完整版 Prompt (尺寸修正版：", vW, "x", vH, ")\n\n",
                "請生成一張包含 ", vQty, " 個不同動作與表情的【參考上傳圖片 (Reference Upload)】貼圖集大圖，用於 LINE 表情貼製作。\n\n",
                "## 【最高優先級約束：佈局、邊距與居中】\n**（此部分請嚴格執行，確保後續裁切不出錯）**\n\n",
                "1.  **大圖規格**：整張圖片畫布尺寸為 **", vW, " pixels (寬) x ", vH, " pixels (高)**。\n",
                "2.  **隱形網格結構**：畫面內部邏輯分為 ", vCols, " 直欄 x ", vRows, " 橫列，共 ", vQty, " 個單元格。\n",
                "3.  **純淨背景**：整張大圖背景統一為純綠色 (#00FF00)，無漸層、無雜點。**不可繪製任何黑色的網格分隔線或邊框**。\n",
                "4.  **強制完美居中**：在每一個隱形單元格內，主體必須在視覺上「完美居中」排列。\n",
                "5.  **嚴格安全邊距 (Strict Safety Margin)**：\n",
                "    * **重要：** 每個貼圖之間（單元格邊界）必須保留 **30 pixels** 的純綠色間隔。\n",
                "    * **絕對禁止**任何像素點貼齊、接觸或超出單元格範圍。確保每個角色周圍都有一圈明顯的綠色「安全氣囊」。\n\n",
                "## 【角色與風格一致性】\n",
                "* **角色設定**：請嚴格參考上傳圖片中的角色特徵（髮型、服裝、五官、配色），保持完全一致。 (**注意：若參考圖片中文字較小或顏色單調，請忽略該文字風格，強制採用下方的「文字設計規範」進行創作。**)\n",
                "* **畫風設定**：", vArt, "\n",
                "* **配色風格**：高飽和度，色彩鮮明，對比度高，典型 LINE 貼圖配色。\n",
                "* **線條與上色**：線條單一粗細，圓角筆觸，乾淨平滑。上色平塗為主，僅一層輕微陰影。\n",
                "* **顏色禁忌**：角色本體、服裝與文字**絕對不可使用綠色 (#00FF00 或相近色)**，因為綠色是用作去背的背景色，避免被誤刪。\n\n",
                "## 【畫面內容規範】\n",
                "* 每一格僅包含：單一角色本體（可搭配少量必要的簡單情緒符號，如愛心、汗滴、生氣符號，符號不可喧賓奪主或遮擋臉部）。\n",
                "* ❌ 不包含任何場景背景。\n",
                "* ❌ 不包含任何文字內容。\n",
                "* ❌ 不包含任何手機系統 emoji。\n\n",
                "## 【", vQty, " 格表情與動作清單】(預設)\n",
                "（請依照 ", vCols, "x", vRows, " 的順序排列，確保每格動作不同）\n\n",
                "【一、高頻回覆：動作明確不撞車】\n",
                "01. [打招呼] 雙手舉高揮舞 (熱情開場)\n02. [再見] 背對鏡頭揮手 (帥氣離場)\n03. [OK] 雙手在頭頂比大圓圈 (Body Language)\n04. [NO] 雙手在胸前交叉打叉\n",
                "05. [收到] 立正站好，舉手敬禮 (遵命)\n06. [感謝] 90度標準鞠躬 (禮貌)\n07. [道歉] 土下座 (趴在地上跪拜，誠意最足)\n08. [拜託] 雙膝跪地，雙手合十祈禱\n",
                "09. [指名] 單手指著鏡頭 (就是你/You!)\n10. [加一] 高舉寫著「+1」的牌子\n\n",
                "【二、正面情緒：張力與道具區隔】\n",
                "11. [大笑] 躺在地上打滾 (笑到肚子痛)\n12. [慶祝] 拉開彩炮，彩帶飛舞\n13. [加油] 雙手拿啦啦隊彩球應援\n14. [愛心] 雙手抱著一顆巨大的紅愛心\n",
                "15. [自信] 雙手叉腰，抬頭挺胸 (鼻子變長)\n16. [期待] 趴在地上托腮，雙腳晃動\n17. [擊掌] 跳起來側面擊掌 (Give me five)\n18. [害羞] 身體扭成麻花狀，雙手摀臉\n",
                "19. [親親] 嘟嘴身體前傾，飛出小愛心\n20. [靈感] 彈手指，頭頂亮起燈泡\n",
                "(下略，請自行補充至 ", vQty, " 個...)\n\n",
                "## 【最終輸出確認】\n",
                "輸出一張 ", vW, "x", vH, " 的純綠底圖片，上面整齊排列 ", vQty, " 個單元，無網格線，每個單元都完美居中且周圍有充足的邊距（至少 30px 間隔）。"
            ];
        }

        // Sticker Template
        return [
            "✅ ", vQty, " 格貼圖集｜Prompt 指令 (", vCols, " × ", vRows, " 版)｜網格與佈局絕對定義\n\n",
            "[內容、間隔與對位設定]\n",
            "整體畫幅：", vW, " × ", vH, " px (強制橫向矩形畫幅)。\n",
            "結構佈局：精確佈局為 ", vRows, " 橫排 (Rows) × ", vCols, " 直欄 (Columns)，共 ", vQty, " 個獨立角色。\n",
            "無物理格線：背景必須是 100% 純淨、高飽和、無雜點的綠幕 (#00FF00)，絕對禁止繪製任何物理隔線、框線 or 單元格界線。\n",
            "強制居中：每張貼圖內容必須嚴格位於單元格中心。\n",
            "留白空間：主體內容需與單元格邊界保持「最大化呈現」，但必須精確預留 10 px 的純綠色安全空隙，內容不可貼齊邊界。\n",
            "角色一致性：參考上傳圖片中的角色，生成 一張包含 ", vQty, " 個不同動作的角色貼圖集。\n",
            "嚴禁重複：這 ", vQty, " 張貼圖的姿勢、文字與表情組合絕不重複。\n\n",
            "[文字設計]\n",
            "語言：【台灣繁體中文】\n",
            "文字內容：", vTextList, "\n",
            "排版比例：單張貼圖內，文字佔比約 40%，主角佔比約 60%。文字不可遮臉。\n",
            "邊框設計：文字與角色外圍皆需具備「細薄黑邊內層」，外層包覆「厚度適中的圓滑白色外框」。\n",
            "字型風格：【", vFont, "】\n\n",
            "[文字色彩]\n",
            "絕對禁止使用錄色、螢光綠、黃綠色等接近背景綠幕的顏色，以免去背失效。絕對禁止黑色。\n\n",
            "[表情與動作設計]\n",
            "表情參考：【喜、怒、哀、樂、驚訝、無語...】\n",
            "畫風設定：【", vArt, "】。\n\n",
            "[輸出格式]\n",
            "一張 ", vW, "x", vH, " 大圖，確保貼圖為 ", vRows, " 橫排 × ", vCols, " 直欄，共計 ", vQty, " 個貼圖。文字與角色外圍皆需具備「細薄黑邊」與「白色外框」。背景為 100% 純綠色 #00FF00，不准有格線，內容居中並保留 10px 邊距。務必確保符合需求。"
        ];
    }, [promptGenQuantity, artStyleDisplay, formattedTextList, fontStyleDisplay, promptSpec, stickerType]);

    const promptTemplate = useMemo(() => {
        return promptSegments.map(s => (typeof s === 'string' ? s : s.text)).join('');
    }, [promptSegments]);

    useEffect(() => {
        if (appStep === AppStep.STICKER_PROCESSING && finalStickers.length > 0 && !stickerPackageInfo) {
            const generateInfo = async () => {
                try {
                    const mainSticker = finalStickers.find(s => s.id === mainStickerId) || finalStickers[0];
                    const texts = stickerConfigs.filter(c => c.showText).map(c => c.text);
                    const info = await generateStickerPackageInfo(mainSticker.url, texts);
                    setStickerPackageInfo(info);
                } catch (e) { console.error(e); }
            };
            generateInfo();
        }
    }, [appStep, finalStickers, mainStickerId]);



    if (!hasKey) {
        return <LandingPage onStart={setKeyAndStart} lang={sysLang} setLang={setSysLang} />;
    }

    return (
        <div className={`min-h-screen transition-colors duration-500 font-sans pb-20 selection:bg-indigo-200 selection:text-indigo-900 ${theme === 'dark' ? 'bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 text-white' : 'bg-slate-50 text-slate-800'}`}>
            {/* Navbar */}
            <nav className={`sticky top-0 z-40 px-3 sm:px-6 py-4 flex justify-between items-center shadow-sm backdrop-blur-md transition-all ${theme === 'dark' ? 'bg-black/80 border-b border-white/10' : 'bg-white/80 border-b border-slate-200'}`}>
                <div className="flex items-center gap-2 sm:gap-3 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => window.location.reload()}>
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shadow-lg overflow-hidden">
                        <img src="./logo.png" className="w-full h-full object-cover" alt="Logo" />
                    </div>
                    <div>
                        <h1 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2">
                            <span className={theme === 'dark' ? 'text-white' : 'text-slate-800'}>DreamSticker</span>
                            <span className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hidden sm:inline-block">AI</span>
                        </h1>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={toggleTheme}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${theme === 'dark' ? 'bg-white/10 text-white hover:bg-white/20 border border-white/10' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'}`}
                        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                        {theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                    <button
                        onClick={() => setSysLang(sysLang === 'zh' ? 'en' : 'zh')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${theme === 'dark' ? 'bg-white/10 text-white hover:bg-white/20 border border-white/10' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'}`}
                    >
                        <span>🌐</span> {sysLang === 'zh' ? 'EN' : '中'}
                    </button>
                    <button onClick={() => setHelpOpen(true)} className={`p-2 rounded-full transition-colors ${theme === 'dark' ? 'text-indigo-300 hover:bg-white/10' : 'hover:bg-indigo-50 text-indigo-600'}`}>
                        <HelpIcon />
                    </button>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto p-6 pt-24">
                {appStep > AppStep.UPLOAD && (
                    <button
                        onClick={handleBack}
                        className={`mb-6 flex items-center font-bold transition-colors gap-2 px-4 py-2 rounded-full group ${theme === 'dark' ? 'text-indigo-200 hover:bg-white/10' : 'text-slate-500 hover:text-indigo-600 hover:bg-white'}`}
                    >
                        <div className={`p-1.5 rounded-full shadow-sm group-hover:shadow border transition-all ${theme === 'dark' ? 'bg-white/10 border-white/20 group-hover:border-indigo-400' : 'bg-white border-slate-200 group-hover:border-indigo-200'}`}>
                            <ArrowLeftIcon />
                        </div>
                        <span>{t('backStep')}</span>
                    </button>
                )}

                {appStep === AppStep.UPLOAD && (
                    <div className="animate-fade-in-up space-y-8 mt-10">
                        {/* ... (Previous code remains the same) ... */}
                        {!inputMode && (
                            <>
                                <div className="text-center space-y-4">
                                    <h2 className={`text-4xl font-black ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>{t('mainTitle')}</h2>
                                    <p className={`text-lg ${theme === 'dark' ? 'text-indigo-200' : 'text-slate-500'}`}>{t('mainSubtitle')}</p>
                                </div>

                                {/* PRODUCT MODE SWITCHER */}
                                <div className="flex justify-center mt-8 mb-4">
                                    <div className={`p-1 rounded-xl flex gap-1 ${theme === 'dark' ? 'bg-black/40 border border-white/10' : 'bg-slate-200'}`}>
                                        <button
                                            onClick={() => setStickerType('STATIC')}
                                            className={`px-6 py-2 rounded-lg font-bold transition-all ${stickerType === 'STATIC' ? (theme === 'dark' ? 'bg-white/10 text-white shadow-lg border border-white/20' : 'bg-white text-indigo-600 shadow-md') : (theme === 'dark' ? 'text-indigo-300 hover:text-white' : 'text-slate-500 hover:text-slate-700')}`}
                                        >
                                            {t('stickerMode')}
                                        </button>
                                        <button
                                            onClick={() => setStickerType('EMOJI')}
                                            className={`px-6 py-2 rounded-lg font-bold transition-all ${stickerType === 'EMOJI' ? (theme === 'dark' ? 'bg-white/10 text-white shadow-lg border border-white/20' : 'bg-white text-pink-600 shadow-md') : (theme === 'dark' ? 'text-indigo-300 hover:text-white' : 'text-slate-500 hover:text-slate-700')}`}
                                        >
                                            {t('emojiMode')}
                                        </button>
                                    </div>
                                </div>
                                {stickerType === 'EMOJI' && (
                                    <div className="text-center text-sm text-pink-500 font-bold mb-8 animate-fade-in">
                                        {t('emojiNote')}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
                                    <div onClick={() => { setInputMode('PHOTO'); setCharCount(1); }} className={`cursor-pointer p-8 rounded-3xl border-2 hover:-translate-y-1 transition-all group ${theme === 'dark' ? 'bg-white/10 border-white/10 hover:border-indigo-400 hover:bg-white/15 backdrop-blur-md shadow-lg ring-1 ring-white/5' : 'bg-white border-white hover:border-indigo-500 hover:shadow-xl'}`}>
                                        <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">📸</div>
                                        <h3 className={`text-xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>{t('modePhoto')}</h3>
                                        <p className={`text-sm ${theme === 'dark' ? 'text-indigo-200' : 'text-slate-500'}`}>{t('modePhotoDesc')}</p>
                                    </div>
                                    <div onClick={() => setInputMode('EXISTING_IP')} className={`cursor-pointer p-8 rounded-3xl border-2 hover:-translate-y-1 transition-all group ${theme === 'dark' ? 'bg-white/10 border-white/10 hover:border-purple-400 hover:bg-white/15 backdrop-blur-md shadow-lg ring-1 ring-white/5' : 'bg-white border-white hover:border-purple-500 hover:shadow-xl'}`}>
                                        <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">🖼️</div>
                                        <h3 className={`text-xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>{t('modeExisting')}</h3>
                                        <p className={`text-sm ${theme === 'dark' ? 'text-indigo-200' : 'text-slate-500'}`}>{t('modeExistingDesc')}</p>
                                    </div>
                                    <div onClick={() => setInputMode('TEXT_PROMPT')} className={`cursor-pointer p-8 rounded-3xl border-2 hover:-translate-y-1 transition-all group ${theme === 'dark' ? 'bg-white/10 border-white/10 hover:border-pink-400 hover:bg-white/15 backdrop-blur-md shadow-lg ring-1 ring-white/5' : 'bg-white border-white hover:border-pink-500 hover:shadow-xl'}`}>
                                        <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">📝</div>
                                        <h3 className={`text-xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>{t('modeText')}</h3>
                                        <p className={`text-sm ${theme === 'dark' ? 'text-indigo-200' : 'text-slate-500'}`}>{t('modeTextDesc')}</p>
                                    </div>
                                    <div onClick={() => setInputMode('UPLOAD_SHEET')} className={`cursor-pointer p-8 rounded-3xl border-2 hover:-translate-y-1 transition-all group ${theme === 'dark' ? 'bg-white/10 border-white/10 hover:border-amber-400 hover:bg-white/15 backdrop-blur-md shadow-lg ring-1 ring-white/5' : 'bg-white border-white hover:border-amber-500 hover:shadow-xl'}`}>
                                        <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">📂</div>
                                        <h3 className={`text-xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>{t('modeUtility')}</h3>
                                        <p className={`text-sm ${theme === 'dark' ? 'text-indigo-200' : 'text-slate-500'}`}>{t('modeUtilityDesc')}</p>
                                    </div>
                                </div>
                            </>
                        )}

                        {inputMode && (
                            <div className="max-w-4xl mx-auto">
                                {/* ... (Previous Input Mode Handlers) ... */}
                                <button
                                    onClick={() => { setInputMode(null); setSourceImage(null); setPromptText(""); setCharCount(1); }}
                                    className="mb-6 flex items-center text-slate-500 hover:text-indigo-600 font-bold transition-colors gap-2 px-4 py-2 hover:bg-white rounded-full group"
                                >
                                    <div className="bg-white p-1.5 rounded-full shadow-sm group-hover:shadow border border-slate-200 group-hover:border-indigo-200 transition-all">
                                        <ArrowLeftIcon />
                                    </div>
                                    <span>{t('backStep')}</span>
                                </button>

                                <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 animate-fade-in-up">
                                    {/* Headers */}
                                    <div className="mb-8 border-b border-slate-100 pb-6">
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-2xl text-2xl ${inputMode === 'PHOTO' ? 'bg-indigo-100 text-indigo-600' :
                                                inputMode === 'EXISTING_IP' ? 'bg-purple-100 text-purple-600' :
                                                    inputMode === 'TEXT_PROMPT' ? 'bg-pink-100 text-pink-600' :
                                                        'bg-amber-100 text-amber-600'
                                                }`}>
                                                {inputMode === 'PHOTO' && '📸'}
                                                {inputMode === 'EXISTING_IP' && '🖼️'}
                                                {inputMode === 'TEXT_PROMPT' && '📝'}
                                                {inputMode === 'UPLOAD_SHEET' && '📂'}
                                            </div>
                                            <div>
                                                <h3 className="text-2xl font-black text-slate-800">
                                                    {inputMode === 'PHOTO' && t('modePhoto')}
                                                    {inputMode === 'EXISTING_IP' && t('modeExisting')}
                                                    {inputMode === 'TEXT_PROMPT' && t('modeText')}
                                                    {inputMode === 'UPLOAD_SHEET' && t('modeUtility')}
                                                </h3>
                                                <p className="text-sm text-slate-500 font-medium">
                                                    {inputMode === 'PHOTO' && t('modePhotoDesc')}
                                                    {inputMode === 'EXISTING_IP' && t('modeExistingDesc')}
                                                    {inputMode === 'TEXT_PROMPT' && t('modeTextDesc')}
                                                    {inputMode === 'UPLOAD_SHEET' && t('modeUtilityDesc')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* PHOTO MODE: Character Count Selector */}
                                    {inputMode === 'PHOTO' && (
                                        <div className="mb-8 bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                                    <span>👥</span> {t('charCount')}
                                                    <span className="text-xs font-normal text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200">{t('charCountSingle')} / {t('charCountDual')}</span>
                                                </label>
                                                <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                                                    <button
                                                        onClick={() => handleCharCountChange(1)}
                                                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${charCount === 1 ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-indigo-500'}`}
                                                    >
                                                        {t('charCountSingle')}
                                                    </button>
                                                    <button
                                                        onClick={() => handleCharCountChange(2)}
                                                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${charCount === 2 ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-indigo-500'}`}
                                                    >
                                                        {t('charCountDual')}
                                                    </button>
                                                </div>
                                            </div>


                                        </div>
                                    )}

                                    {/* SINGLE IMAGE MODE (PHOTO=1 or EXISTING_IP) */}
                                    {(inputMode === 'EXISTING_IP' || (inputMode === 'PHOTO' && charCount === 1)) && (
                                        <div className="mb-8">
                                            <div
                                                onClick={() => fileInputRef.current?.click()}
                                                className="border-3 border-dashed border-slate-200 rounded-2xl h-72 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 hover:border-indigo-400 transition-all group overflow-hidden relative"
                                            >
                                                {sourceImage ? (
                                                    <div className="relative w-full h-full p-4">
                                                        <img src={sourceImage} alt="Source" className="w-full h-full object-contain rounded-xl" />
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <span className="text-white font-bold bg-black/50 px-4 py-2 rounded-full backdrop-blur-sm">{t('changeImage')}</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="bg-indigo-50 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300">
                                                            <UploadIcon />
                                                        </div>
                                                        <p className="text-slate-600 font-bold text-lg">{t('clickUpload')}</p>
                                                        <p className="text-slate-400 text-sm mt-1">{t('uploadSupport')}</p>
                                                    </>
                                                )}
                                                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                            </div>
                                        </div>
                                    )}

                                    {/* MULTI CHARACTERS MODE (PHOTO > 1) */}
                                    {inputMode === 'PHOTO' && charCount > 1 && (
                                        <div className="mb-8 space-y-6 animate-fade-in">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                {groupChars.map((char, index) => (
                                                    <div key={char.id} className="bg-white border-2 border-slate-100 p-4 rounded-2xl relative hover:border-indigo-200 transition-colors shadow-sm">
                                                        <div className="absolute top-2 left-2 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-black text-xs">
                                                            {index + 1}
                                                        </div>

                                                        <div className="flex flex-col gap-4 mt-8">
                                                            {/* Image Upload */}
                                                            <div className="relative w-full h-40 bg-slate-50 rounded-xl border border-dashed border-slate-300 flex items-center justify-center overflow-hidden cursor-pointer hover:bg-slate-100 transition-colors">
                                                                {char.image ? (
                                                                    <div className="relative w-full h-full group">
                                                                        <img src={char.image} alt={`Char ${index + 1}`} className="w-full h-full object-contain" />
                                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                            <span className="text-xs text-white font-bold bg-black/50 px-3 py-1 rounded-full">{t('changeImage')}</span>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-center p-4">
                                                                        <span className="text-2xl block mb-2">👤</span>
                                                                        <span className="text-xs text-slate-400 font-bold">{t('uploadRefImage')}</span>
                                                                    </div>
                                                                )}
                                                                <input
                                                                    type="file"
                                                                    accept="image/*"
                                                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                                                    onChange={(e) => handleGroupCharImageUpload(index, e)}
                                                                />
                                                            </div>

                                                            {/* Description */}
                                                            <div>
                                                                <div className="flex justify-between items-center mb-1">
                                                                    <label className="text-xs font-bold text-slate-400">{t('descLabel')}</label>
                                                                    <button
                                                                        onClick={() => handleAutoAnalyzeChar(char.id, char.image)}
                                                                        disabled={!char.image || analyzingCharId === char.id}
                                                                        className={`text-[10px] px-2 py-1 rounded-full font-bold flex items-center gap-1 transition-all
                                                                ${!char.image
                                                                                ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                                                                : analyzingCharId === char.id
                                                                                    ? 'bg-indigo-100 text-indigo-400 cursor-wait'
                                                                                    : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700'
                                                                            }`}
                                                                    >
                                                                        {analyzingCharId === char.id ? (
                                                                            <>
                                                                                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-ping"></div>
                                                                                分析中...
                                                                            </>
                                                                        ) : (
                                                                            <>{t('autoDetect')}</>
                                                                        )}
                                                                    </button>
                                                                </div>
                                                                <textarea
                                                                    value={char.description}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        setGroupChars(prev => prev.map((c, i) => i === index ? { ...c, description: val } : c));
                                                                    }}
                                                                    placeholder={t('descPlaceholder')}
                                                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-200 resize-none h-24"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {inputMode === 'TEXT_PROMPT' && (
                                        <div className="mb-8 space-y-4">
                                            {/* Keyword Input Section */}
                                            <div>
                                                <div>
                                                    <label className="block text-sm font-bold text-slate-700 mb-2">{t('enterKeyword')}</label>
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="text"
                                                            value={subjectKeyword}
                                                            onChange={(e) => setSubjectKeyword(e.target.value)}
                                                            placeholder={t('enterKeywordPlaceholder')}
                                                            className="flex-1 p-4 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-pink-500 outline-none font-medium"
                                                        />
                                                        <button
                                                            onClick={handleGenerateDescriptionFromKeyword}
                                                            disabled={isGeneratingDescription || !subjectKeyword.trim()}
                                                            className="px-6 py-2 bg-pink-100 hover:bg-pink-200 text-pink-700 rounded-xl font-bold shadow-sm flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                                        >
                                                            {isGeneratingDescription ? (
                                                                <div className="w-4 h-4 border-2 border-pink-400 border-t-transparent rounded-full animate-spin"></div>
                                                            ) : (
                                                                <>{t('autoGenerateDesc')}</>
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="relative">
                                                    <label className="block text-sm font-bold text-slate-700 mb-2">{t('charDesc')}</label>
                                                    <textarea
                                                        value={promptText}
                                                        onChange={(e) => setPromptText(e.target.value)}
                                                        className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-pink-500 outline-none font-medium text-lg min-h-[200px]"
                                                        placeholder={t('charDescPlaceholder')}
                                                    />
                                                    <div className="absolute bottom-4 right-4 relative">
                                                        <button
                                                            onClick={() => setShowDiceMenu(!showDiceMenu)}
                                                            disabled={diceLoading}
                                                            className={`p-2 rounded-full shadow-lg transition-all active:scale-95 flex items-center gap-2 px-3
                                                ${diceLoading ? 'bg-slate-100 text-slate-400' : 'bg-white hover:bg-pink-50 text-pink-600 hover:text-pink-700 border border-pink-100'}
                                            `}
                                                            title={t('randomTitle')}
                                                        >
                                                            {diceLoading ? (
                                                                <div className="w-5 h-5 border-2 border-pink-200 border-t-pink-600 rounded-full animate-spin"></div>
                                                            ) : (
                                                                <>
                                                                    <DiceIcon />
                                                                    <span className="text-xs font-bold">{t('randomIdea')}</span>
                                                                </>
                                                            )}
                                                        </button>
                                                        {showDiceMenu && (
                                                            <div className="absolute bottom-full right-0 mb-2 bg-white rounded-xl shadow-xl border border-pink-100 p-2 w-48 animate-fade-in z-20 flex flex-col gap-1">
                                                                <div className="text-[10px] text-slate-400 font-bold px-2 py-1 uppercase">{t('selectRandomType')}</div>
                                                                <button onClick={() => handleDiceRoll('ANIMAL')} className="w-full text-left px-3 py-2 hover:bg-pink-50 rounded-lg text-sm font-bold text-slate-700 hover:text-pink-600 transition-colors flex items-center gap-2">{t('randomAnimal')}</button>
                                                                <button onClick={() => handleDiceRoll('PERSON')} className="w-full text-left px-3 py-2 hover:bg-pink-50 rounded-lg text-sm font-bold text-slate-700 hover:text-pink-600 transition-colors flex items-center gap-2">{t('randomPerson')}</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                    )}

                                    {inputMode === 'UPLOAD_SHEET' && (
                                        <div className="mb-8 space-y-10">
                                            <div className="space-y-6">
                                                <div className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm space-y-6 relative overflow-hidden">
                                                    <div className="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                        <div>
                                                            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">{t('sheetQtyLabel')} <span className="text-amber-500 text-[10px] ml-1">{t('sheetQtyHint')}</span></label>
                                                            <div className="flex flex-wrap gap-2">
                                                                {validQuantities.map(n => (
                                                                    <button key={n} onClick={() => handleQuantityChange(n as StickerQuantity)} className={`w-10 h-10 rounded-xl text-sm font-black transition-all flex items-center justify-center border-2 ${stickerQuantity === n ? 'bg-amber-400 border-amber-400 text-white shadow-lg scale-110' : 'bg-white border-slate-200 text-slate-400 hover:border-amber-200 hover:text-amber-400'}`}>{n}</button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div onClick={() => sheetInputRef.current?.click()} className="border-3 border-dashed border-slate-300 bg-slate-50/50 rounded-3xl h-48 flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-50 hover:border-indigo-400 hover:scale-[1.01] transition-all group overflow-hidden relative">
                                                    <div className="bg-white p-4 rounded-full mb-3 group-hover:scale-110 transition-transform duration-300 shadow-md"><FolderOpenIcon /></div>
                                                    <p className="text-slate-700 font-bold text-lg">{t('clickUploadSheet')}</p>
                                                    <p className="text-slate-400 text-sm mt-1">{t('uploadSheetSupport')}</p>
                                                    <input ref={sheetInputRef} type="file" accept="image/*" className="hidden" onChange={handleSheetUpload} />
                                                </div>
                                            </div>
                                            {/* ... Prompt Generator ... */}
                                            <div className="bg-indigo-50/30 rounded-3xl border border-indigo-100 overflow-hidden transition-all duration-300">
                                                <button onClick={() => { setPromptModalTarget('SHEET_INPUT'); setIsPromptModalOpen(true); }} className="w-full p-5 flex items-center justify-between text-left hover:bg-indigo-50 transition-colors group">
                                                    <div className="flex items-center gap-3">
                                                        <div className="bg-indigo-100 text-indigo-600 p-2 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors"><span className="text-lg">✨</span></div>
                                                        <div>
                                                            <h4 className="text-base font-bold text-indigo-900">{t('promptGenTitle')}</h4>
                                                            <p className="text-xs text-indigo-400 mt-0.5">{t('promptGenSubtitle')}</p>
                                                        </div>
                                                    </div>
                                                    <div className={`transform transition-transform duration-300 text-indigo-300`}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                    </div>
                                                </button>

                                                {/* Removed inline Prompt Generator, replaced with Modal trigger above */}

                                                {isPromptGeneratorOpen && (
                                                    /* Hidden or Removed - Keeping structure clean */
                                                    <div className="hidden"></div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {
                                        inputMode !== 'UPLOAD_SHEET' && inputMode !== 'EXISTING_IP' && (
                                            <div className="mb-8">
                                                <label className="block text-sm font-bold text-slate-700 mb-2">{t('artStyleLabel')}</label>
                                                <div className="flex flex-wrap gap-2 mb-3">
                                                    {ART_STYLES.map(styleKey => (
                                                        <button key={styleKey} onClick={() => setStylePrompt(t(styleKey))} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${stylePrompt === t(styleKey) ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-500'}`}>{t(styleKey).split(/[\(\（]/)[0]}</button>
                                                    ))}                    </div>
                                                <div className="relative">
                                                    <input type="text" value={stylePrompt} onChange={(e) => setStylePrompt(e.target.value)} className="w-full p-4 pl-12 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-medium" />
                                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🎨</div>
                                                </div>
                                            </div>
                                        )
                                    }

                                    {
                                        inputMode !== 'UPLOAD_SHEET' && (
                                            <button onClick={handleGenerateCharacter} disabled={isProcessing} className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-black text-lg shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                                {isProcessing ? (<><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>{t('designing')}</>) : (<>{t('startDesign')} ✨</>)}
                                            </button>
                                        )
                                    }
                                </div>
                            </div>
                        )}
                    </div>
                )}


                {
                    appStep === AppStep.CANDIDATE_SELECTION && generatedChar && (
                        <div className="animate-fade-in-up mt-2 max-w-4xl mx-auto pb-32">
                            {/* ... (Previous Candidate Selection Code) ... */}
                            <div className="text-center mb-8">
                                <h2 className="text-3xl font-black text-slate-800">{t('charBornTitle')} ✨</h2>
                                <p className="text-slate-500 mt-2">{t('charBornSubtitle')}</p>
                            </div>

                            <div className="bg-white rounded-3xl shadow-xl overflow-hidden border-2 border-slate-100 p-6 mb-8">
                                {/* Fixed Height Container to prevent full-screen takeover */}
                                <div className="w-full h-[50vh] flex items-center justify-center bg-gray-50 rounded-2xl relative group border border-slate-100 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==')]">
                                    <img src={generatedChar.url} alt="Character" className="h-full w-full object-contain shadow-lg" />
                                    <button onClick={handleGenerateCharacter} className="absolute top-4 right-4 bg-white/90 backdrop-blur text-slate-700 px-4 py-2 rounded-full font-bold shadow-md hover:bg-white hover:text-indigo-600 transition-all flex items-center gap-2">
                                        <RefreshIcon /> {t('retryGenerate')}
                                    </button>
                                </div>
                            </div>

                            {/* Sticky Action Buttons */}
                            <div className="fixed bottom-0 left-0 w-full bg-white/90 backdrop-blur-md border-t border-slate-200 p-4 z-50 flex justify-center gap-4 shadow-[0_-5px_10px_rgba(0,0,0,0.05)]">
                                <div className="max-w-4xl w-full flex gap-4">
                                    <button onClick={() => setAppStep(AppStep.UPLOAD)} className="flex-1 py-4 border-2 border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all shadow-sm">← {t('backModifyConfig')}</button>
                                    <button onClick={() => setAppStep(AppStep.STICKER_CONFIG)} className="flex-[2] py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-black text-lg shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all flex items-center justify-center gap-2">{t('confirmNext')} →</button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {
                    appStep === AppStep.STICKER_CONFIG && (
                        <div className="animate-fade-in-up mt-2 max-w-6xl mx-auto">
                            <div className="flex justify-between items-end mb-8">
                                <div>
                                    <h2 className="text-3xl font-black text-slate-800">{t('configTitle')} 📝</h2>
                                    <p className="text-slate-500 mt-2">{t('configSubtitle')}</p>
                                </div>
                                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex gap-4 items-center">
                                    <div className="flex gap-2 items-center">
                                        <span className="text-xs font-bold text-slate-400">{t('quantityLabel')}</span>
                                        <select value={stickerQuantity} onChange={(e) => handleQuantityChange(Number(e.target.value) as StickerQuantity)} className="bg-slate-50 border-none rounded-lg font-bold text-slate-700 focus:ring-2 focus:ring-indigo-200 py-2">
                                            {validQuantities.map(n => <option key={n} value={n}>{n} {t('unitSheet')}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                <div className="lg:col-span-1 space-y-6">
                                    <div className="bg-gradient-to-br from-indigo-50 to-white p-6 rounded-3xl border border-indigo-100 shadow-sm sticky top-24">
                                        <div className="flex items-center gap-2 mb-4"><span className="text-2xl">✍️</span><h3 className="font-bold text-slate-800">{t('copywritingTitle')}</h3></div>
                                        <p className="text-xs text-slate-500 mb-4">{t('copywritingSubtitle')}</p>

                                        <div className="mb-4">
                                            <TextToggle enabled={includeText} onChange={setIncludeText} />
                                        </div>

                                        <textarea value={smartInputText} onChange={(e) => setSmartInputText(e.target.value)} className="w-full h-40 p-4 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-400 outline-none resize-none bg-white mb-4" placeholder={t('pasteIdeasPlaceholder')} />
                                        <button onClick={handleSmartInput} disabled={!smartInputText.trim() || isProcessing} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"><MagicWandIcon /> {t('analyzeAndFill')}</button>
                                        <div className="mt-4 border-t border-indigo-100 pt-4">
                                            <button
                                                onClick={() => { setPromptModalTarget('SMART_INPUT'); setIsPromptModalOpen(true); }}
                                                className="w-full flex items-center justify-between text-xs font-bold text-indigo-500 hover:text-indigo-700 transition-colors p-2 rounded-lg hover:bg-indigo-50"
                                            >
                                                <span className="flex items-center gap-2">✨ {t('promptGenTitle')} <span className="text-[10px] bg-indigo-100 px-1.5 py-0.5 rounded text-indigo-600">New</span></span>
                                                <span>→</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="lg:col-span-2 space-y-4 pb-32">
                                    {stickerConfigs.map((config, idx) => (
                                        <div key={config.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex gap-4 items-start group hover:border-indigo-200 transition-colors">
                                            <div className="w-8 h-8 flex-shrink-0 bg-slate-100 rounded-full flex items-center justify-center font-black text-slate-400 text-xs">{idx + 1}</div>
                                            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('textLabel')}</label>
                                                    <div className="flex gap-2">
                                                        <input type="text" value={config.text} onChange={(e) => { const newConfigs = [...stickerConfigs]; newConfigs[idx].text = e.target.value; setStickerConfigs(newConfigs); }} className="flex-1 p-2 bg-slate-50 rounded-lg border-none text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-200" placeholder={t('noText')} disabled={!includeText} />
                                                        <button onClick={() => { const newConfigs = [...stickerConfigs]; newConfigs[idx].showText = !newConfigs[idx].showText; setStickerConfigs(newConfigs); }} className={`px-3 rounded-lg text-xs font-bold transition-colors ${config.showText ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`} disabled={!includeText}>{config.showText ? 'ON' : 'OFF'}</button>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('promptLabel')}</label>
                                                    <div className="flex flex-col gap-2">
                                                        {/* Chinese Action Description & Translation */}
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                value={config.emotionPromptCN || ""}
                                                                onChange={(e) => { const newConfigs = [...stickerConfigs]; newConfigs[idx].emotionPromptCN = e.target.value; setStickerConfigs(newConfigs); }}
                                                                className="flex-1 p-2 bg-slate-50 rounded-lg border-none text-sm text-slate-600 focus:ring-2 focus:ring-indigo-200"
                                                                placeholder={t('promptCNPlaceholder')}
                                                            />
                                                            <button
                                                                onClick={() => handleTranslatePrompt(config.id, config.emotionPromptCN || "")}
                                                                disabled={optimizingId === config.id || !config.emotionPromptCN}
                                                                className="px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors flex items-center justify-center font-bold text-xs border border-indigo-200"
                                                                title={t('translateToEn')}
                                                            >
                                                                {optimizingId === config.id ? (
                                                                    <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                                                                ) : (
                                                                    <span>→ {t('translate')}</span>
                                                                )}
                                                            </button>
                                                        </div>

                                                        {/* English Visual Prompt & Optimize */}
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                value={config.emotionPrompt}
                                                                onChange={(e) => { const newConfigs = [...stickerConfigs]; newConfigs[idx].emotionPrompt = e.target.value; setStickerConfigs(newConfigs); }}
                                                                className="w-full p-2 bg-slate-50 rounded-lg border-none text-sm text-slate-600 focus:ring-2 focus:ring-indigo-200"
                                                                placeholder="English Visual Prompt"
                                                            />
                                                            <button
                                                                onClick={() => handleOptimizePrompt(config.id, config.text)}
                                                                disabled={optimizingId === config.id || !config.text}
                                                                className="px-3 bg-purple-50 hover:bg-purple-100 text-purple-600 rounded-lg transition-colors flex items-center justify-center"
                                                                title={t('autoGenVisDesc')}
                                                            >
                                                                {optimizingId === config.id ? (
                                                                    <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
                                                                ) : (
                                                                    <span className="text-xs font-bold whitespace-nowrap">✨ AI</span>
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="fixed bottom-0 left-0 w-full bg-white/80 backdrop-blur-md border-t border-slate-200 p-4 z-40 flex justify-center shadow-[0_-5px_10px_rgba(0,0,0,0.05)]">
                                        <button onClick={handleGenerateStickers} className="max-w-md w-full py-4 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-full font-black text-xl shadow-xl hover:scale-105 transition-transform flex items-center justify-center gap-2">✨ {t('startGenerateStickers')}</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }

                {
                    appStep === AppStep.SHEET_EDITOR && rawSheetUrls.length > 0 && (
                        <div className="animate-fade-in-up mt-2 h-[calc(100vh-140px)] flex flex-col">
                            {/* ... (Sheet Editor code remains same) ... */}
                            <div className="flex justify-between items-center mb-4 px-2">
                                <h2 className="text-2xl font-black text-slate-800">{t('sheetCheckTitle')} 🛠️</h2>
                                <div className="flex gap-4">
                                    <button onClick={handleOpenSheetMagicEditor} className="px-4 py-2 bg-purple-100 text-purple-700 rounded-xl font-bold hover:bg-purple-200 transition-colors flex items-center gap-2"><MagicWandIcon /> 魔法修復 (Magic Edit)</button>
                                    <button
                                        onClick={handleAutoProcess}
                                        disabled={!isOpenCVReady}
                                        className={`px-6 py-2 rounded-xl font-bold shadow-lg transition-all flex items-center gap-2
                                ${isOpenCVReady ? 'bg-emerald-500 text-white hover:bg-emerald-600 hover:-translate-y-0.5' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                                    >
                                        <span className="text-xl">🟢</span>
                                        {isOpenCVReady ? t('greenScreenAutoSlice') : t('loadingModule')}
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 bg-slate-900 rounded-3xl overflow-hidden relative flex items-center justify-center border-4 border-slate-200">
                                <img src={rawSheetUrls[currentSheetIndex]} alt="Sheet" className="max-w-full max-h-full object-contain shadow-2xl" />
                                {rawSheetUrls.length > 1 && (
                                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-md rounded-full p-2 flex gap-2">
                                        {rawSheetUrls.map((_, idx) => (
                                            <button key={idx} onClick={() => setCurrentSheetIndex(idx)} className={`w-3 h-3 rounded-full transition-all ${currentSheetIndex === idx ? 'bg-white scale-125' : 'bg-white/30 hover:bg-white/50'}`} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                }

                {
                    appStep === AppStep.STICKER_PROCESSING && (
                        <div className="animate-fade-in-up mt-2">
                            {/* ... (Sticker Processing code remains same) ... */}
                            <div className="flex flex-col md:flex-row justify-between items-end md:items-center mb-6 gap-4">
                                <div>
                                    <h2 className="text-3xl font-black text-slate-800">{t('stickerDoneTitle')} 🎉</h2>
                                    <p className="text-slate-500 mt-1">{t('stickerDoneSubtitle')}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={zipFileName}
                                            onChange={(e) => setZipFileName(e.target.value)}
                                            className="pl-3 pr-9 py-3 rounded-xl border border-slate-200 shadow-sm focus:ring-2 focus:ring-green-400 outline-none text-sm font-bold w-40 text-slate-700"
                                            placeholder="MyStickers"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold pointer-events-none">.zip</span>
                                    </div>
                                    {stickerType === 'EMOJI' && (
                                        <button
                                            onClick={async () => {
                                                if (!finalStickers[0]) return;
                                                const url = await generateTabImage(finalStickers[0].url);
                                                const a = document.createElement('a'); a.href = url; a.download = 'tab.png'; a.click();
                                            }}
                                            className="px-4 py-3 bg-white border-2 border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-sm whitespace-nowrap"
                                        >
                                            {t('generateTabThumb')}
                                        </button>
                                    )}
                                    <button onClick={() => generateFrameZip(finalStickers, zipFileName || "MyStickers", finalStickers.find(s => s.id === mainStickerId)?.url, stickerPackageInfo || undefined, stickerType)} className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold shadow-lg flex items-center gap-2 transition-transform hover:-translate-y-1 whitespace-nowrap"><DownloadIcon /> {t('downloadAll')}</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
                                {finalStickers.map((sticker, idx) => (
                                    <StickerCard key={sticker.id} sticker={sticker} countdown={0} isMain={sticker.id === mainStickerId} onRetry={() => { }} onDownload={() => { const a = document.createElement('a'); a.href = sticker.url; a.download = `sticker_${idx + 1}.png`; a.click(); }} onEdit={() => handleMagicEdit(sticker.id)} onSetMain={() => setMainStickerId(sticker.id)} />
                                ))}
                            </div>
                            {stickerPackageInfo && (
                                <div className="bg-white rounded-2xl border-2 border-indigo-100 p-8 shadow-sm relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><div className="text-9xl">📦</div></div>
                                    <div className="relative z-10">
                                        <h3 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-2"><span className="bg-indigo-100 text-indigo-600 p-2 rounded-lg text-xl">💡</span>{t('marketInfoTitle')}<span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-1 rounded ml-2">{t('autoGenerated')}</span></h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2 mb-2"><span className="w-2 h-2 rounded-full bg-indigo-500"></span><span className="text-sm font-bold text-slate-500 uppercase tracking-widest">{t('infoZH')}</span></div>
                                                <div><label className="block text-xs font-bold text-slate-400 mb-1">{t('stickerTitle')}</label><div className="flex gap-2"><input readOnly value={stickerPackageInfo.title.zh} className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200" /><CopyBtn text={stickerPackageInfo.title.zh} /></div></div>
                                                <div><label className="block text-xs font-bold text-slate-400 mb-1">{t('stickerDesc')}</label><div className="relative"><textarea readOnly value={stickerPackageInfo.description.zh} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200 h-24 resize-none" /><div className="absolute bottom-3 right-3"><CopyBtn text={stickerPackageInfo.description.zh} /></div></div></div>
                                            </div>
                                            <div className="space-y-4 flex flex-col">
                                                <div className="flex items-center gap-2 mb-2"><span className="w-2 h-2 rounded-full bg-purple-500"></span><span className="text-sm font-bold text-slate-500 uppercase tracking-widest">{t('infoEN')}</span></div>
                                                <div><label className="block text-xs font-bold text-slate-400 mb-1">Title</label><div className="flex gap-2"><input readOnly value={stickerPackageInfo.title.en} className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-purple-200" /><CopyBtn text={stickerPackageInfo.title.en} label="Copy" successLabel="Copied" /></div></div>
                                                <div><label className="block text-xs font-bold text-slate-400 mb-1">Description</label><div className="relative"><textarea readOnly value={stickerPackageInfo.description.en} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 outline-none focus:ring-2 focus:ring-purple-200 h-24 resize-none" /><div className="absolute bottom-3 right-3"><CopyBtn text={stickerPackageInfo.description.en} label="Copy" successLabel="Copied" /></div></div></div>
                                                <div className="flex-1 flex items-end justify-end mt-4"><a href="https://creator.line.me/zh-hant/" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 font-bold bg-indigo-50 hover:bg-indigo-100 px-6 py-3 rounded-xl transition-colors shadow-sm hover:shadow-md"><span>🚀</span> {t('goToMarket')}<ExternalLinkIcon /></a></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="mt-12 mb-20 text-center">
                                <p className="text-slate-500 font-bold mb-4 text-sm tracking-widest uppercase">{t('addicted')}</p>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="px-8 py-4 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white rounded-2xl font-black text-xl shadow-xl hover:shadow-2xl transform transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-3 mx-auto"
                                >
                                    <span className="text-2xl">🎲</span> {t('tryAgain')}
                                </button>
                            </div>
                        </div>
                    )}
            </main >
            {isProcessing && <Loader message={loadingMsg} />
            }
            <MagicEditor isOpen={magicEditorOpen} imageUrl={editorImage} onClose={() => setMagicEditorOpen(false)} onGenerate={handleMagicGenerate} isProcessing={isProcessing} isAnimated={false} />
            <PromptGeneratorModal
                isOpen={isPromptModalOpen}
                onClose={() => setIsPromptModalOpen(false)}
                onApply={handlePromptApply}
                initialCharacter={charComposition}
                stickerType={'STICKER'}
            />
            <HelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
        </div >
    );
}
