import { useState, type ReactElement } from 'react';

import { IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import type { ChannelAssignmentSummary } from '../../../core/src/runtime/bot-runtime.js';
import { PersonaBotAvatar } from './avatar.js';
import { useClientState } from './bot-sidebar.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { formatRelativeTime } from './labels.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';

export type GroupWorkGroup = 'waiting' | 'working' | 'idle' | 'done';

const GROUPS: readonly GroupWorkGroup[] = ['waiting', 'working', 'idle', 'done'];

export function groupWorkGroup(assignment: ChannelAssignmentSummary): GroupWorkGroup {
  const report = assignment.latestReport?.state;
  if (report === 'waiting-human' || report === 'blocked') return 'waiting';
  if (
    report === 'completed' ||
    report === 'failed' ||
    assignment.activity === 'stopped' ||
    assignment.activity === 'error'
  )
    return 'done';
  if (assignment.activity === 'working' || assignment.activity === 'stopping') return 'working';
  return 'idle';
}

type Load =
  | { status: 'loading'; assignments: readonly ChannelAssignmentSummary[] }
  | { status: 'ready'; assignments: readonly ChannelAssignmentSummary[] }
  | { status: 'error'; assignments: readonly ChannelAssignmentSummary[]; error: string };

function GroupWorkPanel({ channelId, actions, t }: ChannelSidebarEntryProps): ReactElement {
  const state = useClientState();
  const revision =
    state.conversation.channel?.id === channelId ? state.conversation.revision : undefined;
  const [load, setLoad] = useState<Load>({ status: 'loading', assignments: [] });
  const [doneOpen, setDoneOpen] = useState(false);
  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    actions.channelAssignments(channelId).then(
      (assignments) => {
        if (live) setLoad({ status: 'ready', assignments });
      },
      (error: unknown) => {
        if (live)
          setLoad((current) => ({
            status: 'error',
            assignments: current.assignments,
            error: error instanceof Error ? error.message : String(error),
          }));
      },
    );
    return () => {
      live = false;
    };
  }, [actions, channelId, revision]);

  const labels: Record<GroupWorkGroup, string> = {
    waiting: t('groupWork.waiting'),
    working: t('groupWork.working'),
    idle: t('groupWork.idle'),
    done: t('groupWork.done'),
  };
  const now = Date.now();
  const renderRow = (assignment: ChannelAssignmentSummary): ReactElement => {
    const bot = state.bots.find((candidate) => candidate.slug === assignment.botSlug);
    const name = bot?.displayName ?? assignment.botSlug;
    return (
      <SidebarCardRow
        key={assignment.sessionId}
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
        state={groupWorkGroup(assignment)}
        onClick={() => actions.openSession(assignment.sessionId)}
        meta={
          <>
            {assignment.latestReport === undefined ? null : (
              <span className="bh-group-work-summary">{assignment.latestReport.summary}</span>
            )}
            <span>{name}</span>
            <span>{formatRelativeTime(Date.parse(assignment.updatedAt), now, t)}</span>
          </>
        }
      />
    );
  };

  const grouped = GROUPS.map((group) => ({
    group,
    rows: load.assignments.filter((assignment) => groupWorkGroup(assignment) === group),
  })).filter((entry) => entry.rows.length > 0);

  return (
    <div className="bh-group-work" ref={mount}>
      {load.status === 'loading' && load.assignments.length === 0 ? (
        <LoadingSkeleton kind="sidebar" label={t('groupWork.loading')} />
      ) : null}
      {load.status === 'error' ? (
        <div className="bh-error">{t('groupWork.error', { error: load.error })}</div>
      ) : null}
      {load.status === 'ready' && load.assignments.length === 0 ? (
        <div className="bh-note">{t('groupWork.empty')}</div>
      ) : null}
      {grouped.map(({ group, rows }) => {
        const collapsible = group === 'done';
        const expanded = !collapsible || doneOpen;
        return (
          <section key={group} className="bh-session-workspace-group" data-group={group}>
            {collapsible ? (
              <button
                type="button"
                className="bh-session-workspace-heading"
                aria-expanded={expanded}
                onClick={() => setDoneOpen((open) => !open)}
              >
                <IconChevronDownOutlineRegular
                  size={14}
                  className={expanded ? '' : 'bh-session-workspace-chevron-collapsed'}
                />
                <span className="bh-session-workspace-name">{labels[group]}</span>
                <span className="bh-session-workspace-count">{rows.length}</span>
              </button>
            ) : (
              <div className="bh-session-workspace-heading bh-group-work-heading">
                <span className="bh-session-workspace-name">{labels[group]}</span>
                <span className="bh-session-workspace-count">{rows.length}</span>
              </div>
            )}
            {expanded ? (
              <SidebarCardList label={labels[group]}>{rows.map(renderRow)}</SidebarCardList>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export function GroupWorkEntry(props: ChannelSidebarEntryProps): ReactElement {
  return <GroupWorkPanel key={props.channelId} {...props} />;
}
