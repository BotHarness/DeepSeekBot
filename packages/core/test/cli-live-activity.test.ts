import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
import { createEncryptedGateway } from '../src/devices/encrypted-gateway.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { noisePublicKey } from '../src/devices/noise/xk.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { serializeSavedHost } from '../../../apps/mobile/src/host/hosts.js';

it('uses Device credentials from a file and activity tokens from stdin without printing either', async () => {
  const calls: { path: string | undefined; body: string }[] = [];
  let revoked = false;
  const server = createServer(async (request, response) => {
    expect(request.headers.authorization).toBe('Device device.private-credential');
    let body = '';
    for await (const chunk of request) body += String(chunk);
    calls.push({ path: request.url, body });
    response.writeHead(revoked ? 401 : 200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(revoked ? { code: 'device-revoked' } : { registered: true }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('address');
  const file = join(createTempRoot('activity-cli-'), 'pairing.json');
  writeFileSync(
    file,
    JSON.stringify({
      hostId: 'host',
      hostName: 'Computer',
      deviceId: 'device',
      credential: 'device.private-credential',
      routes: [`http://127.0.0.1:${address.port}`],
    }),
  );
  const token = 'a'.repeat(64);
  const run = async (operation: string, body?: unknown) => {
    const out: string[] = [],
      err: string[] = [];
    const code = await runBotCreateCli(
      ['device-activity', operation, '--device-file', file, ...(body ? ['--activity-stdin'] : [])],
      {
        env: {},
        readStdin: async () => JSON.stringify(body),
        stdout: (value) => out.push(value),
        stderr: (value) => err.push(value),
      },
    );
    expect(out).toHaveLength(1);
    expect(out.join('') + err.join('')).not.toContain(token);
    expect(out.join('') + err.join('')).not.toContain('private-credential');
    return { code, value: JSON.parse(out[0]!) };
  };
  try {
    expect((await run('capability')).code).toBe(0);
    expect((await run('register', { token, clientActivityId: 'native-id' })).code).toBe(0);
    expect(calls[1]).toEqual({
      path: '/botharness-device/activity/register',
      body: JSON.stringify({ token, clientActivityId: 'native-id' }),
    });
    expect((await run('stop', { clientActivityId: 'native-id' })).code).toBe(0);
    expect((await run('register')).code).toBe(1);
    revoked = true;
    expect((await run('capability')).value).toMatchObject({ error: { code: 'device-revoked' } });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it('runs activity commands through the real pinned encrypted carrier and preserves provider and revoked-device refusals', async () => {
  const database = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('activity-cli-noise-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(database, 'device-pairing'),
    hostName: 'Computer',
  });
  const hostKey = randomBytes(32),
    deviceKey = randomBytes(32);
  const publicKey = Buffer.from(noisePublicKey(deviceKey)).toString('hex');
  const offer = pairing.createOffer();
  pairing.requestKey({ offer: offer.offer, publicKey });
  expect(pairing.approveKey(offer.receipt, publicKey)).toBe(true);
  const paired = pairing.redeem({ offer: offer.offer, publicKey });
  if (!paired.ok) throw new Error('pairing');
  let configured = true;
  let plaintext = 0;
  let upgraded = 0;
  const calls: { path: string | undefined; body: string }[] = [];
  const upstream = createServer(async (request, response) => {
    expect(request.headers.authorization).toBe(`Device ${paired.credential}`);
    let body = '';
    for await (const chunk of request) body += String(chunk);
    calls.push({ path: request.url, body });
    response.writeHead(configured ? 200 : 503, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify(configured ? { available: true } : { code: 'activity-provider-unconfigured' }),
    );
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamAddress = upstream.address();
  if (!upstreamAddress || typeof upstreamAddress === 'string') throw new Error('address');
  const gateway = createEncryptedGateway({
    pairing,
    key: async () => Uint8Array.from(hostKey),
    port: () => upstreamAddress.port,
  });
  const entry = createServer((_request, response) => {
    plaintext++;
    response.writeHead(404).end();
  });
  entry.on('upgrade', (request, socket, head) => {
    upgraded++;
    gateway.upgrade(request, socket, head);
  });
  await new Promise<void>((resolve) => entry.listen(0, '127.0.0.1', resolve));
  const entryAddress = entry.address();
  if (!entryAddress || typeof entryAddress === 'string') throw new Error('address');
  const file = join(createTempRoot('activity-cli-noise-pair-'), 'pairing.json');
  writeFileSync(
    file,
    JSON.stringify(
      serializeSavedHost({
        hostId: pairing.host().id,
        hostName: 'Computer',
        deviceId: paired.device.id,
        credential: paired.credential,
        routes: [`http://127.0.0.1:${entryAddress.port}`],
        encryption: {
          protocol: 'connect-noise-xk-v1',
          loopback: 'encrypted',
          hostKey: Buffer.from(noisePublicKey(hostKey)).toString('hex'),
          deviceKey: deviceKey.toString('hex'),
        },
      }),
    ),
    { mode: 0o600 },
  );
  const token = 'c'.repeat(64);
  const run = async (operation: string, body?: unknown) => {
    const out: string[] = [],
      err: string[] = [];
    const code = await runBotCreateCli(
      ['device-activity', operation, '--device-file', file, ...(body ? ['--activity-stdin'] : [])],
      {
        env: {},
        readStdin: async () => JSON.stringify(body),
        stdout: (value) => out.push(value),
        stderr: (value) => err.push(value),
      },
    );
    expect(out).toHaveLength(1);
    const printed = out.join('') + err.join('');
    for (const secret of [token, paired.credential, deviceKey.toString('hex')])
      expect(printed).not.toContain(secret);
    return { code, value: JSON.parse(out[0]!) };
  };
  try {
    expect((await run('capability')).code).toBe(0);
    expect((await run('register', { token, clientActivityId: 'native' })).code).toBe(0);
    expect(calls[1]).toEqual({
      path: '/botharness-device/activity/register',
      body: JSON.stringify({ token, clientActivityId: 'native' }),
    });
    expect((await run('stop', { clientActivityId: 'native' })).code).toBe(0);
    configured = false;
    expect((await run('capability')).value).toMatchObject({
      error: { code: 'activity-provider-unconfigured' },
    });
    pairing.revoke(paired.device.id);
    expect((await run('capability')).value).toMatchObject({ error: { code: 'device-revoked' } });
    expect(upgraded).toBe(5);
    expect(plaintext).toBe(0);
  } finally {
    gateway.close();
    entry.closeAllConnections();
    upstream.closeAllConnections();
    await Promise.all([
      new Promise<void>((resolve) => entry.close(() => resolve())),
      new Promise<void>((resolve) => upstream.close(() => resolve())),
    ]);
  }
});
