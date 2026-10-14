// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { cloneElement } = await import('react');
  return {
    ...(await import('./primitive-mocks.js')).dialogPrimitives(),
    IconEditOutlineRegular: () => null,
    Tooltip: ({ label, children }: { label: string; children: ReactElement }) =>
      cloneElement(children, { 'data-tooltip': label } as never),
  };
});

import { en, type BotHarnessTranslate } from '../src/client/locale.js';
import {
  SHORTCUT_HELP_GROUPS,
  ShortcutHelp,
  ShortcutHelpList,
  ShortcutHelpView,
} from '../src/client/shortcut-help.js';
import { ShortcutBindings } from '../src/client/shortcut-bindings.js';
import { shortcutKeyLabel } from '../src/client/ds/kbd.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const t = ((key: keyof typeof en, values: Record<string, string> = {}) =>
  en[key].replace(
    /\{(\w+)\}/gu,
    (_, name: string) => values[name] ?? '',
  )) as unknown as BotHarnessTranslate;

describe('shortcut list', () => {
  it('lists every shortcut once with its keys', () => {
    const ids = SHORTCUT_HELP_GROUPS.flatMap((group) => group.entries.map((entry) => entry.id));
    expect(new Set(ids).size).toBe(ids.length);

    const host = document.createElement('div');
    const root = createRoot(host);
    act(() => root.render(createElement(ShortcutHelpList, { t, apple: false })));
    const row = (id: string) => host.querySelector(`[data-shortcut="${id}"]`);
    expect(row('bot-mode')?.textContent).toBe('Enter or leave Bot modeAlt`');
    expect(row('help')?.textContent).toBe('Show keyboard shortcuts?orCtrl/');
    expect(row('recall')?.textContent).toContain('When the composer is empty');
    expect(row('quick-switcher')?.textContent).toBe('Quick switcherCtrlK');
    expect(row('search')?.textContent).toBe('Search this conversationCtrlF');
    expect(row('unread-next')?.textContent).toBe(
      'Next unread conversationSkips muted conversationsAlt⇧↓',
    );
    expect(row('send')?.textContent).toBe('Send↵');
    expect(row('newline')?.textContent).toBe('New line⇧↵');
    expect(row('newline')?.querySelector('kbd')?.getAttribute('title')).toBe('Shift');
    expect(host.querySelectorAll('h3')).toHaveLength(4);
    expect(host.querySelector('button')).toBeNull();
    expect(row('approval-allow')?.textContent).toBe(
      'Allow onceWhile the approval card has focusYor↵',
    );
    expect(row('inbox-step')?.textContent).toBe('Next or previous itemJorK');
    act(() => root.render(createElement(ShortcutHelpList, { t, apple: true })));
    expect(row('help')?.textContent).toBe('Show keyboard shortcuts?or⌘/');
    expect(row('unread-prev')?.textContent).toContain('⌥⇧↑');
    act(() =>
      root.render(createElement(ShortcutHelpList, { t, apple: true, sendKey: 'mod-enter' })),
    );
    expect(row('send')?.textContent).toBe('Send⌘↵');
    expect(row('newline')?.textContent).toBe('New line↵');
    act(() => root.unmount());
  });

  it('names the modifier for the platform', () => {
    expect(shortcutKeyLabel('Mod', true)).toBe('⌘');
    expect(shortcutKeyLabel('Mod', false)).toBe('Ctrl');
    expect(shortcutKeyLabel('Alt', true)).toBe('⌥');
    expect(shortcutKeyLabel('Enter', true)).toBe('↵');
    expect(shortcutKeyLabel('Shift', false)).toBe('⇧');
  });

  it('records, refuses and resets a changed shortcut', () => {
    const bindings = new ShortcutBindings(undefined, () => false);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(createElement(ShortcutHelpList, { t, apple: false, shortcutBindings: bindings })),
    );
    const row = () => host.querySelector('[data-shortcut="bot-mode"]')!;
    const change = () =>
      host.querySelector<HTMLButtonElement>(
        'button[aria-label="Change the shortcut for “Enter or leave Bot mode”"]',
      )!;
    const recorder = () => row().querySelector<HTMLButtonElement>('[data-shortcut-recorder]');
    const press = (init: KeyboardEventInit) =>
      act(() => {
        recorder()!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
      });
    let leaked = 0;
    const onDocument = () => {
      leaked += 1;
    };
    document.addEventListener('keydown', onDocument);

    const locked = host.querySelector<HTMLButtonElement>(
      '[data-shortcut="recall"] [data-shortcut-locked]',
    )!;
    expect(locked.getAttribute('aria-disabled')).toBe('true');
    expect(locked.dataset.tooltip).toBe("Can't be changed");
    act(() => locked.click());
    expect(host.querySelector('[data-shortcut-recorder]')).toBeNull();
    expect(
      host.querySelector<HTMLElement>('[data-shortcut="send"] [data-shortcut-locked]')?.dataset
        .tooltip,
    ).toBe("Can't be changed here; switch it in Bot settings › General › Send messages");
    expect(change().dataset.tooltip).toBe('Change');
    expect(change().textContent).toBe('');

    act(() => change().click());
    expect(recorder()?.textContent).toBe('Press new keys, Esc to cancel');
    press({ key: 'Control', code: 'ControlLeft', ctrlKey: true });
    expect(recorder()).not.toBeNull();
    press({ key: 'k', code: 'KeyK', ctrlKey: true });
    expect(row().querySelector('[role="alert"]')?.textContent).toBe(
      'Already used by “Quick switcher”',
    );
    press({ key: 'j', code: 'KeyJ' });
    expect(row().querySelector('[role="alert"]')?.textContent).toBe('Include Ctrl or Alt');
    press({ key: 'b', code: 'KeyB', ctrlKey: true, shiftKey: true });
    expect(recorder()).toBeNull();
    expect(row().querySelector('[role="status"]')?.textContent).toBe('Saved');
    expect(row().textContent).toContain('Ctrl⇧B');
    expect(bindings.isCustom('bot-mode')).toBe(true);
    expect(leaked).toBe(0);

    act(() => change().click());
    press({ key: 'Escape', code: 'Escape' });
    expect(recorder()).toBeNull();
    expect(bindings.binding('bot-mode').code).toBe('KeyB');

    const reset = [...row().querySelectorAll('button')].find(
      (button) => button.textContent === 'Reset',
    )!;
    act(() => reset.click());
    expect(bindings.isCustom('bot-mode')).toBe(false);
    expect(row().textContent).toContain('Alt`');
    document.removeEventListener('keydown', onDocument);
    act(() => root.unmount());
    host.remove();
  });

  it('shows the dialog only while open', () => {
    const help = new ShortcutHelp();
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() => root.render(createElement(ShortcutHelpView, { shortcutHelp: help, t })));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    act(() => help.open());
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
      'Keyboard shortcuts',
    );
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click());
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    act(() => root.unmount());
  });

  it('opens, toggles and closes', () => {
    const help = new ShortcutHelp();
    let changes = 0;
    help.subscribe(() => (changes += 1));
    help.open();
    help.open();
    expect(help.getSnapshot()).toBe(true);
    help.toggle();
    expect(help.getSnapshot()).toBe(false);
    help.close();
    expect(changes).toBe(2);
  });
});
