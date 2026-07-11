import { SheetLayout, StickerQuantity, STICKER_SPECS, EMOJI_SPECS, StickerType } from './types';

/**
 * Platform registry — the single source of truth for every messaging
 * platform we can export stickers to. Generation (grid layout, prompt
 * outline rules), slicing (cell size / fit / padding), encoding (format,
 * per-file byte budget) and packaging (extras, README) all read from here.
 *
 * Cell aspect ratio MUST flow to the top of the pipeline: the grid layout is
 * computed from the platform's cell ratio so that slicing CONTAIN-fits into
 * the target canvas without wasting resolution (a LINE-shaped 370:320 cell
 * CONTAIN-ed into a 512x512 square would leave large empty bands).
 */

export type PlatformId =
    | 'LINE_STICKER'
    | 'LINE_EMOJI'
    | 'TELEGRAM'
    | 'WHATSAPP'
    | 'DISCORD_STICKER'
    | 'DISCORD_EMOJI'
    | 'WECHAT';

export interface PlatformExtra {
    file: string;            // filename inside the zip, e.g. 'main.png'
    w: number;
    h: number;
    format: 'png';
    maxBytes?: number;       // e.g. WhatsApp tray icon must stay under 50KB
}

export interface PlatformSpec {
    id: PlatformId;
    name: string;                      // fallback display name (UI prefers i18n key `platform_<id>`)
    cell: { w: number; h: number };    // final per-sticker canvas
    fit: 'CONTAIN' | 'COVER';          // stickers CONTAIN (keep margins), emoji COVER (full bleed)
    padding: number;                   // inner margin in px when CONTAIN-fitting
    format: 'png' | 'webp';
    maxBytes?: number;                 // per-sticker size budget (WhatsApp 100KB, Telegram 512KB...)
    outline: 'thick-white' | 'thin-white' | 'none'; // white sticker border rule fed into prompts
    extras: PlatformExtra[];           // derived images packaged next to the stickers (main/tab/tray)
    quantities: StickerQuantity[];     // set sizes this platform accepts
    /** true for 512px-class platforms where per-sticker generation is the
     *  sensible default (a grid sheet can't keep 1.3x downscale headroom). */
    preferIndividual: boolean;
    fileNamePad: number;               // zero-pad width of numbered sticker files
    /** Fixed grid layouts (regression-locked for LINE). When absent the
     *  layout is computed from the cell aspect ratio. */
    layouts?: Partial<Record<StickerQuantity, SheetLayout>>;
    packNote: string;                  // README.txt content: how to actually publish this pack
    marketUrl: string;
}

const specToLayouts = (specs: Record<number, { width: number; height: number; cols: number; rows: number }>): Partial<Record<StickerQuantity, SheetLayout>> => {
    const out: Partial<Record<StickerQuantity, SheetLayout>> = {};
    for (const [qty, s] of Object.entries(specs)) {
        out[Number(qty) as StickerQuantity] = { rows: s.rows, cols: s.cols, width: s.width, height: s.height };
    }
    return out;
};

export const PLATFORMS: Record<PlatformId, PlatformSpec> = {
    LINE_STICKER: {
        id: 'LINE_STICKER',
        name: 'LINE 貼圖 (Stickers)',
        cell: { w: 370, h: 320 },
        fit: 'CONTAIN',
        padding: 2,
        format: 'png',
        outline: 'thick-white',
        extras: [
            { file: 'main.png', w: 240, h: 240, format: 'png' },
            { file: 'tab.png', w: 96, h: 74, format: 'png' },
        ],
        quantities: [8, 16, 24, 32, 40],
        preferIndividual: false,
        fileNamePad: 2,
        layouts: specToLayouts(STICKER_SPECS),
        packNote: [
            '=== LINE 貼圖上架教學 / How to publish on LINE ===',
            '',
            '1. 前往 LINE Creators Market：https://creator.line.me/',
            '2. 登入後選「新增貼圖」→ 貼圖類型選「貼圖」。',
            '3. 上傳本壓縮檔內的編號圖片（01.png ~），以及 main.png（主要圖片）與 tab.png（聊天室標籤圖）。',
            '4. 填寫標題與說明（可直接使用 info.txt 內容），送出審核。',
            '',
            '1. Go to LINE Creators Market: https://creator.line.me/',
            '2. Create a new sticker set (type: Sticker).',
            '3. Upload the numbered images (01.png ...), plus main.png and tab.png.',
            '4. Fill in title/description (see info.txt) and submit for review.',
        ].join('\n'),
        marketUrl: 'https://creator.line.me/zh-hant/',
    },
    LINE_EMOJI: {
        id: 'LINE_EMOJI',
        name: 'LINE 表情貼 (Emoji)',
        cell: { w: 180, h: 180 },
        fit: 'COVER',
        padding: 0,
        format: 'png',
        outline: 'none',
        extras: [
            { file: 'tab.png', w: 96, h: 74, format: 'png' },
        ],
        quantities: [8, 16, 24, 32, 40],
        preferIndividual: false,
        fileNamePad: 3,
        layouts: specToLayouts(EMOJI_SPECS),
        packNote: [
            '=== LINE 表情貼上架教學 / How to publish LINE Emoji ===',
            '',
            '1. 前往 LINE Creators Market：https://creator.line.me/',
            '2. 登入後選「新增貼圖」→ 類型選「表情貼 (Emoji)」。',
            '3. 上傳編號圖片（001.png ~，180x180）與 tab.png。',
            '4. 填寫標題與說明（見 info.txt），送出審核。',
            '',
            '1. Go to LINE Creators Market: https://creator.line.me/',
            '2. Create a new set (type: Emoji).',
            '3. Upload the numbered 180x180 images (001.png ...) and tab.png.',
            '4. Fill in title/description (see info.txt) and submit for review.',
        ].join('\n'),
        marketUrl: 'https://creator.line.me/zh-hant/',
    },
    TELEGRAM: {
        id: 'TELEGRAM',
        name: 'Telegram 貼圖',
        cell: { w: 512, h: 512 },
        fit: 'CONTAIN',
        padding: 2,
        format: 'webp',
        maxBytes: 512 * 1024,
        outline: 'thin-white',
        extras: [],
        quantities: [8, 16, 20, 24, 32, 40],
        preferIndividual: true,
        fileNamePad: 2,
        packNote: [
            '=== Telegram 貼圖上架教學 / How to publish on Telegram ===',
            '',
            '1. 在 Telegram 中打開官方機器人 @Stickers：https://t.me/stickers',
            '2. 傳送指令 /newpack，依提示為貼圖包命名。',
            '3. 把本壓縮檔內的 .webp 圖片「以檔案 (File) 形式」逐張傳給機器人，',
            '   每張後面接一個代表它的 emoji。',
            '4. 全部傳完後傳送 /publish，設定短網址即完成。',
            '',
            '1. Open the official @Stickers bot in Telegram: https://t.me/stickers',
            '2. Send /newpack and name your pack.',
            '3. Send each .webp in this zip to the bot AS A FILE (not a photo),',
            '   followed by an emoji for that sticker.',
            '4. Send /publish when done and pick a short name. Your pack is live.',
        ].join('\n'),
        marketUrl: 'https://t.me/stickers',
    },
    WHATSAPP: {
        id: 'WHATSAPP',
        name: 'WhatsApp 貼圖',
        cell: { w: 512, h: 512 },
        fit: 'CONTAIN',
        padding: 16, // WhatsApp official guidance: keep a 16px margin around the artwork
        format: 'webp',
        maxBytes: 100 * 1024,
        outline: 'none',
        extras: [
            { file: 'tray.png', w: 96, h: 96, format: 'png', maxBytes: 50 * 1024 },
        ],
        quantities: [8, 16, 24], // a WhatsApp pack holds 3–30 stickers
        preferIndividual: true,
        fileNamePad: 2,
        packNote: [
            '=== WhatsApp 貼圖匯入教學 / How to import into WhatsApp ===',
            '',
            'WhatsApp 沒有官方上傳網站，需要透過第三方 App 匯入：',
            '1. 在手機安裝「Sticker Maker」或「Personal Stickers for WhatsApp」等貼圖匯入 App。',
            '2. 在 App 中建立新貼圖包，匯入本壓縮檔內的 .webp 圖片（每張 <100KB）。',
            '3. tray.png 是貼圖包在 WhatsApp 中顯示的小圖示（96x96）。',
            '4. 在 App 內點「Add to WhatsApp」即完成。',
            '',
            'WhatsApp has no official upload site — use a third-party importer app:',
            '1. Install "Sticker Maker" (or a similar sticker importer) on your phone.',
            '2. Create a new pack in the app and import the .webp files from this zip.',
            '3. tray.png (96x96) is the pack icon shown inside WhatsApp.',
            '4. Tap "Add to WhatsApp" in the app. Done.',
            '',
            'Official format requirements: https://github.com/WhatsApp/stickers',
        ].join('\n'),
        marketUrl: 'https://github.com/WhatsApp/stickers',
    },
    DISCORD_STICKER: {
        id: 'DISCORD_STICKER',
        name: 'Discord 貼圖',
        cell: { w: 320, h: 320 },
        fit: 'CONTAIN',
        padding: 2,
        format: 'png',
        maxBytes: 512 * 1024,
        outline: 'none',
        extras: [],
        quantities: [8, 16, 20, 24, 32, 40],
        preferIndividual: false,
        fileNamePad: 2,
        packNote: [
            '=== Discord 貼圖上傳教學 / How to upload to Discord ===',
            '',
            '1. 打開你有管理權限的伺服器 → 伺服器設定 → 貼圖 (Stickers)。',
            '2. 點「上傳貼圖」，逐張選擇本壓縮檔內的 PNG（320x320，<512KB）。',
            '3. 為每張貼圖取名並選一個相關 emoji。',
            '（貼圖欄位數量取決於伺服器加成等級。）',
            '',
            '1. Open a server you manage -> Server Settings -> Stickers.',
            '2. Click "Upload Sticker" and pick the PNGs from this zip (320x320, <512KB each).',
            '3. Name each sticker and pick a related emoji.',
            '(Available sticker slots depend on the server boost level.)',
        ].join('\n'),
        marketUrl: 'https://support.discord.com/',
    },
    DISCORD_EMOJI: {
        id: 'DISCORD_EMOJI',
        name: 'Discord Emoji',
        cell: { w: 128, h: 128 },
        fit: 'COVER',
        padding: 0,
        format: 'png',
        maxBytes: 256 * 1024,
        outline: 'none',
        extras: [],
        quantities: [8, 16, 20, 24, 32, 40],
        preferIndividual: false,
        fileNamePad: 2,
        packNote: [
            '=== Discord Emoji 上傳教學 / How to upload to Discord ===',
            '',
            '1. 打開你有管理權限的伺服器 → 伺服器設定 → 表情符號 (Emoji)。',
            '2. 點「上傳表情符號」，逐張選擇本壓縮檔內的 PNG（128x128，<256KB）。',
            '',
            '1. Open a server you manage -> Server Settings -> Emoji.',
            '2. Click "Upload Emoji" and pick the PNGs from this zip (128x128, <256KB each).',
        ].join('\n'),
        marketUrl: 'https://support.discord.com/',
    },
    WECHAT: {
        id: 'WECHAT',
        name: '微信表情 (WeChat)',
        cell: { w: 240, h: 240 },
        fit: 'CONTAIN',
        padding: 2,
        format: 'png',
        outline: 'thin-white',
        extras: [],
        quantities: [16, 24], // WeChat sticker sets must contain exactly 16 or 24 items
        preferIndividual: false,
        fileNamePad: 2,
        packNote: [
            '=== 微信表情上架教學 / How to publish on WeChat ===',
            '',
            '1. 前往微信表情开放平台：https://sticker.weixin.qq.com/',
            '2. 註冊 / 登入創作者帳號，建立新的表情專輯（16 或 24 張）。',
            '3. 依平台要求上傳本壓縮檔內的 240x240 PNG 圖片與相關素材。',
            '4. 送出審核。',
            '',
            '1. Go to the WeChat Sticker Open Platform: https://sticker.weixin.qq.com/',
            '2. Register/sign in as a creator and create a new sticker album (16 or 24 items).',
            '3. Upload the 240x240 PNGs from this zip plus the assets the platform asks for.',
            '4. Submit for review.',
        ].join('\n'),
        marketUrl: 'https://sticker.weixin.qq.com/',
    },
};

export const PLATFORM_LIST: PlatformSpec[] = Object.values(PLATFORMS);

export const DEFAULT_PLATFORM_ID: PlatformId = 'LINE_STICKER';

export const getPlatform = (id: PlatformId | string | null | undefined): PlatformSpec =>
    PLATFORMS[(id as PlatformId) ?? DEFAULT_PLATFORM_ID] || PLATFORMS[DEFAULT_PLATFORM_ID];

/** Legacy StickerType, still used by GeneratedImage / prompts / persistence. */
export const stickerTypeFor = (platform: PlatformSpec): StickerType =>
    platform.fit === 'COVER' ? 'EMOJI' : 'STATIC';

// Aspect-ratio buckets the image APIs actually support. Grid layouts are
// scored against these so the sheet we ask for matches a real canvas.
const AR_BUCKETS = [1.0, 4 / 3, 3 / 4, 16 / 9, 9 / 16];

/**
 * Computes the grid layout (rows x cols) for `qty` stickers of this
 * platform's cell shape: picks the factor pair whose overall sheet ratio
 * lands closest to a supported aspect-ratio bucket. LINE platforms carry
 * fixed layout tables (behavior locked for regression) which take priority.
 */
export const generateLayoutFor = (platform: PlatformSpec, qty: number): SheetLayout => {
    const fixed = platform.layouts?.[qty as StickerQuantity];
    if (fixed) return fixed;

    const cellAR = platform.cell.w / platform.cell.h;
    let best: SheetLayout | null = null;
    let bestScore = Infinity;

    for (let cols = 1; cols <= qty; cols++) {
        if (qty % cols !== 0) continue;
        const rows = qty / cols;
        if (cols > 8 || rows > 8) continue;
        const sheetRatio = (cols * cellAR) / rows;
        const score = Math.min(...AR_BUCKETS.map(b => Math.abs(Math.log(sheetRatio / b))));
        // Tie-break: prefer landscape-or-square sheets (matches LINE precedent)
        const better = score < bestScore - 1e-9 ||
            (Math.abs(score - bestScore) <= 1e-9 && best !== null && cols >= rows && best.cols < best.rows);
        if (best === null || better) {
            best = { rows, cols, width: cols * platform.cell.w, height: rows * platform.cell.h };
            bestScore = Math.min(bestScore, score);
        }
    }
    // qty is always factorable (worst case 1 x qty was filtered by the <=8
    // guard only for qty > 64, which no platform offers)
    return best!;
};
