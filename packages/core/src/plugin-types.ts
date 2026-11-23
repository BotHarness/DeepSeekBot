import type { WorkspaceSpaces } from './workspaces/spaces.js';
import type { TeamService } from './team/service.js';
import type { AssignmentReportContent } from './runtime/assignment-report.js';
import type { VoiceProviders } from './voice/providers.js';
import type { createVoiceMessages, VoiceMessages } from './voice/messages.js';
import type { VoiceCalls } from './voice/calls.js';
import type { CloudConnections } from './cloud/connections.js';
import type { ChannelManagementService } from './channels/management.js';
import type { CloudWork } from './cloud/work.js';
import type { BotCreationService } from './bots/creation.js';
import type { BotZipImportService } from './bots/zip-import.js';
import type { TobService, TobSettingsProvider } from './tob/service.js';
import type { ClientAcknowledgements } from './onboarding/acknowledgements.js';
import type { BotOnboarding } from './onboarding/service.js';
import type { PartLibrary } from './bots/part-library.js';
import type { OutboundMessaging } from './messaging/outbound.js';
import type { ProfileRecovery } from './portability/recovery.js';
import type { ContentPurge } from './purge/contracts.js';
import type { EngineBotTool, EngineToolInfo, EngineToolSource } from './engines/engine-tools.js';
import type { CompanionFeed } from './companions/feed.js';
import type { Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';
import type { AttachmentStore } from './attachments/store.js';
import type { BotAgentSetupInfo } from './runtime/dsh-bot-agent-adapter.js';
import type { DiagnosticEvents } from './diagnostics/diagnostic-log.js';
import type { TelemetryCapture } from './telemetry/service.js';
import type { PersonaBotRegistry } from './bots/registry.js';
import type { PersonaBotDeletions } from './bots/deletion.js';
import type { FallbackOverrideStore } from './models/fallback-overrides.js';
import type { RoutingGroupStore } from './models/routing-groups.js';
import type { LegacyDefaultModel, ModelPresetStore } from './models/presets.js';
import type { ModelFavoriteStore } from './models/favorites.js';
import type { MediaVersions } from './attachments/media-versions.js';
import type { ChannelLiveHub } from './channels/live.js';
import type { ChannelStore } from './channels/store.js';
import type { PersonaBotOutputCommitted } from './channels/output.js';
import type { OperationalDatabaseOwner } from './database/owner.js';
import type { MemoryService } from './memory/service.js';
import type { RosterStore } from './roster/store.js';
import type {
  AssignmentEventTail,
  BotAgentAdapter,
  BotRuntime,
  NativeSessionArchive,
} from './runtime/bot-runtime.js';
import type { BotAttentionQuery } from './runtime/attention.js';
import type { InboxHistoryQuery } from './runtime/inbox-history.js';
import type { BotSourcePolicyStore } from './runtime/source-policy.js';
import type { BotScheduleStore } from './schedules/bot-schedules.js';
import type { HumanAttentionQuery, HumanAttentionDecisions } from './runtime/human-attention.js';
import type { AssignmentAccessStore } from './workspaces/assignment-access.js';
import type { ToolApprovalRuleStore } from './workspaces/tool-approval-rules.js';
import type { DshWorkspaceLookup, WorkspaceGrantStore } from './workspaces/grants.js';
import type { SessionOwnership } from './sessions/ownership.js';
import type { AssignmentReportPage } from './runtime/assignment-tail.js';
import type { SessionFailureProgress } from './channels/channel.js';
import type { BotStateTracker } from './state/bot-state.js';
import type { UsageProjection } from './usage/usage.js';
import type { MessagePerfTracker } from './usage/message-perf.js';
import type { PromptSettings } from './prompts/prompt-settings.js';

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

export type BotAgentSetup = (
  agentCtx: import('@deepseek-ai/cordis').Context,
  agent: import('@deepseek-ai/dsh-agent').Agent,
  info: BotAgentSetupInfo,
) => void;

export interface CoreOptions {
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
  requireAssignmentEngine?: import('./runtime/bot-runtime.js').BotRuntimeOptions['requireAssignmentEngine'];
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
}

export interface HostFetchConnection {
  fetch: {
    register(route: {
      path: string;
      methods: readonly ('GET' | 'POST')[];
      requestBody: 'buffered' | 'streaming';
      fetch(request: Request): Promise<Response>;
    }): () => Promise<void>;
  };
}
