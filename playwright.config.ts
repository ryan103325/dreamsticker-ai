import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// Sandboxed/managed environments ship a pre-installed Chromium at a fixed
// path; use it when present so `playwright install` isn't required there.
const preinstalledChromium = '/opt/pw-browsers/chromium';

export default defineConfig({
    testDir: './e2e',
    timeout: 60_000,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: 'http://localhost:4173',
        launchOptions: existsSync(preinstalledChromium)
            ? { executablePath: preinstalledChromium }
            : {},
    },
    webServer: {
        // Serves the production build (run `npm run build` first)
        command: 'npm run preview -- --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
    },
});
