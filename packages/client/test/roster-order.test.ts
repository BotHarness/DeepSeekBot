import { describe, expect, it, vi } from 'vitest';

import {
  applyChannelMove,
  flatRosterChannelIds,
  commitScopeReorder,
  completeFlatEntries,
  moveWithinOrder,
  orderFlatEntries,
  orderScopeChannels,
  planChannelMove,
  planFlatInsert,
  resolvePinnedChannelIds,
  resolvedSortMode,
  resolveBlockDropTarget,
  rowDropHalf,
} from '../src/client/roster-order.js';
import { reconcileOrder } from '../src/client/roster.js';
import { createStore, type ChannelSummary } from '../src/client/store.js';

function channel(id: string, updatedAt: string, patch?: Partial<ChannelSummary>): ChannelSummary {
  return {
    id,
    type: 'group',
    name: id,
    members: [],
    createdAt: updatedAt,
    updatedAt,
    ...patch,
  };
}

describe('scope sort mode resolution', () => {
  it('prefers a section override over the global default', () => {
    expect(resolvedSortMode('manual', 'updated')).toBe('manual');
    expect(resolvedSortMode('updated', 'manual')).toBe('updated');
  });

  it('follows the global default when the scope has no override', () => {
    expect(resolvedSortMode(undefined, 'updated')).toBe('updated');
    expect(resolvedSortMode(undefined, 'manual')).toBe('manual');
  });
});

describe('scope channel ordering', () => {
  const older = channel('b-old', '2026-09-18T10:00:00.000Z');
  const newer = channel('a-new', '2026-09-19T10:00:00.000Z');
  const middle = channel('c-mid', '2026-09-18T18:00:00.000Z');

  it('orders updated mode newest first without mutating the input', () => {
    const input = [older, newer, middle];
    const ordered = orderScopeChannels(input, 'updated');

    expect(ordered.map((entry) => entry.id)).toEqual(['a-new', 'c-mid', 'b-old']);
    expect(input.map((entry) => entry.id)).toEqual(['b-old', 'a-new', 'c-mid']);
  });

  it('breaks equal timestamps by id and sorts unparsable timestamps last', () => {
    const at = '2026-09-19T10:00:00.000Z';
    const ordered = orderScopeChannels(
      [
        channel('z', at),
        channel('a', at),
        channel('broken-z', 'not-a-date'),
        channel('broken-a', 'also-not-a-date'),
      ],
      'updated',
    );

    expect(ordered.map((entry) => entry.id)).toEqual(['a', 'z', 'broken-a', 'broken-z']);
  });

  it('uses the stored manual order before the roster order', () => {
    const ordered = orderScopeChannels([newer, older, middle], 'manual', ['b-old', 'c-mid']);

    expect(ordered.map((entry) => entry.id)).toEqual(['b-old', 'c-mid', 'a-new']);
  });

  it('drops stored ids that are no longer visible and appends new channels', () => {
    const ordered = orderScopeChannels([middle, newer], 'manual', ['gone', 'c-mid', 'c-mid']);

    expect(ordered.map((entry) => entry.id)).toEqual(['c-mid', 'a-new']);
  });

  it('keeps roster order for a manual scope without a stored order (未分组)', () => {
    expect(orderScopeChannels([older, newer], 'manual').map((entry) => entry.id)).toEqual([
      'b-old',
      'a-new',
    ]);
  });
});

describe('membership reconciliation', () => {
  it('keeps known preferred ids first and appends the omitted ones in place order', () => {
    expect(reconcileOrder(['c3', 'c1'], ['c1', 'c2', 'c3'])).toEqual(['c3', 'c1', 'c2']);
    expect(reconcileOrder(['ghost', 'c2', 'c2'], ['c1', 'c2'])).toEqual(['c2', 'c1']);
    expect(reconcileOrder([], ['c1', 'c2'])).toEqual(['c1', 'c2']);
  });

  it('never invents or drops members', () => {
    const members = ['a', 'b', 'c'];
    const reconciled = reconcileOrder(['c', 'a', 'ghost'], members);

    expect([...reconciled].sort()).toEqual([...members].sort());
  });
});

describe('in-scope drag math', () => {
  it('detects the half-row side from the pointer position', () => {
    const rect = { top: 100, height: 32 };

    expect(rowDropHalf(101, rect)).toBe('before');
    expect(rowDropHalf(115, rect)).toBe('before');
    expect(rowDropHalf(116, rect)).toBe('after');
    expect(rowDropHalf(131, rect)).toBe('after');
  });

  it('moves a row before or after the target', () => {
    expect(moveWithinOrder(['a', 'b', 'c'], 'a', 'c', 'after')).toEqual(['b', 'c', 'a']);
    expect(moveWithinOrder(['a', 'b', 'c'], 'c', 'a', 'before')).toEqual(['c', 'a', 'b']);
    expect(moveWithinOrder(['a', 'b', 'c'], 'b', 'a', 'before')).toEqual(['b', 'a', 'c']);
  });

  it('treats adjacent drops and unknown ids as no-ops', () => {
    expect(moveWithinOrder(['a', 'b', 'c'], 'a', 'b', 'before')).toBeUndefined();
    expect(moveWithinOrder(['a', 'b', 'c'], 'b', 'a', 'after')).toBeUndefined();
    expect(moveWithinOrder(['a', 'b'], 'a', 'a', 'before')).toBeUndefined();
    expect(moveWithinOrder(['a', 'b'], 'missing', 'b', 'before')).toBeUndefined();
    expect(moveWithinOrder(['a', 'b'], 'a', 'missing', 'before')).toBeUndefined();
  });
});

describe('scope drop commit', () => {
  it('freezes the order and flips the scope while it is still automatic', () => {
    expect(commitScopeReorder(['a', 'b', 'c'], 'a', 'c', 'after', false)).toEqual({
      order: ['b', 'c', 'a'],
      setManualOverride: true,
    });
  });

  it('only rewrites the order once the scope is manual', () => {
    expect(commitScopeReorder(['a', 'b', 'c'], 'c', 'a', 'before', true)).toEqual({
      order: ['c', 'a', 'b'],
      setManualOverride: false,
    });
  });

  it('reports nothing for a no-op drop', () => {
    expect(commitScopeReorder(['a', 'b'], 'a', 'b', 'before', false)).toBeUndefined();
  });

  it('reorders section ids with the same insert math as rows', () => {
    expect(moveWithinOrder(['s1', 's2', 's3'], 's3', 's1', 'before')).toEqual(['s3', 's1', 's2']);
    expect(moveWithinOrder(['s1', 's2', 's3'], 's1', 's2', 'before')).toBeUndefined();
    expect(moveWithinOrder(['s1', 's2'], 's2', 's1', 'after')).toBeUndefined();
  });
});

describe('cross-scope drop planning', () => {
  it('inserts before or after a target row and flips the target section to manual', () => {
    expect(
      planChannelMove('s1', 'x', {
        targetScopeId: 's2',
        target: { kind: 'row', channelId: 'b', half: 'before' },
        targetOrder: ['a', 'b', 'c'],
        targetManualOverride: false,
      }),
    ).toEqual({
      kind: 'section',
      sectionId: 's2',
      order: ['a', 'x', 'b', 'c'],
      setManualOverride: true,
    });
    expect(
      planChannelMove('s1', 'x', {
        targetScopeId: 's2',
        target: { kind: 'row', channelId: 'c', half: 'after' },
        targetOrder: ['a', 'b', 'c'],
        targetManualOverride: false,
      }),
    ).toEqual({
      kind: 'section',
      sectionId: 's2',
      order: ['a', 'b', 'c', 'x'],
      setManualOverride: true,
    });
  });

  it('keeps an already-manual target frozen', () => {
    expect(
      planChannelMove('s1', 'x', {
        targetScopeId: 's2',
        target: { kind: 'row', channelId: 'a', half: 'before' },
        targetOrder: ['a', 'b'],
        targetManualOverride: true,
      }),
    ).toEqual({
      kind: 'section',
      sectionId: 's2',
      order: ['x', 'a', 'b'],
      setManualOverride: false,
    });
  });

  it('moves into 未分组 without an order or a mode change', () => {
    expect(
      planChannelMove('s1', 'x', {
        targetScopeId: undefined,
        target: { kind: 'row', channelId: 'u', half: 'after' },
        targetOrder: ['u', 'v'],
        targetManualOverride: false,
      }),
    ).toEqual({ kind: 'ungrouped', setManualOverride: false });
  });

  it('treats drops inside 未分组 and onto the dragged row as no-ops', () => {
    expect(
      planChannelMove(undefined, 'u', {
        targetScopeId: undefined,
        target: { kind: 'row', channelId: 'v', half: 'before' },
        targetOrder: ['u', 'v'],
        targetManualOverride: false,
      }),
    ).toBeUndefined();
    expect(
      planChannelMove('s1', 'x', {
        targetScopeId: 's1',
        target: { kind: 'row', channelId: 'x', half: 'after' },
        targetOrder: ['x', 'y'],
        targetManualOverride: true,
      }),
    ).toBeUndefined();
  });

  it('treats an unknown target row as a no-op', () => {
    expect(
      planChannelMove('s1', 'x', {
        targetScopeId: 's2',
        target: { kind: 'row', channelId: 'ghost', half: 'before' },
        targetOrder: ['a', 'b'],
        targetManualOverride: false,
      }),
    ).toBeUndefined();
  });

  it('appends through a scope target (the context-menu pick)', () => {
    expect(
      planChannelMove(undefined, 'x', {
        targetScopeId: 's2',
        target: { kind: 'scope' },
        targetOrder: ['a', 'b'],
        targetManualOverride: false,
      }),
    ).toEqual({
      kind: 'section',
      sectionId: 's2',
      order: ['a', 'b', 'x'],
      setManualOverride: true,
    });
    expect(
      planChannelMove('s1', 'x', {
        targetScopeId: undefined,
        target: { kind: 'scope' },
        targetOrder: ['u'],
        targetManualOverride: false,
      }),
    ).toEqual({ kind: 'ungrouped', setManualOverride: false });
  });

  it('treats a context-menu pick of the current scope as a no-op', () => {
    expect(
      planChannelMove('s2', 'x', {
        targetScopeId: 's2',
        target: { kind: 'scope' },
        targetOrder: ['x', 'y'],
        targetManualOverride: true,
      }),
    ).toBeUndefined();
    expect(
      planChannelMove(undefined, 'u', {
        targetScopeId: undefined,
        target: { kind: 'scope' },
        targetOrder: ['u'],
        targetManualOverride: false,
      }),
    ).toBeUndefined();
  });

  it('reorders inside a scope only when the visible order really changes', () => {
    expect(
      planChannelMove('s1', 'a', {
        targetScopeId: 's1',
        target: { kind: 'row', channelId: 'c', half: 'after' },
        targetOrder: ['a', 'b', 'c'],
        targetManualOverride: true,
      }),
    ).toEqual({
      kind: 'section',
      sectionId: 's1',
      order: ['b', 'c', 'a'],
      setManualOverride: false,
    });
    expect(
      planChannelMove('s1', 'a', {
        targetScopeId: 's1',
        target: { kind: 'row', channelId: 'b', half: 'before' },
        targetOrder: ['a', 'b', 'c'],
        targetManualOverride: false,
      }),
    ).toBeUndefined();
  });

  it('drops against the full unfiltered target order', () => {
    expect(
      planChannelMove('s1', 'x', {
        targetScopeId: 's2',
        target: { kind: 'row', channelId: 'a', half: 'before' },
        targetOrder: ['a', 'b', 'c'],
        targetManualOverride: false,
      }),
    ).toEqual({
      kind: 'section',
      sectionId: 's2',
      order: ['x', 'a', 'b', 'c'],
      setManualOverride: true,
    });
  });
});

describe('channel move application', () => {
  it('unlocks the target section before the positioned move', () => {
    const calls: string[] = [];
    applyChannelMove(
      {
        assignToUngrouped: (channelId) => calls.push(`ungrouped:${channelId}`),
        moveToSection: (channelId, sectionId, order) =>
          calls.push(`move:${channelId}:${sectionId}:${order.join(',')}`),
        setSectionManual: (sectionId) => calls.push(`manual:${sectionId}`),
      },
      'x',
      { kind: 'section', sectionId: 's2', order: ['a', 'x'], setManualOverride: true },
    );

    expect(calls).toEqual(['manual:s2', 'move:x:s2:a,x']);
  });

  it('routes 未分组 plans through the single assign without touching any mode', () => {
    const calls: string[] = [];
    applyChannelMove(
      {
        assignToUngrouped: (channelId) => calls.push(`ungrouped:${channelId}`),
        moveToSection: (channelId) => calls.push(`move:${channelId}`),
        setSectionManual: (sectionId) => calls.push(`manual:${sectionId}`),
      },
      'x',
      { kind: 'ungrouped', setManualOverride: false },
    );

    expect(calls).toEqual(['ungrouped:x']);
  });

  it('does not rewrite the mode when the target section is already manual', () => {
    const calls: string[] = [];
    applyChannelMove(
      {
        assignToUngrouped: (channelId) => calls.push(`ungrouped:${channelId}`),
        moveToSection: (channelId, sectionId) => calls.push(`move:${channelId}:${sectionId}`),
        setSectionManual: (sectionId) => calls.push(`manual:${sectionId}`),
      },
      'x',
      { kind: 'section', sectionId: 's2', order: ['x'], setManualOverride: false },
    );

    expect(calls).toEqual(['move:x:s2']);
  });
});

describe('empty section drop', () => {
  it('places a pinned member at the predicted first position in its original row-less section', () => {
    expect(
      planChannelMove('s1', 'pinned', {
        targetScopeId: 's1',
        target: { kind: 'scope', position: 'first' },
        targetOrder: ['a', 'b'],
        targetManualOverride: false,
      }),
    ).toEqual({
      kind: 'section',
      sectionId: 's1',
      order: ['pinned', 'a', 'b'],
      setManualOverride: true,
    });
  });

  it('appends at index 0 and flips an automatic target to manual', () => {
    expect(
      planChannelMove(undefined, 'x', {
        targetScopeId: 's-empty',
        target: { kind: 'scope' },
        targetOrder: [],
        targetManualOverride: false,
      }),
    ).toEqual({
      kind: 'section',
      sectionId: 's-empty',
      order: ['x'],
      setManualOverride: true,
    });
  });

  it('moves from a section into an empty section and freezes index 0', () => {
    const plan = planChannelMove('s1', 'x', {
      targetScopeId: 's-empty',
      target: { kind: 'scope' },
      targetOrder: [],
      targetManualOverride: false,
    });
    expect(plan).toEqual({
      kind: 'section',
      sectionId: 's-empty',
      order: ['x'],
      setManualOverride: true,
    });
    const calls: string[] = [];
    applyChannelMove(
      {
        assignToUngrouped: (channelId) => calls.push(`ungrouped:${channelId}`),
        moveToSection: (channelId, sectionId, order) =>
          calls.push(`move:${channelId}:${sectionId}:${order.join(',')}`),
        setSectionManual: (sectionId) => calls.push(`manual:${sectionId}`),
      },
      'x',
      plan ?? { kind: 'ungrouped', setManualOverride: false },
    );
    expect(calls).toEqual(['manual:s-empty', 'move:x:s-empty:x']);
  });

  it('keeps an already-manual empty target frozen without a mode rewrite', () => {
    expect(
      planChannelMove(undefined, 'x', {
        targetScopeId: 's-empty',
        target: { kind: 'scope' },
        targetOrder: [],
        targetManualOverride: true,
      }),
    ).toEqual({
      kind: 'section',
      sectionId: 's-empty',
      order: ['x'],
      setManualOverride: false,
    });
  });

  it('treats a row target against an empty order as a no-op (the body is the anchor)', () => {
    expect(
      planChannelMove(undefined, 'x', {
        targetScopeId: 's-empty',
        target: { kind: 'row', channelId: 'ghost', half: 'before' },
        targetOrder: [],
        targetManualOverride: false,
      }),
    ).toBeUndefined();
  });
});

describe('flat order completion', () => {
  it('excludes every pinned Channel and includes unpinned renderable Channels', () => {
    expect(
      flatRosterChannelIds(
        [
          channel('group', '2026-09-18T10:00:00.000Z'),
          channel('dm-loose', '2026-09-18T10:00:00.000Z', {
            type: 'dm',
            botSlug: 'loose-bot',
          }),
          channel('dm-pinned', '2026-09-18T10:00:00.000Z', {
            type: 'dm',
            botSlug: 'pinned-bot',
          }),
          channel('dm-orphan', '2026-09-18T10:00:00.000Z', { type: 'dm' }),
        ],
        new Set(['group', 'dm-pinned']),
      ),
    ).toEqual(['dm-loose']);
  });

  it('resolves legacy PersonaBot slug pins to canonical DM Channel ids', () => {
    const channels = [
      channel('group', '2026-09-18T10:00:00.000Z'),
      channel('dm-ada', '2026-09-18T10:00:00.000Z', {
        type: 'dm',
        botSlug: 'ada',
      }),
    ];

    expect(resolvePinnedChannelIds(channels, ['ada', 'group', 'ada', 'missing'])).toEqual([
      'dm-ada',
      'group',
    ]);
  });

  it('keeps stored entries and appends unknown channels at the end', () => {
    expect(
      completeFlatEntries(
        [
          { kind: 'section', id: 's1' },
          { kind: 'channel', id: 'loose' },
          { kind: 'section', id: 'ghost' },
          { kind: 'channel', id: 'c-in-section' },
        ],
        ['s1', 's2'],
        ['c-in-section', 'loose', 'fresh'],
        new Set(['c-in-section']),
      ),
    ).toEqual([
      { kind: 'section', id: 's1' },
      { kind: 'channel', id: 'loose' },
      { kind: 'channel', id: 'fresh' },
    ]);
  });

  it('projects legacy state as sections then unsectioned channels', () => {
    expect(completeFlatEntries(undefined, ['s1', 's2'], ['a', 'b'], new Set(['a']))).toEqual([
      { kind: 'section', id: 's1' },
      { kind: 'section', id: 's2' },
      { kind: 'channel', id: 'b' },
    ]);
    expect(completeFlatEntries(undefined, [], [], new Set())).toEqual([]);
  });
});

describe('block-level drop resolution', () => {
  const rows = [
    { id: 'a', top: 100, height: 32 },
    { id: 'b', top: 134, height: 32 },
  ];

  it('resolves an empty body to the scope itself', () => {
    expect(resolveBlockDropTarget([], 80, 200)).toEqual({ kind: 'scope' });
  });

  it('resolves the header area to an insert before the first row', () => {
    expect(resolveBlockDropTarget(rows, 90, 80)).toEqual({
      kind: 'row',
      channelId: 'a',
      half: 'before',
    });
    expect(resolveBlockDropTarget(rows, 90, 90)).toEqual({
      kind: 'row',
      channelId: 'a',
      half: 'before',
    });
  });

  it('resolves body positions to the nearest row half', () => {
    expect(resolveBlockDropTarget(rows, 90, 100)).toEqual({
      kind: 'row',
      channelId: 'a',
      half: 'before',
    });
    expect(resolveBlockDropTarget(rows, 90, 130)).toEqual({
      kind: 'row',
      channelId: 'b',
      half: 'before',
    });
    expect(resolveBlockDropTarget(rows, 90, 200)).toEqual({
      kind: 'row',
      channelId: 'b',
      half: 'after',
    });
  });

  it('turns a loose-channel drop on a populated section header into membership', () => {
    const target = resolveBlockDropTarget(rows, 90, 80);
    const plan = planChannelMove(undefined, 'loose', {
      targetScopeId: 's1',
      target,
      targetOrder: rows.map((row) => row.id),
      targetManualOverride: false,
    });
    const sink = {
      assignToUngrouped: vi.fn(),
      moveToSection: vi.fn(),
      setSectionManual: vi.fn(),
    };

    expect(plan).toEqual({
      kind: 'section',
      sectionId: 's1',
      order: ['loose', 'a', 'b'],
      setManualOverride: true,
    });
    if (plan === undefined) throw new Error('expected a section move');
    applyChannelMove(sink, 'loose', plan);
    expect(sink.setSectionManual).toHaveBeenCalledWith('s1');
    expect(sink.moveToSection).toHaveBeenCalledWith('loose', 's1', ['loose', 'a', 'b']);
    expect(sink.assignToUngrouped).not.toHaveBeenCalled();
  });
});

describe('loose flat inserts', () => {
  const flat = [
    { kind: 'section', id: 's1' },
    { kind: 'channel', id: 'loose' },
    { kind: 'section', id: 's2' },
  ] as const;
  const entries = flat.map((entry) => ({ ...entry }));

  it('inserts a sectioned channel beside a section anchor and unassigns it', () => {
    expect(
      planFlatInsert(entries, 'x', true, { kind: 'section', id: 's2', side: 'before' }),
    ).toEqual({
      order: [
        { kind: 'section', id: 's1' },
        { kind: 'channel', id: 'loose' },
        { kind: 'channel', id: 'x' },
        { kind: 'section', id: 's2' },
      ],
      unassign: true,
    });
    expect(
      planFlatInsert(entries, 'x', true, { kind: 'section', id: 's2', side: 'after' }),
    ).toEqual({
      order: [
        { kind: 'section', id: 's1' },
        { kind: 'channel', id: 'loose' },
        { kind: 'section', id: 's2' },
        { kind: 'channel', id: 'x' },
      ],
      unassign: true,
    });
  });

  it('removes a preserved pinned source entry before inserting at the drop target', () => {
    expect(
      planFlatInsert(
        [
          { kind: 'channel', id: 'pinned' },
          { kind: 'section', id: 's1' },
          { kind: 'channel', id: 'target' },
        ],
        'pinned',
        true,
        { kind: 'channel', id: 'target', side: 'after' },
      ),
    ).toEqual({
      order: [
        { kind: 'section', id: 's1' },
        { kind: 'channel', id: 'target' },
        { kind: 'channel', id: 'pinned' },
      ],
      unassign: true,
    });
  });

  it('moves a loose channel beside a channel anchor without a membership step', () => {
    expect(
      planFlatInsert(entries, 'loose', false, { kind: 'channel', id: 'loose', side: 'after' }),
    ).toBeUndefined();
    expect(
      planFlatInsert(entries, 'loose', false, { kind: 'section', id: 's1', side: 'before' }),
    ).toEqual({
      order: [
        { kind: 'channel', id: 'loose' },
        { kind: 'section', id: 's1' },
        { kind: 'section', id: 's2' },
      ],
      unassign: false,
    });
  });

  it('treats unknown anchors and inconsistent sources as no-ops', () => {
    expect(
      planFlatInsert(entries, 'x', true, { kind: 'section', id: 'ghost', side: 'before' }),
    ).toBeUndefined();
    expect(
      planFlatInsert(entries, 'ghost', false, { kind: 'section', id: 's1', side: 'before' }),
    ).toBeUndefined();
  });
});

describe('recency order for loose rows', () => {
  const message = (at: string) => ({ id: at, at, author: { kind: 'human' as const }, body: at });
  const a = channel('a', '2026-10-13T09:00:00.000Z', {
    latestMessage: message('2026-10-13T01:00:00.000Z'),
  });
  const b = channel('b', '2026-10-13T02:00:00.000Z', {
    latestMessage: message('2026-10-13T02:00:00.000Z'),
  });
  const c = channel('c', '2026-10-13T03:00:00.000Z');
  const byId = new Map([a, b, c].map((item) => [item.id, item]));
  const entries = [
    { kind: 'channel' as const, id: 'a' },
    { kind: 'channel' as const, id: 'b' },
    { kind: 'section' as const, id: 's' },
    { kind: 'channel' as const, id: 'c' },
    { kind: 'channel' as const, id: 'missing' },
  ];

  it('sorts each loose run by its latest message, leaving sections in place', () => {
    expect(orderFlatEntries(entries, byId, 'updated')).toEqual([
      { kind: 'channel', id: 'b' },
      { kind: 'channel', id: 'a' },
      { kind: 'section', id: 's' },
      { kind: 'channel', id: 'c' },
      { kind: 'channel', id: 'missing' },
    ]);
    expect(orderFlatEntries(entries, byId, 'manual')).toEqual(entries);
  });

  it('updates a listed Channel in place instead of moving it first', () => {
    const store = createStore();
    store.setRoster([], [a, b, c]);
    store.upsertChannel({ ...c, name: 'renamed' });
    expect(store.getSnapshot().channels.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(store.getSnapshot().channels[2]?.name).toBe('renamed');
    store.upsertChannel(channel('d', '2026-10-13T04:00:00.000Z'));
    expect(store.getSnapshot().channels.map((item) => item.id)).toEqual(['d', 'a', 'b', 'c']);
  });
});
