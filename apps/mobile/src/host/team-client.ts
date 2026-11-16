import type { HostCarrier } from './carrier';
import type { HostEncryption, SavedHost } from './hosts';
import {
  ConnectRefused,
  encryptedCarrier,
  keyBytes,
  keyHex,
  openNoiseSocket,
  secureRandom,
} from './encrypted-carrier';
import { isConnectRoute } from './route';
import { noiseFingerprint } from '../../../../packages/core/src/devices/noise/xk';
import {
  parseTeamInvitation,
  teamHostIdentity,
  teamHttpsRoute,
  teamRecord,
  type TeamErrorCode,
  type TeamHostIdentity,
  type TeamInvitation,
  type TeamResult,
} from './team-invitation';

export { parseTeamInvitation } from './team-invitation';
export type { TeamInvitation, TeamErrorCode, TeamResult } from './team-invitation';
export { memberPasswordGate, prepareMemberIdentity } from './member-identity';

const codes: ReadonlySet<string> = new Set<TeamErrorCode>([
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
]);
function refusal(value: unknown): TeamResult<never> {
  const input = teamRecord(value);
  const code = input['code'];
  const known =
    typeof code === 'string' && codes.has(code) ? (code as TeamErrorCode) : 'response-invalid';
  return {
    ok: false,
    code: known,
    ...(typeof input['retryAfterSeconds'] === 'number' &&
    Number.isFinite(input['retryAfterSeconds']) &&
    input['retryAfterSeconds'] > 0
      ? { retryAfterSeconds: input['retryAfterSeconds'] }
      : {}),
  };
}
function requestFailure(error: unknown, signal: AbortSignal): TeamResult<never> {
  if (signal.aborted) return { ok: false, code: 'request-cancelled' };
  if (
    error instanceof ConnectRefused &&
    ['channel-authentication-failed', 'channel-handshake-rejected'].includes(error.code)
  )
    return { ok: false, code: 'fingerprint-mismatch' };
  return { ok: false, code: 'unreachable' };
}
function signedHost(
  input: unknown,
  invitation: TeamInvitation,
  route: string,
  encryption: HostEncryption,
): TeamResult<SavedHost> {
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
async function encryptedSignIn(options: {
  carrier: HostCarrier;
  route: string;
  host: TeamHostIdentity;
  encryption: HostEncryption;
  input: unknown;
  signal: AbortSignal;
}): Promise<TeamResult<unknown>> {
  return new Promise((resolve) => {
    let done = false;
    let socket: ReturnType<typeof openNoiseSocket> | undefined;
    const finish = (result: TeamResult<unknown>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      options.signal.removeEventListener('abort', abort);
      resolve(result);
      socket?.close();
    };
    const abort = () => finish({ ok: false, code: 'request-cancelled' });
    const timer = setTimeout(() => finish({ ok: false, code: 'unreachable' }), 30_000);
    options.signal.addEventListener('abort', abort, { once: true });
    if (options.signal.aborted) {
      abort();
      return;
    }
    try {
      socket = openNoiseSocket({
        origin: options.route,
        hostId: options.host.id,
        encryption: options.encryption,
        raw: options.carrier,
        closed: (reason) => finish(requestFailure(new ConnectRefused(reason), options.signal)),
        message: (frame) => {
          if (frame['type'] !== 'team-signed-in') return;
          const result = teamRecord(frame['result']);
          finish(result['ok'] === true ? { ok: true, value: result['value'] } : refusal(result));
        },
      });
      void socket.ready.then(
        () => {
          if (!done) socket?.send({ type: 'team-sign-in', input: options.input });
        },
        (error) => finish(requestFailure(error, options.signal)),
      );
    } catch (error) {
      finish(requestFailure(error, options.signal));
    }
  });
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
    const response = await options.carrier.request(`${route}/botharness-device/channel`, {
      method: 'GET',
      signal,
    });
    if (response.status !== 200) return { ok: false, code: 'unreachable' };
    const discovery = teamRecord(JSON.parse(await response.text()));
    const host = teamRecord(discovery['host']);
    const remote = teamRecord(discovery['encryption']);
    const publicKey = remote['publicKey'];
    if (
      host['id'] !== invitation.host.id ||
      typeof publicKey !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(publicKey) ||
      noiseFingerprint(keyBytes(publicKey)) !== invitation.host.fingerprint ||
      remote['fingerprint'] !== invitation.host.fingerprint
    )
      return { ok: false, code: 'fingerprint-mismatch' };
    const encryption: HostEncryption = {
      protocol: 'connect-noise-xk-v1',
      hostKey: publicKey,
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
        route,
        host: invitation.host,
        encryption,
        input,
        signal,
      });
      return result.ok ? signedHost(result.value, invitation, route, encryption) : result;
    }
    const result = await options.carrier.request(`${route}/botharness-device/team/device-sign-in`, {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
      headers: { 'content-type': 'application/json' },
    });
    const value: unknown = JSON.parse(await result.text());
    return result.status === 200
      ? signedHost(value, invitation, route, encryption)
      : refusal(value);
  } catch (error) {
    return requestFailure(error, signal);
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
    if (response.status !== 200) return refusal(JSON.parse(await response.text()));
    return {
      ok: true,
      value: { ...options.host, member: { ...options.host.member, mustChangePassword: false } },
    };
  } catch (error) {
    return requestFailure(error, signal);
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
    return refusal(error);
  }
}
