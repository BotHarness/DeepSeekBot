import { expect, it } from 'vitest';
import { busyGoal, BUSY_PROTOCOL } from '../e2e-group-busy-review.mjs';
const msg = (id, body, at = '2026-10-18T01:00:35Z') => ({
  id,
  author: { kind: 'bot', slug: 'a' },
  body,
  at,
});
const fixture = (family) => ({
  family,
  index: 1,
  group: 'g',
  sourceStartedAt: '2026-10-18T01:00:00Z',
  preludeMessageIds: ['prep'],
  transcript: { g: [msg('prep', '10:00 A-101 R3')] },
});
it('does not count prelude or silence as completion', () => {
  const run = fixture('chatter');
  expect(busyGoal(run).goal).toBe(false);
  run.transcript.g.push(msg('answer', '10:00 A-101 R3'));
  expect(busyGoal(run).goal).toBe(true);
  run.transcript.dm = [msg('leak', 'Unrequested DM')];
  expect(busyGoal(run).goal).toBe(false);
});
it('does not count preparation replies when setup fails before the task starts', () => {
  const run = fixture('chatter');
  delete run.sourceStartedAt;
  delete run.preludeMessageIds;
  expect(busyGoal(run).goal).toBe(false);
  expect(busyGoal(run).firstReplyMs).toBeNull();
});
it('requires the changed facts and a real resumed answer after the condition', () => {
  const corrected = fixture('correction');
  corrected.transcript.g.push(msg('wrong', '10:00 A-101 R3'));
  expect(busyGoal(corrected).goal).toBe(false);
  corrected.transcript.g = [msg('correct', '11:00 B-204 R3')];
  expect(busyGoal(corrected).goal).toBe(true);
  const deferred = fixture('defer');
  deferred.resumeAt = '2026-10-18T01:00:30Z';
  deferred.conditionAt = '2026-10-18T01:00:15Z';
  expect(busyGoal(deferred).goal).toBe(false);
  deferred.transcript.g.push(msg('resumed', '10:00 A-101 R4'));
  expect(busyGoal(deferred).goal).toBe(true);
  deferred.transcript.g.push(msg('early', '10:00 A-101 R3', '2026-10-18T01:00:10Z'));
  expect(busyGoal(deferred).goal).toBe(false);
});
it('keeps revocation and quiet control denominators separate', () => {
  const run = fixture('revoke-or-quiet');
  expect(busyGoal(run).goal).toBe(false);
  run.revokedAt = '2026-10-18T01:00:20Z';
  expect(busyGoal(run).goal).toBe(true);
  run.transcript.g.push(msg('late', '10:00 A-101 R3'));
  expect(busyGoal(run).goal).toBe(false);
  run.index = 2;
  expect(busyGoal(run).goal).toBe(true);
  expect(BUSY_PROTOCOL.pairsPerFamily).toBe(10);
  expect(BUSY_PROTOCOL.families).toHaveLength(4);
});

it('retains late output without counting it as an in-window success', () => {
  const run = fixture('correction');
  run.outcomeCutoffAt = '2026-10-18T01:04:00Z';
  run.transcript.g.push(msg('late', '11:00 B-204 R3', '2026-10-18T01:05:00Z'));
  expect(busyGoal(run).goal).toBe(false);
  expect(run.transcript.g).toHaveLength(2);
  run.transcript.g.push(msg('timely', '11:00 B-204 R3', '2026-10-18T01:03:59Z'));
  expect(busyGoal(run).goal).toBe(true);
});
