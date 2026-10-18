import { useCallback, useMemo, useSyncExternalStore } from 'react';

export function useVisibleSnapshot<Snapshot>(
  source: { getSnapshot(): Snapshot; subscribe(listener: () => void): () => void },
  visible: boolean,
): Snapshot {
  const held = useMemo(() => ({ value: source.getSnapshot() }), [source]);
  const read = useCallback(() => {
    if (visible) held.value = source.getSnapshot();
    return held.value;
  }, [source, visible, held]);
  return useSyncExternalStore(
    useCallback(
      (listener: () => void) => (visible ? source.subscribe(listener) : () => {}),
      [source, visible],
    ),
    read,
  );
}
