import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { expect, it, vi } from 'vitest';
import { createEncryptedGateway } from '../src/devices/encrypted-gateway.js';
import { ConnectChannel } from '../src/devices/noise/channel.js';
import { noisePublicKey } from '../src/devices/noise/xk.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import {
  reviewEnrollmentPolicy,
  permitsReviewEnrollment,
} from '../src/devices/review-enrollment.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

it('requires all explicit policy fields and expires without a restart', () => {
  const env = {
    BOTHARNESS_REVIEW_ACCOUNT_ID: 'review',
    BOTHARNESS_REVIEW_HOST_ID: 'demo',
    BOTHARNESS_REVIEW_EXPIRES_AT: '2030-01-01T00:00:00Z',
  };
  const identity = { account: 'review', hostId: 'demo' };
  for (const key of Object.keys(env))
    expect(reviewEnrollmentPolicy({ ...env, [key]: '' })).toBeUndefined();
  expect(
    reviewEnrollmentPolicy({ ...env, BOTHARNESS_REVIEW_EXPIRES_AT: 'invalid' }),
  ).toBeUndefined();
  const policy = reviewEnrollmentPolicy(env);
  expect(permitsReviewEnrollment(policy, identity, Date.parse('2029-12-31T23:59:59Z'))).toBe(true);
  expect(permitsReviewEnrollment(policy, identity, Date.parse('2030-01-01T00:00:00Z'))).toBe(false);
});

it.each(['review', 'manual', 'wrong-verifier', 'unsigned', 'lan'] as const)(
  'encrypted fresh device enrollment: %s',
  async (mode) => {
    const owner = trackTestOwner(
      mountOperationalDatabase({
        dshHome: createTempRoot('review-enrollment-'),
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      }),
    );
    const pairing = createDevicePairing({
      database: attachOperationalModule(owner, 'device-pairing'),
      hostName: 'Demo',
    });
    const hostKey = randomBytes(32),
      deviceKey = randomBytes(32);
    const verifier = 'review-verifier';
    const verifierHash = createHash('sha256').update(verifier).digest('base64url');
    const localOffer = pairing.createOffer();
    const verify = vi.fn(async () => ({
      ok: true as const,
      verifierHash,
      ...(mode === 'manual' ? {} : { reviewAutoApprove: true as const }),
    }));
    const log = vi.fn();
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const route = mode === 'lan' ? 'lan' : 'connect';
    const gateway = createEncryptedGateway({
      pairing,
      route,
      key: async () => Uint8Array.from(hostKey),
      port: () => port,
      verifyEnrollment: verify,
      log,
    });
    server.on('upgrade', (request, socket, head) => gateway.upgrade(request, socket, head));
    const channel = new ConnectChannel({
      role: 'initiator',
      route,
      hostId: pairing.host().id,
      staticKey: deviceKey,
      ephemeralKey: randomBytes(32),
      hostKey: noisePublicKey(hostKey),
    });
    const socket = new WebSocket(`ws://127.0.0.1:${port}/botharness-device/channel`);
    const answers: Record<string, unknown>[] = [];
    socket.on('message', (data) => {
      const result = channel.receive(data.toString());
      if (result.reply) socket.send(result.reply);
      if (result.ready)
        for (const frame of channel.send(
          JSON.stringify({
            type: 'pair',
            name: 'Fresh reviewer',
            verifier: mode === 'wrong-verifier' ? 'wrong' : verifier,
            ...(mode === 'unsigned'
              ? { offer: localOffer.offer, reviewAutoApprove: true }
              : { enrollment: { body: 'signed-body', signature: 'signed-proof' } }),
          }),
        ))
          socket.send(frame);
      if (result.message) answers.push(JSON.parse(result.message));
    });
    try {
      await new Promise<void>((resolve) => socket.once('open', resolve));
      socket.send(channel.start());
      await vi.waitFor(() => expect(answers.length).toBeGreaterThan(0));
      expect(answers[0]?.type).toBe(
        mode === 'review' ? 'paired' : mode === 'wrong-verifier' ? 'refused' : 'pair-pending',
      );
      expect(pairing.list()).toHaveLength(mode === 'review' ? 1 : 0);
      expect(log.mock.calls.some(([phase]) => phase === 'review-device-approved')).toBe(
        mode === 'review',
      );
      if (mode === 'unsigned') expect(verify).not.toHaveBeenCalled();
      else expect(verify).toHaveBeenCalledTimes(1);
    } finally {
      socket.terminate();
      gateway.close();
      channel.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
