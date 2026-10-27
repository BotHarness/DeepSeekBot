import { useState, type ReactElement, type ReactNode } from 'react';

import * as stylex from '@stylexjs/stylex';
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import type {
  AssignmentWork,
  AssignmentWorkLane,
  AssignmentWorkRound,
  AssignmentWorkStep,
} from './bridge.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { ActionButton } from './ds/action-button.js';
import { IconButton } from './ds/icon-button.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { Tooltip } from './ds/tooltip.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { modelRouteText, SUBAGENT_STATE_TONE } from './session-subagents.js';

const styles = stylex.create({
  note: { fontSize: text.metaSize, lineHeight: text.metaLine, color: color.muted },
  description: { margin: 0, color: color.muted, whiteSpace: 'pre-wrap' },
  report: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    padding: space.x4,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  reportHead: {
    display: 'flex',
    alignItems: 'baseline',
    gap: space.x3,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    color: color.muted,
  },
  round: { display: 'flex', flexDirection: 'column', gap: space.x3 },
  reportSummary: {
    display: '-webkit-box',
    overflow: 'hidden',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 4,
  },
  roundHead: {
    display: 'flex',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: space.x3,
    margin: 0,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  roundMeta: {
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.regular,
    color: color.muted,
  },
  instruction: {
    margin: 0,
    paddingBlock: space.x3,
    paddingInline: space.x4,
    borderLeftWidth: border.focus,
    borderLeftStyle: 'solid',
    borderLeftColor: color.accent,
    borderRadius: radius.xs,
    backgroundColor: color.surface,
    whiteSpace: 'pre-wrap',
  },
  instructionLabel: {
    display: 'block',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    color: color.muted,
  },
  lane: { display: 'flex', flexDirection: 'column', gap: space.x2 },
  laneHead: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.x3,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  laneLabel: { fontWeight: text.strong, letterSpacing: '0.04em' },
  laneTitle: { color: color.fg },
  laneModel: { color: color.muted },
  steps: {
    display: 'flex',
    flexDirection: 'column',
    margin: 0,
    padding: 0,
    listStyle: 'none',
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.divider,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  step: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    alignItems: 'baseline',
    columnGap: space.x3,
    paddingBlock: space.x3,
    paddingInline: space.x4,
    borderTopWidth: border.hairline,
    borderTopStyle: 'solid',
    borderTopColor: { default: color.divider, ':first-child': 'transparent' },
  },
  mark: { display: 'inline-flex', alignSelf: 'center', color: color.muted },
  markRunning: { color: color.accent },
  markDone: { color: color.success },
  markFailed: { color: color.danger },
  stepText: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  stepDetail: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  stepTool: { fontSize: text.metaSize, lineHeight: text.metaLine, color: color.muted },
  stepFailed: { color: color.danger },
  stepTime: {
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    color: color.muted,
    fontVariantNumeric: 'tabular-nums',
  },
  empty: {
    paddingBlock: space.x3,
    paddingInline: space.x4,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    color: color.muted,
  },
});

const STEP_ICON = {
  running: 'play',
  done: 'check',
  failed: 'x',
  denied: 'ban',
  cancelled: 'ban',
} as const;

export function laneLabel(lane: Pick<AssignmentWorkLane, 'role' | 'index'>): string {
  return lane.role === 'main' ? 'MAIN' : `SUBAGENT ${String(lane.index).padStart(2, '0')}`;
}

function clock(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return at.toDateString() === new Date().toDateString()
    ? time
    : `${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`;
}

export interface AssignmentWorkGroup {
  round?: AssignmentWorkRound;
  main: AssignmentWorkStep[];
  subagents: AssignmentWorkLane[];
}

export function groupAssignmentWork(work: AssignmentWork): AssignmentWorkGroup[] {
  const [main, ...rest] = work.lanes.filter((lane) => lane.role === 'main');
  const subagents = work.lanes.filter((lane) => lane.role === 'subagent');
  const steps = [...(main?.entries ?? []), ...rest.flatMap((lane) => lane.entries)];
  const known = new Set(work.rounds.map((round) => round.index));
  const earlier: AssignmentWorkGroup = {
    main: steps.filter((step) => step.round === undefined || !known.has(step.round)),
    subagents: subagents.filter((lane) => lane.round === undefined || !known.has(lane.round)),
  };
  const groups = work.rounds.map((round) => ({
    round,
    main: steps.filter((step) => step.round === round.index),
    subagents: subagents.filter((lane) => lane.round === round.index),
  }));
  return earlier.main.length === 0 && earlier.subagents.length === 0 && groups.length > 0
    ? groups
    : [earlier, ...groups];
}

function Steps({
  steps,
  omitted,
  t,
}: {
  steps: readonly AssignmentWorkStep[];
  omitted: number;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <ul {...stylex.props(styles.steps)}>
      {omitted === 0 ? null : (
        <li {...stylex.props(styles.empty)}>
          {t('assignmentWork.omittedSteps', { count: omitted })}
        </li>
      )}
      {steps.length === 0 ? (
        <li {...stylex.props(styles.empty)}>{t('assignmentWork.noSteps')}</li>
      ) : (
        steps.map((step, index) => {
          const state = t(`assignmentWork.step.${step.status}`);
          return (
            <li
              key={`${step.at}:${index}`}
              data-assignment-work-step={step.status}
              {...stylex.props(styles.step)}
            >
              <span
                role="img"
                aria-label={state}
                title={state}
                {...stylex.props(
                  styles.mark,
                  step.status === 'running' && styles.markRunning,
                  step.status === 'done' && styles.markDone,
                  step.status === 'failed' && styles.markFailed,
                )}
              >
                <ChannelSidebarIcon name={STEP_ICON[step.status]} size={14} />
              </span>
              <span {...stylex.props(styles.stepText)}>
                <span
                  {...stylex.props(
                    styles.stepDetail,
                    step.status === 'failed' && styles.stepFailed,
                  )}
                >
                  {step.detail ?? step.tool}
                </span>
                {step.detail === undefined ? null : (
                  <span {...stylex.props(styles.stepTool)}>{step.tool}</span>
                )}
              </span>
              <time dateTime={step.at} {...stylex.props(styles.stepTime)}>
                {clock(step.at)}
              </time>
            </li>
          );
        })
      )}
    </ul>
  );
}

function Lane({
  label,
  lane,
  steps,
  t,
}: {
  label: string;
  lane?: AssignmentWorkLane;
  steps: readonly AssignmentWorkStep[];
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <section
      data-assignment-work-lane={lane?.role === 'subagent' ? lane.index : 'main'}
      aria-label={label}
      {...stylex.props(styles.lane)}
    >
      <div {...stylex.props(styles.laneHead)}>
        <span {...stylex.props(styles.laneLabel)}>{label}</span>
        {lane?.role !== 'subagent' || lane.title === undefined ? null : (
          <span {...stylex.props(styles.laneTitle)}>{lane.title}</span>
        )}
        {lane?.route === undefined ? null : (
          <span {...stylex.props(styles.laneModel)}>{modelRouteText(lane.route)}</span>
        )}
        {lane?.role !== 'subagent' ? null : (
          <Tag tone={SUBAGENT_STATE_TONE[lane.state]}>
            {t(`sessions.subagents.state.${lane.state}`)}
          </Tag>
        )}
      </div>
      <Steps steps={steps} omitted={lane?.omitted ?? 0} t={t} />
    </section>
  );
}

function RoundHead({
  round,
  t,
}: {
  round: AssignmentWorkRound | undefined;
  t: BotHarnessTranslate;
}): ReactNode {
  return (
    <h3 {...stylex.props(styles.roundHead)}>
      {round === undefined ? (
        t('assignmentWork.earlier')
      ) : (
        <>
          <span>{t('assignmentWork.round', { index: round.index })}</span>
          <span {...stylex.props(styles.roundMeta)}>
            {t(`assignmentWork.round.${round.kind}`)} · {clock(round.at)}
          </span>
        </>
      )}
    </h3>
  );
}

export function AssignmentWorkView({
  work,
  t,
}: {
  work: AssignmentWork;
  t: BotHarnessTranslate;
}): ReactElement {
  const main = work.lanes.find((lane) => lane.role === 'main');
  const report = work.latestReport;
  return (
    <>
      {work.description.trim() === '' ? null : (
        <p {...stylex.props(styles.description)}>{work.description}</p>
      )}
      {report === undefined ? null : (
        <div data-assignment-work-report="" {...stylex.props(styles.report)}>
          <span {...stylex.props(styles.reportHead)}>
            <span>
              {t('assignmentWork.report')} · {t(`inbox.report.${report.state}`)}
            </span>
            {report.at === undefined ? null : <span>{clock(report.at)}</span>}
          </span>
          <span title={report.summary} {...stylex.props(styles.reportSummary)}>
            {report.summary}
          </span>
        </div>
      )}
      {work.omittedRounds === 0 ? null : (
        <span {...stylex.props(styles.note)}>
          {t('assignmentWork.omittedRounds', { count: work.omittedRounds })}
        </span>
      )}
      {groupAssignmentWork(work).map((group, index) => (
        <section
          key={group.round?.index ?? 'earlier'}
          data-assignment-work-round={group.round?.index ?? 'earlier'}
          {...stylex.props(styles.round)}
        >
          <RoundHead round={group.round} t={t} />
          {group.round?.instruction === undefined ? null : (
            <blockquote {...stylex.props(styles.instruction)}>
              <span {...stylex.props(styles.instructionLabel)}>
                {t('assignmentWork.instruction')}
              </span>
              {group.round.instruction}
            </blockquote>
          )}
          <Lane
            label="MAIN"
            {...(main === undefined
              ? {}
              : { lane: { ...main, omitted: index === 0 ? main.omitted : 0 } })}
            steps={group.main}
            t={t}
          />
          {group.subagents.map((lane) => (
            <Lane
              key={lane.sessionId}
              label={laneLabel(lane)}
              lane={lane}
              steps={lane.entries}
              t={t}
            />
          ))}
        </section>
      ))}
      {work.omittedSubagents === 0 ? null : (
        <span {...stylex.props(styles.note)}>
          {t('sessions.subagents.omitted', { count: work.omittedSubagents })}
        </span>
      )}
    </>
  );
}

type Load =
  | { status: 'loading' }
  | { status: 'ready'; work: AssignmentWork }
  | { status: 'error'; error: string };

export function AssignmentWorkDialog({
  actions,
  botSlug,
  sessionId,
  title,
  canOpen,
  onClose,
  t,
}: {
  actions: BridgeActions;
  botSlug: string;
  sessionId: string;
  title: string;
  canOpen: boolean;
  onClose(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const mount = useMountedResource<HTMLDivElement>(() => {
    const read = actions.assignmentWork;
    if (read === undefined) {
      setLoad({ status: 'error', error: 'unavailable' });
      return;
    }
    let live = true;
    read(botSlug, sessionId).then(
      (work) => {
        if (live) setLoad({ status: 'ready', work });
      },
      (error: unknown) => {
        if (live)
          setLoad({
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
      },
    );
    return () => {
      live = false;
    };
  }, [actions, botSlug, sessionId]);
  return (
    <PanelDialog
      title={load.status === 'ready' ? load.work.title : title}
      closeLabel={t('common.close')}
      onClose={onClose}
      scroll
      data={{ 'data-assignment-work': sessionId }}
      bodyRef={mount}
      actions={
        canOpen ? (
          <ActionButton
            icon="external-link"
            onClick={() => {
              onClose();
              void actions.openSession(sessionId);
            }}
          >
            {t('assignmentWork.openSession')}
          </ActionButton>
        ) : undefined
      }
    >
      {load.status === 'loading' ? (
        <span role="status" {...stylex.props(styles.note)}>
          {t('assignmentWork.loading')}
        </span>
      ) : load.status === 'error' ? (
        <span role="alert" className="bh-error">
          {t('assignmentWork.error', { error: load.error })}
        </span>
      ) : (
        <AssignmentWorkView work={load.work} t={t} />
      )}
    </PanelDialog>
  );
}

export function AssignmentWorkButton({
  title,
  onOpen,
  t,
}: {
  title: string;
  onOpen(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <Tooltip label={t('assignmentWork.tooltip')} side="top" portal delayMs={400}>
      <IconButton
        size="inline"
        data-assignment-work-open=""
        aria-label={t('assignmentWork.open', { title })}
        aria-haspopup="dialog"
        onClick={onOpen}
      >
        <ChannelSidebarIcon name="panel-right" size={14} />
      </IconButton>
    </Tooltip>
  );
}
