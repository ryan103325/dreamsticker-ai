
import { GoogleGenAI, Type } from "@google/genai";
import { GeneratedImage, StickerConfig, InputMode, StickerType, FontConfig, SheetLayout, getStickerSpec, StickerPackageInfo, STICKER_SPECS, ArtisticFilterType, CharacterInput } from "../types";
import { stripMimeType, getMimeType, wait } from "./utils";

// Model Definitions
const IP_DESIGN_MODEL = 'gemini-3-pro-image-preview';
const STICKER_GEN_MODEL_PRO = 'gemini-3-pro-image-preview';
const STICKER_GEN_MODEL_FLASH = 'gemini-2.5-flash-image';
const TEXT_MODEL = 'gemini-3-flash-preview';
const VALIDATION_MODEL = 'gemini-2.5-flash-image'; // Used for QA check

// Helper to get a fresh AI instance with the current key
let dynamicApiKey = '';

export const setApiKey = (key: string) => {
    dynamicApiKey = key;
    if (typeof window !== 'undefined') {
        localStorage.setItem('gemini_api_key', key);
    }
};

export const getApiKey = () => {
    if (dynamicApiKey) return dynamicApiKey;
    if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('gemini_api_key');
        if (stored) return stored;
    }
    // Defense: Ensure we only use explicitly set keys.
    // REMOVED: process.env.VITE_GEMINI_API_KEY fallback as per security policy.
    return '';
};

const getAI = () => {
    const key = getApiKey();
    if (!key) throw new Error("API Key Missing");
    return new GoogleGenAI({ apiKey: key });
};

async function callWithRetry<T>(apiCall: () => Promise<T>, retries: number = 2, delay: number = 2000): Promise<T> {
    try { return await apiCall(); }
    catch (error: any) {
        if (retries > 0 && (error?.status === 429 || error?.status === 503 || error?.message?.includes("overloaded"))) {
            await wait(delay);
            return callWithRetry(apiCall, retries - 1, delay * 2);
        } else throw error;
    }
}

const validateResponse = (response: any) => {
    const candidate = response.candidates?.[0];
    if (!candidate) {
        throw new Error("No response candidates received from AI.");
    }
    if (candidate.finishReason === 'SAFETY') {
        throw new Error("Content generation was blocked by AI safety filters. Please try a different prompt.");
    }
    return candidate;
};

/**
 * Validates the dimensions of the generated image against the expected Aspect Ratio.
 */
const validateImageDimensions = async (dataUrl: string, targetRatio: number): Promise<boolean> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const currentRatio = img.width / img.height;
            const diff = Math.abs(currentRatio - targetRatio);
            const isValid = diff < 0.05; // 5% tolerance for resolution
            if (!isValid) {
                console.warn(`[Dim Check] Failed. Target: ${targetRatio}, Got: ${currentRatio.toFixed(2)}`);
            }
            resolve(isValid);
        };
        img.onerror = () => resolve(false);
        img.src = dataUrl;
    });
};

/**
 * VISION AI VALIDATOR
 * Updated Logic: TEXT INTEGRATION CHECK.
 * We now WANT text to be present and interactive.
 */
const validateStickerSheetViaVision = async (base64Image: string): Promise<{ passed: boolean; reason: string }> => {
    const ai = getAI();

    const validationPrompt = `
    Act as a strict QA Specialist for LINE Stickers. Analyze this sprite sheet image.
    
    [CHECKLIST]
    1. **Text Integration (CRITICAL):** 
       - If there is text, is it **integrated** with the character (touching, holding, overlapping, sitting on)?
       - **FAIL** if text is tiny, illegible, or placed far away like a movie subtitle.
       - **PASS** if characters are interacting with the words or if the composition is tight.
    2. **Grid Layout:** Is it a clean grid layout?
    3. **Spacing:** Is there a visible GREEN GAP (> 30px) between every sticker cell?
    4. **White Outline:** Do the characters have a white sticker border?
    5. **Clean Background:** Is the background solid green without artifacts?

    Return JSON: { "passed": boolean, "reason": "Short explanation of failure" }
    `;

    try {
        const response = await ai.models.generateContent({
            model: VALIDATION_MODEL,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/png', data: stripMimeType(base64Image) } },
                    { text: validationPrompt }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        passed: { type: Type.BOOLEAN },
                        reason: { type: Type.STRING }
                    },
                    required: ["passed", "reason"]
                }
            }
        });

        const text = response.text?.replace(/```json\n?|\n?```/g, '') || "{}";
        const result = JSON.parse(text);

        console.log(`[Vision Validator]`, result);
        return {
            passed: result.passed === true,
            reason: result.reason || "Unknown validation error"
        };
    } catch (e) {
        console.warn("[Vision Validator] Failed, bypassing...", e);
        return { passed: true, reason: "Validator bypassed" };
    }
};

export const parseStickerIdeas = async (rawText: string, includeText: boolean = true): Promise<{ text: string, emotionPromptCN: string, emotionPrompt: string }[]> => {
    const ai = getAI();

    // Add explicit text instruction if includeText is false
    const textInstruction = includeText
        ? '- "text": The clean caption text (e.g., "早安").'
        : '- "text": FORCE EMPTY STRING "". (User requested NO TEXT).';

    const prompt = `
    You are a professional Line Sticker Planner assistant.
    Task: Parse the User's Input Notes into a structured JSON list of sticker ideas.

    [STRICT PARSING & SPLITTING RULES]
    1. **Delimiters**: You MUST treat the following as separators for distinct stickers:
       - **Spaces** (e.g., "Hi Hello Thanks" -> 3 items: "Hi", "Hello", "Thanks").
       - **Caesura/顿号** (、).
       - **Commas** (, ，).
       - **Line Breaks**.
       - **Numbering** (1. 2. 3. or 1, 2, 3).
    
    2. **Numbering Logic**: 
       - If the input is numbered (e.g., "1. Happy, 3. Sad"), IGNORE the specific number value.
       - Treat them as a sequential list (Item 1, Item 2).
       - Do NOT skip empty numbers. Just pack them sequentially.

    3. **Content Cleanup**:
       - Remove any numbering (1., 2.) from the final "text".
       - Remove emojis from the "text" field (keep text clean).

    [OUTPUT FORMAT]
    Return a JSON Array of objects. Each object must have:
    ${textInstruction}
    - "emotionPromptCN": A visual description of the action in Traditional Chinese (e.g., "女孩揮手打招呼，背景有太陽").
    - "emotionPrompt": A concise English visual prompt for Image Generation based on the Chinese description (e.g., "Cute girl waving hand happily, morning sun background").
    
    Input Notes: "${rawText}"
    `;

    return callWithRetry(async () => {
        const response = await ai.models.generateContent({
            model: TEXT_MODEL,
            contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            text: { type: Type.STRING },
                            emotionPromptCN: { type: Type.STRING },
                            emotionPrompt: { type: Type.STRING }
                        }
                    }
                }
            }
        });
        try {
            return JSON.parse(response.text?.replace(/```json\n?|\n?```/g, '') || "[]");
        } catch (e) { return []; }
    });
};

/**
 * Translates a Chinese action description to a concise English visual prompt.
 */
export const translateActionToEnglish = async (cnText: string): Promise<string> => {
    const ai = getAI();
    const prompt = `
    Task: Translate this Chinese sticker action description into a concise English Visual Prompt for AI Image Generation.
    Input: "${cnText}"
    Requirements:
    - Keep it short (under 15 words).
    - Focus on visual elements (pose, expression, props).
    - Style: Cute, Chibi.
    - Output ONLY the English text.
    `;

    return callWithRetry(async () => {
        const response = await ai.models.generateContent({
            model: TEXT_MODEL,
            contents: { parts: [{ text: prompt }] },
        });
        validateResponse(response);
        return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    });
};

export const generateVisualDescription = async (concept: string): Promise<string> => {
    const ai = getAI();
    const prompt = `
    Task: Convert this sticker concept: "${concept}" into a concise, high-quality English visual prompt for an AI image generator.
    
    Rules:
    1. **Style:** Chibi character, expressive, sticker art style.
    2. **Content:** Describe the ACTION and EMOTION based on the concept.
    3. **No Text:** Do not include instructions about text rendering, focus on the visual action.
    4. **Language:** Input is likely Chinese. Output MUST be ENGLISH.
    5. **Conciseness:** Keep it under 15 words.
    
    Example Input: "早安"
    Example Output: "Cute character waving hand happily, sunshine background, big smile, energetic pose."
    
    Example Input: "不想上班"
    Example Output: "Character lying on floor, melting, exhausted face, soul leaving body, gloomy atmosphere."
    `;

    return callWithRetry(async () => {
        const response = await ai.models.generateContent({
            model: TEXT_MODEL,
            contents: { parts: [{ text: prompt }] },
        });

        validateResponse(response);
        return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    });
};

export const generateStickerPackageInfo = async (mainImageUrl: string, stickerTexts: string[]): Promise<StickerPackageInfo> => {
    const ai = getAI();
    const prompt = `
    Generate LINE Sticker metadata (Title/Desc in EN/ZH) for these stickers: ${stickerTexts.join(', ')}.
    
    [CONSTRAINT FOR ENGLISH DESCRIPTION]
    - **CRITICAL:** The English description must be **UNDER 160 CHARACTERS**.
    - Write exactly **ONE concise sentence**.
    - Example: "Express your daily moods with these cute and funny characters."
    `;

    return callWithRetry(async () => {
        const response = await ai.models.generateContent({
            model: TEXT_MODEL,
            contents: {
                parts: [{ inlineData: { mimeType: 'image/png', data: stripMimeType(mainImageUrl) } }, { text: prompt }]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.OBJECT, properties: { en: { type: Type.STRING }, zh: { type: Type.STRING } } },
                        description: { type: Type.OBJECT, properties: { en: { type: Type.STRING }, zh: { type: Type.STRING } } }
                    }
                }
            }
        });
        return JSON.parse(response.text || "{}");
    });
};

export const generateIPCharacter = async (sourceImageDataUrl: string, style: string, inputMode: InputMode, variationSeed: number): Promise<GeneratedImage> => {
    const ai = getAI();

    // Updated IP Character Prompt: FULL BODY + 15px BORDER
    const coreRequirements = `Create a "Character Design Sheet" on solid green (#00FF00). Show Front, Side, and Action. Style: ${style}. 
    
    [STRICT LAYOUT RULES]
    1. **Background**: PURE SOLID GREEN (#00FF00) ONLY. 
       - NO shadows, NO gradients, NO floor lines, NO horizon lines.
    2. **Color Safety (CRITICAL)**: 
       - **NO Green Camouflage**: Do NOT use Bright Green (#00FF00) inside the character design.
       - **Fade-to-White**: Any transparency/glow effects must gradient into WHITE, NOT into the green background.
    3. **Content**: Only the character figures (Front, Side, Action). 
       - **CRITICAL REQUIREMENT: FULL BODY (Head to Toe).**
       - **Do NOT crop the feet or legs.** 
       - All 3 views must show the complete character from top of head to bottom of shoes.
       - Do NOT include any props (unless held), scenery, or background elements.
    4. **Style**: 
       - Add a consistent **Extra Thick (15px) Solid WHITE sticker outline** around each figure.
       - **ENSURE FULL BODY VISIBILITY.**
    `;

    let parts: any[] = [];
    if (inputMode === 'TEXT_PROMPT') {
        parts = [{ text: `Create unique IP character: "${sourceImageDataUrl}".\n${coreRequirements}` }];
    } else {
        parts = [{ inlineData: { mimeType: getMimeType(sourceImageDataUrl), data: stripMimeType(sourceImageDataUrl) } }, { text: `Transform IP character.\n${coreRequirements}` }];
    }

    return callWithRetry(async () => {
        const response = await ai.models.generateContent({
            model: IP_DESIGN_MODEL,
            contents: { parts },
            config: { imageConfig: { aspectRatio: "1:1" } }
        });
        validateResponse(response);
        const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!part?.inlineData?.data) throw new Error("No image data.");
        return { id: `char-${Date.now()}`, url: `data:image/png;base64,${part.inlineData.data}`, type: 'STATIC' };
    });
};

/**
 * Analyzes an uploaded image to describe the character's appearance in Traditional Chinese.
 */
export const analyzeImageForCharacterDescription = async (base64Image: string): Promise<string> => {
    const ai = getAI();
    const prompt = `
    請擔任專業的角色設計師助手。
    任務：仔細觀察這張參考圖片，並用「繁體中文」描述圖中主要角色的外觀特徵。
    
    重點描述：
    1. 性別與年齡感 (如：年輕女性、小男孩、老爺爺)。
    2. 髮型與髮色。
    3. 眼睛特徵 (如：眼鏡、顏色)。
    4. 服裝細節 (顏色、款式)。
    5. 顯著配件 (如：帽子、圍巾)。

    輸出要求：
    - 請使用簡潔的描述性語句。
    - 不要包含無關的背景描述。
    - 字數控制在 50 字以內。
    - 直接輸出內容，不要有開場白。
    `;

    return callWithRetry(async () => {
        const response = await ai.models.generateContent({
            model: STICKER_GEN_MODEL_FLASH, // Flash is sufficient for vision analysis
            contents: {
                parts: [
                    { inlineData: { mimeType: getMimeType(base64Image), data: stripMimeType(base64Image) } },
                    { text: prompt }
                ]
            },
        });
        validateResponse(response);
        return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    });
};

/**
 * Generates a full character description from a simple keyword.
 */
export const generateCharacterDescriptionFromKeyword = async (keyword: string): Promise<string> => {
    const ai = getAI();
    const prompt = `
    請擔任專業的 IP 角色設計師。
    任務：根據使用者提供的關鍵字「${keyword}」，發想一個適合做 Line 貼圖的「創意、獨特、不落俗套」的角色外觀描述。

    要求：
    1. **語言**：繁體中文。
    2. **創意腦力激盪**：
       - 利用「超現實主義」或「意想不到的結合」。
       - 避免刻板印象 (例如提到貓就只想到吃魚)。
       - 可以加入有趣的職業、情緒、或奇幻元素。
    3. **字數**：約 50-80 字。
    4. **內容**：具體描述角色的顏色、特徵、配件、服裝。
    5. **風格**：可愛、鮮明、有特色。
    6. **直接輸出**：直接給出描述內容，不需要「好的」、「以下是描述」等廢話。

    範例關鍵字：「柯基」
    範例輸出：「一隻漂浮在空中的宇航員柯基犬，身穿銀色反光太空衣，頭盔裡塞滿了彩色甜甜圈，眼神充滿對宇宙的好奇。」
    `;

    return callWithRetry(async () => {
        const response = await ai.models.generateContent({
            model: TEXT_MODEL,
            contents: { parts: [{ text: prompt }] },
            config: { temperature: 1.6 } // High randomness
        });
        validateResponse(response);
        return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    });
};

/**
 * Generates a Random Character Description.
 * Supports optional keyword to guide randomness.
 */
export const generateRandomCharacterPrompt = async (type: 'ANIMAL' | 'PERSON', keyword?: string): Promise<string> => {
    const ai = getAI();

    let systemInstruction = `你是創意總監。請設計一個適合 Line 貼圖的「獨特且有創意」的 IP 角色 (${type === 'ANIMAL' ? '動物' : '人物'})。
    
    規則：
    1. **嚴格分類 (STRICT)**：使用者選擇了「${type === 'ANIMAL' ? '動物' : '人物'}」。
       - 如果是動物，絕對不能出現人類特徵 (如人類皮膚、人臉)。可以是擬人化動物 (穿衣)，但本質必須是動物。
       - 如果是人物，絕對不能是動物。
    2. **拒絕平庸**：不要只給「可愛的小貓」或「普通的男孩」。
    3. **大膽組合**：請隨機結合「職業/身份」+「物種/類型」+「獨特風格」。
       - 例如：穿著太空衣的倉鼠 (科幻風)、正在做瑜珈的樹懶 (運動風)、戴著單片眼鏡的紳士青蛙 (英倫風)、龐克搖滾風的兔子。
    4. **鮮明配色**：請指定一組獨特的配色方案 (例如：螢光綠配紫色、黑金配色、粉彩撞色)。
    5. **細節描述**：描述外觀特徵、配件 (帽子、眼鏡、圍巾) 和個性。
    
    輸出要求：
    - 使用繁體中文。
    - 50-80字左右。
    - 直接描述角色，不要有多餘的前言。`;

    if (keyword && keyword.trim() !== '') {
        systemInstruction += `\n\n**強制指定元素：${keyword}** (請務必將此關鍵字完美融入設計中)。`;
    }

    const response = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: { parts: [{ text: systemInstruction }] },
        config: { temperature: 1.6 } // Increased temperature for more randomness
    });
    return response.text || "";
};

/**
 * Generates a Multi-Character Group Reference Sheet.
 * Dynamically handles 2-4 characters using T-Layout Logic.
 */
export const generateGroupCharacterSheet = async (
    characters: CharacterInput[], // Array of 2-4 characters
    style: string
): Promise<GeneratedImage> => {
    const ai = getAI();
    const parts: any[] = [];

    // 1. Image Processing & Source Analysis
    let sourceAnalysis = "";

    // Check if any character has an image
    const validImages = characters.filter(c => c.image);

    if (validImages.length > 0) {
        sourceAnalysis = "**SOURCE IMAGE ANALYSIS (CRITICAL):**\n";

        // Add images to the API call
        validImages.forEach((c, index) => {
            parts.push({ inlineData: { mimeType: getMimeType(c.image!), data: stripMimeType(c.image!) } });
            // Map the image index to the character description in the prompt
            // Note: inlineData parts come first in the array, so index 0 matches Part 0
            sourceAnalysis += `- **Reference Image ${index + 1}** corresponds to **Character ${characters.findIndex(char => char.id === c.id) + 1}** (${c.description}).\n`;
        });

        sourceAnalysis += `
        - **IDENTITY MAPPING RULE:** You must strictly map the provided reference images to their specific character slot.
        - **SEPARATION RULE:** If a reference image contains multiple people (e.g. a group photo), you must MENTALLY ISOLATE the specific person matching the description. Do NOT mix features between characters.
        `;
    } else {
        sourceAnalysis = "**SOURCE ANALYSIS:** No reference images provided. Generate based strictly on text descriptions.";
    }

    // 2. Dynamic Left Column Prompt (Individual Panels)
    const leftColumnPrompt = characters.map((c, i) => `
    **[PANEL ${i + 1}] LEFT COLUMN ROW ${i + 1} (Character ${i + 1})**
    - **SUBJECT:** ONLY Character ${i + 1} (${c.description}).
    - **CONSTRAINT:** Other characters (Character ${characters.filter((_, idx) => idx !== i).map((_, idx) => idx + 1).join(', ')}) must NOT appear in this panel.
    - **CONTENT:** Draw 3 distinct facial expressions of Character ${i + 1} (e.g., Front, Side, Happy).
    - **FOCUS:** FULL BODY (Head to Toe). Scale down to fit the cell height. Do NOT crop feet.
    `).join('\n');

    // 3. Right Column Prompt (Group Interaction)
    const charListString = characters.map((c, i) => `Character ${i + 1}`).join(' + ');

    const systemPrompt = `
    ${sourceAnalysis}

    A professional 4k Landscape Character Design Sheet for a group of ${characters.length} characters.
    Style: ${style}, Vector art, **Extra Thick (15px) solid white outlines**, flat color, clean green screen background.

    **STRICT COMPOSITION RULE (The "T-Layout"):**
    Imagine the canvas is divided into:
    1. **Left Column (2/3 width):** Stacked vertically into **${characters.length} equal rows**.
    2. **Right Column (1/3 width):** A single full-height vertical panel.

    --- INDIVIDUAL PANELS (LEFT COLUMN) ---
    ${leftColumnPrompt}

    --- GROUP INTERACTION (RIGHT COLUMN) ---
    **[RIGHT PANEL] FULL HEIGHT INTERACTION**
    - **SUBJECT:** All ${characters.length} characters together (${charListString}).
    - **CONTENT:** Full-body illustration of them standing side-by-side, posing as a team, or interacting.
    - **PURPOSE:** Show the relative **Height Difference** and outfit coordination.
    - **VISUAL:** This is the main "Key Visual" of the sheet. Full Body.

    **ARTISTIC RULES:**
    1. **Consistency:** Character appearances in individual panels must match the group panel perfectly.
    2. **Separation:** Ensure there is clear visual space between the panels. Draw faint divider lines if necessary.
    3. **No Text:** Do not add labels or text.
    **BACKGROUND**: Pure Green (#00FF00) solid background.
    `;

    parts.push({ text: systemPrompt });

    return callWithRetry(async () => {
        const response = await ai.models.generateContent({
            model: STICKER_GEN_MODEL_PRO, // Use Pro for complex layout adherence and 4K
            contents: { parts },
            config: {
                imageConfig: {
                    aspectRatio: "16:9",
                    imageSize: "4K"
                }
            }
        });
        validateResponse(response);
        const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!part?.inlineData?.data) throw new Error("No image data.");

        return {
            id: `group-${Date.now()}`,
            url: `data:image/png;base64,${part.inlineData.data}`,
            type: 'STATIC'
        };
    });
};

export const generateStickerSheet = async (characterUrl: string, configs: StickerConfig[], style: string, sheetIndex: number, totalSheets: number, layout?: SheetLayout, fontConfig?: FontConfig, stickerType: StickerType = 'STATIC'): Promise<{ url: string }> => {
    const ai = getAI();
    const base64Char = stripMimeType(characterUrl);

    const cols = layout?.cols || 4;
    const rows = layout?.rows || 2;

    // Simple aspect ratio logic for Static
    const ratioVal = cols / rows;
    const supportedRatios: { ar: "1:1" | "3:4" | "4:3" | "9:16" | "16:9", val: number }[] = [
        { ar: "1:1", val: 1.0 }, { ar: "3:4", val: 0.75 }, { ar: "4:3", val: 1.333 }, { ar: "9:16", val: 0.5625 }, { ar: "16:9", val: 1.777 }
    ];
    const bestAR = supportedRatios.reduce((prev, curr) => Math.abs(curr.val - ratioVal) < Math.abs(prev.val - ratioVal) ? curr : prev).ar;
    const targetRatio = supportedRatios.find(r => r.ar === bestAR)?.val || 1.0;

    const gridInstructions = configs.map((c, i) => `   - Cell ${i + 1}: Action "${c.emotionPrompt}". ${c.showText ? `TEXT: "${c.text}" (Interact with this text!)` : "NO TEXT"}.`).join('\n');

    let basePrompt = "";

    if (stickerType === 'EMOJI') {
        // --- EMOJI MODE PROMPT ---
        basePrompt = `
    Grid Specification: ${cols} columns x ${rows} rows.
    Target Resolution: 2K (2048x2048).
    [System Role] Icon Designer / Emoji Artist.
    [Formatting] Center characters. Solid Green (#00FF00) BG.

    **DESIGN STYLE: LINE EMOJI (Character Fidelity)**
    1. **MAINTAIN CHARACTER IDENTITY (CRITICAL)**: You MUST strictly adhere to the Input Character's design.
       - **COLORS**: Use the EXACT same color palette as the reference image.
       - **FEATURES**: Keep facial features, hair style/color, and accessories consistent.
       - **DO NOT** simplify into a generic "stick figure" or "black and white icon" unless the reference is that style.
    2. **SIZE OPTIMIZATION**: These are small emojis (180px).
       - Keep lines **Bold and Clear**.
       - Avoid microscopic details that vanish at small sizes.
       - But **KEEP THE VIBE** of the original character.
    3. **NO WHITE OUTLINE**: Do NOT add a white border. The character should be **FULL BLEED** (fill the cell).
    4. **CONNECTABLE**: If possible, design element so they look good when placed next to each other.

    **COLOR SAFETY:**
    - NO Green (#00FF00) inside the artwork.
    - If fading, gradient to TRANSPARENT or HARD CUT. No partial opacity on green.

    **ENGINEERING GAP:** Leave a clear **Green River** (empty space) of at least 15px between cells for slicing.

    [Instructions]
    ${gridInstructions}
        `;
    } else {
        // --- STANDARD STICKER MODE PROMPT ---
        basePrompt = `
    Grid Specification: ${cols} columns x ${rows} rows.
    Target Resolution: 2K (2048x2048).
    [System Role] Senior Sticker Artist.
    [Formatting] Center characters. Solid Green (#00FF00) BG. 

    **COLOR SAFETY & GRADIENT PROTOCOL (CRITICAL FOR CUTTING):**
    1. **NO CAMOUFLAGE:** STRICTLY PROHIBITED colors inside the artwork: **Bright Green (#00FF00)** or Lime Green. These confuse the background cutter. Use Teal, Blue, or Dark Forest Green instead.
    2. **FADE-TO-WHITE RULE:** If an object needs to fade (e.g., ghosts, speed lines, magic aura), it MUST gradient into **SOLID WHITE**, NEVER fade into the green background.
       - *Reasoning:* Fading to Green causes the background remover to delete the object's tail. Fading to White preserves it.
    3. **SAFETY BARRIER:** Every element (Character + Text + Effects) MUST have a **Thick (15px), Solid WHITE Border** (Sticker Outline). This acts as a safety barrier between the artwork and the green screen.

    **COMPOSITION:** The final output will be cropped to **370x320 px** (Ratio ~1.15). Standard sticker proportions.
    
    **TEXT INTERACTION RULE (CRITICAL):**
    - The text caption is a **Physical Object** in the scene.
    - The character must **INTERACT** with the text.
    - **Examples:**
        - *Holding the text* like a heavy sign.
        - *Peeking* from behind the text.
        - *Sitting* on top of the text.
        - *Kicking* the text (for angry emotions).
        - *Hugging* the text (for love/thanks).
    - **Prohibited:** Do NOT place text as a boring subtitle at the bottom. Mix it with the character!

    **TYPOGRAPHY STYLE:**
    - Use **Hand-drawn, Bubble, or Pop Art** font styles.
    - Text should look 'bouncy' and 'elastic'.
    - Color: Text color must complement the character but stand out (high contrast). Avoid Green text.

    **ENGINEERING GAP:** You MUST leave a clear **Green River** (empty space) of at least 30px between every row and column. This is required for the automated slicing algorithm.

    [Instructions]
    ${gridInstructions}
    
    [FINAL CHECK]
    Spacing: Ensure > 3% green gap between all stickers (Vertical & Horizontal).
    Background: Pure Green, no artifacts.
        `;
    }

    // Static Generation Loop
    let attempts = 0;
    while (attempts < 3) {
        try {
            const response = await ai.models.generateContent({
                model: STICKER_GEN_MODEL_PRO,
                contents: { parts: [{ inlineData: { mimeType: 'image/png', data: base64Char } }, { text: basePrompt }] },
                // Use 2K Resolution for Static Sheets to save tokens and time
                config: { imageConfig: { aspectRatio: bestAR, imageSize: "2K" } }
            });
            validateResponse(response);
            const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (!part?.inlineData?.data) throw new Error("No data");
            const finalUrl = `data:image/png;base64,${part.inlineData.data}`;

            // Level 1 Check
            const valid = await validateImageDimensions(finalUrl, targetRatio);
            if (valid) return { url: finalUrl };
            attempts++;
        } catch (e) {
            console.error(e);
            attempts++;
            await wait(1000);
        }
    }
    throw new Error("Failed to generate static sheet.");
};

export const editSticker = async (markedImage: string, prompt: string): Promise<GeneratedImage> => {
    const ai = getAI();
    const base64Data = stripMimeType(markedImage);

    // Updated Inpainting Prompt: Explicitly instruct NOT to just remove red marks, but to GENERATE CONTENT.
    const editPrompt = `
    [INPAINTING TASK]
    The input image contains RED BRUSH STROKES. 
    1. **MASK DEFINITION**: The red areas represent a "Request for Change" mask.
    2. **GOAL**: You MUST regenerate the content *inside* the red mask area to match this user instruction: "${prompt}".
    3. **CONSTRAINT**: 
       - Do NOT just "remove" the red marks and leave empty space.
       - The input contains a RED MASK. You must completely REMOVE the red color and redraw the area with the requested content.
       - Do NOT just restore the original image.
       - You MUST draw NEW content in that area that blends seamlessly with the rest of the character.
    4. **BACKGROUND**: Keep the background Pure Green (#00FF00).
    5. **COLOR SAFETY**: Do NOT use bright green in the new content. If generating effects, fade to WHITE, not green.
    `;

    // Pro -> Flash Fallback
    try {
        const response = await ai.models.generateContent({
            model: STICKER_GEN_MODEL_PRO,
            contents: { parts: [{ inlineData: { mimeType: 'image/png', data: base64Data } }, { text: editPrompt }] },
            config: { imageConfig: { imageSize: "4K" } }
        });
        validateResponse(response);
        const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!part?.inlineData?.data) throw new Error("No data");
        return { id: `edited-${Date.now()}`, url: `data:image/png;base64,${part.inlineData.data}`, type: 'STATIC', status: 'SUCCESS', emotion: 'Edited' };
    } catch (e) {
        const response = await ai.models.generateContent({
            model: STICKER_GEN_MODEL_FLASH,
            contents: { parts: [{ inlineData: { mimeType: 'image/png', data: base64Data } }, { text: editPrompt }] },
            config: { imageConfig: {} }
        });
        validateResponse(response);
        const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!part?.inlineData?.data) throw new Error("Edit failed.");
        return { id: `edited-${Date.now()}`, url: `data:image/png;base64,${part.inlineData.data}`, type: 'STATIC', status: 'SUCCESS', emotion: 'Edited' };
    }
};

export const restyleSticker = async (imageUrl: string, filter: ArtisticFilterType): Promise<GeneratedImage> => {
    if (filter === 'ORIGINAL') return { id: 'orig', url: imageUrl, type: 'STATIC' };
    const ai = getAI();
    const prompt = `Redraw in ${filter} style. Maintain pose/comp. Keep 15px white border.`;

    const response = await ai.models.generateContent({
        model: STICKER_GEN_MODEL_FLASH,
        contents: { parts: [{ inlineData: { mimeType: 'image/png', data: stripMimeType(imageUrl) } }, { text: prompt }] },
        config: { imageConfig: {} }
    });
    validateResponse(response);
    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!part?.inlineData?.data) throw new Error("Restyle failed.");
    return { id: `restyle-${Date.now()}`, url: `data:image/png;base64,${part.inlineData.data}`, type: 'STATIC', status: 'SUCCESS', emotion: filter };
};
