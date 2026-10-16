import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { behavior, digest, requiredEvidence } from '../activity-idle-report.mjs';
import { verificationReport, reportMarkdown } from '../verification-report.mjs';
import { mapDirectory, auditInventory, inventoryPath } from '../verification-inventory.mjs';

const commit = 'a'.repeat(40);
const roots = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const repo = mkdtempSync(join(tmpdir(), 'verification-inventory-'));
  roots.push(repo);
  const write = (path, value) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), typeof value === 'string' ? value : JSON.stringify(value));
  };
  write('scripts/e2e-one.mjs', 'one');
  write('scripts/e2e-two.mjs', 'two');
  write('source.ts', 'source');
  write('.agents/skills/verify-deepseekbot/SKILL.md', '[map](features/README.md)');
  write('.agents/skills/verify-deepseekbot/references/observation.md', '# Observe');
  const guide = `${mapDirectory}/one.md`;
  const guideText =
    '# One\n## Sub-features\n## How to get to it (user POV)\n## Driving it with verify-app\nscripts/e2e-one.mjs\n## Gotchas';
  write(guide, guideText);
  write(`${mapDirectory}/README.md`, '| One | scripts/e2e-one.mjs | [one](one.md) |');
  const inventory = {
    version: 1,
    auditedBase: commit,
    boundary: 'Fixture only, product denominator incomplete',
    behaviors: [
      { id: behavior, label: 'Idle', source: 'source.ts', guide, task: 1972 },
      { id: 'second.behavior', label: 'Other', source: 'source.ts', guide, task: 1973 },
    ],
    scripts: [
      {
        path: 'scripts/e2e-one.mjs',
        category: 'mapped',
        behaviors: [behavior, 'second.behavior'],
        reason: 'Fixture shared journey',
        task: 1973,
        sha256: digest('one'),
      },
      {
        path: 'scripts/e2e-two.mjs',
        category: 'historical-regression',
        behaviors: [behavior],
        reason: 'Fixture regression with separate preparation',
        task: 1973,
        sha256: digest('two'),
      },
    ],
  };
  const report = (options = {}) => verificationReport({ repo, inventory, commit, ...options });
  return { repo, write, inventory, report, guide, guideText };
}
function runFixture(f) {
  const directory = join(f.repo, 'attempt');
  const authority = {
    activity: { bot: { slug: 'qa', state: 'idle' } },
    attention: { items: [] },
    overview: {
      bots: [
        {
          slug: 'qa',
          displayName: 'QA',
          state: 'idle',
          paused: false,
          hasAction: false,
          sessions: [],
        },
      ],
    },
  };
  const files = {
    'identity.json': {
      identity: { kind: 'development', source: { revision: commit, dirty: false } },
    },
    'created.json': { bot: { id: 'qa' } },
    'before.json': authority,
    'after.json': authority,
    'visible.json': {
      botId: 'qa',
      name: 'QA',
      state: 'Idle',
      hasActions: false,
      sessions: 0,
      rendered: true,
    },
    'diagnostics.json': {
      host: { ok: true },
      client: { state: 'shell-ready' },
      page: { state: 'shell-ready' },
    },
    'console.json': [],
    'aria.json': { synthetic: true },
    'activity.png': 'synthetic image bytes, never runtime proof',
  };
  const evidence = {};
  for (const name of requiredEvidence) {
    const bytes = JSON.stringify(files[name]);
    f.write(`attempt/${name}`, bytes);
    evidence[name] = digest(bytes);
  }
  const run = {
    version: 1,
    behavior,
    commit,
    base: commit,
    dirty: false,
    status: 'pass',
    botId: 'qa',
    startedAt: '2026-10-16T12:00:00Z',
    finishedAt: '2026-10-16T12:01:00Z',
    expected: 'Idle',
    actual: 'Idle',
    actions: ['Show idle Bots'],
    environment: Object.fromEntries(
      ['platform', 'arch', 'node', 'viewport', 'locale', 'theme', 'dsh', 'browser'].map((key) => [
        key,
        'synthetic',
      ]),
    ),
    evidence,
  };
  f.write('attempt/run.json', run);
  f.write('attempt/visual-review.json', {
    commit,
    decision: 'pass',
    reviewer: 'fixture',
    note: 'Synthetic fixture only',
    reviewedAt: run.finishedAt,
    screenshot: evidence['activity.png'],
    aria: evidence['aria.json'],
  });
  return { directory, run };
}

describe('complete script inventory and honest denominators', () => {
  it('runs the existing lint entry and report CLI without an import-cycle deadlock', () => {
    const repo = resolve(import.meta.dirname, '../..');
    for (const args of [
      ['scripts/check-feature-map.mjs'],
      ['scripts/verification-report.mjs', '--json'],
    ]) {
      const result = JSON.parse(
        execFileSync(process.execPath, args, { cwd: repo, encoding: 'utf8', timeout: 15000 }),
      );
      expect(result.ok).toBe(true);
    }
  });
  it('audits the real repository without a fixed file count', () => {
    const root = resolve(import.meta.dirname, '../..');
    const inventory = JSON.parse(readFileSync(join(root, inventoryPath), 'utf8'));
    const audit = auditInventory(root, inventory);
    expect(audit.errors).toEqual([]);
    expect(inventory.scripts).toHaveLength(audit.available.length);
  });
  it('keeps many-to-many edges and duplicate guide references from inflating totals', () => {
    const f = fixture();
    f.write(f.guide, `${f.guideText}\nscripts/e2e-one.mjs`);
    f.inventory.scripts[0].behaviors.push(behavior);
    const r = f.report();
    expect(r.ok).toBe(true);
    expect(r.metrics.scripts).toMatchObject({ total: 2, mapped: 1, mappingRate: 0.5 });
    expect(r.metrics.behaviorPaths).toMatchObject({
      total: null,
      coverageRate: null,
      inventoried: 2,
      scripted: 2,
    });
    expect(r.metrics.verifiedBehaviors).toMatchObject({ total: null, rate: null, passed: 0 });
    expect(r.behaviors[0].scripts).toHaveLength(2);
    expect(reportMarkdown(r)).toContain('unknown — incomplete behavior denominator');
  });
  it('rejects added and deleted files, without removing them from the denominator', () => {
    const f = fixture();
    f.write('scripts/e2e-new.mjs', 'new');
    expect(f.report().errors).toContain('Unclassified new script: scripts/e2e-new.mjs');
    expect(f.report().metrics.scripts.total).toBe(3);
    rmSync(join(f.repo, 'scripts/e2e-two.mjs'));
    expect(f.report().errors).toContain('Deleted/missing script: scripts/e2e-two.mjs');
  });
  it('rejects changed source until its classification is re-audited', () => {
    const f = fixture();
    f.write('scripts/e2e-two.mjs', 'new behavior');
    expect(f.report().errors.join('\n')).toContain('source changed; re-audit');
  });
  it('rejects duplicate IDs and duplicate classifications', () => {
    const f = fixture();
    f.inventory.behaviors.push(f.inventory.behaviors[0]);
    f.inventory.scripts.push(f.inventory.scripts[0]);
    expect(f.report().errors.join('\n')).toContain('duplicate behavior ID');
    expect(f.report().errors.join('\n')).toContain('Duplicate script classification');
  });
  it('rejects broken source, guide and Markdown links', () => {
    const f = fixture();
    f.inventory.behaviors[0].source = '../outside';
    f.inventory.behaviors[1].guide = 'missing.md';
    f.write(f.guide, `${f.guideText}\n[missing](missing.md)`);
    expect(f.report().errors.join('\n')).toContain('missing label/source link');
    expect(f.report().errors.join('\n')).toContain('broken guide');
    expect(f.report().errors.join('\n')).toContain('broken link');
  });
  it('requires every newly added feature document to be inventoried', () => {
    const f = fixture();
    f.write(`${mapDirectory}/new.md`, f.guideText);
    expect(f.report().errors).toContain(`Uninventoried feature document: ${mapDirectory}/new.md`);
  });
  it('requires reasons, tasks, known behaviors and real replacements', () => {
    const f = fixture();
    Object.assign(f.inventory.scripts[1], {
      category: 'superseded',
      reason: '',
      task: null,
      behaviors: ['wrong'],
    });
    const errors = f.report().errors.join('\n');
    expect(errors).toContain('missing audit reason/task');
    expect(errors).toContain('unknown/missing behavior');
    expect(errors).toContain('missing replacement');
  });
  it('does not allow deleting a map reference to hide a mapped script', () => {
    const f = fixture();
    f.write(f.guide, f.guideText.replace('scripts/e2e-one.mjs', ''));
    expect(f.report().errors.join('\n')).toContain(
      'mapped classification has no feature-map reference',
    );
  });
});
describe('Activity Center evidence association', () => {
  it('qualifies only its exact row, never other behaviors sharing a script', () => {
    const f = fixture();
    const { directory } = runFixture(f);
    const r = f.report({ activityRun: directory });
    expect(r.ok).toBe(true);
    expect(r.metrics.verifiedBehaviors.passed).toBe(1);
    expect(r.behaviors.map((row) => row.result.status)).toEqual(['pass', 'not-run']);
    expect(reportMarkdown(r, { evidencePrefix: './verified' })).toContain(
      '[activity.png](./verified/activity.png)',
    );
  });
  it('rejects the wrong behavior even if the file otherwise looks complete', () => {
    const f = fixture();
    const { directory, run } = runFixture(f);
    f.write('attempt/run.json', { ...run, behavior: 'second.behavior' });
    const r = f.report({ activityRun: directory });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('Selected evidence belongs to a different behavior');
    expect(r.metrics.verifiedBehaviors.passed).toBe(0);
  });
  it('expires old/dirty source and missing or modified evidence', () => {
    const f = fixture();
    const { directory } = runFixture(f);
    expect(
      f.report({ activityRun: directory, commit: 'b'.repeat(40) }).behaviors[0].result.status,
    ).toBe('needs-revalidation');
    expect(f.report({ activityRun: directory, dirty: true }).metrics.verifiedBehaviors.passed).toBe(
      0,
    );
    f.write('attempt/aria.json', '{}');
    expect(f.report({ activityRun: directory }).metrics.verifiedBehaviors.passed).toBe(0);
    rmSync(join(directory, 'activity.png'));
    expect(f.report({ activityRun: directory }).behaviors[0].result.status).toBe(
      'needs-revalidation',
    );
  });
  it.each(['fail', 'blocked'])(
    'preserves first %s and partial evidence separately from later attempts',
    (status) => {
      const f = fixture();
      const { directory, run } = runFixture(f);
      f.write('attempt/run.json', { ...run, status, reason: 'first failure' });
      rmSync(join(directory, 'activity.png'));
      const r = f.report({ activityRun: directory });
      expect(r.behaviors[0].result).toMatchObject({ status, reason: 'first failure' });
      expect(r.metrics.verifiedBehaviors.passed).toBe(0);
      expect(r.behaviors[0].result.evidence).toContain('aria.json');
    },
  );
});
