import type { Agent } from '@deepseek-ai/dsh-agent';
import { createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm';
import { Session, SessionId, type SessionSeq } from '@deepseek-ai/dsh-session';
import { expect, it } from 'vitest';
import {
  COMPACTION_TARGET_RATIO,
  createTargetCompaction,
  planTargetCompaction,
  type PricedSurface,
} from '../src/runtime/context-window.js';
import { compactionThresholdTokens } from '../src/runtime/idle-compaction.js';

const CONTEXT_WINDOW = 131_072;
const MAX_TOKENS = 32_000;
const OVERHEAD = 20_000;
const STEP_NODE_TOKENS = 2_000;
const SUMMARY_TOKENS = 3_600;

function text(tokens: number, label: string) {
  return createUserMessage({
    content: [{ type: 'text', text: `${label}:${tokens}` }],
    source: { kind: 'user' },
  });
}

function syntheticSession() {
  const session = Session.create(SessionId('long-synthetic-session'));
  session.append(
    'system/message',
    { turn: 0, step: 0, message: createSystemMessage('System') },
    { surfaceOp: 'append' },
  );
  const price = (seq: SessionSeq) => {
    const body = JSON.stringify(session.eventAt(seq)?.data ?? '');
    const match = /(?:node|summary):(\d+)/.exec(body);
    return match ? Number(match[1]) : 10;
  };
  const measure = (): PricedSurface => {
    const nodes = session.surface.nodes.map((seq) => ({ seq, tokens: price(seq) }));
    return {
      nodes,
      totalTokens: OVERHEAD + nodes.reduce((total, node) => total + node.tokens, 0),
    };
  };
  const step = () => {
    for (let index = 0; index < 2; index++)
      session.append('user/message', text(STEP_NODE_TOKENS, 'node'), { surfaceOp: 'append' });
  };
  return { session, measure, step };
}

const threshold = compactionThresholdTokens(
  {},
  { provider: 'deepseek', model: 'small-window' },
  CONTEXT_WINDOW,
  MAX_TOKENS,
);

async function runLongSession(thresholdTokens: number, steps: number) {
  const { session, measure, step } = syntheticSession();
  const passes: Array<{ step: number; nodeCount: number; freed: number; after: number }> = [];
  const logs: Array<Record<string, unknown>> = [];
  let current = 0;
  const compact = createTargetCompaction({
    measure: () => measure(),
    compactRegion: async (start, end) => {
      const before = measure().totalTokens;
      const nodes = session.surface.nodes;
      const shadowed = nodes.slice(nodes.indexOf(start), nodes.indexOf(end) + 1);
      session.append('user/message', text(SUMMARY_TOKENS, 'summary'), {
        surfaceOp: { op: 'replace', startSeq: start, endSeq: end },
        sourceEventSeqs: [...shadowed],
      });
      const after = measure().totalTokens;
      passes.push({ step: current, nodeCount: shadowed.length, freed: before - after, after });
      return 'compacted';
    },
    log: (_level, event) => logs.push(event),
  });
  const agent = { session } as unknown as Agent;
  const signal = new AbortController().signal;
  for (current = 0; current < steps; current++) {
    step();
    await compact(agent, thresholdTokens, signal);
    expect(measure().totalTokens).toBeLessThan(thresholdTokens + 2 * STEP_NODE_TOKENS);
  }
  return { passes, logs };
}

it('compacts a long session to the target in one pass instead of every step', async () => {
  const roomy = compactionThresholdTokens(
    { headroomTokens: 8_192 },
    { provider: 'deepseek', model: 'small-window' },
    CONTEXT_WINDOW,
    MAX_TOKENS,
  );
  const target = OVERHEAD + (roomy - OVERHEAD) * COMPACTION_TARGET_RATIO;
  const { passes, logs } = await runLongSession(roomy, 120);
  expect(passes.length).toBeGreaterThan(1);
  for (const pass of passes) expect(pass.after).toBeLessThanOrEqual(target);
  for (const [index, pass] of passes.entries())
    if (index > 0) expect(pass.step - passes[index - 1]!.step).toBeGreaterThanOrEqual(8);
  expect(logs.filter((event) => event['event'] === 'stalled')).toEqual([]);
});

it('frees whole steps, not one summary, when fixed overhead fills the window', async () => {
  const { passes, logs } = await runLongSession(threshold, 60);
  expect(passes.length).toBeLessThanOrEqual(30);
  for (const [index, pass] of passes.entries()) {
    expect(pass.nodeCount).toBeGreaterThan(1);
    expect(pass.freed).toBeGreaterThanOrEqual(2 * 2 * STEP_NODE_TOKENS);
    if (index > 0) expect(pass.step).toBeGreaterThan(passes[index - 1]!.step + 1);
  }
  expect(logs.filter((event) => event['event'] === 'stalled')).toEqual([]);
});

it('never re-compacts a lone summary and reports a stall once', async () => {
  const { session, measure } = syntheticSession();
  session.append('user/message', text(SUMMARY_TOKENS, 'summary'), { surfaceOp: 'append' });
  session.append('user/message', text(threshold, 'node'), { surfaceOp: 'append' });
  expect(planTargetCompaction(session, measure(), threshold)).toMatchObject({
    kind: 'skip',
    reason: 'cannot-reach-threshold',
  });
  let calls = 0;
  const logs: Array<Record<string, unknown>> = [];
  const compact = createTargetCompaction({
    measure: () => measure(),
    compactRegion: async () => {
      calls++;
      return null;
    },
    log: (level, event) => logs.push({ level, ...event }),
  });
  const agent = { session } as unknown as Agent;
  for (let index = 0; index < 5; index++)
    await compact(agent, threshold, new AbortController().signal);
  expect(calls).toBe(0);
  expect(logs).toEqual([
    expect.objectContaining({ level: 'warn', event: 'stalled', reason: 'cannot-reach-threshold' }),
  ]);
});

it('stops after a pass that stays above the threshold until the context drops', async () => {
  const { session, measure, step } = syntheticSession();
  for (let index = 0; index < 8; index++) step();
  let calls = 0;
  let total: number | undefined;
  const compact = createTargetCompaction({
    measure: () => (total === undefined ? measure() : { ...measure(), totalTokens: total }),
    compactRegion: async () => {
      calls++;
      total = threshold + 1;
      return null;
    },
    log: () => undefined,
  });
  const agent = { session } as unknown as Agent;
  const signal = new AbortController().signal;
  await compact(agent, threshold, signal);
  await compact(agent, threshold, signal);
  expect(calls).toBe(1);
  total = threshold - 1;
  await compact(agent, threshold, signal);
  total = undefined;
  for (let index = 0; index < 8; index++) step();
  await compact(agent, threshold, signal);
  expect(calls).toBe(2);
});
