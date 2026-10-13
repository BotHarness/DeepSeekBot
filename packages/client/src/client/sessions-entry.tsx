import { useSyncExternalStore, type ReactElement } from 'react';

import {
  IconChevronDownOutlineRegular,
  Tag,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { useClientState } from './bot-sidebar.js';
import { formatRelativeTime } from './labels.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import {
  groupSessionRowsByWorkspace,
  personaBotSessionRows,
  type NativeSessionSummary,
  type PersonaBotSessionRow,
} from './session-rows.js';
import {
  sessionViewPreferenceSnapshot,
  subscribeSessionViewPreference,
  updateSessionViewPreference,
  type SessionStatusSection,
} from './session-view-prefs.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { SidebarViewMenu } from './sidebar-view-menu.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { botNameSource, paintBotScale } from './bot-primary-color.js';
import { useFlipList } from './flip-list.js';

const STATUS_TONE = {
  running: 'success',
  stopping: 'warning',
  attention: 'danger',
  stopped: 'quiet',
  idle: 'outline',
  unavailable: 'quiet',
} as const;

const WORKING = new Set<PersonaBotSessionRow['status']>(['running', 'stopping', 'attention']);

export interface NativeSessionCatalog {
  refresh?(): Promise<void>;
  subscribe(listener: () => void): () => void;
  getSnapshot(): {
    ids: readonly string[];
    byId: Readonly<Record<string, NativeSessionSummary>>;
  };
}

function workspaceName(path: string | undefined): string | undefined {
  return path?.split(/[\\/]/u).filter(Boolean).at(-1);
}

function useSessionViewPreference(botSlug: string) {
  return useSyncExternalStore(
    (listener) => subscribeSessionViewPreference(botSlug, listener),
    () => sessionViewPreferenceSnapshot(botSlug),
    () => sessionViewPreferenceSnapshot(botSlug),
  );
}

function SessionsPanel({
  botSlug,
  actions,
  t,
  nativeSessions,
}: ChannelSidebarEntryProps & { nativeSessions: NativeSessionCatalog }): ReactElement {
  const client = useClientState();
  const owned = client.sessions;
  const native = useSyncExternalStore(
    nativeSessions.subscribe,
    nativeSessions.getSnapshot,
    nativeSessions.getSnapshot,
  );
  const slug = botSlug ?? '';
  const preference = useSessionViewPreference(slug);
  const signature = native.ids
    .map((id) => id + ':' + (native.byId[id]?.running === true ? '1' : '0'))
    .join('|');

  const mount = useMountedResource<HTMLDivElement>(() => {
    if (botSlug !== undefined) void actions.refreshSessions(botSlug);
  }, [actions, botSlug, signature]);

  const toggleWorkspace = (key: string): void => {
    updateSessionViewPreference(slug, (current) => ({
      ...current,
      collapsedWorkspaces: current.collapsedWorkspaces.includes(key)
        ? current.collapsedWorkspaces.filter((item) => item !== key)
        : [...current.collapsedWorkspaces, key],
    }));
  };
  const rows = personaBotSessionRows(owned.items, native.byId, preference.scope);
  const groups = groupSessionRowsByWorkspace(rows);
  const bot = client.bots.find((candidate) => candidate.slug === botSlug);
  const flip = useFlipList<HTMLDivElement>();
  const statusLabel = {
    running: t('sessions.status.running'),
    stopping: t('sessions.status.stopping'),
    attention: t('sessions.status.attention'),
    stopped: t('sessions.status.stopped'),
    idle: t('sessions.status.idle'),
    unavailable: t('sessions.status.unavailable'),
  } as const;
  const renderRow = (
    row: PersonaBotSessionRow,
    showWorkspace: boolean,
    implied?: PersonaBotSessionRow['status'],
  ): ReactElement => {
    const role =
      row.role === 'orchestrator' ? t('sessions.role.orchestrator') : t('sessions.role.assignment');
    return (
      <SidebarCardRow
        key={row.sessionId}
        flipKey={row.sessionId}
        {...(row.role === 'orchestrator'
          ? {
              leading: (
                <span
                  className="bh-session-orchestrator"
                  role="img"
                  aria-label={role}
                  title={role}
                  ref={(element) =>
                    paintBotScale(element, bot === undefined ? undefined : botNameSource(bot))
                  }
                >
                  <span className="bh-session-orchestrator-icon">
                    <ChannelSidebarIcon name="bot" size={14} />
                  </span>
                </span>
              ),
            }
          : { icon: 'list-checks', iconLabel: role })}
        title={row.title}
        hint={row.cwd}
        mainClassName="bh-session-row"
        state={row.status}
        muted={native.byId[row.sessionId] === undefined}
        disabled={native.byId[row.sessionId] === undefined}
        onClick={() => void actions.openSession(row.sessionId)}
        badge={
          row.status === implied ? undefined : (
            <Tag tone={STATUS_TONE[row.status]}>{statusLabel[row.status]}</Tag>
          )
        }
        {...(row.assignmentAccessMode === 'danger-full-access'
          ? {
              chips: (
                <span title={t('sessions.access.dangerDetails')}>
                  <Tag tone="warning">{t('sessions.access.danger')}</Tag>
                </span>
              ),
            }
          : {})}
        meta={
          <>
            {showWorkspace ? (
              <span>{workspaceName(row.cwd) ?? t('sessions.workspace.unknown')}</span>
            ) : null}
            <span>{formatRelativeTime(row.updatedAt, Date.now(), t)}</span>
          </>
        }
      />
    );
  };
  const byRecent = (left: PersonaBotSessionRow, right: PersonaBotSessionRow): number =>
    right.updatedAt - left.updatedAt || left.sessionId.localeCompare(right.sessionId);
  const orchestrators = rows.filter((row) => row.role === 'orchestrator').sort(byRecent);
  const assignments = rows.filter((row) => row.role === 'assignment').sort(byRecent);
  const sections = [
    {
      id: 'working' as const,
      implied: 'running' as const,
      rows: assignments.filter((row) => WORKING.has(row.status)),
    },
    {
      id: 'idle' as const,
      implied: 'idle' as const,
      rows: assignments.filter((row) => !WORKING.has(row.status)),
    },
  ];
  const toggleSection = (id: SessionStatusSection): void => {
    updateSessionViewPreference(slug, (current) => ({
      ...current,
      collapsedSections: current.collapsedSections.includes(id)
        ? current.collapsedSections.filter((item) => item !== id)
        : [...current.collapsedSections, id],
    }));
  };
  const heading = (
    key: string,
    name: string,
    count: number,
    expanded: boolean,
    toggle: () => void,
    title?: string,
  ): ReactElement => (
    <button
      type="button"
      className="bh-session-workspace-heading"
      title={title}
      aria-expanded={expanded}
      onClick={toggle}
      key={key}
    >
      <IconChevronDownOutlineRegular
        size={14}
        className={expanded ? '' : 'bh-session-workspace-chevron-collapsed'}
      />
      <span className="bh-session-workspace-name">{name}</span>
      <span className="bh-session-workspace-count">{count}</span>
    </button>
  );

  return (
    <div className="bh-sessions" ref={mount}>
      {owned.status === 'loading' && rows.length === 0 ? (
        <LoadingSkeleton kind="sidebar" label={t('sessions.loading')} />
      ) : null}
      {owned.status === 'error' && owned.error !== undefined ? (
        <div className="bh-error">{t('sessions.error', { error: owned.error })}</div>
      ) : null}
      {owned.status === 'ready' && rows.length === 0 ? (
        <div className="bh-note">{t('sessions.empty')}</div>
      ) : null}
      <div className="bh-sessions-groups" ref={flip}>
        {preference.layout === 'status' ? (
          <>
            {orchestrators.length === 0 ? null : (
              <SidebarCardList label={t('sessions.role.orchestrator')}>
                {orchestrators.map((row) => renderRow(row, true))}
              </SidebarCardList>
            )}
            {sections.map((section) => {
              if (section.rows.length === 0) return null;
              const expanded = !preference.collapsedSections.includes(section.id);
              const name = t(`sessions.section.${section.id}`);
              return (
                <section
                  key={section.id}
                  className="bh-session-workspace-group"
                  data-section={section.id}
                >
                  {heading(section.id, name, section.rows.length, expanded, () =>
                    toggleSection(section.id),
                  )}
                  {expanded ? (
                    <SidebarCardList label={name}>
                      {section.rows.map((row) => renderRow(row, true, section.implied))}
                    </SidebarCardList>
                  ) : null}
                </section>
              );
            })}
          </>
        ) : (
          groups.map((group) => {
            const expanded = !preference.collapsedWorkspaces.includes(group.key);
            const name = group.name ?? t('sessions.workspace.unknown');
            return (
              <section key={group.key} className="bh-session-workspace-group">
                {heading(
                  group.key,
                  name,
                  group.rows.length,
                  expanded,
                  () => toggleWorkspace(group.key),
                  group.path,
                )}
                {expanded ? (
                  <SidebarCardList label={name}>
                    {group.rows.map((row) => renderRow(row, false))}
                  </SidebarCardList>
                ) : null}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

export function SessionsHeaderAction({
  botSlug,
  t,
  extraItems = [],
  onExtraSelect,
}: ChannelSidebarEntryProps & {
  extraItems?: readonly MenuEntry[];
  onExtraSelect?: (id: string) => void;
}): ReactElement {
  const slug = botSlug ?? '';
  const preference = useSessionViewPreference(slug);
  return (
    <SidebarViewMenu
      label={t('sessions.menu')}
      items={[
        { type: 'label', id: 'scope-label', text: t('sessions.view') },
        { id: 'scope:current', label: t('sessions.current') },
        { id: 'scope:all', label: t('sessions.all') },
        { type: 'separator', id: 'layout-separator' },
        { type: 'label', id: 'layout-label', text: t('sessions.layout') },
        { id: 'layout:status', label: t('sessions.layout.status') },
        { id: 'layout:workspace', label: t('sessions.layout.workspace') },
        ...extraItems,
      ]}
      selectedIds={['scope:' + preference.scope, 'layout:' + preference.layout]}
      onSelect={(id) => {
        const [kind, value] = id.split(':');
        if (kind !== 'scope' && kind !== 'layout') {
          onExtraSelect?.(id);
          return;
        }
        updateSessionViewPreference(slug, (current) =>
          kind === 'scope'
            ? { ...current, scope: value === 'all' ? 'all' : 'current' }
            : { ...current, layout: value === 'workspace' ? 'workspace' : 'status' },
        );
      }}
    />
  );
}

export function SessionsEntry(
  props: ChannelSidebarEntryProps & { nativeSessions: NativeSessionCatalog },
): ReactElement {
  return <SessionsPanel key={props.botSlug ?? 'none'} {...props} />;
}
