import type { RemoteSource } from './client';

const MAX_READS = 3;

export interface MediaStore {
  uri(cacheKey: string): string | undefined;
  write(cacheKey: string, bytes: Uint8Array): string;
  download(cacheKey: string, uri: string, headers: Record<string, string>): Promise<string>;
  forget(cacheKeyPrefixes: readonly string[]): void;
  entries(): MediaEntry[];
  remove(cacheKeys: readonly string[]): void;
  readSettings(): string | undefined;
  writeSettings(text: string): void;
}

export interface MediaEntry {
  key: string;
  size: number;
  modified: number;
}

export const AUTO_CLEANUP_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;
const SAVE_DELAY_MS = 2000;

let store: MediaStore | undefined;
let accessed = new Map<string, number>();
let autoCleanup = true;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export function installMediaStore(next: MediaStore | undefined): void {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  store = next;
  accessed = new Map();
  autoCleanup = true;
  try {
    const saved = JSON.parse(next?.readSettings() ?? '{}') as {
      accessed?: Record<string, unknown>;
      autoCleanup?: unknown;
    };
    for (const [key, at] of Object.entries(saved.accessed ?? {}))
      if (typeof at === 'number') accessed.set(key, at);
    if (typeof saved.autoCleanup === 'boolean') autoCleanup = saved.autoCleanup;
  } catch {}
}

const save = (): void => {
  if (saveTimer !== undefined) return;
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    try {
      store?.writeSettings(JSON.stringify({ autoCleanup, accessed: Object.fromEntries(accessed) }));
    } catch {}
  }, SAVE_DELAY_MS);
};

const touch = (cacheKey: string, now = Date.now()): void => {
  const previous = accessed.get(cacheKey);
  if (previous !== undefined && now - previous < 60 * 60 * 1000) return;
  accessed.set(cacheKey, now);
  save();
};

const hostPrefix = (hostId: string) => `${hostId}/`;

export function mediaUsage(hostId?: string): number {
  try {
    return (store?.entries() ?? [])
      .filter((entry) => hostId === undefined || entry.key.startsWith(hostPrefix(hostId)))
      .reduce((total, entry) => total + entry.size, 0);
  } catch {
    return 0;
  }
}

const staleEntries = (options: { olderThan: number; hostId?: string }): MediaEntry[] =>
  (store?.entries() ?? []).filter(
    (entry) =>
      (options.hostId === undefined || entry.key.startsWith(hostPrefix(options.hostId))) &&
      (accessed.get(entry.key) ?? entry.modified) < options.olderThan,
  );

export function previewMediaEviction(options: { olderThan: number; hostId?: string }): {
  files: number;
  bytes: number;
} {
  try {
    const stale = staleEntries(options);
    return { files: stale.length, bytes: stale.reduce((total, entry) => total + entry.size, 0) };
  } catch {
    return { files: 0, bytes: 0 };
  }
}

export function evictMedia(options: { olderThan: number; hostId?: string }): number {
  if (store === undefined) return 0;
  try {
    const stale = store
      .entries()
      .filter(
        (entry) =>
          (options.hostId === undefined || entry.key.startsWith(hostPrefix(options.hostId))) &&
          (accessed.get(entry.key) ?? entry.modified) < options.olderThan,
      )
      .map((entry) => entry.key);
    if (stale.length === 0) return 0;
    store.remove(stale);
    for (const key of stale) accessed.delete(key);
    save();
    return stale.length;
  } catch {
    return 0;
  }
}

export function clearHostMedia(hostId: string): void {
  forgetMedia(hostPrefix(hostId));
}

export function autoCleanupEnabled(): boolean {
  return autoCleanup;
}

export function setAutoCleanup(enabled: boolean): void {
  autoCleanup = enabled;
  save();
}

export function runAutoCleanup(now = Date.now()): number {
  return autoCleanup ? evictMedia({ olderThan: now - AUTO_CLEANUP_DAYS * DAY }) : 0;
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
    const uri = store?.uri(cacheKey);
    if (uri !== undefined) touch(cacheKey);
    return uri;
  } catch {
    return undefined;
  }
}

export function cacheMedia(
  source: RemoteSource & { cacheKey: string },
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
    touch(source.cacheKey);
    if (source.read === undefined)
      return target.download(source.cacheKey, source.uri, source.headers);
    const { bytes } = await source.read(signal);
    return target.write(source.cacheKey, bytes);
  }).finally(() => pending.delete(source.cacheKey));
  pending.set(source.cacheKey, operation);
  return operation;
}

export function forgetMedia(cacheKeyPrefixes: string | readonly string[]): void {
  const prefixes = typeof cacheKeyPrefixes === 'string' ? [cacheKeyPrefixes] : cacheKeyPrefixes;
  if (prefixes.length === 0) return;
  try {
    store?.forget(prefixes);
  } catch {}
  for (const key of [...accessed.keys()])
    if (prefixes.some((prefix) => key.startsWith(prefix))) accessed.delete(key);
  save();
}
