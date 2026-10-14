import { createSocket } from 'node:dgram';
import { createServer, request, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import type { Duplex } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createSelkiesWebRtc,
  freeUdpPort,
  loopbackPort,
  openUdpRelay,
  selkiesWebRtcEnv,
  selkiesWebRtcMediaFromEnv,
  type SelkiesWebRtcContainer,
  type UdpRelay,
} from '../src/http/selkies-webrtc.js';

const servers: Server[] = [];
const relays: UdpRelay[] = [];
afterEach(async () => {
  for (const relay of relays.splice(0)) await relay.close();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.closeAllConnections();
          server.close(resolve);
        }),
    ),
  );
});

describe('Selkies WebRTC container setup', () => {
  it('keeps WebSockets as the default and advertises only the tailnet address', () => {
    const env = selkiesWebRtcEnv({ address: '100.101.102.103', port: 39_002 });
    expect(env).toEqual([
      'SELKIES_MODE=websockets',
      'SELKIES_ENABLE_DUAL_MODE=true',
      'SELKIES_WEBRTC_UDP_MUX_PORT=39002',
      'SELKIES_WEBRTC_PUBLIC_IP=100.101.102.103',
      'SELKIES_WEBRTC_ICE_LITE=true',
      'SELKIES_RTC_CONFIG_JSON=/run/botharness/rtc.json',
    ]);
    expect(selkiesWebRtcEnv(undefined)).toEqual([]);
    expect(selkiesWebRtcMediaFromEnv(['PATH=/bin', ...env])).toEqual({
      address: '100.101.102.103',
      port: 39_002,
    });
    expect(
      selkiesWebRtcMediaFromEnv([
        'SELKIES_WEBRTC_PUBLIC_IP=203.0.113.5',
        'SELKIES_WEBRTC_UDP_MUX_PORT=39002',
      ]),
    ).toBeUndefined();
  });

  it('reads only a loopback-published port', () => {
    expect(loopbackPort('127.0.0.1:32768\n')).toBe(32_768);
    expect(loopbackPort('0.0.0.0:32768\n[::]:32768\n')).toBeUndefined();
  });
});

describe('UDP relay', () => {
  it('forwards each sender through its own loopback flow and back', async () => {
    const container = createSocket('udp4');
    await new Promise<void>((resolve) => container.bind(0, '127.0.0.1', resolve));
    container.on('message', (data, from) =>
      container.send(`echo:${data.toString()}`, from.port, from.address),
    );
    const port = await freeUdpPort('127.0.0.1');
    const relay = await openUdpRelay({
      address: '127.0.0.1',
      port,
      targetPort: container.address().port,
      accept: () => true,
    });
    relays.push(relay);
    const phone = createSocket('udp4');
    const answer = new Promise<string>((resolve) =>
      phone.once('message', (data) => resolve(data.toString())),
    );
    phone.send('stun', port, '127.0.0.1');
    expect(await answer).toBe('echo:stun');
    expect(relay.flows()).toBe(1);
    phone.close();
    container.close();
  });

  it('drops senders outside the tailnet', async () => {
    const container = createSocket('udp4');
    await new Promise<void>((resolve) => container.bind(0, '127.0.0.1', resolve));
    let received = 0;
    container.on('message', () => (received += 1));
    const port = await freeUdpPort('127.0.0.1');
    const relay = await openUdpRelay({
      address: '127.0.0.1',
      port,
      targetPort: container.address().port,
    });
    relays.push(relay);
    const stranger = createSocket('udp4');
    stranger.send('stun', port, '127.0.0.1');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect([received, relay.flows()]).toEqual([0, 0]);
    stranger.close();
    container.close();
  });
});

async function fakeSelkies(options: { signalingRefusals?: number } = {}) {
  const switches: string[] = [];
  const upgrades: string[] = [];
  let refusals = options.signalingRefusals ?? 0;
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      if (req.url === '/api/switch' && req.method === 'POST') {
        switches.push((JSON.parse(Buffer.concat(chunks).toString()) as { mode: string }).mode);
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end('{"status":"success"}');
      }
      res.writeHead(404);
      res.end();
    });
  });
  server.on('upgrade', (req: IncomingMessage, socket: Duplex) => {
    upgrades.push(
      `${req.url ?? ''} origin=${String(req.headers.origin)} cookie=${String(req.headers.cookie)}`,
    );
    if (refusals > 0) {
      refusals -= 1;
      socket.end('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
    );
    socket.pipe(socket);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return {
    switches,
    upgrades,
    url: new URL(`http://127.0.0.1:${String((server.address() as AddressInfo).port)}/`),
  };
}

async function hostFor(webrtc: ReturnType<typeof createSelkiesWebRtc>) {
  const server = createServer();
  server.on('upgrade', (req, socket, head) => void webrtc.signal(req, socket, head));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const port = (server.address() as AddressInfo).port;
  return (
    path = '/api/computer/webrtc/signaling',
  ): Promise<{ status: number; body: string; socket?: Socket }> =>
    new Promise((resolve, reject) => {
      const req = request({
        host: '127.0.0.1',
        port,
        path,
        headers: {
          connection: 'Upgrade',
          upgrade: 'websocket',
          'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'sec-websocket-version': '13',
          origin: 'https://phone.example',
          cookie: 'dsh=secret',
        },
      });
      req.on('upgrade', (res, socket) =>
        resolve({ status: res.statusCode ?? 0, body: '', socket }),
      );
      req.on('response', (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString()));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on('error', reject);
      req.end();
    });
}

const echo = (socket: Socket, text: string) =>
  new Promise<string>((resolve) => {
    socket.once('data', (chunk: Buffer) => resolve(chunk.toString()));
    socket.write(text);
  });

function media(address = '100.101.102.103'): SelkiesWebRtcContainer & { prepared: number } {
  const container = {
    prepared: 0,
    media: async () => ({ advertised: { address, port: 39_002 }, loopbackPort: 32_768 }),
    prepare: async () => {
      container.prepared += 1;
    },
  };
  return container;
}

describe('Selkies WebRTC calls', () => {
  it('reports why a call cannot start, so the phone keeps the WebSocket stream', async () => {
    const selkies = await fakeSelkies();
    const status = (overrides: Partial<Parameters<typeof createSelkiesWebRtc>[0]>) =>
      createSelkiesWebRtc({
        label: 'computer',
        upstream: () => selkies.url,
        container: () => media(),
        tailnetAddress: async () => '100.101.102.103',
        ...overrides,
      }).status();
    expect(await status({ upstream: () => undefined })).toEqual({
      available: false,
      code: 'not-running',
      fallback: 'websocket',
    });
    expect((await status({ container: () => undefined })).available).toBe(false);
    expect(await status({ tailnetAddress: async () => undefined })).toMatchObject({
      code: 'tailnet-unavailable',
    });
    expect(await status({ tailnetAddress: async () => '100.64.0.9' })).toMatchObject({
      code: 'tailnet-changed',
    });
    expect(await status({})).toEqual({
      available: true,
      transport: 'webrtc',
      address: '100.101.102.103',
      port: 39_002,
      iceServers: [],
      calls: 0,
    });
  });

  it('switches to WebRTC for the call, relays signalling, and switches back when it ends', async () => {
    const selkies = await fakeSelkies({ signalingRefusals: 2 });
    const container = media();
    const opened: { address: string; port: number; targetPort: number }[] = [];
    let closedRelays = 0;
    const webrtc = createSelkiesWebRtc({
      label: 'computer',
      upstream: () => selkies.url,
      container: () => container,
      tailnetAddress: async () => '100.101.102.103',
      openRelay: async (options) => {
        opened.push({
          address: options.address,
          port: options.port,
          targetPort: options.targetPort,
        });
        return {
          flows: () => 0,
          close: async () => {
            closedRelays += 1;
          },
        };
      },
    });
    const call = await hostFor(webrtc);

    const first = await call('/api/computer/webrtc/signaling?viewer=abc');
    expect(first.status).toBe(101);
    expect(await echo(first.socket!, 'HELLO client {}')).toBe('HELLO client {}');
    expect(selkies.switches).toEqual(['webrtc']);
    expect(container.prepared).toBe(1);
    expect(opened).toEqual([{ address: '100.101.102.103', port: 39_002, targetPort: 32_768 }]);
    expect(selkies.upgrades).toHaveLength(3);
    expect(selkies.upgrades[2]).toBe(
      '/api/webrtc/signaling?viewer=abc origin=undefined cookie=undefined',
    );

    const second = await call();
    expect(second.status).toBe(101);
    expect(await webrtc.status()).toMatchObject({ available: true, calls: 2 });

    first.socket!.destroy();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(selkies.switches).toEqual(['webrtc']);

    second.socket!.destroy();
    await expect.poll(() => selkies.switches).toEqual(['webrtc', 'websockets']);
    expect(closedRelays).toBe(1);
    expect(await webrtc.status()).toMatchObject({ calls: 0 });
  });

  it('refuses the upgrade with a code when the tailnet is gone', async () => {
    const selkies = await fakeSelkies();
    const call = await hostFor(
      createSelkiesWebRtc({
        label: 'computer',
        upstream: () => selkies.url,
        container: () => media(),
        tailnetAddress: async () => undefined,
      }),
    );
    expect(await call()).toEqual({
      status: 503,
      body: '{"code":"tailnet-unavailable","fallback":"websocket"}',
    });
    expect(selkies.switches).toEqual([]);
  });

  it('refuses when the media port is taken and leaves the transport alone', async () => {
    const selkies = await fakeSelkies();
    const call = await hostFor(
      createSelkiesWebRtc({
        label: 'computer',
        upstream: () => selkies.url,
        container: () => media(),
        tailnetAddress: async () => '100.101.102.103',
        openRelay: async () => {
          throw new Error('EADDRINUSE');
        },
      }),
    );
    expect(await call()).toMatchObject({
      status: 503,
      body: expect.stringContaining('media-port-busy'),
    });
    expect(selkies.switches).toEqual([]);
  });
});
