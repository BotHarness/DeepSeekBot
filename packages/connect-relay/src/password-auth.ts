import { normalizeEmail, type EmailCodeOptions, type EmailCodeResult } from './email-code.js';

const API = 'https://api.workos.com/user_management';
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;
const refused = (status: number, code: string): EmailCodeResult => ({
  status,
  body: { error: { code } },
});

interface Caller {
  ip?: string;
  userAgent?: string;
}

export function createPasswordAuth(options: EmailCodeOptions) {
  const fetcher = options.fetcher ?? fetch;
  const allowed = async (operation: string, identity: string, ip?: string) => {
    if (!options.limit) return false;
    for (const key of [
      ['password-auth', operation, identity],
      ...(ip ? [['password-auth-ip', ip]] : []),
    ]) {
      if (!(await options.limit(JSON.stringify(key)))) return false;
    }
    return true;
  };
  const post = async (path: string, body: Record<string, unknown>) => {
    try {
      const response = await fetcher(`${API}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const value: unknown = await response.json().catch(() => undefined);
      const reply =
        value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
      return { status: response.status, body: reply };
    } catch {
      return { status: 502, body: {} };
    }
  };
  const caller = (input: Caller) => ({
    ...(input.ip ? { ip_address: input.ip } : {}),
    ...(input.userAgent ? { user_agent: input.userAgent.slice(0, 512) } : {}),
  });
  const authenticate = async (body: Record<string, unknown>): Promise<EmailCodeResult> => {
    const reply = await post('/authenticate', {
      client_id: options.clientId,
      client_secret: options.apiKey,
      ...body,
    });
    const user = reply.body['user'];
    if (
      reply.status === 200 &&
      text(reply.body['refresh_token'], 16384) &&
      user !== null &&
      typeof user === 'object' &&
      'id' in user &&
      typeof user.id === 'string'
    ) {
      return {
        status: 200,
        body: {
          refresh_token: reply.body['refresh_token'],
          user: {
            id: user.id,
            ...('email' in user && typeof user.email === 'string' ? { email: user.email } : {}),
          },
        },
      };
    }
    const code = reply.body['code'] ?? reply.body['error'];
    if (
      code === 'email_verification_required' &&
      text(reply.body['pending_authentication_token'], 16384)
    ) {
      return {
        status: 200,
        body: {
          verification_required: true,
          pending_authentication_token: reply.body['pending_authentication_token'],
        },
      };
    }
    if (reply.status === 429) return refused(429, 'rate-limited');
    if (code === 'authentication_method_not_allowed' || code === 'email_password_auth_disabled')
      return refused(503, 'password-unavailable');
    if (code === 'invalid_credentials' || code === 'invalid_grant')
      return refused(400, 'invalid-credentials');
    if (
      code === 'invalid_one_time_code' ||
      code === 'one_time_code_expired' ||
      code === 'one_time_code_previously_used'
    )
      return refused(400, 'invalid-code');
    if (reply.status >= 400 && reply.status < 500) return refused(409, 'use-browser-sign-in');
    return refused(502, 'workos-unavailable');
  };

  return {
    async signIn(
      input: Caller & { email: unknown; password: unknown; register?: boolean },
    ): Promise<EmailCodeResult> {
      const email = normalizeEmail(input.email);
      if (!email) return refused(400, 'invalid-email');
      if (!text(input.password, 1024)) return refused(400, 'invalid-credentials');
      if (!(await allowed('sign-in', email, input.ip))) return refused(429, 'rate-limited');
      if (input.register) {
        const created = await post('/users', {
          email,
          password: input.password,
          email_verified: false,
          ...caller(input),
        });
        if (created.status === 429) return refused(429, 'rate-limited');
        if (created.status !== 200 && created.status !== 201)
          return refused(
            created.status >= 500 ? 502 : 400,
            created.status >= 500 ? 'workos-unavailable' : 'sign-up-failed',
          );
      }
      return authenticate({
        grant_type: 'password',
        email,
        password: input.password,
        ...caller(input),
      });
    },
    async verify(
      input: Caller & { pendingToken: unknown; code: unknown },
    ): Promise<EmailCodeResult> {
      if (
        !text(input.pendingToken, 16384) ||
        typeof input.code !== 'string' ||
        !/^\d{6}$/u.test(input.code)
      )
        return refused(400, 'invalid-code');
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(input.pendingToken),
      );
      const key = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      if (!(await allowed('verify', key, input.ip))) return refused(429, 'rate-limited');
      return authenticate({
        grant_type: 'urn:workos:oauth:grant-type:email-verification:code',
        pending_authentication_token: input.pendingToken,
        code: input.code,
        ...caller(input),
      });
    },
    async reset(input: Caller & { email: unknown }): Promise<EmailCodeResult> {
      const email = normalizeEmail(input.email);
      if (!email) return refused(400, 'invalid-email');
      if (!(await allowed('reset', email, input.ip))) return refused(429, 'rate-limited');
      const reply = await post('/password_reset', { email });
      if (reply.status === 429) return refused(429, 'rate-limited');
      if (reply.status >= 500 || reply.status === 401 || reply.status === 403)
        return refused(502, 'workos-unavailable');
      return { status: 200, body: { sent: true } };
    },
  };
}

export type PasswordAuth = ReturnType<typeof createPasswordAuth>;
