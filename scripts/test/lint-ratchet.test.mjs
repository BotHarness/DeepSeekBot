import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  compare,
  countFindings,
  lowered,
  malformed,
  raised,
  readGuardrails,
  validateGuardrails,
} from '../lint-ratchet.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixtures = join(root, 'scripts', 'fixtures', 'lint-ratchet');
const rule = 'typescript/no-floating-promises';
const guardrail = {
  id: 'floating-promise',
  layer: 'L2 lint',
  rule,
  source: '#4297',
  fix: 'await it',
  check: 'scripts/lint-ratchet.mjs',
};
const finding = (filename, line = 1) => ({
  code: 'typescript(no-floating-promises)',
  severity: 'error',
  filename,
  message: 'Promises must be awaited',
  labels: [{ span: { line, column: 5 } }],
});

function lintFixture(name) {
  const bin = join(
    dirname(createRequire(import.meta.url).resolve('oxlint/package.json')),
    'bin',
    'oxlint',
  );
  const result = spawnSync(
    process.execPath,
    [bin, '--type-aware', '--format', 'json', '-c', join(fixtures, 'oxlintrc.json'), name],
    { cwd: fixtures, encoding: 'utf8', shell: false, windowsHide: true },
  );
  const report = JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
  return countFindings(report.diagnostics, [guardrail]).counts;
}

describe('lint ratchet', () => {
  it('fails a new finding with the guardrail source, fix and location', () => {
    const { counts, spots } = countFindings([finding('a.ts', 7)], [guardrail]);
    const { errors } = compare({ counts, spots, baseline: {}, guardrails: [guardrail] });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('[floating-promise, #4297] Fix: await it');
    expect(errors[0]).toContain('at a.ts:7:5');
  });

  it('tolerates baselined findings and only checks the given files in path mode', () => {
    const { counts } = countFindings([finding('a.ts'), finding('b.ts')], [guardrail]);
    const baseline = { [rule]: { 'a.ts': 1, 'c.ts': 2 } };
    const files = new Set(['a.ts']);
    expect(compare({ counts, baseline, guardrails: [guardrail], files })).toEqual({
      errors: [],
      stale: [],
    });
  });

  it('asks to lower a baseline the code has outgrown, and --update never raises it', () => {
    const { counts } = countFindings([finding('a.ts'), finding('d.ts')], [guardrail]);
    const baseline = { [rule]: { 'a.ts': 3, 'c.ts': 1 } };
    const { stale } = compare({ counts, baseline, guardrails: [guardrail] });
    expect(stale).toEqual([`a.ts: ${rule} baseline 3, now 1`, `c.ts: ${rule} baseline 1, now 0`]);
    expect(lowered(baseline, counts, [guardrail])).toEqual({ [rule]: { 'a.ts': 1 } });
  });

  it('rejects a baseline raised or extended since the base revision', () => {
    const base = { [rule]: { 'a.ts': 1 } };
    expect(raised(base, { [rule]: { 'a.ts': 1 } })).toEqual([]);
    expect(raised(base, {})).toEqual([]);
    expect(raised(base, { [rule]: { 'a.ts': 2, 'b.ts': 1 } })).toEqual([
      `a.ts: ${rule} baseline raised from 1 to 2`,
      `b.ts: ${rule} baseline raised from 0 to 1`,
    ]);
  });

  it('rejects a baseline count that is not a nonnegative integer', () => {
    expect(malformed({ [rule]: { 'a.ts': 2 } })).toEqual([]);
    expect(malformed({ [rule]: { 'a.ts': 'invalid', 'b.ts': -1, 'c.ts': 1.5 } })).toEqual([
      `a.ts: ${rule} baseline "invalid" is not a count`,
      `b.ts: ${rule} baseline -1 is not a count`,
      `c.ts: ${rule} baseline 1.5 is not a count`,
    ]);
  });

  it('ignores warnings from rules outside the registry but keeps their errors', () => {
    const warning = { ...finding('a.ts'), code: 'eslint(no-unused-vars)', severity: 'warning' };
    const error = { ...warning, severity: 'error' };
    expect(countFindings([warning, error], [guardrail]).other).toEqual([error]);
  });

  it('rejects a registry entry without its source, fix or check file', () => {
    const errors = validateGuardrails(
      [
        { ...guardrail, fix: '' },
        { ...guardrail, check: 'scripts/missing.mjs' },
      ],
      (path) => path === 'scripts/lint-ratchet.mjs',
    );
    expect(errors).toEqual([
      'scripts/guardrails.json: floating-promise needs a fix',
      'scripts/guardrails.json: duplicate id floating-promise',
      'scripts/guardrails.json: floating-promise names a missing file scripts/missing.mjs',
    ]);
    expect(() => readGuardrails(root)).not.toThrow();
  });

  it('catches the floating promise from computer-scroll-pad and passes its `await` and `void` fixes', () => {
    expect(lintFixture('floating-promise.ts')).toEqual({ [rule]: { 'floating-promise.ts': 1 } });
    expect(lintFixture('awaited-promise.ts')).toEqual({});
    expect(lintFixture('handled-promise.ts')).toEqual({});
  }, 30_000);
});
