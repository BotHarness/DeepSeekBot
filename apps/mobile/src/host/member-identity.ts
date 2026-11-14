import { noiseFingerprint } from '../../../../packages/core/src/devices/noise/xk';
import { teamRecord, type TeamResult } from './team-invitation';
import type { SavedHost, SavedHosts } from './hosts';

export interface HostMemberIdentity {
  humanId: string;
  displayName: string;
  username: string;
  fingerprint: string;
  mustChangePassword: boolean;
}
export function parseHostMemberIdentity(input: unknown): HostMemberIdentity | undefined {
  const value = teamRecord(input);
  return typeof value['humanId'] === 'string' &&
    value['humanId'].length > 0 &&
    typeof value['displayName'] === 'string' &&
    typeof value['username'] === 'string' &&
    typeof value['fingerprint'] === 'string' &&
    /^(?:[a-f0-9]{64}|(?:[a-f0-9]{4} ){15}[a-f0-9]{4})$/u.test(value['fingerprint']) &&
    typeof value['mustChangePassword'] === 'boolean'
    ? {
        humanId: value['humanId'],
        displayName: value['displayName'],
        username: value['username'],
        fingerprint: value['fingerprint'],
        mustChangePassword: value['mustChangePassword'],
      }
    : undefined;
}
export type PasswordGateState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'owner' }
  | { kind: 'password-change-required'; host: SavedHost; member: HostMemberIdentity }
  | { kind: 'ready'; host: SavedHost; member: HostMemberIdentity };
export function memberPasswordGate(host: SavedHost | null | undefined): PasswordGateState {
  if (host === undefined) return { kind: 'loading' };
  if (host === null) return { kind: 'signed-out' };
  if (!host.member) return { kind: 'owner' };
  return {
    kind: host.member.mustChangePassword ? 'password-change-required' : 'ready',
    host,
    member: host.member,
  };
}
export function identitySwitchRequired(previous: SavedHost | undefined, next: SavedHost): boolean {
  return (
    previous !== undefined &&
    previous.hostId === next.hostId &&
    (previous.member?.humanId ?? 'local-human') !== (next.member?.humanId ?? 'local-human')
  );
}
export function hostIdentityMatches(previous: SavedHost | undefined, next: SavedHost): boolean {
  const fingerprint = (host: SavedHost | undefined) => {
    if (host?.member) return host.member.fingerprint;
    const key = host?.encryption?.hostKey;
    if (!key || !/^[a-f0-9]{64}$/u.test(key)) return undefined;
    return noiseFingerprint(
      Uint8Array.from(key.match(/../gu)!, (byte) => Number.parseInt(byte, 16)),
    );
  };
  const pinned = fingerprint(previous);
  return pinned === undefined || pinned === fingerprint(next);
}
export function prepareMemberIdentity(
  state: SavedHosts,
  host: SavedHost,
  confirmed = false,
): TeamResult<SavedHost, 'identity-switch-required' | 'fingerprint-mismatch'> {
  const previous = state.hosts.find((item) => item.hostId === host.hostId);
  if (!hostIdentityMatches(previous, host)) return { ok: false, code: 'fingerprint-mismatch' };
  if (identitySwitchRequired(previous, host) && !confirmed)
    return { ok: false, code: 'identity-switch-required' };
  return { ok: true, value: host };
}

export function pairedMemberIdentity(
  input: unknown,
  fingerprint: string,
): HostMemberIdentity | undefined {
  const value = teamRecord(input);
  return parseHostMemberIdentity({
    humanId: value['humanId'],
    displayName: value['displayName'],
    mustChangePassword: value['mustChangePassword'],
    username: '',
    fingerprint,
  });
}
