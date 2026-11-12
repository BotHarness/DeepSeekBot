import { describe, expect, it, vi } from 'vitest';
import {
  createConnectAccount,
  type EmailCodeFlow,
  type EmailCodeOutcome,
} from '../src/host/connect-account';

function setup(
  collect: (flow: EmailCodeFlow) => Promise<EmailCodeOutcome>,
  responses: Record<string, unknown>,
  enabled = true,
) {
  let saved: string | null = null;
  const request = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.endsWith('/v1/config'))
      return Response.json({
        clientId: 'client_test',
        emailCode: true,
        ...(enabled ? { passwordAuth: true } : {}),
      });
    const body = responses[new URL(url).pathname];
    return Response.json(body ?? {}, { status: body ? 200 : 404 });
  });
  const account = createConnectAccount({
    relay: 'https://relay.test',
    redirectUri: 'test:/oauth2redirect',
    runtime: {
      read: async () => saved,
      write: async (value) => {
        saved = value;
      },
      request,
      random: () => 'random',
      challenge: async () => 'challenge',
      authorize: async () => null,
      now: () => 0,
      collectEmailCode: collect,
    },
  });
  return { account, request, saved: () => saved };
}
const session = {
  refresh_token: 'test-refresh',
  user: { id: 'user_same', email: 'a@example.org' },
};

describe('native password sign-in session', () => {
  it('completes registration and email verification without persisting either password or pending token', async () => {
    const sut = setup(
      async (flow) => {
        expect(await flow.password!.submit(' a@example.org ', 'exact password ', true)).toEqual({
          ok: true,
          kind: 'verify-email',
        });
        expect(sut.saved()).toBeNull();
        const result = await flow.password!.verify('123456');
        expect(result).toEqual({ ok: true, kind: 'signed-in', email: 'a@example.org' });
        return { kind: 'signed-in', email: 'a@example.org' };
      },
      {
        '/v1/auth/password/register': {
          verification_required: true,
          pending_authentication_token: 'private-pending',
        },
        '/v1/auth/password/verify': session,
      },
    );
    expect(await sut.account.signIn()).toEqual({ ok: true, value: 'a@example.org' });
    expect(JSON.parse(sut.saved()!)).toMatchObject({
      subject: 'user_same',
      refreshToken: 'test-refresh',
      clientId: 'client_test',
    });
    expect(sut.saved()).not.toMatch(/password|private-pending/);
    expect(JSON.parse(String(sut.request.mock.calls[1]?.[1]?.body))).toEqual({
      email: 'a@example.org',
      password: 'exact password ',
    });
    expect(JSON.parse(String(sut.request.mock.calls[2]?.[1]?.body))).toEqual({
      pendingToken: 'private-pending',
      code: '123456',
    });
  });
  it('uses the same identity for an existing password account', async () => {
    const sut = setup(
      async (flow) => {
        const result = await flow.password!.submit('a@example.org', 'password', false);
        return result.ok && result.kind === 'signed-in'
          ? { kind: 'signed-in', email: result.email }
          : { kind: 'cancelled' };
      },
      { '/v1/auth/password': session },
    );
    expect((await sut.account.signIn()).ok).toBe(true);
    expect(JSON.parse(sut.saved()!).subject).toBe('user_same');
  });
  it('does not expose password actions on older relays', async () => {
    const sut = setup(
      async (flow) => {
        expect(flow.password).toBeUndefined();
        return { kind: 'cancelled' };
      },
      {},
      false,
    );
    await sut.account.signIn();
  });
  it('does not save a response from a dismissed password flow', async () => {
    let flow: EmailCodeFlow | undefined;
    const sut = setup(
      async (value) => {
        flow = value;
        return { kind: 'cancelled' };
      },
      { '/v1/auth/password': session },
    );
    expect(await sut.account.signIn()).toEqual({ ok: false, code: 'sign-in-cancelled' });
    expect(await flow!.password!.submit('a@example.org', 'password', false)).toEqual({
      ok: false,
      code: 'sign-in-failed',
    });
    expect(sut.saved()).toBeNull();
  });
  it('ignores an in-flight password response after dismissal', async () => {
    let completeRequest: (response: Response) => void = () => {};
    let pending: Promise<unknown> | undefined;
    const response = new Promise<Response>((resolve) => {
      completeRequest = resolve;
    });
    const sut = setup(async (flow) => {
      sut.request.mockImplementationOnce(() => response);
      pending = flow.password!.submit('a@example.org', 'password', false);
      return { kind: 'cancelled' };
    }, {});
    expect(await sut.account.signIn()).toEqual({ ok: false, code: 'sign-in-cancelled' });
    completeRequest(Response.json(session));
    expect(await pending).toEqual({ ok: false, code: 'sign-in-failed' });
    expect(sut.saved()).toBeNull();
  });
});
