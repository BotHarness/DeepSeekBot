import { describe, expect, it, vi } from 'vitest';

import { hmac } from '../src/relay.js';
import { setup } from './support.js';

describe('Connect relay phone offers', () => {
  const VERIFIER_HASH = Buffer.alloc(32, 7).toString('base64url');
  const hostKey = (hostId: string) => hmac('relay-secret', `host:${hostId}`);

  async function linked(fetchHost: typeof fetch) {
    const relay = await setup(['user_alice', 'user_bob'], { hostKey, fetchHost });
    await relay.call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Studio' } });
    return relay;
  }

  it.each([true, false, undefined])(
    'returns signed enrollment metadata and forwards password availability %s',
    async (password) => {
      const seen: { url: string; method: string; body: unknown; redirect: unknown }[] = [];
      const encryption = { protocol: 'connect-noise-xk-v1', publicKey: 'ab'.repeat(32) };
      const { call, at } = await linked(async (input, init) => {
        seen.push({
          url: String(input),
          method: init?.method ?? 'GET',
          body: init?.body,
          redirect: init?.redirect,
        });
        return Response.json({
          host: { id: 'pairing-host-1', name: 'Studio Mac' },
          encryption,
          ...(password === undefined ? {} : { signIn: { password, ignored: 'extra' } }),
        });
      });
      const tunnel = await call('POST', '/v1/hosts/haaaaaaaaaaab/tunnel', {
        as: 'user_alice',
        body: { originPort: 41001 },
      });
      const result = await call('POST', '/v1/hosts/haaaaaaaaaaab/offer', {
        as: 'user_alice',
        body: { verifierHash: VERIFIER_HASH, name: ' iPhone ' },
      });
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ host: { id: 'pairing-host-1' }, encryption });
      expect(result.body['signIn']).toEqual(password === undefined ? undefined : { password });
      expect(result.body['offer']).toBeUndefined();
      expect(seen).toEqual([
        {
          url: 'https://haaaaaaaaaaab.deepseekbot.dev/botharness-device/channel',
          method: 'GET',
          body: undefined,
          redirect: 'error',
        },
      ]);
      const enrollment = result.body['enrollment'] as { body: string; signature: string };
      expect(JSON.parse(enrollment.body)).toEqual({
        hostId: 'haaaaaaaaaaab',
        account: 'user_alice',
        verifierHash: VERIFIER_HASH,
        name: 'iPhone',
        issuedAt: at(),
      });
      expect(enrollment.signature).toBe(await hmac(tunnel.body['relayKey'], enrollment.body));
    },
  );

  it('authorizes a client-side attempt without probing an offline connector, scoped to the account', async () => {
    const probe = vi.fn(async () => {
      throw new Error('Relay cannot reach Host');
    });
    const { call, row } = await linked(probe);
    await call('POST', '/v1/hosts/haaaaaaaaaaab/tunnel', {
      as: 'user_alice',
      body: { originPort: 41001 },
    });
    expect((await row('haaaaaaaaaaab'))?.tunnel_status).not.toBe('healthy');
    const body = { verifierHash: VERIFIER_HASH, identitySource: 'client' };
    expect(
      (await call('POST', '/v1/hosts/haaaaaaaaaaab/offer', { as: 'user_bob', body })).status,
    ).toBe(404);
    const result = await call('POST', '/v1/hosts/haaaaaaaaaaab/offer', { as: 'user_alice', body });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      identitySource: 'client',
      hostname: 'haaaaaaaaaaab.deepseekbot.dev',
      enrollment: { body: expect.any(String), signature: expect.any(String) },
    });
    expect(result.body.host).toBeUndefined();
    expect(probe).not.toHaveBeenCalled();
  });

  it('refuses offers for other accounts, bad verifiers and unreachable Hosts', async () => {
    let answer: () => Promise<Response> = async () => {
      throw new Error('offline');
    };
    const { call } = await linked(() => answer());
    const offer = (as: string, body: unknown) =>
      call('POST', '/v1/hosts/haaaaaaaaaaab/offer', { as, body });
    expect((await offer('user_alice', { verifierHash: VERIFIER_HASH })).body).toEqual({
      error: { code: 'host-offline', cause: 'no-tunnel' },
    });
    await call('POST', '/v1/hosts/haaaaaaaaaaab/tunnel', {
      as: 'user_alice',
      body: { originPort: 41001 },
    });
    expect((await offer('user_bob', { verifierHash: VERIFIER_HASH })).status).toBe(404);
    expect((await offer('user_alice', { verifierHash: 'short' })).body).toEqual({
      error: { code: 'invalid-verifier' },
    });
    expect((await offer('user_alice', { verifierHash: VERIFIER_HASH })).body).toEqual({
      error: { code: 'host-offline', cause: 'unreachable' },
    });
    answer = async () => {
      throw new DOMException('timed out', 'TimeoutError');
    };
    expect((await offer('user_alice', { verifierHash: VERIFIER_HASH })).body).toEqual({
      error: { code: 'host-offline', cause: 'timeout' },
    });
    answer = async () => new Response('bad gateway', { status: 530 });
    expect((await offer('user_alice', { verifierHash: VERIFIER_HASH })).body).toEqual({
      error: { code: 'host-offline', cause: 'http-530' },
    });
    answer = async () => Response.json({ code: 'relay-signature-invalid' }, { status: 401 });
    expect((await offer('user_alice', { verifierHash: VERIFIER_HASH })).body).toEqual({
      error: { code: 'host-refused', cause: 'http-401' },
    });
    answer = async () => Response.json({ offer: 'x', expiresAt: 'y', host: { name: 'Other' } });
    expect((await offer('user_alice', { verifierHash: VERIFIER_HASH })).status).toBe(502);
    const unsigned = await setup();
    await unsigned.call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Studio' } });
    expect(
      (
        await unsigned.call('POST', '/v1/hosts/haaaaaaaaaaab/offer', {
          as: 'user_alice',
          body: { verifierHash: VERIFIER_HASH },
        })
      ).body,
    ).toEqual({ error: { code: 'offer-unavailable' } });
  });
});
