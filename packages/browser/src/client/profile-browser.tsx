import { useCallback, useRef, useState, type ReactElement } from 'react';
import { Button, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { SidebarCardList, SidebarCardRow } from '../../../client/src/client/sidebar-card.js';
import type { BrowserTranslate } from './locale.js';

import type { ProfileView } from '../profile-control.js';

export function ProfileBrowserControl({
  slug,
  view,
  paused,
  enabled,
  t,
  refresh,
}: {
  readonly slug: string | undefined;
  readonly view: ProfileView | undefined;
  readonly paused: boolean;
  readonly enabled: boolean;
  readonly t: BrowserTranslate;
  readonly refresh: () => void;
}): ReactElement {
  const [pair, setPair] = useState<{ code: string; expiresAt: number } | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const active = useRef(false);
  const sequence = useRef(0);
  const resource = useCallback((node: HTMLDivElement | null): void => {
    active.current = node !== null;
    if (node === null) sequence.current += 1;
  }, []);
  const invoke = (action: 'pair' | 'forget' | 'pause'): void => {
    if (slug === undefined || busy) return;
    const request = ++sequence.current;
    setBusy(true);
    setError(undefined);
    setPair(undefined);
    void fetch(action === 'pause' ? './api/browser/takeover' : `./api/browser/profile/${action}`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, ...(action === 'pause' ? { active: !paused } : {}) }),
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          ok: boolean;
          error?: string;
          code?: string;
          expiresAt?: number;
        };
        if (!response.ok || !body.ok) throw new Error(body.error ?? t('entry.error'));
        if (!active.current || sequence.current !== request) return;
        if (action === 'pair' && body.code !== undefined && body.expiresAt !== undefined)
          setPair({ code: body.code, expiresAt: body.expiresAt });
      })
      .catch((cause: unknown) => {
        if (active.current && sequence.current === request)
          setError(cause instanceof Error ? cause.message : t('entry.error'));
      })
      .finally(() => {
        if (active.current && sequence.current === request) {
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
          title={t('settings.profile-control')}
          chips={
            <>
              {view?.paired !== true ? (
                <Tag tone="neutral">{t('entry.chip.unpaired')}</Tag>
              ) : view.connected ? (
                <Tag tone="success">{t('entry.chip.connected')}</Tag>
              ) : (
                <Tag tone="warning">{t('entry.chip.offline')}</Tag>
              )}
              {paused ? <Tag tone="warning">{t('entry.chip.paused')}</Tag> : null}
            </>
          }
          meta={
            <>
              <span>{t('entry.profile.scope')}</span>
              <span role="status">
                {view?.paired
                  ? t(view.connected ? 'entry.profile.connected' : 'entry.profile.disconnected')
                  : t('entry.view.noTabs')}
                {view?.connected ? ` · ${view.tabs}` : ''}
              </span>
            </>
          }
          detail={
            <div className="bh-browser-card-detail">
              <a
                className="bh-browser-daily-install"
                href="https://github.com/BotHarness/BotHarness/blob/main/docs/daily-browser.md#chrome-profile-control"
                target="_blank"
                rel="noreferrer"
              >
                {t('entry.profile.install')}
              </a>
              <div className="bh-browser-actions">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => invoke(view?.paired ? 'forget' : 'pair')}
                >
                  {t(view?.paired ? 'entry.profile.forget' : 'entry.profile.pair')}
                </Button>
                {view?.connected ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!enabled || busy}
                    onClick={() => invoke('pause')}
                  >
                    {t(paused ? 'entry.view.resume' : 'entry.view.pause')}
                  </Button>
                ) : null}
              </div>
              {view?.paired || pair === undefined ? null : (
                <>
                  <span>{t('entry.profile.instructions')}</span>
                  <Input aria-label={t('entry.borrow.code')} value={pair.code} readOnly />
                  <span>{location.origin}</span>
                </>
              )}
            </div>
          }
        />
      </SidebarCardList>
      {error === undefined ? null : (
        <div role="alert" className="bh-browser-error">
          {error}
        </div>
      )}
    </div>
  );
}
