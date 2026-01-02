
/**
 * OpenCV Service for Green Screen Auto-Slicing
 * Uses OpenCV.js to detect green background, find contours, and slice characters.
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

/**
 * Main function to process a sheet using SEQUENTIAL DYNAMIC GRID SLICING.
 * 
 * Algorithm:
 * 1. Smart Background Masking (Supports Green/White/Blue).
 * 2. Sequential Row Slicing: Find cutY for row i based on startY of row i.
 * 3. Sequential Col Slicing: Find cutX for col j based on startX of col j.
 * 4. Cell Extraction: Crop -> Trim (Contour) -> Resize to Target.
 * 
 * @param imageUrl Source Image Data URL
 * @param rows Number of rows in the grid
 * @param cols Number of columns in the grid
 * @param targetW Output width per sticker (e.g., 370 or 320)
 * @param targetH Output height per sticker (e.g., 320 or 270)
 */
export const processGreenScreenAndSlice = async (
    imageUrl: string,
    rows: number,
    cols: number,
    targetW: number,
    targetH: number,
    padding: number = 2 // Default to 2 for stickers
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
                // Sample corners to find dominant BG color.
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

                    // Wide Green Range
                    const low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [35, 40, 40, 0]);
                    const high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [85, 255, 255, 255]);
                    cv.inRange(hsv, low, high, mask);

                    low.delete(); high.delete(); hsv.delete();
                } else {
                    // --- GENERIC SOLID COLOR MODE (Color Difference) ---
                    const tol = 30; // Tolerance
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

                // === SEQUENTIAL DYNAMIC GRID SLICING ===

                const slicedImages: string[] = [];
                // Use parameter PADDING

                let currentY = 0;
                // Use source dimensions for calculation
                const totalH = src.rows;
                const totalW = src.cols;

                // Estimated average height/width (Guide only)
                const avgH = totalH / rows;
                const avgW = totalW / cols;

                for (let r = 0; r < rows; r++) {
                    let cutY = totalH; // Default to bottom for last row

                    // 1. Find Horizontal Cut (Bottom of this row)
                    if (r < rows - 1) {
                        const targetY = currentY + avgH;
                        const searchRange = avgH * 0.25; // Search +/- 25%

                        const startY = Math.max(currentY + 10, Math.floor(targetY - searchRange));
                        const endY = Math.min(totalH - 1, Math.floor(targetY + searchRange));

                        let bestY = Math.floor(targetY);
                        let minPixels = Number.MAX_VALUE;

                        // Scan logic: Find the line with minimum content pixels
                        for (let y = startY; y <= endY; y++) {
                            const rowVec = mask.row(y);
                            const count = cv.countNonZero(rowVec);
                            rowVec.delete();

                            // If perfect green line found, take it immediately
                            if (count === 0) {
                                bestY = y;
                                break;
                            }

                            if (count < minPixels) {
                                minPixels = count;
                                bestY = y;
                            }
                        }
                        cutY = bestY;
                    }

                    const h = cutY - currentY;

                    // If row is valid height
                    if (h > 10) {
                        // 2. Define Row ROI
                        const rowRect = new cv.Rect(0, currentY, totalW, h);
                        // Ensure bounds
                        if (rowRect.y + rowRect.height > totalH) rowRect.height = totalH - rowRect.y;

                        const rowMask = mask.roi(rowRect);

                        let currentX = 0;

                        for (let c = 0; c < cols; c++) {
                            let cutX = totalW; // Default to right edge for last col

                            // 3. Find Vertical Cut (Right of this cell)
                            if (c < cols - 1) {
                                const targetX = currentX + avgW;
                                const searchRangeX = avgW * 0.25;

                                const startX = Math.max(currentX + 10, Math.floor(targetX - searchRangeX));
                                const endX = Math.min(totalW - 1, Math.floor(targetX + searchRangeX));

                                let bestX = Math.floor(targetX);
                                let minPixelsX = Number.MAX_VALUE;

                                for (let x = startX; x <= endX; x++) {
                                    const colVec = rowMask.col(x); // x is relative to rowMask (which is 0..totalW)
                                    const count = cv.countNonZero(colVec);
                                    colVec.delete();

                                    if (count === 0) {
                                        bestX = x;
                                        break;
                                    }
                                    if (count < minPixelsX) {
                                        minPixelsX = count;
                                        bestX = x;
                                    }
                                }
                                cutX = bestX;
                            }

                            const w = cutX - currentX;

                            // 4. Extract Cell & Trim
                            if (w > 10) {
                                // Cell ROI relative to Row ROI
                                const cellRectRel = new cv.Rect(currentX, 0, w, h);
                                // Safety clamp
                                if (cellRectRel.x + cellRectRel.width > totalW) cellRectRel.width = totalW - cellRectRel.x;

                                const cellMask = rowMask.roi(cellRectRel);

                                // Find contours inside this cell to trim borders
                                const contours = new cv.MatVector();
                                const hierarchy = new cv.Mat();
                                cv.findContours(cellMask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

                                let tightRect: any = null;

                                for (let k = 0; k < contours.size(); ++k) {
                                    const rect = cv.boundingRect(contours.get(k));
                                    if (rect.width < 5 || rect.height < 5) continue;

                                    if (!tightRect) {
                                        tightRect = rect;
                                    } else {
                                        const tx1 = Math.min(tightRect.x, rect.x);
                                        const ty1 = Math.min(tightRect.y, rect.y);
                                        const tx2 = Math.max(tightRect.x + tightRect.width, rect.x + rect.width);
                                        const ty2 = Math.max(tightRect.y + tightRect.height, rect.y + rect.height);
                                        tightRect = { x: tx1, y: ty1, width: tx2 - tx1, height: ty2 - ty1 };
                                    }
                                }

                                cellMask.delete(); contours.delete(); hierarchy.delete();

                                // 5. Resize & Fit (CENTERING & ASPECT RATIO)
                                if (tightRect) {
                                    // Convert tightRect (Cell-Relative) to Absolute Coords
                                    const absRect = new cv.Rect(
                                        currentX + tightRect.x,
                                        currentY + tightRect.y,
                                        tightRect.width,
                                        tightRect.height
                                    );

                                    // Extract from Original Source (with Alpha)
                                    const finalRoi = src.roi(absRect);

                                    // --- 🌟 ADDED: Enhanced Soft Edge / Anti-Aliasing Logic ---
                                    // To remove jagged edges, we apply a Gaussian Blur ONLY to the Alpha Channel.
                                    const channels = new cv.MatVector();
                                    cv.split(finalRoi, channels);

                                    // Index 3 is Alpha
                                    const alphaChannel = channels.get(3);

                                    // Use a 5x5 kernel for stronger smoothing (Enhanced Soft Edge)
                                    const ksize = new cv.Size(5, 5);
                                    cv.GaussianBlur(alphaChannel, alphaChannel, ksize, 0, 0);

                                    // Merge back
                                    channels.set(3, alphaChannel);
                                    cv.merge(channels, finalRoi);

                                    // Clean up Mat objects
                                    alphaChannel.delete();
                                    channels.delete();
                                    // --------------------------------------------------

                                    const tempCanvas = document.createElement('canvas');
                                    tempCanvas.width = absRect.width;
                                    tempCanvas.height = absRect.height;
                                    cv.imshow(tempCanvas, finalRoi);

                                    const cellCanvas = document.createElement('canvas');
                                    cellCanvas.width = targetW;
                                    cellCanvas.height = targetH;
                                    const ctx = cellCanvas.getContext('2d');

                                    if (ctx) {
                                        const availableW = targetW - (padding * 2);
                                        const availableH = targetH - (padding * 2);

                                        // Calculate Scale - UPDATED: Support for 'COVER' mode for Emojis
                                        let scale;
                                        if (padding === 0) {
                                            // EMOJI MODE: COVER Logic (Full Bleed)
                                            // We want to fill the entire 180x180 square.
                                            // Use Math.max to ensure the image covers the target dimension.
                                            // This might crop top/bottom or sides if aspect ratio doesn't match perfectly.
                                            scale = Math.max(availableW / absRect.width, availableH / absRect.height);
                                        } else {
                                            // STICKER MODE: CONTAIN Logic (Padding Preserved)
                                            // Fit entirely within the box with padding.
                                            scale = Math.min(availableW / absRect.width, availableH / absRect.height);
                                        }

                                        const drawW = absRect.width * scale;
                                        const drawH = absRect.height * scale;

                                        // Center alignment calculation
                                        const drawX = (targetW - drawW) / 2;
                                        const drawY = (targetH - drawH) / 2;

                                        ctx.drawImage(tempCanvas, 0, 0, absRect.width, absRect.height, drawX, drawY, drawW, drawH);
                                        slicedImages.push(cellCanvas.toDataURL('image/png'));
                                    }
                                    finalRoi.delete();
                                } else {
                                    // Handle empty cell if needed? For now we skip.
                                }
                            }

                            // Advance X
                            currentX = cutX;
                        }

                        rowMask.delete();
                    }

                    // Advance Y
                    currentY = cutY;
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
        img.onerror = (e) => reject(new Error("Failed to load image for OpenCV processing"));
        img.src = imageUrl;
    });
};
