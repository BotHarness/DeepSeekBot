import type { ClientStatus } from './store.js';

export type ActivityListCategory = 'action' | 'info' | 'unread' | 'replies' | 'handled';
export type ActivityListSort = 'newest' | 'oldest';

export interface ActivityListFilters {
  botSlug: string | undefined;
  channelId: string | undefined;
  sort: ActivityListSort;
  snoozed?: boolean;
}

export interface HumanAttentionItem {
  id: string;
  category: ActivityListCategory;
  kind:
    | 'group-join-request'
    | 'pairing-request'
    | 'user-question'
    | 'private-input'
    | 'takeover-request'
    | 'tool-approval'
    | 'auto-rejection'
    | 'workspace-grant-request'
    | 'bot-dm-message'
    | 'assignment-waiting-human'
    | 'assignment-blocked'
    | 'assignment-report'
    | 'bot-message-needs-repair'
    | 'channel-unread'
    | 'channel-reply'
    | 'channel-mention';
  createdAt: string;
  channelId?: string;
  channelName?: string;
  botSlug: string;
  summary: string;
  requestId?: string;
  messageId?: string;
  assignmentSessionId?: string;
  sourceEventId?: string;
  unreadCount?: number;
  isUnread?: boolean;
  responseMessageId?: string;
  responseSourceEventId?: string;
  snoozedUntil?: string;
  autoRejection?: {
    sessionId: string;
    toolName: string;
    input: string;
    template: string;
    reason: string;
  };
}

export interface HumanAttentionPage {
  items: HumanAttentionItem[];
  nextCursor?: string;
}

export interface ActivityListState {
  messageCounts?: { replies: number; other: number } | undefined;
  attentionStatus?: 'ready' | 'error' | undefined;
  status: ClientStatus;
  unreadCount: number;
  channelUnread: Readonly<Record<string, number>>;
  hasAction: boolean;
  category: ActivityListCategory;
  botSlug: string | undefined;
  channelId: string | undefined;
  sort: ActivityListSort;
  snoozed: boolean;
  items: readonly HumanAttentionItem[];
  nextCursor: string | undefined;
  error: string | undefined;
}

export type BotAttentionStatus =
  | 'pending'
  | 'processing'
  | 'observed'
  | 'deferred'
  | 'needs-repair'
  | 'open'
  | 'snoozed'
  | 'handled'
  | 'ignored';

export interface BotAttentionItem {
  id: string;
  botSlug: string;
  reason: string;
  state: BotAttentionStatus;
  createdAt: string;
  observedAt?: string;
  handledAt?: string;
  ignoredAt?: string;
  resolutionNote?: string;
  snoozedUntil?: string;
  snoozeNote?: string;
  sourceKind: string;
  sourceChannelId?: string;
  sourceChannelName?: string;
  sourceMessageId?: string;
  assignmentSessionId?: string;
  assignmentTitle?: string;
  assignmentReportState?: 'progress' | 'completed' | 'blocked' | 'waiting-human' | 'failed';
  scheduleId?: string;
  externalOrigin?: {
    platform: string;
    accountName: string;
    conversationName: string;
    conversationId: string;
    senderId: string;
    senderName?: string;
    voice?: {
      transcript: 'platform' | 'unavailable';
      itemId?: string;
      durationMs?: number;
      encodeType?: number;
      sampleRate?: number;
      bitsPerSample?: number;
    };
  };
  sourceAvailable: boolean;
  authorKind: 'human' | 'bot' | 'bridged' | 'system';
  authorBotSlug?: string;
  summary: string;
}

export interface BotAttentionPage {
  items: BotAttentionItem[];
  nextCursor?: string;
}

export interface BotInboxState {
  status: ClientStatus;
  items: readonly BotAttentionItem[];
  nextCursor: string | undefined;
  error: string | undefined;
}

export function initialBotInbox(): BotInboxState {
  return { status: 'idle', items: [], nextCursor: undefined, error: undefined };
}

export function initialActivityList(): ActivityListState {
  return {
    status: 'idle',
    unreadCount: 0,
    channelUnread: {},
    hasAction: false,
    category: 'action',
    botSlug: undefined,
    channelId: undefined,
    sort: 'oldest',
    snoozed: false,
    items: [],
    nextCursor: undefined,
    error: undefined,
  };
}
