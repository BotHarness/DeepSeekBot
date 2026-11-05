import type { ConversationStateView } from './store.js';
import type { NativeSessionCatalog } from './sessions-entry.js';
import { personaBotSessionRows } from './session-rows.js';
import { useRef, useSyncExternalStore } from 'react';
import { useState, type ReactElement } from 'react';

import * as stylex from '@stylexjs/stylex';
import { IconStopFillRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import type { ChannelAssignmentSummary } from '../../../core/src/runtime/bot-runtime.js';
import { PersonaBotAvatar } from './avatar.js';
import { useClientStore } from './use-client-store.js';
import { sameBotsBesidesActivity } from './conversation-bots.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { formatRelativeTime } from './labels.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { GroupHeading } from './ds/group-heading.js';
import { PanelEmptyState } from './ds/empty-state.js';
import { IconButton } from './ds/icon-button.js';
import { Tooltip } from './ds/tooltip.js';
import { color } from './ds/tokens.stylex.js';
import { modelRouteText, SessionSubagentList, SessionSubagentToggle } from './session-subagents.js';
import { AssignmentWorkButton, AssignmentWorkDialog } from './assignment-work.js';

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

function runningOrchestrators(state: ConversationStateView, channelId: string): string {
  const channel =
    state.conversation.channel?.id === channelId
      ? state.conversation.channel
      : state.channels.find((candidate) => candidate.id === channelId);
  if (channel?.type !== 'group') return '';
  return channel.members
    .flatMap((slug) => {
      const turn = state.bots
        .find((bot) => bot.slug === slug)
        ?.sessionActivity?.find((session) => session.role === 'orchestrator');
      return turn === undefined ? [] : [slug + '\t' + turn.id];
    })
    .join('\n');
}

async function currentOrchestratorSessionId(
  actions: ChannelSidebarEntryProps['actions'],
  botSlug: string,
): Promise<string | undefined> {
  const orchestrators = (await actions.readSessions(botSlug)).filter(
    (session) => session.role === 'orchestrator',
  );
  return (
    orchestrators.find((session) => session.currentOrchestrator === true) ??
    orchestrators.sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
  )?.sessionId;
}

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
  const bots = useClientStore((state) => state.bots, sameBotsBesidesActivity);
  const [load, setLoad] = useState<Load>({ status: 'loading', assignments: [] });
  const [doneOpen, setDoneOpen] = useState(false);
  const [work, setWork] = useState<ChannelAssignmentSummary>();
  const [subagentsOpen, setSubagentsOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggleSubagents = (sessionId: string): void =>
    setSubagentsOpen((current) => {
      const next = new Set(current);
      if (!next.delete(sessionId)) next.add(sessionId);
      return next;
    });
  const signature = native.ids.map((id) => `${id}:${native.byId[id]?.running === true}`).join('|');
  const runningSignature = useClientStore((state) => runningOrchestrators(state, channelId));
  const running = (runningSignature === '' ? [] : runningSignature.split('\n')).map((line) => {
    const [slug = '', turn = ''] = line.split('\t');
    return { slug, turn };
  });
  const [orchestratorIds, setOrchestratorIds] = useState<Readonly<Record<string, string>>>({});
  const [stopping, setStopping] = useState<ReadonlySet<string>>(() => new Set());
  const [stopError, setStopError] = useState<string>();
  const resolving = useRef(new Map<string, Promise<string | undefined>>());
  const resolveOrchestrator = (slug: string, turn: string): Promise<string | undefined> => {
    const pending = resolving.current.get(turn);
    if (pending !== undefined) return pending;
    const next = currentOrchestratorSessionId(actions, slug).then(
      (sessionId) => {
        if (sessionId !== undefined)
          setOrchestratorIds((current) =>
            current[turn] === sessionId ? current : { ...current, [turn]: sessionId },
          );
        return sessionId;
      },
      () => undefined,
    );
    resolving.current.set(turn, next);
    return next;
  };
  const workingNowMount = useMountedResource<HTMLElement>(() => {
    const live = new Set(running.map((entry) => entry.turn));
    for (const turn of resolving.current.keys())
      if (!live.has(turn)) resolving.current.delete(turn);
    for (const entry of running) void resolveOrchestrator(entry.slug, entry.turn);
  }, [runningSignature]);
  const stopOrchestrator = (slug: string, turn: string): void => {
    setStopping((current) => new Set(current).add(turn));
    setStopError(undefined);
    void resolveOrchestrator(slug, turn)
      .then((sessionId) => {
        if (sessionId === undefined) throw new Error(t('sessions.status.unavailable'));
        return actions.stopSession(slug, sessionId, channelId);
      })
      .catch((error: unknown) => {
        setStopError(error instanceof Error ? error.message : String(error));
        setStopping((current) => {
          const next = new Set(current);
          next.delete(turn);
          return next;
        });
      });
  };
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
      assignmentTitle: assignment.title,
      assignmentDescription: assignment.description,
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
    const subagents = assignment.subagentCount;
    const subagentsExpanded = subagents !== undefined && subagentsOpen.has(assignment.sessionId);
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
        title={assignment.title}
        hint={`${name}\n${assignment.description}`}
        mainClassName="bh-group-work-row"
        state={groupFor(assignment)}
        disabled={nativeSessions !== undefined && native.byId[assignment.sessionId] === undefined}
        onClick={() => actions.openSession(assignment.sessionId)}
        trailing={
          <>
            <AssignmentWorkButton
              title={assignment.title}
              onOpen={() => setWork(assignment)}
              t={t}
            />
            {subagents === undefined ? null : (
              <SessionSubagentToggle
                count={subagents}
                title={assignment.title}
                open={subagentsExpanded}
                onToggle={() => toggleSubagents(assignment.sessionId)}
                t={t}
              />
            )}
          </>
        }
        {...(subagentsExpanded
          ? {
              detail: (
                <SessionSubagentList
                  actions={actions}
                  botSlug={assignment.botSlug}
                  sessionId={assignment.sessionId}
                  revision={`${String(subagents)}:${signature}`}
                  canOpen={(id) => nativeSessions === undefined || native.byId[id] !== undefined}
                  t={t}
                />
              ),
            }
          : {})}
        meta={
          <>
            {assignment.latestReport === undefined ? null : (
              <span {...stylex.props(styles.summary)}>
                {t(`inbox.report.${assignment.latestReport.state}`)} ·{' '}
                {assignment.latestReport.summary}
              </span>
            )}
            <span>{name}</span>
            {assignment.modelRoute === undefined ? null : (
              <span>{modelRouteText(assignment.modelRoute)}</span>
            )}
            {nativeSessions && !native.byId[assignment.sessionId] ? (
              <span>{t('sessions.status.unavailable')}</span>
            ) : null}
            <span>{formatRelativeTime(Date.parse(assignment.updatedAt), now, t)}</span>
          </>
        }
      />
    );
  };

  const renderOrchestrator = ({ slug, turn }: { slug: string; turn: string }): ReactElement => {
    const bot = bots.find((candidate) => candidate.slug === slug);
    const name = bot?.displayName ?? slug;
    const sessionId = orchestratorIds[turn];
    const isStopping = stopping.has(turn);
    return (
      <SidebarCardRow
        key={slug}
        flipKey={'orchestrator:' + slug}
        leading={
          <PersonaBotAvatar
            t={t}
            personaBotId={slug}
            name={name}
            src={bot?.avatar}
            appearance={bot?.appearance}
            avatarSeed={bot?.avatarSeed}
            state="working"
            size={24}
          />
        }
        title={name}
        mainClassName="bh-group-orchestrator-row"
        state={isStopping ? 'stopping' : 'running'}
        {...(sessionId === undefined ? {} : { onClick: () => actions.openSession(sessionId) })}
        badge={isStopping ? <Tag tone="warning">{t('sessions.status.stopping')}</Tag> : undefined}
        trailing={
          <Tooltip label={t('sessions.stop')} side="top" portal delayMs={400}>
            <IconButton
              size="inline"
              data-session-stop=""
              disabled={isStopping}
              aria-label={t('sessions.stopNamed', { title: name })}
              onClick={() => stopOrchestrator(slug, turn)}
            >
              <IconStopFillRegular size={12} />
            </IconButton>
          </Tooltip>
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
      {running.length === 0 ? null : (
        <section data-group="working-now" ref={workingNowMount}>
          <GroupHeading flush label={t('groupWork.workingNow')} count={running.length} />
          <SidebarCardList flush label={t('groupWork.workingNow')}>
            {running.map(renderOrchestrator)}
          </SidebarCardList>
        </section>
      )}
      {stopError === undefined ? null : (
        <div className="bh-error" role="alert">
          {stopError}
        </div>
      )}
      {load.status === 'ready' && load.assignments.length === 0 && running.length === 0 ? (
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
      {work === undefined ? null : (
        <AssignmentWorkDialog
          actions={actions}
          botSlug={work.botSlug}
          sessionId={work.sessionId}
          title={work.title}
          canOpen={nativeSessions === undefined || native.byId[work.sessionId] !== undefined}
          onClose={() => setWork(undefined)}
          t={t}
        />
      )}
    </div>
  );
}

export function GroupWorkEntry(
  props: ChannelSidebarEntryProps & { nativeSessions?: NativeSessionCatalog },
): ReactElement {
  return <GroupWorkPanel key={props.channelId} {...props} />;
}
