import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { focusedSource } from './focused-source';

export function useFocusedSnapshot<Snapshot>(
  source: {
    getSnapshot(): Snapshot;
    subscribe(listener: () => void): () => void;
  },
  enabled = true,
): Snapshot {
  const focused = useMemo(() => focusedSource(source), [source]);
  useFocusEffect(
    useCallback(() => {
      focused.focus(enabled);
      return () => focused.focus(false);
    }, [focused, enabled]),
  );
  return useSyncExternalStore(focused.subscribe, focused.getSnapshot);
}
