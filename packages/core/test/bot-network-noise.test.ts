import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import { noisePublicKey } from '../src/devices/noise/xk.js';
import {
  botNetworkHandshake,
  finishBotHandshake,
  encodeBotPayload,
  decodeBotPayload,
} from '../src/devices/bot-network-noise.js';

it('proves both Host keys and protects the accepted acknowledgement with the existing Noise transport', async () => {
  const left = randomBytes(32);
  const right = randomBytes(32);
  const publicKey = (key: Uint8Array) => Buffer.from(noisePublicKey(key)).toString('hex');
  const common = { senderHost: 'left', receiverHost: 'right' };
  const initiator = await botNetworkHandshake({
    ...common,
    role: 'initiator',
    key: async () => Uint8Array.from(left),
    remotePublicKey: publicKey(right),
  });
  const responder = await botNetworkHandshake({
    ...common,
    role: 'responder',
    key: async () => Uint8Array.from(right),
  });
  responder.read(initiator.write());
  initiator.read(responder.write());
  responder.read(initiator.write());
  const sending = finishBotHandshake(initiator, publicKey(right));
  const receiving = finishBotHandshake(responder, publicKey(left));
  try {
    const message = { id: 'one', body: '\u0000'.repeat(20_000) };
    expect(decodeBotPayload(receiving, encodeBotPayload(sending, message))).toEqual(message);
    const ack = encodeBotPayload(receiving, { accepted: 'one' });
    expect(decodeBotPayload(sending, ack)).toEqual({ accepted: 'one' });
    expect(() => decodeBotPayload(sending, ack)).toThrow();
  } finally {
    sending.close();
    receiving.close();
  }
});

it('refuses another process claiming the advertised sender Host key', async () => {
  const claimed = randomBytes(32);
  const impostor = randomBytes(32);
  const right = randomBytes(32);
  const publicKey = (key: Uint8Array) => Buffer.from(noisePublicKey(key)).toString('hex');
  const common = { senderHost: 'left', receiverHost: 'right' };
  const initiator = await botNetworkHandshake({
    ...common,
    role: 'initiator',
    key: async () => Uint8Array.from(impostor),
    remotePublicKey: publicKey(right),
  });
  const responder = await botNetworkHandshake({
    ...common,
    role: 'responder',
    key: async () => Uint8Array.from(right),
  });
  try {
    responder.read(initiator.write());
    initiator.read(responder.write());
    responder.read(initiator.write());
    expect(() => finishBotHandshake(responder, publicKey(claimed))).toThrow(
      'network-host-key-mismatch',
    );
  } finally {
    initiator.close();
    responder.close();
  }
});
