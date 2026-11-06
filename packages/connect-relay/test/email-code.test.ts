import { describe, expect, it } from 'vitest';

import { createEmailCode, normalizeEmail } from '../src/email-code.js';
import { createRelay } from '../src/relay.js';
import type { D1Database } from '../src/d1.js';

const CLIENT_ID = 'client_01TEST';
const API_KEY = 'sk_test_relay';

function workos(replies: Record<string, { status: number; body: unknown }>) {
  const calls: { url: string; auth: string | null; body: Record<string, unknown> }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      auth: new Headers(init?.headers).get('authorization'),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    const path = new URL(url).pathname.replace('/user_management', '');
    const reply = replies[path] ?? { status: 500, body: {} };
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  }) as typeof fetch;
  return { calls, fetcher };
}

const signedIn = {
  status: 200,
  body: {
    access_token: 'access',
    refresh_token: 'refresh-1',
    authentication_method: 'MagicAuth',
    user: { id: 'user_alice', email: 'alice@example.com', first_name: 'Alice' },
  },
};

describe('email-code sign-in', () => {
  it('normalizes and validates email addresses', () => {
    expect(normalizeEmail('  Alice@Example.COM ')).toBe('alice@example.com');
    expect(normalizeEmail('nope')).toBeUndefined();
    expect(normalizeEmail(42)).toBeUndefined();
    expect(normalizeEmail(`${'a'.repeat(250)}@x.io`)).toBeUndefined();
  });

  it('asks WorkOS to email a code without returning it to the phone', async () => {
    const { calls, fetcher } = workos({
      '/magic_auth': { status: 201, body: { id: 'magic_auth_1', code: '123456' } },
    });
    const auth = createEmailCode({ apiKey: API_KEY, clientId: CLIENT_ID, fetcher });
    const result = await auth.send({ email: 'Alice@example.com' });
    expect(result).toEqual({ status: 200, body: { sent: true } });
    expect(JSON.stringify(result)).not.toContain('123456');
    expect(calls).toEqual([
      {
        url: 'https://api.workos.com/user_management/magic_auth',
        auth: `Bearer ${API_KEY}`,
        body: { email: 'alice@example.com' },
      },
    ]);
  });

  it('exchanges a code for the refresh token and user only', async () => {
    const { calls, fetcher } = workos({ '/authenticate': signedIn });
    const auth = createEmailCode({ apiKey: API_KEY, clientId: CLIENT_ID, fetcher });
    const result = await auth.verify({
      email: 'alice@example.com',
      code: ' 123456 ',
      ip: '203.0.113.9',
      userAgent: 'Tobs/1.6',
    });
    expect(result).toEqual({
      status: 200,
      body: { refresh_token: 'refresh-1', user: { id: 'user_alice', email: 'alice@example.com' } },
    });
    expect(calls[0]?.body).toEqual({
      client_id: CLIENT_ID,
      client_secret: API_KEY,
      grant_type: 'urn:workos:oauth:grant-type:magic-auth:code',
      email: 'alice@example.com',
      code: '123456',
      ip_address: '203.0.113.9',
      user_agent: 'Tobs/1.6',
    });
  });

  it('refuses malformed input before calling WorkOS', async () => {
    const { calls, fetcher } = workos({});
    const auth = createEmailCode({ apiKey: API_KEY, clientId: CLIENT_ID, fetcher });
    expect((await auth.send({ email: 'x' })).body).toEqual({ error: { code: 'invalid-email' } });
    expect((await auth.verify({ email: 'a@b.co', code: '112233445566' })).body).toEqual({
      error: { code: 'invalid-code' },
    });
    expect((await auth.verify({ email: 'a@b.co', code: '12a456' })).body).toEqual({
      error: { code: 'invalid-code' },
    });
    expect(calls).toHaveLength(0);
  });

  it('maps WorkOS refusals to stable codes', async () => {
    const wrong = workos({
      '/authenticate': { status: 400, body: { code: 'invalid_one_time_code', message: 'x' } },
    });
    expect(
      (
        await createEmailCode({
          apiKey: API_KEY,
          clientId: CLIENT_ID,
          fetcher: wrong.fetcher,
        }).verify({ email: 'a@b.co', code: '000000' })
      ).body,
    ).toEqual({ error: { code: 'invalid-code' } });

    const org = workos({
      '/authenticate': {
        status: 403,
        body: { code: 'organization_selection_required', pending_authentication_token: 't' },
      },
    });
    expect(
      await createEmailCode({ apiKey: API_KEY, clientId: CLIENT_ID, fetcher: org.fetcher }).verify({
        email: 'a@b.co',
        code: '000000',
      }),
    ).toEqual({
      status: 409,
      body: { error: { code: 'use-browser-sign-in', cause: 'organization_selection_required' } },
    });

    const down = workos({ '/magic_auth': { status: 503, body: {} } });
    expect(
      await createEmailCode({ apiKey: API_KEY, clientId: CLIENT_ID, fetcher: down.fetcher }).send({
        email: 'a@b.co',
      }),
    ).toEqual({ status: 502, body: { error: { code: 'workos-unavailable', cause: 'http-503' } } });
  });

  it('rate-limits sends and verifies per email and per IP', async () => {
    const keys: string[] = [];
    const { calls, fetcher } = workos({ '/magic_auth': { status: 201, body: {} } });
    const auth = createEmailCode({
      apiKey: API_KEY,
      clientId: CLIENT_ID,
      fetcher,
      limit: async (key) => {
        keys.push(key);
        return !key.includes('email-code-ip');
      },
    });
    expect((await auth.send({ email: 'a@b.co', ip: '198.51.100.1' })).status).toBe(429);
    expect(calls).toHaveLength(0);
    expect(keys).toEqual([
      JSON.stringify(['email-code', 'a@b.co']),
      JSON.stringify(['email-code-ip', '198.51.100.1']),
    ]);
    const blocked = createEmailCode({
      apiKey: API_KEY,
      clientId: CLIENT_ID,
      fetcher,
      limit: async () => false,
    });
    expect((await blocked.verify({ email: 'a@b.co', code: '123456' })).status).toBe(429);
    const verifyKeys: string[] = [];
    const perIp = createEmailCode({
      apiKey: API_KEY,
      clientId: CLIENT_ID,
      fetcher,
      limit: async (key) => {
        verifyKeys.push(key);
        return !key.includes('email-verify-ip');
      },
    });
    expect(
      (await perIp.verify({ email: 'a@b.co', code: '123456', ip: '198.51.100.1' })).status,
    ).toBe(429);
    expect(verifyKeys).toEqual([
      JSON.stringify(['email-verify', 'a@b.co']),
      JSON.stringify(['email-verify-ip', '198.51.100.1']),
    ]);
  });
});

describe('Connect relay email-code routes', () => {
  const relayWith = (emailCode?: ReturnType<typeof createEmailCode>) =>
    createRelay({
      db: {} as D1Database,
      verifier: { verify: async () => undefined },
      tunnels: {} as never,
      clientId: CLIENT_ID,
      zone: 'deepseekbot.dev',
      allowedUsers: [],
      maxHosts: 5,
      maxTunnels: 900,
      reclaimAfterMs: 1,
      ...(emailCode ? { emailCode } : {}),
    });
  const post = (relay: ReturnType<typeof relayWith>, path: string, body: unknown) =>
    relay.fetch(
      new Request(`https://connect.botharness.ai${path}`, {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.9', 'user-agent': 'Tobs/1.6' },
        body: JSON.stringify(body),
      }),
    );

  it('advertises email-code sign-in only when the relay can serve it', async () => {
    const config = async (relay: ReturnType<typeof relayWith>) =>
      (await relay.fetch(new Request('https://connect.botharness.ai/v1/config'))).json();
    expect(await config(relayWith())).not.toHaveProperty('emailCode');
    const { fetcher } = workos({});
    expect(
      await config(relayWith(createEmailCode({ apiKey: API_KEY, clientId: CLIENT_ID, fetcher }))),
    ).toMatchObject({ emailCode: true });
    const off = await post(relayWith(), '/v1/auth/email-code', { email: 'a@b.co' });
    expect(off.status).toBe(503);
  });

  it('sends and verifies without a bearer token, forwarding the caller IP', async () => {
    const { calls, fetcher } = workos({
      '/magic_auth': { status: 201, body: { code: '123456' } },
      '/authenticate': signedIn,
    });
    const relay = relayWith(createEmailCode({ apiKey: API_KEY, clientId: CLIENT_ID, fetcher }));
    const sent = await post(relay, '/v1/auth/email-code', { email: 'alice@example.com' });
    expect([sent.status, await sent.json()]).toEqual([200, { sent: true }]);
    const verified = await post(relay, '/v1/auth/email-code/verify', {
      email: 'alice@example.com',
      code: '123456',
    });
    expect(verified.status).toBe(200);
    expect(verified.headers.get('cache-control')).toBe('no-store');
    expect(await verified.json()).toMatchObject({ refresh_token: 'refresh-1' });
    expect(calls[1]?.body).toMatchObject({ ip_address: '203.0.113.9', user_agent: 'Tobs/1.6' });
    const get = await relay.fetch(new Request('https://connect.botharness.ai/v1/auth/email-code'));
    expect(get.status).toBe(405);
    const failing = relayWith({
      send: async () => {
        throw new Error('limiter down');
      },
      verify: async () => {
        throw new Error('limiter down');
      },
    });
    const broken = await post(failing, '/v1/auth/email-code', { email: 'a@b.co' });
    expect(broken.status).toBe(502);
    expect(await broken.json()).toMatchObject({ error: { code: 'workos-unavailable' } });
  });
});

describe('email-code sign-in when Magic Auth is off', () => {
  it('reports unavailable instead of blaming the email', async () => {
    const off = workos({
      '/magic_auth': {
        status: 400,
        body: { code: 'authentication_method_not_allowed', message: 'Magic Auth is disabled.' },
      },
      '/authenticate': { status: 400, body: { code: 'authentication_method_not_allowed' } },
    });
    const auth = createEmailCode({ apiKey: API_KEY, clientId: CLIENT_ID, fetcher: off.fetcher });
    const expected = {
      status: 503,
      body: {
        error: { code: 'email-code-unavailable', cause: 'authentication_method_not_allowed' },
      },
    };
    expect(await auth.send({ email: 'a@b.co' })).toEqual(expected);
    expect(await auth.verify({ email: 'a@b.co', code: '123456' })).toEqual(expected);
  });
});
