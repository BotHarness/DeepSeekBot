// @vitest-environment jsdom
import { createElement, type CSSProperties, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const device = vi.hoisted(() => ({ fontScale: 1, scheme: 'light' }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'android' },
  useColorScheme: () => device.scheme,
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: device.fontScale }),
  Dimensions: {
    get: () => ({ width: 390, height: 844, scale: 3, fontScale: device.fontScale }),
    addEventListener: (_event: string, _changed: () => void) => ({ remove() {} }),
  },
  View: ({
    children,
    style,
    testID,
  }: {
    children?: ReactNode;
    style?: CSSProperties;
    testID?: string;
  }) => createElement('div', { style, 'data-testid': testID }, children),
}));
vi.mock('expo-router', () => ({ useIsFocused: () => true, Stack: { Screen: () => null } }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('../src/ui/shell/host-drawer', () => ({
  useHostDrawerOpen: () => false,
  hostDrawer: { setReturnFocus: () => {} },
  openHostDrawer: () => {},
  focusOn: () => {},
}));
vi.mock('../src/ui/primitives/text', () => ({
  Text: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/ui/shell/icons', async () => ({
  ...(await import('./shell-icons-shim')),
  ChatsIcon: () => null,
  CloudIcon: () => null,
  ChevronDownIcon: () => null,
  ActivityFilterIcon: () => null,
  ActivitySearchIcon: () => null,
  SettingsIcon: () => null,
}));
vi.mock('../src/ui/shell/host-tile', () => ({ HostGlyph: () => null }));
vi.mock('../src/ui/primitives/system-symbol', () => ({
  SystemSymbol: ({
    name,
    size,
    color,
  }: {
    name: { android: string };
    size: number;
    color: string;
  }) =>
    createElement('i', {
      'data-symbol': name.android,
      style: { width: size, height: size, color },
    }),
}));
vi.mock('expo', () => ({
  requireNativeView:
    () =>
    ({ style, testID }: { style: CSSProperties; testID: string }) =>
      createElement('input', { style, 'data-testid': testID }),
}));
vi.mock(
  '../src/ui/primitives/search-field',
  () => import('../src/ui/primitives/search-field.android'),
);

import { HomeHeader } from '../src/ui/shell/home-header';
import { HeaderGlyph } from '../src/ui/shell/header-glyph.android';
import { HeaderSearch } from '../src/ui/shell/header-search.android';
import { ActivityToolbar } from '../src/ui/shell/activity-toolbar-base';
import { ChatsSearchBar } from '../src/ui/shell/chats-search-bar.android';

function header(searching: boolean) {
  const view = document.createElement('div');
  view.innerHTML = renderToStaticMarkup(
    <HomeHeader
      environment={{ kind: 'all', key: 'all', title: 'All environments' }}
      actions={
        <>
          <HeaderGlyph icon="search" active={false} />
          <HeaderGlyph icon="settings" active={false} />
        </>
      }
      search={
        searching ? (
          <HeaderSearch
            value=""
            placeholder="Search"
            onChangeText={() => {}}
            onFocusChange={() => {}}
            onClose={() => {}}
          />
        ) : undefined
      }
    >
      <div>Conversations</div>
    </HomeHeader>,
  );
  return view;
}

describe('Android Chats header', () => {
  it.each([1, 2])('hosts the native search app bar at its own height at font scale %s', (scale) => {
    device.fontScale = scale;
    const view = document.createElement('div');
    view.innerHTML = renderToStaticMarkup(
      <HomeHeader
        environment={{ kind: 'all', key: 'all', title: 'All environments' }}
        actions={<HeaderGlyph icon="search" active={false} />}
        bar={
          <ChatsSearchBar
            placeholder="Search All environments"
            busy={false}
            results={[]}
            onQuery={() => {}}
            onExpanded={() => {}}
            onPick={() => {}}
            onNavigation={() => {}}
          />
        }
      >
        <div>Conversations</div>
      </HomeHeader>,
    );
    const resting = view.querySelector<HTMLElement>('[data-testid="home-header"]')!;
    const bar = resting.querySelector<HTMLElement>('[data-testid="chats-search-bar"]')!;
    expect(resting.querySelector('[data-symbol]')).toBeNull();
    expect(Number.parseFloat(resting.style.minHeight)).toBe(
      24 + Number.parseFloat(bar.style.height),
    );
    expect(Number.parseFloat(bar.style.height)).toBe(56 + 24 * (scale - 1) + 8);
  });

  it.each([1, 1.5, 2])(
    'reserves the native search height before opening at font scale %s',
    (fontScale) => {
      device.fontScale = fontScale;
      const resting = header(false).querySelector<HTMLElement>('[data-testid="home-header"]')!;
      const searching = header(true).querySelector<HTMLElement>('[data-testid="home-header"]')!;
      const input = searching.querySelector<HTMLElement>('[data-testid="search-input"]')!;
      expect(resting.style.minHeight).toBe(searching.style.minHeight);
      expect(Number.parseFloat(resting.style.minHeight)).toBe(
        Number.parseFloat(input.style.height) +
          Number.parseFloat(resting.style.paddingTop) +
          Number.parseFloat(resting.style.paddingBottom),
      );
      expect(header(false).querySelector('[data-testid="search-input"]')).toBeNull();
      const activity = document.createElement('div');
      activity.innerHTML = renderToStaticMarkup(
        <ActivityToolbar
          search=""
          filtered={false}
          options={{
            bots: [],
            channels: [],
            filter: { section: 'all', bot: undefined },
            sort: 'default',
            onFilter: () => {},
            onSort: () => {},
          }}
          onSearch={() => {}}
          onSearchFocus={() => {}}
          onFilter={() => {}}
          onHeight={() => {}}
        />,
      );
      expect(
        activity.querySelector<HTMLElement>('[data-testid="activity-header"]')!.style.minHeight,
      ).toBe(input.style.height);
    },
  );

  it.each(['light', 'dark'])(
    'uses matching Material glyph size and colour in %s mode',
    (scheme) => {
      device.scheme = scheme;
      const icons = [...header(false).querySelectorAll<HTMLElement>('[data-symbol]')];
      expect(icons.map((icon) => icon.dataset.symbol)).toEqual(['search', 'settings']);
      expect(icons.map((icon) => icon.style.width)).toEqual(['24px', '24px']);
      expect(icons.map((icon) => icon.style.height)).toEqual(['24px', '24px']);
      expect(icons[0]!.style.color).toBe(icons[1]!.style.color);
    },
  );
});
