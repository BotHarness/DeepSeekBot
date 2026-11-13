import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
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
import type { UsageFilter } from '../src/usage/query.js';
import { createTempRoot, createTestOwnership, trackTestOwner } from './helpers.js';

function setup() {
  const root = createTempRoot('botharness-filtered-usage-');
  const database = trackTestOwner(
    mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const ownership = createTestOwnership({
    orchestrator: { botSlug: 'ada', rootRole: 'orchestrator' },
    assignment: { botSlug: 'ada', rootRole: 'assignment' },
    other: { botSlug: 'bea', rootRole: 'orchestrator' },
  });
  ownership.claim({
    sessionId: 'child',
    botSlug: 'ada',
    rootRole: 'assignment',
    provenance: 'subagent',
    parentSessionId: 'assignment',
    at: new Date().toISOString(),
  });
  const usage = createUsageProjection({ ownership, database });
  const registry = createTestRegistry({ rootDir: join(root, 'bots') });
  registry.create({ slug: 'ada', displayName: 'Ada' });
  registry.create({ slug: 'bea', displayName: 'Bea' });
  const channels = createChannelStore({ rootDir: join(root, 'channels') });
  const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
    registry,
    channels,
    ownership,
    usage,
    states: createBotStateTracker(),
    roster: createTestRosterStore(),
  });
  let seq = 0;
  const time = Date.now();
  const today = usageLocalDay(time);
  const filter: UsageFilter = { start: today, end: today };
  function fold(
    session: string,
    provider: string,
    model: string,
    count: number | undefined,
    at = time,
  ) {
    usage.handleSessionEvent(session, {
      seq: ++seq,
      type: 'assistant/message',
      time: at,
      data: {
        message: { source: { provider, model } },
        ...(count === undefined
          ? {}
          : {
              usage: {
                inputTokens: count,
                outputTokens: 0,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
                totalTokens: count,
              },
            }),
      },
    });
  }
  function query(input: UsageFilter = filter) {
    const result = methods.profileUsage({ channelId: dm.id, filter: input });
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  }
  return { methods, dm, usage, query, filter, fold, time };
}

describe('bounded retained Profile usage queries', () => {
  it('filters actual model, provider and role consistently while all-time ignores only date and stays Bot scoped', () => {
    const { fold, query, filter, time } = setup();
    fold('orchestrator', 'a', 'shared', 10);
    fold('assignment', 'b', 'shared', 20);
    fold('child', 'b', 'other', 30);
    fold('orchestrator', 'a', 'shared', 40, time - 400 * 86_400_000);
    fold('other', 'a', 'shared', 999);
    expect(query()).toMatchObject({
      periodTotal: 60,
      allTimeTotal: 100,
      periodRecords: 3,
      allTimeRecords: 4,
      models: ['other', 'shared'],
      providers: ['a', 'b'],
    });
    expect(query({ ...filter, model: 'shared' })).toMatchObject({
      periodTotal: 30,
      allTimeTotal: 70,
    });
    expect(query({ ...filter, provider: 'b' })).toMatchObject({
      periodTotal: 50,
      allTimeTotal: 50,
    });
    expect(query({ ...filter, model: 'shared', purpose: 'assignment' })).toMatchObject({
      periodTotal: 20,
      allTimeTotal: 20,
    });
    expect(query({ ...filter, purpose: 'subagent' }).rows).toHaveLength(1);
    expect(query({ ...filter, model: 'unused' })).toMatchObject({
      rows: [],
      periodTotal: 0,
      allTimeTotal: 0,
      periodRecords: 0,
    });
  });
  it('separates unknown from empty and retains totals with degraded reconciliation', async () => {
    const { fold, query, filter, usage } = setup();
    fold('orchestrator', 'a', 'known', 10);
    fold('assignment', 'b', 'unknown', undefined);
    expect(query()).toMatchObject({ periodTotal: null, allTimeTotal: null, periodRecords: 2 });
    expect(query({ ...filter, model: 'known' }).periodTotal).toBe(10);
    let finish: (value: undefined) => void = () => {};
    const rebuild = usage.rebuild(
      ['orchestrator'],
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    expect(query().freshness).toBe('reconciling');
    finish(undefined);
    await rebuild;
    expect(query()).toMatchObject({ freshness: 'degraded', periodRecords: 2 });
    await usage.rebuild([], async () => undefined);
    expect(query().freshness).toBe('ready');
    expect(query().reconciledAt).not.toBeNull();
  });
  it('rejects invalid dates, future dates, unsupported roles and ranges over 182 days at the public boundary', () => {
    const { methods, dm, filter, usage } = setup();
    for (const input of [
      { ...filter, start: '2026-02-31' },
      { ...filter, start: '2020-01-01' },
      { ...filter, end: '9999-12-31' },
      { ...filter, purpose: 'invented' },
      { ...filter, model: '' },
    ])
      expect(methods.profileUsage({ channelId: dm.id, filter: input })).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
    expect(() => usage.query('ada', { start: '2020-01-01', end: filter.end })).toThrow();
    expect(methods.profileUsage({ channelId: 'unknown', filter })).toMatchObject({ ok: false });
  });
  it('caps detail rows while exact period and all-time totals remain complete', () => {
    const { fold, query, filter } = setup();
    for (let index = 0; index < 2003; ++index) fold('orchestrator', 'provider', `m${index}`, 1);
    expect(query()).toMatchObject({
      truncated: true,
      facetsTruncated: true,
      periodTotal: 2003,
      allTimeTotal: 2003,
    });
    expect(query().rows).toHaveLength(2000);
    expect(query({ ...filter, model: 'm0' })).toMatchObject({ truncated: false, periodTotal: 1 });
  });
});
