import { jpeg } from './call-visual-fixtures.js';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  createCallImaging,
  drawLabel,
  frameLabel,
  gridCells,
  labelHeight,
} from '../src/voice/call-frames.js';
import { gridLayout, MAX_GRID_FRAMES } from '../src/voice/keyframes.js';

describe('grid layout', () => {
  it('balances 1 to 9 frames into rows of at most three, the longer rows first', () => {
    expect(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => {
        const { layout, rows } = gridLayout(count);
        return { layout, rows };
      }),
    ).toEqual([
      { layout: '1', rows: [1] },
      { layout: '2', rows: [2] },
      { layout: '3', rows: [3] },
      { layout: '2+2', rows: [2, 2] },
      { layout: '3+2', rows: [3, 2] },
      { layout: '3+3', rows: [3, 3] },
      { layout: '3+2+2', rows: [3, 2, 2] },
      { layout: '3+3+2', rows: [3, 3, 2] },
      { layout: '3+3+3', rows: [3, 3, 3] },
    ]);
    expect(MAX_GRID_FRAMES).toBe(9);
  });

  it('numbers cells row by row and centres a shorter row', () => {
    expect(gridCells([3, 2], 512, 288)).toEqual([
      { left: 0, top: 0 },
      { left: 512, top: 0 },
      { left: 1024, top: 0 },
      { left: 256, top: 288 },
      { left: 768, top: 288 },
    ]);
  });
});

const PALETTE = [
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 0, g: 0, b: 255 },
  { r: 255, g: 255, b: 0 },
  { r: 0, g: 255, b: 255 },
  { r: 255, g: 0, b: 255 },
  { r: 255, g: 128, b: 0 },
  { r: 128, g: 0, b: 255 },
  { r: 255, g: 255, b: 255 },
];

describe('grid imaging', () => {
  it.each([2, 3, 4, 5, 6, 7, 8, 9])(
    'tiles %i keyframes in balanced rows with no empty cell',
    async (count) => {
      const imaging = createCallImaging();
      const prepared = await Promise.all(
        PALETTE.slice(0, count).map(async (color) =>
          imaging.prepare(new Uint8Array(await jpeg(color, 1920, 1080))),
        ),
      );
      expect(prepared[0]).toMatchObject({ width: 1920, height: 1080, tileWidth: 768 });
      const grid = await imaging.compose(
        prepared,
        prepared.map((_, index) => frameLabel(index, 10 - index)),
      );
      const { layout, rows } = gridLayout(count);
      expect(grid.layout).toBe(layout);
      const tileWidth = count === 2 ? 768 : 512;
      const tileHeight = Math.floor(tileWidth / (1920 / 1080));
      const strip = labelHeight(Math.round(tileWidth / 160));
      const cellHeight = tileHeight + strip;
      expect(grid).toMatchObject({
        width: tileWidth * Math.max(...rows),
        height: cellHeight * rows.length,
      });
      expect(Math.max(grid.width, grid.height)).toBeLessThanOrEqual(1536);
      const { data, info } = await sharp(grid.jpeg).raw().toBuffer({ resolveWithObject: true });
      const pixel = (x: number, y: number) => {
        const offset = (Math.floor(y) * info.width + Math.floor(x)) * 3;
        return [...data.subarray(offset, offset + 3)];
      };
      const widest = Math.max(...rows);
      let cell = 0;
      rows.forEach((size, row) => {
        const offset = ((widest - size) * tileWidth) / 2;
        for (let col = 0; col < size; col += 1) {
          const color = PALETTE[cell]!;
          const expected = [color.r > 128, color.g > 128, color.b > 128];
          const seen = (x: number, y: number) => pixel(x, y).map((value) => value > 128);
          const left = offset + col * tileWidth;
          const top = row * cellHeight + strip;
          expect(seen(left + tileWidth / 2, top + tileHeight / 2)).toEqual(expected);
          expect(seen(left + 4, top + 4)).toEqual(expected);
          expect(Math.max(...pixel(left + tileWidth - 4, top - 4))).toBeLessThan(40);
          const labelled = Array.from({ length: strip * 80 }, (_, index) =>
            Math.min(...pixel(left + (index % 80) * 2, row * cellHeight + Math.floor(index / 80))),
          );
          expect(Math.max(...labelled)).toBeGreaterThan(200);
          cell += 1;
        }
      });
      expect(Math.max(...pixel(2, 2))).toBeLessThan(40);
    },
  );

  it('refuses more than nine frames in one grid', async () => {
    const imaging = createCallImaging();
    const frame = await imaging.prepare(new Uint8Array(await jpeg({ r: 9, g: 9, b: 9 })));
    await expect(
      imaging.compose(
        Array.from({ length: 10 }, () => frame),
        [],
      ),
    ).rejects.toThrow(/at most 9/u);
  });

  it('sends a single keyframe as one sharp image', async () => {
    const imaging = createCallImaging();
    const frame = await imaging.prepare(
      new Uint8Array(await jpeg({ r: 9, g: 9, b: 9 }, 3000, 2000)),
    );
    const grid = await imaging.compose([frame], ['1 · -0s']);
    expect(grid).toMatchObject({ layout: '1', width: 1536, height: 1024 });
  });

  it.each([512, 600])('keeps a 1×%i frame at least one pixel wide', async (height) => {
    const imaging = createCallImaging();
    const frame = await imaging.prepare(
      new Uint8Array(await jpeg({ r: 9, g: 9, b: 9 }, 1, height)),
    );
    const frames = Array.from({ length: 9 }, () => frame);
    const grid = await imaging.compose(frames, []);
    expect(grid.width).toBeGreaterThanOrEqual(3);
    expect(grid.height).toBeLessThanOrEqual(1536);
  });

  it('keeps a portrait grid with label strips inside the long edge', async () => {
    const imaging = createCallImaging();
    const frame = await imaging.prepare(
      new Uint8Array(await jpeg({ r: 200, g: 200, b: 200 }, 1080, 1920)),
    );
    const frames = Array.from({ length: 9 }, () => frame);
    const grid = await imaging.compose(
      frames,
      frames.map((_, index) => frameLabel(index, index)),
    );
    expect(grid.layout).toBe('3+3+3');
    expect(Math.max(grid.width, grid.height)).toBeLessThanOrEqual(1536);
  });

  it('refuses something that is not a JPEG', async () => {
    const imaging = createCallImaging();
    await expect(imaging.prepare(new Uint8Array([1, 2, 3, 4, 5]))).rejects.toThrow(/JPEG/u);
    const truncated = (await jpeg({ r: 1, g: 2, b: 3 })).subarray(0, 40);
    await expect(imaging.prepare(new Uint8Array(truncated))).rejects.toThrow();
  });

  it('draws labels in white on black without fonts', () => {
    const canvas = Buffer.alloc(100 * 40 * 3, 128);
    drawLabel(canvas, 100, 0, 0, '3 · -12s', 2);
    expect(canvas[0]).toBe(0);
    expect([...canvas].includes(255)).toBe(true);
    expect(canvas[(39 * 100 + 99) * 3]).toBe(128);
  });
});
