// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ scope: 'all', index: 0, enter: vi.fn(), navigate: vi.fn() }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Keyboard: { dismiss: vi.fn() },
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
            { key: 'search', name: '(search)' },
          ],
        },
        emitter: { emit: () => ({ defaultPrevented: false }) },
        navigateToTab: fixture.navigate,
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
vi.mock('../src/host/native-retained-search', () => ({ retainedSearch: { enter: fixture.enter } }));
vi.mock('../src/cloud/native', () => ({ cloudClient: {} }));
vi.mock('../src/cloud/native-conversations', () => ({
  useCloudConversations: () => ({ workspaces: [] }),
}));
import { BottomNavigation } from '../src/ui/shell/bottom-navigation';
import { t } from '../src/ui/strings';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it('does not resurrect an open menu after a source changes away and back', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<BottomNavigation />));
    const plus = [...host.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === t.createHere,
    )!;
    await act(async () => plus.click());
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    fixture.scope = 'another-source';
    await act(async () => root.render(<BottomNavigation />));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    fixture.scope = 'all';
    await act(async () => root.render(<BottomNavigation />));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

it('enters Search with the inherited scope and hides creation without resetting an active search', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  fixture.scope = '["computer","a"]';
  fixture.index = 0;
  fixture.enter.mockClear();
  try {
    await act(async () => root.render(<BottomNavigation />));
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.getAttribute('aria-label') === t.localSearch.title)!
        .click(),
    );
    expect(fixture.enter).toHaveBeenCalledWith(fixture.scope);
    expect(fixture.navigate).toHaveBeenCalledWith('search');
    fixture.index = 2;
    await act(async () => root.render(<BottomNavigation />));
    expect(
      [...host.querySelectorAll('button')].some(
        (b) => b.getAttribute('aria-label') === t.createHere,
      ),
    ).toBe(false);
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.getAttribute('aria-label') === t.localSearch.title)!
        .click(),
    );
    expect(fixture.enter).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    host.remove();
    fixture.index = 0;
    fixture.scope = 'all';
  }
});
