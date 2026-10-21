import type { NativeSessionCatalog } from './sessions-entry.js';
import { personaBotSessionRows } from './session-rows.js';
import { useSyncExternalStore } from 'react';
import { useState, type ReactElement } from 'react';

import * as stylex from '@stylexjs/stylex';

import type { ChannelAssignmentSummary } from '../../../core/src/runtime/bot-runtime.js';
import { PersonaBotAvatar } from './avatar.js';
import { useClientStore } from './use-client-store.js';
import { shallowEqual } from '@deepseek-ai/dsh-client-store';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { formatRelativeTime } from './labels.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { GroupHeading } from './ds/group-heading.js';
import { PanelEmptyState } from './ds/empty-state.js';
import { color } from './ds/tokens.stylex.js';

const styles = stylex.create({
  summary: {
    display: '-webkit-box',
    overflow: 'hidden',
    flexBasis: '100%',
    color: color.muted,
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
  },
});

export type GroupWorkGroup = 'waiting' | 'working' | 'idle' | 'done';

const GROUPS: readonly GroupWorkGroup[] = ['waiting', 'working', 'idle', 'done'];

type Load =
  | { status: 'loading'; assignments: readonly ChannelAssignmentSummary[] }
  | { status: 'ready'; assignments: readonly ChannelAssignmentSummary[] }
  | { status: 'error'; assignments: readonly ChannelAssignmentSummary[]; error: string };

const EMPTY_CATALOG = { ids: [], byId: {} };
const emptySubscribe = () => () => {};
function GroupWorkPanel({
  channelId,
  actions,
  t,
  nativeSessions,
}: ChannelSidebarEntryProps & { nativeSessions?: NativeSessionCatalog }): ReactElement {
  const native = useSyncExternalStore(
    nativeSessions?.subscribe ?? emptySubscribe,
    nativeSessions?.getSnapshot ?? (() => EMPTY_CATALOG),
    nativeSessions?.getSnapshot ?? (() => EMPTY_CATALOG),
  );
  const revision = useClientStore((state) =>
    state.conversation.channel?.id === channelId ? state.conversation.revision : undefined,
  );
  const bots = useClientStore((state) => state.bots, shallowEqual);
  const [load, setLoad] = useState<Load>({ status: 'loading', assignments: [] });
  const [doneOpen, setDoneOpen] = useState(false);
  const signature = native.ids.map((id) => `${id}:${native.byId[id]?.running === true}`).join('|');
  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    actions.channelAssignments(channelId).then(
      (assignments) => {
        if (live) setLoad({ status: 'ready', assignments });
      },
      (error: unknown) => {
        if (live)
          setLoad(() => ({
            status: 'error',
            assignments: [],
            error: error instanceof Error ? error.message : String(error),
          }));
      },
    );
    return () => {
      live = false;
    };
  }, [actions, channelId, revision, signature]);

  const labels: Record<GroupWorkGroup, string> = {
    waiting: t('sessions.section.needs-input'),
    working: t('sessions.section.working'),
    idle: t('sessions.section.idle'),
    done: t('sessions.section.resolved'),
  };
  const now = Date.now();
  const rows = personaBotSessionRows(
    load.assignments.map((assignment) => ({
      sessionId: assignment.sessionId,
      role: 'assignment',
      createdAt: assignment.createdAt,
      assignmentActivity: assignment.activity,
      ...(assignment.latestReport ? { assignmentReportState: assignment.latestReport.state } : {}),
      assignmentPurpose: assignment.purpose,
    })),
    native.byId,
    'all',
  );
  const sessionRows = new Map(rows.map((row) => [row.sessionId, row]));
  const sectionGroup = {
    'needs-input': 'waiting',
    working: 'working',
    idle: 'idle',
    resolved: 'done',
  } as const;
  const groupFor = (assignment: ChannelAssignmentSummary): GroupWorkGroup => {
    const row = sessionRows.get(assignment.sessionId);
    return row?.section ? sectionGroup[row.section] : 'idle';
  };
  const renderRow = (assignment: ChannelAssignmentSummary): ReactElement => {
    const bot = bots.find((candidate) => candidate.slug === assignment.botSlug);
    const name = bot?.displayName ?? assignment.botSlug;
    return (
      <SidebarCardRow
        key={assignment.sessionId}
        flipKey={assignment.sessionId}
        leading={
          <PersonaBotAvatar
            t={t}
            personaBotId={assignment.botSlug}
            name={name}
            src={bot?.avatar}
            appearance={bot?.appearance}
            avatarSeed={bot?.avatarSeed}
            state="idle"
            size={24}
          />
        }
        title={assignment.purpose}
        hint={name}
        mainClassName="bh-group-work-row"
        state={groupFor(assignment)}
        disabled={nativeSessions !== undefined && native.byId[assignment.sessionId] === undefined}
        onClick={() => actions.openSession(assignment.sessionId)}
        meta={
          <>
            {assignment.latestReport === undefined ? null : (
              <span {...stylex.props(styles.summary)}>
                {t(`inbox.report.${assignment.latestReport.state}`)} ·{' '}
                {assignment.latestReport.summary}
              </span>
            )}
            <span>{name}</span>
            {nativeSessions && !native.byId[assignment.sessionId] ? (
              <span>{t('sessions.status.unavailable')}</span>
            ) : null}
            <span>{formatRelativeTime(Date.parse(assignment.updatedAt), now, t)}</span>
          </>
        }
      />
    );
  };

  const grouped = GROUPS.map((group) => ({
    group,
    rows: load.assignments.filter((assignment) => groupFor(assignment) === group),
  })).filter((entry) => entry.rows.length > 0);

  return (
    <div ref={mount}>
      {load.status === 'loading' && load.assignments.length === 0 ? (
        <LoadingSkeleton kind="sidebar" label={t('groupWork.loading')} />
      ) : null}
      {load.status === 'error' ? (
        <div className="bh-error">{t('groupWork.error', { error: load.error })}</div>
      ) : null}
      {load.status === 'ready' && load.assignments.length === 0 ? (
        <PanelEmptyState icon="text-quote">{t('groupWork.empty')}</PanelEmptyState>
      ) : null}
      {load.assignments.length >= 200 ? <p role="note">{t('sessions.channel.limit')}</p> : null}
      {grouped.map(({ group, rows }) => {
        const collapsible = group === 'done';
        const expanded = !collapsible || doneOpen;
        return (
          <section key={group} data-group={group}>
            <GroupHeading
              flush
              label={labels[group]}
              count={rows.length}
              expanded={expanded}
              onToggle={collapsible ? () => setDoneOpen((open) => !open) : undefined}
            />
            {expanded ? (
              <SidebarCardList flush label={labels[group]}>
                {rows.map(renderRow)}
              </SidebarCardList>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export function GroupWorkEntry(
  props: ChannelSidebarEntryProps & { nativeSessions?: NativeSessionCatalog },
): ReactElement {
  return <GroupWorkPanel key={props.channelId} {...props} />;
}
