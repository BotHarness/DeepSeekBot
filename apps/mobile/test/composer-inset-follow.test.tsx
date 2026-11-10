// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { SharedValue, AnimatedRef } from 'react-native-reanimated';
import type Reanimated from 'react-native-reanimated';

const probe = vi.hoisted(() => ({
  lift: '',
  follow: undefined as SharedValue<boolean> | undefined,
  reaction: undefined as undefined | ((current: number, previous: number | null) => void),
  frames: [] as Array<() => void>,
  scrollTo: vi.fn(),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (f: () => void) => f() }));
vi.mock('react-native-reanimated', async () => {
  const React = await import('react');
  return {
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: unknown) => React.useRef({ value }).current,
  };
});
vi.mock('react-native-keyboard-controller', () => ({
  useKeyboardHandler: () => undefined,
  useReanimatedKeyboardAnimation: () => ({ height: { value: 0 } }),
  KeyboardChatScrollView: (props: {
    keyboardLiftBehavior: string;
    extraContentPaddingFollow?: SharedValue<boolean>;
  }) => {
    probe.lift = props.keyboardLiftBehavior;
    probe.follow = props.extraContentPaddingFollow;
    return null;
  },
}));
vi.mock('../node_modules/react-native-keyboard-controller/src/architecture', () => ({
  IS_FABRIC: true,
}));
vi.mock('../node_modules/react-native-keyboard-controller/src/reanimated', () => ({
  useAnimatedReaction: (_prepare: unknown, reaction: typeof probe.reaction) => {
    probe.reaction = reaction;
  },
}));
vi.mock(
  '../node_modules/react-native-keyboard-controller/src/components/utils/safeScrollTo',
  () => ({ safeScrollTo: probe.scrollTo }),
);
import { useExtraContentPadding } from '../node_modules/react-native-keyboard-controller/src/components/KeyboardChatScrollView/useExtraContentPadding';
import { useChatScrollAdapter } from '../src/ui/primitives/chat-scroll.android';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  vi.unstubAllGlobals();
  probe.frames = [];
  probe.scrollTo.mockClear();
});
const shared = <T,>(value: T) => ({ value }) as SharedValue<T>;

function fixture(held: boolean, extra = true, current = 96, previous = 66, offset = 30) {
  const inset = shared(current);
  const scroll = shared(offset);
  function Adapter() {
    const render = useChatScrollAdapter(
      { onStart() {}, onEnd() {}, onInsetChange() {} },
      held,
      extra ? inset : undefined,
    );
    return render({});
  }
  root = createRoot(document.createElement('div'));

  function Library() {
    useExtraContentPadding({
      scrollViewRef: (() => undefined) as unknown as AnimatedRef<Reanimated.ScrollView>,
      extraContentPadding: inset,
      keyboardPadding: shared(300),
      blankSpace: shared(0),
      scroll,
      layout: shared({ width: 390, height: 800 }),
      size: shared({ width: 390, height: 2000 }),
      inverted: true,
      keyboardLiftBehavior: probe.lift as 'always' | 'never' | 'whenAtEnd',
      ...(probe.follow === undefined ? {} : { extraContentPaddingFollow: probe.follow }),
      freeze: shared(false),
    });
    return null;
  }
  act(() =>
    root!.render(
      <>
        <Adapter />
        <Library />
      </>,
    ),
  );
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => {
    probe.frames.push(fn);
    return probe.frames.length;
  });
  return {
    react: () => probe.reaction!(current, previous),
    flush: () => probe.frames.splice(0).forEach((f) => f()),
    lift: probe.lift,
  };
}

it('keeps logical latest following when native inset compensation moved raw offset past the threshold', () => {
  const f = fixture(false);
  f.react();
  f.flush();
  expect(probe.scrollTo).toHaveBeenCalledWith(expect.any(Function), 0, 0, false);
});

it('does not enqueue inset following after the user has held history', () => {
  const f = fixture(true);
  expect(f.lift).toBe('never');
  f.react();
  f.flush();
  expect(probe.scrollTo).not.toHaveBeenCalled();
});

it('retains the raw end-position gate when there is no animated composer inset', () => {
  const f = fixture(false, false);
  expect(f.lift).toBe('whenAtEnd');
  f.react();
  f.flush();
  expect(probe.scrollTo).not.toHaveBeenCalled();
});

it('keeps latest at zero when a shrinking native inset has already clamped its compensation', () => {
  const f = fixture(false, true, 66, 96, 0);
  f.react();
  f.flush();
  expect(probe.scrollTo).toHaveBeenCalledWith(expect.any(Function), 0, 0, false);
});

it('cancels queued inset correction when the owner holds history before the frame', () => {
  const f = fixture(false);
  f.react();
  probe.follow!.value = false;
  f.flush();
  expect(probe.scrollTo).not.toHaveBeenCalled();
});

it('invalidates queued inset correction when its scroll owner unmounts', () => {
  const f = fixture(false);
  f.react();
  act(() => root!.unmount());
  root = undefined;
  f.flush();
  expect(probe.scrollTo).not.toHaveBeenCalled();
});
