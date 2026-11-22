import { sessionModelChoices } from '../runtime/session-model-choices.js';
import type * as diagnosticsFeature from '../features/diagnostics/plugin.js';
import type * as profileStorage from '../features/profile-storage/plugin.js';
import type * as releaseFeature from '../features/release/plugin.js';
import type * as approvalsFeature from '../features/approvals/plugin.js';
import type * as workspacesFeature from '../features/workspaces/plugin.js';
import { readSessionTitles } from '../runtime/session-transcript.js';
import type { SessionLiveStreams } from '../runtime/session-live.js';
import { contextSources } from '../runtime/context-sources.js';
import { contextCapacity } from '../runtime/context-window.js';
import { messageText, systemPromptFromLog } from '../runtime/prompt-inspection.js';
import type { VoiceCalls } from '../voice/calls.js';
import { createCallTextHarvest } from '../voice/call-text.js';
import { onboardingNewsAvailable } from '../onboarding/search.js';
import { join } from 'node:path';
import { routingGroupEngineOptions } from '../models/routing-group-engine-options.js';
import type { Context } from '@deepseek-ai/cordis';
import { assembleContextFor } from '@deepseek-ai/dsh-agent';
import { renderContextSections, renderPrompt } from '@deepseek-ai/dsh-system-prompt';
import type { BridgeMethodsDeps } from './methods.js';
import { composerRecoveryIdentity } from './composer-recovery.js';
import { homedir } from 'node:os';
import type { DiagnosticEvents } from '../diagnostics/diagnostic-log.js';
import type { createCoreTakeoverHandoffs } from '../takeover/mount.js';
import type { createGitService } from '../memory/managed-git.js';
import { attachOperationalModule } from '../database/owner.js';
import {
  compactionThresholdTokens,
  type CompactionThresholdPolicy,
  createIdleCompaction,
} from '../runtime/idle-compaction.js';
import type { createIdleCompactionSettings } from '../runtime/idle-compaction-settings.js';
import type { DshSessionEvent } from '../sessions/source.js';
import { toolKindForView } from '../state/tool-activity.js';
import type * as cloud from '../features/cloud/plugin.js';
import type * as models from '../features/models/plugin.js';
import * as marketplace from '../features/marketplace/plugin.js';
import type * as skillsFeature from '../features/skills/plugin.js';
import type { BotHarnessCore } from '../plugin-types.js';
import type * as sessionsFeature from '../features/sessions/plugin.js';
import type * as appearanceFeature from '../features/appearance/plugin.js';
import { describeToolCall } from '../features/sessions/plugin.js';

export function createHostBridgeDependencies(
  ctx: Context,
  deps: {
    core: BotHarnessCore;
    team: BotHarnessCore['team'];
    skills: ReturnType<typeof skillsFeature.apply>;
    release: ReturnType<typeof releaseFeature.apply>['release'];
    diagnosticEvents: DiagnosticEvents;
    liveAgent: ReturnType<typeof sessionsFeature.mountIdleCompaction>['liveAgent'];
    defaultModel: ReturnType<typeof models.createCatalog>['defaultModel'];
    compactionPolicy(): CompactionThresholdPolicy;
    cloudConnections: ReturnType<typeof cloud.apply>['cloudConnections'];
    cloudWork: ReturnType<typeof cloud.apply>['cloudWork'];
    approvalReviewer: ReturnType<typeof approvalsFeature.apply>['approvalReviewer'];
    botModes: ReturnType<typeof appearanceFeature.createBotModes>;
    idleCompactionSettings: ReturnType<typeof createIdleCompactionSettings>;
    idleCompaction: ReturnType<typeof createIdleCompaction>;
    applyCompactionPolicy(): void;
    compactBot: ReturnType<typeof sessionsFeature.mountIdleCompaction>['compactBot'];
    compactReservedSession: ReturnType<
      typeof sessionsFeature.mountIdleCompaction
    >['compactReservedSession'];
    approvalTemplates: ReturnType<typeof approvalsFeature.apply>['approvalTemplates'];
    storage: ReturnType<typeof profileStorage.mountStorage>;
    dataReset: ReturnType<typeof profileStorage.createReset>;
    modelProviders: ReturnType<typeof models.mountProviders>;
    engineHost: ReturnType<typeof models.mountEngines>['engineHost'];
    localEngines: boolean;
    routeRests: ReturnType<typeof models.createFallback>['routeRests'];
    modelCatalog: ReturnType<typeof models.createCatalog>['modelCatalog'];
    modelReadiness: ReturnType<typeof models.createCatalog>['modelReadiness'];
    sessionLive: SessionLiveStreams;
    takeovers: ReturnType<typeof createCoreTakeoverHandoffs>;
    folders: ReturnType<typeof workspacesFeature.mountFolders>;
    mountedToolApproval: ReturnType<typeof approvalsFeature.mount>['toolApproval'];
    mountedQuestions: ReturnType<typeof approvalsFeature.mount>['userQuestions'];
    marketplaceClient: ReturnType<typeof marketplace.apply>['marketplaceClient'];
    marketplaceUploads: ReturnType<typeof marketplace.apply>['marketplaceUploads'];
    shareDrafts: ReturnType<typeof marketplace.apply>['shareDrafts'];
    dshHome: string;
    reviewing: Set<string>;
    telemetryDir: string;
    releaseService: ReturnType<typeof releaseFeature.mountServices>['releaseService'];
    pluginUpdates: ReturnType<typeof releaseFeature.mountServices>['pluginUpdates'];
    updateRuns: ReturnType<typeof releaseFeature.mountInstaller>['updateRuns'];
    telemetry: ReturnType<typeof diagnosticsFeature.mountTelemetry>['telemetry'];
    activeDay: ReturnType<typeof diagnosticsFeature.mountTelemetry>['activeDay'];
    git: ReturnType<typeof createGitService>;
    developerMode: ReturnType<typeof skillsFeature.createDeveloperMode>;
    readonly voiceCalls: VoiceCalls | undefined;
  },
): BridgeMethodsDeps {
  const {
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
  } = deps;
  const { botModeSettings, productBotMode, installedBotModes, botModeOf } = botModes;
  return {
    team,
    skills: skills.catalog,
    hostVersion: () => release.version(),
    callText: createCallTextHarvest({
      calls: () => deps.voiceCalls,
      attachments: core.attachments,
    }),
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
    readSessionTitles: (ids) => readSessionTitles(ctx.get('sessionQuery'), ids),
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
}
