#!/usr/bin/env node
/**
 * Copies opencv.js from the npm package into public/vendor/ so it is served
 * as a plain classic script (self-hosted; previously fetched at runtime from
 * docs.opencv.org, which is a docs site that can vanish at any time).
 *
 * Why not bundle it? The emscripten UMD does not survive Rollup's CommonJS
 * interop (the module initializes in Node but silently never becomes ready
 * in a production browser build). A classic <script> tag is the load path
 * the file is actually built for — window.cv, zero transformation.
 *
 * Runs on postinstall and prebuild; public/vendor/ is gitignored.
 */

import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/@techstark/opencv-js/dist/opencv.js');
const dstDir = join(root, 'public/vendor');
const dst = join(dstDir, 'opencv.js');

if (!existsSync(src)) {
    console.warn('[copy-opencv] @techstark/opencv-js not installed yet; skipping.');
    process.exit(0);
}

mkdirSync(dstDir, { recursive: true });
copyFileSync(src, dst);
console.log(`[copy-opencv] public/vendor/opencv.js (${(statSync(dst).size / 1024 / 1024).toFixed(1)} MB)`);
