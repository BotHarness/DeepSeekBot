import { EventEmitter } from 'node:events';
import { createServer, request, type Server } from 'node:http';
import { connect as tcpConnect, type AddressInfo } from 'node:net';
import { PassThrough } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import {
  admitsGatewayPath,
  createDeviceConnect,
  validTunnelToken,
  type SpawnTunnel,
  type TunnelProcess,
} from '../src/devices/connect.js';
import { offeredRoutes } from '../src/devices/http.js';
import { phoneRoute } from '../src/devices/routes.js';

const TOKEN = Buffer.from(JSON.stringify({ a: 'account', t: 'tunnel-id', s: 'c2VjcmV0' })).toString(
  'base64',
);

class FakeTunnel extends EventEmitter implements TunnelProcess {
  readonly stderr = new PassThrough();
  killed = false;
  kill(): void {
    this.killed = true;
  }
}

function memoryCredentials() {
  const records = new Map<string, unknown>();
  return {
    records,
    provider: {
      readRecord: async (key: string) => records.get(key) as never,
      modifyRecord: async (key: string, mutate: (current: never) => Promise<unknown>) => {
        const next = await mutate(records.get(key) as never);
        if (next !== undefined) records.set(key, next);
        return records.get(key) as never;
      },
      deleteRecord: async (key: string) => {
        records.delete(key);
      },
    },
  };
}

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
});

async function dshListener(): Promise<number> {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(`dsh ${req.url ?? ''}`);
  });
  server.on('upgrade', (req, socket) => {
    socket.end(`HTTP/1.1 101 Switching Protocols\r\nx-path: ${req.url ?? ''}\r\n\r\n`);
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return (server.address() as AddressInfo).port;
}

function get(origin: string, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    request(`${origin}${path}`, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    })
      .on('error', reject)
      .end();
  });
}

function upgrade(origin: string, path: string): Promise<string> {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const socket = tcpConnect(Number(url.port), url.hostname, () => {
      socket.write(
        `GET ${path} HTTP/1.1\r\nhost: studio.deepseekbot.dev\r\nconnection: upgrade\r\nupgrade: websocket\r\n\r\n`,
      );
    });
    let text = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => (text += chunk));
    socket.on('end', () => resolve(text));
    socket.on('error', reject);
  });
}

function setup(spawnImpl?: SpawnTunnel) {
  const credentials = memoryCredentials();
  const tunnels: {
    tunnel: FakeTunnel;
    args: readonly string[];
    env: NodeJS.ProcessEnv;
  }[] = [];
  const spawn: SpawnTunnel =
    spawnImpl ??
    ((_binary, args, env) => {
      const tunnel = new FakeTunnel();
      tunnels.push({ tunnel, args, env });
      return tunnel;
    });
  return { credentials, tunnels, spawn };
}

describe('hosted Connect route', () => {
  it('admits only device gateway paths', () => {
    expect(admitsGatewayPath('/botharness-device/pair')).toBe(true);
    expect(admitsGatewayPath('/botharness-device/api/remote.mux?x=1')).toBe(true);
    expect(admitsGatewayPath('/api/botharness/devices')).toBe(false);
    expect(admitsGatewayPath('/')).toBe(false);
    expect(admitsGatewayPath('/botharness-devices')).toBe(false);
    expect(admitsGatewayPath('/botharness-device/../api/x')).toBe(false);
    expect(admitsGatewayPath('/botharness-device/%2e%2e/api/x')).toBe(false);
    expect(admitsGatewayPath('/botharness-device/%5c..%5capi')).toBe(false);
  });

  it('accepts only cloudflared connector tokens', () => {
    expect(validTunnelToken(TOKEN)).toBe(true);
    expect(validTunnelToken('not a token')).toBe(false);
    expect(validTunnelToken(Buffer.from('{"a":"x"}').toString('base64'))).toBe(false);
  });

  it('recognizes one-label Connect hostnames and orders them after Tailscale', () => {
    expect(phoneRoute('https://studio.deepseekbot.dev')).toMatchObject({
      kind: 'connect',
    });
    expect(phoneRoute('https://a.b.deepseekbot.dev')).toBeUndefined();
    expect(phoneRoute('http://studio.deepseekbot.dev')).toBeUndefined();
    expect(phoneRoute('https://studio.deepseekbot.dev:8443')).toBeUndefined();
    const routes = offeredRoutes(
      {
        routes: [
          {
            url: 'https://studio.tail1.ts.net',
            kind: 'tailscale',
            ready: true,
          },
          {
            url: 'https://studio.deepseekbot.dev',
            kind: 'connect',
            ready: true,
          },
          {
            url: 'https://other.deepseekbot.dev',
            kind: 'connect',
            ready: false,
          },
          { url: 'http://127.0.0.1:4100', kind: 'loopback', ready: true },
        ],
        tailscale: 'running',
        serveCommand: 'tailscale serve --bg 4100',
      },
      undefined,
    ).map((route) => route.url);
    expect(routes).toEqual([
      'https://studio.tail1.ts.net',
      'https://studio.deepseekbot.dev',
      'http://127.0.0.1:4100',
    ]);
  });
});

describe('device Connect tunnel', () => {
  it('publishes only the gateway through a loopback origin and reports the tunnel', async () => {
    const port = await dshListener();
    const { credentials, tunnels, spawn } = setup();
    const connect = createDeviceConnect({
      credentials: () => credentials.provider,
      port: () => port,
      spawn,
    });
    const enabled = await connect.enable({
      hostname: 'Studio.deepseekbot.dev',
      token: TOKEN,
    });
    expect(enabled).toMatchObject({ ok: true, status: { state: 'starting' } });
    expect(connect.route()).toMatchObject({ kind: 'connect', ready: false });
    expect(tunnels).toHaveLength(1);
    expect(tunnels[0]?.args).toEqual(['tunnel', '--no-autoupdate', 'run']);
    expect(tunnels[0]?.args.join(' ')).not.toContain(TOKEN);
    expect(tunnels[0]?.env['TUNNEL_TOKEN']).toBe(TOKEN);

    tunnels[0]?.tunnel.stderr.write('INF Registered tunnel connection connIndex=0\n');
    await new Promise((done) => setImmediate(done));
    expect(connect.status()).toMatchObject({
      state: 'connected',
      hostname: 'studio.deepseekbot.dev',
    });
    expect(connect.route()).toEqual({
      url: 'https://studio.deepseekbot.dev',
      kind: 'connect',
      ready: true,
    });

    const origin = connect.status().origin ?? '';
    expect(await get(origin, '/botharness-device/pair')).toEqual({
      status: 200,
      body: 'dsh /botharness-device/pair',
    });
    expect((await get(origin, '/api/botharness/devices')).status).toBe(404);
    expect((await get(origin, '/')).status).toBe(404);
    expect(await upgrade(origin, '/botharness-device/api/remote.mux')).toContain(
      'x-path: /botharness-device/api/remote.mux',
    );
    expect(await upgrade(origin, '/api/remote.mux')).toContain('404 Not Found');

    const stored = [...credentials.records.values()][0] as {
      payload: Record<string, unknown>;
    };
    expect(stored.payload).toMatchObject({
      hostname: 'studio.deepseekbot.dev',
      token: TOKEN,
      originPort: Number(new URL(origin).port),
    });

    expect(await connect.disable()).toEqual({
      ok: true,
      status: { state: 'off' },
    });
    expect(tunnels[0]?.tunnel.killed).toBe(true);
    expect(credentials.records.size).toBe(0);
    expect(connect.route()).toBeUndefined();
    await expect(get(origin, '/botharness-device/pair')).rejects.toThrow();
  });

  it('cuts open gateway streams when Connect is disabled', async () => {
    const held = createServer();
    held.on('upgrade', (_req, socket) => {
      socket.write('HTTP/1.1 101 Switching Protocols\r\n\r\n');
      socket.on('end', () => socket.destroy());
    });
    servers.push(held);
    await new Promise<void>((done) => held.listen(0, '127.0.0.1', done));
    const port = (held.address() as AddressInfo).port;
    const { credentials, spawn } = setup();
    const connect = createDeviceConnect({
      credentials: () => credentials.provider,
      port: () => port,
      spawn,
    });
    await connect.enable({ hostname: 'studio.deepseekbot.dev', token: TOKEN });
    const origin = new URL(connect.status().origin ?? '');
    const socket = tcpConnect(Number(origin.port), origin.hostname);
    const opened = new Promise<void>((done) => socket.once('data', () => done()));
    const closed = new Promise<void>((done) => socket.once('close', () => done()));
    socket.write(
      'GET /botharness-device/api/remote.mux HTTP/1.1\r\nhost: studio.deepseekbot.dev\r\nconnection: upgrade\r\nupgrade: websocket\r\n\r\n',
    );
    await opened;
    expect(await connect.disable()).toEqual({ ok: true, status: { state: 'off' } });
    await closed;
  });

  it('resumes from the stored record on the same origin port', async () => {
    const port = await dshListener();
    const { credentials, tunnels, spawn } = setup();
    const first = createDeviceConnect({
      credentials: () => credentials.provider,
      port: () => port,
      spawn,
    });
    await first.enable({ hostname: 'studio.deepseekbot.dev', token: TOKEN });
    const origin = first.status().origin;
    await first.close();

    const second = createDeviceConnect({
      credentials: () => credentials.provider,
      port: () => port,
      spawn,
    });
    await second.start();
    expect(second.status()).toMatchObject({ state: 'starting', origin });
    expect(tunnels).toHaveLength(2);
    await second.close();
  });

  it('reports a missing or exited cloudflared and refuses bad input', async () => {
    const port = await dshListener();
    const { credentials, tunnels, spawn } = setup();
    const connect = createDeviceConnect({
      credentials: () => credentials.provider,
      port: () => port,
      spawn,
    });
    expect(await connect.enable({ hostname: 'example.com', token: TOKEN })).toEqual({
      ok: false,
      code: 'connect-hostname-invalid',
    });
    expect(await connect.enable({ hostname: 'studio.deepseekbot.dev', token: 'x' })).toEqual({
      ok: false,
      code: 'connect-token-invalid',
    });
    await connect.enable({ hostname: 'studio.deepseekbot.dev', token: TOKEN });
    tunnels[0]?.tunnel.emit('exit', 1);
    expect(connect.status()).toMatchObject({
      state: 'error',
      issue: 'cloudflared-exited',
    });
    expect(connect.route()).toMatchObject({ ready: false });
    await connect.close();

    const missing = createDeviceConnect({
      credentials: () => credentials.provider,
      port: () => port,
      spawn: () => {
        const tunnel = new FakeTunnel();
        setImmediate(() =>
          tunnel.emit(
            'error',
            Object.assign(new Error('spawn cloudflared ENOENT'), {
              code: 'ENOENT',
            }),
          ),
        );
        return tunnel;
      },
    });
    await missing.enable({ hostname: 'studio.deepseekbot.dev', token: TOKEN });
    await new Promise((done) => setImmediate(done));
    expect(missing.status()).toMatchObject({
      state: 'error',
      issue: 'cloudflared-missing',
    });
    await missing.close();

    const noStore = createDeviceConnect({
      credentials: () => undefined,
      port: () => port,
      spawn,
    });
    expect(
      await noStore.enable({
        hostname: 'studio.deepseekbot.dev',
        token: TOKEN,
      }),
    ).toEqual({
      ok: false,
      code: 'credential-unavailable',
    });
  });
});
