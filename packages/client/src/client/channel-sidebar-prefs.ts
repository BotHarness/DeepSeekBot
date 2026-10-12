import type { ChannelSidebarScope } from './channel-sidebar.js';
import { defaultStorage, type ConfigStorage } from './roster-config.js';

const STORAGE_KEY = 'botharness.channel-sidebar';

export const DEFAULT_CHANNEL_SIDEBAR_WIDTH = 320;
export const MIN_CHANNEL_SIDEBAR_WIDTH = 260;
export const MAX_CHANNEL_SIDEBAR_WIDTH = 560;
export type MemoryTerminology = 'memory' | 'git';

export function clampChannelSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_CHANNEL_SIDEBAR_WIDTH;
  return Math.min(
    MAX_CHANNEL_SIDEBAR_WIDTH,
    Math.max(MIN_CHANNEL_SIDEBAR_WIDTH, Math.round(width)),
  );
}

export interface ChannelSidebarPrefsSnapshot {
  collapsedSidebars: readonly string[];
  expandedEntries: readonly string[];
  width: number;
  memoryTerminology: MemoryTerminology;
  entryOrders: Readonly<Record<ChannelSidebarScope, readonly string[]>>;
  hiddenEntries: Readonly<Record<ChannelSidebarScope, readonly string[]>>;
  shownEntries: Readonly<Record<ChannelSidebarScope, readonly string[]>>;
  selectedTabs: Readonly<Record<string, string>>;
  splitRatios: Readonly<Record<string, number>>;
}

export interface ChannelSidebarPrefs {
  getSnapshot(): ChannelSidebarPrefsSnapshot;
  subscribe(listener: () => void): () => void;
  isSidebarCollapsed(scopeKey: string): boolean;
  setSidebarCollapsed(scopeKey: string, collapsed: boolean): void;
  isEntryExpanded(scopeKey: string, entryId: string): boolean;
  setEntryExpanded(scopeKey: string, entryId: string, expanded: boolean): void;
  setEntryOrder(scope: ChannelSidebarScope, ids: readonly string[]): void;
  setEntryLayout(
    scope: ChannelSidebarScope,
    order: readonly string[],
    hidden: readonly string[],
    shown?: readonly string[],
  ): void;
  setSelectedTab(scopeKey: string, tabId: string): void;
  setSplitRatio(tabId: string, ratio: number): void;
  setWidth(width: number): void;
  setMemoryTerminology(terminology: MemoryTerminology): void;
}

const EMPTY_TABS: Readonly<Record<string, string>> = Object.freeze({});

const EMPTY: ChannelSidebarPrefsSnapshot = Object.freeze({
  collapsedSidebars: Object.freeze([]),
  expandedEntries: Object.freeze([]),
  width: DEFAULT_CHANNEL_SIDEBAR_WIDTH,
  memoryTerminology: 'memory',
  entryOrders: Object.freeze({ personabot: Object.freeze([]), channel: Object.freeze([]) }),
  hiddenEntries: Object.freeze({ personabot: Object.freeze([]), channel: Object.freeze([]) }),
  shownEntries: Object.freeze({ personabot: Object.freeze([]), channel: Object.freeze([]) }),
  selectedTabs: Object.freeze({}),
  splitRatios: Object.freeze({}),
});

export const DEFAULT_SPLIT_RATIO = 0.5;
export const MIN_SPLIT_RATIO = 0.15;
export const MAX_SPLIT_RATIO = 0.85;

export function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_SPLIT_RATIO;
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, Math.round(ratio * 1000) / 1000));
}

function splitRatioMap(value: unknown): Readonly<Record<string, number>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return Object.freeze({});
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(
          (entry): entry is [string, number] =>
            entry[0].length <= 200 && typeof entry[1] === 'number' && Number.isFinite(entry[1]),
        )
        .slice(0, 50)
        .map(([id, ratio]) => [id, clampSplitRatio(ratio)]),
    ),
  );
}

const MAX_SELECTED_TABS = 200;

function selectedTabMap(value: unknown): Readonly<Record<string, string>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return EMPTY_TABS;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === 'string' && entry[1].length > 0 && entry[1].length <= 200,
  );
  return Object.freeze(Object.fromEntries(entries.slice(-MAX_SELECTED_TABS)));
}

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function entryIds(value: unknown): readonly string[] {
  return Object.freeze(
    [...new Set(stringList(value).filter((id) => id.length > 0 && id.length <= 200))].slice(0, 200),
  );
}
function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function channelSidebarScopeKey(
  scope: 'channel' | 'personabot',
  channelId: string,
  botSlug: string | undefined,
): string {
  return scope === 'personabot' ? `personabot:${botSlug ?? channelId}` : `channel:${channelId}`;
}

function entryKey(scopeKey: string, entryId: string): string {
  return `${scopeKey}/${entryId}`;
}

export function createChannelSidebarPrefs(storage: ConfigStorage | undefined): ChannelSidebarPrefs {
  let snapshot = EMPTY;
  const listeners = new Set<() => void>();

  const read = (): ChannelSidebarPrefsSnapshot => {
    if (storage === undefined) return EMPTY;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw === null) return EMPTY;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const width = parsed['width'];
      const memoryTerminology = parsed['memoryTerminology'];
      const orders = parsed['entryOrders'];
      const entryOrders =
        orders !== null && typeof orders === 'object' ? (orders as Record<string, unknown>) : {};
      const hidden = parsed['hiddenEntries'];
      const hiddenEntries =
        hidden !== null && typeof hidden === 'object' ? (hidden as Record<string, unknown>) : {};
      const shown = parsed['shownEntries'];
      const shownEntries =
        shown !== null && typeof shown === 'object' ? (shown as Record<string, unknown>) : {};
      const order = (scope: ChannelSidebarScope) => entryIds(entryOrders[scope]);
      return {
        collapsedSidebars: Object.freeze(stringList(parsed['collapsedSidebars'])),
        expandedEntries: Object.freeze(stringList(parsed['expandedEntries'])),
        width:
          typeof width === 'number'
            ? clampChannelSidebarWidth(width)
            : DEFAULT_CHANNEL_SIDEBAR_WIDTH,
        memoryTerminology: memoryTerminology === 'git' ? 'git' : 'memory',
        entryOrders: Object.freeze({ personabot: order('personabot'), channel: order('channel') }),
        hiddenEntries: Object.freeze({
          personabot: entryIds(hiddenEntries['personabot']),
          channel: entryIds(hiddenEntries['channel']),
        }),
        shownEntries: Object.freeze({
          personabot: entryIds(shownEntries['personabot']),
          channel: entryIds(shownEntries['channel']),
        }),
        selectedTabs: selectedTabMap(parsed['selectedTabs']),
        splitRatios: splitRatioMap(parsed['splitRatios']),
      };
    } catch {
      return EMPTY;
    }
  };

  const publish = (next: ChannelSidebarPrefsSnapshot): void => {
    snapshot = next;
    if (storage !== undefined) {
      try {
        storage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            collapsedSidebars: next.collapsedSidebars,
            expandedEntries: next.expandedEntries,
            width: next.width,
            memoryTerminology: next.memoryTerminology,
            entryOrders: next.entryOrders,
            hiddenEntries: next.hiddenEntries,
            shownEntries: next.shownEntries,
            selectedTabs: next.selectedTabs,
            splitRatios: next.splitRatios,
          }),
        );
      } catch {}
    }
    for (const listener of listeners) listener();
  };

  const toggleIn = (list: readonly string[], key: string, present: boolean): readonly string[] => {
    const next = new Set(list);
    if (present) next.add(key);
    else next.delete(key);
    return Object.freeze([...next]);
  };

  const setEntryLayout = (
    scope: ChannelSidebarScope,
    order: readonly string[],
    hidden: readonly string[],
    shown: readonly string[] = snapshot.shownEntries[scope],
  ): void => {
    const nextOrder = entryIds(order);
    const nextHidden = entryIds(hidden);
    const nextShown = entryIds(shown);
    if (
      sameIds(nextOrder, snapshot.entryOrders[scope]) &&
      sameIds(nextHidden, snapshot.hiddenEntries[scope]) &&
      sameIds(nextShown, snapshot.shownEntries[scope])
    )
      return;
    publish({
      ...snapshot,
      entryOrders: Object.freeze({ ...snapshot.entryOrders, [scope]: nextOrder }),
      hiddenEntries: Object.freeze({ ...snapshot.hiddenEntries, [scope]: nextHidden }),
      shownEntries: Object.freeze({ ...snapshot.shownEntries, [scope]: nextShown }),
    });
  };

  snapshot = read();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isSidebarCollapsed: (scopeKey) => snapshot.collapsedSidebars.includes(scopeKey),
    setSidebarCollapsed(scopeKey, collapsed) {
      const current = snapshot.collapsedSidebars.includes(scopeKey);
      if (current === collapsed) return;
      publish({
        ...snapshot,
        collapsedSidebars: toggleIn(snapshot.collapsedSidebars, scopeKey, collapsed),
      });
    },
    isEntryExpanded: (scopeKey, id) => snapshot.expandedEntries.includes(entryKey(scopeKey, id)),
    setEntryExpanded(scopeKey, id, expanded) {
      const key = entryKey(scopeKey, id);
      const current = snapshot.expandedEntries.includes(key);
      if (current === expanded) return;
      publish({
        ...snapshot,
        expandedEntries: toggleIn(snapshot.expandedEntries, key, expanded),
      });
    },
    setEntryOrder(scope, ids) {
      setEntryLayout(scope, ids, snapshot.hiddenEntries[scope]);
    },
    setEntryLayout,
    setSelectedTab(scopeKey, tabId) {
      if (snapshot.selectedTabs[scopeKey] === tabId) return;
      const rest = Object.entries(snapshot.selectedTabs).filter(([key]) => key !== scopeKey);
      publish({
        ...snapshot,
        selectedTabs: Object.freeze(
          Object.fromEntries([...rest, [scopeKey, tabId]].slice(-MAX_SELECTED_TABS)),
        ),
      });
    },
    setSplitRatio(tabId, ratio) {
      const next = clampSplitRatio(ratio);
      if (snapshot.splitRatios[tabId] === next) return;
      publish({
        ...snapshot,
        splitRatios: Object.freeze({ ...snapshot.splitRatios, [tabId]: next }),
      });
    },
    setWidth(width) {
      const next = clampChannelSidebarWidth(width);
      if (next === snapshot.width) return;
      publish({ ...snapshot, width: next });
    },
    setMemoryTerminology(terminology) {
      if (snapshot.memoryTerminology === terminology) return;
      publish({ ...snapshot, memoryTerminology: terminology });
    },
  };
}

export const channelSidebarPrefs = createChannelSidebarPrefs(defaultStorage());
