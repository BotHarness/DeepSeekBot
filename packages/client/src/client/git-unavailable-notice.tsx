import { Button } from './ds/button.js';
import type { ReactElement } from 'react';

import { gitInstalling, type GitAvailability, type GitInstallState } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';

export function gitReady(git: GitAvailability | undefined): boolean {
  return git?.available !== false;
}

function reasonText(
  git: Extract<GitAvailability, { available: false }>,
  t: BotHarnessTranslate,
): string {
  if (git.reason === 'too-old') {
    return t('git.unavailable.tooOld', { version: git.version ?? '?' });
  }
  if (git.reason === 'unrunnable') return t('git.unavailable.unrunnable');
  return t('git.unavailable.missing');
}

function megabytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

function installText(install: GitInstallState, t: BotHarnessTranslate): string | undefined {
  if (install.phase === 'downloading') {
    return install.total === undefined
      ? t('git.install.downloadingUnknown', {
          received: megabytes(install.received),
        })
      : t('git.install.downloading', {
          received: megabytes(install.received),
          total: megabytes(install.total),
        });
  }
  if (install.phase === 'verifying') return t('git.install.verifying');
  if (install.phase === 'unpacking') return t('git.install.unpacking');
  if (install.phase === 'failed') return t(`git.install.failed.${install.reason}`);
  return undefined;
}

export function GitUnavailableNotice({
  git,
  onInstall,
  onRecheck,
  t,
}: {
  git: GitAvailability | undefined;
  onInstall: () => void;
  onRecheck: () => void;
  t: BotHarnessTranslate;
}): ReactElement | null {
  if (git === undefined || git.available) return null;
  const installing = gitInstalling(git);
  const progress = installText(git.install, t);
  const failed = git.install.phase === 'failed';
  return (
    <div
      className="bh-git-unavailable"
      role="status"
      data-git-unavailable={git.reason}
      data-git-install={git.install.phase}
    >
      <strong className="bh-git-unavailable-title">{t('git.unavailable.title')}</strong>
      <span>{reasonText(git, t)}</span>
      {progress === undefined ? (
        <span>{t(git.installable ? 'git.install.hint' : 'git.unavailable.hint')}</span>
      ) : (
        <span className={failed ? 'bh-git-install-error' : undefined}>{progress}</span>
      )}
      {git.install.phase === 'downloading' && git.install.total !== undefined ? (
        <progress
          className="bh-git-install-progress"
          max={git.install.total}
          value={git.install.received}
        />
      ) : null}
      <span className="bh-git-unavailable-actions">
        <a href={t('git.unavailable.guideUrl')} target="_blank" rel="noopener noreferrer">
          {t('git.unavailable.guide')}
        </a>
        <span className="bh-git-unavailable-buttons">
          {installing ? null : (
            <Button variant="outline" size="sm" onClick={onRecheck} data-git-recheck>
              {t('git.unavailable.recheck')}
            </Button>
          )}
          {git.installable ? (
            <Button
              variant="primary"
              size="sm"
              onClick={onInstall}
              disabled={installing}
              data-git-install-button
            >
              {t(
                installing
                  ? 'git.install.installing'
                  : failed
                    ? 'git.install.retry'
                    : 'git.install.button',
              )}
            </Button>
          ) : null}
        </span>
      </span>
    </div>
  );
}
