import { useState, type ReactElement } from 'react';
import type { BridgeActions } from './actions.js';
import type { MemoryWorkingChange, MemoryWorkingDiff } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { MemoryDiffFile, MemoryViewIconButton } from './memory-reader-parts.js';
import { MemoryFileActionButton, MemoryFileOpenButton } from './memory-file-actions.js';
import { channelSidebarPrefs } from './channel-sidebar-prefs.js';
import { memoryChangeBadge } from './memory-working-presentation.js';
import { useMountedResource } from './mounted-resource.js';

interface CommonProps {
  actions: BridgeActions;
  channelId: string;
  onClose: () => void;
  t: BotHarnessTranslate;
}

export function MemoryFileView({
  actions,
  channelId,
  path,
  botSlug,
  onClose,
  t,
}: CommonProps & { path: string; botSlug?: string | undefined }): ReactElement {
  const [revision, setRevision] = useState(0);
  const [file, setFile] = useState<Awaited<ReturnType<BridgeActions['memoryFile']>>>();
  const [error, setError] = useState<string>();

  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    setFile(undefined);
    setError(undefined);
    const load = (): void => {
      if (!active || inFlight) return;
      if (document.visibilityState === 'hidden') {
        timer = setTimeout(load, 15_000);
        return;
      }
      inFlight = true;
      void actions
        .memoryFile(channelId, path)
        .then(
          (next) => {
            if (active) {
              setFile(next);
              setError(next === undefined ? t('memory.fileMissing') : undefined);
            }
          },
          (failure: unknown) => {
            if (active) setError(failure instanceof Error ? failure.message : String(failure));
          },
        )
        .finally(() => {
          inFlight = false;
          if (active) timer = setTimeout(load, 15_000);
        });
    };
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      load();
    };
    load();
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [actions, channelId, path, revision, t]);

  return (
    <div
      className="bh-memory-commit-view"
      role="region"
      aria-label={t('entry.memoryFiles')}
      ref={mount}
    >
      <div className="bh-memory-commit-header">
        <MemoryViewIconButton action="backToChat" onClick={onClose} t={t} />
        <strong>
          {botSlug === undefined ? (
            path
          ) : (
            <MemoryFileActionButton
              actions={actions}
              slug={botSlug}
              path={path}
              text={path}
              t={t}
            />
          )}
        </strong>
        {botSlug === undefined ? null : (
          <MemoryFileOpenButton actions={actions} slug={botSlug} path={path} name={path} t={t} />
        )}
        <MemoryViewIconButton
          action="refresh"
          onClick={() => setRevision((value) => value + 1)}
          t={t}
        />
      </div>
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
      {file === undefined ? (
        error === undefined ? (
          <div className="bh-note">{t('memory.loading')}</div>
        ) : null
      ) : file.binary ? (
        <div className="bh-note">{t('memory.binaryPreview')}</div>
      ) : (
        <pre className="bh-memory-commit-code">{file.body}</pre>
      )}
    </div>
  );
}

export function MemoryWorkingView({
  actions,
  channelId,
  change,
  onClose,
  t,
}: CommonProps & { change: MemoryWorkingChange }): ReactElement {
  const [revision, setRevision] = useState(0);
  const [detail, setDetail] = useState<MemoryWorkingDiff>();
  const [error, setError] = useState<string>();

  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    setDetail(undefined);
    setError(undefined);
    const load = (): void => {
      if (!active || inFlight) return;
      if (document.visibilityState === 'hidden') {
        timer = setTimeout(load, 15_000);
        return;
      }
      inFlight = true;
      void actions
        .memoryWorkingDiff(channelId, change.path, change.kind)
        .then(
          (next) => {
            if (active) {
              setDetail(next);
              setError(undefined);
            }
          },
          (failure: unknown) => {
            if (active) setError(failure instanceof Error ? failure.message : String(failure));
          },
        )
        .finally(() => {
          inFlight = false;
          if (active) timer = setTimeout(load, 15_000);
        });
    };
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      load();
    };
    load();
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [actions, channelId, change.path, change.kind, revision]);

  const badge =
    detail === undefined
      ? undefined
      : memoryChangeBadge(
          { ...change, status: detail.status },
          channelSidebarPrefs.getSnapshot().memoryTerminology,
        );

  return (
    <div
      className="bh-memory-commit-view"
      role="region"
      aria-label={t('memory.workingDiff')}
      ref={mount}
    >
      <div className="bh-memory-commit-header">
        <MemoryViewIconButton action="backToChat" onClick={onClose} t={t} />
        <strong>{t('memory.workingDiff')}</strong>
        <MemoryViewIconButton
          action="refresh"
          onClick={() => setRevision((value) => value + 1)}
          t={t}
        />
      </div>
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
      {detail === undefined ? (
        error === undefined ? (
          <div className="bh-note">{t('memory.loading')}</div>
        ) : null
      ) : (
        <MemoryDiffFile
          path={change.path}
          status={badge ?? detail.status}
          badge={
            badge === 'new'
              ? t('memory.badge.new')
              : badge === 'deleted'
                ? t('memory.badge.deleted')
                : badge === 'updated'
                  ? t('memory.badge.updated')
                  : (badge ?? detail.status)
          }
          diff={detail.diff}
          label={t('memory.workingDiff')}
          binary={detail.binary}
          binaryLabel={t('memory.binaryPreview')}
          emptyLabel={t('memory.noTextDiff')}
          oldLineLabel={t('memory.oldLine')}
          newLineLabel={t('memory.newLine')}
        />
      )}
    </div>
  );
}
