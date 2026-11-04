import WebSocket from 'ws';

import { VoiceError, type VoiceErrorCode } from './providers.js';

export interface AsrStream {
  push(pcm: Int16Array): void;
  finish(): Promise<{ text: string; latencyMs: number }>;
  cancel(): void;
}

export interface SonioxStreamOptions {
  baseUrl: string;
  key: string | undefined;
  model: string;
  languageHints: readonly string[];
  audio: 'pcm' | 'auto';
  timeoutMs: number;
  signal?: AbortSignal | undefined;
  onText?: ((text: string) => void) | undefined;
  socket?: SonioxSocketFactory | undefined;
  now?: () => number;
}

export type SonioxSocketFactory = (url: string, headers: Record<string, string>) => WebSocket;

const MAX_BUFFERED_BYTES = 9 * 1024 * 1024;
const MAX_TEXT = 4_000;
const CONTROL = new Set(['<fin>', '<end>']);

const defaultSocket: SonioxSocketFactory = (url, headers) =>
  new WebSocket(url, {
    headers,
    followRedirects: false,
    maxPayload: 1024 * 1024,
    handshakeTimeout: 10_000,
  });

export function sonioxUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
  return `${url.href.replace(/\/+$/u, '')}/transcribe-websocket`;
}

export function sonioxLanguageHints(language: string | undefined): string[] {
  const base = language?.split('-')[0]?.toLowerCase();
  if (base === undefined || base === '') return [];
  return base === 'en' ? ['en'] : [base, 'en'];
}

function statusCode(status: number): VoiceErrorCode {
  if (status === 401 || status === 403) return 'provider-unauthorized';
  if (status === 402 || status === 429) return 'provider-rate-limited';
  if (status >= 500) return 'provider-unavailable';
  return 'provider-rejected';
}

function clean(text: string, key: string | undefined): string {
  let out = text.replace(/\s+/gu, ' ').trim();
  if (key !== undefined && key.length >= 4) out = out.split(key).join('[redacted]');
  return out.slice(0, 200);
}

function tidy(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, MAX_TEXT);
}

export function openSonioxStream(
  options: SonioxStreamOptions,
): AsrStream & { pushBytes(bytes: Uint8Array): void } {
  const now = options.now ?? (() => performance.now());
  const headers: Record<string, string> = {};
  if (options.key !== undefined) headers['Authorization'] = `Bearer ${options.key}`;
  const socket = (options.socket ?? defaultSocket)(sonioxUrl(options.baseUrl), headers);
  let open = false;
  let closed = false;
  let failure: VoiceError | undefined;
  let finalText = '';
  let pendingText = '';
  let finishing:
    | {
        started: number;
        resolve: (value: { text: string; latencyMs: number }) => void;
        reject: (error: unknown) => void;
      }
    | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queue: Buffer[] = [];
  let queued = 0;
  let finalizeRequested = false;

  const fail = (error: VoiceError) => {
    if (failure !== undefined || closed) return;
    failure = error;
    settleFailure();
    shut();
  };

  const settleFailure = () => {
    if (finishing === undefined || failure === undefined) return;
    const pending = finishing;
    finishing = undefined;
    clearTimeout(timer);
    pending.reject(failure);
  };

  const shut = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    queue = [];
    options.signal?.removeEventListener('abort', onAbort);
    try {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send('');
        socket.close(1000);
      } else socket.terminate();
    } catch {}
  };

  const onAbort = () => {
    fail(new VoiceError('provider-unavailable', 'The call ended before speech was recognized.'));
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });

  const done = () => {
    if (finishing === undefined) return;
    const pending = finishing;
    finishing = undefined;
    clearTimeout(timer);
    pending.resolve({
      text: tidy(finalText),
      latencyMs: Math.round(now() - pending.started),
    });
    shut();
  };

  const sendFinalize = () => {
    if (!open || finalizeRequested) return;
    finalizeRequested = true;
    socket.send(JSON.stringify({ type: 'finalize' }));
  };

  socket.on('open', () => {
    if (closed) return;
    open = true;
    socket.send(
      JSON.stringify({
        model: options.model,
        ...(options.audio === 'pcm'
          ? { audio_format: 'pcm_s16le', sample_rate: 16_000, num_channels: 1 }
          : { audio_format: 'auto' }),
        ...(options.languageHints.length === 0 ? {} : { language_hints: options.languageHints }),
      }),
    );
    for (const chunk of queue) socket.send(chunk);
    queue = [];
    queued = 0;
    if (finishing !== undefined) sendFinalize();
  });

  socket.on('unexpected-response', (_request, response) => {
    let body = '';
    response.on('data', (chunk: Buffer) => {
      if (body.length < 2_048) body += chunk.toString('utf8');
    });
    response.on('end', () => {
      let detail = body;
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        if (typeof parsed['error_message'] === 'string') detail = parsed['error_message'];
        else if (typeof parsed['message'] === 'string') detail = parsed['message'];
      } catch {}
      const status = response.statusCode ?? 0;
      fail(
        new VoiceError(
          statusCode(status),
          `The provider refused the stream: ${clean(detail, options.key) || `HTTP ${status}`}`,
        ),
      );
    });
  });

  socket.on('message', (data, binary) => {
    if (binary || closed) return;
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(String(data)) as Record<string, unknown>;
    } catch {
      fail(new VoiceError('provider-bad-response', 'The provider sent an unreadable message.'));
      return;
    }
    if (message['error_code'] !== undefined && message['error_code'] !== null) {
      const status = Number(message['error_code']);
      const detail =
        typeof message['error_message'] === 'string' ? message['error_message'] : `error ${status}`;
      fail(
        new VoiceError(
          Number.isFinite(status) ? statusCode(status) : 'provider-rejected',
          `The provider stopped the stream: ${clean(detail, options.key)}`,
        ),
      );
      return;
    }
    let fin = false;
    pendingText = '';
    const tokens = Array.isArray(message['tokens']) ? message['tokens'] : [];
    for (const raw of tokens) {
      const token = raw as Record<string, unknown>;
      const text = typeof token['text'] === 'string' ? token['text'] : '';
      if (text === '<fin>') fin = true;
      if (CONTROL.has(text)) continue;
      if (token['is_final'] === true) {
        if (finalText.length < MAX_TEXT) finalText += text;
      } else pendingText += text;
    }
    if (tokens.length > 0) options.onText?.(tidy(finalText + pendingText));
    if (fin || message['finished'] === true) done();
  });

  socket.on('error', (error) => {
    fail(
      new VoiceError(
        'provider-unavailable',
        `The provider cannot be reached (${error instanceof Error ? error.name : 'network error'}).`,
      ),
    );
  });

  socket.on('close', () => {
    if (closed) return;
    if (finishing !== undefined && failure === undefined) {
      done();
      return;
    }
    fail(new VoiceError('provider-unavailable', 'The provider closed the stream.'));
  });

  const pushBytes = (chunk: Buffer) => {
    if (closed || failure !== undefined || finishing !== undefined) return;
    if (open) {
      socket.send(chunk);
      return;
    }
    queued += chunk.byteLength;
    if (queued > MAX_BUFFERED_BYTES) {
      fail(new VoiceError('provider-timeout', 'The provider did not open the stream in time.'));
      return;
    }
    queue.push(chunk);
  };

  return {
    push(pcm) {
      const chunk = Buffer.alloc(pcm.byteLength);
      for (let index = 0; index < pcm.length; index += 1)
        chunk.writeInt16LE(pcm[index]!, index * 2);
      pushBytes(chunk);
    },
    pushBytes(bytes) {
      pushBytes(Buffer.from(bytes));
    },
    finish() {
      if (failure !== undefined) return Promise.reject(failure);
      if (closed || finishing !== undefined)
        return Promise.reject(new VoiceError('invalid-input', 'This stream is already finished.'));
      return new Promise((resolve, reject) => {
        finishing = { started: now(), resolve, reject };
        timer = setTimeout(
          () =>
            fail(
              new VoiceError(
                'provider-timeout',
                `The provider did not finish within ${Math.round(options.timeoutMs / 1000)} s.`,
              ),
            ),
          options.timeoutMs,
        );
        timer.unref?.();
        sendFinalize();
      });
    },
    cancel() {
      shut();
    },
  };
}

export async function sonioxTranscribeFile(
  options: Omit<SonioxStreamOptions, 'audio' | 'onText'> & {
    audio: Uint8Array;
  },
): Promise<{ text: string; latencyMs: number }> {
  const now = options.now ?? (() => performance.now());
  const started = now();
  const stream = openSonioxStream({ ...options, audio: 'auto' });
  stream.pushBytes(options.audio);
  const result = await stream.finish();
  return { text: result.text, latencyMs: Math.round(now() - started) };
}
