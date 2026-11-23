import { expect, it } from 'vitest';
import {
  iosTabIslandHeight,
  tabIslandLayout,
  tabLabelFontSize,
  tabLabelWidth,
} from '../src/ui/shell/tab-island-layout';
import { navigationBar } from '../src/ui/design/tokens';

const en = ['Chats', 'Activity', 'Sessions', 'Settings'];
const zh = ['聊天', '动态', '会话', '设置'];
const iphone = 402;
const sizes = { large: 1, xxxLarge: 1.353, ax1: 1.786, ax2: 2.143, ax5: 3.571 };

it('maps every iOS content size category to the caption2 point size', () => {
  expect(tabLabelFontSize('ios', sizes.large)).toBe(11);
  expect(tabLabelFontSize('ios', sizes.xxxLarge)).toBe(17);
  expect(tabLabelFontSize('ios', sizes.ax2)).toBe(24);
  expect(tabLabelFontSize('ios', sizes.ax5)).toBe(40);
  expect(tabLabelFontSize('android', 2)).toBe(24);
});

it('estimates SF Pro label widths within a few percent of measured advances', () => {
  for (const [label, size, measured] of [
    ['Sessions', 11, 46.6],
    ['Sessions', 17, 67.8],
    ['Settings', 24, 85.4],
    ['会话', 40, 75.6],
  ] as const) {
    const estimate = tabLabelWidth(label, size);
    expect(Math.abs(estimate - measured) / measured).toBeLessThan(0.04);
  }
});

it('shows one shared label size at default text and moves creation out only when that makes labels fit', () => {
  for (const labels of [en, zh, en.filter((label) => label !== 'Sessions')])
    expect(tabIslandLayout({ os: 'ios', labels, width: iphone, fontScale: sizes.large })).toEqual({
      labels: true,
      separateCreation: false,
      labelSize: 11,
    });
  expect(
    tabIslandLayout({ os: 'ios', labels: en, width: iphone, fontScale: sizes.xxxLarge }),
  ).toEqual({ labels: true, separateCreation: true, labelSize: 17 });
  expect(
    tabIslandLayout({ os: 'ios', labels: zh, width: iphone, fontScale: sizes.xxxLarge }),
  ).toEqual({ labels: true, separateCreation: false, labelSize: 17 });
});

it('hides every label together when the longest localized label cannot fit', () => {
  for (const fontScale of [sizes.ax2, sizes.ax5]) {
    const layout = tabIslandLayout({ os: 'ios', labels: en, width: iphone, fontScale });
    expect(layout.labels).toBe(false);
    expect(layout.separateCreation).toBe(false);
    expect(iosTabIslandHeight(layout)).toBe(navigationBar.height);
  }
  const chinese = tabIslandLayout({ os: 'ios', labels: zh, width: iphone, fontScale: sizes.ax5 });
  expect(chinese.labels).toBe(true);
  expect(iosTabIslandHeight(chinese)).toBeGreaterThan(navigationBar.height);
  expect(
    tabIslandLayout({
      os: 'ios',
      labels: [...zh.slice(0, 3), 'Settings'],
      width: iphone,
      fontScale: sizes.ax5,
    }).labels,
  ).toBe(false);
});

it('applies the same rule to the Android navigation bar at its own label metrics', () => {
  expect(tabIslandLayout({ os: 'android', labels: en, width: 412, fontScale: 1 }).labels).toBe(
    true,
  );
  expect(tabIslandLayout({ os: 'android', labels: en, width: 412, fontScale: 2 })).toEqual({
    labels: false,
    separateCreation: false,
    labelSize: 24,
  });
  expect(tabIslandLayout({ os: 'android', labels: zh, width: 412, fontScale: 2 }).labels).toBe(
    true,
  );
});
