// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Tooltip: (props: { label: string; shortcutKeys?: readonly string[]; children?: ReactNode }) =>
    createElement(
      'span',
      { 'data-tooltip': props.label, 'data-keys': props.shortcutKeys?.join('+') ?? '' },
      props.children,
    ),
}));

import { createQuickSwitcherLauncher } from '../src/client/quick-switcher-launcher.js';
import { RailSearchButton } from '../src/client/rail-search-button.js';
import { ShortcutBindings } from '../src/client/shortcut-bindings.js';
import { en, zhTranslate } from '../src/client/locale.js';

const enTranslate = ((key: keyof typeof en) => en[key] ?? key) as unknown as typeof zhTranslate;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it('opens the quick switcher from the rail and teaches the current shortcut', () => {
  const launcher = createQuickSwitcherLauncher();
  const opened = vi.fn();
  launcher.subscribe(opened);
  const bindings = new ShortcutBindings(undefined, () => false);
  act(() => root.render(createElement(RailSearchButton, { launcher, bindings, t: enTranslate })));

  const button = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${en['quickSwitcher.title']}"]`,
  )!;
  expect(button).not.toBeNull();
  expect(button.closest('[data-tooltip]')!.getAttribute('data-keys')).toBe('Alt+K');

  act(() => button.click());
  expect(opened).toHaveBeenCalledExactlyOnceWith('rail');

  act(() => {
    bindings.set('quick-switcher', { code: 'KeyP', mod: true, alt: false, shift: true });
  });
  expect(button.closest('[data-tooltip]')!.getAttribute('data-keys')).toBe('Mod+Shift+P');
});

it('still opens search when no shortcut bindings are available', () => {
  const launcher = createQuickSwitcherLauncher();
  const opened = vi.fn();
  launcher.subscribe(opened);
  act(() => root.render(createElement(RailSearchButton, { launcher, t: enTranslate })));
  act(() => host.querySelector('button')!.click());
  expect(opened).toHaveBeenCalledWith('rail');
});

it('hands one open request to the newest Channel list that accepts it', () => {
  const launcher = createQuickSwitcherLauncher();
  const older = vi.fn(() => true);
  const newer = vi.fn(() => false);
  launcher.subscribe(older);
  const stop = launcher.subscribe(newer);
  launcher.open('rail');
  expect(newer).toHaveBeenCalledWith('rail');
  expect(older).toHaveBeenCalledOnce();
  newer.mockReturnValue(true);
  launcher.open('rail');
  expect(older).toHaveBeenCalledOnce();
  stop();
  launcher.open('rail');
  expect(older).toHaveBeenCalledTimes(2);
});
