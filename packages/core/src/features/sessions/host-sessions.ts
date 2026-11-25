import {
  sessionModelChoice,
  type SessionModelChoice,
  type SessionModelState,
} from '@botharness/host-protocol/session-model';
import {
  HOST_SESSION_PAGE_MAX,
  HOST_SESSION_SEARCH_MAX,
  isHostSessionApprovalDecision,
  isHostSessionFilter,
  isHostSessionSort,
  type HostSessionActionReceipt,
  type HostSessionApprovalDecision,
  type HostSessionListChanges,
  type HostSessionListResult,
  type HostSessionPendingInput,
  type HostSessionRow,
  type HostSessionSort,
  type HostSessionSourceOption,
} from '@botharness/host-protocol/host-sessions';
import type { QuestionAnswer } from '@botharness/host-protocol/wire';
import { z } from 'zod';
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';
import {
  asNonBlank,
  asObject,
  invalidInput,
  unknownBot,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import type { HumanContext } from '../../humans/context.js';
import {
  sessionDisplayTitle,
  summarizeSessionTranscript,
  type SessionTranscript,
} from '../../runtime/session-transcript.js';
import type { SessionLiveSnapshot } from '../../runtime/session-live.js';
import type { DshSessionEvent } from '../../sessions/source.js';
import {
  compareSessionKeys,
  decodeSessionCursor,
  sessionPage,
  sessionPageLimit,
} from './session-list-page.js';
import { fillSessionTitles, mayKnowSession, readVisibleSessionRows } from './session-list-rows.js';
import type { SessionListChangeSet } from './session-list-changes.js';

export interface DshSessionListRow {
  sessionId: string;
  cwd?: string;
  parentSessionId?: string;
  title?: string;
  running: boolean;
  archived?: boolean;
  waiting?: true;
  model?: { provider: string; model: string };
  lastPromptAt: number | null;
  updatedAt: number;
}

export interface NativeSessions {
  list(): Promise<readonly DshSessionListRow[]>;
  searchHumanMessages?(
    search: string,
    candidates: readonly HostSessionRow[],
    readHumanMessage: (channelId: string, messageId: string) => string | undefined,
  ): Promise<ReadonlySet<string>>;
  sortTimes?(
    sort: Exclude<HostSessionSort, 'last-human-turn'>,
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, number>>;
  isRoot(sessionId: string): Promise<boolean>;
  read(sessionId: string): Promise<{
    events: readonly DshSessionEvent[];
    seq: number;
    running: boolean;
    title?: string;
    cwd?: string;
    pendingInput?: readonly HostSessionPendingInput[];
  }>;
  model?(
    sessionId: string,
    choice: Extract<SessionModelChoice, { kind: 'model' }> | null | undefined,
  ): Promise<SessionModelState>;
  pendingInput?(sessionId: string): Promise<readonly HostSessionPendingInput[]>;
  answerApproval?(
    sessionId: string,
    requestId: string,
    decision: HostSessionApprovalDecision,
  ): Promise<boolean>;
  answerQuestion?(
    sessionId: string,
    requestId: string,
    answer: QuestionAnswer,
    allowed?: () => boolean,
  ): Promise<boolean>;
  stop?(sessionId: string): Promise<void>;
  archive?(sessionId: string): Promise<void>;
  listChanges?(request: { sinceSeq?: number; epoch?: string }): SessionListChangeSet;
  markChanged?(sessionId: string): void;
  send(sessionId: string, text: string): Promise<{ requestId: string }>;
  create?(
    target: ({ cwd: string } | { workspaceId: string }) & { sessionId?: string },
  ): Promise<{ sessionId: string }>;
}

function titleSourceKind(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return undefined;
  const source = (data as { source?: unknown }).source;
  return typeof source === 'object' && source !== null
    ? (source as { kind?: unknown }).kind
    : undefined;
}

export function normalizeSessionSearch(text: string): string {
  return text.trim().replace(/\s+/gu, ' ').toLowerCase();
}

const denied = {
  ok: false,
  error: { code: 'permission-required', message: 'Host Owner permission is required' },
} satisfies BridgeResult<never>;
const missing = {
  ok: false,
  error: { code: 'not-found', message: 'Unknown root Session' },
} satisfies BridgeResult<never>;
const inputNotPending = {
  ok: false,
  error: { code: 'session-input-not-pending', message: 'The Session request is no longer pending' },
} satisfies BridgeResult<never>;

const questionAnswer = z
  .object({
    answers: z
      .array(
        z.object({
          id: z.string().min(1),
          selected: z.array(z.string()),
          custom: z.string().optional(),
        }),
      )
      .min(1),
  })
  .transform(({ answers }): QuestionAnswer => ({
    answers: answers.map(({ id, selected, custom }) => ({
      id,
      selected,
      ...(custom === undefined ? {} : { custom }),
    })),
  }));

const unavailable = {
  ok: false,
  error: { code: 'unavailable', message: 'Host Sessions are unavailable' },
} satisfies BridgeResult<never>;

function dshFailure(cause: unknown): BridgeResult<never> {
  const failure = remoteErrorOf(cause);
  if (failure === undefined) return unavailable;
  const code: string = failure.code;
  if (code === 'session/not-found') return missing;
  return { ok: false, error: { code, message: failure.message } };
}

function isNativeTranscriptEvent(event: DshSessionEvent): boolean {
  if (event.type !== 'user/message') return true;
  const data = asObject(event.data);
  const source = asObject(data['source'] ?? asObject(data['message'])['source']);
  return source['kind'] !== 'agent-instructions' && source['kind'] !== 'time-context';
}

export function createHostSessionsMethods(
  human: HumanContext,
  deps: BridgeMethodsDeps,
  globalRegistry: BridgeMethodsDeps['registry'],
  isHostOwner: () => boolean,
) {
  const nativeAllowed = () => human.caller !== 'bot' && isHostOwner();
  async function native<T>(
    payload: unknown,
    run: (service: NativeSessions, id: string) => Promise<BridgeResult<T>>,
  ): Promise<BridgeResult<T>> {
    if (!nativeAllowed()) return denied;
    const id = asNonBlank(asObject(payload), 'sessionId');
    if (id === undefined) return invalidInput('sessionId is required');
    if (deps.ownership.resolve(id) !== undefined) return missing;
    const service = deps.nativeSessions;
    if (service === undefined) return unavailable;
    try {
      const root = await service.isRoot(id);
      if (!nativeAllowed()) return denied;
      if (!root || deps.ownership.resolve(id) !== undefined) return missing;
      return await run(service, id);
    } catch (cause) {
      return dshFailure(cause);
    }
  }

  async function snapshot(id: string, after: number | undefined, unowned: boolean) {
    const live = deps.sessionLive;
    if (live === undefined) return unavailable;
    if (after !== undefined) await live.wait(id, after);
    if (unowned && deps.ownership.resolve(id) !== undefined) return missing;
    return { ok: true as const, value: { sessionId: id, ...live.snapshot(id) } };
  }

  return {
    async sessionList(payload: unknown): Promise<BridgeResult<HostSessionListResult>> {
      const {
        search,
        sort = 'last-human-turn',
        source = 'all',
        queryVersion,
        includeArchived = false,
        limit: requestedLimit,
        cursor: requestedCursor,
      } = asObject(payload);
      if (typeof includeArchived !== 'boolean')
        return invalidInput('includeArchived must be a boolean');
      const limit = sessionPageLimit(requestedLimit);
      if (limit === 'invalid')
        return invalidInput(`limit must be a whole number from 1 to ${HOST_SESSION_PAGE_MAX}`);
      const after = decodeSessionCursor(requestedCursor);
      if (after === 'invalid') return invalidInput('Unknown Session list cursor');
      if (!isHostSessionSort(sort)) return invalidInput('Unknown Session sort order');
      if (!isHostSessionFilter(source)) return invalidInput('Unknown Session source filter');
      if (queryVersion !== undefined && queryVersion !== 1)
        return invalidInput('Unknown Session list query version');
      if (
        search !== undefined &&
        (typeof search !== 'string' ||
          search.length > HOST_SESSION_SEARCH_MAX ||
          search.includes('\0'))
      )
        return invalidInput(`Search must be text of at most ${HOST_SESSION_SEARCH_MAX} characters`);
      const query = search === undefined ? '' : normalizeSessionSearch(search);
      const service = deps.nativeSessions;
      if (service === undefined) return unavailable;
      const read = await readVisibleSessionRows(
        { human, deps, globalRegistry, owner: nativeAllowed() },
        { source, includeArchived, withSources: queryVersion === 1 },
      );
      if (read === undefined) return unavailable;
      let sessions = read.sessions;
      const fillTitles = (rows: readonly HostSessionRow[]) => fillSessionTitles(deps, rows);
      if (query) await fillTitles(sessions);
      let sortTimes: ReadonlyMap<string, number> | undefined;
      try {
        if (query && sessions.length > 0) {
          const titleMatches = new Set(
            sessions
              .filter(
                (row) =>
                  row.title !== undefined && normalizeSessionSearch(row.title).includes(query),
              )
              .map((row) => row.sessionId),
          );
          const candidates = sessions.filter((row) => !titleMatches.has(row.sessionId));
          if (candidates.length > 0) {
            if (service.searchHumanMessages === undefined) return unavailable;
            const messageMatches = await service.searchHumanMessages(
              query,
              candidates,
              (channelId, messageId) => {
                const message = deps.channels?.message(channelId, messageId);
                return message?.author.kind === 'human' ? message.body : undefined;
              },
            );
            for (const id of messageMatches) titleMatches.add(id);
          }
          sessions = sessions.filter((row) => titleMatches.has(row.sessionId));
        }
        if (sort !== 'last-human-turn' && sessions.length > 0) {
          if (service.sortTimes === undefined) return unavailable;
          sortTimes = await service.sortTimes(
            sort,
            sessions.map((row) => row.sessionId),
          );
        }
      } catch (cause) {
        return dshFailure(cause);
      }
      const clock = (row: HostSessionRow) =>
        sortTimes === undefined ? (row.lastPromptAt ?? -1) : (sortTimes.get(row.sessionId) ?? -1);
      const key = (row: HostSessionRow) => ({
        clock: clock(row),
        updatedAt: row.updatedAt,
        sessionId: row.sessionId,
      });
      sessions.sort((a, b) => compareSessionKeys(key(a), key(b)));
      const page = sessionPage(sessions, key, after, limit);
      if (!query) await fillTitles(page.rows);
      if (queryVersion === 1) for (const row of page.rows) row.sortedAt = clock(row);
      return {
        ok: true,
        value: {
          sessions: page.rows,
          ...(includeArchived ? { includeArchived: true as const } : {}),
          ...(queryVersion === 1 ? { queryVersion, sources: read.sources } : {}),
          ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
        },
      };
    },
    async sessionListChanges(payload: unknown): Promise<BridgeResult<HostSessionListChanges>> {
      const { sinceSeq, epoch } = asObject(payload);
      if (sinceSeq !== undefined && (!Number.isSafeInteger(sinceSeq) || (sinceSeq as number) < 0))
        return invalidInput('sinceSeq must be a nonnegative integer');
      if (epoch !== undefined && typeof epoch !== 'string')
        return invalidInput('epoch must be a string');
      const service = deps.nativeSessions;
      if (service?.listChanges === undefined) return unavailable;
      const changes = service.listChanges({
        ...(sinceSeq === undefined ? {} : { sinceSeq: sinceSeq as number }),
        ...(epoch === undefined ? {} : { epoch }),
      });
      if (changes.reset === true) return { ok: true, value: changes };
      const scope = { human, deps, globalRegistry, owner: nativeAllowed() };
      const read = await readVisibleSessionRows(scope, {
        source: 'all',
        includeArchived: true,
        withSources: true,
      });
      if (read === undefined) return unavailable;
      const visible = new Map(read.sessions.map((row) => [row.sessionId, row]));
      const sessions: HostSessionRow[] = [];
      const removed: string[] = [];
      for (const id of changes.sessionIds) {
        const row = visible.get(id);
        if (row !== undefined) sessions.push(row);
        else if (read.children.has(id)) continue;
        else if (read.roots.has(id)) {
          if (mayKnowSession(scope, id))
            return { ok: true, value: { reset: true, cursor: changes.cursor } };
        } else if (mayKnowSession(scope, id)) removed.push(id);
      }
      await fillSessionTitles(deps, sessions);
      return {
        ok: true,
        value: { sessions, removed, sources: read.sources, cursor: changes.cursor },
      };
    },
    sessionTranscript(payload: unknown) {
      return native<
        {
          sessionId: string;
          role: 'native';
          pendingInput?: readonly HostSessionPendingInput[];
        } & SessionTranscript
      >(payload, async (service, id) => {
        const snapshot = await service.read(id);
        const pendingInput = snapshot.pendingInput ?? (await service.pendingInput?.(id));
        if (!nativeAllowed()) return denied;
        if (deps.ownership.resolve(id) !== undefined) return missing;
        const title = snapshot.title ?? sessionDisplayTitle(snapshot.events);
        const recorded = snapshot.events.findLast((event) => event.type === 'session/title');
        const fallbackTitle =
          recorded === undefined
            ? snapshot.title === undefined
            : titleSourceKind(recorded.data) === 'fallback';
        return {
          ok: true,
          value: {
            ...summarizeSessionTranscript({
              sessionId: id,
              events: snapshot.events.filter(isNativeTranscriptEvent),
            }),
            sessionId: id,
            role: 'native',
            ...(title === undefined ? {} : { displayTitle: title }),
            ...(fallbackTitle ? { titleFallback: true } : {}),
            ...(snapshot.cwd === undefined ? {} : { cwd: snapshot.cwd }),
            running: snapshot.running,
            seq: snapshot.seq,
            ...(pendingInput === undefined ? {} : { pendingInput }),
          },
        };
      });
    },
    async sessionLive(payload: unknown): Promise<
      BridgeResult<
        {
          sessionId: string;
          pendingInput?: readonly HostSessionPendingInput[];
        } & SessionLiveSnapshot
      >
    > {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const sessionId = asNonBlank(source, 'sessionId');
      const after = source['after'];
      if (after !== undefined && (typeof after !== 'number' || !Number.isSafeInteger(after)))
        return invalidInput('after must be an integer');
      if (source['slug'] === null)
        return native(payload, async (service, id) => {
          const current = await snapshot(id, after, true);
          if (!current.ok || service.pendingInput === undefined) return current;
          const pendingInput = await service.pendingInput(id);
          if (!nativeAllowed()) return denied;
          if (deps.ownership.resolve(id) !== undefined) return missing;
          return { ok: true, value: { ...current.value, pendingInput } };
        });
      if (slug === undefined) return invalidInput('slug is required');
      if (sessionId === undefined) return invalidInput('sessionId is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const owner = deps.ownership.resolve(sessionId);
      if (owner?.botSlug !== slug || owner.parentSessionId !== undefined)
        return {
          ok: false,
          error: { code: 'not-found', message: `unknown root Session: ${sessionId}` },
        };
      return snapshot(sessionId, after, false);
    },
    sessionModel(payload: unknown) {
      return native(payload, async (service, id) => {
        if (service.model === undefined) return unavailable;
        const proposed = asObject(payload)['choice'];
        const choice = proposed == null ? proposed : sessionModelChoice(proposed);
        if (
          (proposed != null && choice === undefined) ||
          (choice != null && choice.kind !== 'model')
        )
          return invalidInput('Native Sessions require a model provider and model');
        return { ok: true, value: await service.model(id, choice) };
      });
    },
    async sessionCreate(
      payload: unknown,
    ): Promise<BridgeResult<{ sessionId: string; requestId: string }>> {
      if (!nativeAllowed()) return denied;
      const source = asObject(payload);
      const cwd = asNonBlank(source, 'cwd');
      const workspaceId = asNonBlank(source, 'workspaceId');
      const { text } = source;
      if ((cwd === undefined) === (workspaceId === undefined))
        return invalidInput('Exactly one of cwd and workspaceId is required');
      if (typeof text !== 'string' || text.trim() === '')
        return invalidInput('A non-blank text is required');
      const proposed = source['choice'];
      const parsed = proposed == null ? undefined : sessionModelChoice(proposed);
      if (proposed != null && parsed?.kind !== 'model')
        return invalidInput('Native Sessions require a model provider and model');
      const choice = parsed?.kind === 'model' ? parsed : undefined;
      const reuse = asNonBlank(source, 'sessionId');
      const service = deps.nativeSessions;
      if (service?.create === undefined) return unavailable;
      if (choice !== undefined && service.model === undefined) return unavailable;
      let created: string | undefined;
      try {
        const place = cwd === undefined ? { workspaceId: workspaceId! } : { cwd };
        const { sessionId } = await service.create(
          reuse === undefined ? place : { ...place, sessionId: reuse },
        );
        created = sessionId;
        if (choice !== undefined)
          try {
            await service.model!(sessionId, choice);
          } catch (cause) {
            const failure = dshFailure(cause);
            const error =
              remoteErrorOf(cause) === undefined
                ? {
                    code: 'session/model-unavailable',
                    message: cause instanceof Error ? cause.message : String(cause),
                  }
                : failure.ok
                  ? { code: 'session/model-unavailable', message: 'Model choice failed' }
                  : failure.error;
            return { ok: false, error: { ...error, details: { ...error.details, sessionId } } };
          }
        const { requestId } = await service.send(sessionId, text);
        return { ok: true, value: { sessionId, requestId } };
      } catch (cause) {
        const failure = dshFailure(cause);
        if (created === undefined || failure.ok) return failure;
        return {
          ok: false,
          error: { ...failure.error, details: { ...failure.error.details, sessionId: created } },
        };
      }
    },
    sessionAnswerApproval(payload: unknown) {
      return native<HostSessionActionReceipt>(payload, async (service, id) => {
        if (service.answerApproval === undefined) return unavailable;
        const source = asObject(payload);
        const requestId = asNonBlank(source, 'requestId');
        const { decision } = source;
        if (requestId === undefined || !isHostSessionApprovalDecision(decision))
          return invalidInput('requestId and a once-or-reject decision are required');
        return (await service.answerApproval(id, requestId, decision))
          ? { ok: true, value: { sessionId: id, accepted: true } }
          : inputNotPending;
      });
    },
    sessionAnswerQuestion(payload: unknown) {
      return native<HostSessionActionReceipt>(payload, async (service, id) => {
        if (service.answerQuestion === undefined) return unavailable;
        const source = asObject(payload);
        const requestId = asNonBlank(source, 'requestId');
        const parsed = questionAnswer.safeParse(source['answer']);
        if (requestId === undefined || !parsed.success)
          return invalidInput('requestId and a structured question answer are required');
        return (await service.answerQuestion(id, requestId, parsed.data, nativeAllowed))
          ? { ok: true, value: { sessionId: id, accepted: true } }
          : inputNotPending;
      });
    },
    sessionNativeStop(payload: unknown) {
      return native(payload, async (service, id) => {
        if (service.stop === undefined) return unavailable;
        await service.stop(id);
        return { ok: true, value: { sessionId: id, accepted: true as const } };
      });
    },
    sessionNativeArchive(payload: unknown) {
      return native(payload, async (service, id) => {
        if (service.archive === undefined) return unavailable;
        await service.archive(id);
        return { ok: true, value: { sessionId: id, accepted: true as const } };
      });
    },
    sessionSend(payload: unknown) {
      return native(payload, async (service, id) => {
        const { text } = asObject(payload);
        if (typeof text !== 'string' || text.trim() === '')
          return invalidInput('A non-blank text is required');
        return { ok: true, value: await service.send(id, text) };
      });
    },
  };
}

export type HostSessionBridgeMethods = Omit<
  ReturnType<typeof createHostSessionsMethods>,
  'sessionModel' | 'sessionSend' | 'sessionTranscript'
>;
