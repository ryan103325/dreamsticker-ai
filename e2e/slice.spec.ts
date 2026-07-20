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

test('greenish text survives keying and neighbor overflow is not cropped in', async ({ page }) => {
    test.setTimeout(120_000);

    // Two real user reports on the cell-grid fallback path:
    // 1. Dark-green / teal lettering inside a sticker fell inside the broad
    //    detection band and turned transparent — the matte must key only a
    //    tight band around the MEASURED background color.
    // 2. A sticker slightly overflowing its cell left a thin strip inside
    //    the neighboring cell, and that strip got included in the
    //    neighbor's crop.
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
        // Full-width white bars per cell: rows fuse horizontally (forcing
        // the cell-grid fallback), 60px green river between rows. Inner
        // colors deliberately stay far from the key's hue band — content
        // painted in (nearly) the key color itself is unresolvable.
        const colors = ['#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#c0392b', '#e67e22', '#2c3e50', '#d35400',
                        '#8e44ad', '#2980b9', '#b03a2e', '#ca6f1e', '#7f8c8d', '#a04000', '#cb4335', '#2471a3'];
        for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
            const x = col * cellW, y = r * cellH;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x, y + 30, cellW, cellH - 60);
            ctx.fillStyle = colors[r * cols + col];
            ctx.fillRect(x + 20, y + 50, cellW - 40, cellH - 100);
        }
        // Cell (0,0): dark-green and teal "lettering" blocks — both inside
        // the broad green detection band, far from the pure #00FF00 key.
        ctx.fillStyle = '#1e8e3e';
        ctx.fillRect(40, 70, 80, 60);
        ctx.fillStyle = '#00c896';
        ctx.fillRect(150, 70, 80, 60);
        // Cell (0,1): a tongue overflowing 14px down into cell (1,1).
        ctx.fillStyle = '#112233';
        ctx.fillRect(cellW + 135, cellH - 30, 100, 44);
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

    const counts = await page.evaluate(async () => {
        const near = (d: Uint8ClampedArray, i: number, rgb: number[], tol: number) =>
            d[i + 3] > 100 &&
            Math.abs(d[i] - rgb[0]) < tol && Math.abs(d[i + 1] - rgb[1]) < tol && Math.abs(d[i + 2] - rgb[2]) < tol;
        const scan = async (img: HTMLImageElement) => {
            const bmp = await createImageBitmap(img);
            const cc = document.createElement('canvas');
            cc.width = bmp.width; cc.height = bmp.height;
            const cx = cc.getContext('2d')!;
            cx.drawImage(bmp, 0, 0);
            return { d: cx.getImageData(0, 0, bmp.width, bmp.height).data, total: bmp.width * bmp.height };
        };
        const imgs = document.querySelectorAll('main img');
        const first = await scan(imgs[0] as HTMLImageElement);       // cell (0,0)
        const below = await scan(imgs[5] as HTMLImageElement);       // cell (1,1)
        let darkGreen = 0, teal = 0, tongue = 0;
        for (let i = 0; i < first.d.length; i += 4) {
            if (near(first.d, i, [30, 142, 62], 45)) darkGreen++;
            if (near(first.d, i, [0, 200, 150], 45)) teal++;
        }
        for (let i = 0; i < below.d.length; i += 4) {
            if (near(below.d, i, [17, 34, 51], 40)) tongue++;
        }
        return {
            darkGreenPct: (darkGreen / first.total) * 100,
            tealPct: (teal / first.total) * 100,
            tonguePct: (tongue / below.total) * 100,
        };
    });

    // The lettering blocks are each 80x60 in a 370x320 cell (~4% of it) —
    // require a solid fraction to survive, not just antialiasing crumbs.
    expect(counts.darkGreenPct).toBeGreaterThan(1);
    expect(counts.tealPct).toBeGreaterThan(1);
    // The neighbor's tongue must NOT appear in cell (1,1)'s crop.
    expect(counts.tonguePct).toBeLessThan(0.3);
});

test('a sticker whose outline overflows its cell is not sliced off flat', async ({ page }) => {
    test.setTimeout(120_000);

    // Real generated stickers routinely bleed a few percent past their grid
    // line. The old per-cell-clamped fallback sliced that overflow off,
    // leaving a flat cut across the white outline (user report on the dog
    // sheet). Ownership slicing keeps each sticker's full contour, so the
    // rounded outline survives with transparent margin all around.
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
        // Each sticker: a rounded body with a WHITE outline, drawn tall so
        // its bottom outline crosses the grid line into the next row. Cells
        // stay separated by a green river (not fused) so this exercises the
        // single-contour ownership path, not the fused path.
        for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
            const cx = col * cellW + cellW / 2;
            const cy = r * cellH + cellH / 2 + 30; // pushed down -> overflows bottom
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.ellipse(cx, cy, cellW * 0.42, cellH * 0.52, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = colors[r * cols + col];
            ctx.beginPath(); ctx.ellipse(cx, cy, cellW * 0.38, cellH * 0.48, 0, 0, Math.PI * 2); ctx.fill();
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

    // For a top-row sticker (overflows downward): its opaque content must
    // NOT run to the crop's bottom edge as a flat line. A cut shows up as
    // an almost-fully-opaque bottom row with ~zero transparent margin; an
    // intact rounded outline leaves a clear transparent margin below.
    const bottom = await page.evaluate(async () => {
        const img = document.querySelector('main img') as HTMLImageElement;
        const bmp = await createImageBitmap(img);
        const cc = document.createElement('canvas');
        cc.width = bmp.width; cc.height = bmp.height;
        const cx = cc.getContext('2d')!;
        cx.drawImage(bmp, 0, 0);
        const d = cx.getImageData(0, 0, bmp.width, bmp.height).data;
        const opaque = (x: number, y: number) => d[(y * bmp.width + x) * 4 + 3] > 60;
        let botY = -1;
        for (let y = bmp.height - 1; y >= 0 && botY < 0; y--)
            for (let x = 0; x < bmp.width; x++) if (opaque(x, y)) { botY = y; break; }
        const botRow = botY < 0 ? 0 : Array.from({ length: bmp.width }, (_, x) => opaque(x, botY)).filter(Boolean).length;
        return { margin: bmp.height - 1 - botY, flatFrac: botRow / bmp.width };
    });
    // The decisive signal is the transparent margin below the content: a
    // flat cut leaves ~0 margin, an intact outline leaves a clear one. The
    // observed real cuts also ran the bottom row ~0.85-0.96 across the full
    // width; an intact rounded bottom here is ~0.55, so 0.75 separates them.
    expect(bottom.margin).toBeGreaterThan(2);
    expect(bottom.flatFrac).toBeLessThan(0.75);
});

test('emoji format (COVER fit, 180px square cells) slices full-bleed and neighbor-free', async ({ page }) => {
    test.setTimeout(120_000);

    // The slicer must work for more than the default LINE sticker shape:
    // emoji use square 180px cells, COVER fit (full-bleed, no white
    // outline). Select that platform, then confirm each cell is sliced to
    // 180x180, fills the frame, and carries only its own color.
    await page.goto('/');
    await page.getByPlaceholder(/API KEY/i).fill('test-key-1234567890');
    await page.getByRole('button', { name: /開始創作/ }).click();
    // Platform picker is now a dropdown: open it (default LINE sticker) and
    // choose LINE Emoji.
    await page.getByRole('button', { name: /LINE 貼圖/ }).first().click();
    await page.getByRole('option', { name: 'LINE 表情貼', exact: true }).click();
    await page.getByRole('heading', { name: '上傳底圖' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '16', exact: true }).click();

    const palette = ['#e74c3c', '#e67e22', '#f1c40f', '#9b59b6', '#c0392b', '#d35400', '#8e44ad', '#2c3e50',
                     '#e84393', '#d63031', '#6c5ce7', '#fd79a8', '#e17055', '#a29bfe', '#fab1a0', '#ff7675'];
    const base64 = await page.evaluate((COL) => {
        const cols = 4, rows = 4, cell = 256;
        const c = document.createElement('canvas');
        c.width = cell * cols; c.height = cell * rows;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#00FF00'; ctx.fillRect(0, 0, c.width, c.height);
        // A character centered in each cell with a green margin (as the
        // generator produces), distinct color per cell.
        for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
            const m = Math.round(cell * 0.09);
            ctx.fillStyle = COL[r * cols + col];
            ctx.beginPath();
            ctx.ellipse(col * cell + cell / 2, r * cell + cell / 2, cell / 2 - m, cell / 2 - m, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        return c.toDataURL('image/png').split(',')[1];
    }, palette);
    await page.locator('input[type=file]').last().setInputFiles({
        name: 'emoji.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64'),
    });

    const sliceButton = page.getByRole('button', { name: /綠幕自動切割/ });
    await expect(sliceButton).toBeVisible({ timeout: 60_000 });
    await sliceButton.click();
    await expect(page.getByText(/貼圖完成/)).toBeVisible({ timeout: 60_000 });
    const cards = page.locator('main img');
    await expect.poll(async () => cards.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(16);

    const stats = await page.evaluate(async () => {
        const first = document.querySelector('main img') as HTMLImageElement;
        const bmp = await createImageBitmap(first);
        const cc = document.createElement('canvas');
        cc.width = bmp.width; cc.height = bmp.height;
        const cx = cc.getContext('2d')!;
        cx.drawImage(bmp, 0, 0);
        const d = cx.getImageData(0, 0, bmp.width, bmp.height).data;
        let green = 0, opaque = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 120) continue;
            opaque++;
            if (d[i + 1] > 150 && d[i] < 110 && d[i + 2] < 110) green++;
        }
        // COVER fill: opaque content should cover most of the frame.
        return { w: bmp.width, h: bmp.height, greenPct: (green / Math.max(1, opaque)) * 100, fill: opaque / (bmp.width * bmp.height) };
    });
    expect(stats.w).toBe(180);
    expect(stats.h).toBe(180);
    expect(stats.greenPct).toBeLessThan(3);   // no residual green key
    expect(stats.fill).toBeGreaterThan(0.55);  // COVER fills the frame, not a sliver
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
