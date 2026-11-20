import { describe, expect, it } from 'vitest';
import { albumLayout, ALBUM_VISIBLE_LIMIT, singleImageAspect } from '../src/client/album-layout.js';

type Cell = [column: number, row: number, columnSpan: number, rowSpan: number];

const TABLE: {
  count: number;
  columns: number[];
  rows: number[];
  aspectRatio: number;
  cells: Cell[];
  overflow: number;
}[] = [
  { count: 1, columns: [1], rows: [1], aspectRatio: 4 / 3, cells: [[0, 0, 1, 1]], overflow: 0 },
  {
    count: 2,
    columns: [1, 1],
    rows: [1],
    aspectRatio: 2 / 1.15,
    cells: [
      [0, 0, 1, 1],
      [1, 0, 1, 1],
    ],
    overflow: 0,
  },
  {
    count: 3,
    columns: [2, 1],
    rows: [1, 1],
    aspectRatio: 4 / 3,
    cells: [
      [0, 0, 1, 2],
      [1, 0, 1, 1],
      [1, 1, 1, 1],
    ],
    overflow: 0,
  },
  {
    count: 4,
    columns: [1, 1],
    rows: [1, 1],
    aspectRatio: 1,
    cells: [
      [0, 0, 1, 1],
      [1, 0, 1, 1],
      [0, 1, 1, 1],
      [1, 1, 1, 1],
    ],
    overflow: 0,
  },
  ...[5, 6, 7, 8, 9, 10].map((count) => ({
    count,
    columns: [1, 1, 1, 1, 1, 1],
    rows: [1.3, 1],
    aspectRatio: 1 / 0.95,
    cells: [
      [0, 0, 3, 1],
      [3, 0, 3, 1],
      [0, 1, 2, 1],
      [2, 1, 2, 1],
      [4, 1, 2, 1],
    ] satisfies Cell[],
    overflow: count - 5,
  })),
];

describe('albumLayout', () => {
  it.each(TABLE)(
    'lays out $count images',
    ({ count, columns, rows, aspectRatio, cells, overflow }) => {
      const layout = albumLayout(count);
      expect(layout.count).toBe(count);
      expect(layout.columns).toEqual(columns);
      expect(layout.rows).toEqual(rows);
      expect(layout.aspectRatio).toBeCloseTo(aspectRatio, 6);
      expect(
        layout.tiles.map((tile) => [tile.column, tile.row, tile.columnSpan, tile.rowSpan]),
      ).toEqual(cells);
      expect(layout.tiles.map((tile) => tile.index)).toEqual(cells.map((_, index) => index));
      expect(layout.tiles.map((tile) => tile.overflow)).toEqual(
        cells.map((_, index) => (index === cells.length - 1 ? overflow : 0)),
      );
    },
  );

  it.each(TABLE)('tiles of $count images cover the whole album exactly once', ({ count }) => {
    const layout = albumLayout(count);
    const covered = layout.tiles.reduce((sum, tile) => sum + tile.rect.width * tile.rect.height, 0);
    expect(covered).toBeCloseTo(1, 9);
    for (const tile of layout.tiles) {
      expect(tile.rect.x + tile.rect.width).toBeLessThanOrEqual(1 + 1e-9);
      expect(tile.rect.y + tile.rect.height).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('gives fractional rectangles that follow the grid weights', () => {
    expect(albumLayout(3).tiles.map((tile) => tile.rect)).toEqual([
      { x: 0, y: 0, width: 2 / 3, height: 1 },
      { x: 2 / 3, y: 0, width: 1 / 3, height: 0.5 },
      { x: 2 / 3, y: 0.5, width: 1 / 3, height: 0.5 },
    ]);
    const five = albumLayout(5).tiles.map((tile) => tile.rect);
    expect(five[0]).toEqual({ x: 0, y: 0, width: 0.5, height: 1.3 / 2.3 });
    expect(five[4]?.x).toBeCloseTo(4 / 6, 9);
    expect(five[4]?.y).toBeCloseTo(1.3 / 2.3, 9);
  });

  it('shows at most five tiles', () => {
    expect(ALBUM_VISIBLE_LIMIT).toBe(5);
    expect(albumLayout(42).tiles).toHaveLength(5);
    expect(albumLayout(42).tiles[4]?.overflow).toBe(37);
  });

  it('returns no tiles for no images or an invalid count', () => {
    for (const count of [0, -1, Number.NaN, 2.5]) {
      expect(albumLayout(count).tiles).toEqual([]);
    }
  });
});

describe('single image shape', () => {
  it('keeps the image shape between 3:4 and 2:1 and falls back when the size is unknown', () => {
    expect(singleImageAspect({ width: 1600, height: 900 }, 4 / 3)).toBeCloseTo(16 / 9);
    expect(singleImageAspect({ width: 400, height: 1200 }, 4 / 3)).toBe(0.75);
    expect(singleImageAspect({ width: 3000, height: 1000 }, 4 / 3)).toBe(2);
    expect(singleImageAspect({}, 4 / 3)).toBe(4 / 3);
    expect(singleImageAspect({ width: 0, height: 100 }, 4 / 3)).toBe(4 / 3);
  });
});
