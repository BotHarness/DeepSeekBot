import { createServer } from 'node:http';
import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

export const PROTOCOL_V1 = 'botharness-private-v1';
export const PROTOCOL_V2 = 'botharness-private-v2';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const secret = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const label = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,31}$/u.test(value);
const equal = (value, hash) =>
  typeof value === 'string' &&
  typeof hash === 'string' &&
  timingSafeEqual(Buffer.from(digest(value)), Buffer.from(hash));
const LIMIT = 70_000;
const QUEUE = 2 * 1024 * 1024;
const PHONES = 32;
const HOSTS = 16;
const DEFAULT = 'default';

export function readHostKeys(file) {
  const keys = new Map();
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return keys;
    throw error;
  }
  for (const line of text.split('\n')) {
    const [name, hash, extra] = line.trim().split(/\s+/u);
    if (!name) continue;
    if (!label(name) || name === DEFAULT || !secret(hash) || extra !== undefined)
      throw new Error('host-keys-invalid');
    keys.set(name, hash);
  }
  return keys;
}

export function createPrivateRelay({ directory, bootstrap, hostKeys = () => new Map() }) {
  if (!secret(bootstrap)) throw new Error('bootstrap-secret-invalid');
  mkdirSync(join(directory, 'hosts'), { recursive: true, mode: 0o700 });
  const slotFile = (name) =>
    name === DEFAULT ? join(directory, 'owner.json') : join(directory, 'hosts', `${name}.json`);
  const slots = new Map();
  const load = (name) => {
    let value;
    try {
      value = JSON.parse(readFileSync(slotFile(name), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (value.released === true) return;
    if (!secret(value.owner) || !secret(value.phone)) throw new Error('owner-state-invalid');
    slots.set(name, { owner: value.owner, phone: value.phone });
  };
  load(DEFAULT);
  for (const entry of readdirSync(join(directory, 'hosts'))) {
    const name = entry.replace(/\.json$/u, '');
    if (entry.endsWith('.json') && label(name)) load(name);
  }
  const live = new Map();
  const find = (field, token) => {
    if (!secret(token)) return;
    for (const [name, slot] of slots) if (equal(token, slot[field])) return name;
  };
  const bearer = (request) => request.headers.authorization?.replace(/^Bearer /u, '');
  const json = (response, status, value) => {
    response.writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(JSON.stringify(value));
  };
  const drop = (name) => {
    const runtime = live.get(name);
    if (!runtime) return;
    live.delete(name);
    runtime.control?.terminate();
    for (const phone of runtime.phones.values()) phone.terminate();
    runtime.phones.clear();
  };
  const readBody = async (request) => {
    let text = '';
    for await (const chunk of request) {
      text += chunk;
      if (Buffer.byteLength(text) > 1024) return;
    }
    return text;
  };
  const server = createServer(async (request, response) => {
    if (request.url === '/health' && request.method === 'GET')
      return json(response, 200, { protocol: PROTOCOL_V1, protocols: [PROTOCOL_V1, PROTOCOL_V2] });
    if (request.url === '/status' && request.method === 'GET') {
      const name = find('owner', bearer(request));
      if (!name) return json(response, 404, { code: 'not-found' });
      return json(response, 200, {
        connected: live.get(name)?.control?.readyState === WebSocket.OPEN,
        host: name,
      });
    }
    if (request.url === '/claim' && request.method === 'DELETE') {
      const name = find('owner', bearer(request));
      if (!name) return json(response, 403, { code: 'release-refused' });
      writeFileSync(slotFile(name), JSON.stringify({ released: true }), { mode: 0o600 });
      slots.delete(name);
      drop(name);
      return json(response, 200, { released: true });
    }
    if (request.url !== '/claim' || request.method !== 'POST')
      return json(response, 404, { code: 'not-found' });
    const key = bearer(request);
    let name;
    if (equal(key, digest(bootstrap))) name = DEFAULT;
    else {
      let keys;
      try {
        keys = hostKeys();
      } catch {
        return json(response, 503, { code: 'host-keys-invalid' });
      }
      for (const [candidate, hash] of keys) if (equal(key, hash)) name = candidate;
    }
    if (!name) return json(response, 403, { code: 'claim-refused' });
    if (existsSync(slotFile(name))) return json(response, 409, { code: 'already-claimed' });
    try {
      const text = await readBody(request);
      if (text === undefined) return json(response, 413, { code: 'body-too-large' });
      const input = JSON.parse(text);
      if (existsSync(slotFile(name))) return json(response, 409, { code: 'already-claimed' });
      if (
        !secret(input.ownerToken) ||
        !secret(input.phoneToken) ||
        input.ownerToken === input.phoneToken ||
        find('owner', input.ownerToken) ||
        find('phone', input.ownerToken) ||
        find('owner', input.phoneToken) ||
        find('phone', input.phoneToken)
      )
        return json(response, 400, { code: 'claim-invalid' });
      if (slots.size >= HOSTS) return json(response, 409, { code: 'host-limit' });
      const next = { owner: digest(input.ownerToken), phone: digest(input.phoneToken) };
      writeFileSync(slotFile(name), JSON.stringify(next), { flag: 'wx', mode: 0o600 });
      slots.set(name, next);
      return json(response, 200, { claimed: true, host: name });
    } catch (error) {
      return json(response, error.code === 'EEXIST' ? 409 : 400, {
        code: error.code === 'EEXIST' ? 'already-claimed' : 'claim-invalid',
      });
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.maxConnections = 256;
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
  const refuse = (socket) =>
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  server.on('upgrade', (request, socket, head) => {
    const hosting = request.url === '/host';
    const phone = request.url === '/botharness-device/channel';
    if (!hosting && !phone) return refuse(socket);
    const token = hosting
      ? bearer(request)
      : (bearer(request) ?? request.headers['x-botharness-admission']);
    const name = find(hosting ? 'owner' : 'phone', token);
    const runtime = name && live.get(name);
    if (
      !name ||
      (hosting && runtime?.control) ||
      (phone && (runtime?.control?.readyState !== WebSocket.OPEN || runtime.phones.size >= PHONES))
    )
      return refuse(socket);
    sockets.handleUpgrade(request, socket, head, (client) => {
      client.alive = true;
      client.on('pong', () => {
        client.alive = true;
      });
      client.on('error', () => client.terminate());
      if (hosting) {
        const state = { control: client, phones: new Map() };
        live.set(name, state);
        client.on('message', (data, binary) => {
          try {
            if (binary) throw new Error();
            const input = JSON.parse(data.toString());
            const target = state.phones.get(input.id);
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
          if (live.get(name) === state) live.delete(name);
          for (const target of state.phones.values()) target.terminate();
          state.phones.clear();
        });
      } else {
        const state = runtime;
        const id = randomBytes(16).toString('hex');
        state.phones.set(id, client);
        send(state.control, { type: 'open', id });
        client.on('message', (data, binary) => {
          if (binary || data.length > LIMIT) {
            client.terminate();
            return;
          }
          if (!send(state.control, { type: 'data', id, data: data.toString() })) client.terminate();
        });
        client.on('close', () => {
          state.phones.delete(id);
          if (state.control) send(state.control, { type: 'close', id });
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
  const keysFile = process.env.RELAY_HOST_KEYS_FILE ?? '/run/relay-hosts/keys';
  const relay = createPrivateRelay({
    directory: process.env.RELAY_DATA ?? '/data',
    bootstrap,
    hostKeys: () => readHostKeys(keysFile),
  });
  relay.server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0', () =>
    console.log(JSON.stringify({ phase: 'listening', protocols: [PROTOCOL_V1, PROTOCOL_V2] })),
  );
  process.on('SIGTERM', relay.close);
  process.on('SIGINT', relay.close);
}
