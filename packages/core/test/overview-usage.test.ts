import { fallbackPrimaryColor, resolveBotPrimaryColor } from '../src/bots/primary-color.js';
import { createTestRosterStore } from './roster-fixture.js';
import { createTestRegistry } from './registry-fixture.js';
import { join } from 'node:path';

import { expect, it, vi } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createChannelStore } from '../src/channels/store.js';
import { mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createUsageProjection, usageLocalDay } from '../src/usage/usage.js';
import { createTempRoot, createTestOwnership, trackTestOwner } from './helpers.js';
import type { DshSessionEvent } from '../src/sessions/source.js';

function setup(now?: () => Date) {
  const root = createTempRoot('botharness-model-usage-');
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const ownership = createTestOwnership({
    'actual-session': { botSlug: 'ada', rootRole: 'orchestrator' },
  });
  const usage = createUsageProjection({ ownership, database: owner, ...(now ? { now } : {}) });
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
  const time = now?.().getTime() ?? Date.now();
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
  return { methods, channels, dm, fold, time, usage, ownership, registry, owner };
}

it('reads today and seven-day observed usage through Overview without inventing missing buckets', () => {
  const { methods, dm, fold, time } = setup();
  fold({ inputTokens: 100, outputTokens: 40, totalTokens: 155 });
  const result = methods.overviewUsage({ period: 'week' });
  if (!result.ok) throw new Error(result.error.message);
  expect(result.value.days).toHaveLength(7);
  expect(result.value.totals).toMatchObject({
    inputTokens: 100,
    outputTokens: 40,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    totalTokens: 155,
  });
  expect(result.value.bots).toEqual([
    expect.objectContaining({ slug: 'ada', displayName: 'Ada', current: true, totalTokens: 155 }),
  ]);
  const profile = methods.profileUsage({
    channelId: dm.id,
    filter: { start: result.value.start, end: result.value.end },
  });
  expect(profile.ok && profile.value.periodTotal).toBe(155);
  expect(result.value.end).toBe(usageLocalDay(time));
  expect(methods.overviewUsage({ period: 'forever' }).ok).toBe(false);
});

it('reports each usage row with its current Bot Primary Color source, or the ID fallback', () => {
  const { methods, fold, usage, ownership, registry, time } = setup();
  fold({ inputTokens: 100, outputTokens: 40, totalTokens: 140 });
  for (const slug of ['gone', 'unknown']) {
    ownership.claim({
      sessionId: slug,
      botSlug: slug,
      rootRole: 'orchestrator',
      provenance: 'created',
      at: new Date(time).toISOString(),
    });
    usage.handleSessionEvent(slug, {
      type: 'assistant/message',
      seq: 1,
      time,
      data: {
        message: { source: { provider: 'actual', model: 'used' } },
        usage: { inputTokens: 5, outputTokens: 0, totalTokens: 5 },
      },
    });
  }
  expect(registry.create({ slug: 'gone', displayName: 'Gone' }).ok).toBe(true);
  expect(registry.setPrimaryColor('gone', { mode: 'custom', color: '#1d1b22' }).ok).toBe(true);
  const rows = () => {
    const result = methods.overviewUsage({ period: 'today' });
    if (!result.ok) throw new Error(result.error.message);
    return Object.fromEntries(result.value.bots.map((bot) => [bot.slug, bot]));
  };
  const live = rows();
  expect(live['ada']).toMatchObject({
    current: true,
    primaryColor: resolveBotPrimaryColor(registry.get('ada')!).color,
    totalTokens: 140,
  });
  expect(live['gone']).toMatchObject({ current: true, primaryColor: '#1d1b22', totalTokens: 5 });
  expect(live['unknown']).toMatchObject({
    current: false,
    primaryColor: fallbackPrimaryColor('unknown'),
  });

  expect(registry.setPrimaryColor('ada', { mode: 'custom', color: '#abcdef' }).ok).toBe(true);
  const after = rows();
  expect(after['ada']).toMatchObject({ current: true, primaryColor: '#abcdef', totalTokens: 140 });
});

it('keeps global totals independent of Bot pages and excludes days outside the Host-local range', () => {
  const { methods, usage, ownership, registry, time } = setup();
  const day = new Date(time);
  const yesterday = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1, 12).getTime();
  const tooOld = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 7, 12).getTime();
  for (let i = 1; i <= 23; i++) {
    const slug = 'bot-' + String(i).padStart(2, '0');
    ownership.claim({
      sessionId: slug,
      botSlug: slug,
      rootRole: i % 2 ? 'orchestrator' : 'assignment',
      provenance: 'created',
      at: new Date(time).toISOString(),
    });
    const sample = {
      type: 'assistant/message',
      seq: 1,
      time,
      data: {
        message: { source: { provider: 'actual', model: 'used' } },
        usage: {
          inputTokens: 10,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 10,
        },
      },
    };
    usage.handleSessionEvent(slug, sample);
    usage.handleSessionEvent(slug, sample);
  }
  usage.handleSessionEvent('actual-session', {
    type: 'assistant/message',
    seq: 1,
    time: yesterday,
    data: {
      message: { source: { provider: 'actual', model: 'other' } },
      usage: {
        inputTokens: 50,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 50,
      },
    },
  });
  usage.handleSessionEvent('actual-session', {
    type: 'assistant/message',
    seq: 2,
    time: tooOld,
    data: {
      message: { source: { provider: 'actual', model: 'old' } },
      usage: {
        inputTokens: 1000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 1000,
      },
    },
  });
  const query = (period: 'today' | 'week', after?: string) => {
    const result = methods.overviewUsage({ period, ...(after ? { after } : {}) });
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  };
  const first = query('today');
  expect(first.totals.totalTokens).toBe(230);
  expect(first.bots).toHaveLength(20);
  expect(first.nextCursor).toBe('bot-20');
  const second = query('today', first.nextCursor);
  expect(second.totals.totalTokens).toBe(230);
  expect(second.bots.map((row) => row.slug)).toEqual(['bot-21', 'bot-22', 'bot-23']);
  expect(second.nextCursor).toBeUndefined();
  expect(first.bots[0]).toMatchObject({ current: false, displayName: 'bot-01' });
  expect(query('week').totals.totalTokens).toBe(280);
  expect(query('week').days.at(-2)?.totalTokens).toBe(50);
  registry.update('ada', { displayName: 'Renamed Ada' });
  expect(query('week').bots[0]).toMatchObject({
    slug: 'ada',
    displayName: 'Renamed Ada',
    current: true,
  });
  const late = {
    type: 'assistant/message',
    seq: 3,
    time,
    data: {
      message: { source: { provider: 'actual', model: 'late' } },
      usage: {
        inputTokens: 7,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 7,
      },
    },
  };
  usage.handleSessionEvent('actual-session', late);
  expect(query('today').totals.totalTokens).toBe(237);
});

it('distinguishes a ready empty interval from missing provider usage and an unavailable owner', () => {
  const { methods, usage, time, registry, channels, ownership } = setup();
  const missing = createBridgeMethods({
    registry,
    channels,
    ownership,
    states: createBotStateTracker(),
    roster: createTestRosterStore(),
  });
  expect(missing.overviewUsage({ period: 'today' })).toMatchObject({
    ok: false,
    error: { code: 'storage-unavailable', message: 'Usage statistics unavailable' },
  });
  const empty = methods.overviewUsage({ period: 'today' });
  expect(empty.ok && empty.value.totals.totalTokens).toBe(0);
  usage.handleSessionEvent('actual-session', {
    type: 'assistant/message',
    seq: 1,
    time,
    data: { message: { source: { provider: 'actual', model: 'missing' } } },
  });
  const unknown = methods.overviewUsage({ period: 'today' });
  expect(unknown.ok && unknown.value.totals.totalTokens).toBeNull();
  expect(unknown.ok && unknown.value.days[0]?.inputTokens).toBeNull();
});

it('uses seven local calendar dates across a daylight-saving change', () => {
  vi.stubEnv('TZ', 'America/New_York');
  try {
    const { methods } = setup(() => new Date('2026-03-09T03:30:00-04:00'));
    const result = methods.overviewUsage({ period: 'week' });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.start).toBe('2026-03-03');
    expect(result.value.end).toBe('2026-03-09');
    expect(result.value.days.map((row) => row.day)).toEqual([
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
    ]);
    expect(result.value.nextRefreshAt).toBe('2026-03-10T04:00:00.000Z');
  } finally {
    vi.unstubAllEnvs();
  }
});
