// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

import { botModeSidebarViewport } from '../src/client/bot-mode-sidebar-viewport.js';
import { getWindowClass, subscribeWindowClass } from '../src/client/ds/window-class.js';

function viewport(width: number): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: width >= Number(query.match(/\d+/)?.[0]),
  }));
}

afterEach(() => vi.unstubAllGlobals());

it.each([
  [400, 'compact', false],
  [599, 'compact', false],
  [600, 'medium', true],
  [720, 'medium', true],
  [839, 'medium', true],
  [840, 'expanded', true],
  [1280, 'expanded', true],
])('selects the Bot-mode layout at %i px', (width, windowClass, sidebar) => {
  viewport(width);
  expect(getWindowClass()).toBe(windowClass);
  expect(botModeSidebarViewport()).toBe(sidebar);
});

it('releases both media listeners after a subscriber leaves', () => {
  const add = vi.fn();
  const remove = vi.fn();
  vi.stubGlobal('matchMedia', () => ({ addEventListener: add, removeEventListener: remove }));
  const listener = vi.fn();
  const release = subscribeWindowClass(listener);
  expect(add.mock.calls).toEqual([
    ['change', listener],
    ['change', listener],
  ]);
  release();
  expect(remove.mock.calls).toEqual(add.mock.calls);
});
