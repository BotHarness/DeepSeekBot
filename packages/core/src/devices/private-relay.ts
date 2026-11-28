import { createHash, randomBytes } from 'node:crypto';
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { WebSocket } from 'ws';
import { CONNECT_CHANNEL_PATH } from '@botharness/host-protocol/noise/channel';
import { isConnectZoneHost } from './routes.js';
import type { PrivateAdmission } from '@botharness/host-protocol/host-encryption';
import { PRIVATE_RELAY_V3, relationshipRelayToken } from '@botharness/host-protocol/private-relay';

export type PrivateRelayAdmission = PrivateAdmission;
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
const protocolHeader = 'x-botharness-relay-protocol';
const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');

export function createPrivateConnection(options: {
  credentials():
    | Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>
    | undefined;
  port(): number;
  log(phase: string): void;
  deviceTokens?(origin: string): string[];
  relationships?(): ReadonlyArray<{ id: string; publicKey: string }>;
  key?(): Promise<Uint8Array>;
}) {
  const key = credentialKey('botharness-core', 'private-relay');
  let config: Configuration | undefined;
  let status: PrivateRelayStatus = { state: 'off' };
  let control: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let busy = false;
  let protocol: typeof PRIVATE_RELAY_V3 | undefined;
  let scopedKey: Uint8Array | undefined;
  let sync: (() => Promise<boolean>) | undefined;
  const invites = new Map<string, number>();
  const peers = new Map<string, { socket: WebSocket; queued: string[]; bytes: number }>();
  const stop = () => {
    clearTimeout(retry);
    const socket = control;
    control = undefined;
    sync = undefined;
    scopedKey?.fill(0);
    scopedKey = undefined;
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
      headers: {
        Authorization: `Bearer ${current.ownerToken}`,
        [protocolHeader]: PRIVATE_RELAY_V3,
      },
      handshakeTimeout: 10_000,
      maxPayload: 140_000,
      followRedirects: false,
    });
    control = socket;
    let negotiated = false;
    let latest: { encoded: string; acknowledged: Promise<boolean> } | undefined;
    const peerHashes = new Map<string, string>();
    const pending = new Map<string, (ok: boolean) => void>();
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
    const connected = () => {
      status = { state: 'connected', origin: current.origin };
      options.log('connected');
    };
    socket.on('upgrade', (response) => {
      negotiated = response.headers[protocolHeader] === PRIVATE_RELAY_V3;
    });
    socket.on('open', () => {
      if (control !== socket) return;
      if (!negotiated) {
        protocol = undefined;
        connected();
        return;
      }
      protocol = PRIVATE_RELAY_V3;
      void (async () => {
        const key = await options.key?.();
        if (control !== socket) {
          key?.fill(0);
          return;
        }
        scopedKey = key;
        const synchronize = () => {
          const now = Date.now();
          for (const [token, expiry] of invites) {
            if (expiry <= now) invites.delete(token);
          }
          const peerEntries: { hash: string; peer: true }[] = [];
          if (key) {
            for (const relationship of options.relationships?.() ?? []) {
              try {
                const cacheKey = relationship.id + ':' + relationship.publicKey;
                let hash = peerHashes.get(cacheKey);
                if (!hash) {
                  hash = hashToken(
                    relationshipRelayToken(
                      current.origin,
                      relationship.id,
                      key,
                      relationship.publicKey,
                    ),
                  );
                  peerHashes.set(cacheKey, hash);
                }
                peerEntries.push({ hash, peer: true });
              } catch {
                options.log('relationship-admission-key-invalid');
              }
            }
          }
          const entries = [
            ...Array.from(new Set(options.deviceTokens?.(current.origin)), (token) => ({
              hash: hashToken(token),
            })),
            ...peerEntries,
            ...Array.from(invites, ([token, expiresAt]) => ({ hash: hashToken(token), expiresAt })),
          ].sort((a, b) => a.hash.localeCompare(b.hash));
          const encoded = JSON.stringify(entries);
          if (latest?.encoded === encoded) return latest.acknowledged;
          const id = randomBytes(16).toString('hex');
          const acknowledged = new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => socket.terminate(), 4000);
            timer.unref();
            pending.set(id, (ok) => {
              clearTimeout(timer);
              resolve(ok);
            });
          });
          latest = { encoded, acknowledged };
          send({ type: 'admissions', id, entries });
          return acknowledged;
        };
        sync = () => {
          try {
            return synchronize();
          } catch {
            socket.terminate();
            return Promise.resolve(false);
          }
        };
        if ((await sync()) && control === socket) connected();
      })().catch(() => socket.terminate());
    });
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      for (const done of pending.values()) done(false);
      pending.clear();
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
        if (input.type === 'admissions-ack' && negotiated) {
          const complete = pending.get(id);
          if (!complete) throw new Error();
          pending.delete(id);
          complete(true);
          return;
        }
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
    async pairingAdmission(
      expiresAt: string,
      managedOnly = false,
    ): Promise<PrivateRelayAdmission | undefined> {
      const origin = config?.origin;
      if (!config || !origin || status.state !== 'connected') return;
      if (!protocol) return managedOnly ? undefined : { origin, token: config.phoneToken };
      const token = randomBytes(32).toString('hex');
      if (invites.size >= 16) {
        const oldest = invites.keys().next().value;
        if (oldest) invites.delete(oldest);
      }
      invites.set(token, Date.parse(expiresAt));
      if ((await sync?.()) && invites.has(token))
        return { origin, token, protocol: PRIVATE_RELAY_V3 };
      invites.delete(token);
      if (managedOnly) throw new Error('private-relay-unreachable');
    },
    relationshipAdmission(id: string, publicKey: string): PrivateRelayAdmission | undefined {
      if (!config || status.state !== 'connected') return;
      const { origin, phoneToken } = config;
      if (!protocol) return { origin, token: phoneToken };
      if (scopedKey)
        return {
          origin,
          token: relationshipRelayToken(origin, id, scopedKey, publicKey),
          protocol: PRIVATE_RELAY_V3,
        };
    },
    syncAdmissions: () => sync?.(),
    invalidateInvites() {
      invites.clear();
      return sync?.();
    },
    async revokedAdmission() {
      if (!config) return;
      if (!protocol && status.state === 'connected') return 'legacy' as const;
      return (await sync?.()) ? ('removed' as const) : ('pending' as const);
    },
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
