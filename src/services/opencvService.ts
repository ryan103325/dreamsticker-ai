
import { blobToDataUrl } from './utils';

/**
 * OpenCV Service for Green Screen Auto-Slicing
 *
 * ALL OpenCV work runs inside public/opencv-worker.js, a dedicated Web
 * Worker — the main thread never loads opencv.js or touches a cv.Mat.
 *
 * History: opencv.js is self-hosted (scripts/copy-opencv.mjs copies it from
 * the @techstark/opencv-js npm package into public/vendor/, postinstall)
 * because bundling it silently broke in production (the emscripten UMD
 * initializes fine under Node/dev but its wasm runtime never signals ready
 * inside a Rollup-bundled dynamic import). Loading the self-hosted file via
 * a <script> tag fixed THAT bug, but revealed a second, worse one:
 * instantiating a ~10.8MB wasm module on the renderer's main thread blocks
 * it long enough that Chrome shows the "Page Unresponsive" dialog on real
 * hardware — every button on the page appears frozen, not just the slicer,
 * because the whole main thread is stalled. Running it in a worker fixes
 * this at the root: the main thread is never blocked, no matter how slow
 * OpenCV's init or the slicing itself is.
 *
 * The worker is deliberately a plain, hand-authored classic (non-module)
 * script in public/ (same treatment as public/sw.js and public/vendor/
 * opencv.js) instead of a Vite-bundled worker: opencv.js is a UMD bundle
 * that requires importScripts(), which only exists in classic workers, and
 * keeping it out of the bundler sidesteps the exact bundling failure that
 * caused the original bug.
 */

let worker: Worker | null = null;
let readyPromise: Promise<void> | null = null;
let nextRequestId = 0;
const pending = new Map<number, { resolve: (blobs: Blob[]) => void; reject: (e: Error) => void }>();

const WORKER_URL = `${import.meta.env.BASE_URL}opencv-worker.js`;

const getWorker = (): Worker => {
    if (worker) return worker;
    // Classic (non-module) worker: opencv-worker.js uses importScripts().
    worker = new Worker(WORKER_URL);
    worker.onmessage = (e: MessageEvent) => {
        const msg = e.data;
        if (msg.type === 'slice-result') {
            pending.get(msg.id)?.resolve(msg.blobs);
            pending.delete(msg.id);
        } else if (msg.type === 'slice-error') {
            pending.get(msg.id)?.reject(new Error(msg.message));
            pending.delete(msg.id);
        }
        // 'ready' / 'init-error' are consumed by the one-shot listener that
        // loadOpenCV() attaches per call, not here.
    };
    worker.onerror = (e) => {
        console.error('[opencv-worker] uncaught error:', e.message);
    };
    return worker;
};

const loadOpenCV = (): Promise<void> => {
    if (!readyPromise) {
        const w = getWorker();
        const p = new Promise<void>((resolve, reject) => {
            const onMessage = (e: MessageEvent) => {
                if (e.data?.type === 'ready') {
                    w.removeEventListener('message', onMessage);
                    resolve();
                } else if (e.data?.type === 'init-error') {
                    w.removeEventListener('message', onMessage);
                    reject(new Error(e.data.message));
                }
            };
            w.addEventListener('message', onMessage);
            w.postMessage({ type: 'init' });
        });
        // A genuine load failure should not poison future retries
        p.catch(() => { if (readyPromise === p) readyPromise = null; });
        readyPromise = p;
    }
    return readyPromise;
};

// Resolves true once OpenCV is ready in the worker; false on load failure or
// timeout. The default timeout is generous: 10.8MB over a slow mobile
// connection can legitimately take a minute, and a premature false leaves
// the slice button disabled with no way forward.
export const waitForOpenCV = async (timeout = 120000): Promise<boolean> => {
    try {
        await Promise.race([
            loadOpenCV(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('OpenCV load timeout')), timeout)),
        ]);
        return true;
    } catch (e) {
        console.error('OpenCV.js failed to load:', e);
        return false;
    }
};

export interface RectLike { x: number; y: number; width: number; height: number }

// ---- Pure geometry helpers, exported for unit tests. ----
// NOTE: identical copies live in public/opencv-worker.js — a classic worker
// can't import ES modules, so opencv.js's importScripts() requirement forces
// this duplication. Keep both copies in sync if the algorithm changes.

const unionRect = (a: RectLike, b: RectLike): RectLike => {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return {
        x, y,
        width: Math.max(a.x + a.width, b.x + b.width) - x,
        height: Math.max(a.y + a.height, b.y + b.height) - y,
    };
};

const gapX = (a: RectLike, b: RectLike) => Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
const gapY = (a: RectLike, b: RectLike) => Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));

/**
 * Merges fragments that belong to the same sticker (e.g. a floating caption
 * under its character): pieces that overlap or sit very close get unioned.
 */
export const mergeFragments = (boxes: RectLike[], cellW: number, cellH: number): RectLike[] => {
    const merged = boxes.map(b => ({ ...b }));
    let changed = true;
    while (changed) {
        changed = false;
        outer: for (let i = 0; i < merged.length; i++) {
            for (let j = i + 1; j < merged.length; j++) {
                if (gapX(merged[i], merged[j]) < cellW * 0.1 && gapY(merged[i], merged[j]) < cellH * 0.3) {
                    merged[i] = unionRect(merged[i], merged[j]);
                    merged.splice(j, 1);
                    changed = true;
                    break outer;
                }
            }
        }
    }
    return merged;
};

/**
 * Clusters merged boxes into a row-major grid by the actual gaps between
 * them (no assumption that the model drew evenly-spaced cells). Returns null
 * when the layout doesn't resolve to the expected structure — the caller
 * then falls back to uniform-cell assignment.
 */
export const clusterToGrid = (boxes: RectLike[], rows: number, cols: number, cellW: number, cellH: number): RectLike[] | null => {
    if (boxes.length === 0 || boxes.length > rows * cols) return null;

    const byY = [...boxes].sort((a, b) => (a.y + a.height / 2) - (b.y + b.height / 2));
    const rowGroups: RectLike[][] = [];
    for (const box of byY) {
        const cy = box.y + box.height / 2;
        const last = rowGroups[rowGroups.length - 1];
        if (last) {
            const lastCy = last.reduce((s, r) => s + r.y + r.height / 2, 0) / last.length;
            if (Math.abs(cy - lastCy) < cellH * 0.45) {
                last.push(box);
                continue;
            }
        }
        rowGroups.push([box]);
    }
    if (rowGroups.length !== rows) return null;

    const result: RectLike[] = [];
    for (const group of rowGroups) {
        const byX = group.sort((a, b) => (a.x + a.width / 2) - (b.x + b.width / 2));
        const colGroups: RectLike[][] = [];
        for (const box of byX) {
            const cx = box.x + box.width / 2;
            const last = colGroups[colGroups.length - 1];
            if (last) {
                const lastCx = last.reduce((s, r) => s + r.x + r.width / 2, 0) / last.length;
                if (Math.abs(cx - lastCx) < cellW * 0.45) {
                    last.push(box);
                    continue;
                }
            }
            colGroups.push([box]);
        }
        if (colGroups.length > cols) return null;
        for (const cg of colGroups) {
            const u = cg.reduce(unionRect);
            // A union larger than ~1.6 cells means clustering glued two
            // stickers together -> unreliable, bail to the fallback.
            if (u.width > cellW * 1.6 || u.height > cellH * 1.6) return null;
            result.push(u);
        }
    }
    return result;
};

/**
 * Fallback: assign every box to its uniform grid cell by centroid and union
 * per cell (works when the sheet layout is close to mathematically even).
 */
export const uniformAssign = (boxes: RectLike[], rows: number, cols: number, totalW: number, totalH: number): RectLike[] => {
    const cellW = totalW / cols;
    const cellH = totalH / rows;
    const cells: (RectLike | null)[] = new Array(rows * cols).fill(null);
    for (const rect of boxes) {
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        const col = Math.min(cols - 1, Math.max(0, Math.floor(cx / cellW)));
        const row = Math.min(rows - 1, Math.max(0, Math.floor(cy / cellH)));
        const idx = row * cols + col;
        cells[idx] = cells[idx] ? unionRect(cells[idx]!, rect) : { ...rect };
    }
    // Clamp each union to its own cell neighborhood (20% overflow allowed)
    const out: RectLike[] = [];
    for (let idx = 0; idx < cells.length; idx++) {
        const tight = cells[idx];
        if (!tight) continue;
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        const x1 = Math.round(Math.max(tight.x, col * cellW - cellW * 0.2, 0));
        const y1 = Math.round(Math.max(tight.y, row * cellH - cellH * 0.2, 0));
        const x2 = Math.round(Math.min(tight.x + tight.width, (col + 1) * cellW + cellW * 0.2, totalW));
        const y2 = Math.round(Math.min(tight.y + tight.height, (row + 1) * cellH + cellH * 0.2, totalH));
        if (x2 - x1 > 8 && y2 - y1 > 8) out.push({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 });
    }
    return out;
};

/**
 * Slices a sheet using CONTOUR + GAP-CLUSTERING SLICING, run entirely inside
 * the opencv-worker (see public/opencv-worker.js for the full algorithm:
 * background masking, contour detection, fragment merge, grid clustering
 * with a uniform-cell fallback, alpha softening, despill, and resampling).
 *
 * The image is decoded on the main thread (fetch + createImageBitmap, both
 * lightweight/native) and the resulting ImageBitmap is transferred
 * (zero-copy) to the worker; results come back as PNG Blobs, converted here
 * to the data-URL strings the rest of the app expects.
 */
export const processGreenScreenAndSlice = async (
    imageUrl: string,
    rows: number,
    cols: number,
    targetW: number,
    targetH: number,
    padding: number = 2,
    fit: 'CONTAIN' | 'COVER' = 'CONTAIN'
): Promise<string[]> => {
    const isCvReady = await waitForOpenCV();
    if (!isCvReady) throw new Error("OpenCV is not loaded.");

    const w = getWorker();
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);

    const id = nextRequestId++;
    const resultPromise = new Promise<Blob[]>((resolve, reject) => {
        pending.set(id, { resolve, reject });
    });
    w.postMessage(
        { type: 'slice', id, imageBitmap, rows, cols, targetW, targetH, padding, fit },
        [imageBitmap]
    );

    const blobs = await resultPromise;
    return Promise.all(blobs.map(blobToDataUrl));
};
