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
