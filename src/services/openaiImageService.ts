/**
 * OpenAI GPT Image engine (optional alternative to Gemini for image generation).
 *
 * Uses the OpenAI Images API directly from the browser with a user-supplied
 * key (BYOK, same trust model as the Gemini key):
 * - /v1/images/generations for pure text-to-image
 * - /v1/images/edits for generation with reference images (character
 *   consistency) and for the red-mask magic edit flow
 *
 * Notes (July 2026):
 * - gpt-image-2 is the top-ranked image model but requires the OpenAI
 *   organization to have completed API Organization Verification; we fall
 *   back to gpt-image-1.5 automatically when gpt-image-2 is unavailable.
 * - Reference-image edits are always processed at high input fidelity on
 *   gpt-image-2, which makes edit-heavy flows bill roughly 2-3x baseline.
 */

const OPENAI_IMAGE_MODEL = import.meta.env.VITE_OPENAI_IMAGE_MODEL || 'gpt-image-2';
const OPENAI_IMAGE_MODEL_FALLBACK = import.meta.env.VITE_OPENAI_IMAGE_MODEL_FALLBACK || 'gpt-image-1.5';

const OPENAI_KEY_STORAGE = 'openai_api_key';

let openaiApiKey = '';

export const setOpenAIApiKey = (key: string) => {
    openaiApiKey = key.trim();
};

export const getOpenAIApiKey = (): string => {
    if (openaiApiKey) return openaiApiKey;
    try {
        const stored = localStorage.getItem(OPENAI_KEY_STORAGE);
        if (stored) return atob(stored);
    } catch { /* ignore */ }
    return '';
};

export const saveOpenAIApiKey = (key: string) => {
    if (!key) return;
    try { localStorage.setItem(OPENAI_KEY_STORAGE, btoa(key)); } catch { /* ignore */ }
};

export const clearOpenAIApiKey = () => {
    try { localStorage.removeItem(OPENAI_KEY_STORAGE); } catch { /* ignore */ }
};

export const hasOpenAIKey = (): boolean => getOpenAIApiKey().length > 0;

export type OpenAIAspect = '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | 'auto';

// Size lookup per model. gpt-image-2 supports up to 3840x2160 (2K+ sizes);
// gpt-image-1.5 tops out at 1536px on the long edge.
const SIZE_MAP: Record<string, Record<OpenAIAspect, string>> = {
    'gpt-image-2': {
        '1:1': '2048x2048',
        '4:3': '2048x1536',
        '3:4': '1536x2048',
        '16:9': '2048x1152',
        '9:16': '1152x2048',
        'auto': 'auto',
    },
    default: {
        '1:1': '1024x1024',
        '4:3': '1536x1024',
        '3:4': '1024x1536',
        '16:9': '1536x1024',
        '9:16': '1024x1536',
        'auto': 'auto',
    },
};

const sizeFor = (model: string, aspect: OpenAIAspect): string =>
    (SIZE_MAP[model] || SIZE_MAP.default)[aspect];

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => (await fetch(dataUrl)).blob();

interface OpenAIImageOptions {
    prompt: string;
    /** Reference images as data URLs; presence switches to the edits endpoint. */
    images?: string[];
    aspect?: OpenAIAspect;
    quality: 'high' | 'medium' | 'low';
}

const callOpenAI = async (model: string, opts: OpenAIImageOptions): Promise<string> => {
    const key = getOpenAIApiKey();
    if (!key) throw new Error('OpenAI API Key Missing');

    const size = sizeFor(model, opts.aspect || 'auto');
    let response: Response;

    if (opts.images && opts.images.length > 0) {
        const form = new FormData();
        form.append('model', model);
        form.append('prompt', opts.prompt);
        if (size !== 'auto') form.append('size', size);
        form.append('quality', opts.quality);
        for (let i = 0; i < opts.images.length; i++) {
            form.append('image[]', await dataUrlToBlob(opts.images[i]), `ref_${i}.png`);
        }
        response = await fetch('https://api.openai.com/v1/images/edits', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}` },
            body: form,
        });
    } else {
        response = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                prompt: opts.prompt,
                ...(size !== 'auto' ? { size } : {}),
                quality: opts.quality,
            }),
        });
    }

    if (!response.ok) {
        let message = `OpenAI API error (${response.status})`;
        try {
            const err = await response.json();
            message = err?.error?.message || message;
        } catch { /* keep default */ }
        const error = new Error(message) as Error & { status: number };
        error.status = response.status;
        throw error;
    }

    const json = await response.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error('OpenAI returned no image data.');
    return `data:image/png;base64,${b64}`;
};

/**
 * Generates an image via OpenAI, trying gpt-image-2 first and falling back to
 * gpt-image-1.5 (e.g. unverified organizations, model retirement).
 */
export const openaiGenerateImage = async (opts: OpenAIImageOptions): Promise<string> => {
    const models = [OPENAI_IMAGE_MODEL, OPENAI_IMAGE_MODEL_FALLBACK].filter(
        (m, i, arr) => arr.indexOf(m) === i
    );
    let lastError: unknown = null;
    for (const model of models) {
        try {
            return await callOpenAI(model, opts);
        } catch (e) {
            console.warn(`[openaiGenerateImage] ${model} failed, trying next model...`, e);
            lastError = e;
            // 401 means a bad key: no point retrying other models.
            if ((e as { status?: number })?.status === 401) throw e;
        }
    }
    throw lastError;
};
