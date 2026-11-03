import { expect, it } from 'vitest';
import { x25519 } from '@noble/curves/ed25519.js';
import { NoiseXk } from '../../../packages/core/src/devices/noise/xk';
import vector from '../../../packages/core/test/fixtures/noise/xk-cacophony.json';
import { noiseKeyAgreement as android } from '../src/host/noise-key-agreement.android';
import { noiseKeyAgreement as fallback } from '../src/host/noise-key-agreement';

const bytes = (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex'));
const hex = (value: Uint8Array) => Buffer.from(value).toString('hex');

it('leaves non-Android clients on the existing backend', () => {
  expect(fallback).toBeUndefined();
});

it.each([
  { initiator: true, responder: false },
  { initiator: false, responder: true },
  { initiator: true, responder: true },
])('matches independent Noise vectors with Android peers $initiator/$responder', (native) => {
  const initiator = new NoiseXk({
    role: 'initiator',
    staticKey: bytes(vector.init_static),
    ephemeralKey: bytes(vector.init_ephemeral),
    remoteStatic: bytes(vector.init_remote_static),
    prologue: bytes(vector.init_prologue),
    ...(native.initiator ? { keyAgreement: android } : {}),
  });
  const responder = new NoiseXk({
    role: 'responder',
    staticKey: bytes(vector.resp_static),
    ephemeralKey: bytes(vector.resp_ephemeral),
    prologue: bytes(vector.resp_prologue),
    ...(native.responder ? { keyAgreement: android } : {}),
  });
  for (const [index, message] of vector.messages.slice(0, 3).entries()) {
    const sender = index % 2 === 0 ? initiator : responder;
    const receiver = index % 2 === 0 ? responder : initiator;
    expect(hex(sender.write(bytes(message.payload)))).toBe(message.ciphertext);
    expect(hex(receiver.read(bytes(message.ciphertext)))).toBe(message.payload);
  }
  expect(hex(initiator.handshakeHash())).toBe(vector.handshake_hash);
  expect(hex(responder.handshakeHash())).toBe(vector.handshake_hash);
  const a = initiator.split();
  const b = responder.split();
  for (const [index, message] of vector.messages.slice(3).entries()) {
    const sender = index % 2 === 0 ? b : a;
    const receiver = index % 2 === 0 ? a : b;
    expect(hex(sender.encrypt(bytes(message.payload)))).toBe(message.ciphertext);
    expect(hex(receiver.decrypt(bytes(message.ciphertext)))).toBe(message.payload);
  }
  a.close();
  b.close();
  expect(() => a.encrypt(new Uint8Array())).toThrow();
  expect(() => b.decrypt(new Uint8Array(16))).toThrow();
});

it('preserves public/shared keys and inputs, including high-bit masked public keys', () => {
  for (let seed = 0; seed < 64; seed++) {
    const key = Uint8Array.from({ length: 32 }, (_, i) => (seed * 73 + i * 19) % 256);
    const other = Uint8Array.from({ length: 32 }, (_, i) => (seed * 17 + i * 29) % 256);
    const peer = x25519.getPublicKey(other);
    if (seed % 2) peer[31] = peer[31]! | 128;
    const originalKey = key.slice();
    const originalPeer = peer.slice();
    expect(android.publicKey(key)).toEqual(x25519.getPublicKey(key));
    expect(android.sharedSecret(key, peer)).toEqual(x25519.getSharedSecret(key, peer));
    expect(key).toEqual(originalKey);
    expect(peer).toEqual(originalPeer);
  }
});

const prime = (1n << 255n) - 19n;
it.each([0n, 1n, prime - 1n, prime, prime + 1n])(
  'rejects low-order peer %s and closes',
  (point) => {
    const peer = Uint8Array.from({ length: 32 }, (_, i) => Number((point >> BigInt(i * 8)) & 255n));
    const key = new Uint8Array(32).fill(11);
    expect(() => x25519.getSharedSecret(key, peer)).toThrow();
    expect(() => android.sharedSecret(key, peer)).toThrow();
    const noise = new NoiseXk({
      role: 'initiator',
      staticKey: key,
      ephemeralKey: key.slice(),
      remoteStatic: peer,
      prologue: new Uint8Array(),
      keyAgreement: android,
    });
    expect(() => noise.write()).toThrow();
    expect(() => noise.write()).toThrow('noise-state-invalid');
    expect(() => noise.split()).toThrow();
  },
);

it.each([0, 31, 33])('rejects invalid %i-byte public or private keys', (length) => {
  const invalid = new Uint8Array(length);
  const valid = new Uint8Array(32).fill(9);
  expect(() => android.publicKey(invalid)).toThrow();
  expect(() => android.sharedSecret(invalid, valid)).toThrow();
  expect(() => android.sharedSecret(valid, invalid)).toThrow();
});
