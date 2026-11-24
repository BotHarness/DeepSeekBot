import { createHmac } from 'node:crypto';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import { describe, expect, it } from 'vitest';
import { createConnectAccount } from '../src/devices/connect-account.js';
import {
  RELAY,
  CLIENT,
  RELAY_KEY,
  deferred,
  memoryCredentials,
  fakeConnect,
  fakeServices,
  settle,
  setup,
} from './connect-account-fixtures.js';

describe('Connect account sign-in', () => {
  it('refuses newly started offer verification while sign-out is waiting for unlink', async () => {
    const services = fakeServices({ pending: 0 });
    const { account } = setup(services);
    await account.signIn();
    await settle(account);
    const gate = deferred();
    const original = services.fetcher.getMockImplementation()!;
    services.fetcher.mockImplementation(async (input, init) => {
      if (init?.method === 'DELETE') await gate.promise;
      return original(input, init);
    });
    const body = JSON.stringify({
      hostId: 'hstudioaaaaa',
      account: 'user_alice',
      verifierHash: Buffer.alloc(32, 3).toString('base64url'),
      issuedAt: new Date().toISOString(),
    });
    const signature = createHmac('sha256', RELAY_KEY).update(body).digest('base64url');
    const leaving = account.signOut();
    try {
      expect(await account.verifyOffer(body, signature)).toEqual({ ok: false });
    } finally {
      gate.resolve();
      await leaving;
      await account.close();
    }
  });

  it('accepts only fresh offers the relay signed for this Host and account', async () => {
    const { account } = setup(fakeServices({ pending: 0 }));
    const verifierHash = Buffer.alloc(32, 3).toString('base64url');
    const sign = (payload: Record<string, unknown>, key = RELAY_KEY) => {
      const body = JSON.stringify(payload);
      return { body, signature: createHmac('sha256', key).update(body).digest('base64url') };
    };
    const fresh = {
      hostId: 'hstudioaaaaa',
      account: 'user_alice',
      verifierHash,
      name: 'iPhone',
      issuedAt: new Date().toISOString(),
    };
    const unlinked = sign(fresh);
    expect(await account.verifyOffer(unlinked.body, unlinked.signature)).toEqual({ ok: false });
    await account.signIn();
    await settle(account);
    const good = sign(fresh);
    expect(await account.verifyOffer(good.body, good.signature)).toEqual({
      ok: true,
      accountAutoApprove: true,
      verifierHash,
      name: 'iPhone',
    });
    for (const forged of [
      sign(fresh, 'other-key'),
      sign({ ...fresh, hostId: 'hotheraaaaaa' }),
      sign({ ...fresh, account: 'user_bob' }),
      sign({ ...fresh, issuedAt: new Date(Date.now() - 120_000).toISOString() }),
      sign({ ...fresh, verifierHash: 'short' }),
    ])
      expect(await account.verifyOffer(forged.body, forged.signature)).toEqual({ ok: false });
    expect(await account.verifyOffer(good.body, undefined)).toEqual({ ok: false });
    expect(await account.verifyOffer(`${good.body} `, good.signature)).toEqual({ ok: false });
    await account.close();
  });
});

it('uses the account credential owner for Bot verification and rejects it after sign-out', async () => {
  const services = fakeServices();
  const credentials = memoryCredentials();
  const receiver = { id: 'hbbbbbbbbbbbb', hostId: 'local-host', publicKey: 'b'.repeat(64) };
  const sender = { id: 'haaaaaaaaaaaa', hostId: 'remote-host', publicKey: 'a'.repeat(64) };
  services.hosts.add(receiver.id);
  services.owners.set(receiver.id, 'user_alice');
  credentials.records.set(credentialKey('botharness-core', 'connect-account'), {
    kind: 'grant',
    payload: {
      relay: RELAY,
      clientId: CLIENT,
      refreshToken: 'refresh-0',
      hostId: receiver.id,
      account: 'user_alice',
      relayKey: RELAY_KEY,
    },
  });
  const account = createConnectAccount({
    credentials: () => credentials.provider,
    connect: fakeConnect().connect,
    relay: RELAY,
    freePort: async () => 41001,
    fetch: async (input, init) => {
      if (String(input) === `${RELAY}/v1/hosts` && (init?.method ?? 'GET') === 'GET')
        return Response.json({
          hosts: [receiver, sender].map((peer) => ({
            id: peer.id,
            hostname: `${peer.id}.deepseekbot.dev`,
            botNetwork: { hostId: peer.hostId, publicKey: peer.publicKey },
          })),
        });
      return services.fetcher(input, init);
    },
  });
  try {
    await account.start();
    const payload = JSON.stringify({
      purpose: 'bot-network-peer-v1',
      account: 'user_alice',
      sender,
      recipient: receiver,
      issuedAt: new Date().toISOString(),
      nonce: 'n'.repeat(32),
    });
    const grant = {
      payload,
      signature: createHmac('sha256', RELAY_KEY).update(payload).digest('base64url'),
    };
    expect(await account.botNetwork.verify(receiver, grant)).toMatchObject(sender);
    await account.signOut();
    await expect(account.botNetwork.verify(receiver, grant)).rejects.toMatchObject({
      code: 'network-denied',
    });
  } finally {
    await account.close();
  }
});

it.each(['match', 'other-account', 'other-host', 'expired'] as const)(
  'same-account enrollment authorization: %s',
  async (mode) => {
    const { account } = setup(fakeServices({ pending: 0 }));
    try {
      await account.signIn();
      await settle(account);
      const body = JSON.stringify({
        account: mode === 'other-account' ? 'user_bob' : 'user_alice',
        hostId: mode === 'other-host' ? 'another-host' : 'hstudioaaaaa',
        verifierHash: Buffer.alloc(32, 7).toString('base64url'),
        issuedAt: new Date(Date.now() - (mode === 'expired' ? 120_000 : 0)).toISOString(),
      });
      const signature = createHmac('sha256', RELAY_KEY).update(body).digest('base64url');
      const result = await account.verifyOffer(body, signature);
      expect(result.ok).toBe(mode === 'match');
      if (result.ok) expect(result.accountAutoApprove).toBe(true);
      expect(await account.verifyOffer(body, 'forged')).toEqual({ ok: false });
      await account.signOut();
      expect(await account.verifyOffer(body, signature)).toEqual({ ok: false });
    } finally {
      await account.close();
    }
  },
);
