import { useCallback, useRef, useState, type ReactElement } from 'react';
import { Button, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { SidebarCardList, SidebarCardRow } from '../../../client/src/client/sidebar-card.js';
import type { BrowserTranslate } from './locale.js';

export interface BorrowedTabView {
  readonly title: string;
  readonly url: string;
  readonly expiresAt: number;
}

export function BorrowedBrowser({
  slug,
  tab,
  enabled,
  t,
  refresh,
}: {
  readonly slug: string | undefined;
  readonly tab: BorrowedTabView | null | undefined;
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
  const invoke = (action: 'pair' | 'return'): void => {
    if (slug === undefined || busy) return;
    const request = ++sequence.current;
    setBusy(true);
    setError(undefined);
    setPair(undefined);
    void fetch(`./api/browser/borrow/${action}`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug }),
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
          title={t('settings.extension')}
          chips={
            tab == null ? (
              <Tag tone="neutral">{t('entry.chip.notShared')}</Tag>
            ) : (
              <Tag tone="info">{t('entry.chip.readOnly')}</Tag>
            )
          }
          meta={<span>{t(tab == null ? 'entry.borrow.none' : 'entry.borrow.readOnly')}</span>}
          detail={
            <div className="bh-browser-card-detail">
              {tab == null ? null : (
                <>
                  <strong className="bh-browser-borrow-title">{tab.title || tab.url}</strong>
                  <span className="bh-browser-borrow-url">{tab.url}</span>
                </>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={!enabled || busy}
                onClick={() => invoke(tab == null ? 'pair' : 'return')}
              >
                {t(tab == null ? 'entry.borrow.pair' : 'entry.borrow.return')}
              </Button>
              {tab != null || pair === undefined ? null : (
                <>
                  <span>{t('entry.borrow.instructions')}</span>
                  <Input aria-label={t('entry.borrow.code')} value={pair.code} readOnly />
                  <span>{location.origin}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      sequence.current += 1;
                      setPair(undefined);
                      invoke('return');
                    }}
                  >
                    {t('entry.borrow.cancel')}
                  </Button>
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
