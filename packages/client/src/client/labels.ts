import { relativeTime } from '@deepseek-ai/dsh-client-ui-primitives';

import { zhTranslate, type BotHarnessTranslate } from './locale.js';

export function ungroupedLabel(t: BotHarnessTranslate = zhTranslate): string {
  return t('roster.ungrouped');
}

export function formatRelativeTime(
  at: number,
  now: number,
  t: BotHarnessTranslate = zhTranslate,
): string {
  const { unit, n } = relativeTime(at, now);
  switch (unit) {
    case 'now':
      return t('time.justNow');
    case 'minutes':
      return t('time.minutesAgo', { n });
    case 'hours':
      return t('time.hoursAgo', { n });
    case 'days':
      return t('time.daysAgo', { n });
    case 'months':
      return t('time.monthsAgo', { n });
    case 'years':
      return t('time.yearsAgo', { n });
  }
}
