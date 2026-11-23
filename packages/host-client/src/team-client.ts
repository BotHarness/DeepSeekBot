import type { HostCarrier } from '@botharness/host-protocol/carrier';
import type { HostEncryption, SavedHost } from './hosts';
import { encryptedCarrier, keyHex, secureRandom } from './encrypted-carrier';
import { encryptedSignIn, signInRefusal, signInTransportFailure } from './encrypted-sign-in';
import { isConnectRoute } from '@botharness/host-protocol/route';
import { discoverSignInHost } from './sign-in-discovery';
import {
  parseTeamInvitation,
  teamHostIdentity,
  teamHttpsRoute,
  teamRecord,
  type TeamErrorCode,
  type TeamHostIdentity,
  type TeamInvitation,
  type TeamResult,
} from '@botharness/host-protocol/team-invitation';

export { parseTeamInvitation } from '@botharness/host-protocol/team-invitation';
export type {
  TeamInvitation,
  TeamErrorCode,
  TeamResult,
} from '@botharness/host-protocol/team-invitation';
export { memberPasswordGate, prepareMemberIdentity } from './member-identity';

const codes: readonly TeamErrorCode[] = [
  'credentials-invalid',
  'rate-limited',
  'insecure-transport',
  'team-mode-off',
  'member-suspended',
  'fingerprint-mismatch',
  'password-change-required',
  'password-weak',
  'password-reused',
  'invalid-input',
  'remote-access/denied',
];
export function signedMemberHost(
  input: unknown,
  invitation: Pick<TeamInvitation, 'host' | 'routes' | 'username'>,
  route: string,
  encryption: HostEncryption,
): TeamResult<SavedHost, 'fingerprint-mismatch' | 'response-invalid'> {
  const value = teamRecord(input);
  const host = teamHostIdentity(value['host']);
  if (!host || host.id !== invitation.host.id || host.fingerprint !== invitation.host.fingerprint)
    return { ok: false, code: 'fingerprint-mismatch' };
  if (
    typeof value['deviceId'] !== 'string' ||
    typeof value['credential'] !== 'string' ||
    !/^member\.[A-Za-z0-9_-]{43}$/u.test(value['credential']) ||
    typeof value['humanId'] !== 'string' ||
    !value['humanId'] ||
    typeof value['displayName'] !== 'string' ||
    typeof value['mustChangePassword'] !== 'boolean'
  )
    return { ok: false, code: 'response-invalid' };
  return {
    ok: true,
    value: {
      hostId: host.id,
      hostName: host.name,
      routes: [route, ...invitation.routes.filter((item) => item !== route)],
      deviceId: value['deviceId'],
      credential: value['credential'],
      encryption,
      member: {
        humanId: value['humanId'],
        displayName: value['displayName'],
        username: invitation.username,
        fingerprint: host.fingerprint,
        mustChangePassword: value['mustChangePassword'],
      },
    },
  };
}
export function signInAgainInvitation(
  host: SavedHost,
  now = Date.now(),
): TeamInvitation | undefined {
  const member = host.member;
  if (member === undefined || member.username === '') return undefined;
  const routes = host.routes.filter(teamHttpsRoute);
  if (!routes.length) return undefined;
  return {
    v: 1,
    host: { id: host.hostId, name: host.hostName, fingerprint: member.fingerprint },
    routes,
    username: member.username,
    expiresAt: new Date(now + 10 * 60_000).toISOString(),
  };
}
export interface TeamDeviceSignInOptions {
  carrier: HostCarrier;
  invitation: TeamInvitation;
  password: string;
  deviceName: string;
  route?: string;
  signal?: AbortSignal;
  now?: number;
}
export async function signInTeamDevice(
  options: TeamDeviceSignInOptions,
): Promise<TeamResult<SavedHost>> {
  const parsed = parseTeamInvitation(
    `deepseekbot://team?i=${encodeInvitation(options.invitation)}`,
    options.now ?? Date.now(),
  );
  if (!parsed.ok) return parsed;
  const invitation = parsed.value;
  const routes = options.route === undefined ? invitation.routes : [options.route];
  if (
    !routes.length ||
    routes.some((route) => !teamHttpsRoute(route) || !invitation.routes.includes(route))
  )
    return { ok: false, code: 'insecure-transport' };
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)])
    : AbortSignal.timeout(30_000);
  for (const route of routes) {
    if (signal.aborted) return { ok: false, code: 'request-cancelled' };
    const attemptSignal = AbortSignal.any([signal, AbortSignal.timeout(8_000)]);
    const result = await signInTeamRoute({ ...options, invitation, route, signal: attemptSignal });
    if (result.ok) return result;
    if (result.code !== 'unreachable' && !(result.code === 'request-cancelled' && !signal.aborted))
      return result;
  }
  return { ok: false, code: 'unreachable' };
}
async function signInTeamRoute(
  options: TeamDeviceSignInOptions & { route: string; signal: AbortSignal },
): Promise<TeamResult<SavedHost>> {
  const { invitation, route, signal } = options;
  try {
    const discovered = await discoverSignInHost({
      carrier: options.carrier,
      route,
      signal,
      invitedHost: invitation.host,
    });
    if (!discovered.ok) return discovered;
    const encryption: HostEncryption = {
      protocol: 'connect-noise-xk-v1',
      hostKey: discovered.value.publicKey,
      deviceKey: keyHex(secureRandom(options.carrier)),
    };
    const input = {
      username: invitation.username,
      password: options.password,
      deviceName: options.deviceName,
      fingerprint: invitation.host.fingerprint,
    };
    if (isConnectRoute(route)) {
      const result = await encryptedSignIn({
        ...options,
        type: 'team-sign-in',
        codes,
        route,
        host: invitation.host,
        encryption,
        input,
        signal,
      });
      return result.ok ? signedMemberHost(result.value, invitation, route, encryption) : result;
    }
    const result = await options.carrier.request(`${route}/botharness-device/team/device-sign-in`, {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
      headers: { 'content-type': 'application/json' },
    });
    const value: unknown = JSON.parse(await result.text());
    return result.status === 200
      ? signedMemberHost(value, invitation, route, encryption)
      : signInRefusal(value, codes);
  } catch (error) {
    return signInTransportFailure(error, signal);
  }
}
function encodeInvitation(value: TeamInvitation): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

export async function changeTeamDevicePassword(options: {
  carrier: HostCarrier;
  host: SavedHost;
  current: string;
  next: string;
  signal?: AbortSignal;
}): Promise<TeamResult<SavedHost>> {
  if (!options.host.member) return { ok: false, code: 'credentials-invalid' };
  const route = options.host.routes[0];
  if (!route || !teamHttpsRoute(route)) return { ok: false, code: 'insecure-transport' };
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)])
    : AbortSignal.timeout(30_000);
  const carrier = encryptedCarrier({
    raw: options.carrier,
    hostId: options.host.hostId,
    credential: options.host.credential,
    trustedHttpsOrigins: options.host.routes,
    ...(options.host.encryption ? { encryption: options.host.encryption } : {}),
  });
  try {
    const response = await carrier.request(`${route}/botharness-device/team/device-password`, {
      method: 'POST',
      headers: {
        authorization: `Device ${options.host.credential}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ current: options.current, next: options.next }),
      signal,
    });
    if (response.status !== 200) return signInRefusal(JSON.parse(await response.text()), codes);
    return {
      ok: true,
      value: { ...options.host, member: { ...options.host.member, mustChangePassword: false } },
    };
  } catch (error) {
    return signInTransportFailure(error, signal);
  } finally {
    carrier.close?.();
  }
}
export interface MemberPairingOffer {
  link: string;
  qr: { size: number; path: string };
  expiresAt: string;
  receipt: string;
}
export async function memberPairingOffer(client: {
  call(method: string): Promise<unknown>;
}): Promise<TeamResult<MemberPairingOffer>> {
  try {
    const value = teamRecord(await client.call('memberPairingOffer'));
    const qr = teamRecord(value['qr']);
    if (
      typeof value['link'] !== 'string' ||
      typeof value['expiresAt'] !== 'string' ||
      typeof value['receipt'] !== 'string' ||
      typeof qr['size'] !== 'number' ||
      typeof qr['path'] !== 'string'
    )
      return { ok: false, code: 'response-invalid' };
    return {
      ok: true,
      value: {
        link: value['link'],
        expiresAt: value['expiresAt'],
        receipt: value['receipt'],
        qr: { size: qr['size'], path: qr['path'] },
      },
    };
  } catch (error) {
    return signInRefusal(error, codes);
  }
}
