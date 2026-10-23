import type {
  MarketplaceClient,
  MarketplaceDetail,
  MarketplacePage,
  MarketplaceQuery,
  MarketplaceResult,
  MarketplaceTopic,
} from '../../../../packages/core/src/marketplace/client';
import type { MarketplaceLanguage } from '../../../../packages/core/src/marketplace/language';

export interface CatalogueSnapshot<T> {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  busy: boolean;
  value?: T;
  error?: string;
}

export interface CatalogueResource<T> {
  getSnapshot(): CatalogueSnapshot<T>;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
}

export interface CatalogueList extends CatalogueResource<MarketplacePage> {
  more(): Promise<void>;
}

function resource<T>(load: () => Promise<MarketplaceResult<T>>) {
  let snapshot: CatalogueSnapshot<T> = { status: 'idle', busy: false };
  const listeners = new Set<() => void>();
  let pending: Promise<void> | undefined;
  const publish = (next: CatalogueSnapshot<T>) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const run = (request: () => Promise<MarketplaceResult<T>>): Promise<void> => {
    if (pending) return pending;
    publish({
      ...snapshot,
      status: snapshot.value === undefined ? 'loading' : 'ready',
      busy: true,
    });
    pending = Promise.resolve()
      .then(request)
      .then(
        (result) => {
          if (result.ok) publish({ status: 'ready', busy: false, value: result.value });
          else
            publish({
              ...snapshot,
              status: snapshot.value === undefined ? 'failed' : 'ready',
              busy: false,
              error: result.code,
            });
        },
        () =>
          publish({
            ...snapshot,
            status: snapshot.value === undefined ? 'failed' : 'ready',
            busy: false,
            error: 'marketplace-unavailable',
          }),
      )
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh: () => run(load),
    run,
  };
}

function cached<T>(cache: Map<string, T>, key: string, create: () => T): T {
  const existing = cache.get(key);
  const value = existing ?? create();
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > 24) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return value;
}

export function createMobileMarketplace(
  client: Pick<MarketplaceClient, 'list' | 'detail' | 'topics'>,
) {
  const lists = new Map<string, CatalogueList>();
  const details = new Map<string, CatalogueResource<MarketplaceDetail>>();
  const topics: CatalogueResource<MarketplaceTopic[]> = resource(() => client.topics());
  return {
    topics,
    list(query: Omit<MarketplaceQuery, 'cursor'>): CatalogueList {
      const normalized = {
        lang: query.lang ?? 'en',
        sort: query.sort ?? 'updated',
        q: query.q?.trim() ?? '',
        topic: query.topic ?? '',
      };
      return cached(lists, JSON.stringify(normalized), () => {
        const list = resource(() => client.list(normalized));
        return {
          getSnapshot: list.getSnapshot,
          subscribe: list.subscribe,
          refresh: list.refresh,
          more() {
            const previous = list.getSnapshot().value;
            if (!previous?.nextCursor) return Promise.resolve();
            return list.run(async () => {
              const result = await client.list({ ...normalized, cursor: previous.nextCursor! });
              if (!result.ok) return result;
              if (result.value.nextCursor === previous.nextCursor)
                return { ok: false, code: 'marketplace-unavailable' };
              const ids = new Set(previous.bots.map((bot) => bot.id));
              const bots = [
                ...previous.bots,
                ...result.value.bots.filter((bot) => {
                  if (ids.has(bot.id)) return false;
                  ids.add(bot.id);
                  return true;
                }),
              ];
              return { ok: true, value: { ...result.value, bots } };
            });
          },
        };
      });
    },
    detail(id: string, lang: MarketplaceLanguage): CatalogueResource<MarketplaceDetail> {
      return cached(details, JSON.stringify([id, lang]), () =>
        resource(() => client.detail(id, lang)),
      );
    },
  };
}
