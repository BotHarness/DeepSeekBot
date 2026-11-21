import {
  fakeCloudflared,
  memoryCredentials,
  resolveBinary,
  tunnels,
} from './private-tunnel-fixtures.js';
import { createTunnelLookup } from '../src/devices/tunnel-dns.js';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { join } from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import {
  browserAdmissionProtocols,
  BROWSER_ADMISSION_PROTOCOL,
} from '../../../deploy/private-relay/admission.mjs';
import {
  createPrivateTunnel,
  createTrustFetch,
  probeFailure,
  PROBE_PREFIX,
  systemTrustedCertificates,
} from '../src/devices/private-tunnel.js';
import { createTempRoot } from './helpers.js';

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

const openssl = spawnSync('openssl', ['version'], { shell: false, windowsHide: true }).status === 0;
it.skipIf(!openssl)(
  'checks HTTPS origins against the given trust store and reports untrusted certificates as tls',
  async () => {
    const dir = createTempRoot('private-ingress-ca-');
    const run = (...args: string[]) => {
      const result = spawnSync('openssl', args, {
        cwd: dir,
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
      });
      if (result.status !== 0) throw new Error(result.stderr);
    };
    writeFileSync(
      join(dir, 'leaf.ext'),
      'subjectAltName=DNS:localhost,DNS:qa.deepseekbot.dev,IP:127.0.0.1\n',
    );
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
      const missing = Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
      const query = vi.fn((_host, callback) => callback(null, ['127.0.0.1']));
      const recovered = vi.fn();
      const lookup = createTunnelLookup({
        systemLookup: (_host, _options, callback) => callback(missing, ''),
        query,
        onRecovery: recovered,
      });
      const alias = origin.replace('localhost', 'qa.deepseekbot.dev');
      const repaired = await createTrustFetch(
        () => [readFileSync(join(dir, 'ca.pem'), 'utf8')],
        lookup,
      )(`${alias}/nonce-recovered`);
      expect(await repaired.text()).toBe('nonce-recovered');
      expect(recovered).toHaveBeenCalledOnce();
      const rejected = await createTrustFetch(
        () => [],
        lookup,
      )(`${alias}/nonce-rejected`).catch((error: unknown) => error);
      expect(probeFailure(rejected)).toBe('tls');

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
        signal?.addEventListener(
          'abort',
          () =>
            reject(
              signal?.reason instanceof Error
                ? signal.reason
                : new Error('aborted', { cause: signal?.reason }),
            ),
          { once: true },
        );
      })) as typeof fetch,
  });
  tunnels.push(tunnel);
  await tunnel.enable({ mode: 'quick' });
  await vi.waitFor(() => expect(signal).toBeDefined());
  await tunnel.close();
  expect(signal?.aborted).toBe(true);
  expect(tunnel.admission()).toBeUndefined();
});
