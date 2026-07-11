/**
 * Format encoding with per-file size budgets.
 *
 * Two platform constraints drive this module:
 * - Telegram / WhatsApp require WebP, but Safari's canvas.toDataURL/toBlob
 *   silently falls back to PNG — the returned MIME must be checked, and a
 *   wasm encoder (@jsquash/webp, dynamically imported) used as backup.
 * - WhatsApp enforces 100KB per sticker. Lossy WebP on our soft-alpha edges
 *   introduces fringe artifacts, so the ladder tries LOSSLESS first (flat
 *   cartoon colors usually compress under 100KB), then steps lossy quality
 *   down 0.9 → 0.5, then shrinks the canvas (512 → 480 → 448) and retries.
 */

export type EncodeFormat = 'png' | 'webp';

export interface EncodeAttempt {
    lossless?: boolean;
    quality?: number; // 0..1, only for lossy webp
    scale: number;    // 1 = original size
}

export interface EncodeResult {
    blob: Blob;
    mime: string;
    width: number;
    height: number;
    /** false when even the smallest attempt exceeded maxBytes (caller should warn). */
    withinBudget: boolean;
    attempt: EncodeAttempt;
}

interface SizeLike { width: number; height: number }

/** Injectable backend so the ladder logic is unit-testable in Node. */
export interface BudgetEncoderDeps<C extends SizeLike> {
    encode: (canvas: C, format: EncodeFormat, opts: { quality?: number; lossless?: boolean }) => Promise<Blob>;
    resize: (canvas: C, w: number, h: number) => C;
}

// Quality ladder for lossy webp, tried after lossless fails the budget.
const LOSSY_QUALITIES = [0.9, 0.8, 0.7, 0.6, 0.5];
// Canvas shrink steps: 512 -> 480 -> 448 expressed as relative factors so
// the same ladder works for any platform cell size.
const SCALE_STEPS = [1, 480 / 512, 448 / 512];

// --- Browser backend ------------------------------------------------------

let nativeWebP: boolean | null = null;
/** Chrome/Edge encode WebP natively; Safari silently returns PNG instead. */
export const canEncodeWebPNatively = (): boolean => {
    if (nativeWebP === null) {
        try {
            const c = document.createElement('canvas');
            c.width = 2; c.height = 2;
            nativeWebP = c.toDataURL('image/webp').startsWith('data:image/webp');
        } catch {
            nativeWebP = false;
        }
    }
    return nativeWebP;
};

const canvasToBlob = (canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> =>
    new Promise((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error(`toBlob returned null for ${mime}`))), mime, quality);
    });

const browserEncode = async (
    canvas: HTMLCanvasElement,
    format: EncodeFormat,
    opts: { quality?: number; lossless?: boolean }
): Promise<Blob> => {
    if (format === 'png') return canvasToBlob(canvas, 'image/png');

    if (canEncodeWebPNatively()) {
        // Chromium treats quality 1.0 as lossless WebP.
        const q = opts.lossless ? 1.0 : (opts.quality ?? 0.9);
        const blob = await canvasToBlob(canvas, 'image/webp', q);
        if (blob.type === 'image/webp') return blob;
        // The browser lied (returned PNG) — fall through to wasm.
    }

    // wasm fallback, loaded on demand so the main bundle stays small.
    const { encode } = await import('@jsquash/webp');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context failed');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const buffer = await encode(imageData, opts.lossless
        ? { lossless: 1 }
        : { quality: Math.round((opts.quality ?? 0.9) * 100) });
    return new Blob([buffer], { type: 'image/webp' });
};

const browserResize = (src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, 0, 0, w, h);
    }
    return c;
};

const browserDeps: BudgetEncoderDeps<HTMLCanvasElement> = {
    encode: browserEncode,
    resize: browserResize,
};

// --- Budget ladder --------------------------------------------------------

/**
 * Encodes `canvas` as `format`, keeping the result under `maxBytes` when
 * given: lossless webp → lossy quality ladder → downscale retries. If every
 * attempt exceeds the budget the SMALLEST result is returned with
 * `withinBudget: false` so the caller can warn instead of failing silently.
 */
export async function encodeWithBudget<C extends SizeLike>(
    canvas: C,
    format: EncodeFormat,
    maxBytes?: number,
    deps?: BudgetEncoderDeps<C>
): Promise<EncodeResult> {
    const backend = deps ?? (browserDeps as unknown as BudgetEncoderDeps<C>);
    const mime = format === 'webp' ? 'image/webp' : 'image/png';

    const attempts: EncodeAttempt[] = format === 'webp'
        ? [{ lossless: true, scale: 1 }, ...LOSSY_QUALITIES.map(q => ({ quality: q, scale: 1 }))]
        : [{ scale: 1 }];

    // No budget: single best-quality pass (lossless for webp).
    if (!maxBytes) {
        const first = attempts[0];
        const blob = await backend.encode(canvas, format, first);
        return { blob, mime, width: canvas.width, height: canvas.height, withinBudget: true, attempt: first };
    }

    let smallest: EncodeResult | null = null;

    for (const scale of SCALE_STEPS) {
        const scaled = scale === 1
            ? canvas
            : backend.resize(canvas, Math.round(canvas.width * scale), Math.round(canvas.height * scale));

        for (const base of attempts) {
            const attempt = { ...base, scale };
            const blob = await backend.encode(scaled, format, attempt);
            const result: EncodeResult = {
                blob, mime,
                width: scaled.width, height: scaled.height,
                withinBudget: blob.size <= maxBytes,
                attempt,
            };
            if (result.withinBudget) return result;
            if (!smallest || blob.size < smallest.blob.size) smallest = result;
        }
    }

    return smallest!;
}

/** Loads a data URL into a canvas (bridge from the data-URL pipeline). */
export const dataUrlToCanvas = (dataUrl: string): Promise<HTMLCanvasElement> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            const ctx = c.getContext('2d');
            if (!ctx) return reject(new Error('Canvas context failed'));
            ctx.drawImage(img, 0, 0);
            resolve(c);
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = dataUrl;
    });
