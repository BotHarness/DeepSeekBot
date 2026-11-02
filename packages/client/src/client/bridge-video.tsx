import { useMemo, useSyncExternalStore, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { createBridgeVideoResource } from './bridge-video-resource.js';
import { BridgeFile } from './bridge-file.js';
import { formatAudioTime } from './message-audio.js';
import type { BotHarnessTranslate } from './locale.js';

export function BridgeVideo({
  channelId,
  sourceEventId,
  attachmentId,
  name,
  sizeBytes,
  durationMs,
  posterAttachmentId,
  t,
}: {
  channelId: string;
  sourceEventId: string;
  attachmentId: string;
  name: string;
  sizeBytes?: number | undefined;
  durationMs?: number | undefined;
  posterAttachmentId?: string | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const resource = useMemo(
    () => createBridgeVideoResource(channelId, sourceEventId, attachmentId, posterAttachmentId),
    [channelId, sourceEventId, attachmentId, posterAttachmentId],
  );
  const state = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot,
  );
  const failures = {
    unavailable: 'bridgeVideo.unavailable',
    tooLarge: 'bridgeMedia.tooLarge',
    format: 'bridgeVideo.format',
    interrupted: 'bridgeVideo.interrupted',
    failed: 'bridgeMedia.failed',
  } as const;
  return (
    <div className="bh-external-source-video">
      <BridgeFile
        channelId={channelId}
        sourceEventId={sourceEventId}
        attachmentId={attachmentId}
        name={name}
        sizeBytes={sizeBytes}
        t={t}
      />
      {durationMs === undefined ? null : (
        <p>
          {t('bridgeVideo.platformDuration')}: {formatAudioTime(durationMs / 1000)}
        </p>
      )}
      {state.url ? (
        <video
          controls
          playsInline
          preload="metadata"
          src={state.url}
          poster={state.posterUrl}
          aria-label={t('im.videoPlayer') + ': ' + name}
          onError={() => resource.fail(state.url!)}
        />
      ) : (
        <Button
          variant="primary"
          disabled={state.loading === true}
          onClick={() => void resource.prepare()}
        >
          {state.loading
            ? t('im.videoLoading')
            : state.failure
              ? t('im.videoRetry')
              : t('bridgeVideo.prepare')}
        </Button>
      )}
      {state.posterUrl ? (
        <img
          hidden
          src={state.posterUrl}
          alt=""
          onError={() => resource.failPoster(state.posterUrl!)}
        />
      ) : null}
      <p>{t('bridgeVideo.hint')}</p>
      {!posterAttachmentId ? (
        <p role="status">{t('bridgeVideo.noPoster')}</p>
      ) : state.posterFailure ? (
        <p role="status">{t('bridgeVideo.posterUnavailable')}</p>
      ) : null}
      {state.failure ? <p role="alert">{t(failures[state.failure])}</p> : null}
    </div>
  );
}
