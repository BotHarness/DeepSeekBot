import { describe, expect, it } from 'vitest';
import vector from './fixtures/noise/xk-cacophony.json';
import { NoiseXk } from '../src/devices/noise/xk.js';

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
