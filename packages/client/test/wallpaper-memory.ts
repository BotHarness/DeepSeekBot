import { vi } from 'vitest';
import {
  WallpaperError,
  emptyLibrary,
  type WallpaperLibrary,
  type WallpaperRecord,
  type WallpaperStore,
} from '../src/client/wallpaper-store.js';

export function memoryWallpaperStore(initial?: Omit<WallpaperRecord, 'id'> & { id?: string }) {
  let library: WallpaperLibrary = initial
    ? {
        ...emptyLibrary(),
        revision: initial.revision,
        items: [{ ...initial, id: initial.id ?? initial.revision }],
        active: initial.id ?? initial.revision,
      }
    : emptyLibrary();
  let refuse = false;
  const write = vi.fn(async (next: WallpaperLibrary, expected: string) => {
    if (refuse) throw new WallpaperError('wallpaper-storage-unavailable');
    if (library.revision !== expected) throw new WallpaperError('wallpaper-revision-conflict');
    library = next;
  });
  const store: WallpaperStore = { read: async () => library, write, close: vi.fn() };
  return {
    store,
    write,
    library: () => library,
    active: () => library.items.find((item) => item.id === library.active),
    fail: (value = true) => {
      refuse = value;
    },
  };
}
