import type { RemoteSource } from './client';

const MAX_READS = 3;

export interface MediaStore {
  uri(cacheKey: string): string | undefined;
  write(cacheKey: string, bytes: Uint8Array): string;
  forget(cacheKeyPrefix: string): void;
}

let store: MediaStore | undefined;

export function installMediaStore(next: MediaStore | undefined): void {
  store = next;
}

let active = 0;
const waiting: (() => void)[] = [];

async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (active >= MAX_READS) await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
  try {
    return await work();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

const pending = new Map<string, Promise<string>>();

export function mediaCacheAvailable(): boolean {
  return store !== undefined;
}

export function cachedMediaUri(cacheKey: string): string | undefined {
  try {
    return store?.uri(cacheKey);
  } catch {
    return undefined;
  }
}

export function cacheMedia(
  source: RemoteSource & { cacheKey: string; read: NonNullable<RemoteSource['read']> },
  signal: AbortSignal,
): Promise<string> {
  const target = store;
  if (target === undefined) return Promise.reject(new Error('media-cache-unavailable'));
  const cached = cachedMediaUri(source.cacheKey);
  if (cached !== undefined) return Promise.resolve(cached);
  const running = pending.get(source.cacheKey);
  if (running !== undefined) return running;
  const operation = slot(async () => {
    signal.throwIfAborted();
    const { bytes } = await source.read(signal);
    return target.write(source.cacheKey, bytes);
  }).finally(() => pending.delete(source.cacheKey));
  pending.set(source.cacheKey, operation);
  return operation;
}

export function forgetMedia(cacheKeyPrefix: string): void {
  try {
    store?.forget(cacheKeyPrefix);
  } catch {}
}
