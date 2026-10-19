import type {
  RosterArrangement,
  RosterBot,
  RosterChannel,
  RosterView,
  TopOrderEntry,
} from '../../host/client';
import type { HumanAttentionItem } from '../../host/wire';
import { t } from '../strings';

interface Attention {
  needsYou: number;
  unread: number;
  muted: boolean;
}

export type Conversation =
  | ({ kind: 'bot'; key: string; bot: RosterBot; at?: string } & Attention)
  | ({ kind: 'channel'; key: string; channel: RosterChannel; at?: string } & Attention);

export type UnreadCounts = Readonly<Record<string, number>>;

export type CountBadgeState = { tone: 'needs-you' | 'unread' | 'muted'; count: number } | undefined;

export type RowStatus =
  | 'needs-you'
  | 'blocked'
  | 'working'
  | 'paused'
  | 'done-unread'
  | 'done'
  | 'none';

export const DONE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function rowStatus(row: Conversation, now: Date): RowStatus {
  if (row.kind !== 'bot') return 'none';
  const { bot } = row;
  if (row.needsYou > 0 || bot.state === 'waiting') return 'needs-you';
  if (bot.state === 'blocked') return 'blocked';
  if (bot.state === 'thinking' || bot.state === 'working') return 'working';
  if (bot.paused) return 'paused';
  const author = bot.previewAuthor;
  if (author?.kind !== 'bot' || author.slug !== bot.slug) return 'none';
  if (row.unread > 0) return 'done-unread';
  const at = Date.parse(bot.previewAt ?? '');
  return Number.isFinite(at) && now.getTime() - at < DONE_WINDOW_MS ? 'done' : 'none';
}

export function countBadge(attention: Attention): CountBadgeState {
  if (attention.needsYou > 0) return { tone: 'needs-you', count: attention.needsYou };
  if (attention.unread > 0)
    return { tone: attention.muted ? 'muted' : 'unread', count: attention.unread };
  return undefined;
}

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
  unread: UnreadCounts = {},
  quiet: readonly string[] = [],
): Conversation[] {
  if (roster === undefined) return [];
  const hidden = new Set(roster.arrangement?.hidden);
  const muted = new Set([...(roster.arrangement?.muted ?? []), ...quiet]);
  const attention = (channelId: string | undefined, needsYou: number): Attention => ({
    needsYou,
    unread: channelId === undefined ? 0 : (unread[channelId] ?? 0),
    muted: channelId !== undefined && muted.has(channelId),
  });
  const rows: Conversation[] = [
    ...roster.bots.map((bot): Conversation => ({
      kind: 'bot',
      key: `bot:${bot.slug}`,
      bot,
      ...(bot.previewAt === undefined ? {} : { at: bot.previewAt }),
      ...attention(bot.dmChannelId, needsYouFor(bot, action)),
    })),
    ...roster.channels.map((channel): Conversation => ({
      kind: 'channel',
      key: `channel:${channel.id}`,
      channel,
      ...(channel.previewAt === undefined ? {} : { at: channel.previewAt }),
      ...attention(channel.id, action.filter((item) => item.channelId === channel.id).length),
    })),
  ];
  return rows.filter((row) => !hidden.has(channelIdOf(row) ?? '')).sort(byLatest);
}

function channelIdOf(row: Conversation): string | undefined {
  return row.kind === 'bot' ? row.bot.dmChannelId : row.channel.id;
}

export const PINNED_SECTION = 'pinned';

export type ChatListItem =
  | { kind: 'row'; key: string; row: Conversation; sectionId?: string }
  | {
      kind: 'section';
      key: string;
      id: string;
      name?: string;
      count: number;
      needsYou: number;
      unread: number;
      collapsed: boolean;
    };

function sectionItem(
  id: string,
  name: string | undefined,
  rows: Conversation[],
  collapsed: ReadonlySet<string>,
): ChatListItem[] {
  const folded = collapsed.has(id);
  return [
    {
      kind: 'section',
      key: `section:${id}`,
      id,
      ...(name === undefined ? {} : { name }),
      count: rows.length,
      needsYou: rows.reduce((sum, row) => sum + row.needsYou, 0),
      unread: rows.reduce((sum, row) => sum + (row.muted ? 0 : row.unread), 0),
      collapsed: folded,
    },
    ...(folded
      ? []
      : rows.map((row): ChatListItem => ({ kind: 'row', key: row.key, row, sectionId: id }))),
  ];
}

function topEntries(arrangement: RosterArrangement, loose: readonly string[]): TopOrderEntry[] {
  const known = new Set(arrangement.sections.map((section) => section.id));
  const placed = new Set<string>();
  const entries: TopOrderEntry[] = [];
  const place = (entry: TopOrderEntry): void => {
    const key = `${entry.kind}:${entry.id}`;
    if (placed.has(key)) return;
    placed.add(key);
    entries.push(entry);
  };
  const looseSet = new Set(loose);
  for (const entry of arrangement.topOrder ?? []) {
    if (entry.kind === 'section' ? known.has(entry.id) : looseSet.has(entry.id)) place(entry);
  }
  for (const id of arrangement.sectionOrder) if (known.has(id)) place({ kind: 'section', id });
  for (const section of arrangement.sections) place({ kind: 'section', id: section.id });
  for (const id of loose) place({ kind: 'channel', id });
  return entries;
}

export function chatList(
  roster: RosterView | undefined,
  action: HumanAttentionItem[],
  collapsed: ReadonlySet<string> = new Set(),
  unread: UnreadCounts = {},
): ChatListItem[] {
  const rows = conversations(roster, action, unread);
  const arrangement = roster?.arrangement;
  const flat = rows.map((row): ChatListItem => ({ kind: 'row', key: row.key, row }));
  if (arrangement === undefined || arrangement.sections.length === 0) return flat;

  const byId = new Map<string, Conversation>();
  for (const row of rows) byId.set(channelIdOf(row) ?? row.key, row);
  const bySlug = new Map(
    rows.flatMap((row) => (row.kind === 'bot' ? [[row.bot.slug, row] as const] : [])),
  );
  const pinned: Conversation[] = [];
  const taken = new Set<string>();
  for (const pin of arrangement.pins) {
    const row = byId.get(pin) ?? bySlug.get(pin);
    if (row === undefined || taken.has(row.key)) continue;
    taken.add(row.key);
    pinned.push(row);
  }
  const sectioned = new Set(arrangement.sections.flatMap((section) => section.channelIds));
  const inSection = new Map(
    arrangement.sections.map((section) => [
      section.id,
      rows.filter((row) => {
        const id = channelIdOf(row);
        return !taken.has(row.key) && id !== undefined && section.channelIds.includes(id);
      }),
    ]),
  );
  const loose = rows
    .filter((row) => !taken.has(row.key) && !sectioned.has(channelIdOf(row) ?? ''))
    .map((row) => channelIdOf(row) ?? row.key);
  const names = new Map(arrangement.sections.map((section) => [section.id, section.name]));

  const items: ChatListItem[] =
    pinned.length === 0
      ? []
      : sectionItem(PINNED_SECTION, undefined, pinned.sort(byLatest), collapsed);
  for (const entry of topEntries(arrangement, loose)) {
    if (entry.kind === 'section')
      items.push(
        ...sectionItem(entry.id, names.get(entry.id), inSection.get(entry.id) ?? [], collapsed),
      );
    else {
      const row = byId.get(entry.id);
      if (row !== undefined) items.push({ kind: 'row', key: row.key, row });
    }
  }
  return newestFirstWithinRuns(items);
}

function newestFirstWithinRuns(items: ChatListItem[]): ChatListItem[] {
  const ordered: ChatListItem[] = [];
  let run: Conversation[] = [];
  const flush = (): void => {
    for (const row of run.sort(byLatest)) ordered.push({ kind: 'row', key: row.key, row });
    run = [];
  };
  for (const item of items) {
    if (item.kind === 'row' && item.sectionId === undefined) run.push(item.row);
    else {
      flush();
      ordered.push(item);
    }
  }
  flush();
  return ordered;
}

function byLatest(a: Conversation, b: Conversation): number {
  return (b.at ?? '').localeCompare(a.at ?? '') || titleOf(a).localeCompare(titleOf(b));
}

export function titleOf(row: Conversation): string {
  return row.kind === 'bot' ? row.bot.displayName : row.channel.name;
}

export function searchKey(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
}

export function searchConversations(
  roster: RosterView | undefined,
  action: HumanAttentionItem[],
  query: string,
  unread: UnreadCounts = {},
): Conversation[] {
  const needle = searchKey(query);
  if (needle === '' || roster === undefined) return [];
  const rank = (row: Conversation): number => (searchKey(titleOf(row)).startsWith(needle) ? 0 : 1);
  return conversations(roster, action, unread)
    .filter((row) => searchKey(titleOf(row)).includes(needle))
    .map((row, index) => ({ row, index }))
    .sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index)
    .map(({ row }) => row);
}

export function shortTime(
  iso: string | undefined,
  now: Date,
  locale?: string,
  yesterday: string = t.yesterday,
): string {
  if (iso === undefined) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days === 1) return yesterday;
  return new Intl.DateTimeFormat(
    locale,
    days <= 0
      ? { hour: 'numeric', minute: '2-digit' }
      : days < 7
        ? { weekday: 'short' }
        : at.getFullYear() === now.getFullYear()
          ? { month: 'numeric', day: 'numeric' }
          : { year: 'numeric', month: 'numeric', day: 'numeric' },
  ).format(at);
}
