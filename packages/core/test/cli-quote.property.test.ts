import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cliQuote } from '../src/bots/cli-live.js';

describe('deepseekbot send --quote', () => {
  it('reads a value without a separator as a whole-message quote', () => {
    fc.assert(
      fc.property(
        fc.string().filter((value) => !value.includes('::')),
        (value) => {
          expect(cliQuote(value)).toEqual({ messageId: value.trim() });
        },
      ),
    );
  });

  it('splits at the first separator and keeps the excerpt as typed', () => {
    fc.assert(
      fc.property(
        fc.string().filter((id) => !id.includes('::') && !id.endsWith(':')),
        fc.string(),
        (id, excerpt) => {
          expect(cliQuote(`${id}::${excerpt}`)).toEqual({ messageId: id.trim(), text: excerpt });
        },
      ),
    );
  });
});
