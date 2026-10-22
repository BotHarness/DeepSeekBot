import { describe, expect, it } from 'vitest';
import { pinnedColumns, withPinnedBands } from '../src/ui/chat/pinned-grid';
import { chatList } from '../src/ui/chat/conversations';
import type { RosterView } from '../src/host/client';

describe('Pinned virtual list projection (not native geometry evidence)', () => {
  it('adapts the column policy to container width and live system font scale', () => {
    expect(pinnedColumns(390, 1)).toBe(3);
    expect(pinnedColumns(800, 1)).toBe(6);
    expect(pinnedColumns(390, 1.5)).toBe(2);
    expect(pinnedColumns(390, 2)).toBe(1);
    expect(pinnedColumns(800, 2)).toBe(3);
    expect(pinnedColumns(0, 1)).toBe(1);
    expect(pinnedColumns(390, 3.12)).toBe(1);
  });
  it('virtualizes pinned bands alongside ordinary rows and keeps collapse counts', () => {
    const roster: RosterView = {
      bots: [],
      channels: Array.from({ length: 101 }, (_, i) => ({
        id: `c${i}`,
        name: `Chat ${i}`,
        memberCount: 1,
        members: [],
      })),
      arrangement: {
        pins: Array.from({ length: 100 }, (_, i) => `c${i}`),
        hidden: [],
        sections: [],
        sectionOrder: [],
      },
      sorting: { sortMode: 'manual', sortModes: {} },
    };
    const items = withPinnedBands(chatList(roster, []), 3);
    const bands = items.filter((item) => item.kind === 'pinned-band');
    expect(bands).toHaveLength(34);
    expect(bands.flatMap((band) => band.rows.map((row) => row.key))).toEqual(
      roster.arrangement!.pins.map((id) => `channel:${id}`),
    );
    expect(bands.every((band) => band.rows.length <= 3)).toBe(true);
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
    expect(items.at(-1)).toMatchObject({ kind: 'row', key: 'channel:c100' });
    expect(withPinnedBands(chatList(roster, [], new Set(['pinned'])), 3)).toMatchObject([
      { kind: 'section', count: 100, collapsed: true },
      { kind: 'row', key: 'channel:c100' },
    ]);
  });
});
