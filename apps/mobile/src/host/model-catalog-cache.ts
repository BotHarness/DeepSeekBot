import type { QueryClient } from '@tanstack/react-query';
import type { HostCall } from '@botharness/host-client/host-answer';
import {
  loadSessionModelCatalogAnswer,
  parseSessionModelCatalog,
} from '@botharness/host-client/model-catalog';

export type SessionModelCatalog = ReturnType<typeof parseSessionModelCatalog>;

export const CATALOG_FRESH_MS = 5 * 60 * 1000;

export const CATALOG_CHANGES: ReadonlySet<string> = new Set([
  'model-providers',
  'engine-device-login',
  'account',
]);

export type StoredCatalog = { savedAt: number; answer: unknown };

export interface CatalogStore {
  read(hostId: string): StoredCatalog | undefined;
  write(hostId: string, value: StoredCatalog): void;
}

export interface CatalogHost {
  call: HostCall['call'];
  onResource?: ((listener: (resource: string | undefined) => void) => () => void) | undefined;
}

export interface ModelCatalogCacheOptions {
  queries: QueryClient;
  store: CatalogStore;
  load?: (host: HostCall) => Promise<unknown>;
}

const CATALOG_KEY = 'session-model-catalog';

function restore(store: CatalogStore, hostId: string) {
  try {
    const stored = store.read(hostId);
    if (stored === undefined) return undefined;
    return { savedAt: stored.savedAt, catalog: parseSessionModelCatalog(stored.answer) };
  } catch {
    return undefined;
  }
}

export function createModelCatalogCache({
  queries,
  store,
  load = loadSessionModelCatalogAnswer,
}: ModelCatalogCacheOptions) {
  const watched = new WeakMap<CatalogHost, Set<string>>();
  const restored = new Map<string, ReturnType<typeof restore>>();
  const key = (hostId: string) => [CATALOG_KEY, hostId] as const;

  function stored(hostId: string) {
    if (!restored.has(hostId)) restored.set(hostId, restore(store, hostId));
    return restored.get(hostId);
  }

  function watch(host: CatalogHost, hostId: string) {
    if (host.onResource === undefined) return;
    let ids = watched.get(host);
    if (ids === undefined) {
      const seen = new Set<string>();
      ids = seen;
      watched.set(host, seen);
      host.onResource((resource) => {
        if (resource !== undefined && !CATALOG_CHANGES.has(resource)) return;
        for (const id of seen) void invalidate(id);
      });
    }
    ids.add(hostId);
  }

  function query(host: CatalogHost, hostId: string) {
    watch(host, hostId);
    return {
      queryKey: key(hostId),
      queryFn: async (): Promise<SessionModelCatalog> => {
        const answer = await load(host);
        const catalog = parseSessionModelCatalog(answer);
        const savedAt = Date.now();
        try {
          store.write(hostId, { savedAt, answer });
        } catch {}
        restored.set(hostId, { savedAt, catalog });
        return catalog;
      },
      staleTime: CATALOG_FRESH_MS,
      initialData: () => stored(hostId)?.catalog,
      initialDataUpdatedAt: () => stored(hostId)?.savedAt,
    };
  }

  function invalidate(hostId: string) {
    const kept = restored.get(hostId);
    if (kept !== undefined) restored.set(hostId, { ...kept, savedAt: 0 });
    return queries.invalidateQueries({ queryKey: key(hostId) });
  }

  return {
    key,
    query,
    refresh(host: CatalogHost, hostId: string) {
      return queries.fetchQuery({ ...query(host, hostId), staleTime: 0 });
    },
    revalidate(host: CatalogHost, hostId: string) {
      return queries.prefetchQuery(query(host, hostId));
    },
    invalidate,
  };
}

export type ModelCatalogCache = ReturnType<typeof createModelCatalogCache>;
