export const ALBUM_VISIBLE_LIMIT = 5;

export interface AlbumRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AlbumTile {
  index: number;
  column: number;
  row: number;
  columnSpan: number;
  rowSpan: number;
  overflow: number;
  rect: AlbumRect;
}

export interface AlbumLayout {
  count: number;
  columns: readonly number[];
  rows: readonly number[];
  aspectRatio: number;
  tiles: readonly AlbumTile[];
}

type Cell = readonly [column: number, row: number, columnSpan: number, rowSpan: number];

interface Template {
  columns: readonly number[];
  rows: readonly number[];
  aspectRatio: number;
  cells: readonly Cell[];
}

const TEMPLATES: readonly Template[] = [
  { columns: [1], rows: [1], aspectRatio: 4 / 3, cells: [[0, 0, 1, 1]] },
  {
    columns: [1, 1],
    rows: [1],
    aspectRatio: 2 / 1.15,
    cells: [
      [0, 0, 1, 1],
      [1, 0, 1, 1],
    ],
  },
  {
    columns: [2, 1],
    rows: [1, 1],
    aspectRatio: 4 / 3,
    cells: [
      [0, 0, 1, 2],
      [1, 0, 1, 1],
      [1, 1, 1, 1],
    ],
  },
  {
    columns: [1, 1],
    rows: [1, 1],
    aspectRatio: 1,
    cells: [
      [0, 0, 1, 1],
      [1, 0, 1, 1],
      [0, 1, 1, 1],
      [1, 1, 1, 1],
    ],
  },
  {
    columns: [1, 1, 1, 1, 1, 1],
    rows: [1.3, 1],
    aspectRatio: 1 / 0.95,
    cells: [
      [0, 0, 3, 1],
      [3, 0, 3, 1],
      [0, 1, 2, 1],
      [2, 1, 2, 1],
      [4, 1, 2, 1],
    ],
  },
];

function offsets(weights: readonly number[]): { starts: number[]; total: number } {
  const starts: number[] = [];
  let total = 0;
  for (const weight of weights) {
    starts.push(total);
    total += weight;
  }
  return { starts, total };
}

function span(weights: readonly number[], start: number, length: number): number {
  let sum = 0;
  for (let index = start; index < start + length; index++) sum += weights[index] ?? 0;
  return sum;
}

const LAYOUTS: readonly Omit<AlbumLayout, 'count'>[] = TEMPLATES.map((template) => {
  const columns = offsets(template.columns);
  const rows = offsets(template.rows);
  return {
    columns: template.columns,
    rows: template.rows,
    aspectRatio: template.aspectRatio,
    tiles: template.cells.map(([column, row, columnSpan, rowSpan], index) => ({
      index,
      column,
      row,
      columnSpan,
      rowSpan,
      overflow: 0,
      rect: {
        x: (columns.starts[column] ?? 0) / columns.total,
        y: (rows.starts[row] ?? 0) / rows.total,
        width: span(template.columns, column, columnSpan) / columns.total,
        height: span(template.rows, row, rowSpan) / rows.total,
      },
    })),
  };
});

export function albumLayout(count: number): AlbumLayout {
  if (!Number.isSafeInteger(count) || count < 1)
    return { count: 0, columns: [], rows: [], aspectRatio: 1, tiles: [] };
  const shown = Math.min(count, ALBUM_VISIBLE_LIMIT);
  const base = LAYOUTS[shown - 1]!;
  const hidden = count - shown;
  if (hidden === 0) return { count, ...base };
  const tiles = base.tiles.slice();
  tiles[shown - 1] = { ...tiles[shown - 1]!, overflow: hidden };
  return { count, ...base, tiles };
}
