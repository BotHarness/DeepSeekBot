import { createHash } from 'node:crypto';
import { createServer, request, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import type { Duplex } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createDeviceGateway, DEVICE_GATEWAY_PREFIX } from '../src/devices/gateway.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { createGatewayOrigin } from '../src/devices/connect.js';
import { DEVICE_ROUTE_HEADER, isConnectRequest } from '../src/devices/route-context.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const servers: Server[] = [];
afterEach(async () => {
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

async function fakeDsh(connectOffer?: Parameters<typeof createDeviceGateway>[0]['connectOffer']) {
  const state = {
    secret: 1,
    token: 'launch-token',
    seen: [] as Record<string, unknown>[],
    upgrades: [] as string[],
  };
  const cookie = () => `dsh=${String(state.secret)}`;
  let gateway: ReturnType<typeof createDeviceGateway> | undefined;
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname.startsWith(DEVICE_GATEWAY_PREFIX)) return void gateway!.handle(req, res);
    if (url.pathname === '/' && url.searchParams.get('token') === state.token) {
      res.writeHead(303, { 'set-cookie': `${cookie()}; HttpOnly`, location: '/' });
      return res.end();
    }
    if (req.headers.cookie !== cookie()) {
      res.writeHead(401);
      return res.end();
    }
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const { [DEVICE_ROUTE_HEADER]: routeTag, ...headers } = req.headers;
      state.seen.push({
        ...headers,
        path: url.pathname,
        connect: isConnectRequest(req),
        routeHeaderPresent: routeTag !== undefined,
      });
      res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'leak=1' });
      res.end(JSON.stringify({ path: url.pathname, body: Buffer.concat(chunks).toString() }));
    });
  });
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (req.url?.startsWith(DEVICE_GATEWAY_PREFIX)) return void gateway!.upgrade(req, socket, head);
    if (req.headers.cookie !== cookie()) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    state.upgrades.push(req.url ?? '');
    state.seen.push({
      upgrade: req.url,
      connect: isConnectRequest(req),
      routeHeaderPresent: req.headers[DEVICE_ROUTE_HEADER] !== undefined,
      routeHeaderCount: req.rawHeaders.filter(
        (value, index) => index % 2 === 0 && value.toLowerCase() === DEVICE_ROUTE_HEADER,
      ).length,
    });
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
    );
    socket.pipe(socket);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const port = (server.address() as AddressInfo).port;
  const home = createTempRoot('botharness-device-gateway-');
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: 'studio',
  });
  gateway = createDeviceGateway({
    pairing,
    port: () => port,
    authenticatedUrl: (base) => `${base}?token=${state.token}`,
    ...(connectOffer === undefined ? {} : { connectOffer }),
  });
  return { state, port, pairing, base: `http://127.0.0.1:${String(port)}` };
}

async function pair(base: string, offer: string) {
  const response = await fetch(`${base}/botharness-device/pair`, {
    method: 'POST',
    body: JSON.stringify({ offer, name: 'iPhone' }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, string> };
}

function stream(
  port: number,
  headers: Record<string, string>,
  path = '/botharness-device/api/remote.mux',
): Promise<{ status: number; body: string; socket?: Socket }> {
  return new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1',
      port,
      path,
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'sec-websocket-version': '13',
        ...headers,
      },
    });
    req.on('upgrade', (res, socket) => resolve({ status: res.statusCode ?? 0, body: '', socket }));
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

describe('device gateway', () => {
  it('pairs once and forwards unary calls with the Host-held session only', async () => {
    const host = await fakeDsh();
    const { offer } = host.pairing.createOffer();
    const paired = await pair(host.base, offer);
    expect(paired.status).toBe(200);
    expect(paired.body.credential).toMatch(/^[\w-]+\.[\w-]+$/u);
    expect(await pair(host.base, offer)).toEqual({ status: 401, body: { code: 'offer-invalid' } });

    const response = await fetch(`${host.base}/botharness-device/api/botharness/list`, {
      method: 'POST',
      headers: {
        authorization: `Device ${paired.body.credential}`,
        'content-type': 'application/json',
      },
      body: '{"type":"client-request"}',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      path: '/api/botharness/list',
      body: '{"type":"client-request"}',
    });
    expect(response.headers.get('set-cookie')).toBeNull();
    const seen = host.state.seen.at(-1)!;
    expect(seen.authorization).toBeUndefined();
    expect(seen.host).toBe(`127.0.0.1:${String(host.port)}`);
  });

  it('refuses unpaired and cross-origin callers with coded errors', async () => {
    const host = await fakeDsh();
    const call = (headers: Record<string, string>) =>
      fetch(`${host.base}/botharness-device/api/botharness/list`, { method: 'POST', headers });
    const missing = await call({});
    expect([missing.status, await missing.json()]).toEqual([
      401,
      { code: 'device-credential-missing' },
    ]);
    const paired = await pair(host.base, host.pairing.createOffer().offer);
    const crossSite = await call({
      authorization: `Device ${paired.body.credential}`,
      origin: 'https://evil.example',
    });
    expect([crossSite.status, await crossSite.json()]).toEqual([403, { code: 'origin-refused' }]);
  });

  it('lets another Host’s browser pair and call with its device credential', async () => {
    const host = await fakeDsh();
    const browser = 'http://127.0.0.1:41000';
    const preflight = await fetch(`${host.base}/botharness-device/api/botharness/list`, {
      method: 'OPTIONS',
      headers: {
        origin: browser,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type',
        'access-control-request-private-network': 'true',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(browser);
    expect(preflight.headers.get('access-control-allow-headers')).toBe(
      'authorization, content-type',
    );
    expect(preflight.headers.get('access-control-allow-private-network')).toBe('true');

    const paired = await fetch(`${host.base}/botharness-device/pair`, {
      method: 'POST',
      headers: { origin: browser, 'content-type': 'application/json' },
      body: JSON.stringify({ offer: host.pairing.createOffer().offer, name: 'Studio browser' }),
    });
    expect(paired.headers.get('access-control-allow-origin')).toBe(browser);
    const { credential } = (await paired.json()) as { credential: string };

    const call = await fetch(`${host.base}/botharness-device/api/botharness/list`, {
      method: 'POST',
      headers: { origin: browser, authorization: `Device ${credential}` },
      body: '{"type":"client-request"}',
    });
    expect(call.status).toBe(200);
    expect(call.headers.get('access-control-allow-origin')).toBe(browser);
    expect(host.state.seen.at(-1)!.origin).toBeUndefined();

    const withCookie = await fetch(`${host.base}/botharness-device/api/botharness/list`, {
      method: 'POST',
      headers: { origin: browser, cookie: 'botharness-device-web=x' },
    });
    expect([withCookie.status, await withCookie.json()]).toEqual([403, { code: 'origin-refused' }]);
    const web = await fetch(`${host.base}/botharness-device/web/`, {
      headers: { origin: browser, authorization: `Device ${credential}` },
    });
    expect(web.status).toBe(403);
  });

  it('opens a browser stream with a one-time ticket instead of a header', async () => {
    const host = await fakeDsh();
    const browser = 'https://studio.tailnet.ts.net';
    const paired = await pair(host.base, host.pairing.createOffer().offer);
    const issue = async () => {
      const response = await fetch(`${host.base}/botharness-device/stream-ticket`, {
        method: 'POST',
        headers: { origin: browser, authorization: `Device ${paired.body.credential}` },
      });
      expect(response.headers.get('access-control-allow-origin')).toBe(browser);
      return ((await response.json()) as { ticket: string }).ticket;
    };
    const ticket = await issue();
    const path = (value: string) => `/botharness-device/api/remote.mux?ticket=${value}`;

    const open = await stream(host.port, { origin: browser }, path(ticket));
    expect(open.status).toBe(101);
    expect(await echo(open.socket!, 'frame-1')).toBe('frame-1');
    expect(host.state.upgrades.at(-1)).toBe('/api/remote.mux');
    open.socket!.destroy();

    expect(await stream(host.port, { origin: browser }, path(ticket))).toEqual({
      status: 401,
      body: '{"code":"ticket-invalid"}',
    });
    expect((await stream(host.port, { origin: browser })).status).toBe(403);
    expect(
      (await stream(host.port, { origin: 'https://evil.example' }, path(await issue()))).status,
    ).toBe(403);

    const later = await issue();
    host.pairing.revoke(paired.body.deviceId!);
    expect(await stream(host.port, { origin: browser }, path(later))).toEqual({
      status: 401,
      body: '{"code":"device-revoked"}',
    });
  });

  it('splices the stream mux, closes it on revoke, and refuses the device afterwards', async () => {
    const host = await fakeDsh();
    const paired = await pair(host.base, host.pairing.createOffer().offer);
    const authorization = `Device ${paired.body.credential}`;

    const open = await stream(host.port, {
      authorization,
      origin: host.base,
    });
    expect(open.status).toBe(101);
    expect(await echo(open.socket!, 'frame-1')).toBe('frame-1');

    const closed = new Promise((resolve) => open.socket!.on('close', resolve));
    expect(host.pairing.revoke(paired.body.deviceId!)).toEqual({ revoked: true, closedStreams: 1 });
    await closed;

    expect(await stream(host.port, { authorization })).toEqual({
      status: 401,
      body: '{"code":"device-revoked"}',
    });
    const unary = await fetch(`${host.base}/botharness-device/api/botharness/list`, {
      method: 'POST',
      headers: { authorization },
    });
    expect([unary.status, await unary.json()]).toEqual([401, { code: 'device-revoked' }]);
  });

  it('lets a paired device revoke only its own pairing', async () => {
    const host = await fakeDsh();
    const phone = await pair(host.base, host.pairing.createOffer().offer);
    const other = await pair(host.base, host.pairing.createOffer().offer);
    const unpair = (credential?: string) =>
      fetch(`${host.base}/botharness-device/unpair`, {
        method: 'POST',
        headers: credential === undefined ? {} : { authorization: `Device ${credential}` },
      });

    const missing = await unpair();
    expect([missing.status, await missing.json()]).toEqual([
      401,
      { code: 'device-credential-missing' },
    ]);
    const done = await unpair(phone.body.credential);
    expect([done.status, await done.json()]).toEqual([200, { revoked: true }]);
    const again = await unpair(phone.body.credential);
    expect([again.status, await again.json()]).toEqual([401, { code: 'device-revoked' }]);

    const devices = host.pairing.list();
    expect(devices.find((device) => device.id === phone.body.deviceId)?.revokedAt).toBeDefined();
    expect(devices.find((device) => device.id === other.body.deviceId)?.revokedAt).toBeUndefined();
  });

  it('mints relay-signed offers that only the phone holding the verifier redeems', async () => {
    const verifier = 'phone-verifier-0123456789abcdefghijklmnop';
    const verifierHash = createHash('sha256').update(verifier).digest('base64url');
    const signed: { body: string; signature: string | undefined }[] = [];
    const host = await fakeDsh(async (body, signature) => {
      signed.push({ body, signature });
      return signature === 'good'
        ? { ok: true, verifierHash, name: 'Relay iPhone' }
        : { ok: false };
    });
    const request = (signature: string) =>
      fetch(`${host.base}/botharness-device/connect/offer`, {
        method: 'POST',
        headers: { 'x-botharness-relay-signature': signature },
        body: '{"hostId":"h"}',
      });
    const refused = await request('bad');
    expect([refused.status, await refused.json()]).toEqual([
      401,
      { code: 'relay-signature-invalid' },
    ]);
    const minted = await request('good');
    const offer = (await minted.json()) as { offer: string; host: { id: string; name: string } };
    expect(minted.status).toBe(200);
    expect(offer.host).toEqual(host.pairing.host());
    expect(signed).toEqual([
      { body: '{"hostId":"h"}', signature: 'bad' },
      { body: '{"hostId":"h"}', signature: 'good' },
    ]);
    const redeem = (body: Record<string, string>) =>
      fetch(`${host.base}/botharness-device/pair`, { method: 'POST', body: JSON.stringify(body) });
    const stolen = await redeem({ offer: offer.offer, verifier: 'someone-else' });
    expect([stolen.status, await stolen.json()]).toEqual([401, { code: 'offer-invalid' }]);
    const again = (await (await request('good')).json()) as { offer: string };
    expect((await redeem({ offer: again.offer })).status).toBe(401);
    const third = (await (await request('good')).json()) as { offer: string };
    const paired = await redeem({ offer: third.offer, verifier });
    expect(paired.status).toBe(200);
    expect(host.pairing.list()[0]?.name).toBe('Relay iPhone');
    const plain = await fakeDsh();
    const absent = await fetch(`${plain.base}/botharness-device/connect/offer`, { method: 'POST' });
    expect(absent.status).toBe(404);
  });

  it('lets a paired phone remove another device it was told about', async () => {
    const host = await fakeDsh();
    const phone = await pair(host.base, host.pairing.createOffer().offer);
    const stranger = await pair(host.base, host.pairing.createOffer().offer);
    const remove = (body: unknown, credential?: string) =>
      fetch(`${host.base}/botharness-device/devices/remove`, {
        method: 'POST',
        headers: credential === undefined ? {} : { authorization: `Device ${credential}` },
        body: JSON.stringify(body),
      });
    const unpaired = await remove({ deviceId: stranger.body.deviceId });
    expect([unpaired.status, await unpaired.json()]).toEqual([
      401,
      { code: 'device-credential-missing' },
    ]);
    const unknown = await remove({ deviceId: 'nobody' }, phone.body.credential);
    expect(unknown.status).toBe(404);
    const done = await remove({ deviceId: stranger.body.deviceId }, phone.body.credential);
    expect([done.status, await done.json()]).toEqual([
      200,
      { revoked: true, device: { id: stranger.body.deviceId, name: 'iPhone' } },
    ]);
    const after = await remove({ deviceId: phone.body.deviceId }, stranger.body.credential);
    expect([after.status, await after.json()]).toEqual([401, { code: 'device-revoked' }]);
    expect(host.pairing.list().find((device) => device.id === phone.body.deviceId)?.revokedAt).toBe(
      undefined,
    );
  });

  it('carries WebRTC signalling to the Host route and ends it on revoke', async () => {
    const host = await fakeDsh();
    const paired = await pair(host.base, host.pairing.createOffer().offer);
    const authorization = `Device ${paired.body.credential}`;

    const open = await stream(
      host.port,
      { authorization },
      '/botharness-device/api/browser/webrtc/signaling?viewer=abc',
    );
    expect(open.status).toBe(101);
    expect(host.state.seen).toContainEqual(
      expect.objectContaining({ upgrade: '/api/browser/webrtc/signaling?viewer=abc' }),
    );
    expect(await echo(open.socket!, 'HELLO')).toBe('HELLO');

    const closed = new Promise((resolve) => open.socket!.on('close', resolve));
    expect(host.pairing.revoke(paired.body.deviceId!)).toEqual({ revoked: true, closedStreams: 1 });
    await closed;
    expect(
      await stream(
        host.port,
        { authorization },
        '/botharness-device/api/computer/webrtc/signaling',
      ),
    ).toEqual({ status: 401, body: '{"code":"device-revoked"}' });
  });

  it('re-mints its loopback session after a global sign-out', async () => {
    const host = await fakeDsh();
    const paired = await pair(host.base, host.pairing.createOffer().offer);
    const authorization = `Device ${paired.body.credential}`;
    const call = () =>
      fetch(`${host.base}/botharness-device/api/botharness/list`, {
        method: 'POST',
        headers: { authorization },
      });
    expect((await call()).status).toBe(200);
    host.state.secret += 1;
    const open = await stream(host.port, { authorization });
    expect(open.status).toBe(101);
    open.socket!.destroy();
    expect((await call()).status).toBe(200);
  });
});

describe('Connect route provenance', () => {
  async function originFor(port: number) {
    const origin = createGatewayOrigin(() => port);
    servers.push(origin);
    await new Promise<void>((resolve) => origin.listen(0, '127.0.0.1', resolve));
    const originPort = (origin.address() as AddressInfo).port;
    return { base: `http://127.0.0.1:${originPort}`, port: originPort };
  }

  it.each([undefined, 'connect', 'tailscale', 'loopback', ''])(
    'overwrites an absent or forged HTTP tag (%s) before forwarding to DSH',
    async (tag) => {
      const host = await fakeDsh();
      const origin = await originFor(host.port);
      const paired = await pair(host.base, host.pairing.createOffer().offer);
      const headers = {
        authorization: `Device ${paired.body.credential}`,
        ...(tag === undefined ? {} : { [DEVICE_ROUTE_HEADER]: tag }),
      };
      const direct = await fetch(`${host.base}/botharness-device/api/botharness/list`, { headers });
      await direct.text();
      expect(host.state.seen.at(-1)).toMatchObject({ connect: false, routeHeaderPresent: false });
      const tunneled = await fetch(`${origin.base}/botharness-device/api/botharness/list`, {
        headers,
      });
      await tunneled.text();
      expect(host.state.seen.at(-1)).toMatchObject({ connect: true, routeHeaderPresent: true });
      expect(tunneled.headers.get(DEVICE_ROUTE_HEADER)).toBeNull();
    },
  );

  it('refuses the removed full Web Client on every route, including cookies and upgrades', async () => {
    const host = await fakeDsh();
    const origin = await originFor(host.port);
    const paired = await pair(host.base, host.pairing.createOffer().offer);
    const headers = {
      authorization: `Device ${paired.body.credential}`,
      cookie: 'botharness-device-web=old',
    };
    for (const base of [host.base, origin.base]) {
      for (const path of [
        '/web',
        '/web/',
        '/web/api/botharness/privateInputSubmit',
        '/web/assets/main.js',
      ]) {
        const answer = await fetch(`${base}/botharness-device${path}`, { headers });
        expect(answer.status).toBe(404);
        await answer.text();
      }
    }
    for (const port of [host.port, origin.port]) {
      expect((await stream(port, headers, '/botharness-device/web/api/remote.mux')).status).toBe(
        404,
      );
    }
    expect(host.state.seen).toEqual([]);
  });

  it('overwrites a forged upgrade tag and strips forged direct tags', async () => {
    const host = await fakeDsh();
    const origin = await originFor(host.port);
    const paired = await pair(host.base, host.pairing.createOffer().offer);
    const headers = {
      authorization: `Device ${paired.body.credential}`,
      [DEVICE_ROUTE_HEADER]: 'loopback',
    };
    const direct = await stream(host.port, headers);
    expect(direct.status).toBe(101);
    expect(host.state.seen.at(-1)).toMatchObject({ connect: false, routeHeaderPresent: false });
    direct.socket!.destroy();
    const tunneled = await stream(
      origin.port,
      headers,
      '/botharness-device/api/browser/webrtc/signaling',
    );
    expect(tunneled.status).toBe(101);
    expect(host.state.seen.at(-1)).toMatchObject({ connect: true, routeHeaderCount: 1 });
    tunneled.socket!.destroy();
  });
});
