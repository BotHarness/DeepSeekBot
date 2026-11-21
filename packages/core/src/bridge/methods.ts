import {
  createPersonaBotsBridgeMethods,
  type PersonaBotsBridgeMethods,
  detail,
} from '../features/personabots/methods.js';
import { createHumansBridgeMethods, type HumansBridgeMethods } from '../features/humans/methods.js';
import {
  createTeamBridgeMethods,
  type TeamBridgeMethods,
  createTeamBridge,
} from '../features/team/methods.js';
import {
  remoteChannelAvailability,
  remoteChannelContact,
} from '../features/environments/methods.js';
import { createCloudBridgeMethods, type CloudBridgeMethods } from '../features/cloud/methods.js';
import {
  createActivityBridgeMethods,
  type ActivityBridgeMethods,
  localDay,
} from '../features/activity/methods.js';
export type {
  ActivityOverview,
  ProfileActivityDay,
  ProfileActivityReasonDay,
  ProfileTokenBuckets,
  ProfileActivityTokensDay,
  ProfileModelUsageRow,
  ProfileActivity,
} from '../features/activity/methods.js';
import {
  createMessagingBridgeMethods,
  type MessagingBridgeMethods,
  createMessagingCall,
} from '../features/messaging/methods.js';
export type { MessagingAppsView } from '../features/messaging/methods.js';
import {
  createSessionsBridgeMethods,
  type SessionsBridgeMethods,
} from '../features/sessions/methods.js';
export type {
  IdleCompactionView,
  IdleCompactionDeps,
  SessionEngineQuota,
  OwnedSessionSummary,
  OwnedSessionBot,
} from '../features/sessions/methods.js';
import type { IdleCompactionDeps, SessionEngineQuota } from '../features/sessions/methods.js';
import {
  createAssignmentsBridgeMethods,
  type AssignmentsBridgeMethods,
  type AssignmentsBridgeDeps,
} from '../features/assignments/methods.js';
export { SESSION_PROGRESS_LIMIT } from '../features/assignments/methods.js';
export type { SessionProgressEntry } from '../features/assignments/methods.js';
import {
  createMemoryBridgeMethods,
  type MemoryBridgeMethods,
  type MemoryBridgeDeps,
} from '../features/memory/methods.js';
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
import { createModelRoutingHelpers } from '../features/models/routing.js';
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

import { MEMBER_CHANNEL_METHODS } from '../team/member-methods.js';
import type { TeamChannels } from '../team/channels.js';
import { guardHumanBridge } from '../team/bridge-access.js';
import { botOwner, privateBotRegistry } from '../team/bot-access.js';
import { privateBotCreations } from '../bots/creation.js';
import { createHash } from 'node:crypto';

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
import type { BotContact } from '../runtime/bot-contact-discovery.js';
import { BotNetworkDeliveryError } from '../runtime/bot-network.js';
import { join } from 'node:path';
import { GenuiError, parseGenuiContent, validateGenuiMessageReply } from '../channels/genui.js';
import { buildGenuiReplyContext } from '../channels/genui-message.js';
import { createBotImports, type BotImportsService } from '../bots/imports.js';
import { SessionRecoveryError } from '../runtime/session-recovery.js';
import type { BotContextWindow } from '../runtime/context-window.js';
import { summarizeTurnInput, type TurnInputView } from '../runtime/prompt-inspection.js';

import { type CloudWork } from '../cloud/work.js';

import type { CloudConnections } from '../cloud/connections.js';

import {
  ChannelManagementError,
  type ChannelManagementService,
  type ChannelManagementResult,
} from '../channels/management.js';

import { BotZipUploadError } from '../bots/zip-upload.js';
import { validBotCreationKey, type BotCreationService } from '../bots/creation.js';
import { TobError, type TobHome, type TobService } from '../tob/service.js';
import type { BotOnboarding } from '../onboarding/service.js';
import type { ClientAcknowledgements } from '../onboarding/acknowledgements.js';

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

import type { GroupMemberWakePolicy } from '../channels/channel.js';
import {
  parseAllBotMention,
  expandAllBotMention,
  assertAllBotPreview,
  AllBotPreviewChangedError,
  type AllBotPreview,
  type AllBotMention,
} from '../channels/all-bot-mention.js';
import {
  isUsageOverviewPeriod,
  usageOverviewPeriods,
  type UsageOverviewBuckets,
  type UsageOverviewResult,
} from '../usage/overview.js';
import { markAllHumanMessagesRead } from '../channels/mark-all-read.js';
import { channelPreviewMessage } from '../channels/channel-notice.js';

import { externalMemberWake, messagingDefaultsPlatform } from '../messaging/defaults.js';

import type { OutboundMessaging } from '../messaging/outbound.js';

import { OperationalDatabaseError } from '../database/owner.js';
import type { InstallReceipts } from '../marketplace/install-receipts.js';

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
  type TelemetrySurface,
} from '../telemetry/events.js';
import type { TelemetryCapture, TelemetryStatus } from '../telemetry/service.js';
import { AssignmentReplyTargetError } from '../runtime/assignment-human-context.js';
import type { SessionLiveSnapshot, SessionLiveStreams } from '../runtime/session-live.js';
import { type PresentToolResult } from '../runtime/session-tool-detail.js';
import { type PublicToolCall } from '../runtime/assignment-timeline.js';
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
  type ChannelMention,
  type ChannelMessage,
  type ChannelReaction,
  type ChannelRecord,
  type ChannelReference,
  type ChannelSkillInvocation,
  type ChannelSkillInvocationToken,
} from '../channels/channel.js';

import { type BotBannerSummary } from '../bots/banner-http.js';
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
import type { ChannelChangeCursor, ChannelTimelinePage } from '../channels/timeline.js';
import type { PersonaBotRecord } from '../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { PersonaBotDeletions } from '../bots/deletion.js';
import {
  DataResetError,
  type DataReset,
  type DataResetPreview,
  type DataResetResult,
} from '../data-reset/reset.js';
import { SkillContentTooLargeError, skillOwnerKey, type ResolvedSkill } from '../skills/catalog.js';

import { isValidSlug } from '../bots/slug.js';
import { RosterStore, RosterUnavailableError } from '../roster/store.js';

import type { SessionOwnership, SessionRootRole } from '../sessions/ownership.js';
import type {
  UsageProjection,
  DshUsageSessionLogReader,
  SessionUsageSummary,
} from '../usage/usage.js';
import { usageFilterSchema, type UsageQueryResult } from '../usage/query.js';
import { type PersonaBotModelPlan } from '../models/presets.js';

import { type MemoryFileTarget } from '../memory/file-actions.js';
import { type StandingLimits } from '../memory/soul.js';
import { WorkspaceGrantError } from '../workspaces/grants.js';
import {
  FolderBrowseError,
  type FolderBrowser,
  type FolderListing,
} from '../workspaces/folder-browse.js';
import type { ChannelToolApproval } from '../workspaces/tool-approval.js';
import type { BotAttentionQuery } from '../runtime/attention.js';
import type { BotSourcePolicyStore } from '../runtime/source-policy.js';
import { probeGit } from '../memory/git-probe.js';
import type { GitService, GitStatus } from '../memory/managed-git.js';
import {
  type HumanAttentionQuery,
  type HumanAttentionDecisions,
} from '../runtime/human-attention.js';
import { DirectBotToolError } from '../runtime/bot-runtime.js';
import { GenuiDiagramError } from '../runtime/genui-diagram.js';
import { GenuiPreviewError } from '../runtime/genui-preview.js';
import { ChannelCallReadError } from '../channels/call-window.js';
import type { BotRuntime, DirectBotToolSpec, DmAdmissionFailure } from '../runtime/bot-runtime.js';
import type { AggregatedState, BotStateTracker, SessionState } from '../state/bot-state.js';
import { MIN_PHONE_APP_VERSION } from '../devices/client-compat.js';

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
    WorkspacesBridgeMethods,
    SessionsBridgeMethods,
    AssignmentsBridgeMethods,
    MemoryBridgeMethods,
    MessagingBridgeMethods,
    ActivityBridgeMethods,
    CloudBridgeMethods,
    PersonaBotsBridgeMethods,
    HumansBridgeMethods {
  tobHome(
    payload: unknown,
  ): Promise<
    BridgeResult<
      (TobHome & { attention?: { unreadCount: number; hasAction: boolean } }) | { available: false }
    >
  >;
  acknowledgements(payload: unknown): BridgeResult<{ items: Record<string, string> }>;
  acknowledge(payload: unknown): BridgeResult<{ key: string; value: string }>;
  telemetryEvent(payload: unknown): BridgeResult<null>;
  channelRetry(payload: unknown): Promise<BridgeResult<{ accepted: true }>>;
  sessionMessageSend(payload: unknown): Promise<BridgeResult<{ sourceEventId: string }>>;

  dataResetPreview(): BridgeResult<{ preview: DataResetPreview }>;
  dataResetConfirm(payload: unknown): BridgeResult<{ reset: DataResetResult }>;

  ping(payload: unknown): BridgeResult<{ ok: true; version?: string; minAppVersion: string }>;

  composerValidate(payload: unknown): BridgeResult<{
    reply?: ChannelMessage;
    attachments: Array<ChannelAttachmentRef | null>;
    quotes?: Array<ChannelMessage | null>;
  }>;

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

  sessionLive(payload: unknown): Promise<BridgeResult<{ sessionId: string } & SessionLiveSnapshot>>;
  workspaceOptions(payload: unknown): BridgeResult<{
    workspaces: { id: string; path: string; title: string }[];
  }>;
  workspaceFileTarget(payload: unknown): BridgeResult<{
    target: { path: string; relativePath: ''; kind: 'directory' };
  }>;
  folderBrowse(payload: unknown): Promise<BridgeResult<FolderListing>>;
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
  messageAttachmentTarget(payload: unknown): BridgeResult<{ target: MemoryFileTarget }>;

  profileSessionUsage(payload: unknown): Promise<BridgeResult<ProfileSessionUsage>>;

  overviewUsage(payload: unknown): BridgeResult<OverviewUsage>;
  profileUsage(payload: unknown): BridgeResult<UsageQueryResult>;

  developerModeSet(payload: unknown): BridgeResult<{ accepted: boolean }>;
  botModes: BotModeBridgeMethods['botModes'];
  botModeDefaultSet: BotModeBridgeMethods['botModeDefaultSet'];
  botModeSet: BotModeBridgeMethods['botModeSet'];
  botModeTemplateSave: BotModeBridgeMethods['botModeTemplateSave'];
  botModeTemplateDelete: BotModeBridgeMethods['botModeTemplateDelete'];
  botModeTemplateSet: BotModeBridgeMethods['botModeTemplateSet'];

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
    WorkspacesBridgeDeps,
    AssignmentsBridgeDeps,
    MemoryBridgeDeps {
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

function releaseUnavailable(): BridgeResult<never> {
  return {
    ok: false,
    error: {
      code: 'release-unavailable',
      message: 'Release information is unavailable',
    },
  };
}

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

const DIRECT_TOOL_TIMEOUT_MS = 10 * 60_000;

function directToolsUnavailable(): BridgeResult<never> {
  return {
    ok: false,
    error: {
      code: 'unavailable',
      message: 'Direct Bot tools are unavailable on this Host',
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
  const { requireRoutes } = modelRouting;
  const allowed = (record: PersonaBotRecord): boolean =>
    botModelAllowed(
      deps.team,
      record,
      deps.defaultModel?.currentSelection() ?? deps.modelCatalog?.defaultRoute?.(),
    );
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
    const remoteContact = remoteChannelContact(deps.runtime, channel);
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
            remoteAvailability: remoteChannelAvailability(deps.runtime, channel.remoteBot),
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
  const messagingCall = createMessagingCall(deps);
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
  const sessionsMethods = createSessionsBridgeMethods(human, deps, botInChannel);
  const assignmentsMethods = createAssignmentsBridgeMethods(human, deps);
  const memoryMethods = createMemoryBridgeMethods(human, deps, dmMemory);
  const cloudMethods = createCloudBridgeMethods(deps);
  const activityMethods = createActivityBridgeMethods(human, deps, dmMemory);
  const messagingMethods = createMessagingBridgeMethods(deps, messagingCall);
  const teamMethods = createTeamBridgeMethods(human, deps, globalRegistry);
  const humansMethods = createHumansBridgeMethods(human, deps, channelView);
  const personabotsMethods = createPersonaBotsBridgeMethods(
    human,
    deps,
    isHostOwner,
    runnerOf,
    allowed,
    requireOwnedBot,
    detailOf,
    createBotId,
    sendReceipt,
    modelRouting,
  );
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
    channelBridges: messagingMethods.channelBridges,
    channelIngests: messagingMethods.channelIngests,
    channelIngest: messagingMethods.channelIngest,
    channelBridge: messagingMethods.channelBridge,
    messagingChannelTarget: messagingMethods.messagingChannelTarget,
    messagingThreadPolicy: messagingMethods.messagingThreadPolicy,
    messagingGroupPolicy: messagingMethods.messagingGroupPolicy,
    messagingReceive: messagingMethods.messagingReceive,
    messagingSource: messagingMethods.messagingSource,
    failureAlertsSet: messagingMethods.failureAlertsSet,
    failureAlertsTest: messagingMethods.failureAlertsTest,
    failureAlertsRetry: messagingMethods.failureAlertsRetry,
    approvalRoute: approvalsMethods.approvalRoute,
    approvalTest: approvalsMethods.approvalTest,
    questionRetry: approvalsMethods.questionRetry,
    approvalRetry: approvalsMethods.approvalRetry,
    senderAccess: messagingMethods.senderAccess,
    pairingReview: messagingMethods.pairingReview,
    messagingIdentity: messagingMethods.messagingIdentity,
    messagingDefaults: messagingMethods.messagingDefaults,
    messagingDefaultsSet: messagingMethods.messagingDefaultsSet,
    cloudWork: cloudMethods.cloudWork,
    cloudConnections: cloudMethods.cloudConnections,
    messagingApps: messagingMethods.messagingApps,
    messagingSnapshot: messagingMethods.messagingSnapshot,
    messagingReachable: messagingMethods.messagingReachable,
    messagingPostRequest: messagingMethods.messagingPostRequest,
    messagingPostConversation: messagingMethods.messagingPostConversation,
    messagingPostLimit: messagingMethods.messagingPostLimit,
    messagingTargets: messagingMethods.messagingTargets,
    messagingAuthorize: messagingMethods.messagingAuthorize,
    messagingRevoke: messagingMethods.messagingRevoke,
    messagingConversation: messagingMethods.messagingConversation,
    messagingSend: messagingMethods.messagingSend,
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
    onboarding: personabotsMethods.onboarding,
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
    onboardingModel: personabotsMethods.onboardingModel,
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
    botNewSession: sessionsMethods.botNewSession,
    botCompact: sessionsMethods.botCompact,
    botContext: sessionsMethods.botContext,
    botSystemPrompt,
    channelBotStop: sessionsMethods.channelBotStop,
    botStop: sessionsMethods.botStop,
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
    sessionStop: sessionsMethods.sessionStop,
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
    deletionPreview: personabotsMethods.deletionPreview,
    deletionConfirm: personabotsMethods.deletionConfirm,
    deletionRetry: personabotsMethods.deletionRetry,
    deletionMemoryFolder: personabotsMethods.deletionMemoryFolder,
    ...modelPlan,
    list: personabotsMethods.list,
    channelActivityToday: activityMethods.channelActivityToday,
    activityOverview: activityMethods.activityOverview,
    activitySnapshot: activityMethods.activitySnapshot,
    get: personabotsMethods.get,
    create: personabotsMethods.create,
    createLookup: personabotsMethods.createLookup,
    ...marketplaceZip,
    botImportLookup: personabotsMethods.botImportLookup,
    botImportPreview: personabotsMethods.botImportPreview,
    createFromGit: personabotsMethods.createFromGit,
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
    update: personabotsMethods.update,
    pause: personabotsMethods.pause,
    resume: personabotsMethods.resume,
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
    idleCompaction: sessionsMethods.idleCompaction,
    idleCompactionSet: sessionsMethods.idleCompactionSet,
    idleCompactionCacheLifetimeSet: sessionsMethods.idleCompactionCacheLifetimeSet,
    compactionThresholdSet: sessionsMethods.compactionThresholdSet,
    standingLimitsSet: personabotsMethods.standingLimitsSet,
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
    humanIdentity: humansMethods.humanIdentity,
    composerIdentity: humansMethods.composerIdentity,
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
    humanNameSet: humansMethods.humanNameSet,
    humanAvatarSet: humansMethods.humanAvatarSet,
    humanProfileSetupFinish: humansMethods.humanProfileSetupFinish,
    humanAvatars: humansMethods.humanAvatars,
    channelHumanNameSet: humansMethods.channelHumanNameSet,
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
    botAttention: activityMethods.botAttention,
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
    botSourcePolicies: activityMethods.botSourcePolicies,
    botSourcePolicySet: activityMethods.botSourcePolicySet,
    botSourcePolicyReset: activityMethods.botSourcePolicyReset,
    humanAttention: activityMethods.humanAttention,
    humanAttentionStatus: activityMethods.humanAttentionStatus,
    channelUnreadCounts: activityMethods.channelUnreadCounts,
    humanAssignmentContext: assignmentsMethods.humanAssignmentContext,
    humanAttentionDismiss: activityMethods.humanAttentionDismiss,
    humanAttentionDismissAll: activityMethods.humanAttentionDismissAll,
    humanAttentionRestore: activityMethods.humanAttentionRestore,
    humanAttentionSnooze: activityMethods.humanAttentionSnooze,
    humanAttentionIgnore: activityMethods.humanAttentionIgnore,
    assignments: assignmentsMethods.assignments,
    channelAssignments: assignmentsMethods.channelAssignments,
    assignment: assignmentsMethods.assignment,
    assignmentTimeline: assignmentsMethods.assignmentTimeline,
    sessionProgress: assignmentsMethods.sessionProgress,
    sessionTranscript: sessionsMethods.sessionTranscript,
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
    sessionToolDetail: sessionsMethods.sessionToolDetail,
    sessionSubagents: assignmentsMethods.sessionSubagents,
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
    channelMediaTarget: messagingMethods.channelMediaTarget,
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
    assignmentAccessGet: assignmentsMethods.assignmentAccessGet,
    assignmentAccessSet: assignmentsMethods.assignmentAccessSet,
    toolApprovalRules: approvalsMethods.toolApprovalRules,
    toolApprovalRuleRevoke: approvalsMethods.toolApprovalRuleRevoke,
    toolApprovalHistory: approvalsMethods.toolApprovalHistory,
    toolApprovalStatus: approvalsMethods.toolApprovalStatus,
    toolApprovalDecide: approvalsMethods.toolApprovalDecide,
    toolAutoRejectionOverride: approvalsMethods.toolAutoRejectionOverride,
    userQuestionStatus: approvalsMethods.userQuestionStatus,
    userQuestionAnswer: approvalsMethods.userQuestionAnswer,
    botToolTrace: sessionsMethods.botToolTrace,
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
    sessions: sessionsMethods.sessions,
    sessionArchiveSet: sessionsMethods.sessionArchiveSet,
    memoryMove: memoryMethods.memoryMove,
    sessionOwner: sessionsMethods.sessionOwner,
    botSessionIds: sessionsMethods.botSessionIds,
    memoryFileTarget: memoryMethods.memoryFileTarget,
    memoryImage: memoryMethods.memoryImage,
    memorySnapshot: memoryMethods.memorySnapshot,
    memoryFile: memoryMethods.memoryFile,
    memoryHistory: memoryMethods.memoryHistory,
    memoryDiff: memoryMethods.memoryDiff,
    memoryGitGraph: memoryMethods.memoryGitGraph,
    memoryGitCommitDiff: memoryMethods.memoryGitCommitDiff,
    memoryWorkingChanges: memoryMethods.memoryWorkingChanges,
    memoryWorkingDiff: memoryMethods.memoryWorkingDiff,
    memoryRecoveryHistory: memoryMethods.memoryRecoveryHistory,
    memoryRestore: memoryMethods.memoryRestore,
    memorySave: memoryMethods.memorySave,
    memoryRestoreCommit: memoryMethods.memoryRestoreCommit,
    memoryVersions: memoryMethods.memoryVersions,
    memoryNameVersion: memoryMethods.memoryNameVersion,
    memoryRemoveVersionName: memoryMethods.memoryRemoveVersionName,
    memoryRepair: memoryMethods.memoryRepair,
    overviewMemory: memoryMethods.overviewMemory,
    usageByMember: teamMethods.usageByMember,
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
    profileActivity: activityMethods.profileActivity,
    groupProfileActivity: activityMethods.groupProfileActivity,
    rosterGet: personabotsMethods.rosterGet,
    sectionCreate: personabotsMethods.sectionCreate,
    sectionRename: personabotsMethods.sectionRename,
    sectionRemove: personabotsMethods.sectionRemove,
    channelAssign: personabotsMethods.channelAssign,
    sectionReorder: personabotsMethods.sectionReorder,
    topReorder: personabotsMethods.topReorder,
    pinsSet: personabotsMethods.pinsSet,
    hiddenSet: personabotsMethods.hiddenSet,
    channelMuteSet: personabotsMethods.channelMuteSet,
    rosterBatch: personabotsMethods.rosterBatch,
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
