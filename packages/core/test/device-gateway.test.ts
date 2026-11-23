import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION_HEADER, MIN_PHONE_APP_VERSION } from '../src/devices/client-compat.js';
import { servers, fakeDsh, pair, stream, echo } from './support/device-gateway.js';

afterEach(async () => {
  vi.unstubAllEnvs();
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

  it('serves a phone app of any version and never refuses it for being old', async () => {
    const host = await fakeDsh();
    const { offer } = host.pairing.createOffer();
    const paired = await pair(host.base, offer);
    const list = (appVersion?: string) =>
      fetch(`${host.base}/botharness-device/api/botharness/list`, {
        method: 'POST',
        headers: {
          authorization: `Device ${paired.body.credential}`,
          'content-type': 'application/json',
          ...(appVersion === undefined ? {} : { [APP_VERSION_HEADER]: appVersion }),
        },
        body: '{"type":"client-request"}',
      });
    expect((await list('1.0.0')).status).toBe(200);
    expect((await list(MIN_PHONE_APP_VERSION)).status).toBe(200);
    expect((await list()).status).toBe(200);
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
