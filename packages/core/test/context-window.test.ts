import { expect, it } from 'vitest';
import { Session, SessionId } from '@deepseek-ai/dsh-session';
import { createUserMessage, createSystemMessage } from '@deepseek-ai/dsh-llm';
import { contextCapacity, fallbackCompactionRange } from '../src/runtime/context-window.js';
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
