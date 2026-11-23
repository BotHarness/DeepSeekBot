import type { GroupMemberTarget } from '@botharness/host-protocol/group-members';
import {
  ChannelLiveRefused,
  type ChannelLiveFrame,
  type DraftDelivery,
} from '../../channels/live.js';
import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
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

export const channelsRpcMethods = {
  channelJournalPage(
    channelId: string,
    through: number,
    before?: number,
    limit?: number,
  ): ChannelJournalPage {
    return channelJournalPage(
      this.live,
      () => this.invocationHuman(),
      this.team,
      channelId,
      through,
      before,
      limit,
    );
  },

  channelRetry(
    channelId: string,
    messageId: string,
    recovery?: 'continue' | 'compact' | 'new-session',
    failureMessageId?: string,
  ): Promise<{ accepted: true }> {
    return channelRetry(this.methods, channelId, messageId, recovery, failureMessageId);
  },

  composerValidate(
    channelId: string,
    attachments: ChannelAttachmentRef[],
    replyTo?: string,
    quotes?: Array<{ messageId: string; text?: string }>,
  ) {
    return composerValidate(this.methods, channelId, attachments, replyTo, quotes);
  },

  channelAllBotPreview(channelId: string): AllBotPreview {
    return channelAllBotPreview(this.methods, channelId);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const channelChangeRpc = {
  channelChanges(
    channelId: string,
    sinceSeq: number,
    epoch?: string,
    limit?: number,
  ): ChannelChanges {
    return channelChanges(
      this.live,
      () => this.invocationHuman(),
      this.team,
      channelId,
      sinceSeq,
      epoch,
      limit,
    );
  },

  channelChangeCursor(): ChannelChangeCursor {
    return channelChangeCursor(this.live, () => this.invocationHuman());
  },

  async *followChannel(
    channelId: string,
    limit: number,
    drafts: DraftDelivery | undefined,
    signal: AbortSignal,
  ): AsyncGenerator<ChannelLiveFrame> {
    if (this.live === undefined)
      throw toRemoteError({
        code: 'unavailable',
        message: 'Live stream is unavailable',
      });
    try {
      const human = this.invocationHuman();
      for await (const frame of this.live.followChannel(
        human,
        channelId,
        limit,
        signal,
        drafts ?? 'full',
      ))
        yield this.team?.approvals.project(human, frame, channelId) ?? frame;
    } catch (error) {
      if (error instanceof ChannelLiveRefused)
        throw toRemoteError({ code: error.code, message: error.message });
      throw error;
    }
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const channelManagementRpc = {
  async channels(): Promise<{ channels: ChannelListItem[] }> {
    return channels(this.methods);
  },

  async channelListChanges(sinceSeq: number, epoch?: string): Promise<ChannelListChanges> {
    return channelListChanges(this.methods, sinceSeq, epoch);
  },

  channelDm(
    slug: string,
    displayName?: string,
  ): { channel: ChannelRecord & { readOnly?: boolean } } {
    return channelDm(this.methods, slug, displayName);
  },

  channelGet(channelId: string) {
    return channelGet(this.methods, channelId);
  },

  channelCreate(
    name: string,
    members: string[],
    operationKey?: string,
  ): { channel: ChannelRecord } | ChannelManagementResult {
    return channelCreate(this.methods, name, members, operationKey);
  },

  channelRename(
    channelId: string,
    name: string,
    expectedChannel?: string,
  ): { channel: ChannelRecord; bot?: PersonaBotDetail } {
    return channelRename(this.methods, channelId, name, expectedChannel);
  },

  channelGroupAvatarSet(
    channelId: string,
    avatar: string | null,
    expectedChannel?: string,
  ): { channel: ChannelRecord } {
    return channelGroupAvatarSet(this.methods, channelId, avatar, expectedChannel);
  },

  channelGroupMemberPicker(channelId?: string, query?: string) {
    return unwrap(this.methods.channelGroupMemberPicker({ channelId, query }));
  },

  channelGroupMembersAdd(channelId: string, targets: GroupMemberTarget[]) {
    return unwrap(this.methods.channelGroupMembersAdd({ channelId, targets }));
  },

  channelGroupInvite(
    channelId: string,
    botSlug: string,
    operationKey?: string,
    expectedChannel?: string,
  ): { channel: ChannelRecord } | ChannelManagementResult {
    return channelGroupInvite(this.methods, channelId, botSlug, operationKey, expectedChannel);
  },

  channelGroupInviteCancel(
    channelId: string,
    invitationId: string,
    expectedChannel?: string,
  ): { channel: ChannelRecord } {
    return channelGroupInviteCancel(this.methods, channelId, invitationId, expectedChannel);
  },

  channelGroupJoinDecide(
    channelId: string,
    requestId: string,
    accept: boolean,
    expectedChannel?: string,
  ): { channel: ChannelRecord } {
    return channelGroupJoinDecide(this.methods, channelId, requestId, accept, expectedChannel);
  },

  channelGroupMemberRemove(
    channelId: string,
    botSlug: string,
    expectedChannel?: string,
  ): { channel: ChannelRecord } {
    return channelGroupMemberRemove(this.methods, channelId, botSlug, expectedChannel);
  },

  channelGroupSendReview(channelId: string, enabled?: boolean): { enabled: boolean } {
    return channelGroupSendReview(this.methods, channelId, enabled);
  },

  channelGroupWakePolicies(channelId: string): {
    members: GroupMemberWakePolicy[];
  } {
    return channelGroupWakePolicies(this.methods, channelId);
  },

  channelGroupWakeSet(
    channelId: string,
    botSlug: string,
    mode: 'all' | 'mentions' | 'digest' | 'silent',
    count: number,
    intervalSeconds: number,
    inherit?: boolean,
    expectedChannel?: string,
  ): { channel: ChannelRecord } {
    return channelGroupWakeSet(
      this.methods,
      channelId,
      botSlug,
      mode,
      count,
      intervalSeconds,
      inherit,
      expectedChannel,
    );
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const channelDeletionRpc = {
  channelGroupDelete(channelId: string): { deleted: boolean } & GroupDisbandResult {
    return channelGroupDelete(this.methods, channelId);
  },

  channelHistory(): { channels: ChannelHistoryItem[] } {
    return channelHistory(this.methods);
  },

  channelHistorySources(
    channelId: string,
    before?: string,
  ): { sources: PurgeSource[]; before?: string } {
    return channelHistorySources(this.methods, channelId, before);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const channelHistoryRpc = {
  channelMessages(
    channelId: string,
    before?: string,
    limit?: number,
  ): { messages: ChannelMessage[]; revision: number } {
    return channelMessages(this.methods, channelId, before, limit);
  },

  channelTimeline(
    channelId: string,
    direction?: TimelineDirection,
    cursor?: string,
    around?: string,
    limit?: number,
    olderLimit?: number,
    newerLimit?: number,
  ): { page: ChannelTimelinePage; revision: number } {
    return channelTimeline(
      this.methods,
      channelId,
      direction,
      cursor,
      around,
      limit,
      olderLimit,
      newerLimit,
    );
  },

  channelReadPosition(channelId: string): { position?: ChannelReadPosition } {
    return channelReadPosition(this.methods, channelId);
  },

  async channelMarkAllRead(channelId?: string, botSlug?: string): Promise<{ channels: number }> {
    return channelMarkAllRead(this.methods, channelId, botSlug);
  },

  async channelMarkRead(
    channelId: string,
    messageId: string,
  ): Promise<{ position: ChannelReadPosition }> {
    return channelMarkRead(this.methods, channelId, messageId);
  },

  channelReact(
    channelId: string,
    messageId: string,
    emoji: string,
    active: boolean,
  ): { reactions: ChannelReaction[] } {
    return channelReact(this.methods, channelId, messageId, emoji, active);
  },

  channelSearch(
    channelId: string,
    text: string,
    cursor?: string,
    limit?: number,
  ): { messages: ChannelMessage[]; nextCursor?: string } {
    return channelSearch(this.methods, channelId, text, cursor, limit);
  },

  messageSearch(text: string, cursor?: string, limit?: number): HumanMessageSearchPage {
    return messageSearch(this.methods, text, cursor, limit);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const channelSendRpc = {
  channelSendStatus(channelId: string, messageId: string): ChannelSendStatus {
    return channelSendStatus(this.methods, channelId, messageId);
  },

  async channelSend(
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
    return channelSend(
      this.methods,
      channelId,
      body,
      replyTo,
      attachments,
      messageId,
      memorySwitchTarget,
      mentions,
      channelRefs,
      grantRequestResolution,
      assignmentReply,
      allBotMention,
      genuiReply,
      skillInvocations,
      quotes,
    );
  },
} satisfies ThisType<BridgeRpcReceiver>;
