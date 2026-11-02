import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { ConnectChannel } from '../src/devices/noise/channel.js';
import { noisePublicKey } from '../src/devices/noise/xk.js';

function pair() {
  const hostKey = randomBytes(32);
  const deviceKey = randomBytes(32);
  const a = new ConnectChannel({
    role: 'initiator',
    hostId: 'host',
    staticKey: deviceKey,
    ephemeralKey: randomBytes(32),
    hostKey: noisePublicKey(hostKey),
  });
  const b = new ConnectChannel({
    role: 'responder',
    hostId: 'host',
    staticKey: hostKey,
    ephemeralKey: randomBytes(32),
    hostKey: noisePublicKey(hostKey),
  });
  const one = a.start();
  const two = b.receive(one).reply!;
  const three = a.receive(two).reply!;
  b.receive(three);
  return { a, b };
}

describe('Connect encrypted wire', () => {
  it('carries a chunked message and closes permanently on a repeated frame', () => {
    const { a, b } = pair();
    const message = JSON.stringify({ secret: 'sentinel-secret', image: 'x'.repeat(200_000) });
    const frames = a.send(message);
    expect(frames.length).toBeGreaterThan(1);
    expect(frames.join('')).not.toContain('sentinel-secret');
    const messages = frames.flatMap((frame) => b.receive(frame).message ?? []);
    expect(messages).toEqual([message]);
    expect(() => b.receive(frames[0]!)).toThrow();
    expect(() => b.send('anything')).toThrow();
  });
});

it.each(['truncate', 'ciphertext', 'direction', 'counter', 'length', 'oversize'] as const)(
  'closes on %s and cannot resume the session',
  (fault) => {
    const { a, b } = pair();
    let frame = a.send('sensitive')[0]!;
    if (fault === 'truncate') frame = frame.slice(0, -2);
    if (fault === 'ciphertext') frame = frame.slice(0, -2) + (frame.endsWith('00') ? '01' : '00');
    if (fault === 'direction') frame = frame.slice(0, 5) + '01' + frame.slice(7);
    if (fault === 'counter') frame = frame.slice(0, 7) + '01' + frame.slice(9);
    if (fault === 'length') frame = frame.slice(0, 23) + 'ff' + frame.slice(25);
    if (fault === 'oversize') frame = 'd' + '00'.repeat(70_000);
    expect(() => b.receive(frame)).toThrow();
    expect(() => b.receive(a.send('retry')[0]!)).toThrow();
    a.close();
    b.close();
  },
);

it('rejects ciphertext copied from a different session', () => {
  const first = pair(),
    second = pair();
  expect(() => second.b.receive(first.a.send('private')[0]!)).toThrow();
  first.a.close();
  first.b.close();
  second.a.close();
  second.b.close();
});

it('does not accept application messages before handshake completion or a substituted Host pin', () => {
  const hostKey = randomBytes(32);
  const a = new ConnectChannel({
    role: 'initiator',
    hostId: 'host',
    staticKey: randomBytes(32),
    ephemeralKey: randomBytes(32),
    hostKey: noisePublicKey(randomBytes(32)),
  });
  const b = new ConnectChannel({
    role: 'responder',
    hostId: 'host',
    staticKey: hostKey,
    ephemeralKey: randomBytes(32),
    hostKey: noisePublicKey(hostKey),
  });
  expect(() => b.receive(a.start())).toThrow();
  const early = new ConnectChannel({
    role: 'initiator',
    hostId: 'host',
    staticKey: randomBytes(32),
    ephemeralKey: randomBytes(32),
    hostKey: noisePublicKey(hostKey),
  });
  expect(() => early.send('secret')).toThrow();
  a.close();
  b.close();
  early.close();
});

it('rejects a handshake from a different Host identity and nonempty early payloads', () => {
  const hostKey = randomBytes(32);
  const fresh = (hostId: string, role: 'initiator' | 'responder') =>
    new ConnectChannel({
      role,
      hostId,
      staticKey: role === 'responder' ? hostKey : randomBytes(32),
      ephemeralKey: randomBytes(32),
      hostKey: noisePublicKey(hostKey),
    });
  const wrong = fresh('other-host', 'initiator'),
    host = fresh('host', 'responder');
  expect(() => host.receive(wrong.start())).toThrow();
  wrong.close();
  host.close();
  const empty = fresh('host', 'initiator'),
    target = fresh('host', 'responder');
  expect(() => target.receive(empty.start() + '00')).toThrow();
  empty.close();
  target.close();
  const lowOrder = fresh('host', 'responder');
  expect(() => lowOrder.receive('h' + '00'.repeat(48))).toThrow();
  lowOrder.close();
});
