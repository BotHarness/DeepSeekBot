// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHostClient } from '@botharness/host-client/client';
import type { SavedHost } from '@botharness/host-client/hosts';
import { afterEach, expect, it, vi } from 'vitest';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';
import type { HostSessionState } from '../src/host/host-session';
import { emptyHostSession } from './support/host-session';

const fakeHost = new FakeHost('host');
const client = createHostClient({
  routes: ['https://studio.tailnet-example.ts.net'],
  credential: fakeHost.credential,
  carrier: fakeHost.carrier,
});

const fixture = vi.hoisted(() => ({
  scope: 'all',
  platform: 'ios',
  index: 0,
  saved: undefined as SavedHost | undefined,
  pinned: undefined as
    | { name: string; count: number; label: string; countedLabel: string; conversation: undefined }
    | undefined,
  navigateToTab: vi.fn(),
}));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('../src/ui/shell/quick-action-routing', () => ({ useQuickActionRouting: () => () => {} }));
vi.mock('../src/host/native-bot-creation', () => ({
  botCreation: {
    ready: Promise.resolve(),
    getSnapshot: () => ({ record: { kind: 'draft' } }),
    another: vi.fn(),
  },
}));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Keyboard: { dismiss: vi.fn() },
  Platform: {
    get OS() {
      return fixture.platform;
    },
  },
}));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Rect: () => null }));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('../src/ui/shell/use-tab-menus', () => ({
  useTabMenus: () => ({ menus: {}, load: () => {} }),
}));
vi.mock('../src/features/sessions/last-session', () => ({ lastSession: () => undefined }));
vi.mock('expo-router', () => ({
  router: { push: vi.fn() },
  useIsFocused: () => true,
  useFocusEffect: vi.fn(),
}));
vi.mock('expo-router/js-tabs', async () => {
  const { Children } = await import('react');
  return {
    Tabs: Object.assign(
      ({ tabBar, children }: { tabBar: (props: object) => ReactNode; children?: ReactNode }) => {
        const routes = Children.toArray(children).map((child) => {
          const name = (child as { props: { name: string } }).props.name;
          return { key: name.slice(1, -1), name };
        });
        return tabBar({
          state: { index: fixture.index, routes },
          emitter: { emit: () => ({ defaultPrevented: false }) },
          navigateToTab: fixture.navigateToTab,
        });
      },
      { Screen: () => null },
    ),
  };
});
vi.mock('../src/features/pinned-tab/pinned-avatar', () => ({ PinnedAvatar: () => null }));
vi.mock('../src/features/pinned-tab/use-pinned-tab', () => ({
  usePinnedTab: () => fixture.pinned,
}));
vi.mock('../src/ui/primitives/drawer-material', () => ({ DrawerMaterial: () => null }));
vi.mock('../src/host/host-session', () => ({
  useHostSession: (): HostSessionState => {
    const saved = fixture.saved;
    return saved ? { ...emptyHostSession, saved, hosts: [saved], client } : emptyHostSession;
  },
  hostSession: { getState: () => emptyHostSession },
}));
vi.mock('../src/host/native-host-look', () => ({ useHostLook: () => ({}) }));
vi.mock('../src/host/native-conversation-filter', () => ({
  useConversationFilter: () => [fixture.scope],
}));
vi.mock('../src/host/native-activity-count', () => ({ useActivityCount: () => ({ count: 0 }) }));
vi.mock('../src/cloud/native', () => ({ cloudClient: {} }));
vi.mock('../src/cloud/native-conversations', () => ({
  useCloudConversations: () => ({ workspaces: [] }),
}));
import { router } from 'expo-router';
import { BottomNavigation } from '../src/ui/shell/bottom-navigation';
import { interfacePreferences } from '../src/ui/interface-preferences';
import { defaultTabOrder } from '../src/ui/shell/tab-slots';
import { t } from '../src/ui/strings';
import { setHapticsEnabled } from '../src/ui/haptics';
import { played } from './expo-haptics-shim';
afterEach(() => {
  setHapticsEnabled(true);
  played.length = 0;
  fixture.saved = undefined;
  fixture.index = 0;
  fixture.pinned = undefined;
  interfacePreferences.setTabOrder(defaultTabOrder);
  interfacePreferences.setSessionsTab(false);
  vi.mocked(router.push).mockClear();
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const owner: SavedHost = {
  hostId: 'host',
  hostName: 'Computer',
  routes: [],
  deviceId: 'device',
  credential: 'test-fixture',
};

it.each(['ios', 'android'])(
  'keeps creation out of the tab island on every tab on %s',
  async (platform) => {
    fixture.platform = platform;
    fixture.saved = owner;
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      for (const index of [0, 1, 2, 3, 4]) {
        fixture.index = index;
        await act(async () => root.render(<BottomNavigation />));
        expect(host.querySelector(`button[aria-label="${t.createHere}"]`)).toBeNull();
        expect(host.querySelector(`button[aria-label="${t.hostSessions.create}"]`)).toBeNull();
      }
    } finally {
      act(() => root.unmount());
    }
  },
);

it.each([
  ['ios', 0],
  ['ios', 1],
  ['android', 0],
  ['android', 1],
] as const)('selects the Settings tab from %s tab %s', async (platform, index) => {
  fixture.platform = platform;
  fixture.index = index;
  fixture.navigateToTab.mockClear();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<BottomNavigation />));
    const settings = () => host.querySelector('[data-testid="settings-button"]')!;
    expect(settings().getAttribute('aria-label')).toBe(t.settings);
    expect(settings().getAttribute('aria-selected')).toBe('false');
    await act(async () => (settings() as HTMLButtonElement).click());
    expect(fixture.navigateToTab).toHaveBeenCalledExactlyOnceWith('settings');
    expect(router.push).not.toHaveBeenCalled();
    fixture.index = 4;
    await act(async () => root.render(<BottomNavigation />));
    expect(settings().getAttribute('aria-selected')).toBe('true');
  } finally {
    act(() => root.unmount());
    host.remove();
    fixture.index = 0;
  }
});

it.each(['ios', 'android'])(
  'shows five icon-only tabs with the Pinned tab right of Chats by default on %s',
  async (platform) => {
    fixture.platform = platform;
    interfacePreferences.setSessionsTab(true);
    fixture.navigateToTab.mockClear();
    fixture.pinned = {
      name: 'Launch',
      count: 3,
      label: t.pinnedTab.tabLabel('Launch'),
      countedLabel: t.pinnedTab.tabLabel('Launch', '3'),
      conversation: undefined,
    };
    const host = document.createElement('div');
    const root = createRoot(host);
    const labels = () =>
      [...host.querySelectorAll('[role="tab"]')].map((tab) => tab.getAttribute('aria-label'));
    try {
      await act(async () => root.render(<BottomNavigation />));
      expect(labels()).toEqual([
        t.chats,
        t.pinnedTab.tabLabel('Launch', '3'),
        t.activity,
        t.hostSessions.title,
        t.settings,
      ]);
      expect(host.textContent).toBe('3');
      const pinned = host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]!;
      await act(async () => pinned.click());
      expect(fixture.navigateToTab).toHaveBeenCalledExactlyOnceWith('pinned');
      expect(host.textContent).toContain('Launch');
      await act(async () =>
        interfacePreferences.setTabOrder(['chats', 'activity', 'sessions', 'settings', 'pinned']),
      );
      expect(labels()).toEqual([
        t.chats,
        t.activity,
        t.hostSessions.title,
        t.settings,
        t.pinnedTab.tabLabel('Launch', '3'),
      ]);
    } finally {
      act(() => root.unmount());
    }
  },
);

it.each(['ios', 'android'])(
  'shows four tabs in the stored order while the Sessions tab is off on %s',
  async (platform) => {
    fixture.platform = platform;
    interfacePreferences.setTabOrder(['settings', 'sessions', 'chats', 'pinned', 'activity']);
    const host = document.createElement('div');
    const root = createRoot(host);
    const labels = () =>
      [...host.querySelectorAll('[role="tab"]')].map((tab) => tab.getAttribute('aria-label'));
    try {
      await act(async () => root.render(<BottomNavigation />));
      expect(labels()).toEqual([t.settings, t.chats, t.pinnedTab.title, t.activity]);
      await act(async () => interfacePreferences.setSessionsTab(true));
      expect(labels()).toEqual([
        t.settings,
        t.hostSessions.title,
        t.chats,
        t.pinnedTab.title,
        t.activity,
      ]);
    } finally {
      act(() => root.unmount());
    }
  },
);
