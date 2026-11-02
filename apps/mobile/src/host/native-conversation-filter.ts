import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { createConversationFilter } from './conversation-filter';
const file = () => new File(Paths.document, 'deepseekbot-conversation-filter.json');
export const conversationFilter = createConversationFilter({
  async read() {
    const stored = file();
    return stored.exists ? JSON.parse(await stored.text()) : undefined;
  },
  write(value) {
    file().writeSync(JSON.stringify(value));
  },
});
export function useConversationFilter() {
  return [
    useSyncExternalStore(conversationFilter.subscribe, conversationFilter.getSnapshot),
    conversationFilter.set,
  ] as const;
}
