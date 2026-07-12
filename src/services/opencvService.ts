
/**
 * OpenCV Service for Green Screen Auto-Slicing
 * Uses OpenCV.js to detect the background, find content contours, and slice
 * characters out of a grid sheet.
 *
 * OpenCV.js is SELF-HOSTED: scripts/copy-opencv.mjs copies it from the
 * @techstark/opencv-js npm package into public/vendor/ (postinstall), and
 * it is injected as a classic <script> tag on demand. Two hard-won
 * constraints shape this:
 * - It must NOT go through the bundler: the emscripten UMD does not survive
 *   Rollup's CommonJS interop (initializes in dev/Node, silently never
 *   becomes ready in a production build).
 * - window.cv is a fake thenable whose `then` resolves to itself — `await`
 *   loops forever and freezes the tab. Poll cv.Mat / use
 *   onRuntimeInitialized instead; never await it.
 */

let cvPromise: Promise<any> | null = null;

const OPENCV_URL = `${import.meta.env.BASE_URL}vendor/opencv.js`;

const loadOpenCV = (): Promise<any> => {
    if (!cvPromise) {
        const p = new Promise<any>((resolve, reject) => {
            const existing = (window as any).cv;
            if (existing?.Mat) return resolve(existing);

            const script = document.createElement('script');
            script.async = true;
            script.src = OPENCV_URL;
            script.onload = () => {
                const cv = (window as any).cv;
                if (!cv) return reject(new Error('opencv.js loaded but window.cv is missing'));
                if (cv.Mat) return resolve(cv);
                // Wait for the wasm runtime: callback + poll (the callback
                // alone can be missed if the runtime finished before we
                // assigned it).
                cv.onRuntimeInitialized = () => resolve(cv);
                const poll = setInterval(() => {
                    if ((window as any).cv?.Mat) {
                        clearInterval(poll);
                        resolve((window as any).cv);
                    }
                }, 250);
            };
            script.onerror = () => reject(new Error('Failed to load vendor/opencv.js'));
            document.head.appendChild(script);
        });
        // A genuine load failure should not poison future retries
        p.catch(() => { if (cvPromise === p) cvPromise = null; });
        cvPromise = p;
    }
    return cvPromise;
};

// Resolves true once OpenCV is ready; false on load failure or timeout.
// The default timeout is generous: 10.8MB over a slow mobile connection can
// legitimately take a minute, and a premature false leaves the slice button
// disabled with no way forward.
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
 * Suppresses green spill on the semi-transparent edge band produced by the
 * alpha blur: any greenish edge pixel gets its green channel clamped to
 * max(red, blue), removing the tell-tale green fringe around cut stickers.
 */
const despillCanvas = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3];
        if (a === 0 || a >= 250) continue; // only the soft edge band
        const m = Math.max(d[i], d[i + 2]);
        if (d[i + 1] > m) d[i + 1] = m;
    }
    ctx.putImageData(imgData, 0, 0);
};

/**
 * Main function to process a sheet using CONTOUR + GAP-CLUSTERING SLICING.
 *
 * Algorithm:
 * 1. Smart Background Masking (Green screen via HSV, or generic solid color).
 * 2. Find ALL content contours on the full mask.
 * 3. Merge fragments belonging to the same sticker (character + caption).
 * 4. Cluster merged blobs into rows/columns by the ACTUAL gaps between them
 *    (robust to uneven, drifted grids); fall back to uniform-cell centroid
 *    assignment when the layout doesn't resolve cleanly.
 * 5. Crop each sticker from the alpha-applied source, soften + despill edges,
 *    and fit to the target LINE dimensions with high-quality resampling.
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

    const cv: any = await loadOpenCV();

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            try {
                // 1. Setup OpenCV Mats
                const src = cv.imread(img); // RGBA
                const cvt = new cv.Mat();
                const mask = new cv.Mat();

                // 2. Smart Background Detection
                cv.cvtColor(src, cvt, cv.COLOR_RGBA2RGB);

                // Sample Top-Left Pixel
                const p0 = cvt.ucharPtr(0, 0);
                const bgR = p0[0], bgG = p0[1], bgB = p0[2];

                // Check if it looks like Green Screen (HSV check)
                const hsvPix = new cv.Mat();
                const srcPix = new cv.Mat(1, 1, cv.CV_8UC3, new cv.Scalar(bgR, bgG, bgB));
                cv.cvtColor(srcPix, hsvPix, cv.COLOR_RGB2HSV);
                const h0 = hsvPix.data[0]; // Hue 0-179
                const s0 = hsvPix.data[1]; // Sat 0-255
                srcPix.delete(); hsvPix.delete();

                // Green Hue ~60 (35-85) and sufficient saturation
                const isGreenBG = (h0 >= 35 && h0 <= 85) && (s0 > 20);

                if (isGreenBG) {
                    // --- GREEN SCREEN MODE (Robust HSV) ---
                    const hsv = new cv.Mat();
                    cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
                    cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

                    const low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [35, 40, 40, 0]);
                    const high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [85, 255, 255, 255]);
                    cv.inRange(hsv, low, high, mask);

                    low.delete(); high.delete(); hsv.delete();
                } else {
                    // --- GENERIC SOLID COLOR MODE (Color Difference) ---
                    const tol = 30;
                    const low = new cv.Mat(cvt.rows, cvt.cols, cvt.type(), [Math.max(0, bgR - tol), Math.max(0, bgG - tol), Math.max(0, bgB - tol), 0]);
                    const high = new cv.Mat(cvt.rows, cvt.cols, cvt.type(), [Math.min(255, bgR + tol), Math.min(255, bgG + tol), Math.min(255, bgB + tol), 255]);

                    cv.inRange(cvt, low, high, mask); // Matches BG -> 255
                    low.delete(); high.delete();
                }

                // Invert Mask: BG(255) -> 0, Content(0) -> 255
                cv.bitwise_not(mask, mask);

                // Morphological Cleanup to remove noise
                const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
                cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);

                // *** Apply Transparency to Source (for final cropping) ***
                const rgbaPlanes = new cv.MatVector();
                cv.split(src, rgbaPlanes);
                const r = rgbaPlanes.get(0);
                const g = rgbaPlanes.get(1);
                const b = rgbaPlanes.get(2);
                const resultPlanes = new cv.MatVector();
                resultPlanes.push_back(r); resultPlanes.push_back(g); resultPlanes.push_back(b);
                resultPlanes.push_back(mask); // Mask is now Alpha
                cv.merge(resultPlanes, src);
                r.delete(); g.delete(); b.delete(); rgbaPlanes.delete(); resultPlanes.delete();

                // === CONTOUR + GAP-CLUSTERING SLICING ===

                const totalH = src.rows;
                const totalW = src.cols;
                const cellW = totalW / cols;
                const cellH = totalH / rows;

                const contours = new cv.MatVector();
                const hierarchy = new cv.Mat();
                cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

                const boxes: RectLike[] = [];
                for (let k = 0; k < contours.size(); ++k) {
                    const rect = cv.boundingRect(contours.get(k));
                    if (rect.width < 8 || rect.height < 8) continue; // noise specks
                    boxes.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
                }
                contours.delete(); hierarchy.delete();

                const merged = mergeFragments(boxes, cellW, cellH);
                let finalRects = clusterToGrid(merged, rows, cols, cellW, cellH);
                if (!finalRects) {
                    console.warn('[Slicer] Gap clustering did not resolve cleanly; using uniform-grid fallback.');
                    finalRects = uniformAssign(merged, rows, cols, totalW, totalH);
                }

                const slicedImages: string[] = [];

                for (const tight of finalRects) {
                    const x1 = Math.max(0, Math.round(tight.x) - 2);
                    const y1 = Math.max(0, Math.round(tight.y) - 2);
                    const x2 = Math.min(totalW, Math.round(tight.x + tight.width) + 2);
                    const y2 = Math.min(totalH, Math.round(tight.y + tight.height) + 2);
                    const w = x2 - x1;
                    const h = y2 - y1;
                    if (w <= 8 || h <= 8) continue;

                    const absRect = new cv.Rect(x1, y1, w, h);
                    const finalRoi = src.roi(absRect);

                    // Soft edge: Gaussian blur on the alpha channel only
                    const channels = new cv.MatVector();
                    cv.split(finalRoi, channels);
                    const alphaChannel = channels.get(3);
                    const ksize = new cv.Size(5, 5);
                    cv.GaussianBlur(alphaChannel, alphaChannel, ksize, 0, 0);
                    channels.set(3, alphaChannel);
                    cv.merge(channels, finalRoi);
                    alphaChannel.delete();
                    channels.delete();

                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = w;
                    tempCanvas.height = h;
                    cv.imshow(tempCanvas, finalRoi);
                    finalRoi.delete();

                    // Green spill suppression on the soft edge band
                    despillCanvas(tempCanvas);

                    const cellCanvas = document.createElement('canvas');
                    cellCanvas.width = targetW;
                    cellCanvas.height = targetH;
                    const ctx = cellCanvas.getContext('2d');
                    if (!ctx) continue;
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';

                    const availableW = targetW - (padding * 2);
                    const availableH = targetH - (padding * 2);

                    // COVER = emoji full-bleed; CONTAIN = sticker with margins
                    const scale = fit === 'COVER'
                        ? Math.max(availableW / w, availableH / h)
                        : Math.min(availableW / w, availableH / h);

                    const drawW = w * scale;
                    const drawH = h * scale;
                    ctx.drawImage(tempCanvas, 0, 0, w, h, (targetW - drawW) / 2, (targetH - drawH) / 2, drawW, drawH);
                    slicedImages.push(cellCanvas.toDataURL('image/png'));
                }

                // Cleanup
                src.delete(); cvt.delete(); mask.delete();
                kernel.delete();

                resolve(slicedImages);

            } catch (e) {
                console.error("OpenCV Processing Error:", e);
                reject(e);
            }
        };
        img.onerror = () => reject(new Error("Failed to load image for OpenCV processing"));
        img.src = imageUrl;
    });
};
