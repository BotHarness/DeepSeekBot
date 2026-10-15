import { File, Paths } from 'expo-file-system';
import { useCallback, useSyncExternalStore } from 'react';

import { createSectionCollapse } from './section-collapse';

const file = (): File => new File(Paths.document, 'deepseekbot-sections.json');

export const sectionCollapse = createSectionCollapse({
  async read() {
    const stored = file();
    return stored.exists ? (JSON.parse(await stored.text()) as unknown) : undefined;
  },
  write(value) {
    try {
      const stored = file();
      if (!stored.exists) stored.create();
      stored.write(JSON.stringify(value));
    } catch {}
  },
});

export function useCollapsedSections(hostId: string | undefined): ReadonlySet<string> {
  return useSyncExternalStore(
    sectionCollapse.subscribe,
    useCallback(() => sectionCollapse.collapsed(hostId ?? ''), [hostId]),
  );
}
