import { z } from 'zod';

import { ConnectorError } from './errors.js';
import type { ConnectorAccess } from './store.js';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const READ_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/contacts.readonly',
];
const WRITE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar.events.owned',
];

export const GOOGLE_SERVICE = 'google_workspace';
export const GOOGLE_NAME = 'Google Workspace';
export const GOOGLE_STATE_PREFIX = 'google.';
export const GOOGLE_ACCESS_TOKEN_REFUSAL =
  'Google access tokens expire after about an hour. Add a Google OAuth client ID and client secret, then sign in so this Host can refresh access.';
export const googleClientSchema = z.object({
  clientId: z
    .string()
    .max(256)
    .regex(/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/),
  clientSecret: z.string().regex(/^[A-Za-z0-9_-]{8,512}$/),
});
export const googleLoginRequired = 'Sign in to this Google Workspace account again.';
const PROFILE = z.object({
  sub: z.string().regex(/^\d{1,255}$/),
  email: z.email().max(320),
});
const TOKEN = z.object({
  access_token: z.string().min(1).max(4096),
  refresh_token: z.string().min(1).max(4096).optional(),
  expires_in: z.number().int().positive().max(86_400),
  scope: z.string().max(4096).optional(),
});

export type GoogleClient = z.infer<typeof googleClientSchema>;
export type GoogleToken = z.infer<typeof TOKEN>;

export function googleRedirectUri(origin: string | undefined, path: string): string | undefined {
  if (origin === undefined) return undefined;
  const url = new URL(origin);
  return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    ? new URL(path, url).toString()
    : undefined;
}

export function googleScopes(access: ConnectorAccess): string[] {
  return access === 'write' ? [...READ_SCOPES, ...WRITE_SCOPES] : READ_SCOPES.slice();
}

export function googleGrantedAccess(scope: string): ConnectorAccess | undefined {
  const granted = new Set(scope.split(/\s+/));
  if (granted.has('email')) granted.add('https://www.googleapis.com/auth/userinfo.email');
  if (!READ_SCOPES.every((read) => granted.has(read))) return undefined;
  return WRITE_SCOPES.every((write) => granted.has(write)) ? 'write' : 'read';
}

export function googleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  access: ConnectorAccess;
  state: string;
  challenge: string;
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: googleScopes(input.access).join(' '),
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'select_account consent',
  }).toString();
  return url.toString();
}

async function googleFetch(fetcher: typeof fetch, url: string | URL, init: RequestInit) {
  const timeout = AbortSignal.timeout(15_000);
  try {
    return await fetcher(url, {
      ...init,
      redirect: 'error',
      signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
    });
  } catch {
    init.signal?.throwIfAborted();
    throw new ConnectorError('upstream', 'Google could not be reached.');
  }
}

export async function googleJson<T>(
  fetcher: typeof fetch,
  url: string | URL,
  init: RequestInit,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await googleFetch(fetcher, url, init);
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new ConnectorError('upstream', `Google rejected the request (HTTP ${response.status}).`);
  }
  const value: unknown = await response.json().catch(() => undefined);
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ConnectorError('upstream', 'Google returned an invalid response.');
  return parsed.data;
}

export function googleToken(
  fetcher: typeof fetch,
  client: GoogleClient,
  fields: Record<string, string>,
): Promise<GoogleToken> {
  return googleJson(
    fetcher,
    TOKEN_URL,
    {
      method: 'POST',
      body: new URLSearchParams({
        ...fields,
        client_id: client.clientId,
        client_secret: client.clientSecret,
      }),
    },
    TOKEN,
  );
}

export function googleProfile(
  fetcher: typeof fetch,
  token: string,
): Promise<z.infer<typeof PROFILE>> {
  return googleJson(
    fetcher,
    USERINFO_URL,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
    PROFILE,
  );
}

export async function revokeGoogleToken(
  fetcher: typeof fetch,
  refreshToken: string,
): Promise<void> {
  const response = await googleFetch(fetcher, REVOKE_URL, {
    method: 'POST',
    body: new URLSearchParams({ token: refreshToken }),
  });
  await response.body?.cancel();
}
