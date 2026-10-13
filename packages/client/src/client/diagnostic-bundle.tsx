import { useRef, useState, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

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

export function DiagnosticBundleDialog({
  channelId,
  messageId,
  onClose,
  t,
}: {
  channelId: string;
  messageId: string;
  onClose(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [preview, setPreview] = useState<DiagnosticPreview>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>();
  const [bytes, setBytes] = useState<number>();
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
          body: JSON.stringify({ channelId, fromMessageId: messageId }),
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
  }, [channelId, messageId]);
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
      anchor.download =
        response.headers.get('content-disposition')?.match(/filename="([^"]+)"/u)?.[1] ??
        'deepseekbot-diagnostics.zip';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setBytes(blob.size);
      setPreview(undefined);
    });
  const hits = preview
    ? Object.values(preview.redaction.hits).reduce((total, count) => total + count, 0)
    : 0;
  return (
    <Modal
      open
      onClose={onClose}
      title={t('diagnostics.title')}
      closeLabel={t('diagnostics.close')}
      className="bh-profile-backup-dialog"
    >
      <div ref={mount} className="bh-profile-backup" data-diagnostic-bundle>
        <p>{t('diagnostics.intro')}</p>
        <p>{t('diagnostics.redaction')}</p>
        <p>{t('diagnostics.excluded')}</p>
        {preview ? (
          <section aria-label={t('diagnostics.preview')} data-diagnostic-preview>
            <h3>{t('diagnostics.preview')}</h3>
            <p>
              {t('diagnostics.range', {
                start: time(preview.range.start),
                end: time(preview.range.end),
              })}
            </p>
            <ul>
              {preview.channels.map((channel) => (
                <li key={channel.id}>
                  {t(channel.role === 'selected' ? 'diagnostics.channel' : 'diagnostics.dm', {
                    name: channel.name,
                    count: String(channel.messages),
                  })}
                </li>
              ))}
              {preview.sessions.map((session) => (
                <li key={session.id}>
                  {t('diagnostics.session', {
                    bot:
                      preview.bots.find((bot) => bot.slug === session.bot)?.displayName ??
                      session.bot,
                    role: t(
                      session.role === 'assignment'
                        ? 'diagnostics.role.assignment'
                        : 'diagnostics.role.orchestrator',
                    ),
                    count: String(session.events),
                  })}
                </li>
              ))}
            </ul>
            <p>
              {t('diagnostics.counts', {
                admissions: String(preview.admissions),
                hits: String(hits),
                kb: String(Math.max(1, Math.round(preview.bytes / 1024))),
              })}
            </p>
            {preview.omissions.length > 0 ? (
              <p>{t('diagnostics.omitted', { count: String(preview.omissions.length) })}</p>
            ) : null}
            <div className="bh-profile-backup-actions">
              <Button disabled={busy} onClick={() => void download()}>
                {t('diagnostics.download')}
              </Button>
            </div>
          </section>
        ) : busy ? (
          <p role="status">{t('diagnostics.preparing')}</p>
        ) : null}
        {bytes === undefined ? null : (
          <p role="status">
            {t('diagnostics.complete', { kb: String(Math.max(1, Math.round(bytes / 1024))) })}
          </p>
        )}
        {error === undefined ? null : (
          <div className="bh-profile-backup-actions">
            <p role="alert">{t('diagnostics.failed', { code: error })}</p>
            <Button disabled={busy} onClick={() => void prepare()}>
              {t('diagnostics.retry')}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
