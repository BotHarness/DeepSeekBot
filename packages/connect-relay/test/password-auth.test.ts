import { describe, expect, it, vi } from 'vitest';
import { createPasswordAuth } from '../src/password-auth.js';
import { createRelay, type RelayOptions } from '../src/relay.js';

const session = {
  refresh_token: 'refresh-test',
  access_token: 'omit-access',
  user: { id: 'user_test', email: 'a@example.org', metadata: { private: true } },
};
function setup(
  replies: { status: number; body: unknown }[],
  limit = vi.fn(async (_key: string) => true),
) {
  const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
    const reply = replies.shift();
    if (!reply) throw new Error('unexpected request');
    return Response.json(reply.body, { status: reply.status });
  });
  return {
    auth: createPasswordAuth({ apiKey: 'sk_test', clientId: 'client_test', fetcher, limit }),
    fetcher,
    limit,
  };
}

describe('password authentication boundary', () => {
  it('keeps the password exact, normalizes email, and returns only the existing session contract', async () => {
    const { auth, fetcher } = setup([{ status: 200, body: session }]);
    expect(
      await auth.signIn({ email: ' A@Example.org ', password: ' password with spaces ' }),
    ).toEqual({
      status: 200,
      body: { refresh_token: 'refresh-test', user: { id: 'user_test', email: 'a@example.org' } },
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      grant_type: 'password',
      email: 'a@example.org',
      password: ' password with spaces ',
      client_secret: 'sk_test',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('registers an unverified account and continues through WorkOS email verification', async () => {
    const { auth, fetcher, limit } = setup([
      { status: 201, body: { id: 'user_test' } },
      {
        status: 403,
        body: {
          code: 'email_verification_required',
          pending_authentication_token: 'pending-secret',
          email_verification_id: 'omit-id',
        },
      },
      { status: 200, body: session },
    ]);
    expect(
      await auth.signIn({ email: 'a@example.org', password: 'strong password', register: true }),
    ).toEqual({
      status: 200,
      body: { verification_required: true, pending_authentication_token: 'pending-secret' },
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      email_verified: false,
    });
    expect(
      (await auth.verify({ pendingToken: 'pending-secret', code: '123456', ip: '203.0.113.1' }))
        .status,
    ).toBe(200);
    expect(JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body))).toMatchObject({
      grant_type: 'urn:workos:oauth:grant-type:email-verification:code',
      pending_authentication_token: 'pending-secret',
      code: '123456',
    });
    expect(JSON.stringify(limit.mock.calls)).not.toContain('pending-secret');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('never bypasses additional authentication requirements', async () => {
    const { auth } = setup([
      { status: 403, body: { code: 'mfa_challenge', pending_authentication_token: 'private' } },
    ]);
    expect(await auth.signIn({ email: 'a@example.org', password: 'value' })).toEqual({
      status: 409,
      body: { error: { code: 'use-browser-sign-in' } },
    });
  });
  it('does not return reset secrets or reveal unknown accounts', async () => {
    const { auth } = setup([
      {
        status: 201,
        body: {
          password_reset_token: 'private',
          password_reset_url: 'https://example.org/?token=private',
        },
      },
      { status: 404, body: {} },
    ]);
    for (const email of ['a@example.org', 'unknown@example.org'])
      expect(await auth.reset({ email })).toEqual({ status: 200, body: { sent: true } });
  });
  it('refuses malformed input and missing or denied rate limiting before calling WorkOS', async () => {
    const { auth, fetcher } = setup(
      [],
      vi.fn(async () => false),
    );
    expect((await auth.signIn({ email: 'a@example.org', password: 'x' })).status).toBe(429);
    expect((await auth.verify({ pendingToken: 'token', code: '123456' })).status).toBe(429);
    expect((await auth.reset({ email: 'a@example.org' })).status).toBe(429);
    expect((await auth.signIn({ email: 'invalid', password: 'x' })).status).toBe(400);
    expect((await auth.verify({ pendingToken: 'token', code: 'abc' })).status).toBe(400);
    const missingLimiter = createPasswordAuth({ apiKey: 'test', clientId: 'test', fetcher });
    expect((await missingLimiter.signIn({ email: 'a@example.org', password: 'x' })).status).toBe(
      429,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('blocks rotating-email attempts with the same IP before WorkOS calls', async () => {
    const { auth, fetcher, limit } = setup(
      [],
      vi.fn(async (key: string) => !key.includes('password-auth-ip')),
    );
    expect(
      (await auth.signIn({ email: 'a@example.org', password: 'x', ip: '203.0.113.1' })).status,
    ).toBe(429);
    expect(
      (await auth.signIn({ email: 'b@example.org', password: 'x', ip: '203.0.113.1' })).status,
    ).toBe(429);
    expect(limit.mock.calls.filter(([key]) => key.includes('password-auth-ip'))).toHaveLength(2);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('password relay routes', () => {
  const relayWith = (passwordAuth?: ReturnType<typeof createPasswordAuth>) =>
    createRelay({
      db: {} as RelayOptions['db'],
      tunnels: {} as RelayOptions['tunnels'],
      verifier: { verify: async () => undefined },
      clientId: 'client_test',
      zone: 'deepseekbot.dev',
      allowedUsers: [],
      maxHosts: 3,
      maxTunnels: 10,
      reclaimAfterMs: 1,
      ...(passwordAuth ? { passwordAuth } : {}),
    });
  it('advertises capability only when configured and requires bounded POST bodies', async () => {
    const off = relayWith();
    expect(
      await (await off.fetch(new Request('https://relay.test/v1/config'))).json(),
    ).not.toHaveProperty('passwordAuth');
    expect(
      (
        await off.fetch(
          new Request('https://relay.test/v1/auth/password', { method: 'POST', body: '{}' }),
        )
      ).status,
    ).toBe(503);
    const { auth, fetcher } = setup([]);
    const on = relayWith(auth);
    expect(
      await (await on.fetch(new Request('https://relay.test/v1/config'))).json(),
    ).toHaveProperty('passwordAuth', true);
    expect((await on.fetch(new Request('https://relay.test/v1/auth/password'))).status).toBe(405);
    expect(
      (
        await on.fetch(
          new Request('https://relay.test/v1/auth/password', {
            method: 'POST',
            body: JSON.stringify({ password: 'x'.repeat(25000) }),
          }),
        )
      ).status,
    ).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('forwards trusted caller context and disables response caching', async () => {
    const { auth, fetcher } = setup([{ status: 200, body: session }]);
    const response = await relayWith(auth).fetch(
      new Request('https://relay.test/v1/auth/password', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.1', 'user-agent': 'Tobs/QA' },
        body: JSON.stringify({ email: 'a@example.org', password: 'password', ip: 'spoofed' }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      ip_address: '203.0.113.1',
      user_agent: 'Tobs/QA',
    });
  });
});
