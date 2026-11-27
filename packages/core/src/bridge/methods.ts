import type { WorkspaceLooks } from '../workspaces/workspace-looks.js';
import {
  createHostSessionsMethods,
  type HostSessionBridgeMethods,
  type NativeSessions,
} from '../features/sessions/host-sessions.js';
import { createSessionBotMethods } from '../features/sessions/session-bot-methods.js';
import {
  createPersonaBotsBridgeMethods,
  type PersonaBotsBridgeMethods,
} from '../features/personabots/methods.js';
import { createBotDetails } from '../features/personabots/bot-details.js';
import {
  createTeamBridgeMethods,
  type TeamBridgeMethods,
  createTeamBridge,
} from '../features/team/methods.js';
import {
  createActivityBridgeMethods,
  type ActivityBridgeMethods,
} from '../features/activity/methods.js';
import {
  createMessagingBridgeMethods,
  type MessagingBridgeMethods,
  createMessagingCall,
} from '../features/messaging/methods.js';
import {
  createSessionsBridgeMethods,
  type SessionsBridgeMethods,
} from '../features/sessions/methods.js';
import type { IdleCompactionDeps, SessionEngineQuota } from '../features/sessions/methods.js';
import {
  createAssignmentsBridgeMethods,
  type AssignmentsBridgeMethods,
  type AssignmentsBridgeDeps,
} from '../features/assignments/methods.js';
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
import {
  createWorkspacesBridgeMethods,
  type WorkspacesBridgeMethods,
  type WorkspacesBridgeDeps,
} from '../features/workspaces/methods.js';
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
import {
  contributedBridgeMethods,
  mergeFeatureMethods,
  type ContributedBridgeDeps,
} from '../feature-contributions.js';
import { asObject, invalidInput, type BridgeResult } from '../kernel/method-utils.js';
import type { OrchestratorRunner } from '@botharness/host-protocol/wire';
import { botModelAllowed } from '../team/models.js';
import { TeamError } from '../team-policy/error.js';
import { guardHumanBridge } from '../features/team/bridge-access.js';
import { botOwner } from '../team-policy/bot-access.js';
import { privateBotRegistry } from '../features/team/private-bot-registry.js';
import { privateBotCreations } from '../bots/creation.js';
import { createHash } from 'node:crypto';
import type { TeamService } from '../team/service.js';
import { OWNER_HUMAN_CONTEXT, type HumanContext, type HumanId } from '../humans/context.js';
import {
  createVoiceBridgeMethods,
  type VoiceBridgeMethods,
  type VoiceBridgeDeps,
} from '../features/voice/methods.js';
import type { BotContact } from '../runtime/bot-contact-discovery.js';
import { createBotImports, type BotImportsService } from '../bots/imports.js';
import type { BotContextWindow } from '../runtime/context-window.js';
import { type CloudWork } from '../cloud/work.js';
import type { CloudConnections } from '../cloud/connections.js';
import { type ChannelManagementService } from '../channels/management.js';
import { BotZipUploadError } from '../bots/zip-upload.js';
import { validBotCreationKey, type BotCreationService } from '../bots/creation.js';
import { type TobService } from '../tob/service.js';
import type { BotOnboarding } from '../onboarding/service.js';
import type { ClientAcknowledgements } from '../onboarding/acknowledgements.js';
import { type UsageOverviewBuckets, type UsageOverviewResult } from '../usage/overview.js';
import type { OutboundMessaging } from '../messaging/outbound.js';
import type { ActiveDay } from '../telemetry/active-day.js';
import type { TelemetryCapture, TelemetryStatus } from '../telemetry/service.js';
import type { SessionLiveStreams } from '../runtime/session-live.js';
import { type PresentToolResult } from '../runtime/session-tool-detail.js';
import { type PublicToolCall } from '../runtime/assignment-timeline.js';
import type { AttachmentStore } from '../attachments/store.js';
import { randomUUID } from 'node:crypto';
import type { TakeoverHandoffs } from '../takeover/handoffs.js';
import { type ChannelMessage, type ChannelRecord } from '../channels/channel.js';
import { type BotBannerSummary } from '../bots/banner-http.js';
import type { AvatarAppearance, RetainedAvatarAppearance } from '../bots/avatar-appearance.js';
import { type BotPrimaryColor } from '../bots/primary-color.js';
import type { CallTextHarvest, CallTextInput } from '../voice/call-text.js';
import type { ComposerRecoveryIdentity } from './composer-recovery.js';
import type { ChannelStore } from '../channels/store.js';
import type { ChannelChangeCursor } from '../channels/timeline.js';
import type { PersonaBotRecord } from '../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { PersonaBotDeletions } from '../bots/deletion.js';
import { RosterStore } from '../roster/store.js';
import type { SessionOwnership, SessionRootRole } from '../sessions/ownership.js';
import type {
  UsageProjection,
  DshUsageSessionLogReader,
  SessionUsageSummary,
} from '../usage/usage.js';
import { type PersonaBotModelPlan } from '../models/presets.js';
import { type StandingLimits } from '../memory/soul.js';
import { type FolderBrowser } from '../workspaces/folder-browse.js';
import type { ChannelToolApproval } from '../workspaces/tool-approval.js';
import type { BotAttentionQuery } from '../runtime/attention.js';
import type { BotSourcePolicyStore } from '../runtime/source-policy.js';
import type { GitService } from '../memory/managed-git.js';
import {
  type HumanAttentionQuery,
  type HumanAttentionDecisions,
} from '../runtime/human-attention.js';
import type { BotRuntime } from '../runtime/bot-runtime.js';
import type { AggregatedState, BotStateTracker, SessionState } from '../state/bot-state.js';
import {
  botInChannel,
  createChannelViews,
  authorizeChannelBridgeMethods,
} from '../features/channels/methods.js';
import { createTobAdapterMethods, type TobAdapterMethods } from '../features/tob/methods.js';
import {
  createTakeoverAdapterMethods,
  type TakeoverAdapterMethods,
} from '../features/takeover/methods.js';
import {
  createWorkspacesAdapterMethods,
  type WorkspacesAdapterMethods,
} from '../features/workspaces/methods.js';
import {
  createSessionsAdapterMethods,
  type SessionsAdapterMethods,
} from '../features/sessions/methods.js';
import {
  createChannelFilesAdapterMethods,
  type ChannelFilesAdapterMethods,
} from '../features/channel-files/methods.js';
import {
  createChannelsSendAdapterMethods,
  type ChannelsSendAdapterMethods,
} from '../features/channels/send-methods.js';
import {
  createGroupMemberMethods,
  type GroupMemberMethods,
} from '../features/channels/group-members.js';
import {
  createChannelsManagementAdapterMethods,
  type ChannelsManagementAdapterMethods,
} from '../features/channels/management-methods.js';
import {
  createChannelsAdapterMethods,
  type ChannelsAdapterMethods,
} from '../features/channels/methods.js';
import { createDmMemoryReader } from '../features/memory/methods.js';

export type {
  ActivityOverview,
  ProfileActivityDay,
  ProfileActivityReasonDay,
  ProfileTokenBuckets,
  ProfileActivityTokensDay,
  ProfileModelUsageRow,
  ProfileActivity,
} from '../features/activity/methods.js';

export type { MessagingAppsView } from '../features/messaging/methods.js';

export type {
  IdleCompactionView,
  IdleCompactionDeps,
  SessionEngineQuota,
  OwnedSessionSummary,
  OwnedSessionBot,
} from '../features/sessions/methods.js';

export { SESSION_PROGRESS_LIMIT } from '../features/assignments/methods.js';
export type { SessionProgressEntry } from '../features/assignments/methods.js';

export type {
  ApprovalTemplateEntry,
  ApprovalReviewerModelView,
} from '../features/approvals/methods.js';

export type { ModelCatalogGroup } from '../features/models/routing.js';

export type { SkillDetail } from '../features/skills/methods.js';

export type { BridgeError, BridgeResult } from '../kernel/method-utils.js';

export type {
  BotPromptView,
  PromptLimitView,
  PromptPartView,
} from '../features/prompts/methods.js';

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
    ReturnType<typeof contributedBridgeMethods>,
    TeamBridgeMethods,
    ModelProviderBridgeMethods,
    EngineAccountBridgeMethods,
    EngineSelectionBridgeMethods,
    ModelsBridgeMethods,
    VoiceBridgeMethods,
    ApprovalsBridgeMethods,
    WorkspacesBridgeMethods,
    SessionsBridgeMethods,
    AssignmentsBridgeMethods,
    MemoryBridgeMethods,
    MessagingBridgeMethods,
    ActivityBridgeMethods,
    PersonaBotsBridgeMethods,
    ChannelsAdapterMethods,
    ChannelsManagementAdapterMethods,
    GroupMemberMethods,
    ChannelsSendAdapterMethods,
    ChannelFilesAdapterMethods,
    Omit<SessionsAdapterMethods, 'sessionMessageSend'>,
    HostSessionBridgeMethods,
    ReturnType<typeof createSessionBotMethods>,
    WorkspacesAdapterMethods,
    TakeoverAdapterMethods,
    TobAdapterMethods {
  sessionMessageSend(
    payload: unknown,
  ): Promise<
    BridgeResult<
      { sourceEventId: string; requestId?: never } | { requestId: string; sourceEventId?: never }
    >
  >;
}

export interface BridgeMethodsDeps
  extends
    ContributedBridgeDeps,
    ModelsBridgeDeps,
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
  composerIdentity?: (human: HumanContext) => ComposerRecoveryIdentity;
  warn?: (message: string) => void;
  registry: PersonaBotRegistry;
  creations?: BotCreationService;
  imports?: BotImportsService;
  channelManagement?: ChannelManagementService;
  deletions?: PersonaBotDeletions;
  attachments?: AttachmentStore;
  onboarding?: BotOnboarding;
  acknowledgements?: ClientAcknowledgements;
  tob?: TobService;
  onboardingNews?: (slug?: string) => Promise<boolean>;
  states: BotStateTracker;
  runningSessionIds?: () => ReadonlySet<string>;
  channels: ChannelStore;
  ownership: SessionOwnership;
  workspaceLooks?: WorkspaceLooks;
  sessionModels?: ReturnType<
    typeof import('../runtime/session-model-choices.js').sessionModelChoices
  >;
  usage?: UsageProjection;
  readUsageSessionLog?: DshUsageSessionLogReader;
  readSessionTitles?: (ids: readonly string[]) => Promise<ReadonlyMap<string, string>>;
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
  nativeSessions?: NativeSessions;
  externalSessions?: import('../features/sessions/external-sessions.js').ExternalSessionReader;
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
  hostVersion?: () => string;
  telemetry?: {
    status(): TelemetryStatus;
    setPreference(enabled: boolean): TelemetryStatus;
    capture?: TelemetryCapture;
  };
  activeDay?: ActiveDay;
  git?: Pick<GitService, 'status' | 'install'>;
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
  const { channelView, listedChannels, listItem } = createChannelViews(
    human,
    deps,
    globalRegistry,
    isHostOwner,
  );
  const sendReceipt = (listingId: string): void => {
    void deps.marketplaceReceipts?.send(listingId).catch(() => undefined);
  };
  const messagingCall = createMessagingCall(deps);
  const createBotId = deps.createBotId ?? (() => 'bot-' + randomUUID().replaceAll('-', ''));
  const { runnerOf, detailOf } = createBotDetails(human, deps);

  const dmMemory = createDmMemoryReader(deps);

  const { modelInheritance, modelSettings, modelPlan } = createModelsBridgeMethods(
    human,
    deps,
    globalRegistry,
    isHostOwner,
    requireOwnedBot,
    modelRouting,
  );
  const approvalsMethods = createApprovalsBridgeMethods(
    human,
    deps,
    globalRegistry,
    detailOf,
    messagingCall,
  );
  const workspacesMethods = createWorkspacesBridgeMethods(human, deps);
  const sessionsMethods = createSessionsBridgeMethods(human, deps, botInChannel, modelRouting);
  const assignmentsMethods = createAssignmentsBridgeMethods(human, deps);
  const memoryMethods = createMemoryBridgeMethods(human, deps, dmMemory);
  const activityMethods = createActivityBridgeMethods(human, deps, dmMemory);
  const messagingMethods = createMessagingBridgeMethods(deps, messagingCall);
  const teamMethods = createTeamBridgeMethods(human, deps, globalRegistry);
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
  const tobAdapterMethods = createTobAdapterMethods(human, deps, isHostOwner);
  const takeoverAdapterMethods = createTakeoverAdapterMethods(human, deps);
  const workspacesAdapterMethods = createWorkspacesAdapterMethods(human, deps, isHostOwner);
  const sessionsAdapterMethods = createSessionsAdapterMethods(human, deps);
  const hostSessions = createHostSessionsMethods(human, deps, globalRegistry, isHostOwner);
  const { sessionTranscript, sessionModel, sessionSend, ...hostSessionMethods } = hostSessions;
  const channelFilesAdapterMethods = createChannelFilesAdapterMethods(deps);
  const channelsSendAdapterMethods = createChannelsSendAdapterMethods(
    human,
    deps,
    globalRegistry,
    channelSkillBots,
  );
  const sessionBots = createSessionBotMethods(human, deps, isHostOwner, detailOf, (payload) =>
    channelsSendAdapterMethods.channelSend(payload),
  );
  const channelsManagementAdapterMethods = createChannelsManagementAdapterMethods(
    human,
    deps,
    globalRegistry,
    channelView,
    detailOf,
  );
  const channelsAdapterMethods = createChannelsAdapterMethods(
    human,
    deps,
    isHostOwner,
    channelView,
    listedChannels,
    listItem,
  );
  const methods: Omit<BridgeMethods, keyof ReturnType<typeof contributedBridgeMethods>> = {
    ...createTeamBridge(human, deps.team),
    ...createModelProviderBridge(human, deps),
    ...createEngineAccountBridge(human, deps),
    ...createEngineSelectionBridge(human, { ...deps, registry: globalRegistry }),
    ...createVoiceBridgeMethods({
      providers: deps.voiceProviders,
      registry: deps.registry,
      isHostOwner,
      log: deps.voiceLog,
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
    messagingApps: messagingMethods.messagingApps,
    messagingSnapshot: messagingMethods.messagingSnapshot,
    messagingReachable: messagingMethods.messagingReachable,
    messagingPostRequest: messagingMethods.messagingPostRequest,
    messagingPostConversation: messagingMethods.messagingPostConversation,
    messagingPostLimit: messagingMethods.messagingPostLimit,
    messagingGroupInteractions: messagingMethods.messagingGroupInteractions,
    messagingTargets: messagingMethods.messagingTargets,
    messagingAuthorize: messagingMethods.messagingAuthorize,
    messagingRevoke: messagingMethods.messagingRevoke,
    messagingConversation: messagingMethods.messagingConversation,
    messagingSend: messagingMethods.messagingSend,
    ...tobAdapterMethods,
    onboarding: personabotsMethods.onboarding,
    ...modelInheritance,
    onboardingModel: personabotsMethods.onboardingModel,
    channelRetry: channelsAdapterMethods.channelRetry,
    botNewSession: sessionsMethods.botNewSession,
    botCompact: sessionsMethods.botCompact,
    botContext: sessionsMethods.botContext,
    channelBotStop: sessionsMethods.channelBotStop,
    botStop: sessionsMethods.botStop,
    sessionMessageSend: (payload) =>
      asObject(payload)['botSlug'] === null
        ? sessionSend(payload)
        : sessionsAdapterMethods.sessionMessageSend(payload),
    sessionStop: sessionsMethods.sessionStop,
    ...modelSettings,
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
    botImportLookup: personabotsMethods.botImportLookup,
    botImportPreview: personabotsMethods.botImportPreview,
    createFromGit: personabotsMethods.createFromGit,
    createFromSessions: sessionBots.createFromSessions,
    externalSessions: sessionBots.externalSessions,
    update: personabotsMethods.update,
    pause: personabotsMethods.pause,
    resume: personabotsMethods.resume,
    approvalTemplates: approvalsMethods.approvalTemplates,
    approvalTemplateCreate: approvalsMethods.approvalTemplateCreate,
    approvalTemplateUpdate: approvalsMethods.approvalTemplateUpdate,
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
    composerValidate: channelsAdapterMethods.composerValidate,
    channels: channelsAdapterMethods.channels,
    channelListChanges: channelsAdapterMethods.channelListChanges,
    channelAccessState: channelsAdapterMethods.channelAccessState,
    channelDm: channelsAdapterMethods.channelDm,
    channelGet: channelsAdapterMethods.channelGet,
    channelCreate: channelsManagementAdapterMethods.channelCreate,
    channelRename: channelsManagementAdapterMethods.channelRename,
    channelGroupAvatarSet: channelsManagementAdapterMethods.channelGroupAvatarSet,
    channelGroupInvite: channelsManagementAdapterMethods.channelGroupInvite,
    ...createGroupMemberMethods({
      human,
      deps: { ...deps, registry: globalRegistry },
      invite: channelsManagementAdapterMethods.channelGroupInvite,
    }),
    channelGroupInviteCancel: channelsManagementAdapterMethods.channelGroupInviteCancel,
    channelGroupJoinDecide: channelsManagementAdapterMethods.channelGroupJoinDecide,
    channelGroupMemberRemove: channelsManagementAdapterMethods.channelGroupMemberRemove,
    channelGroupSendReview: channelsManagementAdapterMethods.channelGroupSendReview,
    channelGroupWakePolicies: channelsManagementAdapterMethods.channelGroupWakePolicies,
    channelGroupWakeSet: channelsManagementAdapterMethods.channelGroupWakeSet,
    channelHistory: channelsAdapterMethods.channelHistory,
    channelHistorySources: channelsAdapterMethods.channelHistorySources,
    channelGroupDelete: channelsManagementAdapterMethods.channelGroupDelete,
    channelMessages: channelsAdapterMethods.channelMessages,
    channelTimeline: channelsAdapterMethods.channelTimeline,
    channelReadPosition: channelsAdapterMethods.channelReadPosition,
    channelMarkRead: channelsAdapterMethods.channelMarkRead,
    channelReact: channelsAdapterMethods.channelReact,
    channelSearch: channelsAdapterMethods.channelSearch,
    messageSearch: channelsAdapterMethods.messageSearch,
    channelMarkAllRead: channelsAdapterMethods.channelMarkAllRead,
    channelAllBotPreview: channelsAdapterMethods.channelAllBotPreview,
    channelSendStatus: channelsAdapterMethods.channelSendStatus,
    channelSend: channelsSendAdapterMethods.channelSend,
    botAttention: activityMethods.botAttention,
    takeoverList: takeoverAdapterMethods.takeoverList,
    takeoverStatus: takeoverAdapterMethods.takeoverStatus,
    takeoverRequest: takeoverAdapterMethods.takeoverRequest,
    takeoverComplete: takeoverAdapterMethods.takeoverComplete,
    takeoverCancel: takeoverAdapterMethods.takeoverCancel,
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
    ...hostSessionMethods,
    sessionTranscript: (payload) =>
      asObject(payload)['slug'] === null
        ? sessionTranscript(payload)
        : sessionsMethods.sessionTranscript(payload),
    sessionModel: (payload) =>
      asObject(payload)['slug'] === null
        ? sessionModel(payload)
        : sessionsMethods.sessionModel(payload),
    sessionToolDetail: sessionsMethods.sessionToolDetail,
    sessionSubagents: assignmentsMethods.sessionSubagents,
    workspaceOptions: workspacesAdapterMethods.workspaceOptions,
    channelMediaTarget: messagingMethods.channelMediaTarget,
    messageAttachmentTarget: channelFilesAdapterMethods.messageAttachmentTarget,
    folderBrowse: workspacesAdapterMethods.folderBrowse,
    folderCreate: workspacesAdapterMethods.folderCreate,
    workspaceFileTarget: workspacesAdapterMethods.workspaceFileTarget,
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
  };
  return authorizeChannelBridgeMethods(
    mergeFeatureMethods([
      methods,
      contributedBridgeMethods(deps, {
        human,
        detailOf,
        channelView,
        globalRegistry,
        isHostOwner,
        dmMemory,
        channelSkillBots,
        requireOwnedBot,
        sendReceipt,
      }),
    ]),
    human,
    deps,
    globalRegistry,
    isHostOwner,
  );
}
