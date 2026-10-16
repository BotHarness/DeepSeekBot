import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  behavior,
  redactBrowserEvidence,
  coverageRow,
  digest,
  phases,
  requiredEvidence,
  visualEvidence,
} from '../browser-lifecycle-report.mjs';
import { verificationReport, reportMarkdown } from '../verification-report.mjs';
const commit = 'a'.repeat(40);
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'browser-proof-'));
  dirs.push(dir);
  const sample = {
    taskCreated: true,
    title: 'AX Browser lifecycle 1976',
    marker: 'AX Browser lifecycle 1976',
    url: 'http://127.0.0.1:12345/',
  };
  const stopped = {
    ok: true,
    target: 'local',
    running: false,
    focused: null,
    tabs: [],
    frame: null,
  };
  const denied = {
    exitCode: 1,
    value: {
      error: { code: 'host-refused', message: 'Browser Access is off for this PersonaBot' },
    },
  };
  const data = {
    fixture: sample,
    identity: { identity: { kind: 'development', source: { revision: commit, dirty: false } } },
    created: { bot: { id: 'bot' }, dm: { channelId: 'dm' } },
    off: stopped,
    stopped,
    'after-stopped-read': stopped,
    disabled: stopped,
    'cleanup-observation': stopped,
    'cleanup-browser': { ok: true },
    'off-refusal': denied,
    'disabled-refusal': denied,
    'stopped-refusal': {
      exitCode: 1,
      value: {
        error: {
          code: 'host-refused',
          message: 'This PersonaBot has no Bot Browser tab yet; call browser_open with a URL first',
        },
      },
    },
    'bot-final': { bot: { slug: 'bot', browserAccess: false } },
    running: {
      ok: true,
      target: 'local',
      running: true,
      focused: 'tab',
      tabs: [{ targetId: 'tab', title: sample.title, url: sample.url, current: true }],
      frame: { bytes: 500 },
      takeover: false,
    },
    opened: { ok: true, content: [{ type: 'text', text: sample.url }] },
    'direct-tabs': { ok: true, content: [{ type: 'text', text: '* tab ' + sample.url }] },
    'direct-read': {
      ok: true,
      content: [{ type: 'text', text: sample.url + ' ' + sample.title + ' 37 blue boxes' }],
    },
    lifecycle: {
      entries: [{ detail: 'stop requested (panel) slug=bot' }, { detail: 'direct tool slug=bot' }],
    },
    console: [],
    'http-errors': [],
  };
  for (const phase of phases) {
    data[`${phase}.diagnostics`] = {
      host: { ok: true },
      client: { state: 'shell-ready' },
      page: { state: 'shell-ready' },
    };
    data[`visible-${phase}`] = {
      rendered: true,
      fullscreen: false,
      text:
        phase === 'running'
          ? sample.title + ' ' + sample.url + ' Connected'
          : phase === 'stopped'
            ? 'Stopped'
            : "This PersonaBot's sessions may use the browser",
      accessLabel: ['off', 'disabled'].includes(phase)
        ? 'Enable Browser Access'
        : 'Disable Browser Access',
      selectedChannels: ['dm'],
      viewers: phase === 'running' ? [{ visible: true, live: true, status: '' }] : [],
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
    expected: 'open/read/stop/refuse',
    actual: 'observed same tab, stopped and refused',
    actions: [{ click: 'Browser' }],
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
describe('bounded Browser lifecycle proof', () => {
  it('requires a complete proof and keeps unselected behavior unrun', () => {
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
      'running',
      (v) => {
        v.target = 'container';
      },
    ],
    [
      'running',
      (v) => {
        v.focused = 'another';
      },
    ],
    [
      'running',
      (v) => {
        v.tabs[0].url = 'https://example.invalid';
      },
    ],
    [
      'running',
      (v) => {
        v.frame.bytes = 0;
      },
    ],
    [
      'running',
      (v) => {
        v.tabs.push({ ...v.tabs[0], targetId: 'extra' });
      },
    ],
    [
      'direct-read',
      (v) => {
        v.content = [];
      },
    ],
    [
      'direct-tabs',
      (v) => {
        v.content = [];
      },
    ],
    [
      'stopped',
      (v) => {
        v.running = true;
      },
    ],
    [
      'stopped',
      (v) => {
        v.tabs = [{ targetId: 'old' }];
      },
    ],
    [
      'after-stopped-read',
      (v) => {
        v.focused = 'old';
      },
    ],
    [
      'disabled',
      (v) => {
        v.target = 'extension';
      },
    ],
    [
      'off-refusal',
      (v) => {
        v.exitCode = 0;
      },
    ],
    [
      'disabled-refusal',
      (v) => {
        v.value.error.message = 'Browser startup failed';
      },
    ],
    [
      'stopped-refusal',
      (v) => {
        v.value.error.message = 'Browser Access is off for this PersonaBot';
      },
    ],
    [
      'bot-final',
      (v) => {
        v.bot.browserAccess = true;
      },
    ],
    [
      'lifecycle',
      (v) => {
        v.entries = [];
      },
    ],
    [
      'visible-running',
      (v) => {
        v.selectedChannels = ['wrong'];
      },
    ],
    [
      'visible-running',
      (v) => {
        v.viewers = [];
      },
    ],
    [
      'visible-running',
      (v) => {
        v.fullscreen = true;
      },
    ],
    [
      'visible-off',
      (v) => {
        v.text = 'Stopped';
      },
    ],
    [
      'visible-disabled',
      (v) => {
        v.accessLabel = 'Disable Browser Access';
      },
    ],
    [
      'visible-running',
      (v) => {
        v.viewers[0].status = 'browser not running';
      },
    ],
    [
      'visible-running',
      (v) => {
        v.viewers[0].live = false;
      },
    ],
    [
      'visible-stopped',
      (v) => {
        v.text = 'Running';
      },
    ],
    [
      'running.diagnostics',
      (v) => {
        v.host.ok = false;
      },
    ],
    [
      'disabled.diagnostics',
      (v) => {
        v.page.firstFailure = { code: 'failed' };
      },
    ],
    [
      'console',
      (v) => {
        v.push({ message: 'pageerror' });
      },
    ],
  ])('rejects corrupted %s semantics', (name, update) => {
    const dir = fixture();
    change(dir, name, update);
    expect(coverageRow(dir, commit).status).toBe('needs-revalidation');
  });
  it('accepts the canonical omitted false Access field', () => {
    const dir = fixture();
    change(dir, 'bot-final', (v) => {
      delete v.bot.browserAccess;
    });
    expect(coverageRow(dir, commit).status).toBe('pass');
  });
  it('invalidates source changes and changed evidence', () => {
    const dir = fixture();
    expect(coverageRow(dir, 'b'.repeat(40)).status).toBe('needs-revalidation');
    expect(coverageRow(dir, commit, true).status).toBe('needs-revalidation');
    writeFileSync(join(dir, 'frame.jpg'), 'changed');
    expect(coverageRow(dir, commit).status).toBe('needs-revalidation');
  });
  it('requires applicable visual review and preserves visual rejection', () => {
    const dir = fixture();
    change(dir, 'visual-review', (v) => {
      v.decision = 'fail';
    });
    expect(coverageRow(dir, commit).status).toBe('fail');
    rmSync(join(dir, 'visual-review.json'));
    expect(coverageRow(dir, commit).status).toBe('needs-revalidation');
  });
  it.each(['fail', 'blocked'])('retains first %s with partial evidence', (status) => {
    const dir = fixture();
    change(dir, 'run', (r) => {
      r.status = status;
      r.reason = 'first failure';
    });
    rmSync(join(dir, 'frame.jpg'));
    expect(coverageRow(dir, commit)).toMatchObject({ status, reason: 'first failure' });
  });
  it('binds only the narrow row and independent evidence links', () => {
    const dir = fixture();
    const report = verificationReport({ commit, browserRun: dir });
    expect(report.ok).toBe(true);
    expect(report.behaviors.find((r) => r.id === behavior).result.status).toBe('pass');
    expect(report.behaviors.find((r) => r.id === 'desktop.browser.lifecycle').result.status).toBe(
      'not-run',
    );
    expect(reportMarkdown(report, { browserEvidencePrefix: './browser' })).toContain(
      './browser/frame.jpg',
    );
  });
});

describe('Browser evidence redaction', () => {
  const instance = {
    url: 'http://127.0.0.1:5433/?token=synthetic-secret',
    home: '/private/fixture-home',
  };
  it('preserves longer fixture ports while hiding complete Host origins', () => {
    expect(
      redactBrowserEvidence(
        'http://127.0.0.1:54334/ http://127.0.0.1:5433/api http://127.0.0.1:5433',
        instance,
        '/fixture-root',
      ),
    ).toBe('http://127.0.0.1:54334/ [redacted]/api [redacted]');
  });
  it('removes the full login URL before the origin and keeps standalone token/path redaction', () => {
    expect(
      redactBrowserEvidence(
        `${instance.url} synthetic-secret ${instance.home}/state /fixture-root/log`,
        instance,
        '/fixture-root',
      ),
    ).toBe('[redacted] [redacted] [redacted]/state [redacted]/log');
  });
  it('can redact early precondition evidence before an instance exists', () => {
    expect(redactBrowserEvidence('/fixture-root/log', undefined, '/fixture-root')).toBe(
      '[redacted]/log',
    );
  });
});
