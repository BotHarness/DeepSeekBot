import { File, Paths } from 'expo-file-system';
import { useMemo, useSyncExternalStore } from 'react';

import { createActivityCountPreferences, observeActivityCount } from './activity-count';
import { useHostSession } from './host-session';

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

const empty = { count: undefined, stale: false };

export function useActivityCount() {
  const { client, inbox } = useHostSession();
  const observer = useMemo(
    () =>
      client && inbox ? observeActivityCount(client, inbox, activityCountPreferences) : undefined,
    [client, inbox],
  );
  return useSyncExternalStore(
    observer?.subscribe ?? (() => () => {}),
    observer?.getSnapshot ?? (() => empty),
  );
}
