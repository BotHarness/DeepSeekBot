import {
  type TurnTarget,
  type SessionTurnModelSwitch,
} from '@botharness/host-protocol/turn-target';
import type { HostClient, RemoteSource } from './client';
import { type GenuiDocument, type GenuiDocumentReply } from './genui/document';
import { type ChannelActivity } from './channel-activity';
import { type ApprovalContent } from './requests';
import type {
  WireAllBotMention,
  WireMention,
  ChannelWireMessage,
  JournalEntry,
  ToolApprovalOutcome,
  WireDelivery,
  WireReaction,
  WireReplyPreview,
  WireSkillInvocation,
} from '@botharness/host-protocol/wire';

export type DeliveryState = 'pending' | 'committed' | 'failed';

export type CardKind = 'tool-approval' | 'user-question' | 'private-input' | 'grant' | 'takeover';

export interface MessageCard {
  kind: CardKind;
  channelId: string;
  subject?: string;
  command?: string;
  approvalContent?: ApprovalContent;
  resolved?: true;
  takeover?: { target: 'computer' | 'browser'; title: string; expiresAt: string };
}

export type CardResolution =
  | { kind: 'tool-approval'; outcome: ToolApprovalOutcome }
  | { kind: 'user-question'; state: 'answered' | 'cancelled' }
  | { kind: 'grant' }
  | { kind: 'private-input' }
  | { kind: 'takeover'; outcome: 'done' | 'failed' | 'cancelled' | 'expired' };

export interface MessageAttachment {
  key: string;
  identity?: string;
  kind: 'image' | 'file' | 'audio';
  name: string;
  mime?: string;
  size?: number;
  source?: RemoteSource;
  thumbnail?: RemoteSource;
  preview?: RemoteSource;
  thumbhash?: string;
  width?: number;
  height?: number;
  local: boolean;
  cleared?: true;
}

export type ConversationReaction = WireReaction;

export interface MessageVoice {
  state: 'pending' | 'ready' | 'failed';
  audio?: MessageAttachment;
  durationMs?: number;
  error?: string;
}

export interface ReplyThumbnail {
  source: RemoteSource;
  thumbhash?: string;
}

export interface ConversationMessage {
  turnTargets?: TurnTarget[];
  turnModelSwitch?: SessionTurnModelSwitch;
  source?: JournalEntry;
  voice?: MessageVoice;
  sessionFailure?: import('./session-failure').SessionFailure;
  id: string;
  revision?: number;
  at: string;
  author: 'human' | 'person' | 'bot' | 'system';
  bot?: string;
  person?: { humanId: string; name: string };
  body: string;
  mentions?: WireMention[];
  skillInvocations?: WireSkillInvocation[];
  replyTo?: string;
  replyPreview?: WireReplyPreview | null;
  replyThumbnail?: ReplyThumbnail;
  attachments: MessageAttachment[];
  genuiDocument?: GenuiDocument;
  card?: MessageCard;
  resolves?: { requestId: string; resolution: CardResolution };
  reactions?: ConversationReaction[];
  deliveries?: WireDelivery[];
  delivery: DeliveryState;
  attemptStartedAt?: number;
  error?: string;
  welcome?: true;
  activity?: ChannelActivity;
}

export interface ConversationDraft {
  draftId: string;
  botSlug: string;
  body: string;
}

export type ConversationDraftReference = Pick<ConversationDraft, 'draftId' | 'botSlug'>;

export type ConversationStatus = 'opening' | 'live' | 'interrupted' | 'refused';

export interface ConversationSnapshot {
  status: ConversationStatus;
  reason?: string;
  messages: ConversationMessage[];
  drafts: ConversationDraft[];
  hasOlder: boolean;
  loadingOlder: boolean;
  olderError?: boolean;
  fromCache: boolean;
}

export interface ConversationTimelineSnapshot extends Omit<ConversationSnapshot, 'drafts'> {
  drafts: ConversationDraftReference[];
}

export interface ChangeCursor {
  epoch: string;
  seq: number;
}

export interface CachedConversation {
  entries: JournalEntry[];
  hasOlder: boolean;
  changes?: ChangeCursor;
}

export interface CachedChanges {
  upserts: readonly JournalEntry[];
  tombstones: readonly string[];
  removed: readonly string[];
  cursor: ChangeCursor;
}

export interface OlderPage {
  entries: JournalEntry[];
  hasOlder: boolean;
}

export interface ConversationCache {
  read(key: string): Promise<CachedConversation | undefined>;
  write(key: string, value: CachedConversation): void;
  applyChanges?(key: string, channelId: string, changes: CachedChanges): void;
  replace?(key: string, channelId: string, value: CachedConversation): void;
  readOlder?(key: string, before: number, limit: number): Promise<OlderPage | undefined>;
  writeOlder?(key: string, channelId: string, before: number, page: OlderPage): void;
}

export interface SendObservation {
  accepted(): boolean;
  observed(): void;
}
export interface Conversation {
  setForeground?(visible: boolean): void;
  getSnapshot(): ConversationSnapshot;
  getTimelineSnapshot(): ConversationTimelineSnapshot;
  subscribe(listener: () => void): () => void;
  start(): void;
  stop(): void;
  loadOlder(): Promise<void>;
  send(body: string, files?: OutgoingFile[], tags?: MessageTags): string;
  retry(messageId: string): void;
  react(messageId: string, emoji: string, active: boolean): Promise<void>;
  wireMessage?(messageId: string): ChannelWireMessage | undefined;
  redact?(placements: readonly { channelId: string; messageId: string }[]): void;
}

export interface ConversationOptions {
  telemetry?: { send(): SendObservation };
  host: Pick<HostClient, 'call' | 'follow' | 'upload' | 'resource'>;
  botSlug?: string;
  displayName?: string;
  channelId?: string;
  cacheKey?: string;
  cache?: ConversationCache;
  pageSize?: number;
  olderPageSize?: number;
  cachedEntries?: number;
  messageId?: () => string;
  draftDelayMs?: number;
  cacheWaitMs?: number;
  selfHumanId?: string;
}

export interface OutgoingFile {
  name: string;
  kind?: 'image' | 'file';
  uri?: string;
  read(): Promise<Blob>;
}

export interface MessageTags {
  mentions?: WireMention[];
  skillInvocations?: WireSkillInvocation[];
  allBotMention?: WireAllBotMention;
  replyTo?: string;
  genuiReply?: GenuiDocumentReply;
}
