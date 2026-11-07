// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  botModeSidebarViewport,
  subscribeBotModeSidebarViewport,
} from '../src/client/bot-mode-sidebar-viewport.js';
import { mobileBotViewport, MOBILE_BOT_QUERY } from '../src/client/mobile-viewport.js';

function viewport(width: number, height: number): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.split(',').some((alternative) =>
      [...alternative.matchAll(/\((min|max)-(width|height): (\d+)px\)/g)].every(
        ([, bound, axis, pixels]) => {
          const actual = axis === 'width' ? width : height;
          return bound === 'min' ? actual >= Number(pixels) : actual <= Number(pixels);
        },
      ),
    ),
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('Bot workspace has exactly two responsive layouts', () => {
  it.each([
    [390, 844, true],
    [760, 800, true],
    [761, 800, true],
    [800, 800, true],
    [960, 800, true],
    [961, 800, false],
    [1440, 900, false],
    [961, 500, true],
    [1000, 500, true],
    [1000, 501, false],
    [1001, 500, false],
  ])('selects one layout at %i × %i (mobile=%s)', (width, height, mobile) => {
    viewport(width, height);
    expect(Number(botModeSidebarViewport()) + Number(mobileBotViewport())).toBe(1);
    expect(mobileBotViewport()).toBe(mobile);
  });

  it('keeps a single media-change listener per desktop subscriber, with complete cleanup', () => {
    const add = vi.fn();
    const remove = vi.fn();
    const media = vi.fn(() => ({ addEventListener: add, removeEventListener: remove }));
    const windowEvents = vi.spyOn(window, 'addEventListener');
    vi.stubGlobal('matchMedia', media);
    const listener = vi.fn();
    try {
      const release = subscribeBotModeSidebarViewport(listener);
      expect(media).toHaveBeenCalledExactlyOnceWith(MOBILE_BOT_QUERY);
      expect(add).toHaveBeenCalledExactlyOnceWith('change', listener);
      expect(windowEvents).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
      release();
      expect(remove).toHaveBeenCalledExactlyOnceWith('change', listener);
    } finally {
      windowEvents.mockRestore();
    }
  });

  it('does not claim an unsupported or server-side viewport', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(botModeSidebarViewport()).toBe(false);
    expect(mobileBotViewport()).toBe(false);
    expect(subscribeBotModeSidebarViewport(vi.fn())).toBeTypeOf('function');
    vi.stubGlobal('window', undefined);
    expect(botModeSidebarViewport()).toBe(false);
    expect(mobileBotViewport()).toBe(false);
  });
});
