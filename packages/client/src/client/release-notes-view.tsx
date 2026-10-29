import type { ReleaseCompatibility } from '../../../core/src/release/compatibility.js';
import { useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import {
  Button,
  IconCloseOutlineRegular,
  IconDownloadOutlineRegular,
  MarkdownText,
  Tag,
  type MarkdownLabels,
  type TagTone,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import type { ReleaseNote } from '../../../core/src/release/notes.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { IconButton } from './ds/icon-button.js';
import { Tooltip } from './ds/tooltip.js';
import { SettingsRow } from './ds/settings-row.js';
import { color, space, text } from './ds/tokens.stylex.js';
import { Modal } from './modal.js';
import { useMountedResource } from './mounted-resource.js';
import type {
  ReleaseInstallState,
  ReleaseRestartState,
  ReleaseNotesController,
  ReleaseNotesSnapshot,
} from './release-notes.js';

const SECTIONS: Record<string, { key: BotHarnessKey; tone: TagTone }> = {
  'Breaking Changes': { key: 'releaseNotes.section.breaking', tone: 'danger' },
  Security: { key: 'releaseNotes.section.security', tone: 'danger' },
  Added: { key: 'releaseNotes.section.added', tone: 'success' },
  Changed: { key: 'releaseNotes.section.changed', tone: 'info' },
  Fixed: { key: 'releaseNotes.section.fixed', tone: 'warning' },
  Documentation: { key: 'releaseNotes.section.documentation', tone: 'neutral' },
  Deprecated: { key: 'releaseNotes.section.deprecated', tone: 'warning' },
  Removed: { key: 'releaseNotes.section.removed', tone: 'neutral' },
};

export const RELEASE_UPDATE_PROFILE = 'web';
export const DESKTOP_UPDATE_PROFILE = 'desktop';
const FAILURE_LINE_CHARS = 160;

const styles = stylex.create({
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    paddingTop: space.x6,
    paddingBottom: 0,
    paddingInline: `${space.x6} ${space.x4}`,
  },
  title: {
    flexGrow: 1,
    minWidth: 0,
    margin: 0,
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  install: { color: { default: color.accent, ':hover': color.accent } },
  close: { color: color.muted },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x4,
    minWidth: 0,
    paddingInline: space.x6,
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  identity: { margin: 0, color: color.muted },
  failure: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    minWidth: 0,
  },
  failureText: { margin: 0, color: color.danger, overflowWrap: 'anywhere' },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space.x3,
    paddingInline: space.x6,
  },
  spacer: { flexGrow: 1 },
});

export function releaseUpdateCommand(version: string, profile = RELEASE_UPDATE_PROFILE): string {
  return `dsh plugin --profile ${profile} add deepseekbot@${version}`;
}

function useReleaseNotes(controller: ReleaseNotesController): ReleaseNotesSnapshot {
  return useSyncExternalStore(controller.source.subscribe, controller.source.getSnapshot);
}

export function ReleaseNotesList({
  releases,
  badge,
  t,
}: {
  releases: readonly ReleaseNote[];
  badge: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const language = t('releaseNotes.language') === 'en' ? 'en' : 'zh';
  const labels = useMemo<MarkdownLabels>(
    () => ({
      code: { copyLabel: t('message.code.copy'), copiedLabel: t('message.code.copied') },
      footnotes: t('message.footnotes'),
    }),
    [t],
  );
  return (
    <div className="bh-release-notes" data-release-notes>
      {releases.map((release, index) => {
        const entries = release.sections.flatMap((section) =>
          section.entries.map((entry) => ({ section: section.name, entry })),
        );
        return (
          <details
            key={release.version}
            className="bh-release-note"
            data-release-version={release.version}
            open={index === 0}
          >
            <summary className="bh-release-note-head">
              <span className="bh-release-note-version">v{release.version}</span>
              <time dateTime={release.date}>{release.date}</time>
              {index === 0 ? <Tag tone="info">{badge}</Tag> : null}
              <span className="bh-release-note-rule" aria-hidden="true" />
              <span className="bh-release-note-count">
                {t('releaseNotes.entryCount', { count: entries.length })}
              </span>
            </summary>
            <div className="bh-release-note-body">
              <div className="bh-release-note-summary">
                <MarkdownText text={release.summary[language]} labels={labels} />
              </div>
              <ul className="bh-release-note-entries">
                {entries.map(({ section, entry }, entryIndex) => {
                  const known = SECTIONS[section];
                  return (
                    <li key={entryIndex} data-release-section={section}>
                      <Tag tone={known?.tone ?? 'outline'} className="bh-release-note-chip">
                        {known === undefined ? section : t(known.key)}
                      </Tag>
                      <div className="bh-release-note-text">
                        <MarkdownText text={entry[language]} labels={labels} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function openSite(t: BotHarnessTranslate): void {
  window.open(t('releaseNotes.siteUrl'), '_blank', 'noopener,noreferrer');
}

export function ReleaseNotesDialog({
  releases,
  title,
  badge,
  description,
  onClose,
  t,
}: {
  releases: readonly ReleaseNote[] | undefined;
  title: string;
  badge: string;
  description?: string | undefined;
  onClose: () => void;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <Modal
      open={releases !== undefined}
      onClose={onClose}
      title={title}
      closeLabel={t('releaseNotes.close')}
      {...(description === undefined ? {} : { description })}
      className="bh-release-dialog"
      footer={
        <>
          <Button
            variant="outline"
            className="bh-release-site-button"
            onClick={() => {
              openSite(t);
            }}
          >
            {t('releaseNotes.site')}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t('releaseNotes.done')}
          </Button>
        </>
      }
    >
      {releases === undefined ? null : <ReleaseNotesList releases={releases} badge={badge} t={t} />}
    </Modal>
  );
}

export function ReleaseNotesAnnouncement({
  controller,
  t,
  deferred = false,
}: {
  controller: ReleaseNotesController;
  t: BotHarnessTranslate;
  deferred?: boolean;
}): ReactElement {
  const snapshot = useReleaseNotes(controller);
  const mount = useMountedResource<HTMLSpanElement>(() => {
    const check = () => {
      void controller.enter();
    };
    check();
    const timer = setInterval(check, 30_000);
    window.addEventListener('online', check);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', check);
    };
  }, [controller]);
  const version = snapshot.version ?? '';
  return (
    <>
      <span ref={mount} hidden aria-hidden="true" />
      <UpgradeNotice controller={controller} snapshot={snapshot} deferred={deferred} t={t} />
      <ReleaseNotesDialog
        releases={deferred ? undefined : snapshot.announcement}
        title={t('releaseNotes.announce.title', { version })}
        badge={t('releaseNotes.current')}
        description={t(
          snapshot.firstRun
            ? 'releaseNotes.announce.firstRun'
            : 'releaseNotes.announce.description',
        )}
        onClose={() => {
          controller.dismiss();
        }}
        t={t}
      />
    </>
  );
}

export function compatibilityText(
  compatibility: ReleaseCompatibility,
  t: BotHarnessTranslate,
): string {
  if (compatibility.status === 'compatible')
    return t('release.compatible', { dsh: compatibility.dshVersion });
  if (compatibility.status === 'unknown') return t('release.compatibilityUnknown');
  return t('release.incompatible', {
    dsh: compatibility.dshVersion,
    requirement: Object.values(compatibility.requirements).join(', '),
  });
}

function UpgradeNotice({
  controller,
  snapshot,
  deferred,
  t,
}: {
  controller: ReleaseNotesController;
  snapshot: ReleaseNotesSnapshot;
  deferred: boolean;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const update = snapshot.update;
  if (update.status === 'restart-required')
    return (
      <Modal
        open={snapshot.updateNotice && snapshot.announcement === undefined && !deferred}
        title={t('release.restart.title', { installed: update.installed })}
        closeLabel={t('releaseNotes.close')}
        onClose={() => controller.dismissUpdate()}
      >
        <RestartGuide
          restartable={update.restartable}
          state={snapshot.restart}
          onRestart={() => {
            void controller.restart();
          }}
          t={t}
        />
      </Modal>
    );
  if (update.status !== 'available' && update.status !== 'blocked') return null;
  const install = snapshot.install;
  const installing = install.status === 'installing';
  const installable = update.status === 'available' && update.installable;
  const close = () => {
    if (!installing) controller.dismissUpdate();
  };
  const start = () => {
    void controller.install(update.latest);
  };
  const title = t('release.notice.title', { latest: update.latest });
  const actionLabel = t(installing ? 'release.install.running' : 'release.install.action');
  return (
    <Modal
      open={snapshot.updateNotice && snapshot.announcement === undefined && !deferred}
      headless
      title={title}
      onClose={close}
      className="bh-release-dialog"
    >
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{title}</h2>
        {installable ? (
          <Tooltip label={actionLabel} side="bottom" portal>
            <IconButton
              aria-label={actionLabel}
              disabled={installing}
              data-release-notice-install=""
              xstyle={styles.install}
              onClick={start}
            >
              <IconDownloadOutlineRegular size={16} />
            </IconButton>
          </Tooltip>
        ) : null}
        <IconButton
          aria-label={t('releaseNotes.close')}
          disabled={installing}
          data-modal-autofocus=""
          xstyle={styles.close}
          onClick={close}
        >
          <IconCloseOutlineRegular size={14} />
        </IconButton>
      </div>
      <div {...stylex.props(styles.body)}>
        <p {...stylex.props(styles.identity)}>
          {t('release.notice.identity', {
            current: update.current,
            dsh: update.compatibility?.dshVersion ?? t('release.compatibilityUnknown'),
          })}
        </p>
        {update.status === 'blocked' ? <p>{compatibilityText(update.compatibility, t)}</p> : null}
        {update.status === 'available' && update.blockedLatest ? (
          <p>
            {t('release.notice.blockedLatest', { version: update.blockedLatest.version })}{' '}
            {compatibilityText(update.blockedLatest.compatibility, t)}
          </p>
        ) : null}
        {install.status === 'failed' || (update.status === 'available' && !update.installable) ? (
          <div {...stylex.props(styles.failure)} data-release-notice-failure>
            {install.status === 'failed' ? (
              <p role="alert" {...stylex.props(styles.failureText)}>
                {t('release.install.failedWith', { reason: failureReason(install, t) })}
              </p>
            ) : null}
            <ManualUpdate latest={update.latest} compact t={t} />
          </div>
        ) : null}
        {update.status === 'available' ? (
          update.releases.length > 0 ? (
            <ReleaseNotesList releases={update.releases} badge={t('releaseNotes.latest')} t={t} />
          ) : (
            <p>{t('release.notice.noNotes')}</p>
          )
        ) : null}
      </div>
      <div {...stylex.props(styles.footer)}>
        <Button variant="outline" onClick={() => openSite(t)}>
          {t('releaseNotes.site')}
        </Button>
        <span {...stylex.props(styles.spacer)} />
        <Button variant="outline" disabled={installing} onClick={close}>
          {t('release.notice.later')}
        </Button>
        {installable ? (
          <Button variant="primary" disabled={installing} onClick={start}>
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}

function failureReason(
  install: Extract<ReleaseInstallState, { status: 'failed' }>,
  t: BotHarnessTranslate,
): string {
  const known = INSTALL_FAILURE_REASONS[install.reason];
  if (known !== undefined) return t(known);
  const line = install.diagnostic
    ?.split('\n')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .at(-1);
  if (line === undefined) return t('release.install.reason.unknown');
  return line.length > FAILURE_LINE_CHARS ? `${line.slice(0, FAILURE_LINE_CHARS)}…` : line;
}

function statusText(snapshot: ReleaseNotesSnapshot, t: BotHarnessTranslate): string {
  const version = snapshot.version;
  if (version === undefined) return t('release.status.loading');
  const identity = snapshot.identity;
  if (identity === undefined) return t('release.status.legacy');
  if (identity.kind === 'unknown') return t('release.status.unknown', { reason: identity.reason });
  if (identity.kind === 'development')
    return t('release.status.source', {
      revision: identity.source?.revision.slice(0, 9) ?? '',
      dirty: identity.source?.dirty === true ? t('release.status.dirty') : '',
    });
  const update = snapshot.update;
  switch (update.status) {
    case 'unknown':
      return t('release.status.unknown', { reason: update.reason });
    case 'development':
      return t('release.status.development', { version });
    case 'available':
      return t('release.status.available', { version, latest: update.latest });
    case 'blocked':
      return compatibilityText(update.compatibility, t);
    case 'current':
      return t('release.status.current', { version });
    case 'restart-required':
      return t('release.status.restart', { version, installed: update.installed });
    case 'unavailable':
      return t('release.status.unavailable', { version });
    default:
      return t('release.status.checking', { version });
  }
}

const INSTALL_FAILURE_REASONS: Partial<
  Record<Extract<ReleaseInstallState, { status: 'failed' }>['reason'], BotHarnessKey>
> = {
  unavailable: 'release.install.reason.unavailable',
  network: 'release.install.reason.network',
  incompatible: 'release.install.reason.incompatible',
  'build-blocked': 'release.install.reason.buildBlocked',
};

export const INSTALL_FAILURE_KEYS: Record<
  Extract<ReleaseInstallState, { status: 'failed' }>['reason'],
  BotHarnessKey
> = {
  'identity-invalid': 'release.install.failed.generic',
  unavailable: 'release.install.failed.unavailable',
  'invalid-version': 'release.install.failed.generic',
  network: 'release.install.failed.network',
  incompatible: 'release.install.failed.incompatible',
  'build-blocked': 'release.install.failed.buildBlocked',
  failed: 'release.install.failed.generic',
};

function ManualUpdate({
  latest,
  compact = false,
  t,
}: {
  latest: string;
  compact?: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const desktop = runsInDesktop();
  const command = releaseUpdateCommand(
    latest,
    compact && desktop ? DESKTOP_UPDATE_PROFILE : RELEASE_UPDATE_PROFILE,
  );
  return (
    <>
      <div className="bh-settings-row-desc">
        {t(
          compact
            ? desktop
              ? 'release.update.cliDesktop'
              : 'release.update.cliShort'
            : 'release.update.cli',
        )}
      </div>
      <div className="bh-release-command">
        <code>{command}</code>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(command).then(() => {
              setCopied(true);
            });
          }}
        >
          {t(copied ? 'release.update.copied' : 'release.update.copy')}
        </Button>
      </div>
      {compact ? null : <div className="bh-settings-row-desc">{t('release.update.desktop')}</div>}
    </>
  );
}

export function runsInDesktop(): boolean {
  return 'dshDesktop' in globalThis;
}

function RestartGuide({
  restartable,
  state,
  onRestart,
  t,
}: {
  restartable: boolean;
  state: ReleaseRestartState;
  onRestart: () => void;
  t: BotHarnessTranslate;
}): ReactElement {
  if (runsInDesktop()) {
    return <div className="bh-settings-row-desc">{t('release.restart.desktop')}</div>;
  }
  if (!restartable || state.status === 'failed') {
    return (
      <>
        {state.status === 'failed' ? (
          <div className="bh-release-install-error" role="alert" data-release-restart-error>
            {t('release.restart.failed')}
          </div>
        ) : null}
        <div className="bh-settings-row-desc">{t('release.restart.web')}</div>
        <div className="bh-settings-row-desc">{t('release.restart.desktop')}</div>
      </>
    );
  }
  const restarting = state.status === 'restarting';
  return (
    <div className="bh-release-update-head">
      <span className="bh-settings-row-desc bh-release-restart-hint">
        {t(restarting ? 'release.restart.progress' : 'release.restart.hint')}
      </span>
      <Button
        size="sm"
        variant="primary"
        disabled={restarting}
        data-release-restart-action
        onClick={onRestart}
      >
        {t(restarting ? 'release.restart.running' : 'release.restart.action')}
      </Button>
    </div>
  );
}

export type ReleaseSettingsProps = PropsLocale<'botharness'> &
  InjectFace<{ releaseNotes: ReleaseNotesController }>;

export function ReleaseSettings({ releaseNotes, t }: ReleaseSettingsProps): ReactElement {
  const snapshot = useReleaseNotes(releaseNotes);
  const mount = useMountedResource<HTMLDivElement>(() => {
    void releaseNotes.start().then(() => releaseNotes.checkUpdate());
  }, [releaseNotes]);
  const update = snapshot.update;
  const install = snapshot.install;
  const installing = install.status === 'installing';
  return (
    <div className="bh-release-settings" ref={mount} data-release-settings>
      <SettingsRow
        title={t('release.row.title')}
        description={
          <span role="status" aria-live="polite">
            {statusText(snapshot, t)}
          </span>
        }
        control={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                openSite(t);
              }}
            >
              {t('release.changelog')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={
                installing ||
                (snapshot.identity?.kind === 'unknown' &&
                  snapshot.identity.reason !== 'composition-unverified') ||
                snapshot.identity?.kind === 'development' ||
                update.status === 'checking' ||
                update.status === 'development' ||
                update.status === 'restart-required'
              }
              onClick={() => {
                void releaseNotes.checkUpdate(true);
              }}
            >
              {t('release.check')}
            </Button>
          </>
        }
      />
      {update.status === 'available' && snapshot.identity?.kind !== 'unknown' ? (
        <div className="bh-release-update" data-release-update={update.latest}>
          {update.compatibility ? <p>{compatibilityText(update.compatibility, t)}</p> : null}
          {update.blockedLatest ? (
            <p>
              {t('release.notice.blockedLatest', { version: update.blockedLatest.version })}{' '}
              {compatibilityText(update.blockedLatest.compatibility, t)}
            </p>
          ) : null}
          <div className="bh-release-update-head">
            <span className="bh-release-update-title">
              {t('release.update.title', { latest: update.latest })}
            </span>
            {update.releases.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  releaseNotes.view(update.releases);
                }}
              >
                {t('release.update.notes')}
              </Button>
            ) : null}
            {update.installable ? (
              <Button
                size="sm"
                variant="primary"
                disabled={installing}
                data-release-install
                onClick={() => {
                  void releaseNotes.install(update.latest);
                }}
              >
                {t(installing ? 'release.install.running' : 'release.install.action')}
              </Button>
            ) : null}
          </div>
          {update.installable && install.status !== 'failed' ? (
            <div className="bh-settings-row-desc">
              {t(installing ? 'release.install.progress' : 'release.install.hint')}
            </div>
          ) : null}
          {install.status === 'failed' ? (
            <div className="bh-release-install-error" role="alert" data-release-install-error>
              <div>{t(INSTALL_FAILURE_KEYS[install.reason])}</div>
              {install.diagnostic === undefined ? null : (
                <pre className="bh-release-install-diagnostic">{install.diagnostic}</pre>
              )}
              {install.logPath === undefined ? null : (
                <div className="bh-settings-row-desc">
                  {t('release.install.log', { path: install.logPath })}
                </div>
              )}
            </div>
          ) : null}
          {!update.installable || install.status === 'failed' ? (
            <ManualUpdate latest={update.latest} t={t} />
          ) : null}
        </div>
      ) : null}
      {update.status === 'restart-required' ? (
        <div className="bh-release-update" data-release-restart={update.installed}>
          <div className="bh-release-update-head">
            <span className="bh-release-update-title">
              {t('release.restart.title', { installed: update.installed })}
            </span>
          </div>
          <RestartGuide
            restartable={update.restartable}
            state={snapshot.restart}
            onRestart={() => {
              void releaseNotes.restart();
            }}
            t={t}
          />
        </div>
      ) : null}
      <ReleaseNotesDialog
        releases={snapshot.viewing}
        title={t('release.update.dialog', {
          latest: update.status === 'available' ? update.latest : '',
        })}
        badge={t('releaseNotes.latest')}
        onClose={() => {
          releaseNotes.view(undefined);
        }}
        t={t}
      />
    </div>
  );
}
