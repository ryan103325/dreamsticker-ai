
/**
 * OpenCV Service for Green Screen Auto-Slicing
 * Uses OpenCV.js to detect the background, find content contours, and slice
 * characters out of a grid sheet.
 */

// Helper to wait for OpenCV to be ready
export const waitForOpenCV = async (timeout = 30000): Promise<boolean> => {
    // @ts-ignore
    if (window.cv && window.cv.Mat) return true;

    return new Promise((resolve) => {
        let timer = 0;
        const interval = setInterval(() => {
            timer += 100;
            // @ts-ignore
            if (window.cv && window.cv.Mat) {
                clearInterval(interval);
                resolve(true);
            }
            if (timer >= timeout) {
                clearInterval(interval);
                console.error("OpenCV load timeout. Please check your internet connection.");
                resolve(false);
            }
        }, 100);
    });
};

interface RectLike { x: number; y: number; width: number; height: number }

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
 * Main function to process a sheet using CONTOUR + GRID-ASSIGNMENT SLICING.
 *
 * Algorithm:
 * 1. Smart Background Masking (Green screen via HSV, or generic solid color).
 * 2. Find ALL content contours on the full mask (robust to grid drift —
 *    no assumption that separator lines are perfectly straight or evenly
 *    spaced, unlike line-scan slicing).
 * 3. Assign each contour to its logical grid cell by centroid, and union the
 *    bounding boxes per cell (character + floating text pieces merge).
 * 4. Crop each cell from the alpha-applied source, soften + despill edges,
 *    and fit to the target LINE dimensions.
 *
 * @param imageUrl Source Image Data URL
 * @param rows Number of rows in the grid
 * @param cols Number of columns in the grid
 * @param targetW Output width per sticker (e.g., 370 or 180)
 * @param targetH Output height per sticker (e.g., 320 or 180)
 * @param padding Inner padding; 0 = COVER mode (emoji), >0 = CONTAIN (sticker)
 */
export const processGreenScreenAndSlice = async (
    imageUrl: string,
    rows: number,
    cols: number,
    targetW: number,
    targetH: number,
    padding: number = 2
): Promise<string[]> => {
    const isCvReady = await waitForOpenCV();
    if (!isCvReady) throw new Error("OpenCV is not loaded.");

    // @ts-ignore
    const cv = window.cv;

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

                // === CONTOUR + GRID-ASSIGNMENT SLICING ===

                const slicedImages: string[] = [];
                const totalH = src.rows;
                const totalW = src.cols;
                const cellW = totalW / cols;
                const cellH = totalH / rows;

                const contours = new cv.MatVector();
                const hierarchy = new cv.Mat();
                cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

                // Union bounding box per logical grid cell (row-major order)
                const cellRects: (RectLike | null)[] = new Array(rows * cols).fill(null);

                for (let k = 0; k < contours.size(); ++k) {
                    const rect = cv.boundingRect(contours.get(k));
                    if (rect.width < 8 || rect.height < 8) continue; // noise specks

                    const cx = rect.x + rect.width / 2;
                    const cy = rect.y + rect.height / 2;
                    const col = Math.min(cols - 1, Math.max(0, Math.floor(cx / cellW)));
                    const row = Math.min(rows - 1, Math.max(0, Math.floor(cy / cellH)));
                    const idx = row * cols + col;

                    const prev = cellRects[idx];
                    if (!prev) {
                        cellRects[idx] = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                    } else {
                        const x1 = Math.min(prev.x, rect.x);
                        const y1 = Math.min(prev.y, rect.y);
                        const x2 = Math.max(prev.x + prev.width, rect.x + rect.width);
                        const y2 = Math.max(prev.y + prev.height, rect.y + rect.height);
                        cellRects[idx] = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
                    }
                }
                contours.delete(); hierarchy.delete();

                // Allow content to bleed slightly past its cell (models are not
                // pixel-perfect), but clamp so a mis-assigned speck can't drag
                // the crop across the whole sheet.
                const overflowX = cellW * 0.2;
                const overflowY = cellH * 0.2;

                for (let idx = 0; idx < cellRects.length; idx++) {
                    const tight = cellRects[idx];
                    if (!tight) continue; // empty cell -> skip

                    const row = Math.floor(idx / cols);
                    const col = idx % cols;
                    const x1 = Math.round(Math.max(tight.x, col * cellW - overflowX, 0));
                    const y1 = Math.round(Math.max(tight.y, row * cellH - overflowY, 0));
                    const x2 = Math.round(Math.min(tight.x + tight.width, (col + 1) * cellW + overflowX, totalW));
                    const y2 = Math.round(Math.min(tight.y + tight.height, (row + 1) * cellH + overflowY, totalH));
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

                    const availableW = targetW - (padding * 2);
                    const availableH = targetH - (padding * 2);

                    // padding 0 = EMOJI full-bleed (COVER); otherwise CONTAIN
                    const scale = padding === 0
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
