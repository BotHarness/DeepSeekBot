import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  behavior,
  coverageRow,
  digest,
  phases,
  requiredEvidence,
  visualEvidence,
} from '../computer-lifecycle-report.mjs';
import { verificationReport, reportMarkdown } from '../verification-report.mjs';
const commit = 'a'.repeat(40);
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'computer-proof-'));
  dirs.push(dir);
  const container = 'botharness-ax1977-fixture';
  const volume = `${container}-config`;
  const state = (state) => ({
    target: 'container',
    provider: 'docker',
    probe: { available: true },
    status: { state, storage: { kind: 'volume', target: volume } },
  });
  const data = {
    identity: { identity: { kind: 'development', source: { revision: commit, dirty: false } } },
    created: { bot: { id: 'bot' }, dm: { channelId: 'dm' } },
    ownership: {
      container,
      volume,
      taskCreated: true,
      initialContainerAbsent: true,
      initialVolumeAbsent: true,
    },
    'docker-version': { Server: { Version: 'synthetic' } },
    initial: state('absent'),
    running: state('running'),
    stopped: state('stopped'),
    'after-stopped-read': state('stopped'),
    'cleanup-observation': state('stopped'),
    frame: { target: 'container', bytes: 100, mimeType: 'image/jpeg', seq: 1 },
    'container-running': {
      id: 'container-id',
      name: `/${container}`,
      running: true,
      mounts: [{ name: volume, destination: '/config' }],
    },
    'container-stopped': { id: 'container-id', running: false },
    fixture: { marker: `AX Container Computer 1977 — ${container}`, containerId: 'container-id' },
    'stopped-refusal': { exitCode: 1, value: { error: { code: 'not-running' } } },
    'cleanup-computer': { ok: true },
    lifecycle: {
      entries: [{ detail: 'start requested (panel)' }, { detail: 'stop requested (panel)' }],
    },
    'computer-diagnostics': { entries: [{ type: 'lifecycle' }] },
    console: [],
    'http-errors': [],
  };
  for (const phase of phases) {
    data[`visible-${phase}`] = {
      rendered: true,
      selectedChannels: ['dm'],
      accessLabel: `${phase === 'off' ? 'Enable' : 'Disable'} Computer Access`,
      text: `Docker Computer ${phase === 'authorized' ? 'Authorize and start' : phase === 'running' ? 'Running' : 'Stopped'}`,
      live: phase === 'running',
      viewers: [{ visible: true, src: './botharness-computer/viewer/' }],
    };
    data[`${phase}.diagnostics`] = {
      host: { ok: true },
      client: { state: 'shell-ready' },
      page: { state: 'shell-ready' },
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
    expected: 'start/frame/stop/refuse',
    actual: 'Synthetic regression fixture only',
    actions: [{ click: 'Authorize and start' }],
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
      note: 'Synthetic regression only',
      reviewedAt: new Date().toISOString(),
      evidence: Object.fromEntries(visualEvidence.map((n) => [n, run.evidence[n]])),
    }),
  );
  return dir;
}
function change(dir, name, update) {
  const file = join(dir, name + '.json');
  const data = JSON.parse(readFileSync(file));
  update(data);
  const bytes = JSON.stringify(data);
  writeFileSync(file, bytes);
  if (!['run', 'visual-review'].includes(name))
    change(dir, 'run', (r) => {
      r.evidence[name + '.json'] = digest(bytes);
    });
}
describe('bounded Container Computer qualification', () => {
  it('keeps unselected evidence unrun and requires the complete correlated proof', () => {
    expect(coverageRow(undefined, commit).status).toBe('not-run');
    expect(coverageRow(fixture(), commit).status).toBe('pass');
  });
  it.each(requiredEvidence)('expires missing %s', (name) => {
    const dir = fixture();
    rmSync(join(dir, name));
    expect(coverageRow(dir, commit).status).toBe('needs-revalidation');
  });
  it.each([
    [
      'ownership',
      (v) => {
        v.initialContainerAbsent = false;
      },
    ],
    [
      'running',
      (v) => {
        v.target = 'local';
      },
    ],
    [
      'running',
      (v) => {
        v.status.storage.target = 'another-volume';
      },
    ],
    [
      'docker-version',
      (v) => {
        v.Server = null;
      },
    ],
    [
      'frame',
      (v) => {
        v.bytes = 0;
      },
    ],
    [
      'container-stopped',
      (v) => {
        v.id = 'replacement';
      },
    ],
    [
      'container-stopped',
      (v) => {
        v.running = true;
      },
    ],
    [
      'stopped-refusal',
      (v) => {
        v.value.error.code = 'host-unavailable';
      },
    ],
    [
      'after-stopped-read',
      (v) => {
        v.status.state = 'running';
      },
    ],
    [
      'visible-running',
      (v) => {
        v.live = false;
      },
    ],
    [
      'visible-running',
      (v) => {
        v.selectedChannels = ['other'];
      },
    ],
    [
      'running.diagnostics',
      (v) => {
        v.page.firstFailure = { code: 'shell-lost' };
      },
    ],
    [
      'http-errors',
      (v) => {
        v.push({ status: 404 });
      },
    ],
  ])('rejects misleading %s evidence', (name, update) => {
    const dir = fixture();
    change(dir, name, update);
    expect(coverageRow(dir, commit).status).toBe('needs-revalidation');
  });
  it('keeps a first failure or prerequisite blocker distinct from later success', () => {
    for (const status of ['fail', 'blocked']) {
      const dir = fixture();
      change(dir, 'run', (r) => {
        r.status = status;
        r.reason = 'first failure';
      });
      expect(coverageRow(dir, commit)).toMatchObject({ status, reason: 'first failure' });
    }
  });
  it('requires the same clean commit and exact visual receipt', () => {
    const dir = fixture();
    expect(coverageRow(dir, 'b'.repeat(40)).status).toBe('needs-revalidation');
    expect(coverageRow(dir, commit, true).status).toBe('needs-revalidation');
    change(dir, 'visual-review', (v) => {
      v.evidence['frame.jpg'] = 'changed';
    });
    expect(coverageRow(dir, commit).status).toBe('needs-revalidation');
  });
  it('binds only its own catalogue row and evidence links', () => {
    const report = verificationReport({ commit, computerRun: fixture() });
    expect(report.errors).toEqual([]);
    expect(report.behaviors.find((r) => r.id === behavior).result.status).toBe('pass');
    expect(
      report.behaviors.filter((r) => r.id !== behavior).every((r) => r.result.status === 'not-run'),
    ).toBe(true);
    expect(reportMarkdown(report, { computerEvidencePrefix: './computer' })).toContain(
      './computer/frame.jpg',
    );
  });
});
