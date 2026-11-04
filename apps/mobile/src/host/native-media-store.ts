import { Directory, File, Paths } from 'expo-file-system';

import type { MediaStore } from './media-cache';

const mediaRoot = (): Directory => new Directory(Paths.cache, 'deepseekbot-media');

const mediaFile = (cacheKey: string): File => new File(mediaRoot(), encodeURIComponent(cacheKey));

export const nativeMediaStore: MediaStore = {
  uri(cacheKey) {
    const file = mediaFile(cacheKey);
    return file.exists ? file.uri : undefined;
  },
  write(cacheKey, bytes) {
    const directory = mediaRoot();
    if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
    const file = mediaFile(cacheKey);
    file.write(bytes);
    return file.uri;
  },
  forget(cacheKeyPrefix) {
    const directory = mediaRoot();
    if (!directory.exists) return;
    for (const entry of directory.list())
      if (entry instanceof File && decodeURIComponent(entry.name).startsWith(cacheKeyPrefix))
        entry.delete();
  },
};
