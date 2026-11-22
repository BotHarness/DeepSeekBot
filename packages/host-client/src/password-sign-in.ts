import type { HostCarrier } from '@botharness/host-protocol/carrier';
import {
  teamRecord,
  type TeamHostIdentity,
  type TeamResult,
} from '@botharness/host-protocol/team-invitation';
import { encryptedSignIn, signInTransportFailure } from './encrypted-sign-in';
import type { SavedHost } from './hosts';
import {
  ownerSignInOrigin,
  ownerSignInRefusals,
  signedOwnerHost,
  withPasswordSignInChannel,
  type OwnerSignInError,
  type OwnerSignInOptions,
} from './owner-sign-in';
import { discoverSignInHost } from './sign-in-discovery';
import { signedMemberHost } from './team-client';

export type PasswordSignInError =
  | OwnerSignInError
  | 'password-sign-in-unavailable'
  | 'host-update-required'
  | 'team-mode-off'
  | 'member-suspended';

export interface HostAddressDiscovery {
  route: string;
  host: TeamHostIdentity;
  publicKey: string;
  signIn?: { password: boolean };
}

export async function discoverHostAddress(options: {
  carrier: HostCarrier;
  input: string;
  signal?: AbortSignal;
}): Promise<
  TeamResult<
    HostAddressDiscovery,
    | 'insecure-transport'
    | 'unreachable'
    | 'response-invalid'
    | 'fingerprint-mismatch'
    | 'request-cancelled'
  >
> {
  const route = ownerSignInOrigin(options.input);
  if (!route) return { ok: false, code: 'insecure-transport' };
  const signal = AbortSignal.any([
    AbortSignal.timeout(30_000),
    ...(options.signal ? [options.signal] : []),
  ]);
  if (signal.aborted) return { ok: false, code: 'request-cancelled' };
  try {
    const result = await discoverSignInHost({
      carrier: options.carrier,
      route,
      signal,
      redirect: 'error',
    });
    if (signal.aborted) return { ok: false, code: 'request-cancelled' };
    return result.ok ? { ok: true, value: { route, ...result.value } } : result;
  } catch (error) {
    return signInTransportFailure(error, signal);
  }
}

const refusals = [
  ...ownerSignInRefusals,
  'password-sign-in-unavailable',
  'host-update-required',
  'team-mode-off',
  'member-suspended',
] as const;

export async function signInWithPassword(
  options: OwnerSignInOptions,
): Promise<TeamResult<SavedHost & { role: 'owner' | 'member' }, PasswordSignInError>> {
  return withPasswordSignInChannel<SavedHost & { role: 'owner' | 'member' }, PasswordSignInError>(
    options,
    async ({ host, encryption, signal, signIn }) => {
      if (signIn === undefined) return { ok: false, code: 'host-update-required' };
      if (!signIn.password) return { ok: false, code: 'password-sign-in-unavailable' };
      const { carrier, route, username, password, deviceName } = options;
      const result = await encryptedSignIn({
        type: 'password-sign-in',
        carrier,
        route,
        host,
        encryption,
        signal,
        input: { username, password, deviceName, fingerprint: host.fingerprint },
        codes: refusals,
      });
      if (!result.ok) return result;
      const role = teamRecord(result.value)['role'];
      if (role !== 'owner' && role !== 'member') return { ok: false, code: 'response-invalid' };
      const saved =
        role === 'owner'
          ? signedOwnerHost(result.value, host, route, encryption)
          : signedMemberHost(result.value, { host, username, routes: [route] }, route, encryption);
      return saved.ok ? { ok: true, value: { ...saved.value, role } } : saved;
    },
  );
}
