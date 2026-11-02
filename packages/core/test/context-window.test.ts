import { expect, it, vi } from 'vitest';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { Session, SessionId } from '@deepseek-ai/dsh-session';
import { createUserMessage, createSystemMessage } from '@deepseek-ai/dsh-llm';
import {
  compactUnknownContext,
  contextCapacity,
  fallbackCompactionRange,
} from '../src/runtime/context-window.js';
import { compactionThresholdTokens } from '../src/runtime/idle-compaction.js';

it('uses model capacity and labels a 200K fallback honestly', () => {
  expect(contextCapacity(1_000_000)).toEqual({ contextWindow: 1_000_000, capacitySource: 'model' });
  for (const missing of [undefined, 0, -1, NaN, Infinity])
    expect(contextCapacity(missing)).toEqual({
      contextWindow: 200_000,
      capacitySource: 'estimate',
    });
  expect(
    compactionThresholdTokens({}, { provider: 'custom', model: 'unknown' }, 200_000, 32_000),
  ).toBe(102_464);
  const unknown = { provider: 'custom', model: 'unknown' };
  expect(compactionThresholdTokens({ headroomTokens: 262_144 }, unknown, 200_000, 32_000)).toBe(
    102_464,
  );
  expect(compactionThresholdTokens({ headroomTokens: 8_192 }, unknown, 200_000, 32_000)).toBe(
    159_808,
  );
});

it('retains the latest message and never selects the system prompt', () => {
  const session = Session.create(SessionId('context-window-test'));
  session.append(
    'system/message',
    { turn: 0, step: 0, message: createSystemMessage('System') },
    { surfaceOp: 'append' },
  );
  expect(fallbackCompactionRange(session)).toBeUndefined();
  const first = session.append(
    'user/message',
    createUserMessage({
      content: [{ type: 'text', text: 'Old request' }],
      source: { kind: 'user' },
    }),
    { surfaceOp: 'append' },
  );
  expect(fallbackCompactionRange(session)).toBeUndefined();
  session.append(
    'user/message',
    createUserMessage({
      content: [{ type: 'text', text: 'New request' }],
      source: { kind: 'user' },
    }),
    { surfaceOp: 'append' },
  );
  expect(fallbackCompactionRange(session)).toEqual({ start: first.seq, end: first.seq });
});

function removedModelAgent() {
  const removed = { provider: 'deepseek', model: 'removed-model' };
  const resolveModelInfo = vi.fn(async (provider: string, model: string) => {
    if (provider === removed.provider && model === removed.model)
      throw Object.assign(new Error(`No adapter for ${provider}/${model}`), { code: 'NO_ADAPTER' });
    return { context: { contextWindow: 1_000_000 }, defaultMaxTokens: 32_000 };
  });
  const measure = vi.fn(() => ({ totalTokens: 900_000 }));
  const compactRegion = vi.fn(async () => undefined);
  const agent = {
    session: {
      id: 'orchestrator-ada',
      requestHeader: () => ({ config: { ...removed, maxTokens: 32_000 } }),
    },
    ctx: {
      llm: { resolveModelInfo },
      logger: { info: vi.fn() },
      get: (name: string) =>
        name === 'tokenMeter' ? { measure } : name === 'compaction' ? { compactRegion } : undefined,
    },
  } as unknown as Agent;
  return { agent, resolveModelInfo, compactRegion };
}

it('protects context with the current model selection, not a removed previous model', async () => {
  const { agent, resolveModelInfo, compactRegion } = removedModelAgent();
  const selected = { provider: 'deepseek', model: 'deepseek-v4-pro' };
  await expect(
    compactUnknownContext(agent, new AbortController().signal, {}, selected),
  ).resolves.toBeUndefined();
  expect(resolveModelInfo).toHaveBeenCalledWith('deepseek', 'deepseek-v4-pro', expect.anything());
  expect(resolveModelInfo).not.toHaveBeenCalledWith('deepseek', 'removed-model', expect.anything());
  expect(compactRegion).not.toHaveBeenCalled();
});

it('skips context protection instead of failing the Turn when no route resolves', async () => {
  const { agent, compactRegion } = removedModelAgent();
  await expect(compactUnknownContext(agent, new AbortController().signal)).resolves.toBeUndefined();
  expect(compactRegion).not.toHaveBeenCalled();
  const aborted = new AbortController();
  aborted.abort();
  await expect(compactUnknownContext(agent, aborted.signal)).rejects.toThrow('No adapter');
});
