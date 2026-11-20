import {
  AudioModule,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';

import {
  DictationMicError,
  type DictationMic,
} from '../../../../packages/core/src/voice/dictation-client';
import { PCM_SAMPLE_RATE, pcm16kFromInt16 } from '../../../../packages/core/src/voice/pcm';

async function microphoneAllowed(): Promise<boolean> {
  if ((await getRecordingPermissionsAsync()).granted) return true;
  return (await requestRecordingPermissionsAsync()).granted;
}

export function createDictationMic(): DictationMic {
  type Stream = InstanceType<typeof AudioModule.AudioStream>;
  let stream: Stream | undefined;
  let subscription: { remove(): void } | undefined;
  let epoch = 0;
  const release = () => {
    epoch += 1;
    subscription?.remove();
    subscription = undefined;
    const current = stream;
    stream = undefined;
    if (current === undefined) return;
    try {
      current.stop();
    } catch {}
    current.release();
  };
  return {
    async start(onPcm) {
      release();
      const generation = epoch;
      if (!(await microphoneAllowed().catch(() => false)))
        throw new DictationMicError('microphone-denied');
      if (generation !== epoch) return;
      let opened: Stream;
      try {
        opened = new AudioModule.AudioStream({
          sampleRate: PCM_SAMPLE_RATE,
          channels: 1,
          encoding: 'int16',
        });
      } catch {
        throw new DictationMicError('microphone-missing');
      }
      stream = opened;
      subscription = opened.addListener('audioStreamBuffer', (buffer) => {
        if (stream === opened)
          onPcm(
            pcm16kFromInt16(
              new Int16Array(buffer.data.slice(0)),
              buffer.sampleRate,
              buffer.channels,
            ),
          );
      });
      try {
        await opened.start();
      } catch {
        if (stream === opened) release();
        throw new DictationMicError('microphone-missing');
      }
    },
    stop: release,
  };
}
