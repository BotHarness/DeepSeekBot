import { Directory, File, Paths } from 'expo-file-system';

import type { MediaStore } from './media-cache';

const mediaRoot = (): Directory => new Directory(Paths.cache, 'deepseekbot-media');

const mediaFile = (cacheKey: string): File => new File(mediaRoot(), encodeURIComponent(cacheKey));

const settingsFile = (): File => new File(Paths.document, 'deepseekbot-media-settings.json');

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
  async download(cacheKey, uri, headers) {
    const directory = mediaRoot();
    if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
    const file = await File.downloadFileAsync(uri, mediaFile(cacheKey), {
      headers,
      idempotent: true,
    });
    return file.uri;
  },
  entries() {
    const directory = mediaRoot();
    if (!directory.exists) return [];
    return directory.list().flatMap((entry) =>
      entry instanceof File
        ? [
            {
              key: decodeURIComponent(entry.name),
              size: entry.size ?? 0,
              modified: entry.modificationTime ?? 0,
            },
          ]
        : [],
    );
  },
  remove(cacheKeys) {
    for (const key of cacheKeys) {
      const file = mediaFile(key);
      if (file.exists) file.delete();
    }
  },
  readSettings() {
    const file = settingsFile();
    return file.exists ? file.textSync() : undefined;
  },
  writeSettings(text) {
    settingsFile().write(text);
  },
  forget(cacheKeyPrefixes) {
    const directory = mediaRoot();
    if (!directory.exists) return;
    for (const entry of directory.list()) {
      if (!(entry instanceof File)) continue;
      const key = decodeURIComponent(entry.name);
      if (cacheKeyPrefixes.some((prefix) => key.startsWith(prefix))) entry.delete();
    }
  },
};
