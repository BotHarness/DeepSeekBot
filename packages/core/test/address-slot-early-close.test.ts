import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Duplex } from 'node:stream';
import { CONNECT_CHANNEL_PATH } from '@botharness/host-protocol/noise/channel';
import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { ADDRESS_PENDING_LIMIT } from '../src/devices/address-slots.js';
import { createEncryptedGateway } from '../src/devices/encrypted-gateway.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { addressRouteHeader, DEVICE_ROUTE_HEADER } from '../src/devices/route-context.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

function addressRequest(): IncomingMessage {
  const tag = addressRouteHeader().slice(`${DEVICE_ROUTE_HEADER}: `.length);
  return {
    method: 'GET',
    url: CONNECT_CHANNEL_PATH,
    headers: { [DEVICE_ROUTE_HEADER]: tag },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;
}

function recordingSocket() {
  let written = '';
  const socket = new Duplex({
    read() {},
    write(chunk: Buffer, _encoding, done) {
      written += chunk.toString();
      done();
    },
  });
  return { socket, written: () => written };
}

it('never holds an address slot for a socket that closed before or during the upgrade', async () => {
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('address-slot-early-close-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: 'studio',
  });
  let destroyDuringKey: Duplex | undefined;
  const gateway = createEncryptedGateway({
    pairing,
    key: async () => {
      destroyDuringKey?.destroy();
      return Uint8Array.from(randomBytes(32));
    },
    port: () => 0,
  });
  for (let index = 0; index < ADDRESS_PENDING_LIMIT; index++) {
    const closed = recordingSocket().socket;
    closed.destroy();
    await new Promise((resolve) => closed.once('close', resolve));
    await gateway.upgrade(addressRequest(), closed, Buffer.alloc(0));
  }
  for (let index = 0; index < ADDRESS_PENDING_LIMIT; index++) {
    destroyDuringKey = recordingSocket().socket;
    await gateway.upgrade(addressRequest(), destroyDuringKey, Buffer.alloc(0));
  }
  destroyDuringKey = undefined;
  const live = recordingSocket();
  await gateway.upgrade(addressRequest(), live.socket, Buffer.alloc(0));
  expect(live.written()).not.toContain('503');
  gateway.close();
});
