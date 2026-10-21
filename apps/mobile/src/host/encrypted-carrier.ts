import {
  ConnectChannel,
  CONNECT_CHANNEL_PATH,
} from '../../../../packages/core/src/devices/noise/channel';
import type { HostCarrier, HostResponse, HostSocket, HostSocketEvents } from './carrier';
import type { HostEncryption } from './hosts';
import { isConnectRoute, socketOrigin } from './route';

export class ConnectRefused extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function keyBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/u.test(hex)) throw new Error('host-key-invalid');
  return Uint8Array.from(hex.match(/../gu)!, (value) => Number.parseInt(value, 16));
}
export function keyHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}
export function secureRandom(carrier: HostCarrier): Uint8Array {
  const value = carrier.randomBytes?.() ?? globalThis.crypto?.getRandomValues(new Uint8Array(32));
  if (!value || value.length !== 32) throw new Error('secure-random-unavailable');
  return value;
}
export function base64Bytes(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (value) => value.charCodeAt(0));
}
export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 8192)
    binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(binary);
}

export function openNoiseSocket(options: {
  origin: string;
  hostId: string;
  encryption: HostEncryption;
  raw: HostCarrier;
  message(value: Record<string, unknown>): void;
  closed(reason: string): void;
}) {
  const channel = new ConnectChannel({
    role: 'initiator',
    hostId: options.hostId,
    hostKey: keyBytes(options.encryption.hostKey),
    staticKey: keyBytes(options.encryption.deviceKey),
    ephemeralKey: secureRandom(options.raw),
  });
  let done = false;
  let nextCredit = 0,
    outstandingBytes = 0;
  const credits = new Map<number, number>();
  let resolve!: () => void, reject!: (error: Error) => void;
  const ready = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const fail = (reason: string) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    channel.close();
    credits.clear();
    outstandingBytes = 0;
    socket.close();
    reject(new Error(reason));
    options.closed(reason);
  };
  const timer = setTimeout(() => fail('channel-timeout'), 10_000);
  const socket = options.raw.openSocket(`${socketOrigin(options.origin)}${CONNECT_CHANNEL_PATH}`, {
    open: () => {
      try {
        socket.send(channel.start());
      } catch {
        fail('channel-handshake-failed');
      }
    },
    message: (wire) => {
      try {
        const result = channel.receive(wire);
        if (result.reply) socket.send(result.reply);
        if (result.ready) {
          clearTimeout(timer);
          resolve();
        }
        if (result.message !== undefined) {
          const value: unknown = JSON.parse(result.message);
          if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('channel-message-invalid');
          const message = value as Record<string, unknown>;
          if (message['type'] === 'ack') {
            const credit = message['credit'];
            const bytes = typeof credit === 'number' ? credits.get(credit) : undefined;
            if (bytes === undefined) throw new Error('channel-credit-invalid');
            credits.delete(credit as number);
            outstandingBytes -= bytes;
          } else options.message(message);
        }
      } catch {
        fail('channel-authentication-failed');
      }
    },
    closed: (reason) => fail(reason || 'channel-disconnected'),
  });
  return {
    ready,
    send(value: unknown): void {
      if (done) throw new Error('channel-disconnected');
      try {
        if (credits.size >= 256 || ++nextCredit >= 2 ** 32)
          throw new Error('channel-credit-exhausted');
        const frames = channel.send(
          JSON.stringify({ ...(value as Record<string, unknown>), credit: nextCredit }),
        );
        const size = frames.reduce((total, wire) => total + wire.length, 0);
        if (outstandingBytes + size > 20 * 1024 * 1024) throw new Error('channel-busy');
        outstandingBytes += size;
        credits.set(nextCredit, size);
        for (const wire of frames) {
          if ((socket.bufferedAmount ?? 0) + wire.length > 20 * 1024 * 1024)
            throw new Error('channel-busy');
          socket.send(wire);
        }
      } catch (error) {
        fail('channel-send-failed');
        throw error;
      }
    },
    close: () => fail('channel-disconnected'),
  };
}

interface Session {
  ready: Promise<void>;
  send(value: unknown): void;
  close(): void;
  requests: Map<string, { resolve(value: HostResponse): void; reject(error: Error): void }>;
  streams: Map<string, HostSocketEvents>;
}
export function encryptedCarrier(options: {
  raw: HostCarrier;
  hostId: string;
  credential: string;
  encryption?: HostEncryption;
}): HostCarrier {
  const sessions = new Map<string, Session>();
  let next = 0;
  const session = (origin: string): Session => {
    if (!options.encryption || options.encryption.protocol !== 'connect-noise-xk-v1')
      throw new ConnectRefused('host-key-required');
    const existing = sessions.get(origin);
    if (existing) return existing;
    const requests: Session['requests'] = new Map(),
      streams: Session['streams'] = new Map();
    let resolve!: () => void, reject!: (error: Error) => void;
    const ready = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    let settled = false;
    const socket = openNoiseSocket({
      ...options,
      origin,
      encryption: options.encryption,
      closed: (reason) => {
        sessions.delete(origin);
        clearTimeout(deadline);
        clearInterval(heartbeat);
        const error =
          reason === 'channel-authentication-failed'
            ? new ConnectRefused(reason)
            : new Error(reason);
        reject(error);
        for (const item of requests.values()) item.reject(error);
        for (const stream of streams.values()) stream.closed(reason);
        requests.clear();
        streams.clear();
      },
      message: (value) => {
        if (value['type'] === 'refused') {
          reject(new ConnectRefused(String(value['code'])));
          socket.close();
          return;
        }
        if (!settled) {
          if (value['type'] !== 'admitted') throw new Error('channel-admission-invalid');
          settled = true;
          clearTimeout(deadline);
          resolve();
          return;
        }
        if (value['type'] === 'pong') return;
        const id = String(value['id']);
        if (value['type'] === 'response') {
          const pending = requests.get(id);
          if (!pending) return;
          if (typeof value['status'] !== 'number' || typeof value['body'] !== 'string')
            throw new Error('channel-response-invalid');
          const bytes = base64Bytes(value['body']);
          requests.delete(id);
          pending.resolve({
            status: value['status'],
            contentType:
              typeof value['contentType'] === 'string'
                ? value['contentType']
                : 'application/octet-stream',
            bytes: async () => bytes,
            text: async () => new TextDecoder().decode(bytes),
          });
        } else if (value['type'] === 'opened') streams.get(id)?.open();
        else if (value['type'] === 'message' && typeof value['text'] === 'string')
          streams.get(id)?.message(value['text']);
        else if (value['type'] === 'closed') {
          streams.get(id)?.closed('channel-stream-closed');
          streams.delete(id);
        } else throw new Error('channel-response-invalid');
      },
    });
    const deadline = setTimeout(() => {
      reject(new Error('channel-admission-timeout'));
      socket.close();
    }, 15_000);
    void socket.ready.then(
      () => {
        try {
          socket.send({ type: 'admit', credential: options.credential });
        } catch {
          socket.close();
        }
      },
      (error) => {
        reject(error);
        socket.close();
      },
    );
    const heartbeat = setInterval(() => {
      if (settled) {
        try {
          socket.send({ type: 'ping' });
        } catch {}
      }
    }, 20_000);
    const current: Session = {
      ready,
      requests,
      streams,
      send: (value) => socket.send(value),
      close: socket.close,
    };
    sessions.set(origin, current);
    return current;
  };
  return {
    randomBytes: () => secureRandom(options.raw),
    close: () => {
      for (const current of sessions.values()) current.close();
      sessions.clear();
    },
    async request(url, init) {
      const parsed = new URL(url);
      if (!isConnectRoute(parsed.origin)) return options.raw.request(url, init);
      if (init.signal.aborted) throw new Error('request-cancelled');
      const current = session(parsed.origin);
      await current.ready;
      if (init.signal.aborted) throw new Error('request-cancelled');
      if (
        typeof init.body !== 'string' &&
        init.body !== undefined &&
        init.body.size > 4 * 1024 * 1024
      )
        throw new Error('channel-body-too-large');
      if (
        typeof init.body === 'string' &&
        new TextEncoder().encode(init.body).length > 4 * 1024 * 1024
      )
        throw new Error('channel-body-too-large');
      const body =
        typeof init.body === 'string'
          ? init.body
          : init.body === undefined
            ? undefined
            : encodeBase64(new Uint8Array(await init.body.arrayBuffer()));
      if (init.signal.aborted) throw new Error('request-cancelled');
      if (current.requests.size >= 32) throw new Error('channel-busy');
      const id = String(++next);
      return new Promise<HostResponse>((resolve, reject) => {
        const abort = () => {
          current.requests.delete(id);
          try {
            current.send({ type: 'cancel', id });
          } catch {}
          reject(new Error('request-cancelled'));
        };
        const cleanup = () => init.signal.removeEventListener('abort', abort);
        init.signal.addEventListener('abort', abort, { once: true });
        current.requests.set(id, {
          resolve: (value) => {
            cleanup();
            resolve(value);
          },
          reject: (error) => {
            cleanup();
            reject(error);
          },
        });
        try {
          current.send({
            type: 'request',
            id,
            path: parsed.pathname + parsed.search,
            method: init.method,
            ...(body === undefined ? {} : { body }),
            encoding: typeof init.body === 'string' ? 'text' : 'base64',
            contentType: init.headers?.['content-type'],
          });
        } catch (error) {
          cleanup();
          current.requests.delete(id);
          reject(error);
        }
      });
    },
    openSocket(url, events, headers): HostSocket {
      const parsed = new URL(url.replace(/^ws/u, 'http'));
      if (!isConnectRoute(parsed.origin)) return options.raw.openSocket(url, events, headers);
      let current: Session | undefined,
        done = false;
      const id = String(++next);
      void (async () => {
        try {
          current = session(parsed.origin);
          await current.ready;
          if (done) return;
          if (current.streams.size >= 4) throw new Error('channel-busy');
          current.streams.set(id, events);
          current.send({ type: 'open', id, path: parsed.pathname });
        } catch (error) {
          if (!done) events.closed(error instanceof Error ? error.message : 'channel-refused');
        }
      })();
      return {
        send: (text) => {
          if (!current || done) throw new Error('channel-disconnected');
          current.send({ type: 'send', id, text });
        },
        close: () => {
          if (done) return;
          done = true;
          current?.streams.delete(id);
          try {
            current?.send({ type: 'close', id });
          } catch {}
        },
      };
    },
  };
}
