export function focusedSource<Snapshot>(source: {
  getSnapshot(): Snapshot;
  subscribe(listener: () => void): () => void;
}) {
  let value = source.getSnapshot();
  let focused = false;
  let off: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const update = () => {
    const next = source.getSnapshot();
    if (Object.is(next, value)) return;
    value = next;
    for (const listener of listeners) listener();
  };
  const sync = () => {
    if (focused && listeners.size > 0) {
      off ??= source.subscribe(update);
      update();
    } else {
      off?.();
      off = undefined;
    }
  };
  return {
    getSnapshot: () => value,
    subscribe(listener: () => void) {
      listeners.add(listener);
      sync();
      return () => {
        listeners.delete(listener);
        sync();
      };
    },
    focus(next: boolean) {
      focused = next;
      sync();
    },
  };
}
