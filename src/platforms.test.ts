import { describe, it, expect } from 'vitest';
import { PLATFORMS, generateLayoutFor, stickerTypeFor } from './platforms';
import { STICKER_SPECS, EMOJI_SPECS, StickerQuantity } from './types';

describe('generateLayoutFor', () => {
    it('keeps every LINE sticker layout identical to the legacy tables (regression)', () => {
        for (const qty of [8, 16, 24, 32, 40] as StickerQuantity[]) {
            const layout = generateLayoutFor(PLATFORMS.LINE_STICKER, qty);
            const spec = STICKER_SPECS[qty];
            expect(layout).toEqual({ rows: spec.rows, cols: spec.cols, width: spec.width, height: spec.height });
        }
    });

    it('keeps every LINE emoji layout identical to the legacy tables (regression)', () => {
        for (const qty of [8, 16, 24, 32, 40] as StickerQuantity[]) {
            const layout = generateLayoutFor(PLATFORMS.LINE_EMOJI, qty);
            const spec = EMOJI_SPECS[qty];
            expect(layout).toEqual({ rows: spec.rows, cols: spec.cols, width: spec.width, height: spec.height });
        }
    });

    it('computes sensible grids for square-cell platforms', () => {
        expect(generateLayoutFor(PLATFORMS.TELEGRAM, 8)).toMatchObject({ cols: 4, rows: 2 });
        expect(generateLayoutFor(PLATFORMS.TELEGRAM, 16)).toMatchObject({ cols: 4, rows: 4 });
        expect(generateLayoutFor(PLATFORMS.TELEGRAM, 20)).toMatchObject({ cols: 5, rows: 4 });
    });

    it('sizes the computed sheet from the platform cell', () => {
        const l = generateLayoutFor(PLATFORMS.WHATSAPP, 16);
        expect(l.width).toBe(l.cols * 512);
        expect(l.height).toBe(l.rows * 512);
    });

    it('never exceeds 8 rows or 8 columns for any offered quantity', () => {
        for (const p of Object.values(PLATFORMS)) {
            for (const qty of p.quantities) {
                const l = generateLayoutFor(p, qty);
                expect(l.rows * l.cols).toBe(qty);
                expect(l.rows).toBeLessThanOrEqual(8);
                expect(l.cols).toBeLessThanOrEqual(8);
            }
        }
    });
});

describe('platform registry invariants', () => {
    it('COVER platforms map to EMOJI type with zero padding', () => {
        for (const p of Object.values(PLATFORMS)) {
            if (p.fit === 'COVER') {
                expect(stickerTypeFor(p)).toBe('EMOJI');
                expect(p.padding).toBe(0);
            } else {
                expect(stickerTypeFor(p)).toBe('STATIC');
            }
        }
    });

    it('512px platforms default to individual generation', () => {
        expect(PLATFORMS.TELEGRAM.preferIndividual).toBe(true);
        expect(PLATFORMS.WHATSAPP.preferIndividual).toBe(true);
        expect(PLATFORMS.LINE_STICKER.preferIndividual).toBe(false);
    });

    it('webp platforms carry a byte budget where required', () => {
        expect(PLATFORMS.WHATSAPP.format).toBe('webp');
        expect(PLATFORMS.WHATSAPP.maxBytes).toBe(100 * 1024);
        expect(PLATFORMS.TELEGRAM.format).toBe('webp');
    });
});
