import { Directory, File, Paths } from 'expo-file-system';

import type { ConversationCache } from './conversation';
import {
  computerCacheKey,
  type ComputerCacheSource,
  type RetainedTarget,
  type RetainedConversation,
} from './retained-search';

const root = (): Directory => new Directory(Paths.cache, 'deepseekbot-conversations');

const fileFor = (key: string): File => new File(root(), `${encodeURIComponent(key)}.json`);

type RemovedRecord = { source: ComputerCacheSource; target: RetainedTarget };
const listeners = new Set<(removed?: RemovedRecord) => void>();
const blocked = new Set<string>();
const epochs = new Map<string, number>();
const targetEpochs = new Map<string, number>();
const changed = (removed?: RemovedRecord) => {
  for (const listener of listeners) listener(removed);
};
const retainedKey = (source: ComputerCacheSource, target: RetainedTarget) =>
  JSON.stringify(['computer-v2', source.hostId, source.deviceId, target.kind, target.id]);

function files(source: ComputerCacheSource): File[] {
  const directory = root();
  if (!directory.exists) return [];
  return directory.list().filter((entry): entry is File => {
    if (!(entry instanceof File)) return false;
    try {
      const parts = JSON.parse(decodeURIComponent(entry.name.replace(/\.json$/, '')));
      return (
        parts[0] === 'computer-v2' && parts[1] === source.hostId && parts[2] === source.deviceId
      );
    } catch {
      return false;
    }
  });
}

export const retainedCache = {
  subscribe(listener: (removed?: RemovedRecord) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  allowed(source: ComputerCacheSource) {
    return !blocked.has(computerCacheKey(source));
  },
  authorize(source: ComputerCacheSource) {
    if (blocked.delete(computerCacheKey(source))) changed();
  },
  forget(source: ComputerCacheSource) {
    const key = computerCacheKey(source);
    blocked.add(key);
    epochs.set(key, (epochs.get(key) ?? 0) + 1);
    try {
      for (const file of files(source)) file.delete();
    } catch {}
    changed();
  },
  async read(
    source: ComputerCacheSource,
    target: RetainedTarget,
  ): Promise<RetainedConversation | undefined> {
    if (!this.allowed(source)) return undefined;
    const epoch = epochs.get(computerCacheKey(source)) ?? 0;
    const targetKey = retainedKey(source, target);
    const targetEpoch = targetEpochs.get(targetKey) ?? 0;
    const file = fileFor(targetKey);
    if (!file.exists) return undefined;
    const record = JSON.parse(await file.text()) as RetainedConversation;
    return epoch === (epochs.get(computerCacheKey(source)) ?? 0) &&
      targetEpoch === (targetEpochs.get(targetKey) ?? 0) &&
      this.allowed(source) &&
      record.target?.id === target.id &&
      record.target.kind === target.kind &&
      typeof record.target.name === 'string' &&
      Array.isArray(record.entries) &&
      typeof record.hasOlder === 'boolean'
      ? record
      : undefined;
  },
  async list(source: ComputerCacheSource): Promise<RetainedConversation[]> {
    if (!this.allowed(source)) return [];
    const result: RetainedConversation[] = [];
    for (const file of files(source)) {
      const parts = JSON.parse(decodeURIComponent(file.name.replace(/\.json$/, '')));
      const record = await this.read(source, { kind: parts[3], id: parts[4], name: '' });
      if (record) result.push(record);
    }
    return this.allowed(source) ? result : [];
  },
  conversation(source: ComputerCacheSource, target: () => RetainedTarget): ConversationCache {
    const key = computerCacheKey(source);
    const epoch = epochs.get(key) ?? 0;
    const targetKey = retainedKey(source, target());
    const targetEpoch = targetEpochs.get(targetKey) ?? 0;
    const invalidated = () =>
      epoch !== (epochs.get(key) ?? 0) || targetEpoch !== (targetEpochs.get(targetKey) ?? 0);
    return {
      onInvalidated: (listener) => {
        let reported = false;
        return this.subscribe(() => {
          if (!reported && invalidated()) {
            reported = true;
            listener();
          }
        });
      },
      read: () => (invalidated() ? Promise.resolve(undefined) : this.read(source, target())),
      write: (_key, value) => {
        if (invalidated() || !this.allowed(source)) return;
        try {
          const directory = root();
          if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
          const descriptor = target();
          fileFor(retainedKey(source, descriptor)).writeSync(
            JSON.stringify({ ...value, target: descriptor }),
          );
          changed();
        } catch {}
      },
      remove: () => {
        targetEpochs.set(targetKey, (targetEpochs.get(targetKey) ?? 0) + 1);
        try {
          const file = fileFor(retainedKey(source, target()));
          if (file.exists) file.delete();
        } catch {}
        changed({ source, target: target() });
      },
    };
  },
};
