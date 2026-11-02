// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const box = vi.fn();
vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('@expo/ui/jetpack-compose', () => ({
  Host: ({ children }: { children: ReactNode }) => children,
  RNHostView: ({ children }: { children: ReactNode }) => children,
  PullToRefreshBox: (props: {
    children: ReactNode;
    isRefreshing: boolean;
    onRefresh: () => void;
  }) => {
    box(props);
    return createElement(
      'section',
      { 'data-refreshing': String(props.isRefreshing) },
      props.children,
    );
  },
}));
import { PullToRefresh } from '../src/ui/primitives/pull-to-refresh.android';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('wraps the list in the Material 3 pull-to-refresh box and hands it nested scrolling', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const onRefresh = vi.fn();
  const list = vi.fn((_: object) => createElement('ul'));
  await act(async () =>
    root.render(
      <PullToRefresh refreshing onRefresh={onRefresh}>
        {list}
      </PullToRefresh>,
    ),
  );
  expect(list).toHaveBeenCalledWith({ nestedScrollEnabled: true });
  expect(host.querySelector('section[data-refreshing="true"] ul')).not.toBeNull();
  const props = box.mock.calls.at(-1)?.[0] as { onRefresh: () => void; contentAlignment: string };
  expect(props.contentAlignment).toBe('topCenter');
  props.onRefresh();
  expect(onRefresh).toHaveBeenCalledOnce();
  act(() => root.unmount());
});
