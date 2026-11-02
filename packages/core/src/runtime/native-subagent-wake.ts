import type { Context } from '@deepseek-ai/cordis';
import type { BotRuntime } from './bot-runtime.js';

export function installNativeSubagentWake(ctx: Context, runtime: BotRuntime): void {
  const claimed = new Map<string, Array<string | undefined>>();
  ctx.effect(() => () => claimed.clear(), 'botharness: native Subagent wake claims');
  ctx.on(
    'agent/inbox/claimed',
    ({ agent, message }) => {
      const { source } = message;
      const sender =
        (source?.kind === 'agent-message' || source?.kind === 'subagent-settled') &&
        'senderSessionId' in source &&
        typeof source.senderSessionId === 'string'
          ? source.senderSessionId
          : undefined;
      const senders = claimed.get(agent.session.id) ?? [];
      senders.push(sender);
      claimed.set(agent.session.id, senders);
    },
    { global: true },
  );
  ctx.on(
    'agent/disposed',
    ({ agent }) => {
      claimed.delete(agent.session.id);
    },
    { global: true },
  );
  ctx.on(
    'agent/status',
    ({ agent, status }) => {
      if (status === 'idle') claimed.delete(agent.session.id);
    },
    { global: true },
  );
  ctx.on(
    'system-prompt/assemble',
    async (_assembly, context, next) => {
      const { agent, signal } = context;
      if (agent === undefined || signal === undefined) return next();
      const senders = claimed.get(agent.session.id);
      if (senders === undefined) return next();
      claimed.delete(agent.session.id);
      const accepted = await runtime.prepareNativeOrchestratorStep?.(
        agent.session.id,
        senders.every((id): id is string => id !== undefined) ? senders : [],
        signal,
      );
      if (accepted === false) throw new Error('Native Orchestrator input is unavailable');
      return next();
    },
    { global: true, prepend: true },
  );
}
