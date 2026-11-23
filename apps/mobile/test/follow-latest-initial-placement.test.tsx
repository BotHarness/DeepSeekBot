// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHECK_BUDGET, STABLE_FRAMES } from '../src/ui/chat/follow-latest';

import {
  CONTENT,
  END,
  LAYOUT,
  event,
  flushFrames,
  frames,
  layout,
  message,
  mount,
  resetFrames,
} from './follow-latest-gestures-fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(resetFrames);

afterEach(() => vi.unstubAllGlobals());

describe('following a growing conversation', () => {
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

  it('reveals rows that arrive after the list geometry has already settled', () => {
    const view = mount([]);
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT));
    act(() => view.current.listProps.onScroll(event(0)));
    flushFrames();
    expect(view.current.ready).toBe(false);
    view.rerender([message('a', 'bot')]);
    flushFrames();
    expect(view.current.ready).toBe(true);
    view.unmount();
  });

  it('offers retry when rows are present but the list never reports its content', () => {
    const view = mount([message('a', 'bot')]);
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    for (let frame = 0; frame < CHECK_BUDGET * 2; frame += 1)
      act(() => {
        for (const callback of frames.splice(0)) callback();
      });
    expect(view.current.ready).toBe(false);
    expect(view.current.canRetry).toBe(true);
    view.unmount();
  });

  it('pins the latest message even when a keyboard start never ends', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const view = mount([message('a', 'bot')]);
    act(() => view.current.keyboard.onStart());
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT));
    flushFrames();
    expect(view.scrollToOffset).not.toHaveBeenCalled();
    act(() => {
      vi.runAllTimers();
    });
    flushFrames();
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: END, animated: false });
    act(() => view.current.listProps.onScroll(event(0)));
    flushFrames();
    expect(view.current.ready).toBe(true);
    view.unmount();
    vi.useRealTimers();
  });

  it('offers retry when the content height never stops changing', () => {
    const view = mount([message('a', 'bot')]);
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    for (let frame = 0; frame < CHECK_BUDGET * 2; frame += 1) {
      act(() => view.current.listProps.onContentSizeChange(0, frame % 2 === 0 ? 728 : 768));
      act(() => {
        for (const callback of frames.splice(0)) callback();
      });
    }
    expect(view.current.ready).toBe(false);
    expect(view.current.canRetry).toBe(true);
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
});

describe('latest-first Android list', () => {
  it('reveals measured latest-first content after positioning without waiting for older-row sizes', () => {
    const view = mount([message('latest', 'bot')], 0, false, true, true);
    try {
      act(() => view.current.listProps.onLayout(layout(LAYOUT)));
      flushFrames();
      expect(view.current.ready).toBe(false);
      act(() => view.current.listProps.onContentSizeChange(0, CONTENT));
      act(() => {
        for (const callback of frames.splice(0)) callback();
      });
      expect(view.current.ready).toBe(false);
      act(() => {
        for (const callback of frames.splice(0)) callback();
      });
      expect(view.current.ready).toBe(true);
      expect(view.current.canRetry).toBe(false);
      expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: 0, animated: false });
      act(() => view.current.listProps.onContentSizeChange(0, CONTENT + 900));
      flushFrames();
      expect(view.current.ready).toBe(true);
      expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: 0, animated: true });
    } finally {
      view.unmount();
    }
  });

  it('does not reveal an inverted viewport away from zero and recovers after retry', () => {
    const view = mount([message('latest', 'bot')], 0, false, true, true);
    try {
      act(() => {
        view.current.listProps.onLayout(layout(LAYOUT));
        view.current.listProps.onContentSizeChange(0, CONTENT);
        view.current.listProps.onScroll(event(END - 180));
      });
      flushFrames();
      expect(view.current.ready).toBe(false);
      expect(view.current.canRetry).toBe(true);
      act(() => {
        view.current.retry();
        view.current.listProps.onScroll(event(END));
      });
      flushFrames();
      expect(view.current.ready).toBe(true);
      expect(view.current.canRetry).toBe(false);
    } finally {
      view.unmount();
    }
  });

  it('waits for keyboard handoff before revealing an initial inverted viewport', () => {
    const view = mount([message('latest', 'bot')], 0, false, true, true);
    try {
      act(() => {
        view.current.listProps.onLayout(layout(LAYOUT));
        view.current.listProps.onContentSizeChange(0, CONTENT);
      });
      act(() => {
        for (const callback of frames.splice(0)) callback();
      });
      act(() => view.current.keyboard.onStart());
      flushFrames();
      expect(view.current.ready).toBe(false);
      act(() => {
        view.current.keyboard.onInsetChange({ bottom: 300 });
        view.current.listProps.onLayout(layout(LAYOUT - 300));
        view.current.keyboard.onEnd();
      });
      flushFrames();
      expect(view.current.ready).toBe(true);
      expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: 0, animated: false });
    } finally {
      view.unmount();
    }
  });

  it('positions at zero without measuring all older rows', () => {
    const view = mount([message('latest', 'bot')], 0, false, true, true);
    act(() => {
      view.current.listProps.onLayout(layout(LAYOUT));
      view.current.listProps.onContentSizeChange(0, CONTENT);
    });
    flushFrames();
    expect(view.current.ready).toBe(true);
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: 0, animated: false });
    view.unmount();
  });
  it('holds reading while content grows and explicitly returns to zero', () => {
    const view = mount([message('latest', 'bot')], 0, false, true, true);
    act(() => {
      view.current.listProps.onLayout(layout(LAYOUT));
      view.current.listProps.onContentSizeChange(0, CONTENT);
    });
    flushFrames();
    view.scrollToOffset.mockClear();
    act(() => {
      view.current.listProps.onScrollBeginDrag();
      view.current.listProps.onScrollEndDrag(event(END - 180));
      view.current.listProps.onContentSizeChange(0, CONTENT + 300);
    });
    flushFrames();
    expect(view.current.away).toBe(true);
    expect(view.scrollToOffset).not.toHaveBeenCalled();
    act(() => view.current.jumpToLatest());
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: 0, animated: true });
    view.unmount();
  });
  it('keeps latest at zero after keyboard handoff', () => {
    const view = mount([message('latest', 'bot')], 0, false, true, true);
    act(() => {
      view.current.listProps.onLayout(layout(LAYOUT));
      view.current.listProps.onContentSizeChange(0, CONTENT);
    });
    flushFrames();
    view.scrollToOffset.mockClear();
    act(() => {
      view.current.keyboard.onStart();
      view.current.keyboard.onInsetChange({ bottom: 300 });
      view.current.listProps.onContentSizeChange(0, CONTENT + 400);
    });
    flushFrames();
    expect(view.scrollToOffset).not.toHaveBeenCalled();
    act(() => view.current.keyboard.onEnd());
    flushFrames();
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: 0, animated: false });
    view.unmount();
  });
});
