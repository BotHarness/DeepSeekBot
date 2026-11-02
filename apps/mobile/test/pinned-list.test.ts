import { describe, expect, it } from 'vitest';
import { chatList } from '../src/ui/chat/conversations';
import type { RosterView } from '../src/host/client';

describe('Pinned virtual list projection (not native geometry evidence)', () => {
  it('projects one flat-list item per pin alongside ordinary rows and keeps collapse counts', () => {
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
    const items = chatList(roster, []);
    const pins = items.filter((item) => item.kind === 'row' && item.sectionId === 'pinned');
    expect(pins).toHaveLength(100);
    expect(pins.map((item) => item.key)).toEqual(
      roster.arrangement!.pins.map((id) => `channel:${id}`),
    );
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
    expect(items.at(-1)).toMatchObject({ kind: 'row', key: 'channel:c100' });
    expect(chatList(roster, [], new Set(['pinned']))).toMatchObject([
      { kind: 'section', count: 100, collapsed: true },
      { kind: 'row', key: 'channel:c100' },
    ]);
  });
});
