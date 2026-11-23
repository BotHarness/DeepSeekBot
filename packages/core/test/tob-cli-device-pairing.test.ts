import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createDevicesHttp } from '../src/devices/http.js';
import {
  createDevicePairing,
  PAIRING_OFFER_TTL_MS,
  type DevicePairingEvent,
} from '../src/devices/pairing.js';
import { detectPhoneRoutes } from '../src/devices/routes.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
import { LAUNCH_TOKEN, serveHost, tobCli } from './tob-cli-live-host.js';

async function scene() {
  const home = createTempRoot('bh-tob-devices-');
  let clock = Date.parse('2026-11-23T08:00:00.000Z');
  const events: DevicePairingEvent[] = [];
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: 'studio',
    now: () => clock,
    record: (event) => events.push(event),
  });
  const http = createDevicesHttp({
    pairing,
    routes: () =>
      detectPhoneRoutes({
        port: 4100,
        run: async (_file, args) =>
          args[0] === 'status'
            ? JSON.stringify({ BackendState: 'Running', Self: { DNSName: 'studio.tail1.ts.net.' } })
            : JSON.stringify({
                Web: {
                  'studio.tail1.ts.net:443': {
                    Handlers: { '/': { Proxy: 'http://127.0.0.1:4100' } },
                  },
                },
              }),
      }),
  });
  const tob = await tobCli(await serveHost(http));
  const offerIn = (path: string) => {
    const link = readFileSync(path, 'utf8').trim();
    const payload = new URL(link).searchParams.get('p')!;
    return {
      link,
      offer: (JSON.parse(Buffer.from(payload, 'base64url').toString()) as { offer: string }).offer,
    };
  };
  return {
    home,
    pairing,
    events,
    tob,
    offerIn,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

it('pairs a device from Tob through a private file and revokes exactly that device after review', async () => {
  const f = await scene();
  const out = join(f.home, 'pairing-link');

  expect(await f.tob.invoke(['devices'])).toMatchObject({ ok: true, value: { devices: [] } });
  expect(await f.tob.invoke(['device-offer'])).toMatchObject({
    ok: false,
    error: { code: 'out-required' },
  });
  const opened = await f.tob.invoke(['device-offer', '--out', out]);
  expect(opened).toMatchObject({
    ok: true,
    value: { receipt: expect.any(String), link: { path: out } },
  });
  if (process.platform !== 'win32') expect(statSync(out).mode & 0o777).toBe(0o600);
  const { link, offer } = f.offerIn(out);
  const receipt = opened.value!['receipt'] as string;
  expect(await f.tob.invoke(['device-offer-status', receipt])).toMatchObject({
    ok: true,
    value: { state: 'pending' },
  });

  const phone = f.pairing.redeem({ offer, name: 'Vain iPhone' });
  if (!phone.ok) throw new Error('pairing failed');
  const other = f.pairing.redeem({ offer: f.pairing.createOffer().offer, name: 'Pixel' });
  if (!other.ok) throw new Error('pairing failed');
  expect(await f.tob.invoke(['device-offer-status', receipt])).toMatchObject({
    ok: true,
    value: { state: 'redeemed', deviceId: phone.device.id },
  });
  let closed = 0;
  f.pairing.attachStream(phone.device.id, () => (closed += 1));

  expect(await f.tob.invoke(['device-revoke', phone.device.id])).toMatchObject({
    ok: false,
    error: { code: 'confirm-required' },
  });
  expect(await f.tob.invoke(['device-revoke', phone.device.id, '--confirm'])).toEqual({
    ok: true,
    value: {
      revoked: true,
      closedStreams: 1,
      device: { id: phone.device.id, name: 'Vain iPhone' },
    },
  });
  expect(closed).toBe(1);
  expect(f.pairing.admit(`Device ${phone.credential}`)).toEqual({
    ok: false,
    code: 'device-revoked',
  });
  expect(f.pairing.admit(`Device ${other.credential}`)).toMatchObject({ ok: true });
  expect(await f.tob.invoke(['device-revoke', phone.device.id, '--confirm'])).toMatchObject({
    ok: false,
    error: { code: 'device-already-revoked' },
  });
  expect(await f.tob.invoke(['devices'])).toMatchObject({
    ok: true,
    value: {
      devices: expect.arrayContaining([
        expect.objectContaining({ id: phone.device.id, revokedAt: expect.any(String) }),
        expect.not.objectContaining({ revokedAt: expect.anything() }),
      ]),
    },
  });

  expect(f.tob.cards()).toEqual([
    'device-offer',
    'device-offer',
    'device-revoke',
    'device-revoke',
    'device-revoke',
  ]);
  const visible = JSON.stringify([f.tob.transcript, f.tob.approve.mock.calls, f.events]);
  for (const secret of [link, offer, phone.credential, other.credential, LAUNCH_TOKEN])
    expect(visible).not.toContain(secret);
});

it('reports an expired Tob offer by its receipt and the link no longer pairs', async () => {
  const f = await scene();
  const out = join(f.home, 'expiring-link');
  const opened = await f.tob.invoke(['device-offer', '--out', out]);
  const receipt = opened.value!['receipt'] as string;
  f.advance(PAIRING_OFFER_TTL_MS);
  expect(await f.tob.invoke(['device-offer-status', receipt])).toMatchObject({
    ok: true,
    value: { state: 'expired' },
  });
  expect(f.pairing.redeem({ offer: f.offerIn(out).offer })).toMatchObject({ ok: false });
  expect(await f.tob.invoke(['device-offer', '--out', out])).toMatchObject({
    ok: false,
    error: { code: 'output-exists' },
  });
});
