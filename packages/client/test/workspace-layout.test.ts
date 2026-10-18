import type { SerializedDockview } from 'dockview-react';
import { describe, expect, it } from 'vitest';
import { isFullHeightRail, reorderWorkspaceRail } from '../src/client/workspace-layout.js';
import { WORKSPACE_RAIL } from '../src/client/workspace-context.js';
import {
  CHANNEL_BODY_PANEL,
  CHANNEL_DOCK_STORAGE_KEY,
  readChannelDock,
} from '../src/client/channel-dock-layout.js';

const leaf = (id: string, panel = id) => ({
  type: 'leaf' as const,
  data: { id, views: [panel], activeView: panel },
  size: 260,
});
const stacked = { type: 'branch' as const, data: [leaf('activity'), leaf('sessions')], size: 320 };
const layout: SerializedDockview = {
  grid: {
    orientation: 'HORIZONTAL' as SerializedDockview['grid']['orientation'],
    width: 1440,
    height: 900,
    root: {
      type: 'branch',
      data: [
        leaf('rail', WORKSPACE_RAIL),
        leaf('channels'),
        leaf('body', CHANNEL_BODY_PANEL),
        stacked,
      ],
    },
  },
  panels: Object.fromEntries(
    [WORKSPACE_RAIL, 'channels', CHANNEL_BODY_PANEL, 'activity', 'sessions'].map((id) => [
      id,
      { id, contentComponent: 'panel' },
    ]),
  ),
  activeGroup: 'body',
};

describe('workspace layout', () => {
  it('moves before a stacked column without splitting or resetting any of its panels', () => {
    const moved = reorderWorkspaceRail(layout, 'activity');
    const nodes = moved.grid.root.data as (typeof stacked)[];
    expect(nodes.at(-1)).toBe(stacked);
    expect(nodes[2]).toBe((layout.grid.root.data as unknown[])[0]);
    expect(moved.activeGroup).toBe('body');
    expect(isFullHeightRail(moved)).toBe(true);
    expect(reorderWorkspaceRail(moved, 'left')).toEqual(layout);
    expect(isFullHeightRail(reorderWorkspaceRail(layout, 'right'))).toBe(true);
  });

  it('rejects a rail nested in a half-height branch', () => {
    const invalid = {
      ...layout,
      grid: {
        ...layout.grid,
        root: {
          type: 'branch' as const,
          data: [
            { type: 'branch' as const, data: [leaf('rail', WORKSPACE_RAIL), leaf('activity')] },
            leaf('body', CHANNEL_BODY_PANEL),
          ],
        },
      },
    };
    expect(isFullHeightRail(invalid)).toBe(false);
  });

  it('migrates v1 without discarding custom geometry or closed-panel locations', () => {
    const parked = { computer: { neighbor: 'sessions', direction: 'below' } };
    const storage = {
      getItem: (key: string) =>
        key === CHANNEL_DOCK_STORAGE_KEY ? JSON.stringify({ version: 1, layout, parked }) : null,
      setItem() {},
      removeItem() {},
    };
    const migrated = readChannelDock(storage)!;
    expect(migrated).toMatchObject({
      version: 8,
      gap: 4,
      order: ['bh:channels', CHANNEL_BODY_PANEL, 'activity-center', 'generated-files', 'bh:home'],
      hiddenControls: [],
      members: { open: false, ratio: 0.3 },
      sessionSeed: { open: true, hiddenControl: false },
      channelWorkspaces: {},
      parked: { computer: { neighbor: CHANNEL_BODY_PANEL, direction: 'below' } },
    });
    expect(migrated.layout.panels.sessions).toBeUndefined();
    expect(migrated.layout.panels.activity).toEqual(layout.panels.activity);
    const migratedRows = migrated.layout.grid.root.data;
    const originalRows = layout.grid.root.data;
    if (!Array.isArray(migratedRows) || !Array.isArray(originalRows))
      throw Error('Expected root branches');
    expect(migratedRows[0]).toEqual(originalRows[0]);
    for (const [gap, expected] of [
      [-3, 0],
      [32, 16],
      [7.4, 7],
    ]) {
      storage.getItem = () => JSON.stringify({ version: 2, layout, parked, gap });
      expect(readChannelDock(storage)?.gap).toBe(expected);
    }
    storage.getItem = () => JSON.stringify({ version: '2', layout });
    expect(readChannelDock(storage)).toBeUndefined();
  });
});
