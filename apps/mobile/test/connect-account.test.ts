import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { createConnectAccount } from '../src/host/connect-account';
import { redeemPairing } from '../src/host/pairing';

const RELAY = 'https://relay.test';
const REDIRECT = 'ai.botharness.deepseekbot.dev:/oauth2redirect';
const challenge = async (value: string) => createHash('sha256').update(value).digest('base64url');

function fakeRelay(options: { offline?: boolean; expired?: boolean } = {}) {
  let stored: string | null = null;
  let randoms = 0;
  const calls: { url: string; auth?: string; body?: string }[] = [];
  const request = vi.fn(async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? init.body : undefined;
    const auth = new Headers(init?.headers).get('authorization') ?? undefined;
    calls.push({ url, ...(auth ? { auth } : {}), ...(body ? { body } : {}) });
    if (url === `${RELAY}/v1/config`) return Response.json({ clientId: 'client_01TEST' });
    if (url === 'https://api.workos.com/user_management/authenticate') {
      const form = new URLSearchParams(body);
      if (form.get('grant_type') === 'authorization_code')
        return Response.json({
          access_token: 'access-0',
          refresh_token: 'refresh-0',
          user: { email: 'alice@example.com' },
        });
      if (options.expired) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      return Response.json({ access_token: 'access-1', refresh_token: 'refresh-1' });
    }
    if (url === `${RELAY}/v1/hosts`)
      return Response.json({
        hosts: [
          { id: 'hstudio', name: 'Studio', hostname: 'hstudio.deepseekbot.dev', tunnel: true },
          { id: 'hlaptop', name: 'Laptop', hostname: 'hlaptop.deepseekbot.dev', tunnel: false },
          { id: 7 },
        ],
      });
    if (url === `${RELAY}/v1/hosts/hstudio/offer`) {
      if (options.offline)
        return Response.json({ error: { code: 'host-offline' } }, { status: 409 });
      return Response.json({
        offer: 'offer-1',
        expiresAt: '2026-10-21T12:10:00.000Z',
        hostname: 'hstudio.deepseekbot.dev',
        host: { id: 'pairing-host', name: 'Studio Mac' },
      });
    }
    return Response.json({}, { status: 404 });
  });
  const authorize = vi.fn(async (url: string) => {
    const state = new URL(url).searchParams.get('state');
    return `${REDIRECT}?code=auth-code&state=${state}`;
  });
  const account = createConnectAccount({
    relay: RELAY,
    redirectUri: REDIRECT,
    runtime: {
      read: async () => stored,
      write: async (value) => {
        stored = value;
      },
      request,
      random: () => `random-${(randoms += 1)}`,
      challenge,
      authorize,
      now: () => Date.parse('2026-10-21T12:00:00Z'),
    },
  });
  return { account, calls, authorize, stored: () => stored };
}

describe('phone Connect account', () => {
  it('signs in with PKCE against the relay client and lists the linked Hosts', async () => {
    const relay = fakeRelay();
    expect(await relay.account.email()).toBeNull();
    expect(await relay.account.signIn()).toEqual({ ok: true, value: 'alice@example.com' });
    const authorizeUrl = new URL(relay.authorize.mock.calls[0]![0]);
    expect(Object.fromEntries(authorizeUrl.searchParams)).toMatchObject({
      client_id: 'client_01TEST',
      redirect_uri: REDIRECT,
      code_challenge: await challenge('random-1'),
      code_challenge_method: 'S256',
      state: 'random-2',
    });
    expect(JSON.parse(relay.stored()!)).toEqual({
      clientId: 'client_01TEST',
      refreshToken: 'refresh-0',
      email: 'alice@example.com',
    });
    expect(await relay.account.hosts()).toEqual({
      ok: true,
      value: [
        { id: 'hstudio', name: 'Studio', hostname: 'hstudio.deepseekbot.dev', online: true },
        { id: 'hlaptop', name: 'Laptop', hostname: 'hlaptop.deepseekbot.dev', online: false },
      ],
    });
    expect(relay.calls.at(-1)).toMatchObject({ auth: 'Bearer access-1' });
    expect(JSON.parse(relay.stored()!).refreshToken).toBe('refresh-1');
  });

  it('asks for an offer bound to a verifier and redeems it with that verifier', async () => {
    const relay = fakeRelay();
    await relay.account.signIn();
    const offer = await relay.account.offer('hstudio', 'iPhone');
    expect(offer).toEqual({
      ok: true,
      value: {
        host: { id: 'pairing-host', name: 'Studio Mac' },
        offer: 'offer-1',
        routes: ['https://hstudio.deepseekbot.dev'],
        expiresAt: '2026-10-21T12:10:00.000Z',
        verifier: 'random-3',
      },
    });
    expect(JSON.parse(relay.calls.at(-1)!.body!)).toEqual({
      verifierHash: await challenge('random-3'),
      name: 'iPhone',
    });
    const sent: string[] = [];
    const redeemed = await redeemPairing({
      payload: offer.ok ? offer.value : (undefined as never),
      deviceName: 'iPhone',
      carrier: {
        request: async (url, init) => {
          sent.push(`${url} ${String(init.body)}`);
          return {
            status: 200,
            text: async () =>
              JSON.stringify({
                deviceId: 'device-1',
                credential: 'device-1.secret',
                host: { id: 'pairing-host', name: 'Studio Mac' },
              }),
          };
        },
        openSocket: () => {
          throw new Error('unused');
        },
      },
    });
    expect(sent).toEqual([
      'https://hstudio.deepseekbot.dev/botharness-device/pair {"offer":"offer-1","name":"iPhone","verifier":"random-3"}',
    ]);
    expect(redeemed).toMatchObject({ ok: true, host: { hostId: 'pairing-host' } });
  });

  it('reports offline Hosts, cancelled sign-ins and expired sessions', async () => {
    const offline = fakeRelay({ offline: true });
    await offline.account.signIn();
    expect(await offline.account.offer('hstudio', 'iPhone')).toEqual({
      ok: false,
      code: 'host-offline',
    });

    const cancelled = fakeRelay();
    cancelled.authorize.mockResolvedValueOnce(null as never);
    expect(await cancelled.account.signIn()).toEqual({ ok: false, code: 'sign-in-cancelled' });
    expect(await cancelled.account.hosts()).toEqual({ ok: false, code: 'sign-in-required' });

    const expired = fakeRelay({ expired: true });
    await expired.account.signIn();
    expect(await expired.account.hosts()).toEqual({ ok: false, code: 'sign-in-required' });
    expect(expired.stored()).toBeNull();

    const forged = fakeRelay();
    forged.authorize.mockResolvedValueOnce(`${REDIRECT}?code=x&state=other` as never);
    expect(await forged.account.signIn()).toEqual({ ok: false, code: 'sign-in-failed' });
    await forged.account.signIn();
    await forged.account.signOut();
    expect(await forged.account.email()).toBeNull();
  });
});
