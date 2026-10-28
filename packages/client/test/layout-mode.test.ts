import { describe, expect, it } from 'vitest';

import { CHANNEL_BODY_PANEL, CHANNEL_DOCK_STORAGE_KEY } from '../src/client/channel-dock-layout.js';
import {
  DEFAULT_SIMPLE_CHANNELS_WIDTH,
  DEFAULT_SUBPANEL_COLUMN,
  LAYOUT_MODE_STORAGE_KEY,
  readLayoutMode,
  writeLayoutMode,
} from '../src/client/layout-mode.js';
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

describe('Layout mode preference', () => {
  it('starts new Humans in Simple with the Channel list in the Side column', () => {
    expect(readLayoutMode(memory())).toEqual({
      mode: 'simple',
      sideColumn: WORKSPACE_CHANNELS,
      channelsWidth: DEFAULT_SIMPLE_CHANNELS_WIDTH,
      column: DEFAULT_SUBPANEL_COLUMN,
    });
  });

  it('keeps Humans with a saved layout in Advanced', () => {
    expect(readLayoutMode(memory({ [CHANNEL_DOCK_STORAGE_KEY]: '{}' })).mode).toBe('advanced');
  });

  const column = {
    open: true,
    width: 0.4,
    expanded: ['sessions'],
    hidden: ['schedules'],
    heights: { sessions: 260 },
  };
  it.each([
    [CHANNEL_BODY_PANEL, WORKSPACE_CHANNELS],
    [WORKSPACE_CHANNELS, WORKSPACE_CHANNELS],
    ['bh:home', WORKSPACE_CHANNELS],
    ['activity-center', 'activity-center'],
    ['market', 'market'],
    ['instance:abc', 'instance:abc'],
  ])('moves a saved Simple %s view to the Side column item %s', (view, sideColumn) => {
    const raw = JSON.stringify({ mode: 'simple', view, channelsWidth: 0.3, column });
    const storage = memory({ [LAYOUT_MODE_STORAGE_KEY]: raw });
    const expected = { mode: 'simple', sideColumn, channelsWidth: 0.3, column };
    expect(readLayoutMode(storage)).toEqual(expected);
    const backup = `${LAYOUT_MODE_STORAGE_KEY}.before-side-column-v10`;
    expect(storage.values.get(backup)).toBe(raw);
    expect(JSON.parse(storage.values.get(LAYOUT_MODE_STORAGE_KEY)!)).toEqual(expected);
    storage.values.set(LAYOUT_MODE_STORAGE_KEY, raw.replace('0.3', '0.25'));
    readLayoutMode(storage);
    expect(storage.values.get(backup)).toBe(raw);
  });

  it('does not rewrite or back up a current record', () => {
    const raw = JSON.stringify({ mode: 'simple', sideColumn: null, channelsWidth: 0.3, column });
    const storage = memory({ [LAYOUT_MODE_STORAGE_KEY]: raw });
    expect(readLayoutMode(storage).sideColumn).toBeNull();
    expect(storage.values.get(LAYOUT_MODE_STORAGE_KEY)).toBe(raw);
    expect(storage.values.size).toBe(1);
  });

  it('prefers the saved choice over the saved layout and round-trips a hidden Side column', () => {
    const storage = memory({ [CHANNEL_DOCK_STORAGE_KEY]: '{}' });
    const wide = { ...column, expanded: ['sessions', 'botharness-browser'] };
    for (const sideColumn of ['activity-center', null]) {
      writeLayoutMode({ mode: 'simple', sideColumn, channelsWidth: 0.3, column: wide }, storage);
      expect(readLayoutMode(storage)).toEqual({
        mode: 'simple',
        sideColumn,
        channelsWidth: 0.3,
        column: wide,
      });
    }
  });

  it('falls back field by field on damaged records', () => {
    const storage = memory({
      [LAYOUT_MODE_STORAGE_KEY]: JSON.stringify({
        mode: 'grid',
        sideColumn: 7,
        channelsWidth: 4,
        column: {
          open: 'yes',
          width: 2,
          expanded: 'sessions',
          hidden: [3, 'x'],
          heights: { a: 10, b: 'tall', c: 200 },
        },
      }),
    });
    expect(readLayoutMode(storage)).toEqual({
      mode: 'simple',
      sideColumn: WORKSPACE_CHANNELS,
      channelsWidth: DEFAULT_SIMPLE_CHANNELS_WIDTH,
      column: { ...DEFAULT_SUBPANEL_COLUMN, hidden: ['x'], heights: { c: 200 } },
    });
    storage.setItem(LAYOUT_MODE_STORAGE_KEY, 'not json');
    expect(readLayoutMode(storage).mode).toBe('simple');
  });

  it('reports a failed write without throwing', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    };
    expect(
      writeLayoutMode(
        {
          mode: 'advanced',
          sideColumn: WORKSPACE_CHANNELS,
          channelsWidth: 0.2,
          column: DEFAULT_SUBPANEL_COLUMN,
        },
        storage,
      ),
    ).toBe(false);
  });
});
