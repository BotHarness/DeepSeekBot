import { describe, expect, it, vi } from 'vitest';
import {
  DONE_WINDOW_MS,
  channelRowStatus,
  formatChannelListTime,
} from '../src/client/channel-row-status.js';
import { en, zhTranslate, type BotHarnessTranslate } from '../src/client/locale.js';

const enTranslate = ((key: string) =>
  (en as Record<string, string>)[key] ?? key) as BotHarnessTranslate;

const NOW = new Date(2026, 9, 19, 22, 30).getTime();
const fromBot = (at: number) => ({
  at: new Date(at).toISOString(),
  author: { kind: 'bot' as const, slug: 'ada' },
});
const base = { activity: 'idle' as const, unread: 0, botSlug: 'ada', now: NOW };

describe('channelRowStatus', () => {
  it('puts the Human first, then blocked work, then running work', () => {
    expect(channelRowStatus({ ...base, activity: 'waiting' })).toBe('needs-you');
    expect(
      channelRowStatus({ ...base, activity: 'working', attention: { approvalCount: 2 } }),
    ).toBe('needs-you');
    expect(channelRowStatus({ ...base, activity: 'blocked' })).toBe('blocked');
    expect(channelRowStatus({ ...base, attention: { approvalCount: 0, blockedCount: 1 } })).toBe(
      'blocked',
    );
    expect(channelRowStatus({ ...base, activity: 'thinking' })).toBe('working');
    expect(channelRowStatus({ ...base, activity: 'working', paused: true })).toBe('working');
    expect(channelRowStatus({ ...base, paused: true })).toBe('paused');
  });

  it('marks a finished turn by the Bot as unread, then done for a day, then nothing', () => {
    expect(channelRowStatus({ ...base, unread: 2, latest: fromBot(NOW - 60_000) })).toBe(
      'done-unread',
    );
    expect(channelRowStatus({ ...base, latest: fromBot(NOW - 60_000) })).toBe('done');
    expect(channelRowStatus({ ...base, latest: fromBot(NOW - DONE_WINDOW_MS - 1) })).toBe('none');
    expect(
      channelRowStatus({
        ...base,
        unread: 2,
        latest: { at: new Date(NOW).toISOString(), author: { kind: 'human' } },
      }),
    ).toBe('none');
    expect(channelRowStatus(base)).toBe('none');
  });
});

describe('formatChannelListTime', () => {
  const at = (month: number, day: number, hour = 9, minute = 5, year = 2026) =>
    new Date(year, month - 1, day, hour, minute).getTime();

  it('follows IM list conventions', () => {
    expect(formatChannelListTime(at(10, 19, 9, 5), NOW, zhTranslate)).toBe('09:05');
    expect(formatChannelListTime(at(10, 18, 23, 59), NOW, zhTranslate)).toBe('昨天');
    expect(formatChannelListTime(at(10, 18, 23, 59), NOW, enTranslate)).toBe('Yesterday');
    expect(formatChannelListTime(at(10, 15), NOW, enTranslate)).toBe('Thu');
    expect(formatChannelListTime(at(10, 12), NOW, zhTranslate)).toBe('10/12');
    expect(formatChannelListTime(at(10, 12), NOW, enTranslate)).toBe('10/12');
    expect(formatChannelListTime(at(12, 30, 9, 5, 2025), NOW, enTranslate)).toBe('12/30/2025');
  });

  it('matches native local-time formatting across locale, midnight, DST and time-zone changes', () => {
    const nativeFormat = (timestamp: number, now: number, locale: string, yesterday: string) => {
      const date = new Date(timestamp);
      const today = new Date(now);
      const start = (value: Date) =>
        new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
      const days = Math.round((start(today) - start(date)) / 86_400_000);
      if (days <= 0)
        return date.toLocaleTimeString(locale, {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
      if (days === 1) return yesterday;
      if (days < 7) return date.toLocaleDateString(locale, { weekday: 'short' });
      if (date.getFullYear() === today.getFullYear())
        return date.toLocaleDateString(locale, { month: 'numeric', day: 'numeric' });
      return date.toLocaleDateString(locale, { year: 'numeric', month: 'numeric', day: 'numeric' });
    };
    const cases = [
      ['2026-11-01T00:00:00Z', '2026-11-01T00:10:00Z'],
      ['2026-11-01T05:30:00Z', '2026-11-01T07:30:00Z'],
      ['2026-03-08T07:30:00Z', '2026-03-09T07:00:00Z'],
      ['2026-10-29T16:00:00Z', '2026-11-01T16:00:00Z'],
      ['2026-10-01T16:00:00Z', '2026-11-01T16:00:00Z'],
      ['2025-12-31T20:00:00Z', '2026-11-01T16:00:00Z'],
      ['0002-01-02T00:00:00Z', '2026-11-01T16:00:00Z'],
    ];
    const offsets = new Set<number>();
    try {
      for (const timezone of [
        'UTC',
        'America/Los_Angeles',
        'America/New_York',
        'Asia/Kolkata',
        'Pacific/Auckland',
      ]) {
        vi.stubEnv('TZ', timezone);
        offsets.add(new Date('2026-11-01T16:00:00Z').getTimezoneOffset());
        for (const locale of ['en-US', 'zh-CN', 'en-GB', 'ar-EG']) {
          const translate = ((key: string) =>
            key === 'time.intlLocale' ? locale : 'yesterday') as BotHarnessTranslate;
          for (const [timestamp, now] of cases) {
            expect(formatChannelListTime(Date.parse(timestamp!), Date.parse(now!), translate)).toBe(
              nativeFormat(Date.parse(timestamp!), Date.parse(now!), locale, 'yesterday'),
            );
          }
        }
      }
      expect(offsets.size).toBeGreaterThan(2);
      expect(formatChannelListTime(NaN, NOW, enTranslate)).toBe(
        new Date(NaN).toLocaleDateString('en-US'),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('reuses bounded formatters without native per-row locale formatter construction', async () => {
    vi.stubEnv('TZ', 'UTC');
    const localNow = new Date(2026, 9, 19, 22, 30).getTime();
    vi.resetModules();
    const fresh = await import('../src/client/channel-row-status.js');
    const constructor = vi.spyOn(Intl, 'DateTimeFormat');
    const time = vi.spyOn(Date.prototype, 'toLocaleTimeString');
    const date = vi.spyOn(Date.prototype, 'toLocaleDateString');
    try {
      for (let index = 0; index < 100; index++) {
        for (const translate of [enTranslate, zhTranslate]) {
          for (const timestamp of [at(10, 19), at(10, 15), at(10, 12), at(12, 30, 9, 5, 2025)])
            expect(fresh.formatChannelListTime(timestamp, localNow, translate)).not.toBe('');
        }
      }
      expect(constructor.mock.calls.length).toBeLessThanOrEqual(8);
      expect(time).not.toHaveBeenCalled();
      expect(date).not.toHaveBeenCalled();
      for (const locale of [
        'en-GB',
        'fr-FR',
        'ja-JP',
        'de-DE',
        'ko-KR',
        'ar-EG',
        'th-TH',
        'es-ES',
        'it-IT',
      ]) {
        const translate = ((key: string) =>
          key === 'time.intlLocale' ? locale : key) as BotHarnessTranslate;
        fresh.formatChannelListTime(at(10, 15), localNow, translate);
      }
      const before = constructor.mock.calls.length;
      fresh.formatChannelListTime(at(10, 19), localNow, enTranslate);
      expect(constructor.mock.calls.length).toBe(before + 1);
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    }
  });
});
