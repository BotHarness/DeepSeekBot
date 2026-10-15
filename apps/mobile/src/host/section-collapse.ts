export interface CollapseStorage {
  read(): Promise<unknown>;
  write(value: Record<string, string[]>): void;
}

export interface SectionCollapse {
  collapsed(hostId: string): ReadonlySet<string>;
  toggle(hostId: string, sectionId: string): void;
  subscribe(listener: () => void): () => void;
}

const NONE: ReadonlySet<string> = new Set();

export function createSectionCollapse(storage: CollapseStorage): SectionCollapse {
  const byHost = new Map<string, ReadonlySet<string>>();
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  let touched = false;
  void storage.read().then(
    (value) => {
      if (touched || typeof value !== 'object' || value === null) return;
      for (const [hostId, ids] of Object.entries(value))
        if (Array.isArray(ids))
          byHost.set(hostId, new Set(ids.filter((id): id is string => typeof id === 'string')));
      notify();
    },
    () => undefined,
  );
  return {
    collapsed: (hostId) => byHost.get(hostId) ?? NONE,
    toggle(hostId, sectionId) {
      touched = true;
      const next = new Set(byHost.get(hostId));
      if (!next.delete(sectionId)) next.add(sectionId);
      byHost.set(hostId, next);
      storage.write(Object.fromEntries([...byHost].map(([id, ids]) => [id, [...ids]])));
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
