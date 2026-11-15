import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createUsageProjection } from '../src/usage/usage.js';
import { createSessionOwnership } from '../src/sessions/ownership.js';
import { startTokenUsage } from '../src/telemetry/token-usage.js';
import { createTelemetryService, type TelemetryBatch } from '../src/telemetry/service.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const now = new Date('2026-11-15T12:00:00Z');
const counts = {
  inputTokens: 100,
  outputTokens: 40,
  cacheReadTokens: 10,
  cacheWriteTokens: 5,
  totalTokens: 155,
};

function fixture() {
  const dataDir = createTempRoot('token-telemetry-');
  const database = trackTestOwner(
    mountOperationalDatabase({ dshHome: dataDir, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const ownership = createSessionOwnership(attachOperationalModule(database, 'session-ownership'));
  for (const [sessionId, rootRole] of [
    ['root', 'orchestrator'],
    ['assignment', 'assignment'],
  ] as const)
    ownership.claim({ sessionId, botSlug: 'private-bot', rootRole, at: '2026-11-15T00:00:00Z' });
  ownership.claim({
    sessionId: 'child',
    botSlug: 'private-bot',
    rootRole: 'orchestrator',
    parentSessionId: 'root',
    provenance: 'subagent',
    at: '2026-11-15T00:00:00Z',
  });
  const usage = createUsageProjection({ database, ownership, now: () => now });
  const batches: TelemetryBatch[] = [];
  const telemetry = createTelemetryService({
    dataDir,
    decision: { enabled: true },
    pluginVersion: '0.0.0-qa.4255',
    now: () => now,
    send: async (batch) => {
      batches.push(batch);
    },
  });
  const event = (
    seq: number,
    usageData: Record<string, number> = counts,
    time = now.getTime(),
  ) => ({
    type: 'assistant/message',
    seq,
    time,
    data: {
      message: { source: { provider: 'private-provider', model: 'private-model' } },
      usage: usageData,
      stream: [],
    },
  });
  return { dataDir, database, ownership, usage, telemetry, batches, event };
}

afterEach(() => vi.useRealTimers());

describe('anonymous token snapshots', () => {
  it('reports promptly after startup reconciliation and then waits for the hourly check', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.usage.handleSessionEvent('root', f.event(1));
    const capture = vi.fn();
    const snapshot = vi.fn(() => f.usage.telemetrySnapshot());
    const stop = startTokenUsage({ telemetry: { enabled: true, capture }, snapshot });
    expect(capture).not.toHaveBeenCalled();
    await f.usage.rebuild([], async () => undefined);
    await vi.advanceTimersByTimeAsync(1000);
    expect(capture).toHaveBeenCalledTimes(7);
    f.usage.handleSessionEvent('child', f.event(1));
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(capture).toHaveBeenLastCalledWith(
      'app:token_usage_report',
      expect.objectContaining({ total_token_count: 310 }),
    );
    stop();
    const reads = snapshot.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(snapshot).toHaveBeenCalledTimes(reads);
    await f.telemetry.close();
  });
  it('matches owned Session totals, includes children and assignments, and excludes native Sessions and replay', async () => {
    const f = fixture();
    for (const session of ['root', 'child', 'assignment', 'native'])
      f.usage.handleSessionEvent(session, f.event(1));
    f.usage.handleSessionEvent('root', f.event(1));
    expect(f.usage.telemetrySnapshot()).toBeUndefined();
    await f.usage.rebuild([], async () => undefined);
    const days = f.usage.telemetrySnapshot()?.days;
    expect(days).toHaveLength(7);
    expect(days?.at(-1)).toMatchObject({
      inputTokens: 300,
      outputTokens: 120,
      cacheReadTokens: 30,
      cacheWriteTokens: 15,
      totalTokens: 465,
      reportedTotalTokens: 465,
      unknownTotalCount: 0,
    });
    expect(f.usage.overview('week').totals.totalTokens).toBe(465);
    const stop = startTokenUsage({
      telemetry: f.telemetry,
      snapshot: () => f.usage.telemetrySnapshot(),
    });
    stop();
    await f.telemetry.close();
    const events = f.batches.flatMap((batch) => batch.batch);
    expect(events).toHaveLength(7);
    expect(events.at(-1)).toMatchObject({
      event: 'app:token_usage_report',
      properties: {
        input_token_count: 300,
        output_token_count: 120,
        cache_read_token_count: 30,
        cache_write_token_count: 15,
        total_token_count: 465,
        reported_total_token_count: 465,
        unknown_total_count: 0,
        is_partial: false,
      },
    });
    const wire = JSON.stringify(events);
    for (const secret of [
      'private-bot',
      'private-provider',
      'private-model',
      'session_id',
      'human_id',
      'content',
    ])
      expect(wire).not.toContain(secret);
  });

  it('omits unknown exact buckets and preserves the reported lower bound', async () => {
    const f = fixture();
    f.usage.handleSessionEvent('root', f.event(1));
    f.usage.handleSessionEvent('root', f.event(2, { inputTokens: 20, outputTokens: 10 }));
    await f.usage.rebuild([], async () => undefined);
    const stop = startTokenUsage({
      telemetry: f.telemetry,
      snapshot: () => f.usage.telemetrySnapshot(),
    });
    stop();
    await f.telemetry.close();
    const properties = f.batches[0]?.batch.at(-1)?.properties;
    expect(properties).toMatchObject({
      input_token_count: 120,
      output_token_count: 50,
      reported_total_token_count: 185,
      unknown_total_count: 1,
      is_partial: true,
    });
    expect(properties).not.toHaveProperty('total_token_count');
    expect(properties).not.toHaveProperty('cache_read_token_count');
    expect(properties).not.toHaveProperty('cache_write_token_count');
  });

  it('keeps all-unknown usage distinct from zero', async () => {
    const f = fixture();
    f.usage.handleSessionEvent('root', f.event(1, {}));
    await f.usage.rebuild([], async () => undefined);
    const days = f.usage.telemetrySnapshot()?.days;
    expect(days?.at(-1)).toMatchObject({
      totalTokens: null,
      inputTokens: null,
      outputTokens: null,
      reportedTotalTokens: 0,
      unknownTotalCount: 1,
    });
    await f.telemetry.close();
  });

  it('survives replay and projection restart, and replaces purged-day usage with zero', async () => {
    const f = fixture();
    const rootEvent = f.event(1);
    const childEvent = f.event(2);
    const read = async (id: string) => ({
      events: id === 'root' ? [rootEvent] : [rootEvent, childEvent],
      inheritedEventCount: id === 'root' ? 0 : 1,
    });
    const rebuilding = f.usage.rebuild(['root', 'child'], read);
    expect(f.usage.telemetrySnapshot()).toBeUndefined();
    await rebuilding;
    const before = f.usage.telemetrySnapshot();
    expect(before?.days.at(-1)?.totalTokens).toBe(310);
    const restarted = createUsageProjection({
      database: f.database,
      ownership: f.ownership,
      now: () => now,
    });
    expect(restarted.telemetrySnapshot()).toBeUndefined();
    await restarted.rebuild(['root', 'child'], read);
    expect(restarted.telemetrySnapshot()).toEqual(before);
    restarted.purgeBot('private-bot');
    expect(restarted.telemetrySnapshot()?.days.at(-1)).toMatchObject({
      totalTokens: 0,
      reportedTotalTokens: 0,
      unknownTotalCount: 0,
    });
    await f.telemetry.close();
  });

  it('bounds snapshots to seven Host-local days and flags incomplete reconciliation without discarding retained usage', async () => {
    const f = fixture();
    const date = new Date(now);
    date.setDate(date.getDate() - 7);
    f.usage.handleSessionEvent('root', f.event(1, counts, date.getTime()));
    date.setDate(date.getDate() + 1);
    f.usage.handleSessionEvent('root', f.event(2, counts, date.getTime()));
    f.usage.handleSessionEvent('root', f.event(3));
    await f.usage.rebuild(['root'], async () => undefined);
    expect(f.usage.telemetrySnapshot()?.isReconciled).toBe(false);
    await f.usage.rebuild([], async () => undefined);
    expect(f.usage.telemetrySnapshot()?.days.filter((day) => day.totalTokens === 155)).toHaveLength(
      2,
    );
    await f.telemetry.close();
  });

  it('sends changed snapshots, resends after restart, and isolates capture failures and opt-out', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.usage.handleSessionEvent('root', f.event(1));
    await f.usage.rebuild([], async () => undefined);
    const capture = vi.fn();
    const telemetry = { enabled: true, capture };
    const days = vi.fn(() => f.usage.telemetrySnapshot());
    let stop = startTokenUsage({ telemetry, snapshot: days, intervalMs: 1000 });
    expect(capture).toHaveBeenCalledTimes(7);
    await vi.advanceTimersByTimeAsync(1000);
    expect(capture).toHaveBeenCalledTimes(7);
    f.usage.handleSessionEvent('child', f.event(1));
    await vi.advanceTimersByTimeAsync(1000);
    expect(capture).toHaveBeenCalledTimes(8);
    stop();
    stop = startTokenUsage({ telemetry, snapshot: days, intervalMs: 1000 });
    expect(capture).toHaveBeenCalledTimes(15);
    telemetry.enabled = false;
    const reads = days.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(days).toHaveBeenCalledTimes(reads);
    telemetry.enabled = true;
    capture.mockImplementationOnce(() => {
      throw new Error('transport');
    });
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(capture).toHaveBeenLastCalledWith(
      'app:token_usage_report',
      expect.objectContaining({ total_token_count: 310 }),
    );
    stop();
    await f.telemetry.close();
  });
});
