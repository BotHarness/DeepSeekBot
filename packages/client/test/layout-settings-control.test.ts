import { describe, expect, it } from 'vitest';

import {
  CHANNEL_DOCK_STORAGE_KEY,
  DEFAULT_CHANNEL_WORKSPACE,
  readChannelDock,
  writeChannelDock,
} from '../src/client/channel-dock-layout.js';
import { ClientSettings } from '../src/client/client-settings-control.js';
import {
  DEFAULT_SUBPANEL_COLUMN,
  LAYOUT_MODE_STORAGE_KEY,
  readLayoutMode,
  writeLayoutMode,
} from '../src/client/layout-mode.js';
import {
  applyLayoutSettings,
  layoutSettingsDomain,
  planLayoutSettings,
  readLayoutSettings,
  type LayoutSnapshot,
} from '../src/client/layout-settings-control.js';
import { WORKSPACE_CHANNELS } from '../src/client/workspace-context.js';

function memory(entries: Record<string, string> = {}) {
  const values = new Map(Object.entries(entries));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

const parked = { market: { neighbor: 'bh:channel-body', direction: 'left' as const } };
const ada = { open: true, direction: 'right' as const, ratio: 0.3, hiddenControl: false };
const team = { open: false, direction: 'below' as const, ratio: 0.5, hiddenControl: true };

function snapshot(overrides: Partial<LayoutSnapshot> = {}): LayoutSnapshot {
  return {
    global: {
      mode: 'simple',
      sideColumn: WORKSPACE_CHANNELS,
      channelsWidth: 0.22,
      column: DEFAULT_SUBPANEL_COLUMN,
    },
    rail: { order: ['activity-center', 'market'], hidden: [] },
    channels: { 'dm-ada': ada, 'group-team': team },
    seed: DEFAULT_CHANNEL_WORKSPACE,
    activeChannelId: 'dm-ada',
    knownChannelIds: ['dm-ada', 'group-team', 'dm-bob'],
    ...overrides,
  };
}

function host(initial: LayoutSnapshot) {
  let current = initial;
  return {
    current: () => current,
    domain: layoutSettingsDomain({
      snapshot: () => current,
      apply: (change) => {
        current = applyLayoutSettings(current, change);
      },
    }),
  };
}

function storedFrom(storage: ReturnType<typeof memory>, active: string): LayoutSnapshot {
  const dock = readChannelDock(storage, true);
  return snapshot({
    global: readLayoutMode(storage),
    rail: { order: dock?.order ?? [], hidden: dock?.hiddenControls ?? [] },
    channels: dock?.channelWorkspaces ?? {},
    seed: dock?.sessionSeed ?? DEFAULT_CHANNEL_WORKSPACE,
    activeChannelId: active,
  });
}

function persist(storage: ReturnType<typeof memory>, next: LayoutSnapshot): void {
  const { version: _version, ...dock } = readChannelDock(storage, true)!;
  writeLayoutMode(next.global, storage);
  writeChannelDock(
    {
      ...dock,
      order: next.rail.order,
      hiddenControls: next.rail.hidden,
      channelWorkspaces: next.channels,
    },
    storage,
  );
}

const write = (expectedRevision: string, assertLive = () => {}) => ({
  expectedRevision,
  expiresAt: Number.MAX_SAFE_INTEGER,
  signal: new AbortController().signal,
  assertLive,
});

describe('Client layout settings', () => {
  it('reads global, rail and Channel layout with a stable revision', () => {
    const view = readLayoutSettings(snapshot());
    expect(view).toMatchObject({
      activeChannelId: 'dm-ada',
      global: {
        mode: 'simple',
        sideColumn: WORKSPACE_CHANNELS,
        channelsWidth: 0.22,
        column: { open: false, width: DEFAULT_SUBPANEL_COLUMN.width, hidden: [], order: [] },
      },
      rail: { order: ['activity-center', 'market'], hidden: [] },
      channels: {
        'dm-ada': { open: true, direction: 'right', ratio: 0.3 },
        'group-team': { open: false, direction: 'below', ratio: 0.5 },
      },
    });
    expect(readLayoutSettings(snapshot()).revision).toBe(view.revision);
  });

  it('reports the active Channel at its seed layout before it has its own entry', () => {
    const view = readLayoutSettings(snapshot({ channels: {}, activeChannelId: 'dm-bob' }));
    expect(view.channels).toEqual({ 'dm-bob': { open: true, direction: 'right', ratio: 0.3 } });
  });

  it('moves, resizes and hides one inactive Channel without touching the active Channel', async () => {
    const target = host(snapshot());
    const before = target.domain.read() as ReturnType<typeof readLayoutSettings>;
    const after = (await target.domain.write(
      { channel: { id: 'group-team', open: true, direction: 'left', ratio: 0.6 } },
      write(before.revision),
    )) as ReturnType<typeof readLayoutSettings>;
    expect(after.activeChannelId).toBe('dm-ada');
    expect(after.channels['dm-ada']).toEqual(before.channels['dm-ada']);
    expect(after.channels['group-team']).toEqual({ open: true, direction: 'left', ratio: 0.6 });
    expect(target.current().channels['group-team']!.hiddenControl).toBe(true);
    expect(after.revision).not.toBe(before.revision);
    expect(after).toEqual(readLayoutSettings(target.current()));

    const hidden = (await target.domain.write(
      { channel: { id: 'group-team', open: false } },
      write(after.revision),
    )) as ReturnType<typeof readLayoutSettings>;
    expect(hidden.channels['group-team']).toEqual({ open: false, direction: 'left', ratio: 0.6 });
  });

  it('gives a known Channel without an entry its own layout from the seed', () => {
    const change = planLayoutSettings(
      snapshot(),
      { channel: { id: 'dm-bob', ratio: 0.4 } },
      readLayoutSettings(snapshot()).revision,
    );
    expect(change.channel).toEqual({
      id: 'dm-bob',
      state: { ...DEFAULT_CHANNEL_WORKSPACE, ratio: 0.4 },
    });
    expect(change.global).toBeUndefined();
  });

  it('edits global layout, the Subpanel column and rail order and visibility', () => {
    const current = snapshot();
    const change = planLayoutSettings(
      current,
      {
        global: {
          mode: 'advanced',
          sideColumn: null,
          channelsWidth: 0.3,
          column: { open: true, width: 0.4, hidden: ['schedules', 'schedules'], order: ['x'] },
        },
        rail: { order: ['market', 'activity-center'], hidden: ['market'] },
      },
      readLayoutSettings(current).revision,
    );
    expect(change.global).toEqual({
      mode: 'advanced',
      sideColumn: null,
      channelsWidth: 0.3,
      column: {
        ...DEFAULT_SUBPANEL_COLUMN,
        open: true,
        width: 0.4,
        hidden: ['schedules'],
        order: ['x'],
      },
    });
    expect(change.rail).toEqual({ order: ['market', 'activity-center'], hidden: ['market'] });
    expect(change.channel).toBeUndefined();
  });

  it('refuses a stale revision', () => {
    expect(() =>
      planLayoutSettings(snapshot(), { channel: { id: 'dm-ada', open: false } }, 'r0-0'),
    ).toThrow(expect.objectContaining({ code: 'client-settings-revision-conflict' }));
  });

  it('refuses an unknown Channel', () => {
    const revision = readLayoutSettings(snapshot()).revision;
    expect(() =>
      planLayoutSettings(snapshot(), { channel: { id: 'dm-ghost', open: false } }, revision),
    ).toThrow(expect.objectContaining({ code: 'layout-channel-unknown' }));
  });

  it.each([
    [{}],
    [{ theme: 'dark' }],
    [{ channel: { id: 'dm-ada' } }],
    [{ channel: { open: true } }],
    [{ channel: { id: 'dm-ada', ratio: 0.9 } }],
    [{ channel: { id: 'dm-ada', ratio: 0.1 } }],
    [{ channel: { id: 'dm-ada', direction: 'up' } }],
    [{ channel: { id: 'dm-ada', open: 'yes' } }],
    [{ channel: { id: 'dm-ada', hiddenControl: true } }],
    [{ global: { mode: 'grid' } }],
    [{ global: { channelsWidth: 0 } }],
    [{ global: { channelsWidth: 0.7 } }],
    [{ global: { sideColumn: '' } }],
    [{ global: { column: { width: 0.1 } } }],
    [{ global: { column: { heights: {} } } }],
    [{ global: { column: { order: [1] } } }],
    [{ rail: { order: 'market' } }],
  ])('refuses invalid patch %j', (patch) => {
    const revision = readLayoutSettings(snapshot()).revision;
    expect(() => planLayoutSettings(snapshot(), patch, revision)).toThrow(
      expect.objectContaining({ code: 'client-settings-invalid-input' }),
    );
  });

  it('checks the deadline after validating and before applying', async () => {
    const target = host(snapshot());
    const revision = readLayoutSettings(snapshot()).revision;
    await expect(
      Promise.resolve().then(() =>
        target.domain.write(
          { channel: { id: 'dm-ada', open: false } },
          write(revision, () => {
            throw Object.assign(new Error('stale'), { code: 'appearance-request-stale' });
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'appearance-request-stale' });
    expect(target.current()).toEqual(snapshot());
  });

  it('is unavailable through the registry once the dock unregisters', async () => {
    const settings = new ClientSettings();
    const target = host(snapshot());
    const dispose = settings.register('layout', target.domain);
    const deadline = { expiresAt: Number.MAX_SAFE_INTEGER, signal: new AbortController().signal };
    const read = (await settings.execute({ domain: 'layout' }, undefined, deadline)) as {
      revision: string;
    };
    const written = (await settings.execute(
      { domain: 'layout', patch: { channel: { id: 'group-team', open: true } } },
      read.revision,
      deadline,
    )) as ReturnType<typeof readLayoutSettings>;
    expect(written.channels['group-team']!.open).toBe(true);
    dispose();
    await expect(settings.execute({ domain: 'layout' }, undefined, deadline)).rejects.toMatchObject(
      {
        code: 'client-settings-unavailable',
      },
    );
  });

  it('edits a legacy saved layout and reads the same revision after reload', () => {
    const storage = memory({
      [LAYOUT_MODE_STORAGE_KEY]: JSON.stringify({
        mode: 'simple',
        view: 'market',
        channelsWidth: 0.3,
        column: DEFAULT_SUBPANEL_COLUMN,
      }),
      [CHANNEL_DOCK_STORAGE_KEY]: JSON.stringify({
        version: 9,
        layout: { panels: {}, grid: { root: { type: 'branch', data: [] } } },
        parked,
        order: ['market'],
        hiddenControls: [],
        channelWorkspaces: { 'dm-ada': ada, 'group-team': team },
      }),
    });
    const loaded = storedFrom(storage, 'dm-ada');
    expect(loaded.global.sideColumn).toBe('market');
    const change = planLayoutSettings(
      loaded,
      {
        global: { channelsWidth: 0.4 },
        channel: { id: 'group-team', open: true, direction: 'above', ratio: 0.25 },
      },
      readLayoutSettings(loaded).revision,
    );
    const next = applyLayoutSettings(loaded, change);
    persist(storage, next);

    const reloaded = storedFrom(storage, 'dm-ada');
    expect(readLayoutSettings(reloaded).revision).toBe(readLayoutSettings(next).revision);
    expect(reloaded.channels['dm-ada']).toEqual(ada);
    expect(reloaded.channels['group-team']).toEqual({
      ...team,
      open: true,
      direction: 'above',
      ratio: 0.25,
    });
    expect(readChannelDock(storage, true)?.parked).toEqual(parked);
    expect(reloaded.global).toMatchObject({ sideColumn: 'market', channelsWidth: 0.4 });
  });
});
