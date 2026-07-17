/**
 * OpenCV background worker — runs the ENTIRE green-screen slicing pipeline
 * off the main thread, main-thread never touches OpenCV.
 *
 * Why this exists: opencv.js (self-hosted from public/vendor/opencv.js,
 * ~10.8MB) was previously loaded via a <script> tag on the main document.
 * That fixed the "never becomes ready" bug (the earlier bundled dynamic
 * import silently failed in production), but instantiating that much wasm
 * on the renderer's main thread blocks it long enough that Chrome shows
 * the "Page Unresponsive" dialog on real hardware — every button on the
 * page (including ones with nothing to do with slicing, like Magic Edit)
 * appears frozen for however long the wasm compile takes. Running it here
 * keeps the tab fully interactive no matter how slow that is.
 *
 * This is a CLASSIC (non-module) worker on purpose: opencv.js is a UMD
 * bundle that requires importScripts(), which only exists in classic
 * workers. Because classic workers can't `import` ES modules, the pure
 * grid-slicing helpers below are duplicated from
 * src/services/opencvService.ts (which keeps the TypeScript copies for
 * unit tests). Keep both copies in sync if the algorithm changes.
 *
 * Message protocol (all messages are plain objects via postMessage):
 *   -> { type: 'init' }
 *   <- { type: 'ready' } | { type: 'init-error', message }
 *   -> { type: 'slice', id, imageBitmap, rows, cols, targetW, targetH, padding, fit }
 *      (imageBitmap passed in the transfer list)
 *   <- { type: 'slice-result', id, blobs: Blob[] } | { type: 'slice-error', id, message }
 */

importScripts('./vendor/opencv.js');

const waitForCv = () => new Promise((resolve, reject) => {
    if (self.cv && self.cv.Mat) return resolve();
    if (!self.cv) return reject(new Error('opencv.js loaded but self.cv is missing'));
    self.cv.onRuntimeInitialized = () => resolve();
    // onRuntimeInitialized alone can be missed if the runtime finished
    // between assignment and this line; poll as a backstop.
    const poll = setInterval(() => {
        if (self.cv && self.cv.Mat) { clearInterval(poll); resolve(); }
    }, 100);
});

let cvReady = false;

// ---- Pure geometry helpers (kept in sync with opencvService.ts) ----

const unionRect = (a, b) => {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return {
        x, y,
        width: Math.max(a.x + a.width, b.x + b.width) - x,
        height: Math.max(a.y + a.height, b.y + b.height) - y,
    };
};

const gapX = (a, b) => Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
const gapY = (a, b) => Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));

// Thresholds must stay safely below the smallest gap the generation
// prompts guarantee between cells ("at least 30px", see geminiService.ts).
// Keep in sync with src/services/opencvService.ts's copy.
const mergeFragments = (boxes, cellW, cellH) => {
    const merged = boxes.map((b) => ({ ...b }));
    let changed = true;
    while (changed) {
        changed = false;
        outer: for (let i = 0; i < merged.length; i++) {
            for (let j = i + 1; j < merged.length; j++) {
                if (gapX(merged[i], merged[j]) < cellW * 0.05 && gapY(merged[i], merged[j]) < cellH * 0.08) {
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

const clusterToGrid = (boxes, rows, cols, cellW, cellH) => {
    if (boxes.length === 0 || boxes.length > rows * cols) return null;

    const byY = [...boxes].sort((a, b) => (a.y + a.height / 2) - (b.y + b.height / 2));
    const rowGroups = [];
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

    const result = [];
    for (const group of rowGroups) {
        const byX = group.sort((a, b) => (a.x + a.width / 2) - (b.x + b.width / 2));
        const colGroups = [];
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
            if (u.width > cellW * 1.6 || u.height > cellH * 1.6) return null;
            result.push(u);
        }
    }
    return result;
};

const uniformAssign = (boxes, rows, cols, totalW, totalH) => {
    const cellW = totalW / cols;
    const cellH = totalH / rows;
    const cells = new Array(rows * cols).fill(null);
    for (const rect of boxes) {
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        const col = Math.min(cols - 1, Math.max(0, Math.floor(cx / cellW)));
        const row = Math.min(rows - 1, Math.max(0, Math.floor(cy / cellH)));
        const idx = row * cols + col;
        cells[idx] = cells[idx] ? unionRect(cells[idx], rect) : { ...rect };
    }
    const out = [];
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

// Suppresses green spill on the semi-transparent edge band (mutates in place).
const despillImageData = (imgData) => {
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3];
        if (a === 0 || a >= 250) continue; // only the soft edge band
        const m = Math.max(d[i], d[i + 2]);
        if (d[i + 1] > m) d[i + 1] = m;
    }
};

/**
 * Same CONTOUR + GAP-CLUSTERING SLICING algorithm as the previous main-thread
 * implementation, adapted to OffscreenCanvas/ImageData (no DOM available
 * here): background masking -> contour boxes -> fragment merge -> grid
 * cluster (uniform-cell fallback) -> per-cell crop, soft alpha edge,
 * despill, resample into the target canvas.
 */
const sliceSheet = async ({ imageBitmap, rows, cols, targetW, targetH, padding, fit }) => {
    const cv = self.cv;

    const srcCanvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(imageBitmap, 0, 0);
    imageBitmap.close();
    const srcImgData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

    const src = cv.matFromImageData(srcImgData); // RGBA
    const cvt = new cv.Mat();
    const mask = new cv.Mat();

    cv.cvtColor(src, cvt, cv.COLOR_RGBA2RGB);

    const p0 = cvt.ucharPtr(0, 0);
    const bgR = p0[0], bgG = p0[1], bgB = p0[2];

    const hsvPix = new cv.Mat();
    const srcPix = new cv.Mat(1, 1, cv.CV_8UC3, new cv.Scalar(bgR, bgG, bgB));
    cv.cvtColor(srcPix, hsvPix, cv.COLOR_RGB2HSV);
    const h0 = hsvPix.data[0];
    const s0 = hsvPix.data[1];
    srcPix.delete(); hsvPix.delete();

    const isGreenBG = (h0 >= 35 && h0 <= 85) && (s0 > 20);

    if (isGreenBG) {
        const hsv = new cv.Mat();
        cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
        cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
        const low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [35, 40, 40, 0]);
        const high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [85, 255, 255, 255]);
        cv.inRange(hsv, low, high, mask);
        low.delete(); high.delete(); hsv.delete();
    } else {
        const tol = 30;
        const low = new cv.Mat(cvt.rows, cvt.cols, cvt.type(), [Math.max(0, bgR - tol), Math.max(0, bgG - tol), Math.max(0, bgB - tol), 0]);
        const high = new cv.Mat(cvt.rows, cvt.cols, cvt.type(), [Math.min(255, bgR + tol), Math.min(255, bgG + tol), Math.min(255, bgB + tol), 255]);
        cv.inRange(cvt, low, high, mask);
        low.delete(); high.delete();
    }

    cv.bitwise_not(mask, mask);

    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);

    const rgbaPlanes = new cv.MatVector();
    cv.split(src, rgbaPlanes);
    const r = rgbaPlanes.get(0);
    const g = rgbaPlanes.get(1);
    const b = rgbaPlanes.get(2);
    const resultPlanes = new cv.MatVector();
    resultPlanes.push_back(r); resultPlanes.push_back(g); resultPlanes.push_back(b);
    resultPlanes.push_back(mask);
    cv.merge(resultPlanes, src);
    r.delete(); g.delete(); b.delete(); rgbaPlanes.delete(); resultPlanes.delete();

    const totalH = src.rows;
    const totalW = src.cols;
    const cellW = totalW / cols;
    const cellH = totalH / rows;

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const boxes = [];
    for (let k = 0; k < contours.size(); ++k) {
        const rect = cv.boundingRect(contours.get(k));
        if (rect.width < 8 || rect.height < 8) continue;
        boxes.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    }
    contours.delete(); hierarchy.delete();

    const merged = mergeFragments(boxes, cellW, cellH);
    let finalRects = clusterToGrid(merged, rows, cols, cellW, cellH);
    if (!finalRects) {
        console.warn('[Slicer] Gap clustering did not resolve cleanly; using uniform-grid fallback.');
        finalRects = uniformAssign(merged, rows, cols, totalW, totalH);
    }

    const blobs = [];
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

        const channels = new cv.MatVector();
        cv.split(finalRoi, channels);
        const alphaChannel = channels.get(3);
        const ksize = new cv.Size(5, 5);
        cv.GaussianBlur(alphaChannel, alphaChannel, ksize, 0, 0);
        channels.set(3, alphaChannel);
        cv.merge(channels, finalRoi);
        alphaChannel.delete();
        channels.delete();

        // finalRoi is a roi() VIEW sharing src's row stride (the full sheet
        // width), not a tightly-packed w-wide buffer -- reading .data
        // directly off it misreads each row at the wrong offset,
        // progressively drifting into the next row of the ORIGINAL sheet
        // (this produced the "TV static" bug). cv.imshow's own source
        // avoids exactly this by always convertTo()-ing into a fresh Mat
        // before reading .data (Mat::create always allocates contiguous
        // memory); mirror that same proven approach here since cv.imshow
        // itself requires an HTMLCanvasElement and rejects OffscreenCanvas.
        const contiguous = new cv.Mat();
        finalRoi.convertTo(contiguous, cv.CV_8U, 1, 0);
        finalRoi.delete();

        const roiImgData = new ImageData(new Uint8ClampedArray(contiguous.data), w, h);
        despillImageData(roiImgData);
        contiguous.delete();

        const tempCanvas = new OffscreenCanvas(w, h);
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(roiImgData, 0, 0);

        const cellCanvas = new OffscreenCanvas(targetW, targetH);
        const ctx = cellCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const availableW = targetW - padding * 2;
        const availableH = targetH - padding * 2;
        const scale = fit === 'COVER'
            ? Math.max(availableW / w, availableH / h)
            : Math.min(availableW / w, availableH / h);
        const drawW = w * scale;
        const drawH = h * scale;
        ctx.drawImage(tempCanvas, 0, 0, w, h, (targetW - drawW) / 2, (targetH - drawH) / 2, drawW, drawH);

        blobs.push(await cellCanvas.convertToBlob({ type: 'image/png' }));
    }

    src.delete(); cvt.delete(); mask.delete(); kernel.delete();
    return blobs;
};

self.onmessage = async (e) => {
    const msg = e.data;

    if (msg.type === 'init') {
        try {
            await waitForCv();
            cvReady = true;
            self.postMessage({ type: 'ready' });
        } catch (err) {
            self.postMessage({ type: 'init-error', message: String((err && err.message) || err) });
        }
        return;
    }

    if (msg.type === 'slice') {
        try {
            if (!cvReady) await waitForCv();
            const blobs = await sliceSheet(msg);
            self.postMessage({ type: 'slice-result', id: msg.id, blobs });
        } catch (err) {
            self.postMessage({ type: 'slice-error', id: msg.id, message: String((err && err.message) || err) });
        }
    }
};
