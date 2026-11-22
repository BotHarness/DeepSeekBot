import { requireModelSources } from '../../models/provider-bridge.js';
import { createEngineToolGate, type EngineDeviceTools } from '../../engines/engine-tool-gate.js';
import { ENGINES_PATH, engineRouteFetch } from '../../engines/engine-route.js';
import { createEngineSelectionBridge } from '../../engines/engine-selection-bridge.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';
import {
  requiresHumanToolApproval,
  sessionHasFullAccess,
} from '../../workspaces/grant-execution.js';
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import type { BotHarnessConfig, BotHarnessCore, createCore } from '../../plugin.js';
import { attachOperationalModule } from '../../database/owner.js';
import type { createCoreStartup } from '../../diagnostics/core-startup.js';
import type { ChannelToolApproval } from '../../workspaces/tool-approval.js';
import type {
  DshDefaultModelHost,
  createDshBotAgentAdapter,
} from '../../runtime/dsh-bot-agent-adapter.js';
import { recordTurnTarget } from '../../runtime/turn-targets.js';
import { engineAccountKey, type EngineId } from '@botharness/host-protocol/subscription-engine';
import { createRouteRests } from '../../models/route-rest.js';
import {
  botModelGrants,
  botModelFilter,
  requireBotEngineAccount,
  requireBotModel,
} from '../../team/models.js';
import { TeamError } from '../../team/error.js';
import { allowsEngineAccount, allowsModel } from '../../team/permissions.js';
import { createEngineGateway } from '../../engines/engine-gateway.js';
import { EngineHost } from '../../engines/engine-host.js';
import type {
  EngineSessionPersistence,
  EngineSessionStore,
} from '../../engines/engine-dsh-session.js';
import { subscriptionEnginesAllowed } from '../../engines/engine-plugin.js';
import { createFallbackOverrideStore } from '../../models/fallback-overrides.js';
import { createRoutingGroupStore } from '../../models/routing-groups.js';
import {
  assignmentGroupOptionOf,
  createModelPresetStore,
  DEFAULT_MODEL_PRESET_ID,
  defaultPresetPlan,
  defaultPresetRoute,
  resolveBotModelPlan,
} from '../../models/presets.js';
import { createModelFavoriteStore } from '../../models/favorites.js';
import { createOpenAssignmentRoutes } from '../../models/open-assignments.js';
import { groupMemberRoute } from '../../models/catalog.js';
import { createModelRouteReadiness } from '../../models/readiness.js';
import { createGroupFallback } from '../../models/group-fallback.js';
import { createHostModelCatalog, createHostModelProviders } from '../../models/host-models.js';
import { hostSessionPersistence, hostSessionStore } from '../../runtime/native-agent-compat.js';
import { createBotRequestRetry } from '../../runtime/bot-request-retry.js';
import {
  createBotSubagentModelTools,
  installBotSubagentModelTools,
  installOrchestratorSubagentGuard,
} from '../../runtime/subagent-model-tools.js';
import type { HostFetchConnection } from '../../plugin-types.js';

export function createStores(
  startup: ReturnType<typeof createCoreStartup>,
  operationalDatabase: BotHarnessCore['operationalDatabase'],
  dshHome: string,
  registry: () => BotHarnessCore['registry'],
  options: Pick<NonNullable<Parameters<typeof createCore>[0]>, 'warn' | 'legacyDefaultModel'>,
) {
  startup.enter('model-favorites', 'initialize');
  const modelFavorites = createModelFavoriteStore({ database: operationalDatabase });
  startup.enter('model-presets', 'initialize');
  const modelPresets = createModelPresetStore({
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
  const fallbackOverrides = createFallbackOverrideStore({ database: operationalDatabase });
  const routingGroups = createRoutingGroupStore({
    database: operationalDatabase,
    references: (groupId) => {
      const uses = (source: { orchestratorGroupId?: string; assignmentGroups?: string[] }) =>
        source.orchestratorGroupId === groupId || (source.assignmentGroups ?? []).includes(groupId);
      return [
        ...registry()
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
  return { modelFavorites, modelPresets, fallbackOverrides, routingGroups };
}

export function createCatalog(ctx: Context, core: () => BotHarnessCore) {
  const defaultPreset = () => core().modelPresets.get(DEFAULT_MODEL_PRESET_ID);
  const inheritedPlan = () => {
    const preset = defaultPreset();
    return preset === undefined ? undefined : defaultPresetPlan(preset);
  };
  const effectivePlan = (slug: string) => {
    const bot = core().registry.get(slug);
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
    signalProviderChange: () => core().live.publishResourceChanged('model-providers'),
  });
  const modelReadiness = createModelRouteReadiness(
    {
      get: (slug) => core().registry.get(slug),
      migrateLegacyModel: (slug, expectedModel, route) =>
        core().registry.migrateLegacyModel(slug, expectedModel, route),
    },
    modelCatalog,
    (slug, route) => requireBotModel(core().team, core().registry.get(slug), route),
    () => defaultPreset()?.assignmentDefault,
  );
  const openAssignmentRoutes = createOpenAssignmentRoutes({
    catalog: modelCatalog,
    plan: effectivePlan,
    requireAllowed: (slug, route) => requireBotModel(core().team, core().registry.get(slug), route),
  });
  return {
    defaultModel,
    routingDefaults: { defaultPreset, effectivePlan },
    modelCatalog,
    providerCredentials,
    modelReadiness,
    openAssignmentRoutes,
  };
}

type RoutingDefaults = ReturnType<typeof createCatalog>['routingDefaults'];

export function mountEngines(
  ctx: Context,
  config: BotHarnessConfig,
  dshHome: string,
  core: () => BotHarnessCore,
  toolApproval: () => ChannelToolApproval | undefined,
  { defaultPreset, effectivePlan }: RoutingDefaults,
) {
  const engineGateway = createEngineGateway();
  const localEngines = subscriptionEnginesAllowed(config, process.env);
  const engineHost = new EngineHost({
    root: join(dshHome, 'botharness', 'engines'),
    local: localEngines,
    requireAccountGrant: (slug, id) =>
      requireBotEngineAccount(core().team, core().registry.get(slug), id),
    gateway: engineGateway,
    accountsChanged: () => core().live.publishResourceChanged('model-providers'),
    observeDeviceLogin: (event) => {
      ctx.logger.info('codex-device-login %j', event);
      if (event.phase !== 'starting') core().live.publishResourceChanged('engine-device-login');
    },
    accountUses: (id) => {
      const uses = (choice: { engine: EngineId; accountId?: string } | undefined) =>
        choice !== undefined && engineAccountKey(choice.engine, choice.accountId) === id;
      const { modelPresets, registry, routingGroups, runtime } = core();
      return [
        ...modelPresets
          .list()
          .filter(
            (preset) =>
              uses(preset.orchestratorEngine) ||
              uses(preset.assignmentEngine) ||
              preset.sub?.choices.some((choice) => choice.kind === 'engine' && uses(choice)),
          )
          .map((preset) => `Model Preset ${preset.name} (${preset.id})`),
        ...registry
          .list()
          .filter((bot) =>
            bot.modelPlan?.sub?.choices.some((choice) => choice.kind === 'engine' && uses(choice)),
          )
          .map((bot) => `Bot ${bot.displayName} (${bot.slug})`),
        ...routingGroups
          .list()
          .filter((group) =>
            group.members.some((member) => member.kind === 'engine' && uses(member)),
          )
          .map((group) => `Routing Group ${group.name} (${group.id})`),
        ...(runtime.assignmentEngineAccountUses?.(id) ?? []).map(
          (sessionId) => `Assignment Session ${sessionId}`,
        ),
      ];
    },
    routingGroupEffort: (slug) => effectivePlan(slug)?.orchestratorGroupEffort,
    inheritedChoice: (slug, role) => {
      const bot = core().registry.get(slug);
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
      const owner = core().ownership.resolve(sessionId);
      if (owner === undefined) return;
      recordTurnTarget(
        attachOperationalModule(core().operationalDatabase, 'bot-runtime'),
        sessionId,
        {
          turn,
          step: 0,
          request: String(turn),
          target,
        },
      );
    },
    changed: () => core().live.publishRosterCommitted(),
    sessionIdsForBot: (slug) =>
      core()
        .ownership.rootsFor(slug, 'orchestrator')
        .map((session) => session.sessionId),
    sessions: () => hostSessionStore<EngineSessionStore>(ctx),
    persistence: () => hostSessionPersistence<EngineSessionPersistence>(ctx),
    approve: async (request) =>
      (await toolApproval()?.askEngine({
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
        core().states.setSessionState(slug, sessionId, 'thinking', undefined, role);
      else if (core().states.snapshot(slug).sessions[sessionId] === 'thinking')
        core().states.setSessionState(slug, sessionId, 'done', undefined, role);
    },
  });
  ctx.effect(
    () => async () => {
      await engineHost.close();
      await engineGateway.close();
    },
    'botharness: Subscription Engine Sessions',
  );
  return { engineHost, localEngines };
}

export function createFallback(
  core: () => BotHarnessCore,
  localEngines: boolean,
  engineHost: EngineHost,
  modelCatalog: ReturnType<typeof createHostModelCatalog>['modelCatalog'],
  { defaultPreset, effectivePlan }: RoutingDefaults,
) {
  const routeRests = createRouteRests();
  function allowedGroupTargets(slug: string, groupId: string) {
    try {
      const targets = core().routingGroups.targets(groupId);
      const bot = core().registry.get(slug);
      if (bot === undefined) return;
      const allowed = botModelGrants(core().team, bot);
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
    routes: (groupId) => core().routingGroups.routes(groupId),
    engines: {
      targets: (groupId) => core().routingGroups.targets(groupId),
      allowed: (slug, target) => {
        if (!localEngines) return false;
        const id = engineAccountKey(target.engine, target.accountId);
        requireBotEngineAccount(core().team, core().registry.get(slug), id);
        return true;
      },
      limit: (engine, accountId) => engineHost.limit(engine, accountId),
    },
    allowsGroup: (slug, id) => allowedGroupTargets(slug, id) !== undefined,
    rests: routeRests,
    requireAllowed: (botSlug, route) =>
      requireBotModel(core().team, core().registry.get(botSlug), route),
    validate: (route) => modelCatalog.validate(route),
    withEffort: async (route, effort) => groupMemberRoute(route, effort, await modelCatalog.list()),
    overrides: {
      get: (sessionId) => core().fallbackOverrides.get(sessionId),
      set: (sessionId, override) => core().fallbackOverrides.set(sessionId, override),
      delete: (sessionId) => core().fallbackOverrides.delete(sessionId),
    },
  });
  return { routeRests, groupFallback, allowedGroupTargets };
}

export function mountProviders(
  ctx: Context,
  core: BotHarnessCore,
  routeRests: ReturnType<typeof createRouteRests>,
  defaultModel: DshDefaultModelHost,
) {
  return createHostModelProviders(ctx, {
    routeRests,
    registry: core.registry,
    routingGroups: core.routingGroups,
    modelPresets: core.modelPresets,
    defaultRoute: () => defaultModel.currentSelection(),
  });
}

export function agentRouting(
  ctx: Context,
  subagent: () => BotHarnessConfig['subagent'],
  {
    core,
    routingDefaults: { defaultPreset, effectivePlan },
    groupFallback,
    routeRests,
    allowedGroupTargets,
    engineHost,
    openAssignmentRoutes,
  }: {
    core: () => BotHarnessCore;
    routingDefaults: RoutingDefaults;
    groupFallback: () => ReturnType<typeof createGroupFallback>;
    routeRests: () => ReturnType<typeof createRouteRests>;
    allowedGroupTargets: ReturnType<typeof createFallback>['allowedGroupTargets'];
    engineHost: EngineHost;
    openAssignmentRoutes: ReturnType<typeof createOpenAssignmentRoutes>;
  },
): Pick<
  Parameters<typeof createDshBotAgentAdapter>[0],
  | 'resolveModelPlan'
  | 'modelFilter'
  | 'assignmentGroups'
  | 'openAssignmentRoutes'
  | 'orchestratorRoute'
  | 'subagentTools'
> {
  return {
    resolveModelPlan: effectivePlan,
    modelFilter: (slug) => botModelFilter(core().team, core().registry.get(slug)),
    assignmentGroups: {
      pick: async (botSlug, groupId, effort) => {
        if (
          core().routingGroups.get(groupId) !== undefined &&
          allowedGroupTargets(botSlug, groupId) === undefined
        )
          throw new TeamError('model-not-allowed');
        const fallback = groupFallback();
        return fallback.isMixed(groupId)
          ? ((await fallback.pickMixedAssignment(botSlug, groupId, effort)) ?? { kind: 'missing' })
          : fallback.pick(botSlug, groupId, effort);
      },
      describe: (groupId, slug) => {
        const group = core().routingGroups.get(groupId);
        const targets = allowedGroupTargets(slug, groupId);
        if (group !== undefined && targets !== undefined)
          return { name: group.name, routes: core().routingGroups.routes(groupId), targets };
      },
      engineRestingUntil: (engine, accountId) => engineHost.limit(engine, accountId)?.until,
      describeEngine: (slug, engine, accountId) =>
        engineHost.describeAssignmentAccount(slug, engine, accountId),
      restingUntil: (route) => routeRests().restingUntil(route),
      inherited: () => defaultPreset()?.orchestratorGroupId,
      inheritedEffort: () => defaultPreset()?.orchestratorGroupEffort,
    },
    openAssignmentRoutes,
    orchestratorRoute: (sessionId) => groupFallback().route(sessionId),
    subagentTools: (slug) =>
      createBotSubagentModelTools(
        ctx,
        () => effectivePlan(slug),
        subagent(),
        async (route) => {
          requireBotModel(core().team, core().registry.get(slug), route);
          await openAssignmentRoutes.require(slug, route);
        },
        () => openAssignmentRoutes.list(slug),
        {
          pick: async (groupId) => {
            const plan = effectivePlan(slug);
            if (!(plan?.assignmentGroups ?? []).includes(groupId))
              throw new Error(`Routing Group ${groupId} is not allowed for Subagents`);
            const picked = await groupFallback().pick(
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
              const group = core().routingGroups.get(groupId);
              if (group === undefined || allowedGroupTargets(slug, groupId) === undefined)
                return [];
              return [
                {
                  group: groupId,
                  name: group.name,
                  members: core()
                    .routingGroups.routes(groupId)
                    .map((route) => {
                      const rest = routeRests().restingUntil(route);
                      return rest === undefined ? route : { ...route, restingUntil: rest.until };
                    }),
                },
              ];
            }),
        },
      ),
  };
}

export function mountRetry(
  ctx: Context,
  core: BotHarnessCore,
  routeRests: ReturnType<typeof createRouteRests>,
) {
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
}

export function installSubagentRouting(
  core: BotHarnessCore,
  agent: ReturnType<Context['agents']['list']>[number],
  subagent: () => BotHarnessConfig['subagent'],
  openAssignmentRoutes: ReturnType<typeof createOpenAssignmentRoutes>,
) {
  const owner = core.ownership.resolve(agent.session.id);
  if (owner?.rootRole === 'orchestrator') installOrchestratorSubagentGuard(agent.ctx);
  else if (owner !== undefined) {
    return installBotSubagentModelTools(
      agent.ctx,
      () => core.registry.get(owner.botSlug)?.modelPlan,
      subagent(),
      async (route) => {
        requireBotModel(core.team, core.registry.get(owner.botSlug), route);
        await openAssignmentRoutes.require(owner.botSlug, route);
      },
      () => openAssignmentRoutes.list(owner.botSlug),
    );
  }
  return undefined;
}

export function createHostEngineToolGate(
  ctx: Context,
  deps: {
    readonly core: BotHarnessCore;
    templateInUse: Parameters<typeof requiresHumanToolApproval>[2];
  },
) {
  return createEngineToolGate({
    owner: (sessionId) => deps.core.ownership.resolve(sessionId)?.botSlug,
    botExists: (slug) => deps.core.registry.get(slug) !== undefined,
    fullAccess: (sessionId) => sessionHasFullAccess(deps.core, sessionId),
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
    approvalRequired: (name, args) => requiresHumanToolApproval(name, args, deps.templateInUse),
  });
}

export function mountSubscriptionEngineRoute(
  connectionCtx: Context,
  connection: HostFetchConnection,
  deps: {
    core: BotHarnessCore;
    team: BotHarnessCore['team'];
    bridgeDeps: BridgeMethodsDeps;
    engineHost: ReturnType<typeof mountEngines>['engineHost'];
    agentAdapter: ReturnType<typeof createDshBotAgentAdapter>;
    readonly toolApproval: ChannelToolApproval | undefined;
  },
) {
  const { core, team, bridgeDeps, engineHost, agentAdapter } = deps;
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
                .flatMap((bot) => deps.toolApproval?.requests(bot.slug) ?? [])
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
}
