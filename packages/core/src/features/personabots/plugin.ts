import * as tobFeature from '../tob/plugin.js';
import { engineAccountKey } from '@botharness/host-protocol/subscription-engine';
import { defaultSpaceMemoryPath } from '../../workspaces/space-memory.js';
import type { TeamError } from '../../team/error.js';
import { requireBotEngineAccount, requireBotModel } from '../../team/models.js';
import { humanContext } from '../../humans/context.js';
import { realpathSync } from 'node:fs';
import type {
  EngineBotTool,
  EngineToolInfo,
  EngineToolSource,
} from '../../engines/engine-tools.js';
import type { createEngineToolGate } from '../../engines/engine-tool-gate.js';
import { readEnginePersona } from '../../engines/engine-plugin.js';
import type { BotAgentSetupInfo } from '../../runtime/dsh-bot-agent-adapter.js';
import type { DiagnosticEvents } from '../../diagnostics/diagnostic-log.js';
import { recordGenuiPreviewDiagnostic } from '../../runtime/genui-preview.js';
import { createPersonaBotRegistry } from '../../bots/registry.js';
import {
  backfillBotBanners,
  backfillBotDescriptors,
  syncBotDescriptor,
  syncBotDescriptorAsync,
} from '../../bots/bot-descriptor-sync.js';
import { DEFAULT_MODEL_PRESET_ID, defaultPresetPlan } from '../../models/presets.js';
import type { ChannelLiveHub } from '../../channels/live.js';
import type { ChannelDraftEvent } from '../../channels/draft.js';
import type { OperationalDatabaseOwner } from '../../database/owner.js';
import { ensureMemoryRepository } from '../../memory/repository.js';
import { initializeMemoryRepositoryAsync } from '../../memory/git.js';
import { cloneMemoryRepository } from '../../memory/clone.js';
import { migrateLegacySouls } from '../../memory/soul.js';
import {
  createBotRuntime,
  DEFAULT_ASSIGNMENT_CONCURRENCY_LIMIT,
  type BotAgentAdapter,
  type BotRuntime,
} from '../../runtime/bot-runtime.js';
import {
  admitBotSession,
  borrowedAgentDenial,
  engineWorkspaceMode,
} from '../../workspaces/grant-execution.js';
import {
  createDshBotAgentAdapter,
  type DshAgentPresetHost,
} from '../../runtime/dsh-bot-agent-adapter.js';
import * as models from '../models/plugin.js';
import * as promptPresets from '../prompts/plugin.js';
import { createRosterStore } from '../../roster/store.js';
import { createBotCreation } from '../../bots/creation.js';
import { createBotImports } from '../../bots/imports.js';
import { createBotZipImport } from '../../bots/zip-import.js';
import { createBotZipUploads } from '../../bots/zip-upload.js';
import { createClientAcknowledgements } from '../../onboarding/acknowledgements.js';
import { createBotOnboarding } from '../../onboarding/service.js';
import { join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import type { createCoreStartup } from '../../diagnostics/core-startup.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import { createPersonaBotDeletions } from '../../bots/deletion.js';
import { attachOperationalModule } from '../../database/owner.js';
import type { BotHarnessCore, createCore } from '../../plugin.js';
import type { BotAgentSetup } from '../../plugin-types.js';
import type { BotHarnessConfig } from '../../plugin.js';
import type * as appearanceFeature from '../appearance/plugin.js';
import type { createGrants } from '../workspaces/plugin.js';

type CoreOptions = NonNullable<Parameters<typeof createCore>[0]>;

export function apply({
  operationalDatabase,
  registry,
  channels,
  options,
}: {
  operationalDatabase: BotHarnessCore['operationalDatabase'];
  registry: BotHarnessCore['registry'];
  channels: BotHarnessCore['channels'];
  options: Pick<CoreOptions, 'warn'>;
}) {
  const creations = createBotCreation({
    database: attachOperationalModule(operationalDatabase, 'bot-creation'),
    registry,
    channels,
    ...(options.warn === undefined ? {} : { log: options.warn }),
  });
  return creations;
}

export function createZipImports({
  dshHome,
  registry,
  creations,
  options,
}: {
  dshHome: string;
  registry: BotHarnessCore['registry'];
  creations: BotHarnessCore['creations'];
  options: Pick<CoreOptions, 'warn'>;
}) {
  const zipImports = createBotZipImport({
    uploads: createBotZipUploads({
      rootDir: join(dshHome, 'botharness', 'zip-uploads'),
    }),
    imports: createBotImports(creations),
    registry,
    log: (event) => options.warn?.(JSON.stringify(event)),
  });
  return zipImports;
}

export function createDeletions({
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
  live,
  contentPurge,
}: {
  channels: BotHarnessCore['channels'];
  operationalDatabase: BotHarnessCore['operationalDatabase'];
  registry: BotHarnessCore['registry'];
  ownership: BotHarnessCore['ownership'];
  grants: BotHarnessCore['grants'];
  toolRules: BotHarnessCore['toolRules'];
  externalMessaging: BotHarnessCore['externalMessaging'];
  runtime: BotHarnessCore['runtime'];
  spaces: BotHarnessCore['spaces'];
  contentPurge: BotHarnessCore['contentPurge'];
  dshHome: string;
  live: () => BotHarnessCore['live'] | undefined;
  options: Pick<CoreOptions, 'capture' | 'workspaces' | 'erasePrivateAccounts' | 'warn'>;
}) {
  const deletions = createPersonaBotDeletions({
    accept: (slug, commit) => channels.removeBotFromGroups(slug, commit),
    ...(options.capture === undefined ? {} : { capture: options.capture }),
    protectedPaths: [dshHome],
    database: operationalDatabase,
    registry,
    dependencies: (slug) => ({
      sessions: ownership
        .rootsFor(slug)
        .flatMap((root) => [
          root.sessionId,
          ...ownership.descendantsOf(root.sessionId).map((child) => child.sessionId),
        ])
        .sort(),
      workspaces: grants
        .list(slug)
        .filter((grant) => grant.revokedAt === undefined)
        .map((grant) => grant.workspacePath)
        .sort(),
      grants: [
        ...grants
          .list(slug)
          .filter((grant) => grant.revokedAt === undefined)
          .map((grant) => grant.id),
        ...toolRules.list(slug).map((rule) => rule.id),
        ...externalMessaging.deletionDependencies(slug).grants,
      ].sort(),
      identities: externalMessaging.deletionDependencies(slug).identities,
      channels: channels
        .list()
        .filter((channel) => channel.members.includes(slug) || channel.botSlug === slug)
        .map((channel) => channel.id)
        .sort(),
    }),
    allWorkspacePaths: () => [
      ...(options.workspaces?.()?.list() ?? []).map((workspace) => workspace.path),
      ...registry
        .listHistorical()
        .flatMap((bot) => [
          ...bot.workspaces,
          ...grants.list(bot.slug).map((grant) => grant.workspacePath),
          ...ownership
            .rootsFor(bot.slug, 'assignment')
            .flatMap((root) => (root.cwdReference === undefined ? [] : [root.cwdReference])),
        ]),
    ],
    stop: async (slug) => {
      channels.removeBotFromGroups(slug);
      channels.cancelInvitationsForBot(slug);
      for (const grant of grants.list(slug))
        if (grant.revokedAt === undefined) grants.revoke(slug, grant.id);
      for (const rule of toolRules.list(slug)) toolRules.revoke(slug, rule.id);
      await runtime?.stopBot?.(slug);
      await externalMessaging.disableBot(slug);
      await options.erasePrivateAccounts?.(slug);
    },
    changed: (slug) => {
      spaces.botMemory.cleanupErased(slug);
      live()?.publishRosterCommitted();
    },
    log: (event) => options.warn?.(JSON.stringify(event)),
  });
  contentPurge.bindMemberBots(deletions);
  return deletions;
}

export function createOnboarding(
  operationalDatabase: BotHarnessCore['operationalDatabase'],
  tob: BotHarnessCore['tob'],
  registry: PersonaBotRegistry,
  channels: BotHarnessCore['channels'],
  startup: ReturnType<typeof createCoreStartup>,
) {
  const onboarding = createBotOnboarding({
    database: attachOperationalModule(operationalDatabase, 'bot-onboarding'),
    tob,
    registry,
    channels,
  });
  startup.enter('client-acknowledgements', 'initialize');
  const acknowledgements = createClientAcknowledgements({
    database: attachOperationalModule(operationalDatabase, 'bot-onboarding'),
  });
  return { onboarding, acknowledgements };
}

export function mountRosterCleanup(ctx: Context, core: Pick<BotHarnessCore, 'roster'>) {
  ctx.effect(() => () => core.roster.detach(), 'botharness: roster');
}

export function createRoster(
  operationalDatabase: BotHarnessCore['operationalDatabase'],
  warn: CoreOptions['warn'],
  live: () => BotHarnessCore['live'] | undefined,
) {
  return createRosterStore({
    database: operationalDatabase,
    warn,
    onCommitted: () => live()?.publishRosterCommitted(),
  });
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

export function createRegistry(
  deps: Pick<BotHarnessCore, 'rootDir' | 'operationalDatabase' | 'spaces' | 'team'> & {
    dshHome: string;
    options: CoreOptions;
    readonly grants: Pick<ReturnType<typeof createGrants>, 'initializeAccount'>;
    onAppearanceImported: NonNullable<
      Parameters<typeof createPersonaBotRegistry>[0]['onAppearanceImported']
    >;
    readonly live: ChannelLiveHub | undefined;
  },
) {
  const { rootDir, dshHome, operationalDatabase, options, onAppearanceImported } = deps;
  return createPersonaBotRegistry({
    rootDir,
    defaultMemoryPath: (slug, humanId) =>
      defaultSpaceMemoryPath(
        attachOperationalModule(operationalDatabase, 'workspace-spaces'),
        realpathSync(dshHome),
        humanId,
        slug,
      ),
    validateMemoryPath: (slug, humanId, path) => deps.spaces.assertMemoryPath(humanId, slug, path),
    creationTopics: ['workspace-grants'],
    onCreated: (bot, connection) => {
      const humanId = bot.ownerHumanId ?? deps.team.ownerContext().humanId;
      if (!deps.team.isOwner(humanContext(humanId)))
        deps.grants.initializeAccount(bot.slug, 'spaces/' + humanId, connection);
    },
    database: operationalDatabase,
    onImport: (event) =>
      options.warn?.(
        `bot-registry-import initiator=host-startup phase=${event.phase} count=${event.count ?? 0} durationMs=${Math.round(event.durationMs)}`,
      ),
    onAppearanceImported,
    onDisplayNameChanged: () => {
      try {
        deps.live?.publishRosterCommitted();
      } catch {
        options.warn?.('bot-name-publication-failed');
      }
    },
    onAvatarChanged: () => deps.live?.publishRosterCommitted(),
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
}

export function backfillRegistry(
  startup: ReturnType<typeof createCoreStartup>,
  operationalDatabase: OperationalDatabaseOwner,
  registry: PersonaBotRegistry,
  options: CoreOptions,
) {
  if (operationalDatabase.mode === 'ready') {
    startup.enter('bot-registry', 'backfill-banners');
    backfillBotBanners(registry, options.warn);
    startup.enter('bot-registry', 'backfill-descriptors');
    backfillBotDescriptors(registry, options.warn);
    startup.enter('bot-registry', 'migrate-souls');
    migrateLegacySouls(registry, options.warn);
  }
}

export function createAgentContributions() {
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
  return {
    hostTools,
    contributeBotAgentSetup,
    contributeEngineTools,
    engineTools,
    runBotAgentSetups,
  };
}

export function createRuntime(
  deps: Pick<
    BotHarnessCore,
    | 'modelPresets'
    | 'team'
    | 'voiceMessages'
    | 'voiceZoom'
    | 'prompts'
    | 'tob'
    | 'inboxHistory'
    | 'messagePerf'
    | 'registry'
    | 'profileRecovery'
    | 'schedules'
    | 'states'
    | 'operationalDatabase'
    | 'externalMessaging'
    | 'sourcePolicy'
    | 'channels'
    | 'attachments'
    | 'memory'
    | 'ownership'
    | 'grants'
    | 'assignmentAccess'
  > & {
    options: CoreOptions;
    dshHome: string;
    assignmentLimits: { read: () => number }[];
    botHopLimit: () => number;
    orchestratorCwd: (bot: { slug: string }) => string | undefined;
    readonly runtime: BotRuntime | undefined;
  },
) {
  const {
    options,
    modelPresets,
    team,
    voiceMessages,
    voiceZoom,
    prompts,
    tob,
    inboxHistory,
    messagePerf,
    registry,
    profileRecovery,
    schedules,
    assignmentLimits,
    botHopLimit,
    states,
    operationalDatabase,
    externalMessaging,
    sourcePolicy,
    channels,
    attachments,
    memory,
    ownership,
    grants,
    assignmentAccess,
    dshHome,
    orchestratorCwd,
  } = deps;
  return createBotRuntime({
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
      promptPresets.promptText(prompts, slug, deps.runtime?.currentOrchestratorSessionId?.(slug)),
    promptLimits: (slug) => prompts.limits(slug),
    tob,
    triageContinuation: options.triageContinuation === true,
    inboxHistory,
    messagePerf,
    requireModelRoute: (slug, route) => requireBotModel(team, registry.get(slug), route),
    requireAssignmentEngine: (slug, target) => {
      requireBotEngineAccount(
        team,
        registry.get(slug),
        engineAccountKey(target.engine, target.accountId),
      );
      options.requireAssignmentEngine?.(slug, target);
    },
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
}

export function createHostAgentAdapter(
  ctx: Context,
  config: BotHarnessConfig,
  deps: tobFeature.TobShellDependencies &
    Pick<
      ReturnType<typeof models.createCatalog>,
      | 'defaultModel'
      | 'providerCredentials'
      | 'routingDefaults'
      | 'openAssignmentRoutes'
      | 'modelReadiness'
    > &
    Pick<
      ReturnType<typeof models.createFallback>,
      'groupFallback' | 'routeRests' | 'allowedGroupTargets'
    > & {
      engineHost: ReturnType<typeof models.mountEngines>['engineHost'];
      engineToolGate: ReturnType<typeof createEngineToolGate>;
      diagnosticEvents: DiagnosticEvents;
      turnRefusals: Map<string, string | TeamError>;
      botModes: ReturnType<typeof appearanceFeature.createBotModes>;
      publishDraft(event: ChannelDraftEvent): void;
    },
): ReturnType<typeof createDshBotAgentAdapter> {
  const {
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
  } = deps;
  return createDshBotAgentAdapter({
    engines: engineHost,
    engineWorkspaceMode: (slug, permission) => engineWorkspaceMode(deps.core, slug, permission),
    engineTools: (info) => deps.core.engineTools(info),
    engineToolGate,
    enginePersona: (bot) =>
      readEnginePersona(deps.core.registry.memoryDirFor(bot.slug), bot.standingLimits),
    tobCliInvocation,
    ...(config.genuiPreviewBrowserPath === undefined
      ? {}
      : { genuiPreviewBrowserPath: config.genuiPreviewBrowserPath }),
    onGenuiDiagnostic: (event) => recordGenuiPreviewDiagnostic(diagnosticEvents, event),
    genuiAttachmentContext: ctx,
    agents: ctx.agents,
    releaseNativeAgent: (agent) => ctx.get('agentLoop')?.releaseIdleAgent?.(agent),
    promptText: (sessionId) => deps.core.prompts.textForSession(sessionId),
    defaultModel,
    observeTurnFailure: (provider, code) => providerCredentials.observe(provider, code),
    observeDirectToolCleanupFailure: ({ sessionId, durationMs }) =>
      ctx.logger.warn(
        `direct-tool-cleanup phase=dispose outcome=failed session=${sessionId} durationMs=${durationMs}`,
      ),
    turnRefusal: (sessionId) => turnRefusals.get(sessionId),
    ...models.agentRouting(ctx, () => config.subagent, {
      core: () => deps.core,
      routingDefaults,
      groupFallback: () => deps.groupFallback,
      routeRests: () => deps.routeRests,
      allowedGroupTargets: (slug, id) => deps.allowedGroupTargets(slug, id),
      engineHost,
      openAssignmentRoutes,
    }),
    hasSession: async (sessionId) => {
      const persistence = ctx.get('sessionPersistence') as unknown as
        | { stat(id: string): Promise<unknown> }
        | undefined;
      if (persistence === undefined) throw new Error('DSH Session Persistence is unavailable');
      return (await persistence.stat(sessionId)) !== undefined;
    },
    prepareModelRoute: (slug, role, retainedRoute) => {
      deps.core.profileRecovery.requireExecution(slug);
      return modelReadiness.prepare(slug, role, retainedRoute);
    },
    orchestratorCwd: (bot) => deps.core.registry.memoryDirFor(bot.slug),
    observePreparation: (slug, sessionId, preparing) => {
      if (!preparing && deps.core.states.snapshot(slug).sessions[sessionId] !== 'thinking') return;
      deps.core.states.setSessionState(
        slug,
        sessionId,
        preparing ? 'thinking' : 'done',
        undefined,
        'orchestrator',
      );
    },
    defaultAgentPreset: botModes.globalBotMode,
    botModeOf: botModes.botModeOf,
    recordSessionMode: (sessionId, mode) => {
      try {
        deps.core.ownership.recordAgentPreset(sessionId, mode);
      } catch (error) {
        ctx.logger.warn(`Could not record the mode of Session ${sessionId}: ${String(error)}`);
      }
    },
    ensureBotModes: botModes.ensureBotModes,
    assignmentModes: botModes.assignmentModes,
    resolveAgentPresets: () => ctx.get('agentPresets') as DshAgentPresetHost | undefined,
    publishDraft: (event) => deps.publishDraft(event),
    onAgentSetup: (agentCtx, agent, info) => deps.core.runBotAgentSetups(agentCtx, agent, info),
    onOrchestratorFileSetup: tobFeature.createOrchestratorFileSetup(ctx, deps),
    authorizeBorrow: (agent, role) => {
      const denial = borrowedAgentDenial(deps.core, agent.session, role);
      if (denial !== undefined) throw new Error(denial);
    },
    admitSession: (agent) =>
      void admitBotSession(
        deps.core,
        agent.session,
        undefined,
        ctx.get('sandboxPolicy'),
        ctx.get('approval'),
      ),
  });
}
