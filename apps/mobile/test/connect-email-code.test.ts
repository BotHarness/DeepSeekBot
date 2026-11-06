import { describe, expect, it, vi } from 'vitest';

import {
  createConnectAccount,
  type EmailCodeFlow,
  type EmailCodeOutcome,
} from '../src/host/connect-account';
import { startEmailCodeSignIn, takeEmailCodeSignIn } from '../src/host/email-code-bridge';

const RELAY = 'https://relay.test';
const REDIRECT = 'ai.botharness.deepseekbot.dev:/oauth2redirect';

function setup(
  collect: ((flow: EmailCodeFlow) => Promise<EmailCodeOutcome>) | undefined,
  options: {
    emailCode?: boolean;
    verifyStatus?: number;
    verifyCode?: string;
    verifyUser?: boolean;
  } = {},
) {
  let stored: string | null = null;
  let randoms = 0;
  const calls: { url: string; body?: unknown }[] = [];
  const request = vi.fn(async (url: string, init?: RequestInit) => {
    const raw = typeof init?.body === 'string' ? init.body : undefined;
    calls.push({ url, ...(raw && raw.startsWith('{') ? { body: JSON.parse(raw) } : {}) });
    if (url === `${RELAY}/v1/config`)
      return Response.json({
        clientId: 'client_01TEST',
        ...(options.emailCode === false ? {} : { emailCode: true }),
      });
    if (url === `${RELAY}/v1/auth/email-code`) return Response.json({ sent: true });
    if (url === `${RELAY}/v1/auth/email-code/verify`)
      return options.verifyStatus
        ? Response.json(
            { error: { code: options.verifyCode ?? 'invalid-code' } },
            { status: options.verifyStatus },
          )
        : Response.json({
            refresh_token: 'refresh-email',
            ...(options.verifyUser === false
              ? {}
              : { user: { id: 'user_alice', email: 'alice@example.com' } }),
          });
    if (url === 'https://api.workos.com/user_management/authenticate')
      return Response.json({
        refresh_token: 'refresh-browser',
        user: { id: 'user_alice', email: 'alice@example.com' },
      });
    return Response.json({}, { status: 404 });
  });
  const authorize = vi.fn(async (url: string): Promise<string | null> => {
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
      challenge: async (value) => value,
      authorize,
      now: () => 0,
      ...(collect ? { collectEmailCode: collect } : {}),
    },
  });
  return { account, calls, authorize, stored: () => (stored ? JSON.parse(stored) : null) };
}

describe('phone Connect email-code sign-in (#3464)', () => {
  it('signs in through the relay without opening the WorkOS page', async () => {
    const relay = setup(async (flow) => {
      expect(await flow.send(' alice@example.com ')).toEqual({ ok: true });
      const verified = await flow.verify('alice@example.com', '123456');
      return verified.ok ? { kind: 'signed-in', email: verified.email } : { kind: 'cancelled' };
    });
    expect(await relay.account.signIn()).toEqual({ ok: true, value: 'alice@example.com' });
    expect(relay.authorize).not.toHaveBeenCalled();
    expect(relay.calls.map((call) => call.url)).toEqual([
      `${RELAY}/v1/config`,
      `${RELAY}/v1/auth/email-code`,
      `${RELAY}/v1/auth/email-code/verify`,
    ]);
    expect(relay.calls[1]?.body).toEqual({ email: 'alice@example.com' });
    expect(relay.calls[2]?.body).toEqual({ email: 'alice@example.com', code: '123456' });
    expect(relay.stored()).toMatchObject({
      clientId: 'client_01TEST',
      refreshToken: 'refresh-email',
      subject: 'user_alice',
      email: 'alice@example.com',
    });
  });

  it('reports a wrong code and lets the user retry before finishing', async () => {
    const relay = setup(
      async (flow) => {
        expect(await flow.verify('alice@example.com', '000000')).toEqual({
          ok: false,
          code: 'invalid-code',
        });
        return { kind: 'cancelled' };
      },
      { verifyStatus: 400 },
    );
    expect(await relay.account.signIn()).toEqual({ ok: false, code: 'sign-in-cancelled' });
    expect(relay.stored()).toBeNull();
  });

  it('reports a session the phone could not save as a failed sign-in, not an unreachable server', async () => {
    const relay = setup(
      async (flow) => {
        expect(await flow.verify('alice@example.com', '123456')).toEqual({
          ok: false,
          code: 'sign-in-failed',
        });
        return { kind: 'cancelled' };
      },
      { verifyUser: false },
    );
    expect(await relay.account.signIn()).toEqual({ ok: false, code: 'sign-in-cancelled' });
    expect(relay.stored()).toBeNull();
  });

  it('opens AuthKit from the open sheet and stays there when the browser is cancelled', async () => {
    const chosen = setup(async (flow) => {
      const result = await flow.browser();
      return result.ok ? { kind: 'signed-in', email: result.email } : { kind: 'cancelled' };
    });
    expect(await chosen.account.signIn()).toEqual({ ok: true, value: 'alice@example.com' });
    expect(chosen.authorize).toHaveBeenCalledOnce();
    expect(chosen.stored()).toMatchObject({ refreshToken: 'refresh-browser' });
    expect(new URL(chosen.authorize.mock.calls[0]![0]).searchParams.get('provider')).toBe(
      'authkit',
    );

    const apple = setup(async (flow) => {
      apple.authorize.mockResolvedValueOnce(null);
      expect(await flow.browser('AppleOAuth')).toEqual({ ok: false, code: 'cancelled' });
      expect(apple.stored()).toBeNull();
      const result = await flow.browser('AppleOAuth');
      return result.ok ? { kind: 'signed-in', email: result.email } : { kind: 'cancelled' };
    });
    expect(await apple.account.signIn()).toEqual({ ok: true, value: 'alice@example.com' });
    expect(apple.authorize).toHaveBeenCalledTimes(2);
    const url = new URL(apple.authorize.mock.calls[1]![0]);
    expect(url.searchParams.get('provider')).toBe('AppleOAuth');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');

    const broken = setup(async (flow) => {
      broken.authorize.mockResolvedValueOnce(`${REDIRECT}?code=x&state=wrong`);
      expect(await flow.browser('GoogleOAuth')).toEqual({ ok: false, code: 'sign-in-failed' });
      return { kind: 'cancelled' };
    });
    expect(await broken.account.signIn()).toEqual({ ok: false, code: 'sign-in-cancelled' });
  });

  it('uses AuthKit directly when the relay lacks the email-code route', async () => {
    const collect = vi.fn();
    const older = setup(collect, { emailCode: false });
    expect(await older.account.signIn()).toEqual({ ok: true, value: 'alice@example.com' });
    expect(collect).not.toHaveBeenCalled();
  });
});

describe('email-code sheet bridge', () => {
  it('hands one request to the sheet and cancels a superseded one', async () => {
    const flow = {} as EmailCodeFlow;
    const present = vi.fn();
    const first = startEmailCodeSignIn(flow, present);
    const second = startEmailCodeSignIn(flow, present);
    expect(await first).toEqual({ kind: 'cancelled' });
    expect(present).toHaveBeenCalledTimes(2);
    takeEmailCodeSignIn()?.finish({ kind: 'signed-in', email: 'a@b.co' });
    expect(await second).toEqual({ kind: 'signed-in', email: 'a@b.co' });
    expect(takeEmailCodeSignIn()).toBeUndefined();
  });
});
