import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  IconCheckCircleOutlineRegular,
  IconClockOutlineRegular,
  IconInfoOutlineRegular,
  IconShieldOutlineRegular,
  IconWarningTriangleOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { Callout } from './ds/callout.js';
import { FormDialog } from './ds/form-dialog.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

const PATH = '/api/botharness/diagnostic-bundle';
const NARROW = '@media (max-width: 560px)';

const styles = stylex.create({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x4,
    minWidth: 0,
  },
  summary: {
    margin: 0,
    paddingBlock: space.x4,
    paddingInline: space.x5,
    borderRadius: radius.card,
    backgroundColor: color.surface,
    color: color.fg,
  },
  loading: { color: color.muted },
  range: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    fontWeight: text.strong,
  },
  rangeIcon: { display: 'inline-flex', flexShrink: 0, color: color.muted },
  items: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    marginTop: space.x3,
    marginBottom: 0,
    padding: 0,
    listStyle: 'none',
  },
  item: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: space.x4,
    minWidth: 0,
  },
  itemName: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemCount: {
    flexShrink: 0,
    color: color.muted,
    fontVariantNumeric: 'tabular-nums',
  },
  meta: {
    marginTop: space.x3,
    marginBottom: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  scope: { marginTop: space.x1, paddingInlineStart: space.x6 },
  notices: {
    display: 'grid',
    gridTemplateColumns: {
      default: 'repeat(3, minmax(0, 1fr))',
      [NARROW]: 'minmax(0, 1fr)',
    },
    gap: space.x3,
  },
  cardTitle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x3,
  },
  cardIcon: { display: 'inline-flex', flexShrink: 0, color: color.muted },
  warnIcon: { color: color.warning },
  successIcon: { color: color.success },
  errorIcon: { color: color.danger },
  cardBody: { color: color.muted },
  link: {
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.control,
    backgroundColor: 'transparent',
    color: color.accent,
    font: 'inherit',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `2px solid ${color.accent}` },
    outlineOffset: '2px',
  },
});

type CardTone = 'warn' | 'success' | 'error';

const CARD_TONE = {
  warn: ['warning', styles.warnIcon],
  success: ['muted', styles.successIcon],
  error: ['danger', styles.errorIcon],
} as const;

function DiagnosticCard({
  icon,
  title,
  tone,
  role,
  children,
}: {
  icon: ReactNode;
  title: string;
  tone?: CardTone;
  role?: 'status' | 'alert';
  children: ReactNode;
}): ReactElement {
  const [callout, glyph] = tone === undefined ? (['muted', null] as const) : CARD_TONE[tone];
  return (
    <Callout
      tone={callout}
      {...(role === undefined ? {} : { role })}
      title={
        <span {...stylex.props(styles.cardTitle)}>
          <span aria-hidden="true" {...stylex.props(styles.cardIcon, glyph)}>
            {icon}
          </span>
          {title}
        </span>
      }
    >
      <span {...stylex.props(styles.cardBody)}>{children}</span>
    </Callout>
  );
}

interface DiagnosticPreview {
  token: string;
  bytes: number;
  channels: Array<{
    id: string;
    type: string;
    name: string;
    role: string;
    messages: number;
  }>;
  bots: Array<{ slug: string; displayName: string }>;
  sessions: Array<{ id: string; bot: string; role: string; events: number }>;
  admissions: number;
  range: { start: string; end: string };
  redaction: { level: string; hits: Record<string, number> };
  omissions: Array<{ kind: string; detail: string }>;
}

async function result<T>(response: Response): Promise<T> {
  const value = await response.json();
  if (!response.ok) throw new Error(value.error?.code ?? 'operation-failed');
  return value as T;
}

const time = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export interface DiagnosticBundleSelection {
  channelId: string;
  fromMessageId: string;
  toMessageId?: string;
  messageIds: readonly string[];
}

export function DiagnosticBundleDialog({
  selection,
  onClose,
  onDownloaded,
  t,
}: {
  selection: DiagnosticBundleSelection;
  onClose(): void;
  onDownloaded?(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [preview, setPreview] = useState<DiagnosticPreview>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>();
  const [downloaded, setDownloaded] = useState<{
    name: string;
    bytes: number;
  }>();
  const active = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(false);
  const run = async (work: (signal: AbortSignal) => Promise<void>): Promise<void> => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(undefined);
    try {
      await work(controller.signal);
    } catch (failure) {
      if (mounted.current && !controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : 'operation-failed');
    } finally {
      if (mounted.current && active.current === controller) {
        active.current = undefined;
        setBusy(false);
      }
    }
  };
  const prepare = () =>
    run(async (signal) => {
      const value = await result<DiagnosticPreview>(
        await fetch(PATH + '/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(selection),
          signal,
        }),
      );
      if (!signal.aborted) setPreview(value);
    });
  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    void prepare();
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, [selection]);
  const download = () =>
    run(async (signal) => {
      if (!preview) return;
      const response = await fetch(PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: preview.token }),
        signal,
      });
      if (!response.ok) {
        await result(response);
        return;
      }
      const blob = await response.blob();
      if (signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const name =
        response.headers.get('content-disposition')?.match(/filename="([^"]+)"/u)?.[1] ??
        'deepseekbot-diagnostics.zip';
      anchor.download = name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setDownloaded({ name, bytes: blob.size });
      setPreview(undefined);
      onDownloaded?.();
    });
  const hits = preview
    ? Object.values(preview.redaction.hits).reduce((total, count) => total + count, 0)
    : 0;
  const size = (bytes: number) => String(Math.max(1, Math.round(bytes / 1024)));
  const botName = (slug: string) =>
    preview?.bots.find((bot) => bot.slug === slug)?.displayName ?? slug;
  const labels = { close: t('diagnostics.close'), cancel: t('common.cancel') };
  return (
    <FormDialog
      title={t('diagnostics.title')}
      description={t('diagnostics.intro')}
      size="medium"
      scroll
      labels={labels}
      {...(downloaded === undefined
        ? {
            submitLabel: t('diagnostics.download'),
            submitDisabled: busy || preview === undefined,
            onSubmit: () => void download(),
          }
        : { submitLabel: t('diagnostics.done'), onSubmit: onClose, showCancel: false })}
      onCancel={onClose}
    >
      <div ref={mount} data-diagnostic-bundle="" {...stylex.props(styles.body)}>
        {downloaded !== undefined ? (
          <DiagnosticCard
            icon={<IconCheckCircleOutlineRegular size={16} />}
            title={t('diagnostics.complete')}
            tone="success"
            role="status"
          >
            {downloaded.name} · {size(downloaded.bytes)} KB
          </DiagnosticCard>
        ) : preview ? (
          <section data-diagnostic-preview="" {...stylex.props(styles.summary)}>
            <div {...stylex.props(styles.range)}>
              <span aria-hidden="true" {...stylex.props(styles.rangeIcon)}>
                <IconClockOutlineRegular size={16} />
              </span>
              <span>
                {time(preview.range.start)} – {time(preview.range.end)}
              </span>
            </div>
            <p data-diagnostic-scope="" {...stylex.props(styles.meta, styles.scope)}>
              {t(
                selection.messageIds.length > 1
                  ? 'diagnostics.scope.range'
                  : 'diagnostics.scope.from',
                { count: String(selection.messageIds.length) },
              )}
            </p>
            <ul {...stylex.props(styles.items)}>
              {preview.channels.map((channel) => (
                <li key={channel.id} {...stylex.props(styles.item)}>
                  <span {...stylex.props(styles.itemName)}>
                    {channel.role === 'selected'
                      ? channel.name
                      : t('diagnostics.dm', { name: channel.name })}
                  </span>
                  <span {...stylex.props(styles.itemCount)}>
                    {t('diagnostics.messages', {
                      count: String(channel.messages),
                    })}
                  </span>
                </li>
              ))}
              {preview.sessions.map((session) => (
                <li key={session.id} {...stylex.props(styles.item)}>
                  <span {...stylex.props(styles.itemName)}>
                    {t('diagnostics.session', {
                      bot: botName(session.bot),
                      role: t(
                        session.role === 'assignment'
                          ? 'diagnostics.role.assignment'
                          : 'diagnostics.role.orchestrator',
                      ),
                    })}
                  </span>
                  <span {...stylex.props(styles.itemCount)}>
                    {t('diagnostics.events', { count: String(session.events) })}
                  </span>
                </li>
              ))}
            </ul>
            <p {...stylex.props(styles.meta)}>
              {t('diagnostics.counts', {
                admissions: String(preview.admissions),
                kb: size(preview.bytes),
              })}
              {preview.omissions.length > 0
                ? ' · ' +
                  t('diagnostics.omitted', {
                    count: String(preview.omissions.length),
                  })
                : ''}
            </p>
          </section>
        ) : error === undefined ? (
          <p role="status" data-loading="" {...stylex.props(styles.summary, styles.loading)}>
            {t('diagnostics.preparing')}
          </p>
        ) : null}
        {error === undefined ? null : (
          <DiagnosticCard
            icon={<IconWarningTriangleOutlineRegular size={16} />}
            title={t('diagnostics.failed', { code: error })}
            tone="error"
            role="alert"
          >
            <button type="button" onClick={() => void prepare()} {...stylex.props(styles.link)}>
              {t('diagnostics.retry')}
            </button>
          </DiagnosticCard>
        )}
        {downloaded !== undefined ? null : (
          <div {...stylex.props(styles.notices)}>
            <DiagnosticCard
              icon={<IconWarningTriangleOutlineRegular size={16} />}
              title={t('diagnostics.notice.content.title')}
              tone="warn"
            >
              {t('diagnostics.notice.content.body')}
            </DiagnosticCard>
            <DiagnosticCard
              icon={<IconShieldOutlineRegular size={16} />}
              title={t('diagnostics.notice.redacted.title')}
            >
              {preview
                ? t('diagnostics.notice.redacted.count', { hits: String(hits) })
                : t('diagnostics.notice.redacted.body')}
            </DiagnosticCard>
            <DiagnosticCard
              icon={<IconInfoOutlineRegular size={16} />}
              title={t('diagnostics.notice.excluded.title')}
            >
              {t('diagnostics.notice.excluded.body')}
            </DiagnosticCard>
          </div>
        )}
      </div>
    </FormDialog>
  );
}
