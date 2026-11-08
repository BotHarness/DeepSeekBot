import { describe, expect, it, vi } from 'vitest';

import {
  authorizeWithLateRedirect,
  createConnectAccount,
  isConnectOAuthCallback,
  visibleBrowserRefusal,
  type AuthSessionOpener,
  type EmailCodeFlow,
  type EmailCodeOutcome,
  type EmailCodeRefusal,
  type RedirectWatcher,
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

describe('auth session late redirects (#3732)', () => {
  const URL = 'https://auth.test/start';
  const CALLBACK = 'myapp:/oauth2redirect';
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  function harness(open: AuthSessionOpener, sleep?: (ms: number) => Promise<void>) {
    const handlers: Array<(url: string) => void> = [];
    const removed: Array<string> = [];
    const seen: string[] = [];
    const watch: RedirectWatcher = (callback, onRedirect) => {
      seen.push(callback);
      handlers.push(onRedirect);
      const id = `${seen.length}`;
      return {
        remove: () => {
          removed.push(id);
        },
      };
    };
    const run = (graceMs = 1500) =>
      authorizeWithLateRedirect(
        URL,
        CALLBACK,
        open,
        watch,
        graceMs,
        sleep ?? (() => sleepForever()),
      );
    return { handlers, removed, seen, run };
  }

  function sleepForever(): Promise<void> {
    return new Promise(() => undefined);
  }

  it('returns the session url on success without waiting', async () => {
    const sleep = vi.fn(async () => undefined);
    const opened: string[] = [];
    const session = harness(async (url, callback) => {
      opened.push(`${url} ${callback}`);
      return { type: 'success', url: `${CALLBACK}?code=auth&state=live` };
    }, sleep);
    expect(await session.run()).toBe(`${CALLBACK}?code=auth&state=live`);
    expect(opened).toEqual([`${URL} ${CALLBACK}`]);
    expect(sleep).not.toHaveBeenCalled();
    expect(session.removed).toEqual(['1']);
  });

  it('uses a redirect captured while the session is open when the session is dismissed', async () => {
    let resolveOpen: ((result: { type: string }) => void) | undefined;
    const session = harness(
      () =>
        new Promise<{ type: string }>((resolve) => {
          resolveOpen = resolve;
        }),
    );
    const pending = session.run();
    await flush();
    expect(session.handlers).toHaveLength(1);
    session.handlers[0]!(`${CALLBACK}?code=early&state=live`);
    resolveOpen!({ type: 'dismiss' });
    expect(await pending).toBe(`${CALLBACK}?code=early&state=live`);
    expect(session.removed).toEqual(['1']);
  });

  it('waits out the grace period for a redirect that lands just after dismiss', async () => {
    let resolveOpen: ((result: { type: string }) => void) | undefined;
    const session = harness(
      () =>
        new Promise<{ type: string }>((resolve) => {
          resolveOpen = resolve;
        }),
    );
    const pending = session.run();
    await flush();
    resolveOpen!({ type: 'dismiss' });
    await flush();
    expect(session.handlers).toHaveLength(2);
    session.handlers[1]!(`${CALLBACK}?code=late&state=live`);
    expect(await pending).toBe(`${CALLBACK}?code=late&state=live`);
    expect(session.removed).toEqual(['2', '1']);
  });

  it('returns null when the grace period expires with no redirect', async () => {
    const session = harness(
      async () => ({ type: 'dismiss' }),
      async () => undefined,
    );
    expect(await session.run(5)).toBeNull();
    expect(session.removed).toEqual(['2', '1']);
  });

  it('captures a redirect whose slashes the platform normalized', async () => {
    let resolveOpen: ((result: { type: string }) => void) | undefined;
    const session = harness(
      () =>
        new Promise<{ type: string }>((resolve) => {
          resolveOpen = resolve;
        }),
    );
    const pending = session.run();
    await flush();
    const arrived = `${CALLBACK.replace(':/', '://')}?code=slash&state=live`;
    session.handlers[0]!(arrived);
    resolveOpen!({ type: 'dismiss' });
    expect(await pending).toBe(arrived);
    expect(session.removed).toEqual(['1']);
  });

  it('ignores urls for other targets', async () => {
    let resolveOpen: ((result: { type: string }) => void) | undefined;
    const session = harness(
      () =>
        new Promise<{ type: string }>((resolve) => {
          resolveOpen = resolve;
        }),
      async () => undefined,
    );
    const pending = session.run();
    await flush();
    session.handlers[0]!('otherapp:/oauth2redirect?code=x&state=y');
    resolveOpen!({ type: 'dismiss' });
    expect(await pending).toBeNull();
    expect(session.removed).toEqual(['2', '1']);
  });

  it('returns null immediately on cancel without waiting', async () => {
    const sleep = vi.fn(async () => undefined);
    const session = harness(async () => ({ type: 'cancel' }), sleep);
    expect(await session.run()).toBeNull();
    expect(sleep).not.toHaveBeenCalled();
    expect(session.removed).toEqual(['1']);
  });

  it('watches the authorize callback', async () => {
    const session = harness(async () => ({ type: 'locked' }));
    expect(await session.run()).toBeNull();
    expect(session.seen).toEqual([CALLBACK]);
  });
});

describe('browser cancel display (#3732)', () => {
  it('shows a failed sign-in instead of staying silent when the browser is cancelled', () => {
    expect(visibleBrowserRefusal('cancelled')).toBe('sign-in-failed');
  });

  it('keeps every other refusal as-is', () => {
    const codes: EmailCodeRefusal[] = [
      'invalid-email',
      'invalid-code',
      'rate-limited',
      'use-browser-sign-in',
      'email-code-unavailable',
      'relay-unavailable',
      'sign-in-failed',
    ];
    for (const code of codes) expect(visibleBrowserRefusal(code)).toBe(code);
  });
});

describe('OAuth callback routing (#3734)', () => {
  it('recognizes the Connect callback in single- and double-slash forms', () => {
    for (const target of [
      'ai.botharness.deepseekbot.dev:/oauth2redirect?code=a&state=b',
      'ai.botharness.deepseekbot.dev://oauth2redirect?code=a&state=b',
      'ai.botharness.deepseekbot.dev:/oauth2redirect',
      'ai.botharness.deepseekbot.dev://oauth2redirect#code=a',
      'AI.BOTHARNESS.DEEPSEKBOT.DEV://oauth2redirect?code=a&state=b',
    ])
      expect(isConnectOAuthCallback(target)).toBe(true);
  });

  it('leaves every other intent alone', () => {
    for (const target of [
      '',
      '/',
      'deepseekbot://pair?p=host',
      'ai.botharness.deepseekbot.dev://cloud-join?link=x',
      'ai.botharness.deepseekbot.dev://oauth2redirect.evil.example',
      'ai.botharness.deepseekbot.dev:/oauth2redirect-extra?code=a',
      'https://example.test/oauth2redirect?code=a',
    ])
      expect(isConnectOAuthCallback(target)).toBe(false);
  });
});
