// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconSearchOutlineRegular: () => null,
  IconSettingsOutlineRegular: () => null,
  IconCloseOutlineRegular: () => null,
  relativeTime: () => ({ unit: 'days', n: 1 }),
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
import { ShortcutBindings } from '../src/client/shortcut-bindings.js';
import {
  quickSwitcherEntries,
  type QuickSwitcherEntry,
} from '../src/client/quick-switcher-rank.js';
import { zhTranslate } from '../src/client/locale.js';
import { searchSettings, type SettingsSearchResult } from '../src/client/settings-search.js';
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
          shortcutBindings: new ShortcutBindings(undefined, () => false),
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

    await type('chanpin');
    await key('Enter');
    expect(opened.map((entry) => entry.channel.id)).toEqual(['b', 'c', 'c']);

    await type('nothing');
    expect(host.textContent).toContain('没有匹配的结果');
    await key('Enter');
    expect(opened).toHaveLength(3);

    await key('k', { ctrlKey: true, code: 'KeyK' });
    expect(onClose).toHaveBeenCalledTimes(1);
    await key('k', { altKey: true, code: 'KeyK' });
    expect(onClose).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });

  it('lists matching settings after conversations and opens the chosen one', async () => {
    const entries = quickSwitcherEntries(
      [group('a', '外观讨论', '2026-10-03T00:00:00.000Z')],
      [],
      [],
    );
    const openedSettings: SettingsSearchResult[] = [];
    const rows = [
      { id: 'appearance', order: 5, label: '界面设置' },
      { id: 'shortcuts', order: 22, label: '键盘快捷键' },
    ];
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(QuickSwitcher, {
          entries,
          settings: {
            search: (query: string) => searchSettings(rows, query, zhTranslate),
            open: (result: SettingsSearchResult) => openedSettings.push(result),
          },
          bots: new Map(),
          activityOf: () => 'idle' as const,
          shortcutBindings: new ShortcutBindings(undefined, () => false),
          t: zhTranslate,
          onOpen: () => {},
          onClose: () => {},
        }),
      );
    });
    const input = host.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    const type = async (value: string): Promise<void> => {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    const key = async (value: string): Promise<void> => {
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
      });
    };

    expect(host.querySelector('[data-settings-section]')).toBeNull();

    await type('theme');
    expect(host.querySelector('[data-channel-id]')).toBeNull();
    expect(host.textContent).toContain('设置');
    const themeRow = [...host.querySelectorAll('[data-settings-section]')].find((node) =>
      node.textContent?.startsWith('主题'),
    );
    expect(themeRow).toBeDefined();
    await act(async () => (themeRow as HTMLElement).click());
    expect(openedSettings[0]).toMatchObject({ section: 'appearance', target: '主题' });
    await key('Enter');
    expect(openedSettings[1]).toMatchObject({ section: 'appearance', title: '主题' });

    await type('kuaijiejian');
    expect(
      host
        .querySelector('[role="option"][aria-selected="true"]')
        ?.getAttribute('data-settings-section'),
    ).toBe('shortcuts');

    await type('waiguan');
    const options = [...host.querySelectorAll('[role="option"]')];
    expect(options[0]?.getAttribute('data-channel-id')).toBe('a');
    expect(options.slice(1).every((node) => node.hasAttribute('data-settings-section'))).toBe(true);
    await act(async () => root.unmount());
  });

  it('searches messages after a pause, lists them after conversations and opens one', async () => {
    vi.useFakeTimers();
    try {
      const entries = quickSwitcherEntries(
        [group('a', '发布讨论', '2026-10-03T00:00:00.000Z')],
        [],
        [],
      );
      const message = (id: string, body: string) => ({
        id,
        at: '2026-10-02T00:00:00.000Z',
        author: { kind: 'human' as const },
        body,
      });
      const search = vi.fn(async (text: string, cursor?: string) =>
        cursor === undefined
          ? {
              hits: [{ channelId: 'a', message: message('m1', '发布清单'), snippet: '发布清单' }],
              nextCursor: 'next',
            }
          : { hits: [{ channelId: 'a', message: message('m2', '明天发布'), snippet: '明天发布' }] },
      );
      const openedHits: string[] = [];
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      await act(async () => {
        root.render(
          createElement(QuickSwitcher, {
            entries,
            messages: {
              search,
              open: (hit: { message: { id: string } }) => openedHits.push(hit.message.id),
            },
            bots: new Map(),
            activityOf: () => 'idle' as const,
            shortcutBindings: new ShortcutBindings(undefined, () => false),
            t: zhTranslate,
            onOpen: () => {},
            onClose: () => {},
          }),
        );
      });
      const input = host.querySelector<HTMLInputElement>('input[role="combobox"]')!;
      const key = async (value: string): Promise<void> => {
        await act(async () => {
          input.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
        });
      };
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(input, '发布');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(search).not.toHaveBeenCalled();
      expect(host.querySelector('[role="status"][aria-label="正在搜索消息…"]')).not.toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });
      expect(search).toHaveBeenCalledWith('发布', undefined);
      const options = [...host.querySelectorAll('[role="option"]')];
      expect(options[0]?.hasAttribute('data-message-id')).toBe(false);
      expect(options[1]?.getAttribute('data-message-id')).toBe('m1');
      expect(options[1]?.querySelector('mark')?.textContent).toBe('发布');
      expect(host.textContent).toContain('消息');

      await key('ArrowDown');
      await key('ArrowDown');
      await key('Enter');
      expect(search).toHaveBeenLastCalledWith('发布', 'next');
      expect(host.querySelector('[data-message-id="m2"]')).not.toBeNull();
      expect(host.querySelector('[data-message-search-more]')).toBeNull();

      await act(async () => (host.querySelector('[data-message-id="m2"]') as HTMLElement).click());
      expect(openedHits).toEqual(['m2']);
      await act(async () => root.unmount());
    } finally {
      vi.useRealTimers();
    }
  });
});
