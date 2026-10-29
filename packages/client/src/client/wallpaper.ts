import {
  DEFAULT_CROP,
  IMAGE_LIMIT,
  LIBRARY_LIMIT,
  VIDEO_LIMIT,
  WallpaperError,
  emptyLibrary,
  rotationStep,
  validCrop,
  validRotation,
  type WallpaperCrop,
  type WallpaperLibrary,
  type WallpaperRecord,
  type WallpaperStore,
} from './wallpaper-store.js';
import { decodeVideoWallpaper } from './wallpaper-video.js';
export interface WallpaperPlayback {
  state: 'playing' | 'paused' | 'poster' | 'inactive';
  reason?: string;
}
export interface WallpaperPreview {
  kind?: 'image' | 'video';
  poster?: Blob;
  posterUrl?: string;
  fallbackReason?: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  release(): void;
}
export interface WallpaperItem {
  id: string;
  kind: 'image' | 'video';
  thumbUrl: string;
  width: number;
  height: number;
}
export interface WallpaperSnapshot {
  resourceVersion: number;
  ready: boolean;
  revision: string;
  current?: {
    id: string;
    kind: 'image' | 'video';
    posterUrl?: string;
    fallbackReason?: string;
    size: number;
    width: number;
    height: number;
    crop: WallpaperCrop;
    url: string;
  };
  library: {
    items: WallpaperItem[];
    active?: string;
    interval: number;
    shuffle: boolean;
  };
  error?: string;
  playback?: WallpaperPlayback;
}
export async function decodeImageWallpaper(blob: Blob): Promise<WallpaperPreview> {
  if (!blob.size || blob.size > IMAGE_LIMIT) throw new WallpaperError('wallpaper-size-invalid');
  const url = URL.createObjectURL(blob);
  const image = new Image();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    image.src = url;
    await Promise.race([
      image.decode(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new WallpaperError('wallpaper-decode-failed')), 15000);
      }),
    ]);
    if (!image.naturalWidth || !image.naturalHeight)
      throw new WallpaperError('wallpaper-decode-failed');
    return {
      kind: 'image',
      blob,
      url,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new WallpaperError('wallpaper-decode-failed');
  } finally {
    clearTimeout(timer);
    image.src = '';
  }
}
export async function decodeWallpaper(blob: Blob): Promise<WallpaperPreview> {
  if (
    !blob.size ||
    blob.size > VIDEO_LIMIT ||
    (blob.type.startsWith('image/') && blob.size > IMAGE_LIMIT)
  )
    throw new WallpaperError('wallpaper-size-invalid');
  if (blob.size <= IMAGE_LIMIT && !blob.type.startsWith('video/')) {
    try {
      return await decodeImageWallpaper(blob);
    } catch {}
  }
  return decodeVideoWallpaper(blob);
}
export class Wallpaper {
  #snapshot: WallpaperSnapshot = {
    ready: false,
    revision: 'empty',
    resourceVersion: 0,
    library: { items: [], interval: emptyLibrary().interval, shuffle: false },
  };
  #listeners = new Set<() => void>();
  #library: WallpaperLibrary = emptyLibrary();
  #shown: WallpaperRecord | undefined;
  #resource: WallpaperPreview | undefined;
  #thumbs = new Map<string, { blob: Blob; url: string }>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  #serial: Promise<unknown> = Promise.resolve();
  #disposed = false;
  constructor(
    private store: WallpaperStore,
    private decode = decodeWallpaper,
    private now = Date.now,
  ) {}
  getSnapshot = () => this.#snapshot;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  #emit(snapshot: WallpaperSnapshot) {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) listener();
  }
  #run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#serial.then(async () => {
      if (this.#disposed) throw new WallpaperError('wallpaper-owner-disposed');
      try {
        return await operation();
      } catch (error) {
        const code = error instanceof WallpaperError ? error.code : 'wallpaper-storage-unavailable';
        this.#emit({ ...this.#snapshot, ready: true, error: code });
        throw new WallpaperError(code);
      }
    });
    this.#serial = result.catch(() => {});
    return result;
  }
  async #open(record: WallpaperRecord): Promise<WallpaperPreview> {
    try {
      return await this.decode(record.blob);
    } catch (error) {
      if (record.kind !== 'video' || !record.poster) throw error;
      const poster = await decodeImageWallpaper(record.poster);
      const url = URL.createObjectURL(record.blob);
      return {
        ...poster,
        kind: 'video',
        blob: record.blob,
        url,
        poster: record.poster,
        posterUrl: poster.url,
        width: record.width,
        height: record.height,
        fallbackReason:
          error instanceof WallpaperError ? error.code : 'wallpaper-video-decode-failed',
        release: () => {
          poster.release();
          URL.revokeObjectURL(url);
        },
      };
    }
  }
  #syncThumbs() {
    const keep = new Set<string>();
    for (const item of this.#library.items) {
      const blob = item.kind === 'video' ? item.poster! : item.blob;
      keep.add(item.id);
      const thumb = this.#thumbs.get(item.id);
      if (thumb?.blob === blob) continue;
      if (thumb) URL.revokeObjectURL(thumb.url);
      this.#thumbs.set(item.id, { blob, url: URL.createObjectURL(blob) });
    }
    for (const [id, thumb] of this.#thumbs)
      if (!keep.has(id)) {
        URL.revokeObjectURL(thumb.url);
        this.#thumbs.delete(id);
      }
  }
  async #accept(
    library: WallpaperLibrary,
    prepared?: { id: string; resource: WallpaperPreview },
    written = false,
  ) {
    if (this.#disposed) {
      prepared?.resource.release();
      return;
    }
    this.#library = library;
    this.#syncThumbs();
    const step = rotationStep(library, this.now());
    const record = library.items.find((item) => item.id === step.id);
    let resource = this.#resource;
    const changed = record?.blob !== this.#shown?.blob;
    if (changed) {
      resource = !record
        ? undefined
        : prepared?.id === record.id
          ? prepared.resource
          : await this.#open(record);
      if (this.#disposed) {
        resource?.release();
        return;
      }
      this.#resource?.release();
      this.#resource = resource;
    }
    if (prepared && prepared.resource !== resource) prepared.resource.release();
    this.#shown = record;
    clearTimeout(this.#timer);
    this.#timer =
      step.next === undefined
        ? undefined
        : setTimeout(
            () => void this.#run(() => this.#accept(this.#library)).catch(() => {}),
            Math.max(1000, step.next - this.now()),
          );
    this.#emit({
      ready: true,
      resourceVersion: this.#snapshot.resourceVersion + (changed || written ? 1 : 0),
      revision: library.revision,
      library: {
        items: library.items.map((item) => ({
          id: item.id,
          kind: item.kind,
          thumbUrl: this.#thumbs.get(item.id)!.url,
          width: item.width,
          height: item.height,
        })),
        ...(library.active ? { active: library.active } : {}),
        interval: library.interval,
        shuffle: library.shuffle,
      },
      ...(record?.kind === 'video'
        ? {
            playback:
              !changed && this.#snapshot.playback
                ? this.#snapshot.playback
                : {
                    state: resource?.fallbackReason ? ('poster' as const) : ('inactive' as const),
                    ...(resource?.fallbackReason ? { reason: resource.fallbackReason } : {}),
                  },
          }
        : {}),
      ...(record && resource
        ? {
            current: {
              id: record.id,
              kind: record.kind,
              size: record.blob.size,
              width: record.width,
              height: record.height,
              crop: record.crop,
              url: resource.url,
              ...(resource.posterUrl ? { posterUrl: resource.posterUrl } : {}),
              ...(resource.fallbackReason ? { fallbackReason: resource.fallbackReason } : {}),
            },
          }
        : {}),
    });
  }
  async #write(
    expected: string,
    expiresAt: number,
    change: (library: WallpaperLibrary) => WallpaperLibrary,
    prepared?: { id: string; resource: WallpaperPreview },
  ) {
    try {
      if (Date.now() > expiresAt || this.#disposed)
        throw new WallpaperError('appearance-request-stale');
      const next = { ...change(this.#library), revision: crypto.randomUUID() };
      await this.store.write(next, expected);
      await this.#accept(next, prepared, true);
      prepared = undefined;
      return this.describe();
    } finally {
      prepared?.resource.release();
    }
  }
  #target(id: string | undefined) {
    const target = id ?? this.#shown?.id ?? this.#library.active;
    const record = this.#library.items.find((item) => item.id === target);
    if (!record) throw new WallpaperError('wallpaper-missing');
    return record;
  }
  refresh = () =>
    this.#run(async () => {
      const library = await this.store.read();
      if (
        this.#snapshot.ready &&
        library.revision === this.#library.revision &&
        !this.#snapshot.error
      ) {
        if (rotationStep(library, this.now()).id !== this.#shown?.id)
          await this.#accept(this.#library);
        return this.#snapshot;
      }
      await this.#accept(library);
      return this.#snapshot;
    });
  add(blob: Blob, crop: WallpaperCrop, expected: string, expiresAt = Infinity) {
    return this.#run(async () => {
      if (!validCrop(crop)) throw new WallpaperError('wallpaper-crop-invalid');
      if (this.#library.items.length >= LIBRARY_LIMIT)
        throw new WallpaperError('wallpaper-library-full');
      const resource = await this.decode(blob);
      const id = crypto.randomUUID();
      const record: WallpaperRecord = {
        version: 1,
        id,
        revision: crypto.randomUUID(),
        kind: resource.kind ?? 'image',
        ...(resource.poster ? { poster: resource.poster } : {}),
        blob,
        width: resource.width,
        height: resource.height,
        crop: { ...crop },
      };
      return this.#write(
        expected,
        expiresAt,
        (library) => ({
          ...library,
          items: [...library.items, record],
          active: id,
          since: this.now(),
        }),
        { id, resource },
      );
    });
  }
  save(blob: Blob, crop: WallpaperCrop, expected: string, expiresAt = Infinity) {
    return this.add(blob, crop, expected, expiresAt);
  }
  crop(crop: WallpaperCrop, expected: string, expiresAt = Infinity, id?: string) {
    return this.#run(async () => {
      if (!validCrop(crop)) throw new WallpaperError('wallpaper-crop-invalid');
      const record = this.#target(id);
      return this.#write(expected, expiresAt, (library) => ({
        ...library,
        items: library.items.map((item) =>
          item.id === record.id
            ? { ...item, crop: { ...crop }, revision: crypto.randomUUID() }
            : item,
        ),
      }));
    });
  }
  select(id: string | undefined, expected: string, expiresAt = Infinity) {
    return this.#run(async () => {
      if (id !== undefined) this.#target(id);
      return this.#write(expected, expiresAt, (library) => {
        const { active: _active, ...rest } = library;
        return { ...rest, ...(id ? { active: id } : {}), since: this.now() };
      });
    });
  }
  setRotation(
    rotation: { interval?: number; shuffle?: boolean },
    expected: string,
    expiresAt = Infinity,
  ) {
    return this.#run(async () => {
      if (!validRotation(rotation)) throw new WallpaperError('wallpaper-rotation-invalid');
      return this.#write(expected, expiresAt, (library) => ({
        ...library,
        ...(this.#shown ? { active: this.#shown.id } : {}),
        since: this.now(),
        ...(rotation.interval === undefined ? {} : { interval: rotation.interval }),
        ...(rotation.shuffle === undefined ? {} : { shuffle: rotation.shuffle }),
      }));
    });
  }
  remove(expected: string, expiresAt = Infinity, id?: string) {
    return this.#run(async () => {
      if (id === undefined && !this.#shown && !this.#library.active)
        return this.#write(expected, expiresAt, (library) => library);
      const record = this.#target(id);
      return this.#write(expected, expiresAt, (library) => {
        const index = library.items.findIndex((item) => item.id === record.id);
        const items = library.items.filter((item) => item.id !== record.id);
        const { active: _active, ...rest } = library;
        const onScreen = record.id === library.active || record.id === this.#shown?.id;
        const active = onScreen ? (items[index] ?? items[0])?.id : library.active;
        return {
          ...rest,
          items,
          ...(active ? { active } : {}),
          since: onScreen ? this.now() : library.since,
        };
      });
    });
  }
  clear(expected: string, expiresAt = Infinity) {
    return this.#run(() =>
      this.#write(expected, expiresAt, (library) => {
        const { active: _active, ...rest } = library;
        return { ...rest, items: [] };
      }),
    );
  }
  setPlayback(playback: WallpaperPlayback) {
    if (this.#disposed || this.#shown?.kind !== 'video') return;
    if (
      this.#snapshot.playback?.state === playback.state &&
      this.#snapshot.playback?.reason === playback.reason
    )
      return;
    this.#emit({ ...this.#snapshot, playback });
  }
  describe() {
    const {
      current,
      resourceVersion: _resourceVersion,
      library: _library,
      ...snapshot
    } = this.#snapshot;
    const meta = (item: WallpaperRecord) => ({
      id: item.id,
      kind: item.kind,
      size: item.blob.size,
      width: item.width,
      height: item.height,
      crop: item.crop,
    });
    return {
      ...snapshot,
      ...(current && this.#shown ? { current: meta(this.#shown) } : {}),
      library: {
        items: this.#library.items.map(meta),
        ...(this.#library.active ? { active: this.#library.active } : {}),
        interval: this.#library.interval,
        shuffle: this.#library.shuffle,
      },
    };
  }
  previewCurrent(id?: string) {
    return this.decode(this.#target(id).blob);
  }
  dispose() {
    this.#disposed = true;
    clearTimeout(this.#timer);
    this.#resource?.release();
    for (const thumb of this.#thumbs.values()) URL.revokeObjectURL(thumb.url);
    this.#thumbs.clear();
    this.#listeners.clear();
    this.store.close();
  }
}
export { DEFAULT_CROP };
