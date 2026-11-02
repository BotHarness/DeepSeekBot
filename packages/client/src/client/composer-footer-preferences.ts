import { useSyncExternalStore } from 'react';

export const FOOTER_ITEMS = ['model', 'workspace', 'usage', 'avg-perf'] as const;
export type FooterItem = (typeof FOOTER_ITEMS)[number];
export type FooterSide = 'left' | 'right';
export interface FooterPreferences {
  left: FooterItem[];
  right: FooterItem[];
  hidden: FooterItem[];
}
export const FOOTER_STORAGE_KEY = 'botharness.composer-footer.v1';
export function defaultFooterPreferences(): FooterPreferences {
  return { left: ['model', 'workspace'], right: ['usage'], hidden: ['avg-perf'] };
}
export function parseFooterPreferences(raw: string | null): FooterPreferences {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (typeof value !== 'object' || value === null) return defaultFooterPreferences();
    const record = value as Record<string, unknown>;
    const seen = new Set<FooterItem>();
    const result = defaultFooterPreferences();
    for (const key of ['left', 'right', 'hidden'] as const) {
      if (!Array.isArray(record[key])) return defaultFooterPreferences();
      result[key] = [];
      for (const item of record[key]) {
        if (!FOOTER_ITEMS.includes(item) || seen.has(item)) return defaultFooterPreferences();
        seen.add(item);
        result[key].push(item);
      }
    }
    return seen.size === FOOTER_ITEMS.length ? result : defaultFooterPreferences();
  } catch {
    return defaultFooterPreferences();
  }
}
export function moveFooterItem(
  value: FooterPreferences,
  item: FooterItem,
  side: FooterSide,
  before?: FooterItem,
): FooterPreferences {
  if (before === item) return value;
  const result: FooterPreferences = {
    left: value.left.filter((id) => id !== item),
    right: value.right.filter((id) => id !== item),
    hidden: value.hidden.filter((id) => id !== item),
  };
  const index = before === undefined ? -1 : result[side].indexOf(before);
  result[side].splice(index < 0 ? result[side].length : index, 0, item);
  return result;
}
export function toggleFooterItem(value: FooterPreferences, item: FooterItem): FooterPreferences {
  if (value.hidden.includes(item))
    return moveFooterItem(value, item, item === 'usage' ? 'right' : 'left');
  return {
    left: value.left.filter((id) => id !== item),
    right: value.right.filter((id) => id !== item),
    hidden: [...value.hidden, item],
  };
}
let snapshot: FooterPreferences | undefined;
const listeners = new Set<() => void>();
function read(): FooterPreferences {
  if (snapshot === undefined) {
    try {
      snapshot = parseFooterPreferences(
        globalThis.localStorage?.getItem(FOOTER_STORAGE_KEY) ?? null,
      );
    } catch {
      snapshot = defaultFooterPreferences();
    }
  }
  return snapshot;
}
export function saveFooterPreferences(value: FooterPreferences): void {
  snapshot = value;
  try {
    globalThis.localStorage?.setItem(FOOTER_STORAGE_KEY, JSON.stringify(value));
  } catch {}
  listeners.forEach((listener) => listener());
}
function onStorage(event: StorageEvent): void {
  if (event.key !== FOOTER_STORAGE_KEY && event.key !== null) return;
  snapshot = undefined;
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) globalThis.addEventListener?.('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) globalThis.removeEventListener?.('storage', onStorage);
  };
}
export function useFooterPreferences(): FooterPreferences {
  return useSyncExternalStore(subscribe, read, read);
}
