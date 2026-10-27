// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type {
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  handlers: undefined as undefined | { onStart(): void; onEnd(event: { height: number }): void },
  inset: undefined as undefined | ((value: { bottom: number }) => void),
  lift: '',
  queue: [] as Array<() => void>,
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock(
  '../src/ui/primitives/chat-scroll',
  () => import('../src/ui/primitives/chat-scroll.android'),
);
vi.mock('react-native-worklets', () => ({
  scheduleOnRN: (callback: (...args: never[]) => void, ...args: never[]) =>
    native.queue.push(() => callback(...args)),
}));
vi.mock('react-native-reanimated', () => ({
  useReducedMotion: () => false,
  useSharedValue: (value: number | boolean) => useRef({ value }).current,
  useAnimatedReaction: () => undefined,
  useAnimatedStyle: (compute: () => unknown) => compute(),
}));
vi.mock('react-native-keyboard-controller', () => ({
  useKeyboardHandler: (handlers: typeof native.handlers) => {
    native.handlers = handlers;
  },
  useReanimatedKeyboardAnimation: () => ({ height: { value: 0 } }),
  KeyboardChatScrollView: (props: {
    onContentInsetChange: typeof native.inset;
    keyboardLiftBehavior: string;
  }) => {
    native.inset = props.onContentInsetChange;
    native.lift = props.keyboardLiftBehavior;
    return null;
  },
}));

import { useChannelViewport } from '../src/ui/chat/channel-viewport';
import type { ConversationMessage } from '../src/host/conversation';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let frames = new Map<number, () => void>();
const rows: ConversationMessage[] = [
  { id: 'bot-1', at: '', author: 'bot', body: 'stream', attachments: [], delivery: 'committed' },
];
const layout = { nativeEvent: { layout: { height: 800 } } } as LayoutChangeEvent;
const scroll = (offset: number, content = 2000) =>
  ({
    nativeEvent: {
      contentOffset: { y: offset },
      contentSize: { height: content },
      layoutMeasurement: { height: 800 },
    },
  }) as NativeSyntheticEvent<NativeScrollEvent>;
function drain() {
  act(() => {
    for (const callback of native.queue.splice(0)) callback();
  });
}
function flush() {
  act(() => {
    for (let i = 0; i < 64 && frames.size; i++) {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback();
    }
  });
}
beforeEach(() => {
  native.queue = [];
  frames = new Map();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    frames.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (value: number) => frames.delete(value));
});
afterEach(() => {
  act(() => root?.unmount());
  vi.unstubAllGlobals();
});
function mount() {
  const scrollToOffset = vi.fn();
  const list = { current: { scrollToOffset } as unknown as FlatList<unknown> };
  let current!: ReturnType<typeof useChannelViewport<unknown>>;
  function Probe() {
    current = useChannelViewport(list, rows, undefined, 0, false);
    return current.renderScrollComponent?.({}) ?? null;
  }
  root = createRoot(document.createElement('div'));
  act(() => root!.render(<Probe />));
  act(() => {
    current.listProps.onLayout(layout);
    current.listProps.onContentSizeChange(0, 2000);
    current.jumpToLatest();
    current.listProps.onScroll(scroll(1200));
  });
  flush();
  scrollToOffset.mockClear();
  return {
    get current() {
      return current;
    },
    scrollToOffset,
  };
}
function start() {
  native.handlers!.onStart();
  drain();
}
function end() {
  native.handlers!.onEnd({ height: 300 });
  drain();
}

describe('Channel viewport through the Android keyboard adapter', () => {
  it('hides keyboard coordination from the screen interface', () => {
    const view = mount();
    expect(view.current).not.toHaveProperty('keyboard');
    expect(native.lift).toBe('whenAtEnd');
  });
  it('cancels a pending application pin when native keyboard motion starts', () => {
    const view = mount();
    act(() => view.current.listProps.onContentSizeChange(0, 2100));
    start();
    flush();
    expect(view.scrollToOffset).not.toHaveBeenCalled();
  });
  it('receives native inset before end and follows the final streamed height', () => {
    const view = mount();
    start();
    act(() => {
      view.current.listProps.onContentSizeChange(0, 2100);
      native.inset!({ bottom: 250 });
      view.current.listProps.onScroll(scroll(1450, 2100));
    });
    flush();
    expect(view.scrollToOffset).not.toHaveBeenCalled();
    end();
    flush();
    expect(view.scrollToOffset.mock.calls).toEqual([[{ offset: 1600, animated: false }]]);
  });
  it('coalesces content growth after the end callback into the same pending correction', () => {
    const view = mount();
    start();
    end();
    act(() => view.current.listProps.onContentSizeChange(0, 2200));
    flush();
    expect(view.scrollToOffset.mock.calls).toEqual([[{ offset: 1700, animated: false }]]);
  });
  it('keeps held history still through streaming and keyboard changes', () => {
    const view = mount();
    act(() => view.current.hold());
    expect(native.lift).toBe('never');
    start();
    act(() => view.current.listProps.onContentSizeChange(0, 2300));
    end();
    flush();
    expect(view.scrollToOffset).not.toHaveBeenCalled();
    expect(view.current.away).toBe(true);
  });
  it('remembers a jump during keyboard motion and performs it after native settlement', () => {
    const view = mount();
    act(() => view.current.hold());
    start();
    act(() => {
      view.current.jumpToLatest();
      view.current.listProps.onContentSizeChange(0, 2100);
    });
    flush();
    expect(view.scrollToOffset).not.toHaveBeenCalled();
    end();
    flush();
    expect(view.current.away).toBe(false);
    expect(view.scrollToOffset.mock.calls).toEqual([[{ offset: 1600, animated: false }]]);
  });
  it('preserves the existing end correction for unchanged content', () => {
    const view = mount();
    start();
    act(() => view.current.listProps.onContentSizeChange(0, 2000));
    end();
    flush();
    expect(view.scrollToOffset.mock.calls).toEqual([[{ offset: 1500, animated: false }]]);
  });
});
