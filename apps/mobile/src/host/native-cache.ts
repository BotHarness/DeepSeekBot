import { Directory, File, Paths } from 'expo-file-system';

import type { CachedConversation, ConversationCache } from './conversation';

const root = (): Directory => new Directory(Paths.cache, 'deepseekbot-conversations');

const fileFor = (key: string): File => new File(root(), `${encodeURIComponent(key)}.json`);

export const nativeConversationCache: ConversationCache = {
  async read(key) {
    const file = fileFor(key);
    if (!file.exists) return undefined;
    const value = JSON.parse(await file.text()) as Partial<CachedConversation>;
    return Array.isArray(value.entries) && typeof value.hasOlder === 'boolean'
      ? { entries: value.entries, hasOlder: value.hasOlder }
      : undefined;
  },
  write(key, value) {
    try {
      const directory = root();
      if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
      fileFor(key).writeSync(JSON.stringify(value));
    } catch {}
  },
};

export function clearConversationCache(): void {
  const directory = root();
  if (directory.exists) directory.delete();
}
