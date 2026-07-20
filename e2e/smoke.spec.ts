import { test, expect, Page } from '@playwright/test';

/**
 * E2E smoke tests (Roadmap §3): app shell boots, key gate works, the
 * platform selector drives the config flow. No real API keys — everything
 * before the first generation call is exercised.
 */

const DUMMY_KEY = 'test-key-1234567890';

const enterApp = async (page: Page) => {
    await page.goto('/');
    await page.getByPlaceholder(/API KEY/i).fill(DUMMY_KEY);
    await page.getByRole('button', { name: /開始創作/ }).click();
};

test('landing page renders and language toggle works', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'DreamSticker AI' })).toBeVisible();
    await expect(page.getByText('打造您的專屬 Line 貼圖 IP')).toBeVisible();

    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByText('Create Your Exclusive Line Sticker IP')).toBeVisible();
});

test('key gate opens the main app with the platform selector', async ({ page }) => {
    await enterApp(page);

    // Platform selector is a compact dropdown; open it to see all 7 targets.
    await expect(page.getByText('目標平台')).toBeVisible();
    await page.getByRole('button', { name: /LINE 貼圖/ }).first().click();
    for (const name of ['LINE 表情貼', 'Telegram', 'WhatsApp', 'Discord 貼圖', 'Discord Emoji', '微信表情']) {
        await expect(page.getByRole('option', { name, exact: true })).toBeVisible();
    }

    // Choosing a platform from the dropdown updates the trigger label
    await page.getByRole('option', { name: 'WhatsApp', exact: true }).click();
    await expect(page.getByRole('button', { name: /WhatsApp/ }).first()).toBeVisible();

    // All four input-mode cards render
    for (const mode of ['照片轉 IP', '現有 IP', '文字生成 IP', '上傳底圖']) {
        await expect(page.getByRole('heading', { name: mode })).toBeVisible();
    }
});

test('platform choice persists across reloads', async ({ page }) => {
    await enterApp(page);
    await page.getByRole('button', { name: /LINE 貼圖/ }).first().click(); // open dropdown
    await page.getByRole('option', { name: 'Telegram', exact: true }).click();
    await expect(page.getByRole('button', { name: /Telegram/ }).first()).toBeVisible();

    // The key is session-only, so re-enter after reload; the platform sticks
    await page.reload();
    await enterApp(page);
    await expect(page.getByRole('button', { name: /Telegram/ }).first()).toBeVisible();
});

test('mobile viewport has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'DreamSticker AI' })).toBeVisible();

    const landingOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(landingOverflow).toBeLessThanOrEqual(0);

    await enterApp(page);
    await expect(page.getByText('目標平台')).toBeVisible();
    const appOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(appOverflow).toBeLessThanOrEqual(0);
});
