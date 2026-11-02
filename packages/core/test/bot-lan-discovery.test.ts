import { expect, it, vi } from 'vitest';
import { createLanBotDiscovery } from '../src/devices/bot-lan-discovery.js';
import { createLanBotMembership } from '../src/devices/bot-lan-membership.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

it('closes a socket that finishes opening after its listener was stopped', async () => {
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const send = vi.fn();
  const close = vi.fn();
  let opened = () => {};
  const opening = new Promise<void>((resolve) => {
    opened = resolve;
  });
  const discovery = createLanBotDiscovery({
    identity: async () => ({ hostId: 'local', publicKey: '11'.repeat(32), name: 'Local' }),
    open: async () => {
      opened();
      await pending;
      return { send, close };
    },
  });
  const starting = discovery.start(17001);
  await opening;
  discovery.close();
  release();
  await starting;
  expect(discovery.status()).toBe('off');
  expect(discovery.candidates()).toEqual([]);
  expect(send).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(1);
  await discovery.start(17001);
  discovery.close();
  expect(close).toHaveBeenCalledTimes(1);
});

it('clears discovered Hosts and stops advertising after a socket failure', async () => {
  vi.useFakeTimers();
  let fail = () => {};
  let receive: (packet: Uint8Array, address: string) => void = () => {};
  const close = vi.fn();
  const send = vi.fn();
  const record = vi.fn();
  const discovery = createLanBotDiscovery({
    identity: async () => ({ hostId: 'local', publicKey: '11'.repeat(32), name: 'Local' }),
    record,
    open: async (incoming, failed) => {
      receive = incoming;
      fail = failed;
      return { send, close };
    },
  });
  try {
    await discovery.start(17001);
    const packet = Buffer.from(
      JSON.stringify({
        protocol: 'botharness-lan-bots-v1',
        hostId: 'peer',
        publicKey: '22'.repeat(32),
        name: 'Peer',
        port: 17002,
      }),
    );
    receive(packet, '192.168.1.7');
    expect(discovery.candidates()).toHaveLength(1);
    fail();
    fail();
    receive(packet, '192.168.1.7');
    await vi.advanceTimersByTimeAsync(40_000);
    expect(discovery.status()).toBe('error');
    expect(discovery.candidates()).toEqual([]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(
      record.mock.calls.filter(([event]) => event.phase === 'lan-discovery-failed'),
    ).toHaveLength(1);
  } finally {
    discovery.close();
    vi.useRealTimers();
  }
});

it('discovers only bounded nearby Host metadata, requires explicit admission, and expires candidates', async () => {
  let now = 0;
  let receive: (packet: Uint8Array, address: string) => void = () => {};
  const announcements: string[] = [];
  let closed = false;
  const discovery = createLanBotDiscovery({
    identity: async () => ({ hostId: 'local', publicKey: '11'.repeat(32), name: 'Local' }),
    now: () => now,
    open: async (incoming) => {
      receive = incoming;
      return {
        send: (packet) => announcements.push(Buffer.from(packet).toString()),
        close: () => {
          closed = true;
        },
      };
    },
  });
  const database = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('lan-discovery-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const membership = createLanBotMembership({
    database: attachOperationalModule(database, 'bot-lan'),
    candidate: (id) => discovery.candidates().find((peer) => peer.hostId === id),
  });
  try {
    expect(discovery.candidates()).toEqual([]);
    await discovery.start(17001);
    expect(JSON.parse(announcements[0]!)).toEqual({
      protocol: 'botharness-lan-bots-v1',
      hostId: 'local',
      publicKey: '11'.repeat(32),
      name: 'Local',
      port: 17001,
    });
    const remote = {
      protocol: 'botharness-lan-bots-v1',
      hostId: 'studio',
      publicKey: '22'.repeat(32),
      name: 'Studio',
      port: 17002,
    };
    const packet = Buffer.from(JSON.stringify(remote));
    receive(packet, '203.0.113.4');
    expect(discovery.candidates()).toEqual([]);
    receive(packet, '192.168.1.7');
    expect(discovery.candidates()).toEqual([
      {
        hostId: 'studio',
        publicKey: remote.publicKey,
        name: 'Studio',
        origin: 'http://192.168.1.7:17002',
      },
    ]);
    expect(membership.current('studio', remote.publicKey)).toBeUndefined();
    membership.admit(remote);
    expect(membership.current('studio', remote.publicKey)).toBeDefined();
    receive(Buffer.from(JSON.stringify({ ...remote, publicKey: '33'.repeat(32) })), '192.168.1.8');
    expect(discovery.candidates()).toEqual([]);
    now = 31_000;
    expect(discovery.candidates()).toEqual([]);
    receive(packet, '192.168.1.7');
    expect(discovery.candidates()).toHaveLength(1);
    discovery.close();
    expect(closed).toBe(true);
    receive(packet, '192.168.1.7');
    expect(discovery.candidates()).toEqual([]);
  } finally {
    discovery.close();
    database.close();
  }
});
