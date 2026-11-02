import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));

import {
  activityDetail,
  newerWindow,
  olderWindow,
  parseProfileActivity,
  tokenTotal,
  weekGlance,
} from '../src/host/bot-activity';
import { compactTokenCount, trailingDays } from '../src/host/usage-days';
import type { ProfileActivity, ProfileModelUsageRow } from '../src/host/wire';

const row = (day: string, total: number | null, model = 'deepseek-v4'): ProfileModelUsageRow => ({
  day,
  purpose: 'orchestrator',
  provider: 'opencode-go',
  model,
  inputTokens: total === null ? null : total / 2,
  outputTokens: total === null ? null : total / 4,
  cacheReadTokens: total === null ? null : total / 4,
  cacheWriteTokens: total === null ? null : 0,
  totalTokens: total,
});

const tokens = (day: string, total: number) => ({
  day,
  inputTokens: total / 2,
  outputTokens: total / 4,
  cacheReadTokens: total / 4,
  cacheWriteTokens: 0,
});

function activity(overrides: Partial<ProfileActivity> = {}): ProfileActivity {
  return {
    weeks: 1,
    today: '2026-10-15',
    createdDay: '2026-09-01',
    events: [
      { day: '2026-10-08', reason: 'human-dm', count: 9 },
      { day: '2026-10-09', reason: 'human-dm', count: 2 },
      { day: '2026-10-15', reason: 'group-mention', count: 3 },
      { day: '2026-10-15', reason: 'human-dm', count: 1 },
    ],
    memoryCommits: [
      { day: '2026-10-12', count: 2 },
      { day: '2026-10-15', count: 1 },
    ],
    tokens: [tokens('2026-10-08', 4000), tokens('2026-10-09', 8000), tokens('2026-10-15', 12_000)],
    modelUsageRows: [
      row('2026-10-08', 4000),
      row('2026-10-09', 8000),
      row('2026-10-15', 10_000),
      row('2026-10-15', 2000, 'deepseek-v4-flash'),
    ],
    modelUsageStatus: 'ready',
    ...overrides,
  };
}

describe('Bot activity', () => {
  it('reads the answer defensively, dropping entries it cannot use', () => {
    const parsed = parseProfileActivity({
      slug: 'bot-1',
      weeks: 1,
      since: '2026-10-08T14:00:00.000Z',
      today: '2026-10-15',
      events: [
        { day: '2026-10-15', reason: 'human-dm', count: 2 },
        { day: 'yesterday', count: 1 },
      ],
      memoryCommits: [{ day: '2026-10-15', count: 1 }, null, { day: '2026-10-14', count: -1 }],
      tokens: [{ day: '2026-10-15', inputTokens: 10, outputTokens: 'many' }],
      tokenTotals: {},
      modelUsageRows: [{ ...row('2026-10-15', 40), inputTokens: null }, 'row'],
      modelUsageStatus: 'ready',
    });
    expect(parsed).toEqual({
      weeks: 1,
      today: '2026-10-15',
      events: [{ day: '2026-10-15', reason: 'human-dm', count: 2 }],
      memoryCommits: [{ day: '2026-10-15', count: 1 }],
      tokens: [
        {
          day: '2026-10-15',
          inputTokens: 10,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      ],
      modelUsageRows: [{ ...row('2026-10-15', 40), inputTokens: null }],
      modelUsageStatus: 'ready',
    });
    expect(parseProfileActivity({ today: '2026-10-15' })).toMatchObject({
      events: [],
      modelUsageRows: [],
      modelUsageStatus: 'unavailable',
    });
    expect(() => parseProfileActivity({ weeks: 1 })).toThrow();
    expect(() => parseProfileActivity('nope')).toThrow();
  });

  it('slices the last 7 days ending today, leaving out the partial eighth day', () => {
    const glance = weekGlance(activity());
    expect(glance.days).toEqual(trailingDays('2026-10-15', 7));
    expect(glance.days[0]).toBe('2026-10-09');
    expect(glance.tokens).toEqual([8000, 0, 0, 0, 0, 0, 12_000]);
    expect(glance.activity).toEqual([2, 0, 0, 2, 0, 0, 5]);
    expect(glance.total).toEqual({ status: 'ready', total: 20_000 });
    expect(glance.quiet).toBe(false);
    expect(compactTokenCount(glance.total.total!)).toBe('20K');
  });

  it('shows a quiet week, and keeps unknown usage apart from zero', () => {
    const quiet = weekGlance(
      activity({ events: [], memoryCommits: [], tokens: [], modelUsageRows: [] }),
    );
    expect(quiet.quiet).toBe(true);
    expect(quiet.total).toEqual({ status: 'ready', total: 0 });

    expect(tokenTotal({ modelUsageStatus: 'unavailable' }, [])).toEqual({
      status: 'unavailable',
      total: null,
    });
    expect(tokenTotal({ modelUsageStatus: 'ready' }, [row('2026-10-15', null)])).toEqual({
      status: 'unknown',
      total: null,
    });
    expect(
      tokenTotal({ modelUsageStatus: 'ready' }, [row('2026-10-15', null), row('2026-10-15', 300)]),
    ).toEqual({ status: 'partial', total: 300 });
  });

  it('does not mark an exact reported total as a lower bound just because a split is unknown', () => {
    expect(
      tokenTotal({ modelUsageStatus: 'ready' }, [
        { ...row('2026-10-15', 1000), cacheReadTokens: null },
      ]),
    ).toEqual({ status: 'ready', total: 1000 });
  });

  it('keeps reported partial totals and treats zero plus unknown calls as unknown', () => {
    const reported = parseProfileActivity({
      today: '2026-10-15',
      modelUsageStatus: 'ready',
      modelUsageRows: [{ ...row('2026-10-15', 674655), partial: true }],
    });
    expect(weekGlance(reported).total).toEqual({ status: 'partial', total: 674655 });
    expect(
      tokenTotal({ modelUsageStatus: 'ready' }, [row('2026-10-15', 0), row('2026-10-15', null)]),
    ).toEqual({ status: 'unknown', total: null });
  });

  it('splits the window into cache read, input and output, by model and by reason', () => {
    const detail = activityDetail(activity());
    expect(detail.first).toBe('2026-10-09');
    expect(detail.last).toBe('2026-10-15');
    expect(detail.weekly).toBe(false);
    expect(detail.buckets.map((bucket) => bucket.key)).toEqual(trailingDays('2026-10-15', 7));
    expect(detail.split).toEqual({ cached: 5000, uncached: 10_000, output: 5000 });
    expect(detail.total).toEqual({ status: 'ready', total: 20_000 });
    expect(detail.models.map((model) => [model.model, model.total])).toEqual([
      ['deepseek-v4', 18_000],
      ['deepseek-v4-flash', 2000],
    ]);
    expect(detail.reasons).toEqual([
      { reason: 'human-dm', count: 3 },
      { reason: 'group-mention', count: 3 },
    ]);
    expect(detail.events).toBe(6);
    expect(detail.commits).toBe(3);
  });

  it('groups a long window by week and pages back and forth by whole windows', () => {
    const long = activityDetail(activity({ weeks: 26 }));
    expect(long.weekly).toBe(true);
    expect(long.buckets.length).toBeGreaterThanOrEqual(26);
    expect(long.buckets.at(-1)?.first).toBe('2026-10-12');
    expect(long.split.cached + long.split.uncached + long.split.output).toBe(24_000);

    const current = activity();
    expect(newerWindow(current)).toBeUndefined();
    const before = olderWindow(current);
    expect(before).toBe('2026-10-09');
    const older = activity({ before });
    expect(activityDetail(older).last).toBe('2026-10-08');
    expect(activityDetail(older).split).toEqual({ cached: 1000, uncached: 2000, output: 1000 });
    expect(newerWindow(older)).toBeUndefined();
    expect(newerWindow(activity({ before: '2026-10-02' }))).toBe('2026-10-09');
  });
});
