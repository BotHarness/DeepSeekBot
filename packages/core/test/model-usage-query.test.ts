import { createTestRosterStore } from './roster-fixture.js';
import { createTestRegistry } from './registry-fixture.js';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createChannelStore } from '../src/channels/store.js';
import { mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createUsageProjection, usageLocalDay } from '../src/usage/usage.js';
import { createTempRoot, createTestOwnership, trackTestOwner } from './helpers.js';
import type { DshSessionEvent } from '../src/sessions/source.js';

function setup() {
  const root = createTempRoot('botharness-model-usage-');
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const ownership = createTestOwnership({
    'actual-session': { botSlug: 'ada', rootRole: 'orchestrator' },
  });
  const usage = createUsageProjection({ ownership, database: owner });
  const registry = createTestRegistry({ rootDir: join(root, 'bots') });
  registry.create({ slug: 'ada', displayName: 'Ada', model: 'configured-but-never-called' });
  const channels = createChannelStore({ rootDir: join(root, 'channels') });
  const dm = channels.getOrCreateDm('ada', 'Ada')!;
  const methods = createBridgeMethods({
    registry,
    channels,
    ownership,
    usage,
    states: createBotStateTracker(),
    roster: createTestRosterStore(),
  });
  const time = Date.now();
  const fold = (
    reported?: Record<string, number>,
    next?: Record<string, number>,
    nextModel = 'actual-model',
  ): void => {
    const events: DshSessionEvent[] = [
      { type: 'turn/start', time, data: { turn: 1 } },
      { type: 'step/start', time, data: { turn: 1, step: 1 } },
      {
        type: 'assistant/message',
        time,
        data: {
          turn: 1,
          step: 1,
          message: { source: { provider: 'actual-provider', model: 'actual-model' } },
          stream: [],
          ...(reported === undefined ? {} : { usage: reported }),
        },
      },
      { type: 'step/end', time, data: { turn: 1, step: 1 } },
      { type: 'turn/end', time, data: { turn: 1 } },
    ];
    if (next)
      events.splice(
        events.length - 1,
        0,
        { type: 'step/start', time, data: { turn: 1, step: 2 } },
        {
          type: 'assistant/message',
          time,
          data: {
            turn: 1,
            step: 2,
            message: { source: { provider: 'actual-provider', model: nextModel } },
            stream: [],
            usage: next,
          },
        },
        { type: 'step/end', time, data: { turn: 1, step: 2 } },
      );
    for (const [seq, event] of events.entries())
      usage.handleSessionEvent('actual-session', { ...event, seq });
  };
  return { methods, channels, dm, fold, time, usage, ownership };
}

describe('observed model usage through the Profile query', () => {
  it('attributes four provider buckets and exact total independently of the configured model', () => {
    const { methods, dm, fold, time } = setup();
    fold({
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      totalTokens: 155,
    });
    const result = methods.profileActivity({ channelId: dm.id });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.modelUsageStatus).toBe('ready');
    expect(result.value.modelUsageRows).toEqual([
      {
        day: usageLocalDay(time),
        purpose: 'orchestrator',
        provider: 'actual-provider',
        model: 'actual-model',
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
        totalTokens: 155,
      },
    ]);
  });

  it('derives the one bucket a provider left out from its exact total', () => {
    const { methods, dm, fold } = setup();
    fold({ inputTokens: 100, outputTokens: 40, cacheReadTokens: 10, totalTokens: 155 });
    const result = methods.profileActivity({ channelId: dm.id });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.modelUsageRows[0]).toMatchObject({
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      totalTokens: 155,
    });
  });

  it('counts omitted cache buckets as zero when the reported buckets already make the total', () => {
    const { methods, dm, fold } = setup();
    fold(
      { inputTokens: 22669, outputTokens: 38, totalTokens: 22707 },
      { inputTokens: 248, outputTokens: 1, cacheReadTokens: 22528, totalTokens: 22777 },
    );
    const result = methods.profileActivity({ channelId: dm.id });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.modelUsageRows[0]).toMatchObject({
      inputTokens: 22917,
      outputTokens: 39,
      cacheReadTokens: 22528,
      cacheWriteTokens: 0,
      totalTokens: 45484,
    });
  });

  it('keeps several omitted buckets unknown when the total cannot say how they split', () => {
    const { methods, dm, fold } = setup();
    fold({ inputTokens: 100, outputTokens: 40, totalTokens: 155 });
    const result = methods.profileActivity({ channelId: dm.id });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.modelUsageRows[0]).toMatchObject({
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      totalTokens: 155,
    });
  });

  it('does not accept a total that contradicts the reported buckets', () => {
    const { methods, dm, fold } = setup();
    fold({ inputTokens: 100, outputTokens: 40, cacheReadTokens: 10, totalTokens: 10 });
    const result = methods.profileActivity({ channelId: dm.id });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.modelUsageRows[0]).toMatchObject({
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 10,
      cacheWriteTokens: null,
      totalTokens: null,
    });
  });

  it('preserves reported buckets across same-route settlements with incomplete usage', () => {
    const { methods, dm, fold } = setup();
    fold(
      {
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
        totalTokens: 155,
      },
      { outputTokens: 40, cacheReadTokens: 10, totalTokens: 155 },
    );
    const result = methods.profileActivity({ channelId: dm.id });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.modelUsageRows[0]).toMatchObject({
      provider: 'actual-provider',
      model: 'actual-model',
      inputTokens: null,
      outputTokens: 80,
      cacheReadTokens: 20,
      cacheWriteTokens: null,
      totalTokens: 310,
    });
  });

  it('separates incomplete multi-route usage into its actual routes', () => {
    const { methods, dm, fold } = setup();
    fold(
      {
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
        totalTokens: 155,
      },
      { outputTokens: 40, cacheReadTokens: 10, totalTokens: 155 },
      'other-model',
    );
    const result = methods.profileActivity({ channelId: dm.id });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.modelUsageRows[0]).toMatchObject({
      provider: 'actual-provider',
      model: 'actual-model',
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      totalTokens: 155,
    });
    expect(result.value.modelUsageRows[1]).toMatchObject({
      provider: 'actual-provider',
      model: 'other-model',
      inputTokens: null,
      outputTokens: 40,
      cacheReadTokens: 10,
      cacheWriteTokens: null,
      totalTokens: 155,
    });
  });

  it('shows an actual route with unknown usage instead of a fabricated zero', () => {
    const { methods, dm, fold } = setup();
    fold();
    const result = methods.profileActivity({ channelId: dm.id });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.modelUsageRows[0]).toMatchObject({
      provider: 'actual-provider',
      model: 'actual-model',
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      totalTokens: null,
    });
  });

  it('counts failed and retried settlements by their dispatched routes without a completed Turn', () => {
    const { methods, dm, usage, time } = setup();
    const report = {
      inputTokens: 2,
      outputTokens: 3,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 5,
    };
    const events: DshSessionEvent[] = [
      {
        seq: 0,
        type: 'request/header',
        time,
        data: { header: { config: { provider: 'failed-provider', model: 'failed-model' } } },
      },
      {
        seq: 1,
        type: 'assistant/attempt',
        time,
        data: { stream: [{ chunk: { type: 'usage', usage: report } }] },
      },
      { seq: 2, type: 'llm/retry', time, data: { turn: 1, step: 1 } },
      {
        seq: 3,
        type: 'request/context',
        time,
        data: { provider: 'success-provider', model: 'success-model' },
      },
      {
        seq: 4,
        type: 'assistant/message',
        time,
        surfaceOp: 'append',
        data: {
          message: { source: { provider: 'success-provider', model: 'success-model' } },
          usage: report,
        },
      },
    ];
    for (const event of events) usage.handleSessionEvent('actual-session', event);
    for (const event of events) usage.handleSessionEvent('actual-session', event);
    const result = methods.profileActivity({ channelId: dm.id });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.modelUsageRows).toHaveLength(2);
    expect(result.value.modelUsageRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'failed-provider',
          model: 'failed-model',
          totalTokens: 5,
        }),
        expect.objectContaining({
          provider: 'success-provider',
          model: 'success-model',
          totalTokens: 5,
        }),
      ]),
    );
    usage.handleSessionEvent('actual-session', {
      ...events[4]!,
      seq: 5,
      surfaceOp: { op: 'replace', startSeq: 4, endSeq: 4 },
    });
    const after = methods.profileActivity({ channelId: dm.id });
    if (!after.ok) throw new Error(after.error.message);
    expect(after.value.modelUsageRows).toEqual(result.value.modelUsageRows);
  });

  it('uses only trusted ownership for root, Assignment and Subagent usage', () => {
    const { methods, dm, usage, ownership, time } = setup();
    ownership.claim({
      sessionId: 'assignment',
      botSlug: 'ada',
      rootRole: 'assignment',
      at: new Date(time).toISOString(),
    });
    ownership.claim({
      sessionId: 'child',
      botSlug: 'ada',
      rootRole: 'assignment',
      provenance: 'subagent',
      parentSessionId: 'assignment',
      at: new Date(time).toISOString(),
    });
    const event: DshSessionEvent = {
      seq: 1,
      type: 'assistant/message',
      time,
      data: {
        message: { source: { provider: 'provider', model: 'model' } },
        usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    };
    for (const sessionId of ['actual-session', 'assignment', 'child', 'unowned'])
      usage.handleSessionEvent(sessionId, event);
    const result = methods.profileActivity({ channelId: dm.id });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.modelUsageRows.map((row) => row.purpose).sort()).toEqual([
      'assignment',
      'orchestrator',
      'subagent',
    ]);
    expect(result.value.modelUsageRows.every((row) => row.totalTokens === 3)).toBe(true);
  });

  it('retains unknown failed attempts independently of a successful route', () => {
    const { methods, dm, usage, fold, time } = setup();
    usage.handleSessionEvent('actual-session', {
      seq: 100,
      type: 'assistant/attempt',
      time,
      data: { stream: [] },
    });
    fold({
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      totalTokens: 155,
    });
    const result = methods.profileActivity({ channelId: dm.id });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.modelUsageRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'actual-provider',
          model: 'actual-model',
          totalTokens: 155,
        }),
        expect.objectContaining({
          provider: 'unknown',
          model: 'unknown',
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
        }),
      ]),
    );
  });

  it('primes the persisted request route on resume and keeps independent unknown buckets', () => {
    const { methods, dm, usage, time } = setup();
    usage.primeSession('actual-session', [
      {
        seq: 0,
        type: 'request/context',
        time,
        data: { provider: 'resumed-provider', model: 'resumed-model' },
      },
    ]);
    usage.handleSessionEvent('actual-session', {
      seq: 1,
      type: 'assistant/attempt',
      time,
      data: {
        stream: [
          { chunk: { type: 'usage', usage: { inputTokens: 7, outputTokens: 2, totalTokens: 12 } } },
        ],
      },
    });
    usage.handleSessionEvent('actual-session', {
      seq: 2,
      type: 'assistant/attempt',
      time,
      data: {
        stream: [
          {
            chunk: {
              type: 'usage',
              usage: {
                inputTokens: 0,
                outputTokens: 0,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
                totalTokens: 0,
              },
            },
          },
        ],
      },
    });
    const result = methods.profileActivity({ channelId: dm.id });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.modelUsageRows).toEqual([
      expect.objectContaining({
        provider: 'resumed-provider',
        model: 'resumed-model',
        inputTokens: 7,
        outputTokens: 2,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        totalTokens: 12,
      }),
    ]);
  });

  it('attributes a late settlement to the route preceding its durable sequence', () => {
    const { methods, dm, usage, time } = setup();
    usage.primeSession('actual-session', [
      {
        seq: 0,
        type: 'request/context',
        time,
        data: { provider: 'earlier', model: 'earlier-model' },
      },
      { seq: 2, type: 'request/context', time, data: { provider: 'later', model: 'later-model' } },
    ]);
    usage.handleSessionEvent('actual-session', {
      seq: 1,
      type: 'assistant/attempt',
      time,
      data: {
        stream: [
          {
            chunk: {
              type: 'usage',
              usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 },
            },
          },
        ],
      },
    });
    const result = methods.profileActivity({ channelId: dm.id });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.modelUsageRows).toEqual([
      expect.objectContaining({ provider: 'earlier', model: 'earlier-model', totalTokens: 3 }),
    ]);
  });

  it('marks invalid explicit provider counts unknown without replacing them with a computed total', () => {
    const { methods, dm, fold } = setup();
    fold({
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      totalTokens: -1,
    });
    const result = methods.profileActivity({ channelId: dm.id });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.modelUsageRows[0]).toMatchObject({ totalTokens: null, inputTokens: 100 });
  });

  it('rejects a non-DM channel rather than exposing other usage', () => {
    const { methods, channels } = setup();
    const group = channels.createGroup({ name: 'Group', members: [] });
    expect(methods.profileActivity({ channelId: group.id }).ok).toBe(false);
  });
});
