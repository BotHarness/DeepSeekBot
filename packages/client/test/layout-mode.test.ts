import { describe, expect, it } from 'vitest';

import { CHANNEL_BODY_PANEL, CHANNEL_DOCK_STORAGE_KEY } from '../src/client/channel-dock-layout.js';
import {
  DEFAULT_SIMPLE_CHANNELS_WIDTH,
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
    });
  });

  it('keeps Humans with a saved layout in Advanced', () => {
    expect(readLayoutMode(memory({ [CHANNEL_DOCK_STORAGE_KEY]: '{}' })).mode).toBe('advanced');
  });

  it('prefers the saved choice over the saved layout', () => {
    const storage = memory({ [CHANNEL_DOCK_STORAGE_KEY]: '{}' });
    writeLayoutMode({ mode: 'simple', view: 'bh:home', channelsWidth: 0.3 }, storage);
    expect(readLayoutMode(storage)).toEqual({
      mode: 'simple',
      view: 'bh:home',
      channelsWidth: 0.3,
    });
  });

  it('falls back field by field on damaged records', () => {
    const storage = memory({
      [LAYOUT_MODE_STORAGE_KEY]: JSON.stringify({ mode: 'grid', view: '', channelsWidth: 4 }),
    });
    expect(readLayoutMode(storage)).toEqual({
      mode: 'simple',
      view: CHANNEL_BODY_PANEL,
      channelsWidth: DEFAULT_SIMPLE_CHANNELS_WIDTH,
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
      writeLayoutMode({ mode: 'advanced', view: CHANNEL_BODY_PANEL, channelsWidth: 0.2 }, storage),
    ).toBe(false);
  });
});
