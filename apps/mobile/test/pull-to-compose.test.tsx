// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));

const { played } = await import('./expo-haptics-shim');
const { pulledPast, usePullToCompose } = await import('../src/ui/chat/pull-to-compose');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTENT = 2000;
const LAYOUT = 800;
const END = CONTENT - LAYOUT;
const THRESHOLD = 64;

const at = (offset: number) =>
  ({
    nativeEvent: {
      contentOffset: { y: offset },
      contentSize: { height: CONTENT },
      layoutMeasurement: { height: LAYOUT },
    },
  }) as NativeSyntheticEvent<NativeScrollEvent>;

function mount(enabled = true) {
  const onCompose = vi.fn();
  const probe: { current?: ReturnType<typeof usePullToCompose> } = {};
  function Probe() {
    probe.current = usePullToCompose({ enabled, threshold: THRESHOLD, onCompose });
    return null;
  }
  act(() => createRoot(document.createElement('div')).render(<Probe />));
  const pull = () => probe.current!;
  const drag = (from: number, to: number) =>
    act(() => {
      pull().onScrollBeginDrag(at(from));
      pull().onScroll(at(to));
      pull().onScrollEndDrag(at(to));
    });
  return { onCompose, pull, drag };
}

beforeEach(() => {
  played.length = 0;
});

describe('pull to compose', () => {
  it('measures only the pull past where the drag began', () => {
    expect(pulledPast(END + 30, END)).toBe(30);
    expect(pulledPast(END - 30, END)).toBe(0);
  });

  it('opens the composer when a drag from the latest message pulls past the threshold', () => {
    const { onCompose, drag } = mount();
    drag(END, END + THRESHOLD);
    expect(onCompose).toHaveBeenCalledTimes(1);
    expect(played).toEqual(['impact:light']);
  });

  it('does nothing for a short pull, so the bounce alone stays harmless', () => {
    const { onCompose, drag } = mount();
    drag(END, END + THRESHOLD - 1);
    expect(onCompose).not.toHaveBeenCalled();
    expect(played).toEqual([]);
  });

  it('lets the user cancel by easing back before release', () => {
    const { onCompose, pull } = mount();
    act(() => {
      pull().onScrollBeginDrag(at(END));
      pull().onScroll(at(END + THRESHOLD + 10));
    });
    expect(pull().ready).toBe(true);
    act(() => {
      pull().onScroll(at(END + 10));
      pull().onScrollEndDrag(at(END + 10));
    });
    expect(pull().ready).toBe(false);
    expect(onCompose).not.toHaveBeenCalled();
  });

  it('ignores drags that start while reading history', () => {
    const { onCompose, drag } = mount();
    drag(END - 400, END - 400 + THRESHOLD * 2);
    expect(onCompose).not.toHaveBeenCalled();
  });

  it('stays off where there is no composer to open', () => {
    const { onCompose, drag } = mount(false);
    drag(END, END + THRESHOLD * 2);
    expect(onCompose).not.toHaveBeenCalled();
  });
});
