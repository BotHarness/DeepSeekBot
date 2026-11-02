import { describe, expect, it } from 'vitest';
import vector from './fixtures/noise/xk-cacophony.json';
import { NoiseXk } from '../src/devices/noise/xk.js';
import { noisePublicKey } from '../src/devices/noise/xk.js';
import { ConnectChannel } from '../src/devices/noise/channel.js';
import { randomBytes } from 'node:crypto';

it('refuses a Connect handshake replayed at the LAN entry', () => {
  const key = randomBytes(32);
  const hostKey = noisePublicKey(key);
  const phone = new ConnectChannel({
    role: 'initiator',
    hostId: 'host',
    staticKey: randomBytes(32),
    ephemeralKey: randomBytes(32),
    hostKey,
    route: 'connect',
  });
  const host = new ConnectChannel({
    role: 'responder',
    hostId: 'host',
    staticKey: key,
    ephemeralKey: randomBytes(32),
    hostKey,
    route: 'lan',
  });
  try {
    expect(() => host.receive(phone.start())).toThrow();
  } finally {
    phone.close();
    host.close();
  }
});

const bytes = (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex'));
const hex = (value: Uint8Array) => Buffer.from(value).toString('hex');

describe('Connect Noise XK public protocol', () => {
  it('matches both handshake peers and transport against the independent Cacophony vector', () => {
    const initiator = new NoiseXk({
      role: 'initiator',
      staticKey: bytes(vector.init_static),
      ephemeralKey: bytes(vector.init_ephemeral),
      remoteStatic: bytes(vector.init_remote_static),
      prologue: bytes(vector.init_prologue),
    });
    const responder = new NoiseXk({
      role: 'responder',
      staticKey: bytes(vector.resp_static),
      ephemeralKey: bytes(vector.resp_ephemeral),
      prologue: bytes(vector.resp_prologue),
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
  });
});
