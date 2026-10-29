import { AppearancePanelHeader } from './appearance-panel-header.js';
import { MemoryMarkdownDiff, MemoryMarkdownToggle } from './memory-markdown-view.js';
import { MemoryImageDiff } from './memory-image-view.js';
import { useState, type ReactElement } from 'react';
import type { BridgeActions } from './actions.js';
import type { MemoryGitCommitDiff } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { MemoryCurrentFileOpenButton } from './memory-file-actions.js';
import {
  MemoryDiffFile,
  MemoryDiffWrapButton,
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
  const [revision, setRevision] = useState(0);
  const [wrap, setWrap] = useState(true);
  const [preview, setPreview] = useState(false);
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
  }, [actions, channelId, sha, revision]);

  const diffSections = splitMemoryDiffFiles(detail?.diff ?? '');

  return (
    <div className="bh-memory-commit-view" role="region" aria-label={t('memory.diff')} ref={mount}>
      <AppearancePanelHeader
        id="memory-details"
        label={t('appearance.memoryDetails')}
        t={t}
        className="bh-memory-commit-header"
      >
        <MemoryViewIconButton action="backToChat" onClick={onClose} t={t} />
        <MemoryViewIconButton
          action="refresh"
          onClick={() => setRevision((value) => value + 1)}
          t={t}
        />
        <div
          className="bh-memory-commit-title"
          title={detail?.subject ? `${sha}\n${detail.subject}` : sha}
        >
          <code>{sha.slice(0, 7)}</code>
          {detail?.subject === undefined || detail.subject === '' ? null : (
            <span>{detail.subject}</span>
          )}
        </div>
        {detail?.files.some((file) => file.markdown !== undefined) ? (
          <MemoryMarkdownToggle
            preview={preview}
            onToggle={() => setPreview((v) => !v)}
            diff
            t={t}
          />
        ) : null}
        <MemoryDiffWrapButton wrap={wrap} onToggle={() => setWrap((value) => !value)} t={t} />
      </AppearancePanelHeader>
      <div className="bh-memory-detail-body" data-appearance-body="memory-details">
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
                preview={
                  botSlug !== undefined && file.markdown !== undefined && preview ? (
                    <MemoryMarkdownDiff
                      slug={botSlug}
                      path={file.path}
                      markdown={file.markdown}
                      t={t}
                    />
                  ) : file.images === undefined || botSlug === undefined ? undefined : (
                    <MemoryImageDiff slug={botSlug} path={file.path} images={file.images} t={t} />
                  )
                }
                diff={diffSections[index] ?? ''}
                wrap={wrap}
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
    </div>
  );
}
