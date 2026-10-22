// @vitest-environment jsdom
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  callbacks: {} as Record<string, (...args: any[]) => void>,
  reactions: new Set<() => void>(),
  state: 'undetermined',
}));
vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return {
    ...shim,
    View: (props: Record<string, unknown>) =>
      props['onAccessibilityTap']
        ? createElement(
            'button',
            {
              'aria-label': props['accessibilityLabel'],
              onClick: props['onAccessibilityTap'] as () => void,
            },
            props['children'] as ReactNode,
          )
        : shim.View(props),
  };
});
vi.mock('@expo/ui', () => ({ Host: ({ children }: { children: ReactNode }) => children }));
vi.mock('@expo/ui/swift-ui', () => ({
  Image: ({ systemName }: { systemName: string }) =>
    createElement('span', { 'data-symbol': systemName }),
}));
vi.mock('../src/ui/chat/composer-chrome', () => ({
  composerControl: () => 44,
  composerPrimary: () => ({ fill: 'black', ink: 'white' }),
}));
vi.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: any[]) => void, ...args: any[]) => fn(...args),
}));
vi.mock('react-native-reanimated', async () => {
  const { useEffect, useState } = await import('react');
  return {
    useSharedValue: (initial: unknown) =>
      useState(() => {
        let current = initial;
        return {
          get: () => current,
          set: (next: unknown) => {
            current = next;
            native.reactions.forEach((fn) => fn());
          },
        };
      })[0],
    useAnimatedReaction: (read: () => unknown, react: (next: unknown, previous: unknown) => void) =>
      useEffect(() => {
        let previous = read();
        const reaction = () => {
          const next = read();
          const old = previous;
          previous = next;
          react(next, old);
        };
        native.reactions.add(reaction);
        return () => {
          native.reactions.delete(reaction);
        };
      }, [read, react]),
  };
});
vi.mock('react-native-gesture-handler', () => ({
  GestureStateManager: { activate: () => manager.activate() },
  GestureDetector: ({ children }: { children: ReactNode }) => children,
  Gesture: {
    Manual: () => {
      const chain: Record<string, (fn: (...args: any[]) => void) => unknown> = {};
      for (const name of [
        'onTouchesDown',
        'onBegin',
        'onStart',
        'onTouchesMove',
        'onTouchesUp',
        'onTouchesCancelled',
        'onFinalize',
      ]) {
        chain[name] = (fn) => {
          native.callbacks[name] = fn;
          return chain;
        };
      }
      return chain;
    },
  },
}));
const { VoiceButton } = await import('../src/ui/chat/voice-button.ios');
const { t } = await import('../src/ui/strings');
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const start = vi.fn();
const stop = vi.fn();
const cancel = vi.fn();
const held = vi.fn();
let host: HTMLElement;
let root: ReturnType<typeof createRoot>;
let now = 1000;
function Harness() {
  const [active, setActive] = useState(false);
  return (
    <VoiceButton
      active={active}
      onStart={() => {
        start();
        setActive(true);
      }}
      onStop={() => {
        stop();
        setActive(false);
      }}
      onCancel={() => {
        cancel();
        setActive(false);
      }}
      onHeld={held}
    />
  );
}
const manager = {
  activate: () => {
    if (native.state !== 'began') return;
    native.state = 'active';
    native.callbacks['onStart']!();
  },
  end: () => finalize(true),
  fail: () => finalize(false),
};
function finalize(success: boolean) {
  if (native.state === 'finished') return;
  native.state = 'finished';
  native.callbacks['onFinalize']!({}, success);
}
const touch = (x: number, y: number, numberOfTouches = 1) => ({
  numberOfTouches,
  allTouches: [{ absoluteX: x, absoluteY: y }],
});
const down = async (numberOfTouches = 1) =>
  act(async () => {
    native.state = 'undetermined';
    native.callbacks['onTouchesDown']!(touch(200, 400, numberOfTouches), manager);
    if (native.state === 'undetermined') {
      native.state = 'began';
      native.callbacks['onBegin']?.({ handlerTag: 1 });
    }
  });
const move = async (x: number, y: number) =>
  act(async () => native.callbacks['onTouchesMove']!(touch(x, y), manager));
const up = async (duration: number) => {
  now += duration;
  await act(async () => native.callbacks['onTouchesUp']!({}, manager));
};

beforeEach(async () => {
  vi.clearAllMocks();
  native.reactions.clear();
  native.state = 'undetermined';
  now = 1000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
});

it('starts only after iOS reports BEGAN following the initial touch event', async () => {
  await act(async () => native.callbacks['onTouchesDown']!(touch(200, 400), manager));
  expect(start).not.toHaveBeenCalled();
  await act(async () => {
    native.state = 'began';
    native.callbacks['onBegin']?.({ handlerTag: 1 });
  });
  expect(start).toHaveBeenCalledOnce();
  expect(held).toHaveBeenLastCalledWith(true);
});
it('rejects an initial two-finger touch without starting speech', async () => {
  await down(2);
  expect(start).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
});
it('quick tap locks listening and the next tap stops once', async () => {
  await down();
  await up(100);
  expect(start).toHaveBeenCalledOnce();
  expect(stop).not.toHaveBeenCalled();
  expect(host.querySelector('[data-symbol="stop.fill"]')).not.toBeNull();
  await down();
  await up(100);
  expect(stop).toHaveBeenCalledOnce();
});
it('holding and releasing stops once without discarding speech', async () => {
  await down();
  await up(300);
  expect(start).toHaveBeenCalledOnce();
  expect(stop).toHaveBeenCalledOnce();
  expect(cancel).not.toHaveBeenCalled();
  expect(held.mock.calls).toEqual([[true], [false]]);
});
it('left drag cancels immediately and release cannot stop or start again', async () => {
  await down();
  await move(120, 400);
  await move(100, 300);
  await up(900);
  expect(cancel).toHaveBeenCalledOnce();
  expect(stop).not.toHaveBeenCalled();
  expect(start).toHaveBeenCalledOnce();
});
it('upward drag locks immediately and release keeps listening', async () => {
  await down();
  await move(200, 340);
  await move(100, 340);
  await up(900);
  expect(cancel).not.toHaveBeenCalled();
  expect(stop).not.toHaveBeenCalled();
  expect(host.querySelector('[data-symbol="stop.fill"]')).not.toBeNull();
});
it('movement below the cancel and lock thresholds keeps the held gesture', async () => {
  await down();
  await move(121, 341);
  expect(held.mock.calls).toEqual([[true]]);
  await up(600);
  expect(stop).toHaveBeenCalledOnce();
});
it('system cancellation cancels an unlocked hold exactly once', async () => {
  await down();
  await act(async () => native.callbacks['onTouchesCancelled']!({}, manager));
  await up(900);
  expect(cancel).toHaveBeenCalledOnce();
  expect(stop).not.toHaveBeenCalled();
});
it('a second finger interrupts an unlocked hold rather than restarting it', async () => {
  await down();
  await act(async () => native.callbacks['onTouchesDown']!(touch(220, 400, 2), manager));
  expect(start).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalledOnce();
});
it('system cancellation after explicit lock leaves the recording active', async () => {
  await down();
  await move(200, 340);
  await act(async () => native.callbacks['onTouchesCancelled']!({}, manager));
  expect(cancel).not.toHaveBeenCalled();
  expect(stop).not.toHaveBeenCalled();
});
it('accessibility activation starts and stops without a drag', async () => {
  await act(async () =>
    host.querySelector<HTMLButtonElement>(`[aria-label="${t.dictate}"]`)!.click(),
  );
  expect(start).toHaveBeenCalledOnce();
  await act(async () =>
    host.querySelector<HTMLButtonElement>(`[aria-label="${t.stopDictation}"]`)!.click(),
  );
  expect(stop).toHaveBeenCalledOnce();
});
