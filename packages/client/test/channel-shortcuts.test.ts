import { describe, expect, it } from 'vitest';

import {
  steppedConversationId,
  webQuickSwitcherBlocked,
  webChannelShortcutIndex,
  webChannelShortcutLabel,
  webModalOpen,
  webShortcutBlocked,
  webShortcutHelpQuestion,
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

describe('web shortcut list question mark', () => {
  const none = { alt: false, ctrl: false, meta: false };

  it('opens on ? without Ctrl, ⌘ or Alt', () => {
    expect(webShortcutHelpQuestion('?', none)).toBe(true);
    expect(webShortcutHelpQuestion('/', none)).toBe(false);
    expect(webShortcutHelpQuestion('?', { ...none, alt: true })).toBe(false);
    expect(webShortcutHelpQuestion('?', { ...none, ctrl: true })).toBe(false);
    expect(webShortcutHelpQuestion('?', { ...none, meta: true })).toBe(false);
    expect(webShortcutHelpQuestion('?', { ...none, altGraph: true })).toBe(false);
    expect(webShortcutHelpQuestion('?', { ...none, composing: true })).toBe(false);
    expect(webShortcutHelpQuestion('?', { ...none, repeat: true })).toBe(false);
    expect(webShortcutHelpQuestion('?', { ...none, prevented: true })).toBe(false);
  });
});
