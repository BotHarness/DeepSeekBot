import { describe, expect, it } from 'vitest';

import { groupSpan, speakerLift } from '../src/ui/chat/speaker-span';

describe('sticky speaker avatar', () => {
  it('measures a group from its first bubble top to its last row', () => {
    const layouts = new Map([
      ['a', { height: 80, bubbleTop: 30 }],
      ['b', { height: 50, bubbleTop: 4 }],
      ['c', { height: 70, bubbleTop: 4 }],
    ]);
    expect(groupSpan(['a', 'b', 'c'], layouts)).toBe(80 + 50 - 30);
    expect(groupSpan(['c'], layouts)).toBe(-4);
    expect(groupSpan([], layouts)).toBe(0);
    expect(groupSpan(['x', 'y'], new Map())).toBe(0);
  });

  it('rests at the last bubble, rides the bottom edge, and stops at the first bubble', () => {
    expect(speakerLift({ bubbleBottom: 500, floor: 700, rest: 40, span: 100 })).toBe(0);
    expect(speakerLift({ bubbleBottom: 760, floor: 700, rest: 40, span: 100 })).toBe(60);
    expect(speakerLift({ bubbleBottom: 900, floor: 700, rest: 40, span: 100 })).toBe(140);
    expect(speakerLift({ bubbleBottom: 900, floor: 700, rest: 40, span: -60 })).toBe(0);
  });
});
