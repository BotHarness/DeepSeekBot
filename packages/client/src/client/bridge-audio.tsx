import { useMemo, useSyncExternalStore, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { MessageAudio } from './message-audio.js';
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
      <MessageAudio
        key={state.url ?? 'unprepared'}
        name={name}
        size={sizeBytes}
        url={state.url}
        downloadUrl={
          './api/botharness/attachment?' +
          new URLSearchParams({ channelId, sourceEventId, attachmentId })
        }
        onError={resource.fail}
        t={t}
      />
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
    </div>
  );
}
