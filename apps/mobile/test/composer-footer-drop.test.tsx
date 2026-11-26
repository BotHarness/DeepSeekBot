// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'android' }));

vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return {
    ...shim,
    Platform: {
      ...shim.Platform,
      get OS() {
        return platform.OS;
      },
    },
  };
});
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 24 }) }));
vi.mock('react-native-reanimated', () => ({ useAnimatedStyle: (fn: () => unknown) => fn() }));

const { composerDrop, footerShift, useOverlaySettle } =
  await import('../src/ui/primitives/composer-drop');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const island = 88;
const safe = 24;

it('drops the Composer into the freed tab band but keeps the safe-area gap', () => {
  expect(composerDrop(island, safe, false)).toEqual({ drop: 64, settled: 0 });
  expect(composerDrop(island, safe, true)).toEqual({ drop: 64, settled: 64 });
  expect(composerDrop(0, safe, true)).toEqual({ drop: 0, settled: 0 });
});

it('moves anything settled with the Composer by the same distance at every step of the hide and show', () => {
  for (const hiddenNow of [false, true]) {
    const { drop, settled } = composerDrop(island, safe, hiddenNow);
    for (const hidden of [0, 0.25, 0.5, 1]) {
      expect(settled + footerShift(drop, settled, hidden)).toBe(hidden * drop);
    }
  }
});

it('lowers the Android overlay with the settled Composer so the jump button stays inside its touch bounds', async () => {
  const seen: unknown[] = [];
  function Probe({ hiddenNow }: { hiddenNow: boolean }) {
    seen.push(useOverlaySettle(island, hiddenNow));
    return null;
  }
  const root = createRoot(document.createElement('div'));
  platform.OS = 'android';
  await act(async () => root.render(<Probe hiddenNow />));
  await act(async () => root.render(<Probe hiddenNow={false} />));
  platform.OS = 'ios';
  await act(async () => root.render(<Probe hiddenNow />));
  expect(seen).toEqual([{ marginBottom: -64 }, { marginBottom: -0 }, undefined]);
  await act(async () => root.unmount());
});
