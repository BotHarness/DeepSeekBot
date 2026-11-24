import { describe, expect, it } from 'vitest';

import {
  CHANNEL_DOCK_STORAGE_KEY,
  DEFAULT_CHANNEL_WORKSPACE,
  readChannelDock,
  writeChannelDock,
} from '../src/client/channel-dock-layout.js';
import {
  legacyChannelSplit,
  MESSAGE_LEAF,
  splitPanels,
  type ChannelSplit,
} from '../src/client/channel-split-layout.js';
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
  type LayoutSettingsView,
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

const derived = (channels: LayoutSnapshot['channels']) => (id: string, saved?: ChannelSplit) =>
  saved ?? legacyChannelSplit({ sessions: channels[id] ?? DEFAULT_CHANNEL_WORKSPACE });

const rebind = (next: LayoutSnapshot): LayoutSnapshot => ({
  ...next,
  splitOf: derived(next.channels),
});

function snapshot(overrides: Partial<LayoutSnapshot> = {}): LayoutSnapshot {
  const channels = overrides.channels ?? { 'dm-ada': ada, 'group-team': team };
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
    gap: 4,
    members: { open: false, ratio: 0.3 },
    splits: {},
    splitOf: derived(channels),
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
        current = rebind(applyLayoutSettings(current, change));
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
    gap: dock?.gap ?? 4,
    members: dock?.members ?? { open: false, ratio: 0.3 },
    splits: dock?.channelSplits ?? {},
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
      gap: next.gap,
      members: { ...next.members },
      channelSplits: next.splits,
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

function pathTo(tree: ChannelSplit, panel: string, path = ''): string {
  if ('panel' in tree) return tree.panel === panel ? path : '';
  return pathTo(tree.first, panel, `${path}0`) || pathTo(tree.second, panel, `${path}1`);
}

function nodeAt(tree: ChannelSplit, path: string): ChannelSplit {
  return [...path].reduce<ChannelSplit>(
    (node, step) => ('panel' in node ? node : step === '0' ? node.first : node.second),
    tree,
  );
}

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
        'dm-ada': { open: true, direction: 'right', ratio: 0.3, splitSaved: false },
        'group-team': { open: false, direction: 'below', ratio: 0.5, splitSaved: false },
      },
      gap: 4,
      members: { open: false, ratio: 0.3 },
    });
    expect(splitPanels(view.channels['dm-ada']!.split)).toContain(MESSAGE_LEAF);
    expect(readLayoutSettings(snapshot()).revision).toBe(view.revision);
  });

  it('reports the active Channel at its seed layout before it has its own entry', () => {
    const view = readLayoutSettings(snapshot({ channels: {}, activeChannelId: 'dm-bob' }));
    expect(view.channels).toMatchObject({
      'dm-bob': { open: true, direction: 'right', ratio: 0.3, splitSaved: false },
    });
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
    expect(after.channels['group-team']).toMatchObject({
      open: true,
      direction: 'left',
      ratio: 0.6,
    });
    expect(target.current().channels['group-team']!.hiddenControl).toBe(true);
    expect(after.revision).not.toBe(before.revision);
    expect(after).toEqual(readLayoutSettings(target.current()));

    const hidden = (await target.domain.write(
      { channel: { id: 'group-team', open: false } },
      write(after.revision),
    )) as ReturnType<typeof readLayoutSettings>;
    expect(hidden.channels['group-team']).toMatchObject({
      open: false,
      direction: 'left',
      ratio: 0.6,
    });
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
    [{ global: { column: { heights: { sessions: 80 } } } }],
    [{ global: { column: { heights: [] } } }],
    [{ gap: 17 }],
    [{ gap: 2.5 }],
    [{ members: {} }],
    [{ members: { ratio: 0.7 } }],
    [{ members: { open: 1 } }],
    [{ channel: { id: 'dm-ada', split: { panel: 'messages' } } }],
    [{ channel: { id: 'dm-ada', split: { panel: 'bad id' } } }],
    [
      {
        channel: {
          id: 'dm-ada',
          move: { panel: 'messages', target: 'sessions', direction: 'left' },
        },
      },
    ],
    [
      {
        channel: { id: 'dm-ada', move: { panel: 'sessions', target: 'ghost', direction: 'left' } },
      },
    ],
    [{ channel: { id: 'dm-ada', resize: { path: '2', ratio: 0.5 } } }],
    [{ channel: { id: 'dm-ada', resize: { path: '', ratio: 0.9 } } }],
    [{ channel: { id: 'dm-ada', resize: { path: '', ratio: 0.5 }, split: null } }],
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
    expect(readLayoutSettings(target.current())).toEqual(readLayoutSettings(snapshot()));
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
    const next = rebind(applyLayoutSettings(loaded, change));
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

  it('moves and resizes inside one inactive Channel split and keeps the active Channel', async () => {
    const target = host(snapshot());
    const before = target.domain.read() as LayoutSettingsView;
    const moved = (await target.domain.write(
      {
        channel: {
          id: 'group-team',
          move: { panel: 'schedules', target: 'messages', direction: 'below' },
        },
      },
      write(before.revision),
    )) as LayoutSettingsView;
    const tree = moved.channels['group-team']!.split;
    expect(moved.channels['group-team']!.splitSaved).toBe(true);
    expect(JSON.stringify(tree)).toContain(
      JSON.stringify({
        axis: 'vertical',
        ratio: 0.5,
        first: { panel: 'messages' },
        second: { panel: 'schedules' },
      }),
    );
    expect(moved.channels['dm-ada']).toEqual(before.channels['dm-ada']);
    expect(moved.activeChannelId).toBe('dm-ada');

    const path = pathTo(tree, 'schedules').slice(0, -1);
    const resized = (await target.domain.write(
      { channel: { id: 'group-team', resize: { path, ratio: 0.25 } } },
      write(moved.revision),
    )) as LayoutSettingsView;
    expect(nodeAt(resized.channels['group-team']!.split, path)).toMatchObject({
      axis: 'vertical',
      ratio: 0.25,
    });
    expect(splitPanels(resized.channels['group-team']!.split).sort()).toEqual(
      splitPanels(before.channels['group-team']!.split).sort(),
    );
  });

  it('refuses direction and ratio on a Channel with a saved split until it is reset', async () => {
    const saved = legacyChannelSplit({ sessions: { ...ada, direction: 'below' } });
    const target = host(snapshot({ splits: { 'dm-ada': saved } }));
    const read = target.domain.read() as LayoutSettingsView;
    await expect(
      Promise.resolve().then(() =>
        target.domain.write({ channel: { id: 'dm-ada', direction: 'left' } }, write(read.revision)),
      ),
    ).rejects.toMatchObject({
      code: 'client-settings-invalid-input',
      message: expect.stringContaining('channel.move'),
    });
    const reset = (await target.domain.write(
      { channel: { id: 'dm-ada', split: null, direction: 'left', ratio: 0.4 } },
      write(read.revision),
    )) as LayoutSettingsView;
    expect(reset.channels['dm-ada']).toMatchObject({
      direction: 'left',
      ratio: 0.4,
      splitSaved: false,
    });
    expect(target.current().splits).toEqual({});
  });

  it('replaces a split only with the same panels', async () => {
    const target = host(snapshot());
    const read = target.domain.read() as LayoutSettingsView;
    const current = read.channels['dm-ada']!.split;
    const swapped =
      'panel' in current ? current : { ...current, first: current.second, second: current.first };
    const written = (await target.domain.write(
      { channel: { id: 'dm-ada', split: swapped } },
      write(read.revision),
    )) as LayoutSettingsView;
    expect(written.channels['dm-ada']!.split).toEqual(swapped);
    const dropped = {
      axis: 'horizontal',
      ratio: 0.5,
      first: { panel: 'messages' },
      second: { panel: 'sessions' },
    };
    await expect(
      Promise.resolve().then(() =>
        target.domain.write({ channel: { id: 'dm-ada', split: dropped } }, write(written.revision)),
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining('each of these panels once') });
  });

  it('edits the gap, the members panel and Subpanel heights', () => {
    const current = snapshot();
    const change = planLayoutSettings(
      current,
      {
        gap: 10,
        members: { open: true, ratio: 0.45 },
        global: { column: { heights: { sessions: 240.4, schedules: 400 } } },
      },
      readLayoutSettings(current).revision,
    );
    expect(change.gap).toBe(10);
    expect(change.members).toEqual({ open: true, ratio: 0.45 });
    expect(change.global?.column.heights).toEqual({ sessions: 240, schedules: 400 });
    const merged = applyLayoutSettings(current, change);
    expect(
      planLayoutSettings(
        merged,
        { global: { column: { heights: { sessions: null, members: 300 } } } },
        readLayoutSettings(merged).revision,
      ).global?.column.heights,
    ).toEqual({ schedules: 400, members: 300 });
    const view = readLayoutSettings(applyLayoutSettings(current, change));
    expect(view).toMatchObject({
      gap: 10,
      members: { open: true, ratio: 0.45 },
      global: { column: { heights: { sessions: 240, schedules: 400 } } },
    });
  });

  it('keeps a saved split, the gap and members across a reload', () => {
    const storage = memory({
      [CHANNEL_DOCK_STORAGE_KEY]: JSON.stringify({
        version: 9,
        layout: { panels: {}, grid: { root: { type: 'branch', data: [] } } },
        parked,
        channelWorkspaces: { 'dm-ada': ada, 'group-team': team },
      }),
    });
    const loaded = storedFrom(storage, 'dm-ada');
    const change = planLayoutSettings(
      loaded,
      {
        gap: 8,
        members: { open: true },
        channel: {
          id: 'group-team',
          move: { panel: 'sessions', target: 'messages', direction: 'left' },
        },
      },
      readLayoutSettings(loaded).revision,
    );
    const next = rebind(applyLayoutSettings(loaded, change));
    persist(storage, next);
    const reloaded = storedFrom(storage, 'dm-ada');
    expect(readLayoutSettings(reloaded).revision).toBe(readLayoutSettings(next).revision);
    expect(reloaded.splits['group-team']).toEqual(next.splits['group-team']);
    expect(readChannelDock(storage, true)?.parked).toEqual(parked);
  });
});
