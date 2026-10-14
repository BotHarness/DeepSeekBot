import { describe, expect, it } from 'vitest';
import type { ProfileActivity, ProfileModelUsageRow } from '../src/client/bridge.js';
import {
  profileTokenSummary,
  profileTokenSummaryText,
  profileTokenChipText,
  compactTokenCount,
} from '../src/client/profile-token-summary.js';
import { zhTranslate } from '../src/client/locale.js';
import { composerSlashQuery } from '../src/client/composer-shortcuts.js';

const row: ProfileModelUsageRow = {
  day: '2026-10-12',
  purpose: 'orchestrator',
  provider: 'deepseek',
  model: 'flash',
  inputTokens: 10,
  outputTokens: 20,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 30,
};
function activity(rows: ProfileModelUsageRow[]): ProfileActivity {
  return {
    slug: 'ada',
    weeks: 26,
    since: '',
    today: '2026-10-12',
    events: [],
    memoryCommits: [],
    tokens: [],
    tokenTotals: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    modelUsageStatus: 'ready',
    modelUsageRows: rows,
  };
}

describe('shared Bot usage summary', () => {
  it('formats compact token counts without adding Bot identity or a time window', () => {
    expect([0, 999, 1000, 60_072, 1_250_000, 2_500_000_000].map(compactTokenCount)).toEqual([
      '0',
      '999',
      '1K',
      '60.1K',
      '1.3M',
      '2.5B',
    ]);
    expect(compactTokenCount(999_950)).toBe('1M');
    expect(compactTokenCount(999_950_000)).toBe('1B');
  });
  it('distinguishes known zero, unknown, partial and unavailable instead of inventing zero', () => {
    expect(profileTokenSummary(activity([]))).toEqual({ status: 'ready', total: 0 });
    expect(profileTokenSummary(activity([row]))).toEqual({ status: 'ready', total: 30 });
    expect(profileTokenSummary(activity([{ ...row, totalTokens: null }]))).toEqual({
      status: 'unknown',
      total: null,
    });
    expect(profileTokenSummary(activity([row, { ...row, totalTokens: null }]))).toEqual({
      status: 'partial',
      total: 30,
    });
    expect(profileTokenSummary(activity([{ ...row, cacheWriteTokens: null }]))).toEqual({
      status: 'partial',
      total: 30,
    });
    expect(profileTokenSummary(undefined)).toEqual({ status: 'unavailable', total: null });
    expect(profileTokenSummary({ ...activity([]), modelUsageStatus: 'unavailable' })).toEqual({
      status: 'unavailable',
      total: null,
    });
    expect(
      profileTokenSummaryText(activity([{ ...row, cacheWriteTokens: null }]), zhTranslate),
    ).toBe('部分已知 30');
  });

  it('shows only the compact count on the composer chip, even when usage is partial', () => {
    const partial = activity([
      { ...row, totalTokens: 169_500 },
      { ...row, cacheWriteTokens: null },
    ]);
    expect(profileTokenChipText(partial, zhTranslate)).toBe('169.5K');
    expect(profileTokenChipText(activity([row]), zhTranslate)).toBe('30');
    expect(profileTokenChipText(undefined, zhTranslate)).toBe(
      zhTranslate('composerContext.unavailable'),
    );
  });
});

it('recognizes only a standalone line-start UI slash at the caret, not prose or paths', () => {
  expect(composerSlashQuery('draft\n/model later text', 12)).toEqual({
    start: 6,
    end: 12,
    filter: 'model',
  });
  expect(composerSlashQuery('a /model', 8)).toBeUndefined();
  expect(composerSlashQuery('/tmp/project', 12)).toBeUndefined();
});
