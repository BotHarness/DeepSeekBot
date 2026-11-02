import { expect, it, vi } from 'vitest';
import {
  autoContinueSeconds,
  createTurnContinuation,
  parseFailureAutoContinue,
  parseFailureProgress,
  turnContinuationFor,
} from '../src/shared/turn-continuation.js';

const dmFailure = {
  channelId: 'dm-ada',
  failureMessageId: 'failure-1',
  botSlug: 'ada',
  role: 'orchestrator' as const,
  requestMessageId: 'human-1',
};

it('continues the original request through the failure card and settles the card', async () => {
  const port = { continueTurn: vi.fn(async () => undefined), stop: vi.fn(async () => undefined) };
  const card = turnContinuationFor({}, dmFailure, port);
  expect(card.available).toBe(true);
  await card.continueTurn();
  expect(port.continueTurn).toHaveBeenCalledExactlyOnceWith('dm-ada', 'human-1', 'failure-1');
  expect(card.getSnapshot()).toEqual({ pending: undefined, settled: true, notice: undefined });
  await card.continueTurn();
  expect(port.continueTurn).toHaveBeenCalledTimes(2);
});

it('cancels a waiting automatic continuation by stopping the Bot', async () => {
  const port = { continueTurn: vi.fn(async () => undefined), stop: vi.fn(async () => 'stopped') };
  const card = createTurnContinuation(dmFailure, port);
  await card.cancelAuto();
  expect(port.stop).toHaveBeenCalledExactlyOnceWith('dm-ada', 'ada');
  expect(card.getSnapshot().notice).toBe('cancelled');
  expect(card.getSnapshot().settled).toBe(true);
});

it('maps Host refusals to notices and keeps the card open', async () => {
  for (const [code, notice] of [
    ['bot-busy', 'busy'],
    ['session-changed', 'changed'],
    ['retry-unavailable', 'unavailable'],
    ['other', 'failed'],
  ] as const) {
    const error = Object.assign(new Error(code), { code });
    const card = createTurnContinuation(dmFailure, {
      continueTurn: async () => {
        throw error;
      },
      stop: async () => undefined,
    });
    await card.continueTurn();
    expect(card.getSnapshot()).toEqual({ pending: undefined, settled: false, notice });
  }
});

it('offers continue only for an orchestrator failure in the Bot DM that names its request', async () => {
  const port = { continueTurn: vi.fn(async () => undefined), stop: vi.fn(async () => undefined) };
  for (const input of [
    { ...dmFailure, channelId: 'group-1' },
    { ...dmFailure, role: 'assignment' as const },
    { ...dmFailure, requestMessageId: undefined },
  ]) {
    const card = createTurnContinuation(input, port);
    expect(card.available).toBe(false);
    await card.continueTurn();
  }
  expect(port.continueTurn).not.toHaveBeenCalled();
});

it('parses progress and automatic continuation and counts down whole seconds', () => {
  expect(
    parseFailureProgress({ completedSteps: 4, lastTool: 'bash', unknownTools: ['bash', 1] }),
  ).toEqual({
    completedSteps: 4,
    lastTool: 'bash',
    unknownTools: ['bash'],
  });
  expect(parseFailureProgress({ completedSteps: -1 })).toBeUndefined();
  const auto = parseFailureAutoContinue({
    attempt: 1,
    maxAttempts: 2,
    at: '2026-11-02T00:01:00.000Z',
  });
  expect(auto).toEqual({ attempt: 1, maxAttempts: 2, at: '2026-11-02T00:01:00.000Z' });
  expect(parseFailureAutoContinue({ attempt: 1, maxAttempts: 2, at: 'soon' })).toBeUndefined();
  const start = Date.parse('2026-11-02T00:00:00.500Z');
  expect(autoContinueSeconds(auto, start)).toBe(60);
  expect(autoContinueSeconds(auto, Date.parse(auto!.at))).toBeUndefined();
  expect(autoContinueSeconds(undefined, start)).toBeUndefined();
});
