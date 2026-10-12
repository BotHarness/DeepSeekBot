export interface MessagingAccount {
  ref: string;
  platform: string;
  name: string;
  fingerprint: string;
  connected: boolean;
  typingSupported?: boolean;
  reactionSupported?: boolean;
  unsupported?: 'checked-send';
}

export interface MessagingTypingState {
  phase: 'idle' | 'requesting' | 'accepted' | 'cleanup-unconfirmed';
  reason?: string;
}

export interface MessagingTypingLease {
  accepted: true;
  stop(): Promise<void>;
}

export interface MessagingTarget {
  ref: string;
  name: string;
  digest: string;
  receiveScope?: { kind: 'group' | 'dm'; conversationId: string };
}

export interface MessagingAttachment {
  id: string;
  messageId: string;
  resourceKey: string;
  name: string;
  sizeBytes?: number;
  mediaType?: string;
}

export type MessagingContentPart =
  | { kind: 'text'; text: string }
  | { kind: 'attachment'; id: string };

export interface MessagingVoice {
  transcript: 'platform' | 'unavailable';
  itemId?: string;
  durationMs?: number;
  encodeType?: number;
  sampleRate?: number;
  bitsPerSample?: number;
}

export interface MessagingVideo {
  itemId?: string;
  reportedSizeBytes?: number;
  playLength?: number;
}

export interface MessagingQuote {
  serverMessageId?: string;
  itemId?: string;
  text?: string;
  summary?: string;
  attachmentKind?: 'image' | 'audio' | 'file' | 'video';
  partial?: { start: string; end: string; startIndex: number; endIndex: number; digest: string };
}
export type MessagingContextScope = MessagingHistoryScope | 'retained' | 'retained-nearby';

export interface MessagingInboundEvent {
  version: 1;
  channel: 'feishu' | 'slack' | 'discord' | 'weixin' | 'qq';
  botId: string;
  fingerprint: string;
  eventId: string;
  messageId: string;
  actor: { kind: 'user'; id: string; name?: string };
  conversation: { kind: 'group' | 'dm'; id: string; name?: string };
  mentions: { id: string; key: string; name?: string }[];
  mentionedAccount: boolean;
  at: string;
  text: string;
  attachments?: MessagingAttachment[];
  contentParts?: MessagingContentPart[];
  voice?: MessagingVoice;
  video?: MessagingVideo;
  quote?: MessagingQuote;
  reply: MessagingReplyRoute;
  replay: { kind: 'provider-redelivery'; resumeCursor: false; gapPossible: true };
}

export interface MessagingReplyRoute {
  messageId: string;
  conversationId: string;
  actorId: string;
  threadId?: string;
  rootId?: string;
  parentId?: string;
}

export type MessagingHistoryScope = 'group' | 'nearby' | 'thread';
export interface MessagingHistoryQuery {
  scope: MessagingHistoryScope;
  limit: number;
  cursor?: string;
  beforeCount?: number;
  afterCount?: number;
}
export interface MessagingHistoryPage {
  version: 1;
  scope: MessagingHistoryScope;
  events: MessagingInboundEvent[];
  omitted: number;
  hasMore: boolean;
  nextCursor?: string;
  window?: { start: number; end: number };
  coverage: 'provider-visible-human-text';
}

export interface MessagingReceipt {
  version: 1;
  identityKind?: 'client-acknowledgement';
  messageId: string;
  serverMessageId?: string;
  conversationId: string;
}

export interface MessagingOwnEcho {
  version: 1;
  botId: string;
  fingerprint: string;
  eventId: string;
  messageId: string;
  conversationId: string;
  text: string;
  at: string;
}

export interface MessagingApprovalCard {
  kind?: undefined;
  requestId: string;
  title: string;
  detail: string;
  status:
    | 'pending'
    | 'web-required'
    | 'allowed-once'
    | 'rejected'
    | 'expired'
    | 'executed'
    | 'execution-failed'
    | 'execution-unknown'
    | 'test';
}

export interface MessagingApprovalAction {
  kind?: undefined;
  version: 1;
  channel: 'feishu';
  botId: string;
  fingerprint: string;
  actorId: string;
  conversationId: string;
  messageId: string;
  requestId: string;
  action: 'allowed-once' | 'rejected';
}

export interface MessagingPairingCard {
  kind: 'pairing';
  requestId: string;
  title: string;
  detail: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'unavailable';
  roles: { id: string; name: string; revision: number }[];
  selectedRoleId?: string;
  page: number;
  pages: number;
}
export interface MessagingPairingAction {
  kind: 'pairing';
  version: 1;
  channel: 'feishu';
  botId: string;
  fingerprint: string;
  actorId: string;
  conversationId: string;
  messageId: string;
  requestId: string;
  action: 'select-role' | 'approve-pairing' | 'reject-pairing' | 'next-roles' | 'previous-roles';
  roleId?: string | undefined;
}
export type MessagingCardAction = MessagingApprovalAction | MessagingPairingAction;

export interface MessagingApprovalAck {
  accepted: true;
  status: 'queued' | 'refused';
}

export interface MessagingSetup {
  version: 1;
  platform: 'feishu' | 'weixin';
  endpoint: 'dsh-im/app-setup';
  kind: 'credentials' | 'qr';
}

export interface MessagingProvider {
  setup?(): Promise<MessagingSetup | undefined>;
  id: string;
  react?(input: {
    accountRef: string;
    fingerprint: string;
    route: MessagingReplyRoute;
    reaction: 'received' | 'answered';
    signal: AbortSignal;
    beforeSend(): boolean;
  }): Promise<{ accepted: true }>;
  accounts(): Promise<MessagingAccount[]>;
  targets(accountRef: string): Promise<MessagingTarget[]>;
  inspectAccount?(accountRef: string): Promise<MessagingAccount>;
  inspect(
    accountRef: string,
    targetRef: string,
  ): Promise<{
    account: MessagingAccount;
    target: MessagingTarget;
  }>;
  consume?(input: {
    accountRef: string;
    fingerprint: string;
    signal: AbortSignal;
    onEvent(event: MessagingInboundEvent, signal: AbortSignal): Promise<{ accepted: true }>;
    onEcho?(event: MessagingOwnEcho, signal: AbortSignal): Promise<{ accepted: true }>;
    onAction?(event: MessagingCardAction, signal: AbortSignal): Promise<MessagingApprovalAck>;
  }): Promise<() => void>;
  approvalCard?(input: {
    accountRef: string;
    fingerprint: string;
    route: MessagingReplyRoute | MessagingReceipt;
    card: MessagingApprovalCard | MessagingPairingCard;
    signal: AbortSignal;
    beforeSend(): boolean;
    update?: boolean;
  }): Promise<{ sent?: true; updated?: true; receipt?: MessagingReceipt }>;
  qualifyReply?(input: {
    accountRef: string;
    fingerprint: string;
    route: MessagingReplyRoute;
    signal: AbortSignal;
  }): Promise<MessagingReplyRoute>;
  beginTyping?(input: {
    accountRef: string;
    fingerprint: string;
    route: MessagingReplyRoute;
    signal: AbortSignal;
    beforeSend(): boolean;
    onState(state: MessagingTypingState): void;
  }): Promise<MessagingTypingLease>;
  reply?(input: {
    accountRef: string;
    fingerprint: string;
    route: MessagingReplyRoute;
    text: string;
    signal: AbortSignal;
    beforeSend?: () => boolean;
  }): Promise<{ accepted: true; receipt?: MessagingReceipt }>;
  history?(input: {
    accountRef: string;
    fingerprint: string;
    route: MessagingReplyRoute;
    query: MessagingHistoryQuery;
    signal: AbortSignal;
  }): Promise<MessagingHistoryPage>;
  readFile?(input: {
    accountRef: string;
    fingerprint: string;
    route: MessagingReplyRoute;
    attachment: MessagingAttachment;
    signal: AbortSignal;
  }): Promise<AsyncIterable<Uint8Array>>;
  replyFile?(input: {
    accountRef: string;
    fingerprint: string;
    route: MessagingReplyRoute;
    file: { id: string; name: string; bytes: Uint8Array; mediaType?: string };
    signal: AbortSignal;
    beforeSend?: () => boolean;
  }): Promise<{ accepted: true }>;
  post?(input: {
    accountRef: string;
    targetRef: string;
    fingerprint: string;
    targetDigest: string;
    conversationId: string;
    text: string;
    signal: AbortSignal;
    beforeSend?: () => boolean;
  }): Promise<{ accepted: true; receipt: MessagingReceipt }>;
  send(input: {
    accountRef: string;
    targetRef: string;
    fingerprint: string;
    targetDigest: string;
    text: string;
    signal: AbortSignal;
  }): Promise<{ accepted: true }>;
}

export class MessagingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'MessagingError';
  }
}

export class MessagingProviderError extends Error {
  constructor(
    readonly code: string,
    readonly disposition: 'not-started' | 'unknown',
  ) {
    super(code);
    this.name = 'MessagingProviderError';
  }
}
