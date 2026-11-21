import fc from 'fast-check';
import { expect, it } from 'vitest';

import { parseStandingUsage } from '../src/memory.js';

const max = Number.MAX_SAFE_INTEGER;
const validUsage = fc
  .record({
    role: fc.constantFrom('soul', 'coreMemory'),
    chars: fc.integer({ min: 0, max }),
    limit: fc.integer({ min: 1, max }),
  })
  .map((entry) => ({
    ...entry,
    path: entry.role === 'soul' ? 'SOUL.md' : 'MEMORY.md',
  }));

it('preserves usage from zero through the safe-integer bounds', () => {
  const zero = { path: 'SOUL.md', role: 'soul', chars: 0, limit: 1 };
  const upperBound = { path: 'MEMORY.md', role: 'coreMemory', chars: max, limit: max };
  fc.assert(
    fc.property(fc.array(validUsage), (rows) => {
      const usage = [zero, ...rows, upperBound];
      expect(parseStandingUsage(usage)).toEqual(usage);
    }),
  );
});

it('drops invalid counts and limits while preserving their valid siblings', () => {
  fc.assert(
    fc.property(
      validUsage,
      validUsage,
      fc.integer({ max: -1 }),
      fc.integer({ max: 0 }),
      fc.integer({ min: 0 }).map((value) => value + 0.5),
      (first, last, negative, belowOne, fraction) => {
        expect(
          parseStandingUsage([
            first,
            { ...first, chars: negative },
            { ...first, chars: fraction },
            { ...first, chars: max + 1 },
            { ...last, limit: belowOne },
            { ...last, limit: fraction },
            { ...last, limit: max + 1 },
            last,
          ]),
        ).toEqual([first, last]);
      },
    ),
  );
});
