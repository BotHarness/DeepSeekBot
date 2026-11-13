import {
  connectionDiagnostic,
  networkDiagnosticReason,
  type ConnectionDiagnostic,
  type ConnectionPhase,
} from './connection-diagnostic';
import type { AccountOwner } from './account-owner';
import { relayFailureDetail } from './pairing-detail';
import { checkRoute, isConnectRoute } from './route';
import type { PairingPayload } from './pairing';

export const CONNECT_RELAY = 'https://connect.botharness.ai';
const AUTHORIZE_ENDPOINT = 'https://api.workos.com/user_management/authorize';
const TOKEN_ENDPOINT = 'https://api.workos.com/user_management/authenticate';
const SIGN_IN_MS = 10 * 60 * 1000;

export interface ConnectRuntime {
  read(): Promise<string | null>;
  write(value: string | null): Promise<void>;
  request(url: string, init?: RequestInit): Promise<Response>;
  random(): string;
  challenge(verifier: string): Promise<string>;
  authorize(url: string, callback: string): Promise<string | null>;
  now(): number;
  collectEmailCode?(flow: EmailCodeFlow): Promise<EmailCodeOutcome>;
}

export type EmailCodeRefusal =
  | 'invalid-email'
  | 'invalid-code'
  | 'invalid-credentials'
  | 'sign-up-failed'
  | 'password-unavailable'
  | 'rate-limited'
  | 'use-browser-sign-in'
  | 'email-code-unavailable'
  | 'relay-unavailable'
  | 'sign-in-failed';

export type PasswordOutcome =
  | { ok: true; kind: 'signed-in'; email: string | undefined }
  | { ok: true; kind: 'verify-email' }
  | { ok: false; code: EmailCodeRefusal };

export interface PasswordFlow {
  submit(email: string, password: string, register: boolean): Promise<PasswordOutcome>;
  verify(code: string): Promise<PasswordOutcome>;
  reset(email: string): Promise<{ ok: true } | { ok: false; code: EmailCodeRefusal }>;
}

export interface EmailCodeFlow {
  password?: PasswordFlow;
  send(email: string): Promise<{ ok: true } | { ok: false; code: EmailCodeRefusal }>;
  verify(
    email: string,
    code: string,
  ): Promise<{ ok: true; email: string | undefined } | { ok: false; code: EmailCodeRefusal }>;
  browser(
    provider?: SocialProvider,
  ): Promise<
    { ok: true; email: string | undefined } | { ok: false; code: EmailCodeRefusal | 'cancelled' }
  >;
}

export type SocialProvider = 'GoogleOAuth' | 'AppleOAuth';

export type AuthSessionOpener = (
  url: string,
  callback: string,
) => Promise<{
  type: string;
  url?: string;
}>;

export type RedirectWatcher = (
  callback: string,
  onRedirect: (url: string) => void,
) => { remove(): void };

export async function authorizeWithLateRedirect(
  url: string,
  callback: string,
  open: AuthSessionOpener,
  watch: RedirectWatcher,
  graceMs: number,
  sleep: (ms: number) => Promise<void>,
): Promise<string | null> {
  const canonical = (value: string) => value.replace(/^([A-Za-z][A-Za-z0-9+.-]*):\/{2,}/u, '$1:/');
  const target = canonical(callback);
  const matches = (redirect: string) => canonical(redirect).startsWith(target);
  let redirected: string | undefined;
  const session = watch(callback, (redirect) => {
    if (redirected === undefined && matches(redirect)) redirected = redirect;
  });
  try {
    const result = await open(url, callback);
    if (result.type === 'success' && typeof result.url === 'string') return result.url;
    if (redirected !== undefined) return redirected;
    if (result.type !== 'dismiss') return null;
    let notify: ((redirect: string) => void) | undefined;
    const arrived = new Promise<string>((resolve) => {
      notify = resolve;
    });
    const retry = watch(callback, (redirect) => {
      if (matches(redirect)) notify?.(redirect);
    });
    try {
      return (await Promise.race([sleep(graceMs).then(() => undefined), arrived])) ?? null;
    } finally {
      notify = undefined;
      retry.remove();
    }
  } finally {
    session.remove();
  }
}

export function visibleBrowserRefusal(code: EmailCodeRefusal | 'cancelled'): EmailCodeRefusal {
  return code === 'cancelled' ? 'sign-in-failed' : code;
}

export function isConnectOAuthCallback(path: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:\/+oauth2redirect([?#]|$)/iu.test(path);
}

export type EmailCodeOutcome =
  | { kind: 'signed-in'; email: string | undefined }
  | { kind: 'cancelled' };

export type ConnectRefusal =
  | 'sign-in-cancelled'
  | 'sign-in-failed'
  | 'sign-in-required'
  | 'account-not-allowed'
  | 'host-offline'
  | 'host-refused'
  | 'host-not-found'
  | 'current-host'
  | 'session-unknown'
  | 'invalid-host-id'
  | 'relay-unavailable'
  | 'account-changed'
  | 'account-identity-required'
  | 'account-action-pending'
  | 'account-cleanup-failed'
  | 'account-deletion-uncertain';

export interface ConnectHost {
  id: string;
  name: string;
  hostname: string;
  online: boolean;
  sessionKnown?: boolean;
  waiting?: boolean;
}

export type ConnectResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ConnectRefusal; detail?: string; diagnostic?: ConnectionDiagnostic };

interface Session {
  clientId: string;
  refreshToken: string;
  email?: string;
  subject?: string;
  sessionId?: string;
  action?: 'signOut' | 'delete-pending' | 'delete-complete' | 'delete-local';
}

class Refused extends Error {
  constructor(
    readonly code: ConnectRefusal,
    readonly detail?: string,
    readonly context?: { phase: ConnectionPhase; status?: number },
  ) {
    super(code);
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function parseSession(text: string | null): Session | undefined {
  if (text === null) return undefined;
  try {
    const value = record(JSON.parse(text));
    if (typeof value['clientId'] !== 'string' || typeof value['refreshToken'] !== 'string')
      return undefined;
    return {
      clientId: value['clientId'],
      refreshToken: value['refreshToken'],
      ...(typeof value['subject'] === 'string' ? { subject: value['subject'] } : {}),
      ...(typeof value['sessionId'] === 'string' ? { sessionId: value['sessionId'] } : {}),
      ...(value['action'] === 'signOut' ||
      value['action'] === 'delete-pending' ||
      value['action'] === 'delete-complete' ||
      value['action'] === 'delete-local'
        ? { action: value['action'] }
        : {}),
      ...(typeof value['email'] === 'string' ? { email: value['email'] } : {}),
    };
  } catch {
    return undefined;
  }
}

export function createConnectAccount(options: {
  runtime: ConnectRuntime;
  redirectUri: string;
  relay?: string;
  removeConnections?: (owner: AccountOwner) => Promise<void>;
  listedHosts?: (hosts: readonly ConnectHost[]) => Promise<void>;
}) {
  const { runtime } = options;
  const relay = (options.relay ?? CONNECT_RELAY).replace(/\/+$/u, '');
  let queue: Promise<unknown> = Promise.resolve();
  let observedDeletion: string | undefined;

  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };

  const settle = async <T>(work: () => Promise<T>): Promise<ConnectResult<T>> => {
    try {
      return { ok: true, value: await serial(work) };
    } catch (error) {
      if (!(error instanceof Refused)) return { ok: false, code: 'relay-unavailable' };
      return {
        ok: false,
        code: error.code,
        ...(error.detail === undefined ? {} : { detail: error.detail }),
        ...(error.context === undefined
          ? {}
          : {
              diagnostic: connectionDiagnostic({
                code: error.code,
                detail: error.detail,
                ...error.context,
              }),
            }),
      };
    }
  };

  const requestPhase = (url: string): ConnectionPhase =>
    url === TOKEN_ENDPOINT
      ? 'sign-in-session'
      : url === `${relay}/v1/config`
        ? 'service-config'
        : url === `${relay}/v1/hosts`
          ? 'environment-list'
          : url.endsWith('/offer')
            ? 'pairing-offer'
            : 'account-action';

  const call = async (url: string, init?: RequestInit) => {
    let response: Response;
    try {
      response = await runtime.request(url, init);
    } catch (error) {
      throw new Refused('relay-unavailable', relayFailureDetail(networkDiagnosticReason(error)), {
        phase: requestPhase(url),
      });
    }
    const body = record(
      await response.json().catch(() => {
        throw new Refused('relay-unavailable', 'relay:invalid-response', {
          phase: requestPhase(url),
          status: response.status,
        });
      }),
    );
    return { status: response.status, body };
  };

  const form = (body: Record<string, string>): RequestInit => ({
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });

  const relayCall = async (path: string, access: string, body?: unknown, method?: string) => {
    const reply = await call(`${relay}${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: {
        authorization: `Bearer ${access}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const context = { phase: requestPhase(`${relay}${path}`), status: reply.status };
    const error = record(reply.body['error']);
    const code = error['code'];
    if (reply.status === 401) throw new Refused('sign-in-required', undefined, context);
    if (code === 'account-not-allowed')
      throw new Refused('account-not-allowed', undefined, context);
    if (code === 'host-offline')
      throw new Refused('host-offline', relayFailureDetail(code, error['cause']), context);
    if (code === 'host-refused')
      throw new Refused('host-refused', relayFailureDetail(code, error['cause']), context);
    if (reply.status === 404 && code === 'host-not-found')
      throw new Refused('host-not-found', undefined, context);
    if (reply.status === 409 && (code === 'current-host' || code === 'session-unknown'))
      throw new Refused(code, undefined, context);
    if (reply.status !== 200)
      throw new Refused(
        'relay-unavailable',
        relayFailureDetail(typeof code === 'string' ? code : `http-${reply.status}`),
        context,
      );
    return reply.body;
  };

  const save = async (session: Session | undefined) => {
    try {
      await runtime.write(session === undefined ? null : JSON.stringify(session));
    } catch {
      throw new Refused('sign-in-failed');
    }
  };

  const owner = (session: Session): AccountOwner | undefined =>
    session.subject === undefined
      ? undefined
      : {
          issuer: 'https://api.workos.com',
          relay,
          clientId: session.clientId,
          subject: session.subject,
        };
  const key = async (session: Session) =>
    session.sessionId ??
    runtime.challenge(JSON.stringify([session.clientId, session.refreshToken]));
  const current = async (expected: string): Promise<Session> => {
    const session = parseSession(await runtime.read());
    if (!session || (await key(session)) !== expected) throw new Refused('account-changed');
    return session;
  };
  const finish = async (session: Session) => {
    try {
      const account = owner(session);
      if (account) await options.removeConnections?.(account);
      await save(undefined);
      observedDeletion = undefined;
    } catch {
      throw new Refused('account-cleanup-failed');
    }
  };

  const signedIn = async (
    clientId: string,
    reply: { status: number; body: Record<string, unknown> },
  ): Promise<string | undefined> => {
    const refreshToken = reply.body['refresh_token'];
    if (reply.status !== 200 || typeof refreshToken !== 'string')
      throw new Refused('sign-in-failed');
    const email = record(reply.body['user'])['email'];
    const subject = record(reply.body['user'])['id'];
    if (typeof subject !== 'string' || !subject) throw new Refused('sign-in-failed');
    await save({
      clientId,
      refreshToken,
      subject,
      sessionId: runtime.random(),
      ...(typeof email === 'string' ? { email } : {}),
    });
    return typeof email === 'string' ? email : undefined;
  };

  const authKit = async (
    clientId: string,
    provider: SocialProvider | 'authkit',
  ): Promise<string | undefined> => {
    const verifier = runtime.random();
    const state = runtime.random();
    const deadline = runtime.now() + SIGN_IN_MS;
    const url = new URL(AUTHORIZE_ENDPOINT);
    url.search = new URLSearchParams({
      client_id: clientId,
      provider,
      response_type: 'code',
      redirect_uri: options.redirectUri,
      state,
      code_challenge: await runtime.challenge(verifier),
      code_challenge_method: 'S256',
      max_age: '0',
    }).toString();
    const callback = await runtime.authorize(url.href, options.redirectUri);
    if (callback === null) throw new Refused('sign-in-cancelled');
    if (runtime.now() >= deadline) throw new Refused('sign-in-failed');
    let code: string | null;
    try {
      const params = new URL(callback).searchParams;
      code = params.get('state') === state ? params.get('code') : null;
    } catch {
      code = null;
    }
    if (code === null) throw new Refused('sign-in-failed');
    const reply = await call(
      TOKEN_ENDPOINT,
      form({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        code_verifier: verifier,
        redirect_uri: options.redirectUri,
      }),
    );
    return signedIn(clientId, reply);
  };

  const emailRefusal = (body: Record<string, unknown>): EmailCodeRefusal => {
    const code = record(body['error'])['code'];
    return code === 'invalid-email' ||
      code === 'invalid-code' ||
      code === 'invalid-credentials' ||
      code === 'sign-up-failed' ||
      code === 'password-unavailable' ||
      code === 'rate-limited' ||
      code === 'use-browser-sign-in' ||
      code === 'email-code-unavailable'
      ? code
      : 'relay-unavailable';
  };

  const emailCodeFlow = (
    clientId: string,
    passwordEnabled: boolean,
    active: () => boolean,
  ): EmailCodeFlow => {
    const post = async (path: string, body: Record<string, string>) => {
      try {
        return await call(`${relay}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch {
        return { status: 0, body: {} };
      }
    };
    let pendingToken: string | undefined;
    const passwordResult = async (
      reply: Awaited<ReturnType<typeof post>>,
    ): Promise<PasswordOutcome> => {
      if (!active()) return { ok: false, code: 'sign-in-failed' };
      if (reply.status !== 200) return { ok: false, code: emailRefusal(reply.body) };
      if (
        reply.body['verification_required'] === true &&
        typeof reply.body['pending_authentication_token'] === 'string'
      ) {
        pendingToken = reply.body['pending_authentication_token'];
        return { ok: true, kind: 'verify-email' };
      }
      try {
        const email = await signedIn(clientId, reply);
        pendingToken = undefined;
        return { ok: true, kind: 'signed-in', email };
      } catch {
        return { ok: false, code: 'sign-in-failed' };
      }
    };
    return {
      ...(passwordEnabled
        ? {
            password: {
              async submit(
                email: string,
                password: string,
                register: boolean,
              ): Promise<PasswordOutcome> {
                if (!active()) return { ok: false, code: 'sign-in-failed' };
                pendingToken = undefined;
                return passwordResult(
                  await post(`/v1/auth/password${register ? '/register' : ''}`, {
                    email: email.trim(),
                    password,
                  }),
                );
              },
              async verify(code: string): Promise<PasswordOutcome> {
                if (!active()) return { ok: false, code: 'sign-in-failed' };
                if (!pendingToken) return { ok: false, code: 'invalid-code' };
                return passwordResult(
                  await post('/v1/auth/password/verify', { pendingToken, code: code.trim() }),
                );
              },
              async reset(email: string) {
                if (!active()) return { ok: false as const, code: 'sign-in-failed' as const };
                const reply = await post('/v1/auth/password/reset', { email: email.trim() });
                return reply.status === 200
                  ? { ok: true as const }
                  : { ok: false as const, code: emailRefusal(reply.body) };
              },
            },
          }
        : {}),
      async send(email) {
        const reply = await post('/v1/auth/email-code', { email: email.trim() });
        return reply.status === 200 ? { ok: true } : { ok: false, code: emailRefusal(reply.body) };
      },
      async verify(email, code) {
        const reply = await post('/v1/auth/email-code/verify', {
          email: email.trim(),
          code: code.trim(),
        });
        if (reply.status !== 200) return { ok: false, code: emailRefusal(reply.body) };
        try {
          return { ok: true, email: await signedIn(clientId, reply) };
        } catch (error) {
          return {
            ok: false,
            code:
              error instanceof Refused && error.code === 'relay-unavailable'
                ? 'relay-unavailable'
                : 'sign-in-failed',
          };
        }
      },
      async browser(provider) {
        try {
          return { ok: true, email: await authKit(clientId, provider ?? 'authkit') };
        } catch (error) {
          const code = error instanceof Refused ? error.code : undefined;
          if (code === 'sign-in-cancelled') return { ok: false, code: 'cancelled' };
          return { ok: false, code: code === 'relay-unavailable' ? code : 'sign-in-failed' };
        }
      },
    };
  };

  const access = async (deleting = false): Promise<string> => {
    const session = parseSession(await runtime.read().catch(() => null));
    if (session === undefined) throw new Refused('sign-in-required');
    if (session.action && !deleting) throw new Refused('account-action-pending');
    const reply = await call(
      TOKEN_ENDPOINT,
      form({
        grant_type: 'refresh_token',
        client_id: session.clientId,
        refresh_token: session.refreshToken,
      }),
    );
    const token = reply.body['access_token'];
    const rotated = reply.body['refresh_token'];
    if (typeof token !== 'string') {
      if (reply.status >= 400 && reply.status < 500) {
        if (!session.action) await save(undefined);
        throw new Refused('sign-in-required');
      }
      throw new Refused('relay-unavailable', `relay:http-${reply.status}`, {
        phase: 'sign-in-session',
        status: reply.status,
      });
    }
    const subject = record(reply.body['user'])['id'];
    if (session.subject && typeof subject === 'string' && subject !== session.subject)
      throw new Refused('account-changed');
    if (
      (typeof rotated === 'string' && rotated !== session.refreshToken) ||
      (!session.subject && typeof subject === 'string') ||
      !session.sessionId
    )
      await save({
        ...session,
        sessionId: await key(session),
        ...(typeof rotated === 'string' ? { refreshToken: rotated } : {}),
        ...(typeof subject === 'string' ? { subject } : {}),
      });
    return token;
  };

  return {
    async actionKey(): Promise<string | null> {
      const session = parseSession(await runtime.read());
      return session ? key(session) : null;
    },
    async pendingDeletion(): Promise<boolean> {
      const action = parseSession(await runtime.read())?.action;
      return (
        action === 'delete-pending' || action === 'delete-complete' || action === 'delete-local'
      );
    },
    finishLocalCleanup: (expected: string) =>
      settle(async () => {
        const session = await current(expected);
        if (!session.action || session.action === 'signOut')
          throw new Refused('account-action-pending');
        await save({ ...session, action: 'delete-local' });
        await finish(session);
      }),
    async savePairing(expected: string, savePairing: () => Promise<void>): Promise<void> {
      return serial(async () => {
        const session = await current(expected);
        if (session.action) throw new Refused('account-action-pending');
        await savePairing();
      });
    },
    async email(): Promise<string | undefined | null> {
      const session = parseSession(await runtime.read().catch(() => null));
      return session === undefined ? null : session.email;
    },

    accessToken: () => settle(() => access()),

    signIn: () =>
      settle(async () => {
        if (parseSession(await runtime.read())?.action) throw new Refused('account-action-pending');
        const config = await call(`${relay}/v1/config`);
        const clientId = config.body['clientId'];
        if (
          config.status !== 200 ||
          typeof clientId !== 'string' ||
          !/^client_[A-Za-z0-9]+$/u.test(clientId)
        )
          throw new Refused('relay-unavailable');
        if (
          (config.body['emailCode'] === true || config.body['passwordAuth'] === true) &&
          runtime.collectEmailCode
        ) {
          let active = true;
          try {
            const outcome = await runtime.collectEmailCode(
              emailCodeFlow(clientId, config.body['passwordAuth'] === true, () => active),
            );
            if (outcome.kind === 'cancelled') throw new Refused('sign-in-cancelled');
            return outcome.email;
          } finally {
            active = false;
          }
        }
        return authKit(clientId, 'authkit');
      }),

    hosts: () =>
      settle(async (): Promise<ConnectHost[]> => {
        const body = await relayCall('/v1/hosts', await access());
        const hosts = Array.isArray(body['hosts']) ? body['hosts'] : [];
        const listed = hosts.flatMap((entry): ConnectHost[] => {
          const host = record(entry);
          return typeof host['id'] === 'string' &&
            typeof host['name'] === 'string' &&
            typeof host['hostname'] === 'string'
            ? [
                {
                  id: host['id'],
                  name: host['name'],
                  hostname: host['hostname'],
                  online:
                    typeof host['connected'] === 'boolean'
                      ? host['connected']
                      : host['tunnel'] === true,
                  ...(typeof host['sessionKnown'] === 'boolean'
                    ? { sessionKnown: host['sessionKnown'] }
                    : {}),
                  ...(host['state'] === 'waiting' ? { waiting: true } : {}),
                },
              ]
            : [];
        });
        await options.listedHosts?.(listed).catch(() => undefined);
        return listed;
      }),

    revokeHost: (expected: string, hostId: string) =>
      settle(async () => {
        await current(expected);
        if (!/^h[a-z0-9]+$/u.test(hostId) || hostId.length > 255)
          throw new Refused('invalid-host-id');
        const body = await relayCall(
          `/v1/hosts/${encodeURIComponent(hostId)}/revoke`,
          await access(),
          undefined,
          'POST',
        );
        if (
          body['deleted'] !== true ||
          typeof body['sessionKnown'] !== 'boolean' ||
          typeof body['sessionRevoked'] !== 'boolean'
        )
          throw new Refused('relay-unavailable');
        return { sessionKnown: body['sessionKnown'], sessionRevoked: body['sessionRevoked'] };
      }),

    offer: (hostId: string, deviceName: string) =>
      settle(
        async (): Promise<PairingPayload & { accountOwner: AccountOwner; sessionKey: string }> => {
          const token = await access();
          const session = parseSession(await runtime.read());
          const accountOwner = session && owner(session);
          if (!session || !accountOwner) throw new Refused('account-identity-required');
          const sessionKey = await key(session);
          const verifier = runtime.random();
          const verifierHash = await runtime.challenge(verifier);
          const body = await relayCall(`/v1/hosts/${encodeURIComponent(hostId)}/offer`, token, {
            verifierHash,
            name: deviceName.slice(0, 64),
          });
          const host = record(body['host']);
          const encryption = record(body['encryption']);
          const enrollment = record(body['enrollment']);
          const route =
            typeof body['hostname'] === 'string'
              ? checkRoute(`https://${body['hostname']}`)
              : undefined;
          if (
            encryption['protocol'] !== 'connect-noise-xk-v1' ||
            typeof encryption['publicKey'] !== 'string' ||
            !/^[0-9a-f]{64}$/u.test(encryption['publicKey']) ||
            typeof enrollment['body'] !== 'string' ||
            typeof enrollment['signature'] !== 'string' ||
            typeof body['expiresAt'] !== 'string' ||
            route?.ok !== true ||
            !isConnectRoute(route.origin) ||
            new URL(route.origin).hostname !== body['hostname'] ||
            typeof host['id'] !== 'string' ||
            typeof host['name'] !== 'string'
          )
            throw new Refused('relay-unavailable', 'relay:invalid-response', {
              phase: 'pairing-offer',
              status: 200,
            });
          return {
            accountOwner,
            sessionKey,
            host: { id: host['id'], name: host['name'] },
            offer: '',
            encryption: { protocol: 'connect-noise-xk-v1', publicKey: encryption['publicKey'] },
            enrollment: { body: enrollment['body'], signature: enrollment['signature'] },
            routes: [route.origin],
            expiresAt: body['expiresAt'],
            verifier,
          };
        },
      ),

    deleteAccount: (expected: string) =>
      settle(async () => {
        let session = await current(expected);
        if (session.action === 'signOut' || session.action === 'delete-local')
          throw new Refused('account-action-pending');
        if (observedDeletion === expected) {
          session = { ...session, action: 'delete-complete' };
          try {
            await save(session);
          } catch {
            throw new Refused('account-cleanup-failed');
          }
        }
        if (session.action !== 'delete-complete') {
          let token: string;
          try {
            token = await access(true);
          } catch (error) {
            if (session.action === 'delete-pending')
              throw new Refused('account-deletion-uncertain');
            throw error;
          }
          session = parseSession(await runtime.read())!;
          await save({ ...session, action: 'delete-pending' });
          let reply: Awaited<ReturnType<typeof call>>;
          try {
            reply = await call(`${relay}/v1/account`, {
              method: 'DELETE',
              headers: { authorization: `Bearer ${token}` },
            });
          } catch {
            throw new Refused('account-deletion-uncertain');
          }
          if (reply.status !== 200 || reply.body['deleted'] !== true) {
            const rejected =
              reply.status === 401 ||
              reply.status === 403 ||
              (reply.status === 503 &&
                record(reply.body['error'])['code'] === 'account-deletion-unavailable');
            if (rejected && session.action !== 'delete-pending') {
              await save(session);
              throw new Refused(reply.status === 401 ? 'sign-in-required' : 'relay-unavailable');
            }
            throw new Refused('account-deletion-uncertain');
          }
          observedDeletion = await key(session);
          session = { ...session, action: 'delete-complete' };
          try {
            await save(session);
          } catch {
            throw new Refused('account-cleanup-failed');
          }
        }
        await finish(session);
      }),

    signOut: (expected: string) =>
      settle(async () => {
        const session = await current(expected);
        if (session.action && session.action !== 'signOut')
          throw new Refused('account-action-pending');
        await save({ ...session, action: 'signOut' });
        await finish(session);
      }),
  };
}

export type ConnectAccount = ReturnType<typeof createConnectAccount>;
