export function createConversationFilter(storage: {
  read(): Promise<unknown>;
  write(value: string): void;
}) {
  let value = 'all';
  let touched = false;
  const listeners = new Set<() => void>();
  const publish = () => {
    for (const listener of listeners) listener();
  };
  const ready = storage
    .read()
    .then((stored) => {
      if (!touched && typeof stored === 'string' && stored.length < 4096) {
        value = stored;
        publish();
      }
    })
    .catch(() => undefined);
  return {
    ready,
    getSnapshot: () => value,
    set(next: string) {
      touched = true;
      value = next;
      try {
        storage.write(value);
      } catch {}
      publish();
    },
    async clearPersisted(expected: string) {
      await ready;
      const stored = await storage.read();
      if (stored === expected || value === expected) {
        const next = value === expected ? 'all' : value;
        storage.write(next);
        touched = true;
        value = next;
        publish();
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
