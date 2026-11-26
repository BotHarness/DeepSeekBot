import { MethodRefused } from '@botharness/host-client/client';
import { HostAnswerInvalid, type HostCall } from '@botharness/host-client/host-answer';
import {
  readHostSessionList,
  readHostSessionListChanges,
} from '@botharness/host-client/host-sessions';
import {
  readSessionList,
  syncSessionList,
  type SessionListSource,
  type StoredSessionList,
} from '@botharness/host-client/session-list-store';
import type { LocalStore } from '@botharness/host-client/local-store';
import type {
  HostSessionFilter,
  HostSessionRow,
  HostSessionSort,
  HostSessionSourceOption,
} from '@botharness/host-protocol/host-sessions';
import { hostStore, hostStoreAvailable } from '../../host/host-store';
import { sessionReadHost } from '../../host/session-detail';
import { watchSessionChanges, type SessionListHost } from './session-list-query';
import { mergeSessionSources, sessionRowTime, type SessionQueryRow } from './session-query-model';

export const SESSION_SYNC_PAGE = 200;

export type LocalSessionLists = {
  reads: { hostId: string; list: StoredSessionList }[];
  failed: number;
};

export function localSessionKey(hostIds: readonly string[]) {
  return ['host-sessions', [...hostIds], 'local'] as const;
}

export function storedSessionKey(hostIds: readonly string[]) {
  return ['host-sessions-stored', [...hostIds]] as const;
}

async function readAll(call: HostCall, includeArchived: boolean) {
  const sessions: HostSessionRow[] = [];
  let sources: HostSessionSourceOption[] = [];
  let cursor: string | undefined;
  do {
    const page = await readHostSessionList(call, {
      search: '',
      sort: 'last-human-turn',
      source: 'all',
      limit: SESSION_SYNC_PAGE,
      ...(includeArchived ? { includeArchived } : {}),
      ...(cursor === undefined ? {} : { cursor }),
    });
    sessions.push(...page.sessions);
    sources = page.sources ?? sources;
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return { sessions, sources };
}

export function hostSessionSource(call: HostCall): SessionListSource {
  return {
    changes: (cursor) =>
      readHostSessionListChanges(call, cursor).catch((error: unknown) => {
        if (error instanceof MethodRefused) return undefined;
        throw error;
      }),
    all: () =>
      readAll(call, true).catch((error: unknown) => {
        if (error instanceof HostAnswerInvalid) return readAll(call, false);
        throw error;
      }),
  };
}

async function storeFor(hostId: string): Promise<LocalStore | undefined> {
  if (!hostStoreAvailable()) return undefined;
  return hostStore(hostId).catch(() => undefined);
}

export async function readLocalSessionLists(
  hosts: readonly SessionListHost[],
  signal: AbortSignal,
): Promise<LocalSessionLists> {
  const settled = await Promise.allSettled(
    hosts.map(async (host) => {
      watchSessionChanges(host);
      const source = hostSessionSource(sessionReadHost(host.client, signal));
      const store = await storeFor(host.hostId);
      const list = store === undefined ? await source.all() : await syncSessionList(store, source);
      return { hostId: host.hostId, list };
    }),
  );
  const reads = settled.flatMap((entry) => (entry.status === 'fulfilled' ? [entry.value] : []));
  if (reads.length === 0 && settled.length > 0) {
    const failure = settled.find((entry) => entry.status === 'rejected');
    throw failure?.status === 'rejected' ? failure.reason : new Error('Session list unavailable');
  }
  return { reads, failed: settled.length - reads.length };
}

export async function readStoredSessionLists(
  hosts: readonly Pick<SessionListHost, 'hostId'>[],
): Promise<LocalSessionLists | null> {
  const reads = (
    await Promise.all(
      hosts.map(async (host) => {
        const store = await storeFor(host.hostId);
        const list =
          store === undefined ? undefined : await readSessionList(store).catch(() => undefined);
        return list === undefined ? [] : [{ hostId: host.hostId, list }];
      }),
    )
  ).flat();
  return reads.length === 0 ? null : { reads, failed: 0 };
}

export function localSessionClock(row: HostSessionRow, sort: HostSessionSort): number {
  if (sort === 'created') return row.createdAt ?? row.updatedAt;
  if (sort === 'last-activity') return row.updatedAt;
  return row.lastPromptAt ?? -1;
}

function withIdentity(
  row: HostSessionRow,
  bots: ReadonlyMap<string, Extract<HostSessionSourceOption, { kind: 'bot' }>>,
): HostSessionRow | undefined {
  if (row.source.kind !== 'bot') return row;
  const bot = bots.get(row.source.botSlug);
  if (bot === undefined) return undefined;
  return { ...row, source: { ...bot } };
}

export function localSessionRows(
  lists: LocalSessionLists | null | undefined,
  hosts: readonly Pick<SessionListHost, 'hostId' | 'hostName'>[],
  source: HostSessionFilter,
  sort: HostSessionSort = 'last-human-turn',
): SessionQueryRow[] | undefined {
  if (lists === undefined || lists === null) return undefined;
  const names = new Map(hosts.map((host) => [host.hostId, host.hostName]));
  return lists.reads
    .flatMap(({ hostId, list }) => {
      const bots = new Map(
        list.sources.flatMap((option) => (option.kind === 'bot' ? [[option.botSlug, option]] : [])),
      );
      const known = list.sources.length > 0;
      return list.sessions.flatMap((stored): SessionQueryRow[] => {
        if (stored.archived === true) return [];
        const row = known ? withIdentity(stored, bots) : stored;
        if (row === undefined) return [];
        if (
          source !== 'all' &&
          (source === 'native'
            ? row.source.kind !== 'native'
            : row.source.kind !== 'bot' || `bot:${row.source.botSlug}` !== source)
        )
          return [];
        return [
          {
            ...row,
            sortedAt: localSessionClock(row, sort),
            hostId,
            hostName: names.get(hostId) ?? hostId,
          },
        ];
      });
    })
    .sort(
      (a, b) =>
        localSessionClock(b, sort) - localSessionClock(a, sort) ||
        b.updatedAt - a.updatedAt ||
        a.hostId.localeCompare(b.hostId) ||
        a.sessionId.localeCompare(b.sessionId),
    );
}

export function localTitleMatches(
  rows: readonly SessionQueryRow[] | undefined,
  search: string,
): SessionQueryRow[] | undefined {
  const query = search.trim().replace(/\s+/gu, ' ').toLowerCase();
  if (rows === undefined || query === '') return rows === undefined ? undefined : [...rows];
  return rows.filter(
    (row) =>
      row.title !== undefined && row.title.replace(/\s+/gu, ' ').toLowerCase().includes(query),
  );
}

export function mergeSearchRows(
  local: readonly SessionQueryRow[] | undefined,
  host: readonly SessionQueryRow[] | undefined,
): SessionQueryRow[] | undefined {
  if (local === undefined && host === undefined) return undefined;
  const rows = new Map<string, SessionQueryRow>();
  for (const row of [...(local ?? []), ...(host ?? [])])
    rows.set(`${row.hostId}:${row.sessionId}`, row);
  return [...rows.values()].sort(
    (a, b) =>
      sessionRowTime(b) - sessionRowTime(a) ||
      b.updatedAt - a.updatedAt ||
      a.hostId.localeCompare(b.hostId) ||
      a.sessionId.localeCompare(b.sessionId),
  );
}

export function localSessionSources(
  lists: LocalSessionLists | null | undefined,
): HostSessionSourceOption[] | undefined {
  if (lists === undefined || lists === null) return undefined;
  return mergeSessionSources(lists.reads.map(({ list }) => list.sources));
}
