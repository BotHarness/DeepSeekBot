import type {
  MarketplaceDigest,
  MarketplaceDigestPick,
  MarketplaceEntry,
} from '../../../../packages/core/src/marketplace/client';
import type { MarketplaceLanguage } from '../../../../packages/core/src/marketplace/language';

export type DigestCoverLayout = 'date' | 'one' | 'two' | 'three' | 'four';

const LAYOUTS: readonly DigestCoverLayout[] = ['date', 'one', 'two', 'three', 'four'];

export const DIGEST_COVER_PICKS = 4;

export function digestCoverLayout(picks: number): DigestCoverLayout {
  return LAYOUTS[Math.min(Math.max(picks, 0), DIGEST_COVER_PICKS)] ?? 'date';
}

export function digestPickOf(bot: MarketplaceEntry): MarketplaceDigestPick {
  return {
    id: bot.id,
    displayName: bot.displayName ?? bot.name,
    banner: bot.banner,
    avatar: bot.avatar,
  };
}

export function digestArticlePicks(digest: MarketplaceDigest): MarketplaceDigestPick[] {
  return digest.sections
    .flatMap((section) => (section.bot === null ? [] : [digestPickOf(section.bot)]))
    .slice(0, DIGEST_COVER_PICKS);
}

function format(day: string, lang: MarketplaceLanguage, options: Intl.DateTimeFormatOptions) {
  const at = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(at)) return undefined;
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', {
    ...options,
    timeZone: 'UTC',
  }).format(at);
}

export function digestShortDate(day: string, lang: MarketplaceLanguage): string {
  return format(day, lang, { month: 'short', day: 'numeric' }) ?? day;
}

export function digestMonth(day: string, lang: MarketplaceLanguage): string {
  return format(day, lang, { month: 'short' }) ?? '';
}

export function digestDayOfMonth(day: string): string {
  return day.slice(8).replace(/^0/u, '');
}

export function digestDate(day: string, lang: MarketplaceLanguage): string {
  return format(day, lang, { month: 'long', day: 'numeric', weekday: 'long' }) ?? day;
}
