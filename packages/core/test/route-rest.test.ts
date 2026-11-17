import { describe, expect, it } from 'vitest';

import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import {
  createRouteRests,
  DEFAULT_REST_MS,
  LONG_RETRY_AFTER_MS,
  quotaRestMs,
} from '../src/models/route-rest.js';
import { createCore } from '../src/plugin.js';
import {
  createBotRequestRetry,
  type RequestErrorPayload,
} from '../src/runtime/bot-request-retry.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const SPENT = { provider: 'opencode-go', model: 'deepseek-v4.1-flash' };

describe('Quota exhaustion is recognized (#4414)', () => {
  it('treats the real OpenCode Go weekly-limit 429 as a spent quota until its Retry-After', () => {
    expect(
      quotaRestMs({ code: 'RATE_LIMIT', status: 429, providerRetryAfterMs: 452_761_000 }),
    ).toBe(452_761_000);
  });

  it('rests until the reset the provider names in its refusal text', () => {
    const message =
      '429 {"type":"error","error":{"type":"GoUsageLimitError","message":"OpenCode Go usage limit reached (weekly, resets in 5d 5h). To keep going now, turn on Extra Usage"}}';
    expect(quotaRestMs({ code: 'QUOTA', message })).toBe((5 * 24 + 5) * 3_600_000);
    expect(quotaRestMs({ code: 'QUOTA', message: 'Your quota will reset after 3h19m30s.' })).toBe(
      (3 * 3600 + 19 * 60 + 30) * 1000,
    );
  });

  it.each(['QUOTA', 'ACCOUNT_QUOTA', 'QUOTA_EXCEEDED'])(
    'treats %s as a spent quota, resting the default when no reset is named',
    (code) => {
      expect(quotaRestMs({ code })).toBe(DEFAULT_REST_MS);
      expect(quotaRestMs({ code, providerRetryAfterMs: 5_000 })).toBe(5_000);
    },
  );

  it('leaves short rate limits and other failures to the existing recovery', () => {
    expect(
      quotaRestMs({ code: 'RATE_LIMIT', status: 429, providerRetryAfterMs: LONG_RETRY_AFTER_MS }),
    ).toBeUndefined();
    expect(quotaRestMs({ code: 'RATE_LIMIT' })).toBeUndefined();
    expect(quotaRestMs({ code: 'CONTEXT_WINDOW_EXCEEDED' })).toBeUndefined();
    expect(
      quotaRestMs({ code: 'SERVER', status: 503, providerRetryAfterMs: 120_000 }),
    ).toBeUndefined();
  });

  it('rests a route Host-wide until it expires, keeping the later reset', () => {
    let clock = 1_000;
    const rests = createRouteRests({ now: () => clock });
    rests.rest(SPENT, 10_000);
    rests.rest(SPENT, 5_000);
    expect(rests.restingUntil(SPENT)?.until).toBe(new Date(10_000).toISOString());
    expect(rests.restingUntil({ provider: 'deepseek', model: SPENT.model })).toBeUndefined();
    clock = 10_000;
    expect(rests.restingUntil(SPENT)).toBeUndefined();
    expect(rests.list()).toEqual([]);
  });
});

describe('Model request retry stops waiting on a spent quota (#4414)', () => {
  function payload(failure: RequestErrorPayload['failure']): RequestErrorPayload {
    return {
      agent: { session: { id: 'orchestrator-ada' }, model: { current: () => SPENT } },
      turn: 1,
      step: 1,
      provider: SPENT.provider,
      failure,
      retryPolicy: { mode: 'normal' },
      signal: new AbortController().signal,
    };
  }

  it('hands a long Retry-After straight back without sleeping and rests the route', async () => {
    const sleeps: number[] = [];
    const rested: unknown[] = [];
    const handle = createBotRequestRetry({
      isBotSession: () => true,
      now: () => 0,
      sleep: async (ms) => {
        sleeps.push(ms);
        return true;
      },
      onQuotaExhausted: (route, untilMs) => rested.push({ ...route, untilMs }),
    });
    const action = await handle(
      payload({
        code: 'RATE_LIMIT',
        status: 429,
        message: 'OpenCode Go usage limit reached (weekly, resets in 5d 5h)',
        providerRetryAfterMs: 452_761_000,
      }),
      async () => undefined,
    );
    expect(action).toBeUndefined();
    expect(sleeps).toEqual([]);
    expect(rested).toEqual([{ ...SPENT, untilMs: 452_761_000 }]);
  });

  it('never retries QUOTA on the same route', async () => {
    const sleeps: number[] = [];
    const handle = createBotRequestRetry({
      isBotSession: () => true,
      sleep: async (ms) => {
        sleeps.push(ms);
        return true;
      },
    });
    const failure = { code: 'QUOTA', message: 'insufficient balance' };
    expect(await handle(payload(failure), async () => undefined)).toBeUndefined();
    expect(sleeps).toEqual([]);
  });
});

describe('A Bot on a resting route is held, naming the route and its reset (#4414)', () => {
  it('holds after a quota failure, and holds a second Bot without sending a request', async () => {
    let clock = Date.parse('2026-11-18T00:00:00.000Z');
    const rests = createRouteRests({ now: () => clock });
    const until = clock + 452_761_000;
    const runs: string[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        runs.push(run.bot.slug);
        rests.rest(SPENT, until);
        throw Object.assign(new Error('RATE_LIMIT: OpenCode Go usage limit reached'), {
          code: 'RATE_LIMIT',
        });
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({
      dshHome: createTempRoot('bh-route-rest-'),
      agents,
      routeRests: rests,
      sessionRoute: () => SPENT,
      autoContinueDelaysMs: [1],
    });
    async function dm(slug: string, id: string) {
      const channel = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, slug, slug)!;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, channel.id, {
        id,
        at: new Date(clock).toISOString(),
        author: { kind: 'human' },
        body: 'Hello',
      });
      core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: channel.id,
        messageId: id,
        body: 'Hello',
      });
      await core.runtime.whenIdle();
    }
    const quotaNotices = (slug: string) =>
      core.channels
        .readMessages(`dm-${slug}`)
        .filter((message) => message.turnStop?.cause === 'quota');
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'cy', displayName: 'Cy' });

      await dm('ada', 'ada-1');
      expect(runs).toEqual(['ada']);
      expect(core.runtime.heldCause?.('ada')).toBe('quota');
      expect(quotaNotices('ada')).toHaveLength(1);
      expect(quotaNotices('ada')[0]).toMatchObject({
        author: { kind: 'system' },
        turnStop: {
          botSlug: 'ada',
          held: true,
          cause: 'quota',
          rests: [{ ...SPENT, until: new Date(until).toISOString() }],
        },
      });

      await dm('cy', 'cy-1');
      expect(runs).toEqual(['ada']);
      expect(core.runtime.heldCause?.('cy')).toBe('quota');
      expect(quotaNotices('cy')).toHaveLength(1);
      expect(
        core.channels.readMessages('dm-cy').filter((message) => message.sessionFailure),
      ).toEqual([]);

      clock = until;
      await dm('cy', 'cy-2');
      expect(runs).toEqual(['ada', 'cy']);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
