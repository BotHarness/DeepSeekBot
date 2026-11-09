import type { VoiceDictationReadiness, VoiceDictationView } from './dictation.js';

export type { VoiceDictationReadiness, VoiceDictationView };

export const DICTATION_SAMPLE_RATE = 16_000;
const PUSH_MIN_SAMPLES = DICTATION_SAMPLE_RATE / 5;
const PUSH_MAX_SAMPLES = DICTATION_SAMPLE_RATE * 2;

export interface VoiceDictationPort {
  readiness(): Promise<VoiceDictationReadiness>;
  open(): Promise<VoiceDictationView>;
  push(id: string, pcm: string): Promise<VoiceDictationView>;
  stop(id: string): Promise<VoiceDictationView>;
  cancel(id: string): Promise<VoiceDictationView>;
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

export type DictationProblem = 'denied' | 'missing' | 'failed';

export interface DictationDraft {
  readonly before: string;
  readonly after: string;
}

export interface DictationRecognizerEvents {
  listening(): void;
  text(heard: string): void;
  limit(): void;
  end(): void;
  fail(problem: DictationProblem): void;
}

export interface DictationRecognizer {
  start(events: DictationRecognizerEvents): Promise<void>;
  finish(): Promise<string | undefined>;
  cancel(): void;
  level?(): number;
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
  start(mode: 'toggle' | 'hold', draft?: DictationDraft): void;
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

export interface VoiceDictationCall {
  (method: 'voiceDictation', args: Record<string, unknown>): Promise<unknown>;
}

function dictationField<T>(value: unknown, field: 'readiness' | 'dictation'): T {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const found = record[field] as Record<string, unknown> | undefined;
  const valid =
    field === 'readiness'
      ? typeof found?.['ready'] === 'boolean'
      : typeof found?.['id'] === 'string' && typeof found['text'] === 'string';
  if (!valid) throw new Error('invalid voiceDictation response');
  return found as T;
}

export function createVoiceDictationPort(
  call: VoiceDictationCall,
  target: { slug?: string | undefined } = {},
): VoiceDictationPort {
  const scope = target.slug === undefined ? {} : { slug: target.slug };
  const view = async (args: Record<string, unknown>) =>
    dictationField<VoiceDictationView>(await call('voiceDictation', args), 'dictation');
  return {
    readiness: async () =>
      dictationField<VoiceDictationReadiness>(
        await call('voiceDictation', { kind: 'readiness', ...scope }),
        'readiness',
      ),
    open: () => view({ kind: 'open', ...scope }),
    push: (id, pcm) => view({ kind: 'push', id, pcm }),
    stop: (id) => view({ kind: 'stop', id }),
    cancel: (id) => view({ kind: 'cancel', id }),
  };
}

export function createHostRecognizer(options: {
  port: VoiceDictationPort;
  mic: DictationMic;
}): DictationRecognizer {
  const { port, mic } = options;
  let events: DictationRecognizerEvents | undefined;
  let id: string | undefined;
  let buffer: Int16Array[] = [];
  let buffered = 0;
  let pushing: Promise<void> = Promise.resolve();
  let inFlight = false;
  let closed = false;
  let limited = false;
  let text = '';
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
  const heard = (next: string) => {
    if (next === text) return;
    text = next;
    events?.text(next);
  };
  const close = () => {
    if (closed) return undefined;
    closed = true;
    mic.stop();
    buffer = [];
    buffered = 0;
    const session = id;
    id = undefined;
    return session;
  };
  const fail = () => {
    const session = close();
    if (session !== undefined) void port.cancel(session).catch(() => undefined);
    events?.fail('failed');
  };
  let finishing = false;
  const send = (force: boolean) => {
    if (closed || id === undefined || inFlight || buffered === 0) return;
    if (!force && buffered < PUSH_MIN_SAMPLES) return;
    const session = id;
    const chunk = take();
    inFlight = true;
    pushing = (async () => {
      for (let offset = 0; offset < chunk.length; offset += PUSH_MAX_SAMPLES) {
        const view = await port.push(
          session,
          pcmBase64(chunk.subarray(offset, offset + PUSH_MAX_SAMPLES)),
        );
        if (closed) return;
        heard(view.text);
        if (view.state !== 'listening') throw new Error(view.error?.code ?? view.state);
        if (view.truncated === true && !limited) {
          limited = true;
          void Promise.resolve().then(() => events?.limit());
          return;
        }
      }
    })()
      .catch(() => {
        if (!closed) fail();
      })
      .finally(() => {
        inFlight = false;
        if (!closed && !finishing) send(false);
      });
  };
  return {
    level: () => mic.level?.() ?? 0,
    async start(listener) {
      events = listener;
      const opened = port.open();
      opened.catch(() => undefined);
      try {
        await mic.start((samples) => {
          if (closed) return;
          buffer.push(samples);
          buffered += samples.length;
          send(false);
        });
      } catch (error) {
        close();
        void opened.then((view) => port.cancel(view.id)).catch(() => undefined);
        throw error;
      }
      let view: VoiceDictationView;
      try {
        view = await opened;
      } catch {
        close();
        throw new Error('open-failed');
      }
      if (closed) {
        void port.cancel(view.id).catch(() => undefined);
        return;
      }
      id = view.id;
      listener.listening();
      send(false);
    },
    async finish() {
      if (closed || id === undefined) return text;
      finishing = true;
      mic.stop();
      await pushing;
      if (closed) return text;
      send(true);
      await pushing;
      const session = id;
      if (closed || session === undefined) return text;
      const view = await port.stop(session);
      if (view.state === 'failed') throw new Error(view.error?.code ?? 'asr-failed');
      text = view.text;
      close();
      return view.text;
    },
    cancel() {
      const session = close();
      if (session !== undefined) void port.cancel(session).catch(() => undefined);
    },
  };
}

type RecognizerSource =
  | { readonly recognizer: () => DictationRecognizer | Promise<DictationRecognizer> }
  | { readonly port: VoiceDictationPort; readonly mic: DictationMic };

export function createComposerDictation(
  options: RecognizerSource & { onText(value: string, caret: number): void },
): ComposerDictation {
  const make =
    'recognizer' in options
      ? options.recognizer
      : () => createHostRecognizer({ port: options.port, mic: options.mic });
  const listeners = new Set<() => void>();
  let current: ComposerDictationSnapshot = { status: 'idle', text: '', mode: undefined };
  let run = 0;
  let active: DictationRecognizer | undefined;
  let draft: DictationDraft = { before: '', after: '' };
  let limited = false;
  const set = (next: Partial<ComposerDictationSnapshot>) => {
    current = { ...current, ...next };
    for (const listener of [...listeners]) listener();
  };
  const heard = (text: string) => {
    const trimmed = text.trim();
    if (trimmed === current.text) return;
    set({ text: trimmed });
    const next = spliceDictation(draft.before, trimmed, draft.after);
    options.onText(next.value, next.caret);
  };
  const release = () => {
    run += 1;
    const recognizer = active;
    active = undefined;
    return recognizer;
  };
  const settle = (status: ComposerDictationStatus) => {
    release()?.cancel();
    set({ status, mode: undefined });
  };
  const PROBLEM: Record<DictationProblem, ComposerDictationStatus> = {
    denied: 'denied',
    missing: 'missing',
    failed: 'failed',
  };
  const controller: ComposerDictation = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => current,
    level: () => (current.status === 'listening' ? (active?.level?.() ?? 0) : 0),
    start(mode, from = { before: '', after: '' }) {
      if (dictationActive(current.status)) return;
      release()?.cancel();
      const mine = run;
      draft = from;
      limited = false;
      set({ status: 'starting', text: '', mode });
      const live = () => mine === run;
      void (async () => {
        let recognizer: DictationRecognizer;
        try {
          recognizer = await make();
        } catch {
          if (live()) settle('missing');
          return;
        }
        if (!live()) {
          recognizer.cancel();
          return;
        }
        active = recognizer;
        try {
          await recognizer.start({
            listening: () => {
              if (live() && current.status === 'starting') set({ status: 'listening' });
            },
            text: (text) => {
              if (live() && dictationActive(current.status)) heard(text);
            },
            limit: () => {
              if (!live() || limited) return;
              limited = true;
              void controller.stop();
            },
            end: () => {
              if (live() && current.status !== 'finishing' && dictationActive(current.status))
                settle(limited ? 'limited' : 'idle');
            },
            fail: (problem) => {
              if (live()) settle(PROBLEM[problem]);
            },
          });
        } catch (error) {
          if (!live()) return;
          settle(
            error instanceof DictationMicError
              ? error.code === 'microphone-denied'
                ? 'denied'
                : 'missing'
              : 'failed',
          );
        }
      })();
    },
    setMode(mode) {
      if (dictationActive(current.status) && current.mode !== mode) set({ mode });
    },
    async stop() {
      if (current.status === 'starting') {
        controller.cancel();
        return '';
      }
      if (current.status !== 'listening' || active === undefined) return current.text;
      const mine = run;
      const recognizer = active;
      set({ status: 'finishing' });
      try {
        const final = await recognizer.finish();
        if (mine !== run) return current.text;
        if (final !== undefined) heard(final);
        settle(limited ? 'limited' : 'idle');
      } catch {
        if (mine === run) settle('failed');
      }
      return current.text;
    },
    cancel() {
      const was = dictationActive(current.status);
      release()?.cancel();
      set({ status: 'idle', text: '', mode: undefined });
      if (was) options.onText(`${draft.before}${draft.after}`, draft.before.length);
    },
    dismiss() {
      if (dictationActive(current.status)) return;
      set({ status: 'idle', mode: undefined });
    },
    dispose() {
      release()?.cancel();
      set({ status: 'idle', text: '', mode: undefined });
    },
  };
  return controller;
}
