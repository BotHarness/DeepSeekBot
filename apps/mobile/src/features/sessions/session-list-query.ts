import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import type { HostClient } from '@botharness/host-client/client';
import { readHostSessionList } from '@botharness/host-client/host-sessions';
import type {
  HostSessionFilter,
  HostSessionRow,
  HostSessionSort,
  HostSessionSourceOption,
} from '@botharness/host-protocol/host-sessions';
import { sessionReadHost } from '../../host/session-detail';
import { mergeSessionRows, mergeSessionSources, type SessionQueryRow } from './session-query-model';

export const SESSION_PAGE_SIZE = 50;
const SESSION_LIST_KEY = 'host-sessions';

export const sessionQueries = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 30 * 60 * 1000 } },
});

export type SessionListHost = { hostId: string; hostName: string; client: HostClient };
export type SessionListOptions = {
  sort: HostSessionSort;
  source: HostSessionFilter;
  search: string;
};
export type SessionCursors = Readonly<Record<string, string>>;
export type SessionListPage = {
  reads: { hostId: string; rows: readonly HostSessionRow[]; sources: HostSessionSourceOption[] }[];
  failed: number;
  cursors: SessionCursors;
};

export type SessionListData = InfiniteData<SessionListPage, unknown>;

export function sessionListKey(hostIds: readonly string[], options: SessionListOptions) {
  return [SESSION_LIST_KEY, [...hostIds], options.sort, options.source, options.search] as const;
}

function keyHasHost(key: readonly unknown[], hostId: string): boolean {
  return key[0] === SESSION_LIST_KEY && Array.isArray(key[1]) && key[1].includes(hostId);
}

const watched = new WeakSet<HostClient>();

export function watchSessionChanges(host: Pick<SessionListHost, 'hostId' | 'client'>): void {
  if (watched.has(host.client) || host.client.onResource === undefined) return;
  watched.add(host.client);
  host.client.onResource((resource) => {
    if (resource !== undefined && resource !== 'sessions') return;
    void sessionQueries.invalidateQueries({
      predicate: (query) => keyHasHost(query.queryKey, host.hostId),
    });
  });
}

export async function readSessionListPage(
  hosts: readonly SessionListHost[],
  options: SessionListOptions,
  cursors: SessionCursors | undefined,
  signal: AbortSignal,
): Promise<SessionListPage> {
  const targets =
    cursors === undefined ? hosts : hosts.filter((host) => cursors[host.hostId] !== undefined);
  const settled = await Promise.allSettled(
    targets.map(async (host) => {
      watchSessionChanges(host);
      const cursor = cursors?.[host.hostId];
      const value = await readHostSessionList(sessionReadHost(host.client, signal), {
        ...options,
        limit: SESSION_PAGE_SIZE,
        ...(cursor === undefined ? {} : { cursor }),
      });
      return { host, value };
    }),
  );
  const read = settled.flatMap((entry) => (entry.status === 'fulfilled' ? [entry.value] : []));
  if (read.length === 0 && settled.length > 0) {
    const failure = settled.find((entry) => entry.status === 'rejected');
    throw failure?.status === 'rejected' ? failure.reason : new Error('Session list unavailable');
  }
  const next: Record<string, string> = {};
  for (const { host, value } of read)
    if (value.nextCursor !== undefined) next[host.hostId] = value.nextCursor;
  return {
    reads: read.map(({ host, value }) => ({
      hostId: host.hostId,
      rows: value.sessions,
      sources: value.sources ?? [],
    })),
    failed: settled.length - read.length,
    cursors: next,
  };
}

export function nextSessionCursors(last: SessionListPage): SessionCursors | undefined {
  return Object.keys(last.cursors).length === 0 ? undefined : last.cursors;
}

export function sessionListRows(
  data: SessionListData | undefined,
  hosts: readonly Pick<SessionListHost, 'hostId' | 'hostName'>[],
): SessionQueryRow[] | undefined {
  if (data === undefined) return undefined;
  return mergeSessionRows(
    hosts.flatMap((host) => {
      const seen = new Set<string>();
      const rows = data.pages
        .flatMap((page) => page.reads.filter((read) => read.hostId === host.hostId))
        .flatMap((read) => read.rows)
        .filter((row) => !seen.has(row.sessionId) && seen.add(row.sessionId));
      return data.pages.some((page) => page.reads.some((read) => read.hostId === host.hostId))
        ? [{ hostId: host.hostId, hostName: host.hostName, rows }]
        : [];
    }),
  );
}

export function sessionListSources(
  data: SessionListData | undefined,
): HostSessionSourceOption[] | undefined {
  if (data === undefined) return undefined;
  return mergeSessionSources(data.pages.flatMap((page) => page.reads.map((read) => read.sources)));
}

export function sessionListPartlyFailed(data: SessionListData | undefined): boolean {
  return data?.pages.some((page) => page.failed > 0) ?? false;
}
