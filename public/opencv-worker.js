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

/**
 * Cell-driven fallback slicing: when contour clustering cannot resolve the
 * grid — typically a tightly-packed sheet where neighboring stickers'
 * white outlines physically touch and fuse into one connected component —
 * slice by the KNOWN grid instead. For each cell, find the bounding box of
 * mask content strictly inside that cell; cross-cell connections become
 * irrelevant, and every occupied cell yields exactly one sticker.
 */
const cellwiseRects = (cv, mask, rows, cols) => {
    const totalW = mask.cols, totalH = mask.rows;
    const cellW = totalW / cols, cellH = totalH / rows;
    const out = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = Math.round(c * cellW), y = Math.round(r * cellH);
            const w = Math.min(totalW, Math.round((c + 1) * cellW)) - x;
            const h = Math.min(totalH, Math.round((r + 1) * cellH)) - y;
            // copyTo -> contiguous cell mask (findContours-safe; never read
            // pixel data straight off a roi() view)
            const roiView = mask.roi(new cv.Rect(x, y, w, h));
            const cellMask = new cv.Mat();
            roiView.copyTo(cellMask);
            roiView.delete();
            const contours = new cv.MatVector();
            const hier = new cv.Mat();
            cv.findContours(cellMask, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
            const entries = [];
            for (let k = 0; k < contours.size(); k++) {
                const b = cv.boundingRect(contours.get(k));
                if (b.width < 8 || b.height < 8) continue; // noise specks
                entries.push({ k, b });
            }
            // A neighboring sticker that slightly overflows its own cell
            // shows up here as a THIN strip clipped against this cell's
            // border. Real content (body, caption) is never both
            // edge-hugging AND thin, so treat such strips as intruders —
            // unless they are all this cell has.
            const isOverflowStrip = (b) =>
                ((b.y <= 1 || b.y + b.height >= h - 1) && b.height < cellH * 0.15) ||
                ((b.x <= 1 || b.x + b.width >= w - 1) && b.width < cellW * 0.15);
            const content = entries.filter((e) => !isOverflowStrip(e.b));
            const strips = entries.filter((e) => isOverflowStrip(e.b));
            const useBoxes = content.length > 0 ? content : entries;
            // Excluding a strip from the crop BOX is not enough: on real
            // sheets the intruder often overlaps the sticker's own caption
            // vertically, so it still lands inside the crop. Scrub its
            // pixels off the mask so they become transparent — the caller
            // merges the mask into the alpha channel AFTER this runs.
            if (content.length > 0 && strips.length > 0 && typeof cv.drawContours === 'function') {
                for (const e of strips) {
                    cv.drawContours(cellMask, contours, e.k, new cv.Scalar(0), -1);
                }
                const dstView = mask.roi(new cv.Rect(x, y, w, h));
                cellMask.copyTo(dstView);
                dstView.delete();
            }
            contours.delete(); hier.delete(); cellMask.delete();
            let bx1 = Infinity, by1 = Infinity, bx2 = -1, by2 = -1;
            for (const e of useBoxes) {
                const b = e.b;
                bx1 = Math.min(bx1, b.x); by1 = Math.min(by1, b.y);
                bx2 = Math.max(bx2, b.x + b.width); by2 = Math.max(by2, b.y + b.height);
            }
            if (bx2 > bx1 && bx2 - bx1 > 8 && by2 - by1 > 8) {
                out.push({ x: x + bx1, y: y + by1, width: bx2 - bx1, height: by2 - by1 });
            }
        }
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
// Builds the BROAD green-screen mask (HSV inRange) for an RGBA Mat. The
// wide band (hue 70°-170°, any moderately saturated green through teal) is
// deliberately permissive so DETECTION works on any green-screen shade —
// but it is far too greedy to use for the actual matte: dark-green or teal
// TEXT inside a sticker falls in this band and would turn transparent.
const greenMaskOf = (cv, srcRGBA) => {
    const rgb = new cv.Mat();
    cv.cvtColor(srcRGBA, rgb, cv.COLOR_RGBA2RGB);
    cv.cvtColor(rgb, rgb, cv.COLOR_RGB2HSV);
    const low = new cv.Mat(rgb.rows, rgb.cols, rgb.type(), [35, 40, 40, 0]);
    const high = new cv.Mat(rgb.rows, rgb.cols, rgb.type(), [85, 255, 255, 255]);
    const mask = new cv.Mat();
    cv.inRange(rgb, low, high, mask);
    low.delete(); high.delete(); rgb.delete();
    return mask;
};

// Builds the TIGHT matte mask: measures the actual chroma-key color as the
// MODE (largest histogram bin) of the broad mask's H/S/V values and keys
// only a narrow band around it. The mode, not the mean: greenish sticker
// CONTENT (dark-green or teal lettering, green props) also lands in the
// broad mask, and enough of it drags a mean far enough to swallow that
// very content — while the single most common color is always the flat,
// uniform key itself. Returns null when the broad mask is empty (caller
// keeps the broad mask).
const adaptiveGreenMask = (cv, srcRGBA, broadMask) => {
    const hsv = new cv.Mat();
    cv.cvtColor(srcRGBA, hsv, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
    // Coarse histogram over the mask, in JS (cv.mean's masked overload is
    // not reliably exported in this build; findNonZero isn't either). Both
    // mats are freshly allocated -> contiguous, so .data is safe to read.
    // Bins: H/4 (8° wide), S/16, V/16.
    const hd = hsv.data, md = broadMask.data;
    const bins = new Map();
    for (let i = 0; i < md.length; i += 4) { // every 4th pixel is plenty
        if (!md[i]) continue;
        const j = i * 3;
        const key = ((hd[j] >> 2) << 8) | ((hd[j + 1] >> 4) << 4) | (hd[j + 2] >> 4);
        let b = bins.get(key);
        if (!b) { b = { n: 0, h: 0, s: 0, v: 0 }; bins.set(key, b); }
        b.n++; b.h += hd[j]; b.s += hd[j + 1]; b.v += hd[j + 2];
    }
    let top = null;
    for (const b of bins.values()) if (!top || b.n > top.n) top = b;
    if (!top) { hsv.delete(); return null; }
    const h = top.h / top.n, s = top.s / top.n, v = top.v / top.n;
    const low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(),
        [Math.max(30, h - 12), Math.max(60, s - 90), Math.max(60, v - 90), 0]);
    const high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(),
        [Math.min(90, h + 12), 255, 255, 255]);
    const out = new cv.Mat();
    cv.inRange(hsv, low, high, out);
    low.delete(); high.delete(); hsv.delete();
    return out;
};

const sliceSheet = async ({ imageBitmap, rows, cols, targetW, targetH, padding, fit }) => {
    const cv = self.cv;

    const srcCanvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(imageBitmap, 0, 0);
    imageBitmap.close();
    let srcImgData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    let src = cv.matFromImageData(srcImgData); // RGBA

    // --- Robust background detection ------------------------------------
    // A single corner pixel is NOT a reliable probe: real user sheets often
    // carry a white or formerly-transparent margin (flattened to white on
    // upload), which made the old corner-sample pick WHITE as background —
    // green then counted as content and the whole sheet collapsed into one
    // giant green blob. Instead, measure how much of the WHOLE image is
    // green-screen-like; this app's sheets are green by design, so any
    // meaningful fraction means green mode.
    let mask = greenMaskOf(cv, src);
    const greenFraction = cv.countNonZero(mask) / (src.rows * src.cols);
    const isGreenBG = greenFraction > 0.15;

    if (isGreenBG) {
        // Crop to the green area's bounding box: trims white/transparent
        // margins around the sheet AND aligns the assumed grid to the real
        // sheet edges. Re-extract via ImageData (never read .data off a roi
        // view — see the stride note below).
        // (cv.findNonZero is not exported in this opencv.js build — derive
        // the bbox from the union of green-region contours instead.)
        const gc = new cv.MatVector();
        const gh = new cv.Mat();
        cv.findContours(mask, gc, gh, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        let bx1 = Infinity, by1 = Infinity, bx2 = -1, by2 = -1;
        for (let k = 0; k < gc.size(); k++) {
            const r0 = cv.boundingRect(gc.get(k));
            if (r0.width < 4 || r0.height < 4) continue;
            bx1 = Math.min(bx1, r0.x); by1 = Math.min(by1, r0.y);
            bx2 = Math.max(bx2, r0.x + r0.width); by2 = Math.max(by2, r0.y + r0.height);
        }
        gc.delete(); gh.delete();
        const bbox = bx2 > bx1
            ? { x: bx1, y: by1, width: bx2 - bx1, height: by2 - by1 }
            : { x: 0, y: 0, width: src.cols, height: src.rows };
        const needsCrop = bbox.width > 16 && bbox.height > 16 &&
            (bbox.x > 0 || bbox.y > 0 || bbox.width < src.cols || bbox.height < src.rows);
        if (needsCrop) {
            srcImgData = srcCtx.getImageData(bbox.x, bbox.y, bbox.width, bbox.height);
            src.delete(); mask.delete();
            src = cv.matFromImageData(srcImgData);
            mask = greenMaskOf(cv, src);
        }
        // Detection done — switch to the tight, measured-key matte so
        // greenish text/props inside stickers survive the keying.
        const tight = adaptiveGreenMask(cv, src, mask);
        if (tight) { mask.delete(); mask = tight; }
    } else {
        // Not a green sheet: generic solid-color mode. Sample all four
        // corners and use the color the MOST corners agree on (majority
        // vote) instead of trusting a single pixel.
        mask.delete();
        const cvt = new cv.Mat();
        cv.cvtColor(src, cvt, cv.COLOR_RGBA2RGB);
        const cornerAt = (row, col) => { const p = cvt.ucharPtr(row, col); return [p[0], p[1], p[2]]; };
        const corners = [
            cornerAt(0, 0), cornerAt(0, cvt.cols - 1),
            cornerAt(cvt.rows - 1, 0), cornerAt(cvt.rows - 1, cvt.cols - 1),
        ];
        const tol = 30;
        const close = (a, b) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
        let best = corners[0], bestVotes = -1;
        for (const c1 of corners) {
            const votes = corners.filter((c2) => close(c1, c2)).length;
            if (votes > bestVotes) { bestVotes = votes; best = c1; }
        }
        const [bgR, bgG, bgB] = best;
        const low = new cv.Mat(cvt.rows, cvt.cols, cvt.type(), [Math.max(0, bgR - tol), Math.max(0, bgG - tol), Math.max(0, bgB - tol), 0]);
        const high = new cv.Mat(cvt.rows, cvt.cols, cvt.type(), [Math.min(255, bgR + tol), Math.min(255, bgG + tol), Math.min(255, bgB + tol), 255]);
        mask = new cv.Mat();
        cv.inRange(cvt, low, high, mask);
        low.delete(); high.delete(); cvt.delete();
    }

    cv.bitwise_not(mask, mask);

    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);

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
        console.warn('[Slicer] Gap clustering did not resolve cleanly; slicing by the known grid instead.');
        finalRects = cellwiseRects(cv, mask, rows, cols);
    }

    // Merge the mask into src's alpha channel only NOW: cellwiseRects may
    // have scrubbed neighbor-overflow strips off the mask, and those pixels
    // must end up transparent in the crops.
    const rgbaPlanes = new cv.MatVector();
    cv.split(src, rgbaPlanes);
    const rP = rgbaPlanes.get(0);
    const gP = rgbaPlanes.get(1);
    const bP = rgbaPlanes.get(2);
    const resultPlanes = new cv.MatVector();
    resultPlanes.push_back(rP); resultPlanes.push_back(gP); resultPlanes.push_back(bP);
    resultPlanes.push_back(mask);
    cv.merge(resultPlanes, src);
    rP.delete(); gP.delete(); bP.delete(); rgbaPlanes.delete(); resultPlanes.delete();

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

    src.delete(); mask.delete(); kernel.delete();
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
