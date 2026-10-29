import { describe, expect, it } from 'vitest';
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
});
