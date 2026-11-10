import { useMessageHost } from './message-host.js';
import { useMemo, useSyncExternalStore, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { MessageAudio } from './message-audio.js';
import { downloadFromUrl, useAttachmentDownloadMenu } from './attachment-download-menu.js';
import { createBridgeAudioResource } from './bridge-audio-resource.js';
import { createBridgeFileResource } from './bridge-file-resource.js';
import type { BotHarnessTranslate } from './locale.js';

export function BridgeAudio({
  channelId,
  sourceEventId,
  attachmentId,
  name,
  sizeBytes,
  t,
}: {
  channelId: string;
  sourceEventId: string;
  attachmentId: string;
  name: string;
  sizeBytes?: number | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const host = useMessageHost();
  const resource = useMemo(
    () => createBridgeAudioResource(channelId, sourceEventId, attachmentId, host),
    [channelId, sourceEventId, attachmentId, host],
  );
  const state = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot,
  );
  const download = useMemo(
    () => createBridgeFileResource(channelId, sourceEventId, attachmentId, host),
    [channelId, sourceEventId, attachmentId, host],
  );
  const subscribeDownload = useMemo(
    () => (host === undefined ? () => () => {} : download.subscribe),
    [host, download],
  );
  const downloadState = useSyncExternalStore(
    subscribeDownload,
    download.getSnapshot,
    download.getSnapshot,
  );
  const failures = {
    unavailable: 'im.voiceAudioUnavailable',
    format: 'im.voiceAudioFormat',
    tooLarge: 'im.voiceAudioTooLarge',
    interrupted: 'im.voiceAudioInterrupted',
    failed: 'im.voiceAudioUnavailable',
  } as const;
  const menu = useAttachmentDownloadMenu(
    host === undefined
      ? () =>
          downloadFromUrl(
            './api/botharness/attachment?' +
              new URLSearchParams({ channelId, sourceEventId, attachmentId }),
            name,
          )
      : () => void download.download(name),
    t,
  );
  return (
    <div className="bh-external-source-audio" onContextMenu={menu.open} onKeyDown={menu.onKey}>
      <MessageAudio
        key={state.url ?? 'unprepared'}
        name={name}
        seed={`${name}:${sizeBytes ?? 0}`}
        url={state.url}
        onError={resource.fail}
        t={t}
      />
      {menu.menu}
      {state.url ? null : (
        <Button
          variant="primary"
          disabled={state.loading === true}
          onClick={() => void resource.prepare()}
        >
          {state.loading
            ? t('im.voiceAudioPreparing')
            : state.failure
              ? t('im.voiceAudioRetry')
              : t('im.voiceAudioPrepare')}
        </Button>
      )}
      <p>{t('im.voiceAudioHint')}</p>
      {state.failure ? <p role="alert">{t(failures[state.failure])}</p> : null}
      {downloadState.failure ? <p role="alert">{t('bridgeFile.failed')}</p> : null}
    </div>
  );
}
