import { legacyChannelSplit } from '../src/client/channel-split-layout.js';
import type { SerializedDockview } from 'dockview-react';
import { describe, expect, it } from 'vitest';

import {
  migrateWorkPanel,
  allowsDockDrop,
  CHANNEL_BODY_PANEL,
  CHANNEL_DOCK_STORAGE_KEY,
  pruneChannelDock,
  dockPanelGap,
  readChannelDock,
  writeChannelDock,
} from '../src/client/channel-dock-layout.js';

const leaf = (id: string, ...views: string[]) => ({
  type: 'leaf' as const,
  data: { views, activeView: views[0]!, id },
  size: 100,
});

const layout: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        leaf('1', CHANNEL_BODY_PANEL),
        {
          type: 'branch',
          data: [leaf('2', 'sessions'), leaf('3', 'bot-inbox'), leaf('4', 'computer')],
          size: 320,
        },
      ],
    },
    width: 1200,
    height: 800,
    orientation: 'HORIZONTAL' as SerializedDockview['grid']['orientation'],
  },
  panels: Object.fromEntries(
    [CHANNEL_BODY_PANEL, 'sessions', 'bot-inbox', 'computer'].map((id) => [id, { id }]),
  ),
  activeGroup: '4',
};

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe('Bot mode layout persistence', () => {
  it('round-trips a versioned dockview serialization', () => {
    const storage = memoryStorage();
    writeChannelDock({ layout, parked: { schedules: { direction: 'below' } } }, storage);
    expect(JSON.parse(storage.values.get(CHANNEL_DOCK_STORAGE_KEY)!).version).toBe(8);
    expect(readChannelDock(storage)).toEqual({
      version: 8,
      instances: [],
      channelSplits: {},
      gap: 4,
      order: [],
      hiddenControls: [],
      members: { open: false, ratio: 0.3 },
      channelWorkspaces: {},
      sessionSeed: undefined,
      botPanelSeeds: {},
      botWorkspaces: {},
      layout,
      parked: { schedules: { direction: 'below' } },
    });
  });

  it('round-trips the optional pre-hide grid and ignores a damaged snapshot', () => {
    const storage = memoryStorage();
    writeChannelDock({ layout, parked: {}, visibilityLayout: layout }, storage);
    expect(readChannelDock(storage)?.visibilityLayout).toEqual(layout);
    storage.setItem(
      CHANNEL_DOCK_STORAGE_KEY,
      JSON.stringify({ version: 8, layout, parked: {}, visibilityLayout: { panels: {} } }),
    );
    expect(readChannelDock(storage)?.visibilityLayout).toBeUndefined();
  });

  it('validates and preserves rail visibility preferences', () => {
    const storage = memoryStorage();
    storage.setItem(
      CHANNEL_DOCK_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        layout,
        hiddenControls: ['sessions', 42, 'sessions', 'bot-inbox'],
      }),
    );
    expect(readChannelDock(storage)?.hiddenControls).toEqual(['bot-inbox']);
    expect(readChannelDock(storage)?.sessionSeed?.hiddenControl).toBe(true);
  });

  it('ignores a layout from another version or a damaged value', () => {
    const storage = memoryStorage();
    storage.setItem(CHANNEL_DOCK_STORAGE_KEY, JSON.stringify({ version: 0, layout, parked: {} }));
    expect(readChannelDock(storage)).toBeUndefined();
    storage.setItem(CHANNEL_DOCK_STORAGE_KEY, '{not json');
    expect(readChannelDock(storage)).toBeUndefined();
    storage.setItem(CHANNEL_DOCK_STORAGE_KEY, JSON.stringify({ version: 1, layout: {} }));
    expect(readChannelDock(storage)).toBeUndefined();
  });
});

describe('pruning panels that are not registered', () => {
  it('skips the panel and remembers the neighbor it sat below', () => {
    const result = pruneChannelDock(layout, (id) => id !== 'bot-inbox');
    expect(Object.keys(result.layout!.panels)).toEqual([
      CHANNEL_BODY_PANEL,
      'sessions',
      'computer',
    ]);
    const column = (result.layout!.grid.root.data as { data: unknown }[])[1]!;
    expect((column.data as { data: { views: string[] } }[]).map((node) => node.data.views)).toEqual(
      [['sessions'], ['computer']],
    );
    expect(result.parked).toEqual({ 'bot-inbox': { neighbor: 'sessions', direction: 'below' } });
    expect(result.layout!.activeGroup).toBe('4');
  });

  it('places the first panel of a column above the next one', () => {
    expect(pruneChannelDock(layout, (id) => id !== 'sessions').parked).toEqual({
      sessions: { neighbor: 'bot-inbox', direction: 'above' },
    });
  });

  it('remembers a whole removed column beside the Channel body', () => {
    const result = pruneChannelDock(layout, (id) => id === CHANNEL_BODY_PANEL);
    expect(result.parked['sessions']).toEqual({ neighbor: CHANNEL_BODY_PANEL, direction: 'right' });
    expect(result.layout!.activeGroup).toBeUndefined();
  });

  it('falls back to the default layout when the Channel body is missing', () => {
    expect(pruneChannelDock(layout, (id) => id !== CHANNEL_BODY_PANEL).layout).toBeUndefined();
  });

  it('docks nothing from a floating group', () => {
    const floating = {
      ...layout,
      floatingGroups: [
        {
          data: { views: ['schedules'], activeView: 'schedules', id: '9' },
          position: { top: 0, left: 0, width: 300, height: 300 },
        },
      ],
    } as SerializedDockview;
    const result = pruneChannelDock(
      { ...floating, panels: { ...floating.panels, schedules: { id: 'schedules' } } },
      () => true,
    );
    expect(result.layout!.floatingGroups).toBeUndefined();
    expect(Object.keys(result.layout!.panels)).not.toContain('schedules');
    expect(result.parked['schedules']).toEqual({ direction: 'right' });
  });
});

describe('drops never tab two panels together', () => {
  it('only splits beside a panel or the layout edge', () => {
    expect(allowsDockDrop('content', 'center')).toBe(false);
    expect(allowsDockDrop('tab', 'center')).toBe(false);
    expect(allowsDockDrop('header_space', 'center')).toBe(false);
    expect(allowsDockDrop('content', 'left')).toBe(true);
    expect(allowsDockDrop('edge', 'right')).toBe(true);
  });
});

describe('Work → Sessions upgrade', () => {
  const stored = (views: string[]) => ({
    version: 8 as const,
    layout: {
      ...layout,
      grid: {
        ...layout.grid,
        root: {
          type: 'branch' as const,
          data: [leaf('main', CHANNEL_BODY_PANEL), ...views.map((id) => leaf(id, id))],
        },
      },
      panels: Object.fromEntries(
        [CHANNEL_BODY_PANEL, ...views].map((id) => [id, { id, params: { entryId: id } }]),
      ),
    },
    order: ['group-work', 'memory-files', ...views.filter((id) => id !== 'group-work')],
    hiddenControls: ['sessions'],
    gap: 7,
    parked: { schedules: { neighbor: 'group-work', direction: 'below' as const } },
  });
  it('replaces Work in place and keeps its switch recoverable', () => {
    const original = stored(['group-work', 'bot-inbox']);
    const result = migrateWorkPanel(original);
    expect(Object.keys(result.layout.panels)).toEqual([
      CHANNEL_BODY_PANEL,
      'sessions',
      'bot-inbox',
    ]);
    expect(result.layout.panels.sessions?.params?.entryId).toBe('sessions');
    expect((result.layout.grid.root.data as unknown[])[1]).toEqual(leaf('group-work', 'sessions'));
    expect(result.hiddenControls).not.toContain('sessions');
    expect(result.parked.schedules?.neighbor).toBe('sessions');
    expect(result.gap).toBe(7);
    expect(migrateWorkPanel(result)).toEqual(result);
    expect(original.layout.panels['group-work']).toBeDefined();
  });
  it('keeps the existing Sessions geometry/order and removes the duplicate Work leaf', () => {
    const original = stored(['group-work', 'sessions', 'bot-inbox']);
    const result = migrateWorkPanel(original);
    expect(result.layout.grid.root.data).toEqual([
      leaf('main', CHANNEL_BODY_PANEL),
      leaf('sessions', 'sessions'),
      leaf('bot-inbox', 'bot-inbox'),
    ]);
    expect(result.order).toEqual(['memory-files', 'sessions', 'bot-inbox']);
    expect(result.hiddenControls).toContain('sessions');
    expect(migrateWorkPanel(result)).toEqual(result);
  });
  it('does not reopen either closed panel and rewrites parked neighbors', () => {
    const result = migrateWorkPanel(stored(['bot-inbox']));
    expect(result.layout.panels.sessions).toBeUndefined();
    expect(result.parked.schedules?.neighbor).toBe('sessions');
  });
});

describe('flat Sessions → Channel workspace migration', () => {
  it('retains a closed fallback panel size without overwriting Channel-specific state', () => {
    const storage = memoryStorage();
    const channel = { open: true, direction: 'left', ratio: 0.36, hiddenControl: false };
    storage.setItem(
      CHANNEL_DOCK_STORAGE_KEY,
      JSON.stringify({
        version: 8,
        instances: [],
        layout: {
          ...layout,
          grid: {
            ...layout.grid,
            root: { type: 'branch', data: [leaf('messages', CHANNEL_BODY_PANEL)] },
          },
          panels: { [CHANNEL_BODY_PANEL]: { id: CHANNEL_BODY_PANEL } },
        },
        parked: {
          sessions: {
            neighbor: CHANNEL_BODY_PANEL,
            direction: 'below',
            size: { width: 1, height: 0.44 },
          },
        },
        hiddenControls: ['sessions'],
        channelWorkspaces: { existing: channel },
      }),
    );
    const migrated = readChannelDock(storage, true)!;
    expect(migrated.sessionSeed).toEqual({
      open: false,
      direction: 'below',
      ratio: 0.44,
      hiddenControl: true,
    });
    expect(migrated.channelWorkspaces?.existing).toEqual(channel);
    expect(migrated.parked.sessions).toBeUndefined();
    expect(readChannelDock(storage, true)).toEqual(migrated);
  });

  it('imports the visible Windows v8 fallback geometry before enabling the workspace', () => {
    const storage = memoryStorage();
    const raw = JSON.stringify({
      version: 8,
      instances: [],
      layout: {
        ...layout,
        grid: {
          ...layout.grid,
          root: {
            type: 'branch',
            data: [
              { ...leaf('messages', CHANNEL_BODY_PANEL), size: 570 },
              { ...leaf('sessions', 'sessions'), size: 430 },
            ],
          },
        },
        panels: Object.fromEntries([CHANNEL_BODY_PANEL, 'sessions'].map((id) => [id, { id }])),
      },
      sessionSeed: { open: true, direction: 'right', ratio: 0.3, hiddenControl: false },
      parked: {},
      channelWorkspaces: {},
      channelSplits: {},
    });
    storage.setItem(CHANNEL_DOCK_STORAGE_KEY, raw);
    expect(readChannelDock(storage)?.layout.panels.sessions).toBeDefined();
    expect(storage.getItem(CHANNEL_DOCK_STORAGE_KEY)).toBe(raw);
    const migrated = readChannelDock(storage, true)!;
    expect(migrated.sessionSeed?.ratio).toBeCloseTo(0.43);
    expect(migrated.layout.panels.sessions).toBeUndefined();
    expect(storage.getItem(`${CHANNEL_DOCK_STORAGE_KEY}.before-workspace-shell`)).toBe(raw);
    expect(readChannelDock(storage, true)).toEqual(migrated);
  });

  it.each([1, 2, 3])(
    'backs up v%s, preserves unrelated plugins and migrates only once',
    (version) => {
      const storage = memoryStorage();
      const raw = JSON.stringify({
        version,
        layout,
        gap: 8,
        order: ['computer', 'sessions'],
        hiddenControls: ['sessions'],
        parked: { future: { neighbor: 'sessions', direction: 'left' } },
      });
      storage.setItem(CHANNEL_DOCK_STORAGE_KEY, raw);
      const next = readChannelDock(storage)!;
      expect(next.layout.panels.sessions).toBeUndefined();
      expect(next.layout.panels.computer).toEqual(layout.panels.computer);
      expect(next.sessionSeed).toEqual({
        open: true,
        direction: 'right',
        ratio: 0.3,
        hiddenControl: true,
      });
      expect(next.order).toEqual([
        ...['computer'],
        'bh:channels',
        CHANNEL_BODY_PANEL,
        'activity-center',
        'generated-files',
        'bh:home',
      ]);
      expect(next.gap).toBe(8);
      expect(next.parked.future?.neighbor).toBe(CHANNEL_BODY_PANEL);
      expect(storage.getItem(`${CHANNEL_DOCK_STORAGE_KEY}.before-channel-workspace-v4`)).toBe(raw);
      writeChannelDock(
        {
          ...next,
          channelWorkspaces: {
            group: { open: false, direction: 'below', ratio: 0.42, hiddenControl: false },
          },
        },
        storage,
      );
      const refreshed = readChannelDock(storage)!;
      expect(refreshed.channelWorkspaces?.group?.ratio).toBe(0.42);
      expect(refreshed.channelWorkspaces?.group?.open).toBe(false);
      expect(readChannelDock(storage)).toEqual(refreshed);
      expect(storage.getItem(`${CHANNEL_DOCK_STORAGE_KEY}.before-channel-workspace-v4`)).toBe(raw);
    },
  );

  it('keeps a closed or missing parent closed, and imports meaningful adjacent geometry', () => {
    const storage = memoryStorage();
    const nextLayout = {
      ...layout,
      grid: {
        ...layout.grid,
        root: {
          type: 'branch',
          data: [
            { ...leaf('session', 'sessions'), size: 250 },
            { ...leaf('messages', CHANNEL_BODY_PANEL), size: 750 },
          ],
        },
      },
      panels: Object.fromEntries(['sessions', CHANNEL_BODY_PANEL].map((id) => [id, { id }])),
    };
    storage.setItem(CHANNEL_DOCK_STORAGE_KEY, JSON.stringify({ version: 3, layout: nextLayout }));
    expect(readChannelDock(storage)?.sessionSeed).toEqual({
      open: true,
      direction: 'left',
      ratio: 0.25,
      hiddenControl: false,
    });
    expect(readChannelDock(storage)?.layout.grid.root.data).toEqual([
      { ...leaf('messages', CHANNEL_BODY_PANEL), size: 1000 },
    ]);
    nextLayout.panels = { sessions: { id: 'sessions' } };
    nextLayout.grid.root.data.pop();
    storage.setItem(CHANNEL_DOCK_STORAGE_KEY, JSON.stringify({ version: 3, layout: nextLayout }));
    expect(readChannelDock(storage)?.layout.panels[CHANNEL_BODY_PANEL]).toBeUndefined();
    nextLayout.panels = {};
    nextLayout.grid.root.data = [];
    storage.setItem(CHANNEL_DOCK_STORAGE_KEY, JSON.stringify({ version: 3, layout: nextLayout }));
    expect(readChannelDock(storage)?.sessionSeed?.open).toBe(false);
  });

  it('does not overwrite a recoverable old record if backup storage refuses the write', () => {
    const storage = memoryStorage();
    const raw = JSON.stringify({ version: 3, layout });
    storage.setItem(CHANNEL_DOCK_STORAGE_KEY, raw);
    const refusing = {
      ...storage,
      setItem: () => {
        throw Error('quota');
      },
    };
    expect(readChannelDock(refusing)?.sessionSeed?.open).toBe(true);
    expect(storage.getItem(CHANNEL_DOCK_STORAGE_KEY)).toBe(raw);
  });
});

it('refuses to overwrite malformed storage until explicit reset', () => {
  const storage = memoryStorage();
  storage.setItem(CHANNEL_DOCK_STORAGE_KEY, '{broken');
  expect(readChannelDock(storage)).toBeUndefined();
  writeChannelDock({ layout, parked: {} }, storage);
  expect(readChannelDock(storage)).toBeUndefined();
  expect(storage.getItem(CHANNEL_DOCK_STORAGE_KEY)).toBe('{broken');
});

it('retains hidden Work intent when every legacy panel is closed', () => {
  const storage = memoryStorage();
  storage.setItem(
    CHANNEL_DOCK_STORAGE_KEY,
    JSON.stringify({
      version: 2,
      layout: {
        ...layout,
        panels: {},
        grid: { ...layout.grid, root: { type: 'branch', data: [] } },
      },
      hiddenControls: ['group-work'],
      order: ['group-work'],
    }),
  );
  const next = readChannelDock(storage)!;
  expect(next.sessionSeed).toMatchObject({ open: false, hiddenControl: true });
  expect(next.order).toEqual([
    ...[],
    'bh:channels',
    CHANNEL_BODY_PANEL,
    'activity-center',
    'generated-files',
    'bh:home',
  ]);
  expect(next.layout.panels[CHANNEL_BODY_PANEL]).toBeUndefined();
});

describe('Bot subpanel migration', () => {
  it.each([1, 2, 3, 4])(
    'migrates v%s while preserving Sessions, unknown panels and explicit preferences',
    (version) => {
      const storage = memoryStorage();
      const previous = {
        version,
        gap: 9,
        order: ['plugin-x', 'memory-files', 'schedules'],
        hiddenControls: ['memory-evolution'],
        layout: {
          ...layout,
          grid: {
            ...layout.grid,
            root: {
              type: 'branch',
              data: [
                { ...leaf('message', CHANNEL_BODY_PANEL), size: 600 },
                { ...leaf('files', 'memory-files'), size: 200 },
                { ...leaf('other', 'plugin-x'), size: 400 },
              ],
            },
          },
          panels: Object.fromEntries(
            [CHANNEL_BODY_PANEL, 'memory-files', 'plugin-x'].map((id) => [id, { id }]),
          ),
        },
        parked: {
          'memory-evolution': { direction: 'below' },
          schedules: { direction: 'left' },
          'plugin-y': { neighbor: 'memory-files', direction: 'right' },
        },
        sessionSeed: { open: false, direction: 'above', ratio: 0.4, hiddenControl: false },
        channelWorkspaces: {
          group: { open: true, direction: 'left', ratio: 0.42, hiddenControl: false },
        },
        botWorkspaces: {
          ada: {
            'memory-files': { open: false, direction: 'below', ratio: 0.45, hiddenControl: false },
          },
        },
      };
      const raw = JSON.stringify(previous);
      storage.setItem(CHANNEL_DOCK_STORAGE_KEY, raw);
      const migrated = readChannelDock(storage)!;
      expect(migrated.version).toBe(8);
      expect(migrated.layout.panels['memory-files']).toBeUndefined();
      expect(migrated.layout.panels['plugin-x']).toEqual({ id: 'plugin-x' });
      expect(migrated.layout.grid.root.data).toEqual([
        { ...leaf('message', CHANNEL_BODY_PANEL), size: 800 },
        { ...leaf('other', 'plugin-x'), size: 400 },
      ]);
      expect(migrated.botPanelSeeds?.['memory-files']).toMatchObject({
        open: true,
        ratio: 0.25,
        direction: 'right',
      });
      expect(migrated.botPanelSeeds?.['memory-evolution']).toMatchObject({
        open: false,
        hiddenControl: true,
        direction: 'below',
      });
      expect(migrated.botPanelSeeds?.schedules).toMatchObject({ open: false, direction: 'left' });
      expect(migrated.botWorkspaces).toEqual(previous.botWorkspaces);
      expect(migrated.channelWorkspaces).toEqual(previous.channelWorkspaces);
      expect(migrated.sessionSeed).toEqual(previous.sessionSeed);
      expect(migrated.order).toEqual([
        ...['plugin-x'],
        'bh:channels',
        CHANNEL_BODY_PANEL,
        'activity-center',
        'generated-files',
        'bh:home',
      ]);
      expect(migrated.parked['plugin-y']?.neighbor).toBe(CHANNEL_BODY_PANEL);
      expect(migrated.gap).toBe(9);
      expect(storage.getItem(`${CHANNEL_DOCK_STORAGE_KEY}.before-bot-workspace-v5`)).toBe(raw);
      expect(readChannelDock(storage)).toEqual(migrated);
    },
  );
  it('keeps absent parents closed and preserves original v4 if backup fails', () => {
    const storage = memoryStorage();
    const previous = {
      version: 4,
      layout: {
        ...layout,
        panels: { schedules: { id: 'schedules' } },
        grid: { ...layout.grid, root: { type: 'branch', data: [leaf('schedule', 'schedules')] } },
      },
    };
    const raw = JSON.stringify(previous);
    storage.setItem(CHANNEL_DOCK_STORAGE_KEY, raw);
    const next = readChannelDock({
      ...storage,
      setItem: () => {
        throw new Error('blocked');
      },
    })!;
    expect(next.layout.panels[CHANNEL_BODY_PANEL]).toBeUndefined();
    expect(next.botPanelSeeds?.schedules?.open).toBe(true);
    expect(storage.getItem(CHANNEL_DOCK_STORAGE_KEY)).toBe(raw);
    expect(next.layout.grid.root.data).toEqual([]);
  });
});

it('upgrades v5 Browser/Computer without rewriting existing Channel workspaces or backups', () => {
  const storage = memoryStorage();
  const retained = { open: true, direction: 'above', ratio: 0.46, hiddenControl: false };
  const previous = {
    version: 5,
    layout: {
      ...layout,
      panels: Object.fromEntries(
        [CHANNEL_BODY_PANEL, 'botharness-browser', 'plugin-x'].map((id) => [id, { id }]),
      ),
      grid: {
        ...layout.grid,
        root: {
          type: 'branch',
          data: [
            { ...leaf('browser', 'botharness-browser'), size: 200 },
            { ...leaf('message', CHANNEL_BODY_PANEL), size: 600 },
            { ...leaf('other', 'plugin-x'), size: 400 },
          ],
        },
      },
    },
    order: ['botharness-browser', 'plugin-x', 'botharness-computer'],
    hiddenControls: ['botharness-computer'],
    parked: { 'botharness-computer': { direction: 'below' } },
    botPanelSeeds: { 'memory-files': retained },
    botWorkspaces: { ada: { schedules: retained } },
    channelWorkspaces: { group: retained },
    sessionSeed: retained,
  };
  const raw = JSON.stringify(previous);
  storage.setItem(CHANNEL_DOCK_STORAGE_KEY, raw);
  storage.setItem(`${CHANNEL_DOCK_STORAGE_KEY}.before-bot-workspace-v5`, 'original-v4');
  const next = readChannelDock(storage)!;
  expect(next.version).toBe(8);
  expect(next.layout.panels['botharness-browser']).toBeUndefined();
  expect(next.layout.grid.root.data).toEqual([
    { ...leaf('message', CHANNEL_BODY_PANEL), size: 800 },
    { ...leaf('other', 'plugin-x'), size: 400 },
  ]);
  expect(next.botPanelSeeds?.['botharness-browser']).toEqual({
    open: true,
    direction: 'left',
    ratio: 0.25,
    hiddenControl: false,
  });
  expect(next.botPanelSeeds?.['botharness-computer']).toMatchObject({
    open: false,
    direction: 'below',
    hiddenControl: true,
  });
  expect(next.botPanelSeeds?.['memory-files']).toEqual(retained);
  expect(next.botWorkspaces).toEqual(previous.botWorkspaces);
  expect(next.channelWorkspaces).toEqual(previous.channelWorkspaces);
  expect(next.sessionSeed).toEqual(retained);
  expect(next.order).toEqual([
    ...['plugin-x'],
    'bh:channels',
    CHANNEL_BODY_PANEL,
    'activity-center',
    'generated-files',
    'bh:home',
  ]);
  expect(next.hiddenControls).toEqual([]);
  expect(storage.getItem(`${CHANNEL_DOCK_STORAGE_KEY}.before-bot-workspace-v5`)).toBe(
    'original-v4',
  );
  expect(storage.getItem(`${CHANNEL_DOCK_STORAGE_KEY}.before-bot-workspace-v6`)).toBe(raw);
  expect(readChannelDock(storage)).toEqual(next);
});

it('persists closed panel proportions and rejects invalid saved dimensions', () => {
  const storage = memoryStorage();
  const parked = {
    activity: {
      direction: 'below' as const,
      neighbor: CHANNEL_BODY_PANEL,
      size: { width: 0.65, height: 0.27 },
    },
    channels: { direction: 'left' as const },
  };
  writeChannelDock({ layout, parked }, storage);
  expect(readChannelDock(storage)?.parked).toEqual(parked);
  for (const width of [0, -0.2, 1.2, '0.3', null]) {
    storage.setItem(
      CHANNEL_DOCK_STORAGE_KEY,
      JSON.stringify({
        version: 6,
        layout,
        parked: { ...parked, activity: { ...parked.activity, size: { width, height: 0.3 } } },
      }),
    );
    expect(readChannelDock(storage)?.parked).toEqual({ channels: parked.channels });
  }
});

it('converts rendered dimensions back to Dockview pre-gap sizes on both axes', () => {
  expect(dockPanelGap(layout, 'sessions', 4)).toEqual({ width: 2, height: 8 / 3 });
  expect(dockPanelGap(layout, CHANNEL_BODY_PANEL, 4)).toEqual({ width: 2, height: 0 });
  expect(dockPanelGap(layout, 'sessions', 0)).toEqual({ width: 0, height: 0 });
  expect(dockPanelGap(layout, 'missing', 4)).toEqual({ width: 0, height: 0 });
});

describe('Home v8 upgrade', () => {
  it('preserves v7 geometry, hidden controls and nested Channel state while appending Home once', () => {
    const storage = memoryStorage();
    const nested = { ...legacyChannelSplit({}), ratio: 0.63 };
    const old = {
      version: 7,
      layout,
      gap: 4,
      order: ['activity-center', 'bh:channel-body', 'bh:channels'],
      hiddenControls: ['activity-center'],
      parked: {
        'generated-files': {
          neighbor: 'bh:channel-body',
          direction: 'below',
          size: { width: 0.7, height: 0.31 },
        },
      },
      channelSplits: { dm: nested },
      channelWorkspaces: {
        dm: { open: false, ratio: 0.37, direction: 'right', hiddenControl: true },
      },
    };
    const raw = JSON.stringify(old);
    storage.setItem(CHANNEL_DOCK_STORAGE_KEY, raw);
    const next = readChannelDock(storage)!;
    expect(next.layout).toEqual(old.layout);
    expect(next.parked).toEqual(old.parked);
    expect(next.hiddenControls).toEqual(old.hiddenControls);
    expect(next.channelWorkspaces).toEqual(old.channelWorkspaces);
    expect(next.channelSplits).toEqual(old.channelSplits);
    expect(next.order?.slice(0, 3)).toEqual(old.order);
    expect(next.order?.at(-1)).toBe('bh:home');
    expect(storage.getItem(CHANNEL_DOCK_STORAGE_KEY + '.before-home-v8')).toBe(raw);
    expect(readChannelDock(storage)).toEqual(next);
  });
  it('does not overwrite future documents or claim persistence after storage failure', () => {
    const storage = memoryStorage();
    const raw = JSON.stringify({ version: 99, layout, parked: {} });
    storage.setItem(CHANNEL_DOCK_STORAGE_KEY, raw);
    expect(readChannelDock(storage)).toBeUndefined();
    expect(writeChannelDock({ layout, parked: {} }, storage)).toBe(false);
    expect(storage.getItem(CHANNEL_DOCK_STORAGE_KEY)).toBe(raw);
    expect(
      writeChannelDock(
        { layout, parked: {} },
        {
          ...storage,
          getItem: () => null,
          setItem: () => {
            throw Error('quota');
          },
        },
      ),
    ).toBe(false);
  });
});
