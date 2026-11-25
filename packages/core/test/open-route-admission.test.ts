import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ConnectChannel } from '@botharness/host-protocol/noise/channel';
import { noisePublicKey } from '@botharness/host-protocol/noise/xk';
import { expect, it, onTestFinished } from 'vitest';
import { WebSocket } from 'ws';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { OPEN_ROUTE_PENDING_LIMIT } from '../src/devices/admission-slots.js';
import { createEncryptedGateway } from '../src/devices/encrypted-gateway.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { stampConnectRoute } from '../src/devices/route-context.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

async function connectHost(admissionDeadlineMs?: number) {
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('open-route-admission-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: 'Computer',
  });
  const hostKey = randomBytes(32);
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const gateway = createEncryptedGateway({
    pairing,
    key: async () => Uint8Array.from(hostKey),
    port: () => port,
    relationship: async () => ({ ok: true }),
    ...(admissionDeadlineMs === undefined ? {} : { admissionDeadlineMs }),
  });
  server.on('upgrade', (request, socket, head) => {
    if (request.headers['x-test-route'] === 'connect') stampConnectRoute(request);
    void gateway.upgrade(request, socket, head);
  });
  const sockets: WebSocket[] = [];
  onTestFinished(async () => {
    for (const ws of sockets) ws.terminate();
    gateway.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const open = (route: 'connect' | 'token') => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/botharness-device/channel`, {
      headers: route === 'connect' ? { 'x-test-route': 'connect' } : {},
    });
    sockets.push(ws);
    const opened = new Promise<boolean>((resolve) => {
      ws.once('open', () => resolve(true));
      ws.once('unexpected-response', () => resolve(false));
      ws.once('error', () => resolve(false));
    });
    return { ws, opened };
  };
  const secured = async () => {
    const channel = new ConnectChannel({
      role: 'initiator',
      route: 'connect',
      hostId: pairing.host().id,
      staticKey: randomBytes(32),
      ephemeralKey: randomBytes(32),
      hostKey: noisePublicKey(hostKey),
    });
    const peer = open('connect');
    let ready!: () => void;
    const done = new Promise<void>((resolve) => {
      ready = resolve;
    });
    peer.ws.on('message', (data) => {
      const result = channel.receive(data.toString());
      if (result.reply) peer.ws.send(result.reply);
      if (result.ready) ready();
    });
    expect(await peer.opened).toBe(true);
    peer.ws.send(channel.start());
    await done;
    const send = (value: unknown) => {
      for (const frame of channel.send(JSON.stringify(value))) peer.ws.send(frame);
    };
    return { ws: peer.ws, send };
  };
  return { open, secured };
}

it('caps Connect channels that have not admitted a device without limiting other routes', async () => {
  const { open } = await connectHost();
  const pending = Array.from({ length: OPEN_ROUTE_PENDING_LIMIT }, () => open('connect'));
  expect(await Promise.all(pending.map((entry) => entry.opened))).toEqual(pending.map(() => true));
  expect(await open('connect').opened).toBe(false);
  expect(await open('token').opened).toBe(true);
  const freed = once(pending[0]!.ws, 'close');
  pending[0]!.ws.close();
  await freed;
  await expect.poll(async () => open('connect').opened, { timeout: 2_000 }).toBe(true);
});

it('closes a Connect channel kept alive by messages that never admits a device', async () => {
  const { secured } = await connectHost(300);
  const peer = await secured();
  const closed = once(peer.ws, 'close');
  const keepAlive = setInterval(() => peer.send({ type: 'relationship', command: {} }), 50);
  onTestFinished(() => clearInterval(keepAlive));
  await closed;
});
