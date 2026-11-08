import { createServer } from 'node:http';
import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const secret = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const equal = (value, hash) =>
  typeof value === 'string' &&
  typeof hash === 'string' &&
  timingSafeEqual(Buffer.from(digest(value)), Buffer.from(hash));
const LIMIT = 70_000;
const QUEUE = 2 * 1024 * 1024;

// The relay authenticates admission, but only the Host's existing Noise/device gateway grants control.
export function createPrivateRelay({ directory, bootstrap }) {
  if (!secret(bootstrap)) throw new Error('bootstrap-secret-invalid');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, 'owner.json');
  let owner;
  try {
    owner = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (owner && (!secret(owner.owner) || !secret(owner.phone)))
    throw new Error('owner-state-invalid');
  let host;
  const phones = new Map();
  const json = (response, status, value) => {
    response.writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(JSON.stringify(value));
  };
  const server = createServer(async (request, response) => {
    if (request.url === '/health' && request.method === 'GET')
      return json(response, 200, { protocol: 'botharness-private-v1' });
    if (
      request.url === '/status' &&
      request.method === 'GET' &&
      equal(request.headers.authorization?.replace(/^Bearer /u, ''), owner?.owner)
    )
      return json(response, 200, { connected: host?.readyState === WebSocket.OPEN });
    if (request.url !== '/claim' || request.method !== 'POST')
      return json(response, 404, { code: 'not-found' });
    if (!equal(request.headers.authorization?.replace(/^Bearer /u, ''), digest(bootstrap)))
      return json(response, 403, { code: 'claim-refused' });
    if (owner) return json(response, 409, { code: 'already-claimed' });
    let text = '';
    try {
      for await (const chunk of request) {
        text += chunk;
        if (Buffer.byteLength(text) > 1024) return json(response, 413, { code: 'body-too-large' });
      }
      const input = JSON.parse(text);
      if (
        !secret(input.ownerToken) ||
        !secret(input.phoneToken) ||
        input.ownerToken === input.phoneToken
      )
        return json(response, 400, { code: 'claim-invalid' });
      const next = { owner: digest(input.ownerToken), phone: digest(input.phoneToken) };
      // Exclusive creation makes competing first-owner claims atomic, including across processes.
      writeFileSync(file, JSON.stringify(next), { flag: 'wx', mode: 0o600 });
      owner = next;
      return json(response, 200, { claimed: true });
    } catch (error) {
      return json(response, error.code === 'EEXIST' ? 409 : 400, {
        code: error.code === 'EEXIST' ? 'already-claimed' : 'claim-invalid',
      });
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.maxConnections = 96;
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: LIMIT * 2,
    perMessageDeflate: false,
  });
  const send = (socket, value) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (
      socket?.readyState !== WebSocket.OPEN ||
      socket.bufferedAmount + Buffer.byteLength(text) > QUEUE
    ) {
      socket?.terminate();
      return false;
    }
    socket.send(text);
    return true;
  };
  server.on('upgrade', (request, socket, head) => {
    const hosting = request.url === '/host';
    const phone = request.url === '/botharness-device/channel';
    const token = request.headers.authorization?.replace(/^Bearer /u, '');
    if (
      request.headers.origin ||
      !owner ||
      (!hosting && !phone) ||
      !equal(token, hosting ? owner.owner : owner.phone) ||
      (hosting && host) ||
      (phone && (host?.readyState !== WebSocket.OPEN || phones.size >= 32))
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(request, socket, head, (client) => {
      client.alive = true;
      client.on('pong', () => {
        client.alive = true;
      });
      client.on('error', () => client.terminate());
      if (hosting) {
        host = client;
        client.on('message', (data, binary) => {
          try {
            if (binary) throw new Error();
            const input = JSON.parse(data.toString());
            const target = phones.get(input.id);
            if (!target) return;
            if (input.type === 'close') target.terminate();
            else if (
              input.type === 'data' &&
              typeof input.data === 'string' &&
              Buffer.byteLength(input.data) <= LIMIT
            )
              send(target, input.data);
            else throw new Error();
          } catch {
            client.terminate();
          }
        });
        client.on('close', () => {
          if (host === client) host = undefined;
          for (const phone of phones.values()) phone.terminate();
          phones.clear();
        });
      } else {
        const id = randomBytes(16).toString('hex');
        phones.set(id, client);
        send(host, { type: 'open', id });
        client.on('message', (data, binary) => {
          if (binary || data.length > LIMIT) {
            client.terminate();
            return;
          }
          if (!send(host, { type: 'data', id, data: data.toString() })) client.terminate();
        });
        client.on('close', () => {
          phones.delete(id);
          if (host) send(host, { type: 'close', id });
        });
      }
    });
  });
  const heartbeat = setInterval(() => {
    for (const socket of sockets.clients) {
      if (!socket.alive) {
        socket.terminate();
        continue;
      }
      socket.alive = false;
      socket.ping();
    }
  }, 25_000);
  heartbeat.unref();
  return {
    server,
    close: () => {
      clearInterval(heartbeat);
      for (const socket of sockets.clients) socket.terminate();
      sockets.close();
      server.close();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bootstrap =
    process.env.RELAY_BOOTSTRAP ??
    readFileSync(process.env.RELAY_BOOTSTRAP_FILE ?? '/run/secrets/bootstrap', 'utf8').trim();
  delete process.env.RELAY_BOOTSTRAP;
  const relay = createPrivateRelay({ directory: process.env.RELAY_DATA ?? '/data', bootstrap });
  relay.server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0', () =>
    console.log(JSON.stringify({ phase: 'listening', protocol: 'botharness-private-v1' })),
  );
  process.on('SIGTERM', relay.close);
  process.on('SIGINT', relay.close);
}
