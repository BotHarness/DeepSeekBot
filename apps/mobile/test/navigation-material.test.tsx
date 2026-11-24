// @vitest-environment jsdom
import { createRequire, Module } from 'node:module';
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Circle: () => null }));
vi.mock('../src/features/pinned-tab/pinned-avatar', () => ({
  PinnedAvatar: ({ selected }: { selected: boolean }) =>
    createElement('em', { 'data-avatar': selected ? 'ring' : 'plain' }),
}));
vi.mock('@expo/ui/jetpack-compose/modifiers', async () => {
  const { modifiers } = await import('./compose-menu-shim');
  return {
    ...modifiers,
    size: () => ({}),
    dropShadow: (_shape: unknown, config: { alpha: number }) => ({ shadow: config.alpha }),
    combinedClickable: ({ onClick, onLongClick }: { onClick(): void; onLongClick(): void }) => ({
      onClick,
      onLongClick,
    }),
  };
});
vi.mock('@expo/ui/jetpack-compose', async () => {
  const { components } = await import('./compose-menu-shim');
  const pass = ({ children }: { children?: ReactNode }) => children;
  type Modifier = {
    onClick?: () => void;
    onLongClick?: () => void;
    id?: string;
    fill?: string;
    shadow?: number;
  };
  const Box = ({ children, modifiers }: { children?: ReactNode; modifiers?: Modifier[] }) => {
    const click = modifiers?.find((modifier) => modifier.onClick);
    return createElement(
      click ? 'button' : 'div',
      {
        onClick: click?.onClick,
        onContextMenu: click?.onLongClick,
        'data-testid': modifiers?.find((modifier) => modifier.id)?.id,
        'data-fill': modifiers?.find((modifier) => modifier.fill)?.fill,
      },
      children,
    );
  };
  const Toolbar = ({ children, modifiers }: { children?: ReactNode; modifiers?: Modifier[] }) =>
    createElement(
      'nav',
      { 'data-shadow': modifiers?.find((modifier) => modifier.shadow !== undefined)?.shadow },
      children,
    );
  return {
    ...components,
    Box,
    HorizontalFloatingToolbar: Toolbar,
    BadgedBox: Object.assign(pass, {
      Badge: ({ children }: { children?: ReactNode }) =>
        createElement('span', { 'data-slot': 'badge' }, children),
    }),
    Icon: ({ source }: { source: string }) => createElement('i', { 'data-icon': source }),
  };
});
vi.mock('../src/ui/primitives/count-badge.android', () => ({
  MaterialCountBadge: ({ count }: { count: number }) => createElement('b', null, String(count)),
}));
import { NavigationDestinations } from '../src/ui/shell/navigation-destinations.android';
import type { NavigationDestination } from '../src/ui/shell/navigation-destination';
import type { TabSlot } from '../src/ui/shell/tab-slots';
import { t } from '../src/ui/strings';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const names = [
  'activity',
  'activity-filled',
  'chats',
  'chats-filled',
  'code',
  'settings',
  'settings-outline',
];

function withAssets(run: () => Promise<void> | void) {
  const requireAsset = createRequire(import.meta.url);
  const assets = names.map((name) => requireAsset.resolve('../assets/toolbar/' + name + '.xml'));
  for (const [index, path] of assets.entries()) {
    const asset = new Module(path);
    asset.exports = names[index];
    requireAsset.cache[path] = asset;
  }
  return Promise.resolve(run()).finally(() => {
    for (const path of assets) delete requireAsset.cache[path];
  });
}

function item(slot: TabSlot, extra: Partial<NavigationDestination> = {}): NavigationDestination {
  return {
    key: slot,
    slot,
    focused: false,
    count: 0,
    name: slot,
    accessibilityLabel: slot,
    onPress: vi.fn(),
    onLongPress: vi.fn(),
    ...extra,
  };
}

it('floats five icon-only items with a tonal selected pill, an elevation shadow and the Pinned avatar', () =>
  withAssets(() => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const pinned = item('pinned', {
      focused: true,
      count: 3,
      accessibilityLabel: 'Launch, pinned tab, 3 unread',
    });
    try {
      act(() =>
        root.render(
          createElement(NavigationDestinations, {
            items: [
              item('chats'),
              pinned,
              item('activity', { count: 2 }),
              item('sessions'),
              item('settings'),
            ],
          }),
        ),
      );
      expect(host.querySelector('nav')?.getAttribute('data-shadow')).not.toBeNull();
      const buttons = [...host.querySelectorAll('button')];
      expect(buttons.map((button) => button.getAttribute('data-testid'))).toEqual([
        'navigation-chats',
        'navigation-pinned',
        'navigation-activity',
        'sessions-tab',
        'settings-button',
      ]);
      expect(
        buttons.map((button) => button.querySelector('i')?.getAttribute('data-icon') ?? null),
      ).toEqual(['chats', null, 'activity', 'code', 'settings-outline']);
      expect(buttons[1]!.querySelector('em')?.getAttribute('data-avatar')).toBe('ring');
      expect(buttons[1]!.querySelector('[data-slot="badge"]')?.textContent).toBe('3');
      expect(buttons[2]!.querySelector('[data-slot="badge"]')?.textContent).toBe('2');
      expect(
        buttons.filter((button) => button.getAttribute('data-fill') !== 'transparent'),
      ).toEqual([buttons[1]]);
      expect(host.textContent).not.toContain(t.chats);
      expect(
        [...host.querySelectorAll('[role="tab"]')].map((tab) => [
          tab.getAttribute('aria-label'),
          tab.getAttribute('aria-selected'),
        ]),
      ).toEqual([
        ['chats', 'false'],
        ['Launch, pinned tab, 3 unread', 'true'],
        ['activity', 'false'],
        ['sessions', 'false'],
        ['settings', 'false'],
      ]);
    } finally {
      act(() => root.unmount());
    }
  }));

it('routes a tap to onPress and a long press to onLongPress', () =>
  withAssets(async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const chats = item('chats', { focused: true });
    try {
      act(() =>
        root.render(createElement(NavigationDestinations, { items: [chats, item('settings')] })),
      );
      const button = host.querySelector('button')!;
      await act(async () => button.click());
      await act(async () => {
        button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      });
      expect(chats.onPress).toHaveBeenCalledOnce();
      expect(chats.onLongPress).toHaveBeenCalledOnce();
    } finally {
      act(() => root.unmount());
    }
  }));
