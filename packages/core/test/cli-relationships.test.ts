import { expect, it, vi } from 'vitest';
import { runRelationshipCommand } from '../src/bots/cli-relationships.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempRoot } from './helpers.js';
import { pairingLink } from '../src/devices/http.js';
import { noiseFingerprint, NOISE_PROTOCOL } from '../src/devices/noise/xk.js';
import { enrollRelationshipClient } from '../src/devices/relationship-enrollment.js';
import { tmpdir } from 'node:os';

vi.mock('../src/devices/relationship-enrollment.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../src/devices/relationship-enrollment.js')>();
  return {
    ...original,
    enrollRelationshipClient: vi.fn(async () => ({ ok: false, code: 'cancelled' })),
  };
});

const id = 'a'.repeat(32);
const publicKey = 'ab'.repeat(32);
const response = { relationships: [] };
const fixture = () => {
  const http = vi.fn(async () => ({ bytes: new TextEncoder().encode(JSON.stringify(response)) }));
  return { http, connect: async () => ({ http }) };
};
it('passes the command deadline into encrypted relationship enrollment', async () => {
  const { http, connect } = fixture();
  http.mockResolvedValueOnce({
    bytes: new TextEncoder().encode(
      JSON.stringify({
        relationships: [
          {
            id,
            peer: {
              id: 'peer',
              name: 'Peer',
              publicKey,
              routes: ['http://127.0.0.1:47001'],
            },
            direction: 'outgoing',
            state: 'active',
            expiresAt: Date.now() + 60_000,
            peerRevocationPending: false,
          },
        ],
      }),
    ),
  });
  const abort = new AbortController();
  await expect(
    runRelationshipCommand(
      ['enroll', id],
      { out: join(tmpdir(), `e1-enroll-${crypto.randomUUID()}.json`) },
      connect,
      abort.signal,
    ),
  ).rejects.toMatchObject({ code: 'cancelled' });
  expect(enrollRelationshipClient).toHaveBeenCalledWith(
    expect.objectContaining({ signal: abort.signal }),
  );
});
it('lists relationships through the authenticated owning Host', async () => {
  const { http, connect } = fixture();
  expect(await runRelationshipCommand(['list'], {}, connect)).toEqual(response);
  expect(http).toHaveBeenCalledWith('/api/botharness/relationships', undefined);
});
it('checks directions without confirmation or issuing another enrollment', async () => {
  const { http, connect } = fixture();
  await runRelationshipCommand(['sync', id], {}, connect);
  expect(http).toHaveBeenCalledWith('/api/botharness/relationships', { action: 'sync', id });
  await expect(runRelationshipCommand(['route', id], {}, connect)).rejects.toThrow('--link-file');
});
it('requires exact identity and explicit reciprocal approval before contacting the Host', async () => {
  const { http, connect } = fixture();
  await expect(runRelationshipCommand(['approve', id, publicKey], {}, connect)).rejects.toThrow(
    'confirm',
  );
  expect(http).not.toHaveBeenCalled();
  await runRelationshipCommand(['approve', id, publicKey], { confirm: true }, connect);
  expect(http).toHaveBeenCalledWith('/api/botharness/relationships', {
    action: 'approve',
    id,
    confirmedKey: publicKey,
    confirm: true,
  });
});
it('keeps destructive disconnect confirmation and private enrollment output mandatory', async () => {
  const { http, connect } = fixture();
  await expect(runRelationshipCommand(['disconnect', id], {}, connect)).rejects.toThrow('confirm');
  await expect(runRelationshipCommand(['enroll', id], {}, connect)).rejects.toThrow('--out');
  expect(http).not.toHaveBeenCalled();
  await runRelationshipCommand(['disconnect', id], { confirm: true }, connect);
  expect(http).toHaveBeenCalledWith('/api/botharness/relationships', {
    action: 'disconnect',
    id,
    confirm: true,
  });
});

it('rejects invalid Client names before connecting or creating credentials', async () => {
  const { http, connect } = fixture();
  for (const name of ['', ' ', 'x'.repeat(61)]) {
    await expect(
      runRelationshipCommand(
        ['enroll', id],
        { out: '/new-private-grant.json', 'device-name': name },
        connect,
      ),
    ).rejects.toThrow('--device-name');
  }
  expect(http).not.toHaveBeenCalled();
});

it('recovers an existing private Client file without printing its admission or replacing its grant', async () => {
  const root = createTempRoot('relationship-cli-route-');
  const deviceFile = join(root, 'client.private.json');
  const linkFile = join(root, 'link.private');
  const origin = 'https://private.example';
  const admission = { origin, token: 'cd'.repeat(32) };
  const saved = {
    hostId: 'peer',
    hostName: 'Peer',
    deviceId: 'existing-device',
    credential: 'existing.secret',
    routes: ['http://192.168.1.20:3080'],
    encryption: { protocol: 'connect-noise-xk-v1', hostKey: publicKey, deviceKey: 'ef'.repeat(32) },
  };
  writeFileSync(deviceFile, JSON.stringify(saved));
  writeFileSync(
    linkFile,
    pairingLink({
      v: 1,
      host: { id: 'peer', name: 'Peer' },
      offer: 'offer',
      routes: [origin],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      encryption: {
        protocol: 'connect-noise-xk-v1',
        noise: NOISE_PROTOCOL,
        required: true,
        fingerprint: noiseFingerprint(Buffer.from(publicKey, 'hex')),
        publicKey,
        privateRelay: admission,
      },
    }),
  );
  const relationship = {
    id,
    peer: { id: 'peer', name: 'Peer', publicKey, routes: [origin] },
    direction: 'outgoing',
    state: 'active',
    expiresAt: Date.now() + 60_000,
    peerRevocationPending: false,
  };
  const http = vi.fn(async () => ({
    bytes: new TextEncoder().encode(JSON.stringify({ relationship })),
  }));
  const result = await runRelationshipCommand(
    ['route', id],
    { 'link-file': linkFile, 'device-file': deviceFile },
    async () => ({ http }),
  );
  expect(JSON.stringify(result)).not.toContain(admission.token);
  expect(JSON.stringify(result)).not.toContain(saved.credential);
  expect(JSON.parse(readFileSync(deviceFile, 'utf8'))).toEqual({
    ...saved,
    routes: [origin],
    encryption: { ...saved.encryption, privateRelay: admission },
  });
  expect(http).toHaveBeenCalledOnce();
  writeFileSync(deviceFile, JSON.stringify({ ...saved, routePreference: saved.routes[0] }));
  await expect(
    runRelationshipCommand(
      ['route', id],
      { 'link-file': linkFile, 'device-file': deviceFile },
      async () => ({ http }),
    ),
  ).rejects.toMatchObject({ code: 'relationship-route-preference-unavailable' });
  expect(JSON.parse(readFileSync(deviceFile, 'utf8')).routePreference).toBe(saved.routes[0]);
  const beforeRefusal = readFileSync(deviceFile, 'utf8');
  const disconnected = async () => ({
    http: async () => {
      throw new Error('relationship-disconnected');
    },
  });
  await expect(
    runRelationshipCommand(
      ['route', id],
      { 'link-file': linkFile, 'device-file': deviceFile },
      disconnected,
    ),
  ).rejects.toThrow('relationship-disconnected');
  expect(readFileSync(deviceFile, 'utf8')).toBe(beforeRefusal);
});
