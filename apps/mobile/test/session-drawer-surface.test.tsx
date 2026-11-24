// @vitest-environment jsdom
import { act, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const back = vi.hoisted(() => ({ handlers: [] as (() => boolean)[] }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  StyleSheet: { absoluteFill: { position: 'absolute' } },
}));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-gesture-handler', () => {
  const pan = (): Record<string, () => unknown> =>
    new Proxy({}, { get: () => () => pan() }) as Record<string, () => unknown>;
  return {
    Gesture: { Pan: pan },
    GestureDetector: ({ children }: { children: ReactNode }) => children,
  };
});
vi.mock('expo-router', () => ({
  useFocusEffect: (work: () => void | (() => void)) => useLayoutEffect(work, [work]),
}));
vi.mock('../src/ui/shell/back-owner', () => ({
  holdBack: (handler: () => boolean) => {
    back.handlers.push(handler);
    return {
      remove() {
        back.handlers = back.handlers.filter((held) => held !== handler);
      },
    };
  },
}));
vi.mock('../src/features/sessions/session-drawer-content', () => ({
  SessionDrawerContent: () => <span data-testid="js-drawer-panel" />,
}));
vi.mock('../src/features/sessions/session-drawer-blur', () => ({ SessionDrawerBlur: () => null }));

import {
  closeSessionDrawer,
  openSessionDrawer,
  sessionDrawer,
} from '../src/features/sessions/session-drawer-state';
import { SessionDrawerSurface } from '../src/features/sessions/session-drawer-surface';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => {
  act(() => closeSessionDrawer(false));
  act(() => root?.unmount());
  root = undefined;
});

async function render(native: boolean) {
  const view = document.createElement('div');
  root = createRoot(view);
  await act(async () =>
    root!.render(
      <SessionDrawerSurface
        {...(native ? { nativeDrawer: <span data-testid="compose-drawer" /> } : {})}
      >
        <span data-testid="sessions-stack" />
      </SessionDrawerSurface>,
    ),
  );
  return view;
}

it('lays the Android Compose drawer over the Sessions stack instead of wrapping it', async () => {
  const view = await render(true);
  const stack = view.querySelector('[data-testid="sessions-stack"]')!;
  const drawer = view.querySelector('[data-testid="compose-drawer"]')!;
  expect(drawer.contains(stack)).toBe(false);
  expect(stack.contains(drawer)).toBe(false);
  expect(view.querySelector('[data-testid="js-drawer-panel"]')).toBeNull();
});

it.each([true, false])(
  'closes the open drawer on Back and keeps the route (native drawer: %s)',
  async (native) => {
    await render(native);
    expect(back.handlers).toHaveLength(0);
    await act(async () => openSessionDrawer());
    expect(back.handlers).toHaveLength(1);
    let handled = false;
    await act(async () => {
      handled = back.handlers[0]!();
    });
    expect(handled).toBe(true);
    expect(sessionDrawer.getSnapshot().open).toBe(false);
    expect(back.handlers).toHaveLength(0);
  },
);
