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
import { SessionLiveStreams } from './runtime/session-live.js';
import { mountCardContextLive } from './channels/card-context-live.js';
import type { TeamError } from './team/error.js';
import { OWNER_HUMAN_CONTEXT } from './humans/context.js';
import { createPresence } from './push/presence.js';
import type { VoiceCallMedia, VoiceCalls } from './voice/calls.js';
import { followCompanion } from './companions/live.js';
import type { TobNativeSettings } from './tob/cli-model-operations.js';
import { createSecretMcpStore } from './credentials/secret-mcp-store.js';
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { ProtectedExecution } from './credentials/protected-execution.js';
import { privateInputLog } from './credentials/diagnostics.js';
import { createBridgeMethodsForHumans } from './bridge/methods.js';
import { registerBridge } from './bridge/rpc.js';
import { createCoreTakeoverHandoffs, mountTakeoverTools } from './takeover/mount.js';
import type { ConnectAccount } from './devices/connect-account.js';
import { installedRelease } from './release/service.js';
import { stampReleaseComponent } from './release/component.js';
import { createGitService } from './memory/managed-git.js';
import type { ClientIssueReporter } from './telemetry/client-issues.js';
import type { ChannelDraftEvent } from './channels/draft.js';
import type { SkillRegistrar } from './logs/skill.js';
import { attachOperationalModule } from './database/owner.js';
import { resolveDshHome } from './im/config-store.js';
import type { ChannelToolApproval } from './workspaces/tool-approval.js';
import type { ChannelUserQuestions } from './channels/user-questions.js';
import { mountPrivateInputs } from './credentials/mount.js';
import type { PrivateInputs } from './credentials/private-inputs.js';
import type { DshSessionStore } from './sessions/source.js';
import type { PersonaBotActivityEvent } from './state/bot-state.js';
import type { BotSubagentPresetConfig } from './runtime/subagent-model-tools.js';
import { installNativeSubagentWake } from './runtime/native-subagent-wake.js';
import * as activityFeature from './features/activity/plugin.js';
import * as avatars from './features/avatars/plugin.js';
import * as cloud from './features/cloud/plugin.js';
import * as environments from './features/environments/plugin.js';
import * as models from './features/models/plugin.js';
import * as marketplace from './features/marketplace/plugin.js';
import * as messaging from './features/messaging/plugin.js';
import * as botSchedules from './features/schedules/plugin.js';
import * as skillsFeature from './features/skills/plugin.js';
import * as voice from './features/voice/plugin.js';
import type { HostFetchConnection } from './plugin-types.js';
import { createHostCoreOptions } from './host-core-options.js';
import { createHostBridgeDependencies } from './bridge/plugin.js';
import { describeToolCall } from './features/sessions/plugin.js';
import * as sessionsFeature from './features/sessions/plugin.js';
import { dshHostSessions } from './features/sessions/dsh-host-sessions.js';
import * as channelsFeature from './features/channels/plugin.js';
import * as channelFilesFeature from './features/channel-files/plugin.js';
import * as appearanceFeature from './features/appearance/plugin.js';
import * as usageFeature from './features/usage/plugin.js';
import type {} from '@deepseek-ai/dsh-agent-loop';
import type {} from '@deepseek-ai/dsh-tools';
import { createCore } from './core.js';

export type { BotHarnessCore } from './plugin-types.js';

export { createCore } from './core.js';

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

export {
  handleCompactionEvent,
  refreshSessionTexts,
  type CompactionRefreshSink,
} from './features/sessions/plugin.js';

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

export function apply(ctx: Context, config: BotHarnessConfig): void {
  if (!config.enabled) return;
  const { profile, releaseAnchors } = releaseFeature.resolveProfile(ctx, installedPackage);
  const dshHome = resolveDshHome();
  profileStorage.apply(ctx, dshHome);
  diagnosticsFeature.mountClientDiagnostics(ctx, dshHome);
  const botModes = appearanceFeature.createBotModes(
    ctx,
    dshHome,
    () => config.agentPreset ?? DEFAULT_AGENT_PRESET,
    {
      get core() {
        return core;
      },
    },
  );
  const { botModeOf } = botModes;
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
  const {
    defaultModel,
    routingDefaults,
    modelCatalog,
    providerCredentials,
    modelReadiness,
    openAssignmentRoutes,
  } = models.createCatalog(ctx, () => core);
  const privateExecution = new ProtectedExecution(
    privateInputLog((format, value) => ctx.logger.info(format, value), diagnosticEvents),
  );
  const turnRefusals = new Map<string, string | TeamError>();
  ctx.effect(() => () => turnRefusals.clear(), 'botharness: refused Turn reasons');
  const tobCliInvocation = tobFeature.createCliInvocation();
  const sessionLive = new SessionLiveStreams();
  const { engineHost, localEngines } = models.mountEngines(
    ctx,
    config,
    dshHome,
    () => core,
    () => toolApproval,
    routingDefaults,
  );
  const engineToolGate = models.createHostEngineToolGate(ctx, {
    get core() {
      return core;
    },
    get templateInUse() {
      return templateInUse;
    },
  });
  const agentAdapter = personabotsFeature.createHostAgentAdapter(ctx, config, {
    engineHost,
    engineToolGate,
    tobCliInvocation,
    diagnosticEvents,
    defaultModel,
    providerCredentials,
    turnRefusals,
    routingDefaults,
    openAssignmentRoutes,
    modelReadiness,
    botModes,
    publishDraft: (event) => publishDraft(event),
    get core() {
      return core;
    },
    get groupFallback() {
      return groupFallback;
    },
    get routeRests() {
      return routeRests;
    },
    allowedGroupTargets: (slug, id) => allowedGroupTargets(slug, id),
    get agentAdapter() {
      return agentAdapter;
    },
    get team() {
      return team;
    },
    get invocationBridgeMethods() {
      return invocationBridgeMethods;
    },
    get tobSettingsOperations() {
      return tobSettingsOperations;
    },

    get tobOperations() {
      return tobOperations;
    },

    get tobVoiceOperations() {
      return tobVoiceOperations;
    },
    get toolApproval() {
      return toolApproval;
    },
  });
  let userQuestions: ChannelUserQuestions | undefined;
  let toolApproval: ChannelToolApproval | undefined;
  let privateInputs: PrivateInputs | undefined;
  let imCommandServices: import('./messaging/im-commands.js').ImCommandServices | undefined;
  let botNetwork: import('./runtime/bot-network.js').BotNetworkPort | undefined;
  const { routeRests, groupFallback, allowedGroupTargets } = models.createFallback(
    () => core,
    localEngines,
    engineHost,
    modelCatalog,
    routingDefaults,
  );
  const core = createCore(
    createHostCoreOptions(ctx, {
      dshHome,
      routeRests,
      engineHost,
      groupFallback,
      agentAdapter,
      modelCatalog,
      diagnosticEvents,
      updateLifecycle,
      telemetry,
      get core() {
        return core;
      },
      get botNetwork() {
        return botNetwork;
      },
      get userQuestions() {
        return userQuestions;
      },
      get toolApproval() {
        return toolApproval;
      },
      get privateInputs() {
        return privateInputs;
      },
      get imCommandServices() {
        return imCommandServices;
      },
    }),
  );
  const modelProviders = models.mountProviders(ctx, core, routeRests, defaultModel);
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
  const { idleCompactionSettings, compactionPolicy, applyCompactionPolicy } =
    sessionsFeature.createCompactionPolicy(ctx, core, dshHome);
  installNativeSubagentWake(ctx, core.runtime);
  applyCompactionPolicy();
  sessionsFeature.mountPreStep(ctx, {
    core,
    applyCompactionPolicy,
    compactionPolicy,
    reviewing,
    turnRefusals,
    recordOrchestratorPermission,
    agentAdapter,
  });
  models.mountRetry(ctx, core, routeRests);
  sessionsFeature.mountContextOverflowRecovery(ctx, core);
  const { approvalTemplates, approvalReviewer } = approvalsFeature.apply(dshHome);
  const { liveAgent, idleCompaction, compactReservedSession, compactBot } =
    sessionsFeature.mountIdleCompaction(ctx, { core, idleCompactionSettings, compactionPolicy });
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
  const tobSettingsOperations = tobFeature.mountSettingsOperations(ctx, core, {
    modelCatalog,
    developerMode,
    telemetry,
    git,
    releaseService,
  });
  const folders = workspacesFeature.mountFolders(ctx);
  const { marketplaceClient, marketplaceUploads, shareDrafts } = marketplace.apply(ctx, {
    baseUrl: config.marketplaceUrl ?? DEFAULT_MARKETPLACE_URL,
    dshHome,
    registry: core.registry,
    account: () => connectAccount,
  });
  const skills = skillsFeature.apply(ctx, core, { botModeOf, diagnosticEvents });
  const bridgeDeps = createHostBridgeDependencies(ctx, {
    core,
    team,
    skills,
    release,
    diagnosticEvents,
    liveAgent,
    defaultModel,
    compactionPolicy,
    cloudConnections,
    cloudWork,
    approvalReviewer,
    botModes,
    idleCompactionSettings,
    idleCompaction,
    applyCompactionPolicy,
    compactBot,
    compactReservedSession,
    approvalTemplates,
    storage,
    dataReset,
    modelProviders,
    engineHost,
    localEngines,
    routeRests,
    modelCatalog,
    modelReadiness,
    sessionLive,
    nativeSessions: dshHostSessions(ctx, dshSessions),
    takeovers,
    folders,
    mountedToolApproval,
    mountedQuestions,
    marketplaceClient,
    marketplaceUploads,
    shareDrafts,
    dshHome,
    reviewing,
    telemetryDir,
    releaseService,
    pluginUpdates,
    updateRuns,
    telemetry,
    activeDay,
    git,
    developerMode,
    get voiceCalls() {
      return voiceCalls;
    },
  });
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
  imCommandServices = messaging.createCommandServices(
    core,
    bridgeMethods,
    modelCatalog,
    compactBot,
  );
  const tobOperations = tobFeature.mountOperations(ctx, core, {
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
    const connection = (connectionCtx as unknown as { connection: HostFetchConnection }).connection;
    models.mountSubscriptionEngineRoute(connectionCtx, connection, {
      core,
      team,
      bridgeDeps,
      engineHost,
      agentAdapter,
      get toolApproval() {
        return toolApproval;
      },
    });
    appearanceFeature.mountDesktopRoutes(ctx, connectionCtx, connection, {
      team,
      presence,
      dshHome,
      profile,
    });
    voice.mountFetch(connectionCtx, connection.fetch, () => voiceCalls);
    channelsFeature.mountLiveRoute(connectionCtx, connection, core);
    appearanceFeature.mountCompanionRoute(connectionCtx, connection, core);
    memoryFeature.mountFetch(connectionCtx, connection.fetch, core);
    channelFilesFeature.mountAttachmentRoutes(connectionCtx, connection, core);
    avatars.mountRoutes(connectionCtx, () => connection.fetch, core.registry);
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
    marketplace.mountZipRoutes(connectionCtx, () => connection.fetch, botZipHttp);
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
  sessionsFeature.mountLifecycle(ctx, config, {
    core,
    mountedQuestions,
    activity,
    sessionLive,
    turnLog,
    botTurnTelemetry,
    idleCompaction,
    agentAdapter,
    dshSessions,
    openAssignmentRoutes,
  });
  usageFeature.mountReconciliation(ctx, core, dshSessions);

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
