import { CliLiveError } from './cli-live-error.js';

export async function runMarketplaceBlocklist(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<unknown> {
  const [action, kind, entry] = args;
  if (
    args.length !== 3 ||
    (action !== 'block' && action !== 'restore') ||
    (kind !== 'bot' && kind !== 'avatar') ||
    !entry?.trim()
  )
    throw new CliLiveError(
      'invalid-input',
      'Use marketplace-blocklist <block|restore> <bot|avatar> <id-or-url>.',
    );
  const token = env['MARKETPLACE_ADMIN_TOKEN']?.trim();
  if (!token) throw new CliLiveError('admin-token-required', 'Set MARKETPLACE_ADMIN_TOKEN.');
  const base = URL.parse(env['MARKETPLACE_ADMIN_URL'] ?? 'https://market.botharness.ai');
  if (
    base === null ||
    (base.protocol !== 'https:' &&
      !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))
  )
    throw new CliLiveError('invalid-input', 'Use an HTTPS Marketplace URL or a local HTTP Worker.');
  const target = kind === 'bot' && /^https?:\/\//u.test(entry) ? { url: entry } : { id: entry };
  const response = await fetch(new URL('/v1/admin/blocklist', base), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ kind, action, ...target }),
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
  if (response === undefined)
    throw new CliLiveError('marketplace-unavailable', 'Marketplace admin request failed.');
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error =
      typeof body === 'object' && body !== null && 'error' in body ? body.error : undefined;
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : 'marketplace-unavailable';
    throw new CliLiveError(code, 'Marketplace refused the admin request.');
  }
  if (typeof body !== 'object' || body === null || !(kind in body))
    throw new CliLiveError('marketplace-unavailable', 'Invalid Marketplace admin response.');
  return body;
}
