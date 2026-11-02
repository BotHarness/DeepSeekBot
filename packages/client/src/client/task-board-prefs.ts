import { defaultStorage, type ConfigStorage } from './roster-config.js';
import type { TaskBoardViewPrefs } from './task-board-model.js';

const STORAGE_KEY = 'botharness.task-board-prefs';
const MAX_TRACKED_KEYS = 200;

export const TASK_BOARD_PREFS_KEY = STORAGE_KEY;

export interface TaskBoardPrefsSnapshot {
  openByChannel: Readonly<Record<string, boolean>>;
  collapsedBots: Readonly<Record<string, boolean>>;
  showDoneSteps: boolean;
  autoExpandWorking: boolean;
  onlyWorking: boolean;
}

export interface TaskBoardPrefs {
  getSnapshot(): TaskBoardPrefsSnapshot;
  subscribe(listener: () => void): () => void;
  isOpen(channelId: string): boolean;
  setOpen(channelId: string, open: boolean): void;
  isBotCollapsed(botSlug: string): boolean | undefined;
  setBotCollapsed(botSlug: string, collapsed: boolean): void;
  viewPrefs(): TaskBoardViewPrefs;
  setShowDoneSteps(value: boolean): void;
  setAutoExpandWorking(value: boolean): void;
  setOnlyWorking(value: boolean): void;
}

export const EMPTY_TASK_BOARD_PREFS: TaskBoardPrefsSnapshot = Object.freeze({
  openByChannel: Object.freeze({}),
  collapsedBots: Object.freeze({}),
  showDoneSteps: true,
  autoExpandWorking: false,
  onlyWorking: false,
});

function booleanMap(value: unknown): Readonly<Record<string, boolean>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return Object.freeze({});
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, boolean] =>
      entry[0].length > 0 && entry[0].length <= 200 && typeof entry[1] === 'boolean',
  );
  return Object.freeze(Object.fromEntries(entries.slice(-MAX_TRACKED_KEYS)));
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function withFlagged(
  map: Readonly<Record<string, boolean>>,
  key: string,
  value: boolean,
): Readonly<Record<string, boolean>> {
  const rest = Object.entries(map).filter(([existing]) => existing !== key);
  return Object.freeze(Object.fromEntries([...rest, [key, value]].slice(-MAX_TRACKED_KEYS)));
}

export function createTaskBoardPrefs(storage: ConfigStorage | undefined): TaskBoardPrefs {
  let snapshot = EMPTY_TASK_BOARD_PREFS;
  const listeners = new Set<() => void>();

  const read = (): TaskBoardPrefsSnapshot => {
    if (storage === undefined) return EMPTY_TASK_BOARD_PREFS;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw === null) return EMPTY_TASK_BOARD_PREFS;
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
        return EMPTY_TASK_BOARD_PREFS;
      const record = parsed as Record<string, unknown>;
      return {
        openByChannel: booleanMap(record['openByChannel']),
        collapsedBots: booleanMap(record['collapsedBots']),
        showDoneSteps: flag(record['showDoneSteps'], true),
        autoExpandWorking: flag(record['autoExpandWorking'], false),
        onlyWorking: flag(record['onlyWorking'], false),
      };
    } catch {
      return EMPTY_TASK_BOARD_PREFS;
    }
  };

  const publish = (next: TaskBoardPrefsSnapshot): void => {
    snapshot = next;
    if (storage !== undefined) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
    }
    for (const listener of listeners) listener();
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
    isOpen: (channelId) => snapshot.openByChannel[channelId] === true,
    setOpen(channelId, open) {
      if (snapshot.openByChannel[channelId] === open) return;
      publish({ ...snapshot, openByChannel: withFlagged(snapshot.openByChannel, channelId, open) });
    },
    isBotCollapsed: (botSlug) => snapshot.collapsedBots[botSlug],
    setBotCollapsed(botSlug, collapsed) {
      if (snapshot.collapsedBots[botSlug] === collapsed) return;
      publish({
        ...snapshot,
        collapsedBots: withFlagged(snapshot.collapsedBots, botSlug, collapsed),
      });
    },
    viewPrefs: () => ({
      collapsedBots: snapshot.collapsedBots,
      showDoneSteps: snapshot.showDoneSteps,
      autoExpandWorking: snapshot.autoExpandWorking,
      onlyWorking: snapshot.onlyWorking,
    }),
    setShowDoneSteps(value) {
      if (snapshot.showDoneSteps === value) return;
      publish({ ...snapshot, showDoneSteps: value });
    },
    setAutoExpandWorking(value) {
      if (snapshot.autoExpandWorking === value) return;
      publish({ ...snapshot, autoExpandWorking: value });
    },
    setOnlyWorking(value) {
      if (snapshot.onlyWorking === value) return;
      publish({ ...snapshot, onlyWorking: value });
    },
  };
}

export const taskBoardPrefs = createTaskBoardPrefs(defaultStorage());
