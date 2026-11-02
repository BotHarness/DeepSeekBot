import { expect, it } from 'vitest';

import { androidSettings } from '../src/ui/design/tokens';
import { segmentCorners } from '../src/ui/design/segment-corners';

it('rounds the outer corners of a segmented list and keeps inner corners soft', () => {
  expect(androidSettings.listRadius).toBe(16);
  expect(androidSettings.innerRadius).toBe(4);
  expect(androidSettings.segmentGap).toBe(2);
  expect(segmentCorners(true, false)).toEqual({
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  });
  expect(segmentCorners(false, false).borderTopLeftRadius).toBe(4);
  expect(segmentCorners(false, true).borderBottomRightRadius).toBe(16);
  expect(new Set(Object.values(segmentCorners(true, true)))).toEqual(new Set([16]));
});
