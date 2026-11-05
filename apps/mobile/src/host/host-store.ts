import { LocalStoreError, type LocalStore } from './local-store';

export interface HostStoreOpener {
  open(hostId: string): Promise<LocalStore>;
  remove(hostId: string): Promise<void>;
  size?(hostId: string): number;
  pending?: { read(): string[]; write(hostIds: readonly string[]): void };
}

let opener: HostStoreOpener | undefined;
const stores = new Map<string, Promise<LocalStore>>();
const deleting = new Map<string, Promise<void>>();

export function installHostStoreOpener(next: HostStoreOpener | undefined): void {
  opener = next;
  stores.clear();
}

export function hostStoreAvailable(): boolean {
  return opener !== undefined;
}

export function hostStore(hostId: string): Promise<LocalStore> {
  const gate = deleting.get(hostId);
  if (gate !== undefined) return gate.then(() => hostStore(hostId));
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

export function deleteHostStore(hostId: string): Promise<void> {
  const previous = deleting.get(hostId) ?? Promise.resolve();
  const removal = previous.then(async () => {
    try {
      await closeHostStore(hostId);
      await opener?.remove(hostId);
    } catch (error) {
      notePendingDelete(hostId, true);
      throw error;
    }
    notePendingDelete(hostId, false);
  });
  const gate = removal.then(
    () => undefined,
    () => undefined,
  );
  deleting.set(hostId, gate);
  void gate.then(() => {
    if (deleting.get(hostId) === gate) deleting.delete(hostId);
  });
  return removal;
}

export function hostStoreSize(hostId: string): number {
  try {
    return opener?.size?.(hostId) ?? 0;
  } catch {
    return 0;
  }
}

function notePendingDelete(hostId: string, failed: boolean): void {
  const pending = opener?.pending;
  if (pending === undefined) return;
  try {
    const hostIds = new Set(pending.read());
    if (failed === hostIds.has(hostId)) return;
    if (failed) hostIds.add(hostId);
    else hostIds.delete(hostId);
    pending.write([...hostIds]);
  } catch {}
}

export async function retryHostStoreDeletes(): Promise<void> {
  let hostIds: string[];
  try {
    hostIds = opener?.pending?.read() ?? [];
  } catch {
    return;
  }
  await Promise.all(hostIds.map((hostId) => deleteHostStore(hostId).catch(() => undefined)));
}
