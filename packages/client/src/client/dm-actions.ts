import type { ChannelMessage } from './store.js';

export type DmActionKind = 'posts' | 'memory';

export const DM_ACTION_KINDS: readonly DmActionKind[] = ['posts', 'memory'];

const STORAGE_KEY = 'botharness.dm-actions.hidden.v1';

export function dmActionKind(message: ChannelMessage): DmActionKind | undefined {
  if (message.botChannelPost !== undefined) return 'posts';
  if (message.memoryCommit !== undefined && message.noticeOrigin !== undefined) return 'memory';
  return undefined;
}

export function visibleDmMessages(
  messages: readonly ChannelMessage[],
  hidden: readonly DmActionKind[],
): ChannelMessage[] {
  if (hidden.length === 0) return [...messages];
  return messages.filter((message) => {
    const kind = dmActionKind(message);
    return kind === undefined || !hidden.includes(kind);
  });
}

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function readAll(): Record<string, DmActionKind[]> {
  try {
    const parsed: unknown = JSON.parse(storage()?.getItem(STORAGE_KEY) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([slug, kinds]) =>
        Array.isArray(kinds)
          ? [[slug, DM_ACTION_KINDS.filter((kind) => kinds.includes(kind))]]
          : [],
      ),
    );
  } catch {
    return {};
  }
}

const listeners = new Set<() => void>();
const snapshots = new Map<string, readonly DmActionKind[]>();
const NONE: readonly DmActionKind[] = [];

export function subscribeHiddenDmActions(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function hiddenDmActionsSnapshot(botSlug: string | undefined): readonly DmActionKind[] {
  if (botSlug === undefined) return NONE;
  const cached = snapshots.get(botSlug);
  if (cached !== undefined) return cached;
  const loaded = readAll()[botSlug] ?? NONE;
  snapshots.set(botSlug, loaded);
  return loaded;
}

export function toggleHiddenDmAction(botSlug: string, kind: DmActionKind): void {
  const current = hiddenDmActionsSnapshot(botSlug);
  const hidden = current.includes(kind)
    ? current.filter((entry) => entry !== kind)
    : [...current, kind];
  const all = readAll();
  if (hidden.length === 0) delete all[botSlug];
  else all[botSlug] = hidden;
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {}
  snapshots.set(botSlug, hidden);
  for (const listener of listeners) listener();
}

export type DmMemoryDisplay = 'compact' | 'detailed';
export const DM_MEMORY_DISPLAYS: readonly DmMemoryDisplay[] = ['compact', 'detailed'];
const MEMORY_DISPLAY_STORAGE_KEY = 'botharness.dm-actions.memory-display.v1';
const memoryDisplays = new Map<string, DmMemoryDisplay>();

function readMemoryDisplays(): Record<string, DmMemoryDisplay> {
  try {
    const parsed: unknown = JSON.parse(storage()?.getItem(MEMORY_DISPLAY_STORAGE_KEY) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => value === 'compact' || value === 'detailed'),
    );
  } catch {
    return {};
  }
}

export function dmMemoryDisplaySnapshot(botSlug: string | undefined): DmMemoryDisplay {
  if (botSlug === undefined) return 'detailed';
  const cached = memoryDisplays.get(botSlug);
  if (cached !== undefined) return cached;
  const display = readMemoryDisplays()[botSlug] ?? 'detailed';
  memoryDisplays.set(botSlug, display);
  return display;
}

export function setDmMemoryDisplay(botSlug: string, display: DmMemoryDisplay): void {
  const all = readMemoryDisplays();
  all[botSlug] = display;
  try {
    storage()?.setItem(MEMORY_DISPLAY_STORAGE_KEY, JSON.stringify(all));
  } catch {}
  memoryDisplays.set(botSlug, display);
  for (const listener of listeners) listener();
}
