import { createHash } from 'node:crypto';
import { createServer, request, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import type { Duplex } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createDeviceGateway, DEVICE_GATEWAY_PREFIX } from '../src/devices/gateway.js';
import { createDevicePairing } from '../src/devices/pairing.js';
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
      state.seen.push({ ...req.headers, path: url.pathname });
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
    state.seen.push({ upgrade: req.url });
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
    expect(host.state.seen).toContainEqual({ upgrade: '/api/browser/webrtc/signaling?viewer=abc' });
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

  describe('full Web Client for the in-app WebView', () => {
    const web = (host: { base: string }, path: string, headers: Record<string, string> = {}) =>
      fetch(`${host.base}/botharness-device/web${path}`, { headers, redirect: 'manual' });
    const sessionCookie = (response: Response) =>
      response.headers.get('set-cookie')?.split(';')[0] ?? '';

    it('trades the credential on the first load for a scoped session cookie', async () => {
      const host = await fakeDsh();
      const paired = await pair(host.base, host.pairing.createOffer().offer);
      expect((await web(host, '/')).status).toBe(401);

      const first = await web(host, '/', { authorization: `Device ${paired.body.credential}` });
      expect(first.status).toBe(200);
      expect(await first.json()).toMatchObject({ path: '/' });
      const issued = first.headers.get('set-cookie')!;
      expect(issued).toMatch(/^botharness-device-web=[\w-]+; Path=\/botharness-device\/web\/;/u);
      expect(issued).toContain('HttpOnly');
      expect(issued).toContain('SameSite=Strict');
      expect(issued).not.toContain('Secure');
      expect(issued).not.toContain(paired.body.credential!.split('.')[1]);

      const cookie = sessionCookie(first);
      const api = await fetch(`${host.base}/botharness-device/web/api/botharness/list`, {
        method: 'POST',
        headers: { cookie, origin: host.base, 'content-type': 'application/json' },
        body: '{"type":"client-request"}',
      });
      expect(api.status).toBe(200);
      expect(await api.json()).toEqual({
        path: '/api/botharness/list',
        body: '{"type":"client-request"}',
      });
      expect(api.headers.get('set-cookie')).toBeNull();
      const seen = host.state.seen.at(-1)!;
      expect(seen.cookie).toBe('dsh=1');
      expect(seen.origin).toBeUndefined();

      const asset = await web(host, '/assets/index.js?v=1', { cookie });
      expect(await asset.json()).toMatchObject({ path: '/assets/index.js' });
      expect((await web(host, '/', { cookie: 'botharness-device-web=forged' })).status).toBe(401);
    });

    it('marks the cookie Secure behind an HTTPS route and redirects the bare directory', async () => {
      const host = await fakeDsh();
      const paired = await pair(host.base, host.pairing.createOffer().offer);
      const bare = await web(host, '?x=1', {
        authorization: `Device ${paired.body.credential}`,
        'x-forwarded-proto': 'https',
      });
      expect(bare.status).toBe(308);
      expect(bare.headers.get('location')).toBe('/botharness-device/web/?x=1');
      expect(bare.headers.get('set-cookie')).toContain('Secure');
    });

    it('ends the WebView session, its stream and its next request on revoke', async () => {
      const host = await fakeDsh();
      const paired = await pair(host.base, host.pairing.createOffer().offer);
      const cookie = sessionCookie(
        await web(host, '/', { authorization: `Device ${paired.body.credential}` }),
      );
      const mux = '/botharness-device/web/api/remote.mux';
      expect((await stream(host.port, {}, mux)).status).toBe(401);
      const open = await stream(host.port, { cookie, origin: host.base }, mux);
      expect(open.status).toBe(101);
      expect(await echo(open.socket!, 'frame-1')).toBe('frame-1');
      expect(
        (await stream(host.port, { cookie, origin: 'https://evil.example' }, mux)).status,
      ).toBe(403);

      const closed = new Promise((resolve) => open.socket!.on('close', resolve));
      expect(host.pairing.revoke(paired.body.deviceId!)).toEqual({
        revoked: true,
        closedStreams: 1,
      });
      await closed;

      const after = await web(host, '/', { cookie });
      expect([after.status, await after.json()]).toEqual([401, { code: 'device-revoked' }]);
      expect(await stream(host.port, { cookie }, mux)).toEqual({
        status: 401,
        body: '{"code":"device-revoked"}',
      });
    });

    it('forwards a viewer socket under the directory and closes it on revoke', async () => {
      const host = await fakeDsh();
      const paired = await pair(host.base, host.pairing.createOffer().offer);
      const cookie = sessionCookie(
        await web(host, '/', { authorization: `Device ${paired.body.credential}` }),
      );
      const viewer = '/botharness-device/web/botharness-computer/viewer/websockets?token=x';
      expect((await stream(host.port, {}, viewer)).status).toBe(401);
      const open = await stream(host.port, { cookie, origin: host.base }, viewer);
      expect(open.status).toBe(101);
      expect(host.state.upgrades).toEqual(['/botharness-computer/viewer/websockets?token=x']);
      expect(await echo(open.socket!, 'pointer')).toBe('pointer');

      const closed = new Promise((resolve) => open.socket!.on('close', resolve));
      expect(host.pairing.revoke(paired.body.deviceId!).closedStreams).toBe(1);
      await closed;
      expect(await stream(host.port, { cookie }, viewer)).toEqual({
        status: 401,
        body: '{"code":"device-revoked"}',
      });
    });
  });
});
