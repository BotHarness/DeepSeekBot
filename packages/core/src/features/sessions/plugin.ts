import type * as diagnosticsFeature from '../diagnostics/plugin.js';
import type * as approvalsFeature from '../approvals/plugin.js';
import type * as workspacesFeature from '../workspaces/plugin.js';
import type { SessionLiveStreams } from '../../runtime/session-live.js';
import { TeamError } from '../../team/error.js';
import { requireBotModel } from '../../team/models.js';
import {
  compactUnknownContext,
  contextCapacity,
  createTargetCompaction,
  type PricedSurface,
} from '../../runtime/context-window.js';
import { createContextOverflowRecovery } from '../../runtime/context-overflow-recovery.js';
import { join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SessionSeq } from '@deepseek-ai/dsh-session';
import {
  admitBotSession,
  type BotSessionRepair,
  sessionRefusalMessage,
} from '../../workspaces/grant-execution.js';
import { isApprovalReviewSession } from '../../workspaces/approval-reviewer.js';
import {
  compactionThresholdTokens,
  type CompactionThresholdPolicy,
  createIdleCompaction,
  IdleCompactionError,
  runCompactCommand,
  type CompactCommandRunner,
} from '../../runtime/idle-compaction.js';
import { createIdleCompactionSettings } from '../../runtime/idle-compaction-settings.js';
import type { createDshBotAgentAdapter } from '../../runtime/dsh-bot-agent-adapter.js';
import type { DshSessionStore } from '../../sessions/source.js';
import { readPublicToolDetail } from '../../state/tool-activity.js';
import { restartEmptyToolSeries } from '../../runtime/tool-declaration-series.js';
import type * as activityFeature from '../activity/plugin.js';
import * as models from '../models/plugin.js';
import type { BotHarnessCore } from '../../plugin-types.js';
import type { BotHarnessConfig } from '../../plugin.js';

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

export function describeToolCall(
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

export function createCompactionPolicy(ctx: Context, core: BotHarnessCore, dshHome: string) {
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
  return { idleCompactionSettings, compactionPolicy, applyCompactionPolicy };
}

export function mountPreStep(
  ctx: Context,
  {
    core,
    applyCompactionPolicy,
    compactionPolicy,
    reviewing,
    turnRefusals,
    recordOrchestratorPermission,
    agentAdapter,
  }: {
    core: BotHarnessCore;
    applyCompactionPolicy(): void;
    compactionPolicy(): CompactionThresholdPolicy;
    reviewing: Set<string>;
    turnRefusals: Map<string, string | TeamError>;
    recordOrchestratorPermission: ReturnType<
      typeof workspacesFeature.mountPermissionTracking
    >['recordOrchestratorPermission'];
    agentAdapter: ReturnType<typeof createDshBotAgentAdapter>;
  },
) {
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
}

export function mountContextOverflowRecovery(ctx: Context, core: BotHarnessCore) {
  const contextOverflowRecovery = createContextOverflowRecovery({
    isBotSession: (sessionId) => core.ownership.resolve(sessionId) !== undefined,
    log: (event) =>
      ctx.logger[event['outcome'] === 'declined' ? 'warn' : 'info'](
        `context-overflow-recovery ${JSON.stringify(event)}`,
      ),
  });
  ctx.on('agent/request-error', contextOverflowRecovery, { global: true, prepend: true });
}

export function mountIdleCompaction(
  ctx: Context,
  {
    core,
    idleCompactionSettings,
    compactionPolicy,
  }: {
    core: BotHarnessCore;
    idleCompactionSettings: ReturnType<typeof createIdleCompactionSettings>;
    compactionPolicy(): CompactionThresholdPolicy;
  },
) {
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
  return { liveAgent, idleCompaction, compactReservedSession, compactBot };
}

export function mountLifecycle(
  ctx: Context,
  config: BotHarnessConfig,
  deps: {
    core: BotHarnessCore;
    mountedQuestions: ReturnType<typeof approvalsFeature.mount>['userQuestions'];
    activity: ReturnType<typeof activityFeature.apply>;
    sessionLive: SessionLiveStreams;
    turnLog: ReturnType<typeof diagnosticsFeature.createTurnDiagnostics>;
    botTurnTelemetry: ReturnType<typeof diagnosticsFeature.createTurnTelemetry>;
    idleCompaction: ReturnType<typeof createIdleCompaction>;
    agentAdapter: ReturnType<typeof createDshBotAgentAdapter>;
    dshSessions: DshSessionStore;
    openAssignmentRoutes: ReturnType<typeof models.createCatalog>['openAssignmentRoutes'];
  },
) {
  const {
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
  } = deps;
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
      const routing = models.installSubagentRouting(
        core,
        agent,
        () => config.subagent,
        openAssignmentRoutes,
      );
      if (routing !== undefined) await routing;
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
}
