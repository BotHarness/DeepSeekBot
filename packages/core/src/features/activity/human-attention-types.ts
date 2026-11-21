import type { ChannelMessageAuthor } from '../../channels/message-author.js';
import type { HumanContext } from '../../humans/context.js';
import type { HumanAssignmentContext } from '../../runtime/assignment-human-context.js';
import type { ApprovalCard } from '../../team/approval-contract.js';

export type HumanAttentionCategory = 'action' | 'info' | 'unread' | 'replies' | 'handled';
export type HumanAttentionSort = 'newest' | 'oldest' | 'mentions-first';

export interface HumanAttentionItem {
  author?: Extract<ChannelMessageAuthor, { kind: 'bot' }>;
  approval?: ApprovalCard;
  id: string;
  category: HumanAttentionCategory;
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
  queryVersion?: 1;
  notificationVersion?: 1;
  items: HumanAttentionItem[];
  nextCursor?: string;
}

export interface HumanAttentionStatus {
  unreadCount: number;
  hasAction: boolean;
  messageCounts?: { replies: number; other: number };
}

export interface HumanAttentionQuery {
  item(human: HumanContext, id: string, sourceKey?: string): HumanAttentionItem | undefined;
  assignmentContext(
    botSlug: string,
    sessionId: string,
    sourceEventId: string,
  ): HumanAssignmentContext | undefined;
  list(
    human: HumanContext,
    input: {
      itemId?: string;
      includeDismissed?: boolean;
      snoozed?: boolean;
      dismissed?: boolean;
      category?: HumanAttentionCategory;
      kind?: HumanAttentionItem['kind'];
      sort?: HumanAttentionSort;
      search?: string;
      unreadOnly?: boolean;
      botSlug?: string;
      channelId?: string;
      cursor?: string;
      limit?: number;
    },
  ): HumanAttentionPage;
  status(human: HumanContext, messageCounts?: boolean): HumanAttentionStatus;
  unreadByChannel(human: HumanContext): Array<{ channelId: string; unreadCount: number }>;
  dmReplies(
    human: HumanContext,
    limit: number,
    before?: { createdAt: string; sourceEventId: string },
  ): HumanAttentionItem[];
  durableAttention(human: HumanContext): Array<{
    botSlug: string;
    waitingHumanCount: number;
    blockedCount: number;
    workspaceGrantCount: number;
    informationalCount: number;
  }>;
  actionCount(human: HumanContext): number;
  actionSummary(human: HumanContext): { count: number; botSlugs: string[] };
  openTimedQuestionCards(): Array<{ channelId: string; messageId: string }>;
}

export interface HumanAttentionDecisions {
  dismiss(human: HumanContext, item: HumanAttentionItem): boolean;
  restore(human: HumanContext, item: HumanAttentionItem): boolean;
  snooze(human: HumanContext, item: HumanAttentionItem, until: string | null): boolean;
  ignoreAssignmentReport(human: HumanContext, sourceEventId: string): boolean;
}
