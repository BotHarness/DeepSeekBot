import { describe, expect, it } from 'vitest';
import {
  isFix,
  isTest,
  outcomes,
  parseChanges,
  proof,
  revertPlan,
  waiver,
} from '../check-regression-proof.mjs';

describe('regression proof for fix PRs', () => {
  it('recognises conventional fix titles only', () => {
    expect(isFix('fix(client): keep the composer focused')).toBe(true);
    expect(isFix('fix!: drop the legacy route')).toBe(true);
    expect(isFix('Fix: typo')).toBe(true);
    expect(isFix('feat(client): add a picker')).toBe(false);
    expect(isFix('fixture: refresh data')).toBe(false);
  });

  it('reads a waiver only when it gives a reason', () => {
    expect(waiver('Closes #1\nNo regression test: CSS-only spacing, shown in screenshots')).toBe(
      'CSS-only spacing, shown in screenshots',
    );
    expect(waiver('No regression test:')).toBeUndefined();
    expect(waiver('')).toBeUndefined();
  });

  it('matches the test files vitest runs', () => {
    expect(isTest('packages/core/test/runtime/bot.test.ts')).toBe(true);
    expect(isTest('apps/mobile/test/composer.test.tsx')).toBe(true);
    expect(isTest('scripts/test/ci-plan.test.mjs')).toBe(true);
    expect(isTest('packages/core/src/bot.ts')).toBe(false);
    expect(isTest('packages/core/test/support/fixture.ts')).toBe(false);
  });

  it('removes the fix but keeps tests, fixtures, manifests and fragments', () => {
    const changes = parseChanges(
      [
        'M',
        'packages/core/src/bot.ts',
        'A',
        'packages/core/src/new.ts',
        'D',
        'packages/core/src/old.ts',
        'R087',
        'packages/core/src/a.ts',
        'packages/core/src/b.ts',
        'M',
        'packages/core/test/bot.test.ts',
        'A',
        'packages/core/test/support/fixture.ts',
        'M',
        'packages/core/package.json',
        'A',
        'changes/1-fix.md',
        '',
      ].join('\0'),
    );
    expect(revertPlan(changes)).toEqual({
      fromBase: ['packages/core/src/bot.ts', 'packages/core/src/old.ts', 'packages/core/src/a.ts'],
      remove: ['packages/core/src/new.ts', 'packages/core/src/b.ts'],
    });
  });

  it('counts only a test that passes with the fix and fails without it', () => {
    const report = (statuses) => ({
      testResults: [
        {
          name: '/repo/packages/core/test/bot.test.ts',
          assertionResults: Object.entries(statuses).map(([fullName, status]) => ({
            fullName,
            status,
          })),
        },
      ],
    });
    const head = outcomes(
      report({ 'keeps order': 'passed', 'still works': 'passed', 'new case': 'passed' }),
      '/repo',
    );
    const base = outcomes(report({ 'keeps order': 'failed', 'still works': 'passed' }), '/repo');
    expect(proof(head, base)).toEqual(['packages/core/test/bot.test.ts > keeps order']);
    expect(proof(head, new Map())).toEqual([]);
  });
});
