import { useId, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-session/types';

import { color, radius, size, space, text } from './ds/tokens.stylex.js';
import { PanelHeader } from './ds/panel-header.js';
import { BotIcon } from './bot-icon.js';
import { PersonaBotAvatar } from './avatar.js';
import type { ClientStore } from './store.js';
import type { BotModePrefsSnapshot } from './bot-mode-prefs.js';
import type { ConfigStorage } from './roster-config.js';
import type { LOCALE_NS } from './locale.js';
import type {
  BotSessionVisibilityOptions,
  SessionListSnapshot,
  WorkspaceListSnapshot,
} from './bot-session-visibility.js';

export interface BotSessionGroup {
  botSlug: string;
  displayName: string;
  sessionIds: string[];
}

export const BOT_FOLDER_PREFERENCES_KEY = 'botharness/native-bot-folders.v1';
export const BOT_FOLDER_ROOT_KEY = 'section:deepseekbot';

export function readCollapsedBotFolders(storage: ConfigStorage | undefined): string[] {
  try {
    const value: unknown = JSON.parse(storage?.getItem(BOT_FOLDER_PREFERENCES_KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string').slice(0, 200)
      : [];
  } catch {
    return [];
  }
}

export function mountNativeBotFolderHost(
  doc: Document,
  changed: (host: HTMLElement | null) => void,
): () => void {
  let host: HTMLElement | null = null;
  let disposed = false;
  let scheduled = false;
  const sync = (): void => {
    if (disposed) return;
    const row = doc.querySelector('[data-row-key^="workspace:"], [data-row-key^="session:"]');
    const tree = row?.closest<HTMLElement>('[role="tree"]') ?? null;
    if (host?.parentElement === tree && tree !== null) return;
    const previous = host;
    host = null;
    if (tree !== null) {
      host = doc.createElement('div');
      host.dataset['botharnessBotFolders'] = '';
      tree.prepend(host);
    }
    changed(host);
    previous?.remove();
  };
  const observer = new MutationObserver(() => {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      sync();
    });
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  sync();
  return () => {
    disposed = true;
    observer.disconnect();
    host?.remove();
  };
}

export interface NativeBotFolderMount {
  setMounted(node: HTMLElement | null): void;
  dispose(): void;
}

export function visibleBotFolderGroups(
  groups: readonly BotSessionGroup[],
  list: SessionListSnapshot,
  workspace: WorkspaceListSnapshot | undefined,
): BotSessionGroup[] {
  const archived = new Set(workspace?.archivedSessionIds ?? []);
  return groups.flatMap((group) => {
    const sessionIds = group.sessionIds.filter((id) => {
      const row = list.byId[id];
      return row !== undefined && row.origin !== 'subagent' && !row.blank && !archived.has(id);
    });
    return sessionIds.length === 0 ? [] : [{ ...group, sessionIds }];
  });
}

export function mountBotFolderProjection(
  options: Pick<BotSessionVisibilityOptions, 'sessions' | 'workspaces' | 'prefs'> & {
    groups: {
      getSnapshot(): readonly BotSessionGroup[];
      subscribe(listener: () => void): () => void;
    };
    setHost(host: HTMLElement | null): void;
    doc?: Document;
  },
): NativeBotFolderMount {
  const doc = options.doc ?? document;
  let host: HTMLElement | null = null;
  const sheet = doc.createElement('style');
  sheet.dataset['plugin'] = '@botharness/ui';
  sheet.dataset['pluginCss'] = 'bot-session-folders';
  doc.head.append(sheet);
  const sync = (): void => {
    const list = options.sessions.getSnapshot();
    const workspace = options.workspaces.getSnapshot();
    const groups = visibleBotFolderGroups(options.groups.getSnapshot(), list, workspace);
    const ids = new Set(groups.flatMap((group) => group.sessionIds));
    const accounted = new Set(workspace?.items.flatMap((item) => item.sessionIds) ?? []);
    const hiddenGroups = [
      ...(workspace?.items.map((item) => ({ key: item.workspaceId, ids: item.sessionIds })) ?? []),
      { key: '', ids: list.ids.filter((id) => !accounted.has(id)) },
    ].filter((group) => {
      const members = group.ids.filter((id) => list.byId[id]?.origin !== 'subagent');
      return members.length > 0 && members.every((id) => ids.has(id));
    });
    const selectors = [
      ...[...ids].map((id) => `session:${id}`),
      ...hiddenGroups.flatMap((group) => [`workspace:${group.key}`, `overflow:${group.key}`]),
    ];
    sheet.textContent =
      selectors.length === 0 || !options.prefs.getSnapshot().showBotSessions
        ? ''
        : selectors
            .map((key) => `[data-botharness-folder-tree] [data-row-key=${JSON.stringify(key)}]`)
            .join(',\n') + ' { display: none !important; }';
  };
  const offHost = mountNativeBotFolderHost(doc, (next) => {
    if (host?.parentElement) delete host.parentElement.dataset['botharnessFolderTree'];
    host = next;
    options.setHost(next);
  });
  const off = [options.groups, options.sessions, options.workspaces, options.prefs].map((source) =>
    source.subscribe(sync),
  );
  sync();
  return {
    setMounted(node) {
      const tree = host?.parentElement;
      if (!tree) return;
      if (node) tree.dataset['botharnessFolderTree'] = '';
      else delete tree.dataset['botharnessFolderTree'];
    },
    dispose() {
      if (host?.parentElement) delete host.parentElement.dataset['botharnessFolderTree'];
      off.forEach((unsubscribe) => unsubscribe());
      offHost();
      sheet.remove();
    },
  };
}

const styles = stylex.create({
  folders: { display: 'flex', flexDirection: 'column', gap: space.x1 },
  bots: { paddingInlineStart: space.x4 },
  button: {
    appearance: 'none',
    borderWidth: 0,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.fg,
    borderRadius: radius.sm,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    height: size.row,
    paddingInline: space.x3,
    width: '100%',
    textAlign: 'start',
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.regular,
  },
  child: { paddingInlineStart: space.x6 },
  selected: { backgroundColor: color.hover },
  title: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  count: { color: color.subtle, fontSize: text.metaSize },
  children: { display: 'flex', flexDirection: 'column', gap: space.x1 },
});

export type BotSessionFoldersProps = PropsRuntime<'shell.overlay'> &
  PropsLocale<typeof LOCALE_NS> & {
    useBotFolderGroups<T>(selector: (groups: readonly BotSessionGroup[]) => T): T;
    useBotFolderPrefs<T>(
      selector: (prefs: Pick<BotModePrefsSnapshot, 'showBotSessions' | 'botIcon'>) => T,
    ): T;
    useBotFolderHost<T>(selector: (host: HTMLElement | null) => T): T;
    setMounted(node: HTMLElement | null): void;
    openSession(sessionId: string): void;
    storage: ConfigStorage | undefined;
    roster: Pick<ClientStore, 'getSnapshot' | 'subscribe'>;
  };

export function BotSessionFolders({
  useBotFolderGroups,
  useBotFolderPrefs,
  useBotFolderHost,
  setMounted,
  useSessions,
  useWorkspaces,
  openSession,
  storage,
  roster,
  t,
}: BotSessionFoldersProps) {
  const groups = useBotFolderGroups((value) => value);
  const bots = useSyncExternalStore(roster.subscribe, roster.getSnapshot, roster.getSnapshot).bots;
  const visible = useBotFolderPrefs((value) => value.showBotSessions);
  const icon = useBotFolderPrefs((value) => value.botIcon);
  const list = useSessions((value) => value);
  const workspace = useWorkspaces((value) => value);
  const host = useBotFolderHost((value) => value);
  const [collapsed, setCollapsed] = useState(() => readCollapsedBotFolders(storage));
  const bodyId = useId();
  const shown = visible ? visibleBotFolderGroups(groups, list, workspace) : [];
  const rootExpanded = !collapsed.includes(BOT_FOLDER_ROOT_KEY);

  if (host === null || shown.length === 0) return null;
  const toggle = (slug: string): void => {
    const next = collapsed.includes(slug)
      ? collapsed.filter((id) => id !== slug)
      : [...collapsed, slug];
    setCollapsed(next);
    try {
      storage?.setItem(BOT_FOLDER_PREFERENCES_KEY, JSON.stringify(next));
    } catch {}
  };
  return createPortal(
    <div
      ref={setMounted}
      data-bot-folder-root=""
      role="treeitem"
      aria-level={1}
      aria-expanded={rootExpanded}
      {...stylex.props(styles.folders)}
      onKeyDown={(event) => {
        if (
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(
            event.key,
          )
        )
          event.stopPropagation();
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
        const index = buttons.indexOf(event.target as HTMLButtonElement);
        const next = buttons[index + (event.key === 'ArrowDown' ? 1 : -1)];
        if (next === undefined) return;
        event.preventDefault();
        next.focus();
      }}
    >
      <PanelHeader
        icon={<BotIcon icon={icon} size={16} />}
        label="DeepSeekBot"
        badge={<span {...stylex.props(styles.count)}>{shown.length}</span>}
        disclosure={{
          expanded: rootExpanded,
          controls: bodyId,
          disabled: false,
          chevron: false,
          onToggle: () => toggle(BOT_FOLDER_ROOT_KEY),
        }}
      />
      {rootExpanded && (
        <div id={bodyId} role="group" {...stylex.props(styles.bots)}>
          {shown.map((group) => {
            const expanded = !collapsed.includes(group.botSlug);
            const groupBodyId = `${bodyId}-${group.botSlug}`;
            const bot = bots.find((item) => item.slug === group.botSlug);
            return (
              <div
                key={group.botSlug}
                data-bot-folder={group.botSlug}
                role="treeitem"
                aria-level={2}
                aria-expanded={expanded}
              >
                <PanelHeader
                  icon={
                    <PersonaBotAvatar
                      personaBotId={group.botSlug}
                      name={bot?.displayName ?? group.displayName}
                      src={bot?.avatar}
                      appearance={bot?.appearance}
                      avatarSeed={bot?.avatarSeed}
                      size={16}
                      indicator={false}
                      t={t}
                    />
                  }
                  label={group.displayName}
                  badge={<span {...stylex.props(styles.count)}>{group.sessionIds.length}</span>}
                  disclosure={{
                    expanded,
                    controls: groupBodyId,
                    disabled: false,
                    chevron: false,
                    onToggle: () => toggle(group.botSlug),
                  }}
                />
                {expanded && (
                  <div id={groupBodyId} role="group" {...stylex.props(styles.children)}>
                    {group.sessionIds.map((id) => {
                      const row = list.byId[id as SessionId]!;
                      const selected = (row.retainedBy['mainView'] ?? 0) > 0;
                      return (
                        <button
                          key={id}
                          type="button"
                          data-bot-folder-session={id}
                          role="treeitem"
                          aria-level={3}
                          aria-selected={selected}
                          {...stylex.props(
                            styles.button,
                            styles.child,
                            selected && styles.selected,
                          )}
                          onClick={() => openSession(id)}
                        >
                          <span {...stylex.props(styles.title)}>{row.displayTitle || id}</span>
                          {row.running && <span aria-label={t('sessions.status.running')}>●</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>,
    host,
  );
}
