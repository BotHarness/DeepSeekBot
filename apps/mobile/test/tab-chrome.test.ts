import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Easing: { bezier: (...points: number[]) => ({ points }) },
  AccessibilityInfo: {},
  AppState: {},
}));
vi.mock('react-native-reanimated', async () => import('./reanimated-shim'));
vi.mock('expo-router', () => ({ useFocusEffect: () => undefined }));

const { chromeScroll, chromeShown } = await import('../src/ui/shell/tab-chrome');
const { tabSlotCenter } = await import('../src/ui/shell/tab-name-pill');
const { tabTransition } = await import('../src/ui/shell/tab-transition');
const { scrollChrome, tabChrome } = await import('../src/ui/design/tokens');

const scroll = (offsets: number[], end = 2000) =>
  offsets.reduce((state, offset) => chromeScroll(state, offset, end), chromeShown);

describe('the Chats chrome on scroll', () => {
  it('hides once the list moves down past the threshold', () => {
    expect(scroll([100, 100 + scrollChrome.threshold]).hidden).toBe(false);
    expect(scroll([100, 101 + scrollChrome.threshold]).hidden).toBe(true);
  });

  it('comes back on scrolling up past the threshold', () => {
    const hidden = scroll([100, 200]);
    expect(hidden.hidden).toBe(true);
    expect(chromeScroll(hidden, 195, 2000).hidden).toBe(true);
    expect(chromeScroll(hidden, 200 - scrollChrome.threshold - 1, 2000).hidden).toBe(false);
  });

  it('always shows at the top', () => {
    expect(scroll([100, 300, scrollChrome.top]).hidden).toBe(false);
  });

  it('ignores the bounce past the end of the list', () => {
    const hidden = scroll([100, 400], 500);
    expect(chromeScroll(hidden, 560, 500).hidden).toBe(true);
    expect(chromeScroll(chromeScroll(hidden, 560, 500), 500, 500).hidden).toBe(true);
  });

  it('does not jump on the first event after being shown mid-list', () => {
    expect(chromeScroll(chromeShown, 900, 2000).hidden).toBe(false);
  });
});

describe('the tab name pill', () => {
  it('centres over each equal tab slot', () => {
    const slots = { left: 20, width: 340, gap: 8, count: 3 };
    const slot = (340 - 16) / 3;
    expect(tabSlotCenter(slots, 0)).toBe(20 + slot / 2);
    expect(tabSlotCenter(slots, 2)).toBe(20 + 2 * (slot + 8) + slot / 2);
    expect(tabSlotCenter({ left: 0, width: 400, gap: 0, count: 4 }, 1)).toBe(150);
  });
});

describe('tab switches', () => {
  it('cross-fade on iOS and fade through on Android', () => {
    const ios = tabTransition('ios', false);
    expect(ios.animation).toBe('fade');
    expect(ios.transitionSpec).toMatchObject({ config: { duration: tabChrome.tabFade } });
    expect(ios.sceneStyleInterpolator).toBeUndefined();
    const android = tabTransition('android', false);
    expect(android.transitionSpec).toMatchObject({ config: { duration: tabChrome.fadeThrough } });
    expect(android.sceneStyleInterpolator).toBeTypeOf('function');
  });

  it('fades the outgoing scene out before the incoming one fades in on Android', () => {
    const calls: { inputRange: number[]; outputRange: number[] }[] = [];
    const progress = {
      interpolate: (config: { inputRange: number[]; outputRange: number[] }) => {
        calls.push(config);
        return config;
      },
    };
    tabTransition('android', false).sceneStyleInterpolator!({
      current: { progress: progress as never },
    });
    expect(calls[0]).toEqual({ inputRange: [-1, -0.5, 0, 0.5, 1], outputRange: [0, 0, 1, 0, 0] });
    expect(calls[1]?.outputRange[2]).toBe(1);
    expect(calls[1]?.outputRange[1]).toBe(tabChrome.fadeThroughScale);
  });

  it('switch instantly with Reduce Motion', () => {
    expect(tabTransition('ios', true)).toEqual({ animation: 'none' });
    expect(tabTransition('android', true)).toEqual({ animation: 'none' });
  });
});
