import { describe, expect, it } from 'vitest';
import { emptyPad, updatePad } from '../src/ui/chat/computer-trackpad-gestures';

const one = [{ id: 1, x: 40, y: 40 }];
const two = [...one, { id: 2, x: 80, y: 40 }];
describe('independent Computer touchpad', () => {
  it('uses one-finger and staggered two-finger taps without an extra left click', () => {
    const first = updatePad(emptyPad(), 'down', one, 0);
    expect(updatePad(first.state, 'up', [], 100).click).toBe('left');
    const second = updatePad(first.state, 'down', two, 20);
    const lift = updatePad(second.state, 'up', one, 100);
    expect(lift.click).toBeUndefined();
    expect(updatePad(lift.state, 'up', [], 120).click).toBe('right');
  });
  it('moves the cursor only with one finger and never clicks after a drag', () => {
    const down = updatePad(emptyPad(), 'down', one, 0);
    const drag = updatePad(down.state, 'move', [{ id: 1, x: 60, y: 45 }], 30);
    expect(drag.move).toEqual({ x: 20, y: 5 });
    expect(drag.scroll).toBeUndefined();
    expect(updatePad(drag.state, 'up', [], 100).click).toBeUndefined();
  });
  it('scrolls content naturally on both axes and preserves partial steps', () => {
    const down = updatePad(emptyPad(), 'down', two, 0);
    const move = updatePad(
      down.state,
      'move',
      two.map((t) => ({ ...t, x: t.x + 20, y: t.y - 35 })),
      30,
    );
    expect(move.scroll).toEqual({ x: -1, y: 2 });
    expect(move.move).toBeUndefined();
    const more = updatePad(
      move.state,
      'move',
      two.map((t) => ({ ...t, x: t.x + 32, y: t.y - 48 })),
      40,
    );
    expect(more.scroll).toEqual({ x: -1, y: 1 });
    expect(updatePad(more.state, 'up', [], 100).click).toBeUndefined();
  });
  it('does not move the pointer when a second finger joins or leaves a scroll', () => {
    const down = updatePad(emptyPad(), 'down', one, 0);
    const joined = updatePad(down.state, 'down', two, 20);
    expect(joined.move).toBeUndefined();
    const lift = updatePad(joined.state, 'up', one, 40);
    const tail = updatePad(lift.state, 'move', [{ id: 1, x: 90, y: 80 }], 60);
    expect(tail.move).toBeUndefined();
    expect(tail.scroll).toBeUndefined();
    expect(updatePad(tail.state, 'up', [], 100).click).toBeUndefined();
  });
  it('uses lifted fingers final positions to reject quick swipes as clicks', () => {
    const down = updatePad(emptyPad(), 'down', one, 0);
    const move = updatePad(down.state, 'move', [{ id: 1, x: 49, y: 40 }], 50);
    expect(updatePad(move.state, 'up', [], 100, [{ id: 1, x: 55, y: 40 }]).click).toBeUndefined();
    const pair = updatePad(emptyPad(), 'down', two, 0);
    expect(
      updatePad(
        pair.state,
        'up',
        [],
        100,
        two.map((t) => ({ ...t, y: 70 })),
      ).click,
    ).toBeUndefined();
  });
  it('ignores unsupported multi-finger gestures, cancellation and long holds', () => {
    const down = updatePad(
      emptyPad(),
      'down',
      [...two, { id: 3, x: 100, y: 40 }, { id: 4, x: 120, y: 40 }],
      0,
    );
    expect(updatePad(down.state, 'up', [], 100).click).toBeUndefined();
    const tap = updatePad(emptyPad(), 'down', one, 0);
    const cancelled = updatePad(tap.state, 'cancel', [], 20);
    expect(cancelled.state).toEqual(emptyPad());
    expect(cancelled.click).toBeUndefined();
    expect(updatePad(tap.state, 'up', [], 800).click).toBeUndefined();
  });
});
