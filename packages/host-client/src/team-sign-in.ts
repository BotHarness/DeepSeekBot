import type { HostCarrier } from '@botharness/host-protocol/carrier';
import { noiseFingerprint } from '@botharness/host-protocol/noise/xk';
import {
  parseTeamInvitation,
  teamHostIdentity,
  teamHttpsRoute,
  teamRecord,
  type TeamInvitation,
  type TeamHostIdentity,
  type TeamResult,
  type TeamErrorCode,
} from '@botharness/host-protocol/team-invitation';
import { keyBytes } from './encrypted-carrier';
import type { SavedHost } from './hosts';
import { prepareMemberIdentity, type HostMemberIdentity } from './member-identity';
import { changeTeamDevicePassword, signInTeamDevice } from './team-client';
import { revokePairing } from './pairing';

export type TeamSignInTarget =
  | { kind: 'invitation'; link: string }
  | { kind: 'address'; route: string; username: string };
export type TeamSignInError =
  | TeamErrorCode
  | 'flow-step-invalid'
  | 'flow-busy'
  | 'owner-required'
  | 'this-host';
export type TeamSignInState =
  | { kind: 'fingerprint'; host: TeamHostIdentity; username: string }
  | { kind: 'sign-in'; host: TeamHostIdentity; username: string }
  | { kind: 'password-change'; member: HostMemberIdentity }
  | { kind: 'identity-confirmation'; member: HostMemberIdentity }
  | { kind: 'complete'; member: HostMemberIdentity }
  | { kind: 'cancelled' };

export interface TeamSignInFlow {
  getSnapshot(): TeamSignInState;
  subscribe(listener: () => void): () => void;
  confirmFingerprint(fingerprint: string): TeamResult<TeamSignInState, TeamSignInError>;
  signIn(input: {
    password: string;
    deviceName: string;
  }): Promise<TeamResult<TeamSignInState, TeamSignInError>>;
  changePassword(input: {
    current: string;
    next: string;
  }): Promise<TeamResult<TeamSignInState, TeamSignInError>>;
  complete(confirmIdentitySwitch?: boolean): Promise<TeamResult<SavedHost, TeamSignInError>>;
  cancel(): Promise<void>;
}

export async function prepareTeamSignIn(options: {
  target: TeamSignInTarget;
  carrier: HostCarrier;
  previous(hostId: string): SavedHost | undefined;
  commit(
    host: SavedHost,
    confirmed: boolean,
    signal: AbortSignal,
  ): Promise<TeamResult<SavedHost, TeamSignInError>>;
  signal?: AbortSignal;
  now?: () => number;
}): Promise<TeamResult<TeamSignInFlow, TeamSignInError>> {
  const now = options.now ?? Date.now;
  let invitation: TeamInvitation;
  if (options.target.kind === 'invitation') {
    const parsed = parseTeamInvitation(options.target.link, now());
    if (!parsed.ok) return parsed;
    invitation = parsed.value;
  } else {
    const { route, username } = options.target;
    if (!teamHttpsRoute(route) || new URL(route).origin !== route)
      return { ok: false, code: 'insecure-transport' };
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(username)) return { ok: false, code: 'invalid-input' };
    try {
      const signal = AbortSignal.any([
        AbortSignal.timeout(8_000),
        ...(options.signal ? [options.signal] : []),
      ]);
      const response = await options.carrier.request(`${route}/botharness-device/channel`, {
        method: 'GET',
        signal,
      });
      if (response.status !== 200) return { ok: false, code: 'unreachable' };
      const value = teamRecord(JSON.parse(await response.text()));
      const encryption = teamRecord(value['encryption']);
      const host = teamHostIdentity({
        ...teamRecord(value['host']),
        fingerprint: encryption['fingerprint'],
      });
      if (
        !host ||
        typeof encryption['publicKey'] !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(encryption['publicKey'])
      )
        return { ok: false, code: 'response-invalid' };
      if (noiseFingerprint(keyBytes(encryption['publicKey'])) !== host.fingerprint)
        return { ok: false, code: 'fingerprint-mismatch' };
      invitation = {
        v: 1,
        host,
        routes: [route],
        username,
        expiresAt: new Date(now() + 30 * 60_000).toISOString(),
      };
    } catch {
      return { ok: false, code: options.signal?.aborted ? 'request-cancelled' : 'unreachable' };
    }
  }
  const previous = options.previous(invitation.host.id);
  const pinned =
    previous?.member?.fingerprint ??
    (previous?.encryption ? noiseFingerprint(keyBytes(previous.encryption.hostKey)) : undefined);
  if (pinned !== undefined && pinned !== invitation.host.fingerprint)
    return { ok: false, code: 'fingerprint-mismatch' };
  if (options.signal?.aborted) return { ok: false, code: 'request-cancelled' };
  const abort = new AbortController();
  const signal = options.signal ? AbortSignal.any([abort.signal, options.signal]) : abort.signal;
  let state: TeamSignInState = {
    kind: 'fingerprint',
    host: invitation.host,
    username: invitation.username,
  };
  let pending: SavedHost | undefined;
  let busy = false;
  let committing: Promise<void> | undefined;
  let finishCommit: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: TeamSignInState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const refuse = (step: TeamSignInState['kind']): TeamResult<never, TeamSignInError> | undefined =>
    signal.aborted
      ? { ok: false, code: 'request-cancelled' }
      : busy
        ? { ok: false, code: 'flow-busy' }
        : state.kind !== step
          ? { ok: false, code: 'flow-step-invalid' }
          : undefined;
  const release = async (host: SavedHost) => {
    try {
      await revokePairing({ host, carrier: options.carrier });
    } catch {}
  };
  const flow: TeamSignInFlow = {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    confirmFingerprint(fingerprint) {
      const refused = refuse('fingerprint');
      if (refused) return refused;
      if (fingerprint !== invitation.host.fingerprint)
        return { ok: false, code: 'fingerprint-mismatch' };
      publish({ kind: 'sign-in', host: invitation.host, username: invitation.username });
      return { ok: true, value: state };
    },
    async signIn(input) {
      const refused = refuse('sign-in');
      if (refused) return refused;
      busy = true;
      try {
        const result = await signInTeamDevice({
          ...input,
          carrier: options.carrier,
          invitation,
          signal,
          now: now(),
        });
        if (!result.ok) return result;
        if (signal.aborted) {
          await release(result.value);
          return { ok: false, code: 'request-cancelled' };
        }
        pending = result.value;
        if (!pending.member) {
          await release(pending);
          pending = undefined;
          return { ok: false, code: 'response-invalid' };
        }
        publish({
          kind: pending.member.mustChangePassword ? 'password-change' : 'identity-confirmation',
          member: pending.member,
        });
        return { ok: true, value: state };
      } finally {
        busy = false;
      }
    },
    async changePassword(input) {
      const refused = refuse('password-change');
      if (refused) return refused;
      if (!pending) return { ok: false, code: 'flow-step-invalid' };
      busy = true;
      try {
        const result = await changeTeamDevicePassword({
          ...input,
          carrier: options.carrier,
          host: pending,
          signal,
        });
        if (!result.ok) return result;
        if (signal.aborted) return { ok: false, code: 'request-cancelled' };
        pending = result.value;
        if (!pending.member) return { ok: false, code: 'response-invalid' };
        publish({ kind: 'identity-confirmation', member: pending.member });
        return { ok: true, value: state };
      } finally {
        busy = false;
      }
    },
    async complete(confirmed = false) {
      const refused = refuse('identity-confirmation');
      if (refused) return refused;
      if (!pending?.member || pending.member.mustChangePassword)
        return { ok: false, code: 'password-change-required' };
      const existing = options.previous(pending.hostId);
      const prepared = prepareMemberIdentity(
        { hosts: existing ? [existing] : [] },
        pending,
        confirmed,
      );
      if (!prepared.ok) return prepared;
      busy = true;
      committing = new Promise<void>((resolve) => {
        finishCommit = resolve;
      });
      try {
        const result = await options.commit(pending, confirmed, signal);
        if (!result.ok) return result;
        const member = pending.member;
        pending = undefined;
        options.signal?.removeEventListener('abort', onAbort);
        publish({ kind: 'complete', member });
        return result;
      } catch {
        return { ok: false, code: 'storage-failed' };
      } finally {
        busy = false;
        finishCommit?.();
        committing = undefined;
      }
    },
    async cancel() {
      await committing;
      if (state.kind === 'complete') return;
      options.signal?.removeEventListener('abort', onAbort);
      abort.abort();
      const host = pending;
      pending = undefined;
      publish({ kind: 'cancelled' });
      if (host) await release(host);
    },
  };
  const onAbort = () => {
    void flow.cancel();
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });
  return { ok: true, value: flow };
}
