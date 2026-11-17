import { useState, type ReactElement } from 'react';

import * as stylex from '@stylexjs/stylex';

import type { BridgeActions } from './actions.js';
import type { SessionProgress, SessionTranscript } from './bridge.js';
import { ChannelComposer } from './channel-composer.js';
import { MessageMarkdown } from './channel-message-body.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { ChipButton } from './ds/chip-button.js';
import { WorkRow } from './ds/work-row.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { todoCount, TodoRing } from './session-progress-view.js';
import {
  elapsedText,
  liveLabel,
  processSummary,
  stepFailed,
  toolGroup,
  transcriptBlocks,
  type ToolGroup,
  type TranscriptBlock,
  type TranscriptStep,
} from './session-transcript-view.js';

const RUNNING_REFRESH_MS = 4_000;
const IDLE_REFRESH_MS = 30_000;

const GROUP_ICONS: Record<ToolGroup, string> = {
  read: 'file',
  edit: 'files',
  execute: 'terminal',
  search: 'search',
  fetch: 'globe',
  other: 'puzzle',
};

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.x2,
    paddingInline: space.x4,
    paddingBottom: space.x3,
  },
  panel: {
    marginInline: space.x4,
    marginBottom: space.x3,
    padding: space.x4,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    maxHeight: '40%',
    overflowY: 'auto',
    flexShrink: 0,
  },
  todo: { display: 'flex', gap: space.x3, alignItems: 'flex-start' },
  todoDone: { color: color.subtle, textDecoration: 'line-through' },
  todoActive: { fontWeight: text.strong },
  transcript: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    paddingInline: space.x5,
    paddingBlock: space.x4,
  },
  quiet: {
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  center: { textAlign: 'center' },
  input: {
    alignSelf: 'flex-end',
    maxWidth: '88%',
    marginBlock: space.x3,
    paddingBlock: space.x3,
    paddingInline: space.x4,
    borderRadius: radius.lg,
    backgroundColor: color.accentTint,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  reply: { overflowWrap: 'anywhere', minWidth: 0, marginBlock: space.x2 },
  nested: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    paddingInlineStart: space.x5,
  },
  thought: {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    paddingInlineStart: space.x6,
    paddingBottom: space.x2,
  },
  bad: { color: color.danger },
  ok: { color: color.success, display: 'inline-flex' },
  run: { color: color.accent, display: 'inline-flex' },
  composer: { flexShrink: 0, paddingBlock: space.x3 },
  error: {
    color: color.danger,
    paddingInline: space.x5,
    paddingBottom: space.x2,
  },
});

function stepIcon(step: TranscriptStep): string {
  return step.kind === 'reasoning' ? 'brain' : GROUP_ICONS[toolGroup(step)];
}

function StepRow({ step, t }: { step: TranscriptStep; t: BotHarnessTranslate }): ReactElement {
  const [open, setOpen] = useState(false);
  if (step.kind === 'reasoning') {
    const preview = step.text.split('\n').find((line) => line.trim() !== '') ?? '';
    return (
      <div data-transcript="reasoning">
        <WorkRow
          icon="brain"
          label={t('sessions.detail.reasoning')}
          detail={open ? undefined : preview}
          expanded={open}
          onToggle={() => setOpen((value) => !value)}
        />
        {open ? <div {...stylex.props(styles.thought)}>{step.text}</div> : null}
      </div>
    );
  }
  const failed = stepFailed(step) || step.status === 'cancelled';
  const status = t(`sessions.detail.tool.${step.status}`);
  return (
    <WorkRow
      data-transcript="tool"
      data-tool-status={step.status}
      title={`${step.tool}${step.detail === undefined ? '' : ` · ${step.detail}`} · ${status}`}
      icon={stepIcon(step)}
      label={step.tool}
      detail={step.detail}
      live={step.status === 'running'}
      danger={failed}
    />
  );
}

function ProcessGroup({
  steps,
  live,
  t,
}: {
  steps: TranscriptStep[];
  live: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const last = steps.at(-1);
  const latestTool = [...steps].reverse().find((step) => step.kind === 'tool');
  return (
    <div data-transcript="process" data-process-live={live ? '' : undefined}>
      <WorkRow
        icon={
          live && last !== undefined
            ? stepIcon(last)
            : latestTool === undefined
              ? 'brain'
              : stepIcon(latestTool)
        }
        label={live ? liveLabel(last, t) : processSummary(steps, t)}
        detail={live && last?.kind === 'tool' ? last.detail : undefined}
        live={live}
        danger={!live && steps.some(stepFailed)}
        expanded={open}
        onToggle={() => setOpen((value) => !value)}
      />
      {open ? (
        <div {...stylex.props(styles.nested)}>
          {steps.map((step, index) => (
            <StepRow key={`${step.kind}-${step.at}-${index}`} step={step} t={t} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TurnBlock({
  block,
  t,
}: {
  block: Extract<TranscriptBlock, { kind: 'turn' }>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const folds = !block.live && block.segments.some((segment) => segment.kind === 'process');
  const end = block.end;
  const state = end?.state ?? 'done';
  const duration = end === undefined ? undefined : elapsedText(block.startedAt, end.at, t);
  const heading =
    duration === undefined
      ? t(`sessions.detail.turn.${state}`)
      : t(`sessions.detail.took.${state}`, { duration });
  const visible =
    folds && !open ? block.segments.filter((segment) => segment.kind === 'reply') : block.segments;
  const lastSegment = block.segments.at(-1);
  return (
    <>
      {folds || (end !== undefined && state !== 'done') ? (
        <WorkRow
          data-transcript="turn-end"
          data-turn-state={state}
          icon={state === 'done' ? 'check' : state === 'cancelled' ? 'ban' : 'x'}
          label={heading}
          danger={state === 'failed'}
          {...(folds ? { expanded: open, onToggle: () => setOpen((value) => !value) } : {})}
        />
      ) : null}
      {end?.message === undefined ? null : (
        <div {...stylex.props(styles.quiet, styles.bad)}>{end.message}</div>
      )}
      {visible.map((segment) =>
        segment.kind === 'reply' ? (
          <div key={segment.key} data-transcript="reply" {...stylex.props(styles.reply)}>
            <MessageMarkdown text={segment.item.text} t={t} />
          </div>
        ) : (
          <ProcessGroup
            key={segment.key}
            steps={segment.steps}
            live={block.live && segment === lastSegment}
            t={t}
          />
        ),
      )}
      {block.live && lastSegment?.kind !== 'process' ? (
        <WorkRow data-transcript="working" icon="brain" label={t('sessions.detail.working')} live />
      ) : null}
    </>
  );
}

function InputBlock({
  block,
  t,
}: {
  block: Extract<TranscriptBlock, { kind: 'input' }>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const item = block.item;
  if (item.source === 'user')
    return (
      <div data-transcript="input" {...stylex.props(styles.input)}>
        {item.text}
      </div>
    );
  return (
    <div data-transcript="system">
      <WorkRow
        icon="inbox"
        label={t('sessions.detail.wake')}
        detail={open ? undefined : item.text.split('\n', 1)[0]}
        expanded={open}
        onToggle={() => setOpen((value) => !value)}
      />
      {open ? <div {...stylex.props(styles.thought)}>{item.text}</div> : null}
    </div>
  );
}

export function SessionDetail({
  actions,
  botSlug,
  sessionId,
  t,
}: {
  actions: BridgeActions;
  botSlug: string;
  sessionId: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const [transcript, setTranscript] = useState<SessionTranscript | undefined>();
  const [progress, setProgress] = useState<SessionProgress | undefined>();
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<'goal' | 'todos' | undefined>();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | undefined>();
  const [revision, setRevision] = useState(0);
  const running = transcript?.running === true;
  const mount = useMountedResource<HTMLDivElement>(
    (node) => {
      const read = actions.sessionTranscript;
      if (read === undefined) return;
      let live = true;
      const load = (): void => {
        void read(botSlug, sessionId).then(
          (next) => {
            if (!live) return;
            const pinned = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
            setTranscript(next);
            setFailed(false);
            if (pinned) requestAnimationFrame(() => (node.scrollTop = node.scrollHeight));
          },
          () => {
            if (live) setFailed(true);
          },
        );
        void actions.sessionProgress?.(botSlug, [sessionId]).then(
          (next) => {
            if (live) setProgress(next[sessionId]);
          },
          () => {},
        );
      };
      load();
      const timer = setInterval(load, running ? RUNNING_REFRESH_MS : IDLE_REFRESH_MS);
      return () => {
        live = false;
        clearInterval(timer);
      };
    },
    [actions, botSlug, sessionId, running, revision],
  );
  const send = async (): Promise<void> => {
    const message = draft.trim();
    const deliver = actions.sendSessionRequest;
    if (message === '' || deliver === undefined) return;
    setSending(true);
    setSendError(undefined);
    try {
      await deliver(botSlug, sessionId, message, running);
      setDraft('');
      setRevision((value) => value + 1);
    } catch (error) {
      setSendError(
        t('sessions.detail.sendFailed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setSending(false);
    }
  };
  const stop = (): void => {
    setSendError(undefined);
    void actions.stopSession(botSlug, sessionId).then(
      () => setRevision((value) => value + 1),
      (error: unknown) =>
        setSendError(
          t('sessions.detail.stopFailed', {
            message: error instanceof Error ? error.message : String(error),
          }),
        ),
    );
  };
  const goal = progress?.goal;
  const todos = progress?.todos;
  const toggle = (key: 'goal' | 'todos') =>
    setOpen((current) => (current === key ? undefined : key));
  return (
    <div data-session-detail={sessionId} {...stylex.props(styles.root)}>
      {goal === undefined && todos === undefined ? null : (
        <div {...stylex.props(styles.chips)}>
          {goal === undefined ? null : (
            <ChipButton
              data-session-chip="goal"
              aria-expanded={open === 'goal'}
              title={t('sessions.progress.goal', {
                objective: goal.objective,
                phase: t(`sessions.goal.${goal.phase}`),
              })}
              icon={<ChannelSidebarIcon name="target" size={12} />}
              label={goal.objective}
              onClick={() => toggle('goal')}
            />
          )}
          {todos === undefined ? null : (
            <ChipButton
              data-session-chip="todos"
              aria-expanded={open === 'todos'}
              title={t('sessions.progress.todos', todoCount(todos))}
              icon={<TodoRing {...todoCount(todos)} />}
              label={`${todoCount(todos).done}/${todoCount(todos).total}`}
              onClick={() => toggle('todos')}
            />
          )}
        </div>
      )}
      {open === 'goal' && goal !== undefined ? (
        <div data-session-panel="goal" {...stylex.props(styles.panel)}>
          <div>{goal.objective}</div>
          <div {...stylex.props(styles.quiet)}>
            {t(`sessions.goal.${goal.phase}`)} ·{' '}
            {t('sessions.detail.rounds', {
              rounds: goal.roundsStarted,
              max: goal.maxGoalRounds,
            })}
          </div>
          {goal.blockedReason === undefined ? null : <div>{goal.blockedReason}</div>}
        </div>
      ) : null}
      {open === 'todos' && todos !== undefined ? (
        <div data-session-panel="todos" {...stylex.props(styles.panel)}>
          {todos.map((todo, index) => (
            <div key={index} {...stylex.props(styles.todo)}>
              <span
                {...stylex.props(
                  todo.status === 'completed'
                    ? styles.ok
                    : todo.status === 'in_progress'
                      ? styles.run
                      : styles.quiet,
                )}
              >
                <ChannelSidebarIcon
                  name={
                    todo.status === 'completed'
                      ? 'check'
                      : todo.status === 'in_progress'
                        ? 'play'
                        : 'square'
                  }
                  size={14}
                />
              </span>
              <span
                {...stylex.props(
                  todo.status === 'completed' && styles.todoDone,
                  todo.status === 'in_progress' && styles.todoActive,
                )}
              >
                {todo.content}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <div ref={mount} data-session-transcript="" {...stylex.props(styles.transcript)}>
        {transcript === undefined ? (
          <div {...stylex.props(styles.quiet)}>
            {failed ? t('sessions.detail.loadFailed') : t('sessions.detail.loading')}
          </div>
        ) : transcript.items.length === 0 ? (
          <div {...stylex.props(styles.quiet)}>{t('sessions.detail.empty')}</div>
        ) : (
          <>
            {transcript.omitted === 0 ? null : (
              <div {...stylex.props(styles.quiet, styles.center)}>
                {t('sessions.detail.omitted', { count: transcript.omitted })}
              </div>
            )}
            {transcriptBlocks(transcript.items, transcript.running).map((block) =>
              block.kind === 'input' ? (
                <InputBlock key={block.key} block={block} t={t} />
              ) : (
                <TurnBlock key={block.key} block={block} t={t} />
              ),
            )}
          </>
        )}
      </div>
      {transcript?.role === 'assignment' && actions.sendSessionRequest !== undefined ? (
        <div data-session-composer="" {...stylex.props(styles.composer)}>
          {sendError === undefined ? null : (
            <div role="alert" {...stylex.props(styles.quiet, styles.error)}>
              {sendError}
            </div>
          )}
          <ChannelComposer
            value={draft}
            placeholder=""
            label={t('sessions.detail.composer')}
            sending={sending}
            t={t}
            onChange={(value) => setDraft(value)}
            onSubmit={send}
            onStop={running ? stop : undefined}
          />
        </div>
      ) : null}
    </div>
  );
}
