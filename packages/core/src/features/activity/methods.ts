import {
  asNonBlank,
  asObject,
  asSlug,
  invalidInput,
  unavailable,
  unknownBot,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import { OWNER_HUMAN_CONTEXT } from '../../humans/context.js';
import { type HumanContext } from '../../humans/context.js';
import { notificationAttentionPage } from '../../runtime/notification-attention.js';
import { type IdleCompactionRecord } from '../../runtime/idle-compaction.js';
import {
  personaBotActivitySnapshot,
  type PersonaBotActivitySnapshot,
} from '../../state/bot-state.js';
import { isValidChannelId } from '../../channels/channel.js';
import { botAvatarUrl } from '../../bots/avatar-http.js';
import type { AvatarAppearance, RetainedAvatarAppearance } from '../../bots/avatar-appearance.js';
import {
  groupProfileActivity,
  type GroupProfileActivity,
} from '../../channels/profile-activity.js';
import { channelActivityToday, type ChannelActivityToday } from '../../channels/activity-today.js';
import { isValidSlug } from '../../bots/slug.js';
import type { SessionRootRole } from '../../sessions/ownership.js';
import type { BotAttentionPage, BotAttentionState } from '../../runtime/attention.js';
import type { BotSourcePolicy } from '../../runtime/source-policy.js';
import {
  HUMAN_INBOX_SNOOZE_MAX_MS,
  type HumanAttentionStatus,
  type HumanAttentionPage,
  type HumanAttentionCategory,
  type HumanAttentionItem,
} from '../../runtime/human-attention.js';
import type { AggregatedState } from '../../state/bot-state.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';

export interface ActivityOverview {
  actionCount: number;
  bots: Array<{
    slug: string;
    displayName: string;
    avatar?: string;
    appearance?: AvatarAppearance | RetainedAvatarAppearance;
    avatarSeed?: 2;
    paused: boolean;
    hasAction: boolean;
    state: AggregatedState;
    activity?: PersonaBotActivitySnapshot['bots'][number]['activity'];
    attention?: PersonaBotActivitySnapshot['bots'][number]['attention'];
    sessions: Array<{
      sessionId: string;
      role: SessionRootRole;
      state: 'thinking' | 'working';
      title?: string;
      description?: string;
    }>;
  }>;
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
  partial?: boolean;
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
  modelUsageRows: ProfileModelUsageRow[];
  modelUsageStatus: 'ready' | 'unavailable';
}

const HUMAN_ATTENTION_DISMISS_LIMIT = 1000;

const HUMAN_ATTENTION_READ_KINDS: ReadonlySet<string> = new Set([
  'channel-unread',
  'channel-reply',
  'channel-mention',
]);

const HUMAN_ATTENTION_DISMISS_KINDS: ReadonlySet<string> = new Set<HumanAttentionItem['kind']>([
  'group-join-request',
  'pairing-request',
  'user-question',
  'private-input',
  'takeover-request',
  'tool-approval',
  'auto-rejection',
  'workspace-grant-request',
  'bot-dm-message',
  'assignment-waiting-human',
  'assignment-blocked',
  'assignment-report',
  'bot-message-needs-repair',
  'channel-unread',
  'channel-reply',
  'channel-mention',
]);

function localMidnight(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year!, month! - 1, date!);
}

export function localDay(at: string): string | undefined {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return undefined;
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function bucketByDay(instants: readonly string[]): ProfileActivityDay[] {
  const counts = new Map<string, number>();
  for (const at of instants) {
    const day = localDay(at);
    if (day === undefined) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts]
    .map(([day, count]) => ({ day, count }))
    .sort((left, right) => left.day.localeCompare(right.day));
}

function bucketByReason(
  entries: ReadonlyArray<{ at: string; reason: string }>,
): ProfileActivityReasonDay[] {
  const counts = new Map<string, Map<string, number>>();
  for (const entry of entries) {
    const day = localDay(entry.at);
    if (day === undefined) continue;
    const reasons = counts.get(day) ?? new Map<string, number>();
    reasons.set(entry.reason, (reasons.get(entry.reason) ?? 0) + 1);
    counts.set(day, reasons);
  }
  return [...counts]
    .flatMap(([day, reasons]) => [...reasons].map(([reason, count]) => ({ day, reason, count })))
    .sort((left, right) => left.day.localeCompare(right.day));
}

export interface ActivityBridgeMethods {
  activitySnapshot(payload: unknown): BridgeResult<PersonaBotActivitySnapshot>;
  botAttention(payload: unknown): BridgeResult<BotAttentionPage>;
  botSourcePolicies(payload: unknown): BridgeResult<{ policies: BotSourcePolicy[] }>;
  botSourcePolicySet(payload: unknown): BridgeResult<{ policy: BotSourcePolicy }>;
  botSourcePolicyReset(payload: unknown): BridgeResult<{ policy: BotSourcePolicy }>;
  channelActivityToday(payload: unknown): BridgeResult<ChannelActivityToday>;
  activityOverview(payload: unknown): BridgeResult<ActivityOverview>;
  humanAttention(payload: unknown): BridgeResult<HumanAttentionPage>;
  humanAttentionStatus(payload: unknown): BridgeResult<HumanAttentionStatus>;
  channelUnreadCounts(payload: unknown): BridgeResult<{
    channels: Array<{ channelId: string; unreadCount: number }>;
  }>;
  humanAttentionDismiss(payload: unknown): BridgeResult<{ accepted: boolean }>;
  humanAttentionRestore(payload: unknown): BridgeResult<{ accepted: boolean }>;
  humanAttentionDismissAll(payload: unknown): Promise<
    BridgeResult<{
      accepted: boolean;
      dismissed: number;
      read: number;
      more: boolean;
    }>
  >;
  humanAttentionIgnore(payload: unknown): BridgeResult<{ accepted: boolean }>;
  humanAttentionSnooze(payload: unknown): BridgeResult<{ accepted: boolean }>;
  profileActivity(payload: unknown): Promise<BridgeResult<ProfileActivity>>;
  groupProfileActivity(payload: unknown): BridgeResult<GroupProfileActivity>;
}

export function createActivityBridgeMethods(
  human: HumanContext,
  deps: BridgeMethodsDeps,
  dmMemory: (payload: unknown, historical?: boolean) => { botSlug: string } | BridgeResult<never>,
): ActivityBridgeMethods {
  return {
    channelActivityToday() {
      if (deps.channels.humanMessageCounts === undefined)
        return {
          ok: false,
          error: {
            code: 'storage-unavailable',
            message: 'Channel activity query unavailable',
          },
        };
      return {
        ok: true,
        value: channelActivityToday(
          human,
          deps.channels,
          (slug) => deps.registry.get(slug)?.displayName,
        ),
      };
    },
    activityOverview() {
      if (deps.humanAttention === undefined) return unavailable();
      const actionSummary = deps.humanAttention.actionSummary(human);
      const actionBots = new Set(actionSummary.botSlugs);
      const running = deps.runningSessionIds?.() ?? new Set<string>();
      const bots = deps.registry.list().map((bot) => {
        const snapshot = deps.states.snapshot(bot.slug);
        const activity = deps.states.activity(bot.slug);
        const assignments = new Map(
          (deps.runtime?.listAssignments(bot.slug) ?? []).map((item) => [item.sessionId, item]),
        );
        const sessions: ActivityOverview['bots'][number]['sessions'] = [];
        for (const root of deps.ownership
          .rootsFor(bot.slug)
          .sort(
            (left, right) =>
              Number(right.rootRole === 'orchestrator') -
                Number(left.rootRole === 'orchestrator') ||
              left.createdAt.localeCompare(right.createdAt) ||
              left.sessionId.localeCompare(right.sessionId),
          )) {
          if (root.parentSessionId !== undefined) continue;
          const assignment = assignments.get(root.sessionId);
          const state = snapshot.sessions[root.sessionId] ?? 'done';
          if (!running.has(root.sessionId)) continue;
          if (state === 'thinking' || state === 'working')
            sessions.push({
              sessionId: root.sessionId,
              role: root.rootRole,
              state,
              ...(assignment === undefined
                ? {}
                : {
                    title: assignment.title,
                    description: assignment.description,
                  }),
            });
        }
        return {
          slug: bot.slug,
          displayName: bot.displayName,
          ...(bot.appearance === undefined ? {} : { appearance: bot.appearance }),
          ...(bot.avatarSeed === undefined ? {} : { avatarSeed: bot.avatarSeed }),
          ...(bot.avatar === undefined
            ? {}
            : {
                avatar: bot.avatar.startsWith('data:image/')
                  ? botAvatarUrl(bot.slug, bot.avatar)
                  : bot.avatar,
              }),
          paused: bot.paused === true,
          state: snapshot.state,
          ...(snapshot.attention === undefined ? {} : { attention: snapshot.attention }),
          ...(activity === undefined ? {} : { activity }),
          hasAction: actionBots.has(bot.slug),
          sessions,
        };
      });
      return { ok: true, value: { actionCount: actionSummary.count, bots } };
    },
    activitySnapshot() {
      return {
        ok: true,
        value: personaBotActivitySnapshot(
          deps.registry.list().map((bot) => bot.slug),
          deps.states,
        ),
      };
    },
    botAttention(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const limit = source['limit'];
      const cursor = source['cursor'];
      const state = source['state'];
      if (
        limit !== undefined &&
        (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 100)
      )
        return invalidInput('limit must be an integer from 1 to 100');
      if (
        cursor !== undefined &&
        (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 150)
      )
        return invalidInput('cursor must be a Source Event ID');
      if (
        state !== undefined &&
        ![
          'pending',
          'processing',
          'observed',
          'deferred',
          'needs-repair',
          'open',
          'snoozed',
          'handled',
        ].includes(String(state))
      )
        return invalidInput('unknown Bot attention state');
      try {
        return {
          ok: true,
          value: deps.attention?.list({
            botSlug: slug,
            ...(typeof source['channelId'] === 'string' ? { channelId: source['channelId'] } : {}),
            ...(limit === undefined ? {} : { limit: limit as number }),
            ...(cursor === undefined ? {} : { cursor: cursor as string }),
            ...(state === undefined ? {} : { state: state as BotAttentionState }),
          }) ?? { items: [] },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    botSourcePolicies(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      try {
        return {
          ok: true,
          value: { policies: deps.sourcePolicy?.list(slug) ?? [] },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    botSourcePolicySet(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      const wake = source['wake'];
      const sourceClass = source['sourceClass'] ?? 'assignment-report';
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.sourcePolicy === undefined) return invalidInput('Source policy is unavailable');
      try {
        if (
          sourceClass === 'human-dm' ||
          sourceClass === 'bot-dm' ||
          sourceClass === 'group-mention'
        ) {
          const delivery = source['delivery'];
          if (delivery !== 'steer' && delivery !== 'turn')
            return invalidInput('delivery must be steer or turn');
          return {
            ok: true,
            value: {
              policy: deps.sourcePolicy.setImmediateDelivery(slug, sourceClass, delivery, {
                kind: 'human',
              }),
            },
          };
        }
        if (sourceClass === 'group-ordinary') {
          const digestCount = source['digestCount'];
          const digestIntervalSeconds = source['digestIntervalSeconds'];
          if (
            (wake !== 'immediate' &&
              wake !== 'digest' &&
              wake !== 'mentions' &&
              wake !== 'silent') ||
            !Number.isSafeInteger(digestCount) ||
            !Number.isSafeInteger(digestIntervalSeconds)
          )
            return invalidInput('Group ordinary wake and digest parameters are required');
          return {
            ok: true,
            value: {
              policy: deps.sourcePolicy.setGroupOrdinary(
                slug,
                wake,
                digestCount as number,
                digestIntervalSeconds as number,
                { kind: 'human' },
              ),
            },
          };
        }
        if (
          sourceClass !== 'assignment-report' ||
          (wake !== 'conditional' && wake !== 'immediate') ||
          source['digestCount'] !== undefined ||
          source['digestIntervalSeconds'] !== undefined
        )
          return invalidInput('Assignment report wake must be conditional or immediate');
        return {
          ok: true,
          value: {
            policy: deps.sourcePolicy.setAssignmentReport(slug, wake, {
              kind: 'human',
            }),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    botSourcePolicyReset(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      const sourceClass = source['sourceClass'] ?? 'assignment-report';
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.sourcePolicy === undefined) return invalidInput('Source policy is unavailable');
      try {
        if (sourceClass === 'group-ordinary')
          return {
            ok: true,
            value: {
              policy: deps.sourcePolicy.resetGroupOrdinary(slug, {
                kind: 'human',
              }),
            },
          };
        if (
          sourceClass === 'human-dm' ||
          sourceClass === 'bot-dm' ||
          sourceClass === 'group-mention'
        )
          return {
            ok: true,
            value: {
              policy: deps.sourcePolicy.resetImmediateDelivery(slug, sourceClass, {
                kind: 'human',
              }),
            },
          };
        if (sourceClass !== 'assignment-report')
          return invalidInput('Source class is not editable');
        return {
          ok: true,
          value: {
            policy: deps.sourcePolicy.resetAssignmentReport(slug, {
              kind: 'human',
            }),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    humanAttention(payload) {
      const source = asObject(payload);
      if (source['notifications'] !== undefined && typeof source['notifications'] !== 'boolean')
        return invalidInput('notifications must be a boolean');
      if (source['queryVersion'] !== undefined && source['queryVersion'] !== 1)
        return invalidInput('unsupported Activity query version');
      if (source['queryVersion'] === 1 && deps.humanAttention === undefined)
        return invalidInput('Activity queries are unavailable');
      const category = source['category'];
      const sort = source['sort'];
      const search = source['search'];
      const unreadOnly = source['unreadOnly'];
      if (search !== undefined && (typeof search !== 'string' || search.length > 200))
        return invalidInput('search must be at most 200 characters');
      if (unreadOnly !== undefined && typeof unreadOnly !== 'boolean')
        return invalidInput('unreadOnly must be a boolean');
      const botSlug = source['botSlug'];
      const channelId = source['channelId'];
      const limit = source['limit'];
      const cursor = source['cursor'];
      const snoozed = source['snoozed'];
      const dismissed = source['dismissed'];
      const kind = source['kind'];
      if (snoozed !== undefined && typeof snoozed !== 'boolean')
        return invalidInput('snoozed must be a boolean');
      if (dismissed !== undefined && typeof dismissed !== 'boolean')
        return invalidInput('dismissed must be a boolean');
      if (snoozed === true && dismissed === true)
        return invalidInput('snoozed and dismissed cannot be combined');
      if (kind !== undefined && kind !== 'auto-rejection')
        return invalidInput('kind must be auto-rejection');
      if (
        category !== undefined &&
        category !== 'action' &&
        category !== 'info' &&
        category !== 'unread' &&
        category !== 'replies' &&
        category !== 'handled'
      )
        return invalidInput('category must be action, info, unread, replies or handled');
      if (
        sort !== undefined &&
        sort !== 'newest' &&
        sort !== 'oldest' &&
        !(sort === 'mentions-first' && category === 'replies')
      )
        return invalidInput('sort must be newest, oldest, or mentions-first for replies');
      if (botSlug !== undefined && (typeof botSlug !== 'string' || !isValidSlug(botSlug)))
        return invalidInput('invalid Bot filter');
      if (
        channelId !== undefined &&
        (typeof channelId !== 'string' || !isValidChannelId(channelId))
      )
        return invalidInput('invalid Channel filter');
      if (
        limit !== undefined &&
        (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 100)
      )
        return invalidInput('limit must be an integer from 1 to 100');
      if (
        cursor !== undefined &&
        (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 1024)
      )
        return invalidInput('invalid cursor');
      try {
        if (source['notifications'] === true) {
          if (deps.humanAttention === undefined)
            return invalidInput('notification queries are unavailable');
          if (
            Object.keys(source).some(
              (key) =>
                !['notifications', 'limit', 'cursor'].includes(key) && source[key] !== undefined,
            )
          )
            return invalidInput('notification discovery does not accept Activity filters');
          return {
            ok: true,
            value: notificationAttentionPage(human, deps.humanAttention, {
              ...(limit === undefined ? {} : { limit: limit as number }),
              ...(cursor === undefined ? {} : { cursor: cursor as string }),
            }),
          };
        }
        return {
          ok: true,
          value: {
            ...(deps.humanAttention?.list(human, {
              ...(category === undefined ? {} : { category: category as HumanAttentionCategory }),
              ...(sort === undefined
                ? {}
                : { sort: sort as 'newest' | 'oldest' | 'mentions-first' }),
              ...(search === undefined ? {} : { search: search as string }),
              ...(unreadOnly === true ? { unreadOnly: true } : {}),
              ...(botSlug === undefined ? {} : { botSlug: botSlug as string }),
              ...(channelId === undefined ? {} : { channelId: channelId as string }),
              ...(limit === undefined ? {} : { limit: limit as number }),
              ...(cursor === undefined ? {} : { cursor: cursor as string }),
              ...(snoozed === true ? { snoozed: true } : {}),
              ...(dismissed === true ? { dismissed: true } : {}),
              ...(kind === undefined ? {} : { kind }),
            }) ?? { items: [] }),
            ...(source['queryVersion'] === 1 ? { queryVersion: 1 } : {}),
            ...(dismissed === true ? { dismissed: true } : {}),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    humanAttentionStatus(payload) {
      const requested = asObject(payload)['messageCounts'];
      if (requested !== undefined && typeof requested !== 'boolean')
        return invalidInput('messageCounts must be boolean');
      try {
        return {
          ok: true,
          value: deps.humanAttention?.status(human, requested === true) ?? {
            unreadCount: 0,
            hasAction: false,
            ...(requested === true ? { messageCounts: { replies: 0, other: 0 } } : {}),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelUnreadCounts() {
      try {
        const visible = deps.team?.channelAccess.visibleIds(human);
        return {
          ok: true,
          value: {
            channels: (deps.humanAttention?.unreadByChannel(human) ?? []).filter((entry) =>
              visible
                ? visible.has(entry.channelId)
                : human.humanId === OWNER_HUMAN_CONTEXT.humanId,
            ),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    humanAttentionDismiss(payload) {
      const source = asObject(payload);
      const itemId = asNonBlank(source, 'itemId');
      const sourceKey = source?.['sourceKey'];
      if (
        itemId === undefined ||
        itemId.length > 350 ||
        typeof sourceKey !== 'string' ||
        sourceKey.length > 150
      )
        return invalidInput('itemId and sourceKey are required');
      try {
        const item = deps.humanAttention?.item(human, itemId, sourceKey);
        if (
          item === undefined ||
          (item.sourceEventId ?? '') !== sourceKey ||
          deps.humanAttentionDecisions?.dismiss(human, item) !== true
        )
          return invalidInput('Inbox item is no longer available');
        return { ok: true, value: { accepted: true } };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    async humanAttentionDismissAll(payload) {
      const source = asObject(payload);
      const kind = source['kind'];
      const category = source['category'];
      const botSlug = source['botSlug'];
      const channelId = source['channelId'];
      if (kind !== undefined && !HUMAN_ATTENTION_DISMISS_KINDS.has(kind as string))
        return invalidInput('kind is not a clearable Activity kind');
      if (
        category !== undefined &&
        category !== 'action' &&
        category !== 'info' &&
        category !== 'replies' &&
        category !== 'unread'
      )
        return invalidInput('category must be action, info, replies or unread');
      if (botSlug !== undefined && (typeof botSlug !== 'string' || !isValidSlug(botSlug)))
        return invalidInput('invalid Bot filter');
      if (
        channelId !== undefined &&
        (typeof channelId !== 'string' || !isValidChannelId(channelId))
      )
        return invalidInput('invalid Channel filter');
      const query = deps.humanAttention;
      const decisions = deps.humanAttentionDecisions;
      if (query === undefined || decisions === undefined)
        return invalidInput('Activity is unavailable');
      try {
        const matches: HumanAttentionItem[] = [];
        let more = false;
        for (const section of category === undefined
          ? (['action', 'info', 'replies', 'unread'] as const)
          : [category as 'action' | 'info' | 'replies' | 'unread']) {
          let cursor: string | undefined;
          do {
            const page = query.list(human, {
              category: section,
              limit: 100,
              ...(botSlug === undefined ? {} : { botSlug: botSlug as string }),
              ...(channelId === undefined ? {} : { channelId: channelId as string }),
              ...(cursor === undefined ? {} : { cursor }),
            });
            for (const item of page.items)
              if (kind === undefined || item.kind === kind) matches.push(item);
            cursor = page.nextCursor;
          } while (cursor !== undefined && matches.length < HUMAN_ATTENTION_DISMISS_LIMIT);
          if (matches.length >= HUMAN_ATTENTION_DISMISS_LIMIT) {
            more = true;
            break;
          }
        }
        let dismissed = 0;
        const unread: Array<{ channelId: string; messageId: string }> = [];
        for (const item of matches.slice(0, HUMAN_ATTENTION_DISMISS_LIMIT)) {
          if (decisions.dismiss(human, item)) dismissed += 1;
          if (
            item.channelId !== undefined &&
            item.messageId !== undefined &&
            HUMAN_ATTENTION_READ_KINDS.has(item.kind)
          )
            unread.push({
              channelId: item.channelId,
              messageId: item.messageId,
            });
        }
        let read = 0;
        for (const target of unread)
          if (
            (await deps.channels.markRead(human, target.channelId, target.messageId)) !== undefined
          )
            read += 1;
        return { ok: true, value: { accepted: true, dismissed, read, more } };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    humanAttentionRestore(payload) {
      const source = asObject(payload);
      const itemId = asNonBlank(source, 'itemId');
      const sourceKey = source?.['sourceKey'];
      if (
        itemId === undefined ||
        itemId.length > 350 ||
        typeof sourceKey !== 'string' ||
        sourceKey.length > 150
      )
        return invalidInput('itemId and sourceKey are required');
      try {
        const item = deps.humanAttention?.item(human, itemId, sourceKey);
        if (
          item === undefined ||
          (item.sourceEventId ?? '') !== sourceKey ||
          deps.humanAttentionDecisions?.restore(human, item) !== true
        )
          return invalidInput('Inbox item is not dismissed');
        return { ok: true, value: { accepted: true } };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    humanAttentionSnooze(payload) {
      const source = asObject(payload);
      const itemId = asNonBlank(source, 'itemId');
      const sourceKey = source?.['sourceKey'];
      const until = source?.['until'];
      if (
        itemId === undefined ||
        itemId.length > 350 ||
        typeof sourceKey !== 'string' ||
        sourceKey.length > 150
      )
        return invalidInput('itemId and sourceKey are required');
      if (until !== null) {
        const at = typeof until === 'string' ? Date.parse(until) : Number.NaN;
        if (Number.isNaN(at) || new Date(at).toISOString() !== until)
          return invalidInput('until must be an ISO time, or null to bring the item back');
        const left = at - Date.now();
        if (left <= 0 || left > HUMAN_INBOX_SNOOZE_MAX_MS)
          return invalidInput('until must be in the future and at most 30 days away');
      }
      try {
        const item = deps.humanAttention?.item(human, itemId, sourceKey);
        if (
          item === undefined ||
          (item.sourceEventId ?? '') !== sourceKey ||
          deps.humanAttentionDecisions?.snooze(human, item, until) !== true
        )
          return invalidInput('Inbox item cannot be snoozed');
        return { ok: true, value: { accepted: true } };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    humanAttentionIgnore(payload) {
      const source = asObject(payload);
      const sourceEventId = asNonBlank(source, 'sourceEventId');
      if (sourceEventId === undefined || sourceEventId.length > 150)
        return invalidInput('sourceEventId is required');
      try {
        const accepted =
          deps.humanAttentionDecisions?.ignoreAssignmentReport(human, sourceEventId) ?? false;
        if (!accepted) return invalidInput('Assignment report is no longer informational');
        return { ok: true, value: { accepted: true } };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    async profileActivity(payload) {
      const scope = dmMemory(payload, true);
      if (!('botSlug' in scope)) return scope;
      const slug = scope.botSlug;
      const source = asObject(payload);
      const before = source['before'];
      const requestedWeeks = source['weeks'];
      if (
        before !== undefined &&
        (typeof before !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(before))
      )
        return invalidInput('before must be a YYYY-MM-DD day');
      if (
        requestedWeeks !== undefined &&
        (typeof requestedWeeks !== 'number' ||
          !Number.isInteger(requestedWeeks) ||
          requestedWeeks < 1 ||
          requestedWeeks > 104)
      )
        return invalidInput('weeks must be an integer from 1 to 104');
      const weeks = requestedWeeks ?? 26;
      const end = before === undefined ? undefined : localMidnight(before);
      const since = new Date(
        (end?.getTime() ?? Date.now()) - weeks * 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const beforeEnd = <T extends { at: string }>(entries: readonly T[]): T[] =>
        end === undefined ? [...entries] : entries.filter((entry) => new Date(entry.at) < end);
      const events = beforeEnd(deps.channels.admissionActivity?.(slug, since) ?? []);
      let memoryActivity: Array<{ at: string }> = [];
      try {
        memoryActivity = (await deps.memory?.activity?.(slug, since)) ?? [];
      } catch (error) {
        if (deps.registry.get(slug) !== undefined) throw error;
      }
      const commits = beforeEnd(memoryActivity);
      const usageRows = (deps.usage?.activity(slug, since) ?? []).filter(
        (row) => before === undefined || row.day < before,
      );
      const idleCompactions: IdleCompactionRecord[] = beforeEnd(
        deps.usage?.idleCompactions?.(slug, since) ?? [],
      );
      const createdDay = localDay(deps.registry.getHistorical(slug)?.createdAt ?? '');
      const tokensByDay = new Map<string, ProfileActivityTokensDay>();
      const tokenTotals: ProfileTokenBuckets = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };
      for (const row of usageRows) {
        const day = tokensByDay.get(row.day) ?? {
          day: row.day,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        };
        day.inputTokens += row.inputTokens;
        day.outputTokens += row.outputTokens;
        day.cacheReadTokens += row.cacheReadTokens;
        day.cacheWriteTokens += row.cacheWriteTokens;
        tokensByDay.set(row.day, day);
        tokenTotals.inputTokens += row.inputTokens;
        tokenTotals.outputTokens += row.outputTokens;
        tokenTotals.cacheReadTokens += row.cacheReadTokens;
        tokenTotals.cacheWriteTokens += row.cacheWriteTokens;
      }
      return {
        ok: true,
        value: {
          slug,
          weeks,
          since,
          ...(before === undefined ? {} : { before }),
          ...(createdDay === undefined ? {} : { createdDay }),
          today: localDay(new Date().toISOString()) ?? '',
          events: bucketByReason(events),
          memoryCommits: bucketByDay(commits.map((entry) => entry.at)),
          tokens: [...tokensByDay.values()].sort((left, right) =>
            left.day.localeCompare(right.day),
          ),
          tokenTotals,
          modelUsageRows: usageRows.map((row) => ({
            day: row.day,
            purpose: row.purpose,
            provider: row.provider,
            model: row.model,
            inputTokens: (row.unknownBuckets?.inputTokens ?? 0) > 0 ? null : row.inputTokens,
            outputTokens: (row.unknownBuckets?.outputTokens ?? 0) > 0 ? null : row.outputTokens,
            cacheReadTokens:
              (row.unknownBuckets?.cacheReadTokens ?? 0) > 0 ? null : row.cacheReadTokens,
            cacheWriteTokens:
              (row.unknownBuckets?.cacheWriteTokens ?? 0) > 0 ? null : row.cacheWriteTokens,
            ...(row.totalTokens === null ? { partial: true } : {}),
            totalTokens:
              row.totalTokens === null
                ? (row.reportedTotalTokens ?? 0) > 0
                  ? row.reportedTotalTokens!
                  : null
                : row.totalTokens === undefined
                  ? row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens
                  : row.totalTokens,
          })),
          modelUsageStatus: deps.usage === undefined ? 'unavailable' : 'ready',
          idleCompactions,
        },
      };
    },
    groupProfileActivity(payload) {
      const channelId = asNonBlank(asObject(payload), 'channelId');
      if (channelId === undefined || deps.channels.get(channelId)?.type !== 'group')
        return invalidInput('group channelId is required');
      return {
        ok: true,
        value: groupProfileActivity(deps.channels, channelId),
      };
    },
  };
}
