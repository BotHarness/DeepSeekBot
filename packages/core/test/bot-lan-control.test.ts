import { expect, it } from 'vitest';
import { createLanBotControl } from '../src/devices/bot-lan-control.js';
import { createLanBotMembership } from '../src/devices/bot-lan-membership.js';
import { createDevicesHttp } from '../src/devices/http.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { runDevicesCommand } from '../src/bots/cli-devices.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

it('admits and revokes the exact discovered Host through the same operator HTTP and CLI owner', async () => {
  const database = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('lan-control-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const remote = {
    hostId: 'studio',
    publicKey: '22'.repeat(32),
    name: 'Studio',
    origin: 'http://192.168.1.7:17002',
  };
  const membership = createLanBotMembership({
    database: attachOperationalModule(database, 'bot-lan'),
    candidate: (id) => (id === remote.hostId ? remote : undefined),
  });
  const control = createLanBotControl({
    membership,
    candidates: () => [remote],
    state: () => 'listening',
    identity: async () => ({ hostId: 'local', publicKey: '11'.repeat(32), name: 'Local' }),
    changed: async () => {},
  });
  const http = createDevicesHttp({
    pairing: createDevicePairing({
      database: attachOperationalModule(database, 'device-pairing'),
      hostName: 'Local',
    }),
    routes: async () => ({ routes: [], tailscale: 'missing', serveCommand: '' }),
    lanBots: control,
  });
  const connect = async () => ({
    http: async (path: string, body?: Record<string, unknown>) => {
      const response = await http(
        new Request(
          `http://localhost${path}`,
          body ? { method: 'POST', body: JSON.stringify(body) } : {},
        ),
      );
      return { bytes: new Uint8Array(await response.arrayBuffer()) };
    },
  });
  try {
    expect(await runDevicesCommand('bot-lan', ['list'], {}, connect)).toMatchObject({
      peers: [{ hostId: 'studio', discovered: true, admitted: false }],
    });
    await expect(
      runDevicesCommand('bot-lan', ['admit', 'studio', remote.publicKey], {}, connect),
    ).rejects.toThrow('confirm');
    const unconfirmed = await http(
      new Request('http://localhost/api/botharness/devices/lan-bots', {
        method: 'POST',
        body: JSON.stringify({ action: 'admit', hostId: 'studio', publicKey: remote.publicKey }),
      }),
    );
    expect(unconfirmed.status).toBe(400);
    expect(membership.current('studio', remote.publicKey)).toBeUndefined();
    expect(
      await runDevicesCommand(
        'bot-lan',
        ['admit', 'studio', '33'.repeat(32)],
        { confirm: true },
        connect,
      ),
    ).toMatchObject({ code: 'network-identity-changed' });
    expect(
      await runDevicesCommand(
        'bot-lan',
        ['admit', 'studio', remote.publicKey],
        { confirm: true },
        connect,
      ),
    ).toMatchObject({ peers: [{ admitted: true }] });
    expect(membership.current('studio', remote.publicKey)).toBeDefined();
    const approvedKey = remote.publicKey;
    remote.publicKey = '44'.repeat(32);
    expect(await control.snapshot()).toMatchObject({
      peers: [{ admitted: false, identityChanged: true, approval: { publicKey: approvedKey } }],
    });
    expect(
      await runDevicesCommand('bot-lan', ['revoke', 'studio'], { confirm: true }, connect),
    ).toMatchObject({ peers: [{ admitted: false }] });
    expect(membership.current('studio', remote.publicKey)).toBeUndefined();
  } finally {
    database.close();
  }
});
