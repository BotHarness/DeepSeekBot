import { useMemo, useSyncExternalStore, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { BridgeFile } from './bridge-file.js';
import { createBridgeAudioResource } from './bridge-audio-resource.js';
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
  const resource = useMemo(
    () => createBridgeAudioResource(channelId, sourceEventId, attachmentId),
    [channelId, sourceEventId, attachmentId],
  );
  const state = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot,
  );
  const failures = {
    unavailable: 'im.voiceAudioUnavailable',
    format: 'im.voiceAudioFormat',
    tooLarge: 'im.voiceAudioTooLarge',
    interrupted: 'im.voiceAudioInterrupted',
    failed: 'im.voiceAudioUnavailable',
  } as const;
  return (
    <div className="bh-external-source-audio">
      <BridgeFile
        channelId={channelId}
        sourceEventId={sourceEventId}
        attachmentId={attachmentId}
        name={name}
        sizeBytes={sizeBytes}
        t={t}
      />
      {state.url ? (
        <audio
          controls
          preload="none"
          src={state.url}
          aria-label={t('im.voiceAudioPlayer')}
          onError={resource.fail}
        />
      ) : (
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
    </div>
  );
}
