import { expect, it } from 'vitest';

import { floatingToolbar } from '../src/ui/design/tokens';
import { toolbarGap } from '../src/ui/shell/navigation-destination';

const span = (width: number, count: number) =>
  floatingToolbar.item * count +
  toolbarGap(width, count) * (count - 1) +
  2 * (floatingToolbar.inset + floatingToolbar.padding);

it('spaces Android tab items 8dp apart when the screen has room', () => {
  expect(toolbarGap(411, 5)).toBe(8);
  expect(toolbarGap(360, 5)).toBe(8);
  expect(toolbarGap(340, 5)).toBe(5);
});

it('keeps five full-size tab items on a 320dp screen by closing the gap', () => {
  expect(toolbarGap(320, 5)).toBe(0);
  for (const width of [320, 330, 340, 352, 360, 411])
    expect(span(width, 5)).toBeLessThanOrEqual(width);
});

it('never spaces a single tab item', () => {
  expect(toolbarGap(411, 1)).toBe(0);
});
