import { isBotDmChannel } from './channel-kind.js';
import { recencyTime } from './roster-order.js';
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
        keywords: [],
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
        keywords: [bot.slug, ...bot.roles],
        hidden: hidden.has(channel.id),
        recency,
      });
      continue;
    }
    if (isBotDmChannel(channel)) {
      entries.push({ channel, name: channel.name, keywords: [], hidden: true, recency });
    }
  }
  return entries;
}

export function normalizeQuickSwitcherText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().trim();
}

const WORD_BOUNDARY = /[\s\-_./·・]/u;

export function quickSwitcherScore(entry: QuickSwitcherEntry, query: string): number | undefined {
  const name = normalizeQuickSwitcherText(entry.name);
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  const index = name.indexOf(query);
  if (index > 0) return WORD_BOUNDARY.test(name[index - 1] ?? '') ? 2 : 3;
  return entry.keywords.some((keyword) => normalizeQuickSwitcherText(keyword).includes(query))
    ? 4
    : undefined;
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
