import type { SerializedDockview } from 'dockview-react';
import { describe, expect, it } from 'vitest';

import {
  allowsDockDrop,
  CHANNEL_BODY_PANEL,
  CHANNEL_DOCK_STORAGE_KEY,
  pruneChannelDock,
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
    expect(JSON.parse(storage.values.get(CHANNEL_DOCK_STORAGE_KEY)!).version).toBe(1);
    expect(readChannelDock(storage)).toEqual({
      version: 1,
      layout,
      parked: { schedules: { direction: 'below' } },
    });
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
