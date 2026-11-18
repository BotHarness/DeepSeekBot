import { GroupWorkEntry } from './group-work-entry.js';
import { useSessionTarget } from './session-target.js';
import type { SessionsState } from './store.js';
import { useCallback, useState, useSyncExternalStore, type ReactElement } from 'react';

import * as stylex from '@stylexjs/stylex';
import {
  Checkbox,
  IconCordisPluginOutlineRegular,
  IconFolderOpenOutlineRegular,
  IconStopFillRegular,
  Tag,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { ConfirmDialog } from './ds/form-dialog.js';
import { Icon } from './ds/icon.js';
import { modeText } from './bot-mode-settings.js';

import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { useClientStore } from './use-client-store.js';
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
  useSessionViewPreference,
  updateSessionViewPreference,
  type SessionStatusSection,
} from './session-view-prefs.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { SidebarViewMenu } from './sidebar-view-menu.js';
import { ASSIGNMENT_SESSION_ICON, ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { PersonaBotAvatar } from './avatar.js';
import { useFlipList } from './flip-list.js';
import { GroupHeading } from './ds/group-heading.js';
import { IconButton } from './ds/icon-button.js';
import { PanelEmptyState } from './ds/empty-state.js';
import { modelRouteText, SessionSubagentList, SessionSubagentToggle } from './session-subagents.js';
import { ModelBrandIcon, modelBrand, modelShortName } from './model-brand.js';
import { AssignmentWorkDialog } from './assignment-work.js';
import { Menu } from './appearance-primitives.js';
import { prefetchSessionDetail } from './session-detail-cache.js';
import type { ModelCatalogEntryView, SessionProgress } from './bridge.js';
import {
  currentTodo,
  GoalChip,
  isStuck,
  SessionMetaChip,
  TodoProgressChip,
} from './session-progress-view.js';
import { engineName, sessionEngineText } from './session-engine.js';

const PROGRESS_SESSIONS = 30;
const PROGRESS_REFRESH_MS = 60_000;

const styles = stylex.create({
  groups: { display: 'flex', flexDirection: 'column' },
  orchestrator: { display: 'grid', placeItems: 'center' },
});

const STATUS_TONE = {
  running: 'success',
  stopping: 'warning',
  attention: 'danger',
  idle: 'outline',
  unavailable: 'quiet',
} as const;

const IMPLIED_STATUS = {
  'needs-input': undefined,
  working: 'running',
  stuck: 'running',
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

function SessionsPanel({
  botSlug,
  channelId,
  actions,
  t,
  nativeSessions,
  assignmentLimit,
  onSessionSelect,
  selectedSessionId,
}: ChannelSidebarEntryProps & {
  nativeSessions: NativeSessionCatalog;
  assignmentLimit?: number | undefined;
}): ReactElement {
  const [archiving, setArchiving] = useState<string>();
  const [stopping, setStopping] = useState<ReadonlySet<string>>(() => new Set());
  const [subagentsOpen, setSubagentsOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggleSubagents = (sessionId: string): void =>
    setSubagentsOpen((current) => {
      const next = new Set(current);
      if (!next.delete(sessionId)) next.add(sessionId);
      return next;
    });
  const [archiveError, setArchiveError] = useState<string>();
  const [confirmStop, setConfirmStop] = useState<{ sessionId: string; title: string }>();
  const [stopAll, setStopAll] = useState(false);
  const [work, setWork] = useState<{ sessionId: string; title: string }>();
  const groupBot = useClientStore((state) => state.conversation.channel?.type === 'group');
  const sessions = useClientStore((state) => state.sessions);
  const conversationRevision = useClientStore((state) => state.conversation.revision);
  const ownerBot = useClientStore((state) =>
    state.bots.find((candidate) => candidate.slug === botSlug),
  );
  const [local, setLocal] = useState<SessionsState>({
    status: 'loading',
    items: [],
    error: undefined,
  });
  const [reload, setReload] = useState(0);
  const owned = groupBot ? local : sessions;
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
  }, [actions, botSlug, signature, groupBot, conversationRevision, reload]);

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
  const flip = useFlipList<HTMLDivElement>();
  const [progress, setProgress] = useState<Readonly<Record<string, SessionProgress>>>({});
  const progressIds = [
    ...new Set(
      [...rows, ...statusRows]
        .filter((row) => native.byId[row.sessionId] !== undefined && row.archived !== true)
        .map((row) => row.sessionId),
    ),
  ]
    .slice(0, PROGRESS_SESSIONS)
    .join(',');
  const anyRunning = statusRows.some((row) => row.status === 'running');
  const progressMount = useMountedResource<HTMLDivElement>(() => {
    const read = actions.sessionProgress;
    if (botSlug === undefined || read === undefined || progressIds === '') return;
    let live = true;
    const load = (): void => {
      void read(botSlug, progressIds.split(',')).then(
        (next) => {
          if (live) setProgress(next);
        },
        () => {},
      );
    };
    load();
    const timer = anyRunning ? setInterval(load, PROGRESS_REFRESH_MS) : undefined;
    return () => {
      live = false;
      if (timer !== undefined) clearInterval(timer);
    };
  }, [actions, botSlug, progressIds, anyRunning, signature, conversationRevision, reload]);
  const [models, setModels] = useState<readonly ModelCatalogEntryView[]>([]);
  const catalogMount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    void Promise.resolve(actions.modelCatalog?.()).then(
      (catalog) => {
        if (live && catalog !== undefined) setModels(catalog.models);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [actions]);
  const rootRef = useCallback(
    (node: HTMLDivElement | null) => {
      mount(node);
      progressMount(node);
      catalogMount(node);
    },
    [mount, progressMount, catalogMount],
  );
  const now = Date.now();
  const stuckOf = (row: PersonaBotSessionRow): boolean =>
    isStuck(row.status === 'running', progress[row.sessionId], now);
  const statusLabel = {
    running: t('sessions.status.running'),
    stopping: t('sessions.status.stopping'),
    attention: t('sessions.status.attention'),
    idle: t('sessions.status.idle'),
    unavailable: t('sessions.status.unavailable'),
  } as const;
  const runningAssignments = personaBotSessionRows(owned.items, native.byId, 'all').filter(
    (row) => row.role === 'assignment' && row.status === 'running',
  ).length;
  const runStop = (slug: string, sessionId: string, all: boolean): void => {
    setStopping((current) => new Set(current).add(sessionId));
    setArchiveError(undefined);
    const stop =
      all && channelId !== undefined
        ? actions.stopBot(channelId, slug)
        : actions.stopSession(slug, sessionId, channelId);
    void Promise.resolve(stop)
      .catch((error: unknown) =>
        setArchiveError(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => {
        setStopping((current) => {
          const next = new Set(current);
          next.delete(sessionId);
          return next;
        });
        setReload((value) => value + 1);
      });
  };
  const renderRow = (
    row: PersonaBotSessionRow,
    showWorkspace: boolean,
    implied?: PersonaBotSessionRow['status'] | 'any',
  ): ReactElement => {
    const role =
      row.role === 'orchestrator' ? t('sessions.role.orchestrator') : t('sessions.role.assignment');
    const subagents =
      row.subagentCount === undefined || botSlug === undefined ? undefined : row.subagentCount;
    const subagentsExpanded = subagents !== undefined && subagentsOpen.has(row.sessionId);
    const workable = row.role === 'assignment' && botSlug !== undefined;
    const locallyStopping = stopping.has(row.sessionId);
    const rowProgress = progress[row.sessionId];
    const stuck = stuckOf(row);
    const summary = stuck
      ? t('sessions.stuck.line', {
          minutes: Math.floor((now - (rowProgress?.lastEventAt ?? now)) / 60_000),
        })
      : currentTodo(rowProgress);
    const status = locallyStopping ? 'stopping' : row.status;
    const stoppable = botSlug !== undefined && (status === 'running' || status === 'stopping');
    const archivable = !(
      row.role !== 'assignment' ||
      row.section === 'working' ||
      botSlug === undefined ||
      (native.byId[row.sessionId] === undefined && row.archived !== true)
    );
    const openable = onSessionSelect !== undefined && native.byId[row.sessionId] !== undefined;
    const menu: MenuEntry[] = [
      ...(stoppable
        ? [
            {
              id: 'stop',
              label: t(status === 'stopping' ? 'sessions.status.stopping' : 'sessions.stop'),
              icon: <IconStopFillRegular size={12} />,
              disabled: status === 'stopping',
            },
          ]
        : []),
      ...(workable
        ? [
            {
              id: 'work',
              label: t('assignmentWork.tooltip'),
              icon: <ChannelSidebarIcon name="panel-right" size={14} />,
            },
          ]
        : []),
      ...(openable
        ? [
            {
              id: 'open',
              label: t('sessions.openInHarness'),
              icon: <ChannelSidebarIcon name="external-link" size={14} />,
            },
          ]
        : []),
      ...(archivable
        ? [
            {
              id: 'archive',
              label: t(row.archived === true ? 'sessions.unarchive' : 'sessions.archive'),
              icon: (
                <ChannelSidebarIcon
                  name={row.archived === true ? 'archive-restore' : 'archive'}
                  size={14}
                />
              ),
              disabled: archiving !== undefined,
            },
          ]
        : []),
    ];
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
                >
                  <PersonaBotAvatar
                    personaBotId={slug}
                    name={ownerBot?.displayName ?? slug}
                    src={ownerBot?.avatar}
                    appearance={ownerBot?.appearance}
                    avatarSeed={ownerBot?.avatarSeed}
                    size={20}
                    indicator={false}
                    nativeTitle={false}
                    t={t}
                  />
                </span>
              ),
            }
          : { icon: ASSIGNMENT_SESSION_ICON, iconLabel: role })}
        title={row.title}
        hint={[row.description, row.cwd].filter(Boolean).join('\n') || undefined}
        mainClassName="bh-session-row"
        state={status}
        muted={onSessionSelect === undefined && native.byId[row.sessionId] === undefined}
        disabled={onSessionSelect === undefined && native.byId[row.sessionId] === undefined}
        expanded={onSessionSelect === undefined ? undefined : selectedSessionId === row.sessionId}
        onClick={() =>
          onSessionSelect === undefined
            ? void actions.openSession(row.sessionId)
            : onSessionSelect(row.sessionId, row.title)
        }
        onIntent={
          openable && botSlug !== undefined
            ? () =>
                prefetchSessionDetail(actions, {
                  host: actions,
                  botSlug,
                  sessionId: row.sessionId,
                })
            : undefined
        }
        badge={
          row.triageOpenCount !== undefined ? (
            <Tag tone="info">{t('sessions.triage', { count: row.triageOpenCount })}</Tag>
          ) : row.needs !== undefined ? (
            <Tag tone={row.needs === 'error' || row.needs === 'failed' ? 'danger' : 'warning'}>
              {t(`sessions.needs.${row.needs}`)}
            </Tag>
          ) : implied === 'any' || status === implied ? undefined : (
            <Tag tone={STATUS_TONE[status]}>{statusLabel[status]}</Tag>
          )
        }
        {...(menu.length === 0 && subagents === undefined
          ? {}
          : {
              trailingAlign: 'start' as const,
              trailing: (
                <>
                  {subagents === undefined ? null : (
                    <SessionSubagentToggle
                      count={subagents}
                      title={row.title}
                      open={subagentsExpanded}
                      onToggle={() => toggleSubagents(row.sessionId)}
                      t={t}
                    />
                  )}
                  {menu.length === 0 ? null : (
                    <SessionRowMenu
                      label={t('sessions.moreNamed', { title: row.title })}
                      items={menu}
                      onSelect={(id) => {
                        if (botSlug === undefined) return;
                        if (id === 'stop') {
                          if (row.role === 'orchestrator' && runningAssignments > 0) {
                            setStopAll(false);
                            setConfirmStop({ sessionId: row.sessionId, title: row.title });
                          } else runStop(botSlug, row.sessionId, false);
                        } else if (id === 'work') {
                          setWork({ sessionId: row.sessionId, title: row.title });
                        } else if (id === 'open') {
                          void actions.openSession(row.sessionId);
                        } else if (id === 'archive') {
                          setArchiving(row.sessionId);
                          setArchiveError(undefined);
                          void actions
                            .setSessionArchived(botSlug, row.sessionId, row.archived !== true)
                            .catch((error: unknown) =>
                              setArchiveError(
                                error instanceof Error ? error.message : String(error),
                              ),
                            )
                            .finally(() => {
                              setArchiving(undefined);
                              setReload((value) => value + 1);
                            });
                        }
                      }}
                    />
                  )}
                </>
              ),
            })}
        {...(subagentsExpanded && botSlug !== undefined
          ? {
              detail: (
                <SessionSubagentList
                  actions={actions}
                  botSlug={botSlug}
                  sessionId={row.sessionId}
                  revision={`${String(row.subagentCount)}:${signature}`}
                  canOpen={(id) => native.byId[id] !== undefined}
                  t={t}
                />
              ),
            }
          : {})}
        {...(summary === undefined ? {} : { summary })}
        {...(showWorkspace ||
        row.modelRoute !== undefined ||
        row.engine !== undefined ||
        row.mode !== undefined ||
        row.assignmentAccessMode === 'danger-full-access' ||
        rowProgress?.todos !== undefined ||
        rowProgress?.goal !== undefined
          ? {
              chips: (
                <>
                  {showWorkspace ? (
                    <SessionMetaChip
                      kind="workspace"
                      icon={<IconFolderOpenOutlineRegular size={12} />}
                      label={workspaceName(row.cwd) ?? t('sessions.workspace.unknown')}
                      title={row.cwd}
                    />
                  ) : null}
                  {row.modelRoute === undefined ? null : (
                    <SessionModelChip route={row.modelRoute} models={models} />
                  )}
                  {row.engine === undefined ? null : (
                    <SessionMetaChip
                      kind="engine"
                      icon={<IconCordisPluginOutlineRegular size={12} />}
                      label={engineName(row.engine.engine)}
                      title={sessionEngineText({ ...row.engine, state: 'idle' }, t)}
                    />
                  )}
                  {row.mode === undefined ? null : (
                    <SessionMetaChip
                      kind="mode"
                      icon={<Icon name="sliders-horizontal" />}
                      label={modeText({ id: row.mode }, t).name}
                      title={t('sessions.mode', { name: modeText({ id: row.mode }, t).name })}
                    />
                  )}
                  {row.assignmentAccessMode === 'danger-full-access' ? (
                    <span title={t('sessions.access.dangerDetails')}>
                      <Tag tone="warning">{t('sessions.access.danger')}</Tag>
                    </span>
                  ) : null}
                  <TodoProgressChip todos={rowProgress?.todos} t={t} />
                  <GoalChip goal={rowProgress?.goal} t={t} />
                </>
              ),
            }
          : {})}
        meta={
          <>
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
    rows: assignments.filter(
      (row) => (row.section === 'working' && stuckOf(row) ? 'stuck' : row.section) === id,
    ),
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
    <div data-sessions="" ref={rootRef}>
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
      {confirmStop === undefined || botSlug === undefined ? null : (
        <ConfirmDialog
          title={t('sessions.stopOrchestratorTitle', { title: confirmStop.title })}
          description={t('sessions.stopOrchestratorBody')}
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          confirmLabel={t('sessions.stop')}
          onCancel={() => setConfirmStop(undefined)}
          onConfirm={() => {
            setConfirmStop(undefined);
            runStop(botSlug, confirmStop.sessionId, stopAll);
          }}
        >
          <Checkbox
            checked={stopAll}
            onChange={setStopAll}
            label={t('sessions.stopAlsoAssignments', { count: runningAssignments })}
          />
        </ConfirmDialog>
      )}
      {work === undefined || botSlug === undefined ? null : (
        <AssignmentWorkDialog
          actions={actions}
          botSlug={botSlug}
          sessionId={work.sessionId}
          title={work.title}
          canOpen={native.byId[work.sessionId] !== undefined}
          onClose={() => setWork(undefined)}
          t={t}
        />
      )}
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
              { type: 'separator' as const, id: 'links-separator' },
              { id: 'links:on', label: t('sessions.link.toggle') },
            ]
          : []),
        ...extraItems,
      ]}
      selectedIds={[
        ...extraSelectedIds,
        ...(botSlug ? ['scope:' + preference.scope, 'layout:' + preference.layout] : []),
        ...(botSlug && preference.links ? ['links:on'] : []),
      ]}
      onSelect={(id) => {
        const [kind, value] = id.split(':');
        if (kind === 'links') {
          updateSessionViewPreference(slug, (current) => ({ ...current, links: !current.links }));
          return;
        }
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

function SessionRowMenu({
  label,
  items,
  onSelect,
}: {
  label: string;
  items: readonly MenuEntry[];
  onSelect(id: string): void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Menu
      open={open}
      portal
      dense
      align="end"
      anchor={
        <span data-session-more={open ? 'open' : 'closed'}>
          <IconButton
            size="inline"
            aria-label={label}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <ChannelSidebarIcon name="ellipsis-vertical" size={14} />
          </IconButton>
        </span>
      }
      items={items}
      onSelect={(id) => {
        setOpen(false);
        onSelect(id);
      }}
      onClose={() => setOpen(false)}
    />
  );
}

function SessionModelChip({
  route,
  models,
}: {
  route: { provider: string; model: string; reasoningEffort?: string };
  models: readonly ModelCatalogEntryView[];
}): ReactElement {
  const entry = models.find(
    (item) => item.provider === route.provider && item.model === route.model,
  );
  const name = entry?.modelName ?? route.model;
  const brand = modelBrand({
    provider: route.provider,
    model: route.model,
    name: entry?.modelName,
  });
  const effort =
    route.reasoningEffort === undefined
      ? undefined
      : (entry?.efforts.find((item) => item.id === route.reasoningEffort)?.name ??
        route.reasoningEffort);
  const short = modelShortName(name, brand);
  return (
    <SessionMetaChip
      kind="model"
      icon={<ModelBrandIcon brand={brand} size={12} />}
      label={effort === undefined ? short : `${short} · ${effort}`}
      title={modelRouteText(route)}
    />
  );
}
