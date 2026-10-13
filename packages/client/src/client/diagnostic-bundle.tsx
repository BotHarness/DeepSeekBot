import { useRef, useState, type ReactElement } from 'react';
import {
  Button,
  IconCheckCircleOutlineRegular,
  IconClockOutlineRegular,
  IconInfoOutlineRegular,
  IconShieldOutlineRegular,
  IconWarningTriangleOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { useMountedResource } from './mounted-resource.js';

const PATH = '/api/botharness/diagnostic-bundle';

interface DiagnosticPreview {
  token: string;
  bytes: number;
  channels: Array<{ id: string; type: string; name: string; role: string; messages: number }>;
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
  const [downloaded, setDownloaded] = useState<{ name: string; bytes: number }>();
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
  return (
    <Modal
      open
      onClose={onClose}
      title={t('diagnostics.title')}
      description={t('diagnostics.intro')}
      closeLabel={t('diagnostics.close')}
      className="bh-diagnostic-dialog"
      footer={
        downloaded === undefined ? (
          <>
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={busy || preview === undefined}
              onClick={() => void download()}
            >
              {t('diagnostics.download')}
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={onClose}>
            {t('diagnostics.done')}
          </Button>
        )
      }
    >
      <div ref={mount} className="bh-diagnostic" data-diagnostic-bundle>
        {downloaded !== undefined ? (
          <div className="bh-diagnostic-card" data-tone="success" role="status">
            <IconCheckCircleOutlineRegular size={16} />
            <div>
              <strong>{t('diagnostics.complete')}</strong>
              <p>
                {downloaded.name} · {size(downloaded.bytes)} KB
              </p>
            </div>
          </div>
        ) : preview ? (
          <section className="bh-diagnostic-summary" data-diagnostic-preview>
            <div className="bh-diagnostic-range">
              <IconClockOutlineRegular size={16} />
              <span>
                {time(preview.range.start)} – {time(preview.range.end)}
              </span>
            </div>
            <p className="bh-diagnostic-meta" data-diagnostic-scope>
              {t(
                selection.messageIds.length > 1
                  ? 'diagnostics.scope.range'
                  : 'diagnostics.scope.from',
                { count: String(selection.messageIds.length) },
              )}
            </p>
            <ul className="bh-diagnostic-items">
              {preview.channels.map((channel) => (
                <li key={channel.id}>
                  <span>
                    {channel.role === 'selected'
                      ? channel.name
                      : t('diagnostics.dm', { name: channel.name })}
                  </span>
                  <span>{t('diagnostics.messages', { count: String(channel.messages) })}</span>
                </li>
              ))}
              {preview.sessions.map((session) => (
                <li key={session.id}>
                  <span>
                    {t('diagnostics.session', {
                      bot: botName(session.bot),
                      role: t(
                        session.role === 'assignment'
                          ? 'diagnostics.role.assignment'
                          : 'diagnostics.role.orchestrator',
                      ),
                    })}
                  </span>
                  <span>{t('diagnostics.events', { count: String(session.events) })}</span>
                </li>
              ))}
            </ul>
            <p className="bh-diagnostic-meta">
              {t('diagnostics.counts', {
                admissions: String(preview.admissions),
                kb: size(preview.bytes),
              })}
              {preview.omissions.length > 0
                ? ' · ' + t('diagnostics.omitted', { count: String(preview.omissions.length) })
                : ''}
            </p>
          </section>
        ) : error === undefined ? (
          <p className="bh-diagnostic-summary" role="status" data-loading>
            {t('diagnostics.preparing')}
          </p>
        ) : null}
        {error === undefined ? null : (
          <div className="bh-diagnostic-card" data-tone="error" role="alert">
            <IconWarningTriangleOutlineRegular size={16} />
            <div>
              <strong>{t('diagnostics.failed', { code: error })}</strong>
              <p>
                <button type="button" className="bh-diagnostic-link" onClick={() => void prepare()}>
                  {t('diagnostics.retry')}
                </button>
              </p>
            </div>
          </div>
        )}
        {downloaded !== undefined ? null : (
          <div className="bh-diagnostic-notices">
            <div className="bh-diagnostic-card" data-tone="warn">
              <IconWarningTriangleOutlineRegular size={16} />
              <div>
                <strong>{t('diagnostics.notice.content.title')}</strong>
                <p>{t('diagnostics.notice.content.body')}</p>
              </div>
            </div>
            <div className="bh-diagnostic-card">
              <IconShieldOutlineRegular size={16} />
              <div>
                <strong>{t('diagnostics.notice.redacted.title')}</strong>
                <p>
                  {preview
                    ? t('diagnostics.notice.redacted.count', { hits: String(hits) })
                    : t('diagnostics.notice.redacted.body')}
                </p>
              </div>
            </div>
            <div className="bh-diagnostic-card">
              <IconInfoOutlineRegular size={16} />
              <div>
                <strong>{t('diagnostics.notice.excluded.title')}</strong>
                <p>{t('diagnostics.notice.excluded.body')}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
