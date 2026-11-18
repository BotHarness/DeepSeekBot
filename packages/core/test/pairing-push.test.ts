import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { expect, it, vi } from 'vitest';
import { ConnectChannel } from '@botharness/host-protocol/noise/channel';
import { noisePublicKey } from '@botharness/host-protocol/noise/xk';
import { createEncryptedGateway } from '../src/devices/encrypted-gateway.js';
import {
  createDevicePairing,
  PAIRING_OFFER_TTL_MS,
  type DevicePairingOptions,
} from '../src/devices/pairing.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
import { upgradeListener } from './async-listener.js';

async function fixture(
  route: 'lan' | 'connect' = 'connect',
  members?: DevicePairingOptions['members'],
) {
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('pairing-push-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  let clock = Date.now();
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: 'Computer',
    now: () => clock,
    ...(members ? { members } : {}),
  });
  const hostKey = randomBytes(32),
    deviceKey = randomBytes(32);
  const publicKey = Buffer.from(noisePublicKey(deviceKey)).toString('hex');
  const offer = pairing.createOffer();
  const watchKey = pairing.watchKey.bind(pairing);
  const redeemOffer = pairing.redeem.bind(pairing);
  const watch = vi.spyOn(pairing, 'watchKey');
  const redeem = vi.spyOn(pairing, 'redeem');
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing test address');
  const gateway = createEncryptedGateway({
    pairing,
    route,
    key: async () => hostKey,
    port: () => address.port,
  });
  server.on('upgrade', upgradeListener(gateway));
  const channel = new ConnectChannel({
    role: 'initiator',
    route,
    hostId: pairing.host().id,
    staticKey: deviceKey,
    ephemeralKey: randomBytes(32),
    hostKey: noisePublicKey(hostKey),
  });
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/botharness-device/channel`);
  const answers: Record<string, unknown>[] = [];
  const send = (message: unknown) => {
    for (const frame of channel.send(JSON.stringify(message))) socket.send(frame);
  };
  const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));
  let ready!: () => void;
  const secured = new Promise<void>((resolve) => {
    ready = resolve;
  });
  socket.on('message', (data) => {
    const result = channel.receive(data.toString());
    if (result.reply) socket.send(result.reply);
    if (result.ready) ready();
    if (result.message) answers.push(JSON.parse(result.message));
  });
  await new Promise<void>((resolve) => socket.once('open', resolve));
  socket.send(channel.start());
  await secured;
  return {
    pairing,
    publicKey,
    offer,
    watch,
    redeem,
    watchKey,
    redeemOffer,
    answers,
    send,
    socket,
    closed,
    advance: (ms: number) => {
      clock += ms;
    },
    next: async () => {
      await vi.waitFor(() => expect(answers.length).toBeGreaterThan(0));
      return answers.shift()!;
    },
    close: async () => {
      socket.terminate();
      gateway.close();
      channel.close();
      await closed;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

it.each(['lan', 'connect'] as const)(
  '%s pushes paired after one pair message with no resend',
  async (route) => {
    const f = await fixture(route);
    try {
      f.send({ type: 'pair', offer: f.offer.offer, name: 'Waiting phone' });
      expect(await f.next()).toEqual({ type: 'pair-pending', receipt: f.offer.receipt });
      expect(f.pairing.list()).toHaveLength(0);
      f.pairing.approveKey(f.offer.receipt, f.publicKey);
      const answer = await f.next();
      const result = f.redeem.mock.results.at(-1)?.value;
      if (!result?.ok) throw new Error('push did not redeem');
      expect(answer).toEqual({
        type: 'paired',
        host: result.host,
        deviceId: result.device.id,
        credential: result.credential,
      });
      expect(f.pairing.list()).toEqual([
        expect.objectContaining({ name: 'Waiting phone', publicKey: f.publicKey }),
      ]);
      expect(f.pairing.admitKey(`Device ${String(answer.credential)}`, f.publicKey).ok).toBe(true);
      expect(f.redeem).toHaveBeenCalledTimes(2);
    } finally {
      await f.close();
    }
  },
);

it('a resend racing the push does not mint a second device', async () => {
  const f = await fixture();
  try {
    const message = { type: 'pair', offer: f.offer.offer };
    f.send(message);
    expect(await f.next()).toMatchObject({ type: 'pair-pending' });
    f.pairing.approveKey(f.offer.receipt, f.publicKey);
    f.send(message);
    expect(await f.next()).toMatchObject({ type: 'paired' });
    expect(await f.next()).toEqual({ type: 'refused', code: 'offer-invalid' });
    await f.closed;
    expect(f.pairing.list()).toHaveLength(1);
    expect(f.redeem).toHaveBeenCalledTimes(2);
  } finally {
    await f.close();
  }
});

it.each(['superseded', 'refused', 'expired', 'redeemed'] as const)(
  'pushes refusal when a waiting offer is %s',
  async (state) => {
    const f = await fixture();
    try {
      const offer =
        state === 'refused' ? f.pairing.createOffer({ relationshipId: 'cancel-me' }) : f.offer;
      if (state === 'redeemed') {
        f.pairing.requestKey({ offer: offer.offer, publicKey: f.publicKey });
        f.pairing.watchKey(offer.receipt, f.publicKey, () => {
          f.pairing.redeem({ offer: offer.offer, publicKey: f.publicKey });
        });
      }
      f.send({ type: 'pair', offer: offer.offer });
      expect(await f.next()).toMatchObject({ type: 'pair-pending' });
      if (state === 'superseded') f.pairing.clearOffers();
      else if (state === 'refused') f.pairing.cancelRelationshipOffers('cancel-me', f.publicKey);
      else if (state === 'expired') {
        f.advance(PAIRING_OFFER_TTL_MS);
        f.pairing.pendingKeys();
      } else f.pairing.approveKey(offer.receipt, f.publicKey);
      expect(await f.next()).toEqual({
        type: 'refused',
        code: state === 'expired' ? 'offer-expired' : 'offer-invalid',
      });
      await f.closed;
      expect(f.pairing.list()).toHaveLength(state === 'redeemed' ? 1 : 0);
    } finally {
      await f.close();
    }
  },
);

it('replaces a watch on resend and unsubscribes before a closed channel can redeem', async () => {
  const f = await fixture();
  const unsubscribes: ReturnType<typeof vi.fn>[] = [];
  f.watch.mockImplementation((...args) => {
    const unsubscribe = vi.fn(f.watchKey(...args));
    unsubscribes.push(unsubscribe);
    return unsubscribe;
  });
  try {
    for (let i = 0; i < 3; i++) {
      f.send({ type: 'pair', offer: f.offer.offer });
      expect(await f.next()).toMatchObject({ type: 'pair-pending' });
    }
    expect(unsubscribes.map((stop) => stop.mock.calls.length)).toEqual([1, 1, 0]);
    f.socket.close();
    await f.closed;
    await vi.waitFor(() =>
      expect(unsubscribes.map((stop) => stop.mock.calls.length)).toEqual([1, 1, 1]),
    );
    expect(() => f.pairing.approveKey(f.offer.receipt, f.publicKey)).not.toThrow();
    f.watch.mock.calls.at(-1)?.[2]({ state: 'approved' });
    expect(f.pairing.list()).toHaveLength(0);
    expect(f.answers).toEqual([]);
    expect(f.redeem).toHaveBeenCalledTimes(3);
  } finally {
    await f.close();
  }
});

it('handles approval between the pending redemption and watch registration', async () => {
  const f = await fixture();
  f.redeem.mockImplementation((input) => {
    const result = f.redeemOffer(input);
    if (!result.ok && result.code === 'device-approval-required')
      f.pairing.approveKey(f.offer.receipt, f.publicKey);
    return result;
  });
  try {
    f.send({ type: 'pair', offer: f.offer.offer });
    expect(await f.next()).toMatchObject({ type: 'pair-pending' });
    expect(await f.next()).toMatchObject({ type: 'paired' });
    expect(f.pairing.list()).toHaveLength(1);
  } finally {
    await f.close();
  }
});

it('stops watching when the channel is admitted using an existing device', async () => {
  const f = await fixture();
  try {
    f.send({ type: 'pair', offer: f.offer.offer });
    expect(await f.next()).toMatchObject({ type: 'pair-pending' });
    const other = f.pairing.createOffer();
    f.pairing.requestKey({ offer: other.offer, publicKey: f.publicKey });
    f.pairing.approveKey(other.receipt, f.publicKey);
    const paired = f.pairing.redeem({ offer: other.offer, publicKey: f.publicKey });
    if (!paired.ok) throw new Error('fixture redemption failed');
    f.send({ type: 'admit', credential: paired.credential });
    expect(await f.next()).toEqual({ type: 'admitted' });
    f.pairing.approveKey(f.offer.receipt, f.publicKey);
    f.watch.mock.calls[0]?.[2]({ state: 'approved' });
    f.send({ type: 'ping' });
    expect(await f.next()).toEqual({ type: 'pong' });
    expect(f.pairing.list()).toHaveLength(1);
  } finally {
    await f.close();
  }
});

it('preserves member identity fields in the shared paired payload', async () => {
  const member = {
    deviceId: 'member-device',
    credential: 'member.credential',
    humanId: 'member-human',
    displayName: 'Member',
    mustChangePassword: true,
  };
  const f = await fixture('connect', {
    redeem: () => member,
    admit: () => undefined,
    refusal: () => 'sign-in-required',
    check: () => undefined,
    attach: () => () => {},
  });
  try {
    const offer = f.pairing.createOffer({ humanId: member.humanId });
    f.send({ type: 'pair', offer: offer.offer });
    expect(await f.next()).toEqual({ type: 'paired', host: f.pairing.host(), ...member });
    expect(f.watch).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});

it('does not register a watch after the pending response fails to send', async () => {
  const f = await fixture();
  const send = ConnectChannel.prototype.send;
  const fault = vi.spyOn(ConnectChannel.prototype, 'send').mockImplementation(function (
    this: ConnectChannel,
    text,
  ) {
    if (text.includes('"type":"pair-pending"')) throw new Error('test send failure');
    return send.call(this, text);
  });
  try {
    f.send({ type: 'pair', offer: f.offer.offer });
    await f.closed;
    expect(f.watch).not.toHaveBeenCalled();
    expect(() => f.pairing.approveKey(f.offer.receipt, f.publicKey)).not.toThrow();
    expect(f.pairing.list()).toHaveLength(0);
  } finally {
    await f.close();
    fault.mockRestore();
  }
});

it('closes a failed pushed redemption without throwing into the approval caller', async () => {
  const f = await fixture();
  try {
    f.send({ type: 'pair', offer: f.offer.offer });
    expect(await f.next()).toMatchObject({ type: 'pair-pending' });
    f.redeem.mockImplementationOnce(() => {
      throw new Error('test redemption failure');
    });
    expect(() => f.pairing.approveKey(f.offer.receipt, f.publicKey)).not.toThrow();
    await f.closed;
    expect(f.pairing.list()).toHaveLength(0);
    expect(f.answers).toEqual([]);
  } finally {
    await f.close();
  }
});
