// @vitest-environment jsdom
import { act, createElement, Fragment, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const menus = vi.hoisted(() => [] as number[]);

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Circle: () => null }));
vi.mock('../src/ui/haptics', () => ({ haptic: () => undefined }));
vi.mock('../src/ui/primitives/context-menu', () => ({
  ContextMenuArea: ({
    actions,
    children,
  }: {
    actions: readonly unknown[];
    children: ReactNode;
  }) => {
    menus.push(actions.length);
    return createElement(Fragment, null, children);
  },
}));
vi.mock('react-native-gesture-handler', () => {
  const builder: Record<string, () => unknown> = {};
  for (const key of ['enabled', 'activeOffsetX', 'failOffsetY', 'onStart', 'onUpdate', 'onEnd'])
    builder[key] = () => builder;
  return {
    Gesture: { Pan: () => builder },
    GestureDetector: ({ children }: { children: ReactNode }) =>
      createElement(Fragment, null, children),
  };
});

const { SwipeRow } = await import('../src/ui/primitives/swipe-row');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('keeps a row whose content grows out of the native long-press menu, so it is never clipped', async () => {
  const action = {
    key: 'clear',
    label: 'Clear',
    tone: 'neutral' as const,
    icon: () => null,
    run: () => undefined,
  };
  const root = createRoot(document.createElement('div'));
  await act(async () =>
    root.render(
      <>
        <SwipeRow actions={[action]}>
          <span>reply</span>
        </SwipeRow>
        <SwipeRow actions={[action]} contextMenu={false}>
          <span>approval</span>
        </SwipeRow>
      </>,
    ),
  );
  expect(menus.slice(-2)).toEqual([1, 0]);
  await act(async () => root.unmount());
});
