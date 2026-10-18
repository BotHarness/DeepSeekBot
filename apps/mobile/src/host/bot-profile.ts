import { loadProfileActivity } from './bot-activity';
import type { HostClient, RosterChannel, RosterView } from './client';
import type {
  BotScheduleSummary,
  MemoryFile,
  MemorySnapshot,
  ProfileActivity,
  WorkspaceGrantSummary,
} from './wire';

export type ProfilePart<T> =
  | { status: 'ready'; value: T; staleError?: string }
  | { status: 'failed'; error: string };

export interface ProfileMemory {
  files: string[];
}

export type MemoryEntry =
  | { kind: 'folder'; name: string; path: string; count: number }
  | { kind: 'file'; name: string; path: string };

export interface ProfileBotRef {
  slug: string;
  displayName?: string;
  dmChannelId?: string;
}

export interface BotProfile {
  identity: ProfilePart<string | undefined>;
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
              identity: keepSuccessful(next.identity, value?.identity),
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

const SOUL = 'SOUL.md';

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
  return (await client.call<{ snapshot: MemorySnapshot }>('memorySnapshot', { channelId }))
    .snapshot;
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

export async function loadBotProfile(client: HostClient, bot: ProfileBotRef): Promise<BotProfile> {
  const channel = dmChannel(client, bot);
  const snapshot = channel.then(async (channelId) => ({
    channelId,
    snapshot: await snapshotOf(client, channelId),
  }));
  const soul = async () => {
    const { channelId, snapshot: current } = await snapshot;
    const path = current.standing.find((entry) => entry.role === 'soul')?.path ?? SOUL;
    if (!current.files.includes(path)) return undefined;
    const { file } = await client.call<{ file?: MemoryFile }>('memoryFile', { channelId, path });
    return file === undefined || file.binary === true || file.body.trim() === ''
      ? undefined
      : file.body.trim();
  };
  const [identity, memory, routines, files, activity] = await Promise.all([
    settle(soul()),
    settle(snapshot.then(({ snapshot: current }): ProfileMemory => ({ files: current.files }))),
    settle(
      client
        .call<{ schedules: BotScheduleSummary[] }>('scheduleList', { slug: bot.slug })
        .then((result) => result.schedules),
    ),
    settle(
      client
        .call<{ grants: WorkspaceGrantSummary[] }>('grants', { slug: bot.slug })
        .then((result) => result.grants.filter((grant) => grant.revokedAt === undefined)),
    ),
    settle(channel.then((channelId) => loadProfileActivity(client, channelId, { weeks: 1 }))),
  ]);
  return { identity, memory, routines, files, activity };
}

export function botChannels(roster: RosterView | undefined, slug: string): RosterChannel[] {
  return roster?.channels.filter((channel) => channel.members.includes(slug)) ?? [];
}
import { QueryClient } from '@tanstack/react-query';
