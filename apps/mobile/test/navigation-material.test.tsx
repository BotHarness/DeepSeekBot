// @vitest-environment jsdom
import { createRequire, Module } from 'node:module';
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-reanimated', () => ({ useReducedMotion: () => motion.reduced }));
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
    }: {
      children?: ReactNode;
      onClick(): void;
      selected: boolean;
    }) => createElement('button', { onClick, 'aria-pressed': selected }, children),
    { Icon: slot('icon'), Label: slot('label') },
  );
  return {
    ...components,
    NavigationBar: pass,
    NavigationBarItem: Item,
    Box: pass,
    Icon: () => createElement('i', { 'data-icon': true }),
    AnimatedVisibility: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? children : null,
    EnterTransition: { fadeIn: () => ({}) },
    ExitTransition: { fadeOut: () => ({}) },
  };
});
import { NavigationDestinations } from '../src/ui/shell/navigation-destinations.android';
import { router } from 'expo-router';
import { t } from '../src/ui/strings';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it.each([false, true])(
  'keeps labels and selection while Activity moves between icon and pending count (reduced=%s)',
  async (reduced) => {
    motion.reduced = reduced;
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
          expect(button.querySelector('[data-slot="icon"]')?.textContent).toBe(expected);
          expect(Boolean(button.querySelector('i'))).toBe(count === 0);
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
  },
);
