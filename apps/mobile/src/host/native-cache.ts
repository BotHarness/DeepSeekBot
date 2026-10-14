import { Directory, File, Paths } from 'expo-file-system';

import type { CachedConversation, ConversationCache } from './conversation';

const root = (): Directory => new Directory(Paths.cache, 'deepseekbot-conversations');

const fileFor = (botSlug: string): File => new File(root(), `${encodeURIComponent(botSlug)}.json`);

export const nativeConversationCache: ConversationCache = {
  async read(botSlug) {
    const file = fileFor(botSlug);
    if (!file.exists) return undefined;
    const value = JSON.parse(await file.text()) as Partial<CachedConversation>;
    return Array.isArray(value.entries) && typeof value.hasOlder === 'boolean'
      ? { entries: value.entries, hasOlder: value.hasOlder }
      : undefined;
  },
  write(botSlug, value) {
    try {
      const directory = root();
      if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
      fileFor(botSlug).write(JSON.stringify(value));
    } catch {}
  },
};

export function clearConversationCache(): void {
  const directory = root();
  if (directory.exists) directory.delete();
}
