import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type RequestOptions,
} from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { Duplex } from 'node:stream';
import { DEVICE_ROUTE_HEADER, stampManagedTlsRoute } from './route-context.js';

const HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

function headersFor(headers: IncomingHttpHeaders, upgrade = false): IncomingHttpHeaders {
  const omitted = new Set([
    ...HOP_HEADERS,
    DEVICE_ROUTE_HEADER,
    ...(headers.connection?.split(',').map((name) => name.trim().toLowerCase()) ?? []),
  ]);
  const result = Object.fromEntries(Object.entries(headers).filter(([name]) => !omitted.has(name)));
  if (upgrade) {
    result['connection'] = 'Upgrade';
    result['upgrade'] = headers.upgrade;
  }
  return result;
}

export function createManagedTlsIngress(options: { port: number; tls?: boolean }) {
  const sockets = new Set<Duplex>();
  const request = options.tls ? httpsRequest : httpRequest;
  const upstreamOptions = {
    host: '127.0.0.1',
    port: options.port,
    agent: false,
  } satisfies RequestOptions;
  const server = createServer((incoming, response) => {
    incoming.headers = headersFor(incoming.headers);
    stampManagedTlsRoute(incoming);
    const upstream = request(
      {
        ...upstreamOptions,
        method: incoming.method,
        path: incoming.url,
        headers: incoming.headers,
      },
      (reply) => {
        response.writeHead(reply.statusCode ?? 502, headersFor(reply.headers));
        reply.on('error', () => response.destroy());
        reply.pipe(response);
      },
    );
    upstream.on('error', () => {
      if (response.headersSent) response.destroy();
      else {
        response.writeHead(502, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ code: 'host-unavailable' }));
      }
    });
    incoming.on('error', () => upstream.destroy());
    response.on('close', () => upstream.destroy());
    incoming.pipe(upstream);
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.on('upgrade', (incoming, socket, head) => {
    incoming.headers = headersFor(incoming.headers, true);
    stampManagedTlsRoute(incoming);
    const upstream = request({
      ...upstreamOptions,
      method: incoming.method,
      path: incoming.url,
      headers: incoming.headers,
    });
    let upgraded: Duplex | undefined;
    upstream.on('upgrade', (reply, remote, remoteHead) => {
      upgraded = remote;
      sockets.add(remote);
      remote.on('close', () => {
        sockets.delete(remote);
        socket.destroy();
      });
      remote.on('error', () => socket.destroy());
      const lines = [
        `HTTP/1.1 ${reply.statusCode ?? 101} ${reply.statusMessage ?? 'Switching Protocols'}`,
      ];
      for (const [name, value] of Object.entries(headersFor(reply.headers, true))) {
        for (const item of Array.isArray(value) ? value : [value])
          if (item !== undefined) lines.push(`${name}: ${item}`);
      }
      socket.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (remoteHead.length) socket.write(remoteHead);
      if (head.length) remote.write(head);
      remote.pipe(socket);
      socket.pipe(remote);
    });
    upstream.on('response', (reply) => {
      reply.resume();
      socket.end(
        `HTTP/1.1 ${reply.statusCode ?? 502} Refused\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
      );
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    socket.on('close', () => {
      upstream.destroy();
      upgraded?.destroy();
    });
    upstream.end();
  });
  let port: number | undefined;
  return {
    port: () => port,
    start: async (): Promise<number> => {
      if (port !== undefined) return port;
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          server.off('error', reject);
          resolve();
        });
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('ingress-address-unavailable');
      port = address.port;
      return port;
    },
    close: async (): Promise<void> => {
      port = undefined;
      for (const socket of sockets) socket.destroy();
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export type ManagedTlsIngress = ReturnType<typeof createManagedTlsIngress>;
