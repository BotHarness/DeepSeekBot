import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createDeviceGateway } from '../src/devices/gateway.js';
import { createDevicePushHttp } from '../src/push/http.js';
import { TOKEN_A, fixture, approval } from './push-delivery-fixtures.js';

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

describe('Device gateway push endpoints', () => {
  it('registers, reads and changes the admitted device’s own settings, and refuses strangers', async () => {
    const f = fixture();
    const phone = f.device('Phone');
    const gateway = createDeviceGateway({
      pairing: f.pairing,
      port: () => 1,
      authenticatedUrl: (base) => base,
      push: createDevicePushHttp(f.push),
    });
    const server = createServer((req, res) => void gateway.handle(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/botharness-device/push`;
    const call = async (path: string, body?: unknown, credential = phone.credential) => {
      const response = await fetch(`${base}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Device ${credential}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    };

    expect(await call('')).toMatchObject({ status: 200, body: { registered: false } });
    expect(await call('/register', { token: TOKEN_A, platform: 'ios' })).toMatchObject({
      status: 200,
      body: { registered: true, preferences: { approval: true } },
    });
    expect(await call('/preferences', { preferences: { reply: false } })).toMatchObject({
      status: 200,
      body: { preferences: { reply: false } },
    });
    expect(await call('/preferences', { enabled: false })).toMatchObject({
      status: 200,
      body: { enabled: false, preferences: { reply: false } },
    });
    expect(await call('/quiet', { channelId: 'g1', quiet: true })).toMatchObject({
      status: 200,
      body: { quietChannelIds: ['g1'] },
    });
    expect(await call('/quiet', { channelId: 'g1' })).toEqual({
      status: 400,
      body: { code: 'invalid-input' },
    });
    expect(await call('/test', {})).toEqual({ status: 200, body: { sent: true } });
    expect(
      await call('', undefined, 'aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
    ).toEqual({
      status: 401,
      body: { code: 'device-unknown' },
    });
    expect(await call('/unregister', {})).toEqual({ status: 200, body: { registered: false } });
    expect(f.tokenRows()).toEqual([]);
  });
});
