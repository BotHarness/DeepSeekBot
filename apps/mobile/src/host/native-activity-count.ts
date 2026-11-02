import { File, Paths } from 'expo-file-system';
import { useMemo, useSyncExternalStore } from 'react';

import { createActivityCountPreferences } from './activity-count';
import { useActivitySources } from './native-activity-sources';
import { observeActivitySourceCount } from './activity-sources';

const file = () => new File(Paths.document, 'deepseekbot-activity-count.json');

export const activityCountPreferences = createActivityCountPreferences({
  async read() {
    const stored = file();
    return stored.exists ? (JSON.parse(await stored.text()) as unknown) : undefined;
  },
  write(kinds) {
    const stored = file();
    if (!stored.exists) stored.create();
    stored.writeSync(JSON.stringify(kinds));
  },
});

export function useActivityCountPreferences() {
  return useSyncExternalStore(
    activityCountPreferences.subscribe,
    activityCountPreferences.getSnapshot,
  );
}

export function useActivityCount() {
  const sources = useActivitySources();
  const observer = useMemo(
    () => observeActivitySourceCount(sources, activityCountPreferences),
    [sources],
  );
  return useSyncExternalStore(observer.subscribe, observer.getSnapshot);
}
