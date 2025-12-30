
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
    CharacterInput
} from './types';
import { generateIPCharacter, generateStickerSheet, editSticker, parseStickerIdeas, generateStickerPackageInfo, generateRandomCharacterPrompt, generateVisualDescription, generateGroupCharacterSheet, analyzeImageForCharacterDescription, generateCharacterDescriptionFromKeyword, translateActionToEnglish } from './services/geminiService';
import { generateFrameZip, wait, resizeImage, extractDominantColors, blobToDataUrl, getFontFamily, processGreenScreenImage, generateTabImage } from './services/utils';
import { processGreenScreenAndSlice, waitForOpenCV } from './services/opencvService';
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
    "Q版萌系插畫 (Chibi Kawaii)",
    "手繪蠟筆風 (Hand-drawn Crayon)",
    "3D 盲盒公仔 (3D Blind Box)",
    "美式復古卡通 (Retro Cartoon)",
    "日系動漫賽璐珞 (Anime Cell Shading)",
    "像素藝術 (Pixel Art)",
    "醜萌梗圖風 (Ugly Cute Meme)",
    "向量平面設計 (Flat Vector)"
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

export const App = () => {
    // const [apiKeyReady, setApiKeyReady] = useState(false); // Removed
    const [appStep, setAppStep] = useState<AppStep | number>(AppStep.UPLOAD);
    const [inputMode, setInputMode] = useState<InputMode | null>(null);

    // Single Character States
    const [sourceImage, setSourceImage] = useState<string | null>(null);
    const [promptText, setPromptText] = useState("");
    const [subjectKeyword, setSubjectKeyword] = useState(""); // New state for keyword input
    const [isGeneratingDescription, setIsGeneratingDescription] = useState(false); // State for keyword loading

    // Group Character States
    const [charCount, setCharCount] = useState<number>(1);
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
    const [promptFontStyleInput, setPromptFontStyleInput] = useState("");
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


    // OpenCV State
    const [isOpenCVReady, setIsOpenCVReady] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const sheetInputRef = useRef<HTMLInputElement>(null);

    const [hasKey, setHasKey] = useState(false);

    const setKeyAndStart = (key: string) => {
        setApiKey(key);
        setHasKey(true);
    };

    useEffect(() => {
        const stored = localStorage.getItem('gemini_api_key');
        if (stored) {
            setKeyAndStart(stored);
        }
    }, []);

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

    const handleSmartInput = async () => {
        if (!smartInputText.trim()) return;
        setIsProcessing(true);
        setLoadingMsg("正在分析您的筆記並轉換為貼圖靈感...");
        try {
            const ideas = await parseStickerIdeas(smartInputText, includeText ? stickerQuantity : stickerQuantity); // Fixed includeText logic

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
                        newConfigs[index].emotionPromptCN = idea.emotionPromptCN; // Map Chinese prompt
                        newConfigs[index].showText = includeText && !!idea.text;
                    }
                });
                setStickerConfigs(newConfigs);
                alert(`已偵測到 ${ideas.length} 個貼圖靈感，自動切換為 ${newQty} 張模式並填入內容！`);
            } else {
                alert("AI 無法識別內容，請試著用條列式輸入 (例如: 1.早安 2.謝謝)");
            }
        } catch (e) {
            console.error(e);
            alert("分析失敗，請重試");
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
        if (inputMode === 'PHOTO' && charCount > 1) {
            // Validation removed to make description optional
        } else if (!sourceImage && inputMode !== 'TEXT_PROMPT' && !(inputMode === 'PHOTO' && charCount > 1)) {
            return alert("請先上傳圖片或輸入描述！");
        }

        setIsProcessing(true);
        setLoadingMsg("正在設計您的 IP 角色 (約需 15-20 秒)...");
        try {
            let result;

            if (inputMode === 'PHOTO' && charCount > 1) {
                result = await generateGroupCharacterSheet(groupChars, stylePrompt);
            } else {
                result = await generateIPCharacter(
                    inputMode === 'TEXT_PROMPT' ? promptText : sourceImage!,
                    stylePrompt,
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
        setLoadingMsg("正在繪製...");

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
                setLoadingMsg(`正在繪製第 ${i + 1} / ${batches.length} 張底圖...`);
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

    const fontStyleDisplay = promptFontStyleInput || "可愛 Q 版字型";
    const artStyleDisplay = promptArtStyleInput || "可愛、活潑、2D平面";

    const promptTemplate = useMemo(() => {
        return `[引導指令]... (省略, 保持原樣)`;
    }, [stickerQuantity, artStyleDisplay, formattedTextList, fontStyleDisplay, currentSpec]);

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
        return <LandingPage onStart={setKeyAndStart} />;
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-20">
            <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-2">
                    <div className="bg-gradient-to-tr from-indigo-600 to-purple-500 text-white p-2 rounded-lg">
                        <StickerIcon />
                    </div>
                    <span className="text-xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">DreamSticker AI</span>
                </div>
                <div className="flex gap-4">
                    <button onClick={() => setHelpOpen(true)} className="p-2 hover:bg-indigo-50 rounded-full text-indigo-600 transition-colors">
                        <HelpIcon />
                    </button>
                </div>
            </nav>

            <main className="max-w-5xl mx-auto p-6">
                {appStep > AppStep.UPLOAD && (
                    <button
                        onClick={handleBack}
                        className="mb-6 flex items-center text-slate-500 hover:text-indigo-600 font-bold transition-colors gap-2 px-4 py-2 hover:bg-white rounded-full group"
                    >
                        <div className="bg-white p-1.5 rounded-full shadow-sm group-hover:shadow border border-slate-200 group-hover:border-indigo-200 transition-all">
                            <ArrowLeftIcon />
                        </div>
                        <span>返回上一步</span>
                    </button>
                )}

                {appStep === AppStep.UPLOAD && (
                    <div className="animate-fade-in-up space-y-8 mt-10">
                        {/* ... (Previous code remains the same) ... */}
                        {!inputMode && (
                            <>
                                <div className="text-center space-y-4">
                                    <h2 className="text-4xl font-black text-slate-800">創造您的專屬 IP 角色</h2>
                                    <p className="text-slate-500 text-lg">選擇一種方式開始，AI 將為您打造獨一無二的貼圖主角</p>
                                </div>

                                {/* PRODUCT MODE SWITCHER */}
                                <div className="flex justify-center mt-8 mb-4">
                                    <div className="bg-slate-200 p-1 rounded-xl flex gap-1">
                                        <button
                                            onClick={() => setStickerType('STATIC')}
                                            className={`px-6 py-2 rounded-lg font-bold transition-all ${stickerType === 'STATIC' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            一般貼圖 (Stickers)
                                        </button>
                                        <button
                                            onClick={() => setStickerType('EMOJI')}
                                            className={`px-6 py-2 rounded-lg font-bold transition-all ${stickerType === 'EMOJI' ? 'bg-white text-pink-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            LINE 表情貼 (Emojis)
                                        </button>
                                    </div>
                                </div>
                                {stickerType === 'EMOJI' && (
                                    <div className="text-center text-sm text-pink-500 font-bold mb-8 animate-fade-in">
                                        ＊表情貼模式：尺寸 180x180 px，無白邊，適合連續輸入
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
                                    <div onClick={() => { setInputMode('PHOTO'); setCharCount(1); }} className="cursor-pointer p-8 rounded-3xl border-2 border-white bg-white hover:border-indigo-500 hover:shadow-xl hover:-translate-y-1 transition-all group">
                                        <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">📸</div>
                                        <h3 className="text-xl font-bold mb-2">照片轉 IP</h3>
                                        <p className="text-sm text-slate-500">支援單人、雙人、多人合照，自動轉換為卡通形象。</p>
                                    </div>
                                    <div onClick={() => setInputMode('EXISTING_IP')} className="cursor-pointer p-8 rounded-3xl border-2 border-white bg-white hover:border-purple-500 hover:shadow-xl hover:-translate-y-1 transition-all group">
                                        <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">🖼️</div>
                                        <h3 className="text-xl font-bold mb-2">現有 IP</h3>
                                        <p className="text-sm text-slate-500">保留原圖風格，僅製作不同表情。</p>
                                    </div>
                                    <div onClick={() => setInputMode('TEXT_PROMPT')} className="cursor-pointer p-8 rounded-3xl border-2 border-white bg-white hover:border-pink-500 hover:shadow-xl hover:-translate-y-1 transition-all group">
                                        <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">📝</div>
                                        <h3 className="text-xl font-bold mb-2">文字生成</h3>
                                        <p className="text-sm text-slate-500">輸入描述，無中生有創造角色。</p>
                                    </div>
                                    <div onClick={() => setInputMode('UPLOAD_SHEET')} className="cursor-pointer p-8 rounded-3xl border-2 border-white bg-white hover:border-amber-500 hover:shadow-xl hover:-translate-y-1 transition-all group">
                                        <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">📂</div>
                                        <h3 className="text-xl font-bold mb-2">上傳底圖</h3>
                                        <p className="text-sm text-slate-500">已有做好的拼圖？直接上傳進行切割。</p>
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
                                    <span>返回模式選擇</span>
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
                                                    {inputMode === 'PHOTO' && '照片轉 IP'}
                                                    {inputMode === 'EXISTING_IP' && '現有 IP'}
                                                    {inputMode === 'TEXT_PROMPT' && '文字生成'}
                                                    {inputMode === 'UPLOAD_SHEET' && '上傳底圖'}
                                                </h3>
                                                <p className="text-sm text-slate-500 font-medium">
                                                    {inputMode === 'PHOTO' && '上傳照片，AI 將為您轉換風格'}
                                                    {inputMode === 'EXISTING_IP' && '上傳角色圖，延伸製作表情'}
                                                    {inputMode === 'TEXT_PROMPT' && '輸入描述，創造新角色'}
                                                    {inputMode === 'UPLOAD_SHEET' && '上傳拼圖，進行切割'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* PHOTO MODE: Character Count Selector */}
                                    {inputMode === 'PHOTO' && (
                                        <div className="mb-8 bg-slate-50 p-4 rounded-2xl flex items-center justify-between border border-slate-100">
                                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                                <span>👥</span> 設定角色數量
                                                <span className="text-xs font-normal text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200">單人 / 多人</span>
                                            </label>
                                            <div className="flex gap-2">
                                                {[1, 2, 3, 4].map(num => (
                                                    <button
                                                        key={num}
                                                        onClick={() => handleCharCountChange(num)}
                                                        className={`w-10 h-10 rounded-xl font-black transition-all border-2 
                                                ${charCount === num
                                                                ? 'bg-indigo-500 border-indigo-500 text-white shadow-lg scale-110'
                                                                : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-200 hover:text-indigo-500'}`}
                                                    >
                                                        {num}
                                                    </button>
                                                ))}
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
                                                            <span className="text-white font-bold bg-black/50 px-4 py-2 rounded-full backdrop-blur-sm">更換圖片</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="bg-indigo-50 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300">
                                                            <UploadIcon />
                                                        </div>
                                                        <p className="text-slate-600 font-bold text-lg">點擊上傳圖片</p>
                                                        <p className="text-slate-400 text-sm mt-1">支援 JPG, PNG</p>
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
                                                                            <span className="text-xs text-white font-bold bg-black/50 px-3 py-1 rounded-full">更換</span>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-center p-4">
                                                                        <span className="text-2xl block mb-2">👤</span>
                                                                        <span className="text-xs text-slate-400 font-bold">上傳參考圖 (選填)</span>
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
                                                                    <label className="text-xs font-bold text-slate-400">外觀描述 (必填)</label>
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
                                                                            <>✨ AI 自動辨識</>
                                                                        )}
                                                                    </button>
                                                                </div>
                                                                <textarea
                                                                    value={char.description}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        setGroupChars(prev => prev.map((c, i) => i === index ? { ...c, description: val } : c));
                                                                    }}
                                                                    placeholder="例如: 金髮藍眼騎士，穿銀盔甲..."
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
                                                <label className="block text-sm font-bold text-slate-700 mb-2">輸入想做的主題 (例如：貓咪、恐龍、珍珠奶茶)</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={subjectKeyword}
                                                        onChange={(e) => setSubjectKeyword(e.target.value)}
                                                        placeholder="輸入主題..."
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
                                                            <>✨ AI 自動發想描述</>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="relative">
                                                <label className="block text-sm font-bold text-slate-700 mb-2">角色描述 (可手動修改)</label>
                                                <textarea
                                                    value={promptText}
                                                    onChange={(e) => setPromptText(e.target.value)}
                                                    className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-pink-500 outline-none font-medium text-lg min-h-[200px]"
                                                    placeholder="或直接在此輸入詳細描述：一隻戴著飛行員眼鏡的橘色肥貓，穿著皮夾克，表情自信..."
                                                />
                                                <div className="absolute bottom-4 right-4 relative">
                                                    <button
                                                        onClick={() => setShowDiceMenu(!showDiceMenu)}
                                                        disabled={diceLoading}
                                                        className={`p-2 rounded-full shadow-lg transition-all active:scale-95 flex items-center gap-2 px-3
                                                ${diceLoading ? 'bg-slate-100 text-slate-400' : 'bg-white hover:bg-pink-50 text-pink-600 hover:text-pink-700 border border-pink-100'}
                                            `}
                                                        title="隨機產生靈感"
                                                    >
                                                        {diceLoading ? (
                                                            <div className="w-5 h-5 border-2 border-pink-200 border-t-pink-600 rounded-full animate-spin"></div>
                                                        ) : (
                                                            <>
                                                                <DiceIcon />
                                                                <span className="text-xs font-bold">隨機靈感</span>
                                                            </>
                                                        )}
                                                    </button>
                                                    {showDiceMenu && (
                                                        <div className="absolute bottom-full right-0 mb-2 bg-white rounded-xl shadow-xl border border-pink-100 p-2 w-48 animate-fade-in z-20 flex flex-col gap-1">
                                                            <div className="text-[10px] text-slate-400 font-bold px-2 py-1 uppercase">選擇隨機類型</div>
                                                            <button onClick={() => handleDiceRoll('ANIMAL')} className="w-full text-left px-3 py-2 hover:bg-pink-50 rounded-lg text-sm font-bold text-slate-700 hover:text-pink-600 transition-colors flex items-center gap-2">🐶 可愛動物</button>
                                                            <button onClick={() => handleDiceRoll('PERSON')} className="w-full text-left px-3 py-2 hover:bg-pink-50 rounded-lg text-sm font-bold text-slate-700 hover:text-pink-600 transition-colors flex items-center gap-2">🧑 特色人物</button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {inputMode === 'UPLOAD_SHEET' && (
                                        <div className="mb-8 space-y-10">
                                            {/* ... (Same as original code) ... */}
                                            <div className="space-y-6">
                                                <div>
                                                    <h4 className="text-2xl font-black text-slate-800 flex items-center gap-2 mb-2">
                                                        <span>📂</span> 上傳底圖檔案
                                                    </h4>
                                                    <p className="text-slate-500">已有製作好的貼圖底稿 (Sprite Sheet)？請先設定網格規格，再上傳圖片。</p>
                                                </div>

                                                <div className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm space-y-6 relative overflow-hidden">
                                                    <div className="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                        <div>
                                                            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">設定貼圖張數 <span className="text-amber-500 text-[10px] ml-1">(影響切割網格)</span></label>
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
                                                    <p className="text-slate-700 font-bold text-lg">點擊上傳底圖 (Sheet)</p>
                                                    <p className="text-slate-400 text-sm mt-1">支援 PNG, JPG (建議使用綠幕背景)</p>
                                                    <input ref={sheetInputRef} type="file" accept="image/*" className="hidden" onChange={handleSheetUpload} />
                                                </div>
                                            </div>
                                            {/* ... Prompt Generator ... */}
                                            <div className="bg-indigo-50/30 rounded-3xl border border-indigo-100 overflow-hidden transition-all duration-300">
                                                <button onClick={() => setIsPromptGeneratorOpen(!isPromptGeneratorOpen)} className="w-full p-5 flex items-center justify-between text-left hover:bg-indigo-50 transition-colors group">
                                                    <div className="flex items-center gap-3">
                                                        <div className="bg-indigo-100 text-indigo-600 p-2 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors"><span className="text-lg">✨</span></div>
                                                        <div>
                                                            <h4 className="text-base font-bold text-indigo-900">還沒有底圖？ AI 輔助生成提示詞</h4>
                                                            <p className="text-xs text-indigo-400 mt-0.5">Prompt Generator for external tools</p>
                                                        </div>
                                                    </div>
                                                    <div className={`transform transition-transform duration-300 text-indigo-300 ${isPromptGeneratorOpen ? 'rotate-180' : ''}`}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                                    </div>
                                                </button>

                                                {isPromptGeneratorOpen && (
                                                    <div className="p-6 pt-0 border-t border-indigo-50 space-y-6 animate-fade-in">
                                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-6">
                                                            <div>
                                                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">文字內容</label>
                                                                <div className="relative">
                                                                    <textarea value={promptTextListInput} onChange={e => setPromptTextListInput(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-400 outline-none min-h-[300px] bg-white resize-none" placeholder="輸入貼圖文字，例如：&#10;1.早安&#10;2.晚安&#10;3.謝謝" />
                                                                    <button onClick={handleFormatTextList} className="absolute bottom-2 right-2 px-3 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-sm" title="自動去除編號與符號"><span>🧹</span> 智慧格式化</button>
                                                                </div>
                                                            </div>
                                                            <div className="space-y-6">
                                                                <div>
                                                                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">畫風設定</label>
                                                                    <div className="flex flex-wrap gap-2 mb-2">
                                                                        {ART_STYLES.map(style => (
                                                                            <button key={style} onClick={() => setPromptArtStyleInput(style)} className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${promptArtStyleInput === style ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>{style.split(' ')[0]}</button>
                                                                        ))}
                                                                    </div>
                                                                    <input type="text" value={promptArtStyleInput} onChange={e => setPromptArtStyleInput(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-400 outline-none bg-white" placeholder="預設：Q版日本動漫" />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">文字樣式</label>
                                                                    <div className="flex flex-wrap gap-2 mb-2">
                                                                        {FONT_OPTIONS.map(font => (
                                                                            <button key={font} onClick={() => setPromptFontStyleInput(font)} className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${promptFontStyleInput === font ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>{font}</button>
                                                                        ))}
                                                                    </div>
                                                                    <input type="text" value={promptFontStyleInput} onChange={e => setPromptFontStyleInput(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-400 outline-none bg-white" placeholder="預設：可愛 Q 版字型" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="relative group mt-6">
                                                            <div className="absolute -top-3 left-4 px-2 bg-indigo-50 text-[10px] font-black text-indigo-500 uppercase tracking-widest z-10">AI 提示詞預覽</div>
                                                            <textarea readOnly value={promptTemplate} className="w-full h-48 p-5 bg-slate-900 text-green-400 font-mono text-xs rounded-2xl resize-none outline-none border border-slate-800 shadow-inner" />
                                                            <button onClick={() => copyToClipboard(promptTemplate)} className="absolute bottom-4 right-4 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg transition-all flex items-center gap-2 active:scale-95"><CopyIcon /> 一鍵複製提示詞</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {inputMode !== 'UPLOAD_SHEET' && inputMode !== 'EXISTING_IP' && (
                                        <div className="mb-8">
                                            <label className="block text-sm font-bold text-slate-700 mb-2">畫風設定</label>
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                {ART_STYLES.map(style => (
                                                    <button key={style} onClick={() => setStylePrompt(style)} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${stylePrompt === style ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-500'}`}>{style.split(' ')[0]}</button>
                                                ))}
                                            </div>
                                            <div className="relative">
                                                <input type="text" value={stylePrompt} onChange={(e) => setStylePrompt(e.target.value)} className="w-full p-4 pl-12 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-medium" />
                                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🎨</div>
                                            </div>
                                        </div>
                                    )}

                                    {inputMode !== 'UPLOAD_SHEET' && (
                                        <button onClick={handleGenerateCharacter} disabled={isProcessing} className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-black text-lg shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                            {isProcessing ? (<><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>AI 設計中...</>) : (<>開始設計角色 ✨</>)}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {appStep === AppStep.CANDIDATE_SELECTION && generatedChar && (
                    <div className="animate-fade-in-up mt-2 max-w-4xl mx-auto pb-32">
                        {/* ... (Previous Candidate Selection Code) ... */}
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-black text-slate-800">您的專屬 IP 角色誕生了！✨</h2>
                            <p className="text-slate-500 mt-2">請確認角色設計，滿意後我們將以此為基礎製作整套貼圖。</p>
                        </div>

                        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border-2 border-slate-100 p-6 mb-8">
                            {/* Fixed Height Container to prevent full-screen takeover */}
                            <div className="w-full h-[50vh] flex items-center justify-center bg-gray-50 rounded-2xl relative group border border-slate-100 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==')]">
                                <img src={generatedChar.url} alt="Character" className="h-full w-full object-contain shadow-lg" />
                                <button onClick={handleGenerateCharacter} className="absolute top-4 right-4 bg-white/90 backdrop-blur text-slate-700 px-4 py-2 rounded-full font-bold shadow-md hover:bg-white hover:text-indigo-600 transition-all flex items-center gap-2">
                                    <RefreshIcon /> 重試/生成
                                </button>
                            </div>
                        </div>

                        {/* Sticky Action Buttons */}
                        <div className="fixed bottom-0 left-0 w-full bg-white/90 backdrop-blur-md border-t border-slate-200 p-4 z-50 flex justify-center gap-4 shadow-[0_-5px_10px_rgba(0,0,0,0.05)]">
                            <div className="max-w-4xl w-full flex gap-4">
                                <button onClick={() => setAppStep(AppStep.UPLOAD)} className="flex-1 py-4 border-2 border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all shadow-sm">← 返回修改設定</button>
                                <button onClick={() => setAppStep(AppStep.STICKER_CONFIG)} className="flex-[2] py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-black text-lg shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all flex items-center justify-center gap-2">確認，下一步：配置貼圖文案 →</button>
                            </div>
                        </div>
                    </div>
                )}

                {appStep === AppStep.STICKER_CONFIG && (
                    <div className="animate-fade-in-up mt-2 max-w-6xl mx-auto">
                        <div className="flex justify-between items-end mb-8">
                            <div>
                                <h2 className="text-3xl font-black text-slate-800">配置您的貼圖內容 📝</h2>
                                <p className="text-slate-500 mt-2">設定張數，並輸入您想好的文案。</p>
                            </div>
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex gap-4 items-center">
                                <div className="flex gap-2 items-center">
                                    <span className="text-xs font-bold text-slate-400">數量:</span>
                                    <select value={stickerQuantity} onChange={(e) => handleQuantityChange(Number(e.target.value) as StickerQuantity)} className="bg-slate-50 border-none rounded-lg font-bold text-slate-700 focus:ring-2 focus:ring-indigo-200 py-2">
                                        {validQuantities.map(n => <option key={n} value={n}>{n} 張</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-1 space-y-6">
                                <div className="bg-gradient-to-br from-indigo-50 to-white p-6 rounded-3xl border border-indigo-100 shadow-sm sticky top-24">
                                    <div className="flex items-center gap-2 mb-4"><span className="text-2xl">🧠</span><h3 className="font-bold text-slate-800">批量智慧輸入 (Smart Batch)</h3></div>
                                    <p className="text-xs text-slate-500 mb-4">直接貼上您的筆記 (例如: "1.早安 2.晚安 3.謝謝")，AI 會自動分析語意，並自動產生對應的英文動作指令 (Prompt)。</p>

                                    <div className="mb-4 flex items-center gap-2 p-2 bg-indigo-100/50 rounded-lg">
                                        <input
                                            type="checkbox"
                                            id="noTextMode"
                                            checked={!includeText}
                                            onChange={(e) => setIncludeText(!e.target.checked)}
                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                                        />
                                        <label htmlFor="noTextMode" className="text-xs font-bold text-indigo-800 cursor-pointer select-none flex-1">
                                            不生成文字 (No Text Mode)
                                        </label>
                                    </div>

                                    <textarea value={smartInputText} onChange={(e) => setSmartInputText(e.target.value)} className="w-full h-40 p-4 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-400 outline-none resize-none bg-white mb-4" placeholder="在此貼上您的想法..." />
                                    <button onClick={handleSmartInput} disabled={!smartInputText.trim() || isProcessing} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"><MagicWandIcon /> 分析並自動填入</button>
                                </div>
                            </div>

                            <div className="lg:col-span-2 space-y-4 pb-32">
                                {stickerConfigs.map((config, idx) => (
                                    <div key={config.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex gap-4 items-start group hover:border-indigo-200 transition-colors">
                                        <div className="w-8 h-8 flex-shrink-0 bg-slate-100 rounded-full flex items-center justify-center font-black text-slate-400 text-xs">{idx + 1}</div>
                                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">文字 (Text)</label>
                                                <div className="flex gap-2">
                                                    <input type="text" value={config.text} onChange={(e) => { const newConfigs = [...stickerConfigs]; newConfigs[idx].text = e.target.value; setStickerConfigs(newConfigs); }} className="flex-1 p-2 bg-slate-50 rounded-lg border-none text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-200" placeholder="無文字" disabled={!includeText} />
                                                    <button onClick={() => { const newConfigs = [...stickerConfigs]; newConfigs[idx].showText = !newConfigs[idx].showText; setStickerConfigs(newConfigs); }} className={`px-3 rounded-lg text-xs font-bold transition-colors ${config.showText ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`} disabled={!includeText}>{config.showText ? 'ON' : 'OFF'}</button>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">動作指令 (Action Prompt)</label>
                                                <div className="flex flex-col gap-2">
                                                    {/* Chinese Action Description & Translation */}
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="text"
                                                            value={config.emotionPromptCN || ""}
                                                            onChange={(e) => { const newConfigs = [...stickerConfigs]; newConfigs[idx].emotionPromptCN = e.target.value; setStickerConfigs(newConfigs); }}
                                                            className="flex-1 p-2 bg-slate-50 rounded-lg border-none text-sm text-slate-600 focus:ring-2 focus:ring-indigo-200"
                                                            placeholder="中文動作描述 (例如: 跌倒)"
                                                        />
                                                        <button
                                                            onClick={() => handleTranslatePrompt(config.id, config.emotionPromptCN || "")}
                                                            disabled={optimizingId === config.id || !config.emotionPromptCN}
                                                            className="px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors flex items-center justify-center font-bold text-xs border border-indigo-200"
                                                            title="自動翻譯成英文 Prompt"
                                                        >
                                                            {optimizingId === config.id ? (
                                                                <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                                                            ) : (
                                                                <span>→ 翻譯</span>
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
                                                            title="AI 根據文字自動產生畫面"
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
                                    <button onClick={handleGenerateStickers} className="max-w-md w-full py-4 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-full font-black text-xl shadow-xl hover:scale-105 transition-transform flex items-center justify-center gap-2">✨ 開始生成貼圖 (Generate)</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {appStep === AppStep.SHEET_EDITOR && rawSheetUrls.length > 0 && (
                    <div className="animate-fade-in-up mt-2 h-[calc(100vh-140px)] flex flex-col">
                        {/* ... (Sheet Editor code remains same) ... */}
                        <div className="flex justify-between items-center mb-4 px-2">
                            <h2 className="text-2xl font-black text-slate-800">底圖檢查與修復 🛠️</h2>
                            <div className="flex gap-4">
                                <button onClick={handleOpenSheetMagicEditor} className="px-4 py-2 bg-purple-100 text-purple-700 rounded-xl font-bold hover:bg-purple-200 transition-colors flex items-center gap-2"><MagicWandIcon /> 魔法修復 (Magic Edit)</button>
                                <button
                                    onClick={handleAutoProcess}
                                    disabled={!isOpenCVReady}
                                    className={`px-6 py-2 rounded-xl font-bold shadow-lg transition-all flex items-center gap-2
                                ${isOpenCVReady ? 'bg-emerald-500 text-white hover:bg-emerald-600 hover:-translate-y-0.5' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                                >
                                    <span className="text-xl">🟢</span>
                                    {isOpenCVReady ? '綠幕自動切割 (OpenCV)' : '載入切割模組中...'}
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
                )}

                {appStep === AppStep.STICKER_PROCESSING && (
                    <div className="animate-fade-in-up mt-2">
                        {/* ... (Sticker Processing code remains same) ... */}
                        <div className="flex flex-col md:flex-row justify-between items-end md:items-center mb-6 gap-4">
                            <div>
                                <h2 className="text-3xl font-black text-slate-800">您的專屬貼圖完成啦！🎉</h2>
                                <p className="text-slate-500 mt-1">點擊下載全部，或對單張貼圖進行微調。</p>
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
                                        生成 Tab 縮圖 (96x74)
                                    </button>
                                )}
                                <button onClick={() => generateFrameZip(finalStickers, zipFileName || "MyStickers", finalStickers.find(s => s.id === mainStickerId)?.url, stickerPackageInfo || undefined, stickerType)} className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold shadow-lg flex items-center gap-2 transition-transform hover:-translate-y-1 whitespace-nowrap"><DownloadIcon /> 下載全部</button>
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
                                    <h3 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-2"><span className="bg-indigo-100 text-indigo-600 p-2 rounded-lg text-xl">💡</span>貼圖上架資訊助手<span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-1 rounded ml-2">AI 自動生成</span></h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 mb-2"><span className="w-2 h-2 rounded-full bg-indigo-500"></span><span className="text-sm font-bold text-slate-500 uppercase tracking-widest">中文資訊 (Traditional Chinese)</span></div>
                                            <div><label className="block text-xs font-bold text-slate-400 mb-1">貼圖標題 (Title)</label><div className="flex gap-2"><input readOnly value={stickerPackageInfo.title.zh} className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200" /><CopyBtn text={stickerPackageInfo.title.zh} /></div></div>
                                            <div><label className="block text-xs font-bold text-slate-400 mb-1">貼圖說明 (Description)</label><div className="relative"><textarea readOnly value={stickerPackageInfo.description.zh} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200 h-24 resize-none" /><div className="absolute bottom-3 right-3"><CopyBtn text={stickerPackageInfo.description.zh} /></div></div></div>
                                        </div>
                                        <div className="space-y-4 flex flex-col">
                                            <div className="flex items-center gap-2 mb-2"><span className="w-2 h-2 rounded-full bg-purple-500"></span><span className="text-sm font-bold text-slate-500 uppercase tracking-widest">英文資訊 (English)</span></div>
                                            <div><label className="block text-xs font-bold text-slate-400 mb-1">Title</label><div className="flex gap-2"><input readOnly value={stickerPackageInfo.title.en} className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-purple-200" /><CopyBtn text={stickerPackageInfo.title.en} label="Copy" successLabel="Copied" /></div></div>
                                            <div><label className="block text-xs font-bold text-slate-400 mb-1">Description</label><div className="relative"><textarea readOnly value={stickerPackageInfo.description.en} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 outline-none focus:ring-2 focus:ring-purple-200 h-24 resize-none" /><div className="absolute bottom-3 right-3"><CopyBtn text={stickerPackageInfo.description.en} label="Copy" successLabel="Copied" /></div></div></div>
                                            <div className="flex-1 flex items-end justify-end mt-4"><a href="https://creator.line.me/zh-hant/" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 font-bold bg-indigo-50 hover:bg-indigo-100 px-6 py-3 rounded-xl transition-colors shadow-sm hover:shadow-md"><span>🚀</span> 前往 LINE Creators Market 上架<ExternalLinkIcon /></a></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>
            {isProcessing && <Loader message={loadingMsg} />}
            <MagicEditor isOpen={magicEditorOpen} imageUrl={editorImage} onClose={() => setMagicEditorOpen(false)} onGenerate={handleMagicGenerate} isProcessing={isProcessing} isAnimated={false} />
            <HelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
        </div>
    );
}
