import { useState, type ReactElement } from 'react';
import type { BridgeActions } from './actions.js';
import type { MemoryGitCommitDiff } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { MemoryCurrentFileOpenButton } from './memory-file-actions.js';
import {
  MemoryDiffFile,
  MemoryViewIconButton,
  splitMemoryDiffFiles,
} from './memory-reader-parts.js';
import { useMountedResource } from './mounted-resource.js';

export function MemoryCommitView({
  actions,
  channelId,
  sha,
  botSlug,
  onClose,
  t,
}: {
  actions: BridgeActions;
  channelId: string;
  sha: string;
  botSlug?: string | undefined;
  onClose: () => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [detail, setDetail] = useState<MemoryGitCommitDiff>();
  const [error, setError] = useState<string>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    setDetail(undefined);
    setError(undefined);
    void actions
      .memoryGitCommitDiff(channelId, sha)
      .then((next) => {
        if (active) setDetail(next);
      })
      .catch((failure: unknown) => {
        if (active) setError(failure instanceof Error ? failure.message : String(failure));
      });
    return () => {
      active = false;
    };
  }, [actions, channelId, sha]);

  const diffSections = splitMemoryDiffFiles(detail?.diff ?? '');

  return (
    <div className="bh-memory-commit-view" role="region" aria-label={t('memory.diff')} ref={mount}>
      <div className="bh-memory-commit-header">
        <MemoryViewIconButton action="backToChat" onClick={onClose} t={t} />
        <div
          className="bh-memory-commit-title"
          title={detail?.subject ? `${sha}\n${detail.subject}` : sha}
        >
          <code>{sha.slice(0, 7)}</code>
          {detail?.subject === undefined || detail.subject === '' ? null : (
            <span>{detail.subject}</span>
          )}
        </div>
      </div>
      {error !== undefined ? (
        <div className="bh-error" role="alert">
          {error}
        </div>
      ) : null}
      {detail === undefined ? (
        <div className="bh-note">{t('memory.loading')}</div>
      ) : (
        <>
          <div className="bh-memory-commit-files-count">
            {t('memory.changedFiles')} · {detail.files.length}
          </div>
          {detail.files.map((file, index) => (
            <MemoryDiffFile
              key={file.path + index}
              path={file.path}
              status={file.status}
              diff={diffSections[index] ?? ''}
              label={t('memory.diff')}
              binaryLabel={t('memory.binaryPreview')}
              emptyLabel={t('memory.noTextDiff')}
              oldLineLabel={t('memory.oldLine')}
              newLineLabel={t('memory.newLine')}
              action={
                botSlug === undefined ? undefined : (
                  <MemoryCurrentFileOpenButton
                    actions={actions}
                    slug={botSlug}
                    path={file.path}
                    deletion={file.status === 'D' ? 'commit' : undefined}
                    t={t}
                  />
                )
              }
            />
          ))}
        </>
      )}
    </div>
  );
}
