import { MOBILE_REDIRECT_URI, type InstanceConfig } from './instance-contract';
import type { Session, Entry, Identity } from './client-storage';
import { record, fail, requestJson } from './client-transport';
import type { CloudRuntime } from './client';

export function tokenPair(value: unknown): Session {
  const v = record(value);
  if (
    typeof v.access_token !== 'string' ||
    !v.access_token ||
    v.access_token.length > 16384 ||
    typeof v.refresh_token !== 'string' ||
    !v.refresh_token ||
    v.refresh_token.length > 16384
  )
    return fail('INVALID_RESPONSE');
  return { accessToken: v.access_token, refreshToken: v.refresh_token };
}

export function callbackCode(url: string, state: string): string {
  let callback: URL;
  try {
    callback = new URL(url);
  } catch {
    return fail('INVALID_CALLBACK');
  }
  if (
    url.split('?')[0] !== MOBILE_REDIRECT_URI ||
    callback.hash ||
    callback.searchParams.getAll('state').length !== 1 ||
    callback.searchParams.get('state') !== state
  )
    return fail('INVALID_CALLBACK');
  if (callback.searchParams.has('error')) return fail('LOGIN_DENIED');
  const code = callback.searchParams.get('code');
  if (callback.searchParams.getAll('code').length !== 1 || !code || code.length > 4096)
    return fail('INVALID_CALLBACK');
  return code;
}
export function nearExpiry(token: string, now: number): boolean {
  try {
    const part = token.split('.')[1];
    if (!part) return true;
    const v = record(JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))));
    return typeof v.exp !== 'number' || v.exp * 1000 <= now + 30000;
  } catch {
    return true;
  }
}

export async function login(
  {
    rt,
    getEntry,
    discovery,
    json,
    acceptTokens,
    me,
  }: {
    rt: CloudRuntime;
    getEntry(id: string): Entry;
    discovery(config: InstanceConfig): Promise<void>;
    json(url: string, init: RequestInit): ReturnType<typeof requestJson>;
    acceptTokens(entry: Entry, value: unknown): Promise<Entry>;
    me(entry: Entry): Promise<Identity>;
  },
  id: string,
): Promise<Identity> {
  let entry = getEntry(id);
  if (entry.session) return fail('ALREADY_LOGGED_IN');
  await discovery(entry.config);
  const verifier = rt.random(),
    state = rt.random(),
    challenge = await rt.challenge(verifier);
  const deadline = rt.now() + 10 * 60 * 1000;
  const url = new URL('https://api.workos.com/user_management/authorize');
  url.search = new URLSearchParams({
    client_id: entry.config.auth.clientId,
    provider: 'authkit',
    response_type: 'code',
    redirect_uri: MOBILE_REDIRECT_URI,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    max_age: '0',
  }).toString();
  const callback = await rt.authorize(url.href, MOBILE_REDIRECT_URI);
  if (!callback) return fail('LOGIN_CANCELLED');
  if (rt.now() >= deadline) return fail('LOGIN_EXPIRED');
  const code = callbackCode(callback, state);
  await discovery(entry.config);
  const r = await json(entry.config.auth.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: entry.config.auth.clientId,
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: MOBILE_REDIRECT_URI,
    }).toString(),
  });
  if (!r.ok) return fail('LOGIN_FAILED');
  entry = await acceptTokens(entry, r.value);
  return me(entry);
}
