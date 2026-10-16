import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  behavior,
  coverageRow,
  digest,
  requiredEvidence,
  visualEvidence,
} from '../memory-restore-report.mjs';
import { verificationReport, reportMarkdown } from '../verification-report.mjs';

const commit = 'a'.repeat(40);
const directories = [];
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'memory-proof-'));
  directories.push(dir);
  const v1 = '1'.repeat(40),
    v2 = '2'.repeat(40),
    restored = '3'.repeat(40);
  const sample = {
    taskCreated: true,
    path: 'AX-1975.md',
    v1: 'AX Memory version one.\n',
    v2: 'AX Memory version two.\n',
  };
  const file = (head, body) => ({ file: { head, body, path: sample.path } });
  const checkpoint = { id: 'saved', head: v2, botSlug: 'bot' };
  const data = {
    identity: { identity: { kind: 'development', source: { revision: commit, dirty: false } } },
    created: { bot: { id: 'bot' }, dm: { channelId: 'dm-bot' } },
    fixture: sample,
    initial: { snapshot: { head: '0'.repeat(40) } },
    'saved-v1': { commit: { sha: v1 } },
    'saved-v2': { commit: { sha: v2 } },
    v1: file(v1, sample.v1),
    before: file(v2, sample.v2),
    after: file(restored, sample.v1),
    refused: file(restored, sample.v1),
    history: { sha: v1, diff: '+' + sample.v1, files: [{ path: sample.path, status: 'A' }] },
    restored: { head: restored, backup: null, saved: checkpoint },
    graph: {
      head: restored,
      dirty: false,
      commits: [
        { sha: restored, parents: [v2], subject: 'Restore Memory to 1111111: Human Memory edit' },
      ],
    },
    checkpoints: { checkpoints: [checkpoint] },
    refusal: { exitCode: 1, value: { error: { code: 'memory-conflict' } } },
    console: [],
  };
  for (const phase of ['before', 'history', 'after', 'refused']) {
    data[`${phase}.diagnostics`] = {
      host: { ok: true },
      client: { state: 'shell-ready' },
      page: { state: 'shell-ready' },
    };
    data[`visible-${phase}`] = {
      rendered: true,
      selectedChannels: ['dm-bot'],
      text: '1111111 ' + (phase === 'before' ? sample.v2 : sample.v1),
    };
  }
  const run = {
    version: 1,
    behavior,
    commit,
    base: commit,
    dirty: false,
    status: 'pass',
    botId: 'bot',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    expected: 'read, restore, refuse stale HEAD',
    actual: 'restored v1 and refused stale HEAD',
    actions: [{ click: 'Memory' }],
    environment: Object.fromEntries(
      ['platform', 'arch', 'node', 'viewport', 'locale', 'theme', 'dsh', 'browser'].map((k) => [
        k,
        'synthetic',
      ]),
    ),
    evidence: {},
  };
  for (const name of requiredEvidence) {
    const bytes = JSON.stringify(data[name.replace('.json', '')] ?? { synthetic: true });
    writeFileSync(join(dir, name), bytes);
    run.evidence[name] = digest(bytes);
  }
  writeFileSync(join(dir, 'run.json'), JSON.stringify(run));
  writeFileSync(
    join(dir, 'visual-review.json'),
    JSON.stringify({
      commit,
      decision: 'pass',
      reviewer: 'fixture',
      note: 'Synthetic regression, not product proof',
      reviewedAt: new Date().toISOString(),
      evidence: Object.fromEntries(visualEvidence.map((name) => [name, run.evidence[name]])),
    }),
  );
  return dir;
}
function change(dir, name, update) {
  const path = join(dir, name + '.json');
  const value = JSON.parse(readFileSync(path));
  update(value);
  const bytes = JSON.stringify(value);
  writeFileSync(path, bytes);
  if (name !== 'run' && name !== 'visual-review')
    change(dir, 'run', (run) => {
      run.evidence[name + '.json'] = digest(bytes);
    });
}
describe('one disposable Memory restore proof', () => {
  it('requires one complete proof and keeps no selection unrun', () => {
    expect(coverageRow(undefined, commit).status).toBe('not-run');
    expect(coverageRow(fixture(), commit).status).toBe('pass');
  });
  it.each(requiredEvidence)('invalidates missing %s', (name) => {
    const dir = fixture();
    rmSync(join(dir, name));
    expect(coverageRow(dir, commit).status).toBe('needs-revalidation');
  });
  it.each([
    [
      'refusal',
      (v) => {
        v.exitCode = 0;
      },
    ],
    [
      'refusal',
      (v) => {
        v.value.error.code = 'host-unavailable';
      },
    ],
    [
      'refused',
      (v) => {
        v.file.head = '4'.repeat(40);
      },
    ],
    [
      'refused',
      (v) => {
        v.file.body = 'changed';
      },
    ],
    [
      'after',
      (v) => {
        v.file.body = 'AX Memory version two.\n';
      },
    ],
    [
      'restored',
      (v) => {
        v.head = '1'.repeat(40);
      },
    ],
    [
      'restored',
      (v) => {
        v.saved.botSlug = 'other';
      },
    ],
    [
      'graph',
      (v) => {
        v.commits[0].parents = ['1'.repeat(40)];
      },
    ],
    [
      'graph',
      (v) => {
        v.dirty = true;
      },
    ],
    [
      'checkpoints',
      (v) => {
        v.checkpoints = [];
      },
    ],
    [
      'history',
      (v) => {
        v.sha = '2'.repeat(40);
      },
    ],
    [
      'history',
      (v) => {
        v.truncated = true;
      },
    ],
    [
      'visible-after',
      (v) => {
        v.rendered = false;
      },
    ],
    [
      'visible-history',
      (v) => {
        v.selectedChannels = ['other'];
      },
    ],
    [
      'after.diagnostics',
      (v) => {
        v.client.state = 'missing';
      },
    ],
    [
      'console',
      (v) => {
        v.push('error');
      },
    ],
  ])('rejects incorrect semantics in %s with matching hashes', (name, update) => {
    const dir = fixture();
    change(dir, name, update);
    expect(coverageRow(dir, commit).status).toBe('needs-revalidation');
  });
  it.each(['before', 'history', 'after', 'refused'])(
    'retains a %s lifecycle failure even after a healthy reload',
    (phase) => {
      const dir = fixture();
      change(dir, `${phase}.diagnostics`, (value) => {
        value.page.state = 'shell-lost';
        value.page.firstFailure = { code: 'shell-lost' };
      });
      expect(coverageRow(dir, commit)).toMatchObject({ status: 'needs-revalidation' });
      expect(coverageRow(dir, commit).reason).toContain(phase);
    },
  );
  it('does not reuse old/dirty source, missing or inapplicable visual review', () => {
    const dir = fixture();
    expect(coverageRow(dir, 'b'.repeat(40)).status).toBe('needs-revalidation');
    expect(coverageRow(dir, commit, true).status).toBe('needs-revalidation');
    change(dir, 'visual-review', (v) => {
      v.evidence['after.png'] = 'changed';
    });
    expect(coverageRow(dir, commit).status).toBe('needs-revalidation');
    rmSync(join(dir, 'visual-review.json'));
    expect(coverageRow(dir, commit).status).toBe('needs-revalidation');
  });
  it('preserves failed/blocked runs and visual rejection', () => {
    const dir = fixture();
    change(dir, 'visual-review', (v) => {
      v.decision = 'fail';
    });
    expect(coverageRow(dir, commit).status).toBe('fail');
    for (const status of ['blocked', 'fail']) {
      change(dir, 'run', (v) => {
        v.status = status;
        v.reason = 'first failure';
      });
      expect(coverageRow(dir, commit)).toMatchObject({ status, reason: 'first failure' });
    }
  });
  it('qualifies only the selected Memory row and uses its own evidence prefix', () => {
    const dir = fixture();
    const report = verificationReport({ commit, memoryRun: dir });
    expect(report.ok).toBe(true);
    expect(report.behaviors.find((row) => row.id === behavior).result.status).toBe('pass');
    expect(
      report.behaviors.find((row) => row.id === 'desktop.activity-center.idle-personabot').result
        .status,
    ).toBe('not-run');
    const md = reportMarkdown(report, {
      evidencePrefix: './idle',
      memoryEvidencePrefix: './memory',
    });
    expect(md).toContain('./memory/history.png');
    expect(md).not.toContain('./idle/history.png');
    change(dir, 'run', (v) => {
      v.behavior = 'other';
    });
    expect(verificationReport({ commit, memoryRun: dir }).ok).toBe(false);
  });
});

describe('Memory runner provenance prerequisites', () => {
  it('retains a blocked first failure when origin/main is missing', () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-provenance-'));
    directories.push(directory);
    const git = (...args) =>
      execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: 'pipe' }).trim();
    git('init', '--quiet');
    writeFileSync(join(directory, '.git/info/exclude'), 'scripts/\n.humanlayer/\n');
    git(
      '-c',
      'user.name=AX regression',
      '-c',
      'user.email=ax@example.invalid',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '--allow-empty',
      '--no-gpg-sign',
      '-m',
      'Disposable provenance regression',
    );
    const head = git('rev-parse', 'HEAD');
    cpSync(new URL('../', import.meta.url), join(directory, 'scripts'), { recursive: true });
    const result = spawnSync(
      process.execPath,
      ['scripts/e2e-memory-restore.mjs', '--name', 'missing-base'],
      { cwd: directory, encoding: 'utf8', timeout: 10000 },
    );
    expect(result.status).toBe(1);
    const attempts = join(directory, '.humanlayer/verify/missing-base/memory-restore');
    const names = readdirSync(attempts);
    expect(names).toHaveLength(1);
    const attempt = join(attempts, names[0]);
    const run = JSON.parse(readFileSync(join(attempt, 'run.json'), 'utf8'));
    expect(run).toMatchObject({ status: 'blocked', commit: head, base: null, dirty: false });
    expect(run.reason).toContain('preconditions:');
    expect(run.reason).toContain('origin/main');
    const failure = JSON.parse(readFileSync(join(attempt, 'failure.json'), 'utf8'));
    expect(failure).toMatchObject({ stage: 'preconditions', reason: run.reason });
    expect(run.evidence['failure.json']).toBe(digest(readFileSync(join(attempt, 'failure.json'))));
    expect(readFileSync(join(attempt, 'coverage.md'), 'utf8')).toContain('blocked');
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'blocked', reason: run.reason });
  });
});
