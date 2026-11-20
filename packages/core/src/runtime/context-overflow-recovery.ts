import type { Agent, RequestErrorAction } from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-agent-preset-registry';
import type { LlmFailure } from '@deepseek-ai/dsh-llm';
import type {} from '@deepseek-ai/dsh-session-persistence';
import { isDeepStrictEqual } from 'node:util';

export interface ContextOverflowRequest {
  agent: Pick<Agent, 'session' | 'ctx' | 'options'>;
  turn: number;
  step: number;
  provider: string;
  failure: LlmFailure;
  signal: AbortSignal;
}

export interface ContextOverflowRecoveryOptions {
  isBotSession(sessionId: string): boolean;
  log(event: Record<string, unknown>): void;
}

const TOKEN_LIMIT =
  /\b(?:input|prompt|request)\s+(?:is\s+)?too\s+(?:long|large):\s*model\s+limit\s+\d+\s+tokens?,\s*requested\s+\d+\s+tokens?\b/i;

export function createContextOverflowRecovery(options: ContextOverflowRecoveryOptions) {
  const attempted = new WeakMap<object, { turn: number; step: number }>();
  return async (
    request: ContextOverflowRequest,
    next: () => Promise<RequestErrorAction>,
  ): Promise<RequestErrorAction> => {
    const { agent, turn, step, failure, signal } = request;
    if (
      failure.code !== 'INVALID_REQUEST' ||
      !TOKEN_LIMIT.test(failure.message) ||
      signal.aborted ||
      !options.isBotSession(agent.session.id)
    )
      return next();
    const delegated = await next();
    if (delegated !== undefined || signal.aborted) return delegated;
    const previous = attempted.get(agent);
    if (previous?.turn === turn && previous.step === step) return undefined;
    const presets = agent.ctx.get('agentPresets');
    const compaction =
      typeof presets?.serviceFor === 'function'
        ? presets.serviceFor(agent, 'compaction')
        : agent.ctx.get('compaction');
    if (compaction === undefined) {
      options.log({
        event: 'skipped',
        outcome: 'declined',
        reason: 'compaction-unavailable',
        sessionId: agent.session.id,
      });
      return undefined;
    }
    attempted.set(agent, { turn, step });
    const generation = agent.session.surface.replaceGeneration;
    const startedAt = Date.now();
    const event = { sessionId: agent.session.id, turn, step, provider: request.provider };
    options.log({ event: 'started', ...event });
    let failed = false;
    try {
      await compaction.compactIfNeeded(agent, 'context-overflow', signal);
    } catch {
      failed = true;
    }
    const progress = agent.session.surface.replaceGeneration > generation;
    let persisted = false;
    let flushFailed = false;
    if (progress && !signal.aborted) {
      try {
        const sessions = agent.ctx.get('sessions');
        const storage = agent.ctx.get('sessionPersistence');
        const replacement = agent.session
          .snapshotEvents()
          .findLast(
            (entry) => typeof entry.surfaceOp === 'object' && entry.surfaceOp.op === 'replace',
          );
        if (
          storage &&
          replacement &&
          sessions &&
          'flush' in sessions &&
          typeof sessions.flush === 'function' &&
          (await sessions.flush(agent.session)) === true
        ) {
          const reader = await storage.open(agent.session.id, 'read', { signal });
          try {
            const stored = await reader.read(replacement.seq, 1, { signal });
            persisted = isDeepStrictEqual(stored.events[0], replacement);
          } finally {
            await reader.close();
          }
        }
      } catch {
        persisted = false;
        flushFailed = true;
      }
    }
    const retry = progress && persisted && !signal.aborted;
    options.log({
      event: 'finished',
      ...event,
      durationMs: Date.now() - startedAt,
      outcome: retry ? 'retry' : 'declined',
      reason: signal.aborted
        ? 'cancelled'
        : progress
          ? flushFailed
            ? 'persistence-failed'
            : persisted
              ? 'context-replaced'
              : 'persistence-unavailable'
          : failed
            ? 'compaction-failed'
            : 'no-progress',
    });
    return retry ? { kind: 'retry' } : undefined;
  };
}
