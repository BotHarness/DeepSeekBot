import { describe, expect, it } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import {
  createDevicePairing,
  PAIRING_OFFER_TTL_MS,
  type DevicePairingEvent,
} from '../src/devices/pairing.js';
import { createDevicesHttp, offeredRoutes, type PairingOfferView } from '../src/devices/http.js';
import { detectPhoneRoutes, type RunCommand } from '../src/devices/routes.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

function fixture() {
  const home = createTempRoot('botharness-device-pairing-');
  let clock = Date.parse('2026-10-14T08:00:00.000Z');
  const events: DevicePairingEvent[] = [];
  const open = () => {
    const owner = trackTestOwner(
      mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    return {
      owner,
      pairing: createDevicePairing({
        database: attachOperationalModule(owner, 'device-pairing'),
        hostName: 'studio',
        now: () => clock,
        record: (event) => events.push(event),
      }),
    };
  };
  return {
    open,
    events,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('Device Pairing', () => {
  it('reports the running phone protocol and optional push support without exposing device secrets', async () => {
    const { pairing } = fixture().open();
    const http = createDevicesHttp({
      pairing,
      routes: async () => ({ routes: [], tailscale: 'missing', serveCommand: '' }),
      compatibility: () => ({
        schemaVersion: 1,
        protocol: { min: 1, max: 1 },
        host: { version: '2.0.0-beta.1', source: 'abc123456', platform: 'darwin', arch: 'arm64' },
        features: { push: false },
      }),
    });
    const response = await http(
      new Request('http://localhost/api/botharness/devices/compatibility'),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      schemaVersion: 1,
      protocol: { min: 1, max: 1 },
      host: { version: '2.0.0-beta.1', source: 'abc123456', platform: 'darwin', arch: 'arm64' },
      features: { push: false },
    });
  });

  it('redeems an offer once, admits the device across a Host restart, and refuses it after revocation', () => {
    const f = fixture();
    let host = f.open();
    const identity = host.pairing.host();
    const { offer } = host.pairing.createOffer();
    const paired = host.pairing.redeem({ offer, name: '  Vain\u0007 iPhone ' });
    expect(paired).toMatchObject({ ok: true, device: { name: 'Vain iPhone' }, host: identity });
    if (!paired.ok) return;
    expect(host.pairing.redeem({ offer })).toEqual({ ok: false, code: 'offer-invalid' });

    host.owner.close();
    host = f.open();
    expect(host.pairing.host()).toEqual(identity);
    const admitted = host.pairing.admit(`Device ${paired.credential}`);
    expect(admitted).toMatchObject({ ok: true, device: { id: paired.device.id } });
    expect(host.pairing.list()).toEqual([
      expect.objectContaining({ id: paired.device.id, lastSeenAt: '2026-10-14T08:00:00.000Z' }),
    ]);

    let closed = 0;
    host.pairing.attachStream(paired.device.id, () => (closed += 1));
    host.pairing.attachStream(paired.device.id, () => (closed += 1));
    expect(host.pairing.revoke(paired.device.id)).toEqual({ revoked: true, closedStreams: 2 });
    expect(closed).toBe(2);
    expect(host.pairing.admit(`Device ${paired.credential}`)).toEqual({
      ok: false,
      code: 'device-revoked',
    });
    expect(host.pairing.list()[0]?.revokedAt).toBeDefined();
    expect(host.pairing.revoke(paired.device.id)).toEqual({ revoked: false, closedStreams: 0 });
  });

  it('tells a missing, unknown and forged credential apart from a revoked one', () => {
    const host = fixture().open();
    const paired = host.pairing.redeem({ offer: host.pairing.createOffer().offer });
    if (!paired.ok) throw new Error('pairing failed');
    const [id, secret] = paired.credential.split('.') as [string, string];
    expect(host.pairing.admit(undefined)).toEqual({ ok: false, code: 'device-credential-missing' });
    expect(host.pairing.admit(`Bearer ${paired.credential}`)).toEqual({
      ok: false,
      code: 'device-credential-missing',
    });
    const forged = `${secret.slice(0, -1)}${secret.endsWith('A') ? 'B' : 'A'}`;
    expect(host.pairing.admit(`Device ${id}.${forged}`)).toEqual({
      ok: false,
      code: 'device-unknown',
    });
    expect(host.pairing.admit(`Device ${'x'.repeat(22)}.${secret}`)).toEqual({
      ok: false,
      code: 'device-unknown',
    });
  });

  it('expires an offer and voids unredeemed offers on restart', () => {
    const f = fixture();
    let host = f.open();
    const late = host.pairing.createOffer();
    f.advance(PAIRING_OFFER_TTL_MS);
    expect(host.pairing.redeem({ offer: late.offer })).toEqual({
      ok: false,
      code: 'offer-expired',
    });
    const pending = host.pairing.createOffer();
    host.owner.close();
    host = f.open();
    expect(host.pairing.redeem({ offer: pending.offer })).toEqual({
      ok: false,
      code: 'offer-invalid',
    });
  });

  it('records diagnostics without offers or credentials', () => {
    const f = fixture();
    const host = f.open();
    const { offer } = host.pairing.createOffer();
    const paired = host.pairing.redeem({ offer });
    if (!paired.ok) throw new Error('pairing failed');
    host.pairing.admit(`Device ${paired.credential}`);
    host.pairing.revoke(paired.device.id);
    host.pairing.admit(`Device ${paired.credential}`);
    const text = JSON.stringify(f.events);
    expect(f.events.map((event) => event.phase)).toEqual([
      'offer-created',
      'offer-redeemed',
      'device-admitted',
      'device-revoked',
      'device-refused',
    ]);
    expect(text).not.toContain(offer);
    expect(text).not.toContain(paired.credential.split('.')[1]);
  });
});

describe('paired devices management', () => {
  const tailnet: RunCommand = async (_file, args) =>
    args[0] === 'status'
      ? JSON.stringify({ BackendState: 'Running', Self: { DNSName: 'studio.tail1.ts.net.' } })
      : JSON.stringify({
          Web: {
            'studio.tail1.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:4100' } } },
          },
        });

  it('offers the served Tailscale route first and a QR code carrying a one-time offer', async () => {
    const host = fixture().open();
    const http = createDevicesHttp({
      pairing: host.pairing,
      routes: () => detectPhoneRoutes({ port: 4100, run: tailnet }),
    });
    const response = await http(
      new Request('http://127.0.0.1:4100/api/botharness/devices/offer', {
        method: 'POST',
        body: JSON.stringify({ origin: 'http://127.0.0.1:4100' }),
      }),
    );
    const view = (await response.json()) as PairingOfferView;
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(view.reachable).toBe(true);
    expect(view.routes).toEqual(['https://studio.tail1.ts.net', 'http://127.0.0.1:4100']);
    expect(view.qr.size).toBeGreaterThan(20);
    const url = new URL(view.link);
    expect(url.protocol).toBe('deepseekbot:');
    const payload = JSON.parse(Buffer.from(url.searchParams.get('p')!, 'base64url').toString()) as {
      offer: string;
      host: { id: string };
      routes: string[];
    };
    expect(payload.routes).toEqual(view.routes);
    expect(payload.host).toEqual(host.pairing.host());
    expect(host.pairing.redeem({ offer: payload.offer }).ok).toBe(true);
  });

  it('warns when tailscale serve does not publish this Host', async () => {
    const unserved: RunCommand = async (_file, args) =>
      args[0] === 'status'
        ? JSON.stringify({ BackendState: 'Running', Self: { DNSName: 'studio.tail1.ts.net.' } })
        : '{}';
    const status = await detectPhoneRoutes({ port: 4100, run: unserved });
    expect(status.routes[0]).toMatchObject({ ready: false, issue: 'serve-missing' });
    expect(status.serveCommand).toBe('tailscale serve --bg 4100');
    expect(offeredRoutes(status, undefined).map((route) => route.url)).toEqual([
      'http://127.0.0.1:4100',
    ]);

    expect(offeredRoutes(status, 'https://studio.tail1.ts.net').map((route) => route.url)).toEqual([
      'https://studio.tail1.ts.net',
      'http://127.0.0.1:4100',
    ]);
    const missing: RunCommand = () =>
      Promise.reject(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    expect(await detectPhoneRoutes({ port: 4100, run: missing })).toMatchObject({
      tailscale: 'missing',
    });
  });

  it('lists devices and revokes one', async () => {
    const host = fixture().open();
    const http = createDevicesHttp({
      pairing: host.pairing,
      routes: () => detectPhoneRoutes({ port: 4100, run: tailnet }),
    });
    const paired = host.pairing.redeem({ offer: host.pairing.createOffer().offer, name: 'Pixel' });
    if (!paired.ok) throw new Error('pairing failed');
    const list = await (await http(new Request('http://h/api/botharness/devices'))).json();
    expect(list).toMatchObject({ devices: [{ id: paired.device.id, name: 'Pixel' }] });
    expect(JSON.stringify(list)).not.toContain(paired.credential);
    const revoke = (deviceId: string) =>
      http(
        new Request('http://h/api/botharness/devices/revoke', {
          method: 'POST',
          body: JSON.stringify({ deviceId }),
        }),
      );
    expect((await revoke(paired.device.id)).status).toBe(200);
    expect((await revoke('nope')).status).toBe(404);
  });
});
