// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconSearchOutlineRegular: () => null,
  Input: (props: Record<string, unknown>) => {
    const { icon: _icon, ...rest } = props;
    return createElement('input', rest);
  },
  ShortcutKeys: (props: { keys: readonly string[] }) =>
    createElement('kbd', null, props.keys.join(' ')),
  Modal: (props: Record<string, unknown>) =>
    createElement(
      'div',
      { role: 'dialog', 'aria-modal': 'true', 'aria-label': props['title'] },
      props['children'] as ReactNode,
    ),
}));

vi.mock('../src/client/avatar.js', () => ({
  PersonaBotAvatar: (props: { name: string }) => createElement('span', null, props.name),
}));

import { webQuickSwitcherBlocked } from '../src/client/channel-shortcuts.js';
import { QuickSwitcher } from '../src/client/quick-switcher.js';
import {
  quickSwitcherEntries,
  type QuickSwitcherEntry,
} from '../src/client/quick-switcher-rank.js';
import { zhTranslate } from '../src/client/locale.js';
import type { ChannelSummary } from '../src/client/store.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const group = (id: string, name: string, at: string): ChannelSummary => ({
  id,
  type: 'group',
  name,
  members: [],
  createdAt: at,
  updatedAt: at,
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('quick switcher focus rules', () => {
  it('stays available in the composer but not inside or over a dialog', () => {
    const composer = document.createElement('textarea');
    document.body.append(composer);
    expect(webQuickSwitcherBlocked(composer, document)).toBe(false);

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const field = document.createElement('input');
    dialog.append(field);
    document.body.append(dialog);
    expect(webQuickSwitcherBlocked(field, document)).toBe(true);

    dialog.setAttribute('aria-modal', 'true');
    expect(webQuickSwitcherBlocked(composer, document)).toBe(true);
  });
});

describe('quick switcher keyboard', () => {
  it('filters, moves the highlight with arrows and opens with Enter', async () => {
    const entries = quickSwitcherEntries(
      [
        group('a', 'Alpha launch', '2026-10-03T00:00:00.000Z'),
        group('b', 'Beta launch', '2026-10-02T00:00:00.000Z'),
        group('c', '产品发布', '2026-10-01T00:00:00.000Z'),
      ],
      [],
      [],
    );
    const opened: QuickSwitcherEntry[] = [];
    const onClose = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(QuickSwitcher, {
          entries,
          bots: new Map(),
          activityOf: () => 'idle' as const,
          mac: false,
          t: zhTranslate,
          onOpen: (entry: QuickSwitcherEntry) => opened.push(entry),
          onClose,
        }),
      );
    });
    const input = host.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    const selected = (): string | null | undefined =>
      host.querySelector('[role="option"][aria-selected="true"]')?.getAttribute('data-channel-id');
    const key = async (value: string, init: KeyboardEventInit = {}): Promise<void> => {
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, ...init }));
      });
    };
    const type = async (value: string): Promise<void> => {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };

    expect(host.querySelectorAll('[role="option"]')).toHaveLength(3);
    expect(selected()).toBe('a');
    await key('ArrowDown');
    expect(selected()).toBe('b');
    await key('ArrowUp');
    await key('ArrowUp');
    expect(selected()).toBe('c');

    await type('LAUNCH');
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(selected()).toBe('a');
    await key('ArrowDown');
    await key('Enter');
    expect(opened.map((entry) => entry.channel.id)).toEqual(['b']);

    await type('发布');
    await key('Enter');
    expect(opened.map((entry) => entry.channel.id)).toEqual(['b', 'c']);

    await type('nothing');
    expect(host.textContent).toContain('没有匹配的会话');
    await key('Enter');
    expect(opened).toHaveLength(2);

    await key('k', { ctrlKey: true, code: 'KeyK' });
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});
