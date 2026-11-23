import type { AddressInfo, Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGatewayOrigin } from '../src/devices/connect.js';
import { createManagedTlsIngress } from '../src/devices/managed-tls-ingress.js';
import { DEVICE_ROUTE_HEADER } from '../src/devices/route-context.js';
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
  it('keeps paired Owner and Web Client HTTP and upgrade carriers through managed ingress', async () => {
    const host = await fakeDsh();
    const paired = await pair(host.base, host.pairing.createOffer().offer);
    const ingress = createManagedTlsIngress({ port: host.port });
    let device: Socket | undefined;
    let web: Socket | undefined;
    try {
      const port = await ingress.start();
      const base = `http://127.0.0.1:${port}`;
      const headers = { 'x-forwarded-for': '192.0.2.5', 'x-forwarded-proto': 'https' };
      const authorization = `Device ${paired.body.credential}`;
      const ownerDevice = await fetch(`${base}/botharness-device/api/botharness/list`, {
        method: 'POST',
        headers: { ...headers, authorization },
        body: '{"type":"client-request"}',
      });
      expect(ownerDevice.status).toBe(200);
      expect(await ownerDevice.json()).toMatchObject({ path: '/api/botharness/list' });
      expect(host.state.seen.at(-1)).toMatchObject({ connect: false, routeHeaderPresent: true });
      expect(ownerDevice.headers.has('set-cookie')).toBe(false);
      const ownerWeb = await fetch(`${base}/api/botharness/list`, {
        method: 'POST',
        headers: { ...headers, cookie: 'dsh=1' },
        body: 'web-client',
      });
      expect(await ownerWeb.json()).toMatchObject({ body: 'web-client' });
      const upgradedDevice = await stream(port, { ...headers, authorization });
      device = upgradedDevice.socket;
      expect(upgradedDevice.status).toBe(101);
      const upgradedWeb = await stream(port, { ...headers, cookie: 'dsh=1' }, '/api/remote.mux');
      web = upgradedWeb.socket;
      expect(upgradedWeb.status).toBe(101);
      if (!device || !web) throw new Error('missing-stream');
      expect(await echo(device, 'device-frame')).toBe('device-frame');
      expect(await echo(web, 'web-frame')).toBe('web-frame');
      host.pairing.revoke(paired.body.deviceId ?? '');
      expect(await echo(web, 'web-still-open')).toBe('web-still-open');
    } finally {
      device?.destroy();
      web?.destroy();
      await ingress.close();
    }
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
      headers: {
        origin: browser,
        authorization: `Device ${credential}`,
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty',
        'sec-fetch-user': '?1',
      },
      body: '{"type":"client-request"}',
    });
    expect(call.status).toBe(200);
    expect(call.headers.get('access-control-allow-origin')).toBe(browser);
    expect(host.state.seen.at(-1)!.origin).toBeUndefined();
    for (const name of ['sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'sec-fetch-user'])
      expect(host.state.seen.at(-1)![name]).toBeUndefined();

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

  it('forwards cross-origin avatar GET bytes only for an admitted device without cookies', async () => {
    const host = await fakeDsh();
    const browser = 'http://127.0.0.1:41000';
    const paired = await pair(host.base, host.pairing.createOffer().offer);
    const authorization = `Device ${paired.body.credential}`;
    const url = `${host.base}/botharness-device/api/botharness/bot-avatar?slug=ada&v=portrait-1`;
    const preflight = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        origin: browser,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toContain('GET');
    expect(preflight.headers.get('access-control-allow-headers')).toContain('authorization');
    const image = await fetch(url, { headers: { origin: browser, authorization } });
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(image.headers.get('access-control-allow-origin')).toBe(browser);
    expect(image.headers.get('vary')).toBe('origin');
    expect(image.headers.get('access-control-allow-credentials')).toBeNull();
    expect(image.headers.get('set-cookie')).toBeNull();
    expect(Buffer.from(await image.arrayBuffer())).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(host.state.seen.at(-1)).toMatchObject({
      path: '/api/botharness/bot-avatar',
      cookie: 'dsh=1',
    });
    expect(host.state.seen.at(-1)!.authorization).toBeUndefined();
    expect(host.state.seen.at(-1)!.origin).toBeUndefined();
    const admitted = host.state.seen.length;
    expect((await fetch(url, { headers: { origin: browser } })).status).toBe(401);
    expect(
      (await fetch(url, { headers: { origin: 'https://evil.example', authorization } })).status,
    ).toBe(403);
    expect(
      (await fetch(url, { headers: { origin: browser, authorization, cookie: 'dsh=1' } })).status,
    ).toBe(403);
    host.pairing.revoke(paired.body.deviceId!);
    const revoked = await fetch(url, { headers: { origin: browser, authorization } });
    expect(revoked.status).toBe(401);
    expect(await revoked.json()).toEqual({ code: 'device-revoked' });
    expect(host.state.seen).toHaveLength(admitted);
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
    'refuses plaintext Connect HTTP regardless of forged route tag (%s)',
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
      expect(tunneled.status).toBe(404);
      expect(host.state.seen).toHaveLength(1);
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

  it('refuses plaintext Connect upgrades and strips forged direct tags', async () => {
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
    expect(tunneled.status).toBe(404);
    expect(host.state.seen).toHaveLength(1);
  });
});
