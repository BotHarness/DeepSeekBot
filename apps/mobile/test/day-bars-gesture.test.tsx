// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  gesture: undefined as
    | {
        start: (event: { x: number }) => void;
        update: (event: { x: number }) => void;
        finish: () => void;
      }
    | undefined,
}));
vi.mock('../src/ui/haptics', () => ({ haptic: vi.fn() }));
vi.mock('react-native-reanimated', async () => {
  const { useState } = await import('react');
  return {
    useSharedValue: <T,>(initial: T) => {
      const [value] = useState(() => ({
        value: initial,
        get() {
          return this.value;
        },
        set(next: T) {
          this.value = next;
        },
      }));
      return value;
    },
  };
});
vi.mock('react-native-worklets', () => ({
  scheduleOnRN: <A extends unknown[]>(callback: (...args: A) => void, ...args: A) =>
    callback(...args),
}));
vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  const { useLayoutEffect } = await import('react');
  return {
    ...shim,
    Platform: { ...shim.Platform, OS: 'ios' },
    View: ({
      onLayout,
      ...props
    }: Parameters<typeof shim.View>[0] & {
      onLayout?: (event: { nativeEvent: { layout: { width: number } } }) => void;
    }) => {
      useLayoutEffect(() => {
        onLayout?.({ nativeEvent: { layout: { width: 280 } } });
      }, []);
      return createElement(shim.View, props);
    },
  };
});
vi.mock('react-native-gesture-handler', async () => {
  const { Fragment, createElement } = await import('react');
  return {
    Gesture: {
      Pan: () => {
        const handlers = {
          start: (_event: { x: number }) => {},
          update: (_event: { x: number }) => {},
          finish: () => {},
        };
        const pan = {
          enabled: () => pan,
          runOnJS: () => pan,
          activeOffsetX: () => pan,
          failOffsetY: () => pan,
          onStart: (callback: typeof handlers.start) => {
            handlers.start = callback;
            return pan;
          },
          onUpdate: (callback: typeof handlers.update) => {
            handlers.update = callback;
            return pan;
          },
          onFinalize: (callback: typeof handlers.finish) => {
            handlers.finish = callback;
            return pan;
          },
          handlers,
        };
        return pan;
      },
    },
    GestureDetector: ({
      gesture,
      children,
    }: {
      gesture: { handlers: NonNullable<typeof native.gesture> };
      children?: import('react').ReactNode;
    }) => {
      native.gesture = gesture.handlers;
      return createElement(Fragment, null, children);
    },
  };
});

import { DayBars } from '../src/ui/primitives/day-bars';
import { haptic } from '../src/ui/haptics';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let view: HTMLDivElement;
afterEach(() => {
  act(() => root.unmount());
  view.remove();
  native.gesture = undefined;
  vi.clearAllMocks();
});

const bars = Array.from({ length: 7 }, (_, index) => ({
  key: String(index),
  segments: [index + 1],
}));
const read = (index: number) => ({ label: `Day ${index + 1}`, value: `${index + 1},000 tokens` });

async function mount(controlled = false) {
  view = document.createElement('div');
  document.body.append(view);
  root = createRoot(view);
  function Chart() {
    const [selected, setSelected] = useState<number | undefined>();
    return (
      <DayBars
        bars={bars}
        colors={['accent']}
        height={120}
        empty="empty"
        accessibilityLabel="Tokens"
        read={read}
        {...(controlled ? { selected, onSelect: setSelected } : {})}
      />
    );
  }
  await act(async () => root.render(<Chart />));
  return native.gesture!;
}

describe('iOS chart inspection across React updates', () => {
  it.each([false, true])(
    'clears an in-flight scrub after its selection rerenders (controlled=%s)',
    async (controlled) => {
      const gesture = await mount(controlled);
      await act(async () => gesture.start({ x: 100 }));
      expect(view.textContent).toContain('Day 3');
      await act(async () => gesture.update({ x: 260 }));
      expect(view.textContent).toContain('Day 7');
      await act(async () => gesture.finish());
      expect(view.textContent).not.toContain('tokens');
    },
  );

  it('can scrub back to the bar selected before the gesture started', async () => {
    await mount();
    await act(async () =>
      view.querySelector<HTMLButtonElement>('[data-testid="day-bar-5"]')!.click(),
    );
    const gesture = native.gesture!;
    await act(async () => gesture.start({ x: 180 }));
    expect(view.textContent).toContain('Day 5');
    await act(async () => gesture.update({ x: 220 }));
    expect(view.textContent).toContain('Day 6');
    expect(view.textContent).not.toContain('Day 5');
  });

  it('keeps a tapped reading when the pan recognizer fails without starting', async () => {
    await mount();
    await act(async () =>
      view.querySelector<HTMLButtonElement>('[data-testid="day-bar-5"]')!.click(),
    );
    const gesture = native.gesture!;
    expect(view.textContent).toContain('Day 6');
    await act(async () => gesture.finish());
    expect(view.textContent).toContain('Day 6');
  });

  it('clamps both ends and clears a cancelled active scrub', async () => {
    const gesture = await mount();
    await act(async () => gesture.start({ x: -50 }));
    expect(view.textContent).toContain('Day 1');
    await act(async () => gesture.update({ x: 500 }));
    expect(view.textContent).toContain('Day 7');
    await act(async () => gesture.update({ x: -1 }));
    expect(view.textContent).toContain('Day 1');
    await act(async () => gesture.finish());
    expect(view.textContent).not.toContain('tokens');
  });

  it('updates selection and haptics only when crossing a day boundary', async () => {
    const gesture = await mount();
    await act(async () => gesture.start({ x: 100 }));
    for (const x of [101, 106, 110, 119]) {
      await act(async () => gesture.update({ x }));
    }
    expect(view.textContent).toContain('Day 3');
    expect(haptic).toHaveBeenCalledTimes(1);
    await act(async () => gesture.update({ x: 121 }));
    expect(view.textContent).toContain('Day 4');
    expect(haptic).toHaveBeenCalledTimes(2);
    await act(async () => gesture.finish());
    expect(haptic).toHaveBeenCalledTimes(2);
  });
});
