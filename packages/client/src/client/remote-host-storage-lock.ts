import type { HostStorage } from './remote-hosts.js';

const localQueues = new WeakMap<HostStorage, Map<string, Promise<unknown>>>();
function browserStorage(storage: HostStorage): boolean {
  try {
    return storage === globalThis.localStorage;
  } catch {
    return false;
  }
}

export function withRemoteHostCredentialWrite<T>(options: {
  storage: HostStorage;
  run(): T;
}): Promise<T> {
  if (!browserStorage(options.storage))
    return withRemoteHostStorageLock({ ...options, name: 'credentials' });
  const indexedDB = globalThis.indexedDB;
  if (!indexedDB) return Promise.reject(new Error('client-storage-lock-unavailable'));
  return new Promise<T>((resolve, reject) => {
    let database: IDBDatabase | undefined;
    let transaction: IDBTransaction | undefined;
    let settled = false;
    let result: T;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      database?.close();
      if (error) reject(error);
      else resolve(result);
    };
    const timeout = setTimeout(() => {
      transaction?.abort();
      finish(new Error('client-storage-lock-cancelled'));
    }, 15_000);
    let opening: IDBOpenDBRequest;
    try {
      opening = indexedDB.open('botharness-client-coordination', 1);
    } catch {
      finish(new Error('client-storage-lock-unavailable'));
      return;
    }
    opening.onupgradeneeded = () => {
      opening.result.createObjectStore('credential-writes');
    };
    opening.onerror = () => finish(new Error('client-storage-lock-unavailable'));
    opening.onsuccess = () => {
      database = opening.result;
      if (settled) {
        database.close();
        return;
      }
      try {
        transaction = database.transaction('credential-writes', 'readwrite');
        transaction.onerror = () => finish(new Error('client-storage-write-failed'));
        transaction.onabort = () => finish(new Error('client-storage-write-failed'));
        transaction.oncomplete = () => finish();
        const request = transaction.objectStore('credential-writes').get('serialize');
        request.onsuccess = () => {
          if (settled) return;
          try {
            result = options.run();
          } catch (error) {
            transaction?.abort();
            finish(error instanceof Error ? error : new Error('client-storage-write-failed'));
          }
        };
      } catch {
        finish(new Error('client-storage-lock-unavailable'));
      }
    };
  });
}

export async function withRemoteHostStorageLock<T>(options: {
  storage: HostStorage;
  name: string;
  run(): Promise<T> | T;
  signal?: AbortSignal;
}): Promise<T> {
  const abort = new AbortController();
  const cancel = () => abort.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) abort.abort();
  const timeout = setTimeout(() => abort.abort(), 15_000);
  const run = () => {
    clearTimeout(timeout);
    if (abort.signal.aborted) throw new Error('client-storage-lock-cancelled');
    return options.run();
  };
  try {
    const locks = globalThis.navigator?.locks;
    if (locks)
      return await locks.request(
        `botharness:remote-hosts:${options.name}`,
        { mode: 'exclusive', signal: abort.signal },
        run,
      );
    if (browserStorage(options.storage)) throw new Error('client-storage-lock-unavailable');
    let queues = localQueues.get(options.storage);
    if (!queues) {
      queues = new Map();
      localQueues.set(options.storage, queues);
    }
    const prior = queues.get(options.name) ?? Promise.resolve();
    const operation = prior.catch(() => undefined).then(run);
    queues.set(options.name, operation);
    try {
      return await operation;
    } finally {
      if (queues.get(options.name) === operation) queues.delete(options.name);
    }
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
  }
}
