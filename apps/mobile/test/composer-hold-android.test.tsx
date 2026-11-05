// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  enabled: true,
  start: () => {},
  finish: () => {},
}));
vi.mock('react-native', async () => import('./react-native-shim'));
vi.mock('react-native-gesture-handler', () => ({
  Gesture: {
    LongPress: () => {
      const gesture = {
        enabled: (value: boolean) => {
          native.enabled = value;
          return gesture;
        },
        minDuration: () => gesture,
        runOnJS: () => gesture,
        onStart: (fn: () => void) => {
          native.start = fn;
          return gesture;
        },
        onFinalize: (fn: () => void) => {
          native.finish = fn;
          return gesture;
        },
      };
      return gesture;
    },
    Native: () => ({}),
    Exclusive: (...gestures: unknown[]) => gestures,
  },
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));
const { ComposerHold } = await import('../src/ui/chat/composer-hold.android');
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const container = document.createElement('div');
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

it('starts only after the native hold recognizes, stops once on release, and never sends', async () => {
  const start = vi.fn();
  const stop = vi.fn();
  root = createRoot(container);
  await act(() =>
    root!.render(
      <ComposerHold enabled onStart={start} onStop={stop}>
        <textarea defaultValue="Draft" />
      </ComposerHold>,
    ),
  );
  const input = container.querySelector('textarea');
  await act(() => native.finish());
  expect(start).not.toHaveBeenCalled();
  expect(stop).not.toHaveBeenCalled();
  await act(() => native.start());
  expect(start).toHaveBeenCalledOnce();
  await act(() => native.finish());
  await act(() => native.finish());
  expect(stop).toHaveBeenCalledOnce();
  expect(container.querySelector('textarea')).toBe(input);
  expect(input?.value).toBe('Draft');
});

it('leaves native text editing available when dictation is disabled', async () => {
  const start = vi.fn();
  const stop = vi.fn();
  root = createRoot(container);
  await act(() =>
    root!.render(
      <ComposerHold enabled={false} onStart={start} onStop={stop}>
        <textarea />
      </ComposerHold>,
    ),
  );
  expect(native.enabled).toBe(false);
  await act(() => native.start());
  await act(() => native.finish());
  expect(start).not.toHaveBeenCalled();
  expect(stop).not.toHaveBeenCalled();
});

it('stops a held recording when the input leaves the screen', async () => {
  const stop = vi.fn();
  root = createRoot(container);
  await act(() =>
    root!.render(
      <ComposerHold enabled onStart={() => {}} onStop={stop}>
        <textarea />
      </ComposerHold>,
    ),
  );
  await act(() => native.start());
  await act(() => root!.unmount());
  root = undefined;
  expect(stop).toHaveBeenCalledOnce();
});
