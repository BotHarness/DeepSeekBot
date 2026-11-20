import { File, Paths } from 'expo-file-system';
import { useCallback, useSyncExternalStore } from 'react';
import { createSourceDrafts } from './source-drafts';
const file = () => new File(Paths.document, 'deepseekbot-unsent-text.json');
export const sourceDrafts = createSourceDrafts({
  async read() {
    const f = file();
    return f.exists ? JSON.parse(await f.text()) : {};
  },
  write(value) {
    file().writeSync(JSON.stringify(value));
  },
});
export function useSourceDraft(key: string) {
  const value = useSyncExternalStore(
    sourceDrafts.subscribe,
    useCallback(() => sourceDrafts.get(key), [key]),
  );
  const setValue = useCallback((next: string) => sourceDrafts.set(key, next), [key]);
  const persistence = useSyncExternalStore(sourceDrafts.subscribe, sourceDrafts.getPersistence);
  const read = useCallback(() => sourceDrafts.get(key), [key]);
  const take = useCallback((sent?: string) => sourceDrafts.take(key, sent), [key]);
  return [value, setValue, { ...persistence, retry: sourceDrafts.retrySave, read, take }] as const;
}
