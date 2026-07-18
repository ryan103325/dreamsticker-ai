import { test, expect } from '@playwright/test';

/**
 * End-to-end slicing regression: upload a synthetic green-screen sheet,
 * wait for the self-hosted OpenCV.js (running in a Web Worker — see
 * src/services/opencvService.ts) to initialize, auto-slice, and land on the
 * results page. Exercises the whole no-API-key half of the pipeline
 * (upload -> sheet editor -> worker init -> contour slicing -> results
 * grid) and confirms the main thread stays responsive throughout (the
 * "Page Unresponsive" bug this architecture fixes).
 */

test('upload-sheet flow slices a green-screen grid without any API calls', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/');
    await page.getByPlaceholder(/API KEY/i).fill('test-key-1234567890');
    await page.getByRole('button', { name: /開始創作/ }).click();

    await page.getByRole('heading', { name: '上傳底圖' }).click();

    // Synthesize a 4x2 sheet: 8 colored circles on pure #00FF00
    const base64 = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 1480; c.height = 640;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#00FF00';
        ctx.fillRect(0, 0, 1480, 640);
        // Avoid any hue in ~70-170° (cyan/teal/green): the slicer's HSV mask
        // deliberately covers that broad range to catch varied green-screen
        // shades, so a test color landing in it gets masked out as background.
        const colors = ['#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#c0392b', '#e67e22', '#2c3e50', '#d35400'];
        for (let r = 0; r < 2; r++) {
            for (let col = 0; col < 4; col++) {
                ctx.fillStyle = colors[r * 4 + col];
                ctx.beginPath();
                ctx.arc(col * 370 + 185, r * 320 + 160, 100, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        return c.toDataURL('image/png').split(',')[1];
    });
    await page.locator('input[type=file]').last().setInputFiles({
        name: 'sheet.png',
        mimeType: 'image/png',
        buffer: Buffer.from(base64, 'base64'),
    });

    // Sheet editor: magic edit is clickable immediately (proves the main
    // thread is NOT blocked while OpenCV initializes in its worker).
    await expect(page.getByRole('button', { name: /魔法修復/ })).toBeEnabled();

    const sliceButton = page.getByRole('button', { name: /綠幕自動切割/ });
    await expect(sliceButton).toBeVisible({ timeout: 60_000 });

    await sliceButton.click();

    // Results page shows the 8 sliced stickers
    await expect(page.getByText(/貼圖完成/)).toBeVisible({ timeout: 60_000 });
    const cards = page.locator('main img');
    await expect
        .poll(async () => cards.count(), { timeout: 15_000 })
        .toBeGreaterThanOrEqual(8);
});

test('sliced sticker pixels are correct, not corrupted (regression for the ROI-stride bug)', async ({ page }) => {
    test.setTimeout(120_000);

    // Tight ~30px gaps matching the app's own documented minimum spec
    // ("at least 30px green river" — see geminiService.ts) on a REAL
    // 16-qty LINE_STICKER layout (cellW=370, cellH=320). A roi() crop that
    // isn't read back correctly (the bug this test guards against) produces
    // a "TV static" horizontal-banding artifact instead of the solid fill.
    await page.goto('/');
    await page.getByPlaceholder(/API KEY/i).fill('test-key-1234567890');
    await page.getByRole('button', { name: /開始創作/ }).click();
    await page.getByRole('heading', { name: '上傳底圖' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '16', exact: true }).click();

    const base64 = await page.evaluate(() => {
        const cellW = 370, cellH = 320, cols = 4, rows = 4, margin = 15;
        const c = document.createElement('canvas');
        c.width = cellW * cols; c.height = cellH * rows;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#00FF00';
        ctx.fillRect(0, 0, c.width, c.height);
        // Cell 0: solid red with a white outline stroke (mimics a real
        // sticker's thick white border).
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(margin, margin, cellW - margin * 2, cellH - margin * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 8;
        ctx.strokeRect(margin + 4, margin + 4, cellW - margin * 2 - 8, cellH - margin * 2 - 8);
        // Fill the remaining 15 cells with distinct non-green colors so the
        // grid still resolves to 16 separate stickers.
        const colors = ['#3498db', '#f39c12', '#9b59b6', '#c0392b', '#e67e22', '#2c3e50', '#d35400',
                         '#8e44ad', '#2980b9', '#c0392b', '#e67e22', '#7f8c8d', '#d35400', '#e74c3c', '#3498db'];
        let ci = 0;
        for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
            if (r === 0 && col === 0) continue; // already drawn above
            ctx.fillStyle = colors[ci++];
            ctx.fillRect(col * cellW + margin, r * cellH + margin, cellW - margin * 2, cellH - margin * 2);
        }
        return c.toDataURL('image/png').split(',')[1];
    });
    await page.locator('input[type=file]').last().setInputFiles({
        name: 'sheet.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64'),
    });

    const sliceButton = page.getByRole('button', { name: /綠幕自動切割/ });
    await sliceButton.waitFor({ state: 'visible', timeout: 60_000 });
    await sliceButton.click();
    await expect(page.getByText(/貼圖完成/)).toBeVisible({ timeout: 60_000 });

    const cards = page.locator('main img');
    await expect.poll(async () => cards.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(16);

    // Decode the first (red) sticker and verify its center pixel is
    // actually red -- a corrupted crop would show scrambled/off-color noise.
    const pixel = await page.evaluate(async () => {
        const img = document.querySelector('main img') as HTMLImageElement;
        const bitmap = await createImageBitmap(img);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        const d = ctx.getImageData(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2), 1, 1).data;
        return { r: d[0], g: d[1], b: d[2], a: d[3] };
    });

    // #e74c3c = rgb(231, 76, 60). Allow generous tolerance for the
    // alpha-edge blur / despill / resampling pipeline, but corrupted
    // "static" pixels would be wildly random, not close to red.
    expect(pixel.r).toBeGreaterThan(150);
    expect(pixel.g).toBeLessThan(150);
    expect(pixel.b).toBeLessThan(150);
    expect(pixel.a).toBeGreaterThan(100);
});

test('sheet with a white margin still slices correctly (regression for corner-pixel background detection)', async ({ page }) => {
    test.setTimeout(120_000);

    // Real user sheets often carry a white (or flattened-transparent) margin
    // around the green area. The old single-corner-pixel background probe
    // then picked WHITE as background, green became "content", and the whole
    // sheet collapsed into ONE sticker with the green screen still visible.
    await page.goto('/');
    await page.getByPlaceholder(/API KEY/i).fill('test-key-1234567890');
    await page.getByRole('button', { name: /開始創作/ }).click();
    await page.getByRole('heading', { name: '上傳底圖' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '16', exact: true }).click();

    const base64 = await page.evaluate(() => {
        const cols = 4, rows = 4, cellW = 370, cellH = 320, margin = 16;
        const c = document.createElement('canvas');
        c.width = cellW * cols + margin * 2;
        c.height = cellH * rows + margin * 2;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#ffffff'; // white frame around the green sheet
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = '#00FF00';
        ctx.fillRect(margin, margin, cellW * cols, cellH * rows);
        const colors = ['#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#c0392b', '#e67e22', '#2c3e50', '#d35400',
                        '#8e44ad', '#2980b9', '#b03a2e', '#ca6f1e', '#7f8c8d', '#a04000', '#cb4335', '#2471a3'];
        for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
            ctx.fillStyle = colors[r * cols + col];
            ctx.fillRect(margin + col * cellW + 15, margin + r * cellH + 15, cellW - 30, cellH - 30);
        }
        return c.toDataURL('image/png').split(',')[1];
    });
    await page.locator('input[type=file]').last().setInputFiles({
        name: 'sheet.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64'),
    });

    const sliceButton = page.getByRole('button', { name: /綠幕自動切割/ });
    await expect(sliceButton).toBeVisible({ timeout: 60_000 });
    await sliceButton.click();
    await expect(page.getByText(/貼圖完成/)).toBeVisible({ timeout: 60_000 });

    const cards = page.locator('main img');
    await expect.poll(async () => cards.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(16);

    // No residual green: sample the first sticker and count green pixels
    const greenPct = await page.evaluate(async () => {
        const img = document.querySelector('main img') as HTMLImageElement;
        const bmp = await createImageBitmap(img);
        const c2 = document.createElement('canvas');
        c2.width = bmp.width; c2.height = bmp.height;
        const cx2 = c2.getContext('2d')!;
        cx2.drawImage(bmp, 0, 0);
        const d = cx2.getImageData(0, 0, bmp.width, bmp.height).data;
        let green = 0, total = 0;
        for (let i = 0; i < d.length; i += 16) {
            total++;
            if (d[i + 3] > 200 && d[i + 1] > 180 && d[i] < 120 && d[i + 2] < 120) green++;
        }
        return Math.round((green / total) * 100);
    });
    expect(greenPct).toBeLessThan(3);
});

test('tightly-packed sheet with touching neighbors still yields every cell (cell-grid fallback)', async ({ page }) => {
    test.setTimeout(120_000);

    // Mimics real hand-packed sheets (like the user's pig sheet): stickers
    // fill their cells edge-to-edge so neighboring white outlines TOUCH,
    // fusing into one connected component. Contour clustering cannot split
    // that; the cell-grid fallback must still produce one sticker per cell.
    await page.goto('/');
    await page.getByPlaceholder(/API KEY/i).fill('test-key-1234567890');
    await page.getByRole('button', { name: /開始創作/ }).click();
    await page.getByRole('heading', { name: '上傳底圖' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '16', exact: true }).click();

    const base64 = await page.evaluate(() => {
        const cols = 4, rows = 4, cellW = 370, cellH = 320;
        const c = document.createElement('canvas');
        c.width = cellW * cols; c.height = cellH * rows;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#00FF00';
        ctx.fillRect(0, 0, c.width, c.height);
        const colors = ['#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#c0392b', '#e67e22', '#2c3e50', '#d35400',
                        '#8e44ad', '#2980b9', '#b03a2e', '#ca6f1e', '#7f8c8d', '#a04000', '#cb4335', '#2471a3'];
        for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
            const x = col * cellW, y = r * cellH;
            // white outline fills the WHOLE cell -> touches all neighbors
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
            ctx.fillStyle = colors[r * cols + col];
            ctx.fillRect(x + 14, y + 14, cellW - 28, cellH - 28);
        }
        return c.toDataURL('image/png').split(',')[1];
    });
    await page.locator('input[type=file]').last().setInputFiles({
        name: 'sheet.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64'),
    });

    const sliceButton = page.getByRole('button', { name: /綠幕自動切割/ });
    await expect(sliceButton).toBeVisible({ timeout: 60_000 });
    await sliceButton.click();
    await expect(page.getByText(/貼圖完成/)).toBeVisible({ timeout: 60_000 });

    const cards = page.locator('main img');
    await expect.poll(async () => cards.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(16);
});

test('40-sticker (5x8) tightly-packed sheet slices into all 40 cells', async ({ page }) => {
    test.setTimeout(120_000);

    // Reproduces a real user report: a 40-qty golden-retriever sheet (5 cols
    // x 8 rows per STICKER_SPECS[40]) with captions and outlines packed so
    // tight that contour clustering collapsed it into 6 mis-cropped pieces.
    // The cell-grid fallback must yield one correctly-placed crop per cell.
    await page.goto('/');
    await page.getByPlaceholder(/API KEY/i).fill('test-key-1234567890');
    await page.getByRole('button', { name: /開始創作/ }).click();
    await page.getByRole('heading', { name: '上傳底圖' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '40', exact: true }).click();

    const base64 = await page.evaluate(() => {
        const cols = 5, rows = 8, cellW = 370, cellH = 320;
        const c = document.createElement('canvas');
        c.width = cellW * cols; c.height = cellH * rows;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#00FF00';
        ctx.fillRect(0, 0, c.width, c.height);
        for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
            const x = col * cellW, y = r * cellH;
            // caption blob at the top + character body below, both with
            // outlines that reach the cell edge (touching the neighbors)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
            ctx.fillStyle = '#2c3e50';
            ctx.fillRect(x + 20, y + 12, cellW - 40, 60);           // caption text
            ctx.fillStyle = `hsl(${(r * cols + col) * 9}, 70%, 55%)`;
            ctx.beginPath();
            ctx.arc(x + cellW / 2, y + cellH / 2 + 40, 90, 0, Math.PI * 2); // body
            ctx.fill();
        }
        return c.toDataURL('image/png').split(',')[1];
    });
    await page.locator('input[type=file]').last().setInputFiles({
        name: 'sheet.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64'),
    });

    const sliceButton = page.getByRole('button', { name: /綠幕自動切割/ });
    await expect(sliceButton).toBeVisible({ timeout: 60_000 });
    await sliceButton.click();
    await expect(page.getByText(/貼圖完成/)).toBeVisible({ timeout: 60_000 });

    const cards = page.locator('main img');
    await expect.poll(async () => cards.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(40);
});

test('main thread stays responsive while OpenCV initializes (no Page Unresponsive freeze)', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/');
    await page.getByPlaceholder(/API KEY/i).fill('test-key-1234567890');
    await page.getByRole('button', { name: /開始創作/ }).click();
    await page.getByRole('heading', { name: '上傳底圖' }).click();

    const base64 = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 400; c.height = 200;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#00FF00';
        ctx.fillRect(0, 0, 400, 200);
        return c.toDataURL('image/png').split(',')[1];
    });
    await page.locator('input[type=file]').last().setInputFiles({
        name: 'sheet.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64'),
    });
    await page.getByRole('button', { name: /魔法修復/ }).waitFor({ state: 'visible' });

    // Repeatedly evaluate on the main thread WHILE the worker is presumably
    // still compiling the 10.8MB wasm module. If the main thread were
    // blocked (the old bug), these would stall/time out.
    const start = Date.now();
    let ticks = 0;
    while (Date.now() - start < 8000) {
        const alive = await page.evaluate(() => document.readyState);
        expect(alive).toBe('complete');
        ticks++;
    }
    expect(ticks).toBeGreaterThan(3); // main thread kept responding throughout
});
