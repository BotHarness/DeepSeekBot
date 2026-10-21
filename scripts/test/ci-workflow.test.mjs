import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(
  readFileSync(new URL('../../.github/workflows/verify.yml', import.meta.url), 'utf8'),
);
const script = workflow.jobs.verify.steps[0].run.split("node <<'NODE'\n")[1].split('\nNODE')[0];
const fixture = (tests = 'none', mobile = 'false', count = '0') =>
  Object.fromEntries(
    workflow.jobs.verify.needs.map((name) => [
      name,
      {
        result: ['plan', 'static'].includes(name) ? 'success' : 'skipped',
        outputs:
          name === 'plan'
            ? {
                tests,
                mobile,
                'docs-site': 'false',
                'android-native': 'false',
                count,
                shards: count === '0' ? '0' : Number(count) < 60 ? '1' : '3',
              }
            : {},
      },
    ]),
  );
const passes = (needs) =>
  spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: { ...process.env, NEEDS: JSON.stringify(needs) },
  }).status === 0;

describe('required CI aggregate', () => {
  it('accepts planned skips and rejects failure or cancellation in any job', () => {
    expect(passes(fixture())).toBe(true);
    for (const job of workflow.jobs.verify.needs) {
      for (const result of ['failure', 'cancelled']) {
        const needs = fixture();
        needs[job].result = result;
        expect(passes(needs), `${job}: ${result}`).toBe(false);
      }
    }
  });

  it('requires selected mobile, native, docs, smoke and full-test jobs to succeed', () => {
    for (const [output, value, job] of [
      ['mobile', 'true', 'mobile-export'],
      ['android-native', 'true', 'mobile-native'],
      ['docs-site', 'true', 'docs-site'],
      ['tests', 'full', 'test-full'],
    ]) {
      const needs = fixture();
      needs.plan.outputs[output] = value;
      needs['e2e-smoke'].result = 'success';
      expect(passes(needs), job).toBe(false);
      needs[job].result = 'success';
      expect(passes(needs), job).toBe(true);
      if (output === 'tests') {
        needs['e2e-smoke'].result = 'skipped';
        expect(passes(needs)).toBe(false);
      }
    }
  });

  it('accepts empty selections but requires successful nonempty affected shards', () => {
    const needs = fixture('affected');
    needs['e2e-smoke'].result = 'success';
    expect(passes(needs)).toBe(true);
    needs.plan.outputs.count = '158';
    needs.plan.outputs.shards = '3';
    expect(passes(needs)).toBe(false);
    needs['test-affected'].result = 'success';
    expect(passes(needs)).toBe(true);
    needs.plan.outputs.count = '';
    expect(passes(needs)).toBe(false);
  });

  it('runs small selections on the selection runner and skips the matrix', () => {
    const needs = fixture('affected', 'false', '5');
    needs['e2e-smoke'].result = 'success';
    expect(passes(needs)).toBe(true);
    const step = workflow.jobs.plan.steps.at(-1);
    expect(step.if).toBe("steps.select.outputs.shards == '1'");
    expect(step.run).toBe('node scripts/ci-affected.mjs --run');
    expect(workflow.jobs['test-affected'].if).toBe("needs.plan.outputs.shards == '3'");
  });

  it('rejects a missing or malformed plan', () => {
    for (const output of ['tests', 'mobile']) {
      const needs = fixture();
      delete needs.plan.outputs[output];
      expect(passes(needs)).toBe(false);
    }
  });

  it('routes mobile checks together and carries exact affected files to each runner', () => {
    expect(workflow.jobs['mobile-export'].needs).toBe('plan');
    expect(workflow.jobs['mobile-export'].if).toBe("needs.plan.outputs.mobile == 'true'");
    const commands = workflow.jobs['mobile-export'].steps.map((step) => step.run).filter(Boolean);
    expect(workflow.jobs.static.steps.some((step) => step.run === 'pnpm typecheck')).toBe(true);
    expect(commands).toContain('pnpm --filter @botharness/mobile expo:doctor');
    expect(commands).toContain('pnpm --filter @botharness/mobile export');
    expect(workflow.jobs['test-affected'].strategy['fail-fast']).toBe(false);
    expect(workflow.jobs['test-affected'].steps.at(-1).env.TEST_FILES).toBe(
      '${{ toJSON(matrix.files) }}',
    );
  });
});
