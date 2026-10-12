import type { ChannelMessage } from './channel.js';
import { MAX_MESSAGE_PAGE, type ChannelStore } from './store.js';

export const GROUP_PROFILE_WEEKS = 26;

export interface GroupProfileActivityDay {
  day: string;
  count: number;
}

export interface GroupProfileAuthorActivity {
  author: ChannelMessage['author'];
  bridgeOrigin?: Pick<
    NonNullable<ChannelMessage['bridgeOrigin']>,
    'platform' | 'conversationId' | 'conversationName' | 'accountRef' | 'accountName'
  >;
  total: number;
  days: GroupProfileActivityDay[];
}

export interface GroupProfileActivity {
  channelId: string;
  weeks: number;
  since: string;
  today: string;
  days: GroupProfileActivityDay[];
  authors: GroupProfileAuthorActivity[];
}

function localDay(at: string): string | undefined {
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return undefined;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function authorKey({
  author,
  bridgeOrigin,
}: Pick<GroupProfileAuthorActivity, 'author' | 'bridgeOrigin'>): string {
  if (author.kind === 'bridged' && bridgeOrigin)
    return JSON.stringify([
      'bridged-source',
      bridgeOrigin.platform,
      bridgeOrigin.accountRef ?? null,
      bridgeOrigin.conversationId,
    ]);
  return author.kind === 'bot'
    ? `bot:${author.slug}`
    : author.kind === 'bridged'
      ? `bridged:${author.source}`
      : author.kind;
}

export function groupProfileActivity(
  channels: Pick<ChannelStore, 'queryMessages'>,
  channelId: string,
  now = new Date(),
): GroupProfileActivity {
  const since = new Date(now.getTime() - GROUP_PROFILE_WEEKS * 7 * 86_400_000).toISOString();
  const days = new Map<string, number>();
  const authors = new Map<
    string,
    Omit<GroupProfileAuthorActivity, 'days'> & { days: Map<string, number> }
  >();
  let cursor: string | undefined;
  do {
    const page = channels.queryMessages(channelId, {
      from: since,
      orderBy: 'time',
      limit: MAX_MESSAGE_PAGE,
      ...(cursor === undefined ? {} : { cursor }),
    });
    for (const message of page.messages) {
      const day = localDay(message.at);
      if (day === undefined) continue;
      days.set(day, (days.get(day) ?? 0) + 1);
      const key = authorKey(message);
      const entry = authors.get(key) ?? {
        author: message.author,
        total: 0,
        days: new Map<string, number>(),
      };
      if (message.author.kind === 'bridged' && message.bridgeOrigin && !entry.bridgeOrigin) {
        const { platform, conversationId, conversationName, accountRef, accountName } =
          message.bridgeOrigin;
        entry.bridgeOrigin = {
          platform,
          conversationId,
          conversationName,
          ...(accountRef ? { accountRef } : {}),
          ...(accountName ? { accountName } : {}),
        };
      }
      entry.total += 1;
      entry.days.set(day, (entry.days.get(day) ?? 0) + 1);
      authors.set(key, entry);
    }
    cursor = page.nextCursor;
  } while (cursor !== undefined);

  const sortedDays = (counts: ReadonlyMap<string, number>): GroupProfileActivityDay[] =>
    [...counts].map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day));
  return {
    channelId,
    weeks: GROUP_PROFILE_WEEKS,
    since,
    today: localDay(now.toISOString()) ?? '',
    days: sortedDays(days),
    authors: [...authors.values()]
      .map(({ author, bridgeOrigin, total, days: authorDays }) => ({
        author,
        ...(bridgeOrigin ? { bridgeOrigin } : {}),
        total,
        days: sortedDays(authorDays),
      }))
      .sort((a, b) => b.total - a.total || authorKey(a).localeCompare(authorKey(b))),
  };
}
