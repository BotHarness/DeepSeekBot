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
  let hydrated = false;
  const changed = new Map<string, Set<string>>();
  const persist = () =>
    storage.write(Object.fromEntries([...byHost].map(([id, ids]) => [id, [...ids]])));
  const finish = (): void => {
    hydrated = true;
    if (changed.size > 0) persist();
    changed.clear();
    notify();
  };
  void storage.read().then((value) => {
    if (typeof value === 'object' && value !== null) {
      for (const [hostId, ids] of Object.entries(value)) {
        if (!Array.isArray(ids)) continue;
        const merged = new Set(ids.filter((id): id is string => typeof id === 'string'));
        for (const section of changed.get(hostId) ?? []) {
          if (byHost.get(hostId)?.has(section)) merged.add(section);
          else merged.delete(section);
        }
        byHost.set(hostId, merged);
      }
    }
    finish();
  }, finish);
  return {
    collapsed: (hostId) => byHost.get(hostId) ?? NONE,
    toggle(hostId, sectionId) {
      const next = new Set(byHost.get(hostId));
      if (!next.delete(sectionId)) next.add(sectionId);
      byHost.set(hostId, next);
      if (hydrated) persist();
      else {
        const sections = changed.get(hostId) ?? new Set<string>();
        sections.add(sectionId);
        changed.set(hostId, sections);
      }
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
