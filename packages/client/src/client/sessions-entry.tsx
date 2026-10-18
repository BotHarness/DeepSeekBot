import { GroupWorkEntry } from './group-work-entry.js';
import { useSessionTarget } from './session-target.js';
import type { SessionsState } from './store.js';
import { useState, useSyncExternalStore, type ReactElement } from 'react';

import * as stylex from '@stylexjs/stylex';
import { Tag, Tooltip, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';

import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { useClientState } from './bot-sidebar.js';
import { formatRelativeTime } from './labels.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import {
  ASSIGNMENT_SECTIONS,
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
import { GroupHeading } from './ds/group-heading.js';
import { IconButton } from './ds/icon-button.js';
import { PanelEmptyState } from './ds/empty-state.js';
import { color, radius } from './ds/tokens.stylex.js';

const styles = stylex.create({
  groups: { display: 'flex', flexDirection: 'column' },
  orchestrator: { display: 'grid', placeItems: 'center' },
  orchestratorIcon: {
    display: 'grid',
    placeItems: 'center',
    width: '20px',
    height: '20px',
    borderRadius: radius.sm,
    backgroundColor: `var(--bh-bot-color, ${color.fg})`,
    color: color.base,
  },
});

const STATUS_TONE = {
  running: 'success',
  stopping: 'warning',
  attention: 'danger',
  stopped: 'quiet',
  idle: 'outline',
  unavailable: 'quiet',
} as const;

const IMPLIED_STATUS = {
  'needs-input': undefined,
  working: 'running',
  idle: 'idle',
  resolved: 'any',
} as const;

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
  assignmentLimit,
}: ChannelSidebarEntryProps & {
  nativeSessions: NativeSessionCatalog;
  assignmentLimit?: number | undefined;
}): ReactElement {
  const [archiving, setArchiving] = useState<string>();
  const [archiveError, setArchiveError] = useState<string>();
  const client = useClientState();
  const [local, setLocal] = useState<SessionsState>({
    status: 'loading',
    items: [],
    error: undefined,
  });
  const [reload, setReload] = useState(0);
  const groupBot = client.conversation.channel?.type === 'group';
  const owned = groupBot ? local : client.sessions;
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
    if (botSlug === undefined) return;
    if (!groupBot) {
      void actions.refreshSessions(botSlug);
      return;
    }
    let live = true;
    void actions.readSessions(botSlug).then(
      (items) => {
        if (live) setLocal({ status: 'ready', items, error: undefined });
      },
      (error) => {
        if (live) setLocal({ status: 'error', items: [], error: String(error) });
      },
    );
    return () => {
      live = false;
    };
  }, [actions, botSlug, signature, groupBot, client.conversation.revision, reload]);

  const toggleWorkspace = (key: string): void => {
    updateSessionViewPreference(slug, (current) => ({
      ...current,
      collapsedWorkspaces: current.collapsedWorkspaces.includes(key)
        ? current.collapsedWorkspaces.filter((item) => item !== key)
        : [...current.collapsedWorkspaces, key],
    }));
  };
  const rows = personaBotSessionRows(owned.items, native.byId, preference.scope);
  const statusRows =
    preference.layout === 'status' ? personaBotSessionRows(owned.items, native.byId, 'all') : rows;
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
    implied?: PersonaBotSessionRow['status'] | 'any',
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
                  data-session-orchestrator=""
                  {...stylex.props(styles.orchestrator)}
                  role="img"
                  aria-label={role}
                  title={role}
                  ref={(element) =>
                    paintBotScale(element, bot === undefined ? undefined : botNameSource(bot))
                  }
                >
                  <span {...stylex.props(styles.orchestratorIcon)}>
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
          row.triageOpenCount !== undefined ? (
            <Tag tone="info">{t('sessions.triage', { count: row.triageOpenCount })}</Tag>
          ) : row.needs !== undefined ? (
            <Tag tone={row.needs === 'error' || row.needs === 'failed' ? 'danger' : 'warning'}>
              {t(`sessions.needs.${row.needs}`)}
            </Tag>
          ) : implied === 'any' || row.status === implied ? undefined : (
            <Tag tone={STATUS_TONE[row.status]}>{statusLabel[row.status]}</Tag>
          )
        }
        {...(row.role !== 'assignment' ||
        row.section === 'working' ||
        botSlug === undefined ||
        (native.byId[row.sessionId] === undefined && row.archived !== true)
          ? {}
          : {
              trailing: (
                <Tooltip
                  label={t(row.archived === true ? 'sessions.unarchive' : 'sessions.archive')}
                  side="top"
                  portal
                  delayMs={400}
                >
                  <IconButton
                    size="inline"
                    data-session-archive=""
                    disabled={archiving !== undefined}
                    aria-label={t(
                      row.archived === true ? 'sessions.unarchiveNamed' : 'sessions.archiveNamed',
                      { title: row.title },
                    )}
                    onClick={() => {
                      setArchiving(row.sessionId);
                      setArchiveError(undefined);
                      void actions
                        .setSessionArchived(botSlug, row.sessionId, row.archived !== true)
                        .catch((error: unknown) =>
                          setArchiveError(error instanceof Error ? error.message : String(error)),
                        )
                        .finally(() => {
                          setArchiving(undefined);
                          setReload((value) => value + 1);
                        });
                    }}
                  >
                    <ChannelSidebarIcon
                      name={row.archived === true ? 'archive-restore' : 'archive'}
                      size={14}
                    />
                  </IconButton>
                </Tooltip>
              ),
            })}
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
  const assignments = statusRows.filter((row) => row.role === 'assignment').sort(byRecent);
  const sections = ASSIGNMENT_SECTIONS.map((id) => ({
    id,
    implied: IMPLIED_STATUS[id],
    rows: assignments.filter((row) => row.section === id),
  }));
  const runningCount = assignments.filter((row) => row.status === 'running').length;
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
    count: number | string,
    expanded: boolean,
    toggle: () => void,
    title?: string,
    countLabel?: string,
  ): ReactElement => (
    <GroupHeading
      flush
      key={key}
      label={name}
      count={count}
      countLabel={countLabel}
      title={title}
      expanded={expanded}
      onToggle={toggle}
    />
  );

  return (
    <div data-sessions="" ref={mount}>
      {owned.status === 'loading' && rows.length === 0 ? (
        <LoadingSkeleton kind="sidebar" label={t('sessions.loading')} />
      ) : null}
      {owned.status === 'error' && owned.error !== undefined ? (
        <div className="bh-error">{t('sessions.error', { error: owned.error })}</div>
      ) : null}
      {owned.status === 'ready' && rows.length === 0 && assignments.length === 0 ? (
        <PanelEmptyState icon="text-quote">{t('sessions.empty')}</PanelEmptyState>
      ) : null}
      {archiveError === undefined ? null : (
        <div className="bh-error" role="alert">
          {archiveError}
        </div>
      )}
      <div data-session-groups="" ref={flip} {...stylex.props(styles.groups)}>
        {preference.layout === 'status' ? (
          <>
            {orchestrators.length === 0 ? null : (
              <SidebarCardList flush label={t('sessions.role.orchestrator')}>
                {orchestrators.map((row) => renderRow(row, true, 'idle'))}
              </SidebarCardList>
            )}
            {sections.map((section) => {
              if (section.rows.length === 0) return null;
              const expanded = !preference.collapsedSections.includes(section.id);
              const name = t(`sessions.section.${section.id}`);
              return (
                <section key={section.id} data-section={section.id}>
                  {section.id === 'working' && assignmentLimit !== undefined
                    ? heading(
                        section.id,
                        name,
                        `${runningCount} / ${assignmentLimit}`,
                        expanded,
                        () => toggleSection(section.id),
                        undefined,
                        t('sessions.limit.running', {
                          count: runningCount,
                          limit: assignmentLimit,
                        }),
                      )
                    : heading(section.id, name, section.rows.length, expanded, () =>
                        toggleSection(section.id),
                      )}
                  {expanded ? (
                    <SidebarCardList flush label={name}>
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
              <section key={group.key}>
                {heading(
                  group.key,
                  name,
                  group.rows.length,
                  expanded,
                  () => toggleWorkspace(group.key),
                  group.path,
                )}
                {expanded ? (
                  <SidebarCardList flush label={name}>
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
  extraSelectedIds = [],
  onExtraSelect,
}: ChannelSidebarEntryProps & {
  extraItems?: readonly MenuEntry[];
  extraSelectedIds?: readonly string[];
  onExtraSelect?: (id: string) => void;
}): ReactElement {
  const slug = botSlug ?? '';
  const preference = useSessionViewPreference(slug);
  return (
    <SidebarViewMenu
      label={t('sessions.menu')}
      items={[
        ...(botSlug
          ? [
              { type: 'label' as const, id: 'scope-label', text: t('sessions.view') },
              { id: 'scope:current', label: t('sessions.current') },
              { id: 'scope:all', label: t('sessions.all') },
              { type: 'separator' as const, id: 'layout-separator' },
              { type: 'label' as const, id: 'layout-label', text: t('sessions.layout') },
              { id: 'layout:status', label: t('sessions.layout.status') },
              { id: 'layout:workspace', label: t('sessions.layout.workspace') },
            ]
          : []),
        ...extraItems,
      ]}
      selectedIds={[
        ...extraSelectedIds,
        ...(botSlug ? ['scope:' + preference.scope, 'layout:' + preference.layout] : []),
      ]}
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
  props: ChannelSidebarEntryProps & {
    nativeSessions: NativeSessionCatalog;
    assignmentLimit?: number | undefined;
  },
): ReactElement {
  const target = useSessionTarget(props);
  return target.kind === 'channel' ? (
    <GroupWorkEntry key={props.channelId} {...props} nativeSessions={props.nativeSessions} />
  ) : (
    <SessionsPanel key={props.channelId + ':' + target.slug} {...props} botSlug={target.slug} />
  );
}
