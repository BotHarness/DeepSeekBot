import { BridgeCallError, type BridgeCall } from './bridge.js';
import { openMicrophone } from './mic-device.js';
import { levelDbfs, meterFraction } from './voice-level.js';
import {
  DictationMicError,
  type DictationMic,
  type VoiceDictationPort,
  type VoiceDictationReadiness,
  type VoiceDictationView,
} from '../../../core/src/voice/dictation-client.js';
import { pcm16kFromFloat } from '../../../core/src/voice/pcm.js';

export * from '../../../core/src/voice/dictation-client.js';

export const DICTATION_HOLD_MS = 300;
export const DICTATION_HOLD_SLOP_PX = 6;

async function dictationCall(
  call: BridgeCall,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await call('voiceDictation', payload);
  if (!result.ok)
    throw new BridgeCallError(result.error.code, result.error.message, result.error.details);
  const value = result.value;
  if (typeof value !== 'object' || value === null) throw new Error('invalid voiceDictation');
  return value as Record<string, unknown>;
}

function dictationView(value: Record<string, unknown>): VoiceDictationView {
  const view = value['dictation'] as Record<string, unknown> | undefined;
  if (typeof view?.['id'] !== 'string' || typeof view['text'] !== 'string')
    throw new Error('invalid voiceDictation response');
  return view as unknown as VoiceDictationView;
}

export function createVoiceDictationPort(
  call: BridgeCall,
  target: { slug?: string | undefined },
): VoiceDictationPort {
  const scope = target.slug === undefined ? {} : { slug: target.slug };
  return {
    async readiness() {
      const value = await dictationCall(call, { kind: 'readiness', ...scope });
      const readiness = value['readiness'] as VoiceDictationReadiness | undefined;
      if (typeof readiness?.ready !== 'boolean') throw new Error('invalid voiceDictation response');
      return readiness;
    },
    open: async () => dictationView(await dictationCall(call, { kind: 'open', ...scope })),
    push: async (id, pcm) => dictationView(await dictationCall(call, { kind: 'push', id, pcm })),
    stop: async (id) => dictationView(await dictationCall(call, { kind: 'stop', id })),
    cancel: async (id) => dictationView(await dictationCall(call, { kind: 'cancel', id })),
  };
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
        onPcm(pcm16kFromFloat(channel, audio.sampleRate));
      };
      source.connect(node);
      node.connect(audio.destination);
      if (audio.state === 'suspended') await audio.resume().catch(() => undefined);
    },
    stop: release,
    level: () => level,
  };
}
