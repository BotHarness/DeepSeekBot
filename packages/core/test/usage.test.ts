import { describe, expect, it, vi } from 'vitest';

import { mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createUsageProjection, usageLocalDay } from '../src/usage/usage.js';
import { createTempRoot, createTestOwnership, trackTestOwner } from './helpers.js';

const SINCE = '2000-01-01T00:00:00.000Z';
const TURN_END = Date.parse('2026-09-29T03:00:00.000Z');

let seq = 0;
function event(type: string, time: number) {
  return {
    type,
    time,
    seq: seq++,
    data:
      type === 'assistant/message'
        ? {
            message: { source: { provider: 'deepseek', model: 'deepseek-chat' } },
            usage: {
              inputTokens: 100,
              outputTokens: 40,
              cacheReadTokens: 10,
              cacheWriteTokens: 5,
              totalTokens: 155,
            },
            stream: [],
          }
        : {},
  };
}

function usageProjection(seeded: Parameters<typeof createTestOwnership>[0]) {
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('botharness-usage-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const ownership = createTestOwnership(seeded);
  return { usage: createUsageProjection({ ownership, database: owner }), ownership };
}

function expectedDay(time: number): string {
  const date = new Date(time);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

describe('Usage projection', () => {
  it('reads scoped Session totals through the same bucket rules, skips inherited/duplicate events, and makes no writes', async () => {
    const { usage, ownership } = usageProjection({
      root: { botSlug: 'ada', rootRole: 'orchestrator' },
    });
    ownership.claim({
      sessionId: 'child',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      provenance: 'subagent',
      parentSessionId: 'root',
      at: '2026-09-29T00:00:00.000Z',
    });
    const rootEvent = event('assistant/message', TURN_END);
    const childEvent = event('assistant/message', TURN_END);
    const read = vi.fn(async (sessionId: string) => ({
      events: sessionId === 'root' ? [rootEvent, rootEvent] : [rootEvent, childEvent],
      inheritedEventCount: sessionId === 'root' ? 0 : 1,
    }));
    expect(await usage.sessionSummary('ada', 'root', SINCE, read)).toEqual({
      totalTokens: 310,
      status: 'ready',
    });
    expect(usage.activity('ada', SINCE)).toEqual([]);
    expect(await usage.sessionSummary('other', 'root', SINCE, read)).toEqual({
      totalTokens: null,
      status: 'unavailable',
    });
    expect(read).toHaveBeenCalledTimes(2);
    expect(await usage.sessionSummary('ada', 'child', SINCE, read)).toEqual({
      totalTokens: null,
      status: 'unavailable',
    });
    expect(await usage.sessionSummary('ada', 'root', '2099-01-01T00:00:00.000Z', read)).toEqual({
      totalTokens: 0,
      status: 'ready',
    });
  });

  it('keeps absent usage unknown and failed logs unavailable, with a post-read deletion fence', async () => {
    const { usage } = usageProjection({ root: { botSlug: 'ada', rootRole: 'orchestrator' } });
    const missing = { ...event('assistant/message', TURN_END), data: {} };
    expect(
      await usage.sessionSummary('ada', 'root', SINCE, async () => ({
        events: [missing],
        inheritedEventCount: 0,
      })),
    ).toEqual({ totalTokens: null, status: 'unknown' });
    expect(await usage.sessionSummary('ada', 'root', SINCE, async () => undefined)).toEqual({
      totalTokens: null,
      status: 'unavailable',
    });
    const known = event('assistant/message', TURN_END);
    expect(
      await usage.sessionSummary('ada', 'root', SINCE, async () => ({
        events: [missing, known],
        inheritedEventCount: 0,
      })),
    ).toEqual({ totalTokens: 155, status: 'partial' });
    expect(
      await usage.sessionSummary('ada', 'root', SINCE, async () => {
        usage.purgeBot('ada');
        return { events: [known], inheritedEventCount: 0 };
      }),
    ).toEqual({ totalTokens: null, status: 'unavailable' });
  });
  it('refuses malformed inherited prefixes instead of counting them as owned events', async () => {
    const { usage } = usageProjection({ root: { botSlug: 'ada', rootRole: 'orchestrator' } });
    for (const inheritedEventCount of [-1, 0.5, 2, NaN]) {
      expect(
        await usage.sessionSummary('ada', 'root', SINCE, async () => ({
          events: [event('assistant/message', TURN_END)],
          inheritedEventCount,
        })),
      ).toEqual({ totalTokens: null, status: 'unavailable' });
    }
  });
  it('folds a completed turn into one Host-local daily bucket exactly once', () => {
    const { usage } = usageProjection({
      'session-1': { botSlug: 'ada', rootRole: 'orchestrator' },
    });
    usage.handleSessionEvent('session-1', event('turn/start', TURN_END - 1000));
    usage.handleSessionEvent('session-1', event('assistant/message', TURN_END - 500));
    usage.handleSessionEvent('session-1', event('turn/end', TURN_END));

    expect(usage.activity('ada', SINCE)).toEqual([
      {
        day: expectedDay(TURN_END),
        purpose: 'orchestrator',
        provider: 'deepseek',
        model: 'deepseek-chat',
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
        totalTokens: 155,
      },
    ]);
    expect(usageLocalDay(TURN_END)).toBe(expectedDay(TURN_END));
    expect(usage.activity('bea', SINCE)).toEqual([]);

    usage.handleSessionEvent('session-1', event('assistant/message', TURN_END + 1000));
    usage.handleSessionEvent('session-1', event('turn/end', TURN_END + 1000));
    expect(usage.activity('ada', SINCE)).toHaveLength(1);
  });

  it('keeps a replaced Orchestrator Session in the Bot totals and counts its successor separately', async () => {
    const { usage, ownership } = usageProjection({
      archived: { botSlug: 'ada', rootRole: 'orchestrator' },
    });
    ownership.claim({
      sessionId: 'replacement',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      at: '2026-10-12T00:00:00.000Z',
    });
    const logs = {
      archived: [event('assistant/message', TURN_END - 2000)],
      replacement: [event('assistant/message', TURN_END - 1000)],
    };
    for (const [sessionId, events] of Object.entries(logs))
      for (const entry of events) usage.handleSessionEvent(sessionId, entry);

    expect(usage.activity('ada', SINCE)).toMatchObject([
      { purpose: 'orchestrator', inputTokens: 200, outputTokens: 80, totalTokens: 310 },
    ]);
    const readLog = async (sessionId: string) => ({
      events: logs[sessionId as keyof typeof logs] ?? [],
      inheritedEventCount: 0,
    });
    expect(await usage.sessionSummary('ada', 'replacement', SINCE, readLog)).toEqual({
      totalTokens: 155,
      status: 'ready',
    });
    expect(await usage.rebuild(['archived', 'replacement'], readLog)).toMatchObject({
      folded: 0,
      failed: 0,
    });
    expect(usage.activity('ada', SINCE)).toMatchObject([{ totalTokens: 310 }]);
  });

  it('attributes fork-owned work to its trusted root role', () => {
    const { usage, ownership } = usageProjection({
      'session-root': { botSlug: 'ada', rootRole: 'orchestrator' },
    });
    ownership.claim({
      sessionId: 'session-fork',
      botSlug: 'ada',
      rootRole: 'assignment',
      provenance: 'fork',
      parentSessionId: 'session-root',
      at: '2026-09-29T00:00:00.000Z',
    });
    usage.handleSessionEvent('session-fork', event('turn/start', TURN_END - 1000));
    usage.handleSessionEvent('session-fork', event('assistant/message', TURN_END - 500));
    usage.handleSessionEvent('session-fork', event('turn/end', TURN_END));

    expect(usage.activity('ada', SINCE)).toEqual([
      {
        day: expectedDay(TURN_END),
        purpose: 'assignment',
        provider: 'deepseek',
        model: 'deepseek-chat',
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
        totalTokens: 155,
      },
    ]);
  });

  it('rebuilds from durable logs, skipping fork-inherited prefixes, without replacing retained totals', async () => {
    const { usage, ownership } = usageProjection({
      'session-root': { botSlug: 'ada', rootRole: 'orchestrator' },
    });
    ownership.claim({
      sessionId: 'session-fork',
      botSlug: 'ada',
      rootRole: 'assignment',
      provenance: 'fork',
      parentSessionId: 'session-root',
      at: '2026-09-29T00:00:00.000Z',
    });
    const inheritedTurn = [
      event('turn/start', TURN_END - 4000),
      event('assistant/message', TURN_END - 3000),
      event('turn/end', TURN_END - 2000),
    ];
    const ownTurn = [
      event('turn/start', TURN_END - 1000),
      event('assistant/message', TURN_END - 500),
      event('turn/end', TURN_END),
    ];
    const logs = new Map([
      ['session-root', { events: ownTurn, inheritedEventCount: 0 }],
      [
        'session-fork',
        { events: [...inheritedTurn, ...ownTurn], inheritedEventCount: inheritedTurn.length },
      ],
      ['session-unowned', { events: ownTurn, inheritedEventCount: 0 }],
    ]);
    const readLog = async (sessionId: string) => logs.get(sessionId);
    const ids = ['session-root', 'session-fork', 'session-unowned'];

    expect(await usage.rebuild(ids, readLog)).toEqual({ folded: 2, failed: 0 });
    const ordered = [...usage.activity('ada', SINCE)].sort((left, right) =>
      left.purpose.localeCompare(right.purpose),
    );
    expect(ordered).toEqual([
      {
        day: expectedDay(TURN_END),
        purpose: 'assignment',
        provider: 'deepseek',
        model: 'deepseek-chat',
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
        totalTokens: 155,
      },
      {
        day: expectedDay(TURN_END),
        purpose: 'orchestrator',
        provider: 'deepseek',
        model: 'deepseek-chat',
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
        totalTokens: 155,
      },
    ]);

    expect(await usage.rebuild(ids, readLog)).toEqual({ folded: 0, failed: 0 });
    const rebuilt = usage.activity('ada', SINCE);
    expect(rebuilt).toHaveLength(2);
    for (const bucket of rebuilt) {
      expect(bucket).toMatchObject({ inputTokens: 100, outputTokens: 40 });
    }
  });
});

describe('Usage rebuild races', () => {
  function feedTurn(
    usage: ReturnType<typeof createUsageProjection>,
    sessionId: string,
    base: number,
  ): void {
    usage.handleSessionEvent(sessionId, event('turn/start', base));
    usage.handleSessionEvent(sessionId, event('assistant/message', base + 1));
    usage.handleSessionEvent(sessionId, event('turn/end', base + 2));
  }

  it('keeps live turns that complete or stay buffered while a rebuild reads logs', async () => {
    const { usage } = usageProjection({
      'session-1': { botSlug: 'ada', rootRole: 'orchestrator' },
      'session-2': { botSlug: 'ada', rootRole: 'orchestrator' },
    });
    const snapshotTurn = [
      event('turn/start', TURN_END - 3000),
      event('assistant/message', TURN_END - 2000),
      event('turn/end', TURN_END - 1000),
    ];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const readLog = async () => {
      await gate;
      return { events: snapshotTurn, inheritedEventCount: 0 };
    };

    usage.handleSessionEvent('session-2', event('turn/start', TURN_END + 1000));
    const rebuilding = usage.rebuild(['session-1'], readLog);
    await Promise.resolve();

    feedTurn(usage, 'session-1', TURN_END + 2000);
    release();
    expect(await rebuilding).toEqual({ folded: 2, failed: 0 });

    usage.handleSessionEvent('session-2', event('assistant/message', TURN_END + 3000));
    usage.handleSessionEvent('session-2', event('turn/end', TURN_END + 3001));

    const buckets = usage.activity('ada', SINCE);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({ inputTokens: 300, outputTokens: 120 });
  });

  it('does not double count a queued turn already present in the snapshot', async () => {
    const { usage } = usageProjection({
      'session-1': { botSlug: 'ada', rootRole: 'orchestrator' },
    });
    const liveTurn = [
      event('turn/start', TURN_END - 1000),
      event('assistant/message', TURN_END - 500),
      event('turn/end', TURN_END),
    ];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const readLog = async () => {
      await gate;
      return { events: liveTurn, inheritedEventCount: 0 };
    };

    const rebuilding = usage.rebuild(['session-1'], readLog);
    await Promise.resolve();
    for (const queued of liveTurn) usage.handleSessionEvent('session-1', queued);
    release();
    expect(await rebuilding).toEqual({ folded: 1, failed: 0 });
    expect(usage.activity('ada', SINCE)).toHaveLength(1);
    expect(usage.activity('ada', SINCE)[0]).toMatchObject({ inputTokens: 100, outputTokens: 40 });
  });
});
