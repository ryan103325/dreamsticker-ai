import { describe, it, expect } from 'vitest';
import { mergeFragments, clusterToGrid, RectLike } from './opencvService';

/**
 * Unit coverage for the pure slicing geometry (no OpenCV/browser needed).
 * These functions turn raw contour bounding boxes into one rect per grid
 * cell — the core of the auto-slicer. The wasm/canvas half is exercised
 * manually (see the self-hosting note in opencvService.ts).
 */

// A tidy 4x2 grid of cells 100x100 each, one centered 60x60 blob per cell.
const gridBoxes = (rows: number, cols: number, cell = 100, blob = 60): RectLike[] => {
    const out: RectLike[] = [];
    const pad = (cell - blob) / 2;
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            out.push({ x: c * cell + pad, y: r * cell + pad, width: blob, height: blob });
    return out;
};

describe('mergeFragments', () => {
    it('leaves well-separated blobs untouched', () => {
        const boxes = gridBoxes(2, 4);
        expect(mergeFragments(boxes, 100, 100)).toHaveLength(8);
    });

    it('unions a caption fragment sitting just below its character', () => {
        const character = { x: 20, y: 10, width: 60, height: 50 };
        const caption = { x: 25, y: 64, width: 50, height: 18 }; // small vertical gap
        const merged = mergeFragments([character, caption], 100, 100);
        expect(merged).toHaveLength(1);
        expect(merged[0]).toMatchObject({ x: 20, y: 10 });
        expect(merged[0].height).toBeGreaterThanOrEqual(72);
    });

    it('does NOT merge blobs in adjacent columns (large horizontal gap)', () => {
        const left = { x: 20, y: 20, width: 60, height: 60 };
        const right = { x: 220, y: 20, width: 60, height: 60 };
        expect(mergeFragments([left, right], 100, 100)).toHaveLength(2);
    });
});

describe('clusterToGrid', () => {
    it('resolves a clean 2x4 grid into 8 cells', () => {
        const rects = clusterToGrid(gridBoxes(2, 4), 2, 4, 100, 100);
        expect(rects).not.toBeNull();
        expect(rects!).toHaveLength(8);
    });

    it('returns null when the row count does not match (bails to fallback)', () => {
        // Only one row of blobs but caller expects two
        const oneRow = gridBoxes(1, 4);
        expect(clusterToGrid(oneRow, 2, 4, 100, 100)).toBeNull();
    });

    it('returns null when a cluster glues two stickers into an oversized union', () => {
        // Two blobs so wide they span >1.6 cells when unioned in one column
        const boxes: RectLike[] = [
            { x: 5, y: 20, width: 60, height: 60 },
            { x: 100, y: 25, width: 60, height: 60 },
        ];
        expect(clusterToGrid(boxes, 1, 1, 100, 100)).toBeNull();
    });

    it('returns null for more boxes than grid cells', () => {
        expect(clusterToGrid(gridBoxes(2, 4), 1, 4, 100, 100)).toBeNull();
    });
});

