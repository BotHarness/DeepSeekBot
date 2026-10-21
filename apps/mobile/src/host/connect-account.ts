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
  | 'relay-unavailable';

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
}) {
  const { runtime } = options;
  const relay = (options.relay ?? CONNECT_RELAY).replace(/\/+$/u, '');
  let queue: Promise<unknown> = Promise.resolve();

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

  const relayCall = async (path: string, access: string, body?: unknown) => {
    const reply = await call(`${relay}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
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

  const access = async (): Promise<string> => {
    const session = parseSession(await runtime.read().catch(() => null));
    if (session === undefined) throw new Refused('sign-in-required');
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
        await save(undefined);
        throw new Refused('sign-in-required');
      }
      throw new Refused('relay-unavailable');
    }
    if (typeof rotated === 'string' && rotated !== session.refreshToken)
      await save({ ...session, refreshToken: rotated });
    return token;
  };

  return {
    async email(): Promise<string | undefined | null> {
      const session = parseSession(await runtime.read().catch(() => null));
      return session === undefined ? null : session.email;
    },

    signIn: () =>
      settle(async () => {
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
        await save({ clientId, refreshToken, ...(typeof email === 'string' ? { email } : {}) });
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
      settle(async (): Promise<PairingPayload> => {
        const verifier = runtime.random();
        const verifierHash = await runtime.challenge(verifier);
        const body = await relayCall(
          `/v1/hosts/${encodeURIComponent(hostId)}/offer`,
          await access(),
          { verifierHash, name: deviceName.slice(0, 64) },
        );
        const host = record(body['host']);
        if (
          typeof body['offer'] !== 'string' ||
          typeof body['expiresAt'] !== 'string' ||
          typeof body['hostname'] !== 'string' ||
          typeof host['id'] !== 'string' ||
          typeof host['name'] !== 'string'
        )
          throw new Refused('relay-unavailable');
        return {
          host: { id: host['id'], name: host['name'] },
          offer: body['offer'],
          routes: [`https://${body['hostname']}`],
          expiresAt: body['expiresAt'],
          verifier,
        };
      }),

    signOut: () => serial(() => save(undefined)),
  };
}

export type ConnectAccount = ReturnType<typeof createConnectAccount>;
