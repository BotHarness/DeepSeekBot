import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type IncomingMessage } from 'node:http';
import { connect as tcpConnect, type AddressInfo } from 'node:net';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import { discoverHostAddress, signInWithPassword } from '@botharness/host-client/password-sign-in';
import type { HostCarrier } from '@botharness/host-protocol/carrier';
import { CONNECT_CHANNEL_PATH, ConnectChannel } from '@botharness/host-protocol/noise/channel';
import { noisePublicKey } from '@botharness/host-protocol/noise/xk';
import { afterEach, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createPrivateTunnel, createTunnelOrigin } from '../src/devices/private-tunnel.js';
import { OPEN_ROUTE_PENDING_LIMIT } from '../src/devices/admission-slots.js';
import {
  DEVICE_NOISE_PEER_HEADER,
  DEVICE_ROUTE_HEADER,
  isAddressRouteRequest,
} from '../src/devices/route-context.js';
import {
  fakeCloudflared,
  memoryCredentials,
  resolveBinary,
  tunnels,
} from './private-tunnel-fixtures.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { cleanup, enabledFixture, memberDeviceHost } from './team-mode-fixtures.js';

afterEach(cleanup);

const custom = 'https://team.example.test';

async function addressHost(
  credentials: ReturnType<typeof memoryCredentials> = memoryCredentials(),
  options: { admissionDeadlineMs?: number; reprobeMs?: number } = {},
) {
  const f = await enabledFixture();
  const host = await memberDeviceHost(
    f,
    options.admissionDeadlineMs === undefined
      ? {}
      : { admissionDeadlineMs: options.admissionDeadlineMs },
  );
  const hostPort = Number(new URL(host.origin).port);
  const cloudflared = fakeCloudflared();
  const reach = { probes: true };
  const tunnel = createPrivateTunnel({
    credentials: () => credentials,
    port: () => hostPort,
    resolveBinary,
    spawn: cloudflared.spawn,
    fetch: (async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      if (!reach.probes) throw new Error('unreachable');
      return fetch(`http://127.0.0.1:${originPort(url.origin)}${url.pathname}`, init);
    }) as typeof fetch,
    probeIntervalMs: 10,
    ...(options.reprobeMs === undefined
      ? {}
      : { reprobeMs: options.reprobeMs, probeWindowMs: options.reprobeMs }),
    passwordSignInAvailable: f.devices.passwordSignInAvailable,
  });
  tunnels.push(tunnel);
  const originPort = (origin: string) => {
    const port = tunnel.statuses().find((route) => route.origin === origin)?.originPort;
    if (!port) throw new Error('missing-origin');
    return port;
  };
  const connected = async (id: 'quick' | 'custom') => {
    await expect
      .poll(() => tunnel.statuses().find((route) => route.id === id)?.state, { timeout: 5_000 })
      .toBe('connected');
    return tunnel.statuses().find((route) => route.id === id)!.origin!;
  };
  const carrier: HostCarrier = {
    randomBytes: () => randomBytes(32),
    request: async (url, init) => {
      const target = new URL(url);
      const response = await fetch(
        `http://127.0.0.1:${originPort(target.origin)}${target.pathname}`,
        {
          method: init.method,
          headers: init.headers ?? {},
          signal: init.signal,
          ...(typeof init.body === 'string' ? { body: init.body } : {}),
        },
      );
      return { status: response.status, text: () => response.text() };
    },
    openSocket: (url, events, headers) => {
      const target = new URL(url);
      const ws = new WebSocket(
        `ws://127.0.0.1:${originPort(`https://${target.host}`)}${target.pathname}`,
        {
          ...(headers ? { headers } : {}),
        },
      );
      ws.on('open', events.open);
      ws.on('message', (raw) => events.message(raw.toString()));
      ws.on('close', () => events.closed('socket-closed'));
      ws.on('error', () => events.closed('socket-error'));
      return { send: (text) => ws.send(text), close: () => ws.close() };
    },
  };
  const discover = async (origin: string) => {
    const response = await fetch(`http://127.0.0.1:${originPort(origin)}${CONNECT_CHANNEL_PATH}`);
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const signIn = (password: string, username = 'bob') =>
    signInWithPassword({ carrier, route: custom, username, password, deviceName: 'Phone' });
  const socket = (
    origin: string,
    headers: Record<string, string> = {},
    path = CONNECT_CHANNEL_PATH,
    protocols?: string[],
  ) => {
    const ws = new WebSocket(`ws://127.0.0.1:${originPort(origin)}${path}`, protocols, {
      headers,
    });
    const opened = new Promise<boolean>((resolve) => {
      ws.once('open', () => resolve(true));
      ws.once('error', () => resolve(false));
      ws.once('unexpected-response', () => resolve(false));
    });
    return { ws, opened };
  };
  const noise = (origin: string, staticKey: Uint8Array = randomBytes(32)) => {
    const channel = new ConnectChannel({
      role: 'initiator',
      route: 'connect',
      hostId: f.pairing.host().id,
      staticKey,
      ephemeralKey: randomBytes(32),
      hostKey: noisePublicKey(Uint8Array.from(f.privateKey)),
    });
    const ws = new WebSocket(`ws://127.0.0.1:${originPort(origin)}${CONNECT_CHANNEL_PATH}`);
    const answers: Record<string, unknown>[] = [];
    const waiters: ((value: Record<string, unknown>) => void)[] = [];
    let secured!: () => void;
    const ready = new Promise<void>((resolve) => {
      secured = resolve;
    });
    const send = (value: unknown) => {
      for (const frame of channel.send(JSON.stringify(value))) ws.send(frame);
    };
    ws.on('message', (data) => {
      const result = channel.receive(data.toString());
      if (result.reply) ws.send(result.reply);
      if (result.ready) secured();
      if (result.message) {
        const value = JSON.parse(result.message) as Record<string, unknown>;
        const waiter = waiters.shift();
        if (waiter) waiter(value);
        else answers.push(value);
      }
    });
    ws.once('open', () => ws.send(channel.start()));
    const next = () =>
      answers.length
        ? Promise.resolve(answers.shift()!)
        : new Promise<Record<string, unknown>>((resolve) => waiters.push(resolve));
    return {
      ws,
      ready,
      send,
      next,
      publicKey: Buffer.from(noisePublicKey(staticKey)).toString('hex'),
    };
  };
  const admitted = async (origin: string, saved: { credential: string; deviceKey: string }) => {
    const peer = noise(origin, Uint8Array.from(Buffer.from(saved.deviceKey, 'hex')));
    await peer.ready;
    peer.send({ type: 'admit', credential: saved.credential });
    expect(await peer.next()).toEqual({ type: 'admitted' });
    return peer;
  };
  return {
    f,
    host,
    tunnel,
    reach,
    carrier,
    connected,
    discover,
    signIn,
    socket,
    noise,
    admitted,
    credentials,
    originPort,
  };
}

it('keeps the custom route token-only until the Owner allows sign-in by address', async () => {
  const { f, tunnel, carrier, connected, discover, signIn, socket } = await addressHost();
  expect(await tunnel.add({ mode: 'ingress', origin: custom })).toMatchObject({ ok: true });
  await connected('custom');
  expect(tunnel.statuses()).toMatchObject([{ id: 'custom', addressSignIn: false }]);
  expect(await discover(custom)).toEqual({ status: 404, body: { code: 'private-route' } });
  expect(await discoverHostAddress({ carrier, input: custom })).toEqual({
    ok: false,
    code: 'private-route',
  });
  expect(await socket(custom).opened).toBe(false);
  expect(tunnel.addressSignInOrigins()).toEqual([]);

  expect(await tunnel.setAddressSignIn('custom', true)).toMatchObject({
    ok: true,
    routeId: 'custom',
  });
  expect(tunnel.statuses()).toMatchObject([{ id: 'custom', addressSignIn: true }]);
  expect(tunnel.status()).not.toHaveProperty('addressSignIn');
  expect(tunnel.addressSignInOrigins()).toEqual([custom]);
  expect(await discover(custom)).toEqual({
    status: 200,
    body: { host: f.pairing.host(), encryption: f.encryption, signIn: { password: true } },
  });
  const member = await signIn(f.initialPassword);
  expect(member).toMatchObject({
    ok: true,
    value: { role: 'member', member: { humanId: f.human.humanId } },
  });
});

it('keeps the Quick Tunnel token-only while the custom route allows sign-in by address', async () => {
  const { tunnel, connected, discover, socket } = await addressHost();
  await tunnel.add({ mode: 'quick' });
  await tunnel.add({ mode: 'ingress', origin: custom });
  const quick = await connected('quick');
  await connected('custom');
  expect(await tunnel.setAddressSignIn('quick', true)).toEqual({
    ok: false,
    code: 'private-route-address-sign-in-unsupported',
  });
  expect(await tunnel.setAddressSignIn('custom', true)).toMatchObject({ ok: true });
  expect(tunnel.statuses().find((route) => route.id === 'quick')).not.toHaveProperty(
    'addressSignIn',
  );
  expect(await discover(quick)).toEqual({ status: 404, body: { code: 'private-route' } });
  expect(await socket(quick).opened).toBe(false);
  expect((await discover(custom)).status).toBe(200);
});

it('applies the Team sign-in rate limit to password attempts through the custom route', async () => {
  const { tunnel, connected, signIn } = await addressHost();
  await tunnel.add({ mode: 'ingress', origin: custom });
  await connected('custom');
  await tunnel.setAddressSignIn('custom', true);
  for (let attempt = 0; attempt < 5; attempt++)
    expect(await signIn('wrong-password')).toEqual({ ok: false, code: 'credentials-invalid' });
  expect(await signIn('wrong-password')).toEqual({
    ok: false,
    code: 'rate-limited',
    retryAfterSeconds: 60,
  });
});

it('shares one address limit across usernames because every attempt arrives through the route', async () => {
  const { f, tunnel, connected, signIn } = await addressHost();
  await tunnel.add({ mode: 'ingress', origin: custom });
  await connected('custom');
  await tunnel.setAddressSignIn('custom', true);
  for (let attempt = 0; attempt < 20; attempt++)
    expect(await signIn('wrong-password', `guess-${String(attempt)}`)).toEqual({
      ok: false,
      code: 'credentials-invalid',
    });
  expect(await signIn(f.initialPassword)).toEqual({
    ok: false,
    code: 'rate-limited',
    retryAfterSeconds: 60,
  });
});

it('closes channels opened by address when the Owner turns the setting off and keeps token admission', async () => {
  const { tunnel, connected, discover, socket, credentials } = await addressHost();
  await tunnel.add({ mode: 'ingress', origin: custom });
  await connected('custom');
  await tunnel.setAddressSignIn('custom', true);
  const stored = () => credentials.records.get(credentialKey('botharness-core', 'private-tunnel'));
  expect(stored()).toMatchObject({
    kind: 'grant',
    payload: { routes: [{ id: 'custom', addressSignIn: true }] },
  });
  const token = tunnel.admissions()[0]!.token;
  const byAddress = socket(custom);
  const byToken = socket(custom, { authorization: `Bearer ${token}` });
  expect(await byAddress.opened).toBe(true);
  expect(await byToken.opened).toBe(true);
  const closed = once(byAddress.ws, 'close');

  expect(await tunnel.setAddressSignIn('custom', false)).toMatchObject({ ok: true });
  await closed;
  expect(byToken.ws.readyState).toBe(WebSocket.OPEN);
  expect(await discover(custom)).toEqual({ status: 404, body: { code: 'private-route' } });
  expect(await socket(custom).opened).toBe(false);
  expect(stored()).not.toMatchObject({ payload: { routes: [{ addressSignIn: true }] } });
  expect(stored()).toMatchObject({ payload: { routes: [{ id: 'custom' }] } });
  byToken.ws.close();
});

it('restores the setting after restart and turns it off when the custom route is replaced', async () => {
  const credentials = memoryCredentials();
  const first = await addressHost(credentials);
  await first.tunnel.add({ mode: 'ingress', origin: custom });
  await first.connected('custom');
  await first.tunnel.setAddressSignIn('custom', true);
  await first.tunnel.close();

  const second = await addressHost(credentials);
  await second.tunnel.restore();
  await second.connected('custom');
  expect(second.tunnel.statuses()).toMatchObject([{ id: 'custom', addressSignIn: true }]);
  expect((await second.discover(custom)).status).toBe(200);

  const replaced = 'https://other.example.test';
  expect(
    await second.tunnel.replace('custom', { mode: 'ingress', origin: replaced }),
  ).toMatchObject({ ok: true });
  await second.connected('custom');
  expect(second.tunnel.statuses()).toMatchObject([
    { id: 'custom', origin: replaced, addressSignIn: false },
  ]);
  expect(await second.discover(replaced)).toEqual({
    status: 404,
    body: { code: 'private-route' },
  });
});

it('lists an address route in invitations and member pairing offers but never as a browser member page', async () => {
  const addresses: string[] = [];
  const f = await enabledFixture({
    routes: async () => ['https://host.test'],
    addressRoutes: () => addresses,
  });
  const decode = (link: string) =>
    JSON.parse(Buffer.from(new URL(link).searchParams.get('i')!, 'base64url').toString()) as {
      routes: string[];
    };
  expect(decode((await f.devices.invitation(f.human.humanId)).link).routes).toEqual([
    'https://host.test',
  ]);
  addresses.push(custom);
  expect(decode((await f.devices.invitation(f.human.humanId)).link).routes).toEqual([
    'https://host.test',
    custom,
  ]);
  expect((await f.team.modeStatus(OWNER_HUMAN_CONTEXT)).memberUrls).toEqual([
    'https://host.test/botharness-device/team/',
  ]);
});

async function addressRoute(options: Parameters<typeof addressHost>[1] = {}) {
  const context = await addressHost(memoryCredentials(), options);
  await context.tunnel.add({ mode: 'ingress', origin: custom });
  await context.connected('custom');
  return context;
}

it('still refuses a wrong or garbled admission while sign-in by address is on', async () => {
  const { tunnel, socket } = await addressRoute();
  await tunnel.setAddressSignIn('custom', true);
  const wrong = 'f'.repeat(64);
  for (const headers of [
    { authorization: `Bearer ${wrong}` },
    { authorization: 'Bearer garbled' },
    { authorization: 'Basic abc' },
    { 'x-botharness-admission': wrong },
    { 'x-botharness-admission': 'garbled' },
  ])
    expect(await socket(custom, headers).opened).toBe(false);
  for (const protocols of [
    ['botharness-private-channel-v1', `botharness-admission.${wrong}`],
    ['botharness-private-channel-v1', 'botharness-admission.garbled'],
    ['other-protocol'],
  ])
    expect(await socket(custom, {}, CONNECT_CHANNEL_PATH, protocols).opened).toBe(false);
  expect(await socket(custom, { cookie: 'a=b' }).opened).toBe(false);
  expect(await socket(custom).opened).toBe(true);
});

it('answers only the discovery path and the channel upgrade while sign-in by address is on', async () => {
  const { tunnel, socket, originPort } = await addressRoute();
  await tunnel.setAddressSignIn('custom', true);
  const base = `http://127.0.0.1:${originPort(custom)}`;
  for (const path of [
    '/',
    '/api/botharness/devices',
    `${CONNECT_CHANNEL_PATH}?x`,
    '/botharness-device/team/',
  ])
    expect((await fetch(`${base}${path}`)).status).toBe(404);
  expect((await fetch(`${base}${CONNECT_CHANNEL_PATH}`, { method: 'POST' })).status).toBe(404);
  for (const path of ['/', '/api/remote.mux', `${CONNECT_CHANNEL_PATH}?x`])
    expect(await socket(custom, {}, path).opened).toBe(false);
});

it('forwards only the discovery body and an allowlist of headers', async () => {
  const upstream = createServer((_request, response) => {
    response.writeHead(200, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'set-cookie': 'session=secret',
      'x-powered-by': 'host',
      'strict-transport-security': 'max-age=1',
    });
    response.end('{"host":{}}');
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const origin = createTunnelOrigin({
    port: () => (upstream.address() as AddressInfo).port,
    phoneToken: () => 'a'.repeat(64),
    probe: () => undefined,
    addressSignIn: () => true,
  });
  await new Promise<void>((resolve) => origin.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${String((origin.address() as AddressInfo).port)}${CONNECT_CHANNEL_PATH}`,
      { headers: { cookie: 'a=b' } },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"host":{}}');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('x-powered-by')).toBeNull();
    expect(response.headers.get('strict-transport-security')).toBeNull();
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  } finally {
    origin.closeAllConnections();
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => origin.close(() => resolve()));
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

it('refuses sign-in by address on an HTTPS ingress whose origin listens on the LAN', async () => {
  const { tunnel, connected, discover, socket } = await addressHost();
  await tunnel.add({ mode: 'ingress', origin: custom, lan: true });
  await connected('custom');
  expect(await tunnel.setAddressSignIn('custom', true)).toEqual({
    ok: false,
    code: 'private-route-address-sign-in-lan',
  });
  expect(tunnel.statuses()).toMatchObject([{ id: 'custom', addressSignIn: false }]);
  expect(await discover(custom)).toEqual({ status: 404, body: { code: 'private-route' } });
  expect(await socket(custom).opened).toBe(false);
  expect(tunnel.addressSignInOrigins()).toEqual([]);
});

it('refuses sign-in by address while no password sign-in is available and goes inert when Team mode turns off', async () => {
  const { f, tunnel, discover, socket } = await addressRoute();
  await tunnel.setAddressSignIn('custom', true);
  expect((await discover(custom)).status).toBe(200);
  await f.team.setMode(OWNER_HUMAN_CONTEXT, false);
  expect(f.devices.passwordSignInAvailable()).toBe(false);
  expect(await discover(custom)).toEqual({ status: 404, body: { code: 'private-route' } });
  expect(await socket(custom).opened).toBe(false);
  expect(tunnel.addressSignInOrigins()).toEqual([]);

  expect(await tunnel.setAddressSignIn('custom', false)).toMatchObject({ ok: true });
  expect(await tunnel.setAddressSignIn('custom', true)).toEqual({
    ok: false,
    code: 'private-route-address-sign-in-unavailable',
  });
});

it('closes the route in memory when turning sign-in by address off cannot be saved', async () => {
  const credentials = memoryCredentials();
  const { tunnel, discover, socket } = await addressHost(credentials);
  await tunnel.add({ mode: 'ingress', origin: custom });
  await tunnel.setAddressSignIn('custom', true);
  await expect.poll(() => tunnel.statuses()[0]?.state, { timeout: 5_000 }).toBe('connected');
  const open = socket(custom);
  expect(await open.opened).toBe(true);
  const closed = once(open.ws, 'close');
  credentials.modifyRecord = async () => {
    throw new Error('provider-unavailable');
  };
  expect(await tunnel.setAddressSignIn('custom', false)).toEqual({
    ok: false,
    code: 'credential-unavailable',
  });
  await closed;
  expect(tunnel.statuses()).toMatchObject([{ id: 'custom', addressSignIn: false }]);
  expect(tunnel.addressSignInOrigins()).toEqual([]);
  expect(await discover(custom)).toEqual({ status: 404, body: { code: 'private-route' } });
  expect(await socket(custom).opened).toBe(false);
});

it('caps channels opened by address without limiting token-admitted channels', async () => {
  const { tunnel, socket } = await addressRoute();
  await tunnel.setAddressSignIn('custom', true);
  const sockets = Array.from({ length: OPEN_ROUTE_PENDING_LIMIT }, () => socket(custom));
  expect(await Promise.all(sockets.map((entry) => entry.opened))).toEqual(sockets.map(() => true));
  expect(await socket(custom).opened).toBe(false);
  const token = tunnel.admissions()[0]!.token;
  const byToken = socket(custom, { authorization: `Bearer ${token}` });
  expect(await byToken.opened).toBe(true);
  const freed = once(sockets[0]!.ws, 'close');
  sockets[0]!.ws.close();
  await freed;
  await expect.poll(async () => socket(custom).opened, { timeout: 2_000 }).toBe(true);
  for (const entry of [...sockets, byToken]) entry.ws.close();
});

it('closes channels that never admit a device before the deadline, by address or by token', async () => {
  const { tunnel, socket } = await addressRoute({ admissionDeadlineMs: 200 });
  await tunnel.setAddressSignIn('custom', true);
  const token = tunnel.admissions()[0]!.token;
  const byAddress = socket(custom);
  const byToken = socket(custom, { authorization: `Bearer ${token}` });
  expect(await byAddress.opened).toBe(true);
  expect(await byToken.opened).toBe(true);
  await Promise.all([once(byAddress.ws, 'close'), once(byToken.ws, 'close')]);
});

it('rate-limits the address route under its own key so other loopback routes keep signing in', async () => {
  const { f, host, tunnel, signIn } = await addressRoute();
  await tunnel.setAddressSignIn('custom', true);
  for (let attempt = 0; attempt < 5; attempt++)
    expect(await signIn('wrong-password')).toEqual({ ok: false, code: 'credentials-invalid' });
  for (let attempt = 0; attempt < 15; attempt++)
    expect(await signIn('wrong-password', `guess-${String(attempt)}`)).toEqual({
      ok: false,
      code: 'credentials-invalid',
    });
  expect(await signIn(f.initialPassword)).toMatchObject({ ok: false, code: 'rate-limited' });
  const direct = await signInWithPassword({
    carrier: host.carrier,
    route: 'https://direct.example.test',
    username: 'bob',
    password: f.initialPassword,
    deviceName: 'Phone',
  });
  expect(direct).toMatchObject({ ok: true, value: { role: 'member' } });
});

it('drops the address route from sign-in origins while it is disconnected or stopped', async () => {
  const { tunnel, reach, connected } = await addressRoute({ reprobeMs: 25 });
  await tunnel.setAddressSignIn('custom', true);
  expect(tunnel.addressSignInOrigins()).toEqual([custom]);
  reach.probes = false;
  await expect.poll(() => tunnel.addressSignInOrigins(), { timeout: 3_000 }).toEqual([]);
  reach.probes = true;
  await connected('custom');
  expect(tunnel.addressSignInOrigins()).toEqual([custom]);
  expect(await tunnel.stop('custom')).toMatchObject({ ok: true });
  expect(tunnel.addressSignInOrigins()).toEqual([]);
});

it('never counts channels admitted by address against the unadmitted cap', async () => {
  const { f, tunnel, signIn, socket, admitted } = await addressRoute();
  await tunnel.setAddressSignIn('custom', true);
  const member = await signIn(f.initialPassword);
  if (!member.ok || !member.value.encryption) throw new Error('sign-in-failed');
  const saved = {
    credential: member.value.credential,
    deviceKey: member.value.encryption.deviceKey,
  };
  const members = [];
  for (let index = 0; index < OPEN_ROUTE_PENDING_LIMIT + 1; index++)
    members.push(await admitted(custom, saved));
  const pending = Array.from({ length: OPEN_ROUTE_PENDING_LIMIT }, () => socket(custom));
  expect(await Promise.all(pending.map((entry) => entry.opened))).toEqual(pending.map(() => true));
  expect(await socket(custom).opened).toBe(false);
  for (const entry of members) expect(entry.ws.readyState).toBe(WebSocket.OPEN);
  const freed = once(pending[0]!.ws, 'close');
  pending[0]!.ws.close();
  await freed;
  await expect
    .poll(async () => (await admitted(custom, saved)).ws.readyState, { timeout: 2_000 })
    .toBe(WebSocket.OPEN);
  for (const entry of [...members, ...pending]) entry.ws.close();
});

it('keeps an Owner pairing channel opened by address while it waits for approval', async () => {
  const { f, tunnel, noise, socket } = await addressRoute({ admissionDeadlineMs: 200 });
  await tunnel.setAddressSignIn('custom', true);
  const offer = f.pairing.createOffer();
  const peer = noise(custom);
  await peer.ready;
  peer.send({ type: 'pair', offer: offer.offer, name: 'Address phone' });
  expect(await peer.next()).toEqual({ type: 'pair-pending', receipt: offer.receipt });
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(peer.ws.readyState).toBe(WebSocket.OPEN);
  const others = Array.from({ length: OPEN_ROUTE_PENDING_LIMIT }, () => socket(custom));
  expect(await Promise.all(others.map((entry) => entry.opened))).toEqual(others.map(() => true));
  f.pairing.approveKey(offer.receipt, peer.publicKey);
  expect(await peer.next()).toMatchObject({ type: 'paired' });
  for (const entry of [peer, ...others]) entry.ws.close();
});

it('keeps one channel opened by address waiting on each pairing code', async () => {
  const { f, tunnel, noise, socket } = await addressRoute();
  await tunnel.setAddressSignIn('custom', true);
  const offer = f.pairing.createOffer();
  const key = randomBytes(32);
  const pair = async () => {
    const peer = noise(custom, key);
    await peer.ready;
    peer.send({ type: 'pair', offer: offer.offer, name: 'Address phone' });
    expect(await peer.next()).toEqual({ type: 'pair-pending', receipt: offer.receipt });
    return peer;
  };
  const waiting = [await pair()];
  for (let index = 0; index < 3; index++) {
    const replaced = once(waiting.at(-1)!.ws, 'close');
    waiting.push(await pair());
    await replaced;
  }
  const latest = waiting.at(-1)!;
  latest.send({ type: 'pair', offer: offer.offer, name: 'Address phone' });
  expect(await latest.next()).toEqual({ type: 'pair-pending', receipt: offer.receipt });
  expect(latest.ws.readyState).toBe(WebSocket.OPEN);
  const token = tunnel.admissions()[0]!.token;
  const byToken = socket(custom, { authorization: `Bearer ${token}` });
  expect(await byToken.opened).toBe(true);
  f.pairing.approveKey(offer.receipt, latest.publicKey);
  expect(await latest.next()).toMatchObject({ type: 'paired' });
  for (const entry of [latest, byToken]) entry.ws.close();
});

it('lets unadmitted address channels expire once password sign-in becomes unavailable', async () => {
  const { f, tunnel, socket, discover } = await addressRoute({ admissionDeadlineMs: 200 });
  await tunnel.setAddressSignIn('custom', true);
  const open = socket(custom);
  expect(await open.opened).toBe(true);
  const closed = once(open.ws, 'close');
  await f.team.setMode(OWNER_HUMAN_CONTEXT, false);
  expect(await socket(custom).opened).toBe(false);
  await closed;
  expect(await discover(custom)).toEqual({ status: 404, body: { code: 'private-route' } });
});

it('ignores a stored address sign-in flag on an HTTPS ingress that listens on the LAN', async () => {
  const credentials = memoryCredentials();
  const key = credentialKey('botharness-core', 'private-tunnel');
  const first = await addressHost(credentials);
  await first.tunnel.add({ mode: 'ingress', origin: custom, lan: true });
  await first.connected('custom');
  await first.tunnel.close();
  const record = credentials.records.get(key) as {
    payload: { routes: Record<string, unknown>[] };
  };
  record.payload.routes[0]!['addressSignIn'] = true;

  const second = await addressHost(credentials);
  await second.tunnel.restore();
  await second.connected('custom');
  expect(second.tunnel.statuses()).toMatchObject([{ id: 'custom', addressSignIn: false }]);
  expect(second.tunnel.addressSignInOrigins()).toEqual([]);
  expect(await second.discover(custom)).toEqual({ status: 404, body: { code: 'private-route' } });
  expect(await second.socket(custom).opened).toBe(false);
  expect(await second.tunnel.setAddressSignIn('custom', false)).toMatchObject({ ok: true });
  expect(credentials.records.get(key)).not.toMatchObject({
    payload: { routes: [{ addressSignIn: true }] },
  });
});

async function capturingOrigin() {
  const seen: { headers: IncomingMessage['headers']; address: boolean }[] = [];
  const upstream = createServer();
  upstream.on('upgrade', (request: IncomingMessage, socket) => {
    seen.push({ headers: request.headers, address: isAddressRouteRequest(request) });
    socket.destroy();
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const token = 'a'.repeat(64);
  const origin = createTunnelOrigin({
    port: () => (upstream.address() as AddressInfo).port,
    phoneToken: () => token,
    probe: () => undefined,
    addressSignIn: () => true,
  });
  await new Promise<void>((resolve) => origin.listen(0, '127.0.0.1', resolve));
  const port = (origin.address() as AddressInfo).port;
  return {
    seen,
    token,
    port,
    close: async () => {
      origin.closeAllConnections();
      upstream.closeAllConnections();
      await new Promise<void>((resolve) => origin.close(() => resolve()));
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    },
  };
}

it('strips a forged route or Noise peer header and classifies only its own address stamp', async () => {
  const origin = await capturingOrigin();
  try {
    const forged = { [DEVICE_ROUTE_HEADER]: 'forged', [DEVICE_NOISE_PEER_HEADER]: 'forged.peer' };
    const open = (headers: Record<string, string>) =>
      new Promise<void>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${String(origin.port)}${CONNECT_CHANNEL_PATH}`, {
          headers,
        });
        ws.once('error', () => resolve());
        ws.once('close', () => resolve());
      });
    await open(forged);
    await open({ ...forged, authorization: `Bearer ${origin.token}` });
    await expect.poll(() => origin.seen.length).toBe(2);
    const [byAddress, byToken] = origin.seen;
    expect(byAddress?.address).toBe(true);
    expect(byAddress?.headers[DEVICE_ROUTE_HEADER]).not.toBe('forged');
    expect(byAddress?.headers[DEVICE_NOISE_PEER_HEADER]).toBeUndefined();
    expect(byToken?.address).toBe(false);
    expect(byToken?.headers[DEVICE_ROUTE_HEADER]).toBeUndefined();
    expect(byToken?.headers[DEVICE_NOISE_PEER_HEADER]).toBeUndefined();
  } finally {
    await origin.close();
  }
});

it('refuses a non-GET WebSocket upgrade by address before it reaches the Host', async () => {
  const origin = await capturingOrigin();
  try {
    const reply = await new Promise<string>((resolve) => {
      const socket = tcpConnect(origin.port, '127.0.0.1', () => {
        socket.write(
          [
            `POST ${CONNECT_CHANNEL_PATH} HTTP/1.1`,
            'host: team.example.test',
            'connection: Upgrade',
            'upgrade: websocket',
            'sec-websocket-version: 13',
            `sec-websocket-key: ${randomBytes(16).toString('base64')}`,
            '',
            '',
          ].join('\r\n'),
        );
      });
      let text = '';
      socket.setEncoding('utf8');
      socket.on('data', (chunk: string) => {
        text += chunk;
      });
      socket.on('close', () => resolve(text));
    });
    expect(reply.startsWith('HTTP/1.1 404')).toBe(true);
    expect(origin.seen).toEqual([]);
  } finally {
    await origin.close();
  }
});
