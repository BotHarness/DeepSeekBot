import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Session } from '@deepseek-ai/dsh-session';
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

/**
 * Protects an unknown-capacity context before a step. The step will call the Session's current
 * model selection, so capacity comes from that route; the previous request header is only a
 * fallback. A route that cannot be resolved skips the protection instead of failing the Turn: the
 * Human may already have replaced a removed model, and the request itself reports a real failure.
 */
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
