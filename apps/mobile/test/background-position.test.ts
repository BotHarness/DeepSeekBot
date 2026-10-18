import { expect, it } from 'vitest';
import { backgroundOverflow, dragBackground } from '../src/ui/chat/background-position';

it('moves only cropped axes, proportionally and within the normalized crop limits', () => {
  const overflow = backgroundOverflow(
    { width: 900, height: 1600 },
    { width: 400, height: 300 },
    'cover',
  );
  expect(overflow.x).toBe(0);
  expect(overflow.y).toBeCloseTo(411.111);
  expect(dragBackground({ x: 0.5, y: 0.5 }, overflow, { x: 500, y: 1000 })).toEqual({
    x: 0.5,
    y: 0,
  });
  expect(dragBackground({ x: 0.5, y: 0.5 }, overflow, { x: -500, y: -1000 })).toEqual({
    x: 0.5,
    y: 1,
  });
  expect(
    backgroundOverflow({ width: 900, height: 1600 }, { width: 400, height: 300 }, 'contain'),
  ).toEqual({ x: 0, y: 0 });
});
