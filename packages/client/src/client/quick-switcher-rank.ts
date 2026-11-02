import { isBotDmChannel } from './channel-kind.js';
import { en, zh } from './locale.js';
import { recencyTime } from './roster-order.js';
import { normalizeSearchText, searchTextMatches, searchTextScore } from './search-match.js';
import type { BotSummary, ChannelSummary } from './store.js';

export interface QuickSwitcherEntry {
  channel: ChannelSummary;
  bot?: BotSummary;
  name: string;
  keywords: readonly string[];
  hidden: boolean;
  recency: number;
}

export const QUICK_SWITCHER_RECENT_LIMIT = 20;
export const QUICK_SWITCHER_RESULT_LIMIT = 50;

const GROUP_KEYWORDS = [
  'group',
  en['quickSwitcher.kind.group'],
  zh['quickSwitcher.kind.group'],
] as const;
const BOT_KEYWORDS = ['bot', en['quickSwitcher.kind.bot'], zh['quickSwitcher.kind.bot']] as const;

export function quickSwitcherEntries(
  channels: readonly ChannelSummary[],
  bots: readonly BotSummary[],
  hiddenIds: readonly string[],
): QuickSwitcherEntry[] {
  const botBySlug = new Map(bots.map((bot) => [bot.slug, bot]));
  const hidden = new Set(hiddenIds);
  const entries: QuickSwitcherEntry[] = [];
  for (const channel of channels) {
    const recency = recencyTime(channel);
    if (channel.type === 'group') {
      entries.push({
        channel,
        name: channel.name,
        keywords: GROUP_KEYWORDS,
        hidden: hidden.has(channel.id),
        recency,
      });
      continue;
    }
    if (channel.botSlug !== undefined) {
      const bot = botBySlug.get(channel.botSlug);
      if (bot === undefined) continue;
      entries.push({
        channel,
        bot,
        name: bot.displayName,
        keywords: [bot.slug, ...bot.roles, ...BOT_KEYWORDS],
        hidden: hidden.has(channel.id),
        recency,
      });
      continue;
    }
    if (isBotDmChannel(channel)) {
      entries.push({ channel, name: channel.name, keywords: BOT_KEYWORDS, hidden: true, recency });
    }
  }
  return entries;
}

export const normalizeQuickSwitcherText = normalizeSearchText;

export function quickSwitcherScore(entry: QuickSwitcherEntry, query: string): number | undefined {
  const score = searchTextScore(entry.name, query);
  if (score !== undefined) return score;
  return entry.keywords.some((keyword) => searchTextMatches(keyword, query)) ? 6 : undefined;
}

export function rankQuickSwitcher(
  entries: readonly QuickSwitcherEntry[],
  query: string,
  limits: { recent?: number; results?: number } = {},
): QuickSwitcherEntry[] {
  const normalized = normalizeQuickSwitcherText(query);
  if (normalized.length === 0) {
    return entries
      .filter((entry) => !entry.hidden)
      .sort(byRecency)
      .slice(0, limits.recent ?? QUICK_SWITCHER_RECENT_LIMIT);
  }
  const scored: { entry: QuickSwitcherEntry; score: number }[] = [];
  for (const entry of entries) {
    const score = quickSwitcherScore(entry, normalized);
    if (score !== undefined) scored.push({ entry, score });
  }
  return scored
    .sort(
      (left, right) =>
        Number(left.entry.hidden) - Number(right.entry.hidden) ||
        left.score - right.score ||
        byRecency(left.entry, right.entry),
    )
    .slice(0, limits.results ?? QUICK_SWITCHER_RESULT_LIMIT)
    .map(({ entry }) => entry);
}

function byRecency(left: QuickSwitcherEntry, right: QuickSwitcherEntry): number {
  if (left.recency !== right.recency) return right.recency - left.recency;
  return left.name.localeCompare(right.name) || (left.channel.id < right.channel.id ? -1 : 1);
}
