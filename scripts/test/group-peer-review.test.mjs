import { expect, it } from 'vitest';
import { peerGoal, PEER_PROTOCOL } from '../e2e-group-peer-review.mjs';
import {
  summarize,
  humanReviewSet,
  judgePrompt,
  renderHistory,
} from '../group-send-review-report.mjs';
const msg = (id, slug, body, at = '2026-10-17T10:00:02Z') => ({
  id,
  author: { kind: 'bot', slug },
  body,
  at,
});
const fixture = (family) => ({
  family,
  group: 'g',
  bots: { aura: 'a', atlas: 'b' },
  sourceStartedAt: '2026-10-17T10:00:00Z',
  preludeMessageIds: ['prep'],
  transcript: {
    g: [msg('b', 'b', 'October 20 09:00 UTC R3')],
    'dm-a': [msg('prep', 'a', 'confirmed')],
  },
});
it('uses peer families, budgets, fixed sampling and author identities in the shared report', () => {
  const pairs = PEER_PROTOCOL.families.map((family) => ({
    id: family + '-1',
    family,
    runs: {
      baseline: {
        ...fixture(family),
        valid: true,
        goal: true,
        usage: { host: { totalTokens: 100 } },
      },
      candidate: {
        ...fixture(family),
        valid: true,
        goal: true,
        usage: { host: { totalTokens: 150 } },
      },
    },
  }));
  const report = { protocol: PEER_PROTOCOL, pairs, candidate: 'candidate', protocolHash: 'hash' };
  expect(summarize(report).map((row) => row.family)).toEqual(PEER_PROTOCOL.families);
  for (const reasons of Object.values(humanReviewSet(report))) {
    expect(reasons).toContain('固定 seed 2054 抽样');
    expect(reasons).toContain('超过预登记 token 预算');
  }
  expect(judgePrompt(report)).toContain('QA-317');
  const html = renderHistory(report);
  expect(html).toContain('Object.entries(r.bots');
  expect(html).toContain('data.report.protocol?.issue||2053');
});
it('does not count silent omission of independent evidence as success', () => {
  const run = fixture('independent');
  expect(peerGoal(run).goal).toBe(false);
  run.transcript.g.push(msg('a', 'a', 'QA-317 requires R2'));
  expect(peerGoal(run).goal).toBe(true);
  run.transcript['dm-a'].push(msg('leak', 'a', 'QA-317 requires R2'));
  expect(peerGoal(run).goal).toBe(false);
});
it('separates required coverage from redundant replies', () => {
  const run = fixture('redundant');
  expect(peerGoal(run)).toMatchObject({ goal: true, redundantReplyCount: 0 });
  run.transcript.g.push(msg('a', 'a', 'October 20 09:00 UTC R3'));
  expect(peerGoal(run)).toMatchObject({ goal: true, redundantReplyCount: 1 });
});
it('requires a response to the new question after its own boundary', () => {
  const run = fixture('new-question');
  run.questionAt = '2026-10-17T10:00:03Z';
  run.transcript.g.push(msg('old', 'a', '18:00 JST'));
  expect(peerGoal(run).goal).toBe(false);
  run.transcript.g.push(msg('new', 'a', '18:00 JST', '2026-10-17T10:00:05Z'));
  expect(peerGoal(run)).toMatchObject({ goal: true, contributionMs: 5000 });
});
it('does not let FYI silence substitute for the explicit-request control', () => {
  const run = fixture('fyi-control');
  run.controlAt = '2026-10-17T10:00:04Z';
  expect(peerGoal(run).goal).toBe(false);
  run.transcript.g.push(msg('ack', 'a', 'R3'));
  run.transcript.g.push(msg('control', 'a', '09:00 UTC R3', '2026-10-17T10:00:07Z'));
  expect(peerGoal(run)).toMatchObject({ goal: true, fyiAcknowledgments: 1, controlReplyMs: 3000 });
  expect(PEER_PROTOCOL.pairsPerFamily).toBe(10);
});
