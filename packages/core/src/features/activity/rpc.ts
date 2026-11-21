import { unwrap } from '../../bridge/rpc-result.js';
import type { PersonaBotActivitySnapshot } from '../../state/bot-state.js';
import type { ProfileActivity } from '../../bridge/methods.js';
import type { ChannelActivityToday } from '../../channels/activity-today.js';
import type { GroupProfileActivity } from '../../channels/profile-activity.js';
import type { BotAttentionPage, BotAttentionState } from '../../runtime/attention.js';
import type { BotSourcePolicy } from '../../runtime/source-policy.js';
import type {
  HumanAttentionCategory,
  HumanAttentionPage,
  HumanAttentionStatus,
} from '../../runtime/human-attention.js';
import type { ActivityBridgeMethods } from './methods.js';

export function activitySnapshot(methods: ActivityBridgeMethods): PersonaBotActivitySnapshot {
  return unwrap(methods.activitySnapshot({}));
}

export function botAttention(
  methods: ActivityBridgeMethods,
  slug: string,
  limit?: number,
  cursor?: string,
  state?: BotAttentionState,
): BotAttentionPage {
  return unwrap(methods.botAttention({ slug, limit, cursor, state }));
}

export function botSourcePolicies(
  methods: ActivityBridgeMethods,
  slug: string,
): { policies: BotSourcePolicy[] } {
  return unwrap(methods.botSourcePolicies({ slug }));
}

export function botSourcePolicySet(
  methods: ActivityBridgeMethods,
  slug: string,
  wake: 'conditional' | 'immediate' | 'digest' | 'mentions' | 'silent',
  sourceClass?: 'assignment-report' | 'group-ordinary' | 'human-dm' | 'bot-dm' | 'group-mention',
  digestCount?: number,
  digestIntervalSeconds?: number,
  delivery?: 'steer' | 'turn',
): { policy: BotSourcePolicy } {
  return unwrap(
    methods.botSourcePolicySet({
      slug,
      wake,
      sourceClass,
      digestCount,
      digestIntervalSeconds,
      delivery,
    }),
  );
}

export function botSourcePolicyReset(
  methods: ActivityBridgeMethods,
  slug: string,
  sourceClass?: 'assignment-report' | 'group-ordinary' | 'human-dm' | 'bot-dm' | 'group-mention',
): { policy: BotSourcePolicy } {
  return unwrap(methods.botSourcePolicyReset({ slug, sourceClass }));
}

export function channelActivityToday(methods: ActivityBridgeMethods): ChannelActivityToday {
  return unwrap(methods.channelActivityToday({}));
}

export function activityOverview(methods: ActivityBridgeMethods) {
  return unwrap(methods.activityOverview({}));
}

export function humanAttention(
  methods: ActivityBridgeMethods,
  category?: HumanAttentionCategory,
  botSlug?: string,
  channelId?: string,
  limit?: number,
  cursor?: string,
  sort?: 'newest' | 'oldest' | 'mentions-first',
  snoozed?: boolean,
  kind?: 'auto-rejection',
  search?: string,
  unreadOnly?: boolean,
  queryVersion?: number,
  dismissed?: boolean,
  notifications?: boolean,
): HumanAttentionPage {
  return unwrap(
    methods.humanAttention({
      category,
      botSlug,
      channelId,
      limit,
      cursor,
      sort,
      snoozed,
      kind,
      search,
      unreadOnly,
      queryVersion,
      dismissed,
      notifications,
    }),
  );
}

export function humanAttentionStatus(
  methods: ActivityBridgeMethods,
  messageCounts?: boolean,
): HumanAttentionStatus {
  return unwrap(methods.humanAttentionStatus({ messageCounts }));
}

export function channelUnreadCounts(methods: ActivityBridgeMethods): {
  channels: Array<{ channelId: string; unreadCount: number }>;
} {
  return unwrap(methods.channelUnreadCounts({}));
}

export function humanAttentionDismiss(
  methods: ActivityBridgeMethods,
  itemId: string,
  sourceKey: string,
): { accepted: boolean } {
  return unwrap(methods.humanAttentionDismiss({ itemId, sourceKey }));
}

export function humanAttentionRestore(
  methods: ActivityBridgeMethods,
  itemId: string,
  sourceKey: string,
): { accepted: boolean } {
  return unwrap(methods.humanAttentionRestore({ itemId, sourceKey }));
}

export async function humanAttentionDismissAll(
  methods: ActivityBridgeMethods,
  kind?: string,
  category?: string,
  botSlug?: string,
  channelId?: string,
): Promise<{ accepted: boolean; dismissed: number; read: number; more: boolean }> {
  return unwrap(await methods.humanAttentionDismissAll({ kind, category, botSlug, channelId }));
}

export function humanAttentionIgnore(
  methods: ActivityBridgeMethods,
  sourceEventId: string,
): { accepted: boolean } {
  return unwrap(methods.humanAttentionIgnore({ sourceEventId }));
}

export function humanAttentionSnooze(
  methods: ActivityBridgeMethods,
  itemId: string,
  sourceKey: string,
  until: string | null,
): { accepted: boolean } {
  return unwrap(methods.humanAttentionSnooze({ itemId, sourceKey, until }));
}

export async function profileActivity(
  methods: ActivityBridgeMethods,
  channelId: string,
  before?: string,
  weeks?: number,
): Promise<ProfileActivity> {
  return unwrap(await methods.profileActivity({ channelId, before, weeks }));
}

export function groupProfileActivity(
  methods: ActivityBridgeMethods,
  channelId: string,
): GroupProfileActivity {
  return unwrap(methods.groupProfileActivity({ channelId }));
}
