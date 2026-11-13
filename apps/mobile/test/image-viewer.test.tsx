// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

type Event = {
  translationX: number;
  translationY: number;
  velocityX: number;
  velocityY: number;
  x: number;
  y: number;
};
type Handler = (event: Event, success: boolean) => void;
const state = vi.hoisted(() => ({
  reduced: false,
  gestures: {} as Record<string, Record<string, Handler>>,
  finishes: [] as Array<(finished: boolean) => void>,
  springs: [] as number[],
  modal: {} as { onShow(): void; onRequestClose(): void; animationType: string },
}));
vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return {
    ...shim,
    Modal: (props: typeof state.modal) => {
      state.modal = props;
      return shim.Modal(props);
    },
  };
});
vi.mock('react-native-reanimated', async () => {
  const shim = await import('./reanimated-shim');
  const { useRef } = await import('react');
  return {
    ...shim,
    useSharedValue: <T,>(value: T) => useRef(shim.useSharedValue(value)).current,
    withTiming: (target: number, _config: unknown, done?: (finished: boolean) => void) => {
      if (done) state.finishes.push(done);
      return target;
    },
    withSpring: (target: number) => {
      state.springs.push(target);
      return target;
    },
    withDecay: () => 0,
    ReduceMotion: { System: 'system', Never: 'never' },
  };
});
vi.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0 }) }));
vi.mock('../src/ui/primitives/use-system-reduced-motion', () => ({
  useSystemReducedMotion: () => state.reduced,
}));
vi.mock('../src/ui/primitives/resource-image', () => ({
  ResourceImage: () => <img alt="sample" />,
}));
vi.mock('../src/ui/shell/icons', () => ({ CloseIcon: () => null, ShareIcon: () => null }));
vi.mock('react-native-gesture-handler', async () => {
  const { View } = await import('./react-native-shim');
  const build = (name: string) => {
    const handlers: Record<string, Handler> = {};
    state.gestures[name] = handlers;
    const builder: Record<string, (...args: never[]) => unknown> = {};
    for (const key of ['maxPointers', 'maxDistance', 'numberOfTaps']) builder[key] = () => builder;
    for (const key of ['onStart', 'onUpdate', 'onEnd', 'onFinalize'])
      builder[key] = (fn: Handler) => {
        handlers[key] = fn;
        return builder;
      };
    return builder;
  };
  return {
    GestureHandlerRootView: View,
    GestureDetector: View,
    Gesture: {
      Pan: () => build('pan'),
      Pinch: () => build('pinch'),
      Tap: () => build('tap'),
      Simultaneous: (...items: unknown[]) => items,
      Exclusive: (...items: unknown[]) => items,
    },
  };
});
const { ImageViewer } = await import('../src/ui/chat/image-viewer');
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
const event = (translationY = 180): Event => ({
  translationX: 0,
  translationY,
  velocityX: 0,
  velocityY: 0,
  x: 0,
  y: 0,
});
const attachment = {
  key: 'image',
  name: 'sample.png',
  kind: 'image' as const,
  source: { uri: 'file:///sample.png' },
  available: true,
};
async function render(onClose = vi.fn()) {
  await act(async () =>
    root.render(
      <ImageViewer attachment={attachment as never} onClose={onClose} onShare={async () => {}} />,
    ),
  );
  state.modal.onShow();
  return onClose;
}
beforeEach(() => {
  container = document.createElement('div');
  root = createRoot(container);
  state.reduced = false;
  state.finishes = [];
  state.springs = [];
});
afterEach(async () => {
  await act(async () => root.unmount());
});
it.each([180, -180])(
  'keeps the image mounted until the exit finishes for drag %s, and closes once',
  async (distance) => {
    const close = await render();
    const pan = state.gestures.pan!;
    pan.onStart!(event(), true);
    pan.onUpdate!(event(distance), true);
    pan.onEnd!(event(distance), true);
    state.modal.onRequestClose();
    expect(state.modal.animationType).toBe('none');
    expect(container.querySelector('img')).not.toBeNull();
    expect(close).not.toHaveBeenCalled();
    expect(state.finishes).toHaveLength(1);
    expect(Math.sign(state.springs.at(-1)!)).toBe(Math.sign(distance));
    state.finishes[0]!(true);
    expect(close).toHaveBeenCalledTimes(1);
  },
);
it('does not commit a cancelled pan even beyond the distance threshold', async () => {
  const close = await render();
  const pan = state.gestures.pan!;
  pan.onStart!(event(), true);
  pan.onUpdate!(event(), true);
  pan.onEnd!(event(), false);
  pan.onFinalize!(event(), false);
  expect(close).not.toHaveBeenCalled();
  expect(state.finishes).toHaveLength(0);
  expect(state.springs.at(-1)).toBe(0);
});
it('fades in place instead of jumping offscreen with reduced motion', async () => {
  state.reduced = true;
  const close = await render();
  const pan = state.gestures.pan!;
  pan.onStart!(event(), true);
  pan.onUpdate!(event(), true);
  pan.onEnd!(event(), true);
  expect(state.springs).toEqual([]);
  expect(close).not.toHaveBeenCalled();
  state.finishes[0]!(true);
  expect(close).toHaveBeenCalledTimes(1);
});
it('routes native Back through the same completed fade and ignores interrupted completion', async () => {
  const close = await render();
  state.modal.onRequestClose();
  expect(close).not.toHaveBeenCalled();
  state.finishes[0]!(false);
  expect(close).not.toHaveBeenCalled();
});
