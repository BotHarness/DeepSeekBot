import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';

import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import type { DockPanelHost } from './dock-panels.js';
import type { NativeSessionCatalog } from './sessions-entry.js';
import type { NativeSessionSummary } from './session-rows.js';
import type { BotSummary } from './store.js';
import { AssignmentWorkDialog } from './assignment-work.js';
import { PersonaBotAvatar } from './avatar.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { TASK_BOARD_PANEL } from './channel-dock-layout.js';
import { PanelEmptyState } from './ds/empty-state.js';
import { IconButton } from './ds/icon-button.js';
import { Tooltip } from './ds/tooltip.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import { formatRelativeTime } from './labels.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarViewMenu } from './sidebar-view-menu.js';
import {
  assignmentExecutionOf,
  buildTaskBoard,
  needsWork,
  taskBoardPhase,
  type AssignmentCard,
  type BotGroup,
  type TaskBoardAssignment,
  type TaskBoardModel,
  type TaskBoardWorkState,
} from './task-board-model.js';
import { taskBoardPrefs, type TaskBoardPrefs } from './task-board-prefs.js';
import { useClientStore } from './use-client-store.js';

const EMPTY_CATALOG: {
  ids: readonly string[];
  byId: Readonly<Record<string, NativeSessionSummary>>;
} = { ids: [], byId: {} };
const inactiveSubscribe = () => () => {};
const POLL_MS = 10_000;
const MAX_CONCURRENT_WORK = 4;
const STOP_AFTER_FAILURES = 2;

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    minWidth: 0,
    height: '100%',
    overflowY: 'auto',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x2,
    paddingInline: space.x2,
  },
  toolbarText: { color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  switches: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    padding: space.x2,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
  },
  switchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    padding: space.x1,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: 'transparent',
    color: color.muted,
    fontFamily: 'inherit',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    textAlign: 'start',
    cursor: 'pointer',
  },
  switchOn: { color: color.fg, fontWeight: text.strong },
  notice: {
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    padding: space.x2,
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    minWidth: 0,
  },
  groupHead: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    width: '100%',
    padding: space.x1,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: 'transparent',
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    textAlign: 'start',
    cursor: 'pointer',
  },
  groupName: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: text.strong,
  },
  groupCount: { color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  chevron: { color: color.muted, display: 'inline-flex' },
  chevronOpen: { transform: 'rotate(90deg)' },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    marginInlineStart: space.x4,
    padding: space.x2,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: { default: color.surface, ':hover': color.hover },
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    textAlign: 'start',
    cursor: 'pointer',
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    minWidth: 0,
  },
  cardTitle: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: text.strong,
  },
  chip: {
    flexShrink: 0,
    paddingInline: space.x1,
    borderRadius: radius.round,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  chipWorking: { color: color.accent },
  chipNeeds: { color: color.warning },
  chipIdle: { color: color.muted },
  chipResolved: { color: color.success },
  track: {
    display: 'flex',
    width: '100%',
    height: border.hairline,
    borderRadius: radius.round,
    backgroundColor: color.border,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: color.accent },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    minWidth: 0,
  },
  metaText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  steps: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    margin: 0,
    marginInlineStart: space.x4,
    padding: 0,
    listStyleType: 'none',
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    minWidth: 0,
  },
  stepRunning: { color: color.fg },
  stepFailed: { color: color.danger },
  stepTool: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  mark: { flexShrink: 0, color: color.muted },
  markDone: { color: color.success },
  markRunning: { color: color.accent },
  markFailed: { color: color.danger },
});

const SECTION_KEY = {
  working: 'taskBoard.section.working',
  'needs-input': 'taskBoard.section.needs',
  idle: 'taskBoard.section.idle',
  resolved: 'taskBoard.section.resolved',
} as const;

const STEP_MARK = {
  running: '•',
  done: '✓',
  failed: '×',
  denied: '×',
  cancelled: '·',
} as const;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sameBotFaces(left: readonly BotSummary[], right: readonly BotSummary[]): boolean {
  return (
    left.length === right.length &&
    left.every((bot, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        bot.slug === other.slug &&
        bot.displayName === other.displayName &&
        bot.avatar === other.avatar &&
        bot.appearance === other.appearance &&
        bot.avatarSeed === other.avatarSeed
      );
    })
  );
}

function mergeWork(
  previous: Readonly<Record<string, TaskBoardWorkState>>,
  next: Readonly<Record<string, TaskBoardWorkState>>,
): Readonly<Record<string, TaskBoardWorkState>> {
  return { ...previous, ...next };
}

function workTargets(model: TaskBoardModel): AssignmentCard[] {
  return model.groups
    .filter((group) => !group.collapsed)
    .flatMap((group) => group.assignments)
    .filter(
      (card) =>
        needsWork(card.section) && card.unavailable !== true && card.kind !== 'orchestrator',
    );
}

type Load =
  | { status: 'loading'; assignments: readonly TaskBoardAssignment[] }
  | { status: 'ready'; assignments: readonly TaskBoardAssignment[] }
  | { status: 'error'; assignments: readonly TaskBoardAssignment[]; error: string };

export function TaskBoardPanel({
  channelId,
  botSlug,
  actions,
  t,
  nativeSessions,
  prefs = taskBoardPrefs,
}: ChannelSidebarEntryProps & {
  nativeSessions?: NativeSessionCatalog;
  prefs?: TaskBoardPrefs;
}): ReactElement {
  const snapshot = useSyncExternalStore(prefs.subscribe, prefs.getSnapshot, prefs.getSnapshot);
  const native = useSyncExternalStore(
    nativeSessions?.subscribe ?? inactiveSubscribe,
    nativeSessions?.getSnapshot ?? (() => EMPTY_CATALOG),
    nativeSessions?.getSnapshot ?? (() => EMPTY_CATALOG),
  );
  const revision = useClientStore((state) =>
    state.conversation.channel?.id === channelId ? state.conversation.revision : undefined,
  );
  const channelType = useClientStore(
    (state) => state.channels.find((channel) => channel.id === channelId)?.type ?? 'dm',
  );
  const bots = useClientStore((state) => state.bots, sameBotFaces);
  const [load, setLoad] = useState<Load>({ status: 'loading', assignments: [] });
  const [work, setWork] = useState<Readonly<Record<string, TaskBoardWorkState>>>({});
  const [dialog, setDialog] = useState<AssignmentCard>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const signature = native.ids.map((id) => `${id}:${native.byId[id]?.running === true}`).join('|');
  const [attempt, setAttempt] = useState(0);
  const viewPrefs = {
    collapsedBots: snapshot.collapsedBots,
    showDoneSteps: snapshot.showDoneSteps,
    autoExpandWorking: snapshot.autoExpandWorking,
    onlyWorking: snapshot.onlyWorking,
  };
  const model = buildTaskBoard({
    channelId,
    channelType,
    assignments: load.assignments,
    bots,
    now: Date.now(),
    stale: load.status === 'error' && load.assignments.length > 0,
    ...(nativeSessions === undefined ? {} : { availableSessionIds: new Set<string>(native.ids) }),
    work,
    prefs: viewPrefs,
  });
  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    let timer: number | undefined;
    let failures = 0;
    const readWork = actions.assignmentWork;
    const collect = async (targets: readonly AssignmentCard[]): Promise<void> => {
      const queue = [...targets];
      const next: Record<string, TaskBoardWorkState> = {};
      const drain = async (): Promise<void> => {
        for (;;) {
          const card = queue.shift();
          if (card === undefined) return;
          if (readWork === undefined) {
            next[card.sessionId] = { error: t('taskBoard.workUnavailable') };
            continue;
          }
          try {
            next[card.sessionId] = { work: await readWork(card.botSlug, card.sessionId) };
          } catch (error: unknown) {
            next[card.sessionId] = { error: messageOf(error) };
          }
        }
      };
      const workers = Array.from({ length: Math.min(MAX_CONCURRENT_WORK, targets.length) }, drain);
      await Promise.all(workers);
      if (!live || targets.length === 0) return;
      setWork((previous) => mergeWork(previous, next));
    };
    const round = async (): Promise<void> => {
      if (document.visibilityState !== 'visible') return;
      try {
        const assignments =
          channelType === 'dm'
            ? botSlug === undefined
              ? []
              : (await actions.readSessions(botSlug)).flatMap((row) => {
                  const assignment = assignmentExecutionOf(
                    row,
                    botSlug,
                    native.byId[row.sessionId],
                  );
                  return assignment === undefined ? [] : [assignment];
                })
            : await actions.channelAssignments(channelId);
        if (!live) return;
        failures = 0;
        setLoad({ status: 'ready', assignments });
        const provisional = buildTaskBoard({
          channelId,
          channelType,
          assignments,
          bots: [],
          now: Date.now(),
          prefs: prefs.viewPrefs(),
        });
        await collect(workTargets(provisional));
      } catch (error: unknown) {
        if (!live) return;
        failures += 1;
        setLoad((previous) => ({
          status: 'error',
          assignments: previous.assignments,
          error: messageOf(error),
        }));
        if (failures >= STOP_AFTER_FAILURES && timer !== undefined) {
          window.clearInterval(timer);
          timer = undefined;
        }
      }
    };
    void round();
    timer = window.setInterval(() => {
      void round();
    }, POLL_MS);
    return () => {
      live = false;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [actions, channelId, channelType, revision, signature, attempt, prefs]);
  const phase = taskBoardPhase(load.status, model.groups.length);
  const now = Date.now();
  return (
    <div data-task-board="" {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.toolbar)}>
        <span {...stylex.props(styles.toolbarText)}>
          {t('taskBoard.count', {
            count: model.groups.reduce((sum, group) => sum + group.assignments.length, 0),
          })}
        </span>
        <Tooltip label={t('taskBoard.settings')} side="bottom" portal delayMs={400}>
          <IconButton
            size="inline"
            aria-expanded={settingsOpen}
            aria-label={t('taskBoard.settings')}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <ChannelSidebarIcon name="sliders-horizontal" size={14} />
          </IconButton>
        </Tooltip>
      </div>
      {settingsOpen ? (
        <div {...stylex.props(styles.switches)}>
          <button
            type="button"
            aria-pressed={snapshot.showDoneSteps}
            data-task-board-switch="showDoneSteps"
            onClick={() => prefs.setShowDoneSteps(!snapshot.showDoneSteps)}
            {...stylex.props(styles.switchRow, snapshot.showDoneSteps && styles.switchOn)}
          >
            {t('taskBoard.showDoneSteps')}
          </button>
          <button
            type="button"
            aria-pressed={snapshot.autoExpandWorking}
            data-task-board-switch="autoExpandWorking"
            onClick={() => prefs.setAutoExpandWorking(!snapshot.autoExpandWorking)}
            {...stylex.props(styles.switchRow, snapshot.autoExpandWorking && styles.switchOn)}
          >
            {t('taskBoard.autoExpandWorking')}
          </button>
          <button
            type="button"
            aria-pressed={snapshot.onlyWorking}
            data-task-board-switch="onlyWorking"
            onClick={() => prefs.setOnlyWorking(!snapshot.onlyWorking)}
            {...stylex.props(styles.switchRow, snapshot.onlyWorking && styles.switchOn)}
          >
            {t('taskBoard.onlyWorking')}
          </button>
        </div>
      ) : null}
      {model.truncated ? (
        <p data-task-board-truncated="" {...stylex.props(styles.notice)}>
          {t('taskBoard.truncated')}
        </p>
      ) : null}
      {model.stale ? (
        <p data-task-board-stale="" role="alert" {...stylex.props(styles.notice)}>
          {t('taskBoard.stale')}
        </p>
      ) : null}
      <div ref={mount} {...stylex.props(styles.root)}>
        {phase === 'loading' ? (
          <span role="status" {...stylex.props(styles.notice)}>
            {t('taskBoard.loading')}
          </span>
        ) : phase === 'error' ? (
          <span role="alert" className="bh-error" {...stylex.props(styles.notice)}>
            {t('taskBoard.error', { error: load.status === 'error' ? load.error : '' })}{' '}
            <button
              type="button"
              onClick={() => {
                setLoad({ status: 'loading', assignments: [] });
                setWork({});
                setAttempt((count) => count + 1);
              }}
              {...stylex.props(styles.switchRow)}
            >
              {t('taskBoard.retry')}
            </button>
          </span>
        ) : phase === 'empty' ? (
          <PanelEmptyState icon="list-checks">{t('taskBoard.empty')}</PanelEmptyState>
        ) : (
          model.groups.map((group) => (
            <TaskBoardGroupView
              key={group.botSlug}
              group={group}
              bots={bots}
              now={now}
              t={t}
              onToggle={() => {
                prefs.setBotCollapsed(group.botSlug, !group.collapsed);
                setAttempt((count) => count + 1);
              }}
              onOpen={(card) => {
                if (card.kind === 'orchestrator') {
                  void actions.openSession(card.sessionId);
                  return;
                }
                setDialog(card);
              }}
            />
          ))
        )}
      </div>
      {dialog === undefined ? null : (
        <AssignmentWorkDialog
          actions={actions}
          botSlug={dialog.botSlug}
          sessionId={dialog.sessionId}
          title={dialog.title}
          canOpen={dialog.unavailable !== true}
          onClose={() => setDialog(undefined)}
          t={t}
        />
      )}
    </div>
  );
}

function TaskBoardGroupView({
  group,
  bots,
  now,
  t,
  onToggle,
  onOpen,
}: {
  group: BotGroup;
  bots: readonly BotSummary[];
  now: number;
  t: ChannelSidebarEntryProps['t'];
  onToggle(): void;
  onOpen(card: AssignmentCard): void;
}): ReactElement {
  const bot = bots.find((candidate) => candidate.slug === group.botSlug);
  return (
    <section data-task-board-group={group.botSlug} {...stylex.props(styles.group)}>
      <button
        type="button"
        aria-expanded={!group.collapsed}
        data-task-board-group-toggle={group.botSlug}
        onClick={onToggle}
        {...stylex.props(styles.groupHead)}
      >
        <span {...stylex.props(styles.chevron, !group.collapsed && styles.chevronOpen)}>
          <ChannelSidebarIcon name="chevron-right" size={14} />
        </span>
        <PersonaBotAvatar
          t={t}
          personaBotId={group.botSlug}
          name={group.displayName}
          src={bot?.avatar ?? group.avatar}
          appearance={bot?.appearance}
          avatarSeed={bot?.avatarSeed}
          state="idle"
          size={20}
        />
        <span {...stylex.props(styles.groupName)}>{group.displayName}</span>
        <span {...stylex.props(styles.groupCount)}>
          {t('taskBoard.groupCount', { count: group.assignments.length })}
        </span>
      </button>
      {group.collapsed
        ? null
        : group.assignments.map((card) => (
            <TaskBoardCardView
              key={card.sessionId}
              card={card}
              now={now}
              t={t}
              onOpen={() => onOpen(card)}
            />
          ))}
    </section>
  );
}

function TaskBoardCardView({
  card,
  now,
  t,
  onOpen,
}: {
  card: AssignmentCard;
  now: number;
  t: ChannelSidebarEntryProps['t'];
  onOpen(): void;
}): ReactElement {
  const progress = card.progress;
  return (
    <>
      <button
        type="button"
        data-task-board-card={card.sessionId}
        onClick={onOpen}
        {...stylex.props(styles.card)}
      >
        <span {...stylex.props(styles.cardHead)}>
          <span {...stylex.props(styles.cardTitle)}>
            {card.title === '' ? t('activity.source.orchestrator') : card.title}
          </span>
          {card.kind === 'orchestrator' ? (
            <span data-task-board-orchestrator="" {...stylex.props(styles.chip, styles.chipIdle)}>
              {t('activity.source.orchestrator')}
            </span>
          ) : null}
          <span
            data-task-board-chip={card.section}
            {...stylex.props(
              styles.chip,
              card.section === 'working' && styles.chipWorking,
              card.section === 'needs-input' && styles.chipNeeds,
              card.section === 'idle' && styles.chipIdle,
              card.section === 'resolved' && styles.chipResolved,
            )}
          >
            {t(SECTION_KEY[card.section])}
          </span>
        </span>
        {progress === undefined ? null : (
          <>
            <span {...stylex.props(styles.meta)}>
              <span {...stylex.props(styles.metaText)}>
                {t('taskBoard.progress', { done: progress.done, total: progress.total })}
              </span>
            </span>
            <span
              role="progressbar"
              aria-label={t('taskBoard.progress', { done: progress.done, total: progress.total })}
              aria-valuenow={progress.done}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              {...stylex.props(styles.track)}
            >
              <span
                {...stylex.props(styles.fill)}
                style={{ width: `${String(Math.round((progress.done / progress.total) * 100))}%` }}
              />
            </span>
          </>
        )}
        {card.currentStep === undefined ? null : (
          <span {...stylex.props(styles.meta)}>
            <span {...stylex.props(styles.metaText)}>
              {card.currentStep.detail ?? card.currentStep.tool}
            </span>
          </span>
        )}
        {card.unavailable === true ? (
          <span {...stylex.props(styles.meta)}>
            <span {...stylex.props(styles.metaText)}>{t('taskBoard.unavailable')}</span>
          </span>
        ) : null}
        {card.workError === undefined ? null : (
          <span {...stylex.props(styles.meta)}>
            <span {...stylex.props(styles.metaText)}>
              {t('taskBoard.workError', { error: card.workError })}
            </span>
          </span>
        )}
        <span {...stylex.props(styles.meta)}>
          <span {...stylex.props(styles.metaText)}>
            {formatRelativeTime(Date.parse(card.updatedAt), now, t)}
          </span>
        </span>
      </button>
      {card.steps === undefined ? null : (
        <ol data-task-board-steps={card.sessionId} {...stylex.props(styles.steps)}>
          {card.steps.map((step, index) => (
            <li
              key={`${step.at}:${String(index)}`}
              data-task-board-step={step.status}
              {...stylex.props(
                styles.step,
                step.status === 'running' && styles.stepRunning,
                step.status === 'failed' && styles.stepFailed,
              )}
            >
              <span
                aria-hidden
                {...stylex.props(
                  styles.mark,
                  step.status === 'done' && styles.markDone,
                  step.status === 'running' && styles.markRunning,
                  step.status === 'failed' && styles.markFailed,
                )}
              >
                {STEP_MARK[step.status]}
              </span>
              <span {...stylex.props(styles.stepTool)}>{step.detail ?? step.tool}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

export function TaskBoardViewMenu({
  t,
  prefs = taskBoardPrefs,
}: Pick<ChannelSidebarEntryProps, 't'> & { prefs?: TaskBoardPrefs }): ReactElement {
  const snapshot = useSyncExternalStore(prefs.subscribe, prefs.getSnapshot, prefs.getSnapshot);
  const items: MenuEntry[] = [
    { id: 'showDoneSteps', label: t('taskBoard.showDoneSteps') },
    { id: 'autoExpandWorking', label: t('taskBoard.autoExpandWorking') },
    { id: 'onlyWorking', label: t('taskBoard.onlyWorking') },
  ];
  const selectedIds = [
    ...(snapshot.showDoneSteps ? ['showDoneSteps'] : []),
    ...(snapshot.autoExpandWorking ? ['autoExpandWorking'] : []),
    ...(snapshot.onlyWorking ? ['onlyWorking'] : []),
  ];
  return (
    <SidebarViewMenu
      label={t('taskBoard.settings')}
      items={items}
      selectedIds={selectedIds}
      onSelect={(id) => {
        if (id === 'showDoneSteps') prefs.setShowDoneSteps(!snapshot.showDoneSteps);
        if (id === 'autoExpandWorking') prefs.setAutoExpandWorking(!snapshot.autoExpandWorking);
        if (id === 'onlyWorking') prefs.setOnlyWorking(!snapshot.onlyWorking);
      }}
    />
  );
}

export function TaskBoardHeaderAction({
  channelId,
  dockPanels,
  t,
  prefs = taskBoardPrefs,
}: {
  channelId: string;
  dockPanels: Pick<DockPanelHost, 'open' | 'close' | 'isOpen'> | undefined;
  t: ChannelSidebarEntryProps['t'];
  prefs?: TaskBoardPrefs;
}): ReactElement {
  const snapshot = useSyncExternalStore(prefs.subscribe, prefs.getSnapshot, prefs.getSnapshot);
  const hostRef = useRef(dockPanels);
  hostRef.current = dockPanels;
  const hostAvailable = dockPanels !== undefined;
  const align = useMountedResource<HTMLSpanElement>(() => {
    const host = hostRef.current;
    if (host === undefined) return;
    if (prefs.getSnapshot().openByChannel[channelId] === true) host.open(TASK_BOARD_PANEL);
    else host.close(TASK_BOARD_PANEL);
  }, [channelId, prefs, hostAvailable]);
  const open = snapshot.openByChannel[channelId] === true;
  const label = t(open ? 'taskBoard.close' : 'taskBoard.open');
  return (
    <span ref={align} data-task-board-header="">
      <Tooltip label={label} side="bottom" portal delayMs={400}>
        <IconButton
          size="inline"
          aria-pressed={open}
          aria-label={label}
          data-task-board-action=""
          onClick={() => {
            const next = !open;
            prefs.setOpen(channelId, next);
            if (dockPanels === undefined) return;
            if (next) dockPanels.open(TASK_BOARD_PANEL);
            else dockPanels.close(TASK_BOARD_PANEL);
          }}
        >
          <ChannelSidebarIcon name="list-checks" size={16} />
        </IconButton>
      </Tooltip>
    </span>
  );
}
