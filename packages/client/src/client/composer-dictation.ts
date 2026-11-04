import type {
  VoiceDictationReadiness,
  VoiceDictationView,
} from '../../../core/src/voice/dictation.js';
import { BridgeCallError, type BridgeCall } from './bridge.js';
import { CALL_AUDIO_CONSTRAINTS } from './call-media.js';

export type { VoiceDictationReadiness, VoiceDictationView };

export const DICTATION_HOLD_MS = 300;
export const DICTATION_HOLD_SLOP_PX = 6;
const SAMPLE_RATE = 16_000;
const PUSH_MIN_SAMPLES = SAMPLE_RATE / 5;
const PUSH_MAX_SAMPLES = SAMPLE_RATE * 2;

export interface VoiceDictationPort {
  readiness(): Promise<VoiceDictationReadiness>;
  open(): Promise<VoiceDictationView>;
  push(id: string, pcm: string): Promise<VoiceDictationView>;
  stop(id: string): Promise<VoiceDictationView>;
  cancel(id: string): Promise<VoiceDictationView>;
}

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

export function pcmBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index += 1)
    view.setInt16(index * 2, samples[index]!, true);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

const TIGHT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}　-〿＀-￯]/u;

export function withDictation(base: string, heard: string): string {
  const text = heard.trim();
  if (text === '') return base;
  if (base.trim() === '') return text;
  const last = base.at(-1) ?? '';
  return /\s/u.test(last) || TIGHT.test(last) || TIGHT.test(text[0] ?? '')
    ? `${base}${text}`
    : `${base} ${text}`;
}

export interface DictationMic {
  start(onPcm: (samples: Int16Array) => void): Promise<void>;
  stop(): void;
}

export class DictationMicError extends Error {
  constructor(readonly code: 'microphone-denied' | 'microphone-missing') {
    super(code);
  }
}

export function createBrowserDictationMic(
  devices: () => MediaDevices | undefined = () => globalThis.navigator?.mediaDevices,
): DictationMic {
  let stream: MediaStream | undefined;
  let context: AudioContext | undefined;
  let processor: ScriptProcessorNode | undefined;
  const release = () => {
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
      try {
        stream = await media.getUserMedia({ audio: CALL_AUDIO_CONSTRAINTS, video: false });
      } catch (error) {
        const name = (error as { name?: unknown } | undefined)?.name;
        throw new DictationMicError(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'microphone-denied'
            : 'microphone-missing',
        );
      }
      const owned = stream;
      const audio = new AudioContext();
      context = audio;
      const source = audio.createMediaStreamSource(owned);
      const node = audio.createScriptProcessor(4096, 1, 1);
      processor = node;
      node.onaudioprocess = (event) => {
        if (stream !== owned) return;
        onPcm(downsampleTo16k(event.inputBuffer.getChannelData(0), audio.sampleRate));
      };
      source.connect(node);
      node.connect(audio.destination);
      if (audio.state === 'suspended') await audio.resume().catch(() => undefined);
    },
    stop: release,
  };
}

export type ComposerDictationStatus =
  | 'idle'
  | 'starting'
  | 'listening'
  | 'finishing'
  | 'denied'
  | 'missing'
  | 'failed';

export interface ComposerDictationSnapshot {
  readonly status: ComposerDictationStatus;
  readonly text: string;
  readonly mode: 'toggle' | 'hold' | undefined;
}

export interface ComposerDictation {
  subscribe(listener: () => void): () => void;
  snapshot(): ComposerDictationSnapshot;
  start(mode: 'toggle' | 'hold'): void;
  setMode(mode: 'toggle' | 'hold'): void;
  stop(): Promise<string>;
  cancel(): void;
  dismiss(): void;
  dispose(): void;
}

export function dictationActive(status: ComposerDictationStatus): boolean {
  return status === 'starting' || status === 'listening' || status === 'finishing';
}

export function createComposerDictation(options: {
  port: VoiceDictationPort;
  mic?: DictationMic;
  onText(text: string): void;
}): ComposerDictation {
  const mic = options.mic ?? createBrowserDictationMic();
  const listeners = new Set<() => void>();
  let current: ComposerDictationSnapshot = { status: 'idle', text: '', mode: undefined };
  let run = 0;
  let id: string | undefined;
  let buffer: Int16Array[] = [];
  let buffered = 0;
  let pushing: Promise<void> = Promise.resolve();
  let inFlight = false;
  const set = (next: Partial<ComposerDictationSnapshot>) => {
    current = { ...current, ...next };
    for (const listener of [...listeners]) listener();
  };
  const heard = (text: string) => {
    if (text === current.text) return;
    set({ text });
    options.onText(text);
  };
  const take = (): Int16Array => {
    const out = new Int16Array(buffered);
    let offset = 0;
    for (const part of buffer) {
      out.set(part, offset);
      offset += part.length;
    }
    buffer = [];
    buffered = 0;
    return out;
  };
  const send = (mine: number, force: boolean) => {
    if (id === undefined || inFlight || buffered === 0) return;
    if (!force && buffered < PUSH_MIN_SAMPLES) return;
    const session = id;
    const chunk = take();
    inFlight = true;
    pushing = (async () => {
      for (let offset = 0; offset < chunk.length; offset += PUSH_MAX_SAMPLES) {
        const view = await options.port.push(
          session,
          pcmBase64(chunk.subarray(offset, offset + PUSH_MAX_SAMPLES)),
        );
        if (mine !== run) return;
        heard(view.text);
        if (view.state === 'failed') throw new Error(view.error?.code ?? 'asr-failed');
      }
    })()
      .catch(() => {
        if (mine === run) fail();
      })
      .finally(() => {
        inFlight = false;
        if (mine === run && current.status === 'listening') send(mine, false);
      });
  };
  const reset = () => {
    run += 1;
    mic.stop();
    buffer = [];
    buffered = 0;
    const session = id;
    id = undefined;
    return session;
  };
  const fail = () => {
    const session = reset();
    if (session !== undefined) void options.port.cancel(session).catch(() => undefined);
    set({ status: 'failed', mode: undefined });
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => current,
    start(mode) {
      if (dictationActive(current.status)) return;
      reset();
      const mine = run;
      set({ status: 'starting', text: '', mode });
      const opened = options.port.open();
      opened.catch(() => undefined);
      void (async () => {
        try {
          await mic.start((samples) => {
            if (mine !== run) return;
            buffer.push(samples);
            buffered += samples.length;
            send(mine, false);
          });
        } catch (error) {
          if (mine !== run) return;
          reset();
          void opened.then((view) => options.port.cancel(view.id)).catch(() => undefined);
          set({
            status:
              error instanceof DictationMicError && error.code === 'microphone-denied'
                ? 'denied'
                : 'missing',
            mode: undefined,
          });
          return;
        }
        try {
          const view = await opened;
          if (mine !== run) {
            void options.port.cancel(view.id).catch(() => undefined);
            return;
          }
          id = view.id;
          set({ status: 'listening' });
          send(mine, false);
        } catch {
          if (mine === run) fail();
        }
      })();
    },
    setMode(mode) {
      if (dictationActive(current.status) && current.mode !== mode) set({ mode });
    },
    async stop() {
      if (current.status === 'starting') {
        this.cancel();
        return '';
      }
      if (current.status !== 'listening') return current.text;
      const mine = run;
      mic.stop();
      set({ status: 'finishing' });
      await pushing;
      if (mine !== run) return current.text;
      send(mine, true);
      await pushing;
      const session = id;
      if (mine !== run || session === undefined) return current.text;
      try {
        const view = await options.port.stop(session);
        if (mine !== run) return current.text;
        if (view.state === 'failed') throw new Error(view.error?.code ?? 'asr-failed');
        heard(view.text);
        reset();
        set({ status: 'idle', mode: undefined });
      } catch {
        if (mine === run) fail();
      }
      return current.text;
    },
    cancel() {
      const session = reset();
      if (session !== undefined) void options.port.cancel(session).catch(() => undefined);
      set({ status: 'idle', text: '', mode: undefined });
    },
    dismiss() {
      if (dictationActive(current.status)) return;
      set({ status: 'idle', mode: undefined });
    },
    dispose() {
      this.cancel();
      listeners.clear();
    },
  };
}
