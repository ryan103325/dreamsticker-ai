
import JSZip from 'jszip';
import { FontConfig, StickerPackageInfo, ArtisticFilterType } from '../types';

const WORKER_SCRIPT = `
// --- 核心距離計算函數 ---

// 歐幾里德距離 (用於計算 RGB 空間中的顏色差異)
const colorDistance = (r1, g1, b1, r2, g2, b2) => {
    return Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2));
};

const hexToRgb = (hex) => {
    const result = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
};

// 1. HSV 判斷邏輯（已調整：加入綠色通道純度檢查）
const isPixelBackgroundHSVHard = (r, g, b, tolerancePercent) => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let hue = 0;
    if (delta !== 0) {
        if (max === g) hue = 60 * ((b - r) / delta + 2);
        else if (max === r) hue = 60 * ((g - b) / delta + 4);
        else hue = 60 * ((r - g) / delta);
    }
    if (hue < 0) hue += 360;

    const saturation = max === 0 ? 0 : delta / max;
    const value = max / 255;
    
    const toleranceFactor = tolerancePercent / 100;
    
    // --- 綠幕去背的強制條件 ---
    
    // 🌟 關鍵調整 1: 綠色通道純度檢查 (防止誤殺藍色/紅色)
    // 綠色通道必須明顯高於紅藍通道。容許度越高，純度要求越低。
    const greenPurityMultiplier = 1.1 * (1 - toleranceFactor * 0.5); 
    const isGreenDominant = (g > r * greenPurityMultiplier) && (g > b * greenPurityMultiplier);

    if (!isGreenDominant) {
        return false; 
    }

    // 關鍵調整 2: HSV 門檻檢查
    const isGreenHue = (hue >= 50 && hue <= 190); // 放寬一點綠色色相範圍
    
    const baseSat = 0.4; // 稍微降低飽和度要求
    const baseVal = 0.3; 

    const minSat = Math.max(0.1, baseSat * (1 - toleranceFactor)); 
    const minVal = Math.max(0.1, baseVal * (1 - toleranceFactor));
    
    const isStandardGreenScreen = isGreenHue && saturation >= minSat && value >= minVal;
    
    // 額外判斷綠色是否明顯佔優勢 (防止前景的淺色被誤判)
    const isDominantGreen = (g > r + 20) && (g > b + 20) && (g > 60);

    return isStandardGreenScreen || isDominantGreen;
};

// 2. 連通去背 (Flood Fill) 邏輯 - HARD EDGE 模式
const removeBgFloodFill = (imgData, w, h, targetHex, tolerancePercent) => {
    const data = imgData.data;
    const isGreenScreen = targetHex.toLowerCase() === '#00ff00';
    const targetRgb = isGreenScreen ? null : hexToRgb(targetHex) || {r:0, g:0, b:0};
    const maxDist = 442;
    const toleranceDist = maxDist * (tolerancePercent / 100);

    const isBackground = (r, g, b) => {
        if (isGreenScreen) {
            return isPixelBackgroundHSVHard(r, g, b, tolerancePercent);
        } else {
            const distance = colorDistance(r, g, b, targetRgb.r, targetRgb.g, targetRgb.b);
            return distance <= toleranceDist;
        }
    };
    
    // 從四個角落開始向內填充，以處理外圍背景
    // 使用 Int32Array 優化 stack 效能 (儲存索引而非 [x,y])
    const stack = [];
    const visited = new Uint8Array(w*h);
    
    // Add corners
    const addPixel = (x, y) => {
        if (x >= 0 && x < w && y >= 0 && y < h) {
            stack.push(y * w + x);
        }
    };

    addPixel(0, 0);
    addPixel(w-1, 0);
    addPixel(0, h-1);
    addPixel(w-1, h-1);
    
    // 針對寬圖，多加幾個邊緣點以防角落被遮擋
    for(let x=0; x<w; x+=10) { addPixel(x, 0); addPixel(x, h-1); }
    for(let y=0; y<h; y+=10) { addPixel(0, y); addPixel(w-1, y); }

    while(stack.length) {
        const offset = stack.pop();
        if (visited[offset]) continue;
        visited[offset] = 1;

        const idx = offset * 4;
        const r = data[idx];
        const g = data[idx+1];
        const b = data[idx+2];
        
        if (isBackground(r, g, b)) {
            data[idx+3] = 0; // Set Alpha to 0
            
            const x = offset % w;
            const y = Math.floor(offset / w);

            // Push neighbors
            if (x > 0 && !visited[offset - 1]) stack.push(offset - 1);
            if (x < w - 1 && !visited[offset + 1]) stack.push(offset + 1);
            if (y > 0 && !visited[offset - w]) stack.push(offset - w);
            if (y < h - 1 && !visited[offset + w]) stack.push(offset + w);
        }
    }
    return imgData;
};

// 3. 侵蝕濾鏡 (Erosion) - 消除綠邊
const applyErosion = (imgData, w, h, strength) => {
    if (strength <= 0) return imgData;

    const data = imgData.data;
    // 為了效能，只做簡單的 Alpha 通道侵蝕
    for (let k = 0; k < strength; k++) {
        const currentAlpha = new Uint8Array(w * h);
        for(let i=0; i<w*h; i++) currentAlpha[i] = data[i*4+3];

        for (let y = 1; y < h-1; y++) {
            for (let x = 1; x < w-1; x++) {
                const idx = y*w + x;
                
                // 如果目前像素不透明，但鄰居有透明的，則把自己變透明 (侵蝕)
                if (currentAlpha[idx] > 0) {
                    if (currentAlpha[idx-1] === 0 || currentAlpha[idx+1] === 0 || 
                        currentAlpha[idx-w] === 0 || currentAlpha[idx+w] === 0) {
                        data[idx*4+3] = 0; 
                    }
                }
            }
        }
    }
    return imgData;
};

// Main Worker Logic
self.onmessage = function(e) {
    const { id, rawImageData, removalMode, targetColorHex, colorTolerance, erodeStrength, width, height } = e.data;
    
    let processedImageData = rawImageData; 
    
    // 預設使用 Flood Fill 模式，因為這是貼圖最需要的 (保護內部細節)
    if (removalMode === 'flood' || true) {
        processedImageData = removeBgFloodFill(processedImageData, width, height, targetColorHex || '#00ff00', colorTolerance || 20);
    }
    
    // 執行邊緣侵蝕
    if (erodeStrength > 0) {
        processedImageData = applyErosion(processedImageData, width, height, erodeStrength);
    }
    
    // 將結果傳回主執行緒
    self.postMessage({ id: id, processedImageData: processedImageData, width, height }, [processedImageData.data.buffer]);
};
`;

const getWorker = () => {
    const blob = new Blob([WORKER_SCRIPT], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
};

export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const stripMimeType = (dataUrl: string) => dataUrl.replace(/^data:image\/\w+;base64,/, "");
export const getMimeType = (dataUrl: string) => {
    const match = dataUrl.match(/^data:(image\/\w+);base64,/);
    return match ? match[1] : 'image/png';
};

export const blobToDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(blob);
    });
};

export const resizeImage = (dataUrl: string, maxWidth: number): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            let w = img.width, h = img.height;
            if (w > maxWidth) { h = Math.round(h * (maxWidth / w)); w = maxWidth; }
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.9));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
};

export const applyColorFilter = async (imageUrl: string, filter: ArtisticFilterType): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(imageUrl); return; }

            // Draw original
            if (filter === 'VINTAGE') {
                ctx.filter = 'sepia(0.8) contrast(1.2)';
            } else if (filter === 'GRAYSCALE') {
                ctx.filter = 'grayscale(100%)';
            }

            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(imageUrl);
        img.src = imageUrl;
    });
};

/**
 * Updated to use the new Advanced Worker logic for Magic Edit cleanup.
 */
export const processGreenScreenImage = async (imageUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error("Canvas context failed")); return; }
            ctx.drawImage(img, 0, 0);
            const worker = getWorker();
            const rawData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            const timeoutId = setTimeout(() => {
                worker.terminate();
                reject(new Error("Processing timed out"));
            }, 10000);

            worker.onmessage = (e) => {
                clearTimeout(timeoutId);
                const { processedImageData, width, height } = e.data;
                const newCanvas = document.createElement('canvas');
                newCanvas.width = width; newCanvas.height = height;
                const nCtx = newCanvas.getContext('2d');
                nCtx?.putImageData(processedImageData, 0, 0);
                worker.terminate(); resolve(newCanvas.toDataURL('image/png'));
            };

            // Using stronger settings for cleanup
            worker.postMessage({
                rawImageData: rawData,
                id: 0,
                width: canvas.width,
                height: canvas.height,
                removalMode: 'flood',
                targetColorHex: '#00FF00',
                colorTolerance: 18,
                erodeStrength: 1
            }, [rawData.data.buffer]);
        };
        img.onerror = reject; img.src = imageUrl;
    });
};

export const getFontFamily = (fontStyle: string, customFont?: string): string => {
    if (fontStyle.includes("Custom") && customFont) return customFont;
    if (fontStyle.includes("DotGothic16")) return 'DotGothic16, sans-serif';
    if (fontStyle.includes("Hachi Maru Pop")) return 'Hachi Maru Pop, cursive';
    if (fontStyle.includes("Reggae One")) return 'Reggae One, cursive';
    if (fontStyle.includes("Yusei Magic")) return 'Yusei Magic, sans-serif';
    if (fontStyle.includes("Zen Maru Gothic")) return 'Zen Maru Gothic, sans-serif';
    if (fontStyle.includes("Bangers")) return 'Bangers, cursive';
    if (fontStyle.includes("Patrick Hand")) return 'Patrick Hand, cursive';
    if (fontStyle.includes("Fredoka One")) return 'Fredoka One, cursive';
    if (fontStyle.includes("Rampart One")) return 'Rampart One, cursive';
    return 'Noto Sans TC, sans-serif';
};

// 96x74 Tab Image Generator (Standalone)
export const generateTabImage = async (sourceUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 96; canvas.height = 74;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error("Canvas context failed"));

            // Smart Fit: Emojis are 180x180 (Square), Tab is 96x74
            // Center and Scale to fit Height or Width (Contain)
            const scale = Math.min(96 / img.width, 74 / img.height);
            const w = img.width * scale;
            const h = img.height * scale;

            ctx.drawImage(img, (96 - w) / 2, (74 - h) / 2, w, h);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = sourceUrl;
    });
};

export const generateFrameZip = async (stickers: any[], zipName: string, mainStickerUrl?: string, packageInfo?: StickerPackageInfo, type: 'STATIC' | 'EMOJI' = 'STATIC') => {
    const zip = new JSZip();
    const folder = zip.folder(zipName) || zip;
    const getBlob = async (url: string) => (await fetch(url)).blob();

    // 1. Add Stickers
    let idx = 1;
    for (const sticker of stickers) {
        // EMOJI: 001.png (3 digits). STICKER: 01.png (2 digits) or just 1.png
        const pad = type === 'EMOJI' ? 3 : 2;
        const fileName = `${idx.toString().padStart(pad, '0')}`;
        folder.file(`${fileName}.png`, await getBlob(sticker.url));
        idx++;
    }

    // 2. Add Main/Tab Images
    const mainRefUrl = mainStickerUrl || (stickers.length > 0 ? stickers[0].url : null);
    if (mainRefUrl) {
        try {
            const img = new Image(); img.src = mainRefUrl; await new Promise(r => img.onload = r);

            // STICKER TYPE: Needs main.png (240x240) AND tab.png (96x74)
            if (type === 'STATIC') {
                const mainCanvas = document.createElement('canvas'); mainCanvas.width = 240; mainCanvas.height = 240;
                const ctxM = mainCanvas.getContext('2d');
                if (ctxM) {
                    const scale = Math.min(240 / img.width, 240 / img.height);
                    const w = img.width * scale, h = img.height * scale;
                    ctxM.drawImage(img, (240 - w) / 2, (240 - h) / 2, w, h);
                    folder.file('main.png', await new Promise<Blob>(r => mainCanvas.toBlob(b => r(b!))));
                }
            }

            // BOTH TYPES: Need tab.png (96x74)
            const tabCanvas = document.createElement('canvas'); tabCanvas.width = 96; tabCanvas.height = 74;
            const ctxT = tabCanvas.getContext('2d');
            if (ctxT) {
                const scaleT = Math.min(96 / img.width, 74 / img.height);
                const wT = img.width * scaleT, hT = img.height * scaleT;
                ctxT.drawImage(img, (96 - wT) / 2, (74 - hT) / 2, wT, hT);
                folder.file('tab.png', await new Promise<Blob>(r => tabCanvas.toBlob(b => r(b!))));
            }
        } catch (e) { console.error("Icon generation failed", e); }
    }

    // 3. Metadata
    if (packageInfo) {
        const content = `[Sticker Info]\nTitle: ${packageInfo.title.zh}\nDesc: ${packageInfo.description.zh}`;
        folder.file('info.txt', content);
    }

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a'); a.href = url; a.download = `${zipName}.zip`; a.click();
};

export const extractDominantColors = (imageUrl: string): Promise<string[]> => {
    return new Promise((resolve) => {
        const img = new Image(); img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100;
            const ctx = canvas.getContext('2d'); if (!ctx) return resolve([]);
            ctx.drawImage(img, 0, 0, 100, 100);
            const data = ctx.getImageData(0, 0, 100, 100).data;
            const colorCounts: { [key: string]: number } = {};
            for (let i = 0; i < data.length; i += 16) {
                const r = Math.round(data[i] / 20) * 20, g = Math.round(data[i + 1] / 20) * 20, b = Math.round(data[i + 2] / 20) * 20;
                const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
                colorCounts[hex] = (colorCounts[hex] || 0) + 1;
            }
            resolve(Object.entries(colorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]));
        };
        img.onerror = () => resolve([]); img.src = imageUrl;
    });
};
