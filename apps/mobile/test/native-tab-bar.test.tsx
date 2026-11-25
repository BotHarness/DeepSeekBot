// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  pinned: undefined as
    | { name: string; count: number; label: string; conversation: undefined }
    | undefined,
  icons: undefined as { default: object; selected: object } | undefined,
  drawerOpen: false,
  menus: {} as Record<string, { key: string; label: string; glyph: string; run(): void }[]>,
  specs: [] as { tab: string; name: string; recent: object[]; actions: object[] }[],
  select: undefined as ((tab: string, id: string) => void) | undefined,
}));

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
vi.mock('expo-router', () => ({ router: { navigate: vi.fn() } }));
vi.mock('expo-router/native-tabs', () => {
  const Trigger = Object.assign(
    ({
      name,
      accessibilityLabel,
      testID,
      children,
    }: {
      name: string;
      accessibilityLabel: string;
      testID: string;
      children?: ReactNode;
    }) =>
      createElement(
        'li',
        { 'data-name': name, 'aria-label': accessibilityLabel, 'data-testid': testID },
        children,
      ),
    {
      Icon: ({
        sf,
        src,
        renderingMode,
      }: {
        sf?: { default: string };
        src?: object;
        renderingMode?: string;
      }) =>
        createElement('i', {
          'data-sf': sf?.default,
          'data-src': src === undefined ? undefined : 'avatar',
          'data-rendering': renderingMode,
        }),
      Label: ({ hidden }: { hidden?: boolean }) =>
        createElement('label', { 'data-hidden': String(hidden === true) }),
      Badge: ({ children }: { children?: ReactNode }) => createElement('b', null, children),
    },
  );
  return {
    NativeTabs: Object.assign(
      ({ hidden, children }: { hidden?: boolean; children?: ReactNode }) =>
        createElement('ul', { 'data-hidden': String(hidden === true) }, children),
      { Trigger },
    ),
  };
});
vi.mock('../src/features/pinned-tab/use-pinned-tab', () => ({
  usePinnedTab: () => fixture.pinned,
}));
vi.mock('../src/features/pinned-tab/avatar-icon', () => ({
  useAvatarIcons: () => ({ icons: fixture.icons, capture: null }),
}));
vi.mock('../src/features/pinned-tab/native-tab-menus', () => ({
  NativeTabMenus: ({
    tabs,
    onSelect,
  }: {
    tabs: typeof fixture.specs;
    onSelect(tab: string, id: string): void;
  }) => {
    fixture.specs = tabs;
    fixture.select = onSelect;
    return null;
  },
}));
vi.mock('../src/ui/shell/use-tab-menus', () => ({
  useTabMenus: () => ({ menus: fixture.menus, load: () => {} }),
}));
vi.mock('../src/features/sessions/session-drawer-state', () => ({
  useSessionDrawer: () => ({ open: fixture.drawerOpen }),
}));
vi.mock('../src/features/sessions/session-drawer-navigation', () => ({
  landInSessionsTab: vi.fn(),
}));
vi.mock('../src/host/native-activity-count', () => ({ useActivityCount: () => ({ count: 4 }) }));
vi.mock('../src/host/profile-setup-prompt', () => ({
  useProfileSetupPrompt: () => ({ load: () => {}, prompt: () => {} }),
}));
vi.mock('../src/ui/shell/quick-action-routing', () => ({ useQuickActionRouting: () => () => {} }));
vi.mock('../src/ui/shell/workspace-pager', () => ({
  WorkspacePager: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/ui/shell/chats-sheet-root', () => ({
  ChatsSheetRoot: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/ui/shell/activity-sheet-root', () => ({
  ActivitySheetRoot: ({ children }: { children: ReactNode }) => children,
}));
import { BottomNavigation } from '../src/ui/shell/bottom-navigation.ios';
import { t } from '../src/ui/strings';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  fixture.pinned = undefined;
  fixture.icons = undefined;
  fixture.drawerOpen = false;
  fixture.menus = {};
});

it('renders five icon-only native tabs with the Pinned avatar right of Chats and </> for Sessions', async () => {
  fixture.pinned = {
    name: 'Launch',
    count: 3,
    label: t.pinnedTab.tabLabel('Launch'),
    conversation: undefined,
  };
  fixture.icons = { default: {}, selected: {} };
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<BottomNavigation />));
    const tabs = [...host.querySelectorAll('li')];
    expect(tabs.map((tab) => tab.getAttribute('data-name'))).toEqual([
      '(home)',
      '(pinned)',
      '(activity)',
      '(sessions)',
      '(settings)',
    ]);
    expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual([
      t.chats,
      t.pinnedTab.tabLabel('Launch'),
      t.activity,
      t.hostSessions.title,
      t.settings,
    ]);
    expect(
      [...host.querySelectorAll('label')].every((label) => label.dataset['hidden'] === 'true'),
    ).toBe(true);
    expect(tabs[1]!.querySelector('i')?.getAttribute('data-src')).toBe('avatar');
    expect(tabs[1]!.querySelector('i')?.getAttribute('data-rendering')).toBe('original');
    expect(tabs[1]!.querySelector('b')?.textContent).toBe('3');
    expect(tabs[2]!.querySelector('b')?.textContent).toBe('4');
    expect(tabs[3]!.querySelector('i')?.getAttribute('data-sf')).toBe(
      'chevron.left.forwardslash.chevron.right',
    );
  } finally {
    act(() => root.unmount());
  }
});

it('shows a pin glyph until the avatar is captured and hides the bar under the Session drawer', async () => {
  fixture.drawerOpen = true;
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<BottomNavigation />));
    expect(host.querySelector('li[data-name="(pinned)"] i')?.getAttribute('data-sf')).toBe('pin');
    expect(host.querySelector('ul')?.getAttribute('data-hidden')).toBe('true');
  } finally {
    act(() => root.unmount());
  }
});

it('passes each tab menu to the native long-press module and runs the chosen row', async () => {
  const run = vi.fn();
  fixture.menus = {
    '(home)': [
      { key: 'h:channel:launch', label: 'Launch', glyph: 'channel', run },
      { key: 'new-group', label: t.chatsCreate.group, glyph: 'new', run: vi.fn() },
    ],
  };
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<BottomNavigation />));
    expect(fixture.specs.map((spec) => spec.tab)).toEqual([
      '(home)',
      '(pinned)',
      '(activity)',
      '(sessions)',
      '(settings)',
    ]);
    expect(fixture.specs[0]).toMatchObject({
      name: t.chats,
      recent: [{ id: 'h:channel:launch', label: 'Launch', symbol: 'bubble.left.and.bubble.right' }],
      actions: [{ id: 'new-group', symbol: 'plus' }],
    });
    expect(fixture.specs[1]).toMatchObject({ name: t.pinnedTab.title, recent: [], actions: [] });
    fixture.select?.('(home)', 'h:channel:launch');
    expect(run).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
  }
});
