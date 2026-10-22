import { createServer, type IncomingMessage } from 'node:http';
import { networkInterfaces } from 'node:os';
import type { AddressInfo, Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import type { PhoneRoute } from './routes.js';
import { CONNECT_CHANNEL_PATH } from './noise/channel.js';
import { isLanAddress } from './lan-address.js';

export interface LanStatus {
  state: 'off' | 'listening' | 'error';
  port?: number;
  issue?: 'lan-listen-failed' | 'lan-storage-unavailable';
}
export type LanResult =
  | { ok: true; status: LanStatus }
  | { ok: false; code: NonNullable<LanStatus['issue']> };
interface Gateway {
  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void;
  close(): void;
}

export function createDeviceLan(options: {
  read(): Promise<number | undefined>;
  write(port: number | undefined): Promise<void>;
  gateway(): Gateway;
  addresses?: () => string[];
  log?: (phase: string) => void;
}) {
  let status: LanStatus = { state: 'off' };
  let current:
    | { server: ReturnType<typeof createServer>; gateway: Gateway; sockets: Set<Duplex> }
    | undefined;
  let disposed = false;
  let tail = Promise.resolve();
  function serial<T>(action: () => Promise<T>): Promise<T> {
    const result = tail.then(action);
    tail = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  async function stop() {
    const previous = current;
    current = undefined;
    status = { state: 'off' };
    if (!previous) return;
    previous.gateway.close();
    for (const socket of previous.sockets) socket.destroy();
    await new Promise<void>((resolve) => previous.server.close(() => resolve()));
    options.log?.('closed');
  }
  async function listen(port: number): Promise<LanResult> {
    if (disposed) return { ok: false, code: 'lan-listen-failed' };
    const gateway = options.gateway();
    const sockets = new Set<Duplex>();
    const server = createServer(
      { maxHeaderSize: 8192, requestTimeout: 5000, headersTimeout: 5000 },
      (request, response) => {
        request.resume();
        response.writeHead(404, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
          connection: 'close',
        });
        response.end('{"code":"not-found"}');
      },
    );
    server.maxConnections = 64;
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
      socket.setTimeout(15_000, () => socket.destroy());
    });
    server.on('upgrade', (request, socket, head) => {
      if (
        request.url !== CONNECT_CHANNEL_PATH ||
        request.method !== 'GET' ||
        request.headers.origin ||
        request.headers.authorization ||
        request.headers.cookie ||
        request.headers['sec-websocket-protocol']
      ) {
        socket.destroy();
        return;
      }
      (socket as Socket).setTimeout(0);
      gateway.upgrade(request, socket, head);
    });
    current = { server, gateway, sockets };
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '0.0.0.0', () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      server.on('error', () => {
        void serial(async () => {
          await stop();
          status = { state: 'error', issue: 'lan-listen-failed' };
        });
      });
      status = { state: 'listening', port: (server.address() as AddressInfo).port };
      options.log?.('listening');
      return { ok: true, status: { ...status } };
    } catch {
      await stop();
      status = { state: 'error', issue: 'lan-listen-failed' };
      options.log?.('listen-failed');
      return { ok: false, code: 'lan-listen-failed' };
    }
  }
  return {
    status: (): LanStatus => ({ ...status }),
    routes(): PhoneRoute[] {
      if (status.state !== 'listening') return [];
      const addresses =
        options.addresses?.() ??
        Object.values(networkInterfaces()).flatMap(
          (entries) =>
            entries
              ?.filter((entry) => !entry.internal && entry.family === 'IPv4')
              .map((entry) => entry.address) ?? [],
        );
      return [...new Set(addresses)]
        .filter(isLanAddress)
        .map((address) => ({ url: `http://${address}:${status.port}`, kind: 'lan', ready: true }));
    },
    start: () =>
      serial(async () => {
        if (current || disposed) return;
        try {
          const port = await options.read();
          if (Number.isInteger(port) && port! > 0 && port! <= 65535) await listen(port!);
        } catch {
          status = { state: 'error', issue: 'lan-storage-unavailable' };
        }
      }),
    enable: () =>
      serial(async (): Promise<LanResult> => {
        if (current) return { ok: true, status: { ...status } };
        const result = await listen(0);
        if (!result.ok) return result;
        try {
          await options.write(status.port);
        } catch {
          await stop();
          return { ok: false, code: 'lan-storage-unavailable' };
        }
        options.log?.('enabled');
        return { ok: true, status: { ...status } };
      }),
    disable: () =>
      serial(async (): Promise<LanResult> => {
        await stop();
        try {
          await options.write(undefined);
        } catch {
          return { ok: false, code: 'lan-storage-unavailable' };
        }
        options.log?.('disabled');
        return { ok: true, status: { ...status } };
      }),
    close: () => {
      disposed = true;
      return serial(stop);
    },
  };
}

export type DeviceLan = ReturnType<typeof createDeviceLan>;
