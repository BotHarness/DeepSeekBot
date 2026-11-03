import { describe, expect, it } from 'vitest';

import {
  CONCURRENCY_WAIT_MS,
  createBotRequestRetry,
  isConcurrencyRefusal,
  type RequestErrorPayload,
} from '../src/runtime/bot-request-retry.js';

const REFUSAL = 'Concurrency limit exceeded for user, please retry later';

function payload(overrides: Partial<RequestErrorPayload> = {}): RequestErrorPayload {
  return {
    agent: { session: { id: 'orchestrator-ada' } },
    turn: 1,
    step: 1,
    provider: 'local',
    failure: { code: 'PI_AI_ERROR', message: REFUSAL },
    retryPolicy: { mode: 'normal' },
    signal: new AbortController().signal,
    ...overrides,
  };
}

function harness(bot = true) {
  let clock = 0;
  const sleeps: number[] = [];
  const delegated: string[] = [];
  const handle = createBotRequestRetry({
    isBotSession: () => bot,
    now: () => clock,
    random: () => 0.5,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
      return true;
    },
  });
  const next = async () => {
    delegated.push('next');
    return undefined;
  };
  return { handle, next, sleeps, delegated, advance: (ms: number) => (clock += ms) };
}

describe('Bot model request retry on concurrency refusals (#3300)', () => {
  it.each([
    ['PI_AI_ERROR', REFUSAL],
    ['INVALID_REQUEST', `400: {"message":"${REFUSAL}"}`],
    ['RATE_LIMIT', '429 rate limit'],
    ['PI_AI_ERROR', 'Too many concurrent requests'],
    ['SERVER', 'Server is busy, please try again later'],
  ])('treats %s "%s" as a concurrency refusal', (code, message) => {
    expect(isConcurrencyRefusal({ code, message })).toBe(true);
  });

  it.each([
    ['PI_AI_ERROR', 'model produced malformed tool call'],
    ['INVALID_REQUEST', '400 invalid request, please retry later'],
    ['QUOTA_EXCEEDED', 'Too many requests: insufficient balance'],
    ['INVALID_CREDENTIAL', 'Concurrency limit exceeded'],
  ])('leaves %s "%s" to the default recovery', (code, message) => {
    expect(isConcurrencyRefusal({ code, message })).toBe(false);
  });

  it('keeps a Bot turn waiting for up to 300 s like a direct DSH request', async () => {
    const { handle, next, sleeps, delegated } = harness();
    let retries = 0;
    while ((await handle(payload(), next))?.kind === 'retry') retries++;
    expect(retries).toBeGreaterThan(5);
    expect(sleeps.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(CONCURRENCY_WAIT_MS);
    expect(sleeps.reduce((sum, ms) => sum + ms, 0)).toBeGreaterThan(CONCURRENCY_WAIT_MS - 10_000);
    expect(Math.max(...sleeps)).toBeLessThanOrEqual(10_000);
    expect(delegated).toEqual(['next']);
  });

  it('starts a fresh wait for the next step', async () => {
    const { handle, next, sleeps } = harness();
    await handle(payload(), next);
    await handle(payload(), next);
    await handle(payload({ step: 2 }), next);
    expect(sleeps).toEqual([1_000, 2_000, 1_000]);
  });

  it('uses a bounded provider Retry-After', async () => {
    const { handle, next, sleeps } = harness();
    await handle(
      payload({ failure: { code: 'RATE_LIMIT', message: '429', providerRetryAfterMs: 7_000 } }),
      next,
    );
    await handle(
      payload({ failure: { code: 'RATE_LIMIT', message: '429', providerRetryAfterMs: 600_000 } }),
      next,
    );
    expect(sleeps).toEqual([7_000, 2_000]);
  });

  it('delegates non-Bot sessions, other failures and always-mode providers', async () => {
    const { handle, next, sleeps, delegated } = harness(false);
    expect(await handle(payload(), next)).toBeUndefined();
    const bot = harness();
    await bot.handle(payload({ failure: { code: 'PI_AI_ERROR', message: 'boom' } }), bot.next);
    await bot.handle(payload({ retryPolicy: { mode: 'always' } }), bot.next);
    expect(sleeps).toEqual([]);
    expect(bot.sleeps).toEqual([]);
    expect([...delegated, ...bot.delegated]).toEqual(['next', 'next', 'next']);
  });

  it('stops waiting when the turn is cancelled', async () => {
    const handle = createBotRequestRetry({
      isBotSession: () => true,
      sleep: async () => false,
    });
    expect(await handle(payload(), async () => ({ kind: 'retry' }))).toBeUndefined();
  });
});
