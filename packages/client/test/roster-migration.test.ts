import { describe, expect, it, vi } from 'vitest';

import type { BridgeCall } from '../src/client/bridge.js';
import {
  backupLegacyRoster,
  loadRosterConfig,
  ROSTER_BACKUP_KEY,
  ROSTER_CONFIG_KEY,
  ROSTER_MIGRATED_KEY,
  type ConfigStorage,
} from '../src/client/roster-config.js';
import { migrateLegacyRoster } from '../src/client/roster-migration.js';

interface CallLogEntry {
  endpoint: string;
  payload: Record<string, unknown>;
}

interface HostState {
  sections: Array<{ id: string; name: string; channelIds: string[] }>;
  pins: string[];
}

function memoryStorage(seed?: string): ConfigStorage {
  const values = new Map<string, string>();
  if (seed !== undefined) values.set(ROSTER_CONFIG_KEY, seed);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

const LEGACY = JSON.stringify({
  pins: ['ada'],
  sortMode: 'auto',
  sections: [
    { id: 'section-1', name: '研究', channels: ['c2', 'c1'], sortMode: 'manual', collapsed: true },
    { id: 'section-2', name: '工作流', channels: ['c3'] },
  ],
});

function hostState(
  initial: {
    pins?: string[];
    sections?: Array<{ id: string; name: string; channelIds: string[] }>;
  } = {},
): HostState {
  return { sections: [...(initial.sections ?? [])], pins: [...(initial.pins ?? [])] };
}

function hostBridge(
  state: HostState,
  calls: CallLogEntry[],
  options: { failOn?: string } = {},
): BridgeCall {
  let counter = 0;
  return async (endpoint, payload) => {
    calls.push({ endpoint, payload });
    if (endpoint === options.failOn) throw new Error('host down');
    switch (endpoint) {
      case 'rosterGet':
        return {
          ok: true,
          value: {
            pins: state.pins,
            hidden: [],
            sectionOrder: state.sections.map((s) => s.id),
            sections: state.sections,
          },
        };
      case 'sectionCreate': {
        counter += 1;
        const created = {
          id: `host-${counter}`,
          name: String(payload['name']),
          channelIds: [] as string[],
        };
        state.sections = [...state.sections, created];
        return { ok: true, value: { section: created } };
      }
      case 'sectionRemove': {
        const sectionId = String(payload['sectionId']);
        state.sections = state.sections.filter((section) => section.id !== sectionId);
        return { ok: true, value: { removed: true } };
      }
      case 'channelAssign': {
        const channelId = String(payload['channelId']);
        const sectionId = payload['sectionId'];
        state.sections = state.sections.map((section) => {
          const without = section.channelIds.filter((id) => id !== channelId);
          if (section.id !== sectionId) return { ...section, channelIds: without };
          const index = typeof payload['index'] === 'number' ? payload['index'] : without.length;
          return {
            ...section,
            channelIds: [...without.slice(0, index), channelId, ...without.slice(index)],
          };
        });
        return { ok: true, value: {} };
      }
      case 'sectionReorder': {
        const order = payload['order'] as string[];
        const byId = new Map(state.sections.map((section) => [section.id, section]));
        state.sections = order.flatMap((id) => {
          const section = byId.get(id);
          return section === undefined ? [] : [section];
        });
        return { ok: true, value: { sectionOrder: order } };
      }
      case 'pinsSet': {
        state.pins = [...(payload['pins'] as string[])];
        return { ok: true, value: { pins: state.pins } };
      }
      default:
        throw new Error(`unexpected endpoint: ${endpoint}`);
    }
  };
}

describe('legacy roster migration', () => {
  it('moves the arrangement host-side, remaps modes, and clears the live record', async () => {
    const storage = memoryStorage(LEGACY);
    const calls: CallLogEntry[] = [];
    const remap = vi.fn(async () => true);
    const warn = vi.fn();

    const outcome = await migrateLegacyRoster({
      storage,
      call: hostBridge(hostState(), calls),
      remapSortModes: remap,
      warn,
    });

    expect(outcome).toBe('migrated');
    expect(calls.map((entry) => entry.endpoint)).toEqual([
      'rosterGet',
      'sectionCreate',
      'channelAssign',
      'channelAssign',
      'sectionCreate',
      'channelAssign',
      'sectionReorder',
      'pinsSet',
    ]);
    expect(calls[1]?.payload).toEqual({ name: '研究' });
    expect(calls[2]?.payload).toEqual({ channelId: 'c2', sectionId: 'host-1' });
    expect(calls[3]?.payload).toEqual({ channelId: 'c1', sectionId: 'host-1' });
    expect(calls[5]?.payload).toEqual({ channelId: 'c3', sectionId: 'host-2' });
    expect(calls[6]?.payload).toEqual({ order: ['host-1', 'host-2'] });
    expect(calls[7]?.payload).toEqual({ pins: ['ada'] });
    expect(remap).toHaveBeenCalledWith(
      new Map([
        ['section-1', 'host-1'],
        ['section-2', 'host-2'],
      ]),
    );

    expect(JSON.parse(storage.getItem(ROSTER_BACKUP_KEY)!)).toEqual(JSON.parse(LEGACY));
    expect(JSON.parse(storage.getItem(ROSTER_CONFIG_KEY)!)).toEqual({
      collapsed: { 'host-1': true },
    });
    expect(storage.getItem(ROSTER_MIGRATED_KEY)).toEqual(expect.any(String));
    expect(warn).not.toHaveBeenCalled();
  });

  it('never overwrites a host arrangement that already holds data', async () => {
    const storage = memoryStorage(LEGACY);
    const calls: CallLogEntry[] = [];
    const remap = vi.fn(async () => true);

    const outcome = await migrateLegacyRoster({
      storage,
      call: hostBridge(
        hostState({ sections: [{ id: 'existing', name: '已有', channelIds: [] }] }),
        calls,
      ),
      remapSortModes: remap,
    });

    expect(outcome).toBe('skipped');
    expect(calls.map((entry) => entry.endpoint)).toEqual(['rosterGet']);
    expect(remap).not.toHaveBeenCalled();
    expect(storage.getItem(ROSTER_CONFIG_KEY)).toBe(LEGACY);
    expect(storage.getItem(ROSTER_BACKUP_KEY)).toBeNull();
  });

  it('skips when the marker is already present', async () => {
    const storage = memoryStorage(LEGACY);
    storage.setItem(ROSTER_MIGRATED_KEY, '2026-09-20T00:00:00.000Z');
    const calls: CallLogEntry[] = [];

    const outcome = await migrateLegacyRoster({
      storage,
      call: hostBridge(hostState(), calls),
      remapSortModes: async () => true,
    });

    expect(outcome).toBe('skipped');
    expect(calls).toEqual([]);
    expect(storage.getItem(ROSTER_CONFIG_KEY)).toBe(LEGACY);
  });

  it('is a no-op when no legacy record exists', async () => {
    const calls: CallLogEntry[] = [];
    const call = hostBridge(hostState(), calls);

    expect(
      await migrateLegacyRoster({
        storage: memoryStorage(),
        call,
        remapSortModes: async () => true,
      }),
    ).toBe('skipped');
    expect(
      await migrateLegacyRoster({ storage: undefined, call, remapSortModes: async () => true }),
    ).toBe('skipped');
    const migrated = memoryStorage(JSON.stringify({ collapsed: { 'host-1': true } }));
    expect(
      await migrateLegacyRoster({ storage: migrated, call, remapSortModes: async () => true }),
    ).toBe('skipped');
    expect(calls).toEqual([]);
  });

  it('rolls back a failed host write and a retry finishes the migration', async () => {
    const storage = memoryStorage(LEGACY);
    const state = hostState();
    const firstCalls: CallLogEntry[] = [];
    const warn = vi.fn();

    const first = await migrateLegacyRoster({
      storage,
      call: hostBridge(state, firstCalls, { failOn: 'channelAssign' }),
      remapSortModes: async () => true,
      warn,
    });

    expect(first).toBe('deferred');
    expect(firstCalls.map((entry) => entry.endpoint)).toEqual([
      'rosterGet',
      'sectionCreate',
      'channelAssign',
      'sectionRemove',
    ]);
    expect(state.sections).toEqual([]);
    expect(state.pins).toEqual([]);
    expect(storage.getItem(ROSTER_CONFIG_KEY)).toBe(LEGACY);
    expect(storage.getItem(ROSTER_BACKUP_KEY)).toBeNull();
    expect(storage.getItem(ROSTER_MIGRATED_KEY)).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      'botharness: roster migration deferred: host write failed; rolling back',
      expect.any(Error),
    );

    const secondCalls: CallLogEntry[] = [];
    const second = await migrateLegacyRoster({
      storage,
      call: hostBridge(state, secondCalls),
      remapSortModes: async () => true,
    });

    expect(second).toBe('migrated');
    expect(state.sections.map((section) => [section.name, section.channelIds])).toEqual([
      ['研究', ['c2', 'c1']],
      ['工作流', ['c3']],
    ]);
    expect(state.pins).toEqual(['ada']);
    expect(JSON.parse(storage.getItem(ROSTER_CONFIG_KEY)!)).toEqual({
      collapsed: { 'host-1': true },
    });
    expect(storage.getItem(ROSTER_MIGRATED_KEY)).toEqual(expect.any(String));
  });

  it('rolls back host writes when the sort modes cannot be persisted', async () => {
    const storage = memoryStorage(LEGACY);
    const state = hostState();
    const calls: CallLogEntry[] = [];
    const warn = vi.fn();

    const outcome = await migrateLegacyRoster({
      storage,
      call: hostBridge(state, calls),
      remapSortModes: async () => false,
      warn,
    });

    expect(outcome).toBe('deferred');
    expect(state.sections).toEqual([]);
    expect(state.pins).toEqual([]);
    expect(calls.map((entry) => entry.endpoint)).toContain('sectionRemove');
    expect(calls.map((entry) => entry.endpoint)).toContain('pinsSet');
    expect(storage.getItem(ROSTER_CONFIG_KEY)).toBe(LEGACY);
    expect(storage.getItem(ROSTER_BACKUP_KEY)).toBeNull();
    expect(storage.getItem(ROSTER_MIGRATED_KEY)).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      'botharness: roster migration deferred: sort modes could not be persisted; rolling back',
    );
  });

  it('keeps the legacy record when rosterGet fails', async () => {
    const storage = memoryStorage(LEGACY);
    const calls: CallLogEntry[] = [];
    const warn = vi.fn();

    const outcome = await migrateLegacyRoster({
      storage,
      call: hostBridge(hostState(), calls, { failOn: 'rosterGet' }),
      remapSortModes: async () => true,
      warn,
    });

    expect(outcome).toBe('deferred');
    expect(storage.getItem(ROSTER_CONFIG_KEY)).toBe(LEGACY);
    expect(warn).toHaveBeenCalledWith(
      'botharness: roster migration deferred: rosterGet failed',
      expect.any(Error),
    );
  });

  it('leaves the existing collapsed map in place when re-keying it', async () => {
    const storage = memoryStorage(LEGACY);
    storage.setItem(
      ROSTER_CONFIG_KEY,
      JSON.stringify({
        pins: [],
        sections: [{ id: 'section-1', name: 'A', channels: [], collapsed: true }],
      }),
    );
    const calls: CallLogEntry[] = [];
    await migrateLegacyRoster({
      storage,
      call: hostBridge(hostState(), calls),
      remapSortModes: async () => true,
    });

    expect(loadRosterConfig(storage).collapsed).toEqual({ 'host-1': true });
  });

  it('backs up before clearing so the original record survives', () => {
    const storage = memoryStorage(LEGACY);
    backupLegacyRoster(storage);
    expect(storage.getItem(ROSTER_BACKUP_KEY)).toBe(LEGACY);
  });
});
