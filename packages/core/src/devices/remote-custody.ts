import { createHash, randomBytes } from 'node:crypto';
import type { HostCarrier, HostSocket } from '@botharness/host-protocol/carrier';
import type { HostEncryption } from '@botharness/host-protocol/host-encryption';
import { isEncryptedRoute } from '@botharness/host-protocol/route';
import { noisePublicKey } from '@botharness/host-protocol/noise/xk';
import {
  ConnectRefused,
  encryptedCarrier,
  keyBytes,
  keyHex,
} from '@botharness/host-client/encrypted-carrier';
import {
  isCustodyHandle,
  parseEncryption,
  parseSavedHost,
  type SavedHost,
} from '@botharness/host-client/hosts';
import type { OperationalDatabaseModulePort } from '../database/owner.js';

const MAX_RECORDS = 256;
const MAX_SOCKETS = 32;
const IDLE_CARRIER_MS = 10 * 60 * 1000;
const UNCLAIMED_SOCKET_MS = 15_000;

export class CustodyRefused extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export interface Secret {
  credential: string;
  encryption?: HostEncryption;
}

interface Row {
  handle: string;
  owner_human_id: string;
  host_id: string;
  member: number;
  routes: string;
}

export interface CustodySecrets {
  read(handle: string): Promise<unknown>;
  write(handle: string, secret: Secret): Promise<void>;
  delete(handle: string): Promise<void>;
}

interface Custodied {
  handle: string;
  hostId: string;
  secret: Secret;
  member: boolean;
  routes: string[];
}

export interface CustodyResponse {
  status: number;
  contentType: string;
  body: Uint8Array;
}

export interface CustodySocketEvents {
  open(): void;
  message(text: string): void;
  closed(reason: string): void;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseSecret(input: unknown): Secret | undefined {
  if (!input || typeof input !== 'object') return;
  const value = input as Record<string, unknown>;
  const credential = value['credential'];
  if (typeof credential !== 'string' || !credential) return;
  if (value['encryption'] === undefined) return { credential };
  const encryption = parseEncryption(value['encryption']);
  return encryption ? { credential, encryption } : undefined;
}

function origin(url: string): string {
  return new URL(url.replace(/^ws/u, 'http')).origin;
}

export function sealSavedHost(host: SavedHost, handle: string): SavedHost {
  const encryption = host.encryption;
  return {
    ...host,
    credential: handle,
    ...(encryption
      ? {
          encryption: {
            ...encryption,
            deviceKey: keyHex(noisePublicKey(keyBytes(encryption.deviceKey))),
            ...(encryption.privateRelay
              ? {
                  privateRelay: {
                    ...encryption.privateRelay,
                    token: digest(encryption.privateRelay.token),
                  },
                }
              : {}),
          },
        }
      : {}),
  };
}

export function createRemoteCustody(options: {
  database: OperationalDatabaseModulePort;
  secrets: CustodySecrets;
  ownerHumanId: () => string;
  carrier: () => HostCarrier;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const carriers = new Map<string, { carrier: HostCarrier; used: number }>();
  const sockets = new Map<
    string,
    {
      handle: string;
      url: string;
      headers: Record<string, string> | undefined;
      claimed: boolean;
      socket?: HostSocket;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  const row = (handle: string): Row => {
    if (!isCustodyHandle(handle)) throw new CustodyRefused('custody-handle-invalid');
    const found = options.database.read((db) =>
      db.prepare('SELECT * FROM remote_host_custody WHERE handle = ?').get(handle),
    ) as Row | undefined;
    if (!found) throw new CustodyRefused('custody-handle-unknown');
    if (found.owner_human_id !== options.ownerHumanId())
      throw new CustodyRefused('custody-owner-changed');
    return found;
  };
  const load = async (handle: string): Promise<Custodied> => {
    row(handle);
    const secret = parseSecret(await options.secrets.read(handle));
    if (!secret) throw new CustodyRefused('custody-secret-unavailable');
    const found = row(handle);
    return {
      handle: found.handle,
      hostId: found.host_id,
      secret: {
        credential: secret.credential,
        ...(secret.encryption ? { encryption: secret.encryption } : {}),
      },
      member: found.member === 1,
      routes: JSON.parse(found.routes) as string[],
    };
  };

  const locks = new Map<string, Promise<unknown>>();
  const serial = <T>(key: string, run: () => Promise<T>): Promise<T> => {
    const next = (locks.get(key) ?? Promise.resolve()).catch(() => {}).then(run);
    locks.set(key, next);
    void next
      .finally(() => {
        if (locks.get(key) === next) locks.delete(key);
      })
      .catch(() => {});
    return next;
  };

  const transport = (record: Custodied): HostCarrier => {
    const cached = carriers.get(record.handle);
    if (cached) {
      cached.used = now();
      return cached.carrier;
    }
    const carrier = encryptedCarrier({
      raw: options.carrier(),
      hostId: record.hostId,
      credential: record.secret.credential,
      ...(record.secret.encryption ? { encryption: record.secret.encryption } : {}),
      ...(record.member ? { trustedHttpsOrigins: record.routes } : {}),
    });
    carriers.set(record.handle, { carrier, used: now() });
    return carrier;
  };

  const drop = (handle: string): void => {
    carriers.get(handle)?.carrier.close?.();
    carriers.delete(handle);
    for (const [id, socket] of sockets)
      if (socket.handle === handle) {
        clearTimeout(socket.timer);
        socket.socket?.close();
        sockets.delete(id);
      }
  };

  const sweep = setInterval(() => {
    const cutoff = now() - IDLE_CARRIER_MS;
    for (const [handle, entry] of carriers)
      if (entry.used < cutoff && ![...sockets.values()].some((socket) => socket.handle === handle))
        drop(handle);
  }, 60_000);
  sweep.unref?.();

  const inject = (record: Custodied, url: string, headers: Record<string, string> = {}) => {
    const target = origin(url);
    const noise =
      record.secret.encryption !== undefined &&
      isEncryptedRoute(target, record.secret.encryption) &&
      !record.member;
    if (!noise && !record.routes.some((route) => origin(route) === target))
      throw new CustodyRefused('custody-route-unknown');
    return Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [
        name,
        value === `Device ${record.handle}` ? `Device ${record.secret.credential}` : value,
      ]),
    );
  };

  return {
    async seal(input: unknown): Promise<SavedHost> {
      const host = parseSavedHost(input);
      if (!host) throw new CustodyRefused('custody-host-invalid');
      const owner = options.ownerHumanId();
      if (isCustodyHandle(host.credential))
        return serial(host.credential, async () => {
          const current = await load(host.credential);
          if (current.hostId !== host.hostId) throw new CustodyRefused('custody-host-mismatch');
          const stored = current.secret.encryption;
          const incoming = host.encryption;
          if (
            (stored === undefined) !== (incoming === undefined) ||
            (stored &&
              incoming &&
              (stored.hostKey !== incoming.hostKey ||
                keyHex(noisePublicKey(keyBytes(stored.deviceKey))) !== incoming.deviceKey))
          )
            throw new CustodyRefused('custody-host-mismatch');
          const relay = incoming?.privateRelay;
          const relayToken =
            relay &&
            (stored?.privateRelay && digest(stored.privateRelay.token) === relay.token
              ? stored.privateRelay.token
              : relay.token);
          const secret: Secret = {
            credential: current.secret.credential,
            ...(stored && incoming
              ? {
                  encryption: {
                    ...incoming,
                    deviceKey: stored.deviceKey,
                    ...(relay && relayToken
                      ? { privateRelay: { ...relay, token: relayToken } }
                      : {}),
                  },
                }
              : {}),
          };
          const secretChanged = JSON.stringify(secret) !== JSON.stringify(current.secret);
          const writeRoutes = (routes: string[]) =>
            options.database.transaction(
              (db) => {
                db.prepare('UPDATE remote_host_custody SET routes = ? WHERE handle = ?').run(
                  JSON.stringify(routes),
                  current.handle,
                );
              },
              ['remote-host-custody'],
            );
          try {
            writeRoutes(host.routes);
            if (secretChanged) {
              try {
                await options.secrets.write(current.handle, secret);
              } catch (error) {
                writeRoutes(current.routes);
                throw error;
              }
            }
          } finally {
            if (
              secretChanged ||
              (current.member && JSON.stringify(current.routes) !== JSON.stringify(host.routes))
            )
              drop(current.handle);
          }
          return {
            ...host,
            ...(incoming
              ? {
                  encryption: {
                    ...incoming,
                    ...(relay && relayToken
                      ? { privateRelay: { ...relay, token: digest(relayToken) } }
                      : {}),
                  },
                }
              : {}),
          };
        });
      const count = options.database.read(
        (db) =>
          db.prepare('SELECT count(*) AS count FROM remote_host_custody').get() as {
            count: number;
          },
      );
      if (count.count >= MAX_RECORDS) throw new CustodyRefused('custody-limit');
      const handle = `custody.${randomBytes(32).toString('base64url')}`;
      await options.secrets.write(handle, {
        credential: host.credential,
        ...(host.encryption ? { encryption: host.encryption } : {}),
      });
      try {
        options.database.transaction(
          (db) => {
            db.prepare(
              `INSERT INTO remote_host_custody
                 (handle, owner_human_id, host_id, member, routes, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
            ).run(
              handle,
              owner,
              host.hostId,
              host.member ? 1 : 0,
              JSON.stringify(host.routes),
              now(),
            );
          },
          ['remote-host-custody'],
        );
      } catch (error) {
        await options.secrets.delete(handle).catch(() => {});
        throw error;
      }
      return sealSavedHost(host, handle);
    },

    async forget(handle: string): Promise<void> {
      row(handle);
      drop(handle);
      await options.secrets.delete(handle);
      options.database.transaction(
        (db) => {
          db.prepare('DELETE FROM remote_host_custody WHERE handle = ?').run(handle);
        },
        ['remote-host-custody'],
      );
    },

    async request(input: {
      handle: string;
      url: string;
      method: 'GET' | 'POST';
      headers?: Record<string, string>;
      body?: string | Uint8Array;
      signal: AbortSignal;
    }): Promise<CustodyResponse> {
      const record = await load(input.handle);
      const headers = inject(record, input.url, input.headers);
      const response = await transport(record).request(input.url, {
        method: input.method,
        headers,
        signal: input.signal,
        ...(input.body === undefined
          ? {}
          : {
              body:
                typeof input.body === 'string'
                  ? input.body
                  : new Blob([Uint8Array.from(input.body)]),
            }),
      });
      const body = response.bytes
        ? await response.bytes()
        : new TextEncoder().encode(await response.text());
      return {
        status: response.status,
        contentType: response.contentType ?? 'application/octet-stream',
        body,
      };
    },

    async prepareSocket(input: {
      handle: string;
      url: string;
      headers?: Record<string, string>;
    }): Promise<string> {
      const record = await load(input.handle);
      inject(record, input.url, input.headers);
      if (sockets.size >= MAX_SOCKETS) throw new CustodyRefused('custody-socket-limit');
      const id = randomBytes(18).toString('base64url');
      sockets.set(id, {
        handle: record.handle,
        url: input.url,
        headers: input.headers,
        claimed: false,
        timer: setTimeout(() => sockets.delete(id), UNCLAIMED_SOCKET_MS),
      });
      return id;
    },

    async attachSocket(
      id: string,
      events: CustodySocketEvents,
      signal?: AbortSignal,
    ): Promise<() => void> {
      const entry = sockets.get(id);
      if (!entry || entry.claimed) throw new CustodyRefused('custody-socket-unknown');
      clearTimeout(entry.timer);
      entry.claimed = true;
      const abandon = () => {
        if (sockets.get(id) === entry && !entry.socket) sockets.delete(id);
      };
      signal?.addEventListener('abort', abandon, { once: true });
      try {
        if (signal?.aborted) throw new CustodyRefused('custody-socket-unknown');
        const record = await load(entry.handle);
        if (sockets.get(id) !== entry || signal?.aborted)
          throw new CustodyRefused('custody-socket-unknown');
        const headers = inject(record, entry.url, entry.headers);
        entry.socket = transport(record).openSocket(
          entry.url,
          {
            open: events.open,
            message: events.message,
            closed: (reason) => {
              if (sockets.get(id) === entry) sockets.delete(id);
              events.closed(reason);
            },
          },
          headers,
        );
      } catch (error) {
        if (sockets.get(id) === entry) sockets.delete(id);
        throw error;
      } finally {
        signal?.removeEventListener('abort', abandon);
      }
      return () => {
        if (sockets.get(id) !== entry) return;
        sockets.delete(id);
        entry.socket?.close();
      };
    },

    sendSocket(id: string, text: string): void {
      const entry = sockets.get(id);
      if (!entry?.socket) throw new CustodyRefused('custody-socket-unknown');
      entry.socket.send(text);
    },

    closeSocket(id: string): void {
      const entry = sockets.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      sockets.delete(id);
      entry.socket?.close();
    },

    close(): void {
      clearInterval(sweep);
      for (const handle of [...carriers.keys()]) drop(handle);
      for (const [id, entry] of sockets) {
        clearTimeout(entry.timer);
        entry.socket?.close();
        sockets.delete(id);
      }
    },
  };
}

export type RemoteCustody = ReturnType<typeof createRemoteCustody>;

export function custodyFailure(error: unknown): { code: string; refused: boolean } {
  if (error instanceof CustodyRefused) return { code: error.code, refused: false };
  if (error instanceof ConnectRefused) return { code: error.code, refused: true };
  return {
    code: error instanceof Error && error.message ? error.message : 'custody-request-failed',
    refused: false,
  };
}
