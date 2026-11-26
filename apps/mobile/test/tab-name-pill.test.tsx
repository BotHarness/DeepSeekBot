// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  reduced: false,
  writes: [] as unknown[],
}));

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('../src/ui/primitives/use-system-reduced-motion', () => ({
  useSystemReducedMotion: () => state.reduced,
}));
vi.mock('react-native-reanimated', async () => {
  const shim = await import('./reanimated-shim');
  const { View } = await import('./react-native-shim');
  return {
    ...shim,
    default: { ...shim.default, View },
    ReduceMotion: { System: 'system', Never: 'never' },
    useSharedValue: (initial: unknown) => {
      let value = initial;
      return {
        get value() {
          return value;
        },
        set value(next: unknown) {
          value = next;
          state.writes.push(next);
        },
      };
    },
    withTiming: (to: number, config: { duration: number; reduceMotion?: string }) => ({
      timing: to,
      ...config,
    }),
    withDelay: (delay: number, animation: unknown, reduceMotion?: string) => ({
      delay,
      animation,
      reduceMotion,
    }),
    withSequence: (...steps: unknown[]) => ({ sequence: steps }),
  };
});

const { TabNamePill } = await import('../src/ui/shell/tab-name-pill');
const { tabChrome } = await import('../src/ui/design/tokens');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('the tab name pill', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    state.writes.length = 0;
    container = document.createElement('div');
  });
  afterEach(() => {
    container.remove();
  });

  const render = async () => {
    const root = createRoot(container);
    await act(async () =>
      root.render(<TabNamePill label="Activity" center={150} screenWidth={400} bottom={60} />),
    );
    await act(async () => root.unmount());
  };

  it('fades in, holds and fades out', async () => {
    await render();
    expect(state.writes).toEqual([
      {
        sequence: [
          { timing: 1, duration: tabChrome.pillFade },
          {
            delay: tabChrome.pillHold,
            animation: { timing: 0, duration: tabChrome.pillFade },
            reduceMotion: undefined,
          },
        ],
      },
    ]);
  });

  it('with Reduce Motion appears at once and still holds before it disappears', async () => {
    state.reduced = true;
    await render();
    expect(state.writes).toEqual([
      1,
      {
        delay: tabChrome.pillHold,
        animation: { timing: 0, duration: 0, reduceMotion: 'never' },
        reduceMotion: 'never',
      },
    ]);
    state.reduced = false;
  });
});
