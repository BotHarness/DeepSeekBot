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
    Gesture: { Pan: pan, Race: () => ({}) },
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

import {
  closeSessionDrawer,
  openSessionDrawer,
  sessionDrawer,
} from '../src/features/sessions/session-drawer-state';
import { SessionDrawerSurface } from '../src/features/sessions/session-drawer-surface';
import { t } from '../src/ui/strings';

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
      <SessionDrawerSurface>
        <span data-testid="sessions-stack" />
      </SessionDrawerSurface>,
    ),
  );
  return view;
}

it('lays the panel and a scrim over the Sessions stack without wrapping the stack in them', async () => {
  const view = await render();
  expect(view.querySelector('[data-testid="js-drawer-panel"]')).toBeNull();
  await act(async () => openSessionDrawer());
  const stack = view.querySelector('[data-testid="sessions-stack"]')!;
  const panel = view.querySelector('[data-testid="js-drawer-panel"]')!;
  const scrim = view.querySelector('[data-testid="session-drawer-scrim"]')!;
  expect(panel.contains(stack) || stack.contains(panel)).toBe(false);
  expect(scrim.contains(stack)).toBe(false);
  expect(scrim.getAttribute('aria-label')).toBe(t.hostSessions.closeDrawer);
  await act(async () => (scrim as HTMLElement).click());
  expect(sessionDrawer.getSnapshot().open).toBe(false);
});

it('closes the open drawer on Back and keeps the route', async () => {
  await render();
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
});
