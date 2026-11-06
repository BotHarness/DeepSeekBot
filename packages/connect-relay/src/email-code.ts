const WORKOS = 'https://api.workos.com/user_management';
const MAX_EMAIL = 254;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const CODE = /^\d{6}$/u;

export interface EmailCodeOptions {
  apiKey: string;
  clientId: string;
  fetcher?: typeof fetch;
  limit?: (key: string) => Promise<boolean>;
}

export type EmailCodeResult =
  | { status: 200; body: Record<string, unknown> }
  | { status: number; body: { error: { code: string; cause?: string } } };

const workosError = (body: Record<string, unknown>) =>
  typeof body['code'] === 'string'
    ? body['code']
    : typeof body['error'] === 'string'
      ? body['error']
      : undefined;

const refused = (status: number, code: string, cause?: string): EmailCodeResult => ({
  status,
  body: { error: cause === undefined ? { code } : { code, cause } },
});

export function normalizeEmail(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const email = value.trim().toLowerCase();
  return email.length <= MAX_EMAIL && EMAIL.test(email) ? email : undefined;
}

export function createEmailCode(options: EmailCodeOptions) {
  const fetcher = options.fetcher ?? fetch;
  const allowed = async (...keys: string[]) => {
    if (options.limit === undefined) return true;
    for (const key of keys) if (!(await options.limit(key))) return false;
    return true;
  };

  const workos = async (path: string, body: Record<string, string>) => {
    let response: Response;
    try {
      response = await fetcher(`${WORKOS}${path}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch {
      return undefined;
    }
    const reply = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: response.status, body: reply ?? {} };
  };

  return {
    async send(input: { email: unknown; ip?: string }): Promise<EmailCodeResult> {
      const email = normalizeEmail(input.email);
      if (email === undefined) return refused(400, 'invalid-email');
      if (
        !(await allowed(
          JSON.stringify(['email-code', email]),
          ...(input.ip ? [JSON.stringify(['email-code-ip', input.ip])] : []),
        ))
      )
        return refused(429, 'rate-limited');
      const reply = await workos('/magic_auth', { email });
      if (reply === undefined) return refused(502, 'workos-unavailable');
      if (reply.status === 200 || reply.status === 201)
        return { status: 200, body: { sent: true } };
      if (reply.status === 429) return refused(429, 'rate-limited');
      if (workosError(reply.body) === 'authentication_method_not_allowed')
        return refused(503, 'email-code-unavailable', 'authentication_method_not_allowed');
      if (reply.status === 400 || reply.status === 422) return refused(400, 'invalid-email');
      return refused(502, 'workos-unavailable', `http-${reply.status}`);
    },

    async verify(input: {
      email: unknown;
      code: unknown;
      ip?: string;
      userAgent?: string;
    }): Promise<EmailCodeResult> {
      const email = normalizeEmail(input.email);
      if (email === undefined) return refused(400, 'invalid-email');
      const code = typeof input.code === 'string' ? input.code.trim() : '';
      if (!CODE.test(code)) return refused(400, 'invalid-code');
      if (
        !(await allowed(
          JSON.stringify(['email-verify', email]),
          ...(input.ip ? [JSON.stringify(['email-verify-ip', input.ip])] : []),
        ))
      )
        return refused(429, 'rate-limited');
      const reply = await workos('/authenticate', {
        client_id: options.clientId,
        client_secret: options.apiKey,
        grant_type: 'urn:workos:oauth:grant-type:magic-auth:code',
        email,
        code,
        ...(input.ip ? { ip_address: input.ip } : {}),
        ...(input.userAgent ? { user_agent: input.userAgent.slice(0, 512) } : {}),
      });
      if (reply === undefined) return refused(502, 'workos-unavailable');
      const user = reply.body['user'] as Record<string, unknown> | undefined;
      const refreshToken = reply.body['refresh_token'];
      if (
        reply.status === 200 &&
        typeof refreshToken === 'string' &&
        typeof user?.['id'] === 'string'
      )
        return {
          status: 200,
          body: {
            refresh_token: refreshToken,
            user: {
              id: user['id'],
              ...(typeof user['email'] === 'string' ? { email: user['email'] } : {}),
            },
          },
        };
      const workosCode = workosError(reply.body);
      if (reply.status === 429) return refused(429, 'rate-limited');
      if (workosCode === 'authentication_method_not_allowed')
        return refused(503, 'email-code-unavailable', workosCode);
      if (
        workosCode === 'invalid_one_time_code' ||
        workosCode === 'one_time_code_expired' ||
        workosCode === 'one_time_code_previously_used' ||
        workosCode === 'invalid_grant'
      )
        return refused(400, 'invalid-code');
      if (reply.status !== 401 && reply.status >= 400 && reply.status < 500)
        return refused(409, 'use-browser-sign-in', workosCode);
      return refused(502, 'workos-unavailable', `http-${reply.status}`);
    },
  };
}

export type EmailCode = ReturnType<typeof createEmailCode>;
