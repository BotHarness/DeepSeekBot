import type { BotModePrefsSnapshot } from './bot-mode-prefs.js';

interface SessionListRow {
  origin?: string;
  blank?: boolean;
  retainedBy?: Readonly<Record<string, number | undefined>>;
}

export interface SessionListSnapshot {
  ids: readonly string[];
  byId: Readonly<Record<string, SessionListRow | undefined>>;
}

export interface WorkspaceListSnapshot {
  items: readonly { workspaceId: string; sessionIds: readonly string[] }[];
  archivedSessionIds?: readonly string[];
}

interface Observable<T> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): T;
}

export interface BotSessionVisibilityOptions {
  sessions: Observable<SessionListSnapshot>;
  workspaces: Observable<WorkspaceListSnapshot | undefined>;
  prefs: Observable<Pick<BotModePrefsSnapshot, 'showBotSessions'>>;
  loadBotSessionIds: () => Promise<readonly string[]>;
  warn?: (message: string, error: unknown) => void;
}

export interface BotSessionVisibility {
  hidden(): { sessionIds: string[]; groupKeys: string[] };
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

const REFRESH_DELAY_MS = 150;
export function createBotSessionVisibility(
  options: BotSessionVisibilityOptions,
): BotSessionVisibility {
  const { sessions, workspaces, prefs } = options;
  const listeners = new Set<() => void>();
  let botIds = new Set<string>();
  const classified = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let loading = false;
  let reloadAfter = false;
  let disposed = false;

  const emit = (): void => {
    for (const listener of [...listeners]) listener();
  };
  const load = async (): Promise<void> => {
    if (loading) {
      reloadAfter = true;
      return;
    }
    loading = true;
    const seen = sessions.getSnapshot().ids;
    try {
      const ids = await options.loadBotSessionIds();
      if (disposed) return;
      botIds = new Set(ids);
      for (const id of seen) classified.add(id);
      emit();
    } catch (error) {
      options.warn?.('botharness: failed to load Bot Session ids', error);
    } finally {
      loading = false;
      if (reloadAfter && !disposed) {
        reloadAfter = false;
        void load();
      }
    }
  };
  const onSessions = (): void => {
    if (timer !== undefined || disposed) return;
    if (sessions.getSnapshot().ids.every((id) => classified.has(id))) return;
    timer = setTimeout(() => {
      timer = undefined;
      void load();
    }, REFRESH_DELAY_MS);
  };
  const unsubscribers = [
    sessions.subscribe(() => {
      onSessions();
      emit();
    }),
    workspaces.subscribe(emit),
    prefs.subscribe(emit),
  ];
  void load();

  return {
    hidden() {
      if (prefs.getSnapshot().showBotSessions) return { sessionIds: [], groupKeys: [] };
      const list = sessions.getSnapshot();
      const hiddenIds = new Set(
        list.ids.filter(
          (id) => botIds.has(id) && (list.byId[id]?.retainedBy?.['mainView'] ?? 0) === 0,
        ),
      );
      if (hiddenIds.size === 0) return { sessionIds: [], groupKeys: [] };
      const workspace = workspaces.getSnapshot();
      const archived = new Set(workspace?.archivedSessionIds ?? []);
      const listed = (id: string): boolean => {
        const row = list.byId[id];
        return row !== undefined && row.origin !== 'subagent' && row.blank !== true;
      };
      const groups = new Map<string, string[]>();
      const grouped = new Set<string>();
      for (const item of workspace?.items ?? []) {
        for (const id of item.sessionIds) grouped.add(id);
        groups.set(item.workspaceId, item.sessionIds.filter(listed));
      }
      groups.set(
        '',
        list.ids.filter((id) => !grouped.has(id) && listed(id)),
      );
      const groupKeys = [...groups]
        .filter(([, members]) => {
          const shown = members.filter((id) => !archived.has(id));
          return shown.length > 0 && shown.every((id) => hiddenIds.has(id));
        })
        .map(([key]) => key);
      return { sessionIds: [...hiddenIds], groupKeys };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      for (const unsubscribe of unsubscribers) unsubscribe();
      listeners.clear();
    },
  };
}

function attributeValue(value: string): string {
  return JSON.stringify(value);
}
export function botSessionVisibilityCss(hidden: {
  sessionIds: readonly string[];
  groupKeys: readonly string[];
}): string {
  const selectors = [
    ...hidden.sessionIds.map((id) => `[data-row-key=${attributeValue(`session:${id}`)}]`),
    ...hidden.groupKeys.flatMap((key) => [
      `[data-row-key=${attributeValue(`workspace:${key}`)}]`,
      `[data-row-key=${attributeValue(`overflow:${key}`)}]`,
    ]),
  ];
  return selectors.length === 0
    ? ''
    : `${selectors.join(',\n')} {\n  display: none !important;\n}\n`;
}
export function mountBotSessionVisibility(
  visibility: BotSessionVisibility,
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
): () => void {
  if (doc === undefined) return () => {};
  const style = doc.createElement('style');
  style.dataset['botharnessBotSessions'] = '';
  doc.head.appendChild(style);
  const apply = (): void => {
    const css = botSessionVisibilityCss(visibility.hidden());
    if (style.textContent !== css) style.textContent = css;
  };
  const unsubscribe = visibility.subscribe(apply);
  apply();
  return () => {
    unsubscribe();
    style.remove();
  };
}
