import {
  createApprovalsBridgeMethods,
  type ApprovalsBridgeMethods,
  type ApprovalsBridgeDeps,
} from '../features/approvals/methods.js';
export type {
  ApprovalTemplateEntry,
  ApprovalReviewerModelView,
} from '../features/approvals/methods.js';
import {
  createWorkspacesBridgeMethods,
  type WorkspacesBridgeMethods,
  type WorkspacesBridgeDeps,
} from '../features/workspaces/methods.js';
import {
  createBrowserBridgeMethods,
  type BrowserBridgeMethods,
  type BrowserBridgeDeps,
} from '../features/browser/methods.js';
import {
  createComputerBridgeMethods,
  type ComputerBridgeMethods,
  type ComputerBridgeDeps,
} from '../features/computer/methods.js';
import {
  createEngineAccountBridge,
  type EngineAccountBridgeMethods,
  createEngineSelectionBridge,
  type EngineSelectionBridgeMethods,
  createModelProviderBridge,
  type ModelProviderBridgeMethods,
  createModelsBridgeMethods,
  type ModelsBridgeMethods,
} from '../features/models/methods.js';
import type { ModelsBridgeDeps } from '../features/models/deps.js';
import { createModelRoutingHelpers, routingGroupFailure } from '../features/models/routing.js';
export type { ModelCatalogGroup } from '../features/models/routing.js';
import {
  createMarketplaceBridgeMethods,
  type MarketplaceBridgeMethods,
  type MarketplaceBridgeDeps,
} from '../features/marketplace/methods.js';
import { createGenuiBridgeMethods, type GenuiBridgeMethods } from '../features/genui/methods.js';
import {
  createAvatarsBridgeMethods,
  type AvatarsBridgeMethods,
  type AvatarsBridgeDeps,
} from '../features/avatars/methods.js';
export type { SkillDetail } from '../features/skills/methods.js';
import {
  createSkillsBridgeMethods,
  type SkillsBridgeMethods,
  type SkillsBridgeDeps,
} from '../features/skills/methods.js';
import {
  createSchedulesBridgeMethods,
  type SchedulesBridgeMethods,
  type SchedulesBridgeDeps,
} from '../features/schedules/methods.js';
import {
  asNonBlank,
  asObject,
  parseOptional,
  parseRoles,
  parseStringArray,
  type ParsedField,
  asSlug,
  invalidInput,
  unavailable,
  unknownBot,
  unknownChannel,
  type BridgeResult,
} from './method-utils.js';
export type { BridgeError, BridgeResult } from './method-utils.js';
import {
  createPromptBridgeMethods,
  type PromptBridgeMethods,
  type PromptBridgeDeps,
} from '../features/prompts/methods.js';
export type {
  BotPromptView,
  PromptLimitView,
  PromptPartView,
} from '../features/prompts/methods.js';
import { modelFailure } from '../models/provider-bridge.js';
import type { OrchestratorRunner } from '@botharness/host-protocol/wire';
import {
  assertQuoteTargets,
  ChannelQuoteError,
  MAX_CHANNEL_QUOTES,
  parseQuotesInput,
  quoteTextMatches,
  sameQuoteIntent,
} from '../channels/quotes.js';
import { botModelAllowed } from '../team/models.js';
import { TeamError } from '../team/error.js';
import type { UsageByMemberResult } from '../usage/overview.js';
import { MEMBER_CHANNEL_METHODS } from '../team/member-methods.js';
import type { TeamChannels } from '../team/channels.js';
import { guardHumanBridge } from '../team/bridge-access.js';
import { botOwner, privateBotRegistry } from '../team/bot-access.js';
import { privateBotCreations } from '../bots/creation.js';
import { createHash } from 'node:crypto';
import { createTeamBridge, type TeamBridgeMethods } from '../team/bridge.js';
import type { TeamService } from '../team/service.js';
import { OWNER_HUMAN_CONTEXT } from '../humans/context.js';
import { type HumanContext, type HumanId } from '../humans/context.js';
import {
  createVoiceBridgeMethods,
  type VoiceBridgeMethods,
  type VoiceBridgeDeps,
} from '../features/voice/methods.js';
import {
  createBotModeBridgeMethods,
  type BotModeBridgeMethods,
  type BotModesDeps,
} from './bot-modes.js';
import { networkBotId, type BotContact } from '../runtime/bot-contact-discovery.js';
import { BotNetworkDeliveryError } from '../runtime/bot-network.js';
import { join } from 'node:path';
import { GenuiError, parseGenuiContent, validateGenuiMessageReply } from '../channels/genui.js';
import { buildGenuiReplyContext } from '../channels/genui-message.js';
import { createBotImports, type BotImportsService } from '../bots/imports.js';
import { SessionRecoveryError } from '../runtime/session-recovery.js';
import type { BotContextWindow } from '../runtime/context-window.js';
import { summarizeTurnInput, type TurnInputView } from '../runtime/prompt-inspection.js';
import { notificationAttentionPage } from '../runtime/notification-attention.js';
import { MemoryImageError } from '../memory/image.js';
import { inspectImage } from '../media/image-format.js';
import {
  MIN_IDLE_MS,
  type IdleCompaction,
  type IdleCompactionRecord,
  type IdleCompactionRouteView,
  type ManualCompactionResult,
} from '../runtime/idle-compaction.js';
import {
  COMPACTION_HEADROOM_TOKENS,
  COMPACTION_THRESHOLD_RATIO,
  isCacheLifetimeSeconds,
  isCompactionHeadroomTokens,
  isCompactionThresholdRatio,
  MAX_CACHE_LIFETIME_SECONDS,
  type IdleCompactionRoute,
  type IdleCompactionSettings,
} from '../runtime/idle-compaction-settings.js';
import { isDeepStrictEqual } from 'node:util';
import { DEEPSEEKBOT_RECIPE } from '../onboarding/service.js';
import { type CloudWork } from '../cloud/work.js';
import { runCloudWorkDirect } from '../cloud/work-tool.js';
import {
  manageCloud,
  parseCloudManagement,
  type CloudManagementResult,
} from '../cloud/management.js';
import type { CloudConnections } from '../cloud/connections.js';
import { ClientError as CloudError } from '../cloud/instance-contract.js';
import {
  ChannelManagementError,
  type ChannelManagementService,
  type ChannelManagementResult,
} from '../channels/management.js';
import { botProfileFingerprint } from '../bots/profile-snapshot.js';
import { BotZipUploadError } from '../bots/zip-upload.js';
import {
  BotCreationError,
  validBotCreationKey,
  type BotCreationService,
  type BotCreationInput,
  type BotCreationReceipt,
} from '../bots/creation.js';
import { TobError, type TobService, type TobHome } from '../tob/service.js';
import { directToolTrace, summarizeToolTrace, type TurnTrace } from '../bots/tool-trace.js';
import type { BotOnboarding, OnboardingSnapshot, TutorialAction } from '../onboarding/service.js';
import type { ClientAcknowledgements } from '../onboarding/acknowledgements.js';
import type { HttpsFallback } from '../memory/clone.js';
import {
  ContentPurgeError,
  type ContentPurge,
  type GroupDisbandResult,
  type ChannelHistoryItem,
  type PurgeSource,
  type PurgePreview,
  type TextCleanupPreview,
  type TextCleanupResult,
} from '../purge/contracts.js';
import {
  STORAGE_MEDIA_KINDS,
  StorageCleanupError,
  type MediaCleanupPreview,
  type MediaCleanupResult,
  type StorageCleanup,
  type StorageUsage,
} from '../storage/media-cleanup.js';
import { pairingReviewInput, type PairingRequest } from '../messaging/pairing.js';
import { senderAccessInput } from '../messaging/sender-access.js';
import type { ChannelTurnStopTarget, GroupMemberWakePolicy } from '../channels/channel.js';
import {
  parseAllBotMention,
  expandAllBotMention,
  assertAllBotPreview,
  AllBotPreviewChangedError,
  type AllBotPreview,
  type AllBotMention,
} from '../channels/all-bot-mention.js';
import type { OverviewMemory } from '../memory/overview.js';
import {
  isUsageOverviewPeriod,
  usageOverviewPeriods,
  type UsageOverviewBuckets,
  type UsageOverviewResult,
} from '../usage/overview.js';
import { markAllHumanMessagesRead } from '../channels/mark-all-read.js';
import { channelPreviewMessage } from '../channels/channel-notice.js';
import { channelBridgeInput, type ChannelBridgeSnapshot } from '../messaging/channel-bridge.js';
import {
  conversationIngestInput,
  type ConversationIngestSnapshot,
} from '../messaging/conversation-ingest.js';
import {
  externalMemberWake,
  messagingDefaultsInput,
  messagingDefaultsPlatform,
  type MessagingDefaults,
} from '../messaging/defaults.js';
import type { MessagingIdentity } from '../messaging/identity.js';
import { personaBotActivitySnapshot, type PersonaBotActivitySnapshot } from '../state/bot-state.js';
import { threadReceptionInput } from '../messaging/thread-policy.js';
import { groupReceptionInput } from '../messaging/group-policy.js';
import type { ExternalSource } from '../messaging/inbound.js';
import type {
  OutboundMessaging,
  MessagingApp,
  MessagingSnapshot,
  MessagingGrant,
  OutboxIntent,
} from '../messaging/outbound.js';
import { MessagingError, type MessagingTarget } from '../messaging/provider.js';
import { OperationalDatabaseError } from '../database/owner.js';
import type { InstallReceipts } from '../marketplace/install-receipts.js';
import {
  MAX_DESCRIPTOR_BIO_LENGTH,
  MAX_DESCRIPTOR_TAG_LENGTH,
  MAX_DESCRIPTOR_TAGS,
} from '../marketplace/descriptor.js';
import type {
  ReleaseInfo,
  ReleaseInstall,
  ReleaseRestart,
  ReleaseService,
  ReleaseUpdate,
} from '../release/service.js';
import type {
  PluginInstall,
  PluginRestart,
  PluginUpdateService,
  PluginUpdates,
} from '../release/plugins.js';
import {
  isUpdateRequestId,
  type UpdateCancel,
  type UpdateRun,
  type UpdateRuns,
} from '../release/update-runs.js';
import type { ActiveDay } from '../telemetry/active-day.js';
import {
  isClientTelemetryEventName,
  telemetryEventProperties,
  type TelemetryEventName,
  type TelemetrySurface,
} from '../telemetry/events.js';
import type { TelemetryCapture, TelemetryStatus } from '../telemetry/service.js';
import {
  AssignmentReplyTargetError,
  type HumanAssignmentContext,
} from '../runtime/assignment-human-context.js';
import { summarizeSessionProgress, type SessionProgress } from '../runtime/session-progress.js';
import {
  summarizeSessionTranscript,
  type SessionTranscript,
} from '../runtime/session-transcript.js';
import type { SessionLiveSnapshot, SessionLiveStreams } from '../runtime/session-live.js';
import {
  summarizeSessionToolDetail,
  type PresentToolResult,
  type SessionToolDetail,
} from '../runtime/session-tool-detail.js';
import {
  summarizeAssignmentTimeline,
  summarizeSubagentLanes,
  TIMELINE_SUBAGENTS,
  type AssignmentTimelineLane,
  type AssignmentTimelineSession,
  type PublicToolCall,
} from '../runtime/assignment-timeline.js';
import { createMessageAttachmentFiles } from '../attachments/message-files.js';
import { attachmentIntent } from '../attachments/ref.js';
import type { AttachmentStore } from '../attachments/store.js';
import { randomUUID } from 'node:crypto';

import { z } from 'zod';
import { tobCliRequestSchema, type TobCliStatus } from '../tob/cli-request.js';

import { TakeoverError, type TakeoverHandoff } from '../takeover/contracts.js';
import type { TakeoverHandoffs } from '../takeover/handoffs.js';
import {
  dmChannelId,
  isChannelCallVisual,
  isChannelVoiceCallMessage,
  isValidChannelId,
  isSkillInvocationToken,
  isGroupAvatar,
  isReactionEmoji,
  type LocalHumanIdentity,
  type HumanAvatar,
  HUMAN_AVATAR_BATCH,
  isHumanAvatar,
  type ChannelMention,
  type ChannelMessage,
  type ChannelReaction,
  type ChannelRecord,
  type ChannelReference,
  type ChannelSkillInvocation,
  type ChannelSkillInvocationToken,
} from '../channels/channel.js';
import { botAvatarUrl } from '../bots/avatar-http.js';
import { botBannerSummary, type BotBannerSummary } from '../bots/banner-http.js';
import type { AvatarAppearance, RetainedAvatarAppearance } from '../bots/avatar-appearance.js';
import {
  currentBotPrimaryColor,
  historicalBotPrimaryColor,
  resolveBotPrimaryColor,
  type BotPrimaryColor,
} from '../bots/primary-color.js';
import {
  ChannelMentionTargetError,
  ChannelReactionLimitError,
  ChannelReplyTargetError,
} from '../channels/store.js';
import { ChannelAttachmentError } from '../attachments/store.js';
import { isChannelAttachmentRef } from '../attachments/ref.js';
import type { CallTextHarvest, CallTextInput } from '../voice/call-text.js';
import type { ChannelAttachmentRef } from '../attachments/ref.js';
import type { ComposerRecoveryIdentity } from './composer-recovery.js';
import type {
  ChannelReadPosition,
  ChannelStore,
  ChannelSendStatus,
  HumanMessageSearchPage,
} from '../channels/store.js';
import { groupProfileActivity, type GroupProfileActivity } from '../channels/profile-activity.js';
import { channelActivityToday, type ChannelActivityToday } from '../channels/activity-today.js';
import type { ChannelChangeCursor, ChannelTimelinePage } from '../channels/timeline.js';
import type {
  CreatePersonaBotResult,
  PersonaBotPatch,
  PersonaBotRecord,
} from '../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type {
  PersonaBotDeletions,
  PersonaBotDeletionPreview,
  PersonaBotDeletion,
} from '../bots/deletion.js';
import {
  DataResetError,
  type DataReset,
  type DataResetPreview,
  type DataResetResult,
} from '../data-reset/reset.js';
import { SkillContentTooLargeError, skillOwnerKey, type ResolvedSkill } from '../skills/catalog.js';

import { isValidSlug } from '../bots/slug.js';
import {
  memoryMoveTarget,
  moveMemoryDirectory,
  type MemoryMoveResult,
} from '../bots/memory-move.js';
import {
  MAX_ROSTER_BATCH_SIZE,
  RosterStore,
  RosterUnavailableError,
  RosterUnknownSectionError,
  type RosterSection,
  type RosterSnapshot,
} from '../roster/store.js';
import type { TopOrderEntry } from '../roster/spec.js';
import type { SessionOwnership, SessionRootRole } from '../sessions/ownership.js';
import {
  MemoryAcceptError,
  type MemoryAcceptedCommit,
  type MemoryAcceptedSnapshot,
  type MemoryGitGraph,
  type MemoryVersion,
  type MemoryVersionName,
  type MemoryGitCommitDiff,
  type MemoryWorkingChange,
  type MemoryWorkingDiff,
  type MemoryWorkingKind,
  type MemoryRepairEvent,
} from '../memory/accepted.js';
import type { MemoryRecoveryCheckpoint } from '../memory/recovery.js';
import type { MemoryService } from '../memory/service.js';
import type {
  UsageProjection,
  DshUsageSessionLogReader,
  SessionUsageSummary,
} from '../usage/usage.js';
import { usageFilterSchema, type UsageQueryResult } from '../usage/query.js';
import { isModelRoute, type ModelRoute, type PersonaBotModelPlan } from '../models/presets.js';
import { RoutingGroupError } from '../models/routing-groups.js';
import { groupMemberRoute } from '../models/catalog.js';
import { MemoryFileError, type MemoryFileTarget } from '../memory/file-actions.js';
import { MemoryPathError } from '../memory/jail.js';
import {
  DEFAULT_STANDING_LIMITS,
  isStandingLimits,
  MAX_STANDING_LIMIT,
  MIN_STANDING_LIMIT,
  type StandingLimits,
} from '../memory/soul.js';
import { WorkspaceGrantError } from '../workspaces/grants.js';
import {
  FolderBrowseError,
  type FolderBrowser,
  type FolderListing,
} from '../workspaces/folder-browse.js';
import type { ChannelToolApproval } from '../workspaces/tool-approval.js';
import type {
  AssignmentAccessMode,
  AssignmentAccessStore,
  AssignmentAccessPreset,
} from '../workspaces/assignment-access.js';
import type {
  BotAttentionQuery,
  BotAttentionPage,
  BotAttentionState,
} from '../runtime/attention.js';
import type { BotSourcePolicy, BotSourcePolicyStore } from '../runtime/source-policy.js';
import { probeGit } from '../memory/git-probe.js';
import type { GitService, GitStatus } from '../memory/managed-git.js';
import {
  HUMAN_INBOX_SNOOZE_MAX_MS,
  type HumanAttentionQuery,
  type HumanAttentionStatus,
  type HumanAttentionDecisions,
  type HumanAttentionPage,
  type HumanAttentionCategory,
  type HumanAttentionItem,
} from '../runtime/human-attention.js';
import { DirectBotToolError, queryAssignmentDirectory } from '../runtime/bot-runtime.js';
import { GenuiDiagramError } from '../runtime/genui-diagram.js';
import { GenuiPreviewError } from '../runtime/genui-preview.js';
import { ChannelCallReadError } from '../channels/call-window.js';
import type {
  AssignmentActivity,
  AssignmentDetail,
  AssignmentReportState,
  AssignmentSummary,
  BotRuntime,
  ChannelAssignmentSummary,
  DirectBotToolSpec,
  DmAdmissionFailure,
} from '../runtime/bot-runtime.js';
import type { AssignmentExecutionWait } from '../runtime/assignment-approval-capacity.js';
import type {
  AggregatedState,
  BotStateSnapshot,
  BotStateTracker,
  SessionState,
} from '../state/bot-state.js';
import { MIN_PHONE_APP_VERSION } from '../devices/client-compat.js';

export interface ActivityOverview {
  actionCount: number;
  bots: Array<{
    slug: string;
    displayName: string;
    avatar?: string;
    appearance?: AvatarAppearance | RetainedAvatarAppearance;
    avatarSeed?: 2;
    paused: boolean;
    hasAction: boolean;
    state: AggregatedState;
    activity?: PersonaBotActivitySnapshot['bots'][number]['activity'];
    attention?: PersonaBotActivitySnapshot['bots'][number]['attention'];
    sessions: Array<{
      sessionId: string;
      role: SessionRootRole;
      state: 'thinking' | 'working';
      title?: string;
      description?: string;
    }>;
  }>;
}

export type SharedBotSummary = ReturnType<
  import('../team/bots.js').TeamBots['sharedRoster']
>[number] & { orchestratorRunner?: OrchestratorRunner };

export interface PersonaBotSummary {
  orchestratorRunner?: OrchestratorRunner;
  modelAllowed?: boolean;
  ownerHumanId?: string;
  owner?: boolean;
  lastActivityAt?: number;
  tob?: { defaultName: boolean; defaultAvatar: boolean };
  slug: string;
  displayName: string;
  roles: string[];
  description?: string;
  avatar?: string;
  appearance?: AvatarAppearance | RetainedAvatarAppearance;
  banner?: BotBannerSummary;
  primaryColor?: BotPrimaryColor;
  avatarSeed?: 2;
  paused?: boolean;
  deleted?: boolean;
  approvalTemplate?: string;
  uploadedListing?: string;
  installedListing?: string;
  standingLimits: StandingLimits;
  aggregateState: AggregatedState;
  workspaces: string[];
  createdAt: string;
}

export interface PersonaBotDetail extends PersonaBotSummary {
  model?: string;
  modelPlan?: PersonaBotModelPlan;
  preset?: string;
  memoryDir?: string;
  sessions: Record<string, SessionState>;
}

export interface ProfileActivityDay {
  day: string;
  count: number;
}

export interface ProfileActivityReasonDay extends ProfileActivityDay {
  reason: string;
}

export interface OverviewUsage extends Omit<UsageOverviewResult, 'bots'> {
  bots: Array<
    UsageOverviewBuckets & {
      slug: string;
      displayName: string;
      current: boolean;
      primaryColor: string;
    }
  >;
}

export interface ProfileTokenBuckets {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ProfileActivityTokensDay extends ProfileTokenBuckets {
  day: string;
}

export interface ProfileModelUsageRow {
  partial?: boolean;
  day: string;
  purpose: string;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  totalTokens: number | null;
}

export interface ProfileActivity {
  slug: string;
  weeks: number;
  since: string;
  before?: string;
  createdDay?: string;

  today: string;
  events: ProfileActivityReasonDay[];
  memoryCommits: ProfileActivityDay[];
  tokens: ProfileActivityTokensDay[];
  tokenTotals: ProfileTokenBuckets;
  modelUsageRows: ProfileModelUsageRow[];
  modelUsageStatus: 'ready' | 'unavailable';
}

export interface ProfileSessionUsage {
  slug: string;
  weeks: number;
  since: string;
  rows: Array<
    SessionUsageSummary & {
      sessionId: string;
      role: SessionRootRole;
      label: string;
      updatedAt: string;
    }
  >;
}

export interface ChannelListItem extends ChannelRecord {
  readOnly?: boolean;
  proactiveOptOut?: boolean;
  memberBots?: Array<{ slug: string; displayName: string; avatar?: string }>;
  remoteAvailability?: import('../runtime/bot-network.js').NetworkBotAvailability;
  remoteContact?: BotContact;
  humanMembers?: Array<{ humanId: string; displayName: string; avatarVersion?: string }>;
  humanNickname?: string | null;
  latestMessage?: ChannelMessage;
}

export type ChannelListChanges =
  | { reset: true; cursor: ChannelChangeCursor }
  | {
      reset?: never;
      channels: ChannelListItem[];
      removed: string[];
      cursor: ChannelChangeCursor;
    };

export interface SessionEngineQuota {
  usedPercent?: number;
  resetsAt?: string;
  limitedUntil?: string;
  observedAt: string;
}

export interface OwnedSessionSummary {
  sessionId: string;
  role: SessionRootRole;
  createdAt: string;
  cwdReference?: string;
  assignmentActivity?: AssignmentActivity;
  assignmentAccessMode?: AssignmentAccessMode;
  assignmentReportState?: AssignmentReportState;
  assignmentExecutionWait?: AssignmentExecutionWait;
  assignmentArchived?: true;
  assignmentTitle?: string;
  assignmentDescription?: string;
  assignmentModelRoute?: ModelRoute;
  modelRoute?: ModelRoute;
  engine?: { engine: string; account?: string; quota?: SessionEngineQuota };
  agentPreset?: string;
  currentOrchestrator?: boolean;
  triageOpenCount?: number;
  subagentCount?: number;
}

export interface OwnedSessionBot {
  botSlug: string;
  displayName: string;
  avatar?: string;
  appearance?: AvatarAppearance | RetainedAvatarAppearance;
  avatarSeed?: 2;
  role: SessionRootRole;
}

export interface MessagingAppsView {
  apps: MessagingApp[];
  setups: NonNullable<MessagingSnapshot['appSetups']>;
}

export interface BridgeMethods
  extends
    TeamBridgeMethods,
    ModelProviderBridgeMethods,
    EngineAccountBridgeMethods,
    EngineSelectionBridgeMethods,
    PromptBridgeMethods,
    SchedulesBridgeMethods,
    SkillsBridgeMethods,
    AvatarsBridgeMethods,
    GenuiBridgeMethods,
    MarketplaceBridgeMethods,
    ModelsBridgeMethods,
    ComputerBridgeMethods,
    BrowserBridgeMethods,
    VoiceBridgeMethods,
    ApprovalsBridgeMethods,
    WorkspacesBridgeMethods {
  tobHome(
    payload: unknown,
  ): Promise<
    BridgeResult<
      (TobHome & { attention?: { unreadCount: number; hasAction: boolean } }) | { available: false }
    >
  >;
  onboarding(payload: unknown): Promise<BridgeResult<OnboardingSnapshot>>;
  acknowledgements(payload: unknown): BridgeResult<{ items: Record<string, string> }>;
  acknowledge(payload: unknown): BridgeResult<{ key: string; value: string }>;
  onboardingModel(
    payload: unknown,
  ): Promise<BridgeResult<{ revision: number; groupRevision?: number }>>;
  telemetryEvent(payload: unknown): BridgeResult<null>;
  channelRetry(payload: unknown): Promise<BridgeResult<{ accepted: true }>>;
  botNewSession(payload: unknown): Promise<BridgeResult<{ started: true }>>;
  botCompact(payload: unknown): Promise<BridgeResult<ManualCompactionResult>>;
  botContext(payload: unknown): Promise<BridgeResult<BotContextWindow>>;
  channelBotStop(payload: unknown): Promise<
    BridgeResult<{
      stopped: { botSlug: string; sessionId: string; messageId: string };
    }>
  >;
  sessionMessageSend(payload: unknown): Promise<BridgeResult<{ sourceEventId: string }>>;
  sessionStop(payload: unknown): Promise<
    BridgeResult<{
      stopped: import('../runtime/bot-runtime.js').StoppedSessionRef[];
      alreadyIdle: import('../runtime/bot-runtime.js').StoppedSessionRef[];
      messageId?: string;
    }>
  >;
  botStop(payload: unknown): Promise<
    BridgeResult<{
      stopped: import('../runtime/bot-runtime.js').StoppedSessionRef[];
      alreadyIdle: import('../runtime/bot-runtime.js').StoppedSessionRef[];
      messageId?: string;
    }>
  >;
  failureAlertsSet(payload: unknown): Promise<BridgeResult<{ updated: true }>>;
  failureAlertsTest(payload: unknown): Promise<
    BridgeResult<{
      delivery: import('../messaging/failure-alerts.js').FailureAlertDelivery;
    }>
  >;
  failureAlertsRetry(payload: unknown): Promise<
    BridgeResult<{
      delivery: import('../messaging/failure-alerts.js').FailureAlertDelivery;
    }>
  >;
  pairingReview(payload: unknown): Promise<BridgeResult<{ pairing: PairingRequest }>>;
  senderAccess(payload: unknown): Promise<BridgeResult<void>>;
  channelBridges(payload: unknown): Promise<BridgeResult<ChannelBridgeSnapshot>>;
  channelIngests(payload: unknown): Promise<BridgeResult<ConversationIngestSnapshot>>;
  channelIngest(payload: unknown): Promise<BridgeResult<{ updated: true }>>;
  channelBridge(payload: unknown): Promise<BridgeResult<{ updated: true }>>;
  messagingIdentity(payload: unknown): Promise<BridgeResult<{ identity: MessagingIdentity }>>;
  messagingChannelTarget(payload: unknown): Promise<BridgeResult<{ updated: true }>>;
  messagingThreadPolicy(payload: unknown): Promise<BridgeResult<{ updated: true }>>;
  messagingGroupPolicy(payload: unknown): Promise<BridgeResult<{ updated: true }>>;
  messagingReceive(payload: unknown): Promise<BridgeResult<{ updated: true }>>;
  messagingSource(payload: unknown): Promise<BridgeResult<{ source: ExternalSource }>>;
  messagingDefaults(payload: unknown): Promise<BridgeResult<MessagingDefaults>>;
  messagingDefaultsSet(payload: unknown): Promise<BridgeResult<MessagingDefaults>>;
  cloudConnections(payload: unknown): Promise<BridgeResult<CloudManagementResult>>;
  cloudWork(payload: unknown): Promise<BridgeResult<Awaited<ReturnType<CloudWork['run']>>>>;
  messagingApps(): Promise<BridgeResult<MessagingAppsView>>;
  messagingSnapshot(payload: unknown): Promise<BridgeResult<MessagingSnapshot>>;
  messagingReachable(
    payload: unknown,
  ): Promise<BridgeResult<import('../messaging/provider.js').MessagingReachablePage>>;
  messagingPostConversation(payload: unknown): Promise<BridgeResult<{ intent: OutboxIntent }>>;
  messagingPostRequest(payload: unknown): Promise<BridgeResult<{ intent: OutboxIntent | null }>>;
  messagingPostLimit(payload: unknown): Promise<BridgeResult<{ identity: MessagingIdentity }>>;
  messagingTargets(payload: unknown): Promise<BridgeResult<{ targets: MessagingTarget[] }>>;
  messagingAuthorize(payload: unknown): Promise<BridgeResult<{ grant: MessagingGrant }>>;
  messagingRevoke(payload: unknown): Promise<BridgeResult<{ revoked: true }>>;
  messagingConversation(payload: unknown): Promise<BridgeResult<{ updated: true }>>;
  messagingSend(payload: unknown): Promise<BridgeResult<{ intent: OutboxIntent }>>;
  list(payload: unknown): BridgeResult<{ bots: Array<PersonaBotSummary | SharedBotSummary> }>;
  activitySnapshot(payload: unknown): BridgeResult<PersonaBotActivitySnapshot>;
  get(payload: unknown): BridgeResult<{ bot: PersonaBotDetail; profileFingerprint: string }>;
  create(payload: unknown): BridgeResult<{
    bot: PersonaBotDetail;
    channelId?: string;
    receipt?: BotCreationReceipt;
  }>;
  botImportPreview(
    payload: unknown,
  ): Promise<BridgeResult<Awaited<ReturnType<BotImportsService['previewGit']>>>>;
  botImportLookup(payload: unknown): BridgeResult<{ receipt: BotCreationReceipt | null }>;
  createLookup(payload: unknown): BridgeResult<{ receipt: BotCreationReceipt | null }>;
  createFromGit(payload: unknown): Promise<
    BridgeResult<{
      bot: PersonaBotDetail;
      httpsFallback?: HttpsFallback;
      receipt?: BotCreationReceipt;
      channelId?: string;
    }>
  >;
  update(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  dataResetPreview(): BridgeResult<{ preview: DataResetPreview }>;
  dataResetConfirm(payload: unknown): BridgeResult<{ reset: DataResetResult }>;
  deletionPreview(payload: unknown): BridgeResult<{ preview: PersonaBotDeletionPreview }>;
  deletionConfirm(payload: unknown): Promise<BridgeResult<{ deletion: PersonaBotDeletion }>>;
  deletionRetry(payload: unknown): Promise<BridgeResult<{ deletion: PersonaBotDeletion }>>;
  deletionMemoryFolder(payload: unknown): BridgeResult<{
    target: { path: string; relativePath: string; kind: 'directory' };
  }>;
  pause(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  resume(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  ping(payload: unknown): BridgeResult<{ ok: true; version?: string; minAppVersion: string }>;
  humanIdentity(payload: unknown): BridgeResult<LocalHumanIdentity>;
  composerIdentity(payload: unknown): BridgeResult<ComposerRecoveryIdentity>;
  composerValidate(payload: unknown): BridgeResult<{
    reply?: ChannelMessage;
    attachments: Array<ChannelAttachmentRef | null>;
    quotes?: Array<ChannelMessage | null>;
  }>;
  humanNameSet(payload: unknown): BridgeResult<LocalHumanIdentity>;
  humanAvatarSet(payload: unknown): BridgeResult<LocalHumanIdentity>;
  humanProfileSetupFinish(payload: unknown): BridgeResult<LocalHumanIdentity>;
  humanAvatars(payload: unknown): BridgeResult<{ avatars: HumanAvatar[] }>;
  channelHumanNameSet(payload: unknown): BridgeResult<{ channel: ChannelListItem }>;
  channels(payload: unknown): Promise<BridgeResult<{ channels: ChannelListItem[] }>>;
  channelListChanges(payload: unknown): Promise<BridgeResult<ChannelListChanges>>;
  channelDm(payload: unknown): BridgeResult<{ channel: ChannelRecord & { readOnly?: boolean } }>;
  channelGet(
    payload: unknown,
  ): BridgeResult<
    | ChannelManagementResult
    | { channel: ChannelRecord; channelFingerprint?: never }
    | ({ channel: ChannelRecord; channelFingerprint?: never } & ReturnType<TeamChannels['view']>)
  >;
  channelCreate(
    payload: unknown,
  ): BridgeResult<{ channel: ChannelRecord } | ChannelManagementResult>;
  channelRename(payload: unknown): BridgeResult<{ channel: ChannelRecord; bot?: PersonaBotDetail }>;
  channelGroupAvatarSet(payload: unknown): BridgeResult<{ channel: ChannelRecord }>;
  channelGroupInvite(
    payload: unknown,
  ): BridgeResult<{ channel: ChannelRecord } | ChannelManagementResult>;
  channelGroupInviteCancel(payload: unknown): BridgeResult<{ channel: ChannelRecord }>;
  channelGroupJoinDecide(payload: unknown): BridgeResult<{ channel: ChannelRecord }>;
  channelGroupMemberRemove(payload: unknown): BridgeResult<{ channel: ChannelRecord }>;
  channelGroupSendReview(payload: unknown): BridgeResult<{ enabled: boolean }>;
  channelGroupWakePolicies(payload: unknown): BridgeResult<{ members: GroupMemberWakePolicy[] }>;
  channelGroupWakeSet(payload: unknown): BridgeResult<{ channel: ChannelRecord }>;
  channelGroupDelete(payload: unknown): BridgeResult<{ deleted: boolean } & GroupDisbandResult>;
  channelHistory(payload: unknown): BridgeResult<{ channels: ChannelHistoryItem[] }>;
  channelHistorySources(
    payload: unknown,
  ): BridgeResult<{ sources: PurgeSource[]; before?: string }>;
  channelPurgePreview(payload: unknown): BridgeResult<PurgePreview>;
  storageUsage(payload?: unknown): BridgeResult<StorageUsage>;
  storageCleanupPreview(payload: unknown): BridgeResult<MediaCleanupPreview>;
  storageCleanupConfirm(payload: unknown): BridgeResult<MediaCleanupResult>;
  storageMessagesCleanupPreview(payload: unknown): BridgeResult<TextCleanupPreview>;
  storageMessagesCleanupConfirm(payload: unknown): BridgeResult<TextCleanupResult>;
  channelPurgeConfirm(
    payload: unknown,
  ): BridgeResult<{ accepted: number; cleanupPending?: number }>;
  channelTimeline(payload: unknown): BridgeResult<{ page: ChannelTimelinePage; revision: number }>;
  channelReadPosition(payload: unknown): BridgeResult<{ position?: ChannelReadPosition }>;
  channelMarkAllRead(payload: unknown): Promise<BridgeResult<{ channels: number }>>;
  channelMarkRead(payload: unknown): Promise<BridgeResult<{ position: ChannelReadPosition }>>;
  channelReact(payload: unknown): BridgeResult<{ reactions: ChannelReaction[] }>;
  channelSearch(
    payload: unknown,
  ): BridgeResult<{ messages: ChannelMessage[]; nextCursor?: string }>;
  messageSearch(payload: unknown): BridgeResult<HumanMessageSearchPage>;
  channelMessages(payload: unknown): BridgeResult<{ messages: ChannelMessage[]; revision: number }>;
  channelAllBotPreview(payload: unknown): BridgeResult<AllBotPreview>;
  tobCli(payload: unknown): Promise<BridgeResult<TobCliStatus>>;
  channelSend(payload: unknown): Promise<BridgeResult<{ message: ChannelMessage }>>;
  channelSendStatus(payload: unknown): BridgeResult<ChannelSendStatus>;
  botAttention(payload: unknown): BridgeResult<BotAttentionPage>;
  botSourcePolicies(payload: unknown): BridgeResult<{ policies: BotSourcePolicy[] }>;
  botSourcePolicySet(payload: unknown): BridgeResult<{ policy: BotSourcePolicy }>;
  botSourcePolicyReset(payload: unknown): BridgeResult<{ policy: BotSourcePolicy }>;
  channelActivityToday(payload: unknown): BridgeResult<ChannelActivityToday>;
  activityOverview(payload: unknown): BridgeResult<ActivityOverview>;
  humanAttention(payload: unknown): BridgeResult<HumanAttentionPage>;
  humanAssignmentContext(payload: unknown): BridgeResult<{ context: HumanAssignmentContext }>;
  humanAttentionStatus(payload: unknown): BridgeResult<HumanAttentionStatus>;
  channelUnreadCounts(payload: unknown): BridgeResult<{
    channels: Array<{ channelId: string; unreadCount: number }>;
  }>;
  humanAttentionDismiss(payload: unknown): BridgeResult<{ accepted: boolean }>;
  humanAttentionRestore(payload: unknown): BridgeResult<{ accepted: boolean }>;
  humanAttentionDismissAll(payload: unknown): Promise<
    BridgeResult<{
      accepted: boolean;
      dismissed: number;
      read: number;
      more: boolean;
    }>
  >;
  humanAttentionIgnore(payload: unknown): BridgeResult<{ accepted: boolean }>;
  humanAttentionSnooze(payload: unknown): BridgeResult<{ accepted: boolean }>;
  assignments(payload: unknown): BridgeResult<{ assignments: AssignmentSummary[] }>;
  channelAssignments(payload: unknown): BridgeResult<{ assignments: ChannelAssignmentSummary[] }>;
  assignment(payload: unknown): BridgeResult<{ assignment: AssignmentDetail }>;
  assignmentTimeline(payload: unknown): Promise<
    BridgeResult<{
      assignment: AssignmentDetail;
      lanes: AssignmentTimelineLane[];
      omittedSubagents: number;
    }>
  >;
  sessionSubagents(payload: unknown): Promise<
    BridgeResult<{
      sessionId: string;
      role: SessionRootRole;
      lanes: AssignmentTimelineLane[];
      omittedSubagents: number;
    }>
  >;
  sessionProgress(payload: unknown): Promise<BridgeResult<{ sessions: SessionProgressEntry[] }>>;
  sessionTranscript(
    payload: unknown,
  ): Promise<BridgeResult<{ sessionId: string; role: SessionRootRole } & SessionTranscript>>;
  sessionLive(payload: unknown): Promise<BridgeResult<{ sessionId: string } & SessionLiveSnapshot>>;
  sessionToolDetail(
    payload: unknown,
  ): Promise<BridgeResult<{ sessionId: string; callId: string; detail: SessionToolDetail }>>;
  workspaceOptions(payload: unknown): BridgeResult<{
    workspaces: { id: string; path: string; title: string }[];
  }>;
  workspaceFileTarget(payload: unknown): BridgeResult<{
    target: { path: string; relativePath: ''; kind: 'directory' };
  }>;
  folderBrowse(payload: unknown): Promise<BridgeResult<FolderListing>>;
  assignmentAccessGet(payload: unknown): BridgeResult<{ preset: AssignmentAccessPreset }>;
  assignmentAccessSet(payload: unknown): BridgeResult<{ preset: AssignmentAccessPreset }>;
  sessions(payload: unknown): BridgeResult<{ sessions: OwnedSessionSummary[] }>;
  botToolTrace(
    payload: unknown,
  ): Promise<BridgeResult<{ slug: string; sessionId: string; turns: TurnTrace[] }>>;
  botTurnInput(
    payload: unknown,
  ): Promise<BridgeResult<{ slug: string; sessionId: string; turns: TurnInputView[] }>>;
  botTools(payload: unknown): BridgeResult<{ sessionId: 'direct'; tools: DirectBotToolSpec[] }>;
  botToolRun(payload: unknown): Promise<
    BridgeResult<{
      slug: string;
      tool: string;
      sessionId: 'direct';
      result: unknown;
    }>
  >;
  sessionArchiveSet(payload: unknown): Promise<BridgeResult<{ archived: boolean }>>;
  memoryMove(
    payload: unknown,
  ): Promise<BridgeResult<{ memoryDir: string; moved: boolean; leftover?: string }>>;
  sessionOwner(payload: unknown): BridgeResult<{ owner: OwnedSessionBot | null }>;
  botSessionIds(payload: unknown): BridgeResult<{
    sessionIds: string[];
    groups: { botSlug: string; displayName: string; sessionIds: string[] }[];
  }>;
  messageAttachmentTarget(payload: unknown): BridgeResult<{ target: MemoryFileTarget }>;
  channelMediaTarget(payload: unknown): Promise<BridgeResult<{ target: MemoryFileTarget }>>;
  memoryFileTarget(payload: unknown): BridgeResult<{ target: MemoryFileTarget }>;
  memoryImage(payload: unknown): BridgeResult<{ mime: string; dataBase64: string }>;
  memorySnapshot(payload: unknown): BridgeResult<{ snapshot: MemoryAcceptedSnapshot }>;
  memoryFile(payload: unknown): BridgeResult<{
    file?: {
      path: string;
      body: string;
      head: string;
      binary?: boolean;
      image?: import('../memory/image.js').MemoryImage;
      markdown?: import('../memory/markdown.js').MemoryMarkdown;
    };
  }>;
  memoryHistory(payload: unknown): BridgeResult<{ commits: MemoryAcceptedCommit[] }>;
  memoryDiff(payload: unknown): BridgeResult<{ sha: string; diff: string }>;
  memoryGitGraph(payload: unknown): BridgeResult<MemoryGitGraph>;
  memoryGitCommitDiff(payload: unknown): BridgeResult<MemoryGitCommitDiff>;
  memoryWorkingChanges(payload: unknown): BridgeResult<{ changes: MemoryWorkingChange[] }>;
  memoryWorkingDiff(payload: unknown): BridgeResult<MemoryWorkingDiff>;
  memoryRecoveryHistory(
    payload: unknown,
  ): BridgeResult<{ checkpoints: MemoryRecoveryCheckpoint[] }>;
  memoryRestore(payload: unknown): BridgeResult<{
    checkpoint: MemoryRecoveryCheckpoint;
    archivePath: string;
  }>;
  memorySave(payload: unknown): BridgeResult<{ commit: MemoryAcceptedCommit }>;
  memoryRestoreCommit(payload: unknown): BridgeResult<{
    head: string;
    backup: string | null;
    version: MemoryVersionName | null;
    saved: MemoryRecoveryCheckpoint;
  }>;
  memoryNameVersion(payload: unknown): BridgeResult<{ version: MemoryVersionName }>;
  memoryVersions(payload: unknown): BridgeResult<{ versions: MemoryVersion[] }>;
  memoryRemoveVersionName(payload: unknown): BridgeResult<{ removed: true }>;
  memoryRepair(payload: unknown): BridgeResult<{ repair: MemoryRepairEvent }>;
  profileActivity(payload: unknown): Promise<BridgeResult<ProfileActivity>>;
  profileSessionUsage(payload: unknown): Promise<BridgeResult<ProfileSessionUsage>>;
  overviewMemory(payload: unknown): Promise<BridgeResult<OverviewMemory>>;
  usageByMember(payload: unknown): BridgeResult<UsageByMemberResult>;
  overviewUsage(payload: unknown): BridgeResult<OverviewUsage>;
  profileUsage(payload: unknown): BridgeResult<UsageQueryResult>;
  groupProfileActivity(payload: unknown): BridgeResult<GroupProfileActivity>;
  rosterGet(payload: unknown): BridgeResult<RosterSnapshot>;
  sectionCreate(payload: unknown): Promise<BridgeResult<{ section: RosterSection }>>;
  sectionRename(payload: unknown): Promise<BridgeResult<{ section: RosterSection }>>;
  sectionRemove(payload: unknown): Promise<BridgeResult<{ removed: boolean }>>;
  channelAssign(payload: unknown): Promise<BridgeResult<Record<string, never>>>;
  sectionReorder(payload: unknown): Promise<BridgeResult<{ sectionOrder: string[] }>>;
  topReorder(payload: unknown): Promise<BridgeResult<{ topOrder: TopOrderEntry[] }>>;
  pinsSet(payload: unknown): Promise<BridgeResult<{ pins: string[] }>>;
  hiddenSet(payload: unknown): Promise<BridgeResult<{ hidden: string[] }>>;
  channelMuteSet(payload: unknown): Promise<BridgeResult<{ muted: string[] }>>;
  rosterBatch(payload: unknown): Promise<BridgeResult<RosterSnapshot>>;
  developerModeSet(payload: unknown): BridgeResult<{ accepted: boolean }>;
  botModes: BotModeBridgeMethods['botModes'];
  botModeDefaultSet: BotModeBridgeMethods['botModeDefaultSet'];
  botModeSet: BotModeBridgeMethods['botModeSet'];
  botModeTemplateSave: BotModeBridgeMethods['botModeTemplateSave'];
  botModeTemplateDelete: BotModeBridgeMethods['botModeTemplateDelete'];
  botModeTemplateSet: BotModeBridgeMethods['botModeTemplateSet'];
  idleCompaction(payload?: unknown): BridgeResult<IdleCompactionView>;
  idleCompactionSet(payload: unknown): BridgeResult<IdleCompactionView>;
  idleCompactionCacheLifetimeSet(payload: unknown): BridgeResult<IdleCompactionView>;
  compactionThresholdSet(payload: unknown): BridgeResult<IdleCompactionView>;
  standingLimitsSet(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  releaseInfo(payload: unknown): BridgeResult<ReleaseInfo>;
  releaseUpdate(payload?: unknown): Promise<BridgeResult<ReleaseUpdate>>;
  releaseInstall(payload: unknown): Promise<BridgeResult<ReleaseInstall>>;
  releaseRestart(payload: unknown): Promise<BridgeResult<ReleaseRestart>>;
  pluginUpdates(payload?: unknown): Promise<BridgeResult<PluginUpdates>>;
  pluginInstall(payload: unknown): Promise<BridgeResult<PluginInstall>>;
  pluginRestart(payload: unknown): Promise<BridgeResult<PluginRestart>>;
  updateRun(payload?: unknown): BridgeResult<UpdateRun | null>;
  updateCancel(payload: unknown): Promise<BridgeResult<UpdateCancel>>;
  telemetryStatus(): BridgeResult<TelemetryStatus>;
  gitStatus(): BridgeResult<GitStatus>;
  gitInstall(): BridgeResult<GitStatus>;
  telemetrySet(payload: unknown): BridgeResult<TelemetryStatus>;
  takeoverList(payload: unknown): BridgeResult<{ takeovers: TakeoverHandoff[] }>;
  takeoverStatus(payload: unknown): BridgeResult<{ takeover: TakeoverHandoff }>;
  takeoverRequest(payload: unknown): Promise<BridgeResult<{ takeover: TakeoverHandoff }>>;
  takeoverComplete(payload: unknown): Promise<BridgeResult<{ takeover: TakeoverHandoff }>>;
  takeoverCancel(payload: unknown): Promise<BridgeResult<{ takeover: TakeoverHandoff }>>;
}

export interface IdleCompactionView {
  enabled: boolean;
  settingReadable: boolean;
  minimumIdleSeconds: number;
  scheduled: number;
  routes: IdleCompactionRouteView[];
  threshold: {
    ratio: number;
    headroomTokens: number;
    ratioSet: boolean;
    headroomSet: boolean;
    ratioRange: { defaultValue: number; min: number; max: number };
    headroomRange: { defaultValue: number; min: number; max: number };
  };
}

export interface IdleCompactionDeps {
  settings: IdleCompactionSettings;
  scheduler: Pick<IdleCompaction, 'describe' | 'scheduled'>;
  routes(): IdleCompactionRoute[];
  rescan(): void;
  applyThreshold?(): void;
  compactBot?(slug: string): Promise<ManualCompactionResult>;
  compactReservedSession?(sessionId: string): Promise<ManualCompactionResult>;
}

const storageCleanupScope = z
  .object({
    before: z.iso.datetime(),
    channelIds: z.array(z.string().min(1).max(200)).max(500).optional(),
    kinds: z.array(z.enum(STORAGE_MEDIA_KINDS)).min(1).max(4).optional(),
  })
  .strict();

const storageMessagesScope = z
  .object({
    before: z.iso.datetime(),
    channelIds: z.array(z.string().min(1).max(200)).max(500).optional(),
  })
  .strict();

function purgeFailure(error: unknown, message: string): BridgeResult<never> {
  return {
    ok: false,
    error:
      error instanceof ContentPurgeError
        ? {
            code: error.code === 'purge-preview-stale' ? 'storage-preview-stale' : error.code,
            message: error.message,
          }
        : { code: 'purge-unavailable', message },
  };
}

function storageFailure(
  error: unknown,
  message: string,
  warn?: (message: string) => void,
): BridgeResult<never> {
  if (!(error instanceof StorageCleanupError))
    warn?.(`${message}: ${error instanceof Error ? error.message : String(error)}`);
  return {
    ok: false,
    error:
      error instanceof StorageCleanupError
        ? { code: error.code, message: error.message }
        : { code: 'storage-unavailable', message },
  };
}

export interface BridgeMethodsDeps
  extends
    PromptBridgeDeps,
    SchedulesBridgeDeps,
    SkillsBridgeDeps,
    AvatarsBridgeDeps,
    MarketplaceBridgeDeps,
    ModelsBridgeDeps,
    ComputerBridgeDeps,
    BrowserBridgeDeps,
    VoiceBridgeDeps,
    ApprovalsBridgeDeps,
    WorkspacesBridgeDeps {
  team?: TeamService;
  callText?: (input: CallTextInput) => Promise<CallTextHarvest | undefined>;
  botContext?(slug: string): Promise<BotContextWindow>;
  idleCompaction?: IdleCompactionDeps;
  cloudConnections?: CloudConnections;
  cloudWork?: CloudWork;
  botModes?: BotModesDeps;
  composerIdentity?: (human: HumanContext) => ComposerRecoveryIdentity;
  warn?: (message: string) => void;
  registry: PersonaBotRegistry;
  creations?: BotCreationService;
  imports?: BotImportsService;
  channelManagement?: ChannelManagementService;
  deletions?: PersonaBotDeletions;
  contentPurge?: ContentPurge;
  storage?: StorageCleanup;
  dataReset?: DataReset;
  attachments?: AttachmentStore;
  onboarding?: BotOnboarding;
  acknowledgements?: ClientAcknowledgements;
  tob?: TobService;
  onboardingNews?: (slug?: string) => Promise<boolean>;
  states: BotStateTracker;
  runningSessionIds?: () => ReadonlySet<string>;
  channels: ChannelStore;
  ownership: SessionOwnership;
  memory?: MemoryService;
  usage?: UsageProjection;
  readUsageSessionLog?: DshUsageSessionLogReader;
  describeToolCall?(sessionId: string, name: string, args: unknown): PublicToolCall | undefined;
  orchestratorRunner?(botSlug: string): OrchestratorRunner | undefined;
  describeEngineSession?(sessionId: string):
    | {
        engine: string;
        account?: string;
        state: 'starting' | 'running' | 'waiting-approval' | 'idle';
        quota?: SessionEngineQuota;
      }
    | undefined;
  presentToolResult?: PresentToolResult;
  sessionLive?: SessionLiveStreams;
  roster: RosterStore;
  runtime?: BotRuntime;
  attention?: BotAttentionQuery;
  sourcePolicy?: BotSourcePolicyStore;
  takeovers?: TakeoverHandoffs;
  humanAttention?: HumanAttentionQuery;
  humanAttentionDecisions?: HumanAttentionDecisions;
  folders?: FolderBrowser;
  externalMessaging?: OutboundMessaging;
  toolApproval?: ChannelToolApproval;
  assignmentAccess?: AssignmentAccessStore;
  developerMode?: { set(enabled: boolean): void };
  createBotId?: () => string;
  marketplaceReceipts?: InstallReceipts;
  release?: ReleaseService;
  hostVersion?: () => string;
  plugins?: PluginUpdateService;
  updates?: UpdateRuns;
  telemetry?: {
    status(): TelemetryStatus;
    setPreference(enabled: boolean): TelemetryStatus;
    capture?: TelemetryCapture;
  };
  activeDay?: ActiveDay;
  git?: Pick<GitService, 'status' | 'install'>;
}

function unmanagedGitStatus(): GitStatus {
  const git = probeGit();
  return git.available
    ? {
        ...git,
        source: 'system',
        installable: false,
        install: { phase: 'idle' },
      }
    : { ...git, installable: false, install: { phase: 'idle' } };
}

function asQuery(payload: unknown): string | undefined {
  const value = asObject(payload)['query'];
  return typeof value === 'string' ? value : undefined;
}

function parseCreation(
  payload: unknown,
): BridgeResult<{ input: BotCreationInput; operationKey?: string }> {
  const source = asObject(payload);
  const displayName = source['displayName'];
  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    return invalidInput('displayName is required');
  }
  const persona = parseOptional(source, 'persona');
  const coreMemory = parseOptional(source, 'coreMemory');
  const roles = parseRoles(source);
  const description = parseOptional(source, 'description');
  const model = parseOptional(source, 'model');
  const preset = parseOptional(source, 'preset');
  const workspaces = parseWorkspaces(source);
  const avatar = parseOptional(source, 'avatar');
  const memoryLocation = parseOptional(source, 'memoryLocation');
  if (
    !memoryLocation.ok ||
    !persona.ok ||
    !coreMemory.ok ||
    !roles.ok ||
    !description.ok ||
    !model.ok ||
    !preset.ok ||
    !workspaces.ok ||
    !avatar.ok
  ) {
    return invalidInput('invalid create payload');
  }
  const operationKey = source['operationKey'];
  if (operationKey !== undefined && typeof operationKey !== 'string')
    return invalidInput('operationKey must be a string');
  const input = {
    displayName,
    ...(persona.value === undefined ? {} : { persona: persona.value }),
    ...(coreMemory.value === undefined ? {} : { coreMemory: coreMemory.value }),
    ...(roles.value === undefined ? {} : { roles: roles.value }),
    ...(description.value === undefined ? {} : { description: description.value }),
    ...(model.value === undefined ? {} : { model: model.value }),
    ...(preset.value === undefined ? {} : { preset: preset.value }),
    ...(workspaces.value === undefined ? {} : { workspaces: workspaces.value }),
    ...(avatar.value === undefined ? {} : { avatar: avatar.value }),
    ...(memoryLocation.value === undefined ? {} : { memoryLocation: memoryLocation.value }),
  };
  return {
    ok: true,
    value: { input, ...(operationKey === undefined ? {} : { operationKey }) },
  };
}
const parseWorkspaces = (source: Record<string, unknown>): ParsedField<string[]> =>
  parseStringArray(source, 'workspaces');

function releaseUnavailable(): BridgeResult<never> {
  return {
    ok: false,
    error: {
      code: 'release-unavailable',
      message: 'Release information is unavailable',
    },
  };
}

const TUTORIAL_EVENTS: Record<TutorialAction, TelemetryEventName> = {
  start: 'onboarding:tutorial_start',
  pause: 'onboarding:tutorial_pause',
  skip: 'onboarding:tutorial_skip',
  continue: 'onboarding:tutorial_resume',
  restart: 'onboarding:tutorial_restart',
  finish: 'onboarding:tutorial_complete',
};

function telemetryUnavailable(): BridgeResult<never> {
  return {
    ok: false,
    error: {
      code: 'telemetry-unavailable',
      message: 'Usage statistics are unavailable',
    },
  };
}

function takeoverFailure(error: unknown): BridgeResult<never> {
  if (error instanceof TakeoverError)
    return { ok: false, error: { code: error.code, message: error.message } };
  return invalidInput(String(error));
}

function takeoverSurface(value: unknown): string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{0,31}$/u.test(value) ? value : 'client';
}

function botInChannel(channel: ChannelRecord, botSlug: string): boolean {
  return channel.type === 'group' ? channel.members.includes(botSlug) : channel.botSlug === botSlug;
}

function dmAdmissionFailure(
  channelId: string,
  botSlug: string | undefined,
  reason: DmAdmissionFailure,
): BridgeResult<never> {
  switch (reason) {
    case 'unknown-channel':
      return unknownChannel(channelId);
    case 'not-dm':
      return invalidInput('Bot runtime accepts only PersonaBot DM messages');
    case 'unknown-bot':
      return unknownBot(botSlug ?? channelId);
    case 'archived-bot':
      return {
        ok: false,
        error: {
          code: 'bot-archived',
          message: `PersonaBot is archived: ${botSlug ?? channelId}`,
        },
      };
    case 'blank-body':
      return invalidInput('body is required');
    case 'cli-request-expired':
      return {
        ok: false,
        error: { code: reason, message: 'Typed CLI requests cannot be replayed.' },
      };
    case 'runtime-closed':
      return {
        ok: false,
        error: { code: 'unavailable', message: 'Bot runtime is closed' },
      };
  }
}

function unknownAssignment(sessionId: string): BridgeResult<never> {
  return {
    ok: false,
    error: { code: 'not-found', message: `unknown Assignment: ${sessionId}` },
  };
}

const DIRECT_TOOL_TIMEOUT_MS = 10 * 60_000;

const HUMAN_ATTENTION_DISMISS_LIMIT = 1000;
const HUMAN_ATTENTION_READ_KINDS: ReadonlySet<string> = new Set([
  'channel-unread',
  'channel-reply',
  'channel-mention',
]);
const HUMAN_ATTENTION_DISMISS_KINDS: ReadonlySet<string> = new Set<HumanAttentionItem['kind']>([
  'group-join-request',
  'pairing-request',
  'user-question',
  'private-input',
  'takeover-request',
  'tool-approval',
  'auto-rejection',
  'workspace-grant-request',
  'bot-dm-message',
  'assignment-waiting-human',
  'assignment-blocked',
  'assignment-report',
  'bot-message-needs-repair',
  'channel-unread',
  'channel-reply',
  'channel-mention',
]);

function directToolsUnavailable(): BridgeResult<never> {
  return {
    ok: false,
    error: {
      code: 'unavailable',
      message: 'Direct Bot tools are unavailable on this Host',
    },
  };
}

function idleCompactionView(deps: IdleCompactionDeps): IdleCompactionView {
  const setting = deps.settings.read();
  return {
    enabled: setting !== 'invalid' && setting.enabled,
    settingReadable: setting !== 'invalid',
    minimumIdleSeconds: MIN_IDLE_MS / 1000,
    scheduled: deps.scheduler.scheduled(),
    routes: deps.scheduler.describe(deps.routes()),
    threshold: {
      ratio:
        (setting === 'invalid' ? undefined : setting.thresholdRatio) ??
        COMPACTION_THRESHOLD_RATIO.defaultValue,
      headroomTokens:
        (setting === 'invalid' ? undefined : setting.headroomTokens) ??
        COMPACTION_HEADROOM_TOKENS.defaultValue,
      ratioSet: setting !== 'invalid' && setting.thresholdRatio !== undefined,
      headroomSet: setting !== 'invalid' && setting.headroomTokens !== undefined,
      ratioRange: COMPACTION_THRESHOLD_RATIO,
      headroomRange: COMPACTION_HEADROOM_TOKENS,
    },
  };
}

function dataResetFailure(error: unknown): BridgeResult<never> {
  if (error instanceof DataResetError)
    return { ok: false, error: { code: error.code, message: error.message } };
  return {
    ok: false,
    error: {
      code: 'data-reset-failed',
      message: error instanceof Error ? error.message : 'BotHarness data could not be cleared',
    },
  };
}

export const SESSION_PROGRESS_LIMIT = 30;

export type SessionProgressEntry = { sessionId: string } & (
  | SessionProgress
  | { error: 'not-found' | 'unavailable' }
);

async function sessionLogOf(
  read: DshUsageSessionLogReader,
  sessionId: string,
): Promise<AssignmentTimelineSession> {
  return { sessionId, events: (await read(sessionId))?.events ?? [] };
}

async function subagentSessionsOf(
  ownership: SessionOwnership,
  read: DshUsageSessionLogReader,
  slug: string,
  sessionId: string,
): Promise<AssignmentTimelineSession[]> {
  const subagents = ownership
    .descendantsOf(sessionId)
    .filter((record) => record.botSlug === slug && record.provenance === 'subagent');
  const skipped = Math.max(0, subagents.length - TIMELINE_SUBAGENTS);
  return [
    ...subagents.slice(0, skipped).map((record) => ({ sessionId: record.sessionId, events: [] })),
    ...(await Promise.all(
      subagents.slice(skipped).map((record) => sessionLogOf(read, record.sessionId)),
    )),
  ];
}

function unknownSection(sectionId: string): BridgeResult<never> {
  return {
    ok: false,
    error: {
      code: 'not-found',
      message: `unknown Channel section: ${sectionId}`,
    },
  };
}

const sectionCreatePayload = z.object({ name: z.string() });
const sectionRenamePayload = z.object({
  sectionId: z.string().min(1),
  name: z.string(),
});
const sectionRemovePayload = z.object({ sectionId: z.string().min(1) });
const channelAssignPayload = z.object({
  channelId: z.string().min(1),
  sectionId: z.union([z.string().min(1), z.null()]).optional(),
  index: z.number().int().min(0).optional(),
});
const sectionReorderPayload = z.object({ order: z.array(z.string()) });
const topReorderPayload = z.object({
  order: z.array(z.object({ kind: z.enum(['section', 'channel']), id: z.string().min(1) })),
});
const pinsSetPayload = z.object({ pins: z.array(z.string()) });
const hiddenSetPayload = z.object({ hidden: z.array(z.string()) });
const channelMuteSetPayload = z.object({
  channelId: z.string().trim().min(1),
  muted: z.boolean(),
});
const rosterBatchPayload = z.object({
  action: z.enum(['pin', 'unpin', 'hide', 'move']),
  channelIds: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_ROSTER_BATCH_SIZE)
    .refine((ids) => new Set(ids).size === ids.length),
  sectionId: z.union([z.string().min(1), z.null()]).optional(),
});

function createFailure(
  slug: string,
  failure: Extract<CreatePersonaBotResult, { ok: false }>,
): BridgeResult<never> {
  switch (failure.reason) {
    case 'duplicate':
      return {
        ok: false,
        error: {
          code: 'duplicate',
          message: `PersonaBot already exists: ${slug}`,
        },
      };
    case 'invalid-slug':
      return {
        ok: false,
        error: { code: 'invalid-slug', message: `invalid slug: ${slug}` },
      };
    case 'invalid-input':
      return invalidInput('invalid PersonaBot input');
    case 'invalid-memory-dir':
      return {
        ok: false,
        error: {
          code: 'invalid-memory-dir',
          message:
            'The Memory location must be an existing absolute folder that does not already hold this Bot.',
        },
      };
    case 'git-not-found':
      return {
        ok: false,
        error: {
          code: 'git-not-found',
          message: 'Install Git, make it available on PATH, restart DeepSeek Harness, then retry.',
        },
      };
    case 'invalid-git-url':
      return {
        ok: false,
        error: {
          code: 'invalid-git-url',
          message: 'Enter an HTTPS or SSH Git URL without credentials.',
        },
      };
    case 'git-source-changed':
      return {
        ok: false,
        error: {
          code: 'git-source-changed',
          message:
            'The repository changed after inspection. Review the source again before starting another import.',
        },
      };
    case 'git-clone-failed':
      return {
        ok: false,
        error: {
          code: 'git-clone-failed',
          message: 'Git clone failed. Check the URL and Host Git credentials.',
        },
      };
    case 'git-clone-timeout':
      return {
        ok: false,
        error: {
          code: 'git-clone-timeout',
          message: 'Git clone timed out. Retry or check Host network access.',
        },
      };
    case 'invalid-zip':
      return {
        ok: false,
        error: {
          code: 'invalid-zip',
          message: 'The zip file could not be unpacked.',
        },
      };
    case 'memory-unavailable':
      return {
        ok: false,
        error: {
          code: 'memory-unavailable',
          message: `Memory Repository is unavailable: ${failure.detail ?? 'unknown reason'}`,
        },
      };
  }
}

function summarize(
  record: PersonaBotRecord,
  snapshot: BotStateSnapshot,
  protectedTob = false,
): PersonaBotSummary {
  return {
    slug: record.slug,
    displayName: record.displayName,
    ...(protectedTob
      ? {
          tob: {
            defaultName: record.displayNameCustomized !== true && record.displayName === 'Tob',
            defaultAvatar:
              record.avatarCustomized !== true &&
              ((!record.avatar?.trim() && record.appearance === undefined) ||
                isDeepStrictEqual(record.appearance?.recipe, DEEPSEEKBOT_RECIPE)),
          },
        }
      : {}),
    aggregateState: snapshot.state,
    workspaces: [...record.workspaces],
    createdAt: record.createdAt,
    roles: record.roles ?? (record.tag === undefined ? [] : [record.tag]),
    standingLimits: { ...(record.standingLimits ?? DEFAULT_STANDING_LIMITS) },
    ...(record.appearance === undefined ? {} : { appearance: record.appearance }),
    ...(currentBotPrimaryColor(record.primaryColor) === undefined
      ? {}
      : { primaryColor: currentBotPrimaryColor(record.primaryColor)! }),
    ...(record.description === undefined ? {} : { description: record.description }),
    ...(record.avatar === undefined
      ? {}
      : {
          avatar: record.avatar.startsWith('data:image/')
            ? botAvatarUrl(record.slug, record.avatar)
            : record.avatar,
        }),
    ...(record.banner === undefined
      ? {}
      : { banner: botBannerSummary(record.slug, record.banner) }),
    ...(record.avatarSeed === undefined ? {} : { avatarSeed: record.avatarSeed }),
    ...(record.paused === undefined ? {} : { paused: record.paused }),
    ...(record.computerAccess === undefined ? {} : { computerAccess: record.computerAccess }),
    ...(record.browserAccess === undefined ? {} : { browserAccess: record.browserAccess }),
    ...(record.browserProfile === undefined ? {} : { browserProfile: record.browserProfile }),
    ...(record.approvalTemplate === undefined ? {} : { approvalTemplate: record.approvalTemplate }),
    ...(record.marketplaceUpload === undefined
      ? {}
      : { uploadedListing: record.marketplaceUpload.id }),
    ...(record.marketplaceListing === undefined
      ? {}
      : { installedListing: record.marketplaceListing.id }),
  };
}

function detail(
  record: PersonaBotRecord,
  snapshot: BotStateSnapshot,
  protectedTob = false,
): PersonaBotDetail {
  return {
    ...summarize(record, snapshot, protectedTob),
    sessions: { ...snapshot.sessions },
    ...(record.model === undefined ? {} : { model: record.model }),
    ...(record.modelPlan === undefined ? {} : { modelPlan: record.modelPlan }),
    ...(record.preset === undefined ? {} : { preset: record.preset }),
    ...(record.memoryDir === undefined ? {} : { memoryDir: record.memoryDir }),
  };
}
const MAX_CHANNEL_SEND_ATTACHMENTS = 10;
const MAX_SKILL_INVOCATIONS = 5;

function ownAttachments(
  message: ChannelMessage,
  requested: ChannelMessage['voiceCall'],
): readonly ChannelAttachmentRef[] {
  const attachments = message.attachments ?? [];
  const visual = message.voiceCall?.visual;
  return requested === undefined &&
    message.voiceCall?.atMs !== undefined &&
    visual !== undefined &&
    'frames' in visual
    ? attachments.slice(0, -1)
    : attachments;
}

export function createBridgeMethodsForHumans(
  deps: BridgeMethodsDeps,
): (human: HumanContext) => BridgeMethods {
  const tables = new Map<HumanId, BridgeMethods>();
  return (human) => {
    const key = JSON.stringify([human.humanId, human.caller]);
    const existing = tables.get(key);
    if (existing !== undefined) return existing;
    const methods = createBridgeMethods(human, deps);
    tables.set(key, methods);
    return methods;
  };
}

export function createBridgeMethods(human: HumanContext, deps: BridgeMethodsDeps): BridgeMethods {
  const isOwner = () => deps.team?.isOwner(human) ?? human.humanId === OWNER_HUMAN_CONTEXT.humanId;
  const authorizeImport = () => {
    if (isOwner()) return;
    if (!deps.team)
      throw new TeamError('permission-required', undefined, { permission: 'bots.createPrivate' });
    deps.team.roles.require(human, 'bots.createPrivate');
  };
  const registry = deps.registry
    ? privateBotRegistry(deps.registry, human, authorizeImport)
    : deps.registry;
  const creations = deps.creations
    ? privateBotCreations(deps.creations, human, isOwner, authorizeImport)
    : undefined;
  const imports = creations
    ? (deps.imports?.withCreations(creations) ??
      createBotImports(creations, deps.warn === undefined ? {} : { log: deps.warn }))
    : undefined;
  const scoped: BridgeMethodsDeps = {
    ...deps,
    registry,
    roster:
      human.humanId === OWNER_HUMAN_CONTEXT.humanId
        ? deps.roster
        : deps.roster.forHuman(human.humanId),
  };
  delete scoped.creations;
  delete scoped.imports;
  delete scoped.zipImports;
  if (creations) scoped.creations = creations;
  if (imports) scoped.imports = imports;
  if (deps.zipImports && imports)
    scoped.zipImports = deps.zipImports.withContext(imports, registry, (key) => {
      if (!validBotCreationKey(key)) throw new BotZipUploadError('invalid-upload');
      return human.humanId === OWNER_HUMAN_CONTEXT.humanId
        ? key
        : 'member:' +
            createHash('sha256')
              .update(JSON.stringify([human.humanId, key]))
              .digest('hex');
    });
  return guardHumanBridge(human, deps, buildBridgeMethods(human, scoped, deps.registry), () =>
    buildBridgeMethods(human, deps),
  );
}

function buildBridgeMethods(
  human: HumanContext,
  deps: BridgeMethodsDeps,
  globalRegistry = deps.registry,
): BridgeMethods {
  const { botSystemPrompt, ...promptPresets } = createPromptBridgeMethods(deps, globalRegistry);
  const isHostOwner = () =>
    deps.team?.isOwner(human) ?? human.humanId === OWNER_HUMAN_CONTEXT.humanId;
  const channelSkillBots = (channel: ChannelRecord): string[] => {
    if (channel.type === 'group')
      return channel.members.filter((slug) => {
        const bot = deps.registry.get(slug);
        return bot !== undefined && bot.paused !== true;
      });
    const slug = channel.botSlug;
    if (slug === undefined || deps.team?.bots.canReach(human, slug) === false) return [];
    const bot = globalRegistry.get(slug);
    return bot === undefined || bot.paused === true ? [] : [slug];
  };
  const requireOwnedBot = (slug: string): void => {
    if (
      deps.team &&
      !deps.team.isOwner(human) &&
      (deps.registry.get(slug)?.ownerHumanId ?? deps.team.ownerContext().humanId) !== human.humanId
    )
      throw new TeamError('bot-not-found');
  };
  const modelRouting = createModelRoutingHelpers(human, deps, isHostOwner, requireOwnedBot);
  const { firstUsableRoute, requireGroupEfforts, requireGroupEngines, requireRoutes } =
    modelRouting;
  const allowed = (record: PersonaBotRecord): boolean =>
    botModelAllowed(
      deps.team,
      record,
      deps.defaultModel?.currentSelection() ?? deps.modelCatalog?.defaultRoute?.(),
    );
  async function appendStopNotice(
    channelId: string,
    botSlug: string,
    botName: string,
    sessionId: string,
    target: ChannelTurnStopTarget,
  ): Promise<string | undefined> {
    const humanName =
      deps.channels
        .listHumanMembers(human, channelId)
        .find((member) => member.humanId === human.humanId)?.displayName ?? 'Human';
    const subject =
      target.scope === 'bot'
        ? botName
        : target.role === 'orchestrator'
          ? `${botName}'s Orchestrator`
          : `${botName}'s Assignment${target.title ? ` “${target.title}”` : ''}`;
    const appended = await deps.channels.appendMessage(human, channelId, {
      id: `turn-stopped-${randomUUID()}`,
      at: new Date().toISOString(),
      author: { kind: 'system' },
      body: `${humanName} stopped ${subject}.`,
      turnStop: {
        botSlug,
        botName,
        humanName,
        sessionId,
        cause: 'human-stop',
        target,
      },
    });
    return appended?.id;
  }

  async function stopBotSessions(
    source: Record<string, unknown>,
    botSlug: string,
    channelId: string | undefined,
  ): Promise<
    BridgeResult<{
      stopped: import('../runtime/bot-runtime.js').StoppedSessionRef[];
      alreadyIdle: import('../runtime/bot-runtime.js').StoppedSessionRef[];
      messageId?: string;
    }>
  > {
    const bot = deps.registry.get(botSlug);
    if (bot === undefined) return unknownBot(botSlug);
    const autoContinueFor = asNonBlank(source, 'autoContinueFor');
    if (source['autoContinueFor'] !== undefined && autoContinueFor === undefined)
      return invalidInput('autoContinueFor must be a message id');
    if (autoContinueFor !== undefined) {
      if (channelId === undefined) return invalidInput('autoContinueFor needs a channelId');
      const cancelled = await deps.runtime?.stopTurn?.(botSlug, {
        autoContinueFor,
        channelId,
      });
      if (cancelled === undefined) return { ok: true, value: { stopped: [], alreadyIdle: [] } };
      const humanName =
        deps.channels
          .listHumanMembers(human, channelId)
          .find((member) => member.humanId === human.humanId)?.displayName ?? 'Human';
      const appended = await deps.channels.appendMessage(human, channelId, {
        id: `turn-stopped-${randomUUID()}`,
        at: new Date().toISOString(),
        author: { kind: 'system' },
        body: `${humanName} stopped ${bot.displayName}.`,
        turnStop: {
          botSlug,
          botName: bot.displayName,
          humanName,
          sessionId: cancelled.sessionId,
        },
      });
      return {
        ok: true,
        value: {
          stopped: [{ botSlug, sessionId: cancelled.sessionId, role: 'orchestrator' }],
          alreadyIdle: [],
          ...(appended === undefined ? {} : { messageId: appended.id }),
        },
      };
    }
    if (deps.runtime?.stopAllSessions === undefined) return unavailable();
    const outcome = await deps.runtime.stopAllSessions(botSlug);
    const channel = channelId === undefined ? undefined : deps.channels.get(channelId);
    const noticeSession =
      outcome.stopped.find((ref) => ref.role === 'orchestrator')?.sessionId ??
      outcome.stopped[0]?.sessionId;
    const messageId =
      noticeSession !== undefined &&
      channel !== undefined &&
      !channel.deletedAt &&
      botInChannel(channel, botSlug)
        ? await appendStopNotice(channel.id, botSlug, bot.displayName, noticeSession, {
            scope: 'bot',
          })
        : undefined;
    return {
      ok: true,
      value: {
        stopped: outcome.stopped,
        alreadyIdle: outcome.alreadyIdle,
        ...(messageId === undefined ? {} : { messageId }),
      },
    };
  }
  const channelView = (channel: ChannelRecord): ChannelListItem => {
    if (!isHostOwner()) {
      const {
        invitations: _invitations,
        joinRequests: _requests,
        wakePolicies: _policies,
        ...visible
      } = channel;
      channel = visible;
    }
    const memberBots =
      channel.type === 'group'
        ? channel.members.flatMap((slug) => {
            const bot = globalRegistry.get(slug);
            return bot
              ? [
                  {
                    slug,
                    displayName: bot.displayName,
                    ...(bot.avatar ? { avatar: bot.avatar } : {}),
                  },
                ]
              : [];
          })
        : undefined;
    if (channel.type === 'group') {
      const members = memberBots?.map((bot) => bot.slug) ?? [];
      const memberSlugs = new Set(members);
      channel = { ...channel, members };
      if (channel.ownerBotSlug !== undefined && !memberSlugs.has(channel.ownerBotSlug))
        delete channel.ownerBotSlug;
      if (channel.wakePolicies !== undefined)
        channel.wakePolicies = Object.fromEntries(
          Object.entries(channel.wakePolicies).filter(([slug]) => memberSlugs.has(slug)),
        );
    }
    if (channel.humanParticipants && deps.team) {
      const other = channel.humanParticipants.find((id) => id !== human.humanId);
      channel = { ...channel, name: other ? (deps.team.member(other)?.displayName ?? '') : '' };
    }
    const humanNickname = deps.channels.humanNickname(human, channel.id);
    const remoteContact =
      channel.remoteBot === undefined || channel.members[0] === undefined
        ? undefined
        : deps.runtime?.botContacts?.(channel.members[0], {
            botId: networkBotId(channel.remoteBot.hostId, channel.remoteBot.botSlug),
          }).contacts[0];
    return {
      ...channel,
      ...(memberBots ? { memberBots } : {}),
      ...(channel.botSlug && deps.team
        ? {
            readOnly: !deps.team.bots.canReach(human, channel.botSlug),
            proactiveOptOut: deps.team.bots.proactiveOptOut(human, channel.botSlug),
          }
        : {}),
      humanMembers: deps.channels.listHumanMembers(human, channel.id),
      ...(channel.remoteBot === undefined
        ? {}
        : {
            remoteAvailability:
              deps.runtime?.networkBotAvailability?.(
                channel.remoteBot.hostId,
                channel.remoteBot.botSlug,
              ) ?? 'unavailable',
          }),
      ...(remoteContact === undefined ? {} : { remoteContact }),
      ...(humanNickname === undefined ? {} : { humanNickname }),
    };
  };
  const listedChannels = async (): Promise<ChannelRecord[]> => {
    if (isHostOwner() && deps.channels.list().some((channel) => channel.remoteBot !== undefined))
      await deps.runtime?.refreshBotContacts?.();
    for (const bot of deps.registry.list())
      deps.channels.getOrCreateDm(human, bot.slug, bot.displayName);
    if (deps.team) {
      const visible = deps.team.channelAccess.visibleIds(human);
      return deps.channels
        .list()
        .filter(
          (channel) =>
            visible.has(channel.id) &&
            (channel.humanParticipants === undefined ||
              deps.channels.latestMessage(channel.id) !== undefined),
        );
    }
    return deps.channels
      .list()
      .filter((channel) =>
        channel.type === 'dm'
          ? (isHostOwner() && channel.remoteBot !== undefined) ||
            channel.members.every((slug) => deps.registry.get(slug) !== undefined)
          : isHostOwner(),
      );
  };
  const listItem = (channel: ChannelRecord): ChannelListItem => {
    const latest = deps.channels.latestMessage(channel.id);
    const latestMessage = latest === undefined ? undefined : channelPreviewMessage(latest);
    return {
      ...channelView(channel),
      ...(latestMessage === undefined ? {} : { latestMessage }),
    };
  };
  const sendReceipt = (listingId: string): void => {
    void deps.marketplaceReceipts?.send(listingId).catch(() => undefined);
  };
  const messagingCall = async <T>(
    operation: (service: OutboundMessaging) => Promise<T>,
  ): Promise<BridgeResult<T>> => {
    if (deps.externalMessaging === undefined)
      return {
        ok: false,
        error: {
          code: 'messaging-unavailable',
          message: 'External messaging is unavailable',
        },
      };
    try {
      return { ok: true, value: await operation(deps.externalMessaging) };
    } catch (error) {
      if (error instanceof MessagingError)
        return { ok: false, error: { code: error.code, message: error.code } };
      const storage = error instanceof OperationalDatabaseError;
      deps.warn?.(
        JSON.stringify({
          module: 'messaging',
          initiator: 'client',
          phase: 'rpc-failed',
          reason: storage ? 'operational-storage-unavailable' : 'unexpected-error',
        }),
      );
      return {
        ok: false,
        error: {
          code: storage ? 'messaging-storage-unavailable' : 'messaging-unavailable',
          message: storage
            ? 'External messaging storage is unavailable'
            : 'External messaging is unavailable',
        },
      };
    }
  };
  const createBotId = deps.createBotId ?? (() => 'bot-' + randomUUID().replaceAll('-', ''));
  const runnerOf = (slug: string) => {
    const orchestratorRunner = deps.orchestratorRunner?.(slug);
    return orchestratorRunner === undefined ? {} : { orchestratorRunner };
  };
  const detailOf = (record: PersonaBotRecord): { bot: PersonaBotDetail } => ({
    bot: {
      ...detail(record, deps.states.snapshot(record.slug), deps.tob?.isTob(record.slug)),
      ...runnerOf(record.slug),
      ownerHumanId: botOwner(record),
      owner: botOwner(record) === human.humanId,
      ...(botOwner(record) !== human.humanId || deps.team?.bots.hasForeignDms(human, record.slug)
        ? { sessions: {} }
        : {}),
    },
  });

  const rosterWrite = async <T>(operation: () => Promise<T>): Promise<BridgeResult<T>> => {
    try {
      return { ok: true, value: await operation() };
    } catch (error) {
      if (error instanceof RosterUnavailableError) return unavailable();
      if (error instanceof RosterUnknownSectionError) return unknownSection(error.sectionId);
      throw error;
    }
  };

  const dmMemory = (
    payload: unknown,
    historical = false,
  ): { botSlug: string } | BridgeResult<never> => {
    const channelId = asNonBlank(asObject(payload), 'channelId');
    if (channelId === undefined) return invalidInput('channelId is required');
    const channel = deps.channels.get(channelId);
    if (channel === undefined) return unknownChannel(channelId);
    if (channel.type !== 'dm' || channel.botSlug === undefined) {
      return invalidInput('Memory is available only in a PersonaBot DM');
    }
    if (
      (historical
        ? deps.registry.getHistorical(channel.botSlug)
        : deps.registry.get(channel.botSlug)) === undefined
    )
      return unknownBot(channel.botSlug);
    return { botSlug: channel.botSlug };
  };
  const memoryCall = <T>(operation: () => T): BridgeResult<T> => {
    if (deps.memory === undefined) {
      return {
        ok: false,
        error: {
          code: 'memory-unavailable',
          message: 'Memory Service unavailable',
        },
      };
    }
    try {
      return { ok: true, value: operation() };
    } catch (error) {
      if (error instanceof MemoryAcceptError || error instanceof MemoryImageError) {
        return {
          ok: false,
          error: { code: error.code, message: error.message },
        };
      }
      if (error instanceof MemoryFileError)
        return {
          ok: false,
          error: { code: error.code, message: error.message },
        };
      if (error instanceof MemoryPathError) return invalidInput(error.message);
      throw error;
    }
  };

  const setPaused = (
    payload: unknown,
    paused: boolean,
  ): BridgeResult<{ bot: PersonaBotDetail }> => {
    const slug = asSlug(payload);
    if (slug === undefined) return invalidInput('slug is required');
    if (paused && deps.tob?.isTob(slug))
      return {
        ok: false,
        error: { code: 'protected-bot', message: 'Tob cannot be archived' },
      };
    const result = deps.registry.setPaused(slug, paused);
    if (!result.ok) return unknownBot(slug);
    if (paused) deps.channels.cancelInvitationsForBot(slug);
    else deps.runtime?.resumePendingDigests?.(slug);
    return { ok: true, value: detailOf(result.record) };
  };

  const schedulesMethods = createSchedulesBridgeMethods(human, deps);
  const skillsMethods = createSkillsBridgeMethods(deps, channelSkillBots, requireOwnedBot);
  const avatarsMethods = createAvatarsBridgeMethods(deps, dmMemory, detailOf);
  const genuiMethods = createGenuiBridgeMethods(human, deps);
  const { marketplaceZip, marketplaceReads, marketplaceSharing } = createMarketplaceBridgeMethods(
    human,
    deps,
    globalRegistry,
    isHostOwner,
    detailOf,
    sendReceipt,
  );
  const { modelInheritance, modelSettings, modelPlan } = createModelsBridgeMethods(
    human,
    deps,
    globalRegistry,
    isHostOwner,
    requireOwnedBot,
    modelRouting,
  );
  const computerMethods = createComputerBridgeMethods(deps, detailOf);
  const browserMethods = createBrowserBridgeMethods(deps, detailOf);
  const approvalsMethods = createApprovalsBridgeMethods(
    human,
    deps,
    globalRegistry,
    detailOf,
    messagingCall,
  );
  const workspacesMethods = createWorkspacesBridgeMethods(human, deps);
  const methods: BridgeMethods = {
    ...createTeamBridge(human, deps.team),
    ...createModelProviderBridge(human, deps),
    ...createEngineAccountBridge(human, deps),
    ...createEngineSelectionBridge(human, { ...deps, registry: globalRegistry }),
    ...createVoiceBridgeMethods({
      providers: deps.voiceProviders,
      registry: deps.registry,
      log: deps.voiceLog,
    }),
    ...createBotModeBridgeMethods({
      modes: deps.botModes,
      registry: deps.registry,
      everyone: globalRegistry,
    }),
    channelBridges(payload) {
      const input = z
        .object({
          channelId: z.string().min(1).max(128),
          mode: z.enum(['saved', 'status']).optional(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Known Group Channel required'));
      return messagingCall((service) =>
        service.channelBridges(input.data.channelId, input.data.mode),
      );
    },
    channelIngests(payload) {
      const input = z
        .object({ channelId: z.string().min(1).max(128) })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Known Group Channel required'));
      return messagingCall(async (service) => service.inbound.ingests(input.data.channelId));
    },
    channelIngest(payload) {
      const input = z
        .object({
          channelId: z.string().min(1).max(128),
          input: conversationIngestInput,
        })
        .strict()
        .safeParse(payload);
      if (!input.success)
        return Promise.resolve(invalidInput('Invalid external conversation command'));
      return messagingCall(async (service) => {
        await service.inbound.ingest(input.data.channelId, input.data.input);
        return { updated: true as const };
      });
    },
    channelBridge(payload) {
      const input = z
        .object({
          channelId: z.string().min(1).max(128),
          input: channelBridgeInput,
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid Channel Bridge command'));
      return messagingCall(async (service) => {
        await service.inbound.channelBridge(input.data.channelId, input.data.input);
        return { updated: true as const };
      });
    },
    messagingChannelTarget(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          grantId: z.string().uuid(),
          channelId: z.string().min(1).max(128).nullable(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid Bridge Channel target'));
      return messagingCall(async (service) => {
        await service.inbound.setChannelTarget(
          input.data.slug,
          input.data.grantId,
          input.data.channelId,
        );
        return { updated: true as const };
      });
    },
    messagingThreadPolicy(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          sourceEventId: z.string().min(1).max(128),
          policy: threadReceptionInput,
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid external Thread policy'));
      return messagingCall(async (service) => {
        await service.inbound.setThread(
          input.data.slug,
          input.data.sourceEventId,
          input.data.policy,
          { kind: 'human' },
        );
        return { updated: true as const };
      });
    },
    messagingGroupPolicy(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          grantId: z.string().uuid(),
          policy: groupReceptionInput,
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid external group policy'));
      return messagingCall(async (service) => {
        await service.inbound.setPolicy(input.data.slug, input.data.grantId, input.data.policy, {
          kind: 'human',
        });
        return { updated: true as const };
      });
    },
    messagingReceive(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          grantId: z.string().uuid(),
          enabled: z.boolean(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid receive setting'));
      return messagingCall(async (service) => {
        await service.inbound.setEnabled(input.data.slug, input.data.grantId, input.data.enabled);
        return { updated: true as const };
      });
    },
    messagingSource(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          sourceEventId: z.string().min(1).max(128),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid external source'));
      return messagingCall(async (service) => ({
        source: service.inbound.read(input.data.slug, input.data.sourceEventId),
      }));
    },
    failureAlertsSet(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          enabled: z.boolean(),
          expectedRevision: z.number().int().nonnegative(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid failure-alert settings'));
      return messagingCall(async (service) => {
        service.failureAlerts.set(input.data.slug, input.data.enabled, input.data.expectedRevision);
        return { updated: true as const };
      });
    },
    failureAlertsTest(payload) {
      const input = z
        .object({ slug: z.string().min(1) })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid Bot'));
      return messagingCall(async (service) => ({
        delivery: await service.failureAlerts.test(input.data.slug),
      }));
    },
    failureAlertsRetry(payload) {
      const input = z
        .object({ slug: z.string().min(1), id: z.string().uuid() })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid notification'));
      return messagingCall(async (service) => ({
        delivery: await service.failureAlerts.retry(input.data.slug, input.data.id),
      }));
    },
    approvalRoute: approvalsMethods.approvalRoute,
    approvalTest: approvalsMethods.approvalTest,
    questionRetry: approvalsMethods.questionRetry,
    approvalRetry: approvalsMethods.approvalRetry,
    senderAccess(payload) {
      const input = z
        .object({ slug: z.string().min(1), input: senderAccessInput })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid sender access'));
      return messagingCall(async (service) =>
        service.senderAccess(input.data.slug, input.data.input),
      );
    },
    pairingReview(payload) {
      const input = z
        .object({ slug: z.string().min(1), input: pairingReviewInput })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid pairing review'));
      return messagingCall(async (service) => ({
        pairing: await service.reviewPairing(input.data.slug, input.data.input),
      }));
    },
    messagingIdentity(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          input: z.discriminatedUnion('kind', [
            z
              .object({
                kind: z.literal('bind'),
                providerId: z.string().min(1).max(128),
                accountRef: z.string().min(1).max(512),
                fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
              })
              .strict(),
            z
              .object({
                kind: z.literal('update'),
                id: z.string().uuid(),
                expectedRevision: z.number().int().positive(),
                name: z.string().trim().min(1).max(120),
                enabled: z.boolean(),
                inheritEnabled: z.boolean().optional(),
                typingEnabled: z.boolean().optional(),
                inheritTyping: z.boolean().optional(),
                expectedDefaultRevision: z.number().int().min(0).optional(),
                newConversations: z.enum(['auto', 'ask', 'inherit']).optional(),
              })
              .strict(),
            z
              .object({
                kind: z.literal('reconnect'),
                id: z.string().uuid(),
                expectedRevision: z.number().int().positive(),
              })
              .strict(),
            z
              .object({
                kind: z.literal('unbind'),
                id: z.string().uuid(),
                expectedRevision: z.number().int().positive(),
              })
              .strict(),
          ]),
        })
        .strict()
        .safeParse(payload);
      if (!input.success || deps.registry.get(input.data.slug) === undefined)
        return Promise.resolve(invalidInput('Known Bot and valid identity operation required'));
      return messagingCall(async (service) => ({
        identity: await service.identity(input.data.slug, input.data.input),
      }));
    },
    messagingDefaults(payload) {
      const parsed = z
        .object({ platform: messagingDefaultsPlatform.optional() })
        .strict()
        .safeParse(payload);
      if (!parsed.success)
        return Promise.resolve(invalidInput('Valid qualified platform required'));
      return messagingCall(async (service) => service.defaults(parsed.data.platform ?? 'feishu'));
    },
    messagingDefaultsSet(payload) {
      const parsed = messagingDefaultsInput.safeParse(payload);
      if (!parsed.success)
        return Promise.resolve(invalidInput('Valid qualified platform defaults required'));
      return messagingCall((service) => service.setDefaults(parsed.data));
    },
    async cloudWork(payload) {
      const parsed = z
        .object({ slug: z.string().min(1), input: z.unknown() })
        .strict()
        .safeParse(payload);
      if (!parsed.success || !deps.registry.get(parsed.data.slug))
        return invalidInput('Known bot and cloud work input required');
      try {
        if (!deps.cloudWork) throw new CloudError('CLOUD_UNAVAILABLE');
        return {
          ok: true,
          value: await runCloudWorkDirect(deps.cloudWork, parsed.data.slug, parsed.data.input),
        };
      } catch (error) {
        const code = error instanceof CloudError ? error.code : 'CLOUD_WORK_UNAVAILABLE';
        return { ok: false, error: { code, message: code } };
      }
    },
    async cloudConnections(payload) {
      try {
        if (!deps.cloudConnections) throw new CloudError('CLOUD_UNAVAILABLE');
        return {
          ok: true,
          value: await manageCloud(deps.cloudConnections, parseCloudManagement(payload)),
        };
      } catch (error) {
        const code = error instanceof CloudError ? error.code : 'CLOUD_UNAVAILABLE';
        return { ok: false, error: { code, message: code } };
      }
    },
    messagingApps() {
      return messagingCall(async (service) => ({
        apps: await service.apps(),
        setups: await service.setups(),
      }));
    },
    messagingSnapshot(payload) {
      const input = z
        .object({ slug: z.string(), mode: z.enum(['saved', 'status']).optional() })
        .strict()
        .safeParse(payload);
      const slug = asSlug(payload);
      if (!input.success || slug === undefined || deps.registry.get(slug) === undefined)
        return Promise.resolve(invalidInput('Known bot required'));
      return messagingCall((service) => service.snapshot(slug, input.data.mode));
    },
    messagingReachable(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          bindingId: z.string().uuid(),
          cursor: z.string().min(1).max(2048).optional(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid reachable group query'));
      return messagingCall((service) =>
        service.reachable(input.data.slug, input.data.bindingId, input.data.cursor),
      );
    },
    messagingPostRequest(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          bindingId: z.string().uuid(),
          conversationId: z.string().min(1).max(512),
          requestId: z.string().min(8).max(128),
          text: z.string().trim().min(1).max(4000),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid proactive request query'));
      return messagingCall(async (service) => ({
        intent:
          service.postRequest(
            input.data.slug,
            input.data.bindingId,
            input.data.conversationId,
            input.data.requestId,
            input.data.text,
          ) ?? null,
      }));
    },
    messagingPostConversation(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          bindingId: z.string().uuid(),
          conversationId: z.string().min(1).max(512),
          requestId: z.string().min(8).max(128),
          text: z.string().trim().min(1).max(4000),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid proactive post'));
      return messagingCall(async (service) => ({
        intent: await service.postConversation(
          input.data.slug,
          input.data.bindingId,
          input.data.conversationId,
          input.data.requestId,
          input.data.text,
        ),
      }));
    },
    messagingPostLimit(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          bindingId: z.string().uuid(),
          expectedRevision: z.number().int().positive(),
          limit: z.number().int().min(1).max(10000).nullable(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid post limit'));
      return messagingCall(async (service) => ({
        identity: await service.setPostLimit(
          input.data.slug,
          input.data.bindingId,
          input.data.expectedRevision,
          input.data.limit,
        ),
      }));
    },
    messagingTargets(payload) {
      const input = z
        .object({
          providerId: z.string().min(1),
          accountRef: z.string().min(1),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid target query'));
      return messagingCall(async (service) => ({
        targets: await service.targets(input.data.providerId, input.data.accountRef),
      }));
    },
    messagingAuthorize(payload) {
      const input = z
        .object({
          botSlug: z.string().min(1),
          providerId: z.string().min(1),
          accountRef: z.string().min(1),
          targetRef: z.string().min(1),
          fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
          targetDigest: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid authorization'));
      return messagingCall(async (service) => ({
        grant: await service.authorize(input.data),
      }));
    },
    messagingRevoke(payload) {
      const input = z
        .object({ slug: z.string().min(1), grantId: z.string().uuid() })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid grant'));
      return messagingCall(async (service) => {
        service.revoke(input.data.slug, input.data.grantId);
        return { revoked: true as const };
      });
    },
    messagingConversation(payload) {
      const conversation = z
        .object({
          kind: z.enum(['dm', 'group']),
          id: z.string().min(1).max(512),
        })
        .strict();
      const revision = z.number().int().min(0);
      const input = z
        .object({
          slug: z.string().min(1),
          input: z.discriminatedUnion('kind', [
            z
              .object({
                kind: z.literal('open-group'),
                grantId: z.string().uuid(),
                expectedRevision: revision,
                open: z.boolean(),
              })
              .strict(),
            z
              .object({
                kind: z.literal('mute'),
                grantId: z.string().uuid(),
                expectedRevision: revision,
                muted: z.boolean(),
              })
              .strict(),
            z
              .object({
                kind: z.literal('block'),
                grantId: z.string().uuid(),
                expectedRevision: revision,
              })
              .strict(),
            z
              .object({
                kind: z.literal('block-held'),
                bindingId: z.string().uuid(),
                conversation,
                expectedRevision: revision,
              })
              .strict(),
            z
              .object({
                kind: z.literal('allow'),
                bindingId: z.string().uuid(),
                conversation,
                from: z.enum(['held', 'blocked']),
                expectedRevision: revision,
              })
              .strict(),
          ]),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid conversation change'));
      return messagingCall(async (service) => {
        await service.conversation(input.data.slug, input.data.input);
        return { updated: true as const };
      });
    },
    messagingSend(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          grantId: z.string().uuid(),
          requestId: z.string().min(8).max(128),
          text: z.string().min(1).max(4000),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid send'));
      return messagingCall(async (service) => {
        const { slug, grantId, requestId, text } = input.data;
        const snapshot = await service.snapshot(slug);
        const grant = snapshot.grants.find((value) => value.id === grantId);
        return {
          intent:
            grant?.platform === 'weixin' || grant?.platform === 'qq'
              ? await service.post(slug, grantId, requestId, text)
              : await service.send(slug, grantId, requestId, text),
        };
      });
    },
    async tobCli(payload) {
      if (!isHostOwner())
        return {
          ok: false,
          error: { code: 'permission-required', message: 'Host owner authentication is required.' },
        };
      const parsed = tobCliRequestSchema.safeParse(payload);
      if (!parsed.success) return invalidInput('Invalid bounded Tob CLI request');
      if (!deps.runtime?.tobCli) return unavailable();
      try {
        return { ok: true, value: await deps.runtime.tobCli(human, parsed.data) };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error instanceof TobError ? error.code : 'operation-failed',
            message:
              error instanceof TobError ? error.code : 'The Tob CLI request could not complete.',
          },
        };
      }
    },
    async tobHome() {
      if (!isHostOwner()) return { ok: true, value: { available: false as const } };
      if (!deps.tob) return unavailable();
      try {
        const home = await deps.tob.ensure(human);
        const attention = deps.humanAttention?.status(human);
        return {
          ok: true,
          value: { ...home, ...(attention ? { attention } : {}) },
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error instanceof Error ? error.message : 'tob-unavailable',
            message: error instanceof Error ? error.message : 'Tob unavailable',
          },
        };
      }
    },
    async onboarding(payload) {
      if (!isHostOwner()) {
        return {
          ok: true,
          value: {
            profileId: human.humanId,
            tutorial: 'skipped',
            completed: true,
            preparation: 'ready',
          },
        };
      }
      if (isHostOwner() && human.humanId !== OWNER_HUMAN_CONTEXT.humanId) {
        if (!deps.tob) return unavailable();
        const home = await deps.tob.ensure(human);
        return {
          ok: true,
          value: {
            profileId: human.humanId,
            tutorial: 'skipped',
            completed: true,
            preparation: 'ready',
            defaultBotSlug: home.botSlug,
            channelId: home.channelId,
          },
        };
      }
      if (deps.onboarding === undefined) return unavailable();
      const source = asObject(payload);
      const action = source['action'];
      if (
        action !== undefined &&
        !['start', 'pause', 'skip', 'continue', 'restart', 'finish'].includes(String(action))
      )
        return invalidInput('Invalid tutorial action');
      try {
        const value = await deps.onboarding.enter(
          asSlug(payload),
          action as TutorialAction | undefined,
        );
        if (action !== undefined)
          deps.telemetry?.capture?.(TUTORIAL_EVENTS[action as TutorialAction]);
        const newsAvailable =
          (await deps
            .onboardingNews?.(asSlug(payload) ?? value.defaultBotSlug)
            .catch(() => false)) ?? false;
        return { ok: true, value: { ...value, newsAvailable } };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error instanceof Error ? error.message : 'onboarding-unavailable',
            message: error instanceof Error ? error.message : 'Onboarding unavailable',
          },
        };
      }
    },
    acknowledgements() {
      if (deps.acknowledgements === undefined) return unavailable();
      return { ok: true, value: { items: deps.acknowledgements.list() } };
    },
    acknowledge(payload) {
      if (deps.acknowledgements === undefined) return unavailable();
      const source = asObject(payload);
      const recorded = deps.acknowledgements.record(
        String(source['key'] ?? ''),
        source['value'] as string,
      );
      if (recorded === undefined) return invalidInput('Invalid acknowledgement');
      return { ok: true, value: recorded };
    },
    ...modelInheritance,
    telemetryEvent(payload) {
      const source = asObject(payload);
      const event = source['event'];
      if (!isClientTelemetryEventName(event)) return invalidInput('Unknown telemetry event');
      const properties = telemetryEventProperties(event, asObject(source['properties']));
      if (properties === undefined) return invalidInput('Invalid telemetry event properties');
      deps.telemetry?.capture?.(event, properties);
      if (event === 'app:bot_mode_enter') {
        const surface = properties['surface'];
        deps.activeDay?.mark(
          'bot_mode_enter',
          typeof surface === 'string' ? (surface as TelemetrySurface) : undefined,
        );
      }
      return { ok: true, value: null };
    },
    async onboardingModel(payload) {
      if (deps.modelCatalog === undefined || deps.defaultModel === undefined) return unavailable();
      const source = asObject(payload);
      const slug = asSlug(payload);
      const groupId = source['groupId'];
      const groupEffort = source['groupEffort'];
      const revision = source['expectedRevision'];
      const defaultRevision = source['expectedDefaultRevision'];
      const defaultGroupRevision = source['expectedDefaultGroupRevision'];
      if (
        defaultGroupRevision !== undefined &&
        (!Number.isSafeInteger(defaultGroupRevision) ||
          Number(defaultGroupRevision) < 0 ||
          source['globalDefault'] !== true)
      )
        return invalidInput('A default Routing Group revision needs global scope');
      if (
        groupId !== undefined &&
        (typeof groupId !== 'string' ||
          !groupId.trim() ||
          source['route'] !== undefined ||
          source['globalDefault'] !== true ||
          deps.routingGroups === undefined)
      )
        return invalidInput('A default Routing Group replaces the route and needs global scope');
      if (
        groupEffort !== undefined &&
        (typeof groupEffort !== 'string' || !groupEffort.trim() || typeof groupId !== 'string')
      )
        return invalidInput('A default Routing Group effort needs a nonempty effort and a group');
      const effort = typeof groupEffort === 'string' ? groupEffort.trim() : undefined;
      let route = source['route'];
      if (typeof groupId === 'string') {
        try {
          if (deps.routingGroups?.get(groupId) === undefined)
            throw new RoutingGroupError('not-found', `Routing Group ${groupId} does not exist`);
          requireGroupEngines(groupId);
          if (effort !== undefined) await requireGroupEfforts(groupId, [effort]);
          const first = await firstUsableRoute(deps.routingGroups.routes(groupId));
          route =
            effort === undefined
              ? first
              : groupMemberRoute(first, effort, await deps.modelCatalog.list());
        } catch (error) {
          return routingGroupFailure(error);
        }
      }
      if (
        defaultRevision !== undefined &&
        (!Number.isSafeInteger(defaultRevision) ||
          Number(defaultRevision) < 0 ||
          source['globalDefault'] !== true ||
          slug !== undefined)
      )
        return invalidInput(
          'A nonnegative native default revision requires global scope without a Bot target',
        );
      if (
        !isModelRoute(route) ||
        typeof source['globalDefault'] !== 'boolean' ||
        !Number.isSafeInteger(revision)
      )
        return invalidInput('Model, scope and expected revision required');
      const bot = slug === undefined ? undefined : deps.registry.get(slug);
      if (slug !== undefined && bot === undefined) return unknownBot(slug);
      if ((bot?.modelPlan?.revision ?? bot?.modelPlanRevision ?? 0) !== revision)
        return invalidInput('Bot model changed; reopen before saving');
      try {
        if (slug !== undefined && !source['globalDefault']) requireRoutes(slug, [route]);
        await deps.modelCatalog.validate(route);
        if (typeof groupId === 'string') requireGroupEngines(groupId);
        if (source['globalDefault']) {
          let savedDefaultRevision = 0;
          const groups = deps.routingGroups;
          const previous = groups?.defaultGroup();
          const nextGroup = typeof groupId === 'string' ? groupId : undefined;
          if (
            previous !== undefined &&
            defaultGroupRevision !== undefined &&
            previous.revision !== defaultGroupRevision
          )
            return routingGroupFailure(
              new RoutingGroupError(
                'stale-revision',
                `The default model changed (revision ${previous.revision}); read it again before saving`,
              ),
            );
          const settings =
            defaultRevision === undefined ? undefined : deps.defaultModelSettings?.();
          if (defaultRevision !== undefined) {
            const current = settings
              ?.describe({ redactSecrets: true })
              .find((entry) => entry.ns === 'agent-default-model');
            if (!settings || !current) return unavailable();
            if (current.revision !== defaultRevision)
              return {
                ok: false,
                error: {
                  code: 'stale-setting',
                  message: 'Host default model changed; read it again before saving',
                },
              };
          }
          const reserved =
            groups === undefined ||
            previous === undefined ||
            nextGroup === undefined ||
            (previous.groupId === nextGroup && previous.effort === effort)
              ? undefined
              : groups.setDefaultGroup(nextGroup, previous.revision, effort);
          const restore = (): void => {
            if (reserved === undefined || previous === undefined) return;
            try {
              groups?.setDefaultGroup(previous.groupId, reserved.revision, previous.effort);
            } catch {}
          };
          try {
            if (settings === undefined) await deps.defaultModel.saveSelection(route);
            else
              await settings.replace(
                'agent-default-model',
                {
                  provider: route.provider,
                  model: route.model,
                  ...(route.reasoningEffort === undefined
                    ? {}
                    : { reasoningEffort: route.reasoningEffort }),
                },
                Number(defaultRevision),
              );
          } catch (error) {
            restore();
            throw error;
          }
          if (settings !== undefined) {
            const saved = settings
              .describe({ redactSecrets: true })
              .find((entry) => entry.ns === 'agent-default-model');
            if (!saved)
              return {
                ok: false,
                error: {
                  code: 'setting-outcome-uncertain',
                  message:
                    'The Host default model was submitted but its settings owner is unavailable for readback',
                },
              };
            savedDefaultRevision = saved.revision;
          }
          const saved = deps.defaultModel.currentSelection();
          if (
            saved.provider !== route.provider ||
            saved.model !== route.model ||
            saved.reasoningEffort !== route.reasoningEffort
          ) {
            restore();
            return invalidInput('Profile default model was not saved; open native model settings');
          }
          const groupRevision =
            reserved?.revision ??
            (groups === undefined || previous === undefined
              ? undefined
              : nextGroup !== undefined
                ? previous.revision
                : previous.groupId === undefined
                  ? undefined
                  : groups.setDefaultGroup(undefined, previous.revision).revision);
          if (slug === undefined)
            return {
              ok: true,
              value: {
                revision: savedDefaultRevision,
                ...(groupRevision === undefined ? {} : { groupRevision }),
              },
            };
          return this.modelPlanInherit({ slug, expectedRevision: revision });
        }
        if (slug === undefined) return invalidInput('Choose a Bot for an individual model');
        requireRoutes(slug, [route]);
        const result = deps.registry.setModelPlan(
          slug,
          {
            orchestrator: route,
            assignmentDefault: route,
            assignmentModels: [
              {
                provider: route.provider,
                model: route.model,
                allowedEfforts: [route.reasoningEffort ?? ''],
                defaultEffort: route.reasoningEffort ?? '',
              },
            ],
          },
          revision as number,
        );
        if (!result.ok) return invalidInput('Bot model changed; reopen before saving');
        return {
          ok: true,
          value: { revision: result.record.modelPlan!.revision },
        };
      } catch (error) {
        if ((error as { code?: string }).code === 'SETTINGS_CONFLICT')
          return {
            ok: false,
            error: {
              code: 'stale-setting',
              message: 'Host default model changed; read it again before saving',
            },
          };
        if (error instanceof RoutingGroupError) return routingGroupFailure(error);
        if (error instanceof TeamError) return modelFailure(error);
        return invalidInput(error instanceof Error ? error.message : 'Model unavailable');
      }
    },
    async channelRetry(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      const recovery = source['recovery'];
      const failureMessageId = asNonBlank(source, 'failureMessageId');
      if (
        recovery !== undefined &&
        recovery !== 'continue' &&
        recovery !== 'compact' &&
        recovery !== 'new-session'
      )
        return invalidInput('recovery must be continue, compact or new-session');
      if (!channelId || !messageId || !deps.runtime?.retryDmMessage)
        return invalidInput('Original message is required');
      try {
        if (recovery !== undefined) {
          if (!failureMessageId || !deps.runtime.recoverDmMessage)
            return invalidInput('Original failure message is required');
          const failure = deps.channels.message(channelId, failureMessageId)?.sessionFailure;
          if (failure?.requestMessageId !== messageId)
            return invalidInput('Failure does not belong to this message');
          await deps.runtime.recoverDmMessage(
            {
              channelId,
              failureMessageId,
              action: recovery,
              compact: async (sessionId) => {
                const result = await deps.idleCompaction?.compactReservedSession?.(sessionId);
                return result?.outcome === 'compacted';
              },
            },
            human,
          );
        } else await deps.runtime.retryDmMessage(channelId, messageId, human);
        return { ok: true, value: { accepted: true } };
      } catch (error) {
        if (error instanceof SessionRecoveryError)
          return {
            ok: false,
            error: { code: error.code, message: error.message },
          };
        return invalidInput(error instanceof Error ? error.message : 'Retry unavailable');
      }
    },
    async botNewSession(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.runtime?.startFreshOrchestrator === undefined) return unavailable();
      try {
        const outcome = await deps.runtime.startFreshOrchestrator(slug);
        if (outcome === 'busy')
          return {
            ok: false,
            error: {
              code: 'bot-busy',
              message: 'Stop the Bot before starting a fresh Session',
            },
          };
        return { ok: true, value: { started: true } };
      } catch {
        return {
          ok: false,
          error: {
            code: 'session-reset-failed',
            message: 'Could not start a fresh Session',
          },
        };
      }
    },
    async botCompact(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.idleCompaction?.compactBot === undefined) return unavailable();
      try {
        const result = await deps.idleCompaction.compactBot(slug);
        if (result.outcome === 'busy')
          return {
            ok: false,
            error: {
              code: 'bot-busy',
              message: 'Stop the Bot before compacting its Session',
            },
          };
        return { ok: true, value: result };
      } catch (error) {
        if (error instanceof SessionRecoveryError)
          return {
            ok: false,
            error: { code: error.code, message: error.message },
          };
        return {
          ok: false,
          error: {
            code: 'compaction-failed',
            message: 'Could not compact the Session',
          },
        };
      }
    },
    async botContext(payload) {
      const slug = asSlug(payload);
      if (!slug) return invalidInput('slug is required');
      if (!deps.registry.get(slug)) return unknownBot(slug);
      if (!deps.botContext) return unavailable();
      try {
        return { ok: true, value: await deps.botContext(slug) };
      } catch {
        return unavailable();
      }
    },
    botSystemPrompt,
    async channelBotStop(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const botSlug = asNonBlank(source, 'botSlug');
      if (!channelId || !botSlug) return invalidInput('channelId and botSlug are required');
      const channel = deps.channels.get(channelId);
      if (channel === undefined || channel.deletedAt) return unknownChannel(channelId);
      const bot = deps.registry.get(botSlug);
      if (bot === undefined) return unknownBot(botSlug);
      if (!botInChannel(channel, botSlug))
        return invalidInput(`${bot.displayName} is not in this Channel`);
      const stopped = await stopBotSessions(source, botSlug, channelId);
      if (!stopped.ok) return stopped;
      if (stopped.value.messageId === undefined)
        return {
          ok: false,
          error: {
            code: 'not-working',
            message: `${bot.displayName} is not working right now`,
          },
        };
      const sessionId =
        stopped.value.stopped.find((ref) => ref.role === 'orchestrator')?.sessionId ??
        stopped.value.stopped[0]!.sessionId;
      return {
        ok: true,
        value: {
          stopped: { botSlug, sessionId, messageId: stopped.value.messageId },
        },
      };
    },
    async botStop(payload) {
      const source = asObject(payload);
      const botSlug = asNonBlank(source, 'botSlug');
      if (!botSlug) return invalidInput('botSlug is required');
      if (deps.registry.get(botSlug) === undefined) return unknownBot(botSlug);
      const channelId = asNonBlank(source, 'channelId');
      if (source['channelId'] !== undefined && channelId === undefined)
        return invalidInput('channelId must be a Channel id');
      if (channelId !== undefined) {
        const channel = deps.channels.get(channelId);
        if (channel === undefined || channel.deletedAt) return unknownChannel(channelId);
      }
      return stopBotSessions(source, botSlug, channelId);
    },
    async sessionMessageSend(payload) {
      const source = asObject(payload);
      const botSlug = asNonBlank(source, 'botSlug');
      const sessionId = asNonBlank(source, 'sessionId');
      const text = typeof source['text'] === 'string' ? source['text'] : undefined;
      if (!botSlug || !sessionId || text === undefined || text.trim() === '')
        return invalidInput('botSlug, sessionId and a non-blank text are required');
      if (deps.registry.get(botSlug) === undefined) return unknownBot(botSlug);
      if (deps.runtime?.sendOrchestratorMessage === undefined) return unavailable();
      const outcome = deps.runtime.sendOrchestratorMessage(human, {
        botSlug,
        sessionId,
        text,
      });
      if (!outcome.delivered)
        return {
          ok: false,
          error: {
            code: outcome.reason === 'not-current-orchestrator' ? 'invalid-input' : 'unavailable',
            message:
              outcome.reason === 'not-current-orchestrator'
                ? "Only the Bot's current Orchestrator Session accepts a direct message"
                : `The message was not delivered: ${outcome.reason}`,
          },
        };
      void outcome.settled.catch(() => undefined);
      return { ok: true, value: { sourceEventId: outcome.sourceEventId } };
    },
    async sessionStop(payload) {
      const source = asObject(payload);
      const botSlug = asNonBlank(source, 'botSlug');
      const activityId = asNonBlank(source, 'activityId');
      if (!botSlug || (source['sessionId'] === undefined) === (activityId === undefined))
        return invalidInput('botSlug and exactly one of sessionId or activityId are required');
      const bot = deps.registry.get(botSlug);
      if (bot === undefined) return unknownBot(botSlug);
      const channelId = asNonBlank(source, 'channelId');
      if (source['channelId'] !== undefined && channelId === undefined)
        return invalidInput('channelId must be a Channel id');
      if (deps.runtime?.stopSession === undefined) return unavailable();
      const sessionId =
        activityId === undefined
          ? asNonBlank(source, 'sessionId')
          : deps.states.sessionIdForActivity(botSlug, activityId);
      if (activityId !== undefined && sessionId === undefined)
        return { ok: true, value: { stopped: [], alreadyIdle: [] } };
      if (!sessionId) return invalidInput('sessionId must be a Session id');
      const outcome = await deps.runtime.stopSession(botSlug, sessionId);
      if (outcome.outcome === 'refused')
        return {
          ok: false,
          error: { code: outcome.code, message: outcome.message },
        };
      const ref = outcome.stopped[0];
      const channel = channelId === undefined ? undefined : deps.channels.get(channelId);
      const related =
        ref !== undefined &&
        channel !== undefined &&
        !channel.deletedAt &&
        (ref.role === 'orchestrator'
          ? botInChannel(channel, botSlug)
          : (deps.runtime.listChannelAssignments?.(channel.id) ?? []).some(
              (assignment) => assignment.sessionId === ref.sessionId,
            ));
      const title =
        ref?.role === 'assignment'
          ? deps.runtime.getAssignment(botSlug, ref.sessionId)?.title
          : undefined;
      const messageId = related
        ? await appendStopNotice(channel!.id, bot.slug, bot.displayName, ref.sessionId, {
            scope: 'session',
            role: ref.role,
            sessionId: ref.sessionId,
            ...(title ? { title } : {}),
          })
        : undefined;
      return {
        ok: true,
        value: {
          stopped: outcome.stopped,
          alreadyIdle: outcome.alreadyIdle,
          ...(messageId === undefined ? {} : { messageId }),
        },
      };
    },
    ...modelSettings,
    dataResetPreview() {
      if (deps.dataReset === undefined) return unavailable();
      try {
        return { ok: true, value: { preview: deps.dataReset.preview() } };
      } catch (error) {
        return dataResetFailure(error);
      }
    },
    dataResetConfirm(payload) {
      const token = asObject(payload)['token'];
      if (typeof token !== 'string' || token.length === 0 || token.length > 256)
        return invalidInput('token is required');
      if (deps.dataReset === undefined) return unavailable();
      try {
        return { ok: true, value: { reset: deps.dataReset.confirm(token) } };
      } catch (error) {
        return dataResetFailure(error);
      }
    },
    deletionPreview(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.deletions === undefined) return unavailable();
      try {
        if (deps.tob?.isTob(slug))
          return {
            ok: false,
            error: { code: 'protected-bot', message: 'Tob cannot be deleted' },
          };
        return { ok: true, value: { preview: deps.deletions.preview(slug) } };
      } catch (error) {
        return invalidInput(
          error instanceof Error ? error.message : 'Deletion preview unavailable',
        );
      }
    },
    async deletionConfirm(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      if (
        slug === undefined ||
        typeof source['token'] !== 'string' ||
        typeof source['eraseMemory'] !== 'boolean'
      )
        return invalidInput('Explicit deletion scope is required');
      if (deps.deletions === undefined) return unavailable();
      try {
        if (deps.tob?.isTob(slug))
          return {
            ok: false,
            error: { code: 'protected-bot', message: 'Tob cannot be deleted' },
          };
        const result = deps.deletions.confirm(slug, source['token'], source['eraseMemory']);
        deps.computerAccess?.changed(slug);
        deps.browserAccess?.changed(slug);
        return { ok: true, value: { deletion: await result } };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : 'Deletion unavailable');
      }
    },
    async deletionRetry(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.deletions === undefined) return unavailable();
      try {
        return {
          ok: true,
          value: { deletion: await deps.deletions.retry(slug) },
        };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : 'Deletion retry unavailable');
      }
    },
    deletionMemoryFolder(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.deletions === undefined) return unavailable();
      try {
        return { ok: true, value: { target: deps.deletions.folder(slug) } };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : 'Memory folder unavailable');
      }
    },
    ...modelPlan,
    list(payload) {
      const activity = new Map(deps.channels.latestBotActivity?.(human));
      for (const [slug, at] of deps.runtime?.latestAssignmentActivity?.() ?? [])
        activity.set(slug, Math.max(activity.get(slug) ?? 0, at));
      const query = asQuery(payload)?.trim().toLowerCase();
      const bots = deps.registry
        .listHistorical()
        .filter((record) => {
          if (query === undefined || query.length === 0) return true;
          const roles = record.roles ?? (record.tag === undefined ? [] : [record.tag]);
          return (
            record.displayName.toLowerCase().includes(query) ||
            roles.some((role) => role.toLowerCase().includes(query))
          );
        })
        .map((record) => ({
          ...summarize(record, deps.states.snapshot(record.slug), deps.tob?.isTob(record.slug)),
          ...runnerOf(record.slug),
          ...(deps.team ? { modelAllowed: allowed(record) } : {}),
          ownerHumanId: botOwner(record),
          owner: botOwner(record) === human.humanId,
          ...(botOwner(record) === human.humanId && activity.has(record.slug)
            ? { lastActivityAt: activity.get(record.slug)! }
            : {}),
          ...(deps.registry.get(record.slug) === undefined
            ? {
                deleted: true,
                paused: true,
                primaryColor: historicalBotPrimaryColor(record.slug, record.primaryColor),
              }
            : {}),
        }));
      const shared =
        deps.team?.bots
          .sharedRoster(human)
          .filter(
            (bot) =>
              !query ||
              bot.displayName.toLowerCase().includes(query) ||
              bot.slug.toLowerCase().includes(query),
          )
          .map((bot) => ({ ...bot, ...runnerOf(bot.slug) })) ?? [];
      return { ok: true, value: { bots: [...bots, ...shared] } };
    },
    channelActivityToday() {
      if (deps.channels.humanMessageCounts === undefined)
        return {
          ok: false,
          error: {
            code: 'storage-unavailable',
            message: 'Channel activity query unavailable',
          },
        };
      return {
        ok: true,
        value: channelActivityToday(
          human,
          deps.channels,
          (slug) => deps.registry.get(slug)?.displayName,
        ),
      };
    },
    activityOverview() {
      if (deps.humanAttention === undefined) return unavailable();
      const actionSummary = deps.humanAttention.actionSummary(human);
      const actionBots = new Set(actionSummary.botSlugs);
      const running = deps.runningSessionIds?.() ?? new Set<string>();
      const bots = deps.registry.list().map((bot) => {
        const snapshot = deps.states.snapshot(bot.slug);
        const activity = deps.states.activity(bot.slug);
        const assignments = new Map(
          (deps.runtime?.listAssignments(bot.slug) ?? []).map((item) => [item.sessionId, item]),
        );
        const sessions: ActivityOverview['bots'][number]['sessions'] = [];
        for (const root of deps.ownership
          .rootsFor(bot.slug)
          .sort(
            (left, right) =>
              Number(right.rootRole === 'orchestrator') -
                Number(left.rootRole === 'orchestrator') ||
              left.createdAt.localeCompare(right.createdAt) ||
              left.sessionId.localeCompare(right.sessionId),
          )) {
          if (root.parentSessionId !== undefined) continue;
          const assignment = assignments.get(root.sessionId);
          const state = snapshot.sessions[root.sessionId] ?? 'done';
          if (!running.has(root.sessionId)) continue;
          if (state === 'thinking' || state === 'working')
            sessions.push({
              sessionId: root.sessionId,
              role: root.rootRole,
              state,
              ...(assignment === undefined
                ? {}
                : {
                    title: assignment.title,
                    description: assignment.description,
                  }),
            });
        }
        return {
          slug: bot.slug,
          displayName: bot.displayName,
          ...(bot.appearance === undefined ? {} : { appearance: bot.appearance }),
          ...(bot.avatarSeed === undefined ? {} : { avatarSeed: bot.avatarSeed }),
          ...(bot.avatar === undefined
            ? {}
            : {
                avatar: bot.avatar.startsWith('data:image/')
                  ? botAvatarUrl(bot.slug, bot.avatar)
                  : bot.avatar,
              }),
          paused: bot.paused === true,
          state: snapshot.state,
          ...(snapshot.attention === undefined ? {} : { attention: snapshot.attention }),
          ...(activity === undefined ? {} : { activity }),
          hasAction: actionBots.has(bot.slug),
          sessions,
        };
      });
      return { ok: true, value: { actionCount: actionSummary.count, bots } };
    },
    activitySnapshot() {
      return {
        ok: true,
        value: personaBotActivitySnapshot(
          deps.registry.list().map((bot) => bot.slug),
          deps.states,
        ),
      };
    },
    get(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) {
        return invalidInput('slug is required');
      }
      const record = deps.registry.get(slug);
      if (record === undefined) return unknownBot(slug);
      try {
        requireOwnedBot(slug);
      } catch (error) {
        return modelFailure(error);
      }
      const bot = detailOf(record).bot;
      const memoryDir = deps.registry.memoryDirFor(slug);
      return {
        ok: true,
        value: {
          bot: {
            ...bot,
            ...(deps.team ? { modelAllowed: allowed(record) } : {}),
            ...(memoryDir === undefined ? {} : { memoryDir }),
          },
          profileFingerprint: botProfileFingerprint(record),
        },
      };
    },
    create(payload) {
      const parsed = parseCreation(payload);
      if (!parsed.ok) return parsed;
      const { input, operationKey } = parsed.value;
      if (deps.creations !== undefined) {
        try {
          const created = deps.creations.create(input, operationKey);
          return {
            ok: true,
            value: {
              ...detailOf(created.record),
              channelId: created.channelId,
              ...(created.receipt === undefined ? {} : { receipt: created.receipt }),
            },
          };
        } catch (error) {
          if (error instanceof BotCreationError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      if (operationKey !== undefined)
        return {
          ok: false,
          error: {
            code: 'creation-unavailable',
            message: 'Idempotent creation is unavailable on this Host.',
          },
        };
      const slug = createBotId();
      const result = deps.registry.create({ ...input, slug });
      if (!result.ok) return createFailure(slug, result);
      return { ok: true, value: detailOf(result.record) };
    },
    createLookup(payload) {
      const parsed = parseCreation(payload);
      if (!parsed.ok) return parsed;
      const { input, operationKey } = parsed.value;
      if (operationKey === undefined) return invalidInput('operationKey is required');
      if (deps.creations === undefined)
        return {
          ok: false,
          error: {
            code: 'creation-unavailable',
            message: 'Idempotent creation is unavailable on this Host.',
          },
        };
      try {
        return {
          ok: true,
          value: {
            receipt: deps.creations.lookup(operationKey, input) ?? null,
          },
        };
      } catch (error) {
        if (error instanceof BotCreationError)
          return {
            ok: false,
            error: { code: error.code, message: error.message },
          };
        throw error;
      }
    },
    ...marketplaceZip,
    botImportLookup(payload) {
      const source = asObject(payload);
      const displayName = source['displayName'];
      const gitUrl = source['gitUrl'];
      const expectedCommit = source['expectedCommit'];
      const operationKey = source['operationKey'];
      const roles = parseRoles(source);
      const description = parseOptional(source, 'description');
      if (
        typeof displayName !== 'string' ||
        !displayName.trim() ||
        typeof gitUrl !== 'string' ||
        typeof expectedCommit !== 'string' ||
        typeof operationKey !== 'string' ||
        !roles.ok ||
        !description.ok
      )
        return invalidInput('Stable Git lookup needs its complete original input');
      const imports =
        deps.imports ??
        (deps.creations
          ? createBotImports(deps.creations, deps.warn === undefined ? {} : { log: deps.warn })
          : undefined);
      if (!imports)
        return {
          ok: false,
          error: {
            code: 'creation-unavailable',
            message: 'Import recovery is unavailable on this Host.',
          },
        };
      try {
        const input = imports.gitInput({
          displayName,
          gitUrl,
          expectedCommit,
          ...(roles.value === undefined ? {} : { roles: roles.value }),
          ...(description.value === undefined ? {} : { description: description.value }),
        });
        return {
          ok: true,
          value: { receipt: imports.lookup(operationKey, input) ?? null },
        };
      } catch (error) {
        if (error instanceof BotCreationError)
          return {
            ok: false,
            error: { code: error.code, message: error.message },
          };
        throw error;
      }
    },
    async botImportPreview(payload) {
      const gitUrl = asObject(payload)['gitUrl'];
      if (typeof gitUrl !== 'string') return invalidInput('gitUrl is required');
      const imports =
        deps.imports ??
        (deps.creations
          ? createBotImports(deps.creations, deps.warn === undefined ? {} : { log: deps.warn })
          : undefined);
      if (!imports) return unavailable();
      try {
        return { ok: true, value: await imports.previewGit(gitUrl) };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error instanceof BotCreationError ? error.code : 'import-unavailable',
            message: 'The selected source could not be inspected.',
          },
        };
      }
    },
    async createFromGit(payload) {
      const source = asObject(payload);
      const displayName = source['displayName'];
      const gitUrl = source['gitUrl'];
      if (typeof displayName !== 'string' || displayName.trim().length === 0) {
        return invalidInput('displayName is required');
      }
      if (typeof gitUrl !== 'string' || gitUrl.trim().length === 0) {
        return invalidInput('gitUrl is required');
      }
      const roles = parseRoles(source);
      const description = parseOptional(source, 'description');
      if (!roles.ok || !description.ok) return invalidInput('invalid create payload');
      const listingId = source['listingId'];
      if (
        listingId !== undefined &&
        (typeof listingId !== 'string' ||
          listingId.trim().length === 0 ||
          source['origin'] !== 'marketplace')
      )
        return invalidInput('listingId needs origin marketplace');
      if (source['operationKey'] !== undefined) {
        const imports =
          deps.imports ??
          (deps.creations
            ? createBotImports(deps.creations, deps.warn === undefined ? {} : { log: deps.warn })
            : undefined);
        if (
          !imports ||
          typeof source['operationKey'] !== 'string' ||
          typeof source['expectedCommit'] !== 'string'
        )
          return invalidInput('Stable Git import needs operationKey and expectedCommit');
        try {
          const input = imports.gitInput({
            gitUrl,
            expectedCommit: source['expectedCommit'],
            displayName,
            ...(roles.value === undefined ? {} : { roles: roles.value }),
            ...(description.value === undefined ? {} : { description: description.value }),
          });
          const created = await imports.create(source['operationKey'], input);
          if (listingId !== undefined) sendReceipt(listingId.trim());
          return {
            ok: true,
            value: {
              ...detailOf(created.record),
              receipt: created.receipt!,
              channelId: created.channelId,
              source: input.source,
              ...(created.httpsFallback === undefined
                ? {}
                : { httpsFallback: created.httpsFallback }),
            },
          };
        } catch (error) {
          if (error instanceof BotCreationError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      const slug = createBotId();
      const result = await deps.registry.createFromGit({
        slug,
        displayName,
        gitUrl,
        ...(typeof source['expectedCommit'] === 'string'
          ? { expectedCommit: source['expectedCommit'] }
          : {}),
        ...(roles.value === undefined ? {} : { roles: roles.value }),
        ...(description.value === undefined ? {} : { description: description.value }),
      });
      if (!result.ok) return createFailure(slug, result);
      if (listingId !== undefined) sendReceipt(listingId.trim());
      if (source['origin'] === 'marketplace') {
        try {
          deps.telemetry?.capture?.('marketplace:bot_install');
        } catch {}
      }
      return {
        ok: true,
        value: {
          ...detailOf(result.record),
          ...(result.httpsFallback === undefined ? {} : { httpsFallback: result.httpsFallback }),
        },
      };
    },
    ...marketplaceReads,
    releaseInfo(payload) {
      if (deps.release === undefined) return releaseUnavailable();
      const since = asObject(payload)['since'];
      if (since !== undefined && typeof since !== 'string') return invalidInput('invalid since');
      return { ok: true, value: deps.release.info(since) };
    },
    async releaseUpdate(payload) {
      if (deps.release === undefined) return releaseUnavailable();
      const force = asObject(payload)['force'];
      if (force !== undefined && typeof force !== 'boolean') return invalidInput('invalid force');
      return { ok: true, value: await deps.release.update(force) };
    },
    async releaseInstall(payload) {
      if (deps.release === undefined) return releaseUnavailable();
      const source = asObject(payload);
      const version = source['version'];
      const requestId = source['requestId'];
      if (typeof version !== 'string') return invalidInput('version is required');
      if (requestId !== undefined && !isUpdateRequestId(requestId))
        return invalidInput('invalid requestId');
      return {
        ok: true,
        value: await deps.release.install(version, undefined, requestId),
      };
    },
    async releaseRestart() {
      if (deps.release === undefined) return releaseUnavailable();
      return { ok: true, value: await deps.release.restart() };
    },
    async pluginUpdates(payload) {
      if (deps.plugins === undefined) return releaseUnavailable();
      const force = asObject(payload)['force'];
      if (force !== undefined && typeof force !== 'boolean') return invalidInput('invalid force');
      return { ok: true, value: await deps.plugins.list(force) };
    },
    async pluginInstall(payload) {
      if (deps.plugins === undefined) return releaseUnavailable();
      const source = asObject(payload);
      const name = source['name'];
      const version = source['version'];
      if (typeof name !== 'string') return invalidInput('name is required');
      const requestId = source['requestId'];
      if (typeof version !== 'string') return invalidInput('version is required');
      if (requestId !== undefined && !isUpdateRequestId(requestId))
        return invalidInput('invalid requestId');
      return {
        ok: true,
        value: await deps.plugins.install(name, version, undefined, requestId),
      };
    },
    async pluginRestart() {
      if (deps.plugins === undefined) return releaseUnavailable();
      return { ok: true, value: await deps.plugins.restart() };
    },
    updateRun(payload) {
      if (deps.updates === undefined) return releaseUnavailable();
      const id = asObject(payload)['id'];
      if (id !== undefined && !isUpdateRequestId(id)) return invalidInput('invalid id');
      return { ok: true, value: deps.updates.get(id) ?? null };
    },
    async updateCancel(payload) {
      if (deps.updates === undefined) return releaseUnavailable();
      const id = asObject(payload)['id'];
      if (!isUpdateRequestId(id)) return invalidInput('id is required');
      return { ok: true, value: await deps.updates.cancel(id) };
    },
    telemetryStatus() {
      return {
        ok: true,
        value: deps.telemetry?.status() ?? {
          enabled: false,
          preference: false,
        },
      };
    },
    gitStatus() {
      return { ok: true, value: deps.git?.status() ?? unmanagedGitStatus() };
    },
    gitInstall() {
      return { ok: true, value: deps.git?.install() ?? unmanagedGitStatus() };
    },
    telemetrySet(payload) {
      const enabled = asObject(payload)['enabled'];
      if (typeof enabled !== 'boolean') return invalidInput('enabled is required');
      if (deps.telemetry === undefined) return telemetryUnavailable();
      try {
        return { ok: true, value: deps.telemetry.setPreference(enabled) };
      } catch {
        return {
          ok: false,
          error: {
            code: 'telemetry-persist-failed',
            message: 'The usage statistics choice could not be saved',
          },
        };
      }
    },
    ...marketplaceSharing,
    update(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      const patchOrUndefined = asObject(payload)['patch'];
      if (typeof patchOrUndefined !== 'object' || patchOrUndefined === null) {
        return invalidInput('patch is required');
      }
      const source = patchOrUndefined as Record<string, unknown>;
      const displayName = parseOptional(source, 'displayName');
      const roles = parseRoles(source);
      const description = parseOptional(source, 'description');
      const model = parseOptional(source, 'model');
      const preset = parseOptional(source, 'preset');
      const workspaces = parseWorkspaces(source);
      const avatar = parseOptional(source, 'avatar');
      if (
        !displayName.ok ||
        !roles.ok ||
        !description.ok ||
        !model.ok ||
        !preset.ok ||
        !workspaces.ok ||
        !avatar.ok
      ) {
        return invalidInput('invalid update payload');
      }
      if (
        (roles.value !== undefined &&
          (roles.value.length > MAX_DESCRIPTOR_TAGS ||
            roles.value.some((tag) => [...tag.trim()].length > MAX_DESCRIPTOR_TAG_LENGTH))) ||
        (description.value !== undefined &&
          [...description.value.trim()].length > MAX_DESCRIPTOR_BIO_LENGTH)
      ) {
        return invalidInput('tags or bio exceed the profile limits');
      }
      const patch: PersonaBotPatch = {
        ...(displayName.value === undefined ? {} : { displayName: displayName.value }),
        ...(roles.value === undefined ? {} : { roles: roles.value }),
        ...(description.value === undefined ? {} : { description: description.value }),
        ...(model.value === undefined ? {} : { model: model.value }),
        ...(preset.value === undefined ? {} : { preset: preset.value }),
        ...(workspaces.value === undefined ? {} : { workspaces: workspaces.value }),
        ...(avatar.value === undefined ? {} : { avatar: avatar.value }),
      };
      const presetSettingsError =
        preset.value !== undefined && preset.value.trim().length > 0
          ? deps.botModes?.settings.readError()
          : undefined;
      if (presetSettingsError !== undefined)
        return {
          ok: false,
          error: { code: 'settings-unreadable', message: presetSettingsError },
        };
      const allowedModes = deps.botModes?.settings.allowedModes(slug);
      if (
        preset.value !== undefined &&
        preset.value.trim().length > 0 &&
        allowedModes !== undefined &&
        !allowedModes.includes(preset.value.trim())
      )
        return {
          ok: false,
          error: {
            code: 'mode-not-allowed',
            message: `Mode ${preset.value.trim()} is not in this Bot's mode template; choose one of ${allowedModes.join(', ')} or change the template.`,
          },
        };
      const expectedProfile = asObject(payload)['expectedProfile'];
      if (expectedProfile !== undefined) {
        if (typeof expectedProfile !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedProfile))
          return invalidInput('expectedProfile must be an observed profile fingerprint');
        const current = deps.registry.get(slug);
        if (!current) return unknownBot(slug);
        if (botProfileFingerprint(current) !== expectedProfile)
          return {
            ok: false,
            error: {
              code: 'stale-profile',
              message: 'The Bot profile changed. Read it again before applying this update.',
            },
          };
      }
      const result = deps.registry.update(slug, patch);
      if (!result.ok) {
        return result.reason === 'not-found'
          ? unknownBot(slug)
          : invalidInput('invalid update payload');
      }
      return { ok: true, value: detailOf(result.record) };
    },
    pause(payload) {
      return setPaused(payload, true);
    },
    resume(payload) {
      return setPaused(payload, false);
    },
    ...computerMethods,
    ...browserMethods,
    approvalTemplates: approvalsMethods.approvalTemplates,
    approvalTemplateCreate: approvalsMethods.approvalTemplateCreate,
    approvalTemplateUpdate: approvalsMethods.approvalTemplateUpdate,
    ...promptPresets,
    approvalTemplateDeletePreview: approvalsMethods.approvalTemplateDeletePreview,
    approvalTemplateDelete: approvalsMethods.approvalTemplateDelete,
    approvalTemplateGlobalSet: approvalsMethods.approvalTemplateGlobalSet,
    botApprovalTemplateSet: approvalsMethods.botApprovalTemplateSet,
    approvalReviewerModel: approvalsMethods.approvalReviewerModel,
    approvalReviewerModelSet: approvalsMethods.approvalReviewerModelSet,
    idleCompaction() {
      if (deps.idleCompaction === undefined) return unavailable();
      return { ok: true, value: idleCompactionView(deps.idleCompaction) };
    },
    idleCompactionSet(payload) {
      if (deps.idleCompaction === undefined) return unavailable();
      const enabled = asObject(payload)['enabled'];
      if (typeof enabled !== 'boolean') return invalidInput('enabled must be true or false');
      try {
        deps.idleCompaction.settings.setEnabled(enabled);
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
      if (enabled) deps.idleCompaction.rescan();
      return { ok: true, value: idleCompactionView(deps.idleCompaction) };
    },
    idleCompactionCacheLifetimeSet(payload) {
      if (deps.idleCompaction === undefined) return unavailable();
      const object = asObject(payload);
      const provider = asNonBlank(object, 'provider');
      const model = asNonBlank(object, 'model');
      const lifetime = object['seconds'];
      if (provider === undefined || model === undefined)
        return invalidInput('provider and model are required');
      if (lifetime !== null && !isCacheLifetimeSeconds(lifetime))
        return invalidInput(
          `seconds must be a whole number from 0 to ${MAX_CACHE_LIFETIME_SECONDS}, or null to resolve it automatically`,
        );
      try {
        deps.idleCompaction.settings.setCacheLifetime({ provider, model }, lifetime);
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
      deps.idleCompaction.rescan();
      return { ok: true, value: idleCompactionView(deps.idleCompaction) };
    },
    compactionThresholdSet(payload) {
      if (deps.idleCompaction === undefined) return unavailable();
      const object = asObject(payload);
      const ratio = object['thresholdRatio'];
      const headroom = object['headroomTokens'];
      if (
        (ratio === undefined && headroom === undefined) ||
        (ratio !== undefined && ratio !== null && !isCompactionThresholdRatio(ratio)) ||
        (headroom !== undefined && headroom !== null && !isCompactionHeadroomTokens(headroom))
      )
        return invalidInput(
          `thresholdRatio (${COMPACTION_THRESHOLD_RATIO.min}-${COMPACTION_THRESHOLD_RATIO.max}) and/or headroomTokens (integer ${COMPACTION_HEADROOM_TOKENS.min}-${COMPACTION_HEADROOM_TOKENS.max}) are required; null restores the default`,
        );
      try {
        deps.idleCompaction.settings.setThreshold({
          ...(ratio === undefined ? {} : { thresholdRatio: ratio as number | null }),
          ...(headroom === undefined ? {} : { headroomTokens: headroom as number | null }),
        });
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
      deps.idleCompaction.applyThreshold?.();
      deps.idleCompaction.rescan();
      return { ok: true, value: idleCompactionView(deps.idleCompaction) };
    },
    standingLimitsSet(payload) {
      const slug = asSlug(payload);
      const object = asObject(payload);
      const limits = { soul: object['soul'], coreMemory: object['coreMemory'] };
      if (slug === undefined || !isStandingLimits(limits)) {
        return invalidInput(
          `slug, soul and coreMemory are required; limits are whole numbers from ${MIN_STANDING_LIMIT} to ${MAX_STANDING_LIMIT}`,
        );
      }
      const result = deps.registry.setStandingLimits(slug, limits);
      if (!result.ok) return unknownBot(slug);
      return { ok: true, value: detailOf(result.record) };
    },
    ...avatarsMethods,
    ping() {
      const version = deps.hostVersion?.();
      return {
        ok: true,
        value: {
          ok: true,
          ...(version === undefined ? {} : { version }),
          minAppVersion: MIN_PHONE_APP_VERSION,
        },
      };
    },
    humanIdentity() {
      return { ok: true, value: deps.channels.humanIdentity(human) };
    },
    composerIdentity() {
      try {
        if (deps.composerIdentity === undefined) throw new Error();
        const identity = deps.composerIdentity(human);
        return {
          ok: true,
          value: { hostId: identity.hostId, profileId: identity.profileId, humanId: human.humanId },
        };
      } catch {
        return {
          ok: false,
          error: {
            code: 'storage-unavailable',
            message: 'Composer recovery identity unavailable',
          },
        };
      }
    },
    composerValidate(payload) {
      const input = z
        .object({
          channelId: z.string(),
          replyTo: z.string().optional(),
          attachments: z.array(z.unknown()).max(10),
          quotes: z
            .array(z.object({ messageId: z.string(), text: z.string().optional() }).strict())
            .max(MAX_CHANNEL_QUOTES)
            .optional(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success || !input.data.attachments.every(isChannelAttachmentRef))
        return invalidInput('invalid composer references');
      const channel = deps.channels.get(input.data.channelId);
      if (
        channel === undefined ||
        (channel.type === 'dm'
          ? channel.botSlug === undefined && !channel.humanParticipants?.includes(human.humanId)
          : !deps.channels
              .listHumanMembers(human, channel.id)
              .some((member) => member.humanId === deps.channels.humanIdentity(human).humanId))
      )
        return invalidInput('Channel is unavailable');
      const visible = (messageId: string) =>
        deps.channels
          .readHumanTimeline(human, channel.id, {
            direction: 'around',
            around: messageId,
            olderLimit: 0,
            newerLimit: 0,
          })
          ?.entries.find((message) => message.id === messageId);
      const reply = input.data.replyTo === undefined ? undefined : visible(input.data.replyTo);
      const quotes = input.data.quotes?.map((quote) => {
        const target = visible(quote.messageId);
        return target === undefined ||
          (target as { contentPurge?: unknown }).contentPurge !== undefined ||
          (quote.text !== undefined && !quoteTextMatches(target.body, quote.text))
          ? null
          : target;
      });
      const attachments = input.data.attachments.map((ref) => {
        try {
          return deps.attachments?.current(ref) ?? null;
        } catch (error) {
          if (
            error instanceof ChannelAttachmentError &&
            ['not-found', 'invalid-ref'].includes(error.code)
          )
            return null;
          throw error;
        }
      });
      return {
        ok: true,
        value: {
          ...(reply === undefined ? {} : { reply }),
          attachments,
          ...(quotes === undefined ? {} : { quotes }),
        },
      };
    },
    humanNameSet(payload) {
      const input = z
        .object({ displayName: z.string().max(128).nullable() })
        .strict()
        .safeParse(payload);
      if (!input.success) return invalidInput('A displayName string or null is required');
      try {
        return {
          ok: true,
          value: deps.channels.setHumanDefaultName(human, input.data.displayName),
        };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
    },
    humanAvatarSet(payload) {
      const input = z
        .object({ avatar: z.string().max(131_072).nullable() })
        .strict()
        .safeParse(payload);
      if (!input.success || (input.data.avatar !== null && !isHumanAvatar(input.data.avatar)))
        return invalidInput('avatar must be a PNG, JPEG or WebP data URL up to 96 KiB, or null');
      return { ok: true, value: deps.channels.setHumanAvatar(human, input.data.avatar) };
    },
    humanProfileSetupFinish(payload) {
      if (!z.object({}).strict().safeParse(payload).success)
        return invalidInput('humanProfileSetupFinish takes no arguments');
      return { ok: true, value: deps.channels.finishHumanProfileSetup(human) };
    },
    humanAvatars(payload) {
      const input = z
        .object({ humanIds: z.array(z.string().min(1).max(128)).max(HUMAN_AVATAR_BATCH) })
        .strict()
        .safeParse(payload);
      if (!input.success)
        return invalidInput(`humanIds must be up to ${HUMAN_AVATAR_BATCH} Human IDs`);
      return {
        ok: true,
        value: { avatars: deps.channels.humanAvatars(human, input.data.humanIds) },
      };
    },
    channelHumanNameSet(payload) {
      const input = z
        .object({
          channelId: z.string(),
          nickname: z.string().max(128).nullable(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success)
        return invalidInput('A channelId and nickname string or null are required');
      try {
        deps.channels.setHumanNickname(human, input.data.channelId, input.data.nickname);
        return {
          ok: true,
          value: {
            channel: channelView(deps.channels.get(input.data.channelId)!),
          },
        };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
    },
    async channels() {
      return {
        ok: true,
        value: { channels: (await listedChannels()).map(listItem) },
      };
    },
    async channelListChanges(payload) {
      const source = asObject(payload);
      const sinceSeq = source['sinceSeq'];
      const epoch = source['epoch'];
      if (!Number.isSafeInteger(sinceSeq) || (sinceSeq as number) < 0)
        return invalidInput('sinceSeq must be a nonnegative integer');
      if (epoch !== undefined && typeof epoch !== 'string')
        return invalidInput('epoch must be a string');
      if (deps.channels.readChangedChannels === undefined)
        return {
          ok: false,
          error: {
            code: 'unavailable',
            message: 'Channel list changes are unavailable',
          },
        };
      const changed = deps.channels.readChangedChannels({
        sinceSeq: sinceSeq as number,
        ...(epoch === undefined ? {} : { epoch }),
      });
      const listed = await listedChannels();
      if (changed.reset === true) return { ok: true, value: changed };
      const ids = new Set(changed.channelIds);
      const present = new Set(listed.map((channel) => channel.id));
      if (
        deps.team &&
        (changed.all ||
          changed.channelIds.some(
            (id) => !present.has(id) && !deps.team!.channelAccess.canKnow(human, id),
          ))
      )
        return { ok: true, value: { reset: true, cursor: changed.cursor } };
      if (
        !isHostOwner() &&
        changed.channelIds.some(
          (id) =>
            !present.has(id) &&
            !deps.channels.get(id) &&
            !deps.channels.hasHumanMembership?.(human, id),
        )
      )
        return { ok: true, value: { reset: true, cursor: changed.cursor } };
      if (
        !isHostOwner() &&
        !deps.channels.hasHumanMembership &&
        changed.channelIds.some((id) => !present.has(id))
      )
        return { ok: true, value: { reset: true, cursor: changed.cursor } };
      return {
        ok: true,
        value: {
          channels: listed
            .filter(
              (channel) => changed.all || ids.has(channel.id) || channel.remoteBot !== undefined,
            )
            .map(listItem),
          removed: changed.channelIds.filter(
            (id) =>
              !present.has(id) &&
              (deps.team
                ? deps.team.channelAccess.canKnow(human, id)
                : human.humanId === OWNER_HUMAN_CONTEXT.humanId ||
                  deps.channels.hasHumanMembership?.(human, id) === true),
          ),
          cursor: changed.cursor,
        },
      };
    },
    channelDm(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      if (slug === undefined) return invalidInput('slug is required');
      if (!isValidSlug(slug)) return invalidInput(`invalid slug: ${slug}`);
      const displayName = parseOptional(source, 'displayName');
      if (!displayName.ok) return invalidInput('invalid channelDm payload');
      const channel = deps.channels.getOrCreateDm(human, slug, displayName.value ?? slug);
      if (channel === undefined) return invalidInput(`invalid slug: ${slug}`);
      return {
        ok: true,
        value: {
          channel: channelView(channel),
        },
      };
    },
    channelGet(payload) {
      const channelId = asNonBlank(asObject(payload), 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      const participantDm = deps.channels.get(channelId);
      if (participantDm?.type === 'dm' && participantDm.humanParticipants?.includes(human.humanId))
        return { ok: true, value: { channel: channelView(participantDm) } };
      if (!isHostOwner()) {
        const channel = deps.channels.get(channelId);
        if (channel === undefined || channel.deletedAt !== undefined)
          return unknownChannel(channelId);
        return {
          ok: true,
          value: {
            channel: channelView(channel),
            ...(channel.type === 'group' && deps.team
              ? deps.team.channelAccess.view(human, channelId)
              : {}),
          },
        };
      }
      if (!deps.channelManagement)
        return {
          ok: false,
          error: {
            code: 'unavailable',
            message: 'Channel management is unavailable',
          },
        };
      try {
        if (deps.team && deps.channels.get(channelId)?.type === 'group') {
          const view = deps.team.channelAccess.view(human, channelId);
          const result = deps.channelManagement.snapshot(channelId);
          const channel = channelView(result.channel);
          if (view.role === 'member') {
            const {
              invitations: _invitations,
              joinRequests: _requests,
              wakePolicies: _policies,
              ...visible
            } = channel;
            return { ok: true, value: { channel: visible, ...view } };
          }
          const members = new Set(channel.members);
          return {
            ok: true,
            value: {
              ...result,
              channel,
              ...view,
              wakePolicies: result.wakePolicies.filter(({ botSlug }) => members.has(botSlug)),
            },
          };
        }
        const result = deps.channelManagement.snapshot(channelId);
        const channel = channelView(result.channel);
        const members = new Set(channel.members);
        return {
          ok: true,
          value: {
            ...result,
            channel,
            wakePolicies: result.wakePolicies.filter(({ botSlug }) => members.has(botSlug)),
          },
        };
      } catch (error) {
        if (error instanceof ChannelManagementError)
          return {
            ok: false,
            error: { code: error.code, message: error.message },
          };
        throw error;
      }
    },
    channelCreate(payload) {
      const source = asObject(payload);
      const name = asNonBlank(source, 'name');
      if (name === undefined) return invalidInput('name is required');
      const members = source['members'];
      if (
        !Array.isArray(members) ||
        !members.every((entry) => typeof entry === 'string' && entry.trim().length > 0)
      ) {
        return invalidInput('members must be an array of PersonaBot IDs');
      }
      const operationKey = source['operationKey'];
      if (operationKey !== undefined && (typeof operationKey !== 'string' || !operationKey.trim()))
        return invalidInput('operationKey must be a nonempty string');
      if (deps.channelManagement) {
        try {
          const result = deps.channelManagement.create(
            human,
            { name, members: [...members] },
            operationKey,
          );
          return {
            ok: true,
            value: { ...result, channel: channelView(result.channel) },
          };
        } catch (error) {
          if (error instanceof ChannelManagementError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      if (operationKey !== undefined)
        return {
          ok: false,
          error: {
            code: 'unavailable',
            message: 'Channel management is unavailable',
          },
        };
      if (members.some((slug) => deps.tob?.isTob(slug)))
        return {
          ok: false,
          error: {
            code: 'protected-bot',
            message: 'Tob cannot join group Channels',
          },
        };
      const channel = deps.channels.createGroup(human, {
        name,
        members: [...members],
      });
      return { ok: true, value: { channel: channelView(channel) } };
    },
    channelRename(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const name = asNonBlank(source, 'name')?.trim();
      if (channelId === undefined) return invalidInput('channelId is required');
      if (name === undefined) return invalidInput('name is required');
      const existing = deps.channels.get(channelId);
      if (existing === undefined) return unknownChannel(channelId);
      const expectedChannel = source['expectedChannel'];
      if (
        expectedChannel !== undefined &&
        (typeof expectedChannel !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedChannel))
      )
        return invalidInput('expectedChannel must be an observed Channel fingerprint');
      if (expectedChannel !== undefined && existing.type !== 'group')
        return {
          ok: false,
          error: {
            code: 'not-group-channel',
            message: 'Group Channel required for reviewed rename',
          },
        };
      if (existing.type === 'group' && deps.channelManagement) {
        try {
          const result = deps.channelManagement.rename(human, {
            channelId,
            name,
            ...(expectedChannel === undefined ? {} : { expectedChannel }),
          });
          return {
            ok: true,
            value: { ...result, channel: channelView(result.channel) },
          };
        } catch (error) {
          if (error instanceof ChannelManagementError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      if (expectedChannel !== undefined) return unavailable();
      if (existing.type === 'dm' && existing.botSlug === undefined)
        return invalidInput('Bot-to-Bot DMs are read-only for Human');

      let bot: PersonaBotDetail | undefined;
      if (existing.type === 'dm' && existing.botSlug !== undefined) {
        if (deps.registry.get(existing.botSlug) === undefined) return unknownBot(existing.botSlug);
        const result = deps.registry.update(existing.botSlug, {
          displayName: name,
        });
        if (!result.ok) return unknownBot(existing.botSlug);
        bot = detailOf(result.record).bot;
      }
      const channel = deps.channels.rename(human, channelId, name);
      if (channel === undefined) return unknownChannel(channelId);
      return {
        ok: true,
        value: {
          channel: channelView(channel),
          ...(bot === undefined ? {} : { bot }),
        },
      };
    },
    channelGroupAvatarSet(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const avatar = source['avatar'];
      if (channelId === undefined || (avatar !== null && !isGroupAvatar(avatar)))
        return invalidInput('valid channelId and Group avatar are required');
      const expectedChannel = source['expectedChannel'];
      if (
        expectedChannel !== undefined &&
        (typeof expectedChannel !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedChannel))
      )
        return invalidInput('expectedChannel must be an observed Channel fingerprint');
      if (deps.channelManagement) {
        try {
          const result = deps.channelManagement.setAvatar(human, {
            channelId,
            avatar,
            ...(expectedChannel === undefined ? {} : { expectedChannel }),
          });
          return {
            ok: true,
            value: { ...result, channel: channelView(result.channel) },
          };
        } catch (error) {
          if (error instanceof ChannelManagementError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      if (expectedChannel !== undefined) return unavailable();
      try {
        return {
          ok: true,
          value: {
            channel: channelView(deps.channels.setGroupAvatar(human, channelId, avatar)),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelGroupInvite(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const botSlug = asNonBlank(source, 'botSlug');
      if (channelId === undefined || botSlug === undefined || !isValidSlug(botSlug))
        return invalidInput('valid channelId and botSlug are required');
      const operationKey = source['operationKey'];
      const expectedChannel = source['expectedChannel'];
      if (operationKey !== undefined && (typeof operationKey !== 'string' || !operationKey.trim()))
        return invalidInput('operationKey must be a nonempty string');
      if (
        expectedChannel !== undefined &&
        (typeof expectedChannel !== 'string' || !expectedChannel.trim())
      )
        return invalidInput('expectedChannel must be a nonempty string');
      if (deps.channelManagement) {
        try {
          const result = deps.channelManagement.invite(
            human,
            {
              channelId,
              botSlug,
              ...(expectedChannel === undefined ? {} : { expectedChannel }),
            },
            operationKey,
          );
          return {
            ok: true,
            value: { ...result, channel: channelView(result.channel) },
          };
        } catch (error) {
          if (error instanceof ChannelManagementError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      if (operationKey !== undefined || expectedChannel !== undefined)
        return {
          ok: false,
          error: {
            code: 'unavailable',
            message: 'Channel management is unavailable',
          },
        };
      if (deps.tob?.isTob(botSlug))
        return {
          ok: false,
          error: {
            code: 'protected-bot',
            message: 'Tob cannot join group Channels',
          },
        };
      const bot = globalRegistry.get(botSlug);
      const channel = deps.channels.get(channelId);
      if (bot === undefined || bot.paused === true) return unknownBot(botSlug);
      if (channel?.type !== 'group') return unknownChannel(channelId);
      const dm = deps.channels.getOrCreateDm(human, bot.slug, bot.displayName);
      if (dm === undefined) return invalidInput('Invitee DM is unavailable');
      try {
        const invitation = deps.channels.inviteGroupBot({
          channelId,
          inviterHuman: true,
          targetBotSlug: bot.slug,
          targetBotCreatedAt: bot.createdAt,
          targetDmChannelId: dm.id,
        });
        deps.runtime?.admitGroupInvitation(dm.id, invitation.id);
        return {
          ok: true,
          value: { channel: channelView(deps.channels.get(channelId)!) },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelGroupInviteCancel(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const invitationId = asNonBlank(source, 'invitationId');
      if (channelId === undefined || invitationId === undefined)
        return invalidInput('channelId and invitationId are required');
      const expectedChannel = source['expectedChannel'];
      if (
        expectedChannel !== undefined &&
        (typeof expectedChannel !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedChannel))
      )
        return invalidInput('expectedChannel must be an observed Channel fingerprint');
      if (deps.channelManagement) {
        try {
          const result = deps.channelManagement.cancelInvite(human, {
            channelId,
            invitationId,
            ...(expectedChannel === undefined ? {} : { expectedChannel }),
          });
          return {
            ok: true,
            value: { ...result, channel: channelView(result.channel) },
          };
        } catch (error) {
          if (error instanceof ChannelManagementError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      if (expectedChannel !== undefined) return unavailable();
      try {
        return {
          ok: true,
          value: {
            channel: channelView(deps.channels.cancelGroupInvite(channelId, invitationId)),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelGroupJoinDecide(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const requestId = asNonBlank(source, 'requestId');
      const accept = source['accept'];
      if (channelId === undefined || requestId === undefined || typeof accept !== 'boolean')
        return invalidInput('channelId, requestId and accept are required');
      const expectedChannel = source['expectedChannel'];
      if (
        expectedChannel !== undefined &&
        (typeof expectedChannel !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedChannel))
      )
        return invalidInput('expectedChannel must be an observed Channel fingerprint');
      if (deps.channelManagement) {
        try {
          const result = deps.channelManagement.decideJoin(human, {
            channelId,
            requestId,
            accept,
            ...(expectedChannel === undefined ? {} : { expectedChannel }),
          });
          return {
            ok: true,
            value: { ...result, channel: channelView(result.channel) },
          };
        } catch (error) {
          if (error instanceof ChannelManagementError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      if (expectedChannel !== undefined) return unavailable();
      const channel = deps.channels.get(channelId);
      const request = channel?.joinRequests?.find((item) => item.id === requestId);
      if (channel?.type !== 'group' || request === undefined)
        return invalidInput('Pending Group join request not found');
      if (accept && deps.tob?.isTob(request.requesterBotSlug))
        return {
          ok: false,
          error: {
            code: 'protected-bot',
            message: 'Tob cannot join group Channels',
          },
        };
      if (request.status !== 'pending')
        return request.status === (accept ? 'accepted' : 'declined')
          ? { ok: true, value: { channel: channelView(channel) } }
          : invalidInput('Group join request is no longer pending');
      const requester = deps.registry.get(request.requesterBotSlug);
      if (
        requester === undefined ||
        requester.paused === true ||
        requester.createdAt !== request.requesterBotCreatedAt
      )
        return invalidInput('Requesting PersonaBot is no longer active');
      const dm = deps.channels.getOrCreateDm(human, requester.slug, requester.displayName);
      if (dm === undefined) return invalidInput('Requester DM is unavailable');
      try {
        const decided = deps.channels.decideGroupJoin({
          channelId,
          requestId,
          accept,
          decidedBy: 'human',
          requesterBotCreatedAt: requester.createdAt,
          requesterDmChannelId: dm.id,
        });
        if (decided.notified) deps.runtime?.admitGroupJoinDecision?.(dm.id, request.id);
        return { ok: true, value: { channel: channelView(decided.channel) } };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelGroupMemberRemove(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const botSlug = asNonBlank(source, 'botSlug');
      if (channelId === undefined || botSlug === undefined || !isValidSlug(botSlug))
        return invalidInput('valid channelId and botSlug are required');
      const expectedChannel = source['expectedChannel'];
      if (
        expectedChannel !== undefined &&
        (typeof expectedChannel !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedChannel))
      )
        return invalidInput('expectedChannel must be an observed Channel fingerprint');
      if (deps.channelManagement) {
        try {
          const result = deps.channelManagement.removeMember(human, {
            channelId,
            botSlug,
            ...(expectedChannel === undefined ? {} : { expectedChannel }),
          });
          return {
            ok: true,
            value: { ...result, channel: channelView(result.channel) },
          };
        } catch (error) {
          if (error instanceof ChannelManagementError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      if (expectedChannel !== undefined) return unavailable();
      try {
        return {
          ok: true,
          value: {
            channel: channelView(deps.channels.removeGroupMember(channelId, botSlug)),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelGroupSendReview(payload) {
      const parsed = z
        .object({
          channelId: z.string().min(1),
          enabled: z.boolean().optional(),
        })
        .strict()
        .safeParse(payload);
      if (!parsed.success) return invalidInput('Invalid send review configuration');
      const { channelId, enabled } = parsed.data;
      const channel = deps.channels.get(channelId);
      if (
        channel?.type !== 'group' ||
        channel.deletedAt ||
        !deps.channels
          .listHumanMembers(human, channelId)
          .some((member) => member.humanId === human.humanId)
      )
        return invalidInput('A local Group with the current Human is required');
      const review = deps.runtime?.groupSendReview;
      if (!review)
        return {
          ok: false,
          error: {
            code: 'unavailable',
            message: 'Group send review is unavailable on this Host',
          },
        };
      if (enabled !== undefined) review.configure(channelId, enabled);
      return { ok: true, value: { enabled: review.enabled(channelId) } };
    },
    channelGroupWakePolicies(payload) {
      const parsed = z.object({ channelId: z.string().min(1) }).safeParse(asObject(payload));
      if (!parsed.success) return invalidInput('invalid Group channel');
      try {
        const channel = deps.channels.get(parsed.data.channelId);
        if (
          channel?.type !== 'group' ||
          channel.deletedAt ||
          !deps.channels
            .listHumanMembers(human, channel.id)
            .some((member) => member.humanId === human.humanId)
        )
          return invalidInput('Group channel unavailable');
        return {
          ok: true,
          value: {
            members: channel.members.map((botSlug) => ({
              botSlug,
              inherited: channel.wakePolicies?.[botSlug] === undefined,
              policy: deps.channels.getGroupWakePolicy(channel.id, botSlug),
              ...(deps.externalMessaging
                ? {
                    externals: messagingDefaultsPlatform.options
                      .filter((platform) => platform !== 'weixin' && platform !== 'qq')
                      .map((platform) => ({
                        platform,
                        ...externalMemberWake(
                          channel,
                          botSlug,
                          deps.sourcePolicy
                            ?.list(botSlug)
                            .find((p) => p.sourceClass === 'group-ordinary'),
                          deps.externalMessaging!.defaults(platform),
                        ),
                      })),
                    external: {
                      platform: 'feishu' as const,
                      ...externalMemberWake(
                        channel,
                        botSlug,
                        deps.sourcePolicy
                          ?.list(botSlug)
                          .find((p) => p.sourceClass === 'group-ordinary'),
                        deps.externalMessaging.defaults(),
                      ),
                    },
                  }
                : {}),
            })),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelGroupWakeSet(payload) {
      const parsed = z
        .object({
          channelId: z.string().min(1),
          botSlug: z.string().min(1),
          mode: z.enum(['all', 'mentions', 'digest', 'silent']),
          count: z.number().int().min(1).max(100),
          intervalSeconds: z.number().int().min(1).max(3600),
          inherit: z.boolean().optional(),
          expectedChannel: z
            .string()
            .regex(/^[a-f0-9]{64}$/u)
            .optional(),
        })
        .safeParse(asObject(payload));
      if (!parsed.success) return invalidInput('invalid Group wake policy');
      const { channelId, botSlug, mode, count, intervalSeconds, inherit, expectedChannel } =
        parsed.data;
      if (deps.channelManagement) {
        try {
          const result = deps.channelManagement.setWake(human, {
            channelId,
            botSlug,
            mode,
            count,
            intervalSeconds,
            ...(inherit === undefined ? {} : { inherit }),
            ...(expectedChannel === undefined ? {} : { expectedChannel }),
          });
          return {
            ok: true,
            value: { ...result, channel: channelView(result.channel) },
          };
        } catch (error) {
          if (error instanceof ChannelManagementError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      if (expectedChannel !== undefined) return unavailable();
      const bot = deps.registry.get(botSlug);
      if (bot === undefined || bot.paused === true) return unknownBot(botSlug);
      try {
        const group = deps.channels.get(channelId);
        if (
          group?.type !== 'group' ||
          group.deletedAt ||
          !deps.channels
            .listHumanMembers(human, channelId)
            .some((member) => member.humanId === human.humanId)
        )
          return invalidInput('Group channel unavailable');
        return {
          ok: true,
          value: {
            channel: channelView(
              deps.channels.setGroupWakePolicy(
                channelId,
                botSlug,
                {
                  mode,
                  count,
                  intervalSeconds,
                  ...(inherit === undefined ? {} : { inherit }),
                },
                { kind: 'human' },
              ),
            ),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelHistory() {
      try {
        if (!deps.contentPurge) return unavailable();
        return { ok: true, value: { channels: deps.contentPurge.history(human) } };
      } catch {
        return unavailable();
      }
    },
    channelHistorySources(payload) {
      const input = z
        .object({
          channelId: z.string().min(1).max(200),
          before: z.string().regex(/^\d+$/u).optional(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return invalidInput('Invalid history scope');
      try {
        if (!deps.contentPurge) return unavailable();
        return {
          ok: true,
          value: deps.contentPurge.sources(human, input.data.channelId, input.data.before),
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error instanceof ContentPurgeError ? error.code : 'purge-unavailable',
            message:
              error instanceof ContentPurgeError ? error.message : 'Channel history is unavailable',
          },
        };
      }
    },
    channelPurgePreview(payload) {
      const input = z
        .object({
          channelId: z.string().min(1).max(200),
          sourceEventIds: z.array(z.string().min(1).max(200)).min(1).max(100),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return invalidInput('Invalid purge scope');
      try {
        if (!deps.contentPurge) return unavailable();
        return {
          ok: true,
          value: deps.contentPurge.preview(human, input.data.channelId, input.data.sourceEventIds),
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error instanceof ContentPurgeError ? error.code : 'purge-unavailable',
            message:
              error instanceof ContentPurgeError ? error.message : 'Purge preview is unavailable',
          },
        };
      }
    },
    storageUsage() {
      if (!deps.storage) return unavailable();
      try {
        return { ok: true, value: deps.storage.usage() };
      } catch (error) {
        return storageFailure(error, 'Storage usage is unavailable', deps.warn);
      }
    },
    storageCleanupPreview(payload) {
      const input = storageCleanupScope.safeParse(payload);
      if (!input.success) return invalidInput('Invalid storage cleanup scope');
      if (!deps.storage) return unavailable();
      try {
        return { ok: true, value: deps.storage.preview(input.data) };
      } catch (error) {
        return storageFailure(error, 'Storage cleanup preview is unavailable', deps.warn);
      }
    },
    storageCleanupConfirm(payload) {
      const input = storageCleanupScope
        .extend({ token: z.string().min(1).max(512) })
        .strict()
        .safeParse(payload);
      if (!input.success) return invalidInput('Invalid storage cleanup confirmation');
      if (!deps.storage) return unavailable();
      const { token, ...scope } = input.data;
      try {
        return { ok: true, value: deps.storage.confirm(scope, token) };
      } catch (error) {
        return storageFailure(error, 'Storage cleanup could not complete', deps.warn);
      }
    },
    storageMessagesCleanupPreview(payload) {
      const input = storageMessagesScope.safeParse(payload);
      if (!input.success) return invalidInput('Invalid message cleanup scope');
      if (!deps.contentPurge) return unavailable();
      try {
        return { ok: true, value: deps.contentPurge.textPreview(human, input.data) };
      } catch (error) {
        return purgeFailure(error, 'Message cleanup preview is unavailable');
      }
    },
    storageMessagesCleanupConfirm(payload) {
      const input = storageMessagesScope
        .extend({ token: z.string().min(1).max(512) })
        .strict()
        .safeParse(payload);
      if (!input.success) return invalidInput('Invalid message cleanup confirmation');
      if (!deps.contentPurge) return unavailable();
      const { token, ...scope } = input.data;
      try {
        return { ok: true, value: deps.contentPurge.textConfirm(human, scope, token) };
      } catch (error) {
        return purgeFailure(error, 'Message cleanup could not complete');
      }
    },
    channelPurgeConfirm(payload) {
      const input = z
        .object({
          channelId: z.string().min(1).max(200),
          sourceEventIds: z.array(z.string().min(1).max(200)).min(1).max(100),
          token: z.string().min(1).max(512),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return invalidInput('Invalid purge confirmation');
      try {
        if (!deps.contentPurge) return unavailable();
        return {
          ok: true,
          value: deps.contentPurge.confirm(
            human,
            input.data.channelId,
            input.data.sourceEventIds,
            input.data.token,
          ),
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error instanceof ContentPurgeError ? error.code : 'purge-unavailable',
            message:
              error instanceof ContentPurgeError
                ? error.message
                : 'Purge could not complete; inspect recovery diagnostics',
          },
        };
      }
    },
    channelGroupDelete(payload) {
      const channelId = asNonBlank(asObject(payload), 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      const purge = deps.contentPurge;
      if (!purge) return unavailable();
      let ended: boolean;
      try {
        ended = purge.history(human).some((channel) => channel.id === channelId);
      } catch (error) {
        return purgeFailure(error, 'Channel history is unavailable');
      }
      if (!ended)
        try {
          deps.channels.deleteGroup(channelId);
          deps.externalMessaging?.inbound.endChannel(channelId);
          void deps.runtime
            ?.endGroup?.(channelId)
            .catch((error: unknown) =>
              deps.warn?.(`botharness.group_disband.stop_turns_failed error=${String(error)}`),
            );
          deps.toolApproval?.cancelChannel(channelId);
          deps.userQuestions?.cancelChannel(channelId);
        } catch (error) {
          return invalidInput(String(error));
        }
      void deps.roster
        .channelForget(channelId)
        .catch((error: unknown) =>
          deps.warn?.(`botharness.group_disband.roster_failed error=${String(error)}`),
        );
      try {
        return {
          ok: true,
          value: { deleted: true, ...purge.disband(human, channelId) },
        };
      } catch (error) {
        return purgeFailure(error, 'The group was disbanded, but its messages were not deleted');
      }
    },
    channelMessages(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      if (deps.channels.get(channelId) === undefined) return unknownChannel(channelId);
      const before = parseOptional(source, 'before');
      if (!before.ok) return invalidInput('invalid channelMessages payload');
      const limitValue = source['limit'];
      let limit: number | undefined;
      if (limitValue !== undefined) {
        if (typeof limitValue !== 'number' || !Number.isInteger(limitValue) || limitValue < 1) {
          return invalidInput('limit must be a positive integer');
        }
        limit = limitValue;
      }
      const cursor = before.value?.trim();
      const messages = deps.channels.readMessages(channelId, {
        ...(cursor === undefined || cursor.length === 0 ? {} : { before: cursor }),
        ...(limit === undefined ? {} : { limit }),
      });
      return {
        ok: true,
        value: { messages, revision: deps.channels.revision(channelId) },
      };
    },
    channelTimeline(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      if (deps.channels.get(channelId) === undefined) return unknownChannel(channelId);
      const parsed = z
        .object({
          direction: z.enum(['older', 'newer', 'around']).optional(),
          cursor: z.string().min(1).max(2048).optional(),
          around: z.string().min(1).optional(),
          limit: z.number().int().min(1).max(200).optional(),
          olderLimit: z.number().int().min(0).max(200).optional(),
          newerLimit: z.number().int().min(0).max(200).optional(),
        })
        .safeParse(source);
      if (!parsed.success) return invalidInput('invalid channelTimeline payload');
      const page = deps.channels.readHumanTimeline(human, channelId, parsed.data);
      if (page === undefined) return invalidInput('invalid or expired timeline anchor');
      return {
        ok: true,
        value: { page, revision: deps.channels.revision(channelId) },
      };
    },
    channelReadPosition(payload) {
      const channelId = asNonBlank(asObject(payload), 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      if (deps.channels.get(channelId) === undefined) return unknownChannel(channelId);
      const position = deps.channels.readPosition(human, channelId);
      return { ok: true, value: position === undefined ? {} : { position } };
    },
    async channelMarkRead(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      if (channelId === undefined || messageId === undefined)
        return invalidInput('channelId and messageId are required');
      if (deps.channels.get(channelId) === undefined) return unknownChannel(channelId);
      const position = await deps.channels.markRead(human, channelId, messageId);
      if (position === undefined) return invalidInput('message does not belong to channel');
      return { ok: true, value: { position } };
    },
    channelReact(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      const emoji = source['emoji'];
      const active = source['active'] ?? true;
      if (channelId === undefined || messageId === undefined)
        return invalidInput('channelId and messageId are required');
      if (!isReactionEmoji(emoji)) return invalidInput('emoji must be a single emoji');
      if (typeof active !== 'boolean') return invalidInput('active must be a boolean');
      const reacted = deps.channels.get(channelId);
      if (reacted === undefined) return unknownChannel(channelId);
      if (
        reacted.type === 'dm' &&
        reacted.botSlug !== undefined &&
        deps.team?.bots.canReach(human, reacted.botSlug) === false
      )
        return invalidInput('message cannot take reactions in this Channel');
      if (deps.channels.setHumanReaction === undefined)
        return {
          ok: false,
          error: {
            code: 'storage-unavailable',
            message: 'reactions are unavailable',
          },
        };
      try {
        const reactions = deps.channels.setHumanReaction(
          human,
          channelId,
          messageId,
          emoji,
          active,
        );
        if (reactions === undefined)
          return invalidInput('message cannot take reactions in this Channel');
        return { ok: true, value: { reactions } };
      } catch (error) {
        if (error instanceof ChannelReactionLimitError) return invalidInput(error.message);
        throw error;
      }
    },
    channelSearch(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const text = source['text'];
      const cursor = source['cursor'];
      const limit = source['limit'];
      if (channelId === undefined) return invalidInput('channelId is required');
      if (typeof text !== 'string' || text.trim().length === 0 || text.length > 200)
        return invalidInput('text must be 1 to 200 characters');
      if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 512))
        return invalidInput('cursor must be the nextCursor of the previous page');
      if (
        limit !== undefined &&
        (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > 50)
      )
        return invalidInput('limit must be an integer from 1 to 50');
      if (deps.channels.get(channelId) === undefined) return unknownChannel(channelId);
      if (deps.channels.searchHumanMessages === undefined)
        return {
          ok: false,
          error: {
            code: 'storage-unavailable',
            message: 'search is unavailable',
          },
        };
      try {
        const page = deps.channels.searchHumanMessages(human, channelId, {
          text,
          limit: limit ?? 20,
          ...(cursor === undefined ? {} : { cursor }),
        });
        if (page === undefined) return unknownChannel(channelId);
        return { ok: true, value: page };
      } catch (error) {
        return invalidInput((error as Error).message.replace(/^channel_read: /u, ''));
      }
    },
    messageSearch(payload) {
      const source = asObject(payload);
      const text = source['text'];
      const cursor = source['cursor'];
      const limit = source['limit'];
      if (typeof text !== 'string' || text.trim().length === 0 || text.length > 200)
        return invalidInput('text must be 1 to 200 characters');
      if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 1024))
        return invalidInput('cursor must be the nextCursor of the previous page');
      if (
        limit !== undefined &&
        (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > 50)
      )
        return invalidInput('limit must be an integer from 1 to 50');
      if (deps.channels.searchAllHumanMessages === undefined)
        return {
          ok: false,
          error: {
            code: 'storage-unavailable',
            message: 'search is unavailable',
          },
        };
      let hidden: string[];
      try {
        hidden = deps.roster.snapshot().hidden;
      } catch (error) {
        if (error instanceof RosterUnavailableError) return unavailable();
        throw error;
      }
      try {
        return {
          ok: true,
          value: deps.channels.searchAllHumanMessages(human, {
            text,
            limit: limit ?? 20,
            excludeChannelIds: hidden,
            ...(cursor === undefined ? {} : { cursor }),
          }),
        };
      } catch (error) {
        return invalidInput((error as Error).message.replace(/^message_search: /u, ''));
      }
    },
    async channelMarkAllRead(payload) {
      const source = asObject(payload);
      const channelId = source['channelId'];
      const botSlug = source['botSlug'];
      if (
        channelId !== undefined &&
        (typeof channelId !== 'string' || !isValidChannelId(channelId))
      )
        return invalidInput('invalid Channel filter');
      if (botSlug !== undefined && (typeof botSlug !== 'string' || !isValidSlug(botSlug)))
        return invalidInput('invalid Bot filter');
      if (channelId !== undefined && deps.channels.get(channelId as string) === undefined)
        return unknownChannel(channelId as string);
      try {
        return {
          ok: true,
          value: await markAllHumanMessagesRead(human, deps.channels, {
            ...(channelId === undefined ? {} : { channelId: channelId as string }),
            ...(botSlug === undefined ? {} : { botSlug: botSlug as string }),
          }),
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    ...skillsMethods,
    channelAllBotPreview(payload) {
      const channelId = asNonBlank(asObject(payload), 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      try {
        return {
          ok: true,
          value: deps.channels.previewAllBotMention(channelId),
        };
      } catch (error) {
        return invalidInput((error as Error).message);
      }
    },
    channelSendStatus(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      if (!channelId || !messageId) return invalidInput('channelId and messageId are required');
      if (deps.channels.get(channelId) === undefined) return unknownChannel(channelId);
      const value = deps.channels.humanSendStatus?.(channelId, messageId);
      return value === undefined ? invalidInput('Unknown Human DM request') : { ok: true, value };
    },
    ...genuiMethods,
    async channelSend(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      const rawBody = source['body'];
      const attachments = source['attachments'];
      if (
        attachments !== undefined &&
        (!Array.isArray(attachments) ||
          attachments.length > MAX_CHANNEL_SEND_ATTACHMENTS ||
          !attachments.every(isChannelAttachmentRef))
      )
        return invalidInput('invalid attachments');
      if (
        typeof rawBody !== 'string' ||
        (rawBody.trim().length === 0 && (!attachments || attachments.length === 0))
      )
        return invalidInput('body is required');
      let body: string = rawBody;
      const rawMentions = source['mentions'];
      if (rawMentions !== undefined && !Array.isArray(rawMentions))
        return invalidInput('mentions must be selected PersonaBot tokens');
      const mentions: ChannelMention[] = [];
      if (Array.isArray(rawMentions)) {
        if (rawMentions.length > 20) return invalidInput('too many mentions');
        for (const item of rawMentions) {
          if (typeof item !== 'object' || item === null)
            return invalidInput('invalid mention token');
          const token = item as Record<string, unknown>;
          const { botSlug, label, start, end } = token;
          if (
            typeof botSlug !== 'string' ||
            !isValidSlug(botSlug) ||
            typeof label !== 'string' ||
            label.length === 0 ||
            typeof start !== 'number' ||
            !Number.isSafeInteger(start) ||
            typeof end !== 'number' ||
            !Number.isSafeInteger(end) ||
            start < 0 ||
            end <= start ||
            typeof body !== 'string' ||
            body.slice(start, end) !== '@' + label
          )
            return invalidInput('invalid mention token');
          mentions.push({ botSlug, label, start, end });
        }
        mentions.sort((a, b) => a.start - b.start);
        if (mentions.some((item, index) => index > 0 && item.start < mentions[index - 1]!.end))
          return invalidInput('overlapping mention tokens');
      }
      const rawAllBotMention = source['allBotMention'];
      let allBotMention: AllBotMention | undefined;
      if (rawAllBotMention !== undefined) {
        try {
          allBotMention = parseAllBotMention(rawAllBotMention, body);
        } catch (error) {
          return invalidInput((error as Error).message);
        }
      }
      const rawRefs = source['channelRefs'];
      if (rawRefs !== undefined && !Array.isArray(rawRefs))
        return invalidInput('channelRefs must be selected #Channel tokens');
      const channelRefs: ChannelReference[] = [];
      if (Array.isArray(rawRefs)) {
        if (rawRefs.length > 20) return invalidInput('too many Channel references');
        for (const item of rawRefs) {
          if (typeof item !== 'object' || item === null)
            return invalidInput('invalid Channel reference token');
          const { channelId: targetId, label, start, end } = item as Record<string, unknown>;
          if (
            typeof targetId !== 'string' ||
            !isValidChannelId(targetId) ||
            typeof label !== 'string' ||
            label.length === 0 ||
            !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(end) ||
            (start as number) < 0 ||
            (end as number) <= (start as number) ||
            body.slice(start as number, end as number) !== '#' + label
          )
            return invalidInput('invalid Channel reference token');
          channelRefs.push({
            channelId: targetId,
            label,
            start: start as number,
            end: end as number,
          });
        }
        channelRefs.sort((a, b) => a.start - b.start);
        if (
          channelRefs.some((item, index) => index > 0 && item.start < channelRefs[index - 1]!.end)
        )
          return invalidInput('overlapping Channel references');
        if (
          channelRefs.some((ref) =>
            mentions.some((mention) => ref.start < mention.end && mention.start < ref.end),
          )
        )
          return invalidInput('overlapping selected tokens');
      }
      const rawSkills = source['skillInvocations'];
      if (rawSkills !== undefined && !Array.isArray(rawSkills))
        return invalidInput('skillInvocations must be selected /Skill tokens');
      const skillTokens: ChannelSkillInvocationToken[] = [];
      if (Array.isArray(rawSkills)) {
        if (rawSkills.length > MAX_SKILL_INVOCATIONS) return invalidInput('too many Skills');
        for (const item of rawSkills) {
          if (!isSkillInvocationToken(item, body)) return invalidInput('invalid Skill token');
          const owner =
            item.owner.kind === 'host'
              ? ({ kind: 'host' } as const)
              : item.owner.kind === 'bot'
                ? ({ kind: 'bot', botSlug: item.owner.botSlug } as const)
                : ({
                    kind: 'workspace',
                    workspaceId: item.owner.workspaceId,
                    name: item.owner.name,
                  } as const);
          skillTokens.push({ name: item.name, owner, start: item.start, end: item.end });
        }
        skillTokens.sort((a, b) => a.start - b.start);
        if (
          skillTokens.some((item, index) => index > 0 && item.start < skillTokens[index - 1]!.end)
        )
          return invalidInput('overlapping Skill tokens');
        if (
          skillTokens.some((skill) =>
            [...mentions, ...channelRefs].some(
              (token) => skill.start < token.end && token.start < skill.end,
            ),
          )
        )
          return invalidInput('overlapping selected tokens');
      }
      if (allBotMention !== undefined) {
        try {
          const expanded = expandAllBotMention(body, mentions, allBotMention);
          const delta = expanded.body.length - body.length;
          for (const token of [...channelRefs, ...skillTokens]) {
            if (token.start < allBotMention.end && allBotMention.start < token.end)
              return invalidInput('overlapping selected tokens');
            if (token.start >= allBotMention.end) {
              token.start += delta;
              token.end += delta;
            }
          }
          body = expanded.body;
          mentions.splice(0, mentions.length, ...expanded.mentions);
        } catch (error) {
          return invalidInput((error as Error).message);
        }
      }
      const rawReplyTo = source['replyTo'];
      if (rawReplyTo !== undefined && (typeof rawReplyTo !== 'string' || rawReplyTo.length === 0)) {
        return invalidInput('replyTo must be a message id');
      }
      let replyTo = typeof rawReplyTo === 'string' ? rawReplyTo : undefined;
      const quotes = parseQuotesInput(source['quotes']);
      if (typeof quotes === 'string') return invalidInput(quotes);
      const rawGrantResolution = source['grantRequestResolution'];
      let grantRequestResolution: ChannelMessage['grantRequestResolution'];
      if (rawGrantResolution !== undefined) {
        if (typeof rawGrantResolution !== 'object' || rawGrantResolution === null)
          return invalidInput('invalid Grant request resolution');
        const resolution = rawGrantResolution as Record<string, unknown>;
        if (
          typeof resolution['requestMessageId'] !== 'string' ||
          resolution['requestMessageId'].length === 0 ||
          typeof resolution['grantId'] !== 'string' ||
          resolution['grantId'].length === 0 ||
          replyTo !== resolution['requestMessageId']
        )
          return invalidInput('invalid Grant request resolution');
        grantRequestResolution = {
          requestMessageId: resolution['requestMessageId'],
          grantId: resolution['grantId'],
        };
      }
      const requestedMessageId = source['messageId'];
      const rawVoiceCall = source['voiceCall'];
      let voiceCall: ChannelMessage['voiceCall'];
      if (rawVoiceCall !== undefined) {
        const callId =
          typeof rawVoiceCall === 'object' && rawVoiceCall !== null
            ? (rawVoiceCall as Record<string, unknown>)['callId']
            : undefined;
        if (typeof callId !== 'string' || !/^call-[a-f0-9]{16}$/u.test(callId))
          return invalidInput('voiceCall must name a call');
        const visual = (rawVoiceCall as Record<string, unknown>)['visual'];
        if (visual !== undefined && !isChannelCallVisual(visual))
          return invalidInput('voiceCall.visual must describe the call grid');
        if (!isChannelVoiceCallMessage(rawVoiceCall))
          return invalidInput(
            'voiceCall takes callId, visual and either speechFromMs/speechToMs or atMs in ms from call connect',
          );
        const { speechFromMs, speechToMs, atMs } = rawVoiceCall;
        voiceCall = {
          callId,
          ...(speechFromMs === undefined || speechToMs === undefined
            ? {}
            : { speechFromMs, speechToMs }),
          ...(atMs === undefined ? {} : { atMs }),
          ...(visual === undefined ? {} : { visual }),
        };
      }
      const rawAssignmentReply = source['assignmentReply'];
      let assignmentReply: ChannelMessage['assignmentReply'];
      if (rawAssignmentReply !== undefined) {
        if (typeof rawAssignmentReply !== 'object' || rawAssignmentReply === null)
          return invalidInput('invalid Assignment response');
        const target = rawAssignmentReply as Record<string, unknown>;
        if (
          typeof target['sessionId'] !== 'string' ||
          target['sessionId'].length === 0 ||
          target['sessionId'].length > 150 ||
          typeof target['sourceEventId'] !== 'string' ||
          target['sourceEventId'].length === 0 ||
          target['sourceEventId'].length > 150 ||
          replyTo !== undefined ||
          grantRequestResolution !== undefined
        )
          return invalidInput('invalid Assignment response');
        assignmentReply = {
          sessionId: target['sessionId'],
          sourceEventId: target['sourceEventId'],
        };
      }
      if (
        requestedMessageId !== undefined &&
        (typeof requestedMessageId !== 'string' ||
          !/^human-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
            requestedMessageId,
          ))
      ) {
        return invalidInput('messageId must be a Human client message id');
      }
      const channel = deps.channels.get(channelId);
      if (channel === undefined) return unknownChannel(channelId);
      let genuiReply: ChannelMessage['genuiReply'];
      let genuiReplyContext: ChannelMessage['genuiReplyContext'];
      if (source['genuiReply'] !== undefined) {
        try {
          if (requestedMessageId === undefined || rawBody.length > 2000)
            throw new GenuiError(
              'invalid-genui',
              'A stable messageId and a request of at most 2000 characters are required.',
            );
          const raw = source['genuiReply'];
          const parsed =
            typeof raw === 'object' &&
            raw !== null &&
            'messageId' in raw &&
            typeof raw.messageId === 'string'
              ? deps.channels.message(channelId, raw.messageId)
              : undefined;
          if (channel.type !== 'dm' || channel.botSlug === undefined || parsed?.genui === undefined)
            throw new GenuiError(
              'genui-unavailable',
              'The report is unavailable in this Human DM.',
            );
          const report = parseGenuiContent(parsed.genui);
          genuiReply = validateGenuiMessageReply(report, raw);
          if (replyTo !== undefined && replyTo !== parsed.id)
            throw new GenuiError('invalid-genui', 'The reply target must be the report message.');
          replyTo = parsed.id;
          genuiReplyContext = buildGenuiReplyContext(report, genuiReply, parsed.id);
        } catch (error) {
          if (error instanceof GenuiError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      if (channel.type === 'dm' && channel.botSlug === undefined && !channel.humanParticipants)
        return invalidInput('Bot-to-Bot DMs are read-only for Human');
      if (
        replyTo !== undefined &&
        deps.channels.readHumanTimeline(human, channelId, {
          direction: 'around',
          around: replyTo,
          olderLimit: 0,
          newerLimit: 0,
        }) === undefined
      )
        return invalidInput('Reply target must exist in this Channel');
      try {
        if (
          requestedMessageId === undefined ||
          deps.channels.message(channelId, requestedMessageId) === undefined
        )
          assertQuoteTargets(quotes, (messageId) =>
            deps.channels
              .readHumanTimeline(human, channelId, {
                direction: 'around',
                around: messageId,
                olderLimit: 0,
                newerLimit: 0,
              })
              ?.entries.find((entry) => entry.id === messageId),
          );
      } catch (error) {
        if (error instanceof ChannelQuoteError)
          return { ok: false, error: { code: error.code, message: error.message } };
        throw error;
      }
      const memorySwitchTarget = source['memorySwitchTarget'];
      if (
        memorySwitchTarget !== undefined &&
        (typeof memorySwitchTarget !== 'string' ||
          memorySwitchTarget.length === 0 ||
          memorySwitchTarget.length > 255 ||
          channel.type !== 'dm')
      )
        return invalidInput('memorySwitchTarget requires a DM and a branch name');
      const existing =
        requestedMessageId === undefined
          ? undefined
          : deps.channels.message(channelId, requestedMessageId);
      if (existing !== undefined) {
        const same =
          existing.author.kind === 'human' &&
          (existing.author.humanId ?? OWNER_HUMAN_CONTEXT.humanId) === human.humanId &&
          ((existing.body === body && existing.genuiReplyContext === genuiReplyContext) ||
            (existing.genuiReplyContext === undefined &&
              genuiReplyContext !== undefined &&
              existing.body === `${body}\n\n${genuiReplyContext}`)) &&
          existing.replyTo === replyTo &&
          sameQuoteIntent(deps.channels.storedQuotes(channelId, existing.id), quotes) &&
          JSON.stringify(existing.genuiReply) === JSON.stringify(genuiReply) &&
          existing.memorySwitchTarget === memorySwitchTarget &&
          JSON.stringify(existing.assignmentReply) === JSON.stringify(assignmentReply) &&
          JSON.stringify(attachmentIntent(ownAttachments(existing, voiceCall))) ===
            JSON.stringify(attachmentIntent(attachments ?? [])) &&
          JSON.stringify(existing.mentions ?? []) === JSON.stringify(mentions) &&
          JSON.stringify(existing.channelRefs ?? []) === JSON.stringify(channelRefs) &&
          JSON.stringify(
            (existing.skillInvocations ?? []).map(({ name, owner, start, end }) => ({
              name,
              owner: skillOwnerKey(owner),
              start,
              end,
            })),
          ) ===
            JSON.stringify(
              skillTokens.map(({ name, owner, start, end }) => ({
                name,
                owner: skillOwnerKey(owner),
                start,
                end,
              })),
            ) &&
          JSON.stringify(existing.grantRequestResolution) ===
            JSON.stringify(grantRequestResolution);
        return same
          ? { ok: true, value: { message: existing } }
          : invalidInput('messageId already belongs to different Channel content');
      }
      if (allBotMention !== undefined) {
        try {
          assertAllBotPreview(deps.channels.previewAllBotMention(channelId), allBotMention.preview);
        } catch (error) {
          if (error instanceof AllBotPreviewChangedError)
            return {
              ok: false,
              error: {
                code: 'all-bot-preview-changed',
                message: error.message,
                details: { preview: error.preview },
              },
            };
          return invalidInput((error as Error).message);
        }
      }
      const grantRequestTarget =
        replyTo === undefined ? undefined : deps.channels.message(channelId, replyTo);
      if (
        assignmentReply !== undefined &&
        (channel.type !== 'dm' ||
          channel.botSlug === undefined ||
          deps.humanAttention?.assignmentContext(
            channel.botSlug,
            assignmentReply.sessionId,
            assignmentReply.sourceEventId,
          )?.canReply !== true)
      )
        return invalidInput('Assignment request is no longer awaiting this Human response');
      if (
        grantRequestResolution === undefined &&
        grantRequestTarget?.grantRequest === true &&
        (body.startsWith('已授权工作区「') || body.startsWith('I authorized workspace “'))
      )
        return invalidInput('Grant approval replies must reference an active Workspace Grant');
      if (grantRequestResolution !== undefined) {
        const requester =
          grantRequestTarget?.grantRequest === true && grantRequestTarget.author.kind === 'bot'
            ? grantRequestTarget.author.slug
            : undefined;
        if (
          requester === undefined ||
          (channel.type === 'dm'
            ? channel.botSlug !== requester
            : !channel.members.includes(requester))
        )
          return invalidInput('Grant request is unavailable in this Channel');
        if (
          !deps.grants
            ?.list(requester)
            .some(
              (grant) =>
                grant.id === grantRequestResolution.grantId && grant.revokedAt === undefined,
            )
        )
          return invalidInput('Workspace Grant is no longer active for this PersonaBot');
      }
      if (mentions.length > 0 && channel.type === 'dm' && channel.botSlug === undefined)
        return invalidInput('Bot-to-Bot DMs are read-only for Human');
      for (const mention of mentions) {
        const target = globalRegistry.get(mention.botSlug);
        if (
          (channel.type === 'group'
            ? !channel.members.includes(mention.botSlug)
            : mention.botSlug === channel.botSlug ||
              deps.team?.bots.canReach(human, mention.botSlug) === false) ||
          target === undefined ||
          target.paused === true
        )
          return invalidInput('Mentioned PersonaBot is no longer an eligible active Bot');
      }
      if (channelRefs.length > 0) {
        if (channel.type !== 'dm' || channel.botSlug === undefined)
          return invalidInput('#Channel references require a Human–Bot DM');
        for (const ref of channelRefs) {
          const target = deps.channels.get(ref.channelId);
          if (target?.type !== 'group')
            return invalidInput('Referenced Group Channel is no longer available');
        }
      }
      if (
        channel.type === 'dm' &&
        channel.botSlug !== undefined &&
        ((globalRegistry.getHistorical(channel.botSlug) !== undefined &&
          globalRegistry.get(channel.botSlug) === undefined) ||
          globalRegistry.get(channel.botSlug)?.paused === true)
      ) {
        return dmAdmissionFailure(channelId, channel.botSlug, 'archived-bot');
      }
      const skillInvocations: ChannelSkillInvocation[] = [];
      const skillBots = skillTokens.length === 0 ? [] : channelSkillBots(channel);
      const skillViewer = skillBots[0];
      for (const token of skillTokens) {
        let resolved: ResolvedSkill | undefined;
        try {
          resolved =
            skillViewer === undefined ||
            (token.owner.kind === 'bot' && !skillBots.includes(token.owner.botSlug))
              ? undefined
              : await deps.skills?.resolve(token.name, token.owner, skillViewer, skillBots);
        } catch (error) {
          if (error instanceof SkillContentTooLargeError)
            return { ok: false, error: { code: error.code, message: error.message } };
          throw error;
        }
        if (resolved === undefined)
          return {
            ok: false,
            error: {
              code: 'skill-unavailable',
              message: `Skill /${token.name} is no longer available`,
            },
          };
        skillInvocations.push({
          ...token,
          owner: resolved.owner,
          content: resolved.content,
          ...(resolved.path === undefined ? {} : { path: resolved.path }),
        });
      }
      const id = requestedMessageId ?? randomUUID();
      const harvest =
        voiceCall === undefined && channel.type === 'dm' && channel.botSlug !== undefined
          ? await deps.callText?.({
              channelId,
              messageId: id,
              picture: (attachments?.length ?? 0) < MAX_CHANNEL_SEND_ATTACHMENTS,
            })
          : undefined;
      if (harvest !== undefined) voiceCall = harvest.voiceCall;
      const sent = [...(attachments ?? []), ...(harvest?.attachments ?? [])];
      const message: ChannelMessage = {
        id,
        at: new Date().toISOString(),
        author: {
          kind: 'human',
          ...(deps.team?.mode(OWNER_HUMAN_CONTEXT).enabled
            ? {
                humanId: human.humanId,
                displayName: deps.channels.humanIdentity(human).displayName,
              }
            : {}),
        },
        body,
        ...(sent.length === 0 ? {} : { attachments: sent }),
        ...(mentions.length === 0 ? {} : { mentions }),
        ...(channelRefs.length === 0 ? {} : { channelRefs }),
        ...(skillInvocations.length === 0 ? {} : { skillInvocations }),
        ...(replyTo === undefined ? {} : { replyTo }),
        ...(quotes.length === 0 ? {} : { quotes }),
        ...(grantRequestResolution === undefined ? {} : { grantRequestResolution }),
        ...(assignmentReply === undefined ? {} : { assignmentReply }),
        ...(memorySwitchTarget === undefined ? {} : { memorySwitchTarget }),
        ...(voiceCall === undefined ? {} : { voiceCall }),
        ...(genuiReply === undefined ? {} : { genuiReply }),
        ...(genuiReplyContext === undefined ? {} : { genuiReplyContext }),
      };
      let appendResult;
      try {
        appendResult = await deps.channels.appendMessageOnce(
          human,
          channelId,
          message,
          allBotMention?.preview,
        );
        harvest?.settle(appendResult.status === 'appended');
      } catch (error) {
        harvest?.settle(false);
        if (error instanceof AllBotPreviewChangedError)
          return {
            ok: false,
            error: {
              code: 'all-bot-preview-changed',
              message: error.message,
              details: { preview: error.preview },
            },
          };
        if (
          error instanceof ChannelReplyTargetError ||
          error instanceof ChannelQuoteError ||
          error instanceof GenuiError ||
          error instanceof AssignmentReplyTargetError ||
          error instanceof ChannelMentionTargetError ||
          error instanceof ChannelAttachmentError
        )
          return invalidInput(error.message);
        throw error;
      }
      if (appendResult.status === 'missing') return unknownChannel(channelId);
      if (appendResult.status === 'conflict') {
        return invalidInput('messageId already belongs to different Channel content');
      }
      const appended = appendResult.message;
      if (appendResult.status === 'existing') {
        return { ok: true, value: { message: appended } };
      }
      if (channel.type === 'group') {
        try {
          deps.runtime?.admitGroupMessage(channelId, appended.id);
        } catch {}
      }
      if (channel.type === 'dm' && !channel.humanParticipants && deps.runtime !== undefined) {
        const admission = deps.runtime.admitDmMessage(human, {
          channelId,
          messageId: appended.id,
          body:
            appended.body.trim() ||
            `[Attachments: ${appended.attachments?.map((ref) => ref.name).join(', ') ?? ''}]`,
        });
        if (!admission.admitted) {
          return { ok: true, value: { message: appended } };
        }
      }
      return { ok: true, value: { message: appended } };
    },
    botAttention(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const limit = source['limit'];
      const cursor = source['cursor'];
      const state = source['state'];
      if (
        limit !== undefined &&
        (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 100)
      )
        return invalidInput('limit must be an integer from 1 to 100');
      if (
        cursor !== undefined &&
        (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 150)
      )
        return invalidInput('cursor must be a Source Event ID');
      if (
        state !== undefined &&
        ![
          'pending',
          'processing',
          'observed',
          'deferred',
          'needs-repair',
          'open',
          'snoozed',
          'handled',
        ].includes(String(state))
      )
        return invalidInput('unknown Bot attention state');
      try {
        return {
          ok: true,
          value: deps.attention?.list({
            botSlug: slug,
            ...(typeof source['channelId'] === 'string' ? { channelId: source['channelId'] } : {}),
            ...(limit === undefined ? {} : { limit: limit as number }),
            ...(cursor === undefined ? {} : { cursor: cursor as string }),
            ...(state === undefined ? {} : { state: state as BotAttentionState }),
          }) ?? { items: [] },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    takeoverList(payload) {
      const source = asObject(payload);
      if (deps.takeovers === undefined) return invalidInput('Takeover handoffs are unavailable');
      const slug = source['slug'];
      const channelId = source['channelId'];
      const limit = source['limit'];
      if (
        (slug !== undefined && typeof slug !== 'string') ||
        (channelId !== undefined && typeof channelId !== 'string') ||
        (limit !== undefined && (typeof limit !== 'number' || !Number.isInteger(limit))) ||
        (source['pendingOnly'] !== undefined && typeof source['pendingOnly'] !== 'boolean')
      )
        return invalidInput('slug, channelId, limit or pendingOnly has the wrong type');
      if (typeof slug === 'string' && deps.registry.get(slug) === undefined)
        return unknownBot(slug);
      try {
        return {
          ok: true,
          value: {
            takeovers: deps.takeovers.list({
              ...(slug === undefined ? {} : { botSlug: slug }),
              ...(channelId === undefined ? {} : { channelId }),
              ...(limit === undefined ? {} : { limit }),
              pendingOnly: source['pendingOnly'] === true,
            }),
          },
        };
      } catch (error) {
        return takeoverFailure(error);
      }
    },
    takeoverStatus(payload) {
      const source = asObject(payload);
      if (deps.takeovers === undefined) return invalidInput('Takeover handoffs are unavailable');
      if (typeof source['channelId'] !== 'string' || typeof source['messageId'] !== 'string')
        return invalidInput('channelId and messageId are required');
      const takeover = deps.takeovers.get(source['channelId'], source['messageId']);
      return takeover === undefined
        ? {
            ok: false,
            error: {
              code: 'not-found',
              message: 'No takeover request with this id',
            },
          }
        : { ok: true, value: { takeover } };
    },
    async takeoverRequest(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      const bot = deps.registry.get(slug);
      if (bot === undefined) return unknownBot(slug);
      if (bot.paused === true) return invalidInput('The Bot is paused and cannot be woken');
      if (deps.takeovers === undefined) return invalidInput('Takeover handoffs are unavailable');
      const channelId = source['channelId'];
      if (channelId !== undefined && typeof channelId !== 'string')
        return invalidInput('channelId must be a string');
      try {
        return {
          ok: true,
          value: {
            takeover: await deps.takeovers.request({
              botSlug: slug,
              channelId: channelId ?? dmChannelId(slug),
              target: source['target'],
              title: source['title'],
              message: source['message'],
              ...(source['minutes'] === undefined ? {} : { minutes: source['minutes'] }),
              initiator: 'cli',
            }),
          },
        };
      } catch (error) {
        return takeoverFailure(error);
      }
    },
    async takeoverComplete(payload) {
      const source = asObject(payload);
      if (deps.takeovers === undefined) return invalidInput('Takeover handoffs are unavailable');
      const outcome = source['outcome'];
      if (
        typeof source['channelId'] !== 'string' ||
        typeof source['messageId'] !== 'string' ||
        (outcome !== 'done' && outcome !== 'failed')
      )
        return invalidInput('channelId, messageId and outcome done or failed are required');
      try {
        return {
          ok: true,
          value: {
            takeover: await deps.takeovers.complete(
              source['channelId'],
              source['messageId'],
              outcome,
              takeoverSurface(source['surface']),
              human,
            ),
          },
        };
      } catch (error) {
        return takeoverFailure(error);
      }
    },
    async takeoverCancel(payload) {
      const source = asObject(payload);
      if (deps.takeovers === undefined) return invalidInput('Takeover handoffs are unavailable');
      if (typeof source['channelId'] !== 'string' || typeof source['messageId'] !== 'string')
        return invalidInput('channelId and messageId are required');
      try {
        return {
          ok: true,
          value: {
            takeover:
              typeof source['bot'] === 'string'
                ? await deps.takeovers.cancel(
                    source['channelId'],
                    source['messageId'],
                    'bot',
                    takeoverSurface(source['surface']),
                    source['bot'],
                  )
                : await deps.takeovers.cancel(
                    source['channelId'],
                    source['messageId'],
                    'human',
                    takeoverSurface(source['surface']),
                    undefined,
                    human,
                  ),
          },
        };
      } catch (error) {
        return takeoverFailure(error);
      }
    },
    ...schedulesMethods,
    botSourcePolicies(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      try {
        return {
          ok: true,
          value: { policies: deps.sourcePolicy?.list(slug) ?? [] },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    botSourcePolicySet(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      const wake = source['wake'];
      const sourceClass = source['sourceClass'] ?? 'assignment-report';
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.sourcePolicy === undefined) return invalidInput('Source policy is unavailable');
      try {
        if (
          sourceClass === 'human-dm' ||
          sourceClass === 'bot-dm' ||
          sourceClass === 'group-mention'
        ) {
          const delivery = source['delivery'];
          if (delivery !== 'steer' && delivery !== 'turn')
            return invalidInput('delivery must be steer or turn');
          return {
            ok: true,
            value: {
              policy: deps.sourcePolicy.setImmediateDelivery(slug, sourceClass, delivery, {
                kind: 'human',
              }),
            },
          };
        }
        if (sourceClass === 'group-ordinary') {
          const digestCount = source['digestCount'];
          const digestIntervalSeconds = source['digestIntervalSeconds'];
          if (
            (wake !== 'immediate' &&
              wake !== 'digest' &&
              wake !== 'mentions' &&
              wake !== 'silent') ||
            !Number.isSafeInteger(digestCount) ||
            !Number.isSafeInteger(digestIntervalSeconds)
          )
            return invalidInput('Group ordinary wake and digest parameters are required');
          return {
            ok: true,
            value: {
              policy: deps.sourcePolicy.setGroupOrdinary(
                slug,
                wake,
                digestCount as number,
                digestIntervalSeconds as number,
                { kind: 'human' },
              ),
            },
          };
        }
        if (
          sourceClass !== 'assignment-report' ||
          (wake !== 'conditional' && wake !== 'immediate') ||
          source['digestCount'] !== undefined ||
          source['digestIntervalSeconds'] !== undefined
        )
          return invalidInput('Assignment report wake must be conditional or immediate');
        return {
          ok: true,
          value: {
            policy: deps.sourcePolicy.setAssignmentReport(slug, wake, {
              kind: 'human',
            }),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    botSourcePolicyReset(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      const sourceClass = source['sourceClass'] ?? 'assignment-report';
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.sourcePolicy === undefined) return invalidInput('Source policy is unavailable');
      try {
        if (sourceClass === 'group-ordinary')
          return {
            ok: true,
            value: {
              policy: deps.sourcePolicy.resetGroupOrdinary(slug, {
                kind: 'human',
              }),
            },
          };
        if (
          sourceClass === 'human-dm' ||
          sourceClass === 'bot-dm' ||
          sourceClass === 'group-mention'
        )
          return {
            ok: true,
            value: {
              policy: deps.sourcePolicy.resetImmediateDelivery(slug, sourceClass, {
                kind: 'human',
              }),
            },
          };
        if (sourceClass !== 'assignment-report')
          return invalidInput('Source class is not editable');
        return {
          ok: true,
          value: {
            policy: deps.sourcePolicy.resetAssignmentReport(slug, {
              kind: 'human',
            }),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    humanAttention(payload) {
      const source = asObject(payload);
      if (source['notifications'] !== undefined && typeof source['notifications'] !== 'boolean')
        return invalidInput('notifications must be a boolean');
      if (source['queryVersion'] !== undefined && source['queryVersion'] !== 1)
        return invalidInput('unsupported Activity query version');
      if (source['queryVersion'] === 1 && deps.humanAttention === undefined)
        return invalidInput('Activity queries are unavailable');
      const category = source['category'];
      const sort = source['sort'];
      const search = source['search'];
      const unreadOnly = source['unreadOnly'];
      if (search !== undefined && (typeof search !== 'string' || search.length > 200))
        return invalidInput('search must be at most 200 characters');
      if (unreadOnly !== undefined && typeof unreadOnly !== 'boolean')
        return invalidInput('unreadOnly must be a boolean');
      const botSlug = source['botSlug'];
      const channelId = source['channelId'];
      const limit = source['limit'];
      const cursor = source['cursor'];
      const snoozed = source['snoozed'];
      const dismissed = source['dismissed'];
      const kind = source['kind'];
      if (snoozed !== undefined && typeof snoozed !== 'boolean')
        return invalidInput('snoozed must be a boolean');
      if (dismissed !== undefined && typeof dismissed !== 'boolean')
        return invalidInput('dismissed must be a boolean');
      if (snoozed === true && dismissed === true)
        return invalidInput('snoozed and dismissed cannot be combined');
      if (kind !== undefined && kind !== 'auto-rejection')
        return invalidInput('kind must be auto-rejection');
      if (
        category !== undefined &&
        category !== 'action' &&
        category !== 'info' &&
        category !== 'unread' &&
        category !== 'replies' &&
        category !== 'handled'
      )
        return invalidInput('category must be action, info, unread, replies or handled');
      if (
        sort !== undefined &&
        sort !== 'newest' &&
        sort !== 'oldest' &&
        !(sort === 'mentions-first' && category === 'replies')
      )
        return invalidInput('sort must be newest, oldest, or mentions-first for replies');
      if (botSlug !== undefined && (typeof botSlug !== 'string' || !isValidSlug(botSlug)))
        return invalidInput('invalid Bot filter');
      if (
        channelId !== undefined &&
        (typeof channelId !== 'string' || !isValidChannelId(channelId))
      )
        return invalidInput('invalid Channel filter');
      if (
        limit !== undefined &&
        (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 100)
      )
        return invalidInput('limit must be an integer from 1 to 100');
      if (
        cursor !== undefined &&
        (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 1024)
      )
        return invalidInput('invalid cursor');
      try {
        if (source['notifications'] === true) {
          if (deps.humanAttention === undefined)
            return invalidInput('notification queries are unavailable');
          if (
            Object.keys(source).some(
              (key) =>
                !['notifications', 'limit', 'cursor'].includes(key) && source[key] !== undefined,
            )
          )
            return invalidInput('notification discovery does not accept Activity filters');
          return {
            ok: true,
            value: notificationAttentionPage(human, deps.humanAttention, {
              ...(limit === undefined ? {} : { limit: limit as number }),
              ...(cursor === undefined ? {} : { cursor: cursor as string }),
            }),
          };
        }
        return {
          ok: true,
          value: {
            ...(deps.humanAttention?.list(human, {
              ...(category === undefined ? {} : { category: category as HumanAttentionCategory }),
              ...(sort === undefined
                ? {}
                : { sort: sort as 'newest' | 'oldest' | 'mentions-first' }),
              ...(search === undefined ? {} : { search: search as string }),
              ...(unreadOnly === true ? { unreadOnly: true } : {}),
              ...(botSlug === undefined ? {} : { botSlug: botSlug as string }),
              ...(channelId === undefined ? {} : { channelId: channelId as string }),
              ...(limit === undefined ? {} : { limit: limit as number }),
              ...(cursor === undefined ? {} : { cursor: cursor as string }),
              ...(snoozed === true ? { snoozed: true } : {}),
              ...(dismissed === true ? { dismissed: true } : {}),
              ...(kind === undefined ? {} : { kind }),
            }) ?? { items: [] }),
            ...(source['queryVersion'] === 1 ? { queryVersion: 1 } : {}),
            ...(dismissed === true ? { dismissed: true } : {}),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    humanAttentionStatus(payload) {
      const requested = asObject(payload)['messageCounts'];
      if (requested !== undefined && typeof requested !== 'boolean')
        return invalidInput('messageCounts must be boolean');
      try {
        return {
          ok: true,
          value: deps.humanAttention?.status(human, requested === true) ?? {
            unreadCount: 0,
            hasAction: false,
            ...(requested === true ? { messageCounts: { replies: 0, other: 0 } } : {}),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelUnreadCounts() {
      try {
        const visible = deps.team?.channelAccess.visibleIds(human);
        return {
          ok: true,
          value: {
            channels: (deps.humanAttention?.unreadByChannel(human) ?? []).filter((entry) =>
              visible
                ? visible.has(entry.channelId)
                : human.humanId === OWNER_HUMAN_CONTEXT.humanId,
            ),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    humanAssignmentContext(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      const sessionId = asNonBlank(source, 'sessionId');
      const sourceEventId = asNonBlank(source, 'sourceEventId');
      if (
        slug === undefined ||
        sessionId === undefined ||
        sessionId.length > 150 ||
        sourceEventId === undefined ||
        sourceEventId.length > 150
      )
        return invalidInput('Bot, Assignment Session and report Source Event are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      const context = deps.humanAttention?.assignmentContext(slug, sessionId, sourceEventId);
      if (context === undefined)
        return invalidInput('Assignment report is unavailable for this Bot');
      return {
        ok: true,
        value: {
          context: {
            ...context,
            canReply:
              context.canReply &&
              deps.registry.get(slug)?.paused !== true &&
              deps.channels.get('dm-' + slug)?.botSlug === slug,
          },
        },
      };
    },
    humanAttentionDismiss(payload) {
      const source = asObject(payload);
      const itemId = asNonBlank(source, 'itemId');
      const sourceKey = source?.['sourceKey'];
      if (
        itemId === undefined ||
        itemId.length > 350 ||
        typeof sourceKey !== 'string' ||
        sourceKey.length > 150
      )
        return invalidInput('itemId and sourceKey are required');
      try {
        const item = deps.humanAttention?.item(human, itemId, sourceKey);
        if (
          item === undefined ||
          (item.sourceEventId ?? '') !== sourceKey ||
          deps.humanAttentionDecisions?.dismiss(human, item) !== true
        )
          return invalidInput('Inbox item is no longer available');
        return { ok: true, value: { accepted: true } };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    async humanAttentionDismissAll(payload) {
      const source = asObject(payload);
      const kind = source['kind'];
      const category = source['category'];
      const botSlug = source['botSlug'];
      const channelId = source['channelId'];
      if (kind !== undefined && !HUMAN_ATTENTION_DISMISS_KINDS.has(kind as string))
        return invalidInput('kind is not a clearable Activity kind');
      if (
        category !== undefined &&
        category !== 'action' &&
        category !== 'info' &&
        category !== 'replies' &&
        category !== 'unread'
      )
        return invalidInput('category must be action, info, replies or unread');
      if (botSlug !== undefined && (typeof botSlug !== 'string' || !isValidSlug(botSlug)))
        return invalidInput('invalid Bot filter');
      if (
        channelId !== undefined &&
        (typeof channelId !== 'string' || !isValidChannelId(channelId))
      )
        return invalidInput('invalid Channel filter');
      const query = deps.humanAttention;
      const decisions = deps.humanAttentionDecisions;
      if (query === undefined || decisions === undefined)
        return invalidInput('Activity is unavailable');
      try {
        const matches: HumanAttentionItem[] = [];
        let more = false;
        for (const section of category === undefined
          ? (['action', 'info', 'replies', 'unread'] as const)
          : [category as 'action' | 'info' | 'replies' | 'unread']) {
          let cursor: string | undefined;
          do {
            const page = query.list(human, {
              category: section,
              limit: 100,
              ...(botSlug === undefined ? {} : { botSlug: botSlug as string }),
              ...(channelId === undefined ? {} : { channelId: channelId as string }),
              ...(cursor === undefined ? {} : { cursor }),
            });
            for (const item of page.items)
              if (kind === undefined || item.kind === kind) matches.push(item);
            cursor = page.nextCursor;
          } while (cursor !== undefined && matches.length < HUMAN_ATTENTION_DISMISS_LIMIT);
          if (matches.length >= HUMAN_ATTENTION_DISMISS_LIMIT) {
            more = true;
            break;
          }
        }
        let dismissed = 0;
        const unread: Array<{ channelId: string; messageId: string }> = [];
        for (const item of matches.slice(0, HUMAN_ATTENTION_DISMISS_LIMIT)) {
          if (decisions.dismiss(human, item)) dismissed += 1;
          if (
            item.channelId !== undefined &&
            item.messageId !== undefined &&
            HUMAN_ATTENTION_READ_KINDS.has(item.kind)
          )
            unread.push({
              channelId: item.channelId,
              messageId: item.messageId,
            });
        }
        let read = 0;
        for (const target of unread)
          if (
            (await deps.channels.markRead(human, target.channelId, target.messageId)) !== undefined
          )
            read += 1;
        return { ok: true, value: { accepted: true, dismissed, read, more } };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    humanAttentionRestore(payload) {
      const source = asObject(payload);
      const itemId = asNonBlank(source, 'itemId');
      const sourceKey = source?.['sourceKey'];
      if (
        itemId === undefined ||
        itemId.length > 350 ||
        typeof sourceKey !== 'string' ||
        sourceKey.length > 150
      )
        return invalidInput('itemId and sourceKey are required');
      try {
        const item = deps.humanAttention?.item(human, itemId, sourceKey);
        if (
          item === undefined ||
          (item.sourceEventId ?? '') !== sourceKey ||
          deps.humanAttentionDecisions?.restore(human, item) !== true
        )
          return invalidInput('Inbox item is not dismissed');
        return { ok: true, value: { accepted: true } };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    humanAttentionSnooze(payload) {
      const source = asObject(payload);
      const itemId = asNonBlank(source, 'itemId');
      const sourceKey = source?.['sourceKey'];
      const until = source?.['until'];
      if (
        itemId === undefined ||
        itemId.length > 350 ||
        typeof sourceKey !== 'string' ||
        sourceKey.length > 150
      )
        return invalidInput('itemId and sourceKey are required');
      if (until !== null) {
        const at = typeof until === 'string' ? Date.parse(until) : Number.NaN;
        if (Number.isNaN(at) || new Date(at).toISOString() !== until)
          return invalidInput('until must be an ISO time, or null to bring the item back');
        const left = at - Date.now();
        if (left <= 0 || left > HUMAN_INBOX_SNOOZE_MAX_MS)
          return invalidInput('until must be in the future and at most 30 days away');
      }
      try {
        const item = deps.humanAttention?.item(human, itemId, sourceKey);
        if (
          item === undefined ||
          (item.sourceEventId ?? '') !== sourceKey ||
          deps.humanAttentionDecisions?.snooze(human, item, until) !== true
        )
          return invalidInput('Inbox item cannot be snoozed');
        return { ok: true, value: { accepted: true } };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    humanAttentionIgnore(payload) {
      const source = asObject(payload);
      const sourceEventId = asNonBlank(source, 'sourceEventId');
      if (sourceEventId === undefined || sourceEventId.length > 150)
        return invalidInput('sourceEventId is required');
      try {
        const accepted =
          deps.humanAttentionDecisions?.ignoreAssignmentReport(human, sourceEventId) ?? false;
        if (!accepted) return invalidInput('Assignment report is no longer informational');
        return { ok: true, value: { accepted: true } };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    assignments(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const assignments = deps.runtime?.listAssignments(slug) ?? [];
      const filter = z
        .object({
          query: z.string().max(200).optional(),
          activity: z.array(z.enum(['working', 'idle', 'error', 'stopping', 'stopped'])).optional(),
          includeArchived: z.boolean().optional(),
          limit: z.number().int().optional(),
          cursor: z.string().optional(),
        })
        .safeParse(asObject(payload));
      if (!filter.success) return invalidInput('invalid Assignment Directory query');
      const { query, includeArchived, limit, cursor } = filter.data;
      const activity = filter.data.activity?.length === 0 ? undefined : filter.data.activity;
      if ([query, activity, includeArchived, limit, cursor].every((value) => value === undefined))
        return { ok: true, value: { assignments } };
      try {
        return {
          ok: true,
          value: queryAssignmentDirectory(assignments, {
            ...(query === undefined ? {} : { query }),
            ...(activity === undefined ? {} : { activity }),
            ...(includeArchived === undefined ? {} : { includeArchived }),
            ...(limit === undefined ? {} : { limit }),
            ...(cursor === undefined ? {} : { cursor }),
          }),
        };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
    },
    channelAssignments(payload) {
      const parsed = z.object({ channelId: z.string().min(1) }).safeParse(asObject(payload));
      if (!parsed.success) return invalidInput('invalid Group channel');
      const channel = deps.channels.get(parsed.data.channelId);
      if (
        channel?.type !== 'group' ||
        channel.deletedAt ||
        !deps.channels
          .listHumanMembers(human, channel.id)
          .some((member) => member.humanId === human.humanId)
      )
        return invalidInput('Group channel unavailable');
      const assignments = deps.runtime?.listChannelAssignments?.(channel.id) ?? [];
      const subagentCounts = deps.ownership.subagentCounts(
        assignments.map((assignment) => assignment.sessionId),
      );
      return {
        ok: true,
        value: {
          assignments: assignments.map((assignment) => {
            const subagentCount = subagentCounts.get(assignment.sessionId);
            const modelRoute =
              deps.usage?.latestRoute(assignment.sessionId) ??
              assignment.modelRoute ??
              deps.registry.get(assignment.botSlug)?.modelPlan?.assignmentDefault ??
              deps.defaultModel?.currentSelection();
            return {
              ...assignment,
              ...(modelRoute === undefined ? {} : { modelRoute }),
              ...(subagentCount === undefined ? {} : { subagentCount }),
            };
          }),
        },
      };
    },
    assignment(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const sessionId = asNonBlank(source, 'sessionId');
      if (slug === undefined) return invalidInput('slug is required');
      if (sessionId === undefined) return invalidInput('sessionId is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const assignment = deps.runtime?.getAssignment(slug, sessionId);
      if (assignment === undefined) return unknownAssignment(sessionId);
      return { ok: true, value: { assignment } };
    },
    async assignmentTimeline(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const sessionId = asNonBlank(source, 'sessionId');
      if (slug === undefined) return invalidInput('slug is required');
      if (sessionId === undefined) return invalidInput('sessionId is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const assignment = deps.runtime?.getAssignment(slug, sessionId);
      if (assignment === undefined) return unknownAssignment(sessionId);
      const read = deps.readUsageSessionLog;
      if (read === undefined) return unavailable();
      const [main, subagents] = await Promise.all([
        sessionLogOf(read, sessionId),
        subagentSessionsOf(deps.ownership, read, slug, sessionId),
      ]);
      const timeline = summarizeAssignmentTimeline({
        main,
        subagents,
        describe: (id, name, args) => deps.describeToolCall?.(id, name, args),
      });
      return { ok: true, value: { assignment, ...timeline } };
    },
    async sessionProgress(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      if (slug === undefined) return invalidInput('slug is required');
      const ids = source?.['sessionIds'];
      if (
        !Array.isArray(ids) ||
        ids.length === 0 ||
        ids.length > SESSION_PROGRESS_LIMIT ||
        !ids.every((id) => typeof id === 'string' && id.trim() !== '')
      )
        return invalidInput(`sessionIds must list 1 to ${SESSION_PROGRESS_LIMIT} Session ids`);
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const read = deps.readUsageSessionLog;
      if (read === undefined) return unavailable();
      const sessions = await Promise.all(
        [...new Set(ids as string[])].map(async (sessionId): Promise<SessionProgressEntry> => {
          const owner = deps.ownership.resolve(sessionId);
          if (owner?.botSlug !== slug || owner.parentSessionId !== undefined)
            return { sessionId, error: 'not-found' };
          try {
            const log = await read(sessionId);
            return { sessionId, ...summarizeSessionProgress(log?.events ?? []) };
          } catch {
            return { sessionId, error: 'unavailable' };
          }
        }),
      );
      return { ok: true, value: { sessions } };
    },
    async sessionTranscript(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const sessionId = asNonBlank(source, 'sessionId');
      if (slug === undefined) return invalidInput('slug is required');
      if (sessionId === undefined) return invalidInput('sessionId is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const owner = deps.ownership.resolve(sessionId);
      if (owner?.botSlug !== slug || owner.parentSessionId !== undefined)
        return {
          ok: false,
          error: { code: 'not-found', message: `unknown root Session: ${sessionId}` },
        };
      const read = deps.readUsageSessionLog;
      if (read === undefined) return unavailable();
      const log = await read(sessionId);
      const engine = deps.describeEngineSession?.(sessionId);
      return {
        ok: true,
        value: {
          sessionId,
          role: owner.rootRole,
          ...(engine === undefined ? {} : { engine }),
          ...summarizeSessionTranscript({
            sessionId,
            events: log?.events ?? [],
            segments: deps.runtime?.sessionTurnTargets?.(sessionId) ?? [],
            describe: (id, name, args) => deps.describeToolCall?.(id, name, args),
          }),
        },
      };
    },
    async sessionLive(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const sessionId = asNonBlank(source, 'sessionId');
      const after = source?.['after'];
      if (slug === undefined) return invalidInput('slug is required');
      if (sessionId === undefined) return invalidInput('sessionId is required');
      if (after !== undefined && (typeof after !== 'number' || !Number.isSafeInteger(after)))
        return invalidInput('after must be an integer');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const owner = deps.ownership.resolve(sessionId);
      if (owner?.botSlug !== slug || owner.parentSessionId !== undefined)
        return {
          ok: false,
          error: { code: 'not-found', message: `unknown root Session: ${sessionId}` },
        };
      const live = deps.sessionLive;
      if (live === undefined) return unavailable();
      if (after !== undefined) await live.wait(sessionId, after);
      return { ok: true, value: { sessionId, ...live.snapshot(sessionId) } };
    },
    async sessionToolDetail(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const sessionId = asNonBlank(source, 'sessionId');
      const callId = asNonBlank(source, 'callId');
      if (slug === undefined) return invalidInput('slug is required');
      if (sessionId === undefined) return invalidInput('sessionId is required');
      if (callId === undefined) return invalidInput('callId is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const owner = deps.ownership.resolve(sessionId);
      if (owner?.botSlug !== slug || owner.parentSessionId !== undefined)
        return {
          ok: false,
          error: { code: 'not-found', message: `unknown root Session: ${sessionId}` },
        };
      const read = deps.readUsageSessionLog;
      if (read === undefined) return unavailable();
      const log = await read(sessionId);
      const detail = summarizeSessionToolDetail({
        sessionId,
        callId,
        events: log?.events ?? [],
        ...(deps.presentToolResult === undefined ? {} : { present: deps.presentToolResult }),
      });
      if (detail === undefined)
        return { ok: false, error: { code: 'not-found', message: `unknown tool call: ${callId}` } };
      return { ok: true, value: { sessionId, callId, detail } };
    },
    async sessionSubagents(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const sessionId = asNonBlank(source, 'sessionId');
      if (slug === undefined) return invalidInput('slug is required');
      if (sessionId === undefined) return invalidInput('sessionId is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const owner = deps.ownership.resolve(sessionId);
      if (owner?.botSlug !== slug || owner.parentSessionId !== undefined)
        return {
          ok: false,
          error: {
            code: 'not-found',
            message: `unknown root Session: ${sessionId}`,
          },
        };
      const read = deps.readUsageSessionLog;
      if (read === undefined) return unavailable();
      const children = summarizeSubagentLanes({
        subagents: await subagentSessionsOf(deps.ownership, read, slug, sessionId),
        describe: (id, name, args) => deps.describeToolCall?.(id, name, args),
      });
      return {
        ok: true,
        value: { sessionId, role: owner.rootRole, ...children },
      };
    },
    workspaceOptions() {
      try {
        const team = deps.team;
        const spaces = team
          ? team.spaces.list(human).map((space) => ({
              id: space.spaceId,
              title: space.name,
              path: join(team.spaces.path(space.spaceId), 'files'),
            }))
          : [];
        const native =
          !deps.team || isHostOwner()
            ? (deps.grants?.availableWorkspaces() ?? []).filter(({ id, path }) => {
                if (!deps.team) return true;
                if (/^(spaces|shared)\//u.test(id)) return false;
                try {
                  deps.team.spaces.assertGrantForHuman(human, path);
                  return true;
                } catch {
                  return false;
                }
              })
            : [];
        return {
          ok: true,
          value: {
            workspaces: [...native, ...spaces],
          },
        };
      } catch (error) {
        if (error instanceof WorkspaceGrantError) {
          return {
            ok: false,
            error: {
              code: error.code,
              message: error.message,
              ...(error instanceof WorkspaceGrantError && error.details
                ? { details: error.details }
                : {}),
            },
          };
        }
        throw error;
      }
    },
    channelMediaTarget(payload) {
      const input = z
        .object({
          channelId: z.string().min(1),
          sourceEventId: z.string().min(1),
          attachmentId: z.string().min(1),
        })
        .strict()
        .safeParse(payload);
      if (!input.success || deps.attachments === undefined)
        return Promise.resolve(invalidInput('Channel media and attachment storage are required'));
      return messagingCall(async (service) => {
        try {
          const media = await service.readChannelMedia({
            ...input.data,
            signal: AbortSignal.timeout(30_000),
          });
          await media.body.cancel();
          if (!media.ref.fileId) throw new MessagingError('source-unavailable');
          return { target: deps.attachments!.fileTarget(media.ref.fileId) };
        } catch (error) {
          if (error instanceof ChannelAttachmentError) throw new MessagingError(error.code);
          throw error;
        }
      });
    },
    messageAttachmentTarget(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      const fileId = asNonBlank(source, 'fileId');
      if (channelId === undefined || messageId === undefined || fileId === undefined)
        return invalidInput('channelId, messageId and fileId are required');
      if (deps.attachments === undefined)
        return {
          ok: false,
          error: {
            code: 'storage-unavailable',
            message: 'Attachment store unavailable',
          },
        };
      try {
        return {
          ok: true,
          value: {
            target: createMessageAttachmentFiles(deps.channels, deps.attachments).target(
              channelId,
              messageId,
              fileId,
            ),
          },
        };
      } catch (error) {
        if (error instanceof ChannelAttachmentError)
          return {
            ok: false,
            error: {
              code: error.code === 'not-found' ? 'not-found' : 'invalid-input',
              message: error.message,
            },
          };
        throw error;
      }
    },
    async folderBrowse(payload) {
      const input = z
        .object({
          path: z.string().max(1024).optional(),
          offset: z.number().int().min(0).max(1_000_000).optional(),
        })
        .strict()
        .safeParse(payload ?? {});
      if (!input.success) return invalidInput('path must be a folder path');
      if (deps.folders === undefined)
        return {
          ok: false,
          error: {
            code: 'unavailable',
            message: 'Folder browsing is unavailable',
          },
        };
      try {
        return {
          ok: true,
          value: await deps.folders.list(input.data.path, input.data.offset),
        };
      } catch (error) {
        if (error instanceof FolderBrowseError)
          return {
            ok: false,
            error: { code: error.code, message: error.message },
          };
        throw error;
      }
    },
    workspaceFileTarget(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const grantId = asNonBlank(source, 'grantId');
      if (slug === undefined || grantId === undefined)
        return invalidInput('slug and grantId are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.grants === undefined)
        return {
          ok: false,
          error: {
            code: 'unavailable',
            message: 'Workspace Grants are unavailable',
          },
        };
      try {
        const grant = deps.grants.requireActive(slug, grantId);
        return {
          ok: true,
          value: {
            target: {
              path: grant.workspacePath,
              relativePath: '',
              kind: 'directory',
            },
          },
        };
      } catch (error) {
        if (error instanceof WorkspaceGrantError)
          return {
            ok: false,
            error: {
              code: error.code,
              message: error.message,
              ...(error instanceof WorkspaceGrantError && error.details
                ? { details: error.details }
                : {}),
            },
          };
        throw error;
      }
    },
    grants: workspacesMethods.grants,
    grantCreate: workspacesMethods.grantCreate,
    grantRevoke: workspacesMethods.grantRevoke,
    grantRequestApprove: workspacesMethods.grantRequestApprove,
    grantWriteSet: workspacesMethods.grantWriteSet,
    assignmentAccessGet(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      return {
        ok: true,
        value: {
          preset: deps.assignmentAccess?.get(slug) ?? {
            botSlug: slug,
            mode: 'workspace-write',
            scope: 'chat',
            revision: 0,
          },
        },
      };
    },
    assignmentAccessSet(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const mode = source['mode'];
      if (slug === undefined || (mode !== 'workspace-write' && mode !== 'danger-full-access'))
        return invalidInput('slug and valid mode are required');
      if (mode === 'danger-full-access' && source['acknowledgeRisk'] !== true)
        return invalidInput('Dangerous access requires explicit Human risk acknowledgement');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.assignmentAccess === undefined)
        return invalidInput('Assignment access is unavailable');
      const scope = source['scope'];
      if (scope !== undefined && scope !== 'chat' && scope !== 'assignments')
        return invalidInput('scope must be chat or assignments');
      return {
        ok: true,
        value: { preset: deps.assignmentAccess.set(slug, mode, scope, human) },
      };
    },
    toolApprovalRules: approvalsMethods.toolApprovalRules,
    toolApprovalRuleRevoke: approvalsMethods.toolApprovalRuleRevoke,
    toolApprovalHistory: approvalsMethods.toolApprovalHistory,
    toolApprovalStatus: approvalsMethods.toolApprovalStatus,
    toolApprovalDecide: approvalsMethods.toolApprovalDecide,
    toolAutoRejectionOverride: approvalsMethods.toolAutoRejectionOverride,
    userQuestionStatus: approvalsMethods.userQuestionStatus,
    userQuestionAnswer: approvalsMethods.userQuestionAnswer,
    async botToolTrace(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const source = asObject(payload) ?? {};
      const turns = source['turns'] === undefined ? 3 : source['turns'];
      if (typeof turns !== 'number' || !Number.isInteger(turns) || turns < 1 || turns > 20)
        return invalidInput('turns must be an integer from 1 to 20');
      const roots = deps.ownership.rootsFor(slug);
      const requested = source['sessionId'];
      if (requested !== undefined && typeof requested !== 'string')
        return invalidInput('sessionId must be a string');
      if (requested === 'direct')
        return {
          ok: true,
          value: {
            slug,
            sessionId: 'direct',
            turns: directToolTrace(deps.runtime?.directBotToolCalls?.(slug) ?? [], { turns }),
          },
        };
      const sessionId =
        requested ??
        deps.runtime?.currentOrchestratorSessionId?.(slug) ??
        [...roots].reverse().find((root) => root.rootRole === 'orchestrator')?.sessionId;
      if (sessionId === undefined || !roots.some((root) => root.sessionId === sessionId))
        return invalidInput('The Session does not belong to this PersonaBot');
      if (deps.readUsageSessionLog === undefined) return unavailable();
      const log = await deps.readUsageSessionLog(sessionId);
      if (log === undefined) return unavailable();
      return {
        ok: true,
        value: {
          slug,
          sessionId,
          ...summarizeToolTrace(log.events, { turns }),
        },
      };
    },
    async botTurnInput(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const source = asObject(payload) ?? {};
      const turns = source['turns'] === undefined ? 1 : source['turns'];
      if (typeof turns !== 'number' || !Number.isInteger(turns) || turns < 1 || turns > 20)
        return invalidInput('turns must be an integer from 1 to 20');
      const roots = deps.ownership.rootsFor(slug);
      const requested = source['sessionId'];
      if (requested !== undefined && typeof requested !== 'string')
        return invalidInput('sessionId must be a string');
      const sessionId =
        requested ??
        deps.runtime?.currentOrchestratorSessionId?.(slug) ??
        [...roots].reverse().find((root) => root.rootRole === 'orchestrator')?.sessionId;
      if (sessionId === undefined || !roots.some((root) => root.sessionId === sessionId))
        return invalidInput('The Session does not belong to this PersonaBot');
      if (deps.readUsageSessionLog === undefined) return unavailable();
      const log = await deps.readUsageSessionLog(sessionId);
      if (log === undefined) return unavailable();
      return {
        ok: true,
        value: {
          slug,
          sessionId,
          ...summarizeTurnInput(log.events, { turns }),
        },
      };
    },
    botTools() {
      const tools = deps.runtime?.directBotTools?.();
      if (tools === undefined) return directToolsUnavailable();
      return { ok: true, value: { sessionId: 'direct', tools } };
    },
    async botToolRun(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      const source = asObject(payload);
      const tool = source['tool'];
      if (typeof tool !== 'string' || tool.trim() === '') return invalidInput('tool is required');
      const args = source['args'] ?? {};
      if (typeof args !== 'object' || args === null || Array.isArray(args))
        return invalidInput('args must be an object of tool arguments');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      const session = source['sessionId'];
      if (session !== undefined && (typeof session !== 'string' || session.trim() === ''))
        return invalidInput('sessionId must be a Session id');
      if (deps.runtime?.runDirectBotTool === undefined) return directToolsUnavailable();
      const sourceEventId = source['sourceEventId'];
      if (
        sourceEventId !== undefined &&
        (typeof sourceEventId !== 'string' ||
          sourceEventId.length === 0 ||
          sourceEventId.length > 128)
      )
        return invalidInput('sourceEventId must identify an admitted Source Event');
      try {
        const run = await deps.runtime.runDirectBotTool(
          slug,
          tool.trim(),
          args as Record<string, unknown>,
          AbortSignal.timeout(DIRECT_TOOL_TIMEOUT_MS),
          session?.trim(),
          sourceEventId,
          human,
        );
        return { ok: true, value: { slug, ...run } };
      } catch (error) {
        return {
          ok: false,
          error: {
            code:
              error instanceof TeamError ||
              error instanceof DirectBotToolError ||
              error instanceof ChannelCallReadError ||
              error instanceof TobError ||
              error instanceof BotNetworkDeliveryError ||
              error instanceof GenuiPreviewError ||
              error instanceof GenuiDiagramError
                ? error.code
                : 'tool-failed',
            message: error instanceof Error ? error.message : String(error),
            ...(error instanceof TeamError && error.details ? { details: error.details } : {}),
          },
        };
      }
    },
    sessions(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const assignments = new Map(
        (deps.runtime?.listAssignments(slug) ?? []).map((assignment) => [
          assignment.sessionId,
          assignment,
        ]),
      );
      const resumed =
        deps.runtime?.currentOrchestratorSessionId === undefined
          ? undefined
          : (deps.runtime.currentOrchestratorSessionId(slug) ?? null);
      const triage = deps.runtime?.triageOpenCount?.(slug);
      const roots = deps.ownership.rootsFor(slug);
      const subagentCounts = deps.ownership.subagentCounts(roots.map((root) => root.sessionId));
      const plan = deps.registry.get(slug)?.modelPlan;
      const fallbackRoute = deps.defaultModel?.currentSelection();
      const sessions = roots.map((root) => {
        const assignment = assignments.get(root.sessionId);
        const subagentCount = subagentCounts.get(root.sessionId);
        const engine = deps.describeEngineSession?.(root.sessionId);
        const modelRoute =
          engine !== undefined
            ? undefined
            : (deps.usage?.latestRoute(root.sessionId) ??
              (root.rootRole === 'assignment'
                ? (assignment?.modelRoute ?? plan?.assignmentDefault)
                : plan?.orchestrator) ??
              fallbackRoute);
        return {
          sessionId: root.sessionId,
          role: root.rootRole,
          createdAt: root.createdAt,
          ...(resumed === undefined || root.rootRole !== 'orchestrator'
            ? {}
            : { currentOrchestrator: root.sessionId === resumed }),
          ...(triage === undefined || root.rootRole !== 'orchestrator' || root.sessionId !== resumed
            ? {}
            : { triageOpenCount: triage }),
          ...(root.cwdReference === undefined ? {} : { cwdReference: root.cwdReference }),
          ...(assignment === undefined ? {} : { assignmentActivity: assignment.activity }),
          ...(assignment?.permission === undefined
            ? {}
            : { assignmentAccessMode: assignment.permission.mode }),
          ...(assignment?.latestReport === undefined
            ? {}
            : { assignmentReportState: assignment.latestReport.state }),
          ...(assignment?.executionWait === undefined
            ? {}
            : { assignmentExecutionWait: assignment.executionWait }),
          ...(assignment?.archivedAt === undefined ? {} : { assignmentArchived: true as const }),
          ...(assignment === undefined
            ? {}
            : {
                assignmentTitle: assignment.title,
                assignmentDescription: assignment.description,
              }),
          ...(assignment?.modelRoute === undefined
            ? {}
            : { assignmentModelRoute: assignment.modelRoute }),
          ...(modelRoute === undefined ? {} : { modelRoute }),
          ...(engine === undefined
            ? {}
            : {
                engine: {
                  engine: engine.engine,
                  ...(engine.account === undefined ? {} : { account: engine.account }),
                  ...(engine.quota === undefined ? {} : { quota: engine.quota }),
                },
              }),
          ...(root.agentPreset === undefined ? {} : { agentPreset: root.agentPreset }),
          ...(subagentCount === undefined ? {} : { subagentCount }),
        };
      });
      return { ok: true, value: { sessions } };
    },
    async sessionArchiveSet(payload) {
      const input = asObject(payload);
      const slug = asSlug(payload);
      const sessionId = asNonBlank(input, 'sessionId');
      const archived = input?.['archived'];
      if (slug === undefined || sessionId === undefined || typeof archived !== 'boolean')
        return invalidInput('slug, sessionId and archived are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.runtime?.setAssignmentArchived === undefined)
        return invalidInput('Assignment archive is unavailable');
      if (deps.runtime.getAssignment(slug, sessionId) === undefined)
        return invalidInput('Unknown Assignment Session');
      const outcome = await deps.runtime.setAssignmentArchived(slug, sessionId, archived);
      if (outcome.outcome === 'refused') return invalidInput(outcome.message);
      return { ok: true, value: { archived: outcome.outcome === 'archived' } };
    },
    async memoryMove(payload) {
      const input = asObject(payload);
      const slug = asSlug(payload);
      const location = input?.['location'];
      if (slug === undefined || (location !== null && typeof location !== 'string'))
        return invalidInput('slug and location (a folder, or null for the default) are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.runtime?.replaceOrchestrator === undefined)
        return invalidInput('Moving Memory is unavailable on this Host');
      const target = memoryMoveTarget(
        deps.registry,
        slug,
        typeof location === 'string' && location.trim() !== '' ? location.trim() : null,
      );
      if (!target.ok)
        return {
          ok: false,
          error: { code: target.code, message: target.message },
        };
      try {
        const bot = deps.registry.get(slug);
        if (deps.team && bot) deps.team.spaces.assertMemoryPath(botOwner(bot), slug, target.to);
      } catch (error) {
        if (error instanceof WorkspaceGrantError)
          return {
            ok: false,
            error: {
              code: error.code,
              message: error.code,
              ...(error.details ? { details: error.details } : {}),
            },
          };
        throw error;
      }
      if (target.to === target.from)
        return { ok: true, value: { memoryDir: target.from, moved: false } };
      try {
        if (deps.memory?.snapshot(slug).provisional === true)
          return {
            ok: false,
            error: {
              code: 'memory-conflict',
              message: 'Finish the Memory repair before moving Memory.',
            },
          };
      } catch {}
      let outcome;
      try {
        outcome = await deps.runtime.replaceOrchestrator(slug, (): MemoryMoveResult => {
          const moved = moveMemoryDirectory(target.from, target.to);
          try {
            deps.registry.setMemoryDir(slug, target.custom ? target.to : undefined);
          } catch (error) {
            moveMemoryDirectory(target.to, target.from);
            throw error;
          }
          return moved;
        });
      } catch (error) {
        return {
          ok: false,
          error: {
            code: 'memory-unavailable',
            message: `Memory was not moved: ${error instanceof Error ? error.message : String(error)}`,
          },
        };
      }
      if (outcome.outcome === 'refused')
        return {
          ok: false,
          error: { code: outcome.code, message: outcome.message },
        };
      return {
        ok: true,
        value: {
          memoryDir: target.to,
          moved: true,
          ...(outcome.value.leftover === undefined ? {} : { leftover: outcome.value.leftover }),
        },
      };
    },
    sessionOwner(payload) {
      const sessionId = asNonBlank(asObject(payload), 'sessionId');
      if (sessionId === undefined) return invalidInput('sessionId is required');
      const owned = deps.ownership.resolve(sessionId);
      if (owned === undefined || owned.parentSessionId !== undefined)
        return { ok: true, value: { owner: null } };
      const bot = deps.registry.get(owned.botSlug);
      if (bot === undefined) return { ok: true, value: { owner: null } };
      return {
        ok: true,
        value: {
          owner: {
            botSlug: bot.slug,
            displayName: bot.displayName,
            ...(bot.appearance === undefined ? {} : { appearance: bot.appearance }),
            ...(bot.avatarSeed === undefined ? {} : { avatarSeed: bot.avatarSeed }),
            ...(bot.avatar === undefined
              ? {}
              : {
                  avatar: bot.avatar.startsWith('data:image/')
                    ? botAvatarUrl(bot.slug, bot.avatar)
                    : bot.avatar,
                }),
            role: owned.rootRole,
          },
        },
      };
    },
    botSessionIds() {
      const privateSessions = deps.team?.bots.privateSessions(human);
      const groups = deps.registry
        .list()
        .filter((bot) => !privateSessions?.has(bot.slug))
        .map((bot) => ({
          botSlug: bot.slug,
          displayName: bot.displayName,
          sessionIds: deps.ownership
            .rootsFor(bot.slug)
            .filter((root) => deps.ownership.contentAvailable(root.sessionId))
            .map((root) => root.sessionId),
        }));
      return {
        ok: true,
        value: {
          sessionIds: groups.flatMap((group) => group.sessionIds),
          groups,
        },
      };
    },
    memoryFileTarget(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      const path = source['path'];
      if (slug === undefined || typeof path !== 'string')
        return invalidInput('slug and path are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      return memoryCall(() => ({
        target: deps.memory!.fileTarget(slug, path),
      }));
    },
    memoryImage(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          path: z.string().min(1),
          source: z.string().min(1),
          revision: z.string().min(1),
          reference: z.string().optional(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return invalidInput('slug, path, source and revision are required');
      const { slug, path, source, revision, reference } = input.data;
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      return memoryCall(() => {
        const bytes =
          reference === undefined
            ? deps.memory!.imageFile(slug, path, source, revision)
            : deps.memory!.markdownImageFile(slug, path, source, revision, reference);
        return { mime: inspectImage(bytes).mime, dataBase64: bytes.toString('base64') };
      });
    },
    memorySnapshot(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      return memoryCall(() => ({
        snapshot: deps.memory!.snapshot(scope.botSlug),
      }));
    },
    memoryFile(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const path = asNonBlank(asObject(payload), 'path');
      if (path === undefined) return invalidInput('path is required');
      return memoryCall(() => {
        const file = deps.memory!.readAccepted(scope.botSlug, path);
        return file === undefined ? {} : { file };
      });
    },
    memoryHistory(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      return memoryCall(() => ({
        commits: deps.memory!.history(scope.botSlug),
      }));
    },
    memoryDiff(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const sha = asNonBlank(asObject(payload), 'sha');
      if (sha === undefined || !/^[0-9a-f]{40}$/u.test(sha))
        return invalidInput('valid sha is required');
      return memoryCall(() => deps.memory!.diff(scope.botSlug, sha));
    },
    memoryGitGraph(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const offset = asObject(payload)['offset'];
      if (
        offset !== undefined &&
        (!Number.isInteger(offset) || Number(offset) < 0 || Number(offset) > 10_000)
      )
        return invalidInput('valid offset is required');
      const path = asObject(payload)['path'];
      if (path !== undefined && (typeof path !== 'string' || path.trim() === ''))
        return invalidInput('valid path is required');
      return memoryCall(() =>
        deps.memory!.gitGraph(scope.botSlug, Number(offset ?? 0), path as string | undefined),
      );
    },
    memoryGitCommitDiff(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const sha = asNonBlank(asObject(payload), 'sha');
      if (sha === undefined || !/^[0-9a-f]{40}$/u.test(sha))
        return invalidInput('valid sha is required');
      return memoryCall(() => deps.memory!.gitCommitDiff(scope.botSlug, sha));
    },
    memoryWorkingChanges(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      return memoryCall(() => ({
        changes: deps.memory!.workingChanges(scope.botSlug),
      }));
    },
    memoryWorkingDiff(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const source = asObject(payload);
      const path = asNonBlank(source, 'path');
      const kind = source['kind'];
      if (
        path === undefined ||
        !['staged', 'unstaged', 'untracked', 'current'].includes(String(kind))
      ) {
        return invalidInput('valid path and kind are required');
      }
      return memoryCall(() =>
        deps.memory!.workingDiff(scope.botSlug, path, kind as MemoryWorkingKind),
      );
    },
    memoryRecoveryHistory(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      return memoryCall(() => ({
        checkpoints: deps.memory!.recoveryHistory(scope.botSlug),
      }));
    },
    memoryRestore(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const source = asObject(payload);
      const checkpointId = asNonBlank(source, 'checkpointId');
      const expectedCurrentId = asNonBlank(source, 'expectedCurrentId');
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
      if (
        checkpointId === undefined ||
        expectedCurrentId === undefined ||
        !uuid.test(checkpointId) ||
        !uuid.test(expectedCurrentId)
      )
        return invalidInput('valid checkpointId and expectedCurrentId are required');
      return memoryCall(() =>
        deps.memory!.restoreHuman(human, {
          botSlug: scope.botSlug,
          checkpointId,
          expectedCurrentId,
        }),
      );
    },
    memorySave(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const source = asObject(payload);
      const path = asNonBlank(source, 'path');
      const body = source['body'];
      const expectedHead = asNonBlank(source, 'expectedHead');
      const editId = asNonBlank(source, 'editId');
      if (
        path === undefined ||
        typeof body !== 'string' ||
        expectedHead === undefined ||
        editId === undefined ||
        !/^[0-9a-f]{40}$/u.test(expectedHead) ||
        editId.length > 100
      ) {
        return invalidInput('path, body, expectedHead, and editId are required');
      }
      return memoryCall(() => ({
        commit: deps.memory!.saveHuman(human, {
          botSlug: scope.botSlug,
          path,
          body,
          expectedHead,
          editId,
        }),
      }));
    },
    memoryRestoreCommit(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const source = asObject(payload);
      const sha = asNonBlank(source, 'sha');
      const expectedHead = asNonBlank(source, 'expectedHead');
      const restoreId = asNonBlank(source, 'restoreId');
      const name = source['name'];
      if (
        (name !== undefined &&
          (typeof name !== 'string' || name.length > 60 || /[\r\n]/u.test(name))) ||
        sha === undefined ||
        expectedHead === undefined ||
        restoreId === undefined ||
        !/^[0-9a-f]{40}$/u.test(sha) ||
        !/^[0-9a-f]{40}$/u.test(expectedHead) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(restoreId)
      )
        return invalidInput('valid sha, expectedHead, restoreId, and name are required');
      return memoryCall(() =>
        deps.memory!.restoreCommitHuman(human, {
          botSlug: scope.botSlug,
          sha,
          expectedHead,
          restoreId,
          ...(name === undefined ? {} : { name }),
        }),
      );
    },
    memoryVersions(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      return memoryCall(() => ({
        versions: deps.memory!.versions(scope.botSlug),
      }));
    },
    memoryNameVersion(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const source = asObject(payload);
      const sha = asNonBlank(source, 'sha');
      const name = asNonBlank(source, 'name');
      if (
        sha === undefined ||
        name === undefined ||
        !/^[0-9a-f]{40}$/u.test(sha) ||
        name.length > 60
      )
        return invalidInput('valid sha and name are required');
      return memoryCall(() => ({
        version: deps.memory!.nameVersionHuman({
          botSlug: scope.botSlug,
          sha,
          name,
        }),
      }));
    },
    memoryRemoveVersionName(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const tag = asNonBlank(asObject(payload), 'tag');
      if (tag === undefined || tag.length > 200) return invalidInput('valid tag is required');
      return memoryCall(() => {
        deps.memory!.removeVersionNameHuman({ botSlug: scope.botSlug, tag });
        return { removed: true as const };
      });
    },
    memoryRepair(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const source = asObject(payload);
      const expectedHead = asNonBlank(source, 'expectedHead');
      const repairId = asNonBlank(source, 'repairId');
      if (
        expectedHead === undefined ||
        repairId === undefined ||
        !/^[0-9a-f]{40}$/u.test(expectedHead) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(repairId)
      )
        return invalidInput('valid expectedHead and repairId are required');
      return memoryCall(() => ({
        repair: deps.memory!.repairHuman(human, {
          botSlug: scope.botSlug,
          expectedHead,
          repairId,
        }),
      }));
    },
    async overviewMemory(payload) {
      const after = asObject(payload)['after'];
      if (
        after !== undefined &&
        (typeof after !== 'string' || after.length === 0 || after.length > 255)
      )
        return invalidInput('Overview Memory requires an optional Bot cursor');
      if (deps.memory?.overviewActivity === undefined)
        return {
          ok: false,
          error: {
            code: 'storage-unavailable',
            message: 'Memory statistics unavailable',
          },
        };
      return { ok: true, value: await deps.memory.overviewActivity(after) };
    },
    usageByMember(payload) {
      const period = asObject(payload)['period'];
      if (!isUsageOverviewPeriod(period)) return invalidInput('period-invalid');
      if (!deps.team) return unavailable();
      try {
        let names: Map<string, string> | undefined;
        return {
          ok: true,
          value: deps.team.usageByMember(human, period, deps.usage, (slug) => {
            names ??= new Map(
              globalRegistry.listHistorical().map((bot) => [bot.slug, bot.displayName]),
            );
            return names.get(slug) ?? slug;
          }),
        };
      } catch (error) {
        return modelFailure(error);
      }
    },
    overviewUsage(payload) {
      const source = asObject(payload);
      const period = source['period'];
      const after = source['after'];
      if (
        !isUsageOverviewPeriod(period) ||
        (after !== undefined &&
          (typeof after !== 'string' || after.length === 0 || after.length > 255))
      )
        return invalidInput(
          `Overview usage requires a period of ${usageOverviewPeriods.join(', ')} and an optional Bot cursor`,
        );
      if (deps.usage === undefined)
        return {
          ok: false,
          error: {
            code: 'storage-unavailable',
            message: 'Usage statistics unavailable',
          },
        };
      try {
        const memberSlugs = !isHostOwner()
          ? deps.registry.listHistorical().map((bot) => bot.slug)
          : undefined;
        const result = deps.usage.overview(period, after, memberSlugs);
        return {
          ok: true,
          value: {
            ...result,
            bots: result.bots.map((row) => {
              const bot = deps.registry.get(row.slug);
              const historical = deps.registry.getHistorical(row.slug);
              return {
                ...row,
                displayName: historical?.displayName ?? row.slug,
                current: bot !== undefined,
                primaryColor:
                  bot === undefined
                    ? historicalBotPrimaryColor(row.slug, historical?.primaryColor).retained!
                    : resolveBotPrimaryColor({
                        ...bot,
                        primaryColor: currentBotPrimaryColor(bot.primaryColor),
                      }).color,
              };
            }),
          },
        };
      } catch (error) {
        if (error instanceof OperationalDatabaseError)
          return {
            ok: false,
            error: {
              code: 'storage-unavailable',
              message: 'Usage statistics unavailable',
            },
          };
        throw error;
      }
    },
    profileUsage(payload) {
      const scope = dmMemory(payload, true);
      if (!('botSlug' in scope)) return scope;
      const parsed = usageFilterSchema.safeParse(asObject(payload)['filter']);
      if (!parsed.success || parsed.data.end > (localDay(new Date().toISOString()) ?? ''))
        return invalidInput('Usage filter requires real dates within a 182-day non-future range');
      if (deps.usage === undefined) return unavailable();
      try {
        return {
          ok: true,
          value: deps.usage.query(scope.botSlug, parsed.data),
        };
      } catch (error) {
        if (error instanceof OperationalDatabaseError) return unavailable();
        throw error;
      }
    },
    async profileSessionUsage(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      if (deps.usage === undefined || deps.readUsageSessionLog === undefined) return unavailable();
      try {
        const slug = scope.botSlug;
        const weeks = 26;
        const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString();
        const assignments = new Map(
          (deps.runtime?.listAssignments(slug) ?? []).map((entry) => [entry.sessionId, entry]),
        );
        const roots = deps.ownership.rootsFor(slug);
        const resumed =
          deps.runtime?.currentOrchestratorSessionId === undefined
            ? undefined
            : (deps.runtime.currentOrchestratorSessionId(slug) ?? null);
        const orchestrator = roots
          .filter(
            (root) =>
              root.rootRole === 'orchestrator' &&
              (resumed === undefined || root.sessionId === resumed),
          )
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, 1);
        const updatedAt = (root: (typeof roots)[number]) =>
          assignments.get(root.sessionId)?.updatedAt ?? root.createdAt;
        const recent = roots
          .filter((root) => root.rootRole === 'assignment')
          .sort((left, right) => updatedAt(right).localeCompare(updatedAt(left)))
          .slice(0, 5);
        const rows: ProfileSessionUsage['rows'] = [];
        for (const root of [...orchestrator, ...recent]) {
          const summary = await deps.usage.sessionSummary(
            slug,
            root.sessionId,
            since,
            deps.readUsageSessionLog,
          );
          rows.push({
            ...summary,
            sessionId: root.sessionId,
            role: root.rootRole,
            label: assignments.get(root.sessionId)?.title.slice(0, 160) ?? root.rootRole,
            updatedAt: updatedAt(root),
          });
        }
        const current = dmMemory(payload);
        if (!('botSlug' in current) || current.botSlug !== slug) return unavailable();
        return { ok: true, value: { slug, weeks, since, rows } };
      } catch (error) {
        if (error instanceof OperationalDatabaseError) return unavailable();
        throw error;
      }
    },
    async profileActivity(payload) {
      const scope = dmMemory(payload, true);
      if (!('botSlug' in scope)) return scope;
      const slug = scope.botSlug;
      const source = asObject(payload);
      const before = source['before'];
      const requestedWeeks = source['weeks'];
      if (
        before !== undefined &&
        (typeof before !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(before))
      )
        return invalidInput('before must be a YYYY-MM-DD day');
      if (
        requestedWeeks !== undefined &&
        (typeof requestedWeeks !== 'number' ||
          !Number.isInteger(requestedWeeks) ||
          requestedWeeks < 1 ||
          requestedWeeks > 104)
      )
        return invalidInput('weeks must be an integer from 1 to 104');
      const weeks = requestedWeeks ?? 26;
      const end = before === undefined ? undefined : localMidnight(before);
      const since = new Date(
        (end?.getTime() ?? Date.now()) - weeks * 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const beforeEnd = <T extends { at: string }>(entries: readonly T[]): T[] =>
        end === undefined ? [...entries] : entries.filter((entry) => new Date(entry.at) < end);
      const events = beforeEnd(deps.channels.admissionActivity?.(slug, since) ?? []);
      let memoryActivity: Array<{ at: string }> = [];
      try {
        memoryActivity = (await deps.memory?.activity?.(slug, since)) ?? [];
      } catch (error) {
        if (deps.registry.get(slug) !== undefined) throw error;
      }
      const commits = beforeEnd(memoryActivity);
      const usageRows = (deps.usage?.activity(slug, since) ?? []).filter(
        (row) => before === undefined || row.day < before,
      );
      const idleCompactions: IdleCompactionRecord[] = beforeEnd(
        deps.usage?.idleCompactions?.(slug, since) ?? [],
      );
      const createdDay = localDay(deps.registry.getHistorical(slug)?.createdAt ?? '');
      const tokensByDay = new Map<string, ProfileActivityTokensDay>();
      const tokenTotals: ProfileTokenBuckets = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };
      for (const row of usageRows) {
        const day = tokensByDay.get(row.day) ?? {
          day: row.day,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        };
        day.inputTokens += row.inputTokens;
        day.outputTokens += row.outputTokens;
        day.cacheReadTokens += row.cacheReadTokens;
        day.cacheWriteTokens += row.cacheWriteTokens;
        tokensByDay.set(row.day, day);
        tokenTotals.inputTokens += row.inputTokens;
        tokenTotals.outputTokens += row.outputTokens;
        tokenTotals.cacheReadTokens += row.cacheReadTokens;
        tokenTotals.cacheWriteTokens += row.cacheWriteTokens;
      }
      return {
        ok: true,
        value: {
          slug,
          weeks,
          since,
          ...(before === undefined ? {} : { before }),
          ...(createdDay === undefined ? {} : { createdDay }),
          today: localDay(new Date().toISOString()) ?? '',
          events: bucketByReason(events),
          memoryCommits: bucketByDay(commits.map((entry) => entry.at)),
          tokens: [...tokensByDay.values()].sort((left, right) =>
            left.day.localeCompare(right.day),
          ),
          tokenTotals,
          modelUsageRows: usageRows.map((row) => ({
            day: row.day,
            purpose: row.purpose,
            provider: row.provider,
            model: row.model,
            inputTokens: (row.unknownBuckets?.inputTokens ?? 0) > 0 ? null : row.inputTokens,
            outputTokens: (row.unknownBuckets?.outputTokens ?? 0) > 0 ? null : row.outputTokens,
            cacheReadTokens:
              (row.unknownBuckets?.cacheReadTokens ?? 0) > 0 ? null : row.cacheReadTokens,
            cacheWriteTokens:
              (row.unknownBuckets?.cacheWriteTokens ?? 0) > 0 ? null : row.cacheWriteTokens,
            ...(row.totalTokens === null ? { partial: true } : {}),
            totalTokens:
              row.totalTokens === null
                ? (row.reportedTotalTokens ?? 0) > 0
                  ? row.reportedTotalTokens!
                  : null
                : row.totalTokens === undefined
                  ? row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens
                  : row.totalTokens,
          })),
          modelUsageStatus: deps.usage === undefined ? 'unavailable' : 'ready',
          idleCompactions,
        },
      };
    },
    groupProfileActivity(payload) {
      const channelId = asNonBlank(asObject(payload), 'channelId');
      if (channelId === undefined || deps.channels.get(channelId)?.type !== 'group')
        return invalidInput('group channelId is required');
      return {
        ok: true,
        value: groupProfileActivity(deps.channels, channelId),
      };
    },
    rosterGet() {
      try {
        return { ok: true, value: deps.roster.snapshot() };
      } catch (error) {
        if (error instanceof RosterUnavailableError) return unavailable();
        throw error;
      }
    },
    async sectionCreate(payload) {
      const parsed = sectionCreatePayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid sectionCreate payload');
      const name = parsed.data.name.trim();
      if (name.length === 0) return invalidInput('name is required');
      return rosterWrite(async () => ({
        section: await deps.roster.sectionCreate(name),
      }));
    },
    async sectionRename(payload) {
      const parsed = sectionRenamePayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid sectionRename payload');
      const name = parsed.data.name.trim();
      if (name.length === 0) return invalidInput('name is required');
      return rosterWrite(async () => ({
        section: await deps.roster.sectionRename(parsed.data.sectionId, name),
      }));
    },
    async sectionRemove(payload) {
      const parsed = sectionRemovePayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid sectionRemove payload');
      return rosterWrite(async () => ({
        removed: await deps.roster.sectionRemove(parsed.data.sectionId),
      }));
    },
    async channelAssign(payload) {
      const parsed = channelAssignPayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid channelAssign payload');
      const { channelId, index } = parsed.data;
      const sectionId = parsed.data.sectionId ?? undefined;
      return rosterWrite(async () => {
        await deps.roster.channelAssign(channelId, sectionId, index);
        return {};
      });
    },
    async sectionReorder(payload) {
      const parsed = sectionReorderPayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid sectionReorder payload');
      return rosterWrite(async () => ({
        sectionOrder: await deps.roster.sectionReorder(parsed.data.order),
      }));
    },
    async topReorder(payload) {
      const parsed = topReorderPayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid topReorder payload');
      return rosterWrite(async () => ({
        topOrder: await deps.roster.topReorder(parsed.data.order),
      }));
    },
    async pinsSet(payload) {
      const parsed = pinsSetPayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid pinsSet payload');
      return rosterWrite(async () => ({
        pins: await deps.roster.pinsSet(parsed.data.pins),
      }));
    },
    async hiddenSet(payload) {
      const parsed = hiddenSetPayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid hiddenSet payload');
      return rosterWrite(async () => ({
        hidden: await deps.roster.hiddenSet(parsed.data.hidden),
      }));
    },
    async channelMuteSet(payload) {
      const parsed = channelMuteSetPayload.safeParse(payload);
      if (!parsed.success) return invalidInput('channelId and a boolean muted are required');
      const { channelId, muted } = parsed.data;
      if (muted && deps.channels.get(channelId) === undefined) return unknownChannel(channelId);
      return rosterWrite(async () => ({
        muted: await deps.roster.mutedSet(channelId, muted),
      }));
    },
    async rosterBatch(payload) {
      const parsed = rosterBatchPayload.safeParse(payload);
      if (!parsed.success) {
        return invalidInput(`rosterBatch requires 1–${MAX_ROSTER_BATCH_SIZE} distinct channel ids`);
      }
      const { action, channelIds, sectionId } = parsed.data;
      if (action !== 'move' && sectionId !== undefined) {
        return invalidInput('sectionId is only valid for a rosterBatch move');
      }
      const channels = deps.channels
        .list()
        .filter((channel) => !deps.team || deps.team.channelAccess.canRead(human, channel.id));
      const known = new Set([
        ...channels.map((channel) => channel.id),
        ...deps.registry.list().map((bot) => bot.slug),
        ...(deps.team?.bots.reachable(human).map((bot) => bot.slug) ?? []),
        ...channels.flatMap((channel) =>
          channel.type === 'dm' && channel.botSlug !== undefined ? [channel.botSlug] : [],
        ),
      ]);
      if (channelIds.some((id) => !known.has(id))) {
        return invalidInput('rosterBatch contains an unknown Channel');
      }
      const aliases = new Map(
        channels.flatMap((channel) =>
          channel.type === 'dm' && channel.botSlug !== undefined
            ? [[channel.botSlug, channel.id] as const]
            : [],
        ),
      );
      const change =
        action === 'move'
          ? { action, channelIds, ...(sectionId == null ? {} : { sectionId }) }
          : { action, channelIds };
      return rosterWrite(() => deps.roster.applyBatch(change, (pin) => aliases.get(pin) ?? pin));
    },
    developerModeSet(payload) {
      const enabled = asObject(payload)['enabled'];
      if (typeof enabled !== 'boolean') return invalidInput('enabled is required');
      deps.developerMode?.set(enabled);
      return {
        ok: true,
        value: { accepted: deps.developerMode !== undefined },
      };
    },
  };
  const scoped = new Set<string>(MEMBER_CHANNEL_METHODS);
  return new Proxy(methods, {
    get(target, key, receiver) {
      const method: unknown = Reflect.get(target, key, receiver);
      if (typeof method !== 'function' || typeof key !== 'string' || !deps.team) return method;
      return (payload: unknown, ...args: unknown[]) => {
        try {
          const input = asObject(payload);
          const id = asNonBlank(input, 'channelId');
          if (
            scoped.has(key) &&
            id &&
            (!isHostOwner() || deps.channels.get(id)) &&
            !deps.team!.channelAccess.canRead(human, id, key === 'channelSendStatus')
          )
            throw new TeamError('channel-not-found');
          if (key === 'channelCreate') {
            deps.team!.roles.require(human, 'channels.create');
            if (Array.isArray(input['members']))
              for (const slug of input['members'])
                if (typeof slug === 'string') {
                  deps.team!.bots.requireReach(human, slug);
                  const bot = globalRegistry.get(slug);
                  if (bot && botOwner(bot) !== human.humanId)
                    throw new TeamError('bot-principal-channel-denied', undefined, { slug });
                  if (bot && !deps.team!.bots.view(human, slug).switches.joinPrincipalChannels)
                    throw new TeamError('bot-channel-join-disabled', undefined, { slug });
                }
          }
          if (
            id &&
            deps.channels.get(id)?.type === 'group' &&
            ['channelRename', 'channelGroupAvatarSet'].includes(key)
          )
            deps.team!.channelAccess.requirePolicy(human, id, 'editDetails');
          if (
            id &&
            deps.channels.get(id)?.type === 'group' &&
            key === 'channelGroupInvite' &&
            typeof input['botSlug'] === 'string'
          )
            deps.team!.bots.requireAdd(human, input['botSlug'], id);
          if (id && deps.channels.get(id) && key === 'channelSend') {
            deps.team!.channelAccess.requirePolicy(human, id, 'post');
            if (input['allBotMention'] !== undefined)
              deps.team!.channelAccess.requirePolicy(human, id, 'mentionAll');
            if (Array.isArray(input['channelRefs']))
              for (const ref of input['channelRefs']) {
                const refId = asNonBlank(asObject(ref), 'channelId');
                if (refId && !deps.team!.channelAccess.canRead(human, refId))
                  throw new TeamError('channel-not-found');
              }
          }
          const result: unknown = Reflect.apply(method, target, [payload, ...args]);
          if (
            key === 'channelGroupInvite' &&
            id &&
            typeof input['botSlug'] === 'string' &&
            asObject(result)['ok'] === true
          )
            deps.team!.bots.recordAdder(human, input['botSlug'], id);
          if (result instanceof Promise)
            return result.catch((error: unknown) => {
              if (error instanceof TeamError)
                return {
                  ok: false,
                  error: {
                    code: error.code,
                    message: error.code,
                    ...(error.details ? { details: error.details } : {}),
                  },
                };
              throw error;
            });
          return result;
        } catch (error) {
          if (error instanceof TeamError)
            return {
              ok: false,
              error: {
                code: error.code,
                message: error.code,
                ...(error.details ? { details: error.details } : {}),
              },
            };
          throw error;
        }
      };
    },
  });
}

function localMidnight(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year!, month! - 1, date!);
}

function localDay(at: string): string | undefined {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return undefined;
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function bucketByDay(instants: readonly string[]): ProfileActivityDay[] {
  const counts = new Map<string, number>();
  for (const at of instants) {
    const day = localDay(at);
    if (day === undefined) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts]
    .map(([day, count]) => ({ day, count }))
    .sort((left, right) => left.day.localeCompare(right.day));
}

function bucketByReason(
  entries: ReadonlyArray<{ at: string; reason: string }>,
): ProfileActivityReasonDay[] {
  const counts = new Map<string, Map<string, number>>();
  for (const entry of entries) {
    const day = localDay(entry.at);
    if (day === undefined) continue;
    const reasons = counts.get(day) ?? new Map<string, number>();
    reasons.set(entry.reason, (reasons.get(entry.reason) ?? 0) + 1);
    counts.set(day, reasons);
  }
  return [...counts]
    .flatMap(([day, reasons]) => [...reasons].map(([reason, count]) => ({ day, reason, count })))
    .sort((left, right) => left.day.localeCompare(right.day));
}
