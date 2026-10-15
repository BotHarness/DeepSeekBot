import { useCallback, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { Note } from '../../../client/src/client/ds/note.js';
import { space } from '../../../client/src/client/ds/tokens.stylex.js';
import {
  MissingPackages,
  ProgressLine,
  formatProgressMiB,
} from '../../../client/src/client/missing-packages.js';
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

interface LocalMissing {
  packages?: string[];
  command?: string;
  install?: 'root' | 'sudo' | 'none';
}

interface LocalStatus {
  target?: string;
  probe?: { available?: boolean; detail?: string };
  status?: {
    state?: string;
    phase?: string;
    detail?: string;
    progress?: { percent?: number; downloadedBytes?: number; totalBytes?: number };
    missing?: LocalMissing;
  };
  install?: { state?: string; packages?: string[]; percent?: number; text?: string };
}

export function LocalComputerStatus({ t }: { t: ComputerTranslate }): ReactElement {
  const [payload, setPayload] = useState<LocalStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('./api/computer/status', {
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
  const installing = payload?.install?.state === 'installing';
  const preparing = busy || installing || payload?.status?.phase === 'starting';
  const missing = payload?.status?.missing;
  const failure =
    error ??
    (payload?.install?.state === 'failed' ? payload.install.text : undefined) ??
    (missing === undefined ? payload?.status?.detail : undefined) ??
    payload?.probe?.detail;
  const post = (path: string, body: Record<string, unknown>): void => {
    setBusy(true);
    setError(undefined);
    void fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        await refresh();
      })
      .catch((error: unknown) => setError(String(error)))
      .finally(() => setBusy(false));
  };
  const check = (): void => post('./api/computer/start', { authorize: true, target: 'local' });
  const install = (): void => post('./api/computer/install-packages', { authorize: true });
  const granted = payload?.status?.state === 'running';
  const download = payload?.status?.progress;
  const installLabel = installing
    ? {
        percent: payload?.install?.percent ?? 0,
        label: t('local.installing', {
          packages: (payload?.install?.packages ?? []).join(', '),
          percent: String(payload?.install?.percent ?? 0),
        }),
      }
    : undefined;
  const checkButton = (
    <Button
      size="sm"
      variant="outline"
      disabled={preparing || payload?.probe?.available === false}
      onClick={check}
    >
      {t(preparing ? 'local.checking' : 'local.check')}
    </Button>
  );
  const packages = installing ? (payload?.install?.packages ?? []) : (missing?.packages ?? []);
  const body =
    packages.length > 0 && (missing !== undefined || installing) ? (
      <MissingPackages
        command={missing?.command ?? ''}
        access={missing?.install ?? 'root'}
        installing={installLabel}
        busy={busy}
        onInstall={install}
        labels={{
          missing: t('local.missing', { packages: packages.join(', ') }),
          manual: t('local.missing.manual'),
          install: t('local.install'),
          copy: t('local.copy'),
          copied: t('local.copied'),
        }}
      >
        {checkButton}
      </MissingPackages>
    ) : (
      <>
        {payload?.status?.phase === 'starting' && (download?.totalBytes ?? 0) > 0 ? (
          <ProgressLine
            percent={download?.percent ?? 0}
            label={t('local.downloading', {
              percent: String(download?.percent ?? 0),
              downloaded: formatProgressMiB(download?.downloadedBytes ?? 0),
              total: formatProgressMiB(download?.totalBytes ?? 0),
            })}
          />
        ) : null}
        {checkButton}
      </>
    );
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
            ) : missing !== undefined ? (
              <Tag tone="warning">{t('local.chip.missing')}</Tag>
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
              {body}
            </div>
          }
        />
      </SidebarCardList>
    </div>
  );
}
