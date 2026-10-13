import { defaultStorage, type ConfigStorage } from './roster-config.js';

export type SessionScope = 'current' | 'all';
export type SessionLayout = 'status' | 'workspace';
export type SessionStatusSection = 'working' | 'idle';

export interface SessionViewPreference {
  scope: SessionScope;
  layout: SessionLayout;
  collapsedWorkspaces: string[];
  collapsedSections: SessionStatusSection[];
}

export const SESSION_VIEW_PREFERENCES_KEY = 'botharness/session-views.v1';

interface SessionViewStoreEntry {
  snapshot: SessionViewPreference;
  listeners: Set<() => void>;
}

const sessionViewStore = new Map<string, SessionViewStoreEntry>();

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function allPreferences(storage: ConfigStorage | undefined): Record<string, unknown> {
  try {
    return asRecord(JSON.parse(storage?.getItem(SESSION_VIEW_PREFERENCES_KEY) ?? '{}')) ?? {};
  } catch {
    return {};
  }
}

export function readSessionViewPreference(
  botSlug: string,
  storage: ConfigStorage | undefined = defaultStorage(),
): SessionViewPreference {
  const record = asRecord(allPreferences(storage)[botSlug]);
  const collapsed = record?.['collapsedWorkspaces'];
  const sections = record?.['collapsedSections'];
  return {
    scope: record?.['scope'] === 'all' ? 'all' : 'current',
    layout: record?.['layout'] === 'workspace' ? 'workspace' : 'status',
    collapsedSections: Array.isArray(sections)
      ? (['working', 'idle'] as const).filter((section) => sections.includes(section))
      : [],
    collapsedWorkspaces: Array.isArray(collapsed)
      ? [
          ...new Set(
            collapsed.filter((key): key is string => typeof key === 'string' && key.length <= 4096),
          ),
        ].slice(0, 200)
      : [],
  };
}

export function writeSessionViewPreference(
  botSlug: string,
  preference: SessionViewPreference,
  storage: ConfigStorage | undefined = defaultStorage(),
): void {
  if (storage === undefined) return;
  try {
    const records = allPreferences(storage);
    records[botSlug] = preference;
    storage.setItem(SESSION_VIEW_PREFERENCES_KEY, JSON.stringify(records));
  } catch {}
}

function storeEntry(botSlug: string): SessionViewStoreEntry {
  let entry = sessionViewStore.get(botSlug);
  if (entry === undefined) {
    entry = { snapshot: readSessionViewPreference(botSlug), listeners: new Set() };
    sessionViewStore.set(botSlug, entry);
  }
  return entry;
}

export function sessionViewPreferenceSnapshot(botSlug: string): SessionViewPreference {
  return storeEntry(botSlug).snapshot;
}

export function subscribeSessionViewPreference(botSlug: string, listener: () => void): () => void {
  const entry = storeEntry(botSlug);
  entry.listeners.add(listener);
  return () => entry.listeners.delete(listener);
}

export function updateSessionViewPreference(
  botSlug: string,
  update: (current: SessionViewPreference) => SessionViewPreference,
): void {
  const entry = storeEntry(botSlug);
  entry.snapshot = update(entry.snapshot);
  writeSessionViewPreference(botSlug, entry.snapshot);
  entry.listeners.forEach((listener) => listener());
}
