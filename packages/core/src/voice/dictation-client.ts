import type { VoiceDictationReadiness, VoiceDictationView } from './dictation.js';
import { PCM_SAMPLE_RATE, pcmToBase64 } from './pcm.js';

export type { VoiceDictationReadiness, VoiceDictationView };

export const DICTATION_SAMPLE_RATE = PCM_SAMPLE_RATE;
const PUSH_MIN_SAMPLES = DICTATION_SAMPLE_RATE / 5;
const PUSH_MAX_SAMPLES = DICTATION_SAMPLE_RATE * 2;

export interface VoiceDictationPort {
  readiness(): Promise<VoiceDictationReadiness>;
  open(): Promise<VoiceDictationView>;
  push(id: string, pcm: string): Promise<VoiceDictationView>;
  stop(id: string): Promise<VoiceDictationView>;
  cancel(id: string): Promise<VoiceDictationView>;
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

export function spliceDictation(
  before: string,
  heard: string,
  after: string,
): { value: string; caret: number } {
  const head = withDictation(before, heard);
  if (after === '' || head === before) return { value: `${head}${after}`, caret: head.length };
  const last = head.at(-1) ?? '';
  const next = after[0] ?? '';
  const tight = /[\s\p{P}]/u.test(next) || /\s/u.test(last) || TIGHT.test(last) || TIGHT.test(next);
  return { value: `${head}${tight ? '' : ' '}${after}`, caret: head.length };
}

export interface DictationMic {
  start(onPcm: (samples: Int16Array) => void): Promise<void>;
  stop(): void;
  level?(): number;
}

export class DictationMicError extends Error {
  constructor(readonly code: 'microphone-denied' | 'microphone-missing') {
    super(code);
  }
}

export type ComposerDictationStatus =
  | 'idle'
  | 'starting'
  | 'listening'
  | 'finishing'
  | 'limited'
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
  level(): number;
}

export function dictationActive(status: ComposerDictationStatus): boolean {
  return status === 'starting' || status === 'listening' || status === 'finishing';
}

export function createComposerDictation(options: {
  port: VoiceDictationPort;
  mic: DictationMic;
  onText(text: string): void;
}): ComposerDictation {
  const mic = options.mic;
  const listeners = new Set<() => void>();
  let current: ComposerDictationSnapshot = { status: 'idle', text: '', mode: undefined };
  let run = 0;
  let id: string | undefined;
  let buffer: Int16Array[] = [];
  let buffered = 0;
  let pushing: Promise<void> = Promise.resolve();
  let inFlight = false;
  let limited = false;
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
          pcmToBase64(chunk.subarray(offset, offset + PUSH_MAX_SAMPLES)),
        );
        if (mine !== run) return;
        heard(view.text);
        if (view.state !== 'listening') throw new Error(view.error?.code ?? view.state);
        if (view.truncated === true && !limited) {
          limited = true;
          void Promise.resolve().then(() => controller.stop());
          return;
        }
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
  const controller: ComposerDictation = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => current,
    level: () => (current.status === 'listening' ? (mic.level?.() ?? 0) : 0),
    start(mode) {
      if (dictationActive(current.status)) return;
      reset();
      limited = false;
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
          void opened.then((view) => options.port.cancel(view.id)).catch(() => undefined);
          if (mine !== run) return;
          reset();
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
        set({ status: limited ? 'limited' : 'idle', mode: undefined });
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
  return controller;
}
