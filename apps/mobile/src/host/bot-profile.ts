import { loadProfileActivity } from './bot-activity';
import { MethodRefused, type HostClient, type RosterChannel, type RosterView } from './client';
import type {
  BotScheduleSummary,
  MemoryFile,
  MemorySnapshot,
  MemoryStanding,
  ProfileActivity,
  WorkspaceGrantSummary,
} from './wire';

export type ProfilePart<T> =
  | { status: 'ready'; value: T; staleError?: string }
  | { status: 'failed'; error: string };

export type PinnedRole = MemoryStanding['role'];

export interface PinnedMemory {
  role: PinnedRole;
  path: string;
  present: boolean;
}

export type ProfileMemory =
  | { status: 'attached'; files: string[]; pinned: PinnedMemory[] }
  | { status: 'unavailable' };

export type MemoryEntry =
  | { kind: 'folder'; name: string; path: string; count: number }
  | { kind: 'file'; name: string; path: string; role?: PinnedRole };

export interface ProfileBotRef {
  slug: string;
  displayName?: string;
  dmChannelId?: string;
}

export interface ProfileAssignment {
  sessionId: string;
  botSlug?: string;
  title: string;
  description?: string;
  activity: 'working' | 'idle' | 'error' | 'stopping' | 'stopped';
  latestReport?: {
    state: 'progress' | 'completed' | 'blocked' | 'waiting-human' | 'failed';
    summary: string;
    at: string;
  };
  archivedAt?: string;
  updatedAt: string;
}

export interface BotProfile {
  work: ProfilePart<ProfileAssignment[]>;
  memory: ProfilePart<ProfileMemory>;
  routines: ProfilePart<BotScheduleSummary[]>;
  files: ProfilePart<WorkspaceGrantSummary[]>;
  activity: ProfilePart<ProfileActivity>;
}

export interface BotProfileResource {
  peek(): BotProfile | undefined;
  refresh(): Promise<BotProfile>;
}

const profiles = new WeakMap<
  HostClient,
  { queries: QueryClient; resources: Map<string, BotProfileResource> }
>();
const PROFILE_CACHE_LIMIT = 24;

function keepSuccessful<T>(
  next: ProfilePart<T>,
  previous: ProfilePart<T> | undefined,
): ProfilePart<T> {
  return next.status === 'failed' && previous?.status === 'ready'
    ? { ...previous, staleError: next.error }
    : next;
}

export function botProfileResource(client: HostClient, bot: ProfileBotRef): BotProfileResource {
  let owner = profiles.get(client);
  if (owner === undefined) {
    owner = {
      queries: new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 10 * 60 * 1000 } },
      }),
      resources: new Map(),
    };
    profiles.set(client, owner);
  }
  const { queries, resources: cache } = owner;
  const key = `${bot.slug}:${bot.dmChannelId ?? ''}`;
  const queryKey = ['bot-profile', key];
  const existing = cache.get(key);
  if (existing !== undefined) {
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }
  let pending: Promise<BotProfile> | undefined;
  const resource: BotProfileResource = {
    peek: () => queries.getQueryData<BotProfile>(queryKey),
    refresh() {
      pending ??= queries
        .fetchQuery({
          queryKey,
          staleTime: 0,
          queryFn: async () => {
            const next = await loadBotProfile(client, bot);
            const value = queries.getQueryData<BotProfile>(queryKey);
            return {
              work: keepSuccessful(next.work, value?.work),
              memory: keepSuccessful(next.memory, value?.memory),
              routines: keepSuccessful(next.routines, value?.routines),
              files: keepSuccessful(next.files, value?.files),
              activity: keepSuccessful(next.activity, value?.activity),
            };
          },
        })
        .finally(() => {
          pending = undefined;
        });
      return pending;
    },
  };
  cache.set(key, resource);
  if (cache.size > PROFILE_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
      queries.removeQueries({ queryKey: ['bot-profile', oldest], exact: true });
    }
  }
  return resource;
}

const PINNED: readonly { role: PinnedRole; path: string }[] = [
  { role: 'soul', path: 'SOUL.md' },
  { role: 'coreMemory', path: 'MEMORY.md' },
];

export function pinnedMemory(snapshot: Pick<MemorySnapshot, 'files' | 'standing'>): PinnedMemory[] {
  return PINNED.map(({ role, path: fallback }) => {
    const path = snapshot.standing.find((entry) => entry.role === role)?.path ?? fallback;
    return { role, path, present: snapshot.files.includes(path) };
  });
}

export function profileMemory(snapshot: MemorySnapshot): ProfileMemory {
  return { status: 'attached', files: snapshot.files, pinned: pinnedMemory(snapshot) };
}

export function memoryUnavailable(error: unknown): boolean {
  return error instanceof MethodRefused && error.code === 'memory-unavailable';
}

function settle<T>(work: Promise<T>): Promise<ProfilePart<T>> {
  return work.then(
    (value) => ({ status: 'ready', value }),
    (error: unknown) => ({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}

export function dmChannel(client: HostClient, bot: ProfileBotRef): Promise<string> {
  if (bot.dmChannelId !== undefined) return Promise.resolve(bot.dmChannelId);
  return client
    .call<{ channel: { id: string } }>('channelDm', {
      slug: bot.slug,
      ...(bot.displayName === undefined ? {} : { displayName: bot.displayName }),
    })
    .then((result) => result.channel.id);
}

async function snapshotOf(client: HostClient, channelId: string): Promise<MemorySnapshot> {
  return (
    await client.call<{ snapshot: MemorySnapshot }>('memorySnapshot', {
      channelId,
    })
  ).snapshot;
}

export async function loadMemoryFiles(client: HostClient, bot: ProfileBotRef): Promise<string[]> {
  return (await snapshotOf(client, await dmChannel(client, bot))).files;
}

export async function loadMemoryFile(
  client: HostClient,
  bot: ProfileBotRef,
  path: string,
): Promise<MemoryFile | undefined> {
  const channelId = await dmChannel(client, bot);
  return (await client.call<{ file?: MemoryFile }>('memoryFile', { channelId, path })).file;
}

export async function loadBotActivity(
  client: HostClient,
  bot: ProfileBotRef,
  window: { weeks: number; before?: string },
): Promise<ProfileActivity> {
  return loadProfileActivity(client, await dmChannel(client, bot), window);
}

export function memoryEntries(files: readonly string[], folder: string): MemoryEntry[] {
  const prefix = folder === '' ? '' : `${folder}/`;
  const folders = new Map<string, number>();
  const leaves: MemoryEntry[] = [];
  for (const file of files) {
    if (!file.startsWith(prefix)) continue;
    const rest = file.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash === -1) leaves.push({ kind: 'file', name: rest, path: file });
    else {
      const name = rest.slice(0, slash);
      folders.set(name, (folders.get(name) ?? 0) + 1);
    }
  }
  const byName = (a: MemoryEntry, b: MemoryEntry) => a.name.localeCompare(b.name);
  return [...folders]
    .map(([name, count]): MemoryEntry => ({
      kind: 'folder',
      name,
      path: `${prefix}${name}`,
      count,
    }))
    .sort(byName)
    .concat(leaves.sort(byName));
}

export function memoryRouteParams(slug: string, entry: MemoryEntry) {
  return {
    slug,
    path: entry.path,
    kind: entry.kind,
    ...(entry.kind === 'file' && entry.role !== undefined ? { role: entry.role } : {}),
  };
}

export function unpinnedEntries(files: readonly string[], pinned: readonly PinnedMemory[]) {
  const paths = new Set(pinned.map((entry) => entry.path));
  return memoryEntries(files, '').filter(
    (entry) => entry.kind === 'folder' || !paths.has(entry.path),
  );
}

export async function loadBotProfile(client: HostClient, bot: ProfileBotRef): Promise<BotProfile> {
  const channel = dmChannel(client, bot);
  const snapshot = channel.then((channelId) => snapshotOf(client, channelId));
  const [work, memory, routines, files, activity] = await Promise.all([
    settle(
      client
        .call<{
          assignments: ProfileAssignment[];
        }>('assignments', { slug: bot.slug })
        .then((result) => workRows(result.assignments)),
    ),
    settle(
      snapshot.then(
        (current) => profileMemory(current),
        (error: unknown): ProfileMemory => {
          if (memoryUnavailable(error)) return { status: 'unavailable' };
          throw error;
        },
      ),
    ),
    settle(
      client
        .call<{
          schedules: BotScheduleSummary[];
        }>('scheduleList', { slug: bot.slug })
        .then((result) => result.schedules),
    ),
    settle(
      client
        .call<{
          grants: WorkspaceGrantSummary[];
        }>('grants', { slug: bot.slug })
        .then((result) => result.grants.filter((grant) => grant.revokedAt === undefined)),
    ),
    settle(channel.then((channelId) => loadProfileActivity(client, channelId, { weeks: 1 }))),
  ]);
  return { work, memory, routines, files, activity };
}

export function workRows(assignments: readonly ProfileAssignment[]): ProfileAssignment[] {
  return assignments
    .filter((assignment) => assignment.archivedAt === undefined)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function botChannels(roster: RosterView | undefined, slug: string): RosterChannel[] {
  return roster?.channels.filter((channel) => channel.members.includes(slug)) ?? [];
}
import { QueryClient } from '@tanstack/react-query';
