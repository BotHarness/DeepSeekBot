// @vitest-environment jsdom
import { createRequire, Module } from 'node:module';
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock(
  '@expo/ui/jetpack-compose/modifiers',
  async () => (await import('./compose-menu-shim')).modifiers,
);
vi.mock('@expo/ui/jetpack-compose', async () => {
  const { components } = await import('./compose-menu-shim');
  const pass = ({ children }: { children?: ReactNode }) => children;
  const slot =
    (name: string) =>
    ({ children }: { children?: ReactNode }) =>
      createElement('span', { 'data-slot': name }, children);
  const Item = Object.assign(
    ({
      children,
      onClick,
      selected,
      modifiers,
    }: {
      children?: ReactNode;
      onClick(): void;
      selected: boolean;
      modifiers: Array<{ description?: string }>;
    }) =>
      createElement(
        'button',
        {
          onClick,
          'aria-pressed': selected,
          'aria-label': modifiers.find((modifier) => modifier.description)?.description,
        },
        children,
      ),
    { Icon: slot('icon'), Label: slot('label') },
  );
  const BadgedBox = Object.assign(pass, { Badge: slot('badge') });
  return {
    ...components,
    NavigationBar: pass,
    NavigationBarItem: Item,
    BadgedBox,
    Badge: ({ children, containerColor }: { children?: ReactNode; containerColor?: string }) =>
      createElement('b', { 'data-container': containerColor ?? 'default' }, children),
    Icon: () => createElement('i', { 'data-icon': true }),
  };
});
import { NavigationDestinations } from '../src/ui/shell/navigation-destinations.android';
import { router } from 'expo-router';
import { t } from '../src/ui/strings';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it('keeps the Activity icon and labels, and shows the pending count as a Material 3 badge', async () => {
  const requireAsset = createRequire(import.meta.url);
  const assets = ['activity', 'chats', 'settings'].map((name) =>
    requireAsset.resolve('../assets/toolbar/' + name + '.xml'),
  );
  for (const path of assets) {
    const asset = new Module(path);
    asset.exports = 1;
    requireAsset.cache[path] = asset;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  const select = vi.fn();
  const render = (count: number, focused: boolean) =>
    act(() =>
      root.render(
        createElement(NavigationDestinations, {
          items: [
            {
              key: 'chats',
              activity: false,
              count: 0,
              focused: !focused,
              onPress: select,
              onLongPress() {},
            },
            {
              key: 'activity',
              activity: true,
              count,
              focused,
              onPress: select,
              onLongPress() {},
            },
            {
              key: 'settings',
              activity: false,
              settings: true,
              count: 0,
              focused: false,
              onPress: () => router.push('/settings'),
              onLongPress() {},
            },
          ],
        }),
      ),
    );
  try {
    for (const focused of [false, true]) {
      for (const [count, expected] of [
        [0, ''],
        [7, '7'],
        [100, '99+'],
        [0, ''],
      ] as const) {
        render(count, focused);
        const button = host.querySelectorAll('button')[1]!;
        expect(button.querySelector('[data-slot="label"]')?.textContent).toBe(t.activity);
        expect(button.querySelector('[data-slot="icon"] i')).not.toBeNull();
        const badge = button.querySelector('[data-slot="badge"] b');
        expect(badge?.textContent ?? '').toBe(expected);
        if (count > 0) expect(badge?.getAttribute('data-container')).toBe('default');
        expect(button.getAttribute('aria-label')).toBe(
          count === 0 ? t.activity : `${t.activity}, ${t.activityPendingLabel(expected)}`,
        );
        expect(button.getAttribute('aria-pressed')).toBe(String(focused));
      }
      const settings = host.querySelectorAll('button')[2]!;
      expect(settings.querySelector('[data-slot="label"]')?.textContent).toBe(t.settings);
      expect(settings.querySelector('[data-slot="icon"] i')).not.toBeNull();
      expect(settings.getAttribute('aria-pressed')).toBe('false');
      vi.mocked(router.push).mockClear();
      await act(async () => settings.click());
      expect(router.push).toHaveBeenCalledExactlyOnceWith('/settings');
      expect(select).not.toHaveBeenCalled();
      expect(host.querySelectorAll('button')[1]!.getAttribute('aria-pressed')).toBe(
        String(focused),
      );
    }
    await act(async () => host.querySelectorAll('button')[1]!.click());
    expect(select).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    for (const path of assets) delete requireAsset.cache[path];
  }
});
