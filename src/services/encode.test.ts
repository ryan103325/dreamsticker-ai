import { describe, it, expect } from 'vitest';
import { encodeWithBudget, BudgetEncoderDeps } from './encode';

/**
 * Fake backend: encoded size is a deterministic function of pixel area and
 * attempt (lossless = 1 byte/px, lossy = quality bytes/px), so each ladder
 * branch can be pinned down exactly without a real encoder.
 */
interface FakeCanvas { width: number; height: number }

const fakeDeps = (log: Array<{ w: number; lossless?: boolean; quality?: number }> = []): BudgetEncoderDeps<FakeCanvas> => ({
    encode: async (canvas, _format, opts) => {
        log.push({ w: canvas.width, lossless: opts.lossless, quality: opts.quality });
        const bytesPerPx = opts.lossless ? 1 : (opts.quality ?? 0.9);
        const size = Math.round(canvas.width * canvas.height * bytesPerPx);
        return new Blob([new Uint8Array(size)]);
    },
    resize: (_canvas, w, h) => ({ width: w, height: h }),
});

const canvas512: FakeCanvas = { width: 512, height: 512 };
const AREA = 512 * 512; // 262144

describe('encodeWithBudget', () => {
    it('png without budget encodes once and reports withinBudget', async () => {
        const log: any[] = [];
        const r = await encodeWithBudget(canvas512, 'png', undefined, fakeDeps(log));
        expect(r.withinBudget).toBe(true);
        expect(r.mime).toBe('image/png');
        expect(log).toHaveLength(1);
    });

    it('webp without budget uses a single lossless pass', async () => {
        const log: any[] = [];
        const r = await encodeWithBudget(canvas512, 'webp', undefined, fakeDeps(log));
        expect(log).toEqual([{ w: 512, lossless: true, quality: undefined }]);
        expect(r.attempt.lossless).toBe(true);
    });

    it('returns lossless when it fits the budget', async () => {
        const r = await encodeWithBudget(canvas512, 'webp', AREA + 1, fakeDeps());
        expect(r.withinBudget).toBe(true);
        expect(r.attempt).toEqual({ lossless: true, scale: 1 });
        expect(r.width).toBe(512);
    });

    it('steps down the lossy quality ladder when lossless is too big', async () => {
        // lossless = AREA, q0.9 = 0.9*AREA, q0.8 = 0.8*AREA <= budget
        const budget = Math.round(AREA * 0.85);
        const r = await encodeWithBudget(canvas512, 'webp', budget, fakeDeps());
        expect(r.withinBudget).toBe(true);
        expect(r.attempt.quality).toBe(0.8);
        expect(r.width).toBe(512); // no downscale needed
    });

    it('shrinks the canvas (512→480) and retries the ladder when q0.5 still exceeds', async () => {
        // At 512: best is q0.5 = 0.5*262144 = 131072. Budget below that forces
        // a resize to 480 (area 230400), where lossless = 230400 > budget but
        // q0.5 = 115200 fits.
        const budget = 120000;
        const log: any[] = [];
        const r = await encodeWithBudget(canvas512, 'webp', budget, fakeDeps(log));
        expect(r.withinBudget).toBe(true);
        expect(r.width).toBe(480);
        expect(r.attempt.quality).toBe(0.5);
        // Full ladder ran at 512 (6 attempts) before any 480 attempt
        expect(log.filter(l => l.w === 512)).toHaveLength(6);
    });

    it('returns the smallest attempt with withinBudget=false when nothing fits', async () => {
        const r = await encodeWithBudget(canvas512, 'webp', 10, fakeDeps());
        expect(r.withinBudget).toBe(false);
        // Smallest possible: q0.5 at the smallest scale step (448)
        expect(r.width).toBe(448);
        expect(r.attempt.quality).toBe(0.5);
        expect(r.blob.size).toBe(Math.round(448 * 448 * 0.5));
    });
});
