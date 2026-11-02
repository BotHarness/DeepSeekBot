import { File, Paths } from 'expo-file-system';
import { useCallback, useSyncExternalStore } from 'react';

import { createSectionCollapse } from './section-collapse';

function nativeCollapse(name: string) {
  const file = (): File => new File(Paths.document, name);
  return createSectionCollapse({
    async read() {
      const stored = file();
      return stored.exists ? (JSON.parse(await stored.text()) as unknown) : undefined;
    },
    write(value) {
      try {
        const stored = file();
        if (!stored.exists) stored.create();
        stored.writeSync(JSON.stringify(value));
      } catch {}
    },
  });
}

export const sectionCollapse = nativeCollapse('deepseekbot-sections.json');
export const activityCollapse = nativeCollapse('deepseekbot-activity-sections.json');

export function useCollapsedSections(hostId: string | undefined): ReadonlySet<string> {
  return useSyncExternalStore(
    sectionCollapse.subscribe,
    useCallback(() => sectionCollapse.collapsed(hostId ?? ''), [hostId]),
  );
}
