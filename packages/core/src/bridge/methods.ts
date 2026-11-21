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
import { createCloudBridgeMethods, type CloudBridgeMethods } from '../features/cloud/methods.js';
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
  invalidInput,
  unavailable,
  unknownBot,
  type BridgeResult,
} from './method-utils.js';
import {
  createPromptBridgeMethods,
  type PromptBridgeMethods,
  type PromptBridgeDeps,
} from '../features/prompts/methods.js';
import type { OrchestratorRunner } from '@botharness/host-protocol/wire';
import { botModelAllowed } from '../team/models.js';
import { TeamError } from '../team/error.js';
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
import { type ContentPurge } from '../purge/contracts.js';
import { type StorageCleanup } from '../storage/media-cleanup.js';
import { type UsageOverviewBuckets, type UsageOverviewResult } from '../usage/overview.js';
import type { OutboundMessaging } from '../messaging/outbound.js';
import type { InstallReceipts } from '../marketplace/install-receipts.js';
import type { ReleaseService } from '../release/service.js';
import type { PluginUpdateService } from '../release/plugins.js';
import { type UpdateRuns } from '../release/update-runs.js';
import type { ActiveDay } from '../telemetry/active-day.js';
import type { TelemetryCapture, TelemetryStatus } from '../telemetry/service.js';
import type { SessionLiveSnapshot, SessionLiveStreams } from '../runtime/session-live.js';
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
import { type DataReset } from '../data-reset/reset.js';
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
import { createUsageAdapterMethods, type UsageAdapterMethods } from '../features/usage/methods.js';
import {
  createTakeoverAdapterMethods,
  type TakeoverAdapterMethods,
} from '../features/takeover/methods.js';
import {
  createPromptsAdapterMethods,
  type PromptsAdapterMethods,
} from '../features/prompts/methods.js';
import {
  createWorkspacesAdapterMethods,
  type WorkspacesAdapterMethods,
} from '../features/workspaces/methods.js';
import {
  createSessionsAdapterMethods,
  type SessionsAdapterMethods,
} from '../features/sessions/methods.js';
import {
  createHumansAdapterMethods,
  type HumansAdapterMethods,
} from '../features/humans/methods.js';
import {
  createReleaseAdapterMethods,
  type ReleaseAdapterMethods,
} from '../features/release/methods.js';
import {
  createDiagnosticsAdapterMethods,
  type DiagnosticsAdapterMethods,
} from '../features/diagnostics/methods.js';
import {
  createProfileStorageAdapterMethods,
  type ProfileStorageAdapterMethods,
} from '../features/profile-storage/methods.js';
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
import {
  createBotModeBridgeMethods,
  type BotModeBridgeMethods,
  type BotModesDeps,
} from '../features/appearance/methods.js';

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

export type { BridgeError, BridgeResult } from './method-utils.js';

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
    HumansBridgeMethods,
    ChannelsAdapterMethods,
    ChannelsManagementAdapterMethods,
    GroupMemberMethods,
    ChannelsSendAdapterMethods,
    ChannelFilesAdapterMethods,
    ProfileStorageAdapterMethods,
    DiagnosticsAdapterMethods,
    ReleaseAdapterMethods,
    HumansAdapterMethods,
    SessionsAdapterMethods,
    WorkspacesAdapterMethods,
    PromptsAdapterMethods,
    TakeoverAdapterMethods,
    UsageAdapterMethods,
    TobAdapterMethods {
  sessionLive(payload: unknown): Promise<BridgeResult<{ sessionId: string } & SessionLiveSnapshot>>;

  botModes: BotModeBridgeMethods['botModes'];
  botModeDefaultSet: BotModeBridgeMethods['botModeDefaultSet'];
  botModeSet: BotModeBridgeMethods['botModeSet'];
  botModeTemplateSave: BotModeBridgeMethods['botModeTemplateSave'];
  botModeTemplateDelete: BotModeBridgeMethods['botModeTemplateDelete'];
  botModeTemplateSet: BotModeBridgeMethods['botModeTemplateSet'];
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

  const dmMemory = createDmMemoryReader(deps);

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
  const tobAdapterMethods = createTobAdapterMethods(human, deps, isHostOwner);
  const usageAdapterMethods = createUsageAdapterMethods(deps, isHostOwner, dmMemory);
  const takeoverAdapterMethods = createTakeoverAdapterMethods(human, deps);
  const promptsAdapterMethods = createPromptsAdapterMethods(deps);
  const workspacesAdapterMethods = createWorkspacesAdapterMethods(human, deps, isHostOwner);
  const sessionsAdapterMethods = createSessionsAdapterMethods(human, deps);
  const humansAdapterMethods = createHumansAdapterMethods(deps);
  const releaseAdapterMethods = createReleaseAdapterMethods(deps);
  const diagnosticsAdapterMethods = createDiagnosticsAdapterMethods(deps);
  const profileStorageAdapterMethods = createProfileStorageAdapterMethods(human, deps);
  const channelFilesAdapterMethods = createChannelFilesAdapterMethods(deps);
  const channelsSendAdapterMethods = createChannelsSendAdapterMethods(
    human,
    deps,
    globalRegistry,
    channelSkillBots,
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
    tobCli: tobAdapterMethods.tobCli,
    tobHome: tobAdapterMethods.tobHome,
    onboarding: personabotsMethods.onboarding,
    acknowledgements: humansAdapterMethods.acknowledgements,
    acknowledge: humansAdapterMethods.acknowledge,
    ...modelInheritance,
    telemetryEvent: diagnosticsAdapterMethods.telemetryEvent,
    onboardingModel: personabotsMethods.onboardingModel,
    channelRetry: channelsAdapterMethods.channelRetry,
    botNewSession: sessionsMethods.botNewSession,
    botCompact: sessionsMethods.botCompact,
    botContext: sessionsMethods.botContext,
    botSystemPrompt,
    channelBotStop: sessionsMethods.channelBotStop,
    botStop: sessionsMethods.botStop,
    sessionMessageSend: sessionsAdapterMethods.sessionMessageSend,
    sessionStop: sessionsMethods.sessionStop,
    ...modelSettings,
    dataResetPreview: profileStorageAdapterMethods.dataResetPreview,
    dataResetConfirm: profileStorageAdapterMethods.dataResetConfirm,
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
    releaseInfo: releaseAdapterMethods.releaseInfo,
    releaseUpdate: releaseAdapterMethods.releaseUpdate,
    releaseInstall: releaseAdapterMethods.releaseInstall,
    releaseRestart: releaseAdapterMethods.releaseRestart,
    pluginUpdates: releaseAdapterMethods.pluginUpdates,
    pluginInstall: releaseAdapterMethods.pluginInstall,
    pluginRestart: releaseAdapterMethods.pluginRestart,
    updateRun: releaseAdapterMethods.updateRun,
    updateCancel: releaseAdapterMethods.updateCancel,
    telemetryStatus: diagnosticsAdapterMethods.telemetryStatus,
    gitStatus: diagnosticsAdapterMethods.gitStatus,
    gitInstall: diagnosticsAdapterMethods.gitInstall,
    telemetrySet: diagnosticsAdapterMethods.telemetrySet,
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
    ping: diagnosticsAdapterMethods.ping,
    humanIdentity: humansMethods.humanIdentity,
    composerIdentity: humansMethods.composerIdentity,
    composerValidate: channelsAdapterMethods.composerValidate,
    humanNameSet: humansMethods.humanNameSet,
    humanAvatarSet: humansMethods.humanAvatarSet,
    humanProfileSetupFinish: humansMethods.humanProfileSetupFinish,
    humanAvatars: humansMethods.humanAvatars,
    channelHumanNameSet: humansMethods.channelHumanNameSet,
    channels: channelsAdapterMethods.channels,
    channelListChanges: channelsAdapterMethods.channelListChanges,
    channelDm: channelsAdapterMethods.channelDm,
    channelGet: channelsAdapterMethods.channelGet,
    channelCreate: channelsManagementAdapterMethods.channelCreate,
    channelRename: channelsManagementAdapterMethods.channelRename,
    channelGroupAvatarSet: channelsManagementAdapterMethods.channelGroupAvatarSet,
    channelGroupInvite: channelsManagementAdapterMethods.channelGroupInvite,
    ...createGroupMemberMethods(
      human,
      { ...deps, registry: globalRegistry },
      channelsManagementAdapterMethods.channelGroupInvite,
    ),
    channelGroupInviteCancel: channelsManagementAdapterMethods.channelGroupInviteCancel,
    channelGroupJoinDecide: channelsManagementAdapterMethods.channelGroupJoinDecide,
    channelGroupMemberRemove: channelsManagementAdapterMethods.channelGroupMemberRemove,
    channelGroupSendReview: channelsManagementAdapterMethods.channelGroupSendReview,
    channelGroupWakePolicies: channelsManagementAdapterMethods.channelGroupWakePolicies,
    channelGroupWakeSet: channelsManagementAdapterMethods.channelGroupWakeSet,
    channelHistory: channelsAdapterMethods.channelHistory,
    channelHistorySources: channelsAdapterMethods.channelHistorySources,
    channelPurgePreview: profileStorageAdapterMethods.channelPurgePreview,
    storageUsage: profileStorageAdapterMethods.storageUsage,
    storageCleanupPreview: profileStorageAdapterMethods.storageCleanupPreview,
    storageCleanupConfirm: profileStorageAdapterMethods.storageCleanupConfirm,
    storageMessagesCleanupPreview: profileStorageAdapterMethods.storageMessagesCleanupPreview,
    storageMessagesCleanupConfirm: profileStorageAdapterMethods.storageMessagesCleanupConfirm,
    channelPurgeConfirm: profileStorageAdapterMethods.channelPurgeConfirm,
    channelGroupDelete: channelsManagementAdapterMethods.channelGroupDelete,
    channelMessages: channelsAdapterMethods.channelMessages,
    channelTimeline: channelsAdapterMethods.channelTimeline,
    channelReadPosition: channelsAdapterMethods.channelReadPosition,
    channelMarkRead: channelsAdapterMethods.channelMarkRead,
    channelReact: channelsAdapterMethods.channelReact,
    channelSearch: channelsAdapterMethods.channelSearch,
    messageSearch: channelsAdapterMethods.messageSearch,
    channelMarkAllRead: channelsAdapterMethods.channelMarkAllRead,
    ...skillsMethods,
    channelAllBotPreview: channelsAdapterMethods.channelAllBotPreview,
    channelSendStatus: channelsAdapterMethods.channelSendStatus,
    ...genuiMethods,
    channelSend: channelsSendAdapterMethods.channelSend,
    botAttention: activityMethods.botAttention,
    takeoverList: takeoverAdapterMethods.takeoverList,
    takeoverStatus: takeoverAdapterMethods.takeoverStatus,
    takeoverRequest: takeoverAdapterMethods.takeoverRequest,
    takeoverComplete: takeoverAdapterMethods.takeoverComplete,
    takeoverCancel: takeoverAdapterMethods.takeoverCancel,
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
    workspaceOptions: workspacesAdapterMethods.workspaceOptions,
    channelMediaTarget: messagingMethods.channelMediaTarget,
    messageAttachmentTarget: channelFilesAdapterMethods.messageAttachmentTarget,
    folderBrowse: workspacesAdapterMethods.folderBrowse,
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
    botTurnInput: promptsAdapterMethods.botTurnInput,
    botTools: tobAdapterMethods.botTools,
    botToolRun: tobAdapterMethods.botToolRun,
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
    overviewUsage: usageAdapterMethods.overviewUsage,
    profileUsage: usageAdapterMethods.profileUsage,
    profileSessionUsage: usageAdapterMethods.profileSessionUsage,
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
    developerModeSet: diagnosticsAdapterMethods.developerModeSet,
  };
  return authorizeChannelBridgeMethods(methods, human, deps, globalRegistry, isHostOwner);
}
