import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Session } from '@deepseek-ai/dsh-session';
import { toolPairingBalancedBefore } from '@deepseek-ai/dsh-compaction';
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

export async function compactUnknownContext(
  agent: Agent,
  signal: AbortSignal,
  policy: CompactionThresholdPolicy = {},
): Promise<void> {
  const request = agent.session.requestHeader()?.config;
  if (!request) return;
  const info = await agent.ctx.llm.resolveModelInfo(request.provider, request.model, signal);
  if (contextCapacity(info.context?.contextWindow).capacitySource === 'model') return;
  const meter = agent.ctx.get('tokenMeter');
  const compaction = agent.ctx.get('compaction');
  if (!meter || !compaction) throw new Error('Context protection is unavailable');
  const threshold = compactionThresholdTokens(
    policy,
    request,
    UNKNOWN_CONTEXT_WINDOW,
    request.maxTokens ?? info.defaultMaxTokens ?? 0,
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
