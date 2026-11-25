import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
vi.mock('react-native-keyboard-controller', () => ({ useKeyboardState: () => false }));
vi.mock('react-native-reanimated', () => ({
  useSharedValue: (value: number) => ({ value }),
  withTiming: (value: number) => value,
  useAnimatedReaction: () => undefined,
  useAnimatedScrollHandler: () => undefined,
  runOnJS: (fn: unknown) => fn,
}));

const { historyDistance } = await import('../src/ui/chat/history-chrome');
const { chromeScroll, chromeShown } = await import('../src/ui/shell/tab-chrome');

const frame = { contentSize: { height: 3000 }, layoutMeasurement: { height: 800 } };

it('measures the distance from the latest message on the top-down iOS list', () => {
  expect(historyDistance({ ...frame, contentOffset: { y: 2200 } }, false)).toEqual({
    distance: 0,
    end: 2200,
  });
  expect(historyDistance({ ...frame, contentOffset: { y: 1700 } }, false).distance).toBe(500);
  expect(
    historyDistance(
      { ...frame, contentOffset: { y: 2200 }, contentInset: { top: 100, bottom: 60 } },
      false,
    ),
  ).toEqual({ distance: 60, end: 2360 });
});

it('measures the distance from the latest message on the inverted Android list', () => {
  expect(historyDistance({ ...frame, contentOffset: { y: 0 } }, true).distance).toBe(0);
  expect(historyDistance({ ...frame, contentOffset: { y: 640 } }, true).distance).toBe(640);
});

it('clamps rubber-band overscroll at both edges', () => {
  expect(historyDistance({ ...frame, contentOffset: { y: -40 } }, true).distance).toBe(0);
  expect(historyDistance({ ...frame, contentOffset: { y: 2300 } }, false).distance).toBe(0);
  expect(historyDistance({ ...frame, contentOffset: { y: -50 } }, false).distance).toBe(2200);
});

function drive(offsets: number[], inverted: boolean) {
  return offsets.reduce((state, y) => {
    const { distance, end } = historyDistance({ ...frame, contentOffset: { y } }, inverted);
    return chromeScroll(state, distance, end);
  }, chromeShown).hidden;
}

it('hides while reading toward older messages and returns toward the latest on both lists', () => {
  expect(drive([2200, 2190, 2100, 2000], false)).toBe(true);
  expect(drive([2200, 2000, 2010, 2060], false)).toBe(false);
  expect(drive([0, 10, 120, 300], true)).toBe(true);
  expect(drive([0, 300, 290, 240], true)).toBe(false);
});

it('ignores jitter below the threshold and shows again at the latest message', () => {
  expect(drive([2200, 2000, 2005, 1998], false)).toBe(true);
  expect(drive([0, 300, 1], true)).toBe(false);
});
