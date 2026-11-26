// @vitest-environment jsdom
import { createRequire, Module } from 'node:module';
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Circle: () => null }));
const avatar = vi.hoisted(() => ({
  icons: {
    default: { uri: 'file:///plain.png', scale: 3 },
    selected: { uri: 'file:///ring.png', scale: 3 },
  } as { default: { uri: string }; selected: { uri: string } } | undefined,
}));
vi.mock('../src/features/pinned-tab/avatar-icon', () => ({
  useAvatarIcons: () => ({ icons: avatar.icons, capture: null }),
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
  const Toolbar = ({
    children,
    modifiers,
    colors,
  }: {
    children?: ReactNode;
    modifiers?: Modifier[];
    colors?: { toolbarContainerColor?: string };
  }) =>
    createElement(
      'nav',
      {
        'data-shadow': modifiers?.find((modifier) => modifier.shadow !== undefined)?.shadow,
        'data-container': colors?.toolbarContainerColor,
      },
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
    Image: ({ source }: { source: { uri: string } }) =>
      createElement('em', { 'data-avatar': source.uri }),
  };
});
vi.mock('../src/ui/primitives/count-badge.android', () => ({
  MaterialCountBadge: ({ count }: { count: number }) => createElement('b', null, String(count)),
}));
import { NavigationDestinations } from '../src/ui/shell/navigation-destinations.android';
import type { NavigationDestination } from '../src/ui/shell/navigation-destination';
import type { TabSlot } from '../src/ui/shell/tab-slots';
import { resolveTheme } from '../src/ui/design/resolve-theme';
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

async function withAssets(run: () => Promise<void> | void) {
  const requireAsset = createRequire(import.meta.url);
  const assets = new Map(
    names.map((name) => [requireAsset.resolve(`../assets/toolbar/${name}.xml`), name]),
  );
  assets.set(requireAsset.resolve('../assets/row-icons/stay.xml'), 'pin');
  for (const [path, name] of assets) {
    const asset = new Module(path);
    asset.exports = name;
    requireAsset.cache[path] = asset;
  }
  try {
    await run();
  } finally {
    for (const path of assets.keys()) delete requireAsset.cache[path];
  }
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

it('floats five icon-only items flat on the page colour with a tonal selected pill and the Pinned avatar', () =>
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
      const nav = host.querySelector('nav')!;
      expect(nav.getAttribute('data-shadow')).toBeNull();
      expect(nav.getAttribute('data-container')).toBe(resolveTheme('light').color.base);
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
      expect(buttons[1]!.querySelector('em')?.getAttribute('data-avatar')).toBe('file:///ring.png');
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

it('shows the Pin until both captures are available, then displays the focused or unfocused avatar', () =>
  withAssets(() => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const render = (focused: boolean) =>
      act(() =>
        root.render(
          createElement(NavigationDestinations, {
            items: [item('chats'), item('pinned', { focused })],
          }),
        ),
      );
    const face = () => host.querySelector('[data-testid="navigation-pinned"]')!.firstElementChild;
    const captured = avatar.icons;
    try {
      avatar.icons = undefined;
      render(false);
      expect(face()?.getAttribute('data-icon')).toBe('pin');
      render(true);
      expect(face()?.getAttribute('data-icon')).toBe('pin');
      avatar.icons = captured;
      render(false);
      expect(face()?.getAttribute('data-avatar')).toBe('file:///plain.png');
      render(true);
      expect(face()?.getAttribute('data-avatar')).toBe('file:///ring.png');
    } finally {
      avatar.icons = captured;
      act(() => root.unmount());
    }
  }));
