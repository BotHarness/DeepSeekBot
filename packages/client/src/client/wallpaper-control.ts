import {
  WallpaperError,
  VIDEO_LIMIT,
  DEFAULT_CROP,
  validCrop,
  validRotation,
} from './wallpaper-store.js';
import type { Wallpaper } from './wallpaper.js';
import { object } from './appearance.js';
export function createWallpaperControl(owner: Wallpaper) {
  let upload:
    | {
        id: string;
        size: number;
        bytes: Uint8Array<ArrayBuffer>[];
        received: number;
        revision: string;
        expiresAt: number;
      }
    | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    upload = undefined;
    clearTimeout(timer);
  };
  const renew = () => {
    clearTimeout(timer);
    timer = setTimeout(clear, 60000);
  };
  return {
    dispose: clear,
    async execute(raw: unknown, expectedRevision: unknown, expiresAt: number) {
      const command = object(raw);
      if (Date.now() > expiresAt) throw new WallpaperError('appearance-request-stale');
      if (command.action === 'read') {
        await owner.refresh();
        return { wallpaper: owner.describe() };
      }
      if (typeof expectedRevision !== 'string')
        throw new WallpaperError('wallpaper-revision-required');
      if (command.item !== undefined && typeof command.item !== 'string')
        throw new WallpaperError('wallpaper-missing');
      const item = command.item as string | undefined;
      if (command.action === 'remove')
        return { wallpaper: await owner.remove(expectedRevision, expiresAt, item) };
      if (command.action === 'crop') {
        if (!validCrop(command.crop)) throw new WallpaperError('wallpaper-crop-invalid');
        return { wallpaper: await owner.crop(command.crop, expectedRevision, expiresAt, item) };
      }
      if (command.action === 'select')
        return { wallpaper: await owner.select(item, expectedRevision, expiresAt) };
      if (command.action === 'rotation') {
        const rotation = { interval: command.interval, shuffle: command.shuffle };
        if (
          (rotation.interval === undefined && rotation.shuffle === undefined) ||
          !validRotation(rotation)
        )
          throw new WallpaperError('wallpaper-rotation-invalid');
        return {
          wallpaper: await owner.setRotation(
            rotation as { interval?: number; shuffle?: boolean },
            expectedRevision,
            expiresAt,
          ),
        };
      }
      if (command.action === 'begin') {
        if (
          typeof command.size !== 'number' ||
          !Number.isInteger(command.size) ||
          command.size < 1 ||
          command.size > VIDEO_LIMIT
        )
          throw new WallpaperError('wallpaper-size-invalid');
        if (upload) throw new WallpaperError('wallpaper-upload-busy');
        await owner.refresh();
        if (owner.getSnapshot().revision !== expectedRevision)
          throw new WallpaperError('wallpaper-revision-conflict');
        upload = {
          id: crypto.randomUUID(),
          size: command.size,
          bytes: [],
          received: 0,
          revision: expectedRevision,
          expiresAt: Date.now() + 60000,
        };
        renew();
        return { uploadId: upload.id, offset: 0 };
      }
      if (
        !upload ||
        upload.id !== command.uploadId ||
        upload.revision !== expectedRevision ||
        Date.now() > upload.expiresAt
      )
        throw new WallpaperError('wallpaper-upload-stale');
      if (command.action === 'cancel') {
        clear();
        return { cancelled: true };
      }
      if (command.action === 'append') {
        if (
          command.offset !== upload.received ||
          typeof command.data !== 'string' ||
          command.data.length > 262144 ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(command.data)
        )
          throw new WallpaperError('wallpaper-chunk-invalid');
        let bytes: Uint8Array<ArrayBuffer>;
        try {
          bytes = Uint8Array.from(atob(command.data), (c) => c.charCodeAt(0));
        } catch {
          throw new WallpaperError('wallpaper-chunk-invalid');
        }
        if (!bytes.length || upload.received + bytes.length > upload.size)
          throw new WallpaperError('wallpaper-chunk-invalid');
        upload.bytes.push(bytes);
        upload.received += bytes.length;
        upload.expiresAt = Date.now() + 60000;
        renew();
        return { uploadId: upload.id, offset: upload.received };
      }
      if (command.action !== 'commit' || upload.received !== upload.size)
        throw new WallpaperError('wallpaper-upload-incomplete');
      const crop = command.crop ?? DEFAULT_CROP;
      if (!validCrop(crop)) throw new WallpaperError('wallpaper-crop-invalid');
      const blob = new Blob(upload.bytes);
      clear();
      return { wallpaper: await owner.save(blob, crop, expectedRevision, expiresAt) };
    },
  };
}
