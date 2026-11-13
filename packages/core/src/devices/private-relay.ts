import { randomBytes } from 'node:crypto';
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { WebSocket } from 'ws';
import { CONNECT_CHANNEL_PATH } from './noise/channel.js';
import { isConnectZoneHost } from './routes.js';

export interface PrivateRelayAdmission {
  origin: string;
  token: string;
  additionalOrigins?: string[];
}
interface Configuration {
  origin: string;
  ownerToken: string;
  phoneToken: string;
}
export interface PrivateRelayStatus {
  state: 'off' | 'connecting' | 'connected' | 'error';
  origin?: string;
  issue?: string;
}
export function privateRelayOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      url.hostname === 'localhost' ||
      url.hostname === '[::1]' ||
      url.hostname.startsWith('127.') ||
      url.hostname.endsWith('.ts.net') ||
      isConnectZoneHost(url.hostname) ||
      /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/u.test(url.hostname)
    )
      return;
    return url.origin;
  } catch {
    return;
  }
}
const secret = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
export function createPrivateConnection(options: {
  credentials():
    | Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>
    | undefined;
  port(): number;
  log(phase: string): void;
}) {
  const key = credentialKey('botharness-core', 'private-relay');
  let config: Configuration | undefined;
  let status: PrivateRelayStatus = { state: 'off' };
  let control: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let busy = false;
  const peers = new Map<string, { socket: WebSocket; queued: string[]; bytes: number }>();
  const stop = () => {
    clearTimeout(retry);
    const socket = control;
    control = undefined;
    socket?.terminate();
    for (const peer of peers.values()) peer.socket.terminate();
    peers.clear();
  };
  function start() {
    if (!config || closed) return;
    stop();
    const current = config;
    status = { state: 'connecting', origin: current.origin };
    const socket = new WebSocket(`${current.origin.replace(/^http/u, 'ws')}/host`, {
      headers: { Authorization: `Bearer ${current.ownerToken}` },
      handshakeTimeout: 10_000,
      maxPayload: 140_000,
      followRedirects: false,
    });
    control = socket;
    const send = (value: unknown) => {
      const text = JSON.stringify(value);
      if (
        socket.readyState !== WebSocket.OPEN ||
        socket.bufferedAmount + Buffer.byteLength(text) > 2 * 1024 * 1024
      ) {
        socket.terminate();
        return;
      }
      socket.send(text);
    };
    socket.on('open', () => {
      status = { state: 'connected', origin: current.origin };
      options.log('connected');
    });
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      if (control !== socket) return;
      stop();
      status = { state: 'error', origin: current.origin, issue: 'private-relay-unreachable' };
      options.log('disconnected');
      if (!closed && config === current) {
        retry = setTimeout(start, 5000);
        retry.unref();
      }
    });
    socket.on('message', (data, binary) => {
      try {
        if (binary) throw new Error();
        const input = JSON.parse(data.toString()) as { type?: string; id?: string; data?: string };
        if (!input.id || !/^[a-f0-9]{32}$/u.test(input.id)) throw new Error();
        const id = input.id;
        if (input.type === 'open') {
          if (peers.has(id) || peers.size >= 32) throw new Error();
          const local = new WebSocket(`ws://127.0.0.1:${options.port()}${CONNECT_CHANNEL_PATH}`, {
            maxPayload: 70_000,
            handshakeTimeout: 10_000,
            followRedirects: false,
          });
          const peer = { socket: local, queued: [] as string[], bytes: 0 };
          peers.set(id, peer);
          local.on('open', () => {
            for (const wire of peer.queued) local.send(wire);
            peer.queued = [];
            peer.bytes = 0;
          });
          local.on('message', (wire) => send({ type: 'data', id, data: wire.toString() }));
          local.on('error', () => local.terminate());
          local.on('close', () => {
            peers.delete(id);
            send({ type: 'close', id });
          });
        } else {
          const peer = peers.get(id);
          if (!peer) return;
          if (input.type === 'close') {
            peer.socket.terminate();
            return;
          }
          if (
            input.type !== 'data' ||
            typeof input.data !== 'string' ||
            Buffer.byteLength(input.data) > 70_000
          )
            throw new Error();
          if (peer.socket.readyState === WebSocket.OPEN) {
            if (peer.socket.bufferedAmount > 2 * 1024 * 1024) peer.socket.terminate();
            else peer.socket.send(input.data);
          } else if (peer.socket.readyState === WebSocket.CONNECTING) {
            peer.bytes += Buffer.byteLength(input.data);
            if (peer.bytes > 140_000) peer.socket.terminate();
            else peer.queued.push(input.data);
          }
        }
      } catch {
        socket.terminate();
      }
    });
  }
  return {
    status: (): PrivateRelayStatus => ({ ...status }),
    admission: (): PrivateRelayAdmission | undefined =>
      config && status.state === 'connected'
        ? { origin: config.origin, token: config.phoneToken }
        : undefined,
    async restore() {
      const stored = await options
        .credentials()
        ?.readRecord(key)
        .catch(() => {
          status = { state: 'error', issue: 'credential-unavailable' };
          return undefined;
        });
      const value =
        stored?.kind === 'grant' ? (stored.payload as Partial<Configuration>) : undefined;
      if (
        stored?.kind === 'grant' &&
        value?.origin &&
        privateRelayOrigin(value.origin) &&
        secret(value.ownerToken) &&
        secret(value.phoneToken)
      ) {
        config = {
          origin: value.origin,
          ownerToken: value.ownerToken,
          phoneToken: value.phoneToken,
        };
        start();
      } else if (stored) {
        status = { state: 'error', issue: 'private-relay-credential-invalid' };
      }
    },
    async claim(origin: string, bootstrap: string) {
      const normalized = privateRelayOrigin(origin);
      if (!normalized || !secret(bootstrap))
        return { ok: false, code: 'private-relay-input-invalid' };
      if (busy || config) return { ok: false, code: 'private-relay-already-configured' };
      const credentials = options.credentials();
      if (!credentials) return { ok: false, code: 'credential-unavailable' };
      busy = true;
      let persisted = false;
      const next = {
        origin: normalized,
        ownerToken: randomBytes(32).toString('hex'),
        phoneToken: randomBytes(32).toString('hex'),
      };
      try {
        const health = await fetch(`${normalized}/health`, {
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
        });
        const value = (await health.json()) as { protocol?: string };
        if (!health.ok || value.protocol !== 'botharness-private-v1')
          return { ok: false, code: 'private-relay-protocol-invalid' };
        await credentials.modifyRecord(key, async (current) => {
          if (current) throw new Error('private-relay-already-configured');
          return { kind: 'grant', payload: next };
        });
        persisted = true;
        const response = await fetch(`${normalized}/claim`, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
          headers: { Authorization: `Bearer ${bootstrap}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ownerToken: next.ownerToken, phoneToken: next.phoneToken }),
        });
        if (!response.ok) {
          await credentials.deleteRecord(key);
          return {
            ok: false,
            code:
              response.status === 409
                ? 'private-relay-already-claimed'
                : 'private-relay-claim-refused',
          };
        }
        config = next;
        start();
        options.log('claimed');
        return { ok: true, status: { ...status } };
      } catch {
        if (persisted) {
          config = next;
          start();
        }
        return { ok: false, code: 'private-relay-unreachable' };
      } finally {
        busy = false;
      }
    },
    close() {
      closed = true;
      stop();
    },
  };
}
export type PrivateConnection = ReturnType<typeof createPrivateConnection>;
