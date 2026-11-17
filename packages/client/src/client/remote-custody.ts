import type { HostCarrier, HostSocket } from '@botharness/host-protocol/carrier';
import { ConnectRefused } from '@botharness/host-client/encrypted-carrier';
import { isCustodyHandle, type SavedHost } from '@botharness/host-client/hosts';

const CUSTODY_PATH = './api/botharness/remote-custody';
const CUSTODY_STREAM_PATH = './api/botharness/remote-custody/stream';

function failure(value: unknown): Error {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const code = typeof record['code'] === 'string' ? record['code'] : 'custody-request-failed';
  return record['refused'] === true ? new ConnectRefused(code) : new Error(code);
}

async function call(body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(CUSTODY_PATH, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error('custody-request-failed');
  }
  if (!response.ok) throw failure(value);
  return value;
}

function base64(bytes: Uint8Array): string {
  let text = '';
  for (let index = 0; index < bytes.length; index += 0x8000)
    text += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(text);
}

function bytesOf(value: string): Uint8Array {
  const text = atob(value);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index);
  return bytes;
}

export async function sealRemoteHost(host: SavedHost): Promise<SavedHost> {
  const value = (await call({ action: 'seal', host })) as { host?: SavedHost };
  if (!value.host || !isCustodyHandle(value.host.credential))
    throw new Error('custody-request-failed');
  return value.host;
}

export async function forgetRemoteHost(handle: string): Promise<void> {
  if (isCustodyHandle(handle)) await call({ action: 'forget', handle });
}

export async function custodyResponse(
  handle: string,
  url: string,
  init: { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: string | Blob },
  signal?: AbortSignal,
): Promise<{ status: number; contentType: string; bytes: Uint8Array }> {
  const value = (await call(
    {
      action: 'request',
      handle,
      url,
      method: init.method,
      ...(init.headers ? { headers: init.headers } : {}),
      ...(init.body === undefined
        ? {}
        : typeof init.body === 'string'
          ? { body: init.body }
          : { bodyBase64: base64(new Uint8Array(await init.body.arrayBuffer())) }),
    },
    signal,
  )) as { status?: unknown; contentType?: unknown; body?: unknown };
  if (typeof value.status !== 'number' || typeof value.body !== 'string')
    throw new Error('custody-request-failed');
  return {
    status: value.status,
    contentType:
      typeof value.contentType === 'string' ? value.contentType : 'application/octet-stream',
    bytes: bytesOf(value.body),
  };
}

export function custodyCarrier(handle: string, raw: HostCarrier): HostCarrier {
  return {
    ...(raw.appVersion === undefined ? {} : { appVersion: raw.appVersion }),
    ...(raw.randomBytes ? { randomBytes: raw.randomBytes } : {}),
    async request(url, init) {
      if (init.signal.aborted) throw new Error('request-cancelled');
      const response = await custodyResponse(handle, url, init, init.signal);
      return {
        status: response.status,
        contentType: response.contentType,
        bytes: async () => response.bytes,
        text: async () => new TextDecoder().decode(response.bytes),
      };
    },
    openSocket(url, events, headers): HostSocket {
      let socketId: string | undefined;
      let done = false;
      const controller = new AbortController();
      const queued: string[] = [];
      let opened = false;
      let chain: Promise<unknown> = Promise.resolve();
      const closed = (reason: string) => {
        if (done) return;
        done = true;
        controller.abort();
        events.closed(reason);
      };
      const send = (text: string) => {
        if (done) return;
        if (socketId === undefined || !opened) {
          queued.push(text);
          return;
        }
        const socket = socketId;
        chain = chain
          .then(() => call({ action: 'send', socket, text }))
          .catch(() => closed('channel-disconnected'));
      };
      void (async () => {
        try {
          const value = (await call(
            { action: 'socket', handle, url, ...(headers ? { headers } : {}) },
            controller.signal,
          )) as { socket?: unknown };
          if (typeof value.socket !== 'string') throw new Error('custody-request-failed');
          socketId = value.socket;
          const response = await fetch(
            `${CUSTODY_STREAM_PATH}?socket=${encodeURIComponent(socketId)}`,
            { credentials: 'include', signal: controller.signal },
          );
          if (!response.ok || !response.body) throw new Error('channel-disconnected');
          const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = '';
          for (;;) {
            const { value: chunk, done: ended } = await reader.read();
            if (ended) break;
            buffer += chunk;
            let boundary = buffer.indexOf('\n\n');
            while (boundary >= 0) {
              const frame = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              boundary = buffer.indexOf('\n\n');
              const event = /^event: (.+)$/mu.exec(frame)?.[1];
              const data = /^data: (.+)$/mu.exec(frame)?.[1];
              if (event === undefined || data === undefined) continue;
              const payload = JSON.parse(data) as { text?: unknown; reason?: unknown };
              if (event === 'open') {
                opened = true;
                for (const text of queued.splice(0)) send(text);
                events.open();
              } else if (event === 'message' && typeof payload.text === 'string')
                events.message(payload.text);
              else if (event === 'closed')
                return closed(
                  typeof payload.reason === 'string' ? payload.reason : 'channel-disconnected',
                );
            }
          }
          closed('channel-disconnected');
        } catch (error) {
          closed(error instanceof Error && error.message ? error.message : 'channel-disconnected');
        }
      })();
      return {
        send,
        close: () => {
          if (socketId !== undefined)
            void call({ action: 'close', socket: socketId }).catch(() => {});
          closed('closed');
        },
      };
    },
  };
}
