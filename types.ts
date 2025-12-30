
export type GenerationStatus = 'PENDING' | 'GENERATING' | 'COOLDOWN' | 'SUCCESS' | 'ERROR';

export interface GeneratedImage {
  id: string;
  url: string; // Data URL for images (Preview)
  emotion?: string;
  type: 'STATIC';
  status?: GenerationStatus;
  error?: string;
}

export interface CharacterInput {
  id: string;
  image?: string; // Base64 (Optional reference)
  description: string; // Appearance description
}

export interface SheetLayout {
  rows: number;
  cols: number;
  width: number;
  height: number;
}

export interface StickerSheet {
  id: string;
  url: string; // The raw green screen image
  configs: StickerConfig[]; // The configs associated with this sheet
  sheetIndex: number;
  totalSheets: number;
  layout: SheetLayout; // Dynamic layout for this specific sheet
}

export interface StickerPackageInfo {
  title: {
    en: string;
    zh: string;
  };
  description: {
    en: string;
    zh: string;
  };
}

export enum AppStep {
  UPLOAD = 0,
  CANDIDATE_SELECTION = 1,
  STICKER_CONFIG = 2,
  SHEET_EDITOR = 3, // New Step: Fix the raw sheet before cropping
  SMART_CROP = 3.5, // Existing Step: Adjust crop rects
  STICKER_PROCESSING = 4, // Shows individual cut stickers
  METADATA = 5,
  DOWNLOAD = 6,
}

export type InputMode = 'PHOTO' | 'EXISTING_IP' | 'TEXT_PROMPT' | 'UPLOAD_SHEET';
export type StickerType = 'STATIC' | 'EMOJI';

export type ArtisticFilterType = 'ORIGINAL' | 'WATERCOLOR' | 'SKETCH' | 'COMIC' | 'PIXEL' | 'VINTAGE' | 'GRAYSCALE';

export interface StickerConfig {
  id: string;
  emotionPrompt: string; // English Prompt for AI
  emotionPromptCN?: string; // Chinese Description for User
  text: string;
  showText: boolean;
}

export interface FontConfig {
  language: string;
  style: string;
  color: string;
  customFontFamily?: string;
}

export type StickerQuantity = 8 | 16 | 24 | 32 | 40;

// --- STICKER SPECS (User Defined Dimensions for Static) ---
export const STICKER_SPECS: Record<number, { width: number; height: number; cols: number; rows: number }> = {
  8: { width: 1480, height: 640, cols: 4, rows: 2 },
  16: { width: 1480, height: 1280, cols: 4, rows: 4 },
  24: { width: 1480, height: 1920, cols: 4, rows: 6 },
  32: { width: 1480, height: 2560, cols: 4, rows: 8 },
  40: { width: 1850, height: 2560, cols: 5, rows: 8 },
};

export const getStickerSpec = (count: number) => {
  return STICKER_SPECS[count] || STICKER_SPECS[8];
};

// --- EMOJI SPECS (180x180 target, generated at ~256x256 for detail then downscaled) ---
export const EMOJI_SPECS: Record<number, { width: number; height: number; cols: number; rows: number }> = {
  8: { width: 1024, height: 512, cols: 4, rows: 2 },
  16: { width: 1024, height: 1024, cols: 4, rows: 4 },
  24: { width: 1024, height: 1536, cols: 4, rows: 6 },
  32: { width: 1024, height: 2048, cols: 4, rows: 8 },
  40: { width: 1280, height: 2048, cols: 5, rows: 8 },
};

export const getEmojiSpec = (count: number) => {
  return EMOJI_SPECS[count] || EMOJI_SPECS[8];
};

export const DEFAULT_STYLE = "Q版日本動漫";

export const LANGUAGES = [
  "Traditional Chinese (繁體中文)",
  "English (英文)",
  "Japanese (日文)",
  "Korean (韓文)"
];

export const FONT_STYLES = [
  "華康布丁體",
  "思源黑體",
  "俐方體",
  "粉圓體",
  "華康少女文字",
  "懶狗狗體",
  "激燃體",
  "M+字體",
  "Custom (自訂上傳)"
];

// Helper to generate N configs
export const generateDefaultConfigs = (quantity: number): StickerConfig[] => {
  const bases = [
    { text: '開心', promptCN: '開心的笑，大大的笑容', prompt: 'Happy, Joyful, Big Smile' },
    { text: '難過', promptCN: '難過哭泣，流眼淚', prompt: 'Sad, Crying, Tears' },
    { text: '森77', promptCN: '生氣憤怒，冒火', prompt: 'Angry, Furious, Burning' },
    { text: '驚訝', promptCN: '嚇一跳，震驚', prompt: 'Surprised, Shocked' },
    { text: '愛你', promptCN: '愛心眼，雙手比愛心', prompt: 'Love, Heart eyes, Hand heart' },
    { text: '大笑', promptCN: '捧腹大笑', prompt: 'Laughing out loud' },
    { text: '蛤?', promptCN: '困惑，滿頭問號', prompt: 'Confused, Question marks' },
    { text: '帥', promptCN: '戴墨鏡，耍酷', prompt: 'Cool, Wearing Sunglasses' },
    { text: '好的', promptCN: '比OK手勢，比讚', prompt: 'OK sign, Thumbs up' },
    { text: '不要', promptCN: '雙手打叉，拒絕', prompt: 'No, Cross arms, Reject' },
    { text: '謝謝', promptCN: '鞠躬道謝', prompt: 'Bowing, Thank you' },
    { text: '晚安', promptCN: '睡覺，流口水', prompt: 'Sleeping, Zzz, Drooling' },
    { text: '加油', promptCN: '拿彩球加油', prompt: 'Cheering, Holding Pom poms' },
    { text: '累', promptCN: '累趴在地上，融化', prompt: 'Tired, Exhausted, Melting on floor' },
    { text: '怕', promptCN: '發抖，看到鬼', prompt: 'Scared, Shaking, Ghost behind' },
    { text: '無言', promptCN: '無言，點點點', prompt: 'Speechless, Dots' }
  ];

  return Array.from({ length: quantity }, (_, i) => {
    const base = bases[i % bases.length];
    return {
      id: (i + 1).toString(),
      emotionPrompt: base.prompt,
      emotionPromptCN: base.promptCN,
      text: base.text,
      showText: i < 16, // Default first 16 to have text
    };
  });
};

export const DEFAULT_STICKER_CONFIGS: StickerConfig[] = generateDefaultConfigs(8);
