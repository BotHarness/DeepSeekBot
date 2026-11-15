export interface TeamHostIdentity {
  id: string;
  name: string;
  fingerprint: string;
}
export interface TeamInvitation {
  v: 1;
  host: TeamHostIdentity;
  routes: string[];
  username: string;
  expiresAt: string;
}
export type InvitationError =
  | 'invitation-invalid'
  | 'invitation-expired'
  | 'invitation-version-unsupported';
export type TeamResult<T, E extends string = TeamErrorCode> =
  | { ok: true; value: T }
  | { ok: false; code: E; retryAfterSeconds?: number };
export type TeamErrorCode =
  | InvitationError
  | 'credentials-invalid'
  | 'rate-limited'
  | 'insecure-transport'
  | 'team-mode-off'
  | 'member-suspended'
  | 'fingerprint-mismatch'
  | 'password-change-required'
  | 'password-weak'
  | 'password-reused'
  | 'invalid-input'
  | 'unreachable'
  | 'response-invalid'
  | 'request-cancelled'
  | 'identity-switch-required'
  | 'storage-failed'
  | 'remote-access/denied';
export function teamRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function teamHostIdentity(value: unknown): TeamHostIdentity | undefined {
  const host = teamRecord(value);
  return typeof host['id'] === 'string' &&
    host['id'].length > 0 &&
    host['id'].length <= 128 &&
    typeof host['name'] === 'string' &&
    host['name'].length <= 256 &&
    typeof host['fingerprint'] === 'string' &&
    /^(?:[a-f0-9]{64}|(?:[a-f0-9]{4} ){15}[a-f0-9]{4})$/u.test(host['fingerprint'])
    ? { id: host['id'], name: host['name'], fingerprint: host['fingerprint'] }
    : undefined;
}
export function teamHttpsRoute(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const name = url.hostname
      .replace(/^\[|\]$/gu, '')
      .replace(/\.$/u, '')
      .toLowerCase();
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.search &&
      !['localhost', '::1', '::', '0.0.0.0'].includes(name) &&
      !name.endsWith('.localhost') &&
      !/^(?:127|0)\./u.test(name) &&
      !name.startsWith('::ffff:7f') &&
      !name.startsWith('::ffff:0:')
    );
  } catch {
    return false;
  }
}
export function parseTeamInvitation(
  link: string,
  now = Date.now(),
): TeamResult<TeamInvitation, InvitationError> {
  if (link.length > 16_384) return { ok: false, code: 'invitation-invalid' };
  try {
    const url = new URL(link.trim());
    const encoded = url.searchParams.get('i');
    if (
      url.protocol !== 'deepseekbot:' ||
      url.hostname !== 'team' ||
      (url.pathname !== '' && url.pathname !== '/') ||
      url.hash ||
      url.username ||
      url.password ||
      url.port ||
      [...url.searchParams.keys()].some((key) => key !== 'i') ||
      url.searchParams.getAll('i').length !== 1 ||
      !encoded ||
      !/^[A-Za-z0-9_-]+$/u.test(encoded)
    )
      return { ok: false, code: 'invitation-invalid' };
    const bytes = Uint8Array.from(atob(encoded.replace(/-/gu, '+').replace(/_/gu, '/')), (char) =>
      char.charCodeAt(0),
    );
    const value = teamRecord(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    if (value['v'] !== 1) return { ok: false, code: 'invitation-version-unsupported' };
    const host = teamHostIdentity(value['host']);
    const routes = value['routes'];
    const username = value['username'];
    const expiresAt = value['expiresAt'];
    if (
      !host ||
      !Array.isArray(routes) ||
      routes.length > 16 ||
      !routes.every(teamHttpsRoute) ||
      typeof username !== 'string' ||
      !/^[a-z0-9][a-z0-9._-]{1,31}$/u.test(username) ||
      typeof expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(expiresAt))
    )
      return { ok: false, code: 'invitation-invalid' };
    if (Date.parse(expiresAt) <= now) return { ok: false, code: 'invitation-expired' };
    return {
      ok: true,
      value: {
        v: 1,
        host,
        routes: [...new Set(routes.map((route) => new URL(route).origin))],
        username,
        expiresAt,
      },
    };
  } catch {
    return { ok: false, code: 'invitation-invalid' };
  }
}
