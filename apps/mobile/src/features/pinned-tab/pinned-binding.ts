export type PinnedBinding = { kind: 'bot'; slug: string } | { kind: 'channel'; id: string };

export interface PinnedBindingStorage {
  read(): Promise<unknown>;
  write(value: Record<string, PinnedBinding>): void;
}

export interface PinnedBindings {
  binding(hostId: string): PinnedBinding | undefined;
  bind(hostId: string, binding: PinnedBinding | undefined): void;
  subscribe(listener: () => void): () => void;
}

export function parsePinnedBinding(value: unknown): PinnedBinding | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const entry = value as Record<string, unknown>;
  if (entry['kind'] === 'bot' && typeof entry['slug'] === 'string' && entry['slug'] !== '')
    return { kind: 'bot', slug: entry['slug'] };
  if (entry['kind'] === 'channel' && typeof entry['id'] === 'string' && entry['id'] !== '')
    return { kind: 'channel', id: entry['id'] };
  return undefined;
}

export function createPinnedBindings(storage: PinnedBindingStorage): PinnedBindings {
  const byHost = new Map<string, PinnedBinding>();
  const changed = new Set<string>();
  const listeners = new Set<() => void>();
  let hydrated = false;
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const persist = () => {
    try {
      storage.write(Object.fromEntries(byHost));
    } catch {}
  };
  const finish = () => {
    hydrated = true;
    if (changed.size > 0) persist();
    changed.clear();
    notify();
  };
  void storage.read().then((value) => {
    if (typeof value === 'object' && value !== null)
      for (const [hostId, stored] of Object.entries(value)) {
        if (changed.has(hostId)) continue;
        const binding = parsePinnedBinding(stored);
        if (binding !== undefined) byHost.set(hostId, binding);
      }
    finish();
  }, finish);
  return {
    binding: (hostId) => byHost.get(hostId),
    bind(hostId, binding) {
      if (binding === undefined) byHost.delete(hostId);
      else byHost.set(hostId, binding);
      if (hydrated) persist();
      else changed.add(hostId);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
