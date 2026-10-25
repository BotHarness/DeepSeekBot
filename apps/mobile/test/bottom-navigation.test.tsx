// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ scope: 'all', platform: 'ios', index: 0 }));
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
vi.mock('react-native-reanimated', async () => ({
  default: { View: (await import('./react-native-shim')).View },
  useAnimatedStyle: () => ({}),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('expo-router/js-tabs', () => ({
  Tabs: Object.assign(
    ({ tabBar }: { tabBar: (props: object) => ReactNode }) =>
      tabBar({
        state: {
          index: fixture.index,
          routes: [
            { key: 'home', name: '(home)' },
            { key: 'activity', name: '(activity)' },
          ],
        },
        emitter: { emit: vi.fn() },
        navigateToTab: vi.fn(),
      }),
    { Screen: () => null },
  ),
}));
vi.mock('../src/ui/primitives/drawer-material', () => ({ DrawerMaterial: () => null }));
vi.mock('../src/ui/shell/scroll-chrome', () => ({
  ScrollChromeProvider: ({ children }: { children: ReactNode }) =>
    createElement('div', null, children),
  useChromeHidden: () => false,
  useChromeProgress: () => ({ value: 0 }),
}));
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({ saved: undefined }),
  hostSession: { getState: () => ({ saved: undefined }) },
}));
vi.mock('../src/host/native-host-look', () => ({ useHostLook: () => undefined }));
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
import { t } from '../src/ui/strings';
import { setHapticsEnabled } from '../src/ui/haptics';
import { played } from './expo-haptics-shim';
afterEach(() => {
  setHapticsEnabled(true);
  played.length = 0;
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it.each(['ios', 'android'])(
  'acknowledges creation once and respects scope and preference on %s',
  async (platform) => {
    fixture.platform = platform;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<BottomNavigation />));
      const plus = [...host.querySelectorAll('button')].find(
        (b) => b.getAttribute('aria-label') === t.createHere,
      )!;
      await act(async () => {
        plus.click();
        plus.click();
      });
      expect(host.querySelector('[role="dialog"]')).not.toBeNull();
      expect(played).toEqual(['impact:light']);
      await act(async () => plus.click());
      expect(played).toEqual(['impact:light']);
      fixture.scope = 'another-source';
      await act(async () => root.render(<BottomNavigation />));
      expect(host.querySelector('[role="dialog"]')).toBeNull();
      fixture.scope = 'all';
      await act(async () => root.render(<BottomNavigation />));
      expect(host.querySelector('[role="dialog"]')).toBeNull();
      setHapticsEnabled(false);
      const reopened = host.querySelector<HTMLButtonElement>(
        `button[aria-label="${t.createHere}"]`,
      )!;
      await act(async () => reopened.click());
      expect(host.querySelector('[role="dialog"]')).not.toBeNull();
      expect(played).toEqual(['impact:light']);
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  },
);

it.each([
  ['ios', 0],
  ['ios', 1],
  ['android', 0],
  ['android', 1],
] as const)(
  'opens the existing Settings sheet over %s tab %s without changing selection',
  async (platform, index) => {
    fixture.platform = platform;
    fixture.index = index;
    vi.mocked(router.push).mockClear();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<BottomNavigation />));
      const selected = host.querySelector('[aria-selected="true"]');
      const settings = host.querySelector<HTMLButtonElement>('[data-testid="settings-button"]')!;
      expect(settings.getAttribute('aria-label')).toBe(t.settings);
      await act(async () => settings.click());
      expect(router.push).toHaveBeenCalledExactlyOnceWith('/settings');
      expect(host.querySelector('[aria-selected="true"]')).toBe(selected);
      expect(settings.getAttribute('aria-selected')).toBe('false');
    } finally {
      act(() => root.unmount());
      host.remove();
      fixture.index = 0;
    }
  },
);
