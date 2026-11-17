import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { HostCarrier } from '@botharness/host-protocol/carrier';
import { noisePublicKey } from '@botharness/host-protocol/noise/xk';
import { keyBytes, keyHex } from '@botharness/host-client/encrypted-carrier';
import { encryptedCarrier } from '@botharness/host-client/encrypted-carrier';
import { isCustodyHandle, type SavedHost } from '@botharness/host-client/hosts';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createRemoteCustody, type Secret } from '../src/devices/remote-custody.js';
import {
  createRemoteCustodyHttp,
  REMOTE_CUSTODY_ACTIONS,
} from '../src/devices/remote-custody-http.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const deviceKey = '11'.repeat(32);
const relayToken = '22'.repeat(32);
const host: SavedHost = {
  hostId: 'remote-host',
  hostName: 'Remote',
  routes: ['http://127.0.0.1:31009'],
  deviceId: 'device-1',
  credential: 'device-secret-credential',
};
const encryptedHost: SavedHost = {
  ...host,
  routes: ['https://relay.example.test'],
  encryption: {
    protocol: 'connect-noise-xk-v1',
    hostKey: '33'.repeat(32),
    deviceKey,
    privateRelay: { origin: 'https://relay.example.test', token: relayToken },
  },
};

function fixture() {
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('custody-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const secrets = new Map<string, Secret>();
  const requests: { url: string; headers: Record<string, string> | undefined }[] = [];
  const raw: HostCarrier = {
    request: vi.fn(async (url, init) => {
      requests.push({ url, headers: init.headers });
      return { status: 200, contentType: 'application/json', text: async () => '{"ok":true}' };
    }),
    openSocket: vi.fn(() => ({ send() {}, close() {} })),
  };
  let ownerHumanId = 'local-human';
  const custody = createRemoteCustody({
    database: attachOperationalModule(owner, 'remote-host-custody'),
    secrets: {
      read: async (handle) => secrets.get(handle),
      write: async (handle, secret) => {
        secrets.set(handle, secret);
      },
      delete: async (handle) => {
        secrets.delete(handle);
      },
    },
    ownerHumanId: () => ownerHumanId,
    carrier: () => raw,
  });
  const rows = () =>
    attachOperationalModule(owner, 'custody-test').read((db) =>
      db.prepare('SELECT * FROM remote_host_custody').all(),
    );
  return {
    custody,
    secrets,
    requests,
    rows,
    transferOwner(id: string) {
      ownerHumanId = id;
    },
  };
}

describe('Remote Host credential custody', () => {
  it('keeps the credential, device key and relay token on the Host and returns only a handle', async () => {
    const f = fixture();
    const sealed = await f.custody.seal(encryptedHost);
    expect(isCustodyHandle(sealed.credential)).toBe(true);
    const text = JSON.stringify(sealed);
    expect(text).not.toContain(host.credential);
    expect(text).not.toContain(deviceKey);
    expect(text).not.toContain(relayToken);
    expect(sealed.encryption?.deviceKey).toBe(keyHex(noisePublicKey(keyBytes(deviceKey))));
    expect(sealed.encryption?.privateRelay?.token).toBe(
      createHash('sha256').update(relayToken).digest('hex'),
    );
    expect(f.secrets.get(sealed.credential)).toEqual({
      credential: host.credential,
      encryption: encryptedHost.encryption,
    });
    expect(JSON.stringify(f.rows())).not.toContain(host.credential);
  });

  it('swaps the handle for the credential only inside the Host request', async () => {
    const f = fixture();
    const sealed = await f.custody.seal(host);
    const response = await f.custody.request({
      handle: sealed.credential,
      url: `${host.routes[0]}/botharness-device/feed`,
      method: 'GET',
      headers: { authorization: `Device ${sealed.credential}` },
      signal: AbortSignal.timeout(1000),
    });
    expect(response.status).toBe(200);
    expect(f.requests).toEqual([
      {
        url: `${host.routes[0]}/botharness-device/feed`,
        headers: { authorization: `Device ${host.credential}` },
      },
    ]);
  });

  it('refuses plain routes the Host did not record, other Owners and forgotten handles', async () => {
    const f = fixture();
    const sealed = await f.custody.seal(host);
    const request = (url: string) =>
      f.custody.request({
        handle: sealed.credential,
        url,
        method: 'GET',
        headers: { authorization: `Device ${sealed.credential}` },
        signal: AbortSignal.timeout(1000),
      });
    await expect(request('https://collector.example.test/x')).rejects.toMatchObject({
      code: 'custody-route-unknown',
    });
    f.transferOwner('another-owner');
    await expect(request(`${host.routes[0]}/x`)).rejects.toMatchObject({
      code: 'custody-owner-changed',
    });
    f.transferOwner('local-human');
    await f.custody.forget(sealed.credential);
    expect(f.secrets.size).toBe(0);
    expect(f.rows()).toEqual([]);
    await expect(request(`${host.routes[0]}/x`)).rejects.toMatchObject({
      code: 'custody-handle-unknown',
    });
    expect(f.requests).toEqual([]);
  });

  it('refreshes routes and a rotated relay token without exposing either secret', async () => {
    const f = fixture();
    const sealed = await f.custody.seal(encryptedHost);
    const rotated = '44'.repeat(32);
    const refreshed = await f.custody.seal({
      ...sealed,
      routes: ['https://relay.example.test', 'https://other.example.test'],
      encryption: {
        ...sealed.encryption!,
        privateRelay: {
          origin: 'https://relay.example.test',
          token: rotated,
          additionalOrigins: ['https://other.example.test'],
        },
      },
    });
    expect(refreshed.credential).toBe(sealed.credential);
    expect(refreshed.encryption?.privateRelay?.token).toBe(
      createHash('sha256').update(rotated).digest('hex'),
    );
    expect(f.secrets.get(sealed.credential)?.encryption?.privateRelay?.token).toBe(rotated);
    const unchanged = await f.custody.seal(refreshed);
    expect(f.secrets.get(sealed.credential)?.encryption?.privateRelay?.token).toBe(rotated);
    expect(unchanged.encryption?.privateRelay?.token).toBe(
      refreshed.encryption?.privateRelay?.token,
    );
    await expect(
      f.custody.seal({
        ...sealed,
        encryption: { ...sealed.encryption!, deviceKey: '55'.repeat(32) },
      }),
    ).rejects.toMatchObject({ code: 'custody-host-mismatch' });
  });

  it('answers the Client in the same shape a direct carrier would', async () => {
    const f = fixture();
    const http = createRemoteCustodyHttp(f.custody);
    expect(REMOTE_CUSTODY_ACTIONS).toEqual(
      expect.arrayContaining(['seal', 'forget', 'request', 'socket', 'send', 'close']),
    );
    const post = async (body: unknown) =>
      http(
        new Request('http://localhost/api/botharness/remote-custody', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      );
    const sealed = (await (await post({ action: 'seal', host })).json()) as { host: SavedHost };
    const reply = await post({
      action: 'request',
      handle: sealed.host.credential,
      url: `${host.routes[0]}/x`,
      method: 'POST',
      headers: { authorization: `Device ${sealed.host.credential}` },
      body: '{}',
    });
    expect(reply.status).toBe(200);
    expect(await reply.json()).toEqual({
      status: 200,
      contentType: 'application/json',
      body: Buffer.from('{"ok":true}').toString('base64'),
    });
    const refused = await post({
      action: 'request',
      handle: 'custody.' + 'a'.repeat(43),
      url: `${host.routes[0]}/x`,
      method: 'GET',
    });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ code: 'custody-handle-unknown', refused: false });
  });

  it('lets the Client transport hand a handle to custody instead of opening its own session', () => {
    const custody = vi.fn(() => ({ request: vi.fn(), openSocket: vi.fn() }) as HostCarrier);
    const raw: HostCarrier = { custody, request: vi.fn(), openSocket: vi.fn() };
    const handle = 'custody.' + 'b'.repeat(43);
    expect(encryptedCarrier({ raw, hostId: 'remote-host', credential: handle })).toBe(
      custody.mock.results[0]!.value,
    );
    expect(custody).toHaveBeenCalledWith({ hostId: 'remote-host', credential: handle });
    encryptedCarrier({ raw, hostId: 'remote-host', credential: host.credential });
    expect(custody).toHaveBeenCalledTimes(1);
  });
});
