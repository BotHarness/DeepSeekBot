import { describe, expect, it } from 'vitest';

import { durationsDocument, loadDurations, parseVitestLog } from '../ci-test-durations.mjs';

describe('recorded test durations', () => {
  it('reads per-file durations from a Vitest log, ignoring timestamps and colour codes', () => {
    const log = [
      '2026-11-24T07:34:19.1Z  ✓  default  packages/core/test/a.test.ts (72 tests) 253948ms',
      '2026-11-24T07:34:20.1Z \u001b[32m✓\u001b[39m  default  scripts/test/b.test.mjs (1 test) 12ms',
      '2026-11-24T07:34:21.1Z  ×  default  apps/mobile/test/c.test.tsx (3 tests | 1 failed) 2400ms',
      '2026-11-24T07:34:22.1Z  ✓ some unrelated line 99ms',
    ].join('\n');
    expect([...parseVitestLog(log)]).toEqual([
      ['packages/core/test/a.test.ts', 253948],
      ['scripts/test/b.test.mjs', 12],
      ['apps/mobile/test/c.test.tsx', 2400],
    ]);
  });

  it('keeps only slow files, sorted and rounded to tenths of a second', () => {
    const durations = new Map([
      ['z.test.ts', 2449],
      ['a.test.ts', 1000],
      ['fast.test.ts', 999],
    ]);
    expect(durationsDocument(durations, 'run 1')).toEqual({
      source: 'run 1',
      seconds: { 'a.test.ts': 1, 'z.test.ts': 2.4 },
    });
  });

  it('loads the checked-in durations and falls back to none', () => {
    expect(Object.keys(loadDurations()).length).toBeGreaterThan(0);
    expect(loadDurations('/nonexistent-root')).toEqual({});
  });
});
