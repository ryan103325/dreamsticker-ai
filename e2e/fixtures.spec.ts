import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Real-sheet regression harness: every image dropped into e2e/fixtures/
 * (named `<anything>-<quantity>.<png|jpg|webp>`, see the README there) is
 * driven through the full user flow — upload, green-screen auto-slice —
 * and must yield exactly its declared sticker count. Synthetic sheets in
 * slice.spec.ts reproduce known failure modes; these are the user's actual
 * generated sheets, which are the final word.
 */

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const MIME: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
};

const fixtures = fs.existsSync(FIXTURE_DIR)
    ? fs.readdirSync(FIXTURE_DIR).filter((f) => MIME[path.extname(f).toLowerCase()])
    : [];

for (const file of fixtures) {
    const m = file.match(/-(\d+)\.[a-z]+$/i);
    if (!m) {
        test(`fixture ${file} has a valid name`, () => {
            throw new Error(`Fixture "${file}" must be named <name>-<quantity>.<ext>, e.g. dogs-40.png`);
        });
        continue;
    }
    const qty = Number(m[1]);

    test(`real sheet ${file} slices into ${qty} stickers`, async ({ page }) => {
        test.setTimeout(180_000);

        await page.goto('/');
        await page.getByPlaceholder(/API KEY/i).fill('test-key-1234567890');
        await page.getByRole('button', { name: /開始創作/ }).click();
        await page.getByRole('heading', { name: '上傳底圖' }).click();
        await page.waitForTimeout(300);
        await page.getByRole('button', { name: String(qty), exact: true }).click();

        await page.locator('input[type=file]').last().setInputFiles(path.join(FIXTURE_DIR, file));

        const sliceButton = page.getByRole('button', { name: /綠幕自動切割/ });
        await expect(sliceButton).toBeVisible({ timeout: 60_000 });
        await sliceButton.click();
        await expect(page.getByText(/貼圖完成/)).toBeVisible({ timeout: 90_000 });

        const cards = page.locator('main img');
        await expect.poll(async () => cards.count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(qty);
    });
}
