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
const { scrollChrome } = await import('../src/ui/design/tokens');

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
