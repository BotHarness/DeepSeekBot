import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Session, SessionSeq } from '@deepseek-ai/dsh-session';
import { toolPairingBalancedBefore } from '@deepseek-ai/dsh-compaction';
import type { LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm';
import { compactionThresholdTokens, type CompactionThresholdPolicy } from './idle-compaction.js';

export const UNKNOWN_CONTEXT_WINDOW = 200_000;

export interface BotContextWindow {
  sessionId: string | null;
  usedTokens: number | null;
  contextWindow: number;
  capacitySource: 'model' | 'estimate';
  thresholdTokens: number;
}

export function contextCapacity(
  value: number | undefined,
): Pick<BotContextWindow, 'contextWindow' | 'capacitySource'> {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? { contextWindow: value, capacitySource: 'model' }
    : { contextWindow: UNKNOWN_CONTEXT_WINDOW, capacitySource: 'estimate' };
}

export function fallbackCompactionRange(session: Session) {
  const nodes = session.surface.nodes;
  const first = nodes[0];
  if (first === undefined) return undefined;
  const startIndex = session.eventAt(first)?.type === 'system/message' ? 1 : 0;
  const start = nodes[startIndex];
  if (start === undefined) return undefined;
  for (let retained = nodes.length - 1; retained > startIndex; retained--) {
    const boundary = nodes[retained];
    const end = nodes[retained - 1];
    if (boundary !== undefined && end !== undefined && toolPairingBalancedBefore(session, boundary))
      return { start, end };
  }
  return undefined;
}

export interface ContextRoute {
  provider: string;
  model: string;
}

export async function compactUnknownContext(
  agent: Agent,
  signal: AbortSignal,
  policy: CompactionThresholdPolicy = {},
  selection?: ContextRoute,
): Promise<void> {
  const header = agent.session.requestHeader()?.config;
  const route = selection ?? header;
  if (!route) return;
  let info: LlmResolvedModelInfo;
  try {
    info = await agent.ctx.llm.resolveModelInfo(route.provider, route.model, signal);
  } catch (error) {
    if (signal.aborted) throw error;
    agent.ctx.logger.info(
      `context-compaction ${JSON.stringify({ event: 'skipped', reason: 'route-unavailable', sessionId: agent.session.id, route: `${route.provider}/${route.model}` })}`,
    );
    return;
  }
  if (contextCapacity(info.context?.contextWindow).capacitySource === 'model') return;
  const meter = agent.ctx.get('tokenMeter');
  const compaction = agent.ctx.get('compaction');
  if (!meter || !compaction) throw new Error('Context protection is unavailable');
  const threshold = compactionThresholdTokens(
    policy,
    route,
    UNKNOWN_CONTEXT_WINDOW,
    header?.maxTokens ?? info.defaultMaxTokens ?? 0,
  );
  if (threshold <= 0) throw new Error('Output reservation exceeds the estimated context capacity');
  for (let attempt = 0; meter.measure(agent.session).totalTokens >= threshold; attempt++) {
    const range = fallbackCompactionRange(agent.session);
    if (!range || attempt >= 2)
      throw new Error('CONTEXT_WINDOW_EXCEEDED: Estimated context remains full after compaction');
    agent.ctx.logger.info(
      `context-compaction ${JSON.stringify({ event: 'fallback-start', sessionId: agent.session.id, capacity: UNKNOWN_CONTEXT_WINDOW, threshold, attempt })}`,
    );
    await compaction.compactRegion(range.start, range.end, agent, signal);
  }
}

export const COMPACTION_TARGET_RATIO = 0.5;
export const SUMMARY_RESERVE_TOKENS = 8_192;

export interface PricedSurface {
  totalTokens: number;
  nodes: ReadonlyArray<{ seq: SessionSeq; tokens: number }>;
}

export type TargetCompactionPlan =
  | {
      kind: 'compact';
      start: SessionSeq;
      end: SessionSeq;
      nodeCount: number;
      rangeTokens: number;
      projectedTokens: number;
      targetTokens: number;
    }
  | {
      kind: 'skip';
      reason: 'nothing-to-compact' | 'cannot-reach-threshold';
      projectedTokens?: number;
    };

export function planTargetCompaction(
  session: Session,
  measurement: PricedSurface,
  thresholdTokens: number,
): TargetCompactionPlan {
  const nodes = measurement.nodes;
  const first = nodes[0];
  if (first === undefined) return { kind: 'skip', reason: 'nothing-to-compact' };
  const firstIdx = session.eventAt(first.seq)?.type === 'system/message' ? 1 : 0;
  const surfaceTokens = nodes.reduce((total, node) => total + node.tokens, 0);
  const overhead = Math.max(0, measurement.totalTokens - surfaceTokens);
  const targetTokens = Math.floor(
    overhead + Math.max(0, thresholdTokens - overhead) * COMPACTION_TARGET_RATIO,
  );
  const tailBudget = targetTokens - overhead - SUMMARY_RESERVE_TOKENS;
  let keepFrom: number | undefined;
  let tail = 0;
  for (let index = nodes.length - 1; index > firstIdx; index--) {
    tail += nodes[index]!.tokens;
    if (!toolPairingBalancedBefore(session, nodes[index]!.seq)) continue;
    if (keepFrom !== undefined && tail > tailBudget) break;
    keepFrom = index;
  }
  if (keepFrom === undefined) return { kind: 'skip', reason: 'nothing-to-compact' };
  const span = nodes.slice(firstIdx, keepFrom);
  const rangeTokens = span.reduce((total, node) => total + node.tokens, 0);
  const projectedTokens = measurement.totalTokens - rangeTokens + SUMMARY_RESERVE_TOKENS;
  if (projectedTokens >= thresholdTokens)
    return { kind: 'skip', reason: 'cannot-reach-threshold', projectedTokens };
  return {
    kind: 'compact',
    start: span[0]!.seq,
    end: span.at(-1)!.seq,
    nodeCount: span.length,
    rangeTokens,
    projectedTokens,
    targetTokens,
  };
}

export interface TargetCompactionDeps<R> {
  measure(session: Session): PricedSurface;
  prune?(session: Session): void;
  compactRegion(start: SessionSeq, end: SessionSeq, agent: Agent, signal: AbortSignal): Promise<R>;
  log(level: 'info' | 'warn', event: Record<string, unknown>): void;
}

export function createTargetCompaction<R>(deps: TargetCompactionDeps<R>) {
  const stalled = new WeakMap<Session, 'plan' | 'pass'>();
  return async (agent: Agent, thresholdTokens: number, signal: AbortSignal): Promise<R | null> => {
    const session = agent.session;
    let measurement = deps.measure(session);
    if (measurement.totalTokens < thresholdTokens) {
      stalled.delete(session);
      return null;
    }
    if (deps.prune !== undefined) {
      deps.prune(session);
      measurement = deps.measure(session);
      if (measurement.totalTokens < thresholdTokens) {
        stalled.delete(session);
        return null;
      }
    }
    if (stalled.get(session) === 'pass') return null;
    const base = { sessionId: session.id, totalTokens: measurement.totalTokens, thresholdTokens };
    const plan = planTargetCompaction(session, measurement, thresholdTokens);
    if (plan.kind === 'skip') {
      if (!stalled.has(session))
        deps.log('warn', {
          event: 'stalled',
          reason: plan.reason,
          ...base,
          projectedTokens: plan.projectedTokens,
        });
      stalled.set(session, 'plan');
      return null;
    }
    deps.log('info', {
      event: 'target-start',
      ...base,
      targetTokens: plan.targetTokens,
      nodeCount: plan.nodeCount,
      rangeTokens: plan.rangeTokens,
    });
    const result = await deps.compactRegion(plan.start, plan.end, agent, signal);
    const after = deps.measure(session).totalTokens;
    if (after >= thresholdTokens) {
      stalled.set(session, 'pass');
      deps.log('warn', {
        event: 'stalled',
        reason: 'above-threshold-after-pass',
        ...base,
        afterTokens: after,
      });
    } else {
      stalled.delete(session);
      deps.log('info', { event: 'target-end', ...base, afterTokens: after });
    }
    return result;
  };
}
