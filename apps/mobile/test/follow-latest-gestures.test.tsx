// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { describe, expect, it, vi } from 'vitest';

import { useFollowLatest } from '../src/ui/chat/follow-latest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const event = (offset: number, velocity = 0) =>
  ({
    nativeEvent: { contentOffset: { y: offset }, velocity: { y: velocity } },
  }) as NativeSyntheticEvent<NativeScrollEvent>;

describe('history-reading gesture ownership', () => {
  it('keeps a replacement playback controller held when display mode changes in history', () => {
    const first = vi.fn();
    const replacement = vi.fn();
    const list = { current: null };
    let current!: ReturnType<typeof useFollowLatest<unknown>>;
    function Probe({ onChange }: { onChange: (following: boolean) => void }) {
      current = useFollowLatest(list, [], onChange);
      return null;
    }
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe onChange={first} />));
    act(() => current.listProps.onScrollBeginDrag());
    act(() => current.listProps.onScrollEndDrag(event(180)));
    act(() => root.render(<Probe onChange={replacement} />));
    expect(replacement).toHaveBeenCalledWith(false);
    expect(current.away).toBe(true);
    act(() => root.unmount());
  });

  it('holds immediately and ignores a near-bottom layout event until a return gesture ends', () => {
    const following = vi.fn();
    const scrollToOffset = vi.fn();
    const list = { current: { scrollToOffset } as unknown as FlatList<unknown> };
    let current!: ReturnType<typeof useFollowLatest<unknown>>;
    function Probe() {
      current = useFollowLatest(list, [], following);
      return null;
    }
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe />));
    act(() => current.listProps.onScrollBeginDrag());
    expect(following.mock.calls).toEqual([[false]]);
    expect(current.away).toBe(true);
    act(() => {
      current.listProps.onScroll(event(180));
      current.listProps.onScrollEndDrag(event(180, 1));
      current.listProps.onScroll(event(0));
      current.listProps.onMomentumScrollEnd(event(180));
    });
    expect(following.mock.calls).toEqual([[false]]);
    expect(current.away).toBe(true);
    expect(scrollToOffset).not.toHaveBeenCalled();
    act(() => {
      current.listProps.onScrollBeginDrag();
      current.listProps.onScroll(event(0));
      current.listProps.onScrollEndDrag(event(0));
    });
    expect(following.mock.calls).toEqual([[false], [true]]);
    expect(current.away).toBe(false);
    act(() => current.listProps.onScrollBeginDrag());
    act(() => current.jumpToLatest());
    expect(following.mock.calls).toEqual([[false], [true], [false], [true]]);
    expect(scrollToOffset).toHaveBeenLastCalledWith({ offset: 0, animated: true });
    act(() => root.unmount());
  });
});
