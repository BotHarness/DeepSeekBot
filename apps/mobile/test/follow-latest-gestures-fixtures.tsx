import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { vi, type Mock } from 'vitest';
import type { ConversationMessage } from '@botharness/host-client/conversation';
import { useFollowLatest } from '../src/ui/chat/follow-latest';

export const CONTENT = 2000;

export const LAYOUT = 800;

export const END = CONTENT - LAYOUT;

export const event = (distance: number, velocity = 0, content = CONTENT) =>
  ({
    nativeEvent: {
      contentOffset: { y: content - LAYOUT - distance },
      contentSize: { height: content },
      layoutMeasurement: { height: LAYOUT },
      velocity: { y: velocity },
    },
  }) as NativeSyntheticEvent<NativeScrollEvent>;

export const layout = (height: number) =>
  ({ nativeEvent: { layout: { height } } }) as LayoutChangeEvent;

export let frames: Array<() => void> = [];

export const flushFrames = () =>
  act(() => {
    for (let round = 0; round < 64 && frames.length > 0; round += 1)
      for (const callback of frames.splice(0)) callback();
  });

export function resetFrames() {
  frames = [];
  let nextFrame = 0;
  const cancelled = new Set<number>();
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    const id = ++nextFrame;
    frames.push(() => {
      if (!cancelled.has(id)) callback();
    });
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => cancelled.add(id));
}

export function message(id: string, author: ConversationMessage['author']): ConversationMessage {
  return { id, at: '', author, body: id, attachments: [], delivery: 'committed' };
}

export function mount(
  messages: readonly ConversationMessage[] = [],
  start = 0,
  empty = false,
  animateScroll = false,
  inverted = false,
  nativeFollow = false,
) {
  const following: Mock = vi.fn();
  const scrollToOffset: Mock = vi.fn();
  const list = { current: { scrollToOffset } as unknown as FlatList<unknown> };
  const probe: { current?: ReturnType<typeof useFollowLatest<unknown>> } = {};
  function Probe({ rows, known }: { rows: readonly ConversationMessage[]; known: boolean }) {
    probe.current = useFollowLatest(
      list,
      rows,
      following,
      start,
      known && rows.length === 0,
      animateScroll,
      0,
      inverted,
      nativeFollow,
    );
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe rows={messages} known={empty} />));
  return {
    following,
    scrollToOffset,
    get current() {
      return probe.current!;
    },
    rerender: (rows: readonly ConversationMessage[]) =>
      act(() => root.render(<Probe rows={rows} known={empty} />)),
    unmount: () => act(() => root.unmount()),
  };
}
