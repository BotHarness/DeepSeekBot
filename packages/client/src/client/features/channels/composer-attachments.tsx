import { Icon } from '../../ds/icon.js';
import { FileTypeIcon } from '../../ds/file-type-icon.js';
import { useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { ImageLightbox, fileSizeText } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BotHarnessTranslate } from '../../locale.js';
import { useMountedResource } from '../../mounted-resource.js';
import { isImageAttachment } from './composer-suggestions.js';
import type { ChannelComposerUpload } from './composer-types.js';

function AttachmentUploadStatus({
  item,
  t,
  onRetry,
}: {
  item: ChannelComposerUpload;
  t: BotHarnessTranslate;
  onRetry: () => void;
}): ReactElement | null {
  if (item.status === 'uploading') {
    return <span className="bh-composer-upload-status">{t('composer.uploading')}</span>;
  }
  if (item.status !== 'error') return null;
  if (item.fileAvailable === false) {
    return (
      <span className="bh-composer-upload-status">{t('composer.draftAttachmentUnavailable')}</span>
    );
  }
  return (
    <button type="button" className="bh-composer-upload-retry" onClick={onRetry} title={item.error}>
      {t('composer.retryAttachment')}
    </button>
  );
}

function ComposerAttachmentCopy({
  item,
  t,
  onRetry,
}: {
  item: ChannelComposerUpload;
  t: BotHarnessTranslate;
  onRetry: () => void;
}): ReactElement {
  return (
    <span className="bh-composer-file-copy">
      <span className="bh-composer-attachment-name" title={item.file.name}>
        {item.file.name}
      </span>
      <span className="bh-composer-attachment-size">
        {item.status === 'ready' ? (
          fileSizeText(item.ref?.size ?? item.file.size)
        ) : (
          <AttachmentUploadStatus item={item} t={t} onRetry={onRetry} />
        )}
      </span>
    </span>
  );
}

function ComposerImageAttachment({
  item,
  ordinal,
  t,
  onRetry,
  onRemove,
  onReference,
  sending,
}: {
  item: ChannelComposerUpload;
  ordinal: number;
  t: BotHarnessTranslate;
  onRetry: () => void;
  onRemove: () => void;
  onReference: () => void;
  sending: boolean;
}): ReactElement {
  const [source, setSource] = useState<string>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const sourceMount = useMountedResource<HTMLDivElement>(() => {
    if (item.fileAvailable === false) {
      setSource(undefined);
      return;
    }
    if (typeof URL.createObjectURL !== 'function') return;
    const nextSource = URL.createObjectURL(item.file);
    setSource(nextSource);
    return () => URL.revokeObjectURL(nextSource);
  }, [item.file]);
  const previewLabel = t('composer.previewAttachment', {
    name: item.file.name,
  });

  return (
    <>
      <div
        ref={sourceMount}
        className="bh-composer-attachment-card bh-composer-image-attachment"
        data-status={item.status}
        data-attachment-card={item.id}
        aria-busy={item.status === 'uploading'}
      >
        <button
          type="button"
          className="bh-composer-attachment-reference bh-composer-image-reference"
          aria-label={t('composer.referenceAttachment', {
            name: item.file.name,
          })}
          disabled={sending}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onReference}
        >
          {ordinal}
        </button>
        <button
          type="button"
          className="bh-composer-image-preview"
          aria-label={previewLabel}
          aria-haspopup="dialog"
          disabled={source === undefined}
          onClick={() => setPreviewOpen(true)}
        >
          {source === undefined ? null : (
            <img src={source} alt={item.file.name} draggable={false} />
          )}
        </button>
        <ComposerAttachmentCopy item={item} t={t} onRetry={onRetry} />
        <button
          type="button"
          className="bh-composer-attachment-remove bh-composer-image-remove"
          aria-label={t('composer.removeAttachment', { name: item.file.name })}
          onClick={onRemove}
        >
          <Icon name="x" size={14} />
        </button>
      </div>
      {previewOpen && source !== undefined ? (
        <ImageLightbox
          src={source}
          alt={item.file.name}
          labels={{ dialog: previewLabel, close: t('common.close') }}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </>
  );
}

function ComposerFileAttachment({
  item,
  ordinal,
  t,
  onRetry,
  onRemove,
  onReference,
  sending,
}: {
  item: ChannelComposerUpload;
  ordinal: number;
  t: BotHarnessTranslate;
  onRetry: () => void;
  onRemove: () => void;
  onReference: () => void;
  sending: boolean;
}): ReactElement {
  return (
    <div
      className="bh-composer-attachment-card bh-composer-file-attachment"
      data-status={item.status}
      data-attachment-card={item.id}
      aria-busy={item.status === 'uploading'}
    >
      <span className="bh-composer-file-icon" aria-hidden="true">
        <FileTypeIcon path={item.file.name} size={24} />
      </span>
      <ComposerAttachmentCopy item={item} t={t} onRetry={onRetry} />
      <button
        type="button"
        className="bh-composer-attachment-reference bh-composer-file-reference"
        aria-label={t('composer.referenceAttachment', { name: item.file.name })}
        disabled={sending}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onReference}
      >
        {ordinal}
      </button>
      <button
        type="button"
        className="bh-composer-attachment-remove"
        aria-label={t('composer.removeAttachment', { name: item.file.name })}
        onClick={onRemove}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

export function renderComposerAttachments({
  attachments,
  t,
  locked,
  voice,
  onRetryAttachment,
  onRemoveAttachment,
  referenceAttachment,
}: {
  attachments: readonly ChannelComposerUpload[];
  t: BotHarnessTranslate;
  locked: boolean;
  voice: { active: boolean };
  onRetryAttachment: ((id: string) => void) | undefined;
  onRemoveAttachment: ((id: string) => void) | undefined;
  referenceAttachment: (item: ChannelComposerUpload) => void;
}): ReactElement {
  return (
    <div className="bh-composer-attachments" aria-live="polite">
      {attachments.map((item, index) =>
        isImageAttachment(item.file) ? (
          <ComposerImageAttachment
            key={item.id}
            item={item}
            ordinal={index + 1}
            t={t}
            onRetry={() => onRetryAttachment?.(item.id)}
            onRemove={() => {
              if (!voice.active) onRemoveAttachment?.(item.id);
            }}
            onReference={() => referenceAttachment(item)}
            sending={locked || voice.active}
          />
        ) : (
          <ComposerFileAttachment
            key={item.id}
            item={item}
            ordinal={index + 1}
            t={t}
            onRetry={() => onRetryAttachment?.(item.id)}
            onRemove={() => {
              if (!voice.active) onRemoveAttachment?.(item.id);
            }}
            onReference={() => referenceAttachment(item)}
            sending={locked || voice.active}
          />
        ),
      )}
    </div>
  );
}

export function renderComposerAttachmentIcon(
  mount: { target: HTMLElement; name: string },
  index: number,
) {
  return createPortal(
    <FileTypeIcon path={mount.name} size={16} />,
    mount.target,
    `attachment-${index}`,
  );
}
