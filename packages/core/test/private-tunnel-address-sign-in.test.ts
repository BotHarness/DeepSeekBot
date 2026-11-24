import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import { discoverHostAddress, signInWithPassword } from '@botharness/host-client/password-sign-in';
import type { HostCarrier } from '@botharness/host-protocol/carrier';
import { CONNECT_CHANNEL_PATH } from '@botharness/host-protocol/noise/channel';
import { afterEach, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createPrivateTunnel } from '../src/devices/private-tunnel.js';
import {
  fakeCloudflared,
  memoryCredentials,
  resolveBinary,
  tunnels,
} from './private-tunnel-fixtures.js';
import { cleanup, enabledFixture, memberDeviceHost } from './team-mode-fixtures.js';

afterEach(cleanup);

const custom = 'https://team.example.test';

async function addressHost(credentials = memoryCredentials()) {
  const f = await enabledFixture();
  const host = await memberDeviceHost(f);
  const hostPort = Number(new URL(host.origin).port);
  const cloudflared = fakeCloudflared();
  const tunnel = createPrivateTunnel({
    credentials: () => credentials,
    port: () => hostPort,
    resolveBinary,
    spawn: cloudflared.spawn,
    fetch: (async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      return fetch(`http://127.0.0.1:${originPort(url.origin)}${url.pathname}`, init);
    }) as typeof fetch,
    probeIntervalMs: 10,
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
  const socket = (origin: string, headers: Record<string, string> = {}) => {
    const ws = new WebSocket(`ws://127.0.0.1:${originPort(origin)}${CONNECT_CHANNEL_PATH}`, {
      headers,
    });
    const opened = new Promise<boolean>((resolve) => {
      ws.once('open', () => resolve(true));
      ws.once('error', () => resolve(false));
      ws.once('unexpected-response', () => resolve(false));
    });
    return { ws, opened };
  };
  return { f, tunnel, carrier, connected, discover, signIn, socket, credentials };
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
