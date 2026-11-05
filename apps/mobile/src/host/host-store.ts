import { LocalStoreError, type LocalStore } from './local-store';

export interface HostStoreOpener {
  open(hostId: string): Promise<LocalStore>;
  remove(hostId: string): Promise<void>;
  size?(hostId: string): number;
}

let opener: HostStoreOpener | undefined;
const stores = new Map<string, Promise<LocalStore>>();

export function installHostStoreOpener(next: HostStoreOpener | undefined): void {
  opener = next;
  stores.clear();
}

export function hostStoreAvailable(): boolean {
  return opener !== undefined;
}

export function hostStore(hostId: string): Promise<LocalStore> {
  const existing = stores.get(hostId);
  if (existing !== undefined) return existing;
  if (opener === undefined)
    return Promise.reject(
      new LocalStoreError('local-store/closed', 'The local store is not available.'),
    );
  const opening = opener.open(hostId);
  stores.set(hostId, opening);
  opening.catch(() => {
    if (stores.get(hostId) === opening) stores.delete(hostId);
  });
  return opening;
}

export async function closeHostStore(hostId: string): Promise<void> {
  const opening = stores.get(hostId);
  stores.delete(hostId);
  const store = await opening?.catch(() => undefined);
  await store?.close();
}

export async function deleteHostStore(hostId: string): Promise<void> {
  await closeHostStore(hostId);
  await opener?.remove(hostId);
}

export function hostStoreSize(hostId: string): number {
  try {
    return opener?.size?.(hostId) ?? 0;
  } catch {
    return 0;
  }
}
