import { BridgeCallError, type BridgeCall } from './bridge.js';
import { openMicrophone } from './mic-device.js';
import { levelDbfs, meterFraction } from './voice-level.js';
import {
  DICTATION_SAMPLE_RATE as SAMPLE_RATE,
  DictationMicError,
  type DictationMic,
  createVoiceDictationPort as createSharedDictationPort,
  type VoiceDictationPort,
} from '../../../core/src/voice/dictation-client.js';

export * from '../../../core/src/voice/dictation-client.js';

export const DICTATION_HOLD_MS = 300;
export const DICTATION_HOLD_SLOP_PX = 6;

export function createVoiceDictationPort(
  call: BridgeCall,
  target: { slug?: string | undefined },
): VoiceDictationPort {
  return createSharedDictationPort(async (method, args) => {
    const result = await call(method, args);
    if (!result.ok)
      throw new BridgeCallError(result.error.code, result.error.message, result.error.details);
    return result.value;
  }, target);
}

export function downsampleTo16k(input: Float32Array, rate: number): Int16Array {
  const ratio = rate / SAMPLE_RATE;
  const length = Math.floor(input.length / ratio);
  const out = new Int16Array(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.max(start + 1, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let at = start; at < end && at < input.length; at += 1) sum += input[at]!;
    const sample = Math.max(-1, Math.min(1, sum / (end - start)));
    out[index] = Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff);
  }
  return out;
}

export function createBrowserDictationMic(
  devices: () => MediaDevices | undefined = () => globalThis.navigator?.mediaDevices,
): DictationMic {
  let stream: MediaStream | undefined;
  let context: AudioContext | undefined;
  let processor: ScriptProcessorNode | undefined;
  let epoch = 0;
  let level = 0;
  const release = () => {
    epoch += 1;
    level = 0;
    if (processor !== undefined) processor.onaudioprocess = null;
    processor?.disconnect();
    processor = undefined;
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = undefined;
    void context?.close().catch(() => undefined);
    context = undefined;
  };
  return {
    async start(onPcm) {
      release();
      const media = devices();
      if (media?.getUserMedia === undefined) throw new DictationMicError('microphone-missing');
      const generation = epoch;
      const audio = typeof AudioContext === 'function' ? new AudioContext() : undefined;
      context = audio;
      void audio?.resume().catch(() => undefined);
      let acquired: MediaStream;
      try {
        acquired = (await openMicrophone(media)).stream;
      } catch (error) {
        if (context === audio) context = undefined;
        void audio?.close().catch(() => undefined);
        const name = (error as { name?: unknown } | undefined)?.name;
        throw new DictationMicError(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'microphone-denied'
            : 'microphone-missing',
        );
      }
      if (generation !== epoch) {
        for (const track of acquired.getTracks()) track.stop();
        return;
      }
      if (audio === undefined) {
        for (const track of acquired.getTracks()) track.stop();
        throw new DictationMicError('microphone-missing');
      }
      stream = acquired;
      const owned = acquired;
      const source = audio.createMediaStreamSource(owned);
      const node = audio.createScriptProcessor(4096, 1, 1);
      processor = node;
      node.onaudioprocess = (event) => {
        if (stream !== owned) return;
        const channel = event.inputBuffer.getChannelData(0);
        level = meterFraction(levelDbfs(channel));
        onPcm(downsampleTo16k(channel, audio.sampleRate));
      };
      source.connect(node);
      node.connect(audio.destination);
      if (audio.state === 'suspended') await audio.resume().catch(() => undefined);
    },
    stop: release,
    level: () => level,
  };
}
