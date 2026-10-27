export const BOT_PROFILE_TABS = ['work', 'memory', 'files', 'routines', 'settings'] as const;
export type ProfileTab = (typeof BOT_PROFILE_TABS)[number];

export const BOT_PAIR_TABS: readonly ProfileTab[] = ['files'];

export type ProfileKind = 'bot' | 'bot-pair';

export function profileTabs(kind: ProfileKind): readonly ProfileTab[] {
  return kind === 'bot' ? BOT_PROFILE_TABS : BOT_PAIR_TABS;
}

export function isProfileTab(value: unknown): value is ProfileTab {
  return typeof value === 'string' && (BOT_PROFILE_TABS as readonly string[]).includes(value);
}

export function openingTab(tabs: readonly ProfileTab[], remembered: unknown): ProfileTab {
  return isProfileTab(remembered) && tabs.includes(remembered) ? remembered : tabs[0]!;
}

export function swipedTab(
  tabs: readonly ProfileTab[],
  current: ProfileTab,
  forward: boolean,
): ProfileTab | undefined {
  const index = tabs.indexOf(current);
  return index === -1 ? undefined : tabs[index + (forward ? 1 : -1)];
}

export interface ProfileTabMemory {
  get(kind: 'bot'): ProfileTab | undefined;
  remember(kind: 'bot', tab: ProfileTab): void;
  subscribe(listener: () => void): () => void;
}

export function createProfileTabMemory(storage: {
  read(): Promise<unknown>;
  write(value: Record<string, ProfileTab>): void;
}): ProfileTabMemory {
  const values = new Map<string, ProfileTab>();
  const touched = new Set<string>();
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  void storage.read().then(
    (stored) => {
      if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return;
      let changed = false;
      for (const [kind, tab] of Object.entries(stored)) {
        if (touched.has(kind) || !isProfileTab(tab)) continue;
        values.set(kind, tab);
        changed = true;
      }
      if (changed) notify();
    },
    () => {},
  );
  return {
    get: (kind) => values.get(kind),
    remember(kind, tab) {
      touched.add(kind);
      if (values.get(kind) === tab) return;
      values.set(kind, tab);
      storage.write(Object.fromEntries(values));
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
