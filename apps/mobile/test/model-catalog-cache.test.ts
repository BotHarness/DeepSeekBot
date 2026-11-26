import { QueryClient, QueryObserver, notifyManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CATALOG_FRESH_MS,
  createModelCatalogCache,
  type CatalogHost,
  type StoredCatalog,
} from '../src/host/model-catalog-cache';

notifyManager.setScheduler((run) => run());

const answer = (model: string) => ({
  models: [{ provider: 'opencode-go', providerName: 'OpenCode Go', model, modelName: model }],
  routingGroupEngines: [],
});

function memoryStore(initial: Record<string, StoredCatalog> = {}) {
  const saved = new Map(Object.entries(initial));
  return {
    saved,
    read: vi.fn((hostId: string) => saved.get(hostId)),
    write: vi.fn((hostId: string, value: StoredCatalog) => void saved.set(hostId, value)),
  };
}

function liveHost() {
  let emit: ((resource: string | undefined) => void) | undefined;
  const host: CatalogHost = {
    call: vi.fn(),
    onResource: (listener) => {
      emit = listener;
      return () => {};
    },
  };
  return { host, emit: (resource: string | undefined) => emit?.(resource) };
}

let clock = 0;
let queries: QueryClient;
let observers: (() => void)[];

function at(time: number) {
  clock = time;
  vi.setSystemTime(time);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at(Date.UTC(2026, 10, 26));
  queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  observers = [];
});

afterEach(() => {
  for (const stop of observers) stop();
  queries.clear();
  vi.useRealTimers();
});

function setup(store = memoryStore(), names: string[] = ['first', 'second', 'third']) {
  const pending = [...names];
  const load = vi.fn(async () => answer(pending.shift() ?? 'last'));
  const cache = createModelCatalogCache({ queries, store, load });
  return { cache, load, store };
}

function observe(cache: ReturnType<typeof setup>['cache'], host: CatalogHost, hostId: string) {
  const observer = new QueryObserver(queries, cache.query(host, hostId));
  observers.push(observer.subscribe(() => {}));
  return observer;
}

const models = (observer: ReturnType<typeof observe>) =>
  observer.getCurrentResult().data?.models.map((entry) => entry.model);

async function settle() {
  await vi.waitFor(() => expect(queries.isFetching()).toBe(0));
}

describe('Session model catalog cache', () => {
  it('loads once, persists the answer and serves it from memory while fresh', async () => {
    const { cache, load, store } = setup();
    const { host } = liveHost();
    const first = observe(cache, host, 'host-a');
    await settle();
    expect(models(first)).toEqual(['first']);
    expect(store.saved.get('host-a')).toEqual({
      savedAt: expect.any(Number),
      answer: answer('first'),
    });

    at(clock + CATALOG_FRESH_MS - 1);
    await cache.revalidate(host, 'host-a');
    const again = observe(cache, host, 'host-a');
    await settle();
    expect(models(again)).toEqual(['first']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('shows a persisted catalog at once and refreshes it in the background once stale', async () => {
    const store = memoryStore({
      'host-a': { savedAt: clock - CATALOG_FRESH_MS - 1, answer: answer('saved') },
    });
    const { cache, load } = setup(store);
    const { host } = liveHost();
    const observer = observe(cache, host, 'host-a');
    expect(models(observer)).toEqual(['saved']);
    expect(observer.getCurrentResult().isFetching).toBe(true);
    await settle();
    expect(models(observer)).toEqual(['first']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not reload a persisted catalog that is still fresh', async () => {
    const store = memoryStore({ 'host-a': { savedAt: clock - 1000, answer: answer('saved') } });
    const { cache, load } = setup(store);
    const { host } = liveHost();
    const observer = observe(cache, host, 'host-a');
    await cache.revalidate(host, 'host-a');
    expect(models(observer)).toEqual(['saved']);
    expect(load).not.toHaveBeenCalled();
  });

  it('keeps each Host apart and ignores an unreadable stored answer', async () => {
    const store = memoryStore({
      'host-a': { savedAt: clock, answer: answer('saved-a') },
      'host-b': { savedAt: clock, answer: { models: 'broken' } },
    });
    const { cache, load } = setup(store);
    const { host } = liveHost();
    expect(models(observe(cache, host, 'host-a'))).toEqual(['saved-a']);
    const other = observe(cache, host, 'host-b');
    expect(models(other)).toBeUndefined();
    await settle();
    expect(models(other)).toEqual(['first']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('forces a reload while fresh and keeps the shown list until the answer arrives', async () => {
    const store = memoryStore({ 'host-a': { savedAt: clock, answer: answer('saved') } });
    const { cache, load } = setup(store);
    const { host } = liveHost();
    const observer = observe(cache, host, 'host-a');
    const refreshed = cache.refresh(host, 'host-a');
    expect(observer.getCurrentResult()).toMatchObject({ isFetching: true });
    expect(models(observer)).toEqual(['saved']);
    await refreshed;
    expect(models(observer)).toEqual(['first']);
    expect(store.saved.get('host-a')?.answer).toEqual(answer('first'));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps the cached list when a forced reload fails', async () => {
    const store = memoryStore({ 'host-a': { savedAt: clock, answer: answer('saved') } });
    const load = vi.fn().mockRejectedValue(new Error('offline'));
    const cache = createModelCatalogCache({ queries, store, load });
    const { host } = liveHost();
    const observer = observe(cache, host, 'host-a');
    await expect(cache.refresh(host, 'host-a')).rejects.toThrow('offline');
    expect(models(observer)).toEqual(['saved']);
    expect(store.saved.get('host-a')?.answer).toEqual(answer('saved'));
  });

  it('reloads when the Host reports a model source, login or account change', async () => {
    const { cache, load } = setup(memoryStore(), ['first', 'after-providers', 'after-account']);
    const { host, emit } = liveHost();
    const observer = observe(cache, host, 'host-a');
    await settle();

    emit('sessions');
    await settle();
    expect(load).toHaveBeenCalledTimes(1);

    emit('model-providers');
    await settle();
    expect(models(observer)).toEqual(['after-providers']);

    emit('account');
    await settle();
    expect(models(observer)).toEqual(['after-account']);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('marks the catalog stale on a full resync so the next open reloads it', async () => {
    const store = memoryStore({ 'host-a': { savedAt: clock, answer: answer('saved') } });
    const { cache, load } = setup(store);
    const { host, emit } = liveHost();
    observe(cache, host, 'host-a');
    observers.pop()?.();
    emit(undefined);
    await settle();
    expect(load).not.toHaveBeenCalled();
    await cache.revalidate(host, 'host-a');
    expect(load).toHaveBeenCalledTimes(1);
    expect(queries.getQueryData(cache.key('host-a'))).toMatchObject({
      models: [{ model: 'first' }],
    });
  });
});
