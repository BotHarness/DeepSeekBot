import { describe, expect, it } from 'vitest';
import { parseBotCompactResult } from '../src/client/bridge.js';

describe('manual compaction result', () => {
  it('reads the outcome and token counts the Host returns', () => {
    expect(
      parseBotCompactResult({ outcome: 'compacted', tokensBefore: 471_070, tokensAfter: 27_782 }),
    ).toEqual({ outcome: 'compacted', tokensBefore: 471_070, tokensAfter: 27_782 });
    expect(parseBotCompactResult({ outcome: 'not-loaded', tokensBefore: null })).toEqual({
      outcome: 'not-loaded',
      tokensBefore: null,
      tokensAfter: null,
    });
  });

  it('rejects an unknown outcome', () => {
    expect(() => parseBotCompactResult({ outcome: 'done' })).toThrow('invalid compaction result');
  });
});
