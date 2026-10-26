import { describe, expect, it } from 'vitest';

import { CHANNEL_BODY_PANEL, CHANNEL_DOCK_STORAGE_KEY } from '../src/client/channel-dock-layout.js';
import {
  DEFAULT_SIMPLE_CHANNELS_WIDTH,
  DEFAULT_SUBPANEL_COLUMN,
  LAYOUT_MODE_STORAGE_KEY,
  readLayoutMode,
  writeLayoutMode,
} from '../src/client/layout-mode.js';

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
  it('starts new Humans in Simple on the Messages view', () => {
    expect(readLayoutMode(memory())).toEqual({
      mode: 'simple',
      view: CHANNEL_BODY_PANEL,
      channelsWidth: DEFAULT_SIMPLE_CHANNELS_WIDTH,
      column: DEFAULT_SUBPANEL_COLUMN,
    });
  });

  it('keeps Humans with a saved layout in Advanced', () => {
    expect(readLayoutMode(memory({ [CHANNEL_DOCK_STORAGE_KEY]: '{}' })).mode).toBe('advanced');
  });

  it('prefers the saved choice over the saved layout', () => {
    const storage = memory({ [CHANNEL_DOCK_STORAGE_KEY]: '{}' });
    const column = {
      open: true,
      width: 0.4,
      expanded: ['sessions', 'botharness-browser'],
      hidden: ['schedules'],
      heights: { sessions: 260 },
    };
    writeLayoutMode({ mode: 'simple', view: 'bh:home', channelsWidth: 0.3, column }, storage);
    expect(readLayoutMode(storage)).toEqual({
      mode: 'simple',
      view: 'bh:home',
      channelsWidth: 0.3,
      column,
    });
  });

  it('falls back field by field on damaged records', () => {
    const storage = memory({
      [LAYOUT_MODE_STORAGE_KEY]: JSON.stringify({
        mode: 'grid',
        view: '',
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
      view: CHANNEL_BODY_PANEL,
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
          view: CHANNEL_BODY_PANEL,
          channelsWidth: 0.2,
          column: DEFAULT_SUBPANEL_COLUMN,
        },
        storage,
      ),
    ).toBe(false);
  });
});
