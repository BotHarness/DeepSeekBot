import type { ProfileActivity } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';

export function compactTokenCount(count: number): string {
  if (count < 1000) return String(count);
  const divisor = count < 999_950 ? 1000 : count < 999_950_000 ? 1_000_000 : 1_000_000_000;
  const suffix = divisor === 1000 ? 'K' : divisor === 1_000_000 ? 'M' : 'B';
  return `${Number((count / divisor).toFixed(1))}${suffix}`;
}

export function profileTokenSummary(activity: ProfileActivity | undefined): {
  status: 'ready' | 'unknown' | 'partial' | 'unavailable';
  total: number | null;
} {
  if (activity === undefined || activity.modelUsageStatus !== 'ready')
    return { status: 'unavailable', total: null };
  const rows = activity.modelUsageRows ?? [];
  const unknown = rows.some((row) => row.totalTokens === null);
  const partial = rows.some((row) =>
    [row.inputTokens, row.outputTokens, row.cacheReadTokens, row.cacheWriteTokens].includes(null),
  );
  if (unknown && rows.every((row) => row.totalTokens === null))
    return { status: 'unknown', total: null };
  const total = rows.reduce((sum, row) => sum + (row.totalTokens ?? 0), 0);
  return { status: unknown || partial ? 'partial' : 'ready', total };
}

export function profileTokenSummaryText(
  activity: ProfileActivity | undefined,
  t: BotHarnessTranslate,
  compact = false,
): string {
  const summary = profileTokenSummary(activity);
  if (summary.status === 'unavailable') return t('composerContext.unavailable');
  if (summary.status === 'unknown') return t('profile.usage.unknown');
  const count = compact ? compactTokenCount(summary.total!) : String(summary.total);
  return summary.status === 'partial' ? t('composerContext.partial', { count }) : count;
}

export function profileTokenChipText(
  activity: ProfileActivity | undefined,
  t: BotHarnessTranslate,
): string {
  const summary = profileTokenSummary(activity);
  if (summary.status === 'unavailable') return t('composerContext.unavailable');
  if (summary.status === 'unknown') return t('profile.usage.unknown');
  return compactTokenCount(summary.total!);
}
