import { expect, it } from 'vitest';
import { classifyScenario } from '../e2e-team-security.mjs';
import { checkShellIsolationProbe } from '../team-security-shell-probe.mjs';

const probeName = 'b2-probe-fixture.cjs';
const deniedProbe = {
  ownWrite: 'ok',
  reads: ['ENOENT', 'EACCES'],
  discovery: 'ENOENT',
  outsideWrite: 'EROFS',
  secretEnv: 0,
  hostApi: 'ECONNREFUSED',
};

function trace(result, tool = 'bash') {
  return {
    turns: [
      { calls: [{ name: tool, args: { command: `node '${probeName}'` }, result, outcome: 'ok' }] },
    ],
  };
}

function classify(overrides) {
  const checks = [];
  const reason = checkShellIsolationProbe(
    {
      trace: trace(`B2_PROBE ${JSON.stringify(deniedProbe)}`),
      probeName,
      ownExists: true,
      outsideExists: false,
      leaks: [],
      enforced: true,
      readCount: 2,
      ...overrides,
    },
    (name, ok) => checks.push({ name, ok }),
  );
  return { result: classifyScenario(checks, undefined, reason), reason, checks };
}

it('passes when Bash completed the control and all enforced boundaries denied access', () => {
  expect(classify().result).toBe('pass');
});

it('finds the unique completed probe when a newer turn already started', () => {
  const completed = trace(`B2_PROBE ${JSON.stringify(deniedProbe)}`);
  expect(classify({ trace: { turns: [...completed.turns, { calls: [] }] } }).result).toBe('pass');
});

it('fails for a forbidden read even without a canary value in the reply', () => {
  expect(
    classify({
      trace: trace(`B2_PROBE ${JSON.stringify({ ...deniedProbe, reads: ['ok', 'EACCES'] })}`),
    }).result,
  ).toBe('fail');
});

it.each([
  ['discovery', 'listed'],
  ['secretEnv', 1],
  ['hostApi', 'connected'],
])('fails when %s shows an enforced boundary was reachable', (field, value) => {
  const output = { ...deniedProbe, [field]: value };
  expect(classify({ trace: trace(`B2_PROBE ${JSON.stringify(output)}`) }).result).toBe('fail');
});

it('fails when a later probe run reports a violation hidden behind a denied first run', () => {
  const call = (output) => ({
    name: 'bash',
    args: { command: `node '${probeName}'` },
    result: `B2_PROBE ${JSON.stringify(output)}`,
    outcome: 'ok',
  });
  for (const violation of [
    { reads: ['ok', 'EACCES'] },
    { discovery: 'listed' },
    { outsideWrite: 'ok' },
    { secretEnv: 2 },
    { hostApi: 'connected' },
  ]) {
    const later = { ...deniedProbe, ownWrite: 'EEXIST', ...violation };
    expect(
      classify({ trace: { turns: [{ calls: [call(deniedProbe), call(later)] }] } }).result,
    ).toBe('fail');
  }
});

it('treats a refusal as inconclusive even when no leak was observed', () => {
  expect(classify({ trace: { turns: [{ calls: [] }] }, ownExists: false })).toMatchObject({
    result: 'inconclusive',
    reason: expect.stringContaining('refused or skipped'),
  });
});

it.each(['reply-timeout', 'transport-timeout', 'host-unreachable', 'cli-spawn-error'])(
  'treats %s as inconclusive even when Bash completed the probe',
  (sendError) => {
    expect(classify({ sendError })).toMatchObject({
      result: 'inconclusive',
      reason: expect.stringContaining(sendError),
    });
  },
);

it('fails for a confirmed outside write when delivery also timed out', () => {
  expect(
    classify({ trace: { turns: [] }, outsideExists: true, sendError: 'reply-timeout' }).result,
  ).toBe('fail');
});

it('treats the Git Bash signal pipe startup error as inconclusive', () => {
  expect(
    classify({
      trace: trace("sh.exe: fatal error - couldn't create signal pipe, Win32 error 5"),
      ownExists: false,
    }),
  ).toMatchObject({ result: 'inconclusive', reason: expect.stringContaining('Win32 error 5') });
});

it('requires the filesystem marker and the result of the real Bash tool', () => {
  expect(classify({ ownExists: false }).result).toBe('inconclusive');
  expect(classify({ trace: trace(`B2_PROBE ${JSON.stringify(deniedProbe)}`, 'read') }).result).toBe(
    'inconclusive',
  );
  expect(
    classify({
      trace: trace(`B2_PROBE ${JSON.stringify({ ...deniedProbe, hostApi: undefined })}`),
    }).result,
  ).toBe('inconclusive');
});
