import type { HostCarrier } from '@botharness/host-protocol/carrier';
import {
  parseTeamInvitation,
  teamHttpsRoute,
  type TeamInvitation,
  type TeamHostIdentity,
  type TeamResult,
  type TeamErrorCode,
} from '@botharness/host-protocol/team-invitation';
import type { SavedHost } from './hosts';
import { prepareMemberIdentity, type HostMemberIdentity } from './member-identity';
import { changeTeamDevicePassword, signInTeamDevice } from './team-client';
import { revokePairing } from './pairing';
import { discoverSignInHost, matchesSavedSignInHost } from './sign-in-discovery';

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

export async function addressInvitation(options: {
  route: string;
  username: string;
  carrier: HostCarrier;
  signal?: AbortSignal;
  now?: () => number;
}): Promise<TeamResult<TeamInvitation, TeamSignInError>> {
  const { route, username } = options;
  const now = options.now ?? Date.now;
  if (!teamHttpsRoute(route) || new URL(route).origin !== route)
    return { ok: false, code: 'insecure-transport' };
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(username)) return { ok: false, code: 'invalid-input' };
  try {
    const signal = AbortSignal.any([
      AbortSignal.timeout(8_000),
      ...(options.signal ? [options.signal] : []),
    ]);
    const discovered = await discoverSignInHost({ carrier: options.carrier, route, signal });
    if (!discovered.ok) return discovered;
    return {
      ok: true,
      value: {
        v: 1,
        host: discovered.value.host,
        routes: [route],
        username,
        expiresAt: new Date(now() + 30 * 60_000).toISOString(),
      },
    };
  } catch {
    return { ok: false, code: options.signal?.aborted ? 'request-cancelled' : 'unreachable' };
  }
}

interface TeamSignInOptions {
  carrier: HostCarrier;
  previous(hostId: string): SavedHost | undefined;
  commit(
    host: SavedHost,
    confirmed: boolean,
    signal: AbortSignal,
  ): Promise<TeamResult<SavedHost, TeamSignInError>>;
  signal?: AbortSignal;
  now?: () => number;
}

export async function prepareTeamSignIn(
  options: TeamSignInOptions & { target: TeamSignInTarget },
): Promise<TeamResult<TeamSignInFlow, TeamSignInError>> {
  const now = options.now ?? Date.now;
  let invitation: TeamInvitation;
  if (options.target.kind === 'invitation') {
    const parsed = parseTeamInvitation(options.target.link, now());
    if (!parsed.ok) return parsed;
    invitation = parsed.value;
  } else {
    const found = await addressInvitation({
      route: options.target.route,
      username: options.target.username,
      carrier: options.carrier,
      now,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    if (!found.ok) return found;
    invitation = found.value;
  }
  const previous = options.previous(invitation.host.id);
  if (!matchesSavedSignInHost(previous, invitation.host))
    return { ok: false, code: 'fingerprint-mismatch' };
  if (options.signal?.aborted) return { ok: false, code: 'request-cancelled' };
  return { ok: true, value: createTeamSignInFlow(options, { invitation }) };
}

export function continueTeamSignIn(
  options: TeamSignInOptions,
  host: SavedHost & { member: HostMemberIdentity },
): TeamSignInFlow {
  return createTeamSignInFlow(options, { host });
}

function createTeamSignInFlow(
  options: TeamSignInOptions,
  source: { invitation: TeamInvitation } | { host: SavedHost & { member: HostMemberIdentity } },
): TeamSignInFlow {
  const abort = new AbortController();
  const signal = options.signal ? AbortSignal.any([abort.signal, options.signal]) : abort.signal;
  const invitation = 'invitation' in source ? source.invitation : undefined;
  let pending: SavedHost | undefined = 'host' in source ? source.host : undefined;
  let state: TeamSignInState =
    'invitation' in source
      ? { kind: 'fingerprint', host: source.invitation.host, username: source.invitation.username }
      : signedInState(source.host.member);
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
      if (!invitation) return { ok: false, code: 'flow-step-invalid' };
      if (fingerprint !== invitation.host.fingerprint)
        return { ok: false, code: 'fingerprint-mismatch' };
      publish({ kind: 'sign-in', host: invitation.host, username: invitation.username });
      return { ok: true, value: state };
    },
    async signIn(input) {
      const refused = refuse('sign-in');
      if (refused) return refused;
      if (!invitation) return { ok: false, code: 'flow-step-invalid' };
      busy = true;
      try {
        const result = await signInTeamDevice({
          ...input,
          carrier: options.carrier,
          invitation,
          signal,
          now: (options.now ?? Date.now)(),
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
        publish(signedInState(pending.member));
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
  return flow;
}

function signedInState(member: HostMemberIdentity): TeamSignInState {
  return {
    kind: member.mustChangePassword ? 'password-change' : 'identity-confirmation',
    member,
  };
}
