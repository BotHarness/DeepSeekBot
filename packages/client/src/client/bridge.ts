import { parseRemoteChannelMetadata } from './features/environments/bridge.js';
import { parseAuthor } from './bridge-channel-author.js';
import type { ThreadReceptionInput } from '../../../core/src/messaging/thread-policy.js';
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
import { createSessionOwnerBridge, parseItems, finite } from './features/sessions/bridge.js';
import type { SessionLiveSnapshot } from './features/sessions/bridge.js';
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
import {
  createApprovalTemplateDeletionBridge,
  parseApprovalCard,
} from './features/approvals/bridge.js';
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
import { createMarketplaceBridge } from './features/marketplace/bridge.js';
export type { BotZipFileListing, BotZipExportChoice } from './features/marketplace/bridge.js';
import { createGenuiReportBridge } from './features/genui/bridge.js';
export {
  parseGenuiDocumentView,
  loadGenuiDocumentView,
  saveGenuiDocumentView,
} from './features/genui/bridge.js';
import { createAvatarsBridge } from './features/avatars/bridge.js';
export type { BotPrimaryColorChoice, PartImageInfo } from './features/avatars/bridge.js';
import { parseSkillOwner } from './features/skills/bridge.js';
export {
  type BotSkillRow,
  type SkillDetailView,
  loadBotSkills,
  loadSkillDetail,
  removeBotSkill,
  loadChannelSkillCatalog,
  loadSessionSkillCatalog,
} from './features/skills/bridge.js';
import {
  asRecord,
  bridgeHost,
  BridgeCallError,
  stringArray,
  unwrap,
  type BridgeCall,
} from './bridge-transport.js';
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

import * as rosterReaders from '@botharness/host-client/roster-readers';

import { parseToolEffects } from '../../../core/src/workspaces/tool-effects-contract.js';

import {
  skillCatalogChangeSchema,
  type SkillCatalogChange,
} from '../../../core/src/skills/events.js';
import { MEMBER_METHODS } from '../../../core/src/team/member-methods.js';
import {
  humanAvatarVersionOf,
  readHumanAvatars,
  readHumanIdentity,
  setHumanName,
  setHumanAvatar as writeHumanAvatar,
  finishHumanProfile,
  type HumanAvatarImage,
  type HumanIdentity,
} from '@botharness/host-client/human-profile';
import { memberPage } from './member-page.js';
import {
  isTakeoverRequestCard,
  isTakeoverResolution,
} from '../../../core/src/takeover/contracts.js';
import {
  parseFailureAutoContinue,
  parseFailureProgress,
} from '@botharness/host-client/shared/turn-continuation';
import { isPixelBannerRecipe } from '@botharness/pixel-banner';
import {
  browseHostFolders,
  loadWorkspaceOptions as loadHostWorkspaceOptions,
} from '@botharness/host-client/bot-settings';
import { listBots, updateBot } from '@botharness/host-client/bots';
import { loadUsage } from '@botharness/host-client/usage';
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
import * as channelHost from '@botharness/host-client/channel-messages';
import * as channels from '@botharness/host-client/channel-management';
import { HostAnswerInvalid } from '@botharness/host-client/host-answer';
import { clientLog, reportFailure } from './diagnostic-log.js';
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
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type { PairingRequest, PairingReviewInput } from '../../../core/src/messaging/pairing.js';
import type { SenderAccessInput } from '../../../core/src/messaging/sender-access.js';
import { parseMessagePerf } from './message-perf.js';
import {
  isAvatarAppearance,
  isRetainedAvatarAppearance,
  type AvatarAppearance,
} from '../../../core/src/bots/avatar-appearance.js';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
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
import type { OverviewUsage } from '@botharness/host-client/usage';
import type { ProfileSessionUsage } from '../../../core/src/bridge/methods.js';
export type { ProfileSessionUsage } from '../../../core/src/bridge/methods.js';
import type { UsageOverviewPeriod } from '../../../core/src/usage/overview.js';
import type { ChannelActivityToday } from '../../../core/src/channels/activity-today.js';
import type { GroupReceptionInput } from '../../../core/src/messaging/group-policy.js';
import type { MessagingConversationInput } from '../../../core/src/messaging/conversations.js';
import { isPartLibraryEntry } from '../../../core/src/bots/part-library.js';
import { isBotPrimaryColor } from '../../../core/src/bots/primary-color.js';
import type { ExternalSource } from '../../../core/src/messaging/inbound.js';
import type {
  ConversationIngestInput,
  ConversationIngestSnapshot,
} from '../../../core/src/messaging/conversation-ingest.js';
export type { HumanAssignmentContext } from '../../../core/src/runtime/assignment-human-context.js';
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
import type { HostFileTarget } from './host-file-actions.js';
import type { ComposerRecoveryIdentity } from '../../../core/src/bridge/composer-recovery.js';
import {
  isChannelAttachmentRef,
  isChannelClearedAttachment,
} from '../../../core/src/attachments/ref.js';
import {
  isChannelMessageVoice,
  type ChannelMessageVoice,
} from '../../../core/src/channels/voice.js';
import { isChannelReplyPreviewMedia } from '../../../core/src/channels/reply-preview.js';
import type { UsageFilter, UsageQueryResult } from '../../../core/src/usage/query.js';
export type { UsageFilter, UsageQueryResult } from '../../../core/src/usage/query.js';
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection/client';

import type {
  BotBannerView,
  BotSummary,
  ChannelAttachmentRef,
  ChannelMessage,
  ChannelMessageQuote,
  ChannelReplyPreview,
  ChannelReaction,
  ChannelSummary,
  QuoteRef,
  StandingLimitsView,
  UserQuestionAnswerItem,
} from './store.js';
import { quoteRefOf } from './store.js';
import {
  parseRosterSnapshot,
  type RosterSection,
  type RosterSnapshot,
  type TopOrderEntry,
} from './roster.js';

export interface BridgeRpc {
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<ConnectionRpcResult<unknown>>;
}

export interface CreatePersonaBotInput {
  operationKey?: string;
  expectedCommit?: string;
  displayName: string;
  persona?: string;
  roles: string[];
  description?: string;
  gitUrl?: string;
  avatar?: string;
  origin?: 'marketplace';
  listingId?: string;
  memoryLocation?: string;
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
  const member = memberPage();
  return async (endpoint, payload, signal) => {
    if (member && !MEMBER_METHODS.has(endpoint))
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

export function parseBotSummary(value: unknown): BotSummary | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const slug = record['slug'];
  const displayName = record['displayName'];
  if (typeof slug !== 'string' || slug.length === 0 || typeof displayName !== 'string') {
    return undefined;
  }
  const aggregateState = record['aggregateState'];
  const createdAt = record['createdAt'];
  const roles = stringArray(record['roles']);
  const legacyTag = record['tag'];
  const description = record['description'];
  const avatar = record['avatar'];
  const runner = asRecord(record['orchestratorRunner']);
  const engine = runner?.['engine'];
  const runnerName = runner?.['displayName'];
  const account = runner?.['account'];
  const runnerModel = runner?.['model'];
  return {
    ...(typeof engine === 'string' &&
    engine.trim() &&
    typeof runnerName === 'string' &&
    runnerName.trim() &&
    (account === undefined || typeof account === 'string')
      ? {
          orchestratorRunner: {
            engine,
            displayName: runnerName,
            ...(account === undefined ? {} : { account }),
            ...(typeof runnerModel === 'string' && runnerModel.trim()
              ? { model: runnerModel }
              : {}),
          },
        }
      : {}),
    slug,
    displayName,
    ...(typeof asRecord(record['tob'])?.['defaultName'] === 'boolean' &&
    typeof asRecord(record['tob'])?.['defaultAvatar'] === 'boolean'
      ? {
          tob: record['tob'] as {
            defaultName: boolean;
            defaultAvatar: boolean;
          },
        }
      : {}),
    ...(typeof record['lastActivityAt'] === 'number' && Number.isFinite(record['lastActivityAt'])
      ? { lastActivityAt: record['lastActivityAt'] }
      : {}),
    ...(typeof asRecord(record['sharedBy'])?.['displayName'] === 'string'
      ? { sharedBy: asRecord(record['sharedBy'])?.['displayName'] as string }
      : {}),
    aggregateState: typeof aggregateState === 'string' ? aggregateState : 'idle',
    workspaces: stringArray(record['workspaces']),
    createdAt: typeof createdAt === 'string' ? createdAt : '',
    roles: roles.length > 0 ? roles : typeof legacyTag === 'string' ? [legacyTag] : [],
    ...(typeof description === 'string' ? { description } : {}),
    ...(typeof avatar === 'string' ? { avatar } : {}),
    ...(isAvatarAppearance(record['appearance'])
      ? { appearance: record['appearance'] }
      : isRetainedAvatarAppearance(record['appearance'])
        ? { appearanceUnsupported: true as const }
        : {}),
    ...(parseBanner(record['banner']) ?? {}),
    ...(isBotPrimaryColor(record['primaryColor']) ? { primaryColor: record['primaryColor'] } : {}),
    ...(record['avatarSeed'] === 2 ? { avatarSeed: 2 as const } : {}),
    ...(typeof record['paused'] === 'boolean' ? { paused: record['paused'] } : {}),
    ...(record['deleted'] === true ? { deleted: true } : {}),
    ...(record['modelAllowed'] === false ? { modelAllowed: false as const } : {}),
    ...(typeof record['uploadedListing'] === 'string'
      ? { uploadedListing: record['uploadedListing'] }
      : {}),
    ...(typeof record['installedListing'] === 'string'
      ? { installedListing: record['installedListing'] }
      : {}),
    ...(parseStandingLimits(record['standingLimits']) ?? {}),
  };
}

function parseBanner(value: unknown): { banner: BotBannerView } | undefined {
  const banner = asRecord(value);
  if (banner === undefined) return undefined;
  if (isPixelBannerRecipe(banner['recipe'])) return { banner: { recipe: banner['recipe'] } };
  const image = banner['image'];
  return typeof image === 'string' && image.length > 0 ? { banner: { image } } : undefined;
}

function parseStandingLimits(value: unknown): { standingLimits: StandingLimitsView } | undefined {
  const limits = asRecord(value);
  const soul = limits?.['soul'];
  const coreMemory = limits?.['coreMemory'];
  if (typeof soul !== 'number' || typeof coreMemory !== 'number') return undefined;
  return { standingLimits: { soul, coreMemory } };
}

export async function setStandingLimits(
  call: BridgeCall,
  slug: string,
  limits: StandingLimitsView,
): Promise<BotSummary> {
  const value = asRecord(await unwrap(call, 'standingLimitsSet', { slug, ...limits }));
  const bot = parseBotSummary(value?.['bot']);
  if (bot === undefined) throw new Error('Invalid PersonaBot result');
  return bot;
}

export function parseBotSummaries(value: unknown): BotSummary[] {
  const bots = asRecord(value)?.['bots'];
  if (!Array.isArray(bots)) return [];
  return bots.flatMap((entry) => {
    const bot = parseBotSummary(entry);
    return bot === undefined ? [] : [bot];
  });
}

export function parseChannelRecord(value: unknown): ChannelSummary | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const id = record['id'];
  const type = record['type'];
  const name = record['name'];
  if (typeof id !== 'string' || id.length === 0) return undefined;
  if (type !== 'dm' && type !== 'group') return undefined;
  if (typeof name !== 'string') return undefined;
  const botSlug = record['botSlug'];
  const remoteChannelMetadata = parseRemoteChannelMetadata(record, type, botSlug);
  if (remoteChannelMetadata === undefined) return undefined;
  const createdAt = record['createdAt'];
  const updatedAt = record['updatedAt'];
  const latestMessage = parseChannelMessage(record['latestMessage']);
  const invitations = Array.isArray(record['invitations'])
    ? record['invitations'].flatMap((value: unknown) => {
        const item = asRecord(value);
        if (
          item === undefined ||
          typeof item['id'] !== 'string' ||
          typeof item['targetBotSlug'] !== 'string' ||
          !(
            (typeof item['inviterBotSlug'] === 'string' && item['inviterHuman'] === undefined) ||
            (item['inviterBotSlug'] === undefined && item['inviterHuman'] === true)
          ) ||
          !['pending', 'accepted', 'declined', 'cancelled'].includes(String(item['status'])) ||
          typeof item['createdAt'] !== 'string'
        )
          return [];
        return [
          {
            id: item['id'],
            targetBotSlug: item['targetBotSlug'],
            ...(typeof item['inviterBotSlug'] === 'string'
              ? { inviterBotSlug: item['inviterBotSlug'] }
              : { inviterHuman: true as const }),
            status: item['status'] as 'pending' | 'accepted' | 'declined' | 'cancelled',
            createdAt: item['createdAt'],
            ...(typeof item['respondedAt'] === 'string'
              ? { respondedAt: item['respondedAt'] }
              : {}),
          },
        ];
      })
    : undefined;
  const joinRequests = Array.isArray(record['joinRequests'])
    ? record['joinRequests'].flatMap((value: unknown) => {
        const item = asRecord(value);
        if (
          item === undefined ||
          typeof item['id'] !== 'string' ||
          typeof item['requesterBotSlug'] !== 'string' ||
          !['pending', 'accepted', 'declined', 'cancelled'].includes(String(item['status'])) ||
          typeof item['createdAt'] !== 'string'
        )
          return [];
        return [
          {
            id: item['id'],
            requesterBotSlug: item['requesterBotSlug'],
            status: item['status'] as 'pending' | 'accepted' | 'declined' | 'cancelled',
            createdAt: item['createdAt'],
            ...(typeof item['decidedAt'] === 'string' ? { decidedAt: item['decidedAt'] } : {}),
            ...(typeof item['decidedBy'] === 'string' ? { decidedBy: item['decidedBy'] } : {}),
          },
        ];
      })
    : undefined;
  const rawWakePolicies = asRecord(record['wakePolicies']);
  const wakePolicies =
    rawWakePolicies === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(rawWakePolicies).flatMap(([slug, raw]) => {
            const value = asRecord(raw);
            if (
              value === undefined ||
              (value['mode'] !== 'all' &&
                value['mode'] !== 'mentions' &&
                value['mode'] !== 'digest' &&
                value['mode'] !== 'silent') ||
              typeof value['count'] !== 'number' ||
              typeof value['intervalSeconds'] !== 'number' ||
              typeof value['revision'] !== 'number'
            )
              return [];
            return [
              [
                slug,
                {
                  mode: value['mode'] as 'all' | 'mentions' | 'digest' | 'silent',
                  count: value['count'],
                  intervalSeconds: value['intervalSeconds'],
                  revision: value['revision'],
                },
              ],
            ];
          }),
        );
  return {
    id,
    type,
    name,
    ...(type === 'group' && typeof record['avatar'] === 'string'
      ? { avatar: record['avatar'] }
      : {}),
    members: stringArray(record['members']),
    ...(record['humanNickname'] === null || typeof record['humanNickname'] === 'string'
      ? { humanNickname: record['humanNickname'] as string | null }
      : {}),
    ...(Array.isArray(record['humanMembers'])
      ? {
          humanMembers: record['humanMembers'].flatMap((raw: unknown) => {
            const member = asRecord(raw);
            return typeof member?.['humanId'] === 'string' &&
              typeof member['displayName'] === 'string'
              ? [
                  {
                    humanId: member['humanId'],
                    displayName: member['displayName'],
                    ...humanAvatarVersionOf(member['avatarVersion']),
                  },
                ]
              : [];
          }),
        }
      : {}),
    ...(type === 'dm' &&
    Array.isArray(record['humanParticipants']) &&
    stringArray(record['humanParticipants']).length === 2
      ? { humanParticipants: stringArray(record['humanParticipants']) }
      : {}),
    createdAt: typeof createdAt === 'string' ? createdAt : '',
    updatedAt: typeof updatedAt === 'string' ? updatedAt : '',
    ...(typeof botSlug === 'string' ? { botSlug } : {}),
    ...remoteChannelMetadata,
    ...(typeof record['ownerBotSlug'] === 'string' ? { ownerBotSlug: record['ownerBotSlug'] } : {}),
    ...(type === 'dm' && record['readOnly'] === true ? { readOnly: true } : {}),
    ...(type === 'dm' && typeof record['proactiveOptOut'] === 'boolean'
      ? { proactiveOptOut: record['proactiveOptOut'] }
      : {}),
    ...(type === 'group' && Array.isArray(record['memberBots'])
      ? {
          memberBots: record['memberBots'].flatMap((raw: unknown) => {
            const bot = asRecord(raw);
            return typeof bot?.['slug'] === 'string' && typeof bot['displayName'] === 'string'
              ? [
                  {
                    slug: bot['slug'],
                    displayName: bot['displayName'],
                    ...(typeof bot['avatar'] === 'string' ? { avatar: bot['avatar'] } : {}),
                  },
                ]
              : [];
          }),
        }
      : {}),
    ...(invitations === undefined ? {} : { invitations }),
    ...(joinRequests === undefined ? {} : { joinRequests }),
    ...(wakePolicies === undefined ? {} : { wakePolicies }),
    ...(latestMessage === undefined ? {} : { latestMessage }),
  };
}

export function parseChannelAttachment(value: unknown): ChannelAttachmentRef | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const { hash, fileId, name, mime, size } = record;
  if (
    !(
      (typeof hash === 'string' && /^sha256:[0-9a-f]{64}$/u.test(hash) && fileId === undefined) ||
      (typeof fileId === 'string' &&
        /^file:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
          fileId,
        ) &&
        hash === undefined)
    ) ||
    typeof name !== 'string' ||
    name.length === 0 ||
    name.length > 180 ||
    /[/\\\u0000-\u001f\u007f]/u.test(name) ||
    typeof mime !== 'string' ||
    !/^[a-z][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/u.test(mime) ||
    typeof size !== 'number' ||
    !Number.isSafeInteger(size) ||
    size < 0
  )
    return undefined;
  if (typeof fileId !== 'string') return { hash: hash as string, name, mime, size };
  const { version, width, height, thumbhash } = record;
  const dimension = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  return {
    fileId,
    name,
    mime,
    size,
    ...(typeof version === 'string' && /^[0-9a-f]{32}$/u.test(version) ? { version } : {}),
    ...(dimension(width) && dimension(height)
      ? { width: width as number, height: height as number }
      : {}),
    ...(typeof thumbhash === 'string' && thumbhash.length <= 100 ? { thumbhash } : {}),
  };
}

export type AttachmentVariant = '96c' | '320' | '800';

export function channelAttachmentUrl(
  ref: ChannelAttachmentRef,
  owner: { channelId: string; messageId: string },
  variant?: AttachmentVariant,
): string {
  if (owner === undefined) throw new Error('Message ownership is required for attachments');
  if (ref.fileId !== undefined) {
    return (
      './api/botharness/attachment?' +
      new URLSearchParams({
        ...owner,
        fileId: ref.fileId,
        ...(ref.version === undefined ? {} : { v: ref.version }),
        ...(ref.version === undefined || variant === undefined ? {} : { variant }),
      })
    );
  }
  return (
    './api/botharness/attachment?' +
    new URLSearchParams({ hash: ref.hash, name: ref.name, ...owner })
  );
}

export async function uploadChannelAttachment(
  file: File,
  signal?: AbortSignal,
  uploadId?: string,
): Promise<ChannelAttachmentRef> {
  const response = await fetch(
    `./api/botharness/attachment/upload?${new URLSearchParams({ name: file.name, ...(uploadId === undefined ? {} : { uploadId }) })}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: file,
      credentials: 'same-origin',
      ...(signal === undefined ? {} : { signal }),
    },
  );
  if (!response.ok) throw new Error(`Attachment upload failed (${response.status})`);
  const payload = asRecord(await response.json());
  const ref = parseChannelAttachment(payload?.['attachment']);
  if (ref === undefined) throw new Error('Invalid attachment upload response');
  return ref;
}

function isMaskedRequest(value: unknown): boolean {
  return asRecord(value)?.['masked'] === true;
}

function parseSkillInvocations(
  value: unknown,
  body: string,
): NonNullable<ChannelMessage['skillInvocations']> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const item = asRecord(entry);
    const owner = asRecord(item?.['owner']);
    const name = item?.['name'];
    const start = item?.['start'];
    const end = item?.['end'];
    const content = item?.['content'];
    const path = item?.['path'];
    if (
      typeof name !== 'string' ||
      typeof content !== 'string' ||
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      body.slice(start, end) !== '/' + name ||
      (path !== undefined && typeof path !== 'string')
    )
      return [];
    const parsedOwner = parseSkillOwner(owner);
    if (parsedOwner === undefined) return [];
    return [
      {
        name,
        owner: parsedOwner,
        start,
        end,
        content,
        ...(typeof path === 'string' ? { path } : {}),
      },
    ];
  });
}

export function parseSkillCatalogChange(value: unknown): SkillCatalogChange | undefined {
  try {
    const parsed = skillCatalogChangeSchema.safeParse(
      typeof value === 'string' ? JSON.parse(value) : value,
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function parseSessionLinks(value: unknown): NonNullable<ChannelMessage['sessionLinks']> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const link = asRecord(entry);
    return link !== undefined &&
      typeof link['sessionId'] === 'string' &&
      link['sessionId'] !== '' &&
      typeof link['title'] === 'string' &&
      (link['kind'] === 'created' || link['kind'] === 'sent')
      ? [
          {
            sessionId: link['sessionId'],
            kind: link['kind'] as 'created' | 'sent',
            title: link['title'],
          },
        ]
      : [];
  });
}

export function parseChannelMessage(value: unknown): ChannelMessage | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const id = record['id'];
  const at = record['at'];
  const body = record['body'];
  if (typeof id !== 'string' || id.length === 0) return undefined;
  if (typeof at !== 'string' || at.length === 0) return undefined;
  if (typeof body !== 'string') return undefined;
  const author = parseAuthor(record['author']);
  if (author === undefined) return undefined;
  let genui: ReturnType<typeof parseGenuiContent> | undefined;
  if (author.kind === 'bot' && record['genui'] !== undefined) {
    try {
      genui = parseGenuiContent(record['genui']);
    } catch {
      genui = undefined;
    }
  }
  const parsedGenuiReply =
    author.kind === 'human' && record['genuiReply'] !== undefined
      ? (asRecord(record['genuiReply'])?.['version'] === 2
          ? genuiDocumentReplySchema
          : genuiReplySchema
        ).safeParse(record['genuiReply'])
      : undefined;
  const genuiReply = parsedGenuiReply?.success ? parsedGenuiReply.data : undefined;
  const perf = author.kind === 'bot' ? parseMessagePerf(record['perf']) : undefined;
  const memorySwitchTarget = record['memorySwitchTarget'];
  if (
    memorySwitchTarget !== undefined &&
    (author.kind !== 'human' ||
      typeof memorySwitchTarget !== 'string' ||
      memorySwitchTarget.length === 0 ||
      memorySwitchTarget.length > 255)
  )
    return undefined;
  const grantRequest = record['grantRequest'];
  if (grantRequest !== undefined && (grantRequest !== true || author.kind !== 'bot'))
    return undefined;
  let grantRequestResolution: ChannelMessage['grantRequestResolution'];
  const sessionLinks = author.kind === 'bot' ? parseSessionLinks(record['sessionLinks']) : [];
  let assignmentReply: ChannelMessage['assignmentReply'];
  if (record['assignmentReply'] !== undefined) {
    const target = asRecord(record['assignmentReply']);
    if (
      target === undefined ||
      author.kind !== 'human' ||
      typeof target['sessionId'] !== 'string' ||
      target['sessionId'].length === 0 ||
      typeof target['sourceEventId'] !== 'string' ||
      target['sourceEventId'].length === 0
    )
      return undefined;
    assignmentReply = {
      sessionId: target['sessionId'],
      sourceEventId: target['sourceEventId'],
    };
  }
  if (record['grantRequestResolution'] !== undefined) {
    const resolution = asRecord(record['grantRequestResolution']);
    if (
      resolution === undefined ||
      author.kind !== 'human' ||
      typeof resolution['requestMessageId'] !== 'string' ||
      typeof resolution['grantId'] !== 'string' ||
      resolution['requestMessageId'].length === 0 ||
      resolution['grantId'].length === 0 ||
      record['replyTo'] !== resolution['requestMessageId']
    )
      return undefined;
    grantRequestResolution = {
      requestMessageId: resolution['requestMessageId'],
      grantId: resolution['grantId'],
    };
  }
  const approval = author.kind === 'bot' ? parseApprovalCard(record['approval']) : undefined;
  let toolApprovalRequest: ChannelMessage['toolApprovalRequest'];
  if (
    record['toolApprovalRequest'] !== undefined &&
    !isMaskedRequest(record['toolApprovalRequest'])
  ) {
    const request = asRecord(record['toolApprovalRequest']);
    if (
      request === undefined ||
      author.kind !== 'bot' ||
      typeof request['sessionId'] !== 'string' ||
      typeof request['callId'] !== 'string' ||
      typeof request['toolName'] !== 'string' ||
      typeof request['cwd'] !== 'string' ||
      typeof request['input'] !== 'string' ||
      (request['role'] !== 'orchestrator' && request['role'] !== 'assignment')
    )
      return undefined;
    const preview = asRecord(request['botCreatePreview']);
    const botCreatePreview =
      preview !== undefined &&
      typeof preview['memoryFolder'] === 'string' &&
      typeof preview['defaultLocation'] === 'boolean'
        ? {
            memoryFolder: preview['memoryFolder'],
            defaultLocation: preview['defaultLocation'],
            ...(typeof preview['avatar'] === 'string' && preview['avatar'].startsWith('data:image/')
              ? { avatar: preview['avatar'] }
              : {}),
            ...(typeof preview['avatarError'] === 'string'
              ? { avatarError: preview['avatarError'] }
              : {}),
          }
        : undefined;
    const effects = parseToolEffects(request['effects']);
    const review = asRecord(request['approvalReview']);
    let approvalReview:
      | import('../../../core/src/workspaces/tool-approval.js').ToolApprovalReview
      | undefined;
    if (review?.['kind'] === 'template-unavailable' && typeof review['reason'] === 'string')
      approvalReview = {
        kind: 'template-unavailable',
        reason: review['reason'],
      };
    else if (
      review?.['kind'] === 'review' &&
      typeof review['reason'] === 'string' &&
      typeof review['template'] === 'string' &&
      typeof review['version'] === 'string'
    )
      approvalReview = {
        kind: 'review',
        template: review['template'],
        version: review['version'],
        reason: review['reason'],
        ...(typeof review['fallback'] === 'string' ? { fallback: review['fallback'] } : {}),
      };
    toolApprovalRequest = {
      ...(effects === undefined ? {} : { effects }),
      ...(approvalReview === undefined ? {} : { approvalReview }),
      ...(typeof request['allowAlways'] === 'boolean'
        ? { allowAlways: request['allowAlways'] }
        : {}),
      sessionId: request['sessionId'],
      callId: request['callId'],
      toolName: request['toolName'],
      role: request['role'],
      cwd: request['cwd'],
      input: request['input'],
      ...(botCreatePreview === undefined ? {} : { botCreatePreview }),
    };
  }
  let userQuestionRequest: ChannelMessage['userQuestionRequest'];
  if (
    record['userQuestionRequest'] !== undefined &&
    !isMaskedRequest(record['userQuestionRequest'])
  ) {
    const request = asRecord(record['userQuestionRequest']);
    const questions = request?.['questions'];
    if (
      request === undefined ||
      author.kind !== 'bot' ||
      typeof request['sessionId'] !== 'string' ||
      !Array.isArray(questions) ||
      questions.length === 0
    )
      return undefined;
    const parsed = questions.map((value) => {
      const item = asRecord(value);
      if (
        item === undefined ||
        typeof item['id'] !== 'string' ||
        typeof item['question'] !== 'string'
      )
        return undefined;
      const options = item['options'];
      if (
        options !== undefined &&
        (!Array.isArray(options) ||
          !options.every((option) => {
            const row = asRecord(option);
            return (
              row !== undefined &&
              typeof row['label'] === 'string' &&
              (row['description'] === undefined || typeof row['description'] === 'string')
            );
          }))
      )
        return undefined;
      return {
        id: item['id'],
        question: item['question'],
        ...(typeof item['detail'] === 'string' ? { detail: item['detail'] } : {}),
        ...(typeof item['header'] === 'string' ? { header: item['header'] } : {}),
        ...(item['multiSelect'] === true ? { multiSelect: true } : {}),
        ...(Array.isArray(options) ? { options } : {}),
      };
    });
    if (parsed.some((item) => item === undefined)) return undefined;
    userQuestionRequest = {
      sessionId: request['sessionId'],
      ...(typeof request['callId'] === 'string' ? { callId: request['callId'] } : {}),
      questions: parsed as NonNullable<ChannelMessage['userQuestionRequest']>['questions'],
    };
  }
  let sessionFailure: ChannelMessage['sessionFailure'];
  if (record['sessionFailure'] !== undefined) {
    const failure = asRecord(record['sessionFailure']);
    if (
      failure === undefined ||
      author.kind !== 'bot' ||
      (failure['role'] !== 'orchestrator' && failure['role'] !== 'assignment') ||
      typeof failure['sessionId'] !== 'string' ||
      typeof failure['detail'] !== 'string' ||
      (failure['code'] !== undefined && typeof failure['code'] !== 'string') ||
      (failure['status'] !== undefined && typeof failure['status'] !== 'number') ||
      (failure['context'] !== undefined && typeof failure['context'] !== 'string')
    )
      return undefined;
    sessionFailure = {
      role: failure['role'],
      sessionId: failure['sessionId'],
      detail: failure['detail'],
      ...(typeof failure['requestMessageId'] === 'string'
        ? { requestMessageId: failure['requestMessageId'] }
        : {}),
      ...(typeof failure['code'] === 'string' ? { code: failure['code'] } : {}),
      ...(typeof failure['status'] === 'number' ? { status: failure['status'] } : {}),
      ...(typeof failure['context'] === 'string' ? { context: failure['context'] } : {}),
    };
    const progress = parseFailureProgress(failure['progress']);
    if (progress !== undefined) sessionFailure.progress = progress;
    const autoContinue = parseFailureAutoContinue(failure['autoContinue']);
    if (autoContinue !== undefined) sessionFailure.autoContinue = autoContinue;
  }
  let memberDeparture: ChannelMessage['memberDeparture'];
  let turnStop: ChannelMessage['turnStop'];
  let modelSwitch: ChannelMessage['modelSwitch'];
  let toolAutoApproval: ChannelMessage['toolAutoApproval'];
  let toolAutoApprovalPause: ChannelMessage['toolAutoApprovalPause'];
  let voiceCallRecord: ChannelMessage['voiceCallRecord'];
  if (record['voiceCallRecord'] !== undefined) {
    if (author.kind !== 'system' || !isChannelVoiceCallRecord(record['voiceCallRecord']))
      return undefined;
    voiceCallRecord = record['voiceCallRecord'];
  } else if (record['toolAutoApprovalPause'] !== undefined) {
    const pause = asRecord(record['toolAutoApprovalPause']);
    if (
      pause === undefined ||
      author.kind !== 'system' ||
      ['botSlug', 'sessionId', 'template'].some(
        (key) => typeof pause[key] !== 'string' || (pause[key] as string).length === 0,
      ) ||
      (pause['state'] !== 'paused' && pause['state'] !== 'resumed') ||
      (pause['reason'] !== undefined &&
        pause['reason'] !== 'consecutive' &&
        pause['reason'] !== 'session')
    )
      return undefined;
    toolAutoApprovalPause = {
      botSlug: pause['botSlug'] as string,
      sessionId: pause['sessionId'] as string,
      template: pause['template'] as string,
      state: pause['state'],
      ...(pause['reason'] === undefined ? {} : { reason: pause['reason'] }),
    };
  } else if (record['toolAutoApproval'] !== undefined) {
    const auto = asRecord(record['toolAutoApproval']);
    if (
      auto === undefined ||
      author.kind !== 'system' ||
      ['botSlug', 'sessionId', 'callId', 'toolName', 'template', 'reason'].some(
        (key) => typeof auto[key] !== 'string' || (auto[key] as string).length === 0,
      ) ||
      typeof auto['input'] !== 'string' ||
      (auto['outcome'] !== 'allowed' &&
        auto['outcome'] !== 'rejected' &&
        auto['outcome'] !== 'ask-human')
    )
      return undefined;
    toolAutoApproval = {
      botSlug: auto['botSlug'] as string,
      sessionId: auto['sessionId'] as string,
      callId: auto['callId'] as string,
      toolName: auto['toolName'] as string,
      input: auto['input'],
      template: auto['template'] as string,
      ...(typeof auto['templateVersion'] === 'string'
        ? { templateVersion: auto['templateVersion'] }
        : {}),
      outcome: auto['outcome'],
      reason: auto['reason'] as string,
    };
  } else if (record['memberDeparture'] !== undefined) {
    const departure = asRecord(record['memberDeparture']);
    if (
      departure === undefined ||
      author.kind !== 'system' ||
      (departure['memberKind'] !== 'bot' && departure['memberKind'] !== 'human') ||
      typeof departure['memberId'] !== 'string' ||
      departure['memberId'].length === 0 ||
      typeof departure['displayName'] !== 'string' ||
      departure['displayName'].length === 0 ||
      (departure['departureType'] !== undefined &&
        departure['departureType'] !== 'left' &&
        departure['departureType'] !== 'removed')
    )
      return undefined;
    memberDeparture = {
      memberKind: departure['memberKind'],
      memberId: departure['memberId'],
      displayName: departure['displayName'],
      departureType: departure['departureType'] === 'removed' ? 'removed' : 'left',
    };
  } else if (record['memoryCommit'] !== undefined) {
    if (author.kind !== 'system') return undefined;
  } else if (record['modelSwitch'] !== undefined) {
    if (author.kind !== 'system' || !isChannelModelSwitch(record['modelSwitch'])) return undefined;
    modelSwitch = record['modelSwitch'];
  } else if (record['turnStop'] !== undefined) {
    const stop = asRecord(record['turnStop']);
    if (
      stop === undefined ||
      author.kind !== 'system' ||
      typeof stop['botName'] !== 'string' ||
      typeof stop['humanName'] !== 'string'
    )
      return undefined;
    const target = asRecord(stop['target']);
    turnStop = {
      botName: stop['botName'],
      humanName: stop['humanName'],
      ...(target?.['scope'] === 'bot'
        ? { target: { scope: 'bot' as const } }
        : target?.['scope'] === 'session' &&
            (target['role'] === 'orchestrator' || target['role'] === 'assignment')
          ? {
              target: {
                scope: 'session' as const,
                role: target['role'],
                ...(typeof target['title'] === 'string' && target['title'] !== ''
                  ? { title: target['title'] }
                  : {}),
              },
            }
          : {}),
      ...(stop['held'] === true ? { held: true } : {}),
      ...(stop['cause'] === 'failures' ||
      stop['cause'] === 'human-stop' ||
      stop['cause'] === 'quota'
        ? { cause: stop['cause'] }
        : {}),
      ...(typeof stop['failures'] === 'number' ? { failures: stop['failures'] } : {}),
      ...(isChannelTurnStopRests(stop['rests']) ? { rests: stop['rests'] } : {}),
      ...(isChannelTurnStopEngine(stop['engine']) ? { engine: stop['engine'] } : {}),
      ...(stop['routingGroup'] === true ? { routingGroup: true as const } : {}),
      ...(typeof stop['botSlug'] === 'string' && stop['botSlug'] !== ''
        ? { botSlug: stop['botSlug'] }
        : {}),
    };
  } else if (author.kind === 'system' && asRecord(record['onboardingWelcome'])?.['version'] !== 1) {
    return undefined;
  }
  let memoryCommit: ChannelMessage['memoryCommit'];
  if (record['memoryCommit'] !== undefined) {
    const commit = asRecord(record['memoryCommit']);
    const count = (value: unknown): number | null | undefined =>
      value === null
        ? null
        : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
          ? value
          : undefined;
    const files = Array.isArray(commit?.['files'])
      ? commit['files'].flatMap((item: unknown) => {
          const file = asRecord(item);
          const added = count(file?.['added']);
          const deleted = count(file?.['deleted']);
          return file !== undefined &&
            typeof file['path'] === 'string' &&
            added !== undefined &&
            deleted !== undefined
            ? [{ path: file['path'], added, deleted }]
            : [];
        })
      : undefined;
    if (
      commit === undefined ||
      typeof commit['botSlug'] !== 'string' ||
      typeof commit['sha'] !== 'string' ||
      !/^[0-9a-f]{40}$/u.test(commit['sha']) ||
      typeof commit['subject'] !== 'string' ||
      typeof commit['authorName'] !== 'string' ||
      typeof commit['authoredAt'] !== 'string' ||
      files === undefined ||
      count(commit['moreFiles']) == null
    )
      return undefined;
    memoryCommit = {
      botSlug: commit['botSlug'],
      sha: commit['sha'],
      subject: commit['subject'],
      authorName: commit['authorName'],
      authoredAt: commit['authoredAt'],
      files,
      moreFiles: commit['moreFiles'] as number,
    };
  }
  let botDmAction: ChannelMessage['botDmAction'];
  if (record['botDmAction'] !== undefined) {
    const action = asRecord(record['botDmAction']);
    if (
      action === undefined ||
      author.kind !== 'bot' ||
      typeof action['channelId'] !== 'string' ||
      typeof action['messageId'] !== 'string' ||
      typeof action['recipientBotSlug'] !== 'string'
    )
      return undefined;
    botDmAction = {
      channelId: action['channelId'],
      messageId: action['messageId'],
      recipientBotSlug: action['recipientBotSlug'],
    };
  }
  let botCreateAction: ChannelMessage['botCreateAction'];
  if (record['botCreateAction'] !== undefined) {
    const action = asRecord(record['botCreateAction']);
    if (
      action === undefined ||
      author.kind !== 'bot' ||
      typeof action['botSlug'] !== 'string' ||
      typeof action['displayName'] !== 'string'
    )
      return undefined;
    botCreateAction = {
      botSlug: action['botSlug'],
      displayName: action['displayName'],
    };
  }
  let botChannelPost: ChannelMessage['botChannelPost'];
  if (record['botChannelPost'] !== undefined) {
    const post = asRecord(record['botChannelPost']);
    if (
      post === undefined ||
      author.kind !== 'bot' ||
      typeof post['channelId'] !== 'string' ||
      typeof post['messageId'] !== 'string'
    )
      return undefined;
    botChannelPost = {
      channelId: post['channelId'],
      messageId: post['messageId'],
    };
  }
  const botChannelPostPreview =
    typeof record['botChannelPostPreview'] === 'string' || record['botChannelPostPreview'] === null
      ? (record['botChannelPostPreview'] as string | null)
      : undefined;
  const noticeOriginChannel = asRecord(record['noticeOrigin'])?.['channelId'];
  const rawAttachments = record['attachments'];
  const attachments = Array.isArray(rawAttachments)
    ? rawAttachments.map(parseChannelAttachment)
    : undefined;
  if (
    rawAttachments !== undefined &&
    (attachments === undefined ||
      attachments.length > 10 ||
      attachments.some((entry) => entry === undefined))
  )
    return undefined;
  let bridgeOrigin: ChannelMessage['bridgeOrigin'];
  if (record['bridgeOrigin'] !== undefined) {
    const origin = asRecord(record['bridgeOrigin']);
    if (
      (author.kind !== 'bridged' && author.kind !== 'bot') ||
      !origin ||
      ![
        'sourceEventId',
        'platform',
        'conversationId',
        'conversationName',
        'messageId',
        'senderId',
      ].every((key) => typeof origin[key] === 'string' && origin[key].length > 0) ||
      ['accountRef', 'accountName'].some(
        (key) =>
          origin[key] !== undefined && (typeof origin[key] !== 'string' || !origin[key].trim()),
      ) ||
      (origin['threadId'] !== undefined &&
        (typeof origin['threadId'] !== 'string' || origin['threadId'].length === 0))
    )
      return undefined;
    bridgeOrigin = origin as NonNullable<ChannelMessage['bridgeOrigin']>;
  }
  let bridgeMedia: ChannelMessage['bridgeMedia'];
  if (record['bridgeMedia'] !== undefined) {
    const media = asRecord(record['bridgeMedia']);
    if (
      !bridgeOrigin ||
      !media ||
      Object.keys(media).some((key) => !['items', 'parts', 'voice', 'video'].includes(key)) ||
      !Array.isArray(media['items']) ||
      media['items'].length > 32
    )
      return;
    if (media['voice'] !== undefined) {
      const voice = asRecord(media['voice']);
      if (
        (bridgeOrigin.platform !== 'qq' && bridgeOrigin.platform !== 'feishu') ||
        !voice ||
        Object.keys(voice).some((key) => !['transcript', 'durationMs'].includes(key)) ||
        (voice['transcript'] !== 'platform' && voice['transcript'] !== 'unavailable') ||
        (voice['durationMs'] !== undefined &&
          (typeof voice['durationMs'] !== 'number' ||
            !Number.isSafeInteger(voice['durationMs']) ||
            voice['durationMs'] < 0))
      )
        return;
    }
    const ids = new Set<string>();
    for (const raw of media['items']) {
      const item = asRecord(raw);
      if (
        !item ||
        (item['kind'] === 'audio' && !media['voice']) ||
        (item['kind'] === 'video' && !media['video']) ||
        !['image', 'file', 'audio', 'video'].includes(String(item['kind'])) ||
        typeof item['id'] !== 'string' ||
        !/^[a-f0-9]{64}$/.test(item['id']) ||
        typeof item['name'] !== 'string' ||
        ids.has(item['id']) ||
        (item['sizeBytes'] !== undefined &&
          (typeof item['sizeBytes'] !== 'number' ||
            !Number.isSafeInteger(item['sizeBytes']) ||
            item['sizeBytes'] < 0)) ||
        Object.keys(item).some((key) => !['id', 'kind', 'name', 'sizeBytes'].includes(key))
      )
        return;
      ids.add(item['id']);
    }
    if (media['video'] !== undefined) {
      const video = asRecord(media['video']);
      if (
        bridgeOrigin.platform !== 'feishu' ||
        !video ||
        media['voice'] ||
        media['parts'] ||
        Object.keys(video).some(
          (key) => !['attachmentId', 'durationMs', 'posterAttachmentId'].includes(key),
        ) ||
        (video['durationMs'] !== undefined &&
          (typeof video['durationMs'] !== 'number' ||
            !Number.isSafeInteger(video['durationMs']) ||
            video['durationMs'] < 0)) ||
        media['items'].length !== (video['posterAttachmentId'] === undefined ? 1 : 2) ||
        !media['items'].some((raw) => {
          const item = asRecord(raw);
          return (
            item !== undefined && item['id'] === video['attachmentId'] && item['kind'] === 'video'
          );
        }) ||
        (video['posterAttachmentId'] !== undefined &&
          !media['items'].some((raw) => {
            const item = asRecord(raw);
            return (
              item !== undefined &&
              item['id'] === video['posterAttachmentId'] &&
              item['kind'] === 'image'
            );
          }))
      )
        return;
    }
    if (media['parts'] !== undefined) {
      if (!Array.isArray(media['parts']) || media['parts'].length > 256) return;
      for (const raw of media['parts']) {
        const part = asRecord(raw);
        if (
          !part ||
          Object.keys(part).some(
            (key) => !(part['kind'] === 'text' ? ['kind', 'text'] : ['kind', 'id']).includes(key),
          ) ||
          (part['kind'] === 'text'
            ? typeof part['text'] !== 'string' || part['text'].length > 16000
            : part['kind'] !== 'attachment' ||
              typeof part['id'] !== 'string' ||
              !ids.has(part['id']))
        )
          return;
      }
    }
    bridgeMedia = media as NonNullable<ChannelMessage['bridgeMedia']>;
  }
  const format = record['format'];
  if (format !== undefined && format !== 'markdown' && format !== 'text') return undefined;
  const replyTo = record['replyTo'];
  if (replyTo !== undefined && (typeof replyTo !== 'string' || replyTo.length === 0))
    return undefined;
  let toolApprovalDecision: ChannelMessage['toolApprovalDecision'];
  if (record['toolApprovalDecision'] !== undefined) {
    const decision = asRecord(record['toolApprovalDecision']);
    if (
      decision === undefined ||
      author.kind !== 'human' ||
      typeof decision['requestMessageId'] !== 'string' ||
      (decision['outcome'] !== 'allowed-once' &&
        decision['outcome'] !== 'allowed-always-tool' &&
        decision['outcome'] !== 'allowed-always-exact' &&
        decision['outcome'] !== 'allowed-always-all' &&
        decision['outcome'] !== 'rejected') ||
      replyTo !== decision['requestMessageId']
    )
      return undefined;
    const actor =
      decision['actor'] === undefined ? undefined : parseToolApprovalActor(decision['actor']);
    if (decision['actor'] !== undefined && !actor) return undefined;
    toolApprovalDecision = {
      requestMessageId: decision['requestMessageId'],
      outcome: decision['outcome'],
      ...(actor ? { actor } : {}),
    };
  }
  let userQuestionResolution: ChannelMessage['userQuestionResolution'];
  if (record['userQuestionResolution'] !== undefined) {
    const resolution = asRecord(record['userQuestionResolution']);
    if (
      resolution === undefined ||
      typeof resolution['requestMessageId'] !== 'string' ||
      replyTo !== resolution['requestMessageId'] ||
      (resolution['state'] !== 'answered' && resolution['state'] !== 'cancelled')
    )
      return undefined;
    if (resolution['state'] === 'answered') {
      if (author.kind !== 'human' || !Array.isArray(resolution['answers'])) return undefined;
      const answers = resolution['answers'] as unknown[];
      if (
        !answers.every((value) => {
          const item = asRecord(value);
          return (
            item !== undefined &&
            typeof item['id'] === 'string' &&
            Array.isArray(item['selected']) &&
            item['selected'].every((label) => typeof label === 'string') &&
            (item['custom'] === undefined || typeof item['custom'] === 'string')
          );
        })
      )
        return undefined;
      userQuestionResolution = {
        requestMessageId: resolution['requestMessageId'],
        state: 'answered',
        answers: answers as UserQuestionAnswerItem[],
      };
    } else {
      if (author.kind !== 'bot') return undefined;
      userQuestionResolution = {
        requestMessageId: resolution['requestMessageId'],
        state: 'cancelled',
      };
    }
  }
  const quotes = parseMessageQuotes(record['quotes']);
  if (quotes === false) return undefined;
  const rawPreview = record['replyToPreview'];
  let replyToPreview: ChannelMessage['replyToPreview'];
  if (rawPreview === null) {
    replyToPreview = null;
  } else if (rawPreview !== undefined) {
    const preview = asRecord(rawPreview);
    if (preview === undefined || typeof preview['body'] !== 'string') return undefined;
    const previewAuthor = parseAuthor(preview['author']);
    if (previewAuthor === undefined) return undefined;
    const media = preview['media'];
    replyToPreview = {
      author: previewAuthor,
      body: preview['body'],
      ...(isChannelReplyPreviewMedia(media) ? { media } : {}),
    };
  }
  const mentions = record['mentions'];
  if (
    mentions !== undefined &&
    (!Array.isArray(mentions) ||
      mentions.some((entry) => {
        const item = asRecord(entry);
        return (
          item === undefined ||
          typeof item['botSlug'] !== 'string' ||
          typeof item['label'] !== 'string' ||
          typeof item['start'] !== 'number' ||
          typeof item['end'] !== 'number'
        );
      }))
  )
    return undefined;
  const channelRefs = record['channelRefs'];
  const humanMentions = record['humanMentions'];
  if (
    humanMentions !== undefined &&
    (!Array.isArray(humanMentions) ||
      author.kind !== 'bot' ||
      humanMentions.some((entry) => {
        const mention = asRecord(entry);
        return (
          mention === undefined ||
          typeof mention['humanId'] !== 'string' ||
          mention['humanId'].length === 0 ||
          typeof mention['label'] !== 'string' ||
          mention['label'].length === 0 ||
          typeof mention['start'] !== 'number' ||
          typeof mention['end'] !== 'number' ||
          !Number.isSafeInteger(mention['start']) ||
          !Number.isSafeInteger(mention['end']) ||
          mention['start'] < 0 ||
          mention['end'] <= mention['start'] ||
          body.slice(mention['start'], mention['end']) !== '@' + mention['label']
        );
      }))
  )
    return undefined;
  if (
    channelRefs !== undefined &&
    (!Array.isArray(channelRefs) ||
      channelRefs.some((entry) => {
        const item = asRecord(entry);
        return (
          item === undefined ||
          typeof item['channelId'] !== 'string' ||
          typeof item['label'] !== 'string' ||
          typeof item['start'] !== 'number' ||
          typeof item['end'] !== 'number'
        );
      }))
  )
    return undefined;
  const skillInvocations = parseSkillInvocations(record['skillInvocations'], body);
  const channelRevision = record['channelRevision'];
  if (
    channelRevision !== undefined &&
    (typeof channelRevision !== 'number' ||
      !Number.isSafeInteger(channelRevision) ||
      channelRevision < 1)
  )
    return undefined;
  const humanReceipts = record['humanReceipts'];
  if (
    humanReceipts !== undefined &&
    (!Array.isArray(humanReceipts) ||
      humanReceipts.some((entry) => {
        const item = asRecord(entry);
        return (
          item === undefined ||
          typeof item['humanId'] !== 'string' ||
          typeof item['displayName'] !== 'string' ||
          (item['state'] !== 'unread' && item['state'] !== 'read')
        );
      }))
  )
    return undefined;
  const reactions =
    record['reactions'] === undefined ? undefined : parseReactions(record['reactions']);
  if (record['reactions'] !== undefined && reactions === undefined) return undefined;
  const deliveries = record['deliveries'];
  if (
    deliveries !== undefined &&
    (!Array.isArray(deliveries) ||
      deliveries.some((entry) => {
        const item = asRecord(entry);
        return (
          item === undefined ||
          typeof item['botSlug'] !== 'string' ||
          ![
            'pending',
            'observed',
            'running',
            'retryable',
            'needs-repair',
            'handled',
            'ignored',
          ].includes(String(item['state']))
        );
      }))
  )
    return undefined;
  return {
    id,
    at,
    author,
    body,
    ...(asRecord(record['onboardingWelcome'])?.['version'] === 1 && author.kind === 'system'
      ? {
          onboardingWelcome: {
            version: 1 as const,
            ...(asRecord(record['onboardingWelcome'])?.['kind'] === 'tob'
              ? { kind: 'tob' as const }
              : {}),
          },
        }
      : {}),
    ...(body === '' && asRecord(record['contentPurge'])?.['actor'] === 'local-human'
      ? { contentPurged: true as const }
      : {}),
    ...(memorySwitchTarget === undefined ? {} : { memorySwitchTarget }),
    ...(genui === undefined ? {} : { genui }),
    ...(record['genui'] !== undefined && genui === undefined && author.kind === 'bot'
      ? { genuiUnavailable: true as const }
      : {}),
    ...(genuiReply === undefined ? {} : { genuiReply }),
    ...(mentions === undefined
      ? {}
      : { mentions: mentions as NonNullable<ChannelMessage['mentions']> }),
    ...(humanMentions === undefined
      ? {}
      : {
          humanMentions: humanMentions as NonNullable<ChannelMessage['humanMentions']>,
        }),
    ...(channelRefs === undefined
      ? {}
      : {
          channelRefs: channelRefs as NonNullable<ChannelMessage['channelRefs']>,
        }),
    ...(skillInvocations.length === 0 || author.kind !== 'human' ? {} : { skillInvocations }),
    ...(deliveries === undefined
      ? {}
      : {
          deliveries: deliveries as NonNullable<ChannelMessage['deliveries']>,
        }),
    ...(humanReceipts === undefined
      ? {}
      : {
          humanReceipts: humanReceipts as NonNullable<ChannelMessage['humanReceipts']>,
        }),
    ...(channelRevision === undefined ? {} : { channelRevision }),
    ...(reactions === undefined || reactions.length === 0 ? {} : { reactions }),
    ...(grantRequest === true ? { grantRequest: true as const } : {}),
    ...(grantRequest === true && record['grantRequestResolved'] === true
      ? { grantRequestResolved: true }
      : {}),
    ...(grantRequestResolution === undefined ? {} : { grantRequestResolution }),
    ...(assignmentReply === undefined ? {} : { assignmentReply }),
    ...(sessionLinks.length === 0 ? {} : { sessionLinks }),
    ...(botDmAction === undefined ? {} : { botDmAction }),
    ...(botCreateAction === undefined ? {} : { botCreateAction }),
    ...(botChannelPost === undefined ? {} : { botChannelPost }),
    ...(botChannelPost === undefined || botChannelPostPreview === undefined
      ? {}
      : { botChannelPostPreview }),
    ...(typeof noticeOriginChannel === 'string'
      ? { noticeOrigin: { channelId: noticeOriginChannel } }
      : {}),
    ...(memoryCommit === undefined ? {} : { memoryCommit }),
    ...(memberDeparture === undefined ? {} : { memberDeparture }),
    ...(turnStop === undefined ? {} : { turnStop }),
    ...(modelSwitch === undefined ? {} : { modelSwitch }),
    ...(voiceCallRecord === undefined ? {} : { voiceCallRecord }),
    ...(toolAutoApproval === undefined ? {} : { toolAutoApproval }),
    ...(toolAutoApprovalPause === undefined ? {} : { toolAutoApprovalPause }),
    ...(toolApprovalRequest === undefined ? {} : { toolApprovalRequest }),
    ...(approval === undefined ? {} : { approval }),
    ...(sessionFailure === undefined ? {} : { sessionFailure }),
    ...(toolApprovalDecision === undefined ? {} : { toolApprovalDecision }),
    ...(record['privateInputRequest'] === undefined ||
    isMaskedRequest(record['privateInputRequest'])
      ? {}
      : {
          privateInputRequest: parsePrivateInputCard(record['privateInputRequest']),
        }),
    ...(userQuestionRequest === undefined ? {} : { userQuestionRequest }),
    ...(userQuestionResolution === undefined ? {} : { userQuestionResolution }),
    ...(isTakeoverRequestCard(record['takeoverRequest']) && author.kind === 'bot'
      ? { takeoverRequest: record['takeoverRequest'] }
      : {}),
    ...(isTakeoverResolution(record['takeoverResolution'])
      ? { takeoverResolution: record['takeoverResolution'] }
      : {}),
    ...(attachments === undefined ? {} : { attachments: attachments as ChannelAttachmentRef[] }),
    ...(author.kind === 'bot' && parseMessageVoice(record['voice']) !== undefined
      ? { voice: parseMessageVoice(record['voice'])! }
      : {}),
    ...(Array.isArray(record['clearedAttachments']) &&
    record['clearedAttachments'].length <= 10 &&
    record['clearedAttachments'].every(isChannelClearedAttachment)
      ? { clearedAttachments: record['clearedAttachments'] }
      : {}),
    ...(format === undefined ? {} : { format }),
    ...(bridgeOrigin === undefined ? {} : { bridgeOrigin }),
    ...(bridgeMedia === undefined ? {} : { bridgeMedia }),
    ...(replyTo === undefined ? {} : { replyTo }),
    ...(replyToPreview === undefined ? {} : { replyToPreview }),
    ...(quotes === undefined ? {} : { quotes }),
    ...(perf === undefined ? {} : { perf }),
  };
}

export function parseMessageVoice(value: unknown): ChannelMessageVoice | undefined {
  return isChannelMessageVoice(value) ? value : undefined;
}

export function parseReactions(value: unknown): ChannelReaction[] | undefined {
  return channelHost.parseReactions(value);
}

export async function reactToChannelMessage(
  call: BridgeCall,
  channelId: string,
  messageId: string,
  emoji: string,
  active: boolean,
): Promise<ChannelReaction[]> {
  return channelHost.reactToMessage(bridgeHost(call), { channelId, messageId, emoji, active });
}

export async function searchChannelMessages(
  call: BridgeCall,
  channelId: string,
  text: string,
  cursor?: string,
): Promise<{ messages: ChannelMessage[]; nextCursor?: string }> {
  const value = asRecord(
    await unwrap(call, 'channelSearch', {
      channelId,
      text,
      limit: 20,
      ...(cursor === undefined ? {} : { cursor }),
    }),
  );
  const nextCursor = value?.['nextCursor'];
  if (value === undefined || (nextCursor !== undefined && typeof nextCursor !== 'string'))
    throw new Error('invalid channelSearch response');
  return {
    messages: parseChannelMessages(value),
    ...(nextCursor === undefined ? {} : { nextCursor }),
  };
}

export interface MessageSearchHit {
  channelId: string;
  message: ChannelMessage;
  snippet: string;
}

export interface MessageSearchPage {
  hits: MessageSearchHit[];
  nextCursor?: string;
}

export async function searchAllMessages(
  call: BridgeCall,
  text: string,
  cursor?: string,
  limit = 8,
): Promise<MessageSearchPage> {
  return channelHost.searchMessages(bridgeHost(call), { text, limit, cursor }, parseChannelMessage);
}

export function parseChannelMessages(value: unknown): ChannelMessage[] {
  const messages = asRecord(value)?.['messages'];
  if (!Array.isArray(messages)) return [];
  return messages.flatMap((entry) => {
    const message = parseChannelMessage(entry);
    return message === undefined ? [] : [message];
  });
}

function parsePrivateInputCard(value: unknown): NonNullable<ChannelMessage['privateInputRequest']> {
  const record = asRecord(value);
  if (
    record === undefined ||
    Object.keys(record).some(
      (key) =>
        !['sessionId', 'account', 'purpose', 'fields', 'expiresAt', 'replacesMessageId'].includes(
          key,
        ),
    ) ||
    (record['sessionId'] === undefined
      ? typeof record['replacesMessageId'] !== 'string'
      : typeof record['sessionId'] !== 'string') ||
    (record['replacesMessageId'] !== undefined &&
      (typeof record['replacesMessageId'] !== 'string' ||
        !/^[0-9a-f-]{36}$/.test(record['replacesMessageId']))) ||
    typeof record['account'] !== 'string' ||
    typeof record['purpose'] !== 'string' ||
    (record['expiresAt'] !== undefined &&
      (typeof record['expiresAt'] !== 'string' ||
        !Number.isFinite(Date.parse(record['expiresAt'])))) ||
    !Array.isArray(record['fields']) ||
    record['fields'].length < 1 ||
    record['fields'].length > 8
  )
    throw new Error('Invalid private input card');
  const fields = record['fields'].map((value: unknown) => {
    const field = asRecord(value);
    if (
      field === undefined ||
      Object.keys(field).some((key) => !['id', 'label', 'required'].includes(key)) ||
      typeof field['id'] !== 'string' ||
      !/^[a-z][a-z0-9_]{0,47}$/.test(field['id']) ||
      typeof field['label'] !== 'string' ||
      typeof field['required'] !== 'boolean'
    )
      throw new Error('Invalid private input field');
    return {
      id: field['id'],
      label: field['label'],
      required: field['required'],
    };
  });
  if (new Set(fields.map((field) => field.id)).size !== fields.length)
    throw new Error('Invalid private input fields');
  return {
    ...(typeof record['sessionId'] === 'string' ? { sessionId: record['sessionId'] } : {}),
    ...(typeof record['replacesMessageId'] === 'string'
      ? { replacesMessageId: record['replacesMessageId'] }
      : {}),
    account: record['account'],
    purpose: record['purpose'],
    fields,
    ...(typeof record['expiresAt'] === 'string' ? { expiresAt: record['expiresAt'] } : {}),
  };
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

export async function loadBots(call: BridgeCall, signal?: AbortSignal): Promise<BotSummary[]> {
  return parseBotSummaries({ bots: await listBots(bridgeHost(call, signal)) });
}

export async function botExists(call: BridgeCall, slug: string): Promise<boolean> {
  return (await listBots(bridgeHost(call))).some((bot) => bot.slug === slug);
}

export type SshFailureReason =
  | 'auth'
  | 'host-key'
  | 'unreachable'
  | 'ssh-missing'
  | 'timeout'
  | 'other';

const SSH_FAILURE_REASONS: readonly SshFailureReason[] = [
  'auth',
  'host-key',
  'unreachable',
  'ssh-missing',
  'timeout',
  'other',
];

export interface HttpsFallback {
  from: string;
  to: string;
  reason: SshFailureReason;
  detail?: string;
}

export type CreatedBot = BotSummary & { httpsFallback?: HttpsFallback };

function parseHttpsFallback(value: unknown): HttpsFallback | undefined {
  const item = asRecord(value);
  if (typeof item?.['from'] !== 'string' || typeof item['to'] !== 'string') return undefined;
  const reason = SSH_FAILURE_REASONS.find((known) => known === item['reason']) ?? 'other';
  const detail = item['detail'];
  return typeof detail === 'string' && detail.length > 0
    ? { from: item['from'], to: item['to'], reason, detail }
    : { from: item['from'], to: item['to'], reason };
}

export async function createPersonaBot(
  call: BridgeCall,
  input: CreatePersonaBotInput,
  signal?: AbortSignal,
): Promise<CreatedBot> {
  const value = await unwrap(
    call,
    input.gitUrl === undefined ? 'create' : 'createFromGit',
    { ...input },
    signal,
  );
  const bot = parseBotSummary(asRecord(value)?.['bot']);
  if (bot === undefined) throw new Error('invalid create response');
  const httpsFallback = parseHttpsFallback(asRecord(value)?.['httpsFallback']);
  return httpsFallback === undefined ? bot : { ...bot, httpsFallback };
}

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

export async function loadChannels(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<ChannelSummary[]> {
  return (await channels.readChannels(bridgeHost(call, signal))).flatMap((entry) => {
    const channel = parseChannelRecord(entry);
    return channel === undefined ? [] : [channel];
  });
}

export async function loadComposerIdentity(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<ComposerRecoveryIdentity> {
  const value = asRecord(await unwrap(call, 'composerIdentity', {}, signal));
  if (
    value === undefined ||
    !['hostId', 'profileId', 'humanId'].every(
      (key) => typeof value[key] === 'string' && (value[key] as string).length > 0,
    )
  )
    throw new Error('invalid composer identity');
  return {
    hostId: value['hostId'] as string,
    profileId: value['profileId'] as string,
    humanId: value['humanId'] as string,
  };
}

export async function validateComposerDraft(
  call: BridgeCall,
  channelId: string,
  attachments: ChannelAttachmentRef[],
  replyTo?: string,
  quotes?: ReadonlyArray<{ messageId: string; text?: string }>,
): Promise<{
  reply?: ChannelMessage;
  attachments: Array<ChannelAttachmentRef | null>;
  quotes?: Array<ChannelMessage | null>;
}> {
  const value = asRecord(
    await unwrap(call, 'composerValidate', {
      channelId,
      attachments,
      ...(replyTo === undefined ? {} : { replyTo }),
      ...(quotes === undefined ? {} : { quotes }),
    }),
  );
  if (
    value === undefined ||
    !Array.isArray(value['attachments']) ||
    value['attachments'].length !== attachments.length ||
    !value['attachments'].every((ref) => ref === null || isChannelAttachmentRef(ref))
  )
    throw new Error('invalid composer validation');
  const reply = value['reply'] === undefined ? undefined : parseChannelMessage(value['reply']);
  if (value['reply'] !== undefined && reply === undefined)
    throw new Error('invalid composer reply');
  const rawQuotes = value['quotes'];
  if (quotes !== undefined && (!Array.isArray(rawQuotes) || rawQuotes.length !== quotes.length))
    throw new Error('invalid composer quotes');
  const checked = Array.isArray(rawQuotes)
    ? rawQuotes.map((raw) => (raw === null ? null : parseChannelMessage(raw)))
    : undefined;
  if (checked?.some((message) => message === undefined)) throw new Error('invalid composer quotes');
  return {
    ...(reply === undefined ? {} : { reply }),
    attachments: value['attachments'] as Array<ChannelAttachmentRef | null>,
    ...(checked === undefined ? {} : { quotes: checked as Array<ChannelMessage | null> }),
  };
}

export async function openDmChannel(
  call: BridgeCall,
  slug: string,
  displayName: string,
  signal?: AbortSignal,
): Promise<ChannelSummary> {
  return presentChannel(await channels.openBotDm(bridgeHost(call, signal), { slug, displayName }));
}

export async function createGroupChannel(
  call: BridgeCall,
  name: string,
  signal?: AbortSignal,
  operationKey?: string,
): Promise<ChannelSummary> {
  const channel = await channels.createGroupChannel(bridgeHost(call, signal), {
    name,
    members: [],
    ...(operationKey === undefined ? {} : { operationKey }),
  });
  return presentChannel(channel);
}

function presentChannel(value: unknown): ChannelSummary {
  const channel = parseChannelRecord(value);
  if (channel === undefined) throw new HostAnswerInvalid('Invalid Channel result');
  return channel;
}

export interface RenameChannelResult {
  channel: ChannelSummary;
  bot?: BotSummary;
}

export async function renameChannel(
  call: BridgeCall,
  channelId: string,
  name: string,
  signal?: AbortSignal,
): Promise<RenameChannelResult> {
  const value = asRecord(await unwrap(call, 'channelRename', { channelId, name }, signal));
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelRename response');
  const bot = parseBotSummary(value?.['bot']);
  return { channel, ...(bot === undefined ? {} : { bot }) };
}

export type LocalHumanIdentity = HumanIdentity;

export type TelemetryLock = 'config' | 'DO_NOT_TRACK' | 'BOTHARNESS_TELEMETRY';

export interface TelemetryStatus {
  enabled: boolean;
  preference: boolean;
  lockedBy?: TelemetryLock;
}

const TELEMETRY_LOCKS: readonly TelemetryLock[] = [
  'config',
  'DO_NOT_TRACK',
  'BOTHARNESS_TELEMETRY',
];

export function parseTelemetryStatus(value: unknown): TelemetryStatus {
  const item = asRecord(value);
  if (typeof item?.['enabled'] !== 'boolean') throw new Error('invalid telemetry status');
  const lockedBy = TELEMETRY_LOCKS.find((lock) => lock === item['lockedBy']);
  return {
    enabled: item['enabled'],
    preference: item['preference'] !== false,
    ...(lockedBy === undefined ? {} : { lockedBy }),
  };
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

const GIT_UNAVAILABLE_REASONS: readonly GitUnavailableReason[] = [
  'missing',
  'unrunnable',
  'too-old',
];

const GIT_INSTALL_FAILURES: readonly GitInstallFailure[] = [
  'unsupported',
  'network',
  'checksum',
  'unpack',
  'unrunnable',
];

function parseGitInstall(value: unknown): GitInstallState {
  const item = asRecord(value);
  const phase = item?.['phase'];
  if (phase === 'downloading') {
    const received = typeof item?.['received'] === 'number' ? item['received'] : 0;
    const total = typeof item?.['total'] === 'number' ? item['total'] : undefined;
    return { phase, received, ...(total === undefined ? {} : { total }) };
  }
  if (phase === 'verifying' || phase === 'unpacking') return { phase };
  if (phase === 'failed') {
    const reason = GIT_INSTALL_FAILURES.find((candidate) => candidate === item?.['reason']);
    const detail = typeof item?.['detail'] === 'string' ? item['detail'] : undefined;
    return {
      phase,
      reason: reason ?? 'unpack',
      ...(detail === undefined ? {} : { detail }),
    };
  }
  return { phase: 'idle' };
}

export function gitInstalling(git: GitAvailability | undefined): boolean {
  const phase = git?.install.phase;
  return phase === 'downloading' || phase === 'verifying' || phase === 'unpacking';
}

export function parseGitAvailability(value: unknown): GitAvailability {
  const item = asRecord(value);
  const version = typeof item?.['version'] === 'string' ? item['version'] : undefined;
  const extra = {
    installable: item?.['installable'] === true,
    install: parseGitInstall(item?.['install']),
  };
  if (item?.['available'] === true && version !== undefined) {
    const source = item['source'] === 'managed' ? 'managed' : 'system';
    return { available: true, version, source, ...extra };
  }
  const reason = GIT_UNAVAILABLE_REASONS.find((candidate) => candidate === item?.['reason']);
  if (item?.['available'] !== false || reason === undefined) throw new Error('invalid Git status');
  return {
    available: false,
    reason,
    ...(version === undefined ? {} : { version }),
    ...extra,
  };
}

export async function loadGitAvailability(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<GitAvailability> {
  return parseGitAvailability(await unwrap(call, 'gitStatus', {}, signal));
}

export async function startGitInstall(call: BridgeCall): Promise<GitAvailability> {
  return parseGitAvailability(await unwrap(call, 'gitInstall', {}));
}
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

const DATA_RESET_TARGETS = new Set(['data', 'im-settings', 'local-tools']);
const DATA_RESET_KEPT = new Set(['credentials', 'memory', 'exports']);

function parseDataResetPreview(value: unknown): DataResetPreview {
  const preview = asRecord(asRecord(value)?.['preview']);
  const token = preview?.['token'];
  const bots = preview?.['bots'];
  const targets = preview?.['targets'];
  const kept = preview?.['kept'];
  if (
    typeof token !== 'string' ||
    typeof bots !== 'number' ||
    !Array.isArray(targets) ||
    !Array.isArray(kept)
  )
    throw new BridgeCallError('invalid-response', 'Invalid data reset preview');
  return {
    token,
    bots,
    targets: targets.flatMap((entry) => {
      const target = asRecord(entry);
      const kind = target?.['kind'];
      const path = target?.['path'];
      const bytes = target?.['bytes'];
      const files = target?.['files'];
      if (
        typeof kind !== 'string' ||
        !DATA_RESET_TARGETS.has(kind) ||
        typeof path !== 'string' ||
        typeof bytes !== 'number' ||
        typeof files !== 'number'
      )
        return [];
      return [
        {
          kind: kind as DataResetPreview['targets'][number]['kind'],
          path,
          bytes,
          files,
          ...(target?.['partial'] === true ? { partial: true } : {}),
        },
      ];
    }),
    kept: kept.flatMap((entry) => {
      const item = asRecord(entry);
      const kind = item?.['kind'];
      const path = item?.['path'];
      return typeof kind === 'string' && DATA_RESET_KEPT.has(kind) && typeof path === 'string'
        ? [{ kind: kind as DataResetPreview['kept'][number]['kind'], path }]
        : [];
    }),
    restartable: preview?.['restartable'] === true,
  };
}

export async function loadDataResetPreview(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<DataResetPreview> {
  return parseDataResetPreview(await unwrap(call, 'dataResetPreview', {}, signal));
}

export async function confirmDataReset(call: BridgeCall, token: string): Promise<DataResetResult> {
  const reset = asRecord(asRecord(await unwrap(call, 'dataResetConfirm', { token }))?.['reset']);
  return reset?.['status'] === 'restarting'
    ? { status: 'restarting' }
    : { status: 'restart-required' };
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export async function loadTelemetryStatus(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<TelemetryStatus> {
  return parseTelemetryStatus(await unwrap(call, 'telemetryStatus', {}, signal));
}

export async function setTelemetryPreference(
  call: BridgeCall,
  enabled: boolean,
): Promise<TelemetryStatus> {
  return parseTelemetryStatus(await unwrap(call, 'telemetrySet', { enabled }));
}

export async function loadHumanIdentity(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<LocalHumanIdentity> {
  return readHumanIdentity(bridgeHost(call, signal));
}

export async function setHumanDefaultName(
  call: BridgeCall,
  displayName: string | null,
): Promise<LocalHumanIdentity> {
  return setHumanName(bridgeHost(call), displayName);
}

export async function setHumanAvatar(
  call: BridgeCall,
  avatar: string | null,
): Promise<LocalHumanIdentity> {
  return writeHumanAvatar(bridgeHost(call), avatar);
}

export async function finishHumanProfileSetup(call: BridgeCall): Promise<LocalHumanIdentity> {
  return finishHumanProfile(bridgeHost(call));
}

export async function loadHumanAvatars(
  call: BridgeCall,
  humanIds: string[],
): Promise<HumanAvatarImage[]> {
  return readHumanAvatars(bridgeHost(call), humanIds);
}

export async function setChannelHumanName(
  call: BridgeCall,
  channelId: string,
  nickname: string | null,
): Promise<ChannelSummary> {
  const { channel } = await channels.setChannelHumanName(bridgeHost(call), channelId, nickname);
  return presentChannel(channel);
}

export async function setGroupAvatar(
  call: BridgeCall,
  channelId: string,
  avatar: string | null,
): Promise<ChannelSummary> {
  const value = asRecord(await unwrap(call, 'channelGroupAvatarSet', { channelId, avatar }));
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupAvatarSet response');
  return channel;
}

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

export async function updateBotProfile(
  call: BridgeCall,
  slug: string,
  patch: { roles?: string[]; description?: string },
): Promise<BotSummary> {
  const bot = parseBotSummary(await updateBot(bridgeHost(call), slug, patch));
  if (bot === undefined) throw new Error('invalid update response');
  return bot;
}

export async function inviteGroupBot(
  call: BridgeCall,
  channelId: string,
  botSlug: string,
): Promise<ChannelSummary> {
  const value = asRecord(await unwrap(call, 'channelGroupInvite', { channelId, botSlug }));
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupInvite response');
  return channel;
}

export async function cancelGroupInvitation(
  call: BridgeCall,
  channelId: string,
  invitationId: string,
): Promise<ChannelSummary> {
  const value = asRecord(
    await unwrap(call, 'channelGroupInviteCancel', { channelId, invitationId }),
  );
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupInviteCancel response');
  return channel;
}

export async function decideGroupJoin(
  call: BridgeCall,
  channelId: string,
  requestId: string,
  accept: boolean,
): Promise<ChannelSummary> {
  const channel = await channels.decideGroupJoin(bridgeHost(call), {
    channelId,
    requestId,
    accept,
  });
  return presentChannel(channel);
}

export async function removeGroupMember(
  call: BridgeCall,
  channelId: string,
  botSlug: string,
): Promise<ChannelSummary> {
  const value = asRecord(await unwrap(call, 'channelGroupMemberRemove', { channelId, botSlug }));
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupMemberRemove response');
  return channel;
}

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

export async function sendSessionRequest(
  call: BridgeCall,
  slug: string,
  sessionId: string,
  text: string,
  steer: boolean,
): Promise<void> {
  const value = asRecord(
    await unwrap(call, 'botToolRun', {
      slug,
      tool: 'unarchive_assignment',
      args: {
        session_id: sessionId,
        message: text,
        mode: steer ? 'next-step' : 'next-turn',
      },
    }),
  );
  let result: unknown = value?.['result'];
  if (typeof result === 'string') {
    try {
      result = JSON.parse(result);
    } catch {
      result = undefined;
    }
  }
  const outcome = asRecord(result);
  if (outcome?.['code'] !== undefined)
    throw new Error(
      typeof outcome['message'] === 'string' ? outcome['message'] : String(outcome['code']),
    );
}

export async function sendOrchestratorMessage(
  call: BridgeCall,
  botSlug: string,
  sessionId: string,
  text: string,
): Promise<void> {
  await unwrap(call, 'sessionMessageSend', { botSlug, sessionId, text });
}

export async function loadGroupWakePolicies(
  call: BridgeCall,
  channelId: string,
): Promise<GroupMemberWakePolicy[]> {
  const value = asRecord(await unwrap(call, 'channelGroupWakePolicies', { channelId }));
  const members = value?.['members'];
  if (
    !Array.isArray(members) ||
    members.some(
      (row) =>
        typeof row.botSlug !== 'string' ||
        typeof row.inherited !== 'boolean' ||
        !row.policy ||
        !['all', 'mentions', 'digest', 'silent'].includes(row.policy.mode) ||
        !Number.isSafeInteger(row.policy.count) ||
        !Number.isSafeInteger(row.policy.intervalSeconds),
    )
  )
    throw new Error('invalid channelGroupWakePolicies response');
  return members;
}

export async function setGroupWakePolicy(
  call: BridgeCall,
  channelId: string,
  botSlug: string,
  policy: {
    mode: 'all' | 'mentions' | 'digest' | 'silent';
    count: number;
    intervalSeconds: number;
    inherit?: boolean;
  },
): Promise<ChannelSummary> {
  const value = asRecord(
    await unwrap(call, 'channelGroupWakeSet', {
      channelId,
      botSlug,
      ...policy,
    }),
  );
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupWakeSet response');
  return channel;
}

export async function deleteGroupChannel(call: BridgeCall, channelId: string): Promise<void> {
  await channels.deleteGroupChannel(bridgeHost(call), channelId);
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

export function parseStoredChannelMessage(value: unknown): ChannelMessage | undefined {
  const parsed = parseChannelMessage(value);
  if (parsed !== undefined) return parsed;
  const record = asRecord(value);
  const id = record?.['id'];
  const at = record?.['at'];
  const body = record?.['body'];
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    typeof at !== 'string' ||
    at.length === 0 ||
    typeof body !== 'string'
  )
    return undefined;
  const revision = record?.['channelRevision'];
  reportFailure(
    'showing-an-unreadable-channel-message-as-plain-text',
    'showing an unreadable Channel message as plain text',
    id,
  );
  return {
    id,
    at,
    author: parseAuthor(record?.['author']) ?? { kind: 'system' },
    body,
    format: 'text',
    ...(typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 1
      ? { channelRevision: revision }
      : {}),
  };
}

export function parseJournalEntry(value: unknown): JournalEntry | undefined {
  return channelHost.parseJournalEntry(value, parseStoredChannelMessage);
}

export function parseJournalPage(value: unknown): JournalPage | undefined {
  try {
    return channelHost.parseJournalPage(value, parseStoredChannelMessage);
  } catch {
    return undefined;
  }
}

export interface FilesPage {
  entries: JournalEntry[];
  nextBefore?: number;
}

export async function loadFilesPage(
  call: BridgeCall,
  channelId: string,
  request: { before?: number; limit?: number },
  signal?: AbortSignal,
): Promise<FilesPage> {
  const raw = asRecord(await unwrap(call, 'channelFilesPage', { channelId, ...request }, signal));
  const entries = raw?.['entries'];
  const nextBefore = raw?.['nextBefore'];
  const parsed = Array.isArray(entries) ? entries.map((entry) => parseJournalEntry(entry)) : [];
  if (
    !Array.isArray(entries) ||
    parsed.some((entry) => entry === undefined) ||
    !(nextBefore === undefined || (Number.isSafeInteger(nextBefore) && Number(nextBefore) > 0))
  )
    throw new Error('invalid channelFilesPage response');
  return {
    entries: parsed as JournalEntry[],
    ...(nextBefore === undefined ? {} : { nextBefore: nextBefore as number }),
  };
}

export async function loadJournalPage(
  call: BridgeCall,
  channelId: string,
  request: { through: number; before?: number; limit?: number },
  signal?: AbortSignal,
): Promise<JournalPage> {
  return channelHost.readChannelJournal(
    bridgeHost(call, signal),
    channelId,
    request,
    parseStoredChannelMessage,
  );
}

export async function loadTimelinePage(
  call: BridgeCall,
  channelId: string,
  request: TimelinePageRequest = {},
  signal?: AbortSignal,
): Promise<{ page: TimelinePage; revision: number }> {
  return channelHost.readChannelTimeline(
    bridgeHost(call, signal),
    channelId,
    request,
    parseStoredChannelMessage,
  );
}

export async function loadReadPosition(
  call: BridgeCall,
  channelId: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const value = asRecord(await unwrap(call, 'channelReadPosition', { channelId }, signal));
  const position = value?.['position'];
  if (position === undefined) return undefined;
  const messageId = asRecord(position)?.['messageId'];
  if (typeof messageId !== 'string' || messageId.length === 0)
    throw new Error('invalid channelReadPosition response');
  return messageId;
}

export async function markReadPosition(
  call: BridgeCall,
  channelId: string,
  messageId: string,
): Promise<void> {
  await channelHost.markChannelRead(bridgeHost(call), channelId, messageId);
}

export async function loadAllBotPreview(
  call: BridgeCall,
  channelId: string,
): Promise<AllBotPreview> {
  return channels.readAllBotPreview(bridgeHost(call), channelId);
}

export async function sendChannelMessage(
  call: BridgeCall,
  channelId: string,
  body: string,
  replyTo?: string,
  attachments?: ChannelAttachmentRef[],
  messageId?: string,
  signal?: AbortSignal,
  memorySwitchTarget?: string,
  mentions?: ChannelMessage['mentions'],
  channelRefs?: ChannelMessage['channelRefs'],
  grantRequestResolution?: ChannelMessage['grantRequestResolution'],
  assignmentReply?: ChannelMessage['assignmentReply'],
  allBotMention?: AllBotMention,
  genuiReply?: GenuiMessageReply,
  skillInvocations?: ChannelSkillInvocationToken[],
  quotes?: readonly QuoteRef[],
): Promise<ChannelMessage> {
  return channelHost.sendToChannel(
    bridgeHost(call, signal),
    {
      channelId,
      body,
      ...(skillInvocations === undefined || skillInvocations.length === 0
        ? {}
        : { skillInvocations }),
      ...(replyTo === undefined ? {} : { replyTo }),
      ...(quotes === undefined || quotes.length === 0
        ? {}
        : {
            quotes: quotes.map(quoteRefOf),
          }),
      ...(attachments === undefined ? {} : { attachments }),
      ...(messageId === undefined ? {} : { messageId }),
      ...(memorySwitchTarget === undefined ? {} : { memorySwitchTarget }),
      ...(mentions === undefined ? {} : { mentions }),
      ...(channelRefs === undefined ? {} : { channelRefs }),
      ...(grantRequestResolution === undefined ? {} : { grantRequestResolution }),
      ...(assignmentReply === undefined ? {} : { assignmentReply }),
      ...(allBotMention === undefined ? {} : { allBotMention }),
      ...(genuiReply === undefined ? {} : { genuiReply }),
    },
    parseChannelMessage,
  );
}

export const { parseGenuiView, loadGenuiView, saveGenuiView } =
  createGenuiReportBridge(genuiViewSchema);

export type { ToolApprovalStatus } from '@botharness/host-protocol/wire';

export async function loadPrivateInputStatus(
  call: BridgeCall,
  channelId: string,
  messageId: string,
): Promise<import('../../../core/src/credentials/contracts.js').PrivateInputStatus> {
  try {
    return await channelHost.loadPrivateInputStatus(bridgeHost(call), channelId, messageId);
  } catch (error) {
    if (error instanceof BridgeCallError)
      throw new Error('Private input status is unavailable', { cause: error });
    throw error;
  }
}

export async function submitPrivateInput(
  call: BridgeCall,
  channelId: string,
  messageId: string,
  values: Record<string, string>,
): Promise<void> {
  const result = await call('privateInputSubmit', {
    channelId,
    messageId,
    values,
  });
  if (!result.ok)
    throw new BridgeCallError(result.error.code, result.error.message, result.error.details);
  privateInputAccepted(result.value);
}

export function privateInputAccepted(value: unknown): void {
  const { accepted, reason } = (value ?? {}) as {
    accepted?: unknown;
    reason?: unknown;
  };
  if (accepted === true) return;
  throw new BridgeCallError(
    'private-input-not-accepted',
    typeof reason === 'string'
      ? 'Private input was not accepted: ' + reason
      : 'Private input was not accepted',
    typeof reason === 'string' ? { reason } : undefined,
  );
}

export async function settleTakeover(
  call: BridgeCall,
  channelId: string,
  messageId: string,
  outcome: 'done' | 'failed' | 'cancelled',
): Promise<'done' | 'failed' | 'cancelled' | 'expired' | undefined> {
  const value = await unwrap(
    call,
    outcome === 'cancelled' ? 'takeoverCancel' : 'takeoverComplete',
    outcome === 'cancelled'
      ? { channelId, messageId, surface: 'web' }
      : { channelId, messageId, outcome, surface: 'web' },
  );
  const status = (value as { takeover?: { status?: unknown } } | undefined)?.takeover?.status;
  return status === 'done' || status === 'failed' || status === 'cancelled' || status === 'expired'
    ? status
    : undefined;
}

export async function cancelPrivateInput(
  call: BridgeCall,
  channelId: string,
  messageId: string,
): Promise<void> {
  const result = await call('privateInputCancel', { channelId, messageId });
  if (!result.ok || (result.value as { accepted?: unknown }).accepted !== true)
    throw new Error('Private input cancellation was not accepted');
}

export const { previewApprovalTemplateDeletion, deleteApprovalTemplate } =
  createApprovalTemplateDeletionBridge(approvalTemplateDeletionPreviewSchema);

export interface WorkspaceOption {
  id: string;
  path: string;
  title: string;
}

export async function loadHostFolders(
  call: BridgeCall,
  path?: string,
  signal?: AbortSignal,
  offset?: number,
): Promise<import('../../../core/src/workspaces/folder-browse.js').FolderListing> {
  return browseHostFolders(bridgeHost(call, signal), path, offset);
}

export async function loadWorkspaceOptions(call: BridgeCall): Promise<WorkspaceOption[]> {
  return loadHostWorkspaceOptions(bridgeHost(call));
}

export { parseHumanAttentionPage } from '@botharness/host-client/people';

export async function loadRoster(call: BridgeCall, signal?: AbortSignal): Promise<RosterSnapshot> {
  return parseRosterSnapshot(await rosterReaders.readRoster(bridgeHost(call, signal)));
}

export interface RosterBatchInput {
  action: 'pin' | 'unpin' | 'hide' | 'move';
  channelIds: readonly string[];
  sectionId?: string;
}

export async function applyRosterBatch(
  call: BridgeCall,
  input: RosterBatchInput,
  signal?: AbortSignal,
): Promise<RosterSnapshot> {
  const payload = {
    action: input.action,
    channelIds: [...input.channelIds],
    ...(input.sectionId === undefined ? {} : { sectionId: input.sectionId }),
  };
  return parseRosterSnapshot(
    await rosterReaders.applyRosterBatch(bridgeHost(call, signal), payload),
  );
}

export async function createRosterSection(
  call: BridgeCall,
  name: string,
  signal?: AbortSignal,
): Promise<RosterSection> {
  return channels.createRosterSection(bridgeHost(call, signal), name);
}

export async function renameRosterSection(
  call: BridgeCall,
  sectionId: string,
  name: string,
  signal?: AbortSignal,
): Promise<void> {
  await unwrap(call, 'sectionRename', { sectionId, name }, signal);
}

export async function removeRosterSection(
  call: BridgeCall,
  sectionId: string,
  signal?: AbortSignal,
): Promise<void> {
  await channels.removeRosterSection(bridgeHost(call, signal), sectionId);
}

export async function assignRosterChannel(
  call: BridgeCall,
  channelId: string,
  sectionId: string | undefined,
  index?: number,
  signal?: AbortSignal,
): Promise<void> {
  await channels.assignRosterChannel(bridgeHost(call, signal), { channelId, sectionId, index });
}

export async function reorderRosterSections(
  call: BridgeCall,
  order: readonly string[],
  signal?: AbortSignal,
): Promise<void> {
  await unwrap(call, 'sectionReorder', { order }, signal);
}

export async function reorderTopOrder(
  call: BridgeCall,
  order: readonly TopOrderEntry[],
  signal?: AbortSignal,
): Promise<void> {
  await unwrap(call, 'topReorder', { order }, signal);
}

export async function setRosterPins(
  call: BridgeCall,
  pins: readonly string[],
  signal?: AbortSignal,
): Promise<void> {
  await unwrap(call, 'pinsSet', { pins }, signal);
}

export async function setRosterHidden(
  call: BridgeCall,
  hidden: readonly string[],
  signal?: AbortSignal,
): Promise<void> {
  await unwrap(call, 'hiddenSet', { hidden }, signal);
}

export async function setChannelMute(
  call: BridgeCall,
  channelId: string,
  muted: boolean,
  signal?: AbortSignal,
): Promise<void> {
  await channels.setChannelMuted(bridgeHost(call, signal), channelId, muted);
}

export async function loadWorkspaceFileTarget(
  call: BridgeCall,
  slug: string,
  grantId: string,
): Promise<HostFileTarget> {
  const response = asRecord(await unwrap(call, 'workspaceFileTarget', { slug, grantId }));
  const target = asRecord(response?.['target']);
  if (
    typeof target?.['path'] !== 'string' ||
    target['relativePath'] !== '' ||
    target['kind'] !== 'directory'
  )
    throw new Error('Invalid Workspace directory target');
  return { path: target['path'], relativePath: '', kind: 'directory' };
}

export async function loadProfileUsage(
  call: BridgeCall,
  channelId: string,
  filter: UsageFilter,
): Promise<UsageQueryResult> {
  const value = asRecord(await unwrap(call, 'profileUsage', { channelId, filter }));
  const count = (input: unknown) =>
    input === null || (Number.isSafeInteger(input) && Number(input) >= 0);
  if (
    value === undefined ||
    !Array.isArray(value['rows']) ||
    value['rows'].length > 2000 ||
    !value['rows'].every((item) => {
      const row = asRecord(item);
      return (
        row !== undefined &&
        ['day', 'purpose', 'provider', 'model'].every((key) => typeof row[key] === 'string') &&
        ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens'].every(
          (key) => count(row[key]),
        )
      );
    }) ||
    !count(value['periodTotal']) ||
    !count(value['allTimeTotal']) ||
    !['periodRecords', 'allTimeRecords'].every(
      (key) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0,
    ) ||
    !['models', 'providers'].every(
      (key) =>
        Array.isArray(value[key]) &&
        value[key].length <= 1000 &&
        value[key].every((item: unknown) => typeof item === 'string'),
    ) ||
    !['truncated', 'facetsTruncated', 'legacyBaseline'].every(
      (key) => typeof value[key] === 'boolean',
    ) ||
    !['ready', 'reconciling', 'degraded'].includes(String(value['freshness'])) ||
    typeof value['readAt'] !== 'string' ||
    !Number.isFinite(Date.parse(value['readAt'])) ||
    (value['reconciledAt'] !== null &&
      (typeof value['reconciledAt'] !== 'string' ||
        !Number.isFinite(Date.parse(value['reconciledAt'])))) ||
    !['start', 'end', 'model', 'provider', 'purpose'].every(
      (key) =>
        asRecord(value['filter'])?.[key] === (filter as unknown as Record<string, unknown>)[key],
    )
  )
    throw new Error('invalid Profile usage');
  return value as unknown as UsageQueryResult;
}

export async function loadProfileSessionUsage(
  call: BridgeCall,
  channelId: string,
): Promise<ProfileSessionUsage> {
  const value = asRecord(await unwrap(call, 'profileSessionUsage', { channelId }));
  if (
    value === undefined ||
    typeof value['slug'] !== 'string' ||
    value['weeks'] !== 26 ||
    typeof value['since'] !== 'string' ||
    !Number.isFinite(Date.parse(value['since'])) ||
    !Array.isArray(value['rows']) ||
    value['rows'].length > 6 ||
    !value['rows'].every((item) => {
      const row = asRecord(item);
      return (
        row !== undefined &&
        typeof row['sessionId'] === 'string' &&
        ['orchestrator', 'assignment'].includes(String(row['role'])) &&
        typeof row['label'] === 'string' &&
        row['label'].length <= 160 &&
        typeof row['updatedAt'] === 'string' &&
        Number.isFinite(Date.parse(row['updatedAt'])) &&
        ['ready', 'unknown', 'partial', 'unavailable'].includes(String(row['status'])) &&
        (row['totalTokens'] === null ||
          (Number.isSafeInteger(row['totalTokens']) && Number(row['totalTokens']) >= 0))
      );
    })
  )
    throw new Error('invalid Profile Session usage');
  return value as unknown as ProfileSessionUsage;
}

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

export async function loadMessageAttachmentTarget(
  call: BridgeCall,
  channelId: string,
  messageId: string,
  fileId: string,
): Promise<HostFileTarget> {
  const response = asRecord(
    await unwrap(call, 'messageAttachmentTarget', {
      channelId,
      messageId,
      fileId,
    }),
  );
  const target = asRecord(response?.['target']);
  if (
    typeof target?.['path'] !== 'string' ||
    typeof target['relativePath'] !== 'string' ||
    target['kind'] !== 'file'
  )
    throw new Error('Invalid message attachment target');
  return {
    path: target['path'],
    relativePath: target['relativePath'],
    kind: 'file',
  };
}

export async function markAllReadPositions(
  call: BridgeCall,
  scope: { channelId?: string | undefined; botSlug?: string | undefined } = {},
): Promise<void> {
  await channelHost.markAllChannelsRead(bridgeHost(call), scope);
}

export async function loadOverviewUsage(
  call: BridgeCall,
  period: UsageOverviewPeriod,
  after?: string,
): Promise<OverviewUsage> {
  return loadUsage(bridgeHost(call), period, after);
}

function parseQuotePreview(value: unknown): ChannelReplyPreview | null | false {
  if (value === null) return null;
  const preview = asRecord(value);
  if (preview === undefined || typeof preview['body'] !== 'string') return false;
  const author = parseAuthor(preview['author']);
  if (author === undefined) return false;
  const media = preview['media'];
  return {
    author,
    body: preview['body'],
    ...(isChannelReplyPreviewMedia(media) ? { media } : {}),
  };
}

function parseMessageQuotes(value: unknown): ChannelMessageQuote[] | undefined | false {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 8) return false;
  const quotes: ChannelMessageQuote[] = [];
  for (const entry of value) {
    const quote = asRecord(entry);
    if (quote === undefined || typeof quote['messageId'] !== 'string') return false;
    if (quote['text'] !== undefined && typeof quote['text'] !== 'string') return false;
    if (quote['note'] !== undefined && typeof quote['note'] !== 'string') return false;
    const preview =
      quote['preview'] === undefined ? undefined : parseQuotePreview(quote['preview']);
    if (preview === false) return false;
    quotes.push({
      messageId: quote['messageId'],
      ...(typeof quote['text'] === 'string' ? { text: quote['text'] } : {}),
      ...(typeof quote['note'] === 'string' ? { note: quote['note'] } : {}),
      ...(preview === undefined ? {} : { preview }),
    });
  }
  return quotes;
}
