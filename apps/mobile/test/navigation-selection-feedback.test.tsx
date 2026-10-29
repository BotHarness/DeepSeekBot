// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NavigationDestination } from '../src/ui/shell/navigation-destination';

const navigation = vi.hoisted(() => ({
  platform: 'android',
  index: 0,
  prevented: false,
  navigate: vi.fn(),
  emit: vi.fn(),
}));
vi.mock('../src/host/native-retained-search', () => ({ retainedSearch: { enter() {} } }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: {
    get OS() {
      return navigation.platform;
    },
  },
  Keyboard: { dismiss: vi.fn() },
}));
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('../src/host/native-bot-creation', () => ({
  botCreation: {
    ready: Promise.resolve(),
    getSnapshot: () => ({ record: { kind: 'draft' } }),
    another: vi.fn(),
  },
}));
vi.mock('expo-router/js-tabs', () => {
  const Tabs = ({ tabBar }: { tabBar(props: unknown): ReactNode }) =>
    tabBar({
      state: {
        index: navigation.index,
        routes: [
          { key: 'home', name: '(home)' },
          { key: 'activity', name: '(activity)' },
        ],
      },
      emitter: { emit: navigation.emit },
      navigateToTab: navigation.navigate,
    });
  Tabs.Screen = () => null;
  return { Tabs };
});
vi.mock('react-native-reanimated', async () => ({
  default: { View: (await import('./react-native-shim')).View },
  useAnimatedStyle: (style: () => object) => style(),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ left: 0, right: 0, bottom: 0 }),
}));
vi.mock('../src/host/host-session', () => ({ useHostSession: () => ({}) }));
vi.mock('../src/host/native-conversation-filter', () => ({ useConversationFilter: () => ['all'] }));
vi.mock('../src/host/native-host-look', () => ({ useHostLook: () => undefined }));
vi.mock('../src/host/native-activity-count', () => ({ useActivityCount: () => ({ count: 0 }) }));
vi.mock('../src/cloud/native-conversations', () => ({
  useCloudConversations: () => ({ workspaces: [] }),
}));
vi.mock('../src/cloud/native', () => ({ cloudClient: {} }));
vi.mock('../src/cloud/prepare-creation', () => ({ prepareCloudCreation: vi.fn() }));
vi.mock('../src/ui/shell/quick-action-routing', () => ({ useQuickActionRouting: () => undefined }));
vi.mock('../src/ui/mounted', () => ({ useMounted: () => undefined }));
vi.mock('../src/ui/shell/scroll-chrome', () => ({
  ScrollChromeProvider: ({ children }: { children: ReactNode }) => children,
  useChromeHidden: () => false,
  useChromeProgress: () => ({ value: 0 }),
}));
vi.mock('../src/ui/shell/navigation-destinations', () => ({
  NavigationDestinations: ({ items }: { items: NavigationDestination[] }) =>
    items.map((item) =>
      createElement(
        'button',
        {
          key: item.key,
          'aria-label': item.key,
          'aria-selected': item.focused,
          onClick: item.onPress,
        },
        item.key,
      ),
    ),
}));
vi.mock('../src/ui/shell/navigation-action', () => ({ NavigationAction: () => null }));
vi.mock('../src/ui/shell/navigation-material', () => ({ NavigationMaterial: () => null }));
vi.mock('../src/ui/shell/creation-panel', () => ({ CreationPanel: () => null }));
vi.mock('../src/ui/shell/icons', async () => ({
  ...(await import('./shell-icons-shim')),
  PlusIcon: () => null,
}));
vi.mock('../src/ui/haptics', () => ({ haptic: vi.fn() }));

import { BottomNavigation } from '../src/ui/shell/bottom-navigation';
import { haptic } from '../src/ui/haptics';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLElement;
beforeEach(() => {
  vi.clearAllMocks();
  navigation.platform = 'android';
  navigation.index = 0;
  navigation.prevented = false;
  navigation.emit.mockImplementation(() => ({ defaultPrevented: navigation.prevented }));
  navigation.navigate.mockImplementation(() => new Promise<void>(() => {}));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<BottomNavigation />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const button = (key: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${key}"]`)!;

it('acknowledges a controlled route commit after the dispatch callback has returned', async () => {
  navigation.navigate.mockImplementation(() => undefined);
  await act(async () => button('activity').click());
  expect(haptic).not.toHaveBeenCalled();
  navigation.index = 1;
  act(() => root.render(<BottomNavigation />));
  expect(haptic).toHaveBeenCalledExactlyOnceWith('selection');
});

it('acknowledges the real synchronous router-dispatch seam on iOS and Android', async () => {
  for (const platform of ['android', 'ios']) {
    navigation.platform = platform;
    navigation.index = 0;
    act(() => root.render(<BottomNavigation />));
    vi.clearAllMocks();
    navigation.navigate.mockImplementation(() => {
      navigation.index = 1;
      root.render(<BottomNavigation />);
    });
    await act(async () => button('activity').click());
    expect(button('activity').getAttribute('aria-selected')).toBe('true');
    expect(haptic).toHaveBeenCalledExactlyOnceWith('selection');
  }
});

it('acknowledges committed navigation before deferred work and deduplicates pending taps', () => {
  act(() => {
    button('activity').click();
    button('activity').click();
  });
  expect(navigation.navigate).toHaveBeenCalledExactlyOnceWith('activity');
  expect(haptic).not.toHaveBeenCalled();
  expect(button('home').getAttribute('aria-selected')).toBe('true');
  navigation.index = 1;
  act(() => root.render(<BottomNavigation />));
  expect(haptic).toHaveBeenCalledExactlyOnceWith('selection');
  expect(button('activity').getAttribute('aria-selected')).toBe('true');
  act(() => button('home').click());
  expect(navigation.navigate).toHaveBeenCalledTimes(2);
  navigation.index = 0;
  act(() => root.render(<BottomNavigation />));
  expect(button('home').getAttribute('aria-selected')).toBe('true');
  expect(haptic).toHaveBeenCalledTimes(2);
});

it('does not acknowledge current or prevented destinations', () => {
  act(() => button('home').click());
  navigation.prevented = true;
  act(() => button('activity').click());
  expect(navigation.navigate).not.toHaveBeenCalled();
  expect(haptic).not.toHaveBeenCalled();
  expect(button('home').getAttribute('aria-selected')).toBe('true');
});

it('resynchronizes after router state changes outside the tab bar', () => {
  navigation.index = 1;
  act(() => root.render(<BottomNavigation />));
  expect(button('activity').getAttribute('aria-selected')).toBe('true');
  act(() => button('activity').click());
  expect(navigation.navigate).not.toHaveBeenCalled();
  expect(haptic).not.toHaveBeenCalled();
});

it('acknowledges a committed iOS tab switch because native buttons have no sensory feedback modifier', () => {
  navigation.platform = 'ios';
  act(() => root.render(<BottomNavigation />));
  act(() => button('activity').click());
  expect(navigation.navigate).toHaveBeenCalledExactlyOnceWith('activity');
  navigation.index = 1;
  act(() => root.render(<BottomNavigation />));
  expect(haptic).toHaveBeenCalledExactlyOnceWith('selection');
});

it('permits retries after uncommitted navigation without manufacturing a selected destination', async () => {
  navigation.navigate.mockImplementation(() => undefined);
  await act(async () => button('activity').click());
  await act(async () => button('activity').click());
  expect(navigation.navigate).toHaveBeenCalledTimes(2);
  expect(haptic).not.toHaveBeenCalled();
  expect(button('home').getAttribute('aria-selected')).toBe('true');
});

it('releases a failed deferred navigation request for retry without feedback', async () => {
  let refuse!: (error: Error) => void;
  navigation.navigate.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        refuse = reject;
      }),
  );
  act(() => button('activity').click());
  await act(async () => refuse(new Error('refused')));
  act(() => button('activity').click());
  expect(navigation.navigate).toHaveBeenCalledTimes(2);
  expect(haptic).not.toHaveBeenCalled();
});
