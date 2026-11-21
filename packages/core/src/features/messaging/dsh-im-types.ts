import type {
  MessagingAttachment,
  MessagingReceipt,
  MessagingReplyRoute,
  MessagingHistoryQuery,
  MessagingHistoryPage,
  MessagingApprovalCard,
  MessagingQuestionCard,
  MessagingPairingCard,
  MessagingApprovalAck,
  MessagingTypingState,
  MessagingTypingLease,
} from '../../messaging/provider.js';

export interface DshImTarget {
  targetId: string;
  name?: string;
  kind: string;
  route: Record<string, string | number>;
}

export interface DshImOutboundService {
  contractVersion: 1;
  setupVersion?: 1;
  describeSetup?(channel: string): Promise<unknown> | unknown;
  reactionVersion?: 1;
  reactionChecked?(
    botId: string,
    route: MessagingReplyRoute,
    reaction: 'received' | 'answered',
    options: { expectedFingerprint: string; signal: AbortSignal; beforeSend(): boolean },
  ): Promise<{ accepted: true }>;
  approvalCardVersion?: 1;
  questionCardVersion?: 1;
  questionCardChecked?(
    botId: string,
    route: MessagingReplyRoute | MessagingReceipt,
    card: MessagingQuestionCard,
    options: {
      expectedFingerprint: string;
      signal: AbortSignal;
      beforeSend(): boolean;
      update?: boolean;
    },
  ): Promise<{ sent?: true; updated?: true; receipt?: MessagingReceipt }>;
  approvalRuleCardVersion?: 1 | 2;
  pairingCardVersion?: 1;
  approvalCardChecked?(
    botId: string,
    route: MessagingReplyRoute | MessagingReceipt,
    card: MessagingApprovalCard | MessagingPairingCard,
    options: {
      expectedFingerprint: string;
      signal: AbortSignal;
      beforeSend(): boolean;
      update?: boolean;
    },
  ): Promise<{ sent?: true; updated?: true; receipt?: MessagingReceipt }>;
  fileVersion?: 1;
  replyContextVersion?: 1;
  replyReceiptVersion?: 1;
  replyFenceVersion?: 1;
  receiptVersion?: 1;
  postFenceVersion?: 1;
  reachableConversationVersion?: 1;
  listReachableConversations?(
    botId: string,
    options: { expectedFingerprint: string; signal: AbortSignal; cursor?: string },
  ): Promise<import('../../messaging/provider.js').MessagingReachablePage>;
  postConversationChecked?(
    botId: string,
    conversationId: string,
    text: string,
    options: { expectedFingerprint: string; signal: AbortSignal; beforeSend: () => boolean },
  ): Promise<{ sent: true; receipt: MessagingReceipt }>;
  typingVersion?: 1;
  beginTypingChecked?(
    botId: string,
    route: MessagingReplyRoute,
    options: {
      expectedFingerprint: string;
      signal: AbortSignal;
      beforeSend(): boolean;
      onState(state: MessagingTypingState): void;
    },
  ): Promise<MessagingTypingLease>;
  echoVersion?: 1;
  readSourceFile?(
    botId: string,
    route: MessagingReplyRoute,
    attachment: MessagingAttachment,
    options: { expectedFingerprint: string; signal: AbortSignal },
  ): Promise<AsyncIterable<Uint8Array>>;
  replyFileChecked?(
    botId: string,
    route: MessagingReplyRoute,
    file: { id: string; name: string; bytes: Uint8Array; mediaType?: string },
    options: { expectedFingerprint: string; signal: AbortSignal; beforeSend?: () => boolean },
  ): Promise<{ sent: true; receipt?: MessagingReceipt }>;

  listBots(): Promise<{ botId: string; channel: string }[]>;
  listTargets(botId: string): Promise<DshImTarget[]>;
  describeBot(botId: string): Promise<{
    version: 1;
    channel: string;
    botId: string;
    account: { fingerprint: string; name?: string };
    connected: boolean;
    capabilities: string[];
  }>;
  consumeInbound?(
    botId: string,
    options: {
      expectedFingerprint: string;
      signal: AbortSignal;
      sourceFiles?: boolean;
      sourceImages?: boolean;
      sourceVoiceTranscripts?: boolean;
      sourceVoiceAudio?: boolean;
      sourceVideos?: boolean;
      sourceQuotes?: boolean;
      ordinaryText?: boolean;
      directMessages?: boolean;
      onAction?(event: unknown, context: { signal: AbortSignal }): Promise<MessagingApprovalAck>;
      onEcho?(event: unknown, context: { signal: AbortSignal }): Promise<{ accepted: true }>;
      onEvent(event: unknown, context: { signal: AbortSignal }): Promise<{ accepted: true }>;
    },
  ): Promise<() => void>;
  qualifyReplyChecked?(
    botId: string,
    route: MessagingReplyRoute,
    options: { expectedFingerprint: string; signal: AbortSignal },
  ): Promise<MessagingReplyRoute>;
  replyChecked?(
    botId: string,
    route: MessagingReplyRoute,
    text: string,
    options: {
      expectedFingerprint: string;
      signal: AbortSignal;
      receipt?: true;
      beforeSend?: () => boolean;
      mentionUserIds?: string[];
    },
  ): Promise<{ sent: true; receipt?: MessagingReceipt }>;
  historyChecked?(
    botId: string,
    route: MessagingReplyRoute,
    query: MessagingHistoryQuery,
    options: { expectedFingerprint: string; signal: AbortSignal },
  ): Promise<MessagingHistoryPage>;
  sendChecked(
    botId: string,
    targetId: string,
    text: string,
    options: {
      expectedFingerprint: string;
      expectedTargetDigest: string;
      signal: AbortSignal;
      format: 'plain';
      receipt?: true;
      beforeSend?: () => boolean;
    },
  ): Promise<{ sent: true; receipt?: MessagingReceipt }>;
}
