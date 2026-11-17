import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react';

import * as stylex from '@stylexjs/stylex';

import {
  DEFAULT_SESSION_COLLAPSE,
  DEFAULT_SESSION_DETAIL_LEVEL,
  DEFAULT_SESSION_FOLDED_REPLIES,
  type SessionCollapseMode,
  type SessionDetailLevel,
  type SessionFoldedReplies,
} from '@botharness/host-client/shared/bot-mode-settings';

import type { BridgeActions } from './actions.js';
import type {
  SessionProgress,
  SessionToolDetail,
  SessionTranscript,
  SessionTranscriptItem,
  SessionTranscriptTrigger,
} from './bridge.js';
import { ChannelComposer } from './channel-composer.js';
import { MessageMarkdown } from './channel-message-body.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { ChipButton } from './ds/chip-button.js';
import { font, status } from './ds/tobs.stylex.js';
import { WorkRow } from './ds/work-row.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { cachedSessionDetail, rememberSessionDetail } from './session-detail-cache.js';
import { SessionJump } from './session-jump.js';
import { DiffStat, ToolDetailView } from './session-tool-detail-view.js';
import { TurnNav } from './session-turn-nav.js';
import { todoCount, TodoRing } from './session-progress-view.js';
import {
  changedFiles,
  clockText,
  detailDefaults,
  durationText,
  elapsedText,
  foldedSegments,
  liveLabel,
  mergeLive,
  previewLines,
  processSummary,
  stepFailed,
  stepTarget,
  toolGroup,
  transcriptBlocks,
  turnFolds,
  usageText,
  type DetailDefaults,
  type ToolGroup,
  type TranscriptBlock,
  type TranscriptStep,
} from './session-transcript-view.js';

const RUNNING_REFRESH_MS = 10_000;
const IDLE_REFRESH_MS = 30_000;
const LIVE_RETRY_MS = 2_000;
const RELOAD_GAP_MS = 300;

export interface SessionDetailPrefs {
  level: SessionDetailLevel;
  collapse: SessionCollapseMode;
  replies: SessionFoldedReplies;
}

export const SessionDetailPrefsContext = createContext<SessionDetailPrefs>({
  level: DEFAULT_SESSION_DETAIL_LEVEL,
  collapse: DEFAULT_SESSION_COLLAPSE,
  replies: DEFAULT_SESSION_FOLDED_REPLIES,
});

const GROUP_ICONS: Record<ToolGroup, string> = {
  read: 'file',
  edit: 'files',
  execute: 'terminal',
  search: 'search',
  fetch: 'globe',
  other: 'puzzle',
};

const TRIGGER_ICONS: Record<SessionTranscriptTrigger, string> = {
  request: 'inbox',
  goal: 'target',
  agent: 'messages-square',
  team: 'users',
  subagent: 'bot',
  github: 'git-branch',
  webhook: 'globe',
  schedule: 'alarm-clock',
  job: 'list-checks',
  plugin: 'plug',
};

const styles = stylex.create({
  root: {
    position: 'relative',
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
    paddingTop: space.x4,
    paddingBottom: `calc(${space.x4} + var(--session-composer-overlay, 0px))`,
    maskImage: `linear-gradient(to bottom, transparent, black ${space.x4}, black calc(100% - var(--session-composer-overlay, 0px)), transparent 100%)`,
    overscrollBehavior: 'contain',
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
  turn: { display: 'flex', flexDirection: 'column', gap: space.x1 },
  nested: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    paddingInlineStart: space.x5,
    maxHeight: '384px',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    maskImage:
      'linear-gradient(to bottom, transparent, black var(--group-fade-top, 0px), black calc(100% - var(--group-fade-bottom, 0px)), transparent)',
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
  preview: {
    display: '-webkit-box',
    WebkitLineClamp: 4,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    paddingInlineStart: space.x6,
    paddingBottom: space.x2,
  },
  meta: {
    flexShrink: 0,
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  add: { color: color.success },
  remove: { color: color.danger },
  files: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    paddingInlineStart: space.x6,
    paddingBottom: space.x2,
  },
  file: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minWidth: 0,
    fontFamily: font.familyMono,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  filePath: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: color.muted,
  },
  stat: { display: 'inline-flex', gap: space.x2, flexShrink: 0 },
  bad: { color: color.danger },
  ok: { color: color.success, display: 'inline-flex' },
  run: { color: color.accent, display: 'inline-flex' },
  composer: { position: 'absolute', insetInline: 0, bottom: 0, zIndex: 1 },
  error: {
    color: color.danger,
    paddingInline: space.x5,
    paddingBottom: space.x2,
  },
});

function stepIcon(step: TranscriptStep): string {
  return step.kind === 'reasoning' ? 'brain' : GROUP_ICONS[toolGroup(step)];
}

function LiveClock({ from, t }: { from: string; t: BotHarnessTranslate }): ReactElement {
  const start = Date.parse(from);
  const render = (): string => (Number.isFinite(start) ? durationText(Date.now() - start, t) : '');
  const mount = useMountedResource<HTMLSpanElement>(
    (node) => {
      const timer = setInterval(() => {
        node.textContent = render();
      }, 1000);
      return () => clearInterval(timer);
    },
    [from, t],
  );
  return (
    <span ref={mount} data-transcript-clock="" {...stylex.props(styles.meta)}>
      {render()}
    </span>
  );
}

interface DetailContext {
  actions: BridgeActions;
  botSlug: string;
  sessionId: string;
  t: BotHarnessTranslate;
  defaults: DetailDefaults;
}

function ToolRow({
  step,
  context,
}: {
  step: Extract<TranscriptStep, { kind: 'tool' }>;
  context: DetailContext;
}): ReactElement {
  const { actions, botSlug, sessionId, t } = context;
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<SessionToolDetail | 'loading' | 'failed' | undefined>();
  const failed = stepFailed(step) || step.status === 'cancelled';
  const status = t(`sessions.detail.tool.${step.status}`);
  const target = stepTarget(step);
  const read = actions.sessionToolDetail;
  const expandable = step.live !== true && step.status !== 'running' && read !== undefined;
  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    if (!next || read === undefined || (detail !== undefined && detail !== 'failed')) return;
    setDetail('loading');
    void read(botSlug, sessionId, step.id).then(
      (value) => setDetail(value),
      () => setDetail('failed'),
    );
  };
  const took =
    step.endedAt === undefined || step.added !== undefined
      ? undefined
      : elapsedText(step.at, step.endedAt, t);
  return (
    <div data-transcript="tool" data-tool-status={step.status}>
      <WorkRow
        title={`${step.tool}${target === undefined ? '' : ` · ${target}`} · ${status}`}
        icon={stepIcon(step)}
        label={step.tool}
        detail={target}
        live={step.status === 'running'}
        danger={failed}
        trailing={
          step.added !== undefined || step.removed !== undefined ? (
            <DiffStat added={step.added} removed={step.removed} />
          ) : took === undefined || context.defaults.preview === false ? null : (
            <span {...stylex.props(styles.meta)}>{took}</span>
          )
        }
        {...(expandable ? { expanded: open, onToggle: toggle } : {})}
      />
      {open ? (
        detail === undefined || detail === 'loading' ? (
          <div {...stylex.props(styles.thought)}>{t('sessions.detail.tool.loading')}</div>
        ) : detail === 'failed' ? (
          <div {...stylex.props(styles.thought, styles.bad)}>
            {t('sessions.detail.tool.loadFailed')}
          </div>
        ) : (
          <ToolDetailView detail={detail} t={t} />
        )
      ) : null}
    </div>
  );
}

function ReasoningRow({
  step,
  context,
}: {
  step: Extract<TranscriptStep, { kind: 'reasoning' }>;
  context: DetailContext;
}): ReactElement {
  const { t } = context;
  const [choice, setOpen] = useState<boolean | undefined>();
  const open = choice ?? context.defaults.reasoningOpen;
  const preview = step.text.split('\n').find((line) => line.trim() !== '') ?? '';
  return (
    <div data-transcript="reasoning">
      <WorkRow
        icon="brain"
        label={
          step.durationMs === undefined
            ? t('sessions.detail.reasoning')
            : t('sessions.detail.thoughtFor', { duration: durationText(step.durationMs, t) })
        }
        detail={open ? undefined : preview}
        live={step.live === true}
        expanded={open}
        onToggle={() => setOpen(!open)}
      />
      {open ? <div {...stylex.props(styles.thought)}>{step.text}</div> : null}
    </div>
  );
}

function StepRow({
  step,
  context,
}: {
  step: TranscriptStep;
  context: DetailContext;
}): ReactElement {
  return step.kind === 'reasoning' ? (
    <ReasoningRow step={step} context={context} />
  ) : (
    <ToolRow step={step} context={context} />
  );
}

function ProcessGroup({
  steps,
  live,
  startedAt,
  context,
}: {
  steps: TranscriptStep[];
  live: boolean;
  startedAt: string;
  context: DetailContext;
}): ReactElement {
  const { t, defaults } = context;
  const [choice, setOpen] = useState<boolean | undefined>();
  const open = choice ?? (live ? defaults.liveGroupOpen : defaults.groupOpen);
  const last = steps.at(-1);
  const first = steps[0];
  const latestTool = [...steps].reverse().find((step) => step.kind === 'tool');
  const nested = useMountedResource<HTMLDivElement>((node) => {
    const sync = (): void => {
      const top = node.scrollTop > 0;
      const bottom = node.scrollHeight - node.scrollTop - node.clientHeight > 1;
      node.style.setProperty('--group-fade-top', top ? space.x5 : '0px');
      node.style.setProperty('--group-fade-bottom', bottom ? space.x5 : '0px');
    };
    sync();
    node.addEventListener('scroll', sync, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(sync);
    observer?.observe(node);
    return () => {
      node.removeEventListener('scroll', sync);
      observer?.disconnect();
    };
  }, []);
  const preview =
    live && defaults.preview && last?.kind === 'reasoning' && !open
      ? previewLines(last.text)
      : undefined;
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
        detail={live && last?.kind === 'tool' ? stepTarget(last) : undefined}
        live={live}
        danger={!live && steps.some(stepFailed)}
        trailing={
          live ? (
            <LiveClock from={startedAt} t={t} />
          ) : first === undefined ? null : (
            <span data-transcript-time="" {...stylex.props(styles.meta)}>
              {clockText(first.at)}
            </span>
          )
        }
        expanded={open}
        onToggle={() => setOpen(!open)}
      />
      {preview === undefined || preview === '' ? null : (
        <div data-transcript="preview" {...stylex.props(styles.preview)}>
          {preview}
        </div>
      )}
      {open ? (
        <div ref={nested} data-transcript-steps="" {...stylex.props(styles.nested)}>
          {steps.map((step, index) => (
            <StepRow
              key={step.kind === 'tool' ? `tool-${step.id}` : `${step.kind}-${step.at}-${index}`}
              step={step}
              context={context}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChangedFiles({
  block,
  t,
}: {
  block: Extract<TranscriptBlock, { kind: 'turn' }>;
  t: BotHarnessTranslate;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const files = changedFiles(block.segments);
  if (block.live || files.length === 0) return null;
  const added = files.reduce((sum, file) => sum + file.added, 0);
  const removed = files.reduce((sum, file) => sum + file.removed, 0);
  return (
    <div data-transcript="changes">
      <WorkRow
        icon="files"
        label={t('sessions.detail.changes', { count: files.length })}
        trailing={<DiffStat added={added} removed={removed} />}
        expanded={open}
        onToggle={() => setOpen(!open)}
      />
      {open ? (
        <div {...stylex.props(styles.files)}>
          {files.map((file) => (
            <div key={file.path} data-changed-file={file.path} {...stylex.props(styles.file)}>
              <span title={file.path} {...stylex.props(styles.filePath)}>
                {file.path}
              </span>
              <DiffStat added={file.added} removed={file.removed} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TurnBlock({
  block,
  context,
}: {
  block: Extract<TranscriptBlock, { kind: 'turn' }>;
  context: DetailContext;
}): ReactElement {
  const { t, defaults } = context;
  const prefs = useContext(SessionDetailPrefsContext);
  const [choice, setOpen] = useState<boolean | undefined>();
  const folds = turnFolds(block, prefs.collapse);
  const foldable = !block.live && block.segments.some((segment) => segment.kind === 'process');
  const open = choice ?? (folds ? defaults.turnOpen : true);
  const end = block.end;
  const state = end?.state ?? 'done';
  const duration = end === undefined ? undefined : elapsedText(block.startedAt, end.at, t);
  const heading =
    duration === undefined
      ? t(`sessions.detail.turn.${state}`)
      : t(`sessions.detail.took.${state}`, { duration });
  const visible = open ? block.segments : foldedSegments(block.segments, prefs.replies);
  const lastSegment = block.segments.at(-1);
  const usage = end?.usage;
  return (
    <div data-transcript-turn={block.number} {...stylex.props(styles.turn)}>
      {foldable || (end !== undefined && state !== 'done') ? (
        <WorkRow
          data-transcript="turn-end"
          data-turn-state={state}
          title={
            usage === undefined
              ? undefined
              : t('sessions.detail.usage.title', {
                  tokens: usage.tokens,
                  output: usage.output,
                })
          }
          icon={state === 'done' ? 'check' : state === 'cancelled' ? 'ban' : 'x'}
          label={heading}
          danger={state === 'failed'}
          trailing={
            usage === undefined ? null : (
              <span data-transcript-usage="" {...stylex.props(styles.meta)}>
                {usageText(usage, t)}
              </span>
            )
          }
          {...(foldable ? { expanded: open, onToggle: () => setOpen(!open) } : {})}
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
            startedAt={block.startedAt}
            context={context}
          />
        ),
      )}
      {block.live && lastSegment?.kind !== 'process' ? (
        <WorkRow
          data-transcript="working"
          icon="brain"
          label={t('sessions.detail.working')}
          live
          trailing={<LiveClock from={block.startedAt} t={t} />}
        />
      ) : null}
      <ChangedFiles block={block} t={t} />
    </div>
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
  const trigger = item.trigger ?? 'request';
  return (
    <div data-transcript="system" data-trigger={trigger}>
      <WorkRow
        icon={TRIGGER_ICONS[trigger]}
        label={t(`sessions.detail.trigger.${trigger}`)}
        detail={open ? undefined : item.text.split('\n', 1)[0]}
        trailing={<span {...stylex.props(styles.meta)}>{clockText(item.at)}</span>}
        expanded={open}
        onToggle={() => setOpen((value) => !value)}
      />
      {open ? <div {...stylex.props(styles.thought)}>{item.text}</div> : null}
    </div>
  );
}

function liveOf(items: readonly SessionTranscriptItem[]): SessionTranscriptItem[] {
  return items.map((item) =>
    item.kind === 'tool' && item.live === true ? { ...item, status: 'running' as const } : item,
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
  const prefs = useContext(SessionDetailPrefsContext);
  const [cached] = useState(() => cachedSessionDetail({ botSlug, sessionId }));
  const [transcript, setTranscript] = useState<SessionTranscript | undefined>(cached?.transcript);
  const [live, setLive] = useState<SessionTranscriptItem[]>([]);
  const [progress, setProgress] = useState<SessionProgress | undefined>(cached?.progress);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<'goal' | 'todos' | undefined>();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | undefined>();
  const [revision, setRevision] = useState(0);
  const [away, setAway] = useState(false);
  const running = transcript?.running === true || live.length > 0;
  const mount = useMountedResource<HTMLDivElement>(
    (node) => {
      const read = actions.sessionTranscript;
      if (read === undefined) return;
      const abort = new AbortController();
      let durableSeq = -1;
      let busy = false;
      let latest: { seq: number; items: SessionTranscriptItem[] } = { seq: 0, items: [] };
      let loading = false;
      let again = false;
      let lastLoad = 0;
      let gap: ReturnType<typeof setTimeout> | undefined;
      const pinned = (): boolean => node.scrollHeight - node.scrollTop - node.clientHeight < 48;
      if (cached?.transcript !== undefined) node.scrollTop = node.scrollHeight;
      const follow = (wasPinned: boolean): void => {
        if (wasPinned) requestAnimationFrame(() => (node.scrollTop = node.scrollHeight));
      };
      const showLive = (): void => {
        if (latest.seq > durableSeq) return;
        const wasPinned = pinned();
        setLive(liveOf(latest.items));
        follow(wasPinned);
      };
      const load = (): void => {
        if (loading) {
          again = true;
          return;
        }
        loading = true;
        lastLoad = Date.now();
        void read(botSlug, sessionId)
          .then(
            (next) => {
              if (abort.signal.aborted) return;
              const wasPinned = pinned();
              durableSeq = next.seq;
              busy = next.running;
              rememberSessionDetail({ botSlug, sessionId }, { transcript: next });
              setTranscript(next);
              setFailed(false);
              if (latest.seq <= durableSeq) setLive(liveOf(latest.items));
              follow(wasPinned);
            },
            () => {
              if (!abort.signal.aborted) setFailed(true);
            },
          )
          .finally(() => {
            loading = false;
            if (again && !abort.signal.aborted) {
              again = false;
              load();
            }
          });
        void actions.sessionProgress?.(botSlug, [sessionId]).then(
          (next) => {
            if (abort.signal.aborted) return;
            const value = next[sessionId];
            rememberSessionDetail({ botSlug, sessionId }, { progress: value });
            setProgress(value);
          },
          () => {},
        );
      };
      const reload = (): void => {
        if (gap !== undefined) return;
        const wait = Math.max(0, lastLoad + RELOAD_GAP_MS - Date.now());
        gap = setTimeout(() => {
          gap = undefined;
          load();
        }, wait);
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const schedule = (): void => {
        timer = setTimeout(
          () => {
            load();
            schedule();
          },
          busy ? RUNNING_REFRESH_MS : IDLE_REFRESH_MS,
        );
      };
      load();
      schedule();
      const follower = actions.sessionLive;
      if (follower !== undefined)
        void (async () => {
          let after: number | undefined;
          while (!abort.signal.aborted) {
            try {
              const next = await follower(botSlug, sessionId, after, abort.signal);
              if (abort.signal.aborted) return;
              after = next.revision;
              latest = { seq: next.seq, items: next.items };
              if (next.seq > durableSeq && durableSeq >= 0) reload();
              showLive();
            } catch {
              if (abort.signal.aborted) return;
              after = undefined;
              await new Promise((resolve) => setTimeout(resolve, LIVE_RETRY_MS));
            }
          }
        })();
      return () => {
        abort.abort();
        if (timer !== undefined) clearTimeout(timer);
        if (gap !== undefined) clearTimeout(gap);
      };
    },
    [actions, botSlug, sessionId, revision],
  );
  const composerMount = useMountedResource<HTMLDivElement>((composer) => {
    const root = composer.parentElement;
    const timeline = root?.querySelector<HTMLElement>('[data-session-transcript]') ?? null;
    if (root == null || timeline === null || typeof ResizeObserver === 'undefined') return;
    let applied: number | undefined;
    const sync = (): void => {
      const overlay = Math.max(
        0,
        Math.round(root.getBoundingClientRect().bottom - composer.getBoundingClientRect().top),
      );
      if (overlay === applied) return;
      applied = overlay;
      const atLatest = timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight <= 2;
      timeline.style.setProperty('--session-composer-overlay', `${overlay}px`);
      if (atLatest) timeline.scrollTop = timeline.scrollHeight;
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(composer);
    observer.observe(root);
    return () => {
      observer.disconnect();
      timeline.style.removeProperty('--session-composer-overlay');
    };
  }, []);
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
  const context: DetailContext = {
    actions,
    botSlug,
    sessionId,
    t,
    defaults: detailDefaults(prefs.level),
  };
  const blocks =
    transcript === undefined ? [] : transcriptBlocks(mergeLive(transcript.items, live), running);
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
      <div
        ref={mount}
        data-session-transcript=""
        onScroll={(event) => {
          const node = event.currentTarget;
          setAway(node.scrollHeight - node.scrollTop - node.clientHeight > 80);
        }}
        {...stylex.props(styles.transcript)}
      >
        {transcript === undefined ? (
          <div {...stylex.props(styles.quiet)}>
            {failed ? t('sessions.detail.loadFailed') : t('sessions.detail.loading')}
          </div>
        ) : blocks.length === 0 ? (
          <div {...stylex.props(styles.quiet)}>{t('sessions.detail.empty')}</div>
        ) : (
          <>
            {transcript.omitted === 0 ? null : (
              <div {...stylex.props(styles.quiet, styles.center)}>
                {t('sessions.detail.omitted', { count: transcript.omitted })}
              </div>
            )}
            {blocks.map((block) =>
              block.kind === 'input' ? (
                <InputBlock key={block.key} block={block} t={t} />
              ) : (
                <TurnBlock key={block.key} block={block} context={context} />
              ),
            )}
          </>
        )}
      </div>
      <TurnNav blocks={blocks} t={t} />
      {transcript?.role === 'assignment' && actions.sendSessionRequest !== undefined ? (
        <div ref={composerMount} data-session-composer="" {...stylex.props(styles.composer)}>
          {away ? <SessionJump floating={false} t={t} /> : null}
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
      ) : away ? (
        <SessionJump floating t={t} />
      ) : null}
    </div>
  );
}
