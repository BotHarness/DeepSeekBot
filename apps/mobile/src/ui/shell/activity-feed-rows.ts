import {
  INBOX_SECTIONS,
  type InboxSection,
  type InboxSnapshot,
} from '@botharness/host-client/inbox';
import { requestRef, type RequestRef } from '@botharness/host-client/requests';
import {
  activityKey,
  activityBotKey,
  type ActivityItem as HumanAttentionItem,
} from '../../host/activity-sources';
import { DEFAULT_ACTIVITY, type ActivityFilter, type ActivitySort } from './activity-filters';

type FeedRow =
  | { kind: 'empty'; key: string }
  | { kind: 'more'; key: string; section: InboxSection }
  | { kind: 'post'; key: string; item: HumanAttentionItem; ref: RequestRef; section: InboxSection }
  | {
      kind: 'row';
      key: string;
      item: HumanAttentionItem;
      settled: boolean;
      section: InboxSection;
    };

export type HiddenItems = ReadonlyMap<string, string>;

function setAside(section: ActivityFilter['section']): boolean {
  return section === 'cleared' || section === 'snoozed';
}

function decidable(item: HumanAttentionItem): RequestRef | undefined {
  if (item.kind !== 'user-question' && item.kind !== 'tool-approval') return undefined;
  return requestRef(item);
}

function sectionItems(
  snapshot: Extract<InboxSnapshot, { status: 'ready' }>,
  section: InboxSection,
  gone: ReadonlySet<string>,
  held: readonly HumanAttentionItem[],
  bot: string | undefined,
  hidden: HiddenItems,
): HumanAttentionItem[] {
  const listed = snapshot.sections[section].filter(
    (item) =>
      (section !== 'action' || !gone.has(activityKey(item))) &&
      hidden.get(activityKey(item)) !== (item.sourceEventId ?? ''),
  );
  const items =
    section === 'action'
      ? [
          ...listed,
          ...held.filter(
            (kept) =>
              (bot === undefined || activityBotKey(kept) === bot) &&
              !listed.some((item) => activityKey(item) === activityKey(kept)),
          ),
        ]
      : listed;
  return bot === undefined || snapshot.botSlug === bot
    ? items
    : items.filter((item) => activityBotKey(item) === bot);
}

export function feedRows(
  snapshot: InboxSnapshot,
  gone: ReadonlySet<string>,
  held: readonly HumanAttentionItem[],
  filter: ActivityFilter = DEFAULT_ACTIVITY,
  search = '',
  hidden: HiddenItems = new Map(),
  sort: ActivitySort = 'default',
): FeedRow[] {
  if (snapshot.status !== 'ready') return [];
  const rows: FeedRow[] = [];
  const aside = setAside(filter.section);
  for (const section of INBOX_SECTIONS) {
    if ((filter.section === 'all' || aside) && section === 'handled') continue;
    if (filter.section !== 'all' && !aside && filter.section !== section) continue;
    const items = sectionItems(snapshot, section, gone, aside ? [] : held, filter.bot, hidden);
    if (search.trim() && items.length === 0 && !snapshot.cursors?.[section]) continue;
    for (const item of items) {
      const ref = section === 'action' && !aside ? decidable(item) : undefined;
      rows.push(
        ref === undefined
          ? { kind: 'row', key: activityKey(item), item, settled: section === 'handled', section }
          : { kind: 'post', key: activityKey(item), item, ref, section },
      );
    }
    if (snapshot.cursors?.[section]) rows.push({ kind: 'more', key: `more-${section}`, section });
  }
  if (sort !== 'default') {
    rows.sort((a, b) => {
      if (a.kind === 'more') return b.kind === 'more' ? 0 : 1;
      if (b.kind === 'more') return -1;
      if (a.kind === 'empty' || b.kind === 'empty') return 0;
      const delta = Date.parse(a.item.createdAt) - Date.parse(b.item.createdAt);
      return sort === 'oldest' ? delta : -delta;
    });
  }
  if (rows.length === 0 && !search.trim())
    rows.push({ kind: 'empty', key: `empty-${filter.section}` });
  return rows;
}
