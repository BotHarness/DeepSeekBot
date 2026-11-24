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
import { createEncryptedGateway } from '../src/devices/encrypted-gateway.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { upgradeListener } from './async-listener.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

it.each(['connect', 'lan'] as const)(
  'keeps one %s channel waiting on each pairing code',
  async (route) => {
    const owner = trackTestOwner(
      mountOperationalDatabase({
        dshHome: createTempRoot('pending-pair-hold-'),
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      }),
    );
    const pairing = createDevicePairing({
      database: attachOperationalModule(owner, 'device-pairing'),
      hostName: 'Computer',
    });
    const hostKey = randomBytes(32),
      deviceKey = randomBytes(32);
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const gateway = createEncryptedGateway({
      pairing,
      route,
      key: async () => Uint8Array.from(hostKey),
      port: () => port,
    });
    server.on('upgrade', upgradeListener(gateway));
    const offer = pairing.createOffer();
    const sockets: WebSocket[] = [];
    onTestFinished(async () => {
      for (const ws of sockets) ws.terminate();
      gateway.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    const peer = async () => {
      const channel = new ConnectChannel({
        role: 'initiator',
        route,
        hostId: pairing.host().id,
        staticKey: deviceKey,
        ephemeralKey: randomBytes(32),
        hostKey: noisePublicKey(hostKey),
      });
      const ws = new WebSocket(`ws://127.0.0.1:${port}/botharness-device/channel`);
      sockets.push(ws);
      const answers: Record<string, unknown>[] = [];
      const waiters: ((value: Record<string, unknown>) => void)[] = [];
      let secured!: () => void;
      const ready = new Promise<void>((resolve) => {
        secured = resolve;
      });
      ws.on('message', (data) => {
        const result = channel.receive(data.toString());
        if (result.reply) ws.send(result.reply);
        if (result.ready) secured();
        if (result.message) {
          const value = JSON.parse(result.message) as Record<string, unknown>;
          const waiter = waiters.shift();
          if (waiter) waiter(value);
          else answers.push(value);
        }
      });
      await once(ws, 'open');
      ws.send(channel.start());
      await ready;
      const next = () =>
        answers.length
          ? Promise.resolve(answers.shift()!)
          : new Promise<Record<string, unknown>>((resolve) => waiters.push(resolve));
      const pair = async () => {
        for (const frame of channel.send(JSON.stringify({ type: 'pair', offer: offer.offer })))
          ws.send(frame);
        expect(await next()).toEqual({ type: 'pair-pending', receipt: offer.receipt });
      };
      await pair();
      return { ws, next, pair };
    };
    const waiting = [await peer()];
    for (let index = 0; index < 3; index++) {
      const replaced = once(waiting.at(-1)!.ws, 'close');
      waiting.push(await peer());
      await replaced;
    }
    const latest = waiting.at(-1)!;
    await latest.pair();
    expect(latest.ws.readyState).toBe(WebSocket.OPEN);
    pairing.approveKey(offer.receipt, Buffer.from(noisePublicKey(deviceKey)).toString('hex'));
    expect(await latest.next()).toMatchObject({ type: 'paired' });
  },
);
