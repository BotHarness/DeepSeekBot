import {
  sessionModelChoice,
  type SessionModelChoice,
  type SessionModelState,
} from '@botharness/host-protocol/session-model';
import { posix, win32 } from 'node:path';
import type { HostSessionRow } from '@botharness/host-protocol/host-sessions';
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';
import {
  asNonBlank,
  asObject,
  invalidInput,
  unknownBot,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import { botAvatarUrl } from '../../bots/avatar-http.js';
import type { HumanContext } from '../../humans/context.js';
import {
  sessionDisplayTitle,
  summarizeSessionTranscript,
  type SessionTranscript,
} from '../../runtime/session-transcript.js';
import type { DshSessionEvent } from '../../sessions/source.js';

export interface DshSessionListRow {
  sessionId: string;
  cwd?: string;
  parentSessionId?: string;
  title?: string;
  running: boolean;
  lastPromptAt: number | null;
  updatedAt: number;
}

export interface NativeSessions {
  list(): Promise<readonly DshSessionListRow[]>;
  isRoot(sessionId: string): Promise<boolean>;
  read(sessionId: string): Promise<{
    events: readonly DshSessionEvent[];
    seq: number;
    running: boolean;
    title?: string;
  }>;
  model?(
    sessionId: string,
    choice: Extract<SessionModelChoice, { kind: 'model' }> | null | undefined,
  ): Promise<SessionModelState>;
  send(sessionId: string, text: string): Promise<{ requestId: string }>;
}

const denied = {
  ok: false,
  error: { code: 'permission-required', message: 'Host Owner permission is required' },
} satisfies BridgeResult<never>;
const missing = {
  ok: false,
  error: { code: 'not-found', message: 'Unknown root Session' },
} satisfies BridgeResult<never>;
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

function folderName(cwd: string): string {
  const path = win32.isAbsolute(cwd) && !posix.isAbsolute(cwd) ? win32 : posix;
  return path.basename(cwd) || path.parse(cwd).root;
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
      if (!(await service.isRoot(id)) || deps.ownership.resolve(id) !== undefined) return missing;
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
    async sessionList(_payload: unknown): Promise<BridgeResult<{ sessions: HostSessionRow[] }>> {
      if (deps.nativeSessions === undefined) return unavailable;
      const rows = await deps.nativeSessions.list().catch(() => undefined);
      if (rows === undefined) return unavailable;
      const owner = nativeAllowed();
      const privateSessions = owner ? undefined : deps.team?.bots.privateSessions(human);
      const ownership = new Map(deps.ownership.list().map((record) => [record.sessionId, record]));
      const sessions: HostSessionRow[] = [];
      const assignments = new Map<string, string>();
      const seenBots = new Set<string>();
      for (const row of rows) {
        const record = ownership.get(row.sessionId);
        if (row.parentSessionId !== undefined || record?.parentSessionId !== undefined) continue;
        const cwd = row.cwd ?? record?.cwdReference;
        const base = {
          sessionId: row.sessionId,
          ...(row.title === undefined ? {} : { title: row.title }),
          ...(cwd === undefined ? {} : { folderName: folderName(cwd) }),
          running: row.running,
          lastPromptAt: row.lastPromptAt,
          updatedAt: row.updatedAt,
        };
        if (record === undefined) {
          if (owner) sessions.push({ ...base, source: { kind: 'native' } });
          continue;
        }
        const bot = (owner ? globalRegistry : deps.registry).getHistorical(record.botSlug);
        if (bot === undefined || privateSessions?.has(bot.slug)) continue;
        if (!seenBots.has(bot.slug)) {
          seenBots.add(bot.slug);
          for (const assignment of deps.runtime?.listAssignments(bot.slug) ?? [])
            assignments.set(assignment.sessionId, assignment.title);
        }
        const assignedTitle = assignments.get(row.sessionId);
        const engine = deps.describeEngineSession?.(row.sessionId);
        const avatar = bot.avatar?.startsWith('data:image/')
          ? botAvatarUrl(bot.slug, bot.avatar)
          : bot.avatar;
        sessions.push({
          ...base,
          ...(assignedTitle === undefined ? {} : { title: assignedTitle }),
          running: row.running || (engine !== undefined && engine.state !== 'idle'),
          source: {
            kind: 'bot',
            botSlug: bot.slug,
            displayName: bot.displayName,
            ...(avatar === undefined ? {} : { avatar }),
            ...(bot.appearance === undefined ? {} : { appearance: bot.appearance }),
            ...(bot.avatarSeed === undefined ? {} : { avatarSeed: bot.avatarSeed }),
          },
        });
      }
      const titles = await deps.readSessionTitles?.(
        sessions.filter((row) => row.title === undefined).map((row) => row.sessionId),
      );
      for (const row of sessions) {
        const title = titles?.get(row.sessionId);
        if (title !== undefined) row.title = title;
      }
      sessions.sort(
        (a, b) =>
          (b.lastPromptAt ?? -1) - (a.lastPromptAt ?? -1) ||
          b.updatedAt - a.updatedAt ||
          a.sessionId.localeCompare(b.sessionId),
      );
      return { ok: true, value: { sessions } };
    },
    sessionTranscript(payload: unknown) {
      return native<{ sessionId: string; role: 'native' } & SessionTranscript>(
        payload,
        async (service, id) => {
          const snapshot = await service.read(id);
          const title = snapshot.title ?? sessionDisplayTitle(snapshot.events);
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
              running: snapshot.running,
              seq: snapshot.seq,
            },
          };
        },
      );
    },
    async sessionLive(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const sessionId = asNonBlank(source, 'sessionId');
      const after = source['after'];
      if (after !== undefined && (typeof after !== 'number' || !Number.isSafeInteger(after)))
        return invalidInput('after must be an integer');
      if (source['slug'] === null)
        return native(payload, (_service, id) => snapshot(id, after, true));
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
