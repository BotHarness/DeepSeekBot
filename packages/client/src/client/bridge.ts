import { MEMBER_METHODS } from '../../../core/src/team/member-methods.js';
import { isBotPrimaryColor } from '../../../core/src/bots/primary-color.js';
import { createPersonaBotReaders } from './features/personabots/bridge.js';
import { createChannelHumanNameBridge } from './features/humans/bridge.js';
import { createMemberBridgeGuard } from './features/team/bridge.js';
import type { ThreadReceptionInput } from '../../../core/src/messaging/thread-policy.js';
import { createSessionOwnerBridge, parseItems, finite } from './features/sessions/bridge.js';
import type { SessionLiveSnapshot } from './features/sessions/bridge.js';
import { createApprovalTemplateDeletionBridge } from './features/approvals/bridge.js';
import { createMarketplaceBridge } from './features/marketplace/bridge.js';
import { createGenuiReportBridge } from './features/genui/bridge.js';
import { createAvatarsBridge } from './features/avatars/bridge.js';
import { asRecord, unwrap, type BridgeCall } from './bridge-transport.js';
import { parseToolEffects } from '../../../core/src/workspaces/tool-effects-contract.js';
import {
  skillCatalogChangeSchema,
  type SkillCatalogChange,
} from '../../../core/src/skills/events.js';
import { type HumanIdentity } from '@botharness/host-client/human-profile';
import {
  isTakeoverRequestCard,
  isTakeoverResolution,
} from '../../../core/src/takeover/contracts.js';

import { clientLog } from './diagnostic-log.js';
import {
  genuiReplySchema,
  genuiViewSchema,
  parseGenuiContent,
  type GenuiMessageReply,
} from '../../../core/src/channels/genui.js';
import { genuiDocumentReplySchema } from '../../../core/src/channels/genui-document.js';
import { parseToolApprovalActor } from '../../../core/src/workspaces/tool-approval-actor.js';
import { isChannelVoiceCallRecord } from '../../../core/src/channels/voice-call-record.js';
import {
  isChannelTurnStopEngine,
  isChannelTurnStopRests,
} from '../../../core/src/channels/turn-stop.js';
import { isChannelModelSwitch } from '../../../core/src/channels/model-switch.js';
import type { PairingRequest, PairingReviewInput } from '../../../core/src/messaging/pairing.js';
import type { SenderAccessInput } from '../../../core/src/messaging/sender-access.js';
import {
  isAvatarAppearance,
  isRetainedAvatarAppearance,
  type AvatarAppearance,
} from '../../../core/src/bots/avatar-appearance.js';
import type {
  MessagingDefaults,
  MessagingDefaultsInput,
} from '../../../core/src/messaging/defaults.js';
import type {
  ChannelSkillInvocationToken,
  GroupMemberWakePolicy,
} from '../../../core/src/channels/channel.js';
import type { AllBotPreview, AllBotMention } from '../../../core/src/channels/all-bot-mention.js';
import type {
  ChannelBridgeInput,
  ChannelBridgeSnapshot,
} from '../../../core/src/messaging/channel-bridge.js';
import type {
  MessagingIdentity,
  MessagingIdentityInput,
} from '../../../core/src/messaging/identity.js';
import {
  parseMarketplaceDetail,
  parseAuthoredBots,
  parseMarketplaceFileView,
  parseMarketplacePage,
  parseMarketplaceSection,
  parseMarketplaceDigest,
  parseMarketplaceDigests,
  parseMarketplaceSubmission,
  type MarketplaceAuthoredBot,
  parseMarketplaceTopics,
  type MarketplaceDetail,
  type MarketplaceEntry,
  type MarketplaceFileView,
  type MarketplacePage,
  type MarketplaceQuery,
  type MarketplaceSection,
  type MarketplaceDigest,
  type MarketplaceDigestSummary,
  type MarketplaceTopic,
  type MarketplaceInstallSource,
} from '../../../core/src/marketplace/client.js';
import type { UploadPlan } from '../../../core/src/marketplace/uploaded-bots.js';
import type {
  InstallFinding,
  InstallReview,
  InstallReviewResult,
} from '../../../core/src/marketplace/install-review.js';
import type { AltchaChallenge } from '../../../core/src/marketplace/altcha.js';
import type { MarketplaceLanguage } from '../../../core/src/marketplace/language.js';
import { approvalTemplateDeletionPreviewSchema } from '../../../core/src/workspaces/approval-template-deletion-contract.js';
import type { UsageOverviewPeriod } from '../../../core/src/usage/overview.js';
import type { ChannelActivityToday } from '../../../core/src/channels/activity-today.js';
import type { GroupReceptionInput } from '../../../core/src/messaging/group-policy.js';
import type { MessagingConversationInput } from '../../../core/src/messaging/conversations.js';
import { isPartLibraryEntry } from '../../../core/src/bots/part-library.js';
import type { ExternalSource } from '../../../core/src/messaging/inbound.js';
import type {
  ConversationIngestInput,
  ConversationIngestSnapshot,
} from '../../../core/src/messaging/conversation-ingest.js';
import type {
  MessagingApp,
  MessagingSnapshot,
  MessagingReadMode,
  MessagingGrant,
  OutboxIntent,
} from '../../../core/src/messaging/outbound.js';
import type {
  MessagingReachablePage,
  MessagingTarget,
} from '../../../core/src/messaging/provider.js';
import {
  isChannelAttachmentRef,
  isChannelClearedAttachment,
} from '../../../core/src/attachments/ref.js';
import {
  isChannelMessageVoice,
  type ChannelMessageVoice,
} from '../../../core/src/channels/voice.js';
import { isChannelReplyPreviewMedia } from '../../../core/src/channels/reply-preview.js';
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection/client';
import type { BotSummary, ChannelMessage, ChannelSummary } from './store.js';
import { presentChannel } from './features/channels/bridge.js';

export {
  loadActivitySnapshot,
  loadBotSourcePolicies,
  setBotSourcePolicy,
  resetBotSourcePolicy,
  loadBotAttention,
  loadHumanAttention,
  loadHumanAttentionStatus,
  loadChannelUnreadCounts,
  dismissActivityListItem,
  dismissAllActivityListItems,
  snoozeActivityListItem,
  ignoreHumanAssignmentReport,
  loadProfileActivity,
  loadGroupProfileActivity,
  loadChannelActivityToday,
} from './features/activity/bridge.js';
export type {
  BotSourcePolicyView,
  BotSourcePolicyEdit,
  ProfileActivityDay,
  ProfileActivityReasonDay,
  ProfileTokenBuckets,
  ProfileActivityTokensDay,
  ProfileModelUsageRow,
  ProfileActivity,
  GroupProfileAuthorActivity,
  GroupProfileActivity,
  ProfileActivityWindow,
} from './features/activity/bridge.js';
export {
  manageMessagingIdentity,
  loadMessagingDefaults,
  saveMessagingDefaults,
  loadChannelBridges,
  loadChannelIngests,
  manageChannelIngest,
  manageChannelBridge,
  setFailureAlerts,
  testFailureAlerts,
  retryFailureAlerts,
  reviewPairing,
  changeExternalSenderAccess,
  loadMessagingApps,
  loadMessagingSnapshot,
  loadMessagingTargets,
  authorizeMessaging,
  revokeMessaging,
  loadMessagingReachable,
  readMessagingPostRequest,
  postMessagingConversation,
  setMessagingPostLimit,
  sendMessaging,
  loadChannelMediaTarget,
  setMessagingChannelTarget,
  setMessagingThreadPolicy,
  setMessagingGroupPolicy,
  manageMessagingConversation,
  setMessagingReceive,
  readMessagingSource,
} from './features/messaging/bridge.js';
export { parseSessionModelRoute } from './session-model-route.js';
export type { SessionModelRoute } from './session-model-route.js';

export {
  parseOwnedSessionSummaries,
  parseIdleCompactionStatus,
  loadIdleCompaction,
  setIdleCompaction,
  setCompactionThreshold,
  parseSessionEngineQuota,
  parseSessionToolDetail,
  loadSessionToolDetail,
  loadSessionTranscript,
  sessionModel,
  loadBotSessionIds,
  loadBotSessionGroups,
  loadSessions,
  setSessionArchived,
  stopSession,
  stopBot,
} from './features/sessions/bridge.js';
export type {
  CompactionThresholdRange,
  CompactionThreshold,
  IdleCompactionStatus,
  BotCompactResult,
  SessionTranscriptTrigger,
  SessionTurnUsage,
  SessionToolTargets,
  SessionTranscriptEnvelope,
  SessionTranscriptItem,
  SessionToolKind,
  SessionEngineQuota,
  SessionEngine,
  SessionTranscript,
  SessionLiveSnapshot,
  SessionToolDetail,
  StoppedSessionRef,
  SessionStopResult,
} from './features/sessions/bridge.js';
export {
  loadChannelAssignments,
  loadSessionSubagents,
  loadSessionProgress,
  loadAssignmentWork,
  loadHumanAssignmentContext,
  loadAssignmentAccess,
  setAssignmentAccess,
} from './features/assignments/bridge.js';
export type {
  SessionSubagent,
  SessionGoal,
  SessionTodo,
  SessionProgress,
  AssignmentWorkStep,
  AssignmentWorkLane,
  AssignmentWorkRound,
  AssignmentWork,
  AssignmentAccessPresetView,
} from './features/assignments/bridge.js';
export {
  moveMemoryLocation,
  loadMemoryVersions,
  loadMemorySnapshot,
  loadMemoryFileTarget,
  loadMemoryFile,
  loadMemoryHistory,
  loadMemoryDiff,
  loadMemoryGitGraph,
  loadMemoryGitCommitDiff,
  loadMemoryWorkingChanges,
  loadMemoryWorkingDiff,
  loadMemoryRecoveryHistory,
  restoreMemoryCheckpoint,
  restoreMemoryCommit,
  nameMemoryVersion,
  removeMemoryVersionName,
  saveMemoryFile,
  repairMemory,
  loadOverviewMemory,
} from './features/memory/bridge.js';
export type {
  MemoryVersion,
  MemoryWorkingKind,
  MemoryWorkingChange,
  MemoryWorkingDiff,
  MemoryRecoveryCheckpoint,
  MemoryRepairEvent,
} from './features/memory/bridge.js';

export {
  parseApprovalCard,
  loadToolApprovalRules,
  loadApprovalTemplates,
  setGlobalApprovalTemplate,
  createApprovalTemplate,
  updateApprovalTemplate,
  setBotApprovalTemplate,
  loadApprovalReviewerModel,
  setApprovalReviewerModel,
  revokeToolApprovalRule,
  loadToolApprovalStatus,
  loadToolApprovalState,
  loadToolApprovalExecutionState,
  decideToolApproval,
  loadUserQuestionStatus,
  answerUserQuestion,
  overrideAutoRejection,
  setApprovalRoute,
  testApprovalRoute,
  retryApprovalNotification,
  retryQuestionNotification,
} from './features/approvals/bridge.js';
export type {
  ToolApprovalRuleView,
  ApprovalTemplateView,
  ApprovalReviewerModelView,
  ToolApprovalExecutionState,
} from './features/approvals/bridge.js';
export {
  loadWorkspaceGrants,
  createWorkspaceGrant,
  createGroupWorkspaceGrant,
  readGroupWorkspaceGrant,
  approveWorkspaceGrantRequest,
  setWorkspaceGrantWrite,
  revokeWorkspaceGrant,
} from './features/workspaces/bridge.js';
export type { WorkspaceGrantView } from './features/workspaces/bridge.js';
export {
  setModelFavorite,
  loadModelCatalog,
  loadModelPresets,
  loadModelPlan,
  loadModelPlanState,
  loadRoutingGroups,
  createRoutingGroup,
  updateRoutingGroup,
  deleteRoutingGroup,
  applyModelPreset,
  customizeModelPlan,
  chooseModelPlanGroup,
  setModelPlanAssignments,
  setModelPlan,
} from './features/models/bridge.js';
export type {
  ModelRouteView,
  AssignmentModelOptionView,
  ModelCatalogEntryView,
  ModelCatalogGroupView,
  ModelCatalogView,
  ModelChoice,
  AssignmentGroupOptionView,
  ModelPlanGroupsView,
  ModelPresetView,
  ModelPlanView,
  ModelPlanStateView,
  RoutingGroupMemberView,
  RoutingGroupView,
  RestingRouteView,
} from './features/models/bridge.js';

export type { BotZipFileListing, BotZipExportChoice } from './features/marketplace/bridge.js';

export {
  parseGenuiDocumentView,
  loadGenuiDocumentView,
  saveGenuiDocumentView,
} from './features/genui/bridge.js';

export type { BotPrimaryColorChoice, PartImageInfo } from './features/avatars/bridge.js';

export {
  type BotSkillRow,
  type SkillDetailView,
  loadBotSkills,
  loadSkillDetail,
  removeBotSkill,
  loadChannelSkillCatalog,
  loadSessionSkillCatalog,
} from './features/skills/bridge.js';

export { bridgeHost, BridgeCallError, unwrap, type BridgeCall } from './bridge-transport.js';
export {
  loadBotSchedules,
  createBotSchedule,
  updateBotSchedule,
  deleteBotSchedule,
  loadBotScheduleHistory,
  runBotScheduleNow,
  previewBotSchedule,
} from './features/schedules/bridge.js';

export type {
  MemoryAcceptedCommit,
  MemoryFile,
  MemoryGitCommit,
  MemoryGitCommitDiff,
  MemoryGitGraph,
  MemoryImage,
  MemoryImageComparison,
  MemoryMarkdown,
  MemoryMarkdownComparison,
  MemorySnapshot,
  MemoryStandingUsage,
  MemoryVersionName,
} from '@botharness/host-client/memory';

export type {
  MarketplaceAuthoredBot,
  MarketplaceDetail,
  MarketplaceEntry,
  MarketplaceFileView,
  MarketplacePage,
  MarketplaceQuery,
  MarketplaceSection,
  MarketplaceDigest,
  MarketplaceDigestSummary,
  MarketplaceTopic,
  MarketplaceInstallSource,
  UploadPlan,
  InstallFinding,
  InstallReview,
  InstallReviewResult,
  AltchaChallenge,
  MarketplaceLanguage,
};
export interface MarketplaceBridgeReaders {
  parseMarketplaceDetail: typeof parseMarketplaceDetail;
  parseAuthoredBots: typeof parseAuthoredBots;
  parseMarketplaceFileView: typeof parseMarketplaceFileView;
  parseMarketplacePage: typeof parseMarketplacePage;
  parseMarketplaceSection: typeof parseMarketplaceSection;
  parseMarketplaceDigest: typeof parseMarketplaceDigest;
  parseMarketplaceDigests: typeof parseMarketplaceDigests;
  parseMarketplaceSubmission: typeof parseMarketplaceSubmission;
  parseMarketplaceTopics: typeof parseMarketplaceTopics;
  parseBotSummary: typeof parseBotSummary;
}

export type { ProfileSessionUsage } from '../../../core/src/bridge/methods.js';

export type { HumanAssignmentContext } from '../../../core/src/runtime/assignment-human-context.js';

export type { UsageFilter, UsageQueryResult } from '../../../core/src/usage/query.js';

export interface BridgeRpc {
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<ConnectionRpcResult<unknown>>;
}

export type {
  BotSchedule as BotScheduleView,
  BotScheduleChange,
  BotScheduleFiring as BotScheduleFiringView,
  BotScheduleInput,
  BotScheduleTrigger,
} from '@botharness/host-client/schedules';

export function connectionRpc(ctx: ClientContext): BridgeRpc | undefined {
  const candidate = (ctx as unknown as { connection?: { rpc?: BridgeRpc } }).connection;
  return candidate?.rpc;
}

function remoteArgs(payload: Record<string, unknown>): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) args[key] = value;
  }
  return args;
}

export function createBridgeCall(ctx: ClientContext): BridgeCall {
  const memberBridgeUnavailable = createMemberBridgeGuard(MEMBER_METHODS);
  return async (endpoint, payload, signal) => {
    if (memberBridgeUnavailable(endpoint))
      return {
        ok: false,
        error: { code: 'member-unavailable', message: endpoint, details: {} },
      };
    const rpc = connectionRpc(ctx);
    if (rpc === undefined) {
      return {
        ok: false,
        error: {
          code: 'unavailable',
          message: 'Connection RPC is not available',
          details: {},
        },
      };
    }
    const run = () =>
      rpc.call('/api', `botharness/${endpoint}`, { args: remoteArgs(payload) }, signal);
    const recorder = clientLog();
    return recorder === undefined
      ? run()
      : recorder.timeRpc(endpoint, run, (result) => (result.ok ? undefined : result.error.code));
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const {
  parseBotSummary,
  parseBotSummaries,
  loadBots,
  createPersonaBot,
  updateBotProfile,
  setStandingLimits,
} = createPersonaBotReaders(isAvatarAppearance, isRetainedAvatarAppearance, isBotPrimaryColor);

export type AttachmentVariant = '96c' | '320' | '800';

export interface MessageSearchHit {
  channelId: string;
  message: ChannelMessage;
  snippet: string;
}

export interface MessageSearchPage {
  hits: MessageSearchHit[];
  nextCursor?: string;
}

export interface SessionBotOwner {
  botSlug: string;
  displayName: string;
  avatar?: string;
  appearance?: AvatarAppearance;
  avatarSeed?: 2;
  role: 'orchestrator' | 'assignment';
}

export const { parseSessionBotOwner, loadSessionBotOwner } =
  createSessionOwnerBridge(isAvatarAppearance);

export const {
  importBotZip,
  previewBotZip,
  loadBotZipFiles,
  downloadBotZip,
  loadMarketplacePage,
  loadMarketplaceDetail,
  loadMarketplaceFile,
  loadMarketplaceTopics,
  loadMarketplaceSections,
  loadMarketplaceDigests,
  loadMarketplaceDigest,
  loadMarketplaceChallenge,
  submitMarketplaceRepository,
  parseInstallReviewResult,
  reviewMarketplaceInstall,
  installMarketplaceBot,
  loadMyMarketplaceUploads,
  uploadMarketplaceBot,
  reportMarketplaceBot,
} = createMarketplaceBridge({
  parseMarketplaceDetail,
  parseAuthoredBots,
  parseMarketplaceFileView,
  parseMarketplacePage,
  parseMarketplaceSection,
  parseMarketplaceDigest,
  parseMarketplaceDigests,
  parseMarketplaceSubmission,
  parseMarketplaceTopics,
  parseBotSummary,
});

export interface RenameChannelResult {
  channel: ChannelSummary;
  bot?: BotSummary;
}

export const setChannelHumanName = createChannelHumanNameBridge(presentChannel);
export type LocalHumanIdentity = HumanIdentity;

export type TelemetryLock = 'config' | 'DO_NOT_TRACK' | 'BOTHARNESS_TELEMETRY';

export interface TelemetryStatus {
  enabled: boolean;
  preference: boolean;
  lockedBy?: TelemetryLock;
}

export type GitUnavailableReason = 'missing' | 'unrunnable' | 'too-old';

export type GitInstallFailure = 'unsupported' | 'network' | 'checksum' | 'unpack' | 'unrunnable';

export type GitInstallState =
  | { phase: 'idle' }
  | { phase: 'downloading'; received: number; total?: number }
  | { phase: 'verifying' }
  | { phase: 'unpacking' }
  | { phase: 'failed'; reason: GitInstallFailure; detail?: string };

export type GitAvailability = (
  | { available: true; version: string; source: 'system' | 'managed' }
  | { available: false; reason: GitUnavailableReason; version?: string }
) & { installable: boolean; install: GitInstallState };

export { parseBotCompactResult } from '@botharness/host-client/bot-control';

export interface DataResetPreview {
  token: string;
  bots: number;
  targets: {
    kind: 'data' | 'im-settings' | 'local-tools';
    path: string;
    bytes: number;
    files: number;
    partial?: boolean;
  }[];
  kept: { kind: 'credentials' | 'memory' | 'exports'; path: string }[];
  restartable: boolean;
}

export type DataResetResult = { status: 'restarting' } | { status: 'restart-required' };

export const {
  setBotAvatar,
  setBotBanner,
  setBotAppearance,
  setBotPrimaryColor,
  loadPartLibrary,
  exportLibraryParts,
  importLibraryParts,
  importLibraryImage,
  addLibraryPart,
} = createAvatarsBridge(parseBotSummary, isPartLibraryEntry);

const ASSIGNMENT_ACTIVITIES = ['working', 'idle', 'error', 'stopping', 'stopped'];

export async function loadSessionLive(
  call: BridgeCall,
  slug: string,
  sessionId: string,
  after: number | undefined,
  signal?: AbortSignal,
): Promise<SessionLiveSnapshot> {
  const value = asRecord(
    await unwrap(
      call,
      'sessionLive',
      { slug, sessionId, ...(after === undefined ? {} : { after }) },
      signal,
    ),
  );
  const items = value?.['items'];
  if (value === undefined || !Array.isArray(items) || typeof value['revision'] !== 'number')
    throw new Error('invalid sessionLive response');
  return {
    revision: value['revision'],
    seq: finite(value['seq']) ?? 0,
    items: parseItems(items).map((item) =>
      item.kind === 'reply' || item.kind === 'reasoning' || item.kind === 'tool'
        ? { ...item, live: true as const }
        : item,
    ),
  };
}

export interface TimelinePage {
  entries: ChannelMessage[];
  olderCursor: string | null;
  newerCursor: string | null;
  hasOlder: boolean;
  hasNewer: boolean;
}

export interface TimelinePageRequest {
  direction?: 'older' | 'newer' | 'around';
  cursor?: string;
  around?: string;
  limit?: number;
  olderLimit?: number;
  newerLimit?: number;
}

export interface JournalEntry {
  channelId: string;
  message: ChannelMessage;
  revision: number;
}
export interface JournalPage {
  entries: JournalEntry[];
  olderCursor: string | null;
  hasOlder: boolean;
}

export interface FilesPage {
  entries: JournalEntry[];
  nextBefore?: number;
}

export const { parseGenuiView, loadGenuiView, saveGenuiView } =
  createGenuiReportBridge(genuiViewSchema);

export type { ToolApprovalStatus } from '@botharness/host-protocol/wire';

export {
  loadPrivateInputStatus,
  submitPrivateInput,
  privateInputAccepted,
  cancelPrivateInput,
} from './features/approvals/bridge.js';

export const { previewApprovalTemplateDeletion, deleteApprovalTemplate } =
  createApprovalTemplateDeletionBridge(approvalTemplateDeletionPreviewSchema);

export interface WorkspaceOption {
  id: string;
  path: string;
  title: string;
}

export { parseHumanAttentionPage } from '@botharness/host-client/people';

export type { MessagingApp };
export type {
  PairingRequest,
  PairingReviewInput,
  SenderAccessInput,
  MessagingDefaults,
  MessagingDefaultsInput,
  ChannelBridgeInput,
  ChannelBridgeSnapshot,
  MessagingIdentity,
  MessagingIdentityInput,
  GroupReceptionInput,
  MessagingConversationInput,
  ExternalSource,
  ConversationIngestInput,
  ConversationIngestSnapshot,
  MessagingSnapshot,
  MessagingReadMode,
  MessagingGrant,
  OutboxIntent,
  MessagingTarget,
  MessagingReachablePage,
  ThreadReceptionInput,
  ChannelActivityToday,
};

export {
  loadComposerIdentity,
  loadHumanIdentity,
  setHumanDefaultName,
  setHumanAvatar,
  finishHumanProfileSetup,
  loadHumanAvatars,
} from './features/humans/bridge.js';

export {
  type CreatePersonaBotInput,
  botExists,
  type SshFailureReason,
  type HttpsFallback,
  type CreatedBot,
  loadRoster,
  type RosterBatchInput,
  applyRosterBatch,
  createRosterSection,
  renameRosterSection,
  removeRosterSection,
  assignRosterChannel,
  reorderRosterSections,
  reorderTopOrder,
  setRosterPins,
  setRosterHidden,
  setChannelMute,
} from './features/personabots/bridge.js';

export type { ComposerRecoveryIdentity } from '../../../core/src/bridge/composer-recovery.js';

export {
  loadProfileUsage,
  loadProfileSessionUsage,
  loadOverviewUsage,
} from './features/usage/bridge.js';

export {
  loadHostFolders,
  loadWorkspaceOptions,
  loadWorkspaceFileTarget,
} from './features/workspaces/bridge.js';

export { settleTakeover } from './features/takeover/bridge.js';

export { sendSessionRequest, sendOrchestratorMessage } from './features/sessions/bridge.js';

export { setGroupAvatar } from './features/appearance/bridge.js';

export { loadDataResetPreview, confirmDataReset } from './features/profile-storage/bridge.js';

export {
  parseTelemetryStatus,
  gitInstalling,
  parseGitAvailability,
  loadGitAvailability,
  startGitInstall,
  loadTelemetryStatus,
  setTelemetryPreference,
} from './features/diagnostics/bridge.js';

export {
  parseSkillCatalogChange,
  parseSessionLinks,
  parseMessageVoice,
  parseReactions,
} from './features/channels/message-fields.js';
export { parseChannelMessage, parseChannelMessages } from './features/channels/message-readers.js';
export { parseStoredChannelMessage } from './features/channels/bridge.js';

export {
  parseChannelAttachment,
  channelAttachmentUrl,
  uploadChannelAttachment,
  loadFilesPage,
  loadMessageAttachmentTarget,
} from './features/channel-files/bridge.js';

export {
  parseChannelRecord,
  reactToChannelMessage,
  searchChannelMessages,
  searchAllMessages,
  loadChannels,
  validateComposerDraft,
  openDmChannel,
  createGroupChannel,
  renameChannel,
  inviteGroupBot,
  cancelGroupInvitation,
  decideGroupJoin,
  removeGroupMember,
  loadGroupWakePolicies,
  setGroupWakePolicy,
  deleteGroupChannel,
  parseJournalEntry,
  parseJournalPage,
  loadJournalPage,
  loadTimelinePage,
  loadReadPosition,
  markReadPosition,
  loadAllBotPreview,
  sendChannelMessage,
  markAllReadPositions,
} from './features/channels/bridge.js';

export {
  parseToolEffects,
  skillCatalogChangeSchema,
  isTakeoverRequestCard,
  isTakeoverResolution,
  genuiReplySchema,
  parseGenuiContent,
  genuiDocumentReplySchema,
  parseToolApprovalActor,
  isChannelVoiceCallRecord,
  isChannelTurnStopEngine,
  isChannelTurnStopRests,
  isChannelModelSwitch,
  isChannelAttachmentRef,
  isChannelClearedAttachment,
  isChannelMessageVoice,
  isChannelReplyPreviewMedia,
};
export type {
  SkillCatalogChange,
  GenuiMessageReply,
  ChannelSkillInvocationToken,
  GroupMemberWakePolicy,
  AllBotPreview,
  AllBotMention,
  UsageOverviewPeriod,
  ChannelMessageVoice,
};

export type { FolderListing } from '../../../core/src/workspaces/folder-browse.js';

export type { ToolApprovalReview } from '../../../core/src/workspaces/tool-approval.js';

export type { PrivateInputStatus } from '../../../core/src/credentials/contracts.js';
