import type { HostCarrier, HostRequest } from '@botharness/host-protocol/carrier';
import { CONNECT_CHANNEL_PATH } from '@botharness/host-protocol/noise/channel';
import { noiseFingerprint } from '@botharness/host-protocol/noise/xk';
import {
  teamHostIdentity,
  teamRecord,
  type TeamHostIdentity,
  type TeamResult,
} from '@botharness/host-protocol/team-invitation';
import { keyBytes } from './encrypted-carrier';
import type { SavedHost } from './hosts';

export async function discoverSignInHost(options: {
  carrier: HostCarrier;
  route: string;
  signal: AbortSignal;
  redirect?: HostRequest['redirect'];
  invitedHost?: TeamHostIdentity;
}): Promise<
  TeamResult<
    { host: TeamHostIdentity; publicKey: string; signIn?: { password: boolean } },
    'unreachable' | 'response-invalid' | 'fingerprint-mismatch'
  >
> {
  const { carrier, route, signal, redirect, invitedHost } = options;
  const response = await carrier.request(route + CONNECT_CHANNEL_PATH, {
    method: 'GET',
    signal,
    ...(redirect === undefined ? {} : { redirect }),
  });
  if (response.status !== 200) return { ok: false, code: 'unreachable' };

  const body = await response.text();
  let discovery: Record<string, unknown>;
  try {
    discovery = teamRecord(JSON.parse(body));
  } catch {
    return { ok: false, code: 'response-invalid' };
  }
  const identity = teamRecord(discovery['host']);
  const encryption = teamRecord(discovery['encryption']);
  const publicKey = encryption['publicKey'];
  const host = teamHostIdentity({
    id: identity['id'],
    name: invitedHost?.name ?? identity['name'],
    fingerprint: encryption['fingerprint'],
  });
  if (!host || typeof publicKey !== 'string' || !/^[a-f0-9]{64}$/u.test(publicKey))
    return { ok: false, code: invitedHost ? 'fingerprint-mismatch' : 'response-invalid' };
  if (
    noiseFingerprint(keyBytes(publicKey)) !== host.fingerprint ||
    (invitedHost && (invitedHost.id !== host.id || invitedHost.fingerprint !== host.fingerprint))
  )
    return { ok: false, code: 'fingerprint-mismatch' };
  const password = teamRecord(discovery['signIn'])['password'];
  return {
    ok: true,
    value: { host, publicKey, ...(typeof password === 'boolean' ? { signIn: { password } } : {}) },
  };
}

export function matchesSavedSignInHost(
  saved: SavedHost | undefined,
  host: TeamHostIdentity,
  discoveredKey?: string,
): boolean {
  if (!saved) return true;
  const savedKey = saved.encryption?.hostKey;
  if (
    discoveredKey !== undefined &&
    (saved.hostId !== host.id || (savedKey !== undefined && savedKey !== discoveredKey))
  )
    return false;
  const pinnedFingerprint =
    saved.member?.fingerprint ??
    (discoveredKey === undefined && savedKey !== undefined
      ? noiseFingerprint(keyBytes(savedKey))
      : undefined);
  return pinnedFingerprint === undefined || pinnedFingerprint === host.fingerprint;
}
