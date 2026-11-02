export const WALLPAPER_DB = 'botharness-wallpaper-v1';
export const IMAGE_LIMIT = 20 * 1024 * 1024;
export const VIDEO_LIMIT = 100 * 1024 * 1024;
export interface WallpaperCrop {
  x: number;
  y: number;
  zoom: number;
}
export const LIBRARY_LIMIT = 24;
export const ROTATION_INTERVALS = [0, 60_000, 300_000, 900_000, 1_800_000, 3_600_000] as const;
export const DEFAULT_INTERVAL = 900_000;
export interface WallpaperRecord {
  version: 1;
  id: string;
  revision: string;
  kind: 'image' | 'video';
  poster?: Blob;
  blob: Blob;
  width: number;
  height: number;
  crop: WallpaperCrop;
}
export interface WallpaperLibrary {
  version: 1;
  revision: string;
  items: WallpaperRecord[];
  active?: string;
  since: number;
  interval: number;
  shuffle: boolean;
}
interface LibraryIndex {
  version: 1;
  revision: string;
  items: { id: string; revision: string }[];
  active?: string;
  since: number;
  interval: number;
  shuffle: boolean;
}
export class WallpaperError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export const DEFAULT_CROP: WallpaperCrop = { x: 0.5, y: 0.5, zoom: 1 };
export const emptyLibrary = (): WallpaperLibrary => ({
  version: 1,
  revision: 'empty',
  items: [],
  since: 0,
  interval: DEFAULT_INTERVAL,
  shuffle: false,
});
export function validCrop(value: unknown): value is WallpaperCrop {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const crop = value as Record<string, unknown>;
  return (
    Object.keys(crop).length === 3 &&
    ['x', 'y', 'zoom'].every(
      (key) => typeof crop[key] === 'number' && Number.isFinite(crop[key]),
    ) &&
    Number(crop.x) >= 0 &&
    Number(crop.x) <= 1 &&
    Number(crop.y) >= 0 &&
    Number(crop.y) <= 1 &&
    Number(crop.zoom) >= 1 &&
    Number(crop.zoom) <= 5
  );
}
export function validWallpaper(value: unknown): value is Omit<WallpaperRecord, 'id'> & {
  id?: string;
} {
  if (!value || typeof value !== 'object') return false;
  const v = value as WallpaperRecord;
  return (
    v.version === 1 &&
    (v.id === undefined || typeof v.id === 'string') &&
    typeof v.revision === 'string' &&
    (v.kind === 'image' || v.kind === 'video') &&
    v.blob instanceof Blob &&
    v.blob.size > 0 &&
    v.blob.size <= (v.kind === 'video' ? VIDEO_LIMIT : IMAGE_LIMIT) &&
    (v.kind !== 'video' ||
      (v.poster instanceof Blob && v.poster.size > 0 && v.poster.size <= IMAGE_LIMIT)) &&
    Number.isFinite(v.width) &&
    v.width > 0 &&
    Number.isFinite(v.height) &&
    v.height > 0 &&
    validCrop(v.crop)
  );
}
export function validRotation(value: { interval?: unknown; shuffle?: unknown }): boolean {
  return (
    (value.interval === undefined ||
      (ROTATION_INTERVALS as readonly unknown[]).includes(value.interval)) &&
    (value.shuffle === undefined || typeof value.shuffle === 'boolean')
  );
}
function validIndex(value: unknown): value is LibraryIndex {
  if (!value || typeof value !== 'object') return false;
  const v = value as LibraryIndex;
  return (
    v.version === 1 &&
    typeof v.revision === 'string' &&
    Array.isArray(v.items) &&
    v.items.length <= LIBRARY_LIMIT &&
    v.items.every((i) => typeof i?.id === 'string' && typeof i.revision === 'string') &&
    new Set(v.items.map((i) => i.id)).size === v.items.length &&
    (v.active === undefined || v.items.some((i) => i.id === v.active)) &&
    Number.isFinite(v.since) &&
    typeof v.interval === 'number' &&
    validRotation(v) &&
    typeof v.shuffle === 'boolean'
  );
}
export interface WallpaperStore {
  read(): Promise<WallpaperLibrary>;
  write(next: WallpaperLibrary, expected: string): Promise<void>;
  close(): void;
}
export function createWallpaperStore(factory: IDBFactory | undefined): WallpaperStore {
  let opened: Promise<IDBDatabase> | undefined;
  let closed = false;
  const open = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (!factory || closed) {
        reject(new WallpaperError('wallpaper-storage-unavailable'));
        return;
      }
      const request = factory.open(WALLPAPER_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('assets');
      request.onerror = () => {
        opened = undefined;
        reject(new WallpaperError('wallpaper-storage-unavailable'));
      };
      let failed = false;
      request.onblocked = () => {
        failed = true;
        reject(new WallpaperError('wallpaper-storage-unavailable'));
      };
      request.onsuccess = () => {
        if (failed || closed) {
          request.result.close();
          opened = undefined;
          reject(new WallpaperError('wallpaper-storage-unavailable'));
          return;
        }
        request.result.onversionchange = () => {
          request.result.close();
          opened = undefined;
        };
        resolve(request.result);
      };
    }));
  const transact = async (value?: {
    next: WallpaperLibrary;
    expected: string;
  }): Promise<WallpaperLibrary> => {
    const db = await open();
    return new Promise((resolve, reject) => {
      let current = emptyLibrary();
      let failure: string | undefined;
      const tx = db.transaction('assets', value ? 'readwrite' : 'readonly');
      tx.oncomplete = () => resolve(value ? value.next : current);
      tx.onerror = tx.onabort = () =>
        reject(new WallpaperError(failure ?? 'wallpaper-storage-unavailable'));
      const store = tx.objectStore('assets');
      const fail = (code: string) => {
        if (failure) return;
        failure = code;
        tx.abort();
      };
      const loaded = (library: WallpaperLibrary, legacy: boolean) => {
        current = library;
        if (!value) return;
        if (library.revision !== value.expected) return fail('wallpaper-revision-conflict');
        try {
          const stored = new Map(library.items.map((item) => [item.id, item.revision]));
          for (const item of value.next.items)
            if (legacy || stored.get(item.id) !== item.revision) store.put(item, `item:${item.id}`);
          for (const id of stored.keys())
            if (!value.next.items.some((item) => item.id === id)) store.delete(`item:${id}`);
          if (legacy) store.delete('current');
          const { items, ...index } = value.next;
          store.put(
            { ...index, items: items.map(({ id, revision }) => ({ id, revision })) },
            'library',
          );
        } catch {
          fail('wallpaper-storage-unavailable');
        }
      };
      const index = store.get('library');
      index.onsuccess = () => {
        if (index.result === undefined) {
          const legacy = store.get('current');
          legacy.onsuccess = () => {
            const record = legacy.result as unknown;
            if (record === undefined) return loaded(emptyLibrary(), false);
            if (!validWallpaper(record)) return fail('wallpaper-data-invalid');
            const item = { ...record, id: record.id ?? record.revision };
            loaded(
              { ...emptyLibrary(), revision: record.revision, items: [item], active: item.id },
              true,
            );
          };
          return;
        }
        if (!validIndex(index.result)) return fail('wallpaper-data-invalid');
        const meta = index.result;
        const items: WallpaperRecord[] = [];
        let pending = meta.items.length;
        const done = () => loaded({ ...meta, items }, false);
        if (!pending) return done();
        meta.items.forEach((entry, i) => {
          const request = store.get(`item:${entry.id}`);
          request.onsuccess = () => {
            const record = request.result as unknown;
            if (!validWallpaper(record) || record.id !== entry.id)
              return fail('wallpaper-data-invalid');
            items[i] = record as WallpaperRecord;
            if (--pending === 0) done();
          };
        });
      };
    });
  };
  return {
    read: () => transact(),
    write: async (next, expected) => {
      await transact({ next, expected });
    },
    close: () => {
      closed = true;
      void opened?.then((db) => db.close()).catch(() => {});
      opened = undefined;
    },
  };
}
function shuffled(ids: string[], seed: number): string[] {
  let state = seed >>> 0 || 1;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}
export function rotationStep(
  library: Pick<WallpaperLibrary, 'items' | 'active' | 'since' | 'interval' | 'shuffle'>,
  now: number,
): { id?: string; next?: number } {
  const { items, active } = library;
  const start = items.findIndex((item) => item.id === active);
  if (start < 0) return {};
  const n = items.length;
  if (!library.interval || n < 2) return { id: active! };
  const step = Math.max(0, Math.floor((now - library.since) / library.interval));
  const next = library.since + (step + 1) * library.interval;
  if (!library.shuffle || n === 2) return { id: items[(start + step) % n]!.id, next };
  if (step === 0) return { id: active!, next };
  const ids = items.map((item) => item.id);
  const round = Math.floor((step - 1) / n);
  const order = shuffled(ids, library.since + round);
  const previous = round === 0 ? active : shuffled(ids, library.since + round - 1)[n - 1];
  if (order[0] === previous) [order[0], order[1]] = [order[1]!, order[0]!];
  return { id: order[(step - 1) % n]!, next };
}
export function wallpaperPlacement(
  width: number,
  height: number,
  containerWidth: number,
  containerHeight: number,
  crop: WallpaperCrop,
) {
  const scale = Math.max(containerWidth / width, containerHeight / height) * crop.zoom;
  const w = width * scale,
    h = height * scale;
  return {
    width: w,
    height: h,
    left: Math.min(0, Math.max(containerWidth - w, containerWidth / 2 - crop.x * w)),
    top: Math.min(0, Math.max(containerHeight - h, containerHeight / 2 - crop.y * h)),
  };
}
