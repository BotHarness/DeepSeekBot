import fc from 'fast-check';
import { expect, it } from 'vitest';

import { dropIndex } from '../src/ui/primitives/tab-order-list-model';
import {
  defaultTabOrder,
  moveVisibleTab,
  parseTabOrder,
  visibleTabs,
  type TabSlot,
} from '../src/ui/shell/tab-slots';

const order = fc.shuffledSubarray([...defaultTabOrder], { minLength: 5, maxLength: 5 });

function expected(list: readonly TabSlot[], from: number, destination: number) {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(destination > from ? destination - 1 : destination, 0, moved!);
  return next;
}

it('moves exactly the dragged visible tab and keeps every tab once', () => {
  fc.assert(
    fc.property(
      order,
      fc.boolean(),
      fc.nat(4),
      fc.nat(5),
      (stored, sessionsTab, rawFrom, rawDestination) => {
        const current = parseTabOrder(stored);
        const visible = visibleTabs(current, sessionsTab);
        const from = rawFrom % visible.length;
        const destination = rawDestination % (visible.length + 1);
        const next = moveVisibleTab(current, sessionsTab, from, destination);
        expect([...next].sort()).toEqual([...defaultTabOrder].sort());
        expect(visibleTabs(next, sessionsTab)).toEqual(expected(visible, from, destination));
        if (!sessionsTab) expect(next.indexOf('sessions')).toBe(current.indexOf('sessions'));
      },
    ),
  );
});

it('drops a row where its center lands among rows of any height', () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 44, max: 200 }), { minLength: 2, maxLength: 5 }),
      fc.nat(4),
      fc.nat(5),
      (heights, rawFrom, rawTarget) => {
        const from = rawFrom % heights.length;
        const target = rawTarget % (heights.length + 1);
        const tops = heights.map((_, index) =>
          heights.slice(0, index).reduce((sum, height) => sum + height, 0),
        );
        const total = heights.reduce((sum, height) => sum + height, 0);
        const center = tops[from]! + heights[from]! / 2;
        const goal =
          target === heights.length ? total + 1 : tops[target]! + heights[target]! / 2 - 1;
        const landed = dropIndex(heights, from, goal - center);
        expect(landed).toBe(target);
        expect(dropIndex(heights, from, 0)).toBeGreaterThanOrEqual(from);
        expect(dropIndex(heights, from, 0)).toBeLessThanOrEqual(from + 1);
      },
    ),
  );
});
