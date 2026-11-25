import { createHash } from 'node:crypto';
import { posix, win32 } from 'node:path';
import type {
  HostSessionFilter,
  HostSessionRow,
  HostSessionSourceOption,
} from '@botharness/host-protocol/host-sessions';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';
import { botAvatarUrl } from '../../bots/avatar-http.js';
import type { HumanContext } from '../../humans/context.js';
import {
  createSessionTitleCache,
  type SessionTitleCache,
  type SessionTitleReader,
} from './session-title-cache.js';

export function folderName(cwd: string): string {
  const path = win32.isAbsolute(cwd) && !posix.isAbsolute(cwd) ? win32 : posix;
  return path.basename(cwd) || path.parse(cwd).root;
}

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
  deps: Pick<BridgeMethodsDeps, 'readSessionTitles' | 'nativeSessions'>,
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
  deps: BridgeMethodsDeps;
  globalRegistry: BridgeMethodsDeps['registry'];
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

export function sessionAccessKey({ human, deps, owner }: SessionRowScope): string | undefined {
  if (owner) return undefined;
  const hidden = deps.team?.bots.privateSessions(human);
  const slugs = deps.registry
    .listHistorical()
    .map((bot) => bot.slug)
    .filter((slug) => hidden?.has(slug) !== true)
    .sort();
  return createHash('sha256').update(JSON.stringify(slugs)).digest('base64url').slice(0, 22);
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
  const assignments = new Map<string, string>();
  const seenBots = new Set<string>();
  const children = new Set<string>();
  const roots = new Set<string>();
  for (const row of rows) {
    const record = ownership.get(row.sessionId);
    if (row.parentSessionId !== undefined || record?.parentSessionId !== undefined) {
      children.add(row.sessionId);
      continue;
    }
    roots.add(row.sessionId);
    if (row.archived === true && !includeArchived) continue;
    const cwd = row.cwd ?? record?.cwdReference;
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
    };
    if (record === undefined) {
      if (owner && (source === 'all' || source === 'native'))
        sessions.push({ ...base, source: { kind: 'native' } });
      continue;
    }
    const bot = (owner ? globalRegistry : deps.registry).getHistorical(record.botSlug);
    if (bot === undefined || privateSessions?.has(bot.slug)) continue;
    if (withSources && !sources.has(`bot:${bot.slug}`))
      sources.set(`bot:${bot.slug}`, {
        kind: 'bot',
        botSlug: bot.slug,
        displayName: bot.displayName,
      });
    if (source !== 'all' && source !== `bot:${bot.slug}`) continue;
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
      ...(row.waiting === true || engine?.state === 'waiting-approval'
        ? { waiting: true as const }
        : {}),
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
  return { sessions, sources: [...sources.values()], roots, children };
}
