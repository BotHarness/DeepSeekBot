const EMPTY: readonly string[] = [];

export interface QuietChannels {
  get(hostId: string | undefined): readonly string[];
  set(hostId: string, channelIds: readonly string[]): void;
  subscribe(listener: () => void): () => void;
}

export function createQuietChannels(): QuietChannels {
  const byHost = new Map<string, readonly string[]>();
  const listeners = new Set<() => void>();
  return {
    get: (hostId) => (hostId === undefined ? EMPTY : (byHost.get(hostId) ?? EMPTY)),
    set(hostId, channelIds) {
      const previous = byHost.get(hostId) ?? EMPTY;
      if (
        previous.length === channelIds.length &&
        previous.every((id, index) => id === channelIds[index])
      )
        return;
      byHost.set(hostId, [...channelIds]);
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
