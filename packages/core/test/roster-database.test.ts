import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
  type OperationalDatabaseOwnerOptions,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createCore } from '../src/plugin.js';
import { createRosterStore, RosterUnavailableError } from '../src/roster/store.js';
import { createFakeRosterDomain } from './roster-fixture.js';

const homes: string[] = [];
const owners: OperationalDatabaseOwner[] = [];
function home() {
  const result = mkdtempSync(join(tmpdir(), 'botharness-roster-owner-'));
  homes.push(result);
  return result;
}
function mount(dshHome: string, options: Partial<OperationalDatabaseOwnerOptions> = {}) {
  const database = mountOperationalDatabase({
    dshHome,
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    ...options,
  });
  owners.push(database);
  return database;
}
function rows(database: OperationalDatabaseOwner) {
  return attachOperationalModule(database, 'test').read((db) => ({
    records: db.prepare('SELECT body FROM roster_arrangement').all(),
    markers: db.prepare('SELECT singleton FROM roster_arrangement_import').all(),
  }));
}
function populated() {
  return createFakeRosterDomain({
    records: {
      source: { name: '研究', channelIds: ['c1', 'c2'] },
      target: { name: 'Work', channelIds: ['c3'] },
    },
    state: {
      pins: ['c2', 'loose'],
      hidden: ['c3'],
      sectionOrder: ['target', 'source'],
      topOrder: [
        { kind: 'section', id: 'target' },
        { kind: 'channel', id: 'loose' },
        { kind: 'section', id: 'source' },
      ],
    },
  });
}
afterEach(() => {
  for (const database of owners.splice(0)) database.close();
  for (const root of homes.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('roster database authority', () => {
  it('imports all arrangement fields, retains the source and reopens without the facility', async () => {
    const root = home();
    const database = mount(root);
    const source = populated();
    const original = { state: structuredClone(source.state()), records: [...source.records] };
    const store = createRosterStore({ database });
    await store.attach(source.facility);
    expect(rows(database).markers).toHaveLength(1);
    expect(store.snapshot()).toEqual({
      ...original.state,
      muted: [],
      sections: [
        { id: 'target', name: 'Work', channelIds: ['c3'] },
        { id: 'source', name: '研究', channelIds: ['c1', 'c2'] },
      ],
    });
    await store.applyBatch({ action: 'move', channelIds: ['c1', 'c2'], sectionId: 'target' });
    await store.sectionRename('source', 'Updated');
    await store.pinsSet(['loose']);
    await store.hiddenSet(['c2']);
    const expected = store.snapshot();
    expect(source.state()).toEqual(original.state);
    expect([...source.records]).toEqual(original.records);
    expect(source.putCount()).toBe(0);
    expect(source.setCount()).toBe(0);
    expect(source.closeCount()).toBe(1);
    database.close();
    const reopened = createRosterStore({ database: mount(root) });
    expect(reopened.available).toBe(true);
    expect(reopened.snapshot()).toEqual(expected);
    const open = vi.fn(async () => {
      throw new Error('damaged retained source');
    });
    await reopened.attach({ open });
    expect(open).not.toHaveBeenCalled();
    const copy = reopened.snapshot();
    copy.pins.push('corrupted-copy');
    copy.sections[0]?.channelIds.push('corrupted-copy');
    expect(reopened.snapshot()).toEqual(expected);
  });

  it('marks an empty import and ignores subsequently populated legacy input', async () => {
    const root = home();
    const database = mount(root);
    const store = createRosterStore({ database });
    await store.attach(createFakeRosterDomain().facility);
    expect(rows(database)).toMatchObject({
      records: [expect.anything()],
      markers: [{ singleton: 1 }],
    });
    database.close();
    const next = createRosterStore({ database: mount(root) });
    const source = populated();
    const open = vi.fn(source.facility.open);
    await next.attach({ open });
    expect(next.snapshot().sections).toEqual([]);
    expect(open).not.toHaveBeenCalled();
  });

  it('refuses a failed source open without creating an editable empty arrangement and retries', async () => {
    const database = mount(home());
    const warn = vi.fn();
    const store = createRosterStore({ database, warn });
    await expect(
      store.attach({
        open: async () => {
          throw new Error('private-source-secret');
        },
      }),
    ).rejects.toBeInstanceOf(RosterUnavailableError);
    expect(rows(database)).toEqual({ records: [], markers: [] });
    expect(() => store.snapshot()).toThrow(RosterUnavailableError);
    await expect(store.pinsSet(['c1'])).rejects.toBeInstanceOf(RosterUnavailableError);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private-source-secret');
    await store.attach(populated().facility);
    expect(store.available).toBe(true);
  });

  it('rejects inconsistent membership without partial records or marker', async () => {
    const database = mount(home());
    const source = populated();
    source.records.set('target', { name: 'Work', channelIds: ['c1'] });
    const store = createRosterStore({ database });
    await expect(store.attach(source.facility)).rejects.toBeInstanceOf(RosterUnavailableError);
    expect(rows(database)).toEqual({ records: [], markers: [] });
    expect(source.records.get('source')?.channelIds).toEqual(['c1', 'c2']);
    expect(source.closeCount()).toBe(1);
    source.records.set('target', { name: 'Work', channelIds: ['c3'] });
    await store.attach(source.facility);
    expect(store.snapshot().sections).toHaveLength(2);
  });

  it('never overwrites an existing target without an import marker', async () => {
    const database = mount(home());
    const retained = JSON.stringify({
      state: { pins: ['retained'], sectionOrder: [] },
      sections: [],
    });
    attachOperationalModule(database, 'test').transaction((db) =>
      db.prepare('INSERT INTO roster_arrangement VALUES(1, ?)').run(retained),
    );
    const store = createRosterStore({ database });
    await expect(store.attach(populated().facility)).rejects.toBeInstanceOf(RosterUnavailableError);
    expect(rows(database)).toEqual({ records: [{ body: retained }], markers: [] });
  });

  it('rolls back the import and marker together when commit fails', async () => {
    const root = home();
    const database = mount(root, {
      faultInjector: ({ stage }) => {
        if (stage === 'before-commit') throw new Error('interrupted');
      },
    });
    const source = populated();
    const store = createRosterStore({ database });
    await expect(store.attach(source.facility)).rejects.toBeInstanceOf(RosterUnavailableError);
    expect(database.mode).toBe('recovery');
    expect(source.putCount()).toBe(0);
    database.close();
    const next = mount(root);
    expect(rows(next)).toEqual({ records: [], markers: [] });
    await createRosterStore({ database: next }).attach(source.facility);
    expect(rows(next).markers).toHaveLength(1);
  });

  it('rolls back the whole multi-section batch including pins and root order with no publication', async () => {
    const root = home();
    let fail = false;
    const database = mount(root, {
      faultInjector: ({ stage }) => {
        if (fail && stage === 'before-commit') throw new Error('interrupted');
      },
    });
    const onCommitted = vi.fn();
    const store = createRosterStore({ database, onCommitted });
    await store.attach(populated().facility);
    const before = store.snapshot();
    onCommitted.mockClear();
    fail = true;
    await expect(
      store.applyBatch({ action: 'move', channelIds: ['c1', 'c2'], sectionId: 'target' }),
    ).rejects.toBeInstanceOf(RosterUnavailableError);
    expect(onCommitted).not.toHaveBeenCalled();
    expect(() => store.snapshot()).toThrow(RosterUnavailableError);
    database.close();
    const reopened = createRosterStore({ database: mount(root) });
    expect(reopened.snapshot()).toEqual(before);
    await reopened.applyBatch({ action: 'move', channelIds: ['c1', 'c2'], sectionId: 'target' });
    expect(reopened.snapshot().sections[0]?.channelIds).toEqual(['c3', 'c1', 'c2']);
  });

  it('contains observer failures after import and command commits', async () => {
    const database = mount(home());
    const store = createRosterStore({
      database,
      onCommitted: () => {
        throw new Error('observer');
      },
      warn: () => {
        throw new Error('observer');
      },
    });
    await expect(store.attach(populated().facility)).resolves.toBeUndefined();
    await expect(store.pinsSet(['loose'])).resolves.toEqual(['loose']);
    expect(store.snapshot().pins).toEqual(['loose']);
  });

  it('refuses competing and closed owners before opening the source or accepting commands', async () => {
    const root = home();
    const database = mount(root);
    const competitor = mount(root);
    const open = vi.fn(async () => {
      throw new Error('should not open');
    });
    const other = createRosterStore({ database: competitor });
    await expect(other.attach({ open })).rejects.toBeInstanceOf(RosterUnavailableError);
    expect(open).not.toHaveBeenCalled();
    await expect(other.sectionCreate('A')).rejects.toBeInstanceOf(RosterUnavailableError);
    expect(() => other.snapshot()).toThrow(RosterUnavailableError);
    const store = createRosterStore({ database });
    await store.attach(populated().facility);
    database.close();
    expect(store.available).toBe(false);
    await expect(store.hiddenSet(['c1'])).rejects.toBeInstanceOf(RosterUnavailableError);
  });

  it('rejects a damaged imported target during Core startup and releases its lease', () => {
    const root = home();
    const database = mount(root);
    attachOperationalModule(database, 'test').transaction((db) => {
      db.prepare('INSERT INTO roster_arrangement VALUES(1, ?)').run('{}');
      db.prepare('INSERT INTO roster_arrangement_import VALUES(1, ?)').run('2026-10-06T00:00:00Z');
    });
    database.close();
    expect(() => createCore({ dshHome: root })).toThrow(RosterUnavailableError);
    expect(mount(root).mode).toBe('ready');
  });
});
