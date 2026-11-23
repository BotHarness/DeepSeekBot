import type { HostCarrier } from '@botharness/host-protocol/carrier';
import { isHttpsOrigin } from '@botharness/host-protocol/route';
import {
  teamHostIdentity,
  teamRecord,
  type TeamHostIdentity,
  type TeamResult,
} from '@botharness/host-protocol/team-invitation';
import { keyHex, secureRandom } from './encrypted-carrier';
import { encryptedSignIn, signInTransportFailure } from './encrypted-sign-in';
import type { HostEncryption, SavedHost } from './hosts';
import { discoverSignInHost, matchesSavedSignInHost } from './sign-in-discovery';

export const ownerSignInRefusals = [
  'credentials-invalid',
  'rate-limited',
  'owner-sign-in-disabled',
  'insecure-transport',
  'fingerprint-mismatch',
  'invalid-input',
  'remote-access/denied',
] as const;

export type OwnerSignInError =
  | (typeof ownerSignInRefusals)[number]
  | 'already-paired'
  | 'this-host'
  | 'response-invalid'
  | 'unreachable'
  | 'request-cancelled';

export interface OwnerSignInOptions {
  carrier: HostCarrier;
  route: string;
  username: string;
  password: string;
  deviceName: string;
  localHostId?: string;
  expectedHost?: { host: TeamHostIdentity; publicKey: string };
  previous?: (hostId: string, route: string) => SavedHost | undefined;
  allowExisting?: (host: SavedHost) => boolean;
  signal?: AbortSignal;
}

export function ownerSignInOrigin(input: string): string | undefined {
  const value = input.trim();
  if (!/^(?:https:\/\/)?[^/\\?#@\s]+\/?$/iu.test(value)) return undefined;
  try {
    const url = new URL(value.includes('://') ? value : 'https://' + value);
    if (
      isHttpsOrigin(url.origin) &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.search &&
      url.pathname === '/'
    )
      return url.origin;
  } catch {}
}

export async function signInOwnerDevice(
  options: OwnerSignInOptions,
): Promise<TeamResult<SavedHost, OwnerSignInError>> {
  return withPasswordSignInChannel(options, async ({ host, encryption, signal }) => {
    const { carrier, route, username, password, deviceName } = options;
    const result = await encryptedSignIn({
      type: 'owner-sign-in',
      carrier,
      route,
      host,
      encryption,
      signal,
      input: { username, password, deviceName, fingerprint: host.fingerprint },
      codes: ownerSignInRefusals,
    });
    return result.ok ? signedOwnerHost(result.value, host, route, encryption) : result;
  });
}

export async function withPasswordSignInChannel<T, E extends string>(
  options: OwnerSignInOptions,
  run: (channel: {
    host: TeamHostIdentity;
    encryption: HostEncryption;
    signal: AbortSignal;
    signIn?: { password: boolean };
  }) => Promise<TeamResult<T, E>>,
): Promise<TeamResult<T, E | OwnerSignInError>> {
  const { carrier, route, username, password, deviceName } = options;
  if (!isHttpsOrigin(route)) return { ok: false, code: 'insecure-transport' };
  if (
    !username ||
    username.length > 32 ||
    !password ||
    password.length > 1024 ||
    !deviceName.trim() ||
    deviceName.length > 60
  )
    return { ok: false, code: 'invalid-input' };
  const signal = AbortSignal.any([
    AbortSignal.timeout(30_000),
    ...(options.signal ? [options.signal] : []),
  ]);
  if (signal.aborted) return { ok: false, code: 'request-cancelled' };
  try {
    const discovered = await discoverSignInHost({
      carrier,
      route,
      redirect: 'error',
      signal,
    });
    if (signal.aborted) return { ok: false, code: 'request-cancelled' };
    if (!discovered.ok) return discovered;
    const { host, publicKey, signIn } = discovered.value;
    if (host.id === options.localHostId) return { ok: false, code: 'this-host' };
    const expected = options.expectedHost;
    if (
      expected &&
      (expected.host.id !== host.id ||
        expected.host.fingerprint !== host.fingerprint ||
        expected.publicKey !== publicKey)
    )
      return { ok: false, code: 'fingerprint-mismatch' };
    const previous = options.previous?.(host.id, route);
    if (!matchesSavedSignInHost(previous, host, publicKey))
      return { ok: false, code: 'fingerprint-mismatch' };
    if (previous && options.allowExisting?.(previous) === false)
      return { ok: false, code: 'already-paired' };
    const encryption: HostEncryption = {
      protocol: 'connect-noise-xk-v1',
      required: true,
      hostKey: publicKey,
      deviceKey: keyHex(secureRandom(carrier)),
    };
    return await run({ host, encryption, signal, ...(signIn === undefined ? {} : { signIn }) });
  } catch (error) {
    return signInTransportFailure(error, signal);
  }
}

export function signedOwnerHost(
  value: unknown,
  host: TeamHostIdentity,
  route: string,
  encryption: HostEncryption,
): TeamResult<SavedHost, 'fingerprint-mismatch' | 'response-invalid'> {
  const { host: reply, deviceId, credential } = teamRecord(value);
  const signedHost = teamHostIdentity(reply);
  if (signedHost?.id !== host.id || signedHost.fingerprint !== host.fingerprint)
    return { ok: false, code: 'fingerprint-mismatch' };
  if (
    typeof deviceId !== 'string' ||
    typeof credential !== 'string' ||
    !/^[A-Za-z0-9_-]{16,64}\.[A-Za-z0-9_-]{32,128}$/u.test(credential) ||
    !credential.startsWith(deviceId + '.')
  )
    return { ok: false, code: 'response-invalid' };
  return {
    ok: true,
    value: {
      hostId: host.id,
      hostName: signedHost.name,
      routes: [route],
      deviceId,
      credential,
      encryption,
    },
  };
}
