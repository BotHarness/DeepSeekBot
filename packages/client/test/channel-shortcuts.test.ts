import { describe, expect, it } from 'vitest';

import {
  steppedConversationId,
  webBotModeShortcut,
  webQuickSwitcherBlocked,
  webQuickSwitcherLabel,
  webQuickSwitcherShortcut,
  webChannelShortcutIndex,
  webChannelShortcutLabel,
  webConversationStepLabel,
  webConversationStepShortcut,
  webModalOpen,
  webShortcutBlocked,
  webShortcutHelpShortcut,
} from '../src/client/channel-shortcuts.js';
import { isApplePlatform } from '../src/client/ds/kbd.js';

const alt = { alt: true, ctrl: false, meta: false, shift: false };

describe('web channel number shortcuts', () => {
  it('maps Alt+1–9 to the first nine channels and Alt+0 to the tenth', () => {
    for (let number = 1; number <= 9; number += 1) {
      expect(webChannelShortcutIndex(`Digit${number}`, alt)).toBe(number - 1);
      expect(webChannelShortcutLabel(number - 1)).toBe(`Alt+${number}`);
    }
    expect(webChannelShortcutIndex('Digit0', alt)).toBe(9);
    expect(webChannelShortcutLabel(9)).toBe('Alt+0');
  });

  it('leaves browser tab keys, AltGraph, IME, repeats, and other keys alone', () => {
    expect(webChannelShortcutIndex('Digit1', { ...alt, ctrl: true })).toBeUndefined();
    expect(webChannelShortcutIndex('Digit1', { ...alt, meta: true })).toBeUndefined();
    expect(webChannelShortcutIndex('Digit1', { ...alt, altGraph: true })).toBeUndefined();
    expect(webChannelShortcutIndex('Digit1', { ...alt, composing: true })).toBeUndefined();
    expect(webChannelShortcutIndex('Digit1', { ...alt, repeat: true })).toBeUndefined();
    expect(webChannelShortcutIndex('Digit1', { ...alt, prevented: true })).toBeUndefined();
    expect(webChannelShortcutIndex('Numpad1', alt)).toBeUndefined();
    expect(webChannelShortcutIndex('Digit1', { ...alt, alt: false })).toBeUndefined();
    expect(webChannelShortcutLabel(10)).toBeUndefined();
  });

  it('toggles Bot mode only for Alt plus the physical backquote key', () => {
    expect(webBotModeShortcut('Backquote', alt)).toBe(true);
    expect(webBotModeShortcut('Backquote', { ...alt, alt: false })).toBe(false);
    expect(webBotModeShortcut('Backquote', { ...alt, ctrl: true })).toBe(false);
    expect(webBotModeShortcut('Backquote', { ...alt, meta: true })).toBe(false);
    expect(webBotModeShortcut('Backquote', { ...alt, shift: true })).toBe(false);
    expect(webBotModeShortcut('Backquote', { ...alt, altGraph: true })).toBe(false);
    expect(webBotModeShortcut('Backquote', { ...alt, composing: true })).toBe(false);
    expect(webBotModeShortcut('Backquote', { ...alt, repeat: true })).toBe(false);
    expect(webBotModeShortcut('Backquote', { ...alt, prevented: true })).toBe(false);
    expect(webBotModeShortcut('Digit1', alt)).toBe(false);
  });
  it('blocks shortcuts while a native or ARIA modal is open', () => {
    let selector = '';
    const modalRoot = {
      querySelector(value: string): object {
        selector = value;
        return {};
      },
    };
    expect(webShortcutBlocked(null, modalRoot)).toBe(true);
    expect(selector).toContain('dialog[open]');
    expect(selector).toContain('[role="alertdialog"][aria-modal="true"]');
    expect(webShortcutBlocked(null, { querySelector: () => null })).toBe(false);
  });

  it('opens the quick switcher with Ctrl+K, or Command+K on macOS', () => {
    const none = { alt: false, ctrl: false, meta: false, shift: false };
    const ctrl = { ...none, ctrl: true, mac: false };
    const cmd = { ...none, meta: true, mac: true };
    expect(webQuickSwitcherShortcut('k', 'KeyK', ctrl)).toBe(true);
    expect(webQuickSwitcherShortcut('K', 'KeyK', ctrl)).toBe(true);
    expect(webQuickSwitcherShortcut('k', 'KeyK', cmd)).toBe(true);
    expect(webQuickSwitcherShortcut('k', 'KeyK', { ...ctrl, mac: true })).toBe(false);
    expect(webQuickSwitcherShortcut('k', 'KeyK', { ...cmd, mac: false })).toBe(false);
    expect(webQuickSwitcherShortcut('k', 'KeyK', { ...ctrl, meta: true })).toBe(false);
    expect(webQuickSwitcherShortcut('k', 'KeyK', { ...ctrl, shift: true })).toBe(false);
    expect(webQuickSwitcherShortcut('k', 'KeyK', { ...ctrl, alt: true })).toBe(false);
    expect(webQuickSwitcherShortcut('k', 'KeyK', { ...ctrl, altGraph: true })).toBe(false);
    expect(webQuickSwitcherShortcut('k', 'KeyK', { ...ctrl, composing: true })).toBe(false);
    expect(webQuickSwitcherShortcut('k', 'KeyK', { ...ctrl, repeat: true })).toBe(false);
    expect(webQuickSwitcherShortcut('k', 'KeyK', { ...ctrl, prevented: true })).toBe(false);
    expect(webQuickSwitcherShortcut('k', 'KeyK', { ...none, mac: false })).toBe(false);
    expect(webQuickSwitcherShortcut('k', 'KeyV', ctrl)).toBe(true);
    expect(webQuickSwitcherShortcut('t', 'KeyK', ctrl)).toBe(false);
    expect(webQuickSwitcherShortcut('л', 'KeyK', ctrl)).toBe(true);
    expect(webQuickSwitcherShortcut('j', 'KeyJ', ctrl)).toBe(false);
    expect(webQuickSwitcherLabel(false)).toBe('Ctrl+K');
    expect(webQuickSwitcherLabel(true)).toBe('⌘K');
  });

  it('detects macOS from the browser platform', () => {
    expect(isApplePlatform({ platform: 'MacIntel' })).toBe(true);
    expect(isApplePlatform({ userAgentData: { platform: 'macOS' } })).toBe(true);
    expect(isApplePlatform({ platform: 'iPad' })).toBe(true);
    expect(isApplePlatform({ platform: 'Win32' })).toBe(false);
    expect(isApplePlatform({ userAgentData: { platform: 'Linux' }, platform: 'MacIntel' })).toBe(
      false,
    );
  });

  it('keeps the quick switcher available in text fields but not over a modal', () => {
    let selector = '';
    const modalRoot = {
      querySelector(value: string): object {
        selector = value;
        return {};
      },
    };
    expect(webQuickSwitcherBlocked(null, modalRoot)).toBe(true);
    expect(selector).toContain('[role="dialog"][aria-modal="true"]');
    expect(webQuickSwitcherBlocked(null, { querySelector: () => null })).toBe(false);
  });
});

describe('web conversation step shortcuts', () => {
  it('maps Alt+↑/↓ to the previous or next conversation and adds Shift for unread only', () => {
    expect(webConversationStepShortcut('ArrowUp', alt)).toEqual({
      direction: -1,
      unreadOnly: false,
    });
    expect(webConversationStepShortcut('ArrowDown', alt)).toEqual({
      direction: 1,
      unreadOnly: false,
    });
    expect(webConversationStepShortcut('ArrowDown', { ...alt, shift: true })).toEqual({
      direction: 1,
      unreadOnly: true,
    });
    expect(webConversationStepLabel({ direction: 1, unreadOnly: true })).toBe('Alt+Shift+↓');
    expect(webConversationStepLabel({ direction: -1, unreadOnly: false })).toBe('Alt+↑');
  });

  it('leaves plain arrows, other modifiers, IME and handled events alone', () => {
    expect(webConversationStepShortcut('ArrowUp', { ...alt, alt: false })).toBeUndefined();
    expect(webConversationStepShortcut('ArrowUp', { ...alt, ctrl: true })).toBeUndefined();
    expect(webConversationStepShortcut('ArrowUp', { ...alt, meta: true })).toBeUndefined();
    expect(webConversationStepShortcut('ArrowUp', { ...alt, altGraph: true })).toBeUndefined();
    expect(webConversationStepShortcut('ArrowUp', { ...alt, composing: true })).toBeUndefined();
    expect(webConversationStepShortcut('ArrowUp', { ...alt, prevented: true })).toBeUndefined();
    expect(webConversationStepShortcut('ArrowLeft', alt)).toBeUndefined();
  });

  it('steps through sidebar order and wraps at either end', () => {
    const order = ['a', 'b', 'c'];
    expect(steppedConversationId(order, 'b', 1)).toBe('c');
    expect(steppedConversationId(order, 'c', 1)).toBe('a');
    expect(steppedConversationId(order, 'a', -1)).toBe('c');
    expect(steppedConversationId(order, undefined, 1)).toBe('a');
    expect(steppedConversationId(order, undefined, -1)).toBe('c');
    expect(steppedConversationId(order, 'gone', 1)).toBe('a');
    expect(steppedConversationId([], 'a', 1)).toBeUndefined();
    expect(steppedConversationId(['a'], 'a', 1)).toBeUndefined();
  });

  it('skips to the next eligible conversation for the unread jump', () => {
    const order = ['a', 'b', 'c', 'd'];
    const unread = new Set(['a', 'c']);
    const eligible = (id: string) => unread.has(id);
    expect(steppedConversationId(order, 'a', 1, eligible)).toBe('c');
    expect(steppedConversationId(order, 'c', 1, eligible)).toBe('a');
    expect(steppedConversationId(order, 'b', -1, eligible)).toBe('a');
    expect(steppedConversationId(order, 'a', 1, () => false)).toBeUndefined();
  });

  it('is blocked only by an open modal, not by a focused text field', () => {
    expect(webModalOpen({ querySelector: () => null })).toBe(false);
    expect(webModalOpen({ querySelector: () => ({}) })).toBe(true);
  });
});

describe('web shortcut list shortcut', () => {
  const none = { alt: false, ctrl: false, meta: false, shift: false };

  it('opens on ? and on Ctrl+/ or ⌘+/', () => {
    expect(webShortcutHelpShortcut({ key: '?', code: 'Slash' }, { ...none, shift: true })).toBe(
      'question',
    );
    expect(webShortcutHelpShortcut({ key: '/', code: 'Slash' }, { ...none, ctrl: true })).toBe(
      'slash',
    );
    expect(webShortcutHelpShortcut({ key: '/', code: 'Slash' }, { ...none, meta: true })).toBe(
      'slash',
    );
  });

  it('leaves plain /, Alt, IME, repeats and handled keys alone', () => {
    expect(webShortcutHelpShortcut({ key: '/', code: 'Slash' }, none)).toBeUndefined();
    expect(
      webShortcutHelpShortcut({ key: '?', code: 'Slash' }, { ...none, shift: true, alt: true }),
    ).toBeUndefined();
    expect(
      webShortcutHelpShortcut({ key: '?', code: 'Slash' }, { ...none, composing: true }),
    ).toBeUndefined();
    expect(
      webShortcutHelpShortcut({ key: '/', code: 'Slash' }, { ...none, ctrl: true, repeat: true }),
    ).toBeUndefined();
    expect(
      webShortcutHelpShortcut(
        { key: '/', code: 'Slash' },
        { ...none, ctrl: true, prevented: true },
      ),
    ).toBeUndefined();
    expect(
      webShortcutHelpShortcut({ key: '?', code: 'Slash' }, { ...none, shift: true, ctrl: true }),
    ).toBeUndefined();
  });
});
