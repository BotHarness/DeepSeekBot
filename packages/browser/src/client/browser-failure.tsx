import { useCallback, useRef, useState, type ReactElement } from 'react';

import {
  isBrowserFailureKind,
  type BrowserFailureKind,
  type BrowserInstallProgress,
} from '../failure-kinds.js';
import {
  MissingPackages,
  type MissingPackagesAccess,
} from '../../../client/src/client/missing-packages.js';
import type { BrowserTranslate } from './locale.js';

export interface BrowserFailure {
  readonly message: string;
  readonly code?: string;
  readonly detail?: string;
  readonly packages?: readonly string[];
}

export class BrowserApiError extends Error {
  readonly code?: string;
  readonly detail?: string;
  readonly packages?: readonly string[];

  constructor(message: string, code?: string, detail?: string, packages?: readonly string[]) {
    super(message);
    this.name = 'BrowserApiError';
    if (code !== undefined) this.code = code;
    if (detail !== undefined) this.detail = detail;
    if (packages !== undefined) this.packages = packages;
  }
}

export function readFailure(cause: unknown): BrowserFailure {
  if (cause instanceof BrowserApiError)
    return {
      message: cause.message,
      ...(cause.code === undefined ? {} : { code: cause.code }),
      ...(cause.detail === undefined ? {} : { detail: cause.detail }),
      ...(cause.packages === undefined ? {} : { packages: cause.packages }),
    };
  return { message: cause instanceof Error ? cause.message : String(cause) };
}

interface InstallState {
  readonly access?: MissingPackagesAccess;
  readonly state?: 'installing' | 'installed' | 'failed';
  readonly percent?: number;
  readonly text?: string;
}

const INSTALL_ENDPOINT = '/api/browser/install-packages';

function BrowserMissingLibs({
  packages,
  t,
  onRetry,
}: {
  readonly packages: readonly string[];
  readonly t: BrowserTranslate;
  readonly onRetry?: (() => void) | undefined;
}): ReactElement {
  const [install, setInstall] = useState<InstallState>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const retried = useRef(false);
  const read = useCallback(async (): Promise<InstallState> => {
    const response = await fetch(INSTALL_ENDPOINT, { cache: 'no-store' });
    const next = (await response.json()) as InstallState;
    setInstall(next);
    return next;
  }, []);
  const resource = useCallback(
    (node: HTMLDivElement | null): void => {
      if (node === null) return;
      void read().catch(() => undefined);
    },
    [read],
  );
  const poll = (): void => {
    void read()
      .then((next) => {
        if (next.state === 'installing') {
          setTimeout(poll, 1000);
          return;
        }
        if (next.state === 'installed' && !retried.current) {
          retried.current = true;
          onRetry?.();
        }
      })
      .catch((cause: unknown) => setError(String(cause)));
  };
  const start = (): void => {
    setBusy(true);
    setError(undefined);
    void fetch(INSTALL_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ authorize: true, packages }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error);
        poll();
      })
      .catch((cause: unknown) => setError(String(cause)))
      .finally(() => setBusy(false));
  };
  const installing = install.state === 'installing';
  return (
    <div ref={resource} className="bh-browser-failure-install">
      {install.state === 'failed' && install.text !== undefined ? (
        <div className="bh-browser-failure-action">{install.text}</div>
      ) : null}
      {error === undefined ? null : <div className="bh-browser-failure-action">{error}</div>}
      <MissingPackages
        command={`sudo apt install -y ${packages.join(' ')}`}
        access={install.access ?? 'none'}
        installing={
          installing
            ? {
                percent: install.percent ?? 0,
                label: t('entry.install.progress', { percent: String(install.percent ?? 0) }),
              }
            : undefined
        }
        busy={busy}
        onInstall={start}
        labels={{
          missing: t('entry.install.missing', { count: String(packages.length) }),
          manual: t('entry.install.manual'),
          install: t('entry.install.button'),
          copy: t('entry.install.copy'),
          copied: t('entry.install.copied'),
        }}
      />
    </div>
  );
}

export function BrowserFailureNotice({
  failure,
  t,
  onRetry,
}: {
  readonly failure: BrowserFailure;
  readonly t: BrowserTranslate;
  readonly onRetry?: (() => void) | undefined;
}): ReactElement | null {
  if (!isBrowserFailureKind(failure.code)) return null;
  const kind: BrowserFailureKind = failure.code;
  return (
    <div role="alert" className="bh-browser-failure">
      <div className="bh-browser-failure-title">{t(`entry.fail.${kind}.title`)}</div>
      <div className="bh-browser-failure-fault">{t(`entry.fail.${kind}.fault`)}</div>
      {kind === 'provision-missing-libs' && (failure.packages?.length ?? 0) > 0 ? (
        <BrowserMissingLibs packages={failure.packages ?? []} t={t} onRetry={onRetry} />
      ) : (
        <div className="bh-browser-failure-action">{t(`entry.fail.${kind}.action`)}</div>
      )}
      {failure.detail === undefined || failure.detail === '' ? null : (
        <details className="bh-browser-failure-details">
          <summary>{t('entry.fail.details')}</summary>
          <pre>{failure.detail}</pre>
        </details>
      )}
    </div>
  );
}

function formatMiB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BrowserProvisionProgress({
  progress,
  t,
}: {
  readonly progress: BrowserInstallProgress;
  readonly t: BrowserTranslate;
}): ReactElement {
  if (progress.totalBytes <= 0)
    return (
      <div role="status" className="bh-browser-progress">
        {t('entry.provision.preparing')}
      </div>
    );
  const percent = Math.max(
    0,
    Math.min(99, Math.floor((progress.downloadedBytes / progress.totalBytes) * 100)),
  );
  return (
    <div role="status" className="bh-browser-progress">
      <progress
        className="bh-browser-progress-bar"
        max={progress.totalBytes}
        value={Math.min(progress.downloadedBytes, progress.totalBytes)}
      />
      <span>
        {t('entry.provision.downloading', {
          percent: String(percent),
          downloaded: formatMiB(progress.downloadedBytes),
          total: formatMiB(progress.totalBytes),
        })}
      </span>
    </div>
  );
}
