// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationMessage } from '../src/host/conversation';
import { STABLE_FRAMES, useFollowLatest } from '../src/ui/chat/follow-latest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTENT = 2000;
const LAYOUT = 800;
const END = CONTENT - LAYOUT;

const event = (distance: number, velocity = 0, content = CONTENT) =>
  ({
    nativeEvent: {
      contentOffset: { y: content - LAYOUT - distance },
      contentSize: { height: content },
      layoutMeasurement: { height: LAYOUT },
      velocity: { y: velocity },
    },
  }) as NativeSyntheticEvent<NativeScrollEvent>;

const layout = (height: number) => ({ nativeEvent: { layout: { height } } }) as LayoutChangeEvent;

let frames: Array<() => void> = [];
const flushFrames = () =>
  act(() => {
    for (let round = 0; round < 64 && frames.length > 0; round += 1)
      for (const callback of frames.splice(0)) callback();
  });

beforeEach(() => {
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
});
afterEach(() => vi.unstubAllGlobals());

function message(id: string, author: ConversationMessage['author']): ConversationMessage {
  return { id, at: '', author, body: id, attachments: [], delivery: 'committed' };
}

function mount(messages: readonly ConversationMessage[] = [], start = 0, empty = false) {
  const following = vi.fn();
  const latestChange = vi.fn();
  const scrollToOffset = vi.fn();
  const list = { current: { scrollToOffset } as unknown as FlatList<unknown> };
  const probe: { current?: ReturnType<typeof useFollowLatest<unknown>> } = {};
  function Probe({ rows, known }: { rows: readonly ConversationMessage[]; known: boolean }) {
    probe.current = useFollowLatest(
      list,
      rows,
      following,
      start,
      known && rows.length === 0,
      latestChange,
    );
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe rows={messages} known={empty} />));
  return {
    following,
    latestChange,
    scrollToOffset,
    get current() {
      return probe.current!;
    },
    rerender: (rows: readonly ConversationMessage[]) =>
      act(() => root.render(<Probe rows={rows} known={empty} />)),
    unmount: () => act(() => root.unmount()),
  };
}

describe('history-reading gesture ownership', () => {
  it('does not let programmatic momentum resume following after an explicit message focus', () => {
    const view = mount([message('latest', 'bot')]);
    act(() => {
      view.current.listProps.onLayout(layout(LAYOUT));
      view.current.listProps.onContentSizeChange(0, CONTENT);
      view.current.hold();
      view.current.listProps.onMomentumScrollEnd(event(0));
      view.current.listProps.onContentSizeChange(0, CONTENT + 300);
    });
    flushFrames();
    expect(view.current.away).toBe(true);
    expect(view.scrollToOffset).not.toHaveBeenCalled();
    view.unmount();
  });

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
    const view = mount();
    act(() => view.current.listProps.onScrollBeginDrag());
    expect(view.following.mock.calls).toEqual([[false]]);
    expect(view.current.away).toBe(true);
    act(() => {
      view.current.listProps.onScroll(event(180));
      view.current.listProps.onScrollEndDrag(event(180, 1));
      view.current.listProps.onScroll(event(0));
      view.current.listProps.onMomentumScrollEnd(event(180));
    });
    expect(view.following.mock.calls).toEqual([[false]]);
    expect(view.current.away).toBe(true);
    expect(view.scrollToOffset).not.toHaveBeenCalled();
    act(() => {
      view.current.listProps.onScrollBeginDrag();
      view.current.listProps.onScroll(event(0));
      view.current.listProps.onScrollEndDrag(event(0));
    });
    expect(view.following.mock.calls).toEqual([[false], [true]]);
    expect(view.current.away).toBe(false);
    act(() => view.current.listProps.onScrollBeginDrag());
    act(() => view.current.jumpToLatest());
    expect(view.following.mock.calls).toEqual([[false], [true], [false], [true]]);
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: END, animated: true });
    view.unmount();
  });

  it('settles a release just short of the end onto the latest message', () => {
    const view = mount();
    act(() => view.current.listProps.onScrollBeginDrag());
    act(() => view.current.listProps.onScrollEndDrag(event(30)));
    expect(view.current.away).toBe(false);
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: END, animated: true });
    view.unmount();
  });
});

describe('following a growing conversation', () => {
  it('pins growth to the end at most once per frame without animation while following', () => {
    const view = mount([message('a', 'bot')]);
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    act(() => {
      view.current.listProps.onContentSizeChange(0, CONTENT);
      view.current.listProps.onContentSizeChange(0, CONTENT + 20);
      view.current.listProps.onContentSizeChange(0, CONTENT + 40);
    });
    expect(view.scrollToOffset).not.toHaveBeenCalled();
    flushFrames();
    expect(view.scrollToOffset.mock.calls).toEqual([[{ offset: END + 40, animated: false }]]);
    view.unmount();
  });

  it('never moves the viewport for growth after a drag past the slop', () => {
    const view = mount([message('a', 'bot')]);
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT));
    flushFrames();
    view.scrollToOffset.mockClear();
    act(() => view.current.listProps.onScrollBeginDrag());
    act(() => view.current.listProps.onScroll(event(120)));
    act(() => view.current.listProps.onScrollEndDrag(event(120)));
    for (const grown of [CONTENT + 50, CONTENT + 100, CONTENT + 400]) {
      act(() => view.current.listProps.onContentSizeChange(0, grown));
      flushFrames();
    }
    expect(view.scrollToOffset).not.toHaveBeenCalled();
    expect(view.current.away).toBe(true);
    view.unmount();
  });

  it('counts unseen Bot messages while away and jumps back to the end', () => {
    const first = [message('a', 'bot'), message('b', 'human')];
    const view = mount(first);
    act(() => view.current.listProps.onScrollBeginDrag());
    act(() => view.current.listProps.onScrollEndDrag(event(300)));
    view.rerender([...first, message('c', 'bot'), message('d', 'system'), message('e', 'human')]);
    expect(view.current.unseen).toBe(2);
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT + 200));
    act(() => view.current.jumpToLatest());
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: END + 200, animated: true });
    expect(view.current.away).toBe(false);
    expect(view.current.unseen).toBe(0);
    view.unmount();
  });

  it('does not count its own animated jump as leaving the latest message', () => {
    const view = mount([message('a', 'bot')]);
    act(() => view.current.listProps.onScrollBeginDrag());
    act(() => view.current.listProps.onScrollEndDrag(event(600)));
    act(() => view.current.jumpToLatest());
    act(() => {
      view.current.listProps.onScroll(event(500));
      view.current.listProps.onScroll(event(200));
    });
    expect(view.current.away).toBe(false);
    act(() => view.current.listProps.onMomentumScrollEnd(event(0)));
    act(() => view.current.listProps.onScroll(event(200)));
    expect(view.current.away).toBe(false);
    act(() => view.current.listProps.onScrollBeginDrag());
    expect(view.current.away).toBe(true);
    view.unmount();
  });

  it('opens at the newest message when the list reports a scroll at the top before it is pinned', () => {
    const view = mount([message('a', 'bot'), message('b', 'human')], 100);
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    act(() => view.current.listProps.onScroll(event(CONTENT - LAYOUT + 100)));
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT / 2));
    act(() => view.current.listProps.onScroll(event(CONTENT - LAYOUT, 0, CONTENT)));
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT));
    flushFrames();
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: END, animated: false });
    expect(view.current.away).toBe(false);
    expect(view.current.ready).toBe(false);
    act(() => view.current.listProps.onScroll(event(0)));
    flushFrames();
    expect(view.current.ready).toBe(true);
    expect(view.following).not.toHaveBeenCalled();
    view.unmount();
  });

  it('leaves the latest message when the status bar scrolls the list to the top', () => {
    const view = mount([message('a', 'bot')]);
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT));
    flushFrames();
    view.scrollToOffset.mockClear();
    act(() => view.current.listProps.onScrollToTop());
    expect(view.current.away).toBe(true);
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT + 100));
    flushFrames();
    expect(view.scrollToOffset).not.toHaveBeenCalled();
    view.unmount();
  });

  it.each([0, 100])(
    'waits for measured content after an early viewport layout (inset %s)',
    (start) => {
      const view = mount([message('a', 'bot')], start);
      act(() => view.current.listProps.onLayout(layout(LAYOUT)));
      flushFrames();
      expect(view.current.ready).toBe(false);
      act(() => view.current.listProps.onContentSizeChange(0, 0));
      flushFrames();
      expect(view.current.ready).toBe(false);
      act(() => view.current.listProps.onContentSizeChange(0, CONTENT));
      flushFrames();
      expect(view.current.ready).toBe(false);
      act(() => view.current.listProps.onScroll(event(0)));
      flushFrames();
      expect(view.current.ready).toBe(true);
      view.unmount();
    },
  );

  it('does not expose history until the native list acknowledges the requested bottom', () => {
    const view = mount([message('a', 'bot')]);
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT));
    flushFrames();
    expect(view.current.ready).toBe(false);
    act(() => view.current.listProps.onScroll(event(300)));
    flushFrames();
    expect(view.current.ready).toBe(false);
    act(() => view.current.listProps.onScroll(event(0)));
    flushFrames();
    expect(view.current.ready).toBe(true);
    view.unmount();
  });

  it('ignores an old native extent when newer content is still awaiting placement', () => {
    const view = mount([message('a', 'bot')]);
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT + 300));
    act(() => view.current.listProps.onScroll(event(0)));
    flushFrames();
    expect(view.current.ready).toBe(false);
    act(() => view.current.listProps.onScroll(event(0, 0, CONTENT + 300)));
    flushFrames();
    expect(view.current.ready).toBe(true);
    view.unmount();
  });

  it('reveals the list only once the end has been pinned and the content settled', () => {
    const view = mount([message('a', 'bot')]);
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT));
    expect(view.current.ready).toBe(false);
    act(() => frames.shift()!());
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: END, animated: false });
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT + 300));
    act(() => frames.shift()!());
    expect(view.current.ready).toBe(false);
    flushFrames();
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: END + 300, animated: false });
    expect(view.current.ready).toBe(false);
    act(() => view.current.listProps.onScroll(event(0, 0, CONTENT + 300)));
    flushFrames();
    expect(view.current.ready).toBe(true);
    view.unmount();
  });

  it('stays hidden while rows keep rendering in batches a few frames apart', () => {
    const view = mount([message('a', 'bot')]);
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT));
    for (let frame = 0; frame < STABLE_FRAMES - 1; frame += 1) act(() => frames.shift()!());
    expect(view.current.ready).toBe(false);
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT + 400));
    for (let frame = 0; frame < STABLE_FRAMES - 1; frame += 1) act(() => frames.shift()!());
    expect(view.current.ready).toBe(false);
    flushFrames();
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: END + 400, animated: false });
    expect(view.current.ready).toBe(false);
    act(() => view.current.listProps.onScroll(event(0, 0, CONTENT + 400)));
    flushFrames();
    expect(view.current.ready).toBe(true);
    view.unmount();
  });

  it('loads older history only after the Human has dragged the list', () => {
    const view = mount([message('a', 'bot')]);
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT));
    flushFrames();
    expect(view.current.browsed).toBe(false);
    act(() => view.current.listProps.onScrollBeginDrag());
    expect(view.current.browsed).toBe(true);
    view.unmount();
  });

  it('offers retry rather than exposing unpositioned history after bounded checks', () => {
    const view = mount([message('a', 'bot')]);
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT));
    flushFrames();
    expect(view.current.ready).toBe(false);
    expect(view.current.canRetry).toBe(true);
    act(() => view.current.retry());
    expect(view.current.canRetry).toBe(false);
    act(() => view.current.listProps.onScroll(event(0)));
    flushFrames();
    expect(view.current.ready).toBe(true);
    expect(view.current.canRetry).toBe(false);
    view.unmount();
  });

  it.each(['content', 'viewport'] as const)(
    'reveals history when the %s geometry settles after the initial retry appears',
    (geometry) => {
      const view = mount([message('pending', 'human')]);
      try {
        act(() => {
          view.current.listProps.onLayout(layout(LAYOUT));
          view.current.listProps.onContentSizeChange(0, CONTENT);
        });
        flushFrames();
        expect(view.current.ready).toBe(false);
        expect(view.current.canRetry).toBe(true);

        act(() => {
          if (geometry === 'content') view.current.listProps.onContentSizeChange(0, LAYOUT);
          else view.current.listProps.onLayout(layout(CONTENT));
        });
        flushFrames();
        expect(view.current.ready).toBe(true);
        expect(view.current.canRetry).toBe(false);
      } finally {
        view.unmount();
      }
    },
  );

  it.each(['content', 'viewport'] as const)(
    'follows geometry reported by scroll before the %s callback',
    (geometry) => {
      const view = mount([message('latest', 'bot')]);
      try {
        act(() => {
          view.current.listProps.onLayout(layout(LAYOUT));
          view.current.listProps.onContentSizeChange(0, CONTENT);
        });
        flushFrames();
        act(() => view.current.listProps.onScroll(event(0)));
        flushFrames();
        expect(view.current.ready).toBe(true);
        const content = geometry === 'content' ? CONTENT + 200 : CONTENT;
        const viewport = geometry === 'viewport' ? LAYOUT - 200 : LAYOUT;
        view.scrollToOffset.mockClear();
        view.latestChange.mockClear();
        const reportGeometry = () => {
          const scrollEvent = event(0);
          view.current.listProps.onScroll({
            ...scrollEvent,
            nativeEvent: {
              ...scrollEvent.nativeEvent,
              contentSize: { width: 440, height: content },
              layoutMeasurement: { width: 440, height: viewport },
            },
          });
          if (geometry === 'content') view.current.listProps.onContentSizeChange(0, content);
          else view.current.listProps.onLayout(layout(viewport));
        };
        act(reportGeometry);
        flushFrames();
        expect(view.scrollToOffset).toHaveBeenLastCalledWith({
          offset: END + 200,
          animated: false,
        });
        expect(view.latestChange).toHaveBeenLastCalledWith(END + 200);
        act(() => view.current.hold());
        view.scrollToOffset.mockClear();
        act(reportGeometry);
        flushFrames();
        expect(view.scrollToOffset).not.toHaveBeenCalled();
        expect(view.current.away).toBe(true);
      } finally {
        view.unmount();
      }
    },
  );

  it('keeps retry available when repeated geometry events report unchanged dimensions', () => {
    const view = mount([message('pending', 'human')]);
    try {
      act(() => {
        view.current.listProps.onLayout(layout(LAYOUT));
        view.current.listProps.onContentSizeChange(0, CONTENT);
      });
      flushFrames();
      expect(view.current.canRetry).toBe(true);
      for (let repeat = 0; repeat < 3; repeat += 1) {
        act(() => {
          view.current.listProps.onLayout(layout(LAYOUT));
          view.current.listProps.onContentSizeChange(0, CONTENT);
        });
        expect(view.current.canRetry).toBe(true);
        flushFrames();
        expect(view.current.ready).toBe(false);
        expect(view.current.canRetry).toBe(true);
      }
    } finally {
      view.unmount();
    }
  });

  it.each(['content', 'viewport'] as const)(
    'requires fresh stable frames after the %s geometry changes during confirmation',
    (geometry) => {
      const view = mount([message('pending', 'human')]);
      try {
        act(() => {
          view.current.listProps.onLayout(layout(LAYOUT));
          view.current.listProps.onContentSizeChange(0, LAYOUT);
        });
        for (let frame = 0; frame < STABLE_FRAMES; frame += 1)
          act(() => {
            for (const callback of frames.splice(0)) callback();
          });
        expect(view.current.ready).toBe(false);
        act(() => {
          if (geometry === 'content') view.current.listProps.onContentSizeChange(0, LAYOUT - 100);
          else view.current.listProps.onLayout(layout(LAYOUT + 100));
        });
        act(() => {
          for (const callback of frames.splice(0)) callback();
        });
        expect(view.current.ready).toBe(false);
        flushFrames();
        expect(view.current.ready).toBe(true);
      } finally {
        view.unmount();
      }
    },
  );

  it('keeps a held viewport visible without scrolling when late geometry arrives after retry', () => {
    const view = mount([message('pending', 'human')]);
    try {
      act(() => {
        view.current.listProps.onLayout(layout(LAYOUT));
        view.current.listProps.onContentSizeChange(0, CONTENT);
      });
      flushFrames();
      expect(view.current.canRetry).toBe(true);
      act(() => view.current.hold());
      view.scrollToOffset.mockClear();
      act(() => {
        view.current.listProps.onLayout(layout(LAYOUT + 100));
        view.current.listProps.onContentSizeChange(0, CONTENT + 100);
      });
      flushFrames();
      expect(view.current.ready).toBe(true);
      expect(view.current.canRetry).toBe(false);
      expect(view.current.away).toBe(true);
      expect(view.scrollToOffset).not.toHaveBeenCalled();
    } finally {
      view.unmount();
    }
  });

  it('reveals short content already at the initial offset without a no-op scroll event', () => {
    const view = mount([message('a', 'bot')]);
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    act(() => view.current.listProps.onContentSizeChange(0, LAYOUT));
    flushFrames();
    expect(view.current.ready).toBe(true);
    expect(view.current.canRetry).toBe(false);
    view.unmount();
  });

  it('reveals fitting Android content including its hairline without a no-op scroll event', () => {
    const view = mount([message('a', 'bot')]);
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    act(() => view.current.listProps.onContentSizeChange(0, LAYOUT + 0.5));
    flushFrames();
    expect(view.current.ready).toBe(true);
    view.unmount();
  });

  it('lets an explicit message-focus jump reveal history without waiting for the bottom', () => {
    const view = mount([message('a', 'bot')]);
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT));
    act(() => view.current.hold());
    flushFrames();
    expect(view.current.ready).toBe(true);
    expect(view.current.away).toBe(true);
    expect(view.scrollToOffset).not.toHaveBeenCalled();
    view.unmount();
  });

  it('keeps a short conversation under the header instead of scrolling past its start', () => {
    const view = mount([message('a', 'bot')], 100);
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    act(() => view.current.listProps.onContentSizeChange(0, LAYOUT - 100));
    flushFrames();
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: -100, animated: false });
    expect(view.current.ready).toBe(true);
    act(() => view.current.listProps.onContentSizeChange(0, LAYOUT - 300));
    flushFrames();
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: -100, animated: false });
    view.unmount();
  });

  it('keeps an empty conversation shown when its first message arrives', () => {
    const view = mount([], 0, true);
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    act(() => view.current.listProps.onContentSizeChange(0, LAYOUT));
    flushFrames();
    expect(view.current.ready).toBe(true);
    view.rerender([message('a', 'human')]);
    expect(view.current.ready).toBe(true);
    view.unmount();
  });

  it('shows the list when the Human sends before the conversation has settled', () => {
    const view = mount([]);
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    act(() => view.current.listProps.onContentSizeChange(0, LAYOUT));
    flushFrames();
    expect(view.current.ready).toBe(false);
    act(() => view.current.jumpToLatest());
    view.rerender([message('a', 'human')]);
    expect(view.current.ready).toBe(true);
    view.unmount();
  });

  it('holds the visible rows in place only while the Human reads history', () => {
    const view = mount([message('a', 'bot')]);
    expect(view.current.listProps.maintainVisibleContentPosition).toBeUndefined();
    act(() => view.current.listProps.onScrollBeginDrag());
    expect(view.current.listProps.maintainVisibleContentPosition).toEqual({
      minIndexForVisible: 0,
    });
    act(() => view.current.jumpToLatest());
    expect(view.current.listProps.maintainVisibleContentPosition).toBeUndefined();
    view.unmount();
  });
});
