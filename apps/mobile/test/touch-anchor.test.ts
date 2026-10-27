import { expect, it } from 'vitest';

import { noteTouch, recentTouch } from '../src/ui/primitives/touch-anchor';

it('anchors a menu at the last touch only while that touch is recent', () => {
  noteTouch({ nativeEvent: { pageX: 40, pageY: 600 } });
  const now = Date.now();
  expect(recentTouch(now + 500)).toEqual({ x: 40, y: 600 });
  expect(recentTouch(now + 5000)).toBeUndefined();
});
