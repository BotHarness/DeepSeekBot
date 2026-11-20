import { createServer, request, type Server } from 'node:http';
import { connect } from 'node:net';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { afterEach, expect, it } from 'vitest';
import { createManagedTlsIngress } from '../src/devices/managed-tls-ingress.js';
import {
  isConnectRequest,
  isManagedTlsRequest,
  DEVICE_ROUTE_HEADER,
} from '../src/devices/route-context.js';
import {
  createManagedPhoneRoute,
  parseManagedPhoneRoute,
  type ManagedPhoneRouteState,
  type RunCommand,
} from '../src/devices/routes.js';
import { memberRoutes } from '../src/team/member-urls.js';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test-address');
  return address.port;
}
const forwarded = { 'x-forwarded-for': '192.0.2.5', 'x-forwarded-proto': 'https' };
async function reachable(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, host);
    const done = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(400, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

it('binds only IPv4 127.0.0.1 and replaces client tags without exposing the internal tag', async () => {
  const port = await listen(
    createServer((req, res) => {
      res.setHeader(DEVICE_ROUTE_HEADER, req.headers[DEVICE_ROUTE_HEADER] ?? 'none');
      res.end(
        JSON.stringify({ managed: isManagedTlsRequest(req), connect: isConnectRequest(req) }),
      );
    }),
  );
  const ingress = createManagedTlsIngress({ port });
  cleanup.push(() => ingress.close());
  const target = await ingress.start();
  expect(await ingress.start()).toBe(target);
  expect(await reachable(target)).toBe(true);
  expect(await reachable(target, '127.0.0.2')).toBe(false);
  expect(await reachable(target, '::1')).toBe(false);
  const reply = await fetch(`http://127.0.0.1:${target}/`, {
    headers: { ...forwarded, [DEVICE_ROUTE_HEADER]: 'connect, managed-tls' },
  });
  expect(await reply.json()).toEqual({ managed: true, connect: false });
  expect(reply.headers.has(DEVICE_ROUTE_HEADER)).toBe(false);
  for (const proto of [undefined, 'http', 'https, http']) {
    expect(
      await (
        await fetch(`http://127.0.0.1:${target}/`, {
          headers: proto ? { 'x-forwarded-proto': proto } : {},
        })
      ).json(),
    ).toEqual({ managed: false, connect: false });
  }
  await ingress.close();
  expect(ingress.port()).toBeUndefined();
  expect(await reachable(target)).toBe(false);
});

it('streams in both directions before completion and keeps WebSocket head bytes and messages', async () => {
  let finish: (() => void) | undefined;
  const server = createServer((req, res) => {
    expect(isManagedTlsRequest(req)).toBe(true);
    expect(req.headers.host).toBe('public.tail.ts.net:8443');
    expect(req.headers.cookie).toBe('owner=session');
    req.once('data', (chunk) => {
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'set-cookie': 'web=session; Secure',
      });
      res.write(chunk);
      finish = () => res.end('last');
    });
    req.resume();
  });
  const wsServer = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    expect(isManagedTlsRequest(req)).toBe(true);
    expect(isConnectRequest(req)).toBe(false);
    wsServer.handleUpgrade(req, socket, head, (ws) => {
      ws.send('initial');
      ws.on('message', (data) => ws.send(data));
    });
  });
  const port = await listen(server);
  const ingress = createManagedTlsIngress({ port });
  cleanup.push(async () => {
    await ingress.close();
    await new Promise<void>((resolve) => wsServer.close(() => resolve()));
  });
  const target = await ingress.start();
  const call = request({
    host: '127.0.0.1',
    port: target,
    method: 'POST',
    headers: { ...forwarded, host: 'public.tail.ts.net:8443', cookie: 'owner=session' },
  });
  const response = once(call, 'response');
  call.write('first');
  const [reply] = await response;
  expect(reply.headers['set-cookie']).toEqual(['web=session; Secure']);
  const received = once(reply, 'data');
  expect((await received)[0].toString()).toBe('first');
  call.end();
  const last = once(reply, 'data');
  finish?.();
  expect((await last)[0].toString()).toBe('last');
  const socket = new WebSocket(`ws://127.0.0.1:${target}/api/remote.mux`, {
    headers: { ...forwarded, [DEVICE_ROUTE_HEADER]: 'connect' },
  });
  const first = once(socket, 'message');
  await once(socket, 'open');
  expect((await first)[0].toString()).toBe('initial');
  const echo = once(socket, 'message');
  socket.send('roundtrip');
  expect((await echo)[0].toString()).toBe('roundtrip');
  const closed = once(socket, 'close');
  await ingress.close();
  await closed;
  expect(await reachable(target)).toBe(false);
});

function tailscale(initial?: ManagedPhoneRouteState) {
  const hostname = 'fixture.tail.ts.net';
  let state = initial;
  const web: Record<string, { Handlers: Record<string, { Proxy: string }> }> = {};
  const tcp: Record<string, { HTTPS: boolean }> = {};
  const put = (port: number, target: number) => {
    web[`${hostname}:${port}`] = { Handlers: { '/': { Proxy: `http://127.0.0.1:${target}` } } };
    tcp[String(port)] = { HTTPS: true };
  };
  if (initial?.mapping) put(initial.mapping.port, initial.mapping.target);
  const calls: string[][] = [];
  const reads: string[][] = [];
  let failVerification = false;
  const run: RunCommand = async (_file, args) => {
    if (args[0] === 'status' || args[1] === 'status') reads.push([...args]);
    if (args[0] === 'status')
      return JSON.stringify({ BackendState: 'Running', Self: { DNSName: hostname } });
    if (args[1] === 'status') {
      if (failVerification && calls.length) return '{';
      return JSON.stringify({ Web: web, TCP: tcp });
    }
    calls.push([...args]);
    const port = Number(args.find((arg) => arg.startsWith('--https='))?.slice(8) ?? 443);
    if (args.includes('off')) {
      delete web[`${hostname}:${port}`];
      delete tcp[String(port)];
    } else put(port, Number(args.at(-1)));
    return '';
  };
  const owner = (port: number) => {
    const instance = createManagedPhoneRoute({
      port,
      run,
      read: async () => state,
      write: async (next) => {
        state = next;
      },
      probe: async () => true,
    });
    cleanup.push(() => instance.close());
    return instance;
  };
  return {
    hostname,
    put,
    web,
    tcp,
    calls,
    reads,
    owner,
    state: () => state,
    failVerification(value: boolean) {
      failVerification = value;
    },
  };
}

it.each(['restart', 'disable'])(
  'recovers an unverifiable retarget by its durable attempt on %s',
  async (action) => {
    const port = await listen(createServer((_req, res) => res.end('host')));
    const fake = tailscale({
      enabled: true,
      mapping: { hostname: 'fixture.tail.ts.net', port: 8443, target: port },
    });
    fake.failVerification(true);
    const first = fake.owner(port);
    expect(await first.start()).toMatchObject({ ok: false, code: 'serve-failed' });
    const state = fake.state();
    expect(parseManagedPhoneRoute(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(state?.mapping?.target).toBe(port);
    const pendingTarget = state?.pendingTarget;
    if (!pendingTarget) throw new Error('missing-pending-target');
    expect(fake.web[`${fake.hostname}:8443`]?.Handlers['/']?.Proxy).toBe(
      `http://127.0.0.1:${pendingTarget}`,
    );
    await first.close();
    expect(await reachable(pendingTarget)).toBe(false);
    fake.failVerification(false);
    if (action === 'disable') {
      if (!state) throw new Error('missing-state');
      state.enabled = false;
      const owner = fake.owner(port);
      await owner.start();
      expect(await owner.disable()).toMatchObject({ ok: true });
      expect(fake.web[`${fake.hostname}:8443`]).toBeUndefined();
    } else {
      const restored = fake.owner(port);
      expect(await restored.start()).toMatchObject({
        ok: true,
        status: { managed: { trustedIngress: true } },
      });
      expect(fake.state()?.mapping?.port).toBe(8443);
      expect(fake.state()?.pendingTarget).toBeUndefined();
    }
  },
);

it('retargets the still-owned main-port mapping in place, restores a new ephemeral ingress and disables only its mapping', async () => {
  const port = await listen(createServer((_req, res) => res.end('host')));
  const fake = tailscale({
    enabled: true,
    mapping: { hostname: 'fixture.tail.ts.net', port: 8443, target: port },
  });
  fake.put(8447, 56789);
  const protectedMapping = structuredClone(fake.web[`${fake.hostname}:8447`]);
  const first = fake.owner(port);
  expect(await first.start()).toMatchObject({
    ok: true,
    status: { managed: { owned: true, trustedIngress: true } },
  });
  const target = fake.state()?.mapping?.target;
  expect(target).toBeTypeOf('number');
  expect(target).not.toBe(port);
  if (!target) throw new Error('missing-ingress');
  expect(await reachable(target)).toBe(true);
  expect(fake.state()?.mapping?.port).toBe(8443);
  expect(fake.calls).toEqual([['serve', '--bg', '--https=8443', String(target)]]);
  const status = await first.status();
  const readCount = fake.reads.length;
  await first.status();
  expect(fake.reads.length - readCount).toBe(2);
  expect(status.routes[0]).toMatchObject({
    url: `https://${fake.hostname}:8443`,
    memberSignIn: 'managed-tls',
  });
  expect(memberRoutes(`http://127.0.0.1:${port}`, status)).toEqual([
    `https://${fake.hostname}:8443`,
  ]);
  await first.close();
  expect(await reachable(target)).toBe(false);
  const second = fake.owner(port);
  expect(await second.start()).toMatchObject({
    ok: true,
    status: { managed: { trustedIngress: true } },
  });
  const nextTarget = fake.state()?.mapping?.target;
  if (!nextTarget) throw new Error('missing-ingress');
  expect(await reachable(nextTarget)).toBe(true);
  expect(fake.state()?.mapping?.port).toBe(8443);
  expect(await second.disable()).toMatchObject({
    ok: true,
    status: { managed: { enabled: false, owned: false, trustedIngress: false } },
  });
  expect(await reachable(nextTarget)).toBe(false);
  expect(fake.web[`${fake.hostname}:8443`]).toBeUndefined();
  expect(fake.web[`${fake.hostname}:8447`]).toEqual(protectedMapping);
});

it('never trusts or advertises a manual mapping; publish chooses a free route and preserves manual entries', async () => {
  const port = await listen(createServer((_req, res) => res.end('host')));
  const fake = tailscale();
  fake.put(443, port);
  const manual = structuredClone(fake.web[`${fake.hostname}:443`]);
  const owner = fake.owner(port);
  await owner.start();
  const untrusted = await owner.status();
  expect(untrusted.routes[0]).toMatchObject({ ready: true, memberSignIn: 'untrusted' });
  expect(untrusted.managed).toEqual({ enabled: false, owned: false, trustedIngress: false });
  expect(memberRoutes(`http://127.0.0.1:${port}`, untrusted)).toEqual([]);
  expect(await owner.enable()).toMatchObject({
    ok: true,
    status: { managed: { trustedIngress: true } },
  });
  expect(fake.state()?.mapping?.port).toBe(8443);
  const target = fake.state()?.mapping?.target;
  if (!target) throw new Error('missing-ingress');
  fake.tcp['8443'] = { HTTPS: false };
  expect(memberRoutes(`http://127.0.0.1:${port}`, await owner.status())).toEqual([]);
  fake.put(8443, 45678);
  expect(await owner.status()).toMatchObject({ managed: { owned: false, trustedIngress: false } });
  await owner.disable();
  expect(await reachable(target)).toBe(false);
  expect(fake.web[`${fake.hostname}:443`]).toEqual(manual);
  expect(fake.web[`${fake.hostname}:8443`]?.Handlers['/']?.Proxy).toBe('http://127.0.0.1:45678');
});

it('offers direct TLS and Connect while excluding plain, loopback, private and untrusted routes', () => {
  expect(
    memberRoutes('https://host.test:4443', {
      tailscale: 'running',
      serveCommand: '',
      routes: [
        {
          url: 'https://manual.tail.ts.net',
          kind: 'tailscale',
          ready: true,
          memberSignIn: 'untrusted',
        },
        {
          url: 'https://managed.tail.ts.net',
          kind: 'tailscale',
          ready: true,
          memberSignIn: 'managed-tls',
        },
        { url: 'https://127.0.0.1:3333', kind: 'loopback', ready: true },
        { url: 'http://192.168.0.2:3333', kind: 'lan', ready: true },
        { url: 'https://private.test', kind: 'private', ready: true },
        { url: 'https://habcdefghijkl.deepseekbot.dev', kind: 'connect', ready: true },
      ],
    }),
  ).toEqual([
    'https://host.test:4443',
    'https://managed.tail.ts.net',
    'https://habcdefghijkl.deepseekbot.dev',
  ]);
});
