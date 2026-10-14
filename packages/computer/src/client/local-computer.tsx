import { useCallback, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { Note } from '../../../client/src/client/ds/note.js';
import { space } from '../../../client/src/client/ds/tokens.stylex.js';
import { SidebarCardList, SidebarCardRow } from '../../../client/src/client/sidebar-card.js';
import type { ComputerTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

const styles = stylex.create({
  detail: {
    display: 'grid',
    gap: space.x3,
    justifyItems: 'start',
  },
});

interface LocalStatus {
  target?: string;
  probe?: { available?: boolean; detail?: string };
  status?: { state?: string; phase?: string; detail?: string };
}

export function LocalComputerStatus({ t }: { t: ComputerTranslate }): ReactElement {
  const [payload, setPayload] = useState<LocalStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/computer/status', {
      credentials: 'same-origin',
      ...(signal === undefined ? {} : { signal }),
    });
    if (!response.ok) throw new Error(`Computer status: HTTP ${String(response.status)}`);
    const next = (await response.json()) as LocalStatus;
    if (!signal?.aborted) {
      setPayload(next);
      setError(undefined);
    }
  }, []);
  const resource = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    let pending = false;
    const poll = async (): Promise<void> => {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        await refresh(AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]));
      } catch (error) {
        if (!controller.signal.aborted) setError(String(error));
      } finally {
        pending = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [refresh]);
  const preparing = busy || payload?.status?.phase === 'starting';
  const failure = error ?? payload?.status?.detail ?? payload?.probe?.detail;
  const check = (): void => {
    setBusy(true);
    setError(undefined);
    void fetch('/api/computer/start', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ authorize: true, target: 'local' }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        await refresh();
      })
      .catch((error: unknown) => setError(String(error)))
      .finally(() => setBusy(false));
  };
  const granted = payload?.status?.state === 'running';
  return (
    <div ref={resource}>
      <SidebarCardList className="bh-computer-cards">
        <SidebarCardRow
          icon="monitor"
          title={t('local.title')}
          chips={
            granted ? (
              <Tag tone="success">{t('local.chip.granted')}</Tag>
            ) : preparing ? (
              <Tag tone="info">{t('local.chip.checking')}</Tag>
            ) : failure === undefined ? (
              <Tag tone="neutral">{t('local.chip.unchecked')}</Tag>
            ) : (
              <Tag tone="danger">{t('local.chip.failed')}</Tag>
            )
          }
          meta={t(granted ? 'local.granted' : 'local.description')}
          detail={
            <div {...stylex.props(styles.detail)}>
              {failure === undefined ? null : <Note tone="danger">{failure}</Note>}
              <Button
                size="sm"
                variant="outline"
                disabled={preparing || payload?.probe?.available === false}
                onClick={check}
              >
                {t(preparing ? 'local.checking' : 'local.check')}
              </Button>
            </div>
          }
        />
      </SidebarCardList>
    </div>
  );
}
