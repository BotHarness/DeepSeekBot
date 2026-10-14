import type { HostClient, RosterChannel, RosterView } from './client';
import type { BotScheduleSummary, MemoryFile, MemorySnapshot, WorkspaceGrantSummary } from './wire';

export type ProfilePart<T> = { status: 'ready'; value: T } | { status: 'failed'; error: string };

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

function dmChannel(client: HostClient, bot: ProfileBotRef): Promise<string> {
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
  const snapshot = dmChannel(client, bot).then(async (channelId) => ({
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
  const [identity, memory, routines, files] = await Promise.all([
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
  ]);
  return { identity, memory, routines, files };
}

export function botChannels(roster: RosterView | undefined, slug: string): RosterChannel[] {
  return roster?.channels.filter((channel) => channel.members.includes(slug)) ?? [];
}
