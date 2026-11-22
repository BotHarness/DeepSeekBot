import { sessionModelChoices } from './runtime/session-model-choices.js';
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import type { ReleaseInstaller } from './release/service.js';
import * as diagnosticsFeature from './features/diagnostics/plugin.js';
import * as profileStorage from './features/profile-storage/plugin.js';
import * as releaseFeature from './features/release/plugin.js';
import * as personabotsFeature from './features/personabots/plugin.js';
import * as tobFeature from './features/tob/plugin.js';
import * as approvalsFeature from './features/approvals/plugin.js';
import * as memoryFeature from './features/memory/plugin.js';
import * as workspacesFeature from './features/workspaces/plugin.js';
import * as teamFeature from './features/team/plugin.js';
import { recordTurnTarget } from './runtime/turn-targets.js';
import { engineAccountKey, type EngineId } from '@botharness/host-protocol/subscription-engine';
import { requireModelSources } from './models/provider-bridge.js';
import { createRouteRests } from './models/route-rest.js';
import { SessionLiveStreams } from './runtime/session-live.js';
import { mountCardContextLive } from './channels/card-context-live.js';
import { contextSources } from './runtime/context-sources.js';
import { reconcilePublicBotMemories } from './workspaces/bot-memory-placement.js';
import { currentRoots } from './workspaces/grant-native-tools.js';
import { relocateTobWorkspaces, recoverSpaceTransfers } from './workspaces/space-lifecycle.js';
import { WorkspaceSpaces } from './workspaces/spaces.js';
import { defaultSpaceMemoryPath, relocateSpaceMemories } from './workspaces/space-memory.js';
import { TeamError } from './team/error.js';
import {
  botModelGrants,
  botModelFilter,
  requireBotEngineAccount,
  requireBotModel,
} from './team/models.js';
import { allowsEngineAccount, allowsModel } from './team/permissions.js';
import { createMemberTobOperations } from './tob/member-operations.js';
import { botOwner, ownsBot, privateBotRegistry } from './team/bot-access.js';
import { privateBotCreations } from './bots/creation.js';
import { humanContext } from './humans/context.js';
import { TeamService } from './team/service.js';
import { OWNER_HUMAN_CONTEXT } from './humans/context.js';
import { BotNetworkDeliveryError } from './runtime/bot-network.js';
import type { AssignmentReportContent } from './runtime/assignment-report.js';
import { createWindowZoomControl, WINDOW_ZOOM_CONTROL_PATH } from './window-zoom/control.js';
import { createPresence, PRESENCE_PATH } from './push/presence.js';
import {
  compactUnknownContext,
  contextCapacity,
  createTargetCompaction,
  type PricedSurface,
} from './runtime/context-window.js';
import { createBotRequestRetry } from './runtime/bot-request-retry.js';
import { createContextOverflowRecovery } from './runtime/context-overflow-recovery.js';
import { messageText, systemPromptFromLog } from './runtime/prompt-inspection.js';

import { createWindowZoomSetup, WINDOW_ZOOM_SETUP_PATH } from './window-zoom/setup.js';
import { APPEARANCE_CONTROL_PATH, createAppearanceControl } from './appearance/control.js';
import type { VoiceProviders } from './voice/providers.js';
import type { createVoiceMessages, VoiceMessages } from './voice/messages.js';
import type { VoiceCallMedia, VoiceCalls } from './voice/calls.js';
import { createCallTextHarvest } from './voice/call-text.js';
import { DESKTOP_WINDOW_PATH, createDesktopWindowReveal } from './desktop-window/reveal.js';
import type { CloudConnections } from './cloud/connections.js';
import { createChannelManagement, type ChannelManagementService } from './channels/management.js';
import type { CloudWork } from './cloud/work.js';
import { TOB_CHANNEL_CAPABILITIES } from './tob/cli-channel-operations.js';
import { type BotCreationService } from './bots/creation.js';
import { type BotZipImportService } from './bots/zip-import.js';
import { TOB_BOT_CREATE_CAPABILITIES } from './tob/cli-bot-create.js';
import { TOB_BOT_PROFILE_CAPABILITIES } from './tob/cli-bot-profile-operations.js';
import { TOB_DIAGNOSTIC_CAPABILITIES } from './tob/cli-diagnostic-operations.js';
import { authorizeTobBotTargets, TOB_HOST_CLI_CAPABILITY } from './tob/cli-host-commands.js';
import { TOB_SHARE_DRAFT_CAPABILITIES } from './tob/cli-share-draft-operations.js';
import { followCompanion } from './companions/live.js';
import { TobError, type TobService, type TobSettingsProvider } from './tob/service.js';
import { TOB_MODEL_CAPABILITIES, type TobNativeSettings } from './tob/cli-model-operations.js';
import { TOB_MAINTENANCE_CAPABILITIES } from './tob/cli-maintenance-operations.js';
import { installTobCliShell } from './tob/cli-shell.js';
import { TOB_VOICE_CAPABILITIES } from './tob/cli-voice-operations.js';
import { approveTobCliOperation } from './tob/cli-approval.js';
import { onboardingNewsAvailable } from './onboarding/search.js';
import { type ClientAcknowledgements } from './onboarding/acknowledgements.js';
import { createSecretMcpStore } from './credentials/secret-mcp-store.js';
import { type BotOnboarding } from './onboarding/service.js';
import type { PartLibrary } from './bots/part-library.js';
import type { OutboundMessaging } from './messaging/outbound.js';
import { type ProfileRecovery } from './portability/recovery.js';
import { mountContentPurge } from './purge/owner.js';
import type { ContentPurge } from './purge/contracts.js';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { routingGroupEngineOptions } from './models/routing-group-engine-options.js';
import { createEngineGateway } from './engines/engine-gateway.js';
import { EngineHost } from './engines/engine-host.js';
import type { EngineBotTool, EngineToolInfo, EngineToolSource } from './engines/engine-tools.js';
import { createEngineToolGate, type EngineDeviceTools } from './engines/engine-tool-gate.js';
import type { EngineSessionPersistence, EngineSessionStore } from './engines/engine-dsh-session.js';
import { readEnginePersona, subscriptionEnginesAllowed } from './engines/engine-plugin.js';
import { ENGINES_PATH, engineRouteFetch } from './engines/engine-route.js';
import { createEngineSelectionBridge } from './engines/engine-selection-bridge.js';
import { createHash } from 'node:crypto';
import { createCompanionFeed, COMPANION_PATH, type CompanionFeed } from './companions/feed.js';

import type { Context } from '@deepseek-ai/cordis';
import { assembleContextFor, type Agent } from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-agent-loop';
import type { Session, SessionSeq } from '@deepseek-ai/dsh-session';
import { renderContextSections, renderPrompt } from '@deepseek-ai/dsh-system-prompt';
import type {} from '@deepseek-ai/dsh-tools';
import { type ApprovalService } from '@deepseek-ai/dsh-user-approval';
import Schema from '@deepseek-ai/schemastery';

import { installOrchestratorFileTools } from './workspaces/orchestrator-file-tools.js';
import { ProtectedExecution } from './credentials/protected-execution.js';
import { privateInputLog } from './credentials/diagnostics.js';
import { nativeExecutionRoot } from './workspaces/grant-native-tools.js';
import { createAttachmentStore, type AttachmentStore } from './attachments/store.js';
import {
  BOT_ZIP_EXPORT_PATH,
  BOT_ZIP_FILES_PATH,
  BOT_ZIP_IMPORT_PATH,
} from './bots/bot-zip-http.js';
import {
  createAttachmentHttp,
  CHANNEL_ATTACHMENT_PATH,
  CHANNEL_ATTACHMENT_UPLOAD_PATH,
} from './attachments/http.js';
import { createBridgeMethodsForHumans, type BridgeMethodsDeps } from './bridge/methods.js';
import { composerRecoveryIdentity } from './bridge/composer-recovery.js';
import { homedir } from 'node:os';
import type { BotAgentSetupInfo } from './runtime/dsh-bot-agent-adapter.js';
import { registerBridge } from './bridge/rpc.js';
import { createCoreStartup } from './diagnostics/core-startup.js';
import type { DiagnosticEvents } from './diagnostics/diagnostic-log.js';
import { recordGenuiPreviewDiagnostic } from './runtime/genui-preview.js';
import { recordDatabaseStartup } from './diagnostics/database-startup.js';
import { createCoreTakeoverHandoffs, mountTakeoverTools } from './takeover/mount.js';
import type { ConnectAccount } from './devices/connect-account.js';
import { installedRelease } from './release/service.js';
import { stampReleaseComponent } from './release/component.js';
import { createGitService } from './memory/managed-git.js';
import { type TelemetryCapture } from './telemetry/service.js';
import { type ClientIssueReporter } from './telemetry/client-issues.js';
import { createPersonaBotRegistry, type PersonaBotRegistry } from './bots/registry.js';
import { type PersonaBotDeletions } from './bots/deletion.js';
import {
  backfillBotBanners,
  backfillBotDescriptors,
  syncBotDescriptor,
  syncBotDescriptorAsync,
} from './bots/bot-descriptor-sync.js';
import {
  createFallbackOverrideStore,
  type FallbackOverrideStore,
} from './models/fallback-overrides.js';
import { createRoutingGroupStore, type RoutingGroupStore } from './models/routing-groups.js';
import {
  assignmentGroupOptionOf,
  createModelPresetStore,
  DEFAULT_MODEL_PRESET_ID,
  defaultPresetRoute,
  defaultPresetPlan,
  resolveBotModelPlan,
  type LegacyDefaultModel,
  type ModelPresetStore,
} from './models/presets.js';
import { createModelFavoriteStore, type ModelFavoriteStore } from './models/favorites.js';
import { createOpenAssignmentRoutes } from './models/open-assignments.js';
import { groupMemberRoute } from './models/catalog.js';
import { createModelRouteReadiness } from './models/readiness.js';
import { createGroupFallback } from './models/group-fallback.js';
import { createHostModelCatalog, createHostModelProviders } from './models/host-models.js';
import { botAvatarUrl, BOT_AVATAR_PATH } from './bots/avatar-http.js';
import { BOT_BANNER_PATH } from './bots/banner-http.js';
import { coalesce } from './runtime/coalesce.js';
import { watchHumanAttention } from './runtime/human-attention-live.js';
import { createMediaVersions, type MediaVersions } from './attachments/media-versions.js';
import { loadImageProcessor } from './attachments/thumbnails.js';
import { createChannelLiveHub, CHANNEL_STREAM_PATH, type ChannelLiveHub } from './channels/live.js';
import type { ChannelDraftEvent } from './channels/draft.js';
import { hostSessionPersistence, hostSessionStore } from './runtime/native-agent-compat.js';
import type { SkillRegistrar } from './logs/skill.js';
import type { ChannelStore } from './channels/store.js';
import {
  personaBotOutputCommitted,
  emitPersonaBotOutputCommitted,
  type PersonaBotOutputCommitted,
} from './channels/output.js';
import { createSqliteChannelStore } from './channels/sqlite-store.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  onOperationalDatabaseClose,
  type OperationalDatabaseOwner,
} from './database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from './database/schema-plan.js';
import { resolveDshHome } from './im/config-store.js';
import { ensureMemoryRepository } from './memory/repository.js';
import { initializeMemoryRepositoryAsync } from './memory/git.js';
import { cloneMemoryRepository } from './memory/clone.js';
import { migrateLegacySouls } from './memory/soul.js';
import { type MemoryService } from './memory/service.js';
import type { RosterStore } from './roster/store.js';
import {
  createBotRuntime,
  DEFAULT_ASSIGNMENT_CONCURRENCY_LIMIT,
  type AssignmentEventTail,
  type BotAgentAdapter,
  type BotRuntime,
  type NativeSessionArchive,
} from './runtime/bot-runtime.js';
import { createBotAttentionQuery, type BotAttentionQuery } from './runtime/attention.js';
import { createInboxHistoryQuery, type InboxHistoryQuery } from './runtime/inbox-history.js';
import { createBotSourcePolicyStore, type BotSourcePolicyStore } from './runtime/source-policy.js';
import type { BotScheduleStore } from './schedules/bot-schedules.js';
import {
  createHumanAttentionQuery,
  createHumanAttentionDecisions,
  type HumanAttentionQuery,
  type HumanAttentionDecisions,
} from './runtime/human-attention.js';
import {
  admitBotSession,
  borrowedAgentDenial,
  type BotSessionRepair,
  engineWorkspaceMode,
  grantExecutionDenial,
  sessionRefusalMessage,
  requiresHumanToolApproval,
  sessionHasFullAccess,
} from './workspaces/grant-execution.js';
import { ChannelToolApproval } from './workspaces/tool-approval.js';
import { isApprovalReviewSession } from './workspaces/approval-reviewer.js';
import {
  compactionThresholdTokens,
  type CompactionThresholdPolicy,
  createIdleCompaction,
  IdleCompactionError,
  runCompactCommand,
  type CompactCommandRunner,
} from './runtime/idle-compaction.js';
import { createIdleCompactionSettings } from './runtime/idle-compaction-settings.js';
import {
  createBotModeSettings,
  isBotModeId,
  resolveBotMode,
  type BotModeOption,
} from './runtime/bot-mode-settings.js';
import { ChannelUserQuestions } from './channels/user-questions.js';
import { mountPrivateInputs } from './credentials/mount.js';
import type { PrivateInputs } from './credentials/private-inputs.js';
import {
  createAssignmentAccessStore,
  type AssignmentAccessStore,
} from './workspaces/assignment-access.js';
import { type ToolApprovalRuleStore } from './workspaces/tool-approval-rules.js';
import { type DshWorkspaceLookup, type WorkspaceGrantStore } from './workspaces/grants.js';
import {
  createDshBotAgentAdapter,
  type DshAgentPresetHost,
  type DshDefaultModelHost,
} from './runtime/dsh-bot-agent-adapter.js';
import { createSessionOwnership, type SessionOwnership } from './sessions/ownership.js';
import {
  readAssignmentReportPage,
  readBoundedAssignmentTail,
  type AssignmentSessionQuery,
  type AssignmentReportPage,
} from './runtime/assignment-tail.js';
import type { DshSessionEvent, DshSessionStore } from './sessions/source.js';
import { turnProgress } from './bots/tool-trace.js';
import type { SessionFailureProgress } from './channels/channel.js';
import { DEFAULT_BOT_HOP_LIMIT, isBotHopLimit } from './channels/channel.js';
import {
  createBotStateTracker,
  personaBotActivitySnapshot,
  type BotStateTracker,
  type PersonaBotActivityEvent,
} from './state/bot-state.js';
import { readPublicToolDetail, toolKindForView } from './state/tool-activity.js';
import { createUsageProjection, type UsageProjection } from './usage/usage.js';
import { createMessagePerfTracker, type MessagePerfTracker } from './usage/message-perf.js';
import {
  createBotSubagentModelTools,
  installBotSubagentModelTools,
  installOrchestratorSubagentGuard,
  type BotSubagentPresetConfig,
} from './runtime/subagent-model-tools.js';
import { installNativeSubagentWake } from './runtime/native-subagent-wake.js';
import { restartEmptyToolSeries } from './runtime/tool-declaration-series.js';
import type { PromptSettings } from './prompts/prompt-settings.js';
import * as activityFeature from './features/activity/plugin.js';
import * as avatars from './features/avatars/plugin.js';
import * as cloud from './features/cloud/plugin.js';
import * as environments from './features/environments/plugin.js';
import * as marketplace from './features/marketplace/plugin.js';
import * as messaging from './features/messaging/plugin.js';
import * as promptPresets from './features/prompts/plugin.js';
import * as botSchedules from './features/schedules/plugin.js';
import * as skillsFeature from './features/skills/plugin.js';
import * as voice from './features/voice/plugin.js';

export const name = 'botharness-core';

const installedPackage = installedRelease(import.meta.url);
stampReleaseComponent(apply, import.meta.url);
const runningRelease = {
  version: installedPackage.version(),
  ledgers: installedPackage.ledgers(),
};

export const inject = [
  'tools',
  'systemPrompt',
  'sessions',
  'agents',
  'agentDefaultModel',
  'llm',
  'credentials',
];

export const PERSONA_SECTION_ORDER = 10400;

const COMPACTION_END_EVENT: string = 'compaction/end';

interface PressureCompactionEngine {
  config?: Record<string, unknown>;
  compactIfNeeded?(
    agent: Agent,
    trigger: 'pressure' | 'context-overflow',
    signal: AbortSignal,
  ): Promise<unknown>;
  compactRegion?(
    start: SessionSeq,
    end: SessionSeq,
    agent: Agent,
    signal: AbortSignal,
  ): Promise<unknown>;
}

export interface CompactionRefreshSink {
  ownership: { resolve(sessionId: string): { botSlug: string } | undefined };
  memory: {
    refreshPersonaAfterCompaction(botSlug: string, sessionId: string): { refreshed: boolean };
  };
  prompts?: {
    refreshAfterCompaction(sessionId: string): { refreshed: boolean };
  };
  warn(message: string): void;
}

export function handleCompactionEvent(
  sink: CompactionRefreshSink,
  sessionId: string,
  eventType: string,
): void {
  if (eventType !== COMPACTION_END_EVENT) return;
  refreshSessionTexts(sink, sessionId);
}

export function refreshSessionTexts(sink: CompactionRefreshSink, sessionId: string): void {
  const owner = sink.ownership.resolve(sessionId);
  if (owner === undefined) return;
  try {
    sink.memory.refreshPersonaAfterCompaction(owner.botSlug, sessionId);
  } catch (error) {
    sink.warn(`botharness: persona refresh after compaction failed: ${String(error)}`);
  }
  try {
    sink.prompts?.refreshAfterCompaction(sessionId);
  } catch (error) {
    sink.warn(`botharness: prompt refresh after compaction failed: ${String(error)}`);
  }
}

export interface BotHarnessConfig {
  enabled: boolean;
  privateInputExecution?: boolean;
  privateInputWebUrl?: string;
  genuiPreviewBrowserPath?: string;

  agentPreset?: string;
  subagent?: BotSubagentPresetConfig;
  activityDetailConsumers?: string[];
  marketplaceUrl?: string;
  telemetry?: boolean;
  subscriptionEngines?: boolean;
}

export const DEFAULT_AGENT_PRESET = 'standard';
export const DEFAULT_MARKETPLACE_URL = 'https://market.botharness.ai';

export const DEFAULT_CONFIG: BotHarnessConfig = {
  enabled: true,
  agentPreset: DEFAULT_AGENT_PRESET,
  telemetry: true,
};

export const Config: Schema<BotHarnessConfig> = Schema.object({
  genuiPreviewBrowserPath: Schema.string().description(
    'Absolute executable for isolated GenUI previews; omitted or empty discovers the system browser. Invalid explicit paths are refused.',
  ),
  privateInputWebUrl: Schema.string().description(
    'Explicit credential-free Web origin for IM private input links; never use a login token URL.',
  ),
  privateInputExecution: Schema.boolean()
    .default(false)
    .description(
      'Removed. The Docker-protected Profile no longer exists; a Profile that sets this starts as an ordinary Profile and logs a warning.',
    ),
  enabled: Schema.boolean().default(DEFAULT_CONFIG.enabled).description('启用 BotHarness core'),
  activityDetailConsumers: Schema.array(Schema.string())
    .default([])
    .description('Explicitly trusted Host Plugin names allowed to read Activity Tool details'),
  agentPreset: Schema.string()
    .default(DEFAULT_AGENT_PRESET)
    .description('PersonaBot 会话加入的 DSH agent preset（提供 file/Shell/grep 等普通工具）'),
  subagent: Schema.object({
    agentPreset: Schema.string()
      .min(1)
      .description(
        'Independent Subagent native Agent preset; omitted uses the current system default preset.',
      ),
    allowedAgentPresets: (
      Schema.array(Schema.string().min(1)).min(1) as Schema<string[] | undefined>
    )
      .default(undefined)
      .description(
        'Explicit native preset allowlist for bot_subagent; omitted disables agent_preset selection.',
      ),
  }).default(undefined as unknown as BotSubagentPresetConfig),
  marketplaceUrl: Schema.string()
    .default(DEFAULT_MARKETPLACE_URL)
    .description('Bot Marketplace 服务地址'),
  subscriptionEngines: Schema.boolean()
    .default(true)
    .description(
      'Allow PersonaBots to run on this computer’s own Subscription Engine login (Codex, Claude Code). Cloud and VPS Hosts set false.',
    ),
  telemetry: Schema.boolean()
    .default(true)
    .description(
      '发送匿名使用统计（Anonymous usage telemetry）；DO_NOT_TRACK=1 或 BOTHARNESS_TELEMETRY=0 也会关闭',
    ),
});

export interface BotHarnessCore {
  team: TeamService;
  spaces: WorkspaceSpaces;
  currentRoots(session: Session, kind: 'read' | 'write'): string[];
  prompts: PromptSettings;
  profileRecovery: ProfileRecovery;
  rootDir: string;
  onboarding: BotOnboarding;
  acknowledgements: ClientAcknowledgements;
  tob: TobService;
  creations: BotCreationService;
  zipImports: BotZipImportService;
  channelManagement: ChannelManagementService;
  partLibrary: PartLibrary;
  operationalDatabase: OperationalDatabaseOwner;
  registry: PersonaBotRegistry;
  deletions: PersonaBotDeletions;
  contentPurge: ContentPurge;
  modelPresets: ModelPresetStore;
  modelFavorites: ModelFavoriteStore;
  routingGroups: RoutingGroupStore;
  fallbackOverrides: FallbackOverrideStore;

  contributeBotAgentSetup(contribute: BotAgentSetup): () => void;
  contributeEngineTools(source: EngineToolSource): () => void;
  engineTools(info: EngineToolInfo): Promise<EngineBotTool[]>;

  configureGroupInvitations(autoAccept: () => boolean): () => void;
  configureAssignmentConcurrencyLimit(read: () => number): () => void;
  configureBotHopLimit(read: () => number): () => void;

  hostTools: Set<string>;

  runBotAgentSetups(
    agentCtx: Context,
    agent: import('@deepseek-ai/dsh-agent').Agent,
    info: BotAgentSetupInfo,
  ): void;
  states: BotStateTracker;
  ownership: SessionOwnership;
  memory: MemoryService;

  usage?: UsageProjection;
  messagePerf: MessagePerfTracker;
  channels: ChannelStore;
  attachments: AttachmentStore;
  mediaVersions: MediaVersions;
  live: ChannelLiveHub;
  companions: CompanionFeed;
  roster: RosterStore;
  runtime: BotRuntime;
  attention: BotAttentionQuery;
  inboxHistory: InboxHistoryQuery;
  sourcePolicy: BotSourcePolicyStore;
  schedules: BotScheduleStore;
  humanAttention: HumanAttentionQuery;
  humanAttentionDecisions: HumanAttentionDecisions;
  grants: WorkspaceGrantStore;
  externalMessaging: OutboundMessaging;
  cloudConnections?: CloudConnections;
  voiceProviders: VoiceProviders;
  voiceMessages: VoiceMessages;
  voiceSpeech: { speak?: Parameters<typeof createVoiceMessages>[0]['speak'] };
  voiceZoom: { zoom?: VoiceCalls['zoom'] | undefined };
  cloudWork?: CloudWork;
  toolRules: ToolApprovalRuleStore;
  assignmentAccess: AssignmentAccessStore;
}

function describeToolCall(
  ctx: Context,
  sessionId: string,
  name: string,
  args: unknown,
  unscoped = false,
) {
  const agent = ctx.agents.list().find((candidate) => candidate.session.id === sessionId);
  if (agent === undefined && !unscoped) return undefined;
  const definition = agent === undefined ? ctx.tools.get(name) : ctx.tools.get(name, agent);
  if (definition === undefined) return undefined;
  const view = definition.presentCall?.(args);
  const publicDetail = readPublicToolDetail(definition, args);
  return {
    name: definition.name,
    ...(view === undefined ? {} : { view }),
    ...(publicDetail === undefined ? {} : { publicDetail }),
  };
}

function unavailableAgentAdapter(): BotAgentAdapter {
  const unavailable = () =>
    Promise.reject(new Error('BotHarness Agent runtime is unavailable outside a DSH Host'));
  return {
    runOrchestrator: unavailable,
    runAssignment: unavailable,
    requestAssignment: () => {
      throw new Error('BotHarness Agent runtime is unavailable outside a DSH Host');
    },
    close: async () => undefined,
  };
}

type BotAgentSetup = (
  agentCtx: import('@deepseek-ai/cordis').Context,
  agent: import('@deepseek-ai/dsh-agent').Agent,
  info: BotAgentSetupInfo,
) => void;

export function createCore(
  options: {
    botNetwork?: import('./runtime/bot-network.js').BotNetworkPort;
    dshHome?: string;
    legacyDefaultModel?: () => LegacyDefaultModel;
    companionProfileDir?: string | undefined;
    warn?: (message: string) => void;
    startupDiagnostic?: DiagnosticEvents;
    databaseDiagnostic?: (
      snapshot: import('./database/owner.js').OperationalDatabaseDiagnostics,
    ) => void;
    agents?: BotAgentAdapter;
    saveReportSpill?: (input: {
      sessionId: string;
      content: string;
    }) => Promise<{ locator: string; bytes: number; retrievalHint: string }>;
    readAssignmentTail?: (sessionId: string) => Promise<AssignmentEventTail>;
    readTurnProgress?: (sessionId: string) => Promise<SessionFailureProgress | undefined>;
    autoContinueDelaysMs?: readonly number[];
    stopSettleTimeoutMs?: number;
    closeSessionApprovals?: (sessionIds: readonly string[]) => void;
    routeRests?: import('./runtime/bot-runtime.js').BotRuntimeOptions['routeRests'];
    groupFallback?: import('./runtime/bot-runtime.js').BotRuntimeOptions['groupFallback'];
    sessionRoute?: import('./runtime/bot-runtime.js').BotRuntimeOptions['sessionRoute'];
    engineFallback?: import('./runtime/bot-runtime.js').BotRuntimeOptions['engineFallback'];
    readAssignmentReportPage?: (
      sessionId: string,
      acceptedSummary: string,
      offset: number,
      content?: AssignmentReportContent,
    ) => Promise<AssignmentReportPage>;
    workspaces?: () => DshWorkspaceLookup | undefined;
    ensureTobWorkspace?: (path: string) => Promise<{ id: string }>;
    tobSettings?: () => TobSettingsProvider | undefined;
    sessionArchive?: () => NativeSessionArchive | undefined;
    autoAcceptGroupInvitations?: () => boolean;
    botHopLimit?: () => number;
    triageContinuation?: boolean;
    imCommands?: () => import('./messaging/im-commands.js').ImCommandServices | undefined;
    onOutputCommitted?: (event: PersonaBotOutputCommitted) => void;
    activeQuestionMessageIds?: () => readonly string[];
    activeToolApprovalMessageIds?: () => readonly string[];
    activePrivateInputMessageIds?: () => readonly string[];
    erasePrivateAccounts?: (slug: string) => Promise<unknown>;
    capture?: TelemetryCapture;
    credentials?: () =>
      | Pick<
          import('@deepseek-ai/dsh-credentials').CredentialProvider,
          'readRecord' | 'modifyRecord' | 'deleteRecord'
        >
      | undefined;
    voiceLog?: (phase: string, fields: Record<string, string | number>) => void;
    voiceFetch?: typeof fetch;
  } = {},
): BotHarnessCore {
  const startup = createCoreStartup(options.startupDiagnostic);
  try {
    const core = initializeCore(options, startup);
    startup.ready();
    return core;
  } catch (error) {
    try {
      startup.failed(error);
    } catch {}
    throw error;
  }
}

function initializeCore(
  options: NonNullable<Parameters<typeof createCore>[0]>,
  startup: ReturnType<typeof createCoreStartup>,
): BotHarnessCore {
  const dshHome = options.dshHome ?? resolveDshHome();
  const rootDir = join(dshHome, 'botharness', 'bots');
  const operationalDatabase = mountOperationalDatabase({
    dshHome,
    instanceId: startup.mountId,
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    ...(options.databaseDiagnostic === undefined
      ? {}
      : { onDiagnostic: options.databaseDiagnostic }),
  });
  startup.mounted(operationalDatabase.diagnostics());
  if (operationalDatabase.recovery !== undefined)
    options.warn?.(
      `operational-database initiator=host-startup phase=recovery code=${operationalDatabase.recovery.code} path=${JSON.stringify(operationalDatabase.databasePath)} reason=${JSON.stringify(operationalDatabase.recovery.message)}`,
    );
  if (operationalDatabase.foreignKeyOrphans !== undefined)
    options.warn?.(
      `operational-database initiator=host-startup phase=foreign-key-orphans path=${JSON.stringify(operationalDatabase.databasePath)} orphans=${JSON.stringify(operationalDatabase.foreignKeyOrphans)}`,
    );
  let usage: UsageProjection | undefined;
  startup.enter('avatar-part-library', 'initialize');
  const { partLibrary, onAppearanceImported } = avatars.apply(operationalDatabase);
  let registry: PersonaBotRegistry;
  let modelPresets: ModelPresetStore;
  let modelFavorites: ModelFavoriteStore;
  let routingGroups: RoutingGroupStore;
  let fallbackOverrides: FallbackOverrideStore;
  let roster: RosterStore;
  let live: ChannelLiveHub | undefined;
  try {
    startup.enter('workspace-spaces', 'relocate-memory');
    if (operationalDatabase.mode === 'ready')
      recoverSpaceTransfers(attachOperationalModule(operationalDatabase, 'workspace-spaces'));
    if (operationalDatabase.mode === 'ready')
      relocateSpaceMemories(
        attachOperationalModule(operationalDatabase, 'workspace-spaces'),
        realpathSync(dshHome),
      );
    if (operationalDatabase.mode === 'ready')
      relocateTobWorkspaces(
        attachOperationalModule(operationalDatabase, 'workspace-spaces'),
        realpathSync(dshHome),
      );
    if (operationalDatabase.mode === 'ready')
      reconcilePublicBotMemories(
        attachOperationalModule(operationalDatabase, 'workspace-spaces'),
        realpathSync(dshHome),
      );
    startup.enter('bot-registry', 'initialize');
    registry = createPersonaBotRegistry({
      rootDir,
      defaultMemoryPath: (slug, humanId) =>
        defaultSpaceMemoryPath(
          attachOperationalModule(operationalDatabase, 'workspace-spaces'),
          realpathSync(dshHome),
          humanId,
          slug,
        ),
      validateMemoryPath: (slug, humanId, path) => spaces.assertMemoryPath(humanId, slug, path),
      creationTopics: ['workspace-grants'],
      onCreated: (bot, connection) => {
        const humanId = bot.ownerHumanId ?? team.ownerContext().humanId;
        if (!team.isOwner(humanContext(humanId)))
          grants.initializeAccount(bot.slug, 'spaces/' + humanId, connection);
      },
      database: operationalDatabase,
      onImport: (event) =>
        options.warn?.(
          `bot-registry-import initiator=host-startup phase=${event.phase} count=${event.count ?? 0} durationMs=${Math.round(event.durationMs)}`,
        ),
      onAppearanceImported,
      onDisplayNameChanged: () => {
        try {
          live?.publishRosterCommitted();
        } catch {
          options.warn?.('bot-name-publication-failed');
        }
      },
      onAvatarChanged: () => live?.publishRosterCommitted(),
      cloneMemory: (destination, url) => cloneMemoryRepository({ destination, url }),
      ...(options.capture === undefined ? {} : { capture: options.capture }),
      syncDescriptor: (memoryDir, record, sync) => {
        try {
          syncBotDescriptor(memoryDir, record, sync);
        } catch (error) {
          options.warn?.(
            `bot-descriptor-sync-failed slug=${record.slug} reason=${error instanceof Error ? error.name : 'unknown'}`,
          );
        }
      },
      initializeMemory: (memoryDir) => {
        const repository = ensureMemoryRepository({ memoryDir });
        return repository.ok
          ? { ok: true }
          : {
              ok: false,
              ...(repository.code === 'git-not-found' ? { code: 'git-not-found' as const } : {}),
              message: `${repository.code}: ${repository.message}`,
            };
      },
      async initializeMemoryAsync(memoryDir) {
        try {
          await initializeMemoryRepositoryAsync(memoryDir);
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            ...(error instanceof Error && 'code' in error && error.code === 'ENOENT'
              ? { code: 'git-not-found' as const }
              : {}),
            message: error instanceof Error ? error.message : 'memory-initialization-failed',
          };
        }
      },
      async syncDescriptorAsync(memoryDir, record) {
        try {
          await syncBotDescriptorAsync(memoryDir, record);
        } catch (error) {
          options.warn?.(
            `bot-descriptor-sync-failed slug=${record.slug} reason=${error instanceof Error ? error.name : 'unknown'}`,
          );
        }
      },
    });
    startup.enter('roster', 'initialize');
    roster = personabotsFeature.createRoster(operationalDatabase, options.warn, () => live);
    startup.enter('model-favorites', 'initialize');
    modelFavorites = createModelFavoriteStore({ database: operationalDatabase });
    startup.enter('model-presets', 'initialize');
    modelPresets = createModelPresetStore({
      rootDir: join(dshHome, 'botharness'),
      database: operationalDatabase,
      onImport: (event) =>
        options.warn?.(
          `model-presets-import initiator=host-startup phase=${event.phase} count=${event.count ?? 0} durationMs=${Math.round(event.durationMs)}`,
        ),
    });
    if (operationalDatabase.mode === 'ready' && options.legacyDefaultModel !== undefined)
      modelPresets.migrateDefault(options.legacyDefaultModel);
    startup.enter('routing-groups', 'initialize');
    fallbackOverrides = createFallbackOverrideStore({ database: operationalDatabase });
    routingGroups = createRoutingGroupStore({
      database: operationalDatabase,
      references: (groupId) => {
        const uses = (source: { orchestratorGroupId?: string; assignmentGroups?: string[] }) =>
          source.orchestratorGroupId === groupId ||
          (source.assignmentGroups ?? []).includes(groupId);
        return [
          ...registry
            .list()
            .filter((bot) => bot.modelPlan !== undefined && uses(bot.modelPlan))
            .map((bot) => `Bot ${bot.displayName}`),
          ...modelPresets
            .list()
            .filter(uses)
            .map((preset) => `Model Preset ${preset.name}`),
        ];
      },
    });
  } catch (error) {
    operationalDatabase.close();
    throw error;
  }
  if (operationalDatabase.mode === 'ready') {
    startup.enter('bot-registry', 'backfill-banners');
    backfillBotBanners(registry, options.warn);
    startup.enter('bot-registry', 'backfill-descriptors');
    backfillBotDescriptors(registry, options.warn);
    startup.enter('bot-registry', 'migrate-souls');
    migrateLegacySouls(registry, options.warn);
  }
  startup.enter('bot-state', 'initialize');
  const states = createBotStateTracker();
  startup.enter('attachments', 'initialize');
  const attachments = createAttachmentStore({
    rootDir: join(dshHome, 'botharness', 'attachments'),
  });
  let changedFiles: ((fileId: string) => void) | undefined;
  startup.enter('media-versions', 'initialize');
  const mediaVersions = createMediaVersions(
    attachments,
    () => loadImageProcessor(options.warn),
    (fileId) => changedFiles?.(fileId),
  );
  startup.enter('content-purge', 'initialize');
  const contentPurge = mountContentPurge({
    dshHome,
    database: operationalDatabase,
    attachments,
    derivatives: (ids, botSlugs) => {
      const references = memory.sourceReferences(ids);
      const slugs = [...new Set([...botSlugs, ...references.map((ref) => ref.botSlug)])].sort();
      return [
        ...references.map((ref) => ({
          kind: 'memory' as const,
          botSlug: ref.botSlug,
          location: ref.memoryDir ?? '',
          reference: ref.sha,
          tracking: ref.available ? ('recorded' as const) : ('unavailable' as const),
        })),
        ...slugs.flatMap((slug) =>
          grants.list(slug).map((grant) => ({
            kind: 'workspace' as const,
            botSlug: slug,
            location: grant.workspacePath,
            reference: grant.id,
            tracking: 'possible' as const,
          })),
        ),
      ];
    },
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  let runtime: BotRuntime | undefined;
  let companions: CompanionFeed | undefined;
  let reconcileToolRuleCreators: ((botSlug: string) => void) | undefined;
  startup.enter('bot-inbox', 'initialize');
  const sourcePolicy = createBotSourcePolicyStore(
    attachOperationalModule(operationalDatabase, 'bot-inbox'),
  );
  const externalMessaging = messaging.apply(
    startup,
    operationalDatabase,
    (slug) => registry.get(slug),
    {
      channels: {
        get: (id) => channels.get(id),
        getOrCreateDm: (human, slug) => channels.getOrCreateDm(human, slug),
      },
      ownsFailure: (slug, sessionId, role) => {
        const owner = ownership.resolve(sessionId);
        return owner?.botSlug === slug && owner.rootRole === role;
      },
      onAuthorizationChanged: (slug) => reconcileToolRuleCreators?.(slug),
      onDefaultsChanged: () => live?.publishRosterCommitted(),
      onReceptionChanged: () => live?.publishRosterCommitted(),
      ...(options.capture === undefined ? {} : { capture: options.capture }),
      attachments,
      sourcePolicy,
      onAdmitted: (slug, sourceEventId) => runtime?.admitExternalSource?.(slug, sourceEventId),
      onPlaced: (commit) => live?.publishCommitted(commit),
      onShared: (slugs) => {
        for (const slug of slugs) runtime?.resumePendingDigests?.(slug);
      },
      onIngested: (channelId, messageId) => runtime?.admitGroupMessage(channelId, messageId),
      ...(options.imCommands === undefined ? {} : { imCommands: options.imCommands }),
      ...(options.warn === undefined ? {} : { warn: options.warn }),
    },
  );
  const initialGroupInvitationPolicy = options.autoAcceptGroupInvitations ?? (() => true);
  const assignmentLimits: { read: () => number }[] = [];
  const botHopLimits: { read: () => number }[] = [];
  const botHopLimit = (): number => {
    const value = (botHopLimits.at(-1)?.read ?? options.botHopLimit)?.();
    return isBotHopLimit(value) ? value : DEFAULT_BOT_HOP_LIMIT;
  };
  const groupInvitationPolicies: { policy: () => boolean }[] = [];
  startup.enter('messaging', 'channels');
  const channels = createSqliteChannelStore({
    botHopLimit,
    autoAcceptGroupInvitations: () =>
      (groupInvitationPolicies.at(-1)?.policy ?? initialGroupInvitationPolicy)(),
    database: attachOperationalModule(operationalDatabase, 'messaging'),
    sourcePolicy,
    databaseOwnerReady: operationalDatabase.mode === 'ready',
    isBotActive: (botSlug) => {
      const bot = registry.get(botSlug);
      return bot !== undefined && bot.paused !== true;
    },
    attachments,
    mediaVersions,
    botDisplayName: (botSlug) => registry.getHistorical(botSlug)?.displayName,
    rootDir: join(dshHome, 'botharness', 'channels'),
    onCommitted: (commit) => {
      try {
        externalMessaging.failureAlerts.committed(commit);
      } catch {
        options.warn?.('failure-alert-notification-enqueue-failed');
      }
      try {
        const output = personaBotOutputCommitted(commit, ownership);
        if (output !== undefined) companions?.publish(output);
      } catch {
        options.warn?.('companion-output-publication-failed');
      }
      if (options.onOutputCommitted !== undefined) {
        try {
          const event = personaBotOutputCommitted(commit, ownership);
          if (event !== undefined) options.onOutputCommitted(event);
        } catch {
          options.warn?.('personabot-output-publication-failed');
        }
      }
      let publicationFailed = false;
      try {
        live?.publishCommitted(commit);
      } catch {
        publicationFailed = true;
      }
      void externalMessaging.forwardWebDm(commit);
      if (commit.message.memberDeparture !== undefined) {
        try {
          runtime?.admitGroupMessage(commit.channelId, commit.message.id);
        } catch {
          runtime?.retryGroupMessageAdmission?.(commit.channelId, commit.message.id);
          options.warn?.('group-admission-wake-failed-retrying');
        }
      }
      if (publicationFailed) options.warn?.('channel-live-publication-failed');
    },
    onRecordChanged: () => live?.publishRosterCommitted(),
    onAdmissionChanged: (channelId, messageId, message) =>
      live?.publishAdmission(channelId, messageId, message),
    onHumanReadChanged: (channelId, humanId, revision) =>
      live?.publishHumanRead(channelId, humanId, revision),
    onReactionChanged: (channelId, messageId, reactions) =>
      live?.publishReaction(channelId, messageId, reactions),
    onVoiceChanged: (channelId, messageId, message) =>
      live?.publishVoice(channelId, messageId, message),
    onAttachmentsChanged: (channelId, messageId, message) =>
      live?.publishAttachments(channelId, messageId, message),
    onSessionLinksChanged: (channelId, messageId, message) =>
      live?.publishSessionLinks(channelId, messageId, message),
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  changedFiles = (fileId) => channels.recordAttachmentChange?.(fileId);
  startup.enter('bot-attention', 'initialize');
  const attention = createBotAttentionQuery(
    attachOperationalModule(operationalDatabase, 'messaging'),
    channels,
  );
  startup.enter('inbox-history', 'initialize');
  const inboxHistory = createInboxHistoryQuery(
    attachOperationalModule(operationalDatabase, 'messaging'),
    channels,
  );
  const team = teamFeature.apply({
    operationalDatabase,
    channels,
    contentPurge,
    spaces: () => spaces,
    registry,
    getRuntime: () => runtime,
    tob: () => tob,
    options,
  });
  startup.enter('human-attention', 'initialize');
  const humanAttentionDatabase = attachOperationalModule(operationalDatabase, 'human-attention');
  const humanAttention = createHumanAttentionQuery(
    humanAttentionDatabase,
    options.activeQuestionMessageIds,
    options.activeToolApprovalMessageIds,
    options.activePrivateInputMessageIds,
    (human) => {
      try {
        return roster.forHuman(human.humanId).snapshot().muted;
      } catch {
        return [];
      }
    },
    () => new Date(),
    (human, value) => team.approvals.project(human, value),
  );
  startup.enter('human-attention', 'decisions');
  const humanAttentionDecisions = createHumanAttentionDecisions(humanAttentionDatabase);
  if (operationalDatabase.mode === 'ready') {
    startup.enter('human-attention', 'restore');
    const refreshDurableAttention = () =>
      states.replaceDurableAttention(
        humanAttention
          .durableAttention(OWNER_HUMAN_CONTEXT)
          .filter((row) => registry.get(row.botSlug) !== undefined),
      );
    refreshDurableAttention();
    const durableAttention = coalesce(refreshDurableAttention, {
      delayMs: 100,
      maxWaitMs: 500,
    });
    states.syncDurableAttentionWith(durableAttention.flush);
    onOperationalDatabaseClose(operationalDatabase, () => {
      states.syncDurableAttentionWith(() => {});
      durableAttention.cancel();
    });
    operationalDatabase.subscribe(({ topics }) => {
      if (topics.some((topic) => ['content-purge', 'member-purged'].includes(topic)))
        live?.publishContentPurged();
      if (topics.includes('member-purged')) live?.publishHumanIdentityChanged();
      if (
        topics.some((topic) =>
          [
            'channels',
            'bindings',
            'grants',
            'bot-schedules',
            'content-purge',
            'member-purged',
            'assignment-report',
            'bot-ownership',
            'team',
          ].includes(topic),
        )
      )
        live?.publishRosterCommitted();
      if (
        topics.some((topic) =>
          ['assignments', 'source-event', 'bot-inbox', 'channel', 'human-attention'].includes(
            topic,
          ),
        )
      )
        durableAttention.schedule();
    });
  }
  const spaces = workspacesFeature.apply(operationalDatabase, dshHome, team);
  startup.enter('channel-live', 'initialize');
  live = createChannelLiveHub(
    channels,
    {
      snapshot: (human) =>
        personaBotActivitySnapshot(
          registry.list(human.humanId).map((bot) => bot.slug),
          states,
        ),
      onChange: (changed) => states.onActivity((event) => changed(event)),
    },
    () => contentPurge.redactions(),
    (changed) =>
      watchHumanAttention(
        operationalDatabase,
        (notify) =>
          states.onActivity((event) => {
            if (event.cause === 'attention-changed') notify();
          }),
        changed,
      ),
    (human, resource) =>
      resource === 'model-providers' || resource === 'engine-device-login'
        ? human.caller !== 'bot' &&
          (team.isOwner(human) || team.roles.permissions(human).includes('modelSources.manage'))
        : team.isOwner(human),
    (human, slug) => ownsBot(human, registry.getHistorical(slug)),
    (human, id) => team.channelAccess.canRead(human, id, true),
    (human, id) => team.channelAccess.canKnow(human, id),
    (human, value, channelId) => team.approvals.project(human, value, channelId),
  );
  team.onAccessChanged(() => live?.refreshAccess());
  startup.enter('messaging', 'reconcile-paused-invitations');
  if (operationalDatabase.mode === 'ready')
    for (const bot of registry.list())
      if (bot.paused === true) channels.cancelInvitationsForBot(bot.slug);
  startup.enter('session-ownership', 'initialize');
  const ownership = createSessionOwnership(
    attachOperationalModule(operationalDatabase, 'session-ownership'),
  );
  startup.enter('companion-feed', 'initialize');
  companions = createCompanionFeed({
    profileId: createHash('sha256')
      .update(options.companionProfileDir ?? dshHome)
      .digest('hex'),
    bot: (slug) => {
      const bot = registry.get(slug);
      return bot === undefined
        ? undefined
        : {
            slug,
            name: bot.displayName,
            paused: bot.paused === true,
            ...(bot.appearance === undefined ? {} : { appearance: bot.appearance }),
            ...(bot.avatarSeed === undefined ? {} : { avatarSeed: bot.avatarSeed }),
            ...(bot.avatar === undefined
              ? {}
              : {
                  avatar: bot.avatar.startsWith('data:image/')
                    ? botAvatarUrl(slug, bot.avatar)
                    : bot.avatar,
                }),
          };
    },
    activity: () =>
      personaBotActivitySnapshot(
        registry.list().map((bot) => bot.slug),
        states,
      ),
    onActivity: (changed) => states.onActivity(() => changed()),
    onIdentity: (changed) =>
      operationalDatabase.subscribe(({ topics }) => {
        if (topics.includes('bot-registry')) changed();
      }),
    observeOutput: (id, messageId) => channels.observeOutput(OWNER_HUMAN_CONTEXT, id, messageId),
    checkpoint: () => channels.outputCheckpoint(),
  });
  startup.enter('memory', 'initialize');
  const memory = memoryFeature.apply({ registry, ownership, operationalDatabase, team, options });
  startup.enter('usage', 'initialize');
  usage =
    operationalDatabase.mode === 'ready'
      ? createUsageProjection({
          ownership,
          database: operationalDatabase,
          ownerHumanId: () => team.ownerContext().humanId,
          botOwner: (slug) =>
            registry.getHistorical(slug)?.ownerHumanId ?? team.ownerContext().humanId,
          botCreatedAt: (slug) => registry.getHistorical(slug)?.createdAt,
        })
      : undefined;
  startup.enter('workspace-grants', 'initialize');
  const grants = workspacesFeature.createGrants(operationalDatabase, spaces, options);
  startup.enter('tool-rules', 'initialize');
  const { toolRules, reconcileCreators } = approvalsFeature.createRules(
    operationalDatabase,
    externalMessaging,
  );
  reconcileToolRuleCreators = reconcileCreators;
  startup.enter('assignment-access', 'initialize');
  const assignmentAccess = createAssignmentAccessStore(
    attachOperationalModule(operationalDatabase, 'assignment-access'),
  );
  startup.enter('tob', 'initialize');
  const tob = tobFeature.apply({
    operationalDatabase,
    registry,
    channels,
    grants,
    dshHome,
    spaces,
    options,
  });
  startup.enter('bot-creation', 'initialize');
  const creations = personabotsFeature.apply({ operationalDatabase, registry, channels, options });
  startup.enter('bot-import', 'initialize');
  const zipImports = personabotsFeature.createZipImports({ dshHome, registry, creations, options });
  startup.enter('channel-management', 'initialize');
  const channelManagement = createChannelManagement({
    database: attachOperationalModule(operationalDatabase, 'channel-management'),
    channels,
    registry,
    isProtectedBot: (slug) => tob.isTob(slug),
    autoAcceptGroupInvitations: () =>
      (groupInvitationPolicies.at(-1)?.policy ?? initialGroupInvitationPolicy)(),
    onInvitation: (dmId, invitationId) => runtime?.admitGroupInvitation(dmId, invitationId),
    onJoinDecision: (dmId, requestId) => runtime?.admitGroupJoinDecision?.(dmId, requestId),
  });
  startup.enter('profile-recovery', 'initialize');
  const profileRecovery = profileStorage.createProfileRecovery(
    operationalDatabase,
    registry,
    ownership,
  );
  const orchestratorCwd = (bot: { slug: string }): string | undefined =>
    registry.memoryDirFor(bot.slug);
  const hostTools = new Set<string>();
  const botAgentSetups = new Set<BotAgentSetup>();
  const contributeBotAgentSetup = (contribute: BotAgentSetup): (() => void) => {
    botAgentSetups.add(contribute);
    return () => {
      botAgentSetups.delete(contribute);
    };
  };
  const engineToolSources = new Set<EngineToolSource>();
  const contributeEngineTools = (source: EngineToolSource): (() => void) => {
    engineToolSources.add(source);
    return () => {
      engineToolSources.delete(source);
    };
  };
  const engineTools = async (info: EngineToolInfo): Promise<EngineBotTool[]> =>
    (
      await Promise.all(
        [...engineToolSources].map(async (source) => {
          try {
            return [...(await source(info))];
          } catch {
            return [];
          }
        }),
      )
    ).flat();
  const runBotAgentSetups = (
    agentCtx: import('@deepseek-ai/cordis').Context,
    agent: import('@deepseek-ai/dsh-agent').Agent,
    info: BotAgentSetupInfo,
  ): void => {
    for (const contribute of [...botAgentSetups]) contribute(agentCtx, agent, info);
  };

  startup.enter('bot-schedules', 'initialize');
  const schedules = botSchedules.apply({
    operationalDatabase,
    registry,
    onAdmitted: (slug) => runtime?.admitScheduleFiring?.(slug),
    warn: options.warn,
  });
  startup.enter('message-perf', 'initialize');
  const messagePerf: MessagePerfTracker = createMessagePerfTracker();
  startup.enter('prompt-settings', 'initialize');
  const prompts = promptPresets.apply({ dshHome, registry, ownership });
  const { voiceProviders, voiceMessages, voiceSpeech, voiceZoom } = voice.apply(
    startup,
    operationalDatabase,
    registry,
    channels,
    attachments,
    options,
  );
  startup.enter('bot-runtime', 'initialize');
  runtime = createBotRuntime({
    ...(options.routeRests === undefined ? {} : { routeRests: options.routeRests }),
    ...(options.groupFallback === undefined ? {} : { groupFallback: options.groupFallback }),
    inheritedModelPlan: () => {
      const preset = modelPresets.get(DEFAULT_MODEL_PRESET_ID);
      return preset === undefined ? undefined : defaultPresetPlan(preset);
    },
    ...(options.sessionRoute === undefined ? {} : { sessionRoute: options.sessionRoute }),
    ...(options.engineFallback === undefined ? {} : { engineFallback: options.engineFallback }),
    ...(team.bots.available ? { team } : {}),
    voiceMessages,
    callFrames: {
      zoom: (input) =>
        voiceZoom.zoom?.(input) ?? { released: true, messageId: input.messageId, cell: input.cell },
    },
    ...(options.botNetwork === undefined ? {} : { botNetwork: options.botNetwork }),
    ...(options.readTurnProgress === undefined
      ? {}
      : { readTurnProgress: options.readTurnProgress }),
    ...(options.autoContinueDelaysMs === undefined
      ? {}
      : { autoContinueDelaysMs: options.autoContinueDelaysMs }),
    ...(options.stopSettleTimeoutMs === undefined
      ? {}
      : { stopSettleTimeoutMs: options.stopSettleTimeoutMs }),
    ...(options.closeSessionApprovals === undefined
      ? {}
      : { closeSessionApprovals: options.closeSessionApprovals }),
    onTobDelegation: () => options.capture?.('tob:delegation_send', { surface: 'bot_tool' }),
    promptText: (slug) =>
      promptPresets.promptText(prompts, slug, runtime?.currentOrchestratorSessionId?.(slug)),
    promptLimits: (slug) => prompts.limits(slug),
    tob,
    triageContinuation: options.triageContinuation === true,
    inboxHistory,
    messagePerf,
    requireModelRoute: (slug, route) => requireBotModel(team, registry.get(slug), route),
    requireExecution: (slug) => profileRecovery.requireExecution(slug),
    schedules,
    assignmentConcurrencyLimit: () =>
      assignmentLimits.at(-1)?.read() ?? DEFAULT_ASSIGNMENT_CONCURRENCY_LIMIT,
    botHopLimit,
    ...(options.sessionArchive === undefined ? {} : { sessionArchive: options.sessionArchive }),
    beginAssignmentWait: (slug, sessionId) => states.beginAssignmentWait(slug, sessionId),
    database: operationalDatabase,
    externalMessaging,
    sourcePolicy,
    registry,
    channels,
    attachments,
    agents: options.agents ?? unavailableAgentAdapter(),
    ...(options.saveReportSpill === undefined ? {} : { saveReportSpill: options.saveReportSpill }),
    ...(options.readAssignmentTail === undefined
      ? {}
      : { readAssignmentTail: options.readAssignmentTail }),
    ...(options.readAssignmentReportPage === undefined
      ? {}
      : { readAssignmentReportPage: options.readAssignmentReportPage }),
    memory,
    ownership,
    grants,
    assignmentAccess,
    workspaceRoot: join(dshHome, 'botharness', 'runtime-workspaces'),
    orchestratorCwd,
    sessionArchived: (sessionId) =>
      options.workspaces?.()?.archivedSessionIds?.includes(sessionId) === true,
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  startup.enter('bot-runtime', 'reconcile-memory');
  if (operationalDatabase.mode === 'ready') runtime.reconcileMemoryChangesOnStartup?.();
  startup.enter('bot-deletion', 'initialize');
  const deletions = personabotsFeature.createDeletions({
    channels,
    options,
    dshHome,
    operationalDatabase,
    registry,
    ownership,
    grants,
    toolRules,
    externalMessaging,
    runtime,
    spaces,
    live: () => live,
    contentPurge,
  });
  if (operationalDatabase.mode === 'ready') {
    startup.enter('messaging', 'reconcile-group-members');
    const activeBots = new Set(registry.list().map((bot) => bot.slug));
    const missingMembers = new Set(
      channels
        .list()
        .flatMap((channel) =>
          channel.type !== 'group'
            ? []
            : [
                ...channel.members,
                ...(channel.ownerBotSlug === undefined ? [] : [channel.ownerBotSlug]),
              ].filter((slug) => !activeBots.has(slug)),
        ),
    );
    for (const slug of missingMembers) channels.removeBotFromGroups(slug);
  }
  startup.enter('bot-onboarding', 'initialize');
  const { onboarding, acknowledgements } = personabotsFeature.createOnboarding(
    operationalDatabase,
    tob,
    registry,
    channels,
    startup,
  );
  startup.enter('bot-schedules', 'start');
  botSchedules.start(schedules, operationalDatabase);
  return {
    voiceProviders,
    voiceMessages,
    voiceSpeech,
    voiceZoom,
    prompts,
    deletions,
    profileRecovery,
    contentPurge,
    onboarding,
    acknowledgements,
    tob,
    creations,
    zipImports,
    channelManagement,
    partLibrary,
    rootDir,
    operationalDatabase,
    externalMessaging,
    registry,
    modelPresets,
    modelFavorites,
    routingGroups,
    fallbackOverrides,
    configureBotHopLimit: (read) => {
      const registration = { read };
      botHopLimits.push(registration);
      return () => {
        const index = botHopLimits.indexOf(registration);
        if (index !== -1) botHopLimits.splice(index, 1);
      };
    },
    configureAssignmentConcurrencyLimit: (read) => {
      const registration = { read };
      assignmentLimits.push(registration);
      return () => {
        const index = assignmentLimits.indexOf(registration);
        if (index !== -1) assignmentLimits.splice(index, 1);
      };
    },
    configureGroupInvitations: (autoAccept) => {
      const registration = { policy: autoAccept };
      groupInvitationPolicies.push(registration);
      return () => {
        const index = groupInvitationPolicies.indexOf(registration);
        if (index !== -1) groupInvitationPolicies.splice(index, 1);
      };
    },
    contributeBotAgentSetup,
    contributeEngineTools,
    engineTools,
    runBotAgentSetups,
    hostTools,
    states,
    ownership,
    memory,
    ...(usage === undefined ? {} : { usage }),
    messagePerf,
    grants,
    toolRules,
    assignmentAccess,
    channels,
    attention,
    inboxHistory,
    sourcePolicy,
    schedules,
    humanAttention,
    humanAttentionDecisions,
    attachments,
    mediaVersions,
    live,
    team,
    spaces,
    currentRoots: (session, kind) =>
      currentRoots({ ownership, runtime, registry, grants }, session, kind),
    companions,
    roster,
    runtime,
  };
}

export function apply(ctx: Context, config: BotHarnessConfig): void {
  if (!config.enabled) return;
  const { profile, releaseAnchors } = releaseFeature.resolveProfile(ctx, installedPackage);
  const dshHome = resolveDshHome();
  profileStorage.apply(ctx, dshHome);
  diagnosticsFeature.mountClientDiagnostics(ctx, dshHome);
  const botModeSettings = createBotModeSettings(join(dshHome, 'botharness'));
  const productBotMode = config.agentPreset ?? DEFAULT_AGENT_PRESET;
  let installedBotModeIds: ReadonlySet<string> | undefined;
  const globalBotMode = (): string => {
    const saved = botModeSettings.defaultMode();
    return saved !== undefined &&
      (installedBotModeIds === undefined || installedBotModeIds.has(saved))
      ? saved
      : productBotMode;
  };
  const botModeOf = (slug: string | undefined): string =>
    slug === undefined
      ? globalBotMode()
      : resolveBotMode({
          own: core.registry.get(slug)?.preset,
          inherited: globalBotMode(),
          allowed: botModeSettings.allowedModes(slug),
          installed: installedBotModeIds,
        });
  const installedBotModes = async (): Promise<BotModeOption[]> => {
    const presets = ctx.get('agentPresets') as { list(): Promise<BotModeOption[]> } | undefined;
    if (presets === undefined) return [];
    const listed = (await presets.list()).filter((preset) => isBotModeId(preset.id));
    installedBotModeIds = new Set(
      listed.filter((preset) => preset.broken === undefined).map((preset) => preset.id),
    );
    return listed.map((preset) => ({
      id: preset.id,
      ...(preset.name === undefined ? {} : { name: preset.name }),
      ...(preset.description === undefined ? {} : { description: preset.description }),
      ...(preset.order === undefined ? {} : { order: preset.order }),
      ...(preset.broken === undefined ? {} : { broken: preset.broken }),
    }));
  };
  let clientIssues: ClientIssueReporter | undefined;
  const { hostDiagnosticEnvironment, diagnosticEvents } = diagnosticsFeature.apply(
    ctx,
    dshHome,
    runningRelease,
    () => clientIssues,
  );
  const { release, updateLifecycle } = releaseFeature.apply({
    moduleUrl: import.meta.url,
    dshHome,
    profile,
    diagnosticEvents,
    runningRelease,
  });
  const { telemetry, telemetryDir, telemetryState, activeDay } = diagnosticsFeature.mountTelemetry(
    ctx,
    dshHome,
    config,
    release,
    (reporter) => {
      clientIssues = reporter;
    },
  );
  const git = createGitService({
    dshHome,
    log: (message) => ctx.logger.info(message),
  });
  const resolvedGit = git.resolve();
  ctx.logger.info(
    resolvedGit.available
      ? `git phase=resolved source=${resolvedGit.source} version=${resolvedGit.version}`
      : `git phase=resolved unavailable=${resolvedGit.reason}`,
  );
  let publishDraft: (event: ChannelDraftEvent) => void = () => undefined;
  let voiceDrafts: (event: ChannelDraftEvent) => void = () => undefined;
  const defaultPreset = () => core.modelPresets.get(DEFAULT_MODEL_PRESET_ID);
  const inheritedPlan = () => {
    const preset = defaultPreset();
    return preset === undefined ? undefined : defaultPresetPlan(preset);
  };
  const effectivePlan = (slug: string) => {
    const bot = core.registry.get(slug);
    return bot === undefined ? undefined : resolveBotModelPlan(bot, inheritedPlan);
  };
  const defaultModel: DshDefaultModelHost = {
    currentSelection(role = 'orchestrator') {
      const route = defaultPresetRoute(defaultPreset, role, () =>
        ctx.get('agentDefaultModel')?.currentSelection(),
      );
      return {
        provider: route.provider,
        model: route.model,
        ...(route.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: ReasoningEffortId(route.reasoningEffort) }),
      };
    },
  };
  const { modelCatalog, providerCredentials } = createHostModelCatalog(ctx, {
    defaultRoute: () => defaultModel.currentSelection(),
    signalProviderChange: () => core.live.publishResourceChanged('model-providers'),
  });
  const modelReadiness = createModelRouteReadiness(
    {
      get: (slug) => core.registry.get(slug),
      migrateLegacyModel: (slug, expectedModel, route) =>
        core.registry.migrateLegacyModel(slug, expectedModel, route),
    },
    modelCatalog,
    (slug, route) => requireBotModel(core.team, core.registry.get(slug), route),
    () => defaultPreset()?.assignmentDefault,
  );
  const openAssignmentRoutes = createOpenAssignmentRoutes({
    catalog: modelCatalog,
    plan: effectivePlan,
    requireAllowed: (slug, route) => requireBotModel(core.team, core.registry.get(slug), route),
  });
  const privateExecution = new ProtectedExecution(
    privateInputLog((format, value) => ctx.logger.info(format, value), diagnosticEvents),
  );
  const turnRefusals = new Map<string, string | TeamError>();
  ctx.effect(() => () => turnRefusals.clear(), 'botharness: refused Turn reasons');
  const tobCliInvocation = tobFeature.createCliInvocation();
  const sessionLive = new SessionLiveStreams();
  const engineGateway = createEngineGateway();
  const localEngines = subscriptionEnginesAllowed(config, process.env);
  const engineHost = new EngineHost({
    root: join(dshHome, 'botharness', 'engines'),
    local: localEngines,
    requireAccountGrant: (slug, id) =>
      requireBotEngineAccount(core.team, core.registry.get(slug), id),
    gateway: engineGateway,
    accountsChanged: () => core.live.publishResourceChanged('model-providers'),
    observeDeviceLogin: (event) => {
      ctx.logger.info('codex-device-login %j', event);
      if (event.phase !== 'starting') core.live.publishResourceChanged('engine-device-login');
    },
    accountUses: (id) => {
      const uses = (choice: { engine: EngineId; accountId?: string } | undefined) =>
        choice !== undefined && engineAccountKey(choice.engine, choice.accountId) === id;
      return [
        ...core.modelPresets
          .list()
          .filter((preset) => uses(preset.orchestratorEngine) || uses(preset.assignmentEngine))
          .map((preset) => `Model Preset ${preset.name} (${preset.id})`),
        ...core.routingGroups
          .list()
          .filter((group) =>
            group.members.some((member) => member.kind === 'engine' && uses(member)),
          )
          .map((group) => `Routing Group ${group.name} (${group.id})`),
      ];
    },
    routingGroupEffort: (slug) => effectivePlan(slug)?.orchestratorGroupEffort,
    inheritedChoice: (slug, role) => {
      const bot = core.registry.get(slug);
      if (
        bot === undefined ||
        (bot.modelPlan === undefined && bot.model !== undefined) ||
        (role === 'orchestrator'
          ? bot.modelPlan !== undefined
          : bot.modelPlan?.assignmentDefault !== undefined)
      )
        return;
      const preset = defaultPreset();
      return role === 'assignment' && preset?.assignmentFollowsMain !== true
        ? preset?.assignmentEngine
        : preset?.orchestratorEngine;
    },
    observeTurnTarget: (sessionId, turn, target) => {
      const owner = core.ownership.resolve(sessionId);
      if (owner === undefined) return;
      recordTurnTarget(
        attachOperationalModule(core.operationalDatabase, 'bot-runtime'),
        sessionId,
        {
          turn,
          step: 0,
          request: String(turn),
          target,
        },
      );
    },
    changed: () => core.live.publishRosterCommitted(),
    sessionIdsForBot: (slug) =>
      core.ownership.rootsFor(slug, 'orchestrator').map((session) => session.sessionId),
    sessions: () => hostSessionStore<EngineSessionStore>(ctx),
    persistence: () => hostSessionPersistence<EngineSessionPersistence>(ctx),
    approve: async (request) =>
      (await toolApproval?.askEngine({
        session: request.session,
        callId: request.callId,
        toolName: request.toolName,
        input: request.input,
        ...(request.reason === undefined ? {} : { reason: request.reason }),
        ...(request.device === undefined ? {} : { device: request.device }),
        signal: request.signal,
      })) ?? 'unavailable',
    observe: (slug, sessionId, state, role) => {
      if (state !== 'idle')
        core.states.setSessionState(slug, sessionId, 'thinking', undefined, role);
      else if (core.states.snapshot(slug).sessions[sessionId] === 'thinking')
        core.states.setSessionState(slug, sessionId, 'done', undefined, role);
    },
  });
  ctx.effect(
    () => async () => {
      await engineHost.close();
      await engineGateway.close();
    },
    'botharness: Subscription Engine Sessions',
  );
  const engineToolGate = createEngineToolGate({
    owner: (sessionId) => core.ownership.resolve(sessionId)?.botSlug,
    botExists: (slug) => core.registry.get(slug) !== undefined,
    fullAccess: (sessionId) => sessionHasFullAccess(core, sessionId),
    devices: () => [
      {
        kind: 'computer',
        tools: ctx.get('botharnessComputerTools') as EngineDeviceTools | undefined,
        reason: "This PersonaBot wants to act on the profile's shared Computer.",
      },
      {
        kind: 'browser',
        tools: ctx.get('botharnessBrowserTools') as EngineDeviceTools | undefined,
        reason: 'This PersonaBot wants to use the Browser authorized by the Human.',
      },
    ],
    approvalRequired: (name, args) => requiresHumanToolApproval(name, args, templateInUse),
  });
  const agentAdapter = createDshBotAgentAdapter({
    engines: engineHost,
    engineWorkspaceMode: (slug, permission) => engineWorkspaceMode(core, slug, permission),
    engineTools: (info) => core.engineTools(info),
    engineToolGate,
    enginePersona: (bot) =>
      readEnginePersona(core.registry.memoryDirFor(bot.slug), bot.standingLimits),
    tobCliInvocation,
    ...(config.genuiPreviewBrowserPath === undefined
      ? {}
      : { genuiPreviewBrowserPath: config.genuiPreviewBrowserPath }),
    onGenuiDiagnostic: (event) => recordGenuiPreviewDiagnostic(diagnosticEvents, event),
    genuiAttachmentContext: ctx,
    agents: ctx.agents,
    releaseNativeAgent: (agent) => ctx.get('agentLoop')?.releaseIdleAgent?.(agent),
    promptText: (sessionId) => core.prompts.textForSession(sessionId),
    defaultModel,
    observeTurnFailure: (provider, code) => providerCredentials.observe(provider, code),
    observeDirectToolCleanupFailure: ({ sessionId, durationMs }) =>
      ctx.logger.warn(
        `direct-tool-cleanup phase=dispose outcome=failed session=${sessionId} durationMs=${durationMs}`,
      ),
    turnRefusal: (sessionId) => turnRefusals.get(sessionId),
    resolveModelPlan: effectivePlan,
    modelFilter: (slug) => botModelFilter(core.team, core.registry.get(slug)),
    assignmentGroups: {
      pick: (botSlug, groupId, effort) =>
        groupFallback.isMixed(groupId)
          ? groupFallback
              .pickMixedAssignment(botSlug, groupId, effort)
              .then((pick) => pick ?? { kind: 'missing' })
          : groupFallback.pick(botSlug, groupId, effort),
      describe: (groupId, slug) => {
        const group = core.routingGroups.get(groupId);
        const targets = allowedGroupTargets(slug, groupId);
        if (group !== undefined && targets !== undefined)
          return { name: group.name, routes: core.routingGroups.routes(groupId), targets };
      },
      engineRestingUntil: (engine, accountId) => engineHost.limit(engine, accountId)?.until,
      restingUntil: (route) => routeRests.restingUntil(route),
      inherited: () => defaultPreset()?.orchestratorGroupId,
      inheritedEffort: () => defaultPreset()?.orchestratorGroupEffort,
    },
    openAssignmentRoutes,
    orchestratorRoute: (sessionId) => groupFallback.route(sessionId),
    subagentTools: (slug) =>
      createBotSubagentModelTools(
        ctx,
        () => effectivePlan(slug),
        config.subagent,
        async (route) => {
          requireBotModel(core.team, core.registry.get(slug), route);
          await openAssignmentRoutes.require(slug, route);
        },
        () => openAssignmentRoutes.list(slug),
        {
          pick: async (groupId) => {
            const plan = effectivePlan(slug);
            if (!(plan?.assignmentGroups ?? []).includes(groupId))
              throw new Error(`Routing Group ${groupId} is not allowed for Subagents`);
            const picked = await groupFallback.pick(
              slug,
              groupId,
              assignmentGroupOptionOf(plan, groupId)?.defaultEffort,
            );
            if (picked.kind === 'route') return picked.route;
            throw new Error(
              picked.kind === 'exhausted' && picked.rests.length > 0
                ? `Every model in Routing Group ${groupId} is resting: ${picked.rests.map((rest) => `${rest.provider}/${rest.model} until ${rest.until}`).join('; ')}`
                : `Routing Group ${groupId} has no usable model`,
            );
          },
          list: () =>
            (effectivePlan(slug)?.assignmentGroups ?? []).flatMap((groupId) => {
              const group = core.routingGroups.get(groupId);
              if (group === undefined || allowedGroupTargets(slug, groupId) === undefined)
                return [];
              return [
                {
                  group: groupId,
                  name: group.name,
                  members: core.routingGroups.routes(groupId).map((route) => {
                    const rest = routeRests.restingUntil(route);
                    return rest === undefined ? route : { ...route, restingUntil: rest.until };
                  }),
                },
              ];
            }),
        },
      ),
    hasSession: async (sessionId) => {
      const persistence = ctx.get('sessionPersistence') as unknown as
        | { stat(id: string): Promise<unknown> }
        | undefined;
      if (persistence === undefined) throw new Error('DSH Session Persistence is unavailable');
      return (await persistence.stat(sessionId)) !== undefined;
    },
    prepareModelRoute: (slug, role, retainedRoute) => {
      core.profileRecovery.requireExecution(slug);
      return modelReadiness.prepare(slug, role, retainedRoute);
    },
    orchestratorCwd: (bot) => core.registry.memoryDirFor(bot.slug),
    observePreparation: (slug, sessionId, preparing) => {
      if (!preparing && core.states.snapshot(slug).sessions[sessionId] !== 'thinking') return;
      core.states.setSessionState(
        slug,
        sessionId,
        preparing ? 'thinking' : 'done',
        undefined,
        'orchestrator',
      );
    },
    defaultAgentPreset: globalBotMode,
    botModeOf,
    recordSessionMode: (sessionId, mode) => {
      try {
        core.ownership.recordAgentPreset(sessionId, mode);
      } catch (error) {
        ctx.logger.warn(`Could not record the mode of Session ${sessionId}: ${String(error)}`);
      }
    },
    ensureBotModes: async () => {
      await installedBotModes().catch(() => {
        installedBotModeIds ??= new Set();
      });
    },
    assignmentModes: async (slug) => {
      const installed = await installedBotModes();
      const allowed =
        botModeSettings.readError() === undefined ? botModeSettings.allowedModes(slug) : [];
      return {
        default: botModeOf(slug),
        restricted: allowed !== undefined,
        allowed: installed
          .filter((mode) => mode.broken === undefined)
          .filter((mode) => allowed === undefined || allowed.includes(mode.id))
          .map((mode) => ({
            id: mode.id,
            ...(mode.name === undefined ? {} : { name: mode.name }),
            ...(mode.description === undefined ? {} : { description: mode.description }),
          })),
      };
    },
    resolveAgentPresets: () => ctx.get('agentPresets') as DshAgentPresetHost | undefined,
    publishDraft: (event) => publishDraft(event),
    onAgentSetup: (agentCtx, agent, info) => core.runBotAgentSetups(agentCtx, agent, info),
    onOrchestratorFileSetup: (agentCtx, agent) =>
      installOrchestratorFileTools(
        agentCtx,
        agent,
        ctx.get('agentPresets') as DshAgentPresetHost | undefined,
        (name, args) => nativeExecutionRoot(core, agent.session, name, args),
        (shellCtx, shell) =>
          installTobCliShell(shellCtx, shell, {
            nativeCli: {
              available: () =>
                core.tob.isTob(core.ownership.resolve(agent.session.id)?.botSlug ?? '') &&
                agentAdapter.ownsModelFreeTobTurn(agent),
              register: (definition) =>
                tobCliInvocation.register(agent, definition, () => {
                  if (!core.runtime.captureTobCliAuthority)
                    throw new TobError('tob-authority-required');
                  return core.runtime.captureTobCliAuthority(agent.session.id);
                }),
              require: (execution) => tobCliInvocation.require(execution),
            },
            capture: (execution) => {
              const actor = execution.agent;
              if (
                !actor ||
                !core.tob.isTob(core.ownership.resolve(actor.session.id)?.botSlug ?? '')
              )
                return undefined;

              const steward = core.registry.get(core.ownership.resolve(actor.session.id)!.botSlug);
              if (!steward) return undefined;
              const human = humanContext(botOwner(steward));
              const memberTob = !core.team.isOwner(human);
              const memberOperations = memberTob
                ? createMemberTobOperations({
                    human,
                    bridge: invocationBridgeMethods(human),
                    registry: privateBotRegistry(core.registry, human),
                    creations: privateBotCreations(core.creations, human),
                    isProtectedBot: (slug) => core.tob.isTob(slug),
                  })
                : undefined;
              const requireOwner = () => {
                if (!core.team.isOwner(human)) throw new TobError('permission-required');
              };
              let source: (() => void) & { markSideEffect?: () => void };
              try {
                source =
                  core.runtime.captureTobCliAuthority?.(actor.session.id) ??
                  (() => {
                    throw new TobError('tob-authority-required');
                  });
              } catch (error) {
                source = () => {
                  throw error;
                };
              }
              const authorize = () => {
                if (execution.signal.aborted) throw new TobError('agent-context-expired');
                source();
                if (
                  memberTob &&
                  (!team.mode(human).enabled || team.member(human.humanId)?.status !== 'active')
                )
                  throw new TobError('permission-required');
                const denial = grantExecutionDenial(
                  core,
                  actor.session,
                  ctx.get('sandboxPolicy'),
                  ctx.get('approval'),
                );
                if (denial) throw new TobError('tob-authority-required');
              };
              const started = Date.now();
              return {
                signal: execution.signal,
                authorize,
                prepareOperation: async (command, args, signal) => {
                  const checkTargets = () =>
                    authorizeTobBotTargets(args, {
                      registry: core.registry,
                      channels: core.channels,
                      human,
                    });
                  checkTargets();
                  if (memberOperations) return memberOperations(command, args, signal);
                  const prepared =
                    (await tobModelOperations(command, args)) ??
                    (await tobMaintenanceOperations(command, args)) ??
                    (await tobBotCreationOperations(command, args)) ??
                    (await tobBotProfileOperations(command, args)) ??
                    (await tobShareDraftOperations(command, args)) ??
                    (await tobDiagnosticOperations(command, args)) ??
                    (await tobChannelOperations(command, args)) ??
                    (await tobVoiceOperations(command, args)) ??
                    (await tobHostCliOperations(command, args, signal));
                  if (!prepared) return prepared;
                  const scopedGuard = (guard: () => void) => () => {
                    guard();
                    checkTargets();
                  };
                  if (!['create', 'group-create'].includes(command))
                    return {
                      ...prepared,
                      run: (guard, beforeEffect) => prepared.run(scopedGuard(guard), beforeEffect),
                    };
                  return {
                    ...prepared,
                    run: async (guard, beforeEffect) => {
                      guard();
                      core.onboarding.trackCreation(
                        command,
                        String(args.operationKey),
                        actor.session.id,
                        started,
                      );
                      return prepared.run(scopedGuard(guard), beforeEffect);
                    },
                  };
                },
                capabilities: memberTob
                  ? [
                      ...TOB_BOT_CREATE_CAPABILITIES,
                      ...TOB_BOT_PROFILE_CAPABILITIES,
                      TOB_HOST_CLI_CAPABILITY,
                    ]
                  : [
                      ...TOB_MODEL_CAPABILITIES,
                      ...TOB_MAINTENANCE_CAPABILITIES,
                      ...TOB_BOT_CREATE_CAPABILITIES,
                      ...TOB_BOT_PROFILE_CAPABILITIES,
                      ...TOB_SHARE_DRAFT_CAPABILITIES,
                      ...TOB_DIAGNOSTIC_CAPABILITIES,
                      ...TOB_CHANNEL_CAPABILITIES,
                      ...TOB_VOICE_CAPABILITIES,
                      TOB_HOST_CLI_CAPABILITY,
                    ],
                beforeWrite: () => source.markSideEffect?.(),
                readSetting: () => {
                  requireOwner();
                  return core.tob.readSetting();
                },
                writeSetting: (value, revision, guard) => {
                  requireOwner();
                  return core.tob.writeSetting(value, revision, () => {
                    guard();
                    source.markSideEffect?.();
                  });
                },
                approve: async (operation, signal) => {
                  source();
                  return approveTobCliOperation({
                    execution,
                    operation,
                    signal,
                    authorize: source,
                    approval: ctx.get('approval') as ApprovalService | undefined,
                    channelApproval: toolApproval,
                    fullAccess: () => sessionHasFullAccess(core, actor.session.id),
                  });
                },
                log: (phase, details) =>
                  ctx.logger.info('tob-cli %j', {
                    phase,
                    sessionId: actor.session.id,
                    callId: execution.callId,
                    initiator: 'tob-native-shell',
                    durationMs: Date.now() - started,
                    ...details,
                  }),
              };
            },
          }),
      ),
    authorizeBorrow: (agent, role) => {
      const denial = borrowedAgentDenial(core, agent.session, role);
      if (denial !== undefined) throw new Error(denial);
    },
    admitSession: (agent) =>
      void admitBotSession(
        core,
        agent.session,
        undefined,
        ctx.get('sandboxPolicy'),
        ctx.get('approval'),
      ),
  });
  let userQuestions: ChannelUserQuestions | undefined;
  let toolApproval: ChannelToolApproval | undefined;
  let privateInputs: PrivateInputs | undefined;
  let imCommandServices: import('./messaging/im-commands.js').ImCommandServices | undefined;
  let botNetwork: import('./runtime/bot-network.js').BotNetworkPort | undefined;
  const routeRests = createRouteRests();
  function allowedGroupTargets(slug: string, groupId: string) {
    try {
      const targets = core.routingGroups.targets(groupId);
      const bot = core.registry.get(slug);
      if (bot === undefined) return;
      const allowed = botModelGrants(core.team, bot);
      return targets.every((target) =>
        target.kind === 'route'
          ? allowsModel(allowed, target.route)
          : localEngines &&
            allowsEngineAccount(allowed, engineAccountKey(target.engine, target.accountId)),
      )
        ? targets
        : undefined;
    } catch {
      return undefined;
    }
  }
  const groupFallback = createGroupFallback({
    plan: effectivePlan,
    inheritedGroup: () => defaultPreset()?.orchestratorGroupId,
    inheritedEffort: () => defaultPreset()?.orchestratorGroupEffort,
    routes: (groupId) => core.routingGroups.routes(groupId),
    engines: {
      targets: (groupId) => core.routingGroups.targets(groupId),
      allowed: (slug, target) => {
        if (!localEngines) return false;
        const id = engineAccountKey(target.engine, target.accountId);
        requireBotEngineAccount(core.team, core.registry.get(slug), id);
        return true;
      },
      limit: (engine, accountId) => engineHost.limit(engine, accountId),
    },
    allowsGroup: (slug, id) => allowedGroupTargets(slug, id) !== undefined,
    rests: routeRests,
    requireAllowed: (botSlug, route) =>
      requireBotModel(core.team, core.registry.get(botSlug), route),
    validate: (route) => modelCatalog.validate(route),
    withEffort: async (route, effort) => groupMemberRoute(route, effort, await modelCatalog.list()),
    overrides: {
      get: (sessionId) => core.fallbackOverrides.get(sessionId),
      set: (sessionId, override) => core.fallbackOverrides.set(sessionId, override),
      delete: (sessionId) => core.fallbackOverrides.delete(sessionId),
    },
  });
  const core = createCore({
    legacyDefaultModel: () => {
      const main = ctx.get('agentDefaultModel')?.currentSelection();
      return main === undefined ? {} : { main };
    },
    routeRests,
    groupFallback,
    sessionRoute: (botSlug, sessionId) =>
      groupFallback.route(sessionId) ??
      agentAdapter.modelSelection(sessionId) ??
      core.registry.get(botSlug)?.modelPlan?.orchestrator ??
      modelCatalog.defaultRoute?.(),
    engineFallback: (botSlug, limit) => {
      if (!engineHost.fallsBack(botSlug)) return undefined;
      const to =
        core.registry.get(botSlug)?.modelPlan?.orchestrator ?? modelCatalog.defaultRoute?.();
      if (to === undefined) return undefined;
      return {
        kind: 'switch',
        from: { provider: limit.engine, model: limit.account },
        to: { ...to },
        reason: 'quota',
        until: limit.until,
      };
    },
    startupDiagnostic: diagnosticEvents,
    databaseDiagnostic: (snapshot) => {
      recordDatabaseStartup(diagnosticEvents, snapshot);
      updateLifecycle.startup(snapshot.startup.instanceId, snapshot.startup.stage);
    },
    credentials: () => ctx.get('credentials'),
    voiceLog: (phase, fields) => diagnosticEvents.record('voice', phase, fields),
    botNetwork: {
      contacts: () => botNetwork?.contacts() ?? [],
      availability: (hostId, botSlug) =>
        botNetwork?.availability?.(hostId, botSlug) ?? 'unavailable',
      refresh: async () => {
        await botNetwork?.refresh?.();
      },
      membership: (hostId) => botNetwork?.membership?.(hostId) ?? Promise.resolve('unavailable'),
      send: (hostId, message) =>
        botNetwork === undefined
          ? Promise.reject(new BotNetworkDeliveryError('unable-to-deliver'))
          : botNetwork.send(hostId, message),
    },
    dshHome,
    triageContinuation: true,
    companionProfileDir: (ctx.get('profileContext') as { dir: string } | undefined)?.dir,
    onOutputCommitted: (event) =>
      emitPersonaBotOutputCommitted(ctx, event, (message) => ctx.logger.warn(message)),
    activeQuestionMessageIds: () => userQuestions?.activeMessageIds() ?? [],
    activeToolApprovalMessageIds: () => toolApproval?.activeMessageIds() ?? [],
    closeSessionApprovals: (sessionIds) => toolApproval?.closeSessions(sessionIds),
    activePrivateInputMessageIds: () => privateInputs?.activeMessageIds() ?? [],
    erasePrivateAccounts: async (slug) => {
      await privateInputs?.mcpServers?.erase(slug);
      await privateInputs?.eraseBot(slug);
    },
    capture: (event, properties) => telemetry.capture(event, properties),
    warn: (message) => ctx.logger.warn(message),
    agents: agentAdapter,
    saveReportSpill: async ({ sessionId, content }) => {
      const spillStore = ctx.get('spillStore') as unknown as
        | {
            saveText(input: {
              owner: { sessionId: string };
              source: {
                kind: 'session-reference';
                sessionId: string;
                label: string;
              };
              suggestedName: string;
              content: string;
            }): Promise<{
              locator: string;
              bytes: number;
              retrievalHint: string;
            }>;
          }
        | undefined;
      if (spillStore === undefined) throw new Error('DSH Spill service is unavailable');
      return spillStore.saveText({
        owner: { sessionId },
        source: {
          kind: 'session-reference',
          sessionId,
          label: 'Assignment report',
        },
        suggestedName: 'assignment-report.txt',
        content,
      });
    },
    readAssignmentTail: async (sessionId) => {
      const query = ctx.get('sessionQuery') as unknown as AssignmentSessionQuery | undefined;
      if (query === undefined) throw new Error('DSH Session Query is unavailable');
      return readBoundedAssignmentTail(query, sessionId);
    },
    readTurnProgress: async (sessionId) => {
      const query = ctx.get('sessionQuery') as unknown as
        | {
            readSession(id: string): Promise<{ events: readonly DshSessionEvent[] }>;
          }
        | undefined;
      if (query === undefined) return undefined;
      return turnProgress((await query.readSession(sessionId)).events);
    },
    readAssignmentReportPage: async (sessionId, acceptedSummary, offset, content) => {
      const query = ctx.get('sessionQuery') as unknown as AssignmentSessionQuery | undefined;
      if (query === undefined) throw new Error('DSH Session Query is unavailable');
      return readAssignmentReportPage(query, sessionId, acceptedSummary, offset, content);
    },
    ensureTobWorkspace: async (path) => {
      const owner = ctx.get('workspaceRegistry') as unknown as
        | { create(path: string, title: string): Promise<{ id: string }> }
        | undefined;
      if (!owner) throw new Error('workspace-unavailable');
      return owner.create(path, 'Tob');
    },
    tobSettings: () => ctx.get('settings') as unknown as TobSettingsProvider | undefined,
    workspaces: () => ctx.get('workspaceRegistry') as unknown as DshWorkspaceLookup | undefined,
    sessionArchive: () =>
      ctx.get('workspaceRegistry') as unknown as NativeSessionArchive | undefined,
    imCommands: () => imCommandServices,
  });
  const modelProviders = createHostModelProviders(ctx, {
    routeRests,
    registry: core.registry,
    routingGroups: core.routingGroups,
    modelPresets: core.modelPresets,
    defaultRoute: () => defaultModel.currentSelection(),
  });
  publishDraft = (event) => {
    core.live.publishDraft(event);
    try {
      voiceDrafts(event);
    } catch (error) {
      diagnosticEvents.record('voice', 'call-draft-failed', {
        error: String(error).slice(0, 200),
      });
    }
  };
  ctx.effect(
    () => async () => {
      await core.tob.close();
      await core.registry.settled();
      await core.contentPurge.memberSettled().catch(() => {});
      core.contentPurge.close();
      core.operationalDatabase.close();
    },
    'botharness: purge ledger and operational database',
  );
  const storage = profileStorage.mountStorage(ctx, core, dshHome);
  let connectAccount: ConnectAccount | undefined;
  let voiceCalls: VoiceCalls | undefined;
  const presence = createPresence();
  ctx.effect(() => () => presence.dispose(), 'botharness: desktop presence');
  const team = core.team;
  ctx.effect(
    () =>
      core.operationalDatabase.subscribe(({ topics }) => {
        if (topics.includes('paired-devices')) core.live.publishResourceChanged('devices');
        if (topics.includes('host-relationships'))
          core.live.publishResourceChanged('relationships');
        if (topics.includes('outbox')) core.live.publishResourceChanged('reachable-posts');
        if (topics.includes('bot-onboarding')) core.live.publishResourceChanged('onboarding');
      }),
    'botharness: live resource changes',
  );
  ctx.provide('botharnessResourcePublisher', (resource) =>
    core.live.publishResourceChanged(resource),
  );
  environments.apply(ctx, core, {
    team,
    calls: () => voiceCalls,
    onNetwork: (port) => {
      botNetwork = port;
    },
    telemetry,
    onAccount: (account) => {
      connectAccount = account;
    },
    dshHome,
    packageAnchors: releaseAnchors,
    push: activityFeature.createPush(core, presence),
  });
  diagnosticsFeature.mountTelemetryWatches(ctx, core, {
    telemetry,
    telemetryDir,
    telemetryState,
    activeDay,
  });
  personabotsFeature.mountRosterCleanup(ctx, core);
  ctx.effect(() => {
    const controller = new AbortController();
    if (core.operationalDatabase.mode === 'ready')
      void core.channels.migrateAttachments?.(controller.signal, diagnosticEvents).catch(() => {
        if (!controller.signal.aborted)
          ctx.logger.warn('attachment-migration phase=failed action=inspect-database-and-restart');
      });
    return () => controller.abort();
  }, 'botharness: retained attachment migration');
  ctx.effect(() => () => core.runtime.close(), 'botharness: bot runtime');
  botSchedules.mountCleanup(ctx, core);
  ctx.effect(() => () => core.live.close(), 'botharness: Channel live hub');
  ctx.effect(() => () => core.companions.close(), 'botharness: Window Companion feed');
  ctx.provide('botharness', core);
  if (config.privateInputExecution === true)
    ctx.logger.warn(
      'botharness: privateInputExecution is set, but the Docker-protected Profile was removed. This Profile runs as an ordinary Profile: secret input stays available, and Agent tools are no longer fenced by a container.',
    );
  const secretMcpStore = createSecretMcpStore(
    attachOperationalModule(core.operationalDatabase, 'secret-mcp'),
  );
  privateInputs = mountPrivateInputs(
    ctx,
    core,
    privateExecution,
    config.privateInputWebUrl,
    undefined,
    secretMcpStore,
    diagnosticEvents,
  );
  teamFeature.mountConfinement(ctx, core, dshHome);
  const takeovers = createCoreTakeoverHandoffs(ctx, core, diagnosticEvents);
  mountTakeoverTools(ctx, core, takeovers);
  messaging.mountCleanup(ctx, core);
  const { cloudConnections, cloudWork } = cloud.apply(ctx, core);
  memoryFeature.mountEngineTools(ctx, core);
  cloud.mount(ctx, core, cloudConnections, cloudWork);
  messaging.mountProviders(ctx, core);

  const { permissionDenial, recordOrchestratorPermission, appliedPermission } =
    workspacesFeature.mountPermissionTracking(ctx, core);
  const reviewing = new Set<string>();
  const idleCompactionSettings = createIdleCompactionSettings(join(dshHome, 'botharness'));
  const compactionPolicy = (): CompactionThresholdPolicy => {
    const value = idleCompactionSettings.read();
    if (value === 'invalid') return {};
    return {
      ...(value.thresholdRatio === undefined ? {} : { thresholdRatio: value.thresholdRatio }),
      ...(value.headroomTokens === undefined ? {} : { headroomTokens: value.headroomTokens }),
    };
  };
  let compactionBaseConfig: Record<string, unknown> | undefined;
  const targetCompactionEngines = new WeakSet<object>();
  const installTargetCompaction = (engine: PressureCompactionEngine): void => {
    if (targetCompactionEngines.has(engine)) return;
    const original = engine.compactIfNeeded;
    if (typeof original !== 'function' || typeof engine.compactRegion !== 'function') return;
    targetCompactionEngines.add(engine);
    const fallback = original.bind(engine);
    const compactToTarget = createTargetCompaction({
      measure: (session) =>
        (
          ctx.get('tokenMeter') as unknown as {
            measure(session: unknown): PricedSurface;
          }
        ).measure(session),
      prune: (session) =>
        (
          ctx.get('toolResultPruner') as unknown as
            | { pruneSession(session: unknown): void }
            | undefined
        )?.pruneSession(session),
      compactRegion: (start, end, agent, signal) =>
        engine.compactRegion!(start, end, agent, signal),
      log: (level, event) => ctx.logger[level](`context-compaction ${JSON.stringify(event)}`),
    });
    engine.compactIfNeeded = async (agent, trigger, signal) => {
      if (trigger !== 'pressure' || core.ownership.resolve(agent.session.id) === undefined)
        return fallback(agent, trigger, signal);
      const route = agent.session.requestHeader()?.config;
      if (route === undefined || ctx.get('tokenMeter') === undefined)
        return fallback(agent, trigger, signal);
      const info = await ctx.llm.resolveModelInfo(route.provider, route.model, signal);
      const contextWindow = info.context?.contextWindow;
      if (contextWindow === undefined) return fallback(agent, trigger, signal);
      const modelPolicies = (compactionBaseConfig ?? engine.config)?.['modelPolicies'];
      const threshold = compactionThresholdTokens(
        {
          ...(Array.isArray(modelPolicies)
            ? {
                modelPolicies: modelPolicies as NonNullable<
                  CompactionThresholdPolicy['modelPolicies']
                >,
              }
            : {}),
          ...compactionPolicy(),
        },
        route,
        contextWindow,
        route.maxTokens ?? info.defaultMaxTokens ?? 0,
      );
      if (threshold <= 0) return fallback(agent, trigger, signal);
      return compactToTarget(agent, threshold, signal);
    };
  };
  const applyCompactionPolicy = (): void => {
    const engine = ctx.get('compaction') as unknown as PressureCompactionEngine | undefined;
    if (engine !== undefined) installTargetCompaction(engine);
    const config = engine?.config;
    if (engine === undefined || typeof config !== 'object' || !('thresholdRatio' in config)) return;
    compactionBaseConfig ??= config;
    const policy = compactionPolicy();
    const thresholdRatio = policy.thresholdRatio ?? compactionBaseConfig['thresholdRatio'];
    const headroomTokens = policy.headroomTokens ?? compactionBaseConfig['headroomTokens'];
    if (config['thresholdRatio'] === thresholdRatio && config['headroomTokens'] === headroomTokens)
      return;
    engine.config = Object.freeze({
      ...compactionBaseConfig,
      thresholdRatio,
      headroomTokens,
    });
  };
  installNativeSubagentWake(ctx, core.runtime);
  applyCompactionPolicy();
  ctx.on(
    'agent/pre-step',
    async ({ agent, signal, messages, modelSelection }, next) => {
      applyCompactionPolicy();
      if (isApprovalReviewSession(agent.session.id))
        return reviewing.has(agent.session.id) ? next() : { kind: 'reject' };
      try {
        await core.runtime.ensureAssignmentCapacity?.(agent.session.id, signal);
      } catch {
        return { kind: 'reject' };
      }
      const modelOwner = core.ownership.resolve(agent.session.id);
      if (modelOwner) {
        try {
          requireBotModel(core.team, core.registry.get(modelOwner.botSlug), modelSelection);
        } catch (error) {
          if (!(error instanceof TeamError)) throw error;
          turnRefusals.set(agent.session.id, error);
          return { kind: 'reject' };
        }
      }
      const repairs = new Set<BotSessionRepair>();
      const denial = admitBotSession(
        core,
        agent.session,
        undefined,
        ctx.get('sandboxPolicy'),
        ctx.get('approval'),
        (repair) => repairs.add(repair),
      );
      if (ctx.get('sandboxPolicy') !== undefined && ctx.get('approval') !== undefined)
        recordOrchestratorPermission(agent.session, repairs.has('orchestrator'));
      if (repairs.has('assignment'))
        ctx.logger.warn(
          'botharness: restored the permission mode of an Assignment Session that was changed outside its permission snapshot',
        );
      if (denial !== undefined) {
        turnRefusals.set(agent.session.id, sessionRefusalMessage(denial));
        return { kind: 'reject' };
      }
      turnRefusals.delete(agent.session.id);
      if (agentAdapter.ownsModelFreeTobTurn(agent)) {
        await agentAdapter.runModelFreeTobTurn(agent, messages, signal, modelSelection);
        return { kind: 'reject' };
      }
      const contextOwner = core.ownership.resolve(agent.session.id);
      if (contextOwner?.rootRole === 'orchestrator' && contextOwner.parentSessionId === undefined)
        await compactUnknownContext(
          agent,
          signal,
          compactionPolicy(),
          agentAdapter.modelSelection(agent.session.id),
        );
      const decision = await next();
      return contextOwner === undefined
        ? decision
        : restartEmptyToolSeries(agent.session, decision);
    },
    { global: true },
  );
  ctx.on(
    'agent/request-error',
    createBotRequestRetry({
      isBotSession: (sessionId) => core.ownership.resolve(sessionId) !== undefined,
      onQuotaExhausted: (route, untilMs, reason, sessionId) => {
        const owner = sessionId === undefined ? undefined : core.ownership.resolve(sessionId);
        const plan = owner === undefined ? undefined : core.registry.get(owner.botSlug)?.modelPlan;
        if (
          reason === 'quota' ||
          plan?.orchestratorGroupId !== undefined ||
          (plan?.assignmentGroups?.length ?? 0) > 0
        )
          routeRests.rest(route, untilMs, reason);
      },
      log: (message) => ctx.logger.info(message),
    }),
    { global: true },
  );
  const contextOverflowRecovery = createContextOverflowRecovery({
    isBotSession: (sessionId) => core.ownership.resolve(sessionId) !== undefined,
    log: (event) =>
      ctx.logger[event['outcome'] === 'declined' ? 'warn' : 'info'](
        `context-overflow-recovery ${JSON.stringify(event)}`,
      ),
  });
  ctx.on('agent/request-error', contextOverflowRecovery, { global: true, prepend: true });
  const { approvalTemplates, approvalReviewer } = approvalsFeature.apply(dshHome);
  const liveAgent = (sessionId: string) =>
    ctx.agents.list().find((agent) => agent.session.id === sessionId);
  const idleCompaction = createIdleCompaction({
    settings: idleCompactionSettings,
    orchestratorBot: (sessionId) => {
      const owner = core.ownership.resolve(sessionId);
      if (owner?.rootRole !== 'orchestrator' || owner.parentSessionId !== undefined)
        return undefined;
      return core.runtime.currentOrchestratorSessionId?.(owner.botSlug) === sessionId
        ? owner.botSlug
        : undefined;
    },
    botBusy: (botSlug) =>
      (core.runtime.hasPendingInbox?.(botSlug) ?? true) ||
      (core.runtime.turnRunning?.(botSlug) ?? true),
    agent: liveAgent,
    measure: (agent) =>
      (
        ctx.get('tokenMeter') as unknown as
          | { measure(session: unknown): { totalTokens: number } }
          | undefined
      )?.measure(agent.session).totalTokens,
    threshold: async (agent, route) => {
      const info = await ctx.llm.resolveModelInfo(route.provider, route.model);
      return compactionThresholdTokens(
        compactionPolicy(),
        route,
        contextCapacity(info.context?.contextWindow).contextWindow,
        agent.session.requestHeader()?.config.maxTokens ?? info.defaultMaxTokens ?? 0,
      );
    },
    compactNow: async (agent, signal) => {
      const commands = ctx.get('commands') as unknown as CompactCommandRunner | undefined;
      if (commands === undefined) throw new IdleCompactionError('unavailable');
      return runCompactCommand(commands, agent, signal);
    },
    record: (record) => core.usage?.recordIdleCompaction(record),
    log: (event) => ctx.logger.info(`idle-compaction ${JSON.stringify(event)}`),
  });
  ctx.effect(() => () => idleCompaction.close(), 'botharness: idle compaction');
  const compactReservedSession = async (sessionId: string) => {
    const result = await idleCompaction.compactNow(sessionId, true);
    if (result.outcome === 'nothing')
      refreshSessionTexts(
        {
          ownership: core.ownership,
          memory: core.memory,
          prompts: core.prompts,
          warn: (message) => ctx.logger.warn(message),
        },
        sessionId,
      );
    return result;
  };
  const compactBot = (slug: string) =>
    core.runtime.compactOrchestrator
      ? core.runtime.compactOrchestrator(slug, compactReservedSession)
      : Promise.resolve({
          outcome: 'not-loaded' as const,
          tokensBefore: null,
          tokensAfter: null,
        });
  const {
    toolApproval: mountedToolApproval,
    userQuestions: mountedQuestions,
    templateInUse,
  } = approvalsFeature.mount(ctx, core, {
    dshHome,
    approvalTemplates,
    approvalReviewer,
    defaultModel,
    modelCatalog,
    reviewing,
    privateInputs: () => privateInputs,
    sessions: () => (ctx as unknown as { sessions: DshSessionStore }).sessions,
    publishToolApproval: (approval) => {
      toolApproval = approval;
    },
    publishQuestions: (questions) => {
      userQuestions = questions;
    },
    tobCliInvocation,
    permissionDenial,
  });

  ctx.on(
    'agent/assistant-stream',
    ({ agent, frame }) => {
      agentAdapter.acceptAssistantStream(agent.session.id, frame, agent);
      sessionLive.accept(agent.session.id, frame);
    },
    { global: true },
  );

  const dshSessions = (ctx as unknown as { sessions: DshSessionStore }).sessions;

  const developerMode = skillsFeature.createDeveloperMode(
    () => ctx.get('settings') as unknown as TobNativeSettings | undefined,
  );
  ctx.inject(['settings'], (settingsCtx) => {
    const events = settingsCtx as unknown as {
      on(event: 'settings/document-updated', listener: (namespace: string) => void): void;
    };
    developerMode.mountSettings(settingsCtx, (listener) =>
      events.on('settings/document-updated', listener),
    );
  });
  const { releaseInstaller, updateRuns, releaseRestarter } = releaseFeature.mountInstaller(
    ctx,
    updateLifecycle,
    {
      installer: (managerCtx) =>
        (managerCtx as unknown as { pluginManager: ReleaseInstaller }).pluginManager,
      events: ctx as unknown as {
        on(event: string, listener: (value: unknown) => void): () => void;
      },
      appExit: (exitCtx) => (exitCtx as unknown as { appExit: (code: number) => void }).appExit,
    },
  );
  const dataReset = profileStorage.createReset(ctx, core, dshHome, releaseRestarter);
  const { releaseService, pluginUpdates } = releaseFeature.mountServices(ctx, {
    runningRelease,
    profile,
    installedPackage,
    releaseAnchors,
    releaseInstaller,
    releaseRestarter,
    updateRuns,
    updateLifecycle,
  });
  const { tobModelOperations, tobMaintenanceOperations } = tobFeature.mountSettingsOperations(
    ctx,
    core,
    { modelCatalog, developerMode, telemetry, git, releaseService },
  );
  const folders = workspacesFeature.mountFolders(ctx);
  const { marketplaceClient, marketplaceUploads, shareDrafts } = marketplace.apply(ctx, {
    baseUrl: config.marketplaceUrl ?? DEFAULT_MARKETPLACE_URL,
    dshHome,
    registry: core.registry,
    account: () => connectAccount,
  });
  const skills = skillsFeature.apply(ctx, core, { botModeOf, diagnosticEvents });
  const bridgeDeps: BridgeMethodsDeps = {
    team,
    skills: skills.catalog,
    hostVersion: () => release.version(),
    callText: createCallTextHarvest({ calls: () => voiceCalls, attachments: core.attachments }),
    voiceProviders: core.voiceProviders,
    voiceLog: (phase, fields) => diagnosticEvents.record('voice', phase, fields),
    prompts: core.prompts,
    botContext: async (slug) => {
      const sessionId = core.runtime.currentOrchestratorSessionId?.(slug) ?? null;
      const agent = sessionId === null ? undefined : liveAgent(sessionId);
      const request = agent?.session.requestHeader()?.config;
      const route =
        request ??
        core.registry.get(slug)?.modelPlan?.orchestrator ??
        defaultModel.currentSelection();
      const info = await ctx.llm.resolveModelInfo(route.provider, route.model);
      const capacity = contextCapacity(info.context?.contextWindow);
      const measurement = agent?.ctx.get('tokenMeter')?.measure(agent.session);
      return {
        sessionId,
        usedTokens: measurement?.totalTokens ?? null,
        ...(agent === undefined || measurement === undefined
          ? {}
          : {
              sources: contextSources({
                nodes: measurement.nodes,
                totalTokens: measurement.totalTokens,
                eventAt: (seq) => agent.session.eventAt(seq),
              }),
            }),
        ...capacity,
        thresholdTokens: compactionThresholdTokens(
          compactionPolicy(),
          route,
          capacity.contextWindow,
          request?.maxTokens ?? info.defaultMaxTokens ?? 0,
        ),
      };
    },
    botSystemPrompt: async (slug) => {
      const sessionId =
        core.runtime.currentOrchestratorSessionId?.(slug) ??
        [...core.ownership.rootsFor(slug)]
          .reverse()
          .find((root) => root.rootRole === 'orchestrator')?.sessionId ??
        null;
      const agent = sessionId === null ? undefined : liveAgent(sessionId);
      if (agent === undefined) {
        const query = ctx.get('sessionQuery') as unknown as
          | {
              readSession(id: string): Promise<{ events: readonly DshSessionEvent[] }>;
            }
          | undefined;
        const logged =
          sessionId === null || query === undefined
            ? null
            : systemPromptFromLog((await query.readSession(sessionId)).events);
        return {
          sessionId,
          loaded: false,
          effectiveText: logged,
          effectiveSource: logged === null ? 'none' : 'log',
          next: null,
          pending: sessionId !== null && core.prompts.pending(slug, sessionId),
        };
      }
      const nodes = agent.session.surface.nodes
        .map((seq) => agent.session.eventAt(seq))
        .filter((event) => event?.type === 'system/message')
        .map((event) => messageText((event!.data as { message: unknown }).message))
        .filter((text) => text !== '');
      const effectiveText = nodes.at(-1) ?? null;
      const assembly = await agent.ctx.systemPrompt.assemble(assembleContextFor(agent));
      const text = renderPrompt(assembly);
      return {
        sessionId,
        loaded: true,
        effectiveText,
        effectiveSource: effectiveText === null ? 'none' : 'session',
        next: {
          text,
          sections: assembly.sections.map(({ name, text }) => ({ name, text })),
          contexts: renderContextSections(assembly).map(({ name, text }) => ({
            name,
            text,
          })),
        },
        pending:
          core.prompts.pending(slug, sessionId ?? undefined) ||
          (sessionId !== null && core.memory.personaPending?.(sessionId) === true),
      };
    },
    cloudConnections,
    cloudWork,
    approvalReviewer,
    botModes: {
      settings: botModeSettings,
      productDefault: productBotMode,
      roster: installedBotModes,
      changed: skills.reconcileBotMode,
    },
    idleCompaction: {
      settings: idleCompactionSettings,
      scheduler: idleCompaction,
      applyThreshold: applyCompactionPolicy,
      routes: () => {
        let fallback: { provider: string; model: string } | undefined;
        try {
          const selection = defaultModel.currentSelection();
          fallback = { provider: selection.provider, model: selection.model };
        } catch {
          fallback = undefined;
        }
        return core.registry.list().flatMap((bot) => {
          const route = bot.modelPlan?.orchestrator ?? fallback;
          return route === undefined ? [] : [{ provider: route.provider, model: route.model }];
        });
      },
      rescan: () => idleCompaction.rescan(ctx.agents.list().map((agent) => agent.session.id)),
      compactBot,
      compactReservedSession,
    },
    composerIdentity: (human) =>
      composerRecoveryIdentity(
        join(homedir(), '.config', 'botharness', 'composer-host-id'),
        join(core.rootDir, '..', 'composer-profile-id'),
        human.humanId,
      ),
    warn: (message) => ctx.logger.warn(message),
    registry: core.registry,
    approvalTemplates,
    deletions: core.deletions,
    contentPurge: core.contentPurge,
    storage,
    dataReset,
    modelPresets: core.modelPresets,
    ...(modelProviders === undefined ? {} : { modelProviders }),
    subscriptionEngines: engineHost,
    engineAccounts: engineHost,
    engineSelection: engineHost,
    localSubscriptionEngines: localEngines,
    routingGroupEngineOptions: (allowed) =>
      routingGroupEngineOptions(engineHost, localEngines ? allowed : undefined),
    releaseEngineQuotaHold: (slug) => void core.runtime.releaseQuotaHold?.(slug),
    modelFavorites: core.modelFavorites,
    routingGroups: core.routingGroups,
    routeRests,
    modelCatalog,
    modelReadiness,
    onboarding: core.onboarding,
    acknowledgements: core.acknowledgements,
    tob: core.tob,
    creations: core.creations,
    zipImports: core.zipImports,
    channelManagement: core.channelManagement,
    partLibrary: core.partLibrary,
    onboardingNews: (slug) => onboardingNewsAvailable(ctx, botModeOf(slug)),
    defaultModel,
    states: core.states,
    runningSessionIds: () =>
      new Set(
        ctx.agents
          .list()
          .filter((agent) => agent.status === 'running')
          .map((agent) => agent.id),
      ),
    channels: core.channels,
    attachments: core.attachments,
    ownership: core.ownership,
    memory: core.memory,
    ...(core.usage === undefined ? {} : { usage: core.usage }),
    sessionLive,
    sessionModels: sessionModelChoices(
      attachOperationalModule(core.operationalDatabase, 'bot-runtime'),
    ),
    presentToolResult: (sessionId, name, args, result) => {
      const agent = ctx.agents.list().find((candidate) => candidate.session.id === sessionId);
      const definition = agent === undefined ? ctx.tools.get(name) : ctx.tools.get(name, agent);
      return definition?.presentResult?.(
        args,
        result as Parameters<NonNullable<typeof definition.presentResult>>[1],
      );
    },
    orchestratorRunner: (slug) => engineHost.orchestratorRunner(slug),
    describeEngineSession: (sessionId) => engineHost.describe(sessionId),
    describeToolCall: (sessionId, name, args) => {
      const call = describeToolCall(ctx, sessionId, name, args, true);
      if (call === undefined) return undefined;
      return {
        kind: toolKindForView(call.view),
        ...(call.publicDetail === undefined ? {} : { detail: call.publicDetail }),
      };
    },
    readUsageSessionLog: async (sessionId) => {
      const query = ctx.get('sessionQuery') as unknown as
        | {
            readSession(id: string): Promise<{
              events: readonly DshSessionEvent[];
              inheritedEventCount?: number;
            }>;
          }
        | undefined;
      if (query === undefined) return undefined;
      const snapshot = await query.readSession(sessionId);
      return {
        events: snapshot.events,
        inheritedEventCount: snapshot.inheritedEventCount ?? 0,
      };
    },
    roster: core.roster,
    runtime: core.runtime,
    attention: core.attention,
    sourcePolicy: core.sourcePolicy,
    schedules: core.schedules,
    takeovers,
    humanAttention: core.humanAttention,
    humanAttentionDecisions: core.humanAttentionDecisions,
    grants: core.grants,
    folders,
    externalMessaging: core.externalMessaging,
    toolApproval: mountedToolApproval,
    userQuestions: mountedQuestions,
    toolRules: core.toolRules,
    assignmentAccess: core.assignmentAccess,
    marketplace: marketplaceClient,
    marketplaceUploads,
    marketplaceInstallReviews: marketplace.createInstallReviews(ctx, {
      dshHome,
      registry: core.registry,
      tob: core.tob,
      defaultRoute: () => defaultModel.currentSelection(),
      modelCatalog,
      reviewing,
      marketplaceUploads,
    }),
    shareDrafts,
    marketplaceReceipts: marketplace.createReceipts(ctx, marketplaceClient, telemetryDir),
    release: releaseService,
    plugins: pluginUpdates,
    updates: updateRuns,
    telemetry,
    activeDay,
    git,
    developerMode: { set: developerMode.set },
    computerAccess: {
      changed: (slug: string) => {
        const provider = ctx.get('botharnessComputerTools') as unknown as
          | { reconcileBot?: (slug: string) => Promise<void> }
          | undefined;
        const pending = provider?.reconcileBot?.(slug);
        void pending?.catch((error: unknown) => {
          ctx.logger.warn(
            `botharness: Computer tool reconcile failed for ${slug}: ${String(error)}`,
          );
        });
      },
    },
    browserAccess: {
      changed: (slug: string) => {
        const provider = ctx.get('botharnessBrowserTools') as unknown as
          | { reconcileBot?: (slug: string) => Promise<void> }
          | undefined;
        const pending = provider?.reconcileBot?.(slug);
        void pending?.catch((error: unknown) => {
          ctx.logger.warn(
            `botharness: Browser tool reconcile failed for ${slug}: ${String(error)}`,
          );
        });
      },
    },
    browserProfile: {
      changed: (slug: string) => {
        const provider = ctx.get('botharnessBrowserTools') as unknown as
          | { resetBot?: (slug: string) => void }
          | undefined;
        provider?.resetBot?.(slug);
      },
    },
  };
  const invocationBridgeMethods = createBridgeMethodsForHumans(bridgeDeps);
  const bridgeMethods = invocationBridgeMethods(OWNER_HUMAN_CONTEXT);
  ctx.effect(
    () =>
      mountCardContextLive(ctx, core, mountedToolApproval, mountedQuestions, (slug, id) => {
        const request =
          id === undefined ? undefined : liveAgent(id)?.session.requestHeader?.()?.config;
        const route =
          request ??
          core.registry.get(slug)?.modelPlan?.orchestrator ??
          defaultModel?.currentSelection();
        return [
          route?.provider,
          route?.model,
          request?.maxTokens,
          compactionPolicy(),
          core.runtime.currentTurnTarget?.(slug),
        ];
      }),
    'botharness: card and context changes',
  );
  imCommandServices = {
    botDisplayName: (slug) =>
      core.registry.get(slug)?.displayName ?? core.registry.getHistorical(slug)?.displayName,
    plan: async (slug) => {
      const state = await bridgeMethods.modelPlan({ slug });
      if (!state.ok) throw new Error(state.error.message);
      return state.value.plan;
    },
    catalog: () => modelCatalog.list(),
    defaultRoute: () => modelCatalog.defaultRoute?.(),
    applyModel: async (slug, route, assertCurrent) => {
      const state = await bridgeMethods.modelPlan({ slug });
      if (!state.ok) throw new Error(state.error.message);
      assertCurrent?.();
      const result = await bridgeMethods.modelPlanCustomize(
        {
          slug,
          expectedRevision: state.value.revision ?? 0,
          orchestrator: route,
        },
        assertCurrent,
      );
      if (!result.ok) throw new Error(result.error.message);
    },
    stopTurn: async (slug) => {
      const channel = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, slug);
      if (channel === undefined) throw new Error('Bot DM is unavailable');
      const stopped = await bridgeMethods.channelBotStop({
        channelId: channel.id,
        botSlug: slug,
      });
      if (stopped.ok) return { sessionId: stopped.value.stopped.sessionId };
      if (stopped.error.code === 'not-working') return undefined;
      throw new Error(stopped.error.message);
    },
    startFreshOrchestrator: (slug, assertCurrent) =>
      core.runtime.startFreshOrchestrator!(slug, assertCurrent),
    turnRunning: (slug) => core.runtime.turnRunning!(slug),
    compact: compactBot,
  };
  const {
    tobBotCreationOperations,
    tobBotProfileOperations,
    tobShareDraftOperations,
    tobDiagnosticOperations,
    tobHostCliOperations,
    tobChannelOperations,
  } = tobFeature.mountOperations(ctx, core, {
    bridgeMethods,
    diagnosticEvents,
    hostDiagnosticEnvironment,
    readWebServices: (webCtx) =>
      webCtx as unknown as {
        connection: { authenticatedUrl(baseUrl: string): string };
        webServer: { getOrigin(): string };
      },
  });
  const tobVoiceOperations = voice.mountCalls(
    ctx,
    core,
    modelCatalog,
    bridgeMethods,
    diagnosticEvents,
    () => (ctx.get('botharnessComputer') as { callMedia?: VoiceCallMedia } | undefined)?.callMedia,
    (calls) => {
      voiceCalls = calls;
    },
    (drafts) => {
      voiceDrafts = drafts;
    },
  );
  registerBridge(
    ctx,
    invocationBridgeMethods,
    privateInputs,
    {
      followRoster: (human, signal) => core.live.followRoster(human, signal),
      followActivity: (human, signal) => core.live.followActivity(human, signal),
      followChannel: (human, channelId, limit, signal, drafts) =>
        core.live.followChannel(human, channelId, limit, signal, drafts),
      journalPage: (human, channelId, request) =>
        core.channels.readHumanJournalPage(human, channelId, request),
      filesPage: (human, channelId, request) =>
        core.channels.readHumanFilesPage(human, channelId, request),
      changes: (human, channelId, request) =>
        core.channels.readHumanChanges?.(human, channelId, request),
      changeCursor: (human) => core.channels.changeCursor?.(),
      followCompanion: (human, resume, lastEventId, signal) =>
        followCompanion((request) => core.companions.open(request), resume, lastEventId, signal),
    },
    team,
  );

  skills.mountNative({
    developerMode,
    getRegistrar: (skillsCtx) => (skillsCtx as unknown as { skills: SkillRegistrar }).skills,
    localVoiceSkill: voice.localVoiceSkill,
  });

  ctx.inject(['connection'], (connectionCtx) => {
    const connection = (
      connectionCtx as unknown as {
        connection: {
          fetch: {
            register(route: {
              path: string;
              methods: readonly ('GET' | 'POST')[];
              requestBody: 'buffered' | 'streaming';
              fetch(request: Request): Promise<Response>;
            }): () => Promise<void>;
          };
        };
      }
    ).connection;
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: ENGINES_PATH,
          methods: ['GET', 'POST'],
          requestBody: 'buffered',
          fetch: (request) =>
            engineRouteFetch(request, {
              ...createEngineSelectionBridge(team.ownerContext(), bridgeDeps),
              host: engineHost,
              authorizeLogin: () => requireModelSources(team.ownerContext(), team),
              botExists: (slug) => core.registry.get(slug) !== undefined,
              tools: (bot) => agentAdapter.engineToolCatalog(bot),
              runTool: async (bot, tool, args) => {
                const found = (await core.engineTools({ botSlug: bot, sessionId: '' })).find(
                  (entry) => entry.name === tool,
                );
                if (found === undefined)
                  throw new Error(
                    `${tool} is not an engine-only tool; run Bot tools with deepseekbot bot tool`,
                  );
                return found.run(args, AbortSignal.timeout(120_000));
              },
              approvals: () =>
                core.registry
                  .list()
                  .flatMap((bot) => toolApproval?.requests(bot.slug) ?? [])
                  .filter((notice) => engineHost.describe(notice.sessionId) !== undefined)
                  .map((notice) => ({
                    botSlug: notice.botSlug,
                    sessionId: notice.sessionId,
                    channelId: notice.channelId,
                    messageId: notice.messageId,
                    toolName: notice.toolName,
                    input: notice.input,
                    expiresAt: notice.expiresAt,
                  })),
            }),
        }),
      'botharness: Subscription Engine route',
    );
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: PRESENCE_PATH,
          methods: ['GET', 'POST'],
          requestBody: 'buffered',
          fetch: (request) => presence.fetch(request, team.ownerContext()),
        }),
      'botharness: desktop presence route',
    );
    connectionCtx.effect(() => {
      const control = createWindowZoomControl(Date.now, (phase, detail) =>
        ctx.logger.info('window-zoom-control %j', { phase, ...detail }),
      );
      const off = connection.fetch.register({
        path: WINDOW_ZOOM_CONTROL_PATH,
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: control.fetch,
      });
      return async () => {
        control.dispose();
        await off();
      };
    }, 'botharness: targeted window zoom delivery');
    connectionCtx.effect(() => {
      const setup = createWindowZoomSetup({
        dshHome,
        profileDir: profile?.dir,
        log: (phase, detail) => ctx.logger.info('window-zoom-setup %j', { phase, ...detail }),
      });
      return connection.fetch.register({
        path: WINDOW_ZOOM_SETUP_PATH,
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: setup.fetch,
      });
    }, 'botharness: desktop window zoom setup after quit');
    connectionCtx.effect(() => {
      const control = createAppearanceControl();
      const off = connection.fetch.register({
        path: APPEARANCE_CONTROL_PATH,
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: control.fetch,
      });
      return async () => {
        control.dispose();
        await off();
      };
    }, 'botharness: explicit Client-local appearance control');
    connectionCtx.effect(() => {
      const desktopWindow = createDesktopWindowReveal({
        log: (phase, detail) => ctx.logger.info('desktop-window %j', { phase, ...detail }),
      });
      desktopWindow.prime();
      return connection.fetch.register({
        path: DESKTOP_WINDOW_PATH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: desktopWindow.fetch,
      });
    }, 'botharness: bring the Desktop window back from a notification');
    voice.mountFetch(connectionCtx, connection.fetch, () => voiceCalls);
    connectionCtx.effect(() => {
      return connection.fetch.register({
        path: CHANNEL_STREAM_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async (request) => {
          return core.live.open(OWNER_HUMAN_CONTEXT, request);
        },
      });
    }, 'botharness: Channel live stream');
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: COMPANION_PATH,
          methods: ['GET', 'POST'],
          requestBody: 'buffered',
          fetch: async (request) =>
            request.method === 'POST'
              ? core.companions.update(request)
              : core.companions.open(request),
        }),
      'botharness: authenticated Window Companion consumption',
    );
    memoryFeature.mountFetch(connectionCtx, connection.fetch, core);
    const attachmentHttp = createAttachmentHttp(
      core.attachments,
      core.channels,
      async (input) => {
        const ref = await (
          input.representation === 'playback'
            ? core.externalMessaging.prepareAudio
            : core.externalMessaging.acquireFile
        )(input.slug, input.sourceEventId, input.attachmentId, input.signal);
        const signal = AbortSignal.any([
          input.signal,
          core.externalMessaging.inbound.sourceSignal(input.slug, input.sourceEventId),
        ]);
        const downloaded = await core.attachments.download(ref.fileId!, ref.name, signal);
        return downloaded;
      },
      (input) => core.externalMessaging.readChannelMedia(input),
      core.mediaVersions,
    );
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: CHANNEL_ATTACHMENT_UPLOAD_PATH,
          methods: ['POST'],
          requestBody: 'streaming',
          fetch: attachmentHttp,
        }),
      'botharness: Channel attachment upload',
    );
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: CHANNEL_ATTACHMENT_PATH,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: attachmentHttp,
        }),
      'botharness: Channel attachment download',
    );
    avatars.mountRoutes(connectionCtx, {
      registry: core.registry,
      registerBanner: (fetch) =>
        connection.fetch.register({
          path: BOT_BANNER_PATH,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch,
        }),
      registerAvatar: (fetch) =>
        connection.fetch.register({
          path: BOT_AVATAR_PATH,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch,
        }),
    });
    const botZipHttp = marketplace.createZipTransfer(ctx, {
      registry: core.registry,
      detail: (slug) => bridgeMethods.get({ slug }),
    });
    profileStorage.mountFetch(ctx, connectionCtx, connection.fetch, core, {
      dshHome,
      runningRelease,
      modelCatalog,
    });
    diagnosticsFeature.mountFetch(ctx, connectionCtx, connection.fetch, core, {
      dshHome,
      dshSessions,
      runningRelease,
    });
    marketplace.mountZipRoutes(connectionCtx, botZipHttp, {
      export: (fetch) =>
        connection.fetch.register({
          path: BOT_ZIP_EXPORT_PATH,
          methods: ['GET', 'POST'],
          requestBody: 'buffered',
          fetch,
        }),
      files: (fetch) =>
        connection.fetch.register({
          path: BOT_ZIP_FILES_PATH,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch,
        }),
      import: (fetch) =>
        connection.fetch.register({
          path: BOT_ZIP_IMPORT_PATH,
          methods: ['POST'],
          requestBody: 'streaming',
          fetch,
        }),
    });
  });
  const activity = activityFeature.apply(
    ctx,
    core,
    dshSessions,
    config.activityDetailConsumers,
    (sessionId, name, args) => describeToolCall(ctx, sessionId, name, args),
  );

  ctx.on(
    'subagent/start',
    (info) => {
      const parentSessionId = ctx.agents.get(info.id)?.session.header.parentSession;
      if (parentSessionId) core.usage?.bindParentTurn(info.id, parentSessionId);
    },
    { global: true },
  );

  const botTurnTelemetry = diagnosticsFeature.createTurnTelemetry(ctx, core, telemetry, liveAgent);
  const turnLog = diagnosticsFeature.createTurnDiagnostics(core, diagnosticEvents);
  ctx.on(
    'session/event',
    (session, event) => {
      queueMicrotask(() => {
        void mountedQuestions
          .reconcileSession(session.id)
          .catch(() => ctx.logger.warn('user-question-reconciliation-failed'));
      });
      activity.handleSessionEvent(session.id, event);
      sessionLive.observe(session.id, event);
      try {
        core.externalMessaging.approvals.result(session.id, event);
      } catch {
        ctx.logger.warn('approval-result-publication-failed');
      }
      core.usage?.handleSessionEvent(session.id, event);
      core.messagePerf.observeSessionEvent(session.id, event);
      turnLog.observe(session.id, event);
      botTurnTelemetry.observe(session.id, event);
      idleCompaction.observeEvent(session.id, event);
      handleCompactionEvent(
        {
          ownership: core.ownership,
          memory: core.memory,
          prompts: core.prompts,
          warn: (message) => ctx.logger.warn(message),
        },
        session.id,
        event.type,
      );
    },
    { global: true },
  );
  ctx.on(
    'agent/created',
    async ({ agent }) => {
      activity.handleAgentCreated(agent.session);
      core.usage?.primeSession(agent.session.id, agent.session.snapshotEvents());
      const owner = core.ownership.resolve(agent.session.id);
      if (owner?.rootRole === 'orchestrator') installOrchestratorSubagentGuard(agent.ctx);
      else if (owner !== undefined) {
        await installBotSubagentModelTools(
          agent.ctx,
          () => core.registry.get(owner.botSlug)?.modelPlan,
          config.subagent,
          async (route) => {
            requireBotModel(core.team, core.registry.get(owner.botSlug), route);
            await openAssignmentRoutes.require(owner.botSlug, route);
          },
          () => openAssignmentRoutes.list(owner.botSlug),
        );
      }
    },
    { global: true },
  );
  ctx.on(
    'agent/status',
    ({ agent, status }) => {
      if (status === 'idle') activity.handleAgentIdle(agent.session.id);
      idleCompaction.agentStatus(agent.session.id, status);
    },
    { global: true },
  );
  ctx.on(
    'agent/disposed',
    ({ agent }) => {
      agentAdapter.forgetAgent(agent);
      mountedQuestions.cancelSession(agent.session.id);
      idleCompaction.forget(agent.session.id);
      turnLog.forget(agent.session.id);
      botTurnTelemetry.forget(agent.session.id);
      activity.handleSessionDisposed(agent.session.id);
      core.messagePerf.clear(agent.session.id);
      sessionLive.forget(agent.session.id);
    },
    { global: true },
  );
  activity.rebuild(dshSessions.list());
  idleCompaction.rescan(ctx.agents.list().map((agent) => agent.session.id));
  ctx.on(
    'agent/inbox/discarded',
    ({ agent, message }) => {
      const source: unknown = message.source;
      if (
        typeof source === 'object' &&
        source !== null &&
        'kind' in source &&
        source.kind === 'user-question-reply' &&
        'callId' in source &&
        typeof source.callId === 'string'
      )
        mountedQuestions.discardReply(agent.session.id, source.callId);
    },
    { global: true },
  );
  for (const session of dshSessions.list())
    core.usage?.primeSession(session.id, session.snapshotEvents());
  if (core.usage !== undefined) {
    const usage = core.usage;

    ctx.inject(['sessionQuery'], (sessionCtx) => {
      const query = sessionCtx.get('sessionQuery') as unknown as
        | {
            readSession(id: string): Promise<{
              events: readonly DshSessionEvent[];
              inheritedEventCount?: number;
            }>;
          }
        | undefined;
      if (query === undefined) return;
      const readUsageLog = async (sessionId: string) => {
        try {
          const snapshot = await query.readSession(sessionId);
          return {
            events: snapshot.events,
            inheritedEventCount: snapshot.inheritedEventCount ?? 0,
          };
        } catch (error) {
          ctx.logger.warn(`botharness: usage log read failed for ${sessionId}: ${String(error)}`);
          return undefined;
        }
      };
      const tracked = core.ownership.list().map((record) => record.sessionId);
      void usage.rebuild(tracked, readUsageLog).then(
        (report) => {
          if (report.legacyBaselineBots !== undefined) {
            ctx.logger.warn(
              `botharness: usage legacy baseline retained; phase=reconcile bots=${report.legacyBaselineBots} historical_backfill=unverifiable`,
            );
          }
          ctx.logger.info(
            `botharness: usage reconciliation completed (${report.folded} attempts, ${report.failed} failed sessions)`,
          );
        },
        (error: unknown) => {
          ctx.logger.warn(`botharness: usage projection rebuild failed: ${String(error)}`);
        },
      );
    });
  }

  ctx.inject(['storageDomain'], (storageCtx) => {
    void core.roster.attach(storageCtx.storageDomain).catch(() => {
      ctx.logger.warn(
        'roster-import initiator=host-startup phase=unavailable arrangement=read-only',
      );
    });
  });

  ctx.systemPrompt.section({
    name: 'botharness:persona',
    order: PERSONA_SECTION_ORDER,
    text: ({ agent }) => core.memory.personaForSession(agent?.session?.id),
  });
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    'botharness/personabot/activity'(event: PersonaBotActivityEvent): void;
  }
}
