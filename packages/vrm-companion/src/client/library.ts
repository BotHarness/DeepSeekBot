export type StoredModel = { name: string; file: Blob };

const DATABASE = 'botharness-vrm-companion';
const STORE = 'models';

const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const run = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const database = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
};

export async function loadModel(botId: string): Promise<StoredModel | undefined> {
  try {
    const value = await run<unknown>('readonly', (store) => store.get(botId));
    if (
      value &&
      typeof value === 'object' &&
      typeof (value as StoredModel).name === 'string' &&
      (value as StoredModel).file instanceof Blob
    )
      return value as StoredModel;
    return undefined;
  } catch {
    return undefined;
  }
}

export async function saveModel(botId: string, model: StoredModel): Promise<boolean> {
  try {
    await run('readwrite', (store) => store.put(model, botId));
    return true;
  } catch {
    return false;
  }
}

export async function forgetModel(botId: string): Promise<void> {
  try {
    await run('readwrite', (store) => store.delete(botId));
  } catch {
    return;
  }
}
