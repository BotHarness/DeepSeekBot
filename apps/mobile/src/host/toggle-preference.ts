export function createTogglePreference(
  storage: {
    read(): Promise<unknown>;
    write(enabled: boolean): void;
  },
  fallback: boolean,
) {
  let snapshot = { enabled: fallback, loaded: false, storageError: false };
  let touched = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const persist = () => {
    try {
      storage.write(snapshot.enabled);
      snapshot = { ...snapshot, storageError: false };
    } catch {
      snapshot = { ...snapshot, storageError: true };
    }
  };
  const ready = storage
    .read()
    .then(
      (value) => {
        if (!touched && typeof value === 'boolean') snapshot = { ...snapshot, enabled: value };
        else if (value !== undefined && typeof value !== 'boolean')
          snapshot = { ...snapshot, storageError: true };
      },
      () => {
        snapshot = { ...snapshot, storageError: true };
      },
    )
    .then(() => {
      snapshot = { ...snapshot, loaded: true };
      if (touched) persist();
      notify();
    });
  return {
    ready,
    getSnapshot: () => snapshot,
    setEnabled(enabled: boolean) {
      touched = true;
      snapshot = { ...snapshot, enabled };
      if (snapshot.loaded) persist();
      notify();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
