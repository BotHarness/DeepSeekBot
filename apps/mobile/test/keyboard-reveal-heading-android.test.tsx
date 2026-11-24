// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ViewInstance } from 'react-native';
import { afterEach, expect, it, vi } from 'vitest';

type Reaction = {
  read(): unknown;
  run(value: unknown, previous: unknown): void;
  previous: unknown;
};

const native = vi.hoisted(() => {
  const value = <T,>(initial: T) => ({
    current: initial,
    get() {
      return this.current;
    },
    set(next: T) {
      this.current = next;
    },
  });
  return {
    value,
    offset: value(0),
    height: value(0),
    progress: value(0),
    viewport: { pageY: 100, height: 700 },
    reactions: [] as Reaction[],
    scrolls: [] as number[],
  };
});

vi.mock('react-native-reanimated', () => ({
  measure: () => native.viewport,
  scrollTo: (_ref: unknown, _x: number, y: number) => {
    native.scrolls.push(y);
    native.offset.set(y);
  },
  useAnimatedReaction: (read: () => unknown, run: (value: unknown, previous: unknown) => void) => {
    native.reactions.push({ read, run, previous: null });
  },
  useAnimatedRef: () => () => {},
  useScrollOffset: () => native.offset,
  useSharedValue: <T,>(initial: T) => native.value(initial),
}));
vi.mock('react-native-keyboard-controller', () => ({
  useReanimatedKeyboardAnimation: () => ({ height: native.height, progress: native.progress }),
}));

import { useNativeFormScroll } from '../src/ui/primitives/keyboard-form-native-focus.android';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const KEYBOARD = 350;
const BOTTOM_OFFSET = 100;
const HEADING_END = 228;

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  native.offset.set(0);
  native.height.set(0);
  native.progress.set(0);
  native.reactions.length = 0;
  native.scrolls.length = 0;
});

function openKeyboardUnder(fieldBottom: number, revealPast: number) {
  let focus: ((node: ViewInstance, focused: boolean) => void) | undefined;
  function Form() {
    focus = useNativeFormScroll(undefined, true, BOTTOM_OFFSET, revealPast).focus;
    return null;
  }
  root = createRoot(document.createElement('div'));
  act(() => root!.render(<Form />));
  const field = {
    measureInWindow: (done: (x: number, y: number, width: number, height: number) => void) =>
      done(0, fieldBottom - 50, 320, 50),
  } as unknown as ViewInstance;
  focus!(field, true);
  const kept: boolean[] = [];
  for (let frame = 1; frame <= 10; frame++) {
    native.progress.set(frame / 10);
    native.height.set((-KEYBOARD * frame) / 10);
    for (const reaction of native.reactions) {
      const value = reaction.read();
      reaction.run(value, reaction.previous);
      reaction.previous = value;
    }
    const keyboardTop =
      native.viewport.pageY + native.viewport.height - (KEYBOARD * frame) / 10 - BOTTOM_OFFSET;
    kept.push(fieldBottom - native.offset.get() <= keyboardTop + 0.001);
  }
  return { settled: native.offset.get(), kept };
}

it('settles a keyboard reveal that would stop inside the heading with the heading fully scrolled away', () => {
  const { settled, kept } = openKeyboardUnder(500, HEADING_END);
  expect(settled).toBe(HEADING_END);
  expect(kept.every(Boolean)).toBe(true);
});

it('keeps the exact keyboard reveal when it already passes the heading', () => {
  const { settled, kept } = openKeyboardUnder(600, HEADING_END);
  expect(settled).toBe(250);
  expect(kept.every(Boolean)).toBe(true);
});

it('does not scroll when the keyboard leaves the focused field visible', () => {
  openKeyboardUnder(300, HEADING_END);
  expect(native.scrolls).toEqual([]);
});
