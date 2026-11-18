import { describe, expect, it } from 'vitest';

import { sourceFilesMatching, writesTables } from './source-files.js';

describe('Session ownership boundary (ADR-0035)', () => {
  it('writes Session ownership only through the ownership Registry', () => {
    expect(sourceFilesMatching(writesTables(['session_ownership']))).toEqual([
      'sessions/ownership.ts',
    ]);
  });
});
