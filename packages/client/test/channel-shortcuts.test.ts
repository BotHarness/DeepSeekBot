import { describe, expect, it } from 'vitest';

import {
  webBotModeShortcut,
  webChannelShortcutIndex,
  webChannelShortcutLabel,
  webShortcutBlocked,
  webShortcutBlockedByModal,
  webShortcutHelpShortcut,
} from '../src/client/channel-shortcuts.js';

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

  it('is blocked only by an open modal for Ctrl+/', () => {
    expect(webShortcutBlockedByModal({ querySelector: () => null })).toBe(false);
    expect(webShortcutBlockedByModal({ querySelector: () => ({}) })).toBe(true);
  });
});
