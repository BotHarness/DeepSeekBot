export interface ReadSequence<K extends object> {
  begin(key: K): () => boolean;
  wrote(key: K): void;
}

export function createReadSequence<K extends object>(): ReadSequence<K> {
  const writes = new WeakMap<K, number>();
  const started = new WeakMap<K, number>();
  const committed = new WeakMap<K, number>();
  return {
    begin(key) {
      const issued = writes.get(key) ?? 0;
      const read = (started.get(key) ?? 0) + 1;
      started.set(key, read);
      return () => {
        if ((writes.get(key) ?? 0) !== issued || (committed.get(key) ?? 0) > read) return false;
        committed.set(key, read);
        return true;
      };
    },
    wrote(key) {
      writes.set(key, (writes.get(key) ?? 0) + 1);
    },
  };
}
