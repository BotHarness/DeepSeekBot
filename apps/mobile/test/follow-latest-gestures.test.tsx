// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOMENTUM_WAIT_MS, NATIVE_GLIDE_MS, useFollowLatest } from '../src/ui/chat/follow-latest';

import {
  CONTENT,
  END,
  LAYOUT,
  event,
  flushFrames,
  layout,
  message,
  mount,
  resetFrames,
} from './follow-latest-gestures-fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(resetFrames);

afterEach(() => vi.unstubAllGlobals());

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
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: END, animated: false });
    view.unmount();
  });

  it('settles a flick release when no momentum follows', () => {
    vi.useFakeTimers();
    const view = mount();
    act(() => view.current.listProps.onScrollBeginDrag());
    act(() => {
      view.current.listProps.onScroll(event(30));
      view.current.listProps.onScrollEndDrag(event(30, 1));
    });
    expect(view.current.away).toBe(true);
    act(() => {
      vi.advanceTimersByTime(MOMENTUM_WAIT_MS);
    });
    expect(view.current.away).toBe(false);
    view.unmount();
    vi.useRealTimers();
  });

  it('waits for momentum to end once it begins', () => {
    vi.useFakeTimers();
    const view = mount();
    act(() => view.current.listProps.onScrollBeginDrag());
    act(() => {
      view.current.listProps.onScrollEndDrag(event(300, 1));
      view.current.listProps.onMomentumScrollBegin();
    });
    act(() => {
      vi.advanceTimersByTime(MOMENTUM_WAIT_MS * 4);
    });
    expect(view.current.away).toBe(true);
    act(() => view.current.listProps.onMomentumScrollEnd(event(10)));
    expect(view.current.away).toBe(false);
    view.unmount();
    vi.useRealTimers();
  });

  it('settles a release just short of the end onto the latest message', () => {
    const view = mount();
    act(() => view.current.listProps.onScrollBeginDrag());
    act(() => view.current.listProps.onScrollEndDrag(event(30)));
    expect(view.current.away).toBe(false);
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: END, animated: false });
    view.unmount();
  });
});

describe('following a growing conversation', () => {
  it('uses scroll content geometry until the first content measurement, even after layout', () => {
    const view = mount([message('latest', 'bot')]);
    try {
      act(() => view.current.listProps.onLayout(layout(LAYOUT)));
      act(() => view.current.listProps.onScroll(event(0)));
      act(() => view.current.jumpToLatest());
      expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: END, animated: false });
      act(() => view.current.listProps.onContentSizeChange(0, CONTENT));
      act(() => view.current.listProps.onScroll(event(0, 0, CONTENT + 200)));
      act(() => view.current.jumpToLatest());
      expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: END, animated: false });
    } finally {
      view.unmount();
    }
  });

  it.each([false, true])(
    'keeps measured growth with animateGrowth=%s after a stale scroll',
    (animateGrowth) => {
      const view = mount([message('a', 'bot')], 0, false, animateGrowth);
      act(() => view.current.listProps.onLayout(layout(LAYOUT)));
      act(() => view.current.listProps.onContentSizeChange(0, CONTENT));
      flushFrames();
      act(() => view.current.listProps.onScroll(event(0)));
      flushFrames();
      expect(view.current.ready).toBe(true);
      view.scrollToOffset.mockClear();
      act(() => {
        view.current.listProps.onContentSizeChange(0, CONTENT + 79);
        view.current.listProps.onScroll(event(0));
      });
      flushFrames();
      expect(view.scrollToOffset).toHaveBeenLastCalledWith({
        offset: END + 79,
        animated: animateGrowth,
      });
      expect(view.current.away).toBe(false);
      view.unmount();
    },
  );

  it.each([
    { height: 600, offset: 1400 },
    { height: 900, offset: 1100 },
  ])(
    'pins a measured viewport height of $height despite an older scroll event',
    ({ height, offset }) => {
      const view = mount([message('a', 'bot')]);
      act(() => view.current.listProps.onLayout(layout(LAYOUT)));
      act(() => view.current.listProps.onContentSizeChange(0, CONTENT));
      flushFrames();
      act(() => view.current.listProps.onScroll(event(0)));
      flushFrames();
      expect(view.current.ready).toBe(true);
      view.scrollToOffset.mockClear();
      act(() => {
        view.current.listProps.onLayout(layout(height));
        view.current.listProps.onScroll(event(0));
      });
      flushFrames();
      expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset, animated: false });
      view.unmount();
    },
  );

  it('cancels a queued final-growth pin when the Human starts dragging', () => {
    const view = mount([message('a', 'bot')]);
    act(() => view.current.listProps.onLayout(layout(LAYOUT)));
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT));
    flushFrames();
    act(() => view.current.listProps.onScroll(event(0)));
    flushFrames();
    expect(view.current.ready).toBe(true);
    view.scrollToOffset.mockClear();
    act(() => {
      view.current.listProps.onContentSizeChange(0, CONTENT + 79);
      view.current.listProps.onScrollBeginDrag();
      view.current.listProps.onScrollEndDrag(event(200, 0, CONTENT + 79));
    });
    flushFrames();
    expect(view.scrollToOffset).not.toHaveBeenCalled();
    expect(view.current.away).toBe(true);
    act(() => view.current.jumpToLatest());
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: END + 79, animated: false });
    view.unmount();
  });

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
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: END + 200, animated: false });
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

  it('keeps the native anchor configured across follow and history transitions', () => {
    const view = mount([message('a', 'bot')]);
    expect(view.current.listProps.maintainVisibleContentPosition).toEqual({
      minIndexForVisible: 0,
    });
    act(() => view.current.listProps.onScrollBeginDrag());
    expect(view.current.listProps.maintainVisibleContentPosition).toEqual({
      minIndexForVisible: 0,
    });
    act(() => view.current.jumpToLatest());
    expect(view.current.listProps.maintainVisibleContentPosition).toEqual({
      minIndexForVisible: 0,
    });
    view.unmount();
  });
});

describe('native keyboard and reading-position coordination', () => {
  it('leaves scrolling to the keyboard during motion, then follows newly streamed content', () => {
    const view = mount([message('latest', 'bot')]);
    act(() => {
      view.current.listProps.onLayout(layout(LAYOUT));
      view.current.listProps.onContentSizeChange(0, CONTENT);
      view.current.keyboard.onStart();
      view.current.keyboard.onInsetChange({ bottom: 300 });
      view.current.listProps.onContentSizeChange(0, CONTENT + 100);
    });
    flushFrames();
    expect(view.scrollToOffset).not.toHaveBeenCalled();
    act(() => view.current.keyboard.onEnd());
    flushFrames();
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: 1600, animated: false });
    view.unmount();
  });

  it('keeps a held history position through keyboard and streamed-content changes', () => {
    const view = mount([message('latest', 'bot')]);
    act(() => {
      view.current.listProps.onLayout(layout(LAYOUT));
      view.current.listProps.onContentSizeChange(0, CONTENT);
      view.current.hold();
      view.current.keyboard.onStart();
      view.current.keyboard.onInsetChange({ bottom: 300 });
      view.current.listProps.onContentSizeChange(0, CONTENT + 100);
      view.current.keyboard.onEnd();
    });
    flushFrames();
    expect(view.current.away).toBe(true);
    expect(view.scrollToOffset).not.toHaveBeenCalled();
    act(() => view.current.jumpToLatest());
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: 1600, animated: false });
    view.unmount();
  });
});

it('animates settled streaming growth without unchanged callbacks snapping the animation', () => {
  const view = mount([message('latest', 'bot')], 0, false, true);
  try {
    act(() => {
      view.current.listProps.onLayout(layout(LAYOUT));
      view.current.listProps.onContentSizeChange(0, CONTENT);
    });
    flushFrames();
    act(() => view.current.listProps.onScroll(event(0)));
    flushFrames();
    view.scrollToOffset.mockClear();
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT + 60));
    flushFrames();
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: END + 60, animated: true });
    view.scrollToOffset.mockClear();
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT + 60));
    flushFrames();
    expect(view.scrollToOffset).not.toHaveBeenCalled();
    act(() => view.current.hold());
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT + 120));
    flushFrames();
    expect(view.scrollToOffset).not.toHaveBeenCalled();
  } finally {
    view.unmount();
  }
});

describe('sending a message', () => {
  function settled(animateScroll: boolean, nativeFollow = false) {
    const view = mount([message('latest', 'bot')], 0, false, animateScroll, false, nativeFollow);
    act(() => {
      view.current.listProps.onLayout(layout(LAYOUT));
      view.current.listProps.onContentSizeChange(0, CONTENT);
    });
    flushFrames();
    act(() => view.current.listProps.onScroll(event(0)));
    flushFrames();
    expect(view.current.ready).toBe(true);
    view.scrollToOffset.mockClear();
    return view;
  }

  it('requests a fly at the newest message and lets the native anchor glide the growth', () => {
    const view = settled(true, true);
    try {
      let fly = false;
      act(() => {
        fly = view.current.send();
      });
      expect(fly).toBe(true);
      view.rerender([message('latest', 'bot'), message('sent', 'human')]);
      act(() => view.current.listProps.onContentSizeChange(0, CONTENT + 60));
      flushFrames();
      expect(view.scrollToOffset).not.toHaveBeenCalled();
      expect(view.current.away).toBe(false);
    } finally {
      view.unmount();
    }
  });

  it('finishes the glide when the native anchor stops short of the newest message', () => {
    const view = settled(true, true);
    vi.useFakeTimers();
    try {
      act(() => {
        view.current.send();
      });
      view.rerender([message('latest', 'bot'), message('sent', 'human')]);
      act(() => {
        view.current.listProps.onContentSizeChange(0, CONTENT + 60);
        view.current.listProps.onScroll(event(48, 0, CONTENT + 60));
      });
      expect(view.scrollToOffset).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(NATIVE_GLIDE_MS);
      });
      expect(view.scrollToOffset).toHaveBeenLastCalledWith({
        offset: CONTENT + 60 - LAYOUT,
        animated: true,
      });
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it('returns to the newest message when a send leaves the content shorter and the list shifted', () => {
    const view = settled(true, true);
    vi.useFakeTimers();
    try {
      act(() => {
        view.current.send();
      });
      view.rerender([message('latest', 'bot'), message('sent', 'human')]);
      act(() => {
        view.current.listProps.onContentSizeChange(0, CONTENT - 20);
        view.current.listProps.onScroll(event(42, 0, CONTENT - 20));
      });
      act(() => {
        vi.advanceTimersByTime(NATIVE_GLIDE_MS);
      });
      expect(view.scrollToOffset).toHaveBeenLastCalledWith({
        offset: CONTENT - 20 - LAYOUT,
        animated: true,
      });
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it('requests no fly when Reduce Motion is on but still follows the new message', () => {
    const view = settled(false);
    try {
      let fly = true;
      act(() => {
        fly = view.current.send();
      });
      expect(fly).toBe(false);
      view.rerender([message('latest', 'bot'), message('sent', 'human')]);
      act(() => view.current.listProps.onContentSizeChange(0, CONTENT + 60));
      flushFrames();
      expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: END + 60, animated: false });
    } finally {
      view.unmount();
    }
  });

  it('jumps to the newest message on send from history when the person asked for it', () => {
    const view = settled(true);
    try {
      act(() => view.current.listProps.onScrollBeginDrag());
      act(() => view.current.listProps.onScrollEndDrag(event(300)));
      view.scrollToOffset.mockClear();
      let fly = true;
      act(() => {
        fly = view.current.send(true);
      });
      expect(fly).toBe(false);
      expect(view.current.away).toBe(false);
      expect(view.scrollToOffset).toHaveBeenCalled();
    } finally {
      view.unmount();
    }
  });

  it('requests no fly and leaves the scroll offset unchanged while reading history', () => {
    const view = settled(true);
    try {
      act(() => view.current.listProps.onScrollBeginDrag());
      act(() => view.current.listProps.onScrollEndDrag(event(300)));
      view.scrollToOffset.mockClear();
      let fly = true;
      act(() => {
        fly = view.current.send();
      });
      expect(fly).toBe(false);
      view.rerender([message('latest', 'bot'), message('sent', 'human')]);
      act(() => view.current.listProps.onContentSizeChange(0, CONTENT + 60));
      flushFrames();
      expect(view.scrollToOffset).not.toHaveBeenCalled();
      expect(view.current.away).toBe(true);
    } finally {
      view.unmount();
    }
  });
});

it('leaves settled growth to the native latest anchor but still pins the first placement', () => {
  const view = mount([message('latest', 'bot')], 0, false, true, false, true);
  try {
    act(() => {
      view.current.listProps.onLayout(layout(LAYOUT));
      view.current.listProps.onContentSizeChange(0, CONTENT);
    });
    flushFrames();
    expect(view.scrollToOffset).toHaveBeenCalledWith({ offset: END, animated: false });
    act(() => view.current.listProps.onScroll(event(0)));
    flushFrames();
    expect(view.current.ready).toBe(true);
    view.scrollToOffset.mockClear();
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT + 60));
    flushFrames();
    expect(view.scrollToOffset).not.toHaveBeenCalled();
    act(() => view.current.jumpToLatest());
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: END + 60, animated: true });
  } finally {
    view.unmount();
  }
});

it('retains Android mVCP while native following owns growth and JS owns explicit jumps', () => {
  const view = mount([message('latest', 'bot')], 0, false, true, true, true);
  try {
    act(() => {
      view.current.listProps.onLayout(layout(LAYOUT));
      view.current.listProps.onContentSizeChange(0, CONTENT);
    });
    flushFrames();
    expect(view.current.ready).toBe(true);
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: 0, animated: false });
    expect(view.current.listProps.maintainVisibleContentPosition).toEqual({
      minIndexForVisible: 0,
    });
    view.scrollToOffset.mockClear();
    act(() => view.current.listProps.onContentSizeChange(0, CONTENT + 60));
    flushFrames();
    expect(view.scrollToOffset).not.toHaveBeenCalled();
    act(() => view.current.listProps.onScrollBeginDrag());
    expect(view.current.away).toBe(true);
    expect(view.current.listProps.maintainVisibleContentPosition).toEqual({
      minIndexForVisible: 0,
    });
    act(() => view.current.jumpToLatest());
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: 0, animated: true });
    expect(view.current.listProps.maintainVisibleContentPosition).toEqual({
      minIndexForVisible: 0,
    });
  } finally {
    view.unmount();
  }
});

it('keeps native keyboard ownership even when streaming growth is animated', () => {
  const view = mount([message('latest', 'bot')], 0, false, true);
  try {
    act(() => {
      view.current.listProps.onLayout(layout(LAYOUT));
      view.current.listProps.onContentSizeChange(0, CONTENT);
      view.current.jumpToLatest();
    });
    flushFrames();
    view.scrollToOffset.mockClear();
    act(() => {
      view.current.keyboard.onStart();
      view.current.listProps.onContentSizeChange(0, CONTENT + 60);
    });
    flushFrames();
    expect(view.scrollToOffset).not.toHaveBeenCalled();
    act(() => view.current.keyboard.onEnd());
    flushFrames();
    expect(view.scrollToOffset).toHaveBeenLastCalledWith({ offset: END + 60, animated: false });
  } finally {
    view.unmount();
  }
});
