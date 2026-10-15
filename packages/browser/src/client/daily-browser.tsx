import { useCallback, useRef, useState, type ReactElement } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { SidebarCardList, SidebarCardRow } from '../../../client/src/client/sidebar-card.js';
import type { DailyView } from '../daily.js';
import type { BrowserTranslate } from './locale.js';

export function DailyBrowserControl({
  slug,
  view,
  enabled,
  paused,
  t,
  refresh,
}: {
  readonly slug: string | undefined;
  readonly view: DailyView | null;
  readonly enabled: boolean;
  readonly paused: boolean;
  readonly t: BrowserTranslate;
  readonly refresh: () => void;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const mounted = useRef(false);
  const resource = useCallback((node: HTMLDivElement | null): void => {
    mounted.current = node !== null;
  }, []);
  const invoke = (action: 'connect' | 'grant' | 'return' | 'pause'): void => {
    if (busy || slug === undefined) return;
    setBusy(true);
    setError(undefined);
    void fetch(action === 'pause' ? './api/browser/takeover' : `./api/browser/daily/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, ...(action === 'pause' ? { active: !paused } : {}) }),
    })
      .then(async (response) => {
        const body = (await response.json()) as { ok: boolean; error?: string };
        if (!response.ok || !body.ok) throw new Error(body.error ?? t('entry.error'));
      })
      .catch((cause: unknown) => {
        if (mounted.current) setError(cause instanceof Error ? cause.message : t('entry.error'));
      })
      .finally(() => {
        if (mounted.current) {
          setBusy(false);
          refresh();
        }
      });
  };
  return (
    <div ref={resource} className="bh-browser-body bh-browser-borrow">
      <SidebarCardList className="bh-browser-cards">
        <SidebarCardRow
          icon="globe"
          title={t('settings.daily-control')}
          chips={
            <>
              {view === null || view.state === 'error' ? (
                <Tag tone="neutral">{t('entry.chip.disconnected')}</Tag>
              ) : view.state === 'connecting' ? (
                <Tag tone="info">{t('entry.chip.connecting')}</Tag>
              ) : view.state === 'confirm' ? (
                <Tag tone="warning">{t('entry.chip.confirm')}</Tag>
              ) : (
                <Tag tone="success">{t('entry.chip.controlled')}</Tag>
              )}
              {paused && view?.state === 'controlled' ? (
                <Tag tone="warning">{t('entry.chip.paused')}</Tag>
              ) : null}
            </>
          }
          meta={
            view === null || view.state === 'error' ? undefined : (
              <span role="status">
                {t(
                  view.state === 'connecting'
                    ? 'entry.daily.select'
                    : view.state === 'confirm'
                      ? 'entry.daily.confirm'
                      : 'entry.daily.controlled',
                )}
              </span>
            )
          }
          detail={
            <div className="bh-browser-card-detail">
              {view === null || view.state === 'error' || view.url === '' ? null : (
                <>
                  <strong className="bh-browser-borrow-title">{view.title || view.url}</strong>
                  <span className="bh-browser-borrow-url">{view.url}</span>
                </>
              )}
              <a
                className="bh-browser-daily-install"
                href="https://chromewebstore.google.com/detail/playwright-extension/mmlmfjhmonkocbjadbfplnigmagldckm"
                target="_blank"
                rel="noreferrer"
              >
                {t('entry.daily.install')}
              </a>
              <div className="bh-browser-actions">
                {view === null || view.state === 'error' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!enabled || busy}
                    onClick={() => invoke('connect')}
                  >
                    {t('entry.daily.connect')}
                  </Button>
                ) : (
                  <>
                    {view.state === 'confirm' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!enabled || busy}
                        onClick={() => invoke('grant')}
                      >
                        {t('entry.daily.allow')}
                      </Button>
                    ) : null}
                    {view.state === 'controlled' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => invoke('pause')}
                      >
                        {t(paused ? 'entry.view.resume' : 'entry.view.pause')}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => invoke('return')}
                    >
                      {t(
                        view.state === 'connecting' ? 'entry.borrow.cancel' : 'entry.borrow.return',
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>
          }
        />
      </SidebarCardList>
      {view?.error === undefined ? null : (
        <div role="alert" className="bh-browser-error">
          {view.error}
        </div>
      )}
      {error === undefined ? null : (
        <div role="alert" className="bh-browser-error">
          {error}
        </div>
      )}
    </div>
  );
}
