import { QueryClient } from '@tanstack/react-query';
import type { HostCall } from '@botharness/host-client/host-answer';
import { sessionModel } from '@botharness/host-client/session-model';
import type { SessionModelState } from '@botharness/host-protocol/session-model';

import { createModelCatalogCache } from './model-catalog-cache';
import { nativeModelCatalogStore } from './native-model-catalog';

export type { SessionModelCatalog } from './model-catalog-cache';

export const sessionModelQueries = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 30 * 60 * 1000 } },
});

export const modelCatalogCache = createModelCatalogCache({
  queries: sessionModelQueries,
  store: nativeModelCatalogStore,
});

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

export function stateQuery(host: HostCall, slug: string | null, sessionId: string | undefined) {
  return {
    queryKey: ['session-model', hostKey(host), slug, sessionId ?? null] as const,
    queryFn: (): Promise<SessionModelState> => sessionModel(host, slug, sessionId),
    staleTime: 0,
  };
}
