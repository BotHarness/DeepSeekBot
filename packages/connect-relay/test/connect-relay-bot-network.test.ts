import { describe, expect, it } from 'vitest';

import { hmac } from '../src/relay.js';
import { setup } from './support.js';

describe('Connect Bot network registration', () => {
  it('publishes a Host-proven Bot identity only in its authenticated account directory', async () => {
    const hostKey = async (id: string) => `private-test-key-${id}`;
    const { call, at } = await setup(['user_alice', 'user_bob'], { hostKey });
    const linked = await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Mac' } });
    const id = linked.body.host.id;
    const identity = { hostId: 'stable-mac', publicKey: 'a'.repeat(64), issuedAt: at() };
    const proof = await hmac(
      await hostKey(id),
      JSON.stringify({ purpose: 'bot-network-registration-v1', connectHostId: id, ...identity }),
    );
    expect(
      (
        await call('POST', `/v1/hosts/${id}/bot-network`, {
          as: 'user_bob',
          body: { ...identity, proof },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call('POST', `/v1/hosts/${id}/bot-network`, {
          as: 'user_alice',
          body: { ...identity, proof: 'invalid' },
        })
      ).status,
    ).toBe(403);
    expect(
      await call('POST', `/v1/hosts/${id}/bot-network`, {
        as: 'user_alice',
        body: { ...identity, proof },
      }),
    ).toMatchObject({
      status: 200,
      body: { host: { id, botNetwork: { hostId: 'stable-mac', publicKey: 'a'.repeat(64) } } },
    });
    expect((await call('GET', '/v1/hosts', { as: 'user_alice' })).body.hosts).toEqual([
      expect.objectContaining({
        id,
        botNetwork: { hostId: 'stable-mac', publicKey: 'a'.repeat(64) },
      }),
    ]);
    expect((await call('GET', '/v1/hosts', { as: 'user_bob' })).body.hosts).toEqual([]);
  });
});

it('issues only recipient-bound Bot capability proofs for two current Hosts in the same account', async () => {
  const hostKey = async (id: string) => `private-test-key-${id}`;
  const { call, at } = await setup(['user_alice', 'user_bob'], { hostKey });
  const register = async (name: string, as: string) => {
    const id = (await call('POST', '/v1/hosts', { as, body: { name } })).body.host.id;
    const identity = {
      hostId: name,
      publicKey: (name === 'left' ? 'a' : 'b').repeat(64),
      issuedAt: at(),
    };
    const proof = await hmac(
      await hostKey(id),
      JSON.stringify({ purpose: 'bot-network-registration-v1', connectHostId: id, ...identity }),
    );
    expect(
      (await call('POST', `/v1/hosts/${id}/bot-network`, { as, body: { ...identity, proof } }))
        .status,
    ).toBe(200);
    return { id, hostId: name, publicKey: identity.publicKey };
  };
  const left = await register('left', 'user_alice');
  const right = await register('right', 'user_alice');
  const foreign = await register('foreign', 'user_bob');
  const grant = async (recipientId: string) => {
    const input = { recipientId, issuedAt: at(), nonce: 'n'.repeat(32) };
    const proof = await hmac(
      await hostKey(left.id),
      JSON.stringify({ purpose: 'bot-network-grant-v1', connectHostId: left.id, ...input }),
    );
    return call('POST', `/v1/hosts/${left.id}/bot-network/grant`, {
      as: 'user_alice',
      body: { ...input, proof },
    });
  };
  expect((await grant(foreign.id)).status).toBe(404);
  const issued = await grant(right.id);
  expect(issued.status).toBe(200);
  const payload = JSON.parse(issued.body.grant.payload);
  expect(payload).toEqual({
    purpose: 'bot-network-peer-v1',
    account: 'user_alice',
    sender: left,
    recipient: right,
    issuedAt: at(),
    nonce: 'n'.repeat(32),
  });
  expect(issued.body.grant.signature).toBe(
    await hmac(await hostKey(right.id), issued.body.grant.payload),
  );
  await call('DELETE', `/v1/hosts/${right.id}`, { as: 'user_alice' });
  expect((await grant(right.id)).status).toBe(404);
});

it('bounds Bot credentials per owned Host without consuming Human account write capacity', async () => {
  let humanAllowed = true;
  const budgets = new Map<string, number>();
  const hostKey = async (id: string) => `key-${id}`;
  const f = await setup(['user_alice', 'user_bob'], {
    hostKey,
    limit: async () => humanAllowed,
    limitBot: async (account, host) => {
      const key = JSON.stringify([account, host]);
      const count = (budgets.get(key) ?? 0) + 1;
      budgets.set(key, count);
      return count <= 1;
    },
  });
  const ids = [];
  for (const name of ['one', 'two'])
    ids.push(
      (await f.call('POST', '/v1/hosts', { as: 'user_alice', body: { name } })).body.host.id,
    );
  humanAllowed = false;
  const register = async (id: string, as = 'user_alice') => {
    const body = { hostId: `stable-${id}`, publicKey: 'a'.repeat(64), issuedAt: f.at() };
    const proof = await hmac(
      await hostKey(id),
      JSON.stringify({ purpose: 'bot-network-registration-v1', connectHostId: id, ...body }),
    );
    return f.call('POST', `/v1/hosts/${id}/bot-network`, { as, body: { ...body, proof } });
  };
  expect((await register(ids[0]!, 'user_bob')).status).toBe(404);
  expect((await register(ids[0]!)).status).toBe(200);
  expect((await register(ids[0]!)).status).toBe(429);
  expect((await register(ids[1]!)).status).toBe(200);
  expect(budgets.size).toBe(2);
  expect(
    (await f.call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'three' } })).status,
  ).toBe(429);
});
