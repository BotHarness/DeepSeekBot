import { storedState, storedSection, storedWriteCount } from './roster-fixture.js';
import { createTestRosterStore } from './roster-fixture.js';
import { describe, expect, it, vi } from 'vitest';

import { rosterDomainSpec, rosterDomainState, rosterSectionRecord } from '../src/roster/spec.js';
import { RosterUnavailableError, RosterUnknownSectionError } from '../src/roster/store.js';
import { createFakeRosterDomain } from './roster-fixture.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('roster domain spec', () => {
  it('declares the botharness_roster identity on the default layout', () => {
    expect(rosterDomainSpec.name).toBe('botharness_roster');
    expect(rosterDomainSpec.version).toBe(1);
    expect(rosterDomainSpec.layout).toBe('single');
    expect(Object.keys(rosterDomainSpec.tables)).toEqual(['sections']);
  });

  it('validates the global singleton and rejects null', () => {
    expect(rosterDomainState.parse({ pins: ['ada'], sectionOrder: ['s1'] })).toEqual({
      pins: ['ada'],
      sectionOrder: ['s1'],
    });
    expect(rosterDomainState.safeParse(null).success).toBe(false);
    expect(rosterDomainState.safeParse({ pins: [], sectionOrder: 'nope' }).success).toBe(false);
    expect(rosterDomainState.safeParse({ pins: 'ada', sectionOrder: [] }).success).toBe(false);
  });

  it('validates section records', () => {
    expect(rosterSectionRecord.parse({ name: '研究', channelIds: ['c1'] })).toEqual({
      name: '研究',
      channelIds: ['c1'],
    });
    expect(rosterSectionRecord.safeParse({ name: '研究' }).success).toBe(false);
    expect(rosterSectionRecord.safeParse({ name: '研究', channelIds: [1] }).success).toBe(false);
  });
});

describe('roster store', () => {
  it('reports storage-unavailable for reads and writes and warns once without a domain', async () => {
    const warn = vi.fn();
    const store = createTestRosterStore({ warn });

    expect(store.available).toBe(false);
    expect(() => store.snapshot()).toThrow(RosterUnavailableError);
    await expect(store.sectionCreate('A')).rejects.toBeInstanceOf(RosterUnavailableError);
    await expect(store.channelAssign('c1', undefined)).rejects.toBeInstanceOf(
      RosterUnavailableError,
    );
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('notifies subscribers only after a roster write settles', async () => {
    const fake = createFakeRosterDomain();
    const snapshots: string[][] = [];
    const store = createTestRosterStore({
      onCommitted: () => snapshots.push(store.snapshot().pins),
    });
    await store.attach(fake.facility);
    snapshots.length = 0;
    await store.pinsSet(['channel-a']);
    expect(snapshots).toEqual([['channel-a']]);
    await expect(store.channelAssign('channel-a', 'missing')).rejects.toBeInstanceOf(
      RosterUnknownSectionError,
    );
    expect(snapshots).toEqual([['channel-a']]);
  });

  it('creates a host-generated id and prepends the section to the order', async () => {
    const fake = createFakeRosterDomain();
    const store = createTestRosterStore();
    await store.attach(fake.facility);

    const first = await store.sectionCreate('研究');
    const second = await store.sectionCreate('工作流');

    expect(first.id).toMatch(UUID_RE);
    expect(first.id).not.toMatch(/^section-/);
    expect(storedSection(store, first.id)).toEqual({ name: '研究', channelIds: [] });
    expect(storedState(store)).toEqual({ pins: [], sectionOrder: [second.id, first.id] });
    expect(store.snapshot()).toEqual({
      pins: [],
      hidden: [],
      muted: [],
      sectionOrder: [second.id, first.id],
      sections: [
        { id: second.id, name: '工作流', channelIds: [] },
        { id: first.id, name: '研究', channelIds: [] },
      ],
      topOrder: undefined,
    });
  });

  it('renames a section, skips an unchanged name, and rejects unknown ids', async () => {
    const fake = createFakeRosterDomain();
    const store = createTestRosterStore();
    await store.attach(fake.facility);
    const section = await store.sectionCreate('旧名');

    const renamed = await store.sectionRename(section.id, '新名');
    expect(renamed).toEqual({ id: section.id, name: '新名', channelIds: [] });
    expect(storedSection(store, section.id)?.name).toBe('新名');

    const puts = storedWriteCount(store);
    await store.sectionRename(section.id, '新名');
    expect(storedWriteCount(store)).toBe(puts);

    await expect(store.sectionRename('missing', 'X')).rejects.toBeInstanceOf(
      RosterUnknownSectionError,
    );
  });

  it('removes a section and its order slot while leaving other sections intact', async () => {
    const fake = createFakeRosterDomain();
    const store = createTestRosterStore();
    await store.attach(fake.facility);
    const first = await store.sectionCreate('A');
    const second = await store.sectionCreate('B');
    await store.channelAssign('c1', first.id);
    await store.channelAssign('c2', second.id);

    await expect(store.sectionRemove(first.id)).resolves.toBe(true);
    expect(await store.sectionRemove(first.id)).toBe(false);
    expect(storedSection(store, first.id) !== undefined).toBe(false);
    expect(storedState(store)).toEqual({ pins: [], sectionOrder: [second.id] });
    expect(store.snapshot().sections).toEqual([{ id: second.id, name: 'B', channelIds: ['c2'] }]);
  });

  it('assigns a channel once, moving it out of its previous section', async () => {
    const fake = createFakeRosterDomain();
    const store = createTestRosterStore();
    await store.attach(fake.facility);
    const first = await store.sectionCreate('A');
    const second = await store.sectionCreate('B');
    await store.channelAssign('c1', first.id);

    await store.channelAssign('c1', second.id);

    expect(storedSection(store, first.id)?.channelIds).toEqual([]);
    expect(storedSection(store, second.id)?.channelIds).toEqual(['c1']);

    await store.channelAssign('c1', undefined);
    expect(storedSection(store, second.id)?.channelIds).toEqual([]);

    const puts = storedWriteCount(store);
    await store.channelAssign('c1', undefined);
    expect(storedWriteCount(store)).toBe(puts);
  });

  it('positions an assigned channel at the requested index', async () => {
    const fake = createFakeRosterDomain();
    const store = createTestRosterStore();
    await store.attach(fake.facility);
    const section = await store.sectionCreate('A');
    await store.channelAssign('c1', section.id);
    await store.channelAssign('c2', section.id);
    await store.channelAssign('c3', section.id);

    await store.channelAssign('c3', section.id, 0);

    expect(storedSection(store, section.id)?.channelIds).toEqual(['c3', 'c1', 'c2']);
    await expect(store.channelAssign('c1', 'missing')).rejects.toBeInstanceOf(
      RosterUnknownSectionError,
    );
  });

  it('reorders known section ids and keeps omitted ids after them', async () => {
    const fake = createFakeRosterDomain();
    const store = createTestRosterStore();
    await store.attach(fake.facility);
    const first = await store.sectionCreate('A');
    const second = await store.sectionCreate('B');
    const third = await store.sectionCreate('C');

    await expect(store.sectionReorder([third.id, 'ghost', first.id])).resolves.toEqual([
      third.id,
      first.id,
      second.id,
    ]);
    expect(storedState(store).sectionOrder).toEqual([third.id, first.id, second.id]);

    const sets = storedWriteCount(store);
    await store.sectionReorder([third.id, first.id, second.id]);
    expect(storedWriteCount(store)).toBe(sets);
  });

  it('sets pins with duplicates dropped and writes only on change', async () => {
    const fake = createFakeRosterDomain();
    const store = createTestRosterStore();
    await store.attach(fake.facility);

    await expect(store.pinsSet(['ada', 'ada', '', 'scout'])).resolves.toEqual(['ada', 'scout']);
    expect(storedState(store).pins).toEqual(['ada', 'scout']);

    const sets = storedWriteCount(store);
    await store.pinsSet(['ada', 'scout']);
    expect(storedWriteCount(store)).toBe(sets);
  });

  it('applies pin, unpin, and hide batches with one write and notification each', async () => {
    const fake = createFakeRosterDomain({
      state: { pins: ['legacy-bot'], sectionOrder: [], topOrder: [] },
    });
    const onCommitted = vi.fn();
    const store = createTestRosterStore({ onCommitted });
    await store.attach(fake.facility);
    onCommitted.mockClear();

    const pinned = await store.applyBatch({ action: 'pin', channelIds: ['c1', 'c2'] }, (pin) =>
      pin === 'legacy-bot' ? 'dm-legacy-bot' : pin,
    );
    expect(pinned.pins).toEqual(['dm-legacy-bot', 'c1', 'c2']);
    expect(storedWriteCount(store)).toBe(1);
    expect(onCommitted).toHaveBeenCalledTimes(1);

    const unpinned = await store.applyBatch({ action: 'unpin', channelIds: ['c1', 'c2'] });
    expect(unpinned.pins).toEqual(['dm-legacy-bot']);
    expect(storedWriteCount(store)).toBe(2);
    expect(onCommitted).toHaveBeenCalledTimes(2);

    const hidden = await store.applyBatch({ action: 'hide', channelIds: ['c1', 'c2'] });
    expect(hidden.hidden).toEqual(['c1', 'c2']);
    expect(storedWriteCount(store)).toBe(3);
    expect(onCommitted).toHaveBeenCalledTimes(3);

    const maxIds = Array.from({ length: 100 }, (_, index) => `bulk-${index}`);
    const fullBatch = await store.applyBatch({ action: 'pin', channelIds: maxIds });
    expect(fullBatch.pins).toHaveLength(101);
    expect(storedWriteCount(store)).toBe(4);
    expect(onCommitted).toHaveBeenCalledTimes(4);

    await expect(
      store.applyBatch({
        action: 'pin',
        channelIds: Array.from({ length: 101 }, (_, index) => `c${index}`),
      }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(storedWriteCount(store)).toBe(4);
    expect(onCommitted).toHaveBeenCalledTimes(4);
  });

  it('moves a batch across sections or back to loose with one final notification', async () => {
    const fake = createFakeRosterDomain({
      records: {
        s1: { name: 'Source', channelIds: ['c1', 'c2', 'c5'] },
        s2: { name: 'Target', channelIds: ['c3'] },
      },
      state: {
        pins: ['c1', 'c2'],
        sectionOrder: ['s1', 's2'],
        topOrder: [
          { kind: 'section', id: 's1' },
          { kind: 'channel', id: 'c4' },
          { kind: 'section', id: 's2' },
        ],
      },
    });
    const onCommitted = vi.fn();
    const store = createTestRosterStore({ onCommitted });
    await store.attach(fake.facility);
    onCommitted.mockClear();

    const grouped = await store.applyBatch({
      action: 'move',
      channelIds: ['c1', 'c2'],
      sectionId: 's2',
    });
    expect(grouped.pins).toEqual([]);
    expect(grouped.sections).toEqual([
      { id: 's1', name: 'Source', channelIds: ['c5'] },
      { id: 's2', name: 'Target', channelIds: ['c3', 'c1', 'c2'] },
    ]);
    expect(storedWriteCount(store)).toBe(1);
    expect(onCommitted).toHaveBeenCalledTimes(1);

    const loose = await store.applyBatch({ action: 'move', channelIds: ['c1', 'c2'] });
    expect(loose.sections[1]?.channelIds).toEqual(['c3']);
    expect(loose.topOrder).toEqual([
      { kind: 'section', id: 's1' },
      { kind: 'channel', id: 'c4' },
      { kind: 'section', id: 's2' },
      { kind: 'channel', id: 'c1' },
      { kind: 'channel', id: 'c2' },
    ]);
    expect(storedWriteCount(store)).toBe(2);
    expect(onCommitted).toHaveBeenCalledTimes(2);

    await expect(
      store.applyBatch({ action: 'move', channelIds: ['c1', 'c2'], sectionId: 'missing' }),
    ).rejects.toBeInstanceOf(RosterUnknownSectionError);
    expect(storedWriteCount(store)).toBe(2);
    expect(onCommitted).toHaveBeenCalledTimes(2);
  });

  it('mutes and unmutes one Channel at a time without writing no-ops', async () => {
    const fake = createFakeRosterDomain({ state: { pins: ['c1'], sectionOrder: [] } });
    const store = createTestRosterStore();
    await store.attach(fake.facility);

    await expect(store.mutedSet('c3', true)).resolves.toEqual(['c3']);
    const writes = storedWriteCount(store);
    await expect(store.mutedSet('c3', true)).resolves.toEqual(['c3']);
    expect(storedWriteCount(store)).toBe(writes);
    expect(store.snapshot()).toMatchObject({ pins: ['c1'], muted: ['c3'] });
    await expect(store.mutedSet('c3', false)).resolves.toEqual([]);
    expect(store.snapshot().muted).toEqual([]);
  });

  it('sets hidden Channel ids without changing their placement or writing no-ops', async () => {
    const fake = createFakeRosterDomain({
      records: { s1: { name: 'A', channelIds: ['c1'] } },
      state: { pins: ['c1'], sectionOrder: ['s1'] },
    });
    const store = createTestRosterStore();
    await store.attach(fake.facility);

    await expect(store.hiddenSet(['c1', 'c1', '', 'c2'])).resolves.toEqual(['c1', 'c2']);
    expect(storedState(store)).toEqual({
      pins: ['c1'],
      hidden: ['c1', 'c2'],
      sectionOrder: ['s1'],
    });
    expect(store.snapshot()).toMatchObject({
      pins: ['c1'],
      hidden: ['c1', 'c2'],
      sections: [{ id: 's1', channelIds: ['c1'] }],
    });

    const sets = storedWriteCount(store);
    await store.hiddenSet(['c1', 'c2']);
    expect(storedWriteCount(store)).toBe(sets);
  });

  it('disables roster commands after detach while the imported source stays closed', async () => {
    const fake = createFakeRosterDomain();
    const store = createTestRosterStore();
    await store.attach(fake.facility);

    await store.detach();

    expect(fake.closeCount()).toBe(1);
    expect(store.available).toBe(false);
    await expect(store.pinsSet(['ada'])).rejects.toBeInstanceOf(RosterUnavailableError);
  });

  it('closes a domain that resolves after detach', async () => {
    const fake = createFakeRosterDomain();
    const store = createTestRosterStore();
    const attaching = store.attach(fake.facility);
    await store.detach();
    await attaching;

    expect(fake.closeCount()).toBe(1);
    expect(store.available).toBe(false);
  });
});

describe('roster flat topOrder', () => {
  it('prepends a newly created section to an existing flat order', async () => {
    const fake = createFakeRosterDomain({
      records: { s1: { name: 'A', channelIds: [] } },
      state: {
        pins: [],
        sectionOrder: ['s1'],
        topOrder: [
          { kind: 'channel', id: 'loose' },
          { kind: 'section', id: 's1' },
        ],
      },
    });
    const store = createTestRosterStore();
    await store.attach(fake.facility);

    const created = await store.sectionCreate('最新');

    expect(storedState(store).topOrder).toEqual([
      { kind: 'section', id: created.id },
      { kind: 'channel', id: 'loose' },
      { kind: 'section', id: 's1' },
    ]);
  });

  it('projects absent topOrder as undefined and keeps legacy writes flat-free', async () => {
    const fake = createFakeRosterDomain();
    const store = createTestRosterStore();
    await store.attach(fake.facility);

    const section = await store.sectionCreate('A');
    await store.channelAssign('c1', section.id, 0);
    await store.channelAssign('c2', undefined);

    expect(store.snapshot().topOrder).toBeUndefined();
    expect(storedState(store)).toEqual({
      pins: [],
      sectionOrder: [section.id],
    });
    expect(storedSection(store, section.id)).toEqual({ name: 'A', channelIds: ['c1'] });
  });

  it('maintains the flat list across section and membership writes', async () => {
    const fake = createFakeRosterDomain({
      records: {
        s1: { name: 'A', channelIds: ['c1'] },
        s2: { name: 'B', channelIds: [] },
      },
      state: {
        pins: [],
        sectionOrder: ['s1', 's2'],
        topOrder: [
          { kind: 'section', id: 's1' },
          { kind: 'channel', id: 'loose' },
          { kind: 'section', id: 's2' },
        ],
      },
    });
    const store = createTestRosterStore();
    await store.attach(fake.facility);

    await store.channelAssign('loose', 's2', 0);
    expect(storedState(store).topOrder).toEqual([
      { kind: 'section', id: 's1' },
      { kind: 'section', id: 's2' },
    ]);

    await store.channelAssign('c1', undefined);
    expect(storedState(store).topOrder).toEqual([
      { kind: 'section', id: 's1' },
      { kind: 'section', id: 's2' },
      { kind: 'channel', id: 'c1' },
    ]);

    await store.sectionRemove('s2');
    expect(storedState(store).topOrder).toEqual([
      { kind: 'section', id: 's1' },
      { kind: 'channel', id: 'loose' },
      { kind: 'channel', id: 'c1' },
    ]);
    expect(store.snapshot().topOrder).toEqual([
      { kind: 'section', id: 's1' },
      { kind: 'channel', id: 'loose' },
      { kind: 'channel', id: 'c1' },
    ]);
  });

  it('reorders sections within the flat list while loose channels stay fixed', async () => {
    const fake = createFakeRosterDomain({
      records: {
        s1: { name: 'A', channelIds: [] },
        s2: { name: 'B', channelIds: [] },
      },
      state: {
        pins: [],
        sectionOrder: ['s1', 's2'],
        topOrder: [
          { kind: 'channel', id: 'top' },
          { kind: 'section', id: 's1' },
          { kind: 'channel', id: 'mid' },
          { kind: 'section', id: 's2' },
        ],
      },
    });
    const store = createTestRosterStore();
    await store.attach(fake.facility);

    await expect(store.sectionReorder(['s2', 's1'])).resolves.toEqual(['s2', 's1']);
    expect(storedState(store).topOrder).toEqual([
      { kind: 'channel', id: 'top' },
      { kind: 'section', id: 's2' },
      { kind: 'channel', id: 'mid' },
      { kind: 'section', id: 's1' },
    ]);
    expect(store.snapshot().sectionOrder).toEqual(['s2', 's1']);
  });

  it('writes absolute flat orders and sanitizes them', async () => {
    const fake = createFakeRosterDomain({
      records: { s1: { name: 'A', channelIds: ['c1'] } },
      state: { pins: [], sectionOrder: ['s1'], topOrder: [{ kind: 'section', id: 's1' }] },
    });
    const store = createTestRosterStore();
    await store.attach(fake.facility);

    await expect(
      store.topReorder([
        { kind: 'channel', id: 'c9' },
        { kind: 'section', id: 's1' },
        { kind: 'section', id: 'ghost' },
        { kind: 'channel', id: 'c1' },
        { kind: 'channel', id: 'c9' },
      ]),
    ).resolves.toEqual([
      { kind: 'channel', id: 'c9' },
      { kind: 'section', id: 's1' },
    ]);
    expect(storedState(store).topOrder).toEqual([
      { kind: 'channel', id: 'c9' },
      { kind: 'section', id: 's1' },
    ]);

    const sets = storedWriteCount(store);
    await store.topReorder([
      { kind: 'channel', id: 'c9' },
      { kind: 'section', id: 's1' },
    ]);
    expect(storedWriteCount(store)).toBe(sets);
  });
});
