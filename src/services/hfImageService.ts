/**
 * Hugging Face engine (open models via HF Inference Providers).
 *
 * Why this exists: HF routes to serverless providers (fal, replicate,
 * together, ...) at list price with no markup, includes free monthly
 * credits for every account, and the client works directly in the browser
 * with a user-supplied token (same BYOK trust model as the other engines).
 *
 * Default models are Alibaba's Qwen-Image family — the strongest open
 * models for CJK (Chinese) text rendering, which is exactly what
 * Chinese-caption LINE stickers need:
 * - Qwen/Qwen-Image       text-to-image
 * - Qwen/Qwen-Image-Edit  image editing / reference-based generation
 *
 * Typical cost: ~$0.02-0.05 per image (cheaper than Gemini Flash).
 * Limitations vs Gemini/OpenAI: single reference image per request, and
 * complex multi-cell grid adherence is weaker than Nano Banana Pro.
 */

import { blobToDataUrl } from './utils';

const HF_T2I_MODEL = import.meta.env.VITE_HF_IMAGE_MODEL || 'Qwen/Qwen-Image';
const HF_EDIT_MODEL = import.meta.env.VITE_HF_EDIT_MODEL || 'Qwen/Qwen-Image-Edit';

const HF_KEY_STORAGE = 'hf_api_token';

let hfToken = '';

export const setHFToken = (token: string) => {
    hfToken = token.trim();
};

export const getHFToken = (): string => {
    if (hfToken) return hfToken;
    try {
        const stored = localStorage.getItem(HF_KEY_STORAGE);
        if (stored) return atob(stored);
    } catch { /* ignore */ }
    return '';
};

export const saveHFToken = (token: string) => {
    if (!token) return;
    try { localStorage.setItem(HF_KEY_STORAGE, btoa(token)); } catch { /* ignore */ }
};

export const clearHFToken = () => {
    try { localStorage.removeItem(HF_KEY_STORAGE); } catch { /* ignore */ }
};

export const hasHFToken = (): boolean => getHFToken().length > 0;

// Qwen-Image's officially supported resolutions per aspect ratio.
const QWEN_SIZES: Record<string, { width: number; height: number }> = {
    '1:1': { width: 1328, height: 1328 },
    '16:9': { width: 1664, height: 928 },
    '9:16': { width: 928, height: 1664 },
    '4:3': { width: 1472, height: 1140 },
    '3:4': { width: 1140, height: 1472 },
};

interface HFImageOptions {
    prompt: string;
    /** Reference image as data URL; presence switches to the edit model. */
    image?: string;
    aspect?: '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | 'auto';
}

export const hfGenerateImage = async (opts: HFImageOptions): Promise<string> => {
    const token = getHFToken();
    if (!token) throw new Error('Hugging Face token missing');

    // Lazy-load the HF client so users who never pick this engine don't pay
    // the ~350KB bundle cost up front.
    const { InferenceClient } = await import('@huggingface/inference');
    const client = new InferenceClient(token);

    let blob: Blob;
    if (opts.image) {
        const inputBlob = await (await fetch(opts.image)).blob();
        blob = await client.imageToImage({
            provider: 'auto',
            model: HF_EDIT_MODEL,
            inputs: inputBlob,
            parameters: { prompt: opts.prompt },
        }) as Blob;
    } else {
        const size = QWEN_SIZES[opts.aspect || '1:1'] || QWEN_SIZES['1:1'];
        blob = await client.textToImage({
            provider: 'auto',
            model: HF_T2I_MODEL,
            inputs: opts.prompt,
            parameters: { width: size.width, height: size.height },
        }, { outputType: 'blob' }) as Blob;
    }

    return blobToDataUrl(blob);
};
