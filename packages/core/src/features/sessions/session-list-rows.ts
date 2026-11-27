import {
  hostSessionStatus,
  type HostSessionAttention,
  type HostSessionFilter,
  type HostSessionRow,
  type HostSessionSourceOption,
} from '@botharness/host-protocol/host-sessions';
import type { SessionsBridgeDeps } from './bridge-deps.js';
import { botAvatarUrl } from '../../bots/avatar-http.js';
import type { HumanContext } from '../../humans/context.js';
import type { AssignmentReport } from '@botharness/host-protocol/wire';
import type { AssignmentSummary } from '../assignments/runtime-types.js';
import { folderName } from './workspace-sessions.js';
import {
  createSessionTitleCache,
  type SessionTitleCache,
  type SessionTitleReader,
} from './session-title-cache.js';

export { folderName } from './workspace-sessions.js';

const titleCaches = new WeakMap<SessionTitleReader, SessionTitleCache>();

export function sessionTitleCache(
  read: SessionTitleReader,
  onTitled?: (sessionIds: string[]) => void,
): SessionTitleCache {
  const existing = titleCaches.get(read);
  if (existing !== undefined) return existing;
  const cache = createSessionTitleCache(read, onTitled === undefined ? {} : { onTitled });
  titleCaches.set(read, cache);
  return cache;
}

export async function fillSessionTitles(
  deps: Pick<SessionsBridgeDeps, 'readSessionTitles' | 'nativeSessions'>,
  rows: readonly HostSessionRow[],
  { wait = true }: { wait?: boolean } = {},
): Promise<void> {
  const untitled = rows.filter((row) => row.title === undefined);
  if (deps.readSessionTitles === undefined || untitled.length === 0) return;
  const native = deps.nativeSessions;
  const titles = await sessionTitleCache(
    deps.readSessionTitles,
    native?.markChanged === undefined
      ? undefined
      : (ids) => {
          for (const id of ids) native.markChanged?.(id);
        },
  )(untitled, { wait });
  for (const row of untitled) {
    const title = titles.get(row.sessionId);
    if (title !== undefined) row.title = title;
  }
}

export type VisibleSessionRows = {
  sessions: HostSessionRow[];
  sources: HostSessionSourceOption[];
  roots: ReadonlySet<string>;
  children: ReadonlySet<string>;
};

export type SessionRowScope = {
  human: HumanContext;
  deps: Pick<
    SessionsBridgeDeps,
    | 'nativeSessions'
    | 'ownership'
    | 'registry'
    | 'team'
    | 'runtime'
    | 'describeEngineSession'
    | 'workspaceLooks'
    | 'readSessionTitles'
  >;
  globalRegistry: SessionsBridgeDeps['registry'];
  owner: boolean;
};

export function mayKnowSession(
  { human, deps, owner }: SessionRowScope,
  sessionId: string,
): boolean {
  if (owner) return true;
  const record = deps.ownership.resolve(sessionId);
  if (record === undefined || record.parentSessionId !== undefined) return false;
  const bot = deps.registry.getHistorical(record.botSlug);
  return bot !== undefined && deps.team?.bots.privateSessions(human)?.has(bot.slug) !== true;
}

function currentReport(
  assignment: Pick<AssignmentSummary, 'activity' | 'latestReport'> | undefined,
  running: boolean,
  lastPromptAt: number | null,
): AssignmentReport['state'] | undefined {
  const report = assignment?.latestReport;
  if (report === undefined || running || assignment?.activity === 'working') return undefined;
  const at = Date.parse(report.at);
  if (lastPromptAt !== null && Number.isFinite(at) && at < lastPromptAt) return undefined;
  return report.state;
}

export async function readVisibleSessionRows(
  { human, deps, globalRegistry, owner }: SessionRowScope,
  {
    source,
    includeArchived,
    withSources,
  }: { source: HostSessionFilter; includeArchived: boolean; withSources: boolean },
): Promise<VisibleSessionRows | undefined> {
  const service = deps.nativeSessions;
  if (service === undefined) return undefined;
  const rows = await service.list().catch(() => undefined);
  if (rows === undefined) return undefined;
  const privateSessions = owner ? undefined : deps.team?.bots.privateSessions(human);
  const ownership = new Map(deps.ownership.list().map((record) => [record.sessionId, record]));
  const sessions: HostSessionRow[] = [];
  const sources = new Map<string, HostSessionSourceOption>();
  if (owner) sources.set('native', { kind: 'native' });
  const assignments = new Map<
    string,
    Pick<AssignmentSummary, 'title' | 'activity' | 'latestReport' | 'openAsk'>
  >();
  const seenBots = new Set<string>();
  const children = new Set<string>();
  const roots = new Set<string>();
  const cwdOf = new Map<string, string>();
  for (const row of rows) {
    const record = ownership.get(row.sessionId);
    if (row.parentSessionId !== undefined || record?.parentSessionId !== undefined) {
      children.add(row.sessionId);
      continue;
    }
    roots.add(row.sessionId);
    if (row.archived === true && !includeArchived) continue;
    const cwd = row.cwd ?? record?.cwdReference;
    if (cwd !== undefined) cwdOf.set(row.sessionId, cwd);
    const base = {
      sessionId: row.sessionId,
      ...(row.title === undefined ? {} : { title: row.title }),
      ...(cwd === undefined ? {} : { folderName: folderName(cwd) }),
      ...(row.archived === true ? { archived: true as const } : {}),
      ...(cwd === undefined || !owner ? {} : { cwd }),
      ...(row.waiting === true ? { waiting: true as const } : {}),
      ...(row.model === undefined ? {} : { model: row.model }),
      running: row.running,
      lastPromptAt: row.lastPromptAt,
      updatedAt: row.updatedAt,
      ...(row.createdAt === undefined ? {} : { createdAt: row.createdAt }),
    };
    if (record === undefined) {
      if (owner && (source === 'all' || source === 'native')) {
        const attention: HostSessionAttention | undefined =
          row.pendingInput ??
          (row.waiting === true ? 'question' : row.failed === true ? 'failed' : undefined);
        sessions.push({
          ...base,
          status: hostSessionStatus({ running: row.running, attention }),
          ...(attention === undefined ? {} : { attention }),
          source: { kind: 'native' },
        });
      }
      continue;
    }
    const bot = (owner ? globalRegistry : deps.registry).getHistorical(record.botSlug);
    if (bot === undefined || privateSessions?.has(bot.slug)) continue;
    const avatar = bot.avatar?.startsWith('data:image/')
      ? botAvatarUrl(bot.slug, bot.avatar)
      : bot.avatar;
    const identity = {
      kind: 'bot' as const,
      botSlug: bot.slug,
      displayName: bot.displayName,
      ...(avatar === undefined ? {} : { avatar }),
      ...(bot.appearance === undefined ? {} : { appearance: bot.appearance }),
      ...(bot.avatarSeed === undefined ? {} : { avatarSeed: bot.avatarSeed }),
    };
    if (withSources && !sources.has(`bot:${bot.slug}`)) sources.set(`bot:${bot.slug}`, identity);
    if (source !== 'all' && source !== `bot:${bot.slug}`) continue;
    if (!seenBots.has(bot.slug)) {
      seenBots.add(bot.slug);
      for (const assignment of deps.runtime?.listAssignments(bot.slug) ?? [])
        assignments.set(assignment.sessionId, assignment);
    }
    const assignment = assignments.get(row.sessionId);
    const assignedTitle = assignment?.title;
    const engine = deps.describeEngineSession?.(row.sessionId);
    const running = row.running || (engine !== undefined && engine.state !== 'idle');
    const report = currentReport(assignment, running, row.lastPromptAt);
    const attention: HostSessionAttention | undefined =
      row.pendingInput === 'approval' || engine?.state === 'waiting-approval'
        ? 'approval'
        : row.waiting === true ||
            assignment?.openAsk !== undefined ||
            report === 'waiting-human' ||
            report === 'blocked'
          ? 'question'
          : assignment?.activity === 'error' || report === 'failed'
            ? 'failed'
            : undefined;
    sessions.push({
      ...base,
      ...(assignedTitle === undefined ? {} : { title: assignedTitle }),
      running,
      ...(row.waiting === true || engine?.state === 'waiting-approval'
        ? { waiting: true as const }
        : {}),
      status: hostSessionStatus({ running, attention }),
      ...(attention === undefined ? {} : { attention }),
      source: identity,
    });
  }
  if (deps.workspaceLooks !== undefined) {
    const looks = await deps.workspaceLooks.folderLooks(
      sessions.flatMap((row) => cwdOf.get(row.sessionId) ?? []),
    );
    for (const row of sessions) {
      const look = looks.get(cwdOf.get(row.sessionId) ?? '');
      if (look !== undefined) row.folderLook = look;
    }
  }
  return { sessions, sources: [...sources.values()], roots, children };
}
