// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  supported: true,
  textRows: [] as Array<{ key: string }>,
  rowSwipe: undefined as boolean | undefined,
  rowAction: undefined as
    | undefined
    | ((event: { nativeEvent: { key: string; action: string; anchor?: object } }) => void),
  keyboard: false,
  window: undefined as
    | undefined
    | ((event: { nativeEvent: { start: number; end: number; width: number } }) => void),
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('expo', () => ({
  requireOptionalNativeModule: () => (state.supported ? { supported: true } : null),
  requireNativeView: (name: string) =>
    function Native(props: {
      children?: ReactNode;
      rowKey?: string;
      onWindow?: typeof state.window;
      textRows?: Array<{ key: string }>;
      rowSwipe?: boolean;
      onRowAction?: typeof state.rowAction;
    }) {
      if (name === 'ChatRecycler') {
        state.window = props.onWindow;
        state.textRows = props.textRows ?? [];
        state.rowSwipe = props.rowSwipe;
        state.rowAction = props.onRowAction;
      }
      return <div data-cell={props.rowKey}>{props.children}</div>;
    },
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  state.supported = true;
  state.keyboard = false;
});

it('mounts only the native requested window and restores the same message identities', async () => {
  vi.stubEnv('EXPO_PUBLIC_CHAT_LIST', 'recycler');
  const { ChatList } = await import('../src/ui/primitives/chat-list.android');
  const container = document.createElement('div');
  const root = createRoot(container);
  const data = Array.from({ length: 10000 }, (_, index) => `message-${index}`);
  await act(async () =>
    root.render(
      <ChatList
        data={data}
        keyExtractor={(item) => item}
        renderItem={({ item }) => <span>{item}</span>}
      />,
    ),
  );
  expect(container.querySelectorAll('[data-cell]').length).toBe(12);
  await act(async () => state.window?.({ nativeEvent: { start: 500, end: 524, width: 390 } }));
  expect(container.querySelectorAll('[data-cell]').length).toBe(24);
  expect(container.textContent).toContain('message-500');
  expect(container.textContent).not.toContain('message-0');
  await act(async () => state.window?.({ nativeEvent: { start: 0, end: 12, width: 390 } }));
  expect(container.querySelector('[data-cell]')?.getAttribute('data-cell')).toBe('item:message-0');
  await act(async () => root.unmount());
});

it('keeps FlatList when the rebuilt module is absent', async () => {
  vi.stubEnv('EXPO_PUBLIC_CHAT_LIST', 'recycler');
  state.supported = false;
  const { nativeChatRecycler } = await import('../src/ui/primitives/chat-list.android');
  expect(nativeChatRecycler).toBe(false);
});

it('hands native text rows to the RecyclerView instead of mounting React cells', async () => {
  vi.stubEnv('EXPO_PUBLIC_CHAT_LIST', 'recycler');
  const { ChatList } = await import('../src/ui/primitives/chat-list.android');
  const container = document.createElement('div');
  const root = createRoot(container);
  const data = ['a', 'b', 'c'];
  await act(async () =>
    root.render(
      <ChatList
        data={data}
        keyExtractor={(item) => item}
        renderItem={({ item }) => <span>{item}</span>}
        nativeRow={(item) => (item === 'b' ? { key: item, body: 'plain' } : undefined)}
        nativeStyle={{}}
      />,
    ),
  );
  expect(state.textRows).toEqual([{ key: 'item:b', body: 'plain' }]);
  expect(
    [...container.querySelectorAll('[data-cell]')].map((cell) => cell.getAttribute('data-cell')),
  ).toEqual(['item:a', 'item:c']);
  await act(async () => root.unmount());
});

it('uses the RecyclerView by default and FlatList only when switched off', async () => {
  expect((await import('../src/ui/primitives/chat-list.android')).nativeChatRecycler).toBe(true);
  vi.resetModules();
  vi.stubEnv('EXPO_PUBLIC_CHAT_LIST', 'flatlist');
  expect((await import('../src/ui/primitives/chat-list.android')).nativeChatRecycler).toBe(false);
});

it('routes native row gestures to the item, and drops taps that only dismiss the keyboard', async () => {
  const { Keyboard } = await import('react-native');
  vi.spyOn(Keyboard, 'isVisible').mockImplementation(() => state.keyboard);
  const { ChatList } = await import('../src/ui/primitives/chat-list.android');
  const container = document.createElement('div');
  const root = createRoot(container);
  const onNativeRow = vi.fn();
  await act(async () =>
    root.render(
      <ChatList
        data={['a', 'b']}
        keyExtractor={(item) => item}
        renderItem={({ item }) => <span>{item}</span>}
        nativeRow={(item) => ({ key: item, body: item })}
        nativeStyle={{}}
        nativeSwipe
        onNativeRow={onNativeRow}
        keyboardShouldPersistTaps="never"
      />,
    ),
  );
  expect(state.rowSwipe).toBe(true);
  const anchor = { x: 1, y: 2, width: 3, height: 4 };
  state.rowAction?.({ nativeEvent: { key: 'item:b', action: 'press', anchor } });
  state.rowAction?.({ nativeEvent: { key: 'item:missing', action: 'press', anchor } });
  state.keyboard = true;
  state.rowAction?.({ nativeEvent: { key: 'item:a', action: 'hold' } });
  state.rowAction?.({ nativeEvent: { key: 'item:a', action: 'reply' } });
  expect(onNativeRow.mock.calls).toEqual([
    ['b', { action: 'press', anchor }],
    ['a', { action: 'reply' }],
  ]);
  await act(async () => root.unmount());
});
