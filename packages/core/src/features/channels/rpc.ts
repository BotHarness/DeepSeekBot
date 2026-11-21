import type { BridgeLive } from '../../bridge/rpc.js';
import type { HumanContext } from '../../humans/context.js';
import type { TeamService } from '../../team/service.js';
import { toRemoteError } from '../../bridge/rpc-result.js';
import type {
  ChannelJournalPage,
  ChannelChanges,
  ChannelChangeCursor,
} from '../../channels/timeline.js';
import { unwrap, unwrapAsync } from '../../bridge/rpc-result.js';
import type { GenuiMessageReply } from '../../channels/genui.js';
import type { ChannelManagementResult } from '../../channels/management.js';
import type { ChannelHistoryItem, GroupDisbandResult, PurgeSource } from '../../purge/contracts.js';
import type { GroupMemberWakePolicy } from '../../channels/channel.js';
import type { AllBotPreview, AllBotMention } from '../../channels/all-bot-mention.js';
import type {
  ChannelListItem,
  ChannelListChanges,
  PersonaBotDetail,
} from '../../bridge/methods.js';
import type {
  ChannelMessage,
  ChannelReaction,
  ChannelRecord,
  ChannelSkillInvocationToken,
} from '../../channels/channel.js';
import type { ChannelSendStatus, HumanMessageSearchPage } from '../../channels/store.js';
import type { ChannelAttachmentRef } from '../../attachments/ref.js';
import type { ChannelReadPosition } from '../../channels/store.js';
import type { ChannelTimelinePage, TimelineDirection } from '../../channels/timeline.js';
import type { ChannelsAdapterMethods } from './methods.js';
import type { ChannelsManagementAdapterMethods } from './management-methods.js';
import type { ChannelsSendAdapterMethods } from './send-methods.js';

export function channelRetry(
  methods: ChannelsAdapterMethods,
  channelId: string,
  messageId: string,
  recovery?: 'continue' | 'compact' | 'new-session',
  failureMessageId?: string,
): Promise<{ accepted: true }> {
  return unwrapAsync(
    methods.channelRetry({
      channelId,
      messageId,
      recovery,
      failureMessageId,
    }),
  );
}

export async function channels(
  methods: ChannelsAdapterMethods,
): Promise<{ channels: ChannelListItem[] }> {
  return unwrap(await methods.channels({}));
}

export async function channelListChanges(
  methods: ChannelsAdapterMethods,
  sinceSeq: number,
  epoch?: string,
): Promise<ChannelListChanges> {
  return unwrap(await methods.channelListChanges({ sinceSeq, epoch }));
}

export function channelDm(
  methods: ChannelsAdapterMethods,
  slug: string,
  displayName?: string,
): { channel: ChannelRecord & { readOnly?: boolean } } {
  return unwrap(methods.channelDm({ slug, displayName }));
}

export function channelGet(methods: ChannelsAdapterMethods, channelId: string) {
  return unwrap(methods.channelGet({ channelId }));
}

export function channelCreate(
  methods: ChannelsManagementAdapterMethods,
  name: string,
  members: string[],
  operationKey?: string,
): { channel: ChannelRecord } | ChannelManagementResult {
  return unwrap(methods.channelCreate({ name, members, operationKey }));
}

export function channelRename(
  methods: ChannelsManagementAdapterMethods,
  channelId: string,
  name: string,
  expectedChannel?: string,
): { channel: ChannelRecord; bot?: PersonaBotDetail } {
  return unwrap(
    methods.channelRename({
      channelId,
      name,
      ...(expectedChannel === undefined ? {} : { expectedChannel }),
    }),
  );
}

export function channelGroupAvatarSet(
  methods: ChannelsManagementAdapterMethods,
  channelId: string,
  avatar: string | null,
  expectedChannel?: string,
): { channel: ChannelRecord } {
  return unwrap(
    methods.channelGroupAvatarSet({
      channelId,
      avatar,
      ...(expectedChannel === undefined ? {} : { expectedChannel }),
    }),
  );
}

export function channelGroupInvite(
  methods: ChannelsManagementAdapterMethods,
  channelId: string,
  botSlug: string,
  operationKey?: string,
  expectedChannel?: string,
): { channel: ChannelRecord } | ChannelManagementResult {
  return unwrap(
    methods.channelGroupInvite({
      channelId,
      botSlug,
      operationKey,
      expectedChannel,
    }),
  );
}

export function channelGroupInviteCancel(
  methods: ChannelsManagementAdapterMethods,
  channelId: string,
  invitationId: string,
  expectedChannel?: string,
): { channel: ChannelRecord } {
  return unwrap(
    methods.channelGroupInviteCancel({
      channelId,
      invitationId,
      ...(expectedChannel === undefined ? {} : { expectedChannel }),
    }),
  );
}

export function channelGroupJoinDecide(
  methods: ChannelsManagementAdapterMethods,
  channelId: string,
  requestId: string,
  accept: boolean,
  expectedChannel?: string,
): { channel: ChannelRecord } {
  return unwrap(
    methods.channelGroupJoinDecide({
      channelId,
      requestId,
      accept,
      ...(expectedChannel === undefined ? {} : { expectedChannel }),
    }),
  );
}

export function channelGroupMemberRemove(
  methods: ChannelsManagementAdapterMethods,
  channelId: string,
  botSlug: string,
  expectedChannel?: string,
): { channel: ChannelRecord } {
  return unwrap(
    methods.channelGroupMemberRemove({
      channelId,
      botSlug,
      ...(expectedChannel === undefined ? {} : { expectedChannel }),
    }),
  );
}

export function channelGroupSendReview(
  methods: ChannelsManagementAdapterMethods,
  channelId: string,
  enabled?: boolean,
): { enabled: boolean } {
  return unwrap(methods.channelGroupSendReview({ channelId, enabled }));
}

export function channelGroupWakePolicies(
  methods: ChannelsManagementAdapterMethods,
  channelId: string,
): {
  members: GroupMemberWakePolicy[];
} {
  return unwrap(methods.channelGroupWakePolicies({ channelId }));
}

export function channelGroupWakeSet(
  methods: ChannelsManagementAdapterMethods,
  channelId: string,
  botSlug: string,
  mode: 'all' | 'mentions' | 'digest' | 'silent',
  count: number,
  intervalSeconds: number,
  inherit?: boolean,
  expectedChannel?: string,
): { channel: ChannelRecord } {
  return unwrap(
    methods.channelGroupWakeSet({
      channelId,
      botSlug,
      mode,
      count,
      intervalSeconds,
      ...(inherit === undefined ? {} : { inherit }),
      ...(expectedChannel === undefined ? {} : { expectedChannel }),
    }),
  );
}

export function composerValidate(
  methods: ChannelsAdapterMethods,
  channelId: string,
  attachments: ChannelAttachmentRef[],
  replyTo?: string,
  quotes?: Array<{ messageId: string; text?: string }>,
) {
  return unwrap(
    methods.composerValidate({
      channelId,
      attachments,
      ...(replyTo === undefined ? {} : { replyTo }),
      ...(quotes === undefined ? {} : { quotes }),
    }),
  );
}

export function channelGroupDelete(
  methods: ChannelsManagementAdapterMethods,
  channelId: string,
): { deleted: boolean } & GroupDisbandResult {
  return unwrap(methods.channelGroupDelete({ channelId }));
}

export function channelHistory(methods: ChannelsAdapterMethods): {
  channels: ChannelHistoryItem[];
} {
  return unwrap(methods.channelHistory({}));
}

export function channelHistorySources(
  methods: ChannelsAdapterMethods,
  channelId: string,
  before?: string,
): { sources: PurgeSource[]; before?: string } {
  return unwrap(
    methods.channelHistorySources({
      channelId,
      ...(before === undefined ? {} : { before }),
    }),
  );
}

export function channelMessages(
  methods: ChannelsAdapterMethods,
  channelId: string,
  before?: string,
  limit?: number,
): { messages: ChannelMessage[]; revision: number } {
  return unwrap(methods.channelMessages({ channelId, before, limit }));
}

export function channelTimeline(
  methods: ChannelsAdapterMethods,
  channelId: string,
  direction?: TimelineDirection,
  cursor?: string,
  around?: string,
  limit?: number,
  olderLimit?: number,
  newerLimit?: number,
): { page: ChannelTimelinePage; revision: number } {
  return unwrap(
    methods.channelTimeline({
      channelId,
      direction,
      cursor,
      around,
      limit,
      olderLimit,
      newerLimit,
    }),
  );
}

export function channelReadPosition(
  methods: ChannelsAdapterMethods,
  channelId: string,
): { position?: ChannelReadPosition } {
  return unwrap(methods.channelReadPosition({ channelId }));
}

export async function channelMarkAllRead(
  methods: ChannelsAdapterMethods,
  channelId?: string,
  botSlug?: string,
): Promise<{ channels: number }> {
  return unwrap(await methods.channelMarkAllRead({ channelId, botSlug }));
}

export async function channelMarkRead(
  methods: ChannelsAdapterMethods,
  channelId: string,
  messageId: string,
): Promise<{ position: ChannelReadPosition }> {
  return unwrap(await methods.channelMarkRead({ channelId, messageId }));
}

export function channelReact(
  methods: ChannelsAdapterMethods,
  channelId: string,
  messageId: string,
  emoji: string,
  active: boolean,
): { reactions: ChannelReaction[] } {
  return unwrap(methods.channelReact({ channelId, messageId, emoji, active }));
}

export function channelSearch(
  methods: ChannelsAdapterMethods,
  channelId: string,
  text: string,
  cursor?: string,
  limit?: number,
): { messages: ChannelMessage[]; nextCursor?: string } {
  return unwrap(methods.channelSearch({ channelId, text, cursor, limit }));
}

export function messageSearch(
  methods: ChannelsAdapterMethods,
  text: string,
  cursor?: string,
  limit?: number,
): HumanMessageSearchPage {
  return unwrap(methods.messageSearch({ text, cursor, limit }));
}

export function channelAllBotPreview(
  methods: ChannelsAdapterMethods,
  channelId: string,
): AllBotPreview {
  return unwrap(methods.channelAllBotPreview({ channelId }));
}

export function channelSendStatus(
  methods: ChannelsAdapterMethods,
  channelId: string,
  messageId: string,
): ChannelSendStatus {
  return unwrap(methods.channelSendStatus({ channelId, messageId }));
}

export async function channelSend(
  methods: ChannelsSendAdapterMethods,
  channelId: string,
  body: string,
  replyTo?: string,
  attachments?: ChannelAttachmentRef[],
  messageId?: string,
  memorySwitchTarget?: string,
  mentions?: ChannelMessage['mentions'],
  channelRefs?: ChannelMessage['channelRefs'],
  grantRequestResolution?: ChannelMessage['grantRequestResolution'],
  assignmentReply?: ChannelMessage['assignmentReply'],
  allBotMention?: AllBotMention,
  genuiReply?: GenuiMessageReply,
  skillInvocations?: ChannelSkillInvocationToken[],
  quotes?: ChannelMessage['quotes'],
): Promise<{ message: ChannelMessage }> {
  return unwrap(
    await methods.channelSend({
      ...(skillInvocations === undefined ? {} : { skillInvocations }),
      ...(quotes === undefined ? {} : { quotes }),
      channelId,
      body,
      ...(allBotMention === undefined ? {} : { allBotMention }),
      ...(replyTo === undefined ? {} : { replyTo }),
      ...(attachments === undefined ? {} : { attachments }),
      ...(messageId === undefined ? {} : { messageId }),
      ...(memorySwitchTarget === undefined ? {} : { memorySwitchTarget }),
      ...(mentions === undefined ? {} : { mentions }),
      ...(channelRefs === undefined ? {} : { channelRefs }),
      ...(grantRequestResolution === undefined ? {} : { grantRequestResolution }),
      ...(assignmentReply === undefined ? {} : { assignmentReply }),
      ...(genuiReply === undefined ? {} : { genuiReply }),
    }),
  );
}

export function channelJournalPage(
  live: BridgeLive | undefined,
  invocationHuman: () => HumanContext,
  team: TeamService | undefined,
  channelId: string,
  through: number,
  before?: number,
  limit?: number,
): ChannelJournalPage {
  const page = live?.journalPage(invocationHuman(), channelId, {
    through,
    before,
    limit,
  });
  if (page === undefined)
    throw toRemoteError({
      code: 'not-found',
      message: 'Channel journal page is unavailable',
    });
  return team?.approvals.project(invocationHuman(), page, channelId) ?? page;
}

export function channelChanges(
  live: BridgeLive | undefined,
  invocationHuman: () => HumanContext,
  team: TeamService | undefined,
  channelId: string,
  sinceSeq: number,
  epoch?: string,
  limit?: number,
): ChannelChanges {
  const changes = live?.changes(invocationHuman(), channelId, {
    sinceSeq,
    epoch,
    limit,
  });
  if (changes === undefined)
    throw toRemoteError({ code: 'not-found', message: 'Channel changes are unavailable' });
  return team?.approvals.project(invocationHuman(), changes, channelId) ?? changes;
}

export function channelChangeCursor(
  live: BridgeLive | undefined,
  invocationHuman: () => HumanContext,
): ChannelChangeCursor {
  const cursor = live?.changeCursor(invocationHuman());
  if (cursor === undefined)
    throw toRemoteError({ code: 'unavailable', message: 'Channel changes are unavailable' });
  return cursor;
}
