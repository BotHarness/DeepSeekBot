import { randomUUID } from 'node:crypto';
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller';
import type { Context } from '@deepseek-ai/cordis';
import type { ModelSelection } from '@deepseek-ai/dsh-agent';
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { sessionRouteChoice } from '../../runtime/session-model-choices.js';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { DshSessionStore } from '../../sessions/source.js';
import type { NativeSessions } from './host-sessions.js';

export function dshHostSessions(ctx: Context, sessions: DshSessionStore): NativeSessions {
  function controller() {
    const service = ctx.get('sessionController');
    if (service === undefined) throw new Error('DSH Session Controller unavailable');
    return service;
  }

  return {
    async list() {
      const { items } = await controller().list({}, new AbortController().signal);
      return items
        .filter((row) => row.origin !== 'subagent')
        .map((row) => {
          const { sessionId, cwd, parentSessionId, running, updatedAt } = row;
          const metadata = row.projections?.values;
          return {
            sessionId,
            ...(cwd === undefined ? {} : { cwd }),
            ...(parentSessionId === undefined ? {} : { parentSessionId }),
            ...(typeof metadata?.title === 'string' ? { title: metadata.title } : {}),
            lastPromptAt: metadata?.sessionListMetadata?.lastPromptAt ?? null,
            running,
            updatedAt,
          };
        });
    },
    async isRoot(id) {
      const sessionId = SessionId(id);
      const header =
        sessions.get(sessionId)?.header ??
        (
          await ctx
            .get('sessionQuery')
            ?.readTitleSnapshot(sessionId)
            .catch(() => undefined)
        )?.session;
      return (
        header !== undefined && header.parentSession === undefined && header.origin !== 'subagent'
      );
    },
    async read(id) {
      const sessionId = SessionId(id);
      const signal = new AbortController();
      try {
        for await (const frame of controller().follow(
          { address: { kind: 'session', sessionId }, maxMessages: 100 },
          signal.signal,
        )) {
          if (frame.type !== 'snapshot') continue;
          const title = frame.projections.values.title;
          return {
            events: frame.records.map((record) => record.event),
            seq: frame.cursor,
            running: ctx.agents.get(sessionId)?.status === 'running',
            ...(typeof title === 'string' ? { title } : {}),
          };
        }
      } finally {
        signal.abort();
      }
      throw new Error('DSH Session snapshot unavailable');
    },
    async model(id, choice) {
      const sessionId = SessionId(id);
      const query = ctx.get('sessionQuery');
      if (query === undefined) throw new Error('DSH Session Query unavailable');
      const { events } = await query.readSession(sessionId);
      let original: ModelSelection | undefined;
      let current: ModelSelection | undefined;
      for (const event of events) {
        if (event.type === 'model/selection') {
          current = event.data;
        } else if (event.type === 'request/header') {
          const { config, adapterDefaults } = event.data.header;
          current ??= {
            provider: config.provider,
            model: config.model,
            ...(config.reasoningEffort === undefined || adapterDefaults?.reasoningEffort === true
              ? {}
              : { reasoningEffort: config.reasoningEffort }),
          };
        }
        original ??= current;
      }
      const projected = await controller().projections({ sessionId }, new AbortController().signal);
      current =
        ctx.agents.get(sessionId)?.model.current() ??
        projected?.values.modelSelection?.next ??
        current;
      if (choice !== undefined) {
        const result = await controller().resolveAgent(sessionId);
        if ('error' in result) throw result.error;
        const fallback = result.agent.model.current();
        const selected =
          choice === null
            ? (original ?? fallback)
            : {
                provider: choice.provider,
                model: choice.model,
                ...(choice.effort === undefined
                  ? {}
                  : { reasoningEffort: ReasoningEffortId(choice.effort) }),
              };
        if (selected !== undefined) {
          await ctx.llm.resolveCallConfig(selected);
          if (original === undefined && fallback !== undefined) result.agent.model.select(fallback);
          original ??= fallback;
          result.agent.model.select(selected);
          current = selected;
        }
      }
      original ??= current ?? ctx.get('agentDefaultModel')?.currentSelection();
      const override =
        current === undefined ||
        (current.provider === original?.provider &&
          current.model === original.model &&
          current.reasoningEffort === original.reasoningEffort)
          ? null
          : sessionRouteChoice(current);
      return { override, default: original === undefined ? null : sessionRouteChoice(original) };
    },
    async send(id, text) {
      const requestId = randomUUID() as SessionRequestId;
      await controller().prompt(
        {
          sessionId: SessionId(id),
          requestId,
          content: [{ type: 'text', text }],
          mode: 'queue',
        },
        new AbortController().signal,
      );
      return { requestId };
    },
  };
}
