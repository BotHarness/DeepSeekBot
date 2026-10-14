// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./primitive-mocks.js')).dialogPrimitives(),
);

import { en, type BotHarnessTranslate } from '../src/client/locale.js';
import {
  SHORTCUT_HELP_GROUPS,
  ShortcutHelp,
  ShortcutHelpList,
  ShortcutHelpView,
  shortcutKeyLabel,
} from '../src/client/shortcut-help.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const t = ((key: keyof typeof en) => en[key]) as unknown as BotHarnessTranslate;

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
    expect(row('unread-step')?.textContent).toBe(
      'Previous or next unread conversationSkips muted conversationsAltShift↑orAltShift↓',
    );
    expect(host.querySelectorAll('h3')).toHaveLength(2);
    act(() => root.render(createElement(ShortcutHelpList, { t, apple: true })));
    expect(row('help')?.textContent).toBe('Show keyboard shortcuts?or⌘/');
    expect(row('conversation-step')?.textContent).toBe('Previous or next conversation⌥↑or⌥↓');
    act(() => root.unmount());
  });

  it('names the modifier for the platform', () => {
    expect(shortcutKeyLabel('Mod', true)).toBe('⌘');
    expect(shortcutKeyLabel('Mod', false)).toBe('Ctrl');
    expect(shortcutKeyLabel('Alt', true)).toBe('⌥');
    expect(shortcutKeyLabel('Enter', true)).toBe('Enter');
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
