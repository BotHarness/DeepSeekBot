import { useMemo, useSyncExternalStore, type ReactElement } from 'react';
import { FileTypeIcon, fileSizeText } from '@deepseek-ai/dsh-client-ui-primitives';

import type { AttachmentFetch } from './attachment-fetch.js';
import { channelAttachmentUrl } from './bridge.js';
import { createAttachmentFileResource } from './bridge-file-resource.js';
import { createAttachmentImageResource } from './bridge-image-resource.js';
import type { BotHarnessTranslate } from './locale.js';
import { inlineImageAttachment } from './message-attachment.js';
import { galleryImageKey, SingleImageGallery, useImageGallery } from './message-image-gallery.js';
import type { ChannelAttachmentRef } from './store.js';

const imageFailures = {
  unavailable: 'bridgeMedia.unavailable',
  tooLarge: 'bridgeMedia.tooLarge',
  format: 'bridgeMedia.format',
  failed: 'bridgeMedia.failed',
} as const;

const fileFailures = {
  unavailable: 'bridgeFile.unavailable',
  tooLarge: 'bridgeFile.tooLarge',
  format: 'bridgeFile.format',
  failed: 'bridgeFile.failed',
} as const;

function RemoteImage({
  path,
  name,
  galleryKey,
  fetcher,
  t,
}: {
  path: string;
  name: string;
  galleryKey: string;
  fetcher: AttachmentFetch;
  t: BotHarnessTranslate;
}): ReactElement {
  const resource = useMemo(() => createAttachmentImageResource(path, fetcher), [path, fetcher]);
  const state = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot,
  );
  const gallery = useImageGallery();
  const url = state.url;
  return (
    <div ref={resource.element} className="bh-message-image-row" data-remote-image="">
      {url === undefined ? (
        <div className="bh-bridge-image-state" role="status">
          <span>{state.failure ? t(imageFailures[state.failure]) : t('bridgeMedia.loading')}</span>
          {state.failure ? (
            <button type="button" className="bh-memory-view-action" onClick={resource.retry}>
              {t('bridgeMedia.retry')}
            </button>
          ) : null}
        </div>
      ) : (
        <SingleImageGallery t={t}>
          {(openAlone) => (
            <button
              type="button"
              className="bh-message-image-link"
              aria-label={t('message.image.open', { name })}
              onClick={() => {
                const item = { key: galleryKey, src: url, alt: name };
                if (gallery === undefined) openAlone(item);
                else gallery.open(item.key, item);
              }}
            >
              <img className="bh-message-image" src={url} alt={name} onError={resource.fail} />
            </button>
          )}
        </SingleImageGallery>
      )}
    </div>
  );
}

function RemoteFile({
  path,
  name,
  size,
  fetcher,
  t,
}: {
  path: string;
  name: string;
  size: number;
  fetcher: AttachmentFetch;
  t: BotHarnessTranslate;
}): ReactElement {
  const resource = useMemo(() => createAttachmentFileResource(path, fetcher), [path, fetcher]);
  const state = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot,
  );
  return (
    <>
      <div className="bh-message-file">
        <button
          type="button"
          className="bh-message-file-main"
          disabled={state.loading}
          aria-busy={state.loading === true}
          aria-label={t('fileAction.download') + ': ' + name}
          onClick={() => void resource.download(name)}
        >
          <span className="bh-message-file-icon" aria-hidden="true">
            <FileTypeIcon path={name} size={28} />
          </span>
          <span className="bh-message-file-copy">
            <span className="bh-message-file-name" title={name}>
              {name}
            </span>
            <span className="bh-message-file-size">{fileSizeText(size)}</span>
          </span>
        </button>
      </div>
      {state.loading ? <div role="status">{t('bridgeFile.loading')}</div> : null}
      {state.failure ? (
        <div role="alert">
          <span>{t(fileFailures[state.failure])}</span>{' '}
          <button
            type="button"
            className="bh-memory-view-action"
            onClick={() => void resource.download(name)}
          >
            {t('bridgeMedia.retry')}
          </button>
        </div>
      ) : null}
    </>
  );
}

export function RemoteMessageAttachment({
  attachment: ref,
  channelId,
  messageId,
  fetcher,
  t,
}: {
  attachment: ChannelAttachmentRef;
  channelId: string;
  messageId: string;
  fetcher: AttachmentFetch;
  t: BotHarnessTranslate;
}): ReactElement {
  const path = channelAttachmentUrl(ref, { channelId, messageId }).slice(1);
  return (
    <div className="bh-message-attachment" data-remote-attachment="">
      {inlineImageAttachment(ref.mime) ? (
        <RemoteImage
          path={path}
          name={ref.name}
          galleryKey={galleryImageKey(messageId, ref)}
          fetcher={fetcher}
          t={t}
        />
      ) : (
        <RemoteFile path={path} name={ref.name} size={ref.size} fetcher={fetcher} t={t} />
      )}
    </div>
  );
}
