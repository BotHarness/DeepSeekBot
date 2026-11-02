import type { AccountOwner } from './account-owner';
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
}

export type ConnectRefusal =
  | 'sign-in-cancelled'
  | 'sign-in-failed'
  | 'sign-in-required'
  | 'account-not-allowed'
  | 'host-offline'
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
}

export type ConnectResult<T> = { ok: true; value: T } | { ok: false; code: ConnectRefusal };

interface Session {
  clientId: string;
  refreshToken: string;
  email?: string;
  subject?: string;
  sessionId?: string;
  action?: 'signOut' | 'delete-pending' | 'delete-complete' | 'delete-local';
}

class Refused extends Error {
  constructor(readonly code: ConnectRefusal) {
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
      return { ok: false, code: error instanceof Refused ? error.code : 'relay-unavailable' };
    }
  };

  const call = async (url: string, init?: RequestInit) => {
    let response: Response;
    try {
      response = await runtime.request(url, init);
    } catch {
      throw new Refused('relay-unavailable');
    }
    const body = record(await response.json().catch(() => ({})));
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
    const code = record(reply.body['error'])['code'];
    if (reply.status === 401) throw new Refused('sign-in-required');
    if (code === 'account-not-allowed') throw new Refused('account-not-allowed');
    if (code === 'host-offline' || code === 'host-refused') throw new Refused('host-offline');
    if (reply.status !== 200) throw new Refused('relay-unavailable');
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
      throw new Refused('relay-unavailable');
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
        const verifier = runtime.random();
        const state = runtime.random();
        const deadline = runtime.now() + SIGN_IN_MS;
        const url = new URL(AUTHORIZE_ENDPOINT);
        url.search = new URLSearchParams({
          client_id: clientId,
          provider: 'authkit',
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
      }),

    hosts: () =>
      settle(async (): Promise<ConnectHost[]> => {
        const body = await relayCall('/v1/hosts', await access());
        const hosts = Array.isArray(body['hosts']) ? body['hosts'] : [];
        return hosts.flatMap((entry) => {
          const host = record(entry);
          return typeof host['id'] === 'string' &&
            typeof host['name'] === 'string' &&
            typeof host['hostname'] === 'string'
            ? [
                {
                  id: host['id'],
                  name: host['name'],
                  hostname: host['hostname'],
                  online: host['tunnel'] === true,
                },
              ]
            : [];
        });
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
            throw new Refused('relay-unavailable');
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
