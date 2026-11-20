import { describe, expect, it } from 'vitest';

import { singleLineBubble } from '../src/client/bubble-line.js';

describe('singleLineBubble', () => {
  it('treats one line of text plus padding as single-line', () => {
    expect(singleLineBubble(45, 24, 21)).toBe(true);
  });

  it('treats two lines as multi-line', () => {
    expect(singleLineBubble(66, 24, 21)).toBe(false);
  });

  it('ignores an unmeasured bubble', () => {
    expect(singleLineBubble(0, 24, 21)).toBe(false);
  });
});
