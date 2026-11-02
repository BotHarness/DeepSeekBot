import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import {
  price,
  providerUsage,
  wholeHistoryGoal,
  usageDifference,
} from '../e2e-group-send-review.mjs';
import {
  auditRun,
  blindRun,
  humanReviewComplete,
  humanReviewSet,
  pairedInterval,
  judgePrompt,
  JUDGE_PROMPT,
  validateJudge,
} from '../group-send-review-report.mjs';
import { sumHostRows } from '../e2e-llm-scenarios.mjs';

describe('send review evaluation evidence', () => {
  it('requires baseline failures and quiet-control latency anomalies in Human review', () => {
    const report = {
      protocol: { issue: 2054, families: ['fyi-control'] },
      pairs: Array.from({ length: 10 }, (_, i) => ({
        id: `control-${i}`,
        family: 'fyi-control',
        runs: {
          baseline: { valid: true, goal: i !== 2, firstReplyMs: 100, controlReplyMs: 100 },
          candidate: {
            valid: true,
            goal: true,
            firstReplyMs: 1000 - i,
            controlReplyMs: i === 9 ? 200 : i === 3 ? 120 : 100,
          },
        },
      })),
    };
    const required = humanReviewSet(report);
    expect(required['control-2']).toContain('基线未达成场景目标');
    expect(required['control-9']).toContain('候选明确请求控制 latency p95 尾部');
    expect(required['control-3']).toContain('明确请求控制延迟超过预登记 1.10 倍预算');
    expect(required['control-0']).not.toContain('候选明确请求控制 latency p95 尾部');
  });
  it('keeps prelude history while judging cancellation only after the target request', () => {
    const run = {
      conversation: true,
      family: 'cancel-or-revoke',
      intervention: 'cancel',
      interventionCompletedAt: 'now',
      group: 'g',
      preludeMessageIds: ['p'],
      transcript: { g: [{ id: 'p', at: 'before', author: { kind: 'bot' }, body: '10:00 A-101' }] },
    };
    expect(wholeHistoryGoal(run)).toBe(true);
    expect(auditRun(run).obsoleteConfirmationIds).toEqual([]);
    expect(blindRun(run).channels[0].messages).toHaveLength(1);
    run.transcript['dm-a'] = [{ id: 'late', author: { kind: 'bot' }, body: 'Cancelled' }];
    expect(wholeHistoryGoal(run)).toBe(false);
  });
  it('requires both late corrections and rejects an unchanged second fact', () => {
    const run = {
      conversation: true,
      family: 'correction',
      group: 'g',
      preludeMessageIds: ['p'],
      transcript: {
        g: [
          { id: 'p', author: { kind: 'bot' }, body: '10:00 A-101' },
          { id: 'reply', author: { kind: 'bot' }, body: '11:00 A-101' },
        ],
      },
    };
    expect(wholeHistoryGoal(run)).toBe(false);
    expect(auditRun(run).obsoleteConfirmationIds).toEqual(['reply']);
    run.transcript.g[1].body = '11：00 B-204';
    expect(wholeHistoryGoal(run)).toBe(true);
    run.transcript['dm-a'] = [{ id: 'elsewhere', author: { kind: 'bot' }, body: '11:00 B-204' }];
    expect(wholeHistoryGoal(run)).toBe(false);
  });
  it('does not hide missing or backwards usage in the post-prelude cost', () => {
    expect(
      usageDifference({ totalTokens: 70, inputTokens: 30 }, { totalTokens: 50, inputTokens: 40 }),
    ).toMatchObject({ totalTokens: 20, inputTokens: null, outputTokens: null });
    expect(price(usageDifference({ totalTokens: 70 }, { totalTokens: 50 }))).toBeNull();
    expect(judgePrompt({ protocol: { version: '2053-pilot-v4' } })).toBe(JUDGE_PROMPT);
    expect(judgePrompt({ protocol: { version: '2053-ingest-v1' } })).toContain('B-204');
  });
  it('does not count a DM fallback or cancellation acknowledgement as successful silence', () => {
    const run = {
      family: 'cancel-or-revoke',
      interventionCompletedAt: 'now',
      group: 'g',
      legacyGroupGoal: true,
      transcript: { g: [] },
    };
    expect(wholeHistoryGoal(run)).toBe(true);
    run.transcript['dm-a'] = [
      { author: { kind: 'bot' }, body: 'Cannot send there, here is the notice' },
    ];
    expect(wholeHistoryGoal(run)).toBe(false);
    run.transcript = { g: [{ author: { kind: 'bot' }, body: 'Cancelled' }] };
    expect(wholeHistoryGoal(run)).toBe(false);
  });
  it('records explicit similarity and uncertainty separately from skipping', () => {
    for (const winner of ['Left', 'Right', 'tie', 'insufficient'])
      expect(humanReviewComplete({ reviewMode: 'pairwise-preference-v2', winner })).toBe(true);
    expect(humanReviewComplete({ reviewMode: 'pairwise-preference-v2', winner: null })).toBe(false);
  });
  it('accepts one-click preferences without inventing legacy rubric ratings', () => {
    expect(humanReviewComplete({ reviewMode: 'pairwise-preference-v1', winner: 'Left' })).toBe(
      true,
    );
    expect(humanReviewComplete({ reviewMode: 'pairwise-preference-v1', winner: 'Right' })).toBe(
      true,
    );
    expect(humanReviewComplete({ reviewMode: 'pairwise-preference-v1', winner: null })).toBe(false);
    expect(humanReviewComplete({ winner: 'Left' })).toBe(false);
  });
  it('records insufficient Human evidence without forcing fabricated scores', () => {
    expect(humanReviewComplete({ winner: 'insufficient', reason: 'Left history is missing' })).toBe(
      true,
    );
    expect(humanReviewComplete({ winner: 'insufficient', reason: ' ' })).toBe(false);
    expect(humanReviewComplete({ winner: 'tie', reason: 'Looks similar' })).toBe(false);
    const scores = { currentState: 3, value: 3, space: 3, coverage: 3, clarity: 3 };
    expect(
      humanReviewComplete({ winner: 'tie', reason: 'Both finish', Left: scores, Right: scores }),
    ).toBe(true);
    expect(
      humanReviewComplete({
        winner: 'tie',
        reason: 'Both finish',
        Left: { ...scores, value: 0 },
        Right: scores,
      }),
    ).toBe(false);
  });
  it('does not turn a missing native export into zero usage or a reconciled run', () => {
    const audit = auditRun({ usage: { host: { totalTokens: 0 } } });
    expect(audit.nativeKnownBuckets.totalTokens).toBeNull();
    expect(audit.hostReconciliation).toBe(false);
  });
  it('keeps a missing bucket unknown even when the known subtotal is numeric', () => {
    const totals = sumHostRows([
      {
        provider: 'p',
        model: 'm',
        inputTokens: 10,
        outputTokens: 2,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: null,
        unknownBuckets: { inputTokens: 1 },
      },
    ]);
    expect(totals.inputTokens).toBeNull();
    expect(price(totals)).toBeNull();
    expect(
      price({ inputTokens: 1000000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }),
    ).toBe(0.15);
  });
  it('reads every native compressed frame but exports no hidden model content', () => {
    const home = mkdtempSync(join(tmpdir(), 'review-usage-'));
    try {
      mkdirSync(join(home, 'sessions', 'one'), { recursive: true });
      const header = { type: 'session', id: 's', cwd: '/bots/ada/memory' };
      const events = [
        header,
        { type: 'step/start', seq: 10, time: 10, data: { turn: 1, step: 1 } },
        { type: 'step/start', seq: 20, time: 20, data: { turn: 2, step: 1 } },
        ...[1, 2].map((seq) => ({
          type: 'assistant/message',
          seq,
          time: seq,
          data: {
            message: { content: 'DO NOT EXPORT', source: { provider: 'p', model: 'm' } },
            usage: {
              inputTokens: seq,
              outputTokens: 2,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              totalTokens: seq + 2,
            },
          },
        })),
      ];
      writeFileSync(
        join(home, 'sessions', 'one', 'session.v4.jsonl.zstd'),
        Buffer.concat(events.map((event) => zstdCompressSync(JSON.stringify(event) + '\n'))),
      );
      const output = providerUsage(home, ['ada']);
      expect(output[0].attempts).toHaveLength(2);
      expect(output[0].modelSteps).toEqual([
        { seq: 10, at: 10, turn: 1, step: 1 },
        { seq: 20, at: 20, turn: 2, step: 1 },
      ]);
      expect(output[0].attempts.map((attempt) => attempt.usage.totalTokens)).toEqual([3, 4]);
      expect(JSON.stringify(output)).not.toContain('DO NOT EXPORT');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
  it('omits costs and implementation labels from judge input and checks fabricated citations', () => {
    const input = blindRun({
      variant: 'candidate',
      costEstimateUSD: 17,
      group: 'g',
      bots: { aura: 'bot-1' },
      transcript: {
        g: [{ id: 'm1', at: 'now', author: { kind: 'bot', slug: 'bot-1' }, body: 'hello' }],
      },
    });
    expect(JSON.stringify(input)).not.toContain('candidate');
    expect(JSON.stringify(input)).not.toContain('17');
    expect(
      validateJudge(
        {
          winner: 'Left',
          Left: {
            reasons: [{ dimension: 'currentState', messageIds: ['invented'], times: ['never'] }],
          },
          Right: {},
        },
        { Left: input, Right: input },
      ),
    ).toContain('Left: missing citation invented');
    expect(pairedInterval([4, 4, 4])).toEqual([4, 4]);
  });
});
