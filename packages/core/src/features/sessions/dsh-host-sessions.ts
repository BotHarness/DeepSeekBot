import { randomUUID } from 'node:crypto';
import type {
  SessionCreateRequest,
  SessionRequestId,
} from '@deepseek-ai/dsh-api-session-controller';
import type {} from '@deepseek-ai/dsh-api-workspace-controller';
import type {} from '@deepseek-ai/dsh-workspace';
import type { Context } from '@deepseek-ai/cordis';
import type { ModelSelection } from '@deepseek-ai/dsh-agent';
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { sessionRouteChoice } from '../../runtime/session-model-choices.js';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { DshSessionStore } from '../../sessions/source.js';
import { hostSessionQueries } from './dsh-host-session-query.js';
import type { DshHostSessionInput } from './dsh-host-session-input.js';
import type { DshSessionListRow, NativeSessions } from './host-sessions.js';
import type { SessionListChanges } from './session-list-changes.js';
import { incrementalSessionRows } from './session-row-cache.js';

const createdOf = (createdAt: number | undefined) => (createdAt === undefined ? {} : { createdAt });

export function dshHostSessions(
  ctx: Context,
  sessions: DshSessionStore,
  input?: DshHostSessionInput,
  changes?: Pick<SessionListChanges, 'since' | 'cursor' | 'touchedAt' | 'changed'>,
): NativeSessions {
  function controller() {
    const service = ctx.get('sessionController');
    if (service === undefined) throw new Error('DSH Session Controller unavailable');
    return service;
  }
  const rows =
    changes === undefined
      ? readRows
      : incrementalSessionRows(
          { all: readRows, one: readRow, ignored: (id) => subagents.has(id) },
          changes,
        );
  let subagents = new Set<string>();

  async function readRow(previous: DshSessionListRow): Promise<DshSessionListRow | null> {
    const service = controller();
    const sessionId = SessionId(previous.sessionId);
    const signal = new AbortController().signal;
    const [projections, state] = await Promise.all([
      service.projections({ sessionId }, signal).catch(() => undefined),
      service.state({ sessionId }, signal).catch(() => undefined),
    ]);
    if (projections === undefined && state === undefined) return null;
    const metadata = projections?.values;
    const model = metadata?.modelSelection?.lastUsed ?? metadata?.modelSelection?.next;
    const running = state?.running ?? false;
    return {
      sessionId: previous.sessionId,
      ...(model == null ? {} : { model: { provider: model.provider, model: model.model } }),
      ...(running && (state?.pendingInput.length ?? 0) > 0 ? { waiting: true as const } : {}),
      ...(previous.cwd === undefined ? {} : { cwd: previous.cwd }),
      ...(previous.parentSessionId === undefined
        ? {}
        : { parentSessionId: previous.parentSessionId }),
      ...(typeof metadata?.title === 'string' ? { title: metadata.title } : {}),
      lastPromptAt: metadata?.sessionListMetadata?.lastPromptAt ?? null,
      running,
      updatedAt: previous.updatedAt,
      ...(previous.createdAt === undefined ? {} : { createdAt: previous.createdAt }),
    };
  }

  async function list(): Promise<readonly DshSessionListRow[]> {
    const read = await rows();
    const archived = new Set<string>(ctx.get('workspaceRegistry')?.archivedSessionIds);
    if (archived.size === 0) return read;
    return read.map((row) => (archived.has(row.sessionId) ? { ...row, archived: true } : row));
  }

  async function readRows(): Promise<readonly DshSessionListRow[]> {
    const service = controller();
    const signal = new AbortController().signal;
    const [{ items }, records] = await Promise.all([
      service.list({}, signal),
      ctx
        .get('sessionQuery')
        ?.listSessions()
        .catch(() => undefined),
    ]);
    const created = new Map<string, number>(
      (records ?? []).map(({ header }) => [header.id, header.createdAt]),
    );
    const roots = items.filter((row) => row.origin !== 'subagent');
    subagents = new Set(
      items.filter((row) => row.origin === 'subagent').map((row) => row.sessionId),
    );
    const waiting = new Set(
      (
        await Promise.all(
          roots
            .filter((row) => row.running)
            .map((row) =>
              service.state({ sessionId: row.sessionId }, signal).then(
                (state) => (state.pendingInput.length > 0 ? row.sessionId : undefined),
                () => undefined,
              ),
            ),
        )
      ).filter((id) => id !== undefined),
    );
    return roots.map((row) => {
      const { sessionId, cwd, parentSessionId, running, updatedAt } = row;
      const metadata = row.projections?.values;
      const model = metadata?.modelSelection?.lastUsed ?? metadata?.modelSelection?.next;
      return {
        sessionId,
        ...(model == null ? {} : { model: { provider: model.provider, model: model.model } }),
        ...(waiting.has(sessionId) ? { waiting: true as const } : {}),
        ...(cwd === undefined ? {} : { cwd }),
        ...(parentSessionId === undefined ? {} : { parentSessionId }),
        ...(typeof metadata?.title === 'string' ? { title: metadata.title } : {}),
        lastPromptAt: metadata?.sessionListMetadata?.lastPromptAt ?? null,
        running,
        updatedAt,
        ...createdOf(created.get(sessionId)),
      };
    });
  }

  return {
    ...hostSessionQueries(() => {
      const query = ctx.get('sessionQuery');
      if (query === undefined) throw new Error('DSH Session Query unavailable');
      return query;
    }),
    ...(input === undefined
      ? {}
      : {
          pendingInput: input.pending,
          answerApproval: input.answerApproval,
          answerQuestion: input.answerQuestion,
        }),
    list,
    ...(changes === undefined
      ? {}
      : {
          listChanges: (request: { sinceSeq?: number; epoch?: string }) => changes.since(request),
          markChanged: (sessionId: string) => changes.changed(true, sessionId),
        }),
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
          const cwd = (
            sessions.get(sessionId)?.header ??
            (
              await ctx
                .get('sessionQuery')
                ?.readTitleSnapshot(sessionId)
                .catch(() => undefined)
            )?.session
          )?.cwd;
          return {
            events: frame.records.map((record) => record.event),
            seq: frame.cursor,
            ...(input === undefined
              ? {}
              : {
                  pendingInput: input.fromSnapshot(id, frame.projections.values.userQuestions),
                }),
            running: ctx.agents.get(sessionId)?.status === 'running',
            ...(typeof title === 'string' ? { title } : {}),
            ...(cwd === undefined ? {} : { cwd }),
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
    async create(target) {
      const reuse =
        target.sessionId === undefined ? {} : { sessionId: SessionId(target.sessionId) };
      const { sessionId } = await controller().create(
        'cwd' in target
          ? { cwd: target.cwd, ...reuse }
          : {
              workspaceId: target.workspaceId as NonNullable<SessionCreateRequest['workspaceId']>,
              ...reuse,
            },
      );
      return { sessionId };
    },
    async stop(id) {
      controller().cancel({ sessionId: SessionId(id) });
    },
    async archive(id) {
      const workspace = ctx.get('workspaceController');
      if (workspace === undefined) throw new Error('DSH Workspace Controller unavailable');
      await workspace.archiveSession({ sessionId: SessionId(id) });
      changes?.changed(true, id);
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
