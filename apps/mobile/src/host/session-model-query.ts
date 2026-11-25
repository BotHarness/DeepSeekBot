import { QueryClient } from '@tanstack/react-query';
import type { HostCall } from '@botharness/host-client/host-answer';
import { loadSessionModelCatalog } from '@botharness/host-client/model-catalog';
import { sessionModel } from '@botharness/host-client/session-model';
import type { SessionModelState } from '@botharness/host-protocol/session-model';

export type SessionModelCatalog = Awaited<ReturnType<typeof loadSessionModelCatalog>>;

export const sessionModelQueries = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 30 * 60 * 1000 } },
});

const CATALOG_STALE = 60 * 1000;
const hosts = new WeakMap<HostCall, number>();
let nextHost = 0;

function hostKey(host: HostCall): number {
  let key = hosts.get(host);
  if (key === undefined) {
    key = nextHost++;
    hosts.set(host, key);
  }
  return key;
}

export function catalogQuery(host: HostCall) {
  return {
    queryKey: ['session-model-catalog', hostKey(host)] as const,
    queryFn: (): Promise<SessionModelCatalog> => loadSessionModelCatalog(host),
    staleTime: CATALOG_STALE,
  };
}

export function stateQuery(host: HostCall, slug: string | null, sessionId: string | undefined) {
  return {
    queryKey: ['session-model', hostKey(host), slug, sessionId ?? null] as const,
    queryFn: (): Promise<SessionModelState> => sessionModel(host, slug, sessionId),
    staleTime: 0,
  };
}
