import { type HumanContext } from '../humans/context.js';
import { isBotDmChannel, type ChannelMessage } from './channel.js';
import type { ChannelStore } from './store.js';

export interface ChannelActivityRow {
  channelId: string;
  name: string;
  type: 'dm' | 'group';
  total: number;
  human: number;
  bot: number;
  other: number;
  senders: Array<{ author: ChannelMessage['author']; displayName: string; count: number }>;
}
export interface ChannelActivityToday {
  day: string;
  timezone: string;
  from: string;
  to: string;
  total: number;
  channels: ChannelActivityRow[];
}
export function channelActivityToday(
  human: HumanContext,
  channels: ChannelStore,
  botName: (slug: string) => string | undefined,
  now = new Date(),
): ChannelActivityToday {
  if (!channels.humanMessageCounts) throw new Error('Channel activity query unavailable');
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  const rows = new Map<string, ChannelActivityRow>();
  const humanNames = new Map<string, string>();
  for (const channel of channels.list()) {
    if (isBotDmChannel(channel)) continue;
    const member = channels
      .listHumanMembers(human, channel.id)
      .find((m) => m.humanId === human.humanId);
    if (member === undefined) continue;
    humanNames.set(channel.id, member.displayName);
    rows.set(channel.id, {
      channelId: channel.id,
      name:
        channel.type === 'dm' && channel.botSlug
          ? (botName(channel.botSlug) ?? channel.name)
          : channel.name,
      type: channel.type,
      total: 0,
      human: 0,
      bot: 0,
      other: 0,
      senders: [],
    });
  }
  for (const { channelId, author, count } of channels.humanMessageCounts(human, from, to)) {
    const row = rows.get(channelId);
    if (row === undefined) continue;
    const displayName =
      author.kind === 'human'
        ? (humanNames.get(channelId) ?? 'Human')
        : author.kind === 'bot'
          ? (botName(author.slug) ?? author.slug)
          : author.kind === 'bridged'
            ? author.source
            : 'System';
    row.total += count;
    row[author.kind === 'human' || author.kind === 'bot' ? author.kind : 'other'] += count;
    row.senders.push({ author, displayName, count });
  }
  const values = [...rows.values()].sort(
    (a, b) => b.total - a.total || a.channelId.localeCompare(b.channelId),
  );
  for (const row of values)
    row.senders.sort((a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName));
  return {
    day: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    from,
    to,
    total: values.reduce((sum, row) => sum + row.total, 0),
    channels: values,
  };
}
