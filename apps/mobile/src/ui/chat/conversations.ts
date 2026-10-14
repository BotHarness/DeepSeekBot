import type { RosterBot, RosterChannel, RosterView } from '../../host/client';
import type { HumanAttentionItem } from '../../host/wire';

export type Conversation =
  | { kind: 'bot'; key: string; bot: RosterBot; at?: string; needsYou: number }
  | { kind: 'channel'; key: string; channel: RosterChannel; at?: string; needsYou: number };

export type ConversationFilter = 'all' | 'needs-you' | 'working';

const BUSY = new Set(['thinking', 'working']);

function needsYouFor(bot: RosterBot, action: HumanAttentionItem[]): number {
  return action.filter(
    (item) =>
      item.botSlug === bot.slug &&
      (item.channelId === undefined || item.channelId === bot.dmChannelId),
  ).length;
}

export function conversations(
  roster: RosterView | undefined,
  action: HumanAttentionItem[],
  filter: ConversationFilter = 'all',
): Conversation[] {
  if (roster === undefined) return [];
  const rows: Conversation[] = [
    ...roster.bots.map((bot): Conversation => ({
      kind: 'bot',
      key: `bot:${bot.slug}`,
      bot,
      ...(bot.previewAt === undefined ? {} : { at: bot.previewAt }),
      needsYou: needsYouFor(bot, action),
    })),
    ...roster.channels.map((channel): Conversation => ({
      kind: 'channel',
      key: `channel:${channel.id}`,
      channel,
      ...(channel.previewAt === undefined ? {} : { at: channel.previewAt }),
      needsYou: action.filter((item) => item.channelId === channel.id).length,
    })),
  ];
  return rows
    .filter((row) =>
      filter === 'needs-you'
        ? row.needsYou > 0
        : filter === 'working'
          ? row.kind === 'bot' && BUSY.has(row.bot.state)
          : true,
    )
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '') || titleOf(a).localeCompare(titleOf(b)));
}

export function titleOf(row: Conversation): string {
  return row.kind === 'bot' ? row.bot.displayName : row.channel.name;
}

export function shortcutCounts(
  roster: RosterView | undefined,
  action: HumanAttentionItem[],
): Record<Exclude<ConversationFilter, 'all'>, number> {
  return {
    'needs-you': conversations(roster, action, 'needs-you').length,
    working: (roster?.bots ?? []).filter((bot) => BUSY.has(bot.state)).length,
  };
}

export function shortTime(iso: string | undefined, now: Date, locale?: string): string {
  if (iso === undefined) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const sameDay = at.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(
    locale,
    sameDay ? { hour: 'numeric', minute: '2-digit' } : { month: 'numeric', day: 'numeric' },
  ).format(at);
}
