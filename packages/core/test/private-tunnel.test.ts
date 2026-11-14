import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { EventEmitter, once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { PassThrough } from 'node:stream';
import {
  credentialKey,
  type CredentialProvider,
  type CredentialRecord,
} from '@deepseek-ai/dsh-credentials';
import { afterEach, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import {
  browserAdmissionProtocols,
  BROWSER_ADMISSION_PROTOCOL,
} from '../../../deploy/private-relay/admission.mjs';
import {
  createPrivateTunnel,
  createQuickTunnelLookup,
  createTrustFetch,
  privateTunnelHostname,
  probeFailure,
  PROBE_PREFIX,
  systemTrustedCertificates,
} from '../src/devices/private-tunnel.js';
import type { SpawnTunnel, TunnelProcess } from '../src/devices/connect.js';
import { createEncryptedGateway } from '../src/devices/encrypted-gateway.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { noisePublicKey } from '../src/devices/noise/xk.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
import { redeemPairing } from '../../../apps/mobile/src/host/pairing.js';
import { encryptedCarrier } from '../../../apps/mobile/src/host/encrypted-carrier.js';
import { createDevicesHttp, type PairingOfferView } from '../src/devices/http.js';
import { detectPhoneRoutes } from '../src/devices/routes.js';
import { createNoiseIdentity } from '../src/devices/noise-identity.js';
import type { HostCarrier } from '../../../apps/mobile/src/host/carrier.js';

type Credentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>;

function memoryCredentials(): Credentials & { records: Map<string, CredentialRecord> } {
  const records = new Map<string, CredentialRecord>();
  return {
    records,
    readRecord: async (key) => records.get(key),
    modifyRecord: async (key, mutate) => {
      const next = await mutate(records.get(key));
      if (next) records.set(key, next);
      else records.delete(key);
      return next;
    },
    deleteRecord: async (key) => {
      records.delete(key);
    },
  };
}

function fakeCloudflared() {
  const runs: { args: readonly string[]; env: NodeJS.ProcessEnv; child: EventEmitter }[] = [];
  let address = 0;
  const spawn: SpawnTunnel = (_binary, args, env) => {
    const child = new EventEmitter() as EventEmitter & TunnelProcess;
    const stderr = new PassThrough();
    Object.assign(child, { stderr, kill: () => child.emit('exit', null) });
    runs.push({ args, env, child });
    address += 1;
    setTimeout(() => {
      if (args.includes('--url'))
        stderr.write(`INF |  https://quick-${String(address)}.trycloudflare.com  |\n`);
      stderr.write('INF Registered tunnel connection connIndex=0\n');
    }, 5);
    return child;
  };
  return { runs, spawn };
}

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

const resolveBinary = async () => ({ binary: 'cloudflared', source: 'package' as const });
const tunnels: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const tunnel of tunnels.splice(0)) await tunnel.close();
});

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

it.each([false, true])(
  'pairs one phone across two private origins, confines admission and revokes both without replay (browser=%s)',
  async (browser) => {
    const owner = trackTestOwner(
      mountOperationalDatabase({
        dshHome: createTempRoot('tunnel-host-'),
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      }),
    );
    const pairing = createDevicePairing({
      database: attachOperationalModule(owner, 'device-pairing'),
      hostName: 'Tunnel Host',
    });
    const hostKey = randomBytes(32);
    let leakedAuthorization = false;
    const received: string[] = [];
    const http = createServer(async (request, response) => {
      let text = '';
      for await (const chunk of request) text += String(chunk);
      received.push(text);
      response.end(text);
    });
    http.listen(0, '127.0.0.1');
    await once(http, 'listening');
    const port = (http.address() as AddressInfo).port;
    const gateway = createEncryptedGateway({
      pairing,
      key: async () => Uint8Array.from(hostKey),
      port: () => port,
    });
    http.on('upgrade', (request, socket, head) => {
      if (request.headers.authorization !== undefined) leakedAuthorization = true;
      void gateway.upgrade(request, socket, head);
    });
    const cloudflared = fakeCloudflared();
    const credentials = memoryCredentials();
    const tunnel = createPrivateTunnel({
      credentials: () => credentials,
      port: () => port,
      resolveBinary,
      spawn: cloudflared.spawn,
      fetch: (async (input: string, init?: RequestInit) => {
        const url = new URL(input);
        const route = tunnel.statuses().find((route) => route.origin === url.origin);
        if (!route?.originPort) throw new Error('missing-origin');
        return fetch(`http://127.0.0.1:${route.originPort}${url.pathname}`, init);
      }) as typeof fetch,
      probeIntervalMs: 10,
    });
    tunnels.push(tunnel);
    let carrier: HostCarrier | undefined;
    try {
      await tunnel.enable({ mode: 'quick' });
      await vi.waitFor(() => expect(tunnel.status().state).toBe('connected'));
      await tunnel.add({ mode: 'ingress', origin: 'https://custom.example.com' });
      await vi.waitFor(() => expect(tunnel.admissions()).toHaveLength(2));
      const admission = {
        ...tunnel.admission()!,
        additionalOrigins: ['https://custom.example.com'],
      };
      const local = `ws://127.0.0.1:${String(tunnel.status().originPort)}`;
      const refused = async (
        headers?: Record<string, string>,
        path = '/botharness-device/channel',
      ) => {
        const socket = new WebSocket(local + path, headers ? { headers } : {});
        const [error] = (await once(socket, 'error')) as [Error];
        return error.message;
      };
      expect(await refused()).toMatch(/404/u);
      expect(await refused({ Authorization: 'Bearer ' + 'f'.repeat(64) })).toMatch(/404/u);
      expect(
        await refused({ Authorization: 'Bearer ' + admission.token }, '/api/botharness/devices'),
      ).toMatch(/404/u);
      expect(
        (
          await fetch(
            `http://127.0.0.1:${String(tunnel.status().originPort)}/api/botharness/devices`,
          )
        ).status,
      ).toBe(404);
      expect(
        (await fetch(`http://127.0.0.1:${String(tunnel.status().originPort)}${PROBE_PREFIX}stale`))
          .status,
      ).toBe(404);

      const raw: HostCarrier = {
        randomBytes: () => randomBytes(32),
        request: async () => {
          throw new Error('No plaintext requests permitted');
        },
        openSocket: (url, events, headers) => {
          const origin = new URL(url).origin.replace('wss:', 'https:');
          const route = tunnel.statuses().find((route) => route.origin === origin);
          expect(route).toBeDefined();
          expect(headers?.['X-BotHarness-Admission']).toBe(admission.token);
          const address = `ws://127.0.0.1:${route!.originPort}/botharness-device/channel`;
          const socket = browser
            ? new WebSocket(address, browserAdmissionProtocols(admission.token))
            : new WebSocket(address, { headers });
          socket.on('open', events.open);
          socket.on('message', (data) => events.message(data.toString()));
          socket.on('close', () => events.closed('closed'));
          socket.on('error', () => events.closed('error'));
          return { send: (text) => socket.send(text), close: () => socket.terminate() };
        },
      };
      const offer = pairing.createOffer();
      const result = await redeemPairing({
        deviceName: 'Tunnel Phone',
        carrier: raw,
        payload: {
          host: pairing.host(),
          routes: [admission.origin],
          offer: offer.offer,
          expiresAt: offer.expiresAt,
          encryption: {
            protocol: 'connect-noise-xk-v1',
            publicKey: Buffer.from(noisePublicKey(hostKey)).toString('hex'),
            privateRelay: admission,
          },
        },
        confirmFingerprint: async () => true,
        onPending: () => {
          const pending = pairing.pendingKeys().find((p) => p.receipt === offer.receipt);
          if (pending) pairing.approveKey(pending.receipt, pending.publicKey);
        },
      });
      if (!result.ok) throw new Error(result.code);
      carrier = encryptedCarrier({
        raw,
        hostId: result.host.hostId,
        credential: result.host.credential,
        encryption: result.host.encryption!,
      });
      expect(result.host.routes).toEqual([admission.origin, 'https://custom.example.com']);
      const request = (origin = admission.origin) =>
        carrier!.request(origin + '/botharness-device/api/botharness/privateInputSubmit', {
          method: 'POST',
          body: 'tunnel-sentinel',
          signal: AbortSignal.timeout(3000),
        });
      expect(await (await request()).text()).toBe('tunnel-sentinel');
      expect(await (await request('https://custom.example.com')).text()).toBe('tunnel-sentinel');
      expect(received).toEqual(['tunnel-sentinel', 'tunnel-sentinel']);
      await expect(request('https://unpaired.example.com')).rejects.toMatchObject({
        code: 'route-invalid',
      });
      await tunnel.stop('quick');
      expect(await (await request('https://custom.example.com')).text()).toBe('tunnel-sentinel');
      expect(leakedAuthorization).toBe(false);
      pairing.revoke(result.host.deviceId);
      await expect(request('https://custom.example.com')).rejects.toThrow();
      await tunnel.start('quick');
      await vi.waitFor(() => expect(tunnel.admissions()).toHaveLength(2));
      const refreshed = tunnel.admissions().find((route) => route.id === 'quick')!;
      carrier.close?.();
      carrier = encryptedCarrier({
        raw,
        hostId: result.host.hostId,
        credential: result.host.credential,
        encryption: {
          ...result.host.encryption!,
          privateRelay: { ...admission, origin: refreshed.origin },
        },
      });
      await expect(request(refreshed.origin)).rejects.toThrow();
      expect(received).toEqual(['tunnel-sentinel', 'tunnel-sentinel', 'tunnel-sentinel']);
    } finally {
      carrier?.close?.();
      gateway.close();
      http.closeAllConnections();
      http.close();
    }
  },
);

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

it('accepts a bring-your-own HTTPS origin only after its public check, with admission in the dedicated header', async () => {
  const credentials = memoryCredentials();
  const cloudflared = fakeCloudflared();
  const seen: string[] = [];
  let reachable = false;
  let target = '';
  const tunnel = createPrivateTunnel({
    credentials: () => credentials,
    port: () => 1,
    resolveBinary,
    spawn: cloudflared.spawn,
    fetch: (async (input: string, init?: RequestInit) => {
      seen.push(input);
      if (!reachable)
        throw Object.assign(new TypeError('fetch failed'), {
          cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' },
        });
      return fetch(`${target}${new URL(input).pathname}`, init);
    }) as typeof fetch,
    probeIntervalMs: 10,
    probeWindowMs: 100,
    reprobeMs: 20,
  });
  tunnels.push(tunnel);
  for (const refused of [
    'http://bot.example.com',
    'https://bot.example.com/path',
    'https://x.ts.net',
    'https://127.0.0.1:8443',
    'https://deepseekbot.dev',
  ])
    expect(await tunnel.enable({ mode: 'ingress', origin: refused })).toEqual({
      ok: false,
      code: 'private-ingress-origin-invalid',
    });
  expect(
    await tunnel.enable({ mode: 'ingress', origin: 'https://bot.corp.internal:8443' }),
  ).toMatchObject({
    ok: true,
    status: { mode: 'ingress', origin: 'https://bot.corp.internal:8443', lan: false },
  });
  expect(cloudflared.runs).toHaveLength(0);
  target = `http://127.0.0.1:${String(tunnel.status().originPort)}`;
  await vi.waitFor(() =>
    expect(tunnel.status()).toMatchObject({
      state: 'error',
      issue: 'tunnel-unreachable',
      probe: 'tls',
    }),
  );
  expect(tunnel.admission()).toBeUndefined();
  reachable = true;
  await vi.waitFor(() => expect(tunnel.status().state).toBe('connected'));
  expect(seen.at(-1)).toMatch(
    /^https:\/\/bot\.corp\.internal:8443\/\.well-known\/botharness-tunnel\//u,
  );
  const admission = tunnel.admission()!;
  expect(admission.origin).toBe('https://bot.corp.internal:8443');

  const gateway = createServer();
  const headers: Record<string, string | string[] | undefined>[] = [];
  gateway.on('upgrade', (request, socket) => {
    headers.push(request.headers);
    socket.end('HTTP/1.1 404 Not Found\r\ncontent-length: 0\r\n\r\n');
  });
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  const port = (gateway.address() as AddressInfo).port;
  const forwarded = createPrivateTunnel({
    credentials: () => credentials,
    port: () => port,
    resolveBinary,
    spawn: cloudflared.spawn,
    fetch: (async (input: string, init?: RequestInit) =>
      fetch(
        `http://127.0.0.1:${String(forwarded.status().originPort)}${new URL(input).pathname}`,
        init,
      )) as typeof fetch,
    probeIntervalMs: 10,
  });
  tunnels.push(forwarded);
  await tunnel.close();
  await forwarded.restore();
  await vi.waitFor(() => expect(forwarded.status().state).toBe('connected'));
  expect(forwarded.admission()!.token).toBe(admission.token);
  const socket = new WebSocket(
    `ws://127.0.0.1:${String(forwarded.status().originPort)}/botharness-device/channel`,
    { headers: { 'X-BotHarness-Admission': admission.token } },
  );
  await once(socket, 'error');
  expect(headers).toHaveLength(1);
  expect(headers[0]!['x-botharness-admission']).toBeUndefined();
  expect(headers[0]!['authorization']).toBeUndefined();
  const browserSocket = new WebSocket(
    `ws://127.0.0.1:${String(forwarded.status().originPort)}/botharness-device/channel`,
    browserAdmissionProtocols(admission.token),
  );
  await once(browserSocket, 'error');
  expect(headers).toHaveLength(2);
  expect(headers[1]!['sec-websocket-protocol']).toBe(BROWSER_ADMISSION_PROTOCOL);
  expect(JSON.stringify(headers[1])).not.toContain(admission.token);
  const invalidBrowser = new WebSocket(
    `ws://127.0.0.1:${String(forwarded.status().originPort)}/botharness-device/channel`,
    [BROWSER_ADMISSION_PROTOCOL, 'botharness-admission.bad'],
  );
  await once(invalidBrowser, 'error');
  expect(headers).toHaveLength(2);
  const conflictBrowser = new WebSocket(
    `ws://127.0.0.1:${String(forwarded.status().originPort)}/botharness-device/channel`,
    browserAdmissionProtocols(admission.token),
    {
      headers: {
        Authorization: `Bearer ${admission.token}`,
        'X-BotHarness-Admission': 'ff'.repeat(32),
      },
    },
  );
  await once(conflictBrowser, 'error');
  expect(headers).toHaveLength(2);
  gateway.close();
});

const openssl = spawnSync('openssl', ['version']).status === 0;
it.skipIf(!openssl)(
  'checks HTTPS origins against the given trust store and reports untrusted certificates as tls',
  async () => {
    const dir = createTempRoot('private-ingress-ca-');
    const run = (...args: string[]) => {
      const result = spawnSync('openssl', args, { cwd: dir, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr);
    };
    writeFileSync(join(dir, 'leaf.ext'), 'subjectAltName=DNS:localhost,IP:127.0.0.1\n');
    run(
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=Test Corp CA',
      '-keyout',
      'ca.key',
      '-out',
      'ca.pem',
    );
    run(
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-subj',
      '/CN=localhost',
      '-keyout',
      'leaf.key',
      '-out',
      'leaf.csr',
    );
    run(
      'x509',
      '-req',
      '-in',
      'leaf.csr',
      '-CA',
      'ca.pem',
      '-CAkey',
      'ca.key',
      '-CAcreateserial',
      '-days',
      '1',
      '-extfile',
      'leaf.ext',
      '-out',
      'leaf.pem',
    );
    const server = createHttpsServer(
      { key: readFileSync(join(dir, 'leaf.key')), cert: readFileSync(join(dir, 'leaf.pem')) },
      (request, response) => {
        if (request.url === '/hang') return;
        response.end(request.url?.split('/').at(-1));
      },
    );
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `https://localhost:${String((server.address() as AddressInfo).port)}`;
    try {
      const untrusted = await createTrustFetch(() => [])(`${origin}/nonce-a`).catch(
        (error: unknown) => error,
      );
      expect(probeFailure(untrusted)).toBe('tls');
      const trusted = await createTrustFetch(() => [readFileSync(join(dir, 'ca.pem'), 'utf8')])(
        `${origin}/nonce-b`,
      );
      expect(trusted.status).toBe(200);
      expect(await trusted.text()).toBe('nonce-b');
      const hung = await createTrustFetch(() => [readFileSync(join(dir, 'ca.pem'), 'utf8')])(
        `${origin}/hang`,
        { signal: AbortSignal.timeout(200) },
      ).catch((error: unknown) => error);
      expect(probeFailure(hung)).toBe('timeout');
      expect(systemTrustedCertificates().length).toBeGreaterThan(0);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  },
);

it('records safe per-attempt failures, retries a wrong challenge, and never admits it', async () => {
  const cloudflared = fakeCloudflared();
  const record = vi.fn();
  let calls = 0;
  const tunnel = createPrivateTunnel({
    credentials: () => memoryCredentials(),
    port: () => 1,
    resolveBinary,
    spawn: cloudflared.spawn,
    record,
    probeIntervalMs: 10,
    probeWindowMs: 200,
    fetch: (async (url) => {
      calls++;
      if (calls === 1) return new Response('wrong-host', { status: 200 });
      return new Response(String(url).split('/').at(-1), { status: 200 });
    }) as typeof fetch,
  });
  tunnels.push(tunnel);
  await tunnel.enable({ mode: 'quick' });
  await vi.waitFor(() => expect(tunnel.status().state).toBe('connected'));
  expect(record).toHaveBeenCalledWith(
    'probe-failed',
    expect.stringMatching(/^route=quick attempt=1 elapsedMs=\d+ probe=challenge-mismatch$/u),
  );
  expect(record).toHaveBeenCalledWith(
    'verified',
    expect.stringMatching(/attempt=2 elapsedMs=\d+/u),
  );
  expect(JSON.stringify(record.mock.calls)).not.toContain(PROBE_PREFIX);
});

it('aborts a pending public check when its route closes', async () => {
  const cloudflared = fakeCloudflared();
  let signal: AbortSignal | undefined;
  const tunnel = createPrivateTunnel({
    credentials: () => memoryCredentials(),
    port: () => 1,
    resolveBinary,
    spawn: cloudflared.spawn,
    fetch: (async (_url, init) =>
      new Promise((_resolve, reject) => {
        signal = init?.signal ?? undefined;
        signal?.addEventListener('abort', () => reject(signal?.reason), { once: true });
      })) as typeof fetch,
  });
  tunnels.push(tunnel);
  await tunnel.enable({ mode: 'quick' });
  await vi.waitFor(() => expect(signal).toBeDefined());
  await tunnel.close();
  expect(signal?.aborted).toBe(true);
  expect(tunnel.admission()).toBeUndefined();
});

it('rechecks a Quick Tunnel DNS miss against configured DNS without changing other hosts or successful answers', () => {
  const missing = Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
  const query = vi.fn((_host, callback) => callback(null, ['192.0.2.10']));
  const lookup = createQuickTunnelLookup(
    (_host, _options, callback) => callback(missing, ''),
    query,
  );
  const result = vi.fn();
  lookup('new.trycloudflare.com', { all: true }, result);
  expect(result).toHaveBeenLastCalledWith(null, [{ address: '192.0.2.10', family: 4 }], 4);
  lookup('custom.example.com', {}, result);
  expect(result).toHaveBeenLastCalledWith(missing, '', undefined);
  lookup('new.trycloudflare.com', { family: 6 }, result);
  expect(query).toHaveBeenCalledTimes(1);
  createQuickTunnelLookup((_host, _options, callback) => callback(null, '192.0.2.20', 4), query)(
    'new.trycloudflare.com',
    {},
    result,
  );
  expect(result).toHaveBeenLastCalledWith(null, '192.0.2.20', 4);
  expect(query).toHaveBeenCalledTimes(1);
});
