import { parseAuthor } from '../../bridge-channel-author.js';
import {
  asRecord,
  bridgeHost,
  BridgeCallError,
  unwrap,
  type BridgeCall,
} from '../../bridge-transport.js';
import * as people from '@botharness/host-client/people';
import { readProfileActivity } from '@botharness/host-client/profile-activity';
import * as botControl from '@botharness/host-client/bot-control';
import * as channelHost from '@botharness/host-client/channel-messages';
import type {
  BotAttentionPage,
  BotAttentionStatus,
  HumanAttentionItem,
  HumanAttentionPage,
  ActivityListCategory,
  ActivityListFilters,
  ChannelAuthor,
  ChannelMessage,
} from '../../store.js';
import type { ChannelActivityToday } from '../../bridge.js';

export async function loadActivitySnapshot(
  call: BridgeCall,
  signal: AbortSignal,
): Promise<unknown> {
  return unwrap(call, 'activitySnapshot', {}, signal);
}

export interface BotSourcePolicyView {
  sourceClass:
    | 'human-dm'
    | 'bot-dm'
    | 'group-mention'
    | 'group-ordinary'
    | 'group-invite'
    | 'group-join-request'
    | 'group-join-decision'
    | 'assignment-report'
    | 'assignment-lifecycle';
  admission: 'admit';
  wake: 'immediate' | 'digest' | 'conditional' | 'mentions' | 'silent';
  delivery: 'steer' | 'turn';
  digestCount?: number;
  digestIntervalSeconds?: number;
  revision: number;
  lastActor: { kind: 'built-in' | 'human' | 'template' } | { kind: 'bot'; botSlug: string };
  changedAt: string;
  overrideActive: boolean;
  recentWakeCount: number;
}

export type BotSourcePolicyEdit =
  | { sourceClass: 'assignment-report'; wake: 'conditional' | 'immediate' }
  | {
      sourceClass: 'group-ordinary';
      wake: 'immediate' | 'digest' | 'mentions' | 'silent';
      digestCount: number;
      digestIntervalSeconds: number;
    }
  | {
      sourceClass: 'human-dm' | 'bot-dm' | 'group-mention';
      wake: 'immediate';
      delivery: 'steer' | 'turn';
    };

export async function loadBotSourcePolicies(
  call: BridgeCall,
  slug: string,
): Promise<BotSourcePolicyView[]> {
  const result = asRecord(await unwrap(call, 'botSourcePolicies', { slug }));
  const raw = result?.['policies'];
  if (!Array.isArray(raw)) throw new Error('invalid Bot source policies');
  return raw.map((entry): BotSourcePolicyView => {
    const policy = asRecord(entry);
    const actor = asRecord(policy?.['lastActor']);
    if (
      policy === undefined ||
      ![
        'human-dm',
        'bot-dm',
        'group-mention',
        'group-ordinary',
        'group-invite',
        'group-join-request',
        'group-join-decision',
        'assignment-report',
        'assignment-lifecycle',
      ].includes(String(policy?.['sourceClass'])) ||
      policy['admission'] !== 'admit' ||
      !['immediate', 'digest', 'conditional', 'mentions', 'silent'].includes(
        String(policy['wake']),
      ) ||
      typeof policy['revision'] !== 'number' ||
      !Number.isSafeInteger(policy['revision']) ||
      !['built-in', 'human', 'bot', 'template'].includes(String(actor?.['kind'])) ||
      (actor?.['kind'] === 'bot' && typeof actor['botSlug'] !== 'string') ||
      typeof policy['changedAt'] !== 'string' ||
      typeof policy['overrideActive'] !== 'boolean' ||
      !Number.isSafeInteger(policy['recentWakeCount']) ||
      (policy['recentWakeCount'] as number) < 0 ||
      (policy['wake'] === 'digest' &&
        (!Number.isSafeInteger(policy['digestCount']) ||
          !Number.isSafeInteger(policy['digestIntervalSeconds'])))
    )
      throw new Error('invalid Bot source policy');
    return policy as unknown as BotSourcePolicyView;
  });
}

export async function setBotSourcePolicy(
  call: BridgeCall,
  slug: string,
  edit: BotSourcePolicyEdit,
): Promise<void> {
  await unwrap(call, 'botSourcePolicySet', { slug, ...edit });
}

export async function resetBotSourcePolicy(
  call: BridgeCall,
  slug: string,
  sourceClass: BotSourcePolicyEdit['sourceClass'],
): Promise<void> {
  await unwrap(call, 'botSourcePolicyReset', { slug, sourceClass });
}

export async function loadBotAttention(
  call: BridgeCall,
  slug: string,
  limit = 50,
  cursor?: string,
  state?: BotAttentionStatus,
): Promise<BotAttentionPage> {
  return botControl.readBotAttention(bridgeHost(call), { slug, limit, cursor, state });
}

export async function loadHumanAttention(
  call: BridgeCall,
  category: ActivityListCategory,
  limit = 50,
  cursor?: string,
  filters: ActivityListFilters & {
    search?: string;
    mentionsFirst?: boolean;
  } = {
    botSlug: undefined,
    channelId: undefined,
    sort: 'newest',
  },
): Promise<HumanAttentionPage> {
  const extended = filters.search !== undefined || filters.mentionsFirst === true;
  const value = await people.readHumanAttention(bridgeHost(call), {
    category,
    limit,
    cursor,
    botSlug: filters.botSlug,
    channelId: filters.channelId,
    sort: filters.mentionsFirst ? 'mentions-first' : filters.sort,
    ...(extended ? { queryVersion: 1, search: filters.search } : {}),
    ...(filters.snoozed === true ? { snoozed: true } : {}),
  });
  if (extended && value.queryVersion !== 1) throw new Error('Update the Host to search Activity.');
  return {
    items: value.items,
    ...(value.nextCursor === undefined ? {} : { nextCursor: value.nextCursor }),
  };
}

export async function loadHumanAttentionStatus(call: BridgeCall): Promise<{
  unreadCount: number;
  hasAction: boolean;
  messageCounts: { replies: number; other: number } | undefined;
}> {
  const row = asRecord(await unwrap(call, 'humanAttentionStatus', { messageCounts: true }));
  if (
    row === undefined ||
    !Number.isSafeInteger(row['unreadCount']) ||
    (row['unreadCount'] as number) < 0 ||
    typeof row['hasAction'] !== 'boolean'
  )
    throw new Error('invalid Human attention status');
  const counts = asRecord(row['messageCounts']);
  if (
    row['messageCounts'] !== undefined &&
    (counts === undefined ||
      !Number.isSafeInteger(counts['replies']) ||
      !Number.isSafeInteger(counts['other']) ||
      (counts['replies'] as number) < 0 ||
      (counts['other'] as number) < 0 ||
      (counts['replies'] as number) + (counts['other'] as number) !== row['unreadCount'])
  )
    throw new Error('invalid Human attention message counts');
  return {
    unreadCount: row['unreadCount'] as number,
    hasAction: row['hasAction'],
    messageCounts: counts
      ? {
          replies: counts['replies'] as number,
          other: counts['other'] as number,
        }
      : undefined,
  };
}

export async function loadChannelUnreadCounts(call: BridgeCall): Promise<Record<string, number>> {
  return Object.fromEntries(
    (await channelHost.loadUnreadCounts(bridgeHost(call)))
      .filter((entry) => entry.unreadCount > 0)
      .map((entry) => [entry.channelId, entry.unreadCount]),
  );
}

export async function dismissActivityListItem(
  call: BridgeCall,
  itemId: string,
  sourceKey: string,
): Promise<void> {
  const value = asRecord(await unwrap(call, 'humanAttentionDismiss', { itemId, sourceKey }));
  if (value?.['accepted'] !== true) throw new Error('Inbox dismissal was not confirmed');
}

export async function dismissAllActivityListItems(
  call: BridgeCall,
  filter: {
    kind?: HumanAttentionItem['kind'] | undefined;
    category?: 'action' | 'info' | 'replies' | 'unread' | undefined;
    botSlug?: string | undefined;
    channelId?: string | undefined;
  },
): Promise<{ dismissed: number; more: boolean }> {
  const { dismissed, more } = await people.dismissHumanAttention(bridgeHost(call), {
    ...(filter.kind === undefined ? {} : { kind: filter.kind }),
    ...(filter.category === undefined ? {} : { category: filter.category }),
    ...(filter.botSlug === undefined ? {} : { botSlug: filter.botSlug }),
    ...(filter.channelId === undefined ? {} : { channelId: filter.channelId }),
  });
  return { dismissed, more };
}

export async function snoozeActivityListItem(
  call: BridgeCall,
  itemId: string,
  sourceKey: string,
  until: string | null,
): Promise<void> {
  const value = asRecord(await unwrap(call, 'humanAttentionSnooze', { itemId, sourceKey, until }));
  if (value?.['accepted'] !== true) throw new Error('Inbox snooze was not confirmed');
}

export async function ignoreHumanAssignmentReport(
  call: BridgeCall,
  sourceEventId: string,
): Promise<void> {
  const response = asRecord(await unwrap(call, 'humanAttentionIgnore', { sourceEventId }));
  if (response?.['accepted'] !== true) throw new Error('Human attention decision was not accepted');
}

export interface ProfileActivityDay {
  day: string;
  count: number;
}

export interface ProfileActivityReasonDay extends ProfileActivityDay {
  reason: string;
}

export interface ProfileTokenBuckets {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ProfileActivityTokensDay extends ProfileTokenBuckets {
  day: string;
}

export interface ProfileModelUsageRow {
  day: string;
  purpose: string;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  totalTokens: number | null;
}

export interface ProfileActivity {
  slug: string;
  weeks: number;
  since: string;
  before?: string;
  createdDay?: string;
  today: string;
  events: ProfileActivityReasonDay[];
  memoryCommits: ProfileActivityDay[];
  tokens: ProfileActivityTokensDay[];
  tokenTotals: ProfileTokenBuckets;
  modelUsageRows?: ProfileModelUsageRow[];
  modelUsageStatus?: 'ready' | 'unavailable';
}

export interface GroupProfileAuthorActivity {
  author: ChannelAuthor;
  bridgeOrigin?: Pick<
    NonNullable<ChannelMessage['bridgeOrigin']>,
    'platform' | 'conversationId' | 'conversationName' | 'accountRef' | 'accountName'
  >;
  total: number;
  days: ProfileActivityDay[];
}

export interface GroupProfileActivity {
  channelId: string;
  weeks: number;
  since: string;
  today: string;
  days: ProfileActivityDay[];
  authors: GroupProfileAuthorActivity[];
}

function isActivityDays(value: unknown): value is ProfileActivityDay[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => {
      const record = asRecord(entry);
      return typeof record?.['day'] === 'string' && typeof record['count'] === 'number';
    })
  );
}

export interface ProfileActivityWindow {
  before: string;
  weeks: number;
}

export async function loadProfileActivity(
  call: BridgeCall,
  channelId: string,
  window?: ProfileActivityWindow,
): Promise<ProfileActivity> {
  const activity = await readProfileActivity(bridgeHost(call), { channelId, ...window });
  return {
    ...activity,
    modelUsageRows: activity.modelUsageRows ?? [],
    modelUsageStatus: activity.modelUsageStatus ?? 'unavailable',
  };
}

export async function loadGroupProfileActivity(
  call: BridgeCall,
  channelId: string,
): Promise<GroupProfileActivity> {
  const response = asRecord(await unwrap(call, 'groupProfileActivity', { channelId }));
  if (
    response === undefined ||
    response['channelId'] !== channelId ||
    typeof response['weeks'] !== 'number' ||
    typeof response['since'] !== 'string' ||
    typeof response['today'] !== 'string' ||
    !isActivityDays(response['days']) ||
    !Array.isArray(response['authors']) ||
    !response['authors'].every((value) => {
      const entry = asRecord(value);
      return (
        entry !== undefined &&
        parseAuthor(entry['author']) !== undefined &&
        typeof entry['total'] === 'number' &&
        isActivityDays(entry['days']) &&
        (entry['bridgeOrigin'] === undefined ||
          (asRecord(entry['bridgeOrigin']) !== undefined &&
            ['platform', 'conversationId', 'conversationName'].every(
              (key) => typeof asRecord(entry['bridgeOrigin'])![key] === 'string',
            ) &&
            ['accountRef', 'accountName'].every((key) => {
              const value = asRecord(entry['bridgeOrigin'])![key];
              return value === undefined || (typeof value === 'string' && value.trim().length > 0);
            })))
      );
    })
  )
    throw new Error('invalid Group Profile activity');
  return response as unknown as GroupProfileActivity;
}

export async function loadChannelActivityToday(call: BridgeCall): Promise<ChannelActivityToday> {
  const data = asRecord(await unwrap(call, 'channelActivityToday', {}));
  const count = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  if (
    !data ||
    !count(data['total']) ||
    !Array.isArray(data['channels']) ||
    typeof data['day'] !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(data['day']) ||
    typeof data['timezone'] !== 'string' ||
    typeof data['from'] !== 'string' ||
    typeof data['to'] !== 'string' ||
    !Number.isFinite(Date.parse(data['from'])) ||
    !(Date.parse(data['to']) > Date.parse(data['from']))
  )
    throw new BridgeCallError('invalid-response', 'Invalid Channel activity');
  const ids = new Set<string>();
  for (const raw of data['channels']) {
    const row = asRecord(raw);
    if (
      !row ||
      typeof row['channelId'] !== 'string' ||
      !row['channelId'] ||
      ids.has(row['channelId']) ||
      typeof row['name'] !== 'string' ||
      !['dm', 'group'].includes(String(row['type'])) ||
      !count(row['total']) ||
      !count(row['human']) ||
      !count(row['bot']) ||
      !count(row['other']) ||
      row['total'] !== row['human'] + row['bot'] + row['other'] ||
      !Array.isArray(row['senders'])
    )
      throw new BridgeCallError('invalid-response', 'Invalid Channel activity');
    ids.add(row['channelId']);
    const sums = { human: 0, bot: 0, other: 0 };
    for (const rawSender of row['senders']) {
      const sender = asRecord(rawSender);
      const author = asRecord(sender?.['author']);
      if (
        !sender ||
        !author ||
        !count(sender['count']) ||
        typeof sender['displayName'] !== 'string' ||
        !['human', 'bot', 'system', 'bridged'].includes(String(author['kind'])) ||
        (author['kind'] === 'bot' && (typeof author['slug'] !== 'string' || !author['slug'])) ||
        (author['kind'] === 'bridged' &&
          (typeof author['source'] !== 'string' || !author['source']))
      )
        throw new BridgeCallError('invalid-response', 'Invalid Channel activity');
      sums[author['kind'] === 'human' ? 'human' : author['kind'] === 'bot' ? 'bot' : 'other'] +=
        sender['count'];
    }
    if (sums.human !== row['human'] || sums.bot !== row['bot'] || sums.other !== row['other'])
      throw new BridgeCallError('invalid-response', 'Invalid Channel activity');
  }
  if (
    data['channels'].reduce((sum: number, row: { total: number }) => sum + row.total, 0) !==
    data['total']
  )
    throw new BridgeCallError('invalid-response', 'Invalid Channel activity');
  return data as unknown as ChannelActivityToday;
}
