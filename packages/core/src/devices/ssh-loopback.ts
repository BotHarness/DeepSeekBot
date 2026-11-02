import { createServer as createHttpServer } from 'node:http';
import { connect, createServer, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import { CONNECT_CHANNEL_PATH } from './noise/channel.js';

export async function freeLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!address || typeof address === 'string') throw new Error('loopback-address-unavailable');
  return address.port;
}

export async function openSshLoopback(port: number, sshPort: number) {
  const sockets = new Set<Duplex>();
  const server = createHttpServer((_request, response) => {
    response.writeHead(403, { 'content-length': '0', connection: 'close' });
    response.end();
  });
  server.maxHeadersCount = 32;
  server.headersTimeout = 5000;
  server.requestTimeout = 5000;
  server.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.on('upgrade', (request, client, head) => {
    const key = request.headers['sec-websocket-key'];
    if (
      request.method !== 'GET' ||
      request.url !== CONNECT_CHANNEL_PATH ||
      request.headers.upgrade?.toLowerCase() !== 'websocket' ||
      request.headers['sec-websocket-version'] !== '13' ||
      typeof key !== 'string' ||
      !/^[A-Za-z0-9+/]{22}==$/u.test(key) ||
      request.headers.authorization ||
      request.headers['sec-websocket-protocol'] ||
      sockets.size > 32
    ) {
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    const upstream = connect(sshPort, '127.0.0.1');
    sockets.add(upstream);
    const close = () => {
      clearTimeout(timer);
      client.destroy();
      upstream.destroy();
      sockets.delete(upstream);
    };
    const timer = setTimeout(close, 10_000);
    client.once('error', close);
    client.once('close', close);
    upstream.once('error', close);
    upstream.once('close', close);
    upstream.once('data', () => clearTimeout(timer));
    upstream.once('connect', () => {
      upstream.write(
        `GET ${CONNECT_CHANNEL_PATH} HTTP/1.1\r\nHost: 127.0.0.1:${sshPort}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${key}\r\n\r\n`,
      );
      if (head.length) upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
