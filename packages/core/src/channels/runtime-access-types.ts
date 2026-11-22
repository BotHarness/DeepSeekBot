import type { ChannelAttachmentRef } from '../attachments/ref.js';
import type { ChannelFileAccess } from '../features/channel-files/events.js';
import type { VoiceChannelAccess } from '../features/voice/events.js';
import type { BotContactPage, BotContactQuery } from '../runtime/bot-contact-discovery.js';
import type { BotCreateInput, BotCreateOutcome } from '../runtime/bot-runtime.js';
import type {
  ChannelMessage,
  ChannelReaction,
  ChannelRecord,
  GroupInvitation,
  GroupJoinRequest,
  GroupWakePolicyView,
} from './channel.js';
import type { ChannelCallWindow } from './call-window.js';
import type { ChannelQuote } from './quotes.js';
import type { ChannelMessageQueryOptions } from './store.js';

export interface ChannelMessageView {
  actorNames?: { humans: Record<string, string>; bots: Record<string, string> };
  channelId: string;
  channelName: string;
  message: ChannelMessage;
}

export interface ChannelListInput {
  channelId?: string;
  name?: string;
  type?: 'group' | 'dm';
  memberBotIds?: string[];
  cursor?: string;
  limit?: number;
}

export interface ChannelListEntry {
  id: string;
  name: string;
  type: 'group' | 'dm';
  kind: 'group' | 'human-dm' | 'bot-dm';
  members: Array<{ botId: string; displayName: string; active: boolean }>;
  humanMembers: Array<{ humanId: string; displayName: string }>;
  ownerBotId?: string;
  pendingJoinRequests?: Array<{
    requestId: string;
    requesterBotId: string;
    createdAt: string;
  }>;
}

export interface ChannelListPage {
  channels: ChannelListEntry[];
  nextCursor?: string;
}

export type ChannelQueryInput = ChannelMessageQueryOptions & {
  channelId?: string;
  scope?: 'channel' | 'joined';
  call?: string;
  fromMs?: number;
  toMs?: number;
};

export interface ChannelQueryPage {
  messages: ChannelMessageView[];
  nextCursor?: string;
  call?: ChannelCallWindow;
}

export interface OrchestratorChannelAccess extends ChannelFileAccess, VoiceChannelAccess {
  startHumanDm?(humanId: string): ChannelRecord;
  replySource?(sourceEventId: string): { channelId: string; messageId: string };
  list(input?: ChannelListInput): ChannelListPage;
  read(input?: {
    channelId?: string;
    before?: string;
    limit?: number;
    observe?: false;
  }): ChannelMessageView[];

  ignore(input: { channelId?: string; messageId: string }): {
    sourceEventId: string;
    ignoredAt: string;
    alreadyIgnored: boolean;
  };
  query(input?: ChannelQueryInput): ChannelQueryPage;
  readModel(input?: ChannelQueryInput & { messageId?: string; contentCursor?: string }): string;
  requestGrant(reason: string, channelId?: string): Promise<ChannelMessage>;
  contacts(input?: BotContactQuery): Promise<BotContactPage>;
  createGroup(name: string): ChannelRecord;
  inviteGroup(input: { channelId: string; targetBotSlug: string }): GroupInvitation;
  requestGroupJoin?(input: { channelId: string }): GroupJoinRequest;
  decideGroupJoin?(input: { channelId: string; requestId: string; accept: boolean }): {
    channel: ChannelRecord;
    request: GroupJoinRequest;
  };
  respondToGroupInvite(input: { invitationId: string; accept: boolean }): {
    channel: ChannelRecord;
    invitation: GroupInvitation;
  };
  renameGroup(input: { channelId: string; name: string }): ChannelRecord;
  removeGroupMember(input: { channelId: string; botSlug: string }): ChannelRecord;
  readGroupWakePolicy(channelId: string): GroupWakePolicyView;
  setGroupWakePolicy(input: {
    channelId: string;
    mode: 'all' | 'digest' | 'mentions' | 'silent';
    count: number;
    intervalSeconds: number;
  }): GroupWakePolicyView;
  leaveGroup(input: { channelId: string }): {
    channelId: string;
    left: boolean;
  };
  react?(input: BotReactionInput & { channelId?: string }): BotReactionResult;
  sendToBot(input: {
    botSlug: string;
    body: string;
    replyTo?: string;
    deliveryKey?: string;
  }): Promise<{ channelId: string; message: ChannelMessage }>;
  createBot?(input: BotCreateInput): BotCreateOutcome;
  inspectDrafts?(input: {
    channelId: string;
    draftId?: string;
  }): import('./send-review.js').DraftInspection | import('./send-review.js').SendReviewOutcome;
  dropDraft?(input: {
    channelId: string;
    draftId: string;
    observationId?: string;
    yieldToMessageIds?: string[];
  }): import('./send-review.js').SendReviewOutcome;
  send(input: {
    genui?: import('./genui.js').GenuiContent;
    sessionLinks?: import('./channel.js').ChannelSessionLink[];
    replySourceEventId?: string;
    observationId?: string;
    draftId?: string;
    freshnessOverride?: import('./send-review.js').FreshnessOverride;
    recover?: boolean;
    body: string;
    channelId?: string;
    replyTo?: string;
    quotes?: ChannelQuote[];
    attachments?: ChannelAttachmentRef[];
    mentionBotIds?: string[];
    mentionHumanIds?: string[];
    deliveryKey?: string;
  }): Promise<ChannelMessage>;
  linkSessions?(input: {
    messageId: string;
    links: Array<import('./channel.js').ChannelSessionLink & { createdAt?: string }>;
  }): ChannelMessage;
}

export interface BotReactionInput {
  messageId: string;
  emoji: string;
  active: boolean;
}

export interface BotReactionResult {
  channelId: string;
  messageId: string;
  reactions: ChannelReaction[];
}
