import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createHttpsServer } from 'node:https';
import { afterEach, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { randomBytes } from 'node:crypto';
import { ConnectChannel } from '../src/devices/noise/channel.js';
import { noisePublicKey } from '../src/devices/noise/xk.js';
import { checkPublicConnect, createConnectHealth } from '../src/devices/connect-health.js';

const disposals: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of disposals.splice(0)) await dispose();
});
async function endpoint(tls?: { key: Buffer; cert: Buffer }) {
  const key = randomBytes(32);
  const server = tls ? createHttpsServer(tls) : createServer();
  const sockets = new WebSocketServer({ server });
  sockets.on('connection', (socket) => {
    const channel = new ConnectChannel({
      role: 'responder',
      hostId: 'qa-host',
      staticKey: key,
      ephemeralKey: randomBytes(32),
      hostKey: noisePublicKey(key),
    });
    socket.on('message', (data) => {
      try {
        const value = channel.receive(data.toString());
        if (value.reply) socket.send(value.reply);
      } catch {
        socket.close();
      }
    });
    socket.on('close', () => channel.close());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test-server-unavailable');
  disposals.push(async () => {
    for (const socket of sockets.clients) socket.terminate();
    await new Promise<void>((resolve) => sockets.close(() => server.close(() => resolve())));
  });
  return {
    origin: `https://127.0.0.1:${address.port}`,
    publicKey: Buffer.from(noisePublicKey(key)).toString('hex'),
  };
}
const socket = (url: string) => new WebSocket(url.replace(/^wss:/u, 'ws:'));
it('verifies a fresh pinned Noise handshake over the public channel, and rejects a different Host key', async () => {
  const target = await endpoint();
  await expect(
    checkPublicConnect({
      ...target,
      hostId: 'qa-host',
      signal: new AbortController().signal,
      socket,
    }),
  ).resolves.toEqual({ ok: true });
  await expect(
    checkPublicConnect({
      ...target,
      publicKey: Buffer.from(noisePublicKey(randomBytes(32))).toString('hex'),
      hostId: 'qa-host',
      signal: new AbortController().signal,
      socket,
    }),
  ).resolves.toMatchObject({ ok: false, code: 'handshake' });
});
it('does not call a running connector verified when its public identity check fails, and retries explicitly', async () => {
  let passed = false;
  let calls = 0;
  const health = createConnectHealth({
    account: {
      status: () => ({ state: 'signed-in', hostId: 'account-qa' }),
      connectedHosts: async () => ({
        ok: true,
        hosts: [{ id: 'account-qa', current: true, connected: true }],
      }),
    },
    connect: {
      status: () => ({ state: 'connected' }),
      route: () => ({ url: 'https://qa.deepseekbot.dev' }),
    },
    identity: async () => ({ hostId: 'qa-host', publicKey: 'a'.repeat(64) }),
    probe: async () => {
      calls++;
      return passed ? { ok: true } : { ok: false, code: 'tls' };
    },
  });
  await health.check();
  expect(health.status()).toMatchObject({ state: 'failed', stage: 'public', code: 'tls' });
  passed = true;
  await health.check();
  expect(health.status()).toMatchObject({ state: 'passed' });
  expect(calls).toBe(2);
  health.close();
});
it('coalesces checks and discards late results on sign-out', async () => {
  let release = () => {};
  let calls = 0;
  const health = createConnectHealth({
    account: {
      status: () => ({ state: 'signed-in', hostId: 'account-qa' }),
      connectedHosts: async () => ({
        ok: true,
        hosts: [{ id: 'account-qa', current: true, connected: true }],
      }),
    },
    connect: {
      status: () => ({ state: 'connected' }),
      route: () => ({ url: 'https://qa.deepseekbot.dev' }),
    },
    identity: async () => ({ hostId: 'qa-host', publicKey: 'a'.repeat(64) }),
    probe: async () => {
      calls++;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { ok: true };
    },
  });
  const first = health.check();
  const second = health.check();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(calls).toBe(1);
  health.invalidate();
  release();
  await Promise.all([first, second]);
  expect(health.status()).toMatchObject({ state: 'idle' });
  health.close();
});
it('bounds a silent public handshake and releases its socket on timeout', async () => {
  const server = createServer();
  const sockets = new WebSocketServer({ server });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no-test-port');
  disposals.push(async () => {
    for (const peer of sockets.clients) peer.terminate();
    await new Promise<void>((resolve) => sockets.close(() => server.close(() => resolve())));
  });
  await expect(
    checkPublicConnect({
      origin: `https://127.0.0.1:${address.port}`,
      hostId: 'qa-host',
      publicKey: 'a'.repeat(64),
      signal: new AbortController().signal,
      socket,
      timeoutMs: 30,
    }),
  ).resolves.toEqual({ ok: false, code: 'timeout' });
});
it('reports a bounded HTTP refusal without exposing the server response', async () => {
  const server = createServer();
  server.on('upgrade', (_request, peer) =>
    peer.end('HTTP/1.1 530 Not Ready\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no-test-port');
  disposals.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await expect(
    checkPublicConnect({
      origin: `https://127.0.0.1:${address.port}`,
      hostId: 'qa-host',
      publicKey: 'a'.repeat(64),
      signal: new AbortController().signal,
      socket,
    }),
  ).resolves.toEqual({ ok: false, code: 'http', httpStatus: 530 });
});
it('does not probe a relay-offline Host and expires a successful observation without background polling', async () => {
  let online = false;
  let stamp = 100;
  let calls = 0;
  const health = createConnectHealth({
    now: () => stamp,
    freshnessMs: 1000,
    account: {
      status: () => ({ state: 'signed-in', hostId: 'qa-account' }),
      connectedHosts: async () => ({
        ok: true,
        hosts: [{ id: 'qa-account', current: true, connected: online }],
      }),
    },
    connect: {
      status: () => ({ state: 'connected' }),
      route: () => ({ url: 'https://qa.deepseekbot.dev' }),
    },
    identity: async () => ({ hostId: 'qa-host', publicKey: 'a'.repeat(64) }),
    probe: async () => {
      calls++;
      return { ok: true };
    },
  });
  await health.check();
  expect(health.status()).toMatchObject({ state: 'failed', stage: 'relay', code: 'relay-offline' });
  expect(calls).toBe(0);
  online = true;
  await health.check();
  expect(health.status().state).toBe('passed');
  stamp += 1001;
  expect(health.status().state).toBe('stale');
  expect(calls).toBe(1);
  health.close();
});
it('times out a stalled service lookup and prevents its late reply from overwriting failure', async () => {
  let release = () => {};
  let probes = 0;
  const health = createConnectHealth({
    timeoutMs: 30,
    account: {
      status: () => ({ state: 'signed-in', hostId: 'qa-account' }),
      connectedHosts: async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { ok: true, hosts: [{ id: 'qa-account', current: true, connected: true }] };
      },
    },
    connect: {
      status: () => ({ state: 'connected' }),
      route: () => ({ url: 'https://qa.deepseekbot.dev' }),
    },
    identity: async () => ({ hostId: 'qa-host', publicKey: 'a'.repeat(64) }),
    probe: async () => {
      probes++;
      return { ok: true };
    },
  });
  await health.check();
  expect(health.status()).toMatchObject({ state: 'failed', stage: 'relay', code: 'timeout' });
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(probes).toBe(0);
  expect(health.status()).toMatchObject({ state: 'failed', code: 'timeout' });
  health.close();
});

const openssl = spawnSync('openssl', ['version']).status === 0;
it.skipIf(!openssl)(
  'preserves TLS verification, even when the pinned Host key is correct',
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'connect-health-tls-'));
    disposals.push(async () => {
      rmSync(root, { recursive: true, force: true });
    });
    const generated = spawnSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        'key.pem',
        '-out',
        'cert.pem',
        '-days',
        '1',
        '-subj',
        '/CN=127.0.0.1',
        '-addext',
        'subjectAltName=IP:127.0.0.1',
      ],
      { cwd: root, encoding: 'utf8' },
    );
    if (generated.status !== 0) throw new Error('test-cert-generation-failed');
    const cert = readFileSync(join(root, 'cert.pem'));
    const target = await endpoint({ key: readFileSync(join(root, 'key.pem')), cert });
    const options = { ...target, hostId: 'qa-host', signal: new AbortController().signal };
    await expect(checkPublicConnect(options)).resolves.toMatchObject({ ok: false, code: 'tls' });
    await expect(
      checkPublicConnect({ ...options, socket: (url) => new WebSocket(url, { ca: cert }) }),
    ).resolves.toEqual({ ok: true });
    await expect(
      checkPublicConnect({
        ...options,
        origin: target.origin.replace('127.0.0.1', 'localhost'),
        socket: (url) => new WebSocket(url, { ca: cert }),
      }),
    ).resolves.toMatchObject({ ok: false, code: 'tls' });
  },
);

it('retries transient public startup failures within the same check, but keeps the request budget bounded', async () => {
  vi.useFakeTimers();
  let calls = 0;
  let recover = false;
  const health = createConnectHealth({
    account: {
      status: () => ({ state: 'signed-in', hostId: 'qa-account' }),
      connectedHosts: async () => ({
        ok: true,
        hosts: [{ id: 'qa-account', current: true, connected: true }],
      }),
    },
    connect: {
      status: () => ({ state: 'connected' }),
      route: () => ({ url: 'https://qa.deepseekbot.dev' }),
    },
    identity: async () => ({ hostId: 'qa-host', publicKey: 'a'.repeat(64) }),
    probe: async () => {
      calls++;
      return recover ? { ok: true } : { ok: false, code: 'http', httpStatus: 530 };
    },
  });
  try {
    const first = health.check();
    await vi.advanceTimersByTimeAsync(0);
    expect(health.status()).toMatchObject({ state: 'checking', stage: 'public' });
    recover = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(await first).toMatchObject({ state: 'passed' });
    expect(calls).toBe(2);
    recover = false;
    const second = health.check();
    await vi.advanceTimersByTimeAsync(10000);
    expect(await second).toMatchObject({
      state: 'failed',
      stage: 'public',
      code: 'http',
      httpStatus: 530,
    });
    expect(calls).toBe(6);
    await vi.advanceTimersByTimeAsync(60000);
    expect(calls).toBe(6);
  } finally {
    health.close();
    vi.useRealTimers();
  }
});

it('cancels the retry wait at the overall deadline and leaves no later probes', async () => {
  let probes = 0;
  const health = createConnectHealth({
    timeoutMs: 30,
    account: {
      status: () => ({ state: 'signed-in', hostId: 'qa-account' }),
      connectedHosts: async () => ({
        ok: true,
        hosts: [{ id: 'qa-account', current: true, connected: true }],
      }),
    },
    connect: {
      status: () => ({ state: 'connected' }),
      route: () => ({ url: 'https://qa.deepseekbot.dev' }),
    },
    identity: async () => ({ hostId: 'qa-host', publicKey: 'a'.repeat(64) }),
    probe: async () => {
      probes++;
      return { ok: false, code: 'dns' };
    },
  });
  try {
    expect(await health.check()).toMatchObject({
      state: 'failed',
      stage: 'public',
      code: 'timeout',
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(probes).toBe(1);
  } finally {
    health.close();
  }
});

it('classifies incomplete certificate chains as TLS refusals', async () => {
  await expect(
    checkPublicConnect({
      origin: 'https://qa.invalid',
      hostId: 'qa',
      publicKey: 'a'.repeat(64),
      signal: new AbortController().signal,
      socket: (url) =>
        new WebSocket(url, {
          lookup: (_hostname, _options, callback) =>
            callback(
              Object.assign(new Error('incomplete-chain'), {
                code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
              }),
              '',
              4,
            ),
        }),
    }),
  ).resolves.toEqual({ ok: false, code: 'tls' });
});
it('rejects oversized public handshake messages before delivering them to the Noise decoder', async () => {
  const server = createServer();
  const peers = new WebSocketServer({ server });
  peers.on('connection', (peer) => peer.send('h' + '00'.repeat(4096)));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no-test-port');
  disposals.push(async () => {
    for (const peer of peers.clients) peer.terminate();
    await new Promise<void>((resolve) => peers.close(() => server.close(() => resolve())));
  });
  let delivered = 0;
  await expect(
    checkPublicConnect({
      origin: `https://127.0.0.1:${address.port}`,
      hostId: 'qa',
      publicKey: 'a'.repeat(64),
      signal: new AbortController().signal,
      socket: (url, limits) => {
        const ws = new WebSocket(url.replace(/^wss:/u, 'ws:'), limits);
        ws.on('message', () => delivered++);
        return ws;
      },
    }),
  ).resolves.toMatchObject({ ok: false });
  expect(delivered).toBe(0);
});
