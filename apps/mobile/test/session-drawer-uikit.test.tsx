// @vitest-environment jsdom
import { act, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  props: undefined as
    | undefined
    | {
        open: boolean;
        animated: boolean;
        enabled: boolean;
        spring: { mass: number; stiffness: number; damping: number };
        dimColor: string;
        onOpenChange(event: { nativeEvent: { open: boolean } }): void;
        onDragStart(): void;
      },
}));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Keyboard: { dismiss: vi.fn() },
  StyleSheet: { absoluteFill: { position: 'absolute' } },
}));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('expo', () => ({
  requireNativeView: () => (props: { children: ReactNode } & NonNullable<typeof native.props>) => {
    native.props = props;
    return <div data-testid="uikit-drawer">{props.children}</div>;
  },
}));
vi.mock('../src/features/sessions/session-drawer-surface', () => ({
  SessionDrawerSurface: () => null,
}));
vi.mock('../src/features/sessions/uikit-session-drawer', () => ({ uikitSessionDrawer: true }));
vi.mock('expo-router', () => ({
  useFocusEffect: (work: () => void | (() => void)) => useLayoutEffect(work, [work]),
}));
vi.mock('../src/ui/shell/back-owner', () => ({ holdBack: () => ({ remove() {} }) }));
vi.mock('../src/features/sessions/session-drawer-content', () => ({
  SessionDrawerContent: ({ active }: { active: boolean }) => (
    <span data-testid="drawer-panel" data-active={String(active)} />
  ),
}));

import { SessionDrawer } from '../src/features/sessions/session-drawer.ios';
import {
  closeSessionDrawer,
  enterDrawerRoot,
  openSessionDrawer,
  sessionDrawer,
} from '../src/features/sessions/session-drawer-state';
import { spring } from '../src/ui/design/motion';
import { overlaySidebar } from '../src/ui/design/tokens';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => {
  act(() => closeSessionDrawer(false));
  act(() => root?.unmount());
  root = undefined;
});

async function render() {
  const view = document.createElement('div');
  root = createRoot(view);
  await act(async () =>
    root!.render(
      <SessionDrawer>
        <span data-testid="sessions-stack" />
      </SessionDrawer>,
    ),
  );
  return view;
}

it('hands the UIKit drawer the page, the scrim and the panel as its three children', async () => {
  const view = await render();
  const children = [...view.querySelector('[data-testid="uikit-drawer"]')!.children];
  expect(children).toHaveLength(3);
  expect(children[0]!.querySelector('[data-testid="sessions-stack"]')).not.toBeNull();
  expect(children[1]!.getAttribute('data-testid')).toBe('session-drawer-scrim');
  expect(children[2]!.querySelector('[data-testid="drawer-panel"]')).not.toBeNull();
  expect(native.props).toMatchObject({
    open: false,
    enabled: false,
    spring: {
      mass: spring.release.mass,
      stiffness: spring.release.stiffness,
      damping: spring.release.damping,
    },
  });
});

it('gives the dim colour to the native view, never to the scrim React Native restyles', async () => {
  const view = await render();
  expect(native.props?.dimColor).toBe(overlaySidebar.dim.light);
  const scrim = view.querySelector<HTMLElement>('[data-testid="session-drawer-scrim"]')!;
  expect(scrim.style.backgroundColor).toBe('');
});

it('lets a right swipe open the drawer only on a Drawer-style Session root', async () => {
  await render();
  expect(native.props?.enabled).toBe(false);
  let leave = () => {};
  await act(async () => {
    leave = enterDrawerRoot();
  });
  expect(native.props?.enabled).toBe(true);
  await act(async () => leave());
  expect(native.props?.enabled).toBe(false);
});

it('loads the panel as a drag begins and follows where the drag settles', async () => {
  const view = await render();
  const panel = () => view.querySelector('[data-testid="drawer-panel"]')!;
  expect(panel().getAttribute('data-active')).toBe('false');
  await act(async () => native.props!.onDragStart());
  expect(panel().getAttribute('data-active')).toBe('true');
  await act(async () => native.props!.onOpenChange({ nativeEvent: { open: true } }));
  expect(sessionDrawer.getSnapshot().open).toBe(true);
  expect(native.props?.open).toBe(true);
  await act(async () => native.props!.onOpenChange({ nativeEvent: { open: false } }));
  expect(sessionDrawer.getSnapshot()).toMatchObject({ open: false, shown: false });
  expect(panel().getAttribute('data-active')).toBe('false');
});

it('jumps closed without animating when the Sessions tab loses focus', async () => {
  await render();
  await act(async () => openSessionDrawer());
  expect(native.props).toMatchObject({ open: true, animated: true });
  await act(async () => closeSessionDrawer(false));
  expect(native.props).toMatchObject({ open: false, animated: false });
});
