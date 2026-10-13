import { defaultStorage, type ConfigStorage } from './roster-config.js';

export type InboxLayout = 'time' | 'source';

export const INBOX_VIEW_PREFERENCES_KEY = 'botharness/inbox-view.v1';

const listeners = new Set<() => void>();
let snapshot: InboxLayout | undefined;

export function readInboxLayout(
  storage: ConfigStorage | undefined = defaultStorage(),
): InboxLayout {
  try {
    const record: unknown = JSON.parse(storage?.getItem(INBOX_VIEW_PREFERENCES_KEY) ?? '{}');
    return typeof record === 'object' &&
      record !== null &&
      (record as Record<string, unknown>)['layout'] === 'source'
      ? 'source'
      : 'time';
  } catch {
    return 'time';
  }
}

export function inboxLayoutSnapshot(): InboxLayout {
  snapshot ??= readInboxLayout();
  return snapshot;
}

export function subscribeInboxLayout(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setInboxLayout(
  layout: InboxLayout,
  storage: ConfigStorage | undefined = defaultStorage(),
): void {
  snapshot = layout;
  try {
    storage?.setItem(INBOX_VIEW_PREFERENCES_KEY, JSON.stringify({ layout }));
  } catch {}
  listeners.forEach((listener) => listener());
}
