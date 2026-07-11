#!/usr/bin/env node
/**
 * i18n completeness check (Roadmap §3).
 *
 * Guards against the historical incident where 39 missing keys rendered raw
 * key names in the UI. Fails (exit 1) when:
 *  1. zh and en dictionaries in src/i18n.ts don't have the exact same keys;
 *  2. any literal t('key') / t("key") used in src/ is missing from zh;
 *  3. any dynamically-built key family is incomplete:
 *     - platform_<ID> / platformNote_<ID> for every PlatformId in platforms.ts
 *     - every 'artStyle_*' string literal used in src/
 *
 * Zero dependencies: i18n.ts is parsed textually (all values are plain
 * string literals, one `key: "value",` per line).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src');

// --- 1. Parse the zh/en dictionaries out of i18n.ts ------------------------

const i18nSource = readFileSync(join(srcDir, 'i18n.ts'), 'utf8');

const zhStart = i18nSource.indexOf('zh: {');
const enStart = i18nSource.indexOf('en: {');
if (zhStart === -1 || enStart === -1 || enStart < zhStart) {
    console.error('check-i18n: could not locate zh/en blocks in src/i18n.ts');
    process.exit(1);
}

const keyRe = /^\s+([A-Za-z0-9_]+):\s*["'`]/gm;
const collectKeys = (text) => {
    const keys = new Set();
    for (const m of text.matchAll(keyRe)) keys.add(m[1]);
    return keys;
};

const zhKeys = collectKeys(i18nSource.slice(zhStart, enStart));
const enKeys = collectKeys(i18nSource.slice(enStart));

// --- 2. Collect keys used in source ----------------------------------------

const walk = (dir, files = []) => {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, files);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) files.push(p);
    }
    return files;
};

const usedKeys = new Set();
const artStyleKeys = new Set();
let platformIds = [];

for (const file of walk(srcDir)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\bt\(\s*['"]([^'"]+)['"]\s*\)/g)) usedKeys.add(m[1]);
    for (const m of text.matchAll(/['"](artStyle_[A-Za-z0-9_]+)['"]/g)) artStyleKeys.add(m[1]);
    if (file.endsWith('platforms.ts')) {
        const typeBlock = text.match(/export type PlatformId\s*=([^;]+);/);
        if (typeBlock) {
            platformIds = [...typeBlock[1].matchAll(/'([A-Z_]+)'/g)].map(m => m[1]);
        }
    }
}

for (const key of artStyleKeys) usedKeys.add(key);
for (const id of platformIds) {
    usedKeys.add(`platform_${id}`);
    usedKeys.add(`platformNote_${id}`);
}

// --- 3. Report --------------------------------------------------------------

const problems = [];

const zhOnly = [...zhKeys].filter(k => !enKeys.has(k));
const enOnly = [...enKeys].filter(k => !zhKeys.has(k));
if (zhOnly.length) problems.push(`Keys in zh but missing in en (${zhOnly.length}): ${zhOnly.join(', ')}`);
if (enOnly.length) problems.push(`Keys in en but missing in zh (${enOnly.length}): ${enOnly.join(', ')}`);

const missing = [...usedKeys].filter(k => !zhKeys.has(k) && !k.includes('.'));
if (missing.length) problems.push(`Keys used in src/ but missing from the dictionary (${missing.length}): ${missing.join(', ')}`);

if (platformIds.length === 0) problems.push('Could not extract PlatformId list from src/platforms.ts (regex drift?)');

if (problems.length) {
    console.error('✗ i18n check failed:\n');
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
}

console.log(`✓ i18n check passed: ${zhKeys.size} keys, zh/en in sync, ${usedKeys.size} used keys all present.`);
