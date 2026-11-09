import {
  AudioModule,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  type AudioStreamBuffer,
} from 'expo-audio';

import {
  DICTATION_SAMPLE_RATE,
  DictationMicError,
  type DictationMic,
} from '../../../../packages/core/src/voice/dictation-client';

export function pcm16kFrom(buffer: AudioStreamBuffer): Int16Array {
  const raw = new Int16Array(buffer.data.slice(0));
  const channels = Math.max(1, buffer.channels);
  const frames = Math.floor(raw.length / channels);
  const ratio = buffer.sampleRate / DICTATION_SAMPLE_RATE;
  if (channels === 1 && ratio === 1) return raw;
  const length = Math.floor(frames / ratio);
  const out = new Int16Array(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(frames, Math.max(start + 1, Math.floor((index + 1) * ratio)));
    let sum = 0;
    for (let frame = start; frame < end; frame += 1)
      for (let channel = 0; channel < channels; channel += 1)
        sum += raw[frame * channels + channel]!;
    out[index] = Math.round(sum / ((end - start) * channels));
  }
  return out;
}

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
          sampleRate: DICTATION_SAMPLE_RATE,
          channels: 1,
          encoding: 'int16',
        });
      } catch {
        throw new DictationMicError('microphone-missing');
      }
      stream = opened;
      subscription = opened.addListener('audioStreamBuffer', (buffer) => {
        if (stream === opened) onPcm(pcm16kFrom(buffer));
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
