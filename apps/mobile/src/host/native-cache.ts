import { Directory, File, Paths } from 'expo-file-system';

import type { CachedConversation, ConversationCache } from './conversation';

const root = (): Directory => new Directory(Paths.cache, 'deepseekbot-conversations');

const fileFor = (key: string): File => new File(root(), `${encodeURIComponent(key)}.json`);

export const nativeConversationCache: ConversationCache = {
  async read(key) {
    const file = fileFor(key);
    if (!file.exists) return undefined;
    const value = JSON.parse(await file.text()) as Partial<CachedConversation>;
    if (!Array.isArray(value.entries) || typeof value.hasOlder !== 'boolean') return undefined;
    const changes = value.changes;
    return typeof changes?.epoch === 'string' && typeof changes.seq === 'number'
      ? { entries: value.entries, hasOlder: value.hasOlder, changes }
      : { entries: value.entries, hasOlder: value.hasOlder };
  },
  write(key, value) {
    try {
      const directory = root();
      if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
      fileFor(key).writeSync(JSON.stringify(value));
    } catch {}
  },
};

export function removeCachedConversation(key: string): void {
  try {
    const file = fileFor(key);
    if (file.exists) file.delete();
  } catch {}
}

export function cachedForHost(fileName: string, hostId: string): boolean {
  const prefix = JSON.stringify(['computer', hostId]).slice(0, -1) + ',';
  let name = fileName;
  for (let pass = 0; pass < 2; pass += 1) {
    try {
      name = decodeURIComponent(name);
    } catch {
      return false;
    }
    if (name.startsWith(prefix)) return true;
  }
  return false;
}

export function clearHostConversationCache(hostId: string): void {
  const directory = root();
  if (!directory.exists) return;
  for (const entry of directory.list())
    if (entry instanceof File && cachedForHost(entry.name, hostId)) entry.delete();
}

export function pruneHostConversationCache(hostId: string, stale: (key: string) => boolean): void {
  try {
    const directory = root();
    if (!directory.exists) return;
    for (const entry of directory.list()) {
      if (!(entry instanceof File) || !cachedForHost(entry.name, hostId)) continue;
      try {
        const name = decodeURIComponent(entry.name.replace(/\.json$/u, ''));
        const key: unknown = JSON.parse(name)[2];
        if (typeof key === 'string' && stale(key)) entry.delete();
      } catch {}
    }
  } catch {}
}

export function redactHostConversationCache(
  hostId: string,
  purged: (channelId: string, messageId: string) => boolean,
): void {
  try {
    const directory = root();
    if (!directory.exists) return;
    for (const entry of directory.list()) {
      if (!(entry instanceof File) || !cachedForHost(entry.name, hostId)) continue;
      try {
        const value = JSON.parse(entry.textSync()) as Partial<CachedConversation>;
        if (!Array.isArray(value.entries)) continue;
        let changed = false;
        const entries = value.entries.map((item) => {
          if (item.message.contentPurge !== undefined || !purged(item.channelId, item.message.id))
            return item;
          changed = true;
          const { attachments: _attachments, bridgeMedia: _bridgeMedia, ...message } = item.message;
          return {
            ...item,
            message: { ...message, body: '', contentPurge: { actor: 'local-human' } },
          };
        });
        if (changed) entry.writeSync(JSON.stringify({ ...value, entries }));
      } catch {}
    }
  } catch {}
}
