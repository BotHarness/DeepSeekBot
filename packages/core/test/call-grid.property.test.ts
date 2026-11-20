import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CALL_GRID_LAYOUTS,
  MAX_GRID_COLUMNS,
  MAX_GRID_FRAMES,
  callGridRows,
  gridLayout,
  isCallGridLayout,
} from '../src/voice/keyframes.js';

const frames = fc.integer({ min: 1, max: MAX_GRID_FRAMES });

describe('ADR-0303 call grids tile balanced rows of at most three', () => {
  it('places every keyframe in ⌈n/3⌉ rows of at most three, longer rows first, differing by at most one', () => {
    fc.assert(
      fc.property(frames, (n) => {
        const rows = callGridRows(n);
        expect(rows.reduce((sum, row) => sum + row, 0)).toBe(n);
        expect(rows).toHaveLength(Math.ceil(n / MAX_GRID_COLUMNS));
        expect(Math.max(...rows)).toBeLessThanOrEqual(MAX_GRID_COLUMNS);
        expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(1);
        expect([...rows].sort((a, b) => b - a)).toEqual(rows);
      }),
    );
  });

  it('names a layout the validator accepts only for its own frame count', () => {
    fc.assert(
      fc.property(frames, frames, (n, other) => {
        const { layout } = gridLayout(n);
        expect(CALL_GRID_LAYOUTS).toContain(layout);
        expect(isCallGridLayout(n, layout)).toBe(true);
        expect(isCallGridLayout(other, layout)).toBe(other === n);
      }),
    );
  });

  it('refuses frame counts outside one to nine', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer({ max: 0 }), fc.integer({ min: MAX_GRID_FRAMES + 1 }), fc.double()),
        fc.constantFrom(...CALL_GRID_LAYOUTS),
        (n, layout) => {
          fc.pre(!(Number.isSafeInteger(n) && n >= 1 && n <= MAX_GRID_FRAMES));
          expect(isCallGridLayout(n, layout)).toBe(false);
        },
      ),
    );
  });
});
