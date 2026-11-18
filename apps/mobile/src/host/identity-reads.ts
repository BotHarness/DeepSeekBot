export interface ReadSequence<K extends object> {
  begin(key: K): () => boolean;
  wrote(key: K): void;
}

export function createReadSequence<K extends object>(): ReadSequence<K> {
  const writes = new WeakMap<K, number>();
  const reads = new WeakMap<K, number>();
  return {
    begin(key) {
      const issued = writes.get(key) ?? 0;
      const read = (reads.get(key) ?? 0) + 1;
      reads.set(key, read);
      return () => (writes.get(key) ?? 0) !== issued || reads.get(key) !== read;
    },
    wrote(key) {
      writes.set(key, (writes.get(key) ?? 0) + 1);
    },
  };
}
