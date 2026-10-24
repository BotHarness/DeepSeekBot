import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const verify = parse(
  readFileSync(new URL('../../.github/workflows/verify.yml', import.meta.url), 'utf8'),
);
const release = parse(
  readFileSync(new URL('../../.github/workflows/npm-release.yml', import.meta.url), 'utf8'),
);
const candidate = parse(
  readFileSync(
    new URL('../../.github/workflows/npm-prerelease-prepare.yml', import.meta.url),
    'utf8',
  ),
);

function expression(source, context) {
  const body = source
    .replace(/^\s*\$\{\{|\}\}\s*$/g, '')
    .replace(/\b(?:github|needs)(?:\.[\w-]+)+/g, (path) => {
      const value = path.split('.').reduce((value, key) => value?.[key], context);
      return JSON.stringify(value ?? null);
    })
    .replace(/cancelled\(\)/g, String(context.cancelled ?? false));
  return Function(`return (${body});`)();
}
const group = (github) =>
  verify.concurrency.group.replace(/\$\{\{.*?\}\}/g, (part) => expression(part, { github }));
const github = { workflow: 'verify', event_name: 'push', sha: 'a', event: {} };
const gate = (passed, lookup = 'success', fallback = 'skipped', cancelled = false) =>
  expression(release.jobs.prepare.if, {
    needs: {
      verification: { result: lookup, outputs: { passed } },
      'verify-fallback': { result: fallback },
    },
    cancelled,
  });

describe('release verification protection', () => {
  it('qualifies manual candidates without publication credentials or a publish job', () => {
    expect(candidate.on.workflow_dispatch.inputs.version.required).toBe(true);
    expect(candidate.permissions).toEqual({ contents: 'read' });
    expect(candidate.jobs.publish).toBeUndefined();
    expect(candidate.jobs['qualify-host'].needs).toBe('prepare');
    expect(candidate.jobs['qualify-commands'].strategy.matrix.os).toEqual([
      'ubuntu-latest',
      'windows-latest',
    ]);
    for (const job of Object.values(candidate.jobs)) {
      expect(job.environment).toBeUndefined();
      expect(JSON.stringify(job)).not.toContain('secrets.NPM_TOKEN');
    }
  });
  it('keeps distinct main commits and release callers out of the same cancellation group', () => {
    expect(group(github)).not.toBe(group({ ...github, sha: 'b' }));
    expect(group(github)).not.toBe(group({ ...github, workflow: 'npm release' }));
    expect(expression(verify.concurrency['cancel-in-progress'], { github })).toBe(false);
  });
  it('still replaces obsolete runs for the same PR', () => {
    const pr = { ...github, event_name: 'pull_request', event: { pull_request: { number: 42 } } };
    expect(group(pr)).toBe(group({ ...pr, sha: 'b' }));
    expect(expression(verify.concurrency['cancel-in-progress'], { github: pr })).toBe(true);
  });
  it('reuses only exact-source push verification and calls the shared workflow otherwise', () => {
    const lookup = release.jobs.verification.steps.find((step) => step.id === 'ci').run;
    expect(lookup).toContain('--workflow verify.yml --commit "$GITHUB_SHA" --event push');
    expect(lookup).toContain('.conclusion == "success"');
    expect(verify.on).toHaveProperty('workflow_call');
    expect(release.jobs['verify-fallback'].uses).toBe('./.github/workflows/verify.yml');
    expect(verify.jobs['test-full'].strategy.matrix.shard).toEqual([1, 2, 3]);
    expect(release.jobs.prepare.steps.some((step) => step.run?.includes('pnpm test'))).toBe(false);
  });
  it('accepts successful reuse or successful fallback, but never a missing or failed gate', () => {
    expect(gate('true')).toBe(true);
    expect(gate('false', 'success', 'success')).toBe(true);
    for (const result of ['failure', 'cancelled', 'skipped']) {
      expect(gate('true', result)).toBe(false);
      expect(gate('false', 'success', result)).toBe(false);
    }
    expect(gate(undefined)).toBe(false);
    expect(gate('true', 'success', 'skipped', true)).toBe(false);
    expect(release.jobs.prepare.needs).toEqual(['verification', 'verify-fallback']);
  });
  it('allows publishing after reused verification but blocks unsuccessful preparation', () => {
    for (const result of ['success', 'failure', 'cancelled', 'skipped']) {
      expect(
        expression(release.jobs.publish.if, {
          needs: { prepare: { result }, 'qualify-commands': { result: 'success' } },
        }),
      ).toBe(result === 'success');
    }
    expect(
      expression(release.jobs.publish.if, {
        needs: { prepare: { result: 'success' } },
        cancelled: true,
      }),
    ).toBe(false);
  });
  it('preserves exact-package qualification and Human publication approval', () => {
    expect(
      release.jobs.prepare.steps.some((step) =>
        step.run?.includes('scripts/e2e-fresh-profile-install.mjs'),
      ),
    ).toBe(true);
    expect(release.jobs.publish.needs).toEqual(['prepare', 'qualify-commands']);
    expect(release.jobs['qualify-commands'].strategy.matrix.os).toEqual([
      'ubuntu-latest',
      'windows-latest',
    ]);
    expect(
      expression(release.jobs.publish.if, {
        needs: { prepare: { result: 'success' }, 'qualify-commands': { result: 'failure' } },
      }),
    ).toBe(false);
    expect(release.jobs.publish.environment).toBe('npm-release');
    expect(
      release.jobs.publish.steps.some((step) => step.run?.includes('--plan-sha256 "$PLAN_SHA"')),
    ).toBe(true);
    expect(release.jobs['verify-fallback'].secrets).toBeUndefined();
  });
});
