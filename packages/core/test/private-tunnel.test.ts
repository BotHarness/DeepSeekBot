import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { EventEmitter, once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { PassThrough } from 'node:stream';
import type { CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials';
import { afterEach, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import {
  createPrivateTunnel,
  privateTunnelHostname,
  PROBE_PREFIX,
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

it('pairs a phone through the tunnel origin, carries encrypted RPC, refuses strangers and enforces revoke', async () => {
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
  const http = createServer(async (request, response) => {
    let text = '';
    for await (const chunk of request) text += String(chunk);
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
  const tunnel = createPrivateTunnel({
    credentials: () => memoryCredentials(),
    port: () => port,
    resolveBinary,
    spawn: cloudflared.spawn,
    fetch: edgeFetch(cloudflared.runs),
    probeIntervalMs: 10,
  });
  tunnels.push(tunnel);
  let carrier: HostCarrier | undefined;
  try {
    await tunnel.enable({ mode: 'quick' });
    await vi.waitFor(() => expect(tunnel.status().state).toBe('connected'));
    const admission = tunnel.admission()!;
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
      (await fetch(`http://127.0.0.1:${String(tunnel.status().originPort)}/api/botharness/devices`))
        .status,
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
        expect(url).toBe(`${admission.origin.replace('https', 'wss')}/botharness-device/channel`);
        const socket = new WebSocket(`${local}/botharness-device/channel`, { headers });
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
    const request = () =>
      carrier!.request(admission.origin + '/botharness-device/api/botharness/privateInputSubmit', {
        method: 'POST',
        body: 'tunnel-sentinel',
        signal: AbortSignal.timeout(3000),
      });
    expect(await (await request()).text()).toBe('tunnel-sentinel');
    expect(leakedAuthorization).toBe(false);
    pairing.revoke(result.host.deviceId);
    await expect(request()).rejects.toThrow();
  } finally {
    carrier?.close?.();
    gateway.close();
    http.closeAllConnections();
    http.close();
  }
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
  gateway.close();
});
