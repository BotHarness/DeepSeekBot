import type { ReceptionRecovery } from './receiver-recovery.js';
import { pendingExternalReception } from './external-reception.js';
import type { ConversationIngestInput, ConversationIngestSnapshot } from './conversation-ingest.js';
import type { PairingRequest } from './pairing.js';
import type { TrustedSenderReference } from './sender-access.js';
import type { GrantReception, ReceptionPath } from './reception-paths.js';
import type { QuoteResolution } from './retained-context.js';
import type {
  ThreadReceptionInput,
  ThreadReceptionPolicy,
  ThreadReceptionView,
} from './thread-policy.js';
import type { GroupReceptionInput, GroupReceptionPolicy } from './group-policy.js';
import type { BotSourcePolicyEditor } from '../runtime/source-policy.js';
import type { ChannelBridgeInput } from './channel-bridge.js';
import type { RelatedReport } from './report.js';
import type {
  MessagingInboundEvent,
  MessagingProvider,
  MessagingContextScope,
} from './provider.js';

export interface ExternalContextRead {
  at: string;
  sessionId: string;
  scope: MessagingContextScope;
  outcome: 'read' | 'refused';
  sourceEventIds: string[];
  omitted: number;
  incomplete: boolean;
  reason?: string;
  coverage?: ExternalContextResult['coverage'];
}

export interface ExternalContextResult {
  scope: MessagingContextScope;
  messages: {
    sourceEventId: string;
    messageId: string;
    senderId: string;
    senderName?: string;
    mentions?: MessagingInboundEvent['mentions'];
    at: string;
    text: string;
    threadId?: string;
  }[];
  omitted: number;
  incomplete: boolean;
  coverage: 'provider-visible-human-text' | 'retained-local-sources';
  nextCursor?: string;
  window?: { start: number; end: number };
  requiredCharacters?: number;
}

export interface ExternalContextQuery {
  scope: MessagingContextScope;
  cursor?: string;
  maxCharacters?: number;
  beforeCount?: number;
  afterCount?: number;
}

export interface ExternalSource {
  dmMirrorEpoch?: string;
  dmMirrorChannelId?: string;
  sender?: TrustedSenderReference;
  id: string;
  body: string;
  at: string;
  platform: string;
  accountName: string;
  conversationName: string;
  event: Omit<MessagingInboundEvent, 'text'>;
  grantId: string;
  grantRevision: number;
  ingressBindingId?: string;
  ingestId?: string;
  ingestRevision?: number;
  defaultRevision?: number;
  receptionRevision?: number;
  bridgeRevision?: number;
  localChannelId?: string;
  receptionPaths?: ReceptionPath[];
  reception?: GrantReception;
  report?: RelatedReport;
  contextReads?: ExternalContextRead[];
  contextMessages?: ExternalContextResult['messages'];
  quote?: QuoteResolution;
}

export interface InboxSourceShare {
  sourceEventId: string;
  channelId: string;
  messageId: string;
  revision: number;
  alreadyShared: boolean;
}

export interface InboundMessaging {
  notifyPairing(request: PairingRequest): Promise<void>;
  pairingRouteAvailable(request: PairingRequest): boolean;
  register(provider: MessagingProvider): () => void;
  setEnabled(botSlug: string, grantId: string, enabled: boolean): Promise<void>;
  channelBridge(channelId: string, input: ChannelBridgeInput): Promise<void>;
  ingests(channelId: string): ConversationIngestSnapshot;
  ingest(channelId: string, input: ConversationIngestInput): Promise<void>;
  setChannelTarget(botSlug: string, grantId: string, channelId: string | null): Promise<void>;
  policy(botSlug: string, grantId: string): GroupReceptionPolicy;
  setPolicy(
    botSlug: string,
    grantId: string,
    input: GroupReceptionInput,
    editor: BotSourcePolicyEditor,
  ): Promise<GroupReceptionPolicy>;
  threads(botSlug: string, grantId: string): ThreadReceptionView[];
  setThread(
    botSlug: string,
    sourceEventId: string,
    input: ThreadReceptionInput,
    editor: BotSourcePolicyEditor,
  ): Promise<ThreadReceptionPolicy>;
  ordinaryDelivery(grantId: string): 'verified' | 'unverified';
  recovery(grantId: string): ReceptionRecovery | undefined;
  pairingRecovery(bindingId: string): ReceptionRecovery | undefined;
  status(grantId: string): 'off' | 'connecting' | 'receiving' | 'unavailable';
  available(botSlug: string, sourceEventId: string, context?: boolean): boolean;
  pendingExternal(
    botSlug: string,
    now: Date,
    context?: boolean,
  ): ReturnType<typeof pendingExternalReception>;
  sourceSignal(botSlug: string, sourceEventId: string): AbortSignal;
  read(botSlug: string, sourceEventId: string): ExternalSource;
  readShared(botSlug: string, sourceEventId: string): ExternalSource;
  share(botSlug: string, sourceEventId: string, channelId: string): InboxSourceShare;
  context(
    botSlug: string,
    sourceEventId: string,
    sessionId: string,
    query: ExternalContextQuery,
    signal?: AbortSignal,
  ): Promise<ExternalContextResult>;
  ensureReplyConsumer(botSlug: string, grantId: string, signal: AbortSignal): Promise<void>;
  pairingReception(bindingId: string): 'off' | 'connecting' | 'receiving' | 'unavailable';
  reconcileBinding(bindingId: string): Promise<void>;
  revoke(grantId: string): void;
  startEntry(grantId: string): void;
  endChannel(channelId: string): void;
  close(): void;
}
