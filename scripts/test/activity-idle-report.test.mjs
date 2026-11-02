import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  behavior,
  coverageRow,
  digest,
  idleProblems,
  requiredEvidence,
} from '../activity-idle-report.mjs';

const commit = 'a'.repeat(40);
const authority = () => ({
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
});
const proof = () => ({
  botId: 'qa',
  before: authority(),
  after: authority(),
  visible: {
    botId: 'qa',
    name: 'QA',
    state: 'Idle',
    hasActions: false,
    sessions: 0,
    rendered: true,
  },
  diagnostics: {
    host: { ok: true },
    client: { state: 'shell-ready' },
    page: { state: 'shell-ready' },
  },
  console: [],
});
const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function fixture(status = 'pass') {
  const directory = mkdtempSync(join(tmpdir(), 'activity-idle-'));
  directories.push(directory);
  const value = {
    ...proof(),
    identity: { identity: { kind: 'development', source: { revision: commit, dirty: false } } },
    created: { bot: { id: 'qa' } },
  };
  const run = {
    behavior,
    version: 1,
    base: commit,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    expected: 'Idle',
    actual: 'Idle',
    actions: [{ click: 'Show idle Bots' }],
    environment: {
      platform: 'test',
      arch: 'test',
      node: 'test',
      viewport: 'test',
      locale: 'test',
      theme: 'test',
      dsh: 'test',
      browser: 'test',
    },
    status,
    commit,
    dirty: false,
    botId: 'qa',
    reason: 'retained failure',
    evidence: {},
  };
  for (const name of requiredEvidence) {
    const bytes = JSON.stringify(value[name.replace('.json', '')] ?? { synthetic: true });
    writeFileSync(join(directory, name), bytes);
    run.evidence[name] = digest(bytes);
  }
  writeFileSync(join(directory, 'run.json'), JSON.stringify(run));
  writeFileSync(
    join(directory, 'visual-review.json'),
    JSON.stringify({
      commit,
      reviewer: 'fixture reviewer',
      decision: 'pass',
      note: 'Synthetic fixture, not runtime evidence',
      reviewedAt: new Date().toISOString(),
      screenshot: run.evidence['activity.png'],
      aria: run.evidence['aria.json'],
    }),
  );
  return directory;
}
describe('one Activity Center idle coverage row', () => {
  it('distinguishes unrun from a complete joint proof', () => {
    expect(coverageRow(undefined, commit).status).toBe('not-run');
    expect(coverageRow(fixture(), commit).status).toBe('pass');
  });
  it.each(requiredEvidence)('invalidates pass when %s is removed', (name) => {
    const directory = fixture();
    rmSync(join(directory, name));
    expect(coverageRow(directory, commit).status).toBe('needs-revalidation');
  });
  it('invalidates changed evidence and inapplicable or dirty source', () => {
    const directory = fixture();
    expect(coverageRow(directory, 'b'.repeat(40)).status).toBe('needs-revalidation');
    expect(coverageRow(directory, commit, true).status).toBe('needs-revalidation');
    writeFileSync(join(directory, 'visible.json'), '{}');
    expect(coverageRow(directory, commit).status).toBe('needs-revalidation');
  });
  it.each(['fail', 'blocked'])('retains %s and its partial evidence', (status) => {
    const directory = fixture(status);
    rmSync(join(directory, 'activity.png'));
    expect(coverageRow(directory, commit)).toMatchObject({ status, reason: 'retained failure' });
  });
  it.each([
    'version',
    'base',
    'startedAt',
    'finishedAt',
    'expected',
    'actual',
    'environment',
    'actions',
  ])('invalidates missing %s metadata', (field) => {
    const directory = fixture();
    const path = join(directory, 'run.json');
    const run = JSON.parse(readFileSync(path, 'utf8'));
    delete run[field];
    writeFileSync(path, JSON.stringify(run));
    expect(coverageRow(directory, commit).status).toBe('needs-revalidation');
  });
  it('keeps visual review pending and retains a failed inspection', () => {
    const directory = fixture();
    const path = join(directory, 'visual-review.json');
    const review = JSON.parse(readFileSync(path, 'utf8'));
    rmSync(path);
    expect(coverageRow(directory, commit).status).toBe('needs-revalidation');
    writeFileSync(
      path,
      JSON.stringify({ ...review, decision: 'fail', note: 'Idle card missing from screenshot' }),
    );
    expect(coverageRow(directory, commit).status).toBe('fail');
  });
  it('never overwrites a first failed attempt with a later success', () => {
    const first = fixture('fail');
    const bytes = readFileSync(join(first, 'run.json'), 'utf8');
    expect(coverageRow(fixture(), commit).status).toBe('pass');
    expect(readFileSync(join(first, 'run.json'), 'utf8')).toBe(bytes);
    expect(coverageRow(first, commit).status).toBe('fail');
  });
  it('does not accept healthy HTTP or a mounted shell as feature proof', () => {
    const value = proof();
    delete value.visible;
    expect(idleProblems(value)).toContain('visible: missing or inconsistent idle Bot card');
  });
  it('refuses the wrong PersonaBot and fabricated work', () => {
    const value = proof();
    value.after.activity.bot.slug = 'another';
    value.after.attention.items.push({});
    expect(idleProblems(value)).toHaveLength(2);
  });
  it.each(['missing-client', 'Host-unavailable', 'blank-page', 'first-failure'])(
    'distinguishes %s from normal no activity',
    (kind) => {
      const value = proof();
      if (kind === 'missing-client') value.diagnostics.client.state = 'unobserved';
      if (kind === 'Host-unavailable') value.diagnostics.host.ok = false;
      if (kind === 'blank-page') value.visible.rendered = false;
      if (kind === 'first-failure') value.diagnostics.page.firstFailure = { code: 'shell-lost' };
      expect(idleProblems(value).length).toBeGreaterThan(0);
    },
  );
});
