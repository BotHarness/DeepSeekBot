import { pinnedGrid } from '../design/tokens';
import { PINNED_SECTION, type ChatListItem, type Conversation } from './conversations';

export type PinnedBand = {
  kind: 'pinned-band';
  key: string;
  rows: Conversation[];
  columns: number;
};

/** Layout policy only: native glyph geometry and interaction still need device qualification. */
export function pinnedColumns(width: number, fontScale: number): number {
  const scale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const available = Number.isFinite(width) ? Math.max(0, width - pinnedGrid.inset * 2) : 0;
  return Math.max(
    1,
    Math.floor((available + pinnedGrid.gap) / (pinnedGrid.minCardWidth * scale + pinnedGrid.gap)),
  );
}

/** Each band is a virtualized list item; never mount an unbounded nested grid in a header. */
export function withPinnedBands(
  items: readonly ChatListItem[],
  columns: number,
): (ChatListItem | PinnedBand)[] {
  const result: (ChatListItem | PinnedBand)[] = [];
  const count = Number.isFinite(columns) ? Math.max(1, Math.floor(columns)) : 1;
  let band: PinnedBand | undefined;
  for (const item of items) {
    if (item.kind !== 'row' || item.sectionId !== PINNED_SECTION) {
      band = undefined;
      result.push(item);
      continue;
    }
    if (band === undefined || band.rows.length === count) {
      band = { kind: 'pinned-band', key: `pinned-band:${item.key}`, rows: [], columns: count };
      result.push(band);
    }
    band.rows.push(item.row);
  }
  return result;
}
