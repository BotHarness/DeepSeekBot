import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  behavior,
  coverageRow,
  digest,
  requiredEvidence,
  visualEvidence,
} from '../workspace-grant-report.mjs';
import { verificationReport, reportMarkdown } from '../verification-report.mjs';

const commit = 'a'.repeat(40);
const directories = [];
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'grant-proof-'));
  directories.push(dir);
  const grant = {
    id: 'grant',
    botSlug: 'bot',
    workspaceId: 'workspace',
    workspacePath: '[fixture]',
  };
  const sample = 'temporary fixture\n';
  const refused = {
    exitCode: 1,
    value: {
      error: {
        code: 'tool-failed',
        message: 'Selected file is outside current authorized directories',
      },
    },
  };
  const revoked = { ...grant, revokedAt: new Date().toISOString() };
  const data = {
    identity: { identity: { kind: 'development', source: { revision: commit, dirty: false } } },
    created: { bot: { id: 'bot' } },
    fixture: {
      path: '[fixture]',
      files: ['README.md'],
      sample,
      bytes: Buffer.byteLength(sample),
      sha256: digest(sample),
      taskCreated: true,
      isolatedFromHost: true,
      notUserAncestor: true,
    },
    before: { grants: [] },
    'read-before': refused,
    granted: { grants: [grant] },
    'read-granted': {
      exitCode: 0,
      value: {
        slug: 'bot',
        tool: 'channel_attachment_import',
        sessionId: 'direct',
        result: {
          fileId: 'file:12345678-1234-4234-8234-123456789012',
          name: 'README.md',
          size: Buffer.byteLength(sample),
        },
      },
    },
    'unconfirmed-revoke': {
      exitCode: 2,
      value: { error: { code: 'usage', message: 'requires --confirm' } },
    },
    'after-unconfirmed': { grants: [grant] },
    revoked: { grant: revoked },
    after: { grants: [revoked] },
    'read-after': refused,
    'after.diagnostics': {
      host: { ok: true },
      client: { state: 'shell-ready' },
      page: { state: 'shell-ready' },
    },
    console: [],
    trace: { slug: 'bot', sessionId: 'direct', turns: [] },
    cleanup: { removed: true, sampleUnchanged: true },
  };
  data['before.diagnostics'] = structuredClone(data['after.diagnostics']);
  data['granted.diagnostics'] = structuredClone(data['after.diagnostics']);
  for (const phase of ['before', 'granted', 'after'])
    data[`visible-${phase}`] = {
      rendered: true,
      hasWorkspace: phase === 'granted',
      text: 'Synthetic visible fixture',
    };
  const run = {
    version: 1,
    behavior,
    commit,
    base: commit,
    dirty: false,
    status: 'pass',
    botId: 'bot',
    workspaceId: 'workspace',
    grantId: 'grant',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    expected: 'read then revoke',
    actual: 'refused after revoke',
    actions: [{ click: 'Authorize workspace' }],
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
describe('one temporary Workspace Grant proof', () => {
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
      'unconfirmed-revoke',
      (v) => {
        v.exitCode = 1;
      },
    ],
    [
      'granted',
      (v) => {
        v.grants[0].botSlug = 'other';
      },
    ],
    [
      'after',
      (v) => {
        v.grants[0].workspaceId = 'other';
      },
    ],
    [
      'after',
      (v) => {
        delete v.grants[0].revokedAt;
      },
    ],
    [
      'after-unconfirmed',
      (v) => {
        v.grants[0].revokedAt = new Date().toISOString();
      },
    ],
    [
      'read-after',
      (v) => {
        v.value.error.code = 'host-unavailable';
      },
    ],
    [
      'read-after',
      (v) => {
        v.exitCode = 0;
      },
    ],
    [
      'read-granted',
      (v) => {
        v.value.result.size = 0;
      },
    ],
    [
      'visible-after',
      (v) => {
        v.hasWorkspace = true;
      },
    ],
    [
      'fixture',
      (v) => {
        v.notUserAncestor = false;
      },
    ],
    [
      'cleanup',
      (v) => {
        v.removed = false;
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
  ])('rejects changed semantics in %s even with matching hashes', (name, update) => {
    const dir = fixture();
    change(dir, name, update);
    expect(coverageRow(dir, commit).status).toBe('needs-revalidation');
  });
  it.each(['before', 'granted'])(
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
  it('qualifies only the selected Workspace row and uses its own evidence prefix', () => {
    const dir = fixture();
    const report = verificationReport({ commit, workspaceRun: dir });
    expect(report.ok).toBe(true);
    expect(report.behaviors.find((row) => row.id === behavior).result.status).toBe('pass');
    expect(
      report.behaviors.find((row) => row.id === 'desktop.activity-center.idle-personabot').result
        .status,
    ).toBe('not-run');
    const md = reportMarkdown(report, {
      evidencePrefix: './idle',
      workspaceEvidencePrefix: './grant',
    });
    expect(md).toContain('./grant/granted.png');
    expect(md).not.toContain('./idle/granted.png');
    change(dir, 'run', (v) => {
      v.behavior = 'other';
    });
    expect(verificationReport({ commit, workspaceRun: dir }).ok).toBe(false);
  });
});
