import type { ReceptionRecovery } from './receiver-recovery.js';
import type { ToolApprovalActor } from '../workspaces/tool-approval-actor.js';
import type { FailureAlerts, FailureAlertSnapshot } from './failure-alerts.js';
import type { ApprovalMessaging, ApprovalMessagingSnapshot } from './approval-messaging.js';
import type { ExternalPermissionGroup } from './permission-groups.js';
import type { BehaviorPermission } from './behavior-permissions.js';
import type { QuestionDelivery, QuestionMessaging } from './question-messaging.js';
import type { MessagingDirectoryQuery, MessagingDirectoryPage } from './directory.js';
import type { BotPairing, PairingRequest, PairingReviewInput } from './pairing.js';
import type {
  SenderPermissions,
  SenderAccessInput,
  SenderPolicy,
  ExternalUserRole,
} from './sender-access.js';
import type {
  MessagingIdentity,
  MessagingIdentityView,
  MessagingIdentityInput,
} from './identity.js';
import type { ThreadReceptionView } from './thread-policy.js';
import type { ReceptionInterval } from './reception-history.js';
import type { MessagingDefaults, MessagingDefaultsInput } from './defaults.js';
import type { GroupReceptionPolicy } from './group-policy.js';
import type {
  BlockedConversation,
  HeldConversation,
  MessagingConversationInput,
} from './conversations.js';
import type {
  ChannelBridgeRoute,
  ChannelBridgeSnapshot,
  ChannelBridgeConfiguration,
} from './channel-bridge.js';
import type { ChannelMessageCommit } from '../channels/store.js';
import type { ChannelAttachmentRef } from '../attachments/ref.js';
import type { InboundMessaging } from './inbound.js';
import type { MessagingProcessing } from './typing.js';
import type { SourceFeedback } from './feedback.js';
import type {
  MessagingProvider,
  MessagingAccount,
  MessagingReachablePage,
  MessagingTarget,
  MessagingReceipt,
  MessagingReplyRoute,
} from './provider.js';

export interface MessagingGrant {
  id: string;
  bindingId: string;
  botSlug: string;
  providerId: string;
  accountRef: string;
  accountName: string;
  fingerprint: string;
  platform: string;
  targetRef: string;
  targetName: string;
  targetDigest: string;
  revision: number;
  createdAt: string;
  receiveAfter?: string;
  receiveScope?: { kind: 'group' | 'dm'; conversationId: string };
  receiveTargetChannelId?: string;
  dmMirror?: boolean;
  dmMirrorEpoch?: string;
  dmSyncRevision?: number;
  dmForward?: boolean;
  dmForwardAfter?: string;
  receptionInheritance?: 'inherit' | 'custom';
  channelBridge?: ChannelBridgeConfiguration;
  bridgeRoutes?: ChannelBridgeRoute[];
  origin?: 'explicit' | 'implicit';
  muted?: boolean;
  preferenceRevision?: number;
  openGroup?: boolean;
  openGroupAfter?: string;
  revokedAt?: string;
  suspendedReason?: 'rebind-required';
}

export type OutboxState =
  | 'pending'
  | 'in-flight'
  | 'provider-accepted'
  | 'failed'
  | 'unknown-outcome'
  | 'cancelled'
  | 'grant-revoked';

export interface ReportOrigin {
  providerId: string;
  accountRef: string;
  fingerprint: string;
  platform: string;
  accountName: string;
  targetName: string;
  conversationId: string;
}

export interface ReplyOrigin extends ReportOrigin {
  route: MessagingReplyRoute;
}

export interface OutboxIntent {
  id: string;
  botSlug: string;
  grantId: string;
  grantRevision: number;
  sourceEventId?: string;
  forwardSourceEventId?: string;
  report?: ReportOrigin;
  reply?: ReplyOrigin;
  receipt?: MessagingReceipt;
  echo?: { eventId: string; at: string };
  file?: ChannelAttachmentRef;
  text: string;
  state: OutboxState;
  createdAt: string;
  settledAt?: string;
  dmMirror?: { epoch: string; bindingId: string; conversationId: string } | undefined;
  reason?: string;
}

export type MessagingApp = MessagingAccount & {
  providerId: string;
  boundBotSlug?: string;
  bindingId?: string;
};

export type MessagingReadMode = 'saved' | 'status';

export type ProviderRegistration = { provider: MessagingProvider; token: object };

export type AccountReader = (
  entry: ProviderRegistration,
  ref: string,
) => Promise<MessagingAccount | undefined>;

export interface MessagingSnapshot {
  checks?: 'pending' | 'complete';
  questions?: QuestionDelivery[];
  permissionGroups?: ExternalPermissionGroup[];
  behaviorPermissions?: BehaviorPermission[];
  senderPolicy?: SenderPolicy;
  roles?: ExternalUserRole[];
  receptionHistory?: ReceptionInterval[];
  feedback?: { sourceEventId: string; bindingId: string; attempts: SourceFeedback }[];
  approvals?: ApprovalMessagingSnapshot;
  failureAlerts?: FailureAlertSnapshot;
  setup?: {
    providerReady: boolean;
    receipts: {
      sourceEventId: string;
      grantId: string;
      messageId: string;
      conversationId: string;
      threadId?: string;
      at: string;
      replyState?: OutboxState;
      replyMessageId?: string;
      echoObserved: boolean;
    }[];
  };
  identities?: MessagingIdentityView[];
  pairings?: PairingRequest[];
  pairingReceivers?: { name: string; status: 'off' | 'connecting' | 'receiving' | 'unavailable' }[];
  channelTargets?: { id: string; name: string }[];
  appSetups?: (import('./provider.js').MessagingSetup & { providerId: string })[];
  accounts: MessagingApp[];
  grants: (MessagingGrant & {
    availability: 'available' | 'unavailable' | 'rebind-required';
    reception: ReturnType<InboundMessaging['status']>;
    recovery?: ReceptionRecovery;
    canReceive?: boolean;
    canPost?: boolean;
    postConversationId?: string;
    lastMessageAt?: string;
    groupPolicy?: GroupReceptionPolicy;
    threadPolicies?: ThreadReceptionView[];
    ordinaryDelivery?: 'verified' | 'unverified';
  })[];
  heldConversations?: HeldConversation[];
  blockedConversations?: BlockedConversation[];
  intents: OutboxIntent[];
}

export interface OutboundMessaging {
  questions: QuestionMessaging;
  privateInputReplyAuthority(
    botSlug: string,
    sourceEventId: string,
    authority: import('../credentials/im-origin.js').PrivateReplyAuthority,
  ): () => void;
  approvals: ApprovalMessaging;
  failureAlerts: FailureAlerts;
  beginProcessing(botSlug: string, sourceEventIds: readonly string[]): MessagingProcessing;
  pairing: BotPairing;
  senderAccess(botSlug: string, input: SenderAccessInput): void;
  toolRuleCreatorAuthorized(botSlug: string, creator: ToolApprovalActor): boolean;
  senderPermissions(botSlug: string, sourceEventId: string): SenderPermissions;
  directory(botSlug: string, query: MessagingDirectoryQuery): MessagingDirectoryPage;
  reviewPairing(botSlug: string, input: PairingReviewInput): Promise<PairingRequest>;
  inbound: InboundMessaging;
  defaults<Platform extends string = 'feishu'>(platform?: Platform): MessagingDefaults<Platform>;
  setDefaults(input: MessagingDefaultsInput): Promise<MessagingDefaults>;
  identity(botSlug: string, input: MessagingIdentityInput): Promise<MessagingIdentity>;
  reply(
    botSlug: string,
    sourceEventId: string,
    text: string,
    messageKey?: string,
  ): Promise<OutboxIntent>;
  privateInputNotice(
    botSlug: string,
    sourceEventId: string,
    requestId: string,
    webUrl: string | undefined,
    authority: import('../credentials/im-origin.js').PrivateReplyAuthority,
  ): Promise<OutboxIntent>;
  acquireFile(
    botSlug: string,
    sourceEventId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ): Promise<ChannelAttachmentRef>;
  readChannelMedia(input: {
    channelId: string;
    sourceEventId: string;
    attachmentId: string;
    representation?: 'playback';
    signal: AbortSignal;
  }): Promise<{ ref: ChannelAttachmentRef; body: ReadableStream<Uint8Array>; inline?: boolean }>;
  prepareAudio(
    botSlug: string,
    sourceEventId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ): Promise<ChannelAttachmentRef>;
  replyFile(
    botSlug: string,
    sourceEventId: string,
    file: ChannelAttachmentRef,
    messageKey?: string,
  ): Promise<OutboxIntent>;
  register(provider: MessagingProvider): () => void;
  snapshot(botSlug: string, mode?: MessagingReadMode): Promise<MessagingSnapshot>;
  disableBot(botSlug: string): Promise<void>;
  deletionDependencies(botSlug: string): { identities: string[]; grants: string[] };
  apps(): Promise<MessagingApp[]>;
  setups(): Promise<(import('./provider.js').MessagingSetup & { providerId: string })[]>;
  channelBridges(channelId: string, mode?: MessagingReadMode): Promise<ChannelBridgeSnapshot>;
  targets(providerId: string, accountRef: string): Promise<MessagingTarget[]>;
  reachable(botSlug: string, bindingId: string, cursor?: string): Promise<MessagingReachablePage>;
  setPostLimit(
    botSlug: string,
    bindingId: string,
    expectedRevision: number,
    limit: number | null,
  ): Promise<MessagingIdentity>;
  postConversation(
    botSlug: string,
    bindingId: string,
    conversationId: string,
    requestId: string,
    text: string,
  ): Promise<OutboxIntent>;
  postRequest(
    botSlug: string,
    bindingId: string,
    conversationId: string,
    requestId: string,
    text: string,
  ): OutboxIntent | undefined;
  authorize(input: {
    botSlug: string;
    providerId: string;
    accountRef: string;
    targetRef: string;
    fingerprint: string;
    targetDigest: string;
  }): Promise<MessagingGrant>;
  revoke(botSlug: string, grantId: string): void;
  conversation(botSlug: string, input: MessagingConversationInput): Promise<void>;
  send(
    botSlug: string,
    grantId: string,
    requestId: string,
    text: string,
    sourceEventId?: string,
    file?: ChannelAttachmentRef,
    report?: boolean,
  ): Promise<OutboxIntent>;
  post(botSlug: string, grantId: string, requestId: string, text: string): Promise<OutboxIntent>;
  forwardWebDm(commit: ChannelMessageCommit): Promise<void>;
  inspectIntent(botSlug: string, intentId: string): OutboxIntent;
  history(botSlug: string): OutboxIntent[];
  close(): void;
}
