import {
  fakeCloudflared,
  memoryCredentials,
  resolveBinary,
  tunnels,
} from './private-tunnel-fixtures.js';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import { expect, it, vi } from 'vitest';
import { createPrivateTunnel, privateTunnelHostname } from '../src/devices/private-tunnel.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
import { createDevicesHttp, type PairingOfferView } from '../src/devices/http.js';
import { detectPhoneRoutes } from '../src/devices/routes.js';
import { createNoiseIdentity } from '../src/devices/noise-identity.js';

function edgeFetch(runs: ReturnType<typeof fakeCloudflared>['runs'], reachable = () => true) {
  return (async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const run = runs.at(-1);
    if (!reachable() || run === undefined)
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    const target = run.args.includes('--url')
      ? run.args[run.args.indexOf('--url') + 1]!
      : `http://127.0.0.1:${String(namedPort.value)}`;
    return fetch(`${target}${url.pathname}`, init);
  }) as typeof fetch;
}
const namedPort = { value: 0 };

it('adds Quick and ingress independently, makes retries idempotent, and restores enabled routes only', async () => {
  const credentials = memoryCredentials();
  const cloudflared = fakeCloudflared();
  let owner: ReturnType<typeof createPrivateTunnel>;
  const options = {
    credentials: () => credentials,
    port: () => 1,
    resolveBinary,
    spawn: cloudflared.spawn,
    probeIntervalMs: 10,
    fetch: (async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      const route = owner.statuses().find((route) => route.origin === url.origin);
      if (!route?.originPort) throw new Error('missing-origin');
      return fetch(`http://127.0.0.1:${route.originPort}${url.pathname}`, init);
    }) as typeof fetch,
  };
  owner = createPrivateTunnel(options);
  tunnels.push(owner);
  await Promise.all([owner.add({ mode: 'quick' }), owner.add({ mode: 'quick' })]);
  await vi.waitFor(() => expect(owner.statuses()[0]?.state).toBe('connected'));
  const quick = owner.admission()!;
  expect(cloudflared.runs).toHaveLength(1);
  expect(await owner.add({ mode: 'ingress', origin: quick.origin })).toEqual({
    ok: false,
    code: 'private-route-origin-in-use',
  });
  await owner.add({ mode: 'ingress', origin: 'https://private.example.com' });
  await vi.waitFor(() => expect(owner.admissions()).toHaveLength(2));
  expect(new Set(owner.admissions().map((route) => route.token))).toEqual(new Set([quick.token]));
  expect(new Set(owner.statuses().map((route) => route.originPort)).size).toBe(2);
  const databaseOwner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('private-route-offer-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(databaseOwner, 'device-pairing'),
    hostName: 'Route test',
  });
  const identity = createNoiseIdentity(() => credentials);
  const http = createDevicesHttp({
    pairing,
    privateTunnel: owner,
    routes: () => detectPhoneRoutes({ port: 4100, run: async () => '' }),
    encryption: async () => ({ ...(await identity.publicIdentity()), state: 'encrypted' }),
  });
  const offer = async (routeId?: string) => {
    const response = await http(
      new Request('http://localhost/api/botharness/devices/offer', {
        method: 'POST',
        body: JSON.stringify(routeId ? { routeId } : {}),
      }),
    );
    expect(response.status).toBe(200);
    const view: PairingOfferView = await response.json();
    return {
      view,
      payload: JSON.parse(
        Buffer.from(new URL(view.link).searchParams.get('p')!, 'base64url').toString(),
      ),
    };
  };
  const combined = await offer();
  expect(combined.view.routes).toEqual([quick.origin, 'https://private.example.com']);
  expect(combined.payload.routes).toEqual([quick.origin]);
  expect(combined.payload.encryption.privateRelay.additionalOrigins).toEqual([
    'https://private.example.com',
  ]);
  const single = await offer('custom');
  expect(single.view.routes).toEqual(['https://private.example.com']);
  expect(single.payload.routes).toEqual(single.view.routes);
  expect(single.payload.encryption.privateRelay.additionalOrigins).toBeUndefined();
  expect(await owner.disable()).toEqual({ ok: false, code: 'private-route-id-required' });
  expect(await owner.add({ mode: 'ingress', origin: 'https://replacement.example.com' })).toEqual({
    ok: false,
    code: 'private-route-replace-required',
  });
  expect(owner.admissions().find((route) => route.id === 'quick')?.origin).toBe(quick.origin);
  expect(await owner.stop('quick')).toEqual({
    ok: true,
    routeId: 'quick',
    status: { state: 'off' },
  });
  expect(owner.statuses().find((route) => route.id === 'quick')).toMatchObject({
    state: 'off',
    enabled: false,
  });
  expect(owner.admissions()).toHaveLength(1);
  await owner.close();
  owner = createPrivateTunnel(options);
  tunnels.push(owner);
  await Promise.all([owner.restore(), owner.restore()]);
  await vi.waitFor(() => expect(owner.admissions()).toHaveLength(1));
  expect(cloudflared.runs).toHaveLength(1);
  expect(owner.admission()?.token).toBe(quick.token);
  const starts = await Promise.all([owner.start('quick'), owner.start('quick')]);
  expect(starts).toMatchObject([
    { ok: true, routeId: 'quick', status: { state: 'starting' } },
    { ok: true, routeId: 'quick', status: { state: 'starting' } },
  ]);
  await vi.waitFor(() => expect(owner.admissions()).toHaveLength(2));
  expect(cloudflared.runs).toHaveLength(2);
  expect(owner.statuses().find((route) => route.id === 'quick')?.addressChanged).toBe(true);
  expect(owner.admissions().find((route) => route.id === 'custom')?.origin).toBe(
    'https://private.example.com',
  );
});

it('migrates singleton admission before restoring and refuses unknown versions without overwriting them', async () => {
  const credentials = memoryCredentials();
  const key = credentialKey('botharness-core', 'private-tunnel');
  const token = '1'.repeat(64);
  credentials.records.set(key, {
    kind: 'grant',
    payload: {
      mode: 'quick',
      phoneToken: token,
      originPort: 0,
      hostname: 'old.trycloudflare.com',
    },
  });
  const cloudflared = fakeCloudflared();
  const owner = createPrivateTunnel({
    credentials: () => credentials,
    port: () => 1,
    resolveBinary,
    spawn: cloudflared.spawn,
    fetch: edgeFetch(cloudflared.runs),
  });
  tunnels.push(owner);
  await owner.restore();
  await vi.waitFor(() => expect(owner.admission()?.token).toBe(token));
  expect(credentials.records.get(key)).toMatchObject({
    kind: 'grant',
    payload: {
      version: 2,
      phoneToken: token,
      routes: [{ id: 'quick', enabled: true }],
    },
  });
  await owner.close();
  const unknown = { kind: 'grant' as const, payload: { version: 99, sentinel: 'retained' } };
  credentials.records.set(key, unknown);
  const next = createPrivateTunnel({
    credentials: () => credentials,
    port: () => 1,
    spawn: cloudflared.spawn,
  });
  tunnels.push(next);
  expect(await next.add({ mode: 'quick' })).toEqual({
    ok: false,
    code: 'private-tunnel-credential-invalid',
  });
  expect(credentials.records.get(key)).toEqual(unknown);
  expect(cloudflared.runs).toHaveLength(1);
});

it('does not publish a route when its enabled intent cannot be persisted', async () => {
  const credentials = memoryCredentials();
  credentials.modifyRecord = async () => {
    throw new Error('credential-write-failed');
  };
  const cloudflared = fakeCloudflared();
  const owner = createPrivateTunnel({
    credentials: () => credentials,
    port: () => 1,
    spawn: cloudflared.spawn,
  });
  tunnels.push(owner);
  expect(await owner.add({ mode: 'quick' })).toEqual({ ok: false, code: 'credential-unavailable' });
  expect(cloudflared.runs).toHaveLength(0);
  expect(owner.admissions()).toEqual([]);
});

it('accepts only public hostnames the person owns for a Named Tunnel', () => {
  expect(privateTunnelHostname(' Bot.Example.COM ')).toBe('bot.example.com');
  for (const refused of [
    'deepseekbot.dev',
    'a.deepseekbot.dev',
    'x.ts.net',
    'localhost',
    '1.2.3.4',
    'https://a.example.com',
    'a',
  ])
    expect(privateTunnelHostname(refused)).toBeUndefined();
});

it('reports connected only after the public address reaches this Host, and keeps phone admission across restarts', async () => {
  const credentials = memoryCredentials();
  const cloudflared = fakeCloudflared();
  let reachable = false;
  const options = {
    credentials: () => credentials,
    port: () => 1,
    resolveBinary,
    spawn: cloudflared.spawn,
    fetch: edgeFetch(cloudflared.runs, () => reachable),
    probeIntervalMs: 10,
    probeWindowMs: 200,
    reprobeMs: 20,
  };
  const tunnel = createPrivateTunnel(options);
  tunnels.push(tunnel);
  expect(await tunnel.enable({ mode: 'quick' })).toMatchObject({ ok: true });
  expect(cloudflared.runs[0]!.args).toEqual([
    'tunnel',
    '--no-autoupdate',
    '--url',
    expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/u),
  ]);
  await vi.waitFor(() =>
    expect(tunnel.status()).toMatchObject({
      state: 'error',
      issue: 'tunnel-unreachable',
      probe: 'dns',
    }),
  );
  expect(tunnel.admission()).toBeUndefined();

  reachable = true;
  await vi.waitFor(() => expect(tunnel.status().state).toBe('connected'), { timeout: 5_000 });
  const first = tunnel.admission()!;
  expect(first.origin).toBe('https://quick-1.trycloudflare.com');
  expect(first.token).toMatch(/^[a-f0-9]{64}$/u);
  await tunnel.close();

  const restored = createPrivateTunnel(options);
  tunnels.push(restored);
  await restored.restore();
  await vi.waitFor(() => expect(restored.status().state).toBe('connected'));
  expect(restored.status()).toMatchObject({
    origin: 'https://quick-2.trycloudflare.com',
    addressChanged: true,
  });
  expect(restored.admission()!.token).toBe(first.token);

  expect(await restored.disable()).toMatchObject({ ok: true, status: { state: 'off' } });
  expect(credentials.records.size).toBe(0);
  expect(restored.admission()).toBeUndefined();
}, 60_000);

it('runs a Named Tunnel from the stored connector token and refuses bad input without starting cloudflared', async () => {
  const credentials = memoryCredentials();
  const cloudflared = fakeCloudflared();
  const tunnel = createPrivateTunnel({
    credentials: () => credentials,
    port: () => 1,
    resolveBinary,
    spawn: cloudflared.spawn,
    fetch: edgeFetch(cloudflared.runs),
    probeIntervalMs: 10,
  });
  tunnels.push(tunnel);
  const token = Buffer.from(JSON.stringify({ a: 'account', t: 'tunnel', s: 'secret' })).toString(
    'base64',
  );
  expect(await tunnel.enable({ mode: 'named', hostname: 'deepseekbot.dev', token })).toEqual({
    ok: false,
    code: 'private-tunnel-hostname-invalid',
  });
  expect(
    await tunnel.enable({ mode: 'named', hostname: 'bot.example.com', token: 'nope' }),
  ).toEqual({ ok: false, code: 'private-tunnel-token-invalid' });
  expect(await tunnel.enable({ mode: 'quick', inUse: true })).toEqual({
    ok: false,
    code: 'private-route-in-use',
  });
  expect(cloudflared.runs).toHaveLength(0);

  const enabled = await tunnel.enable({ mode: 'named', hostname: 'bot.example.com', token });
  expect(enabled).toMatchObject({ ok: true });
  namedPort.value = tunnel.status().originPort!;
  expect(cloudflared.runs[0]!.args).toEqual(['tunnel', '--no-autoupdate', 'run']);
  expect(cloudflared.runs[0]!.env['TUNNEL_TOKEN']).toBe(token);
  await vi.waitFor(() => expect(tunnel.status().state).toBe('connected'));
  expect(tunnel.admission()!.origin).toBe('https://bot.example.com');
});

it('restarts cloudflared after it exits even while a public probe is pending, and reports the new Quick address', async () => {
  const credentials = memoryCredentials();
  const cloudflared = fakeCloudflared();
  const tunnel = createPrivateTunnel({
    credentials: () => credentials,
    port: () => 1,
    resolveBinary,
    spawn: cloudflared.spawn,
    fetch: edgeFetch(cloudflared.runs),
    probeIntervalMs: 10,
    reprobeMs: 5,
  });
  tunnels.push(tunnel);
  await tunnel.enable({ mode: 'quick' });
  await vi.waitFor(() => expect(tunnel.status().state).toBe('connected'));
  cloudflared.runs[0]!.child.emit('exit', 1);
  expect(tunnel.status()).toMatchObject({ state: 'error', issue: 'cloudflared-exited' });
  expect(tunnel.admission()).toBeUndefined();
  await vi.waitFor(() => expect(cloudflared.runs).toHaveLength(2), { timeout: 15_000 });
  await vi.waitFor(() => expect(tunnel.status().state).toBe('connected'));
  expect(tunnel.status()).toMatchObject({
    origin: 'https://quick-2.trycloudflare.com',
    addressChanged: true,
  });
}, 30_000);
