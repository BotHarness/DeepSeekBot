import { useState, type ReactElement } from 'react';

import * as stylex from '@stylexjs/stylex';

import type { BridgeActions } from './actions.js';
import type { SessionProgress, SessionTranscript, SessionTranscriptItem } from './bridge.js';
import { ChannelComposer } from './channel-composer.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { ChipButton } from './ds/chip-button.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { todoCount, TodoRing } from './session-progress-view.js';

const RUNNING_REFRESH_MS = 4_000;
const IDLE_REFRESH_MS = 30_000;

const styles = stylex.create({
  root: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
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
    gap: space.x3,
    paddingInline: space.x5,
    paddingBlock: space.x4,
  },
  quiet: { color: color.subtle, fontSize: text.metaSize, lineHeight: text.metaLine },
  input: {
    alignSelf: 'flex-end',
    maxWidth: '88%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: space.x1,
    marginTop: space.x2,
  },
  bubble: {
    paddingBlock: space.x3,
    paddingInline: space.x4,
    borderRadius: radius.lg,
    backgroundColor: color.accentTint,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  system: {
    alignSelf: 'stretch',
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    whiteSpace: 'pre-wrap',
  },
  reply: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  reasoning: { color: color.subtle, fontSize: text.metaSize, lineHeight: text.metaLine },
  reasoningBody: { whiteSpace: 'pre-wrap', marginTop: space.x2 },
  tool: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    paddingBlock: space.x2,
    paddingInline: space.x4,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    minWidth: 0,
  },
  toolName: { fontWeight: text.strong, color: color.muted, flexShrink: 0 },
  toolDetail: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: color.subtle,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  ok: { color: color.success, display: 'inline-flex' },
  bad: { color: color.danger, display: 'inline-flex' },
  run: { color: color.accent, display: 'inline-flex' },
  end: { textAlign: 'center' },
  composer: { flexShrink: 0, paddingTop: space.x3 },
  note: { paddingInline: space.x5, paddingBottom: space.x3 },
  error: { color: color.danger, paddingInline: space.x5, paddingBottom: space.x2 },
});

function ToolStatus({
  status,
  t,
}: {
  status: Extract<SessionTranscriptItem, { kind: 'tool' }>['status'];
  t: BotHarnessTranslate;
}): ReactElement {
  const label = t(`sessions.detail.tool.${status}`);
  const [icon, tone] =
    status === 'done'
      ? (['check', styles.ok] as const)
      : status === 'running'
        ? (['play', styles.run] as const)
        : (['ban', styles.bad] as const);
  return (
    <span role="img" aria-label={label} title={label} {...stylex.props(tone)}>
      <ChannelSidebarIcon name={icon} size={14} />
    </span>
  );
}

function TranscriptItem({
  item,
  t,
}: {
  item: SessionTranscriptItem;
  t: BotHarnessTranslate;
}): ReactElement {
  switch (item.kind) {
    case 'input':
      return item.source === 'system' ? (
        <div data-transcript="system" {...stylex.props(styles.system)}>
          {t('sessions.detail.wake')} · {item.text}
        </div>
      ) : (
        <div data-transcript="input" {...stylex.props(styles.input)}>
          <span {...stylex.props(styles.quiet)}>
            {t('sessions.detail.instruction', { turn: item.turn })}
          </span>
          <div {...stylex.props(styles.bubble)}>{item.text}</div>
        </div>
      );
    case 'reasoning':
      return (
        <details data-transcript="reasoning" {...stylex.props(styles.reasoning)}>
          <summary>{t('sessions.detail.reasoning')}</summary>
          <div {...stylex.props(styles.reasoningBody)}>{item.text}</div>
        </details>
      );
    case 'reply':
      return (
        <div data-transcript="reply" {...stylex.props(styles.reply)}>
          {item.text}
        </div>
      );
    case 'tool':
      return (
        <div data-transcript="tool" data-tool-status={item.status} {...stylex.props(styles.tool)}>
          <ToolStatus status={item.status} t={t} />
          <span {...stylex.props(styles.toolName)}>{item.tool}</span>
          {item.detail === undefined ? null : (
            <span title={item.detail} {...stylex.props(styles.toolDetail)}>
              {item.detail}
            </span>
          )}
        </div>
      );
    case 'turn-end':
      return (
        <div data-transcript="turn-end" {...stylex.props(styles.quiet, styles.end)}>
          {t(`sessions.detail.turn.${item.state}`)}
        </div>
      );
  }
}

export function SessionDetail({
  actions,
  botSlug,
  botName,
  sessionId,
  t,
}: {
  actions: BridgeActions;
  botSlug: string;
  botName: string;
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
      setSendError(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
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
            {t('sessions.detail.rounds', { rounds: goal.roundsStarted, max: goal.maxGoalRounds })}
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
              <div {...stylex.props(styles.quiet, styles.end)}>
                {t('sessions.detail.omitted', { count: transcript.omitted })}
              </div>
            )}
            {transcript.items.map((item, index) => (
              <TranscriptItem key={`${item.kind}-${item.at}-${index}`} item={item} t={t} />
            ))}
          </>
        )}
      </div>
      {transcript?.role === 'assignment' && actions.sendSessionRequest !== undefined ? (
        <div data-session-composer="" {...stylex.props(styles.composer)}>
          {sendError === undefined ? null : (
            <div role="alert" {...stylex.props(styles.quiet, styles.error)}>
              {t('sessions.detail.sendFailed', { message: sendError })}
            </div>
          )}
          <ChannelComposer
            value={draft}
            placeholder={t('sessions.detail.placeholder')}
            sending={sending}
            t={t}
            onChange={(value) => setDraft(value)}
            onSubmit={send}
          />
          <div {...stylex.props(styles.quiet, styles.note)}>
            {t('sessions.detail.note', { bot: botName })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
