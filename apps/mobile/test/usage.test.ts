import { describe, expect, it } from 'vitest';

import { createHostClient, MethodRefused } from '../src/host/client';
import {
  loadMemoryActivity,
  loadMoreMemoryActivity,
  loadMoreUsage,
  loadUsage,
  usageIsPartial,
  usageShare,
  usageWeek,
  usageChartDays,
  type OverviewMemory,
  type OverviewUsage,
} from '../src/host/usage';
import { FakeHost } from './fake-host';
import { trailingDays } from '../src/host/usage-days';
import usageWire from './fixtures/usage-wire.json';

const ROUTE = 'https://studio.tailnet-example.ts.net';
const idle = usageWire.rpc.idle;
const active = usageWire.rpc.active;

function client(fake: FakeHost) {
  return createHostClient({ routes: [ROUTE], credential: fake.credential, carrier: fake.carrier });
}

function host(): FakeHost {
  const fake = new FakeHost();
  fake.methods.set('overviewUsage', (args) =>
    structuredClone(active.overviewUsage[args['period'] as 'week' | 'today']),
  );
  fake.methods.set('overviewMemory', () => structuredClone(active.overviewMemory));
  return fake;
}

describe('Host usage', () => {
  it('preserves the legacy Host invalid-input code for capability detection', async () => {
    const fake = host();
    fake.methods.set('overviewUsage', () => {
      throw new Error('Unsupported period');
    });
    await expect(loadUsage(client(fake), 'month')).rejects.toEqual(
      new MethodRefused('invalid-input', 'Unsupported period'),
    );
  });

  it.each(['month', 'quarter'] as const)(
    'reads and preserves the %s wire period',
    async (period) => {
      const fake = host();
      const value = structuredClone(active.overviewUsage.week) as OverviewUsage;
      value.period = period;
      value.days = trailingDays(value.end, period === 'month' ? 28 : 84).map((day) => ({
        ...value.days[0]!,
        day,
      }));
      value.start = value.days[0]!.day;
      fake.methods.set('overviewUsage', () => value);
      const result = await loadUsage(client(fake), period);
      expect(result).toEqual(value);
      expect(fake.calls[0]!.args).toEqual({ period });
      expect(usageChartDays(result)).toHaveLength(period === 'month' ? 28 : 12);
    },
  );

  it('buckets the 84-day range from its first day, preserving partial and unknown totals', () => {
    const value = structuredClone(active.overviewUsage.week) as OverviewUsage;
    value.period = 'quarter';
    value.days = trailingDays('2026-03-15', 84).map((day) => ({
      ...value.days[0]!,
      day,
      totalTokens: 10,
    }));
    value.days[0]!.totalTokens = null;
    value.days[8]!.partial = true;
    for (let index = 14; index < 21; index += 1) value.days[index]!.totalTokens = null;
    const bars = usageChartDays(value);
    expect(bars).toHaveLength(12);
    expect(bars[0]).toMatchObject({
      day: value.days[0]!.day,
      end: value.days[6]!.day,
      tokens: 60,
      partial: true,
    });
    expect(bars[1]).toMatchObject({ tokens: 70, partial: true });
    expect(bars[2]).toMatchObject({ tokens: null, partial: true });
    expect(bars[11]!.end).toBe('2026-03-15');
    expect(bars.reduce((sum, bar) => sum + (bar.tokens ?? 0), 0)).toBe(760);
  });

  it("reads the Host's week and sums it as the Web activity view does", async () => {
    const fake = host();
    const week = await loadUsage(client(fake), 'week');
    expect(fake.calls.map((call) => [call.method, call.args])).toEqual([
      ['overviewUsage', { period: 'week' }],
    ]);
    const summary = usageWeek(week);
    expect(summary.total).toBe(active.overviewUsage.week.totals.totalTokens);
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.days.map((day) => day.day)).toEqual(
      active.overviewUsage.week.days.map((day) => day.day),
    );
    expect(summary.days).toHaveLength(7);
    expect(summary.days.reduce((sum, day) => sum + (day.tokens ?? 0), 0)).toBe(summary.total);
    expect(week.bots.map((bot) => bot.displayName).sort()).toEqual(['Juno', 'Mika']);
    expect(usageIsPartial(week)).toBe(false);
  });

  it('marks a total the Host could only partly count as a lower bound', () => {
    const week = structuredClone(active.overviewUsage.week) as OverviewUsage;
    expect(usageWeek(week).partial).toBe(false);
    week.totals.partial = true;
    week.days[6]!.partial = true;
    expect(usageWeek(week)).toMatchObject({ total: week.totals.totalTokens, partial: true });
    expect(usageIsPartial(week)).toBe(true);
  });

  it('reads today with the same call', async () => {
    const fake = host();
    const today = await loadUsage(client(fake), 'today');
    expect(fake.calls.at(-1)?.args).toEqual({ period: 'today' });
    expect(today.start).toBe(today.end);
    expect(today.days).toHaveLength(1);
  });

  it('shows an idle Host as a quiet week of zeros', () => {
    const summary = usageWeek(idle.overviewUsage.week as OverviewUsage);
    expect(summary.total).toBe(0);
    expect(summary.days.map((day) => day.tokens)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(idle.overviewUsage.week.bots).toEqual([]);
    expect(idle.overviewMemory.bots).toEqual([]);
  });

  it('marks a week with uncounted usage as partial', () => {
    const week = structuredClone(active.overviewUsage.week) as OverviewUsage;
    week.days[3] = { ...week.days[3]!, outputTokens: null, totalTokens: null };
    expect(usageIsPartial(week)).toBe(true);
    expect(usageWeek(week).days[3]?.tokens).toBeNull();
  });

  it('appends the next page of Bots, and starts over when the day rolls over', async () => {
    const first = structuredClone(active.overviewUsage.week) as OverviewUsage;
    const [juno, mika] = first.bots as [
      OverviewUsage['bots'][number],
      OverviewUsage['bots'][number],
    ];
    first.bots = [juno];
    first.nextCursor = juno.slug;
    const fake = new FakeHost();
    fake.methods.set('overviewUsage', () => ({
      ...structuredClone(active.overviewUsage.week),
      bots: [juno, mika],
    }));
    const more = await loadMoreUsage(client(fake), first);
    expect(fake.calls.map((call) => call.args)).toEqual([{ period: 'week', after: juno.slug }]);
    expect(more.bots.map((bot) => bot.slug)).toEqual([juno.slug, mika.slug]);
    expect(more.nextCursor).toBeUndefined();

    const rolled = new FakeHost();
    rolled.methods.set('overviewUsage', (args) => ({
      ...structuredClone(active.overviewUsage.week),
      start: '2026-10-10',
      end: '2026-10-16',
      bots: args['after'] === undefined ? [mika] : [],
    }));
    const fresh = await loadMoreUsage(client(rolled), first);
    expect(rolled.calls.map((call) => call.args)).toEqual([
      { period: 'week', after: juno.slug },
      { period: 'week' },
    ]);
    expect(fresh.bots.map((bot) => bot.slug)).toEqual([mika.slug]);
  });

  it("reads each Bot's Memory changes for the week and pages through them", async () => {
    const fake = host();
    const memory = await loadMemoryActivity(client(fake));
    expect(fake.calls.map((call) => [call.method, call.args])).toEqual([['overviewMemory', {}]]);
    expect(memory.days).toHaveLength(7);
    for (const bot of memory.bots) {
      expect(bot.state).toBe('ready');
      if (bot.state === 'ready') {
        expect(bot.counts).toHaveLength(7);
        expect(bot.total).toBe(bot.counts.reduce((sum, count) => sum + count, 0));
      }
    }

    const first = { ...structuredClone(active.overviewMemory), nextCursor: 'a' } as OverviewMemory;
    first.bots = first.bots.slice(0, 1);
    const paged = new FakeHost();
    paged.methods.set('overviewMemory', () => structuredClone(active.overviewMemory));
    const more = await loadMoreMemoryActivity(client(paged), first);
    expect(paged.calls.map((call) => call.args)).toEqual([{ after: 'a' }]);
    expect(more.bots.map((bot) => bot.slug)).toEqual(
      active.overviewMemory.bots.map((bot) => bot.slug),
    );
  });

  it('gives the share of the total each Bot used', () => {
    expect(usageShare(25, 100)).toBe(25);
    expect(usageShare(25, 0)).toBeUndefined();
    expect(usageShare(null, 100)).toBeUndefined();
  });
});
