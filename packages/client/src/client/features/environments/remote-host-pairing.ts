import { prepareTeamSignIn, type TeamSignInError } from '@botharness/host-client/team-sign-in';
import { parseTeamInvitation } from '@botharness/host-protocol/team-invitation';
import { prepareMemberIdentity } from '@botharness/host-client/member-identity';
import type { HostCarrier } from '@botharness/host-protocol/carrier';
import type { SavedHost } from '@botharness/host-client/hosts';
import { parsePairingLink, redeemPairing } from '@botharness/host-client/pairing';
import { releaseRemoteHostViewers } from '../../remote-host-viewer.js';
import { hostSettingsDrafts } from '../../host-settings-drafts.js';
import type { RemoteHosts } from '../../remote-hosts.js';
import type { HostEntry, HostStorage, RemoteHostTelemetry } from './remote-host-types.js';
import type { ChoiceChange } from './remote-host-credentials.js';

const PAIR_FAILURES: ReadonlySet<string> = new Set([
  'unreachable',
  'no-route',
  'host-key-required',
]);

export function createRemoteHostPairing<AutomaticChoice extends { hostId: string }>(options: {
  enabled: boolean;
  carrier: HostCarrier;
  storage: HostStorage | undefined;
  record: RemoteHostTelemetry;
  clients: ReadonlyMap<string, HostEntry>;
  pairing: Set<string>;
  readHosts: (storage: HostStorage | undefined) => SavedHost[];
  readAutomaticChoices: (storage: HostStorage | undefined) => AutomaticChoice[];
  choiceSnapshot: (choice: AutomaticChoice | undefined) => string | null;
  persistCredential: (
    hostId: string,
    expected: SavedHost | undefined,
    change: (current: SavedHost | undefined) => SavedHost | undefined,
    choiceChange?: ChoiceChange<AutomaticChoice>,
  ) => Promise<SavedHost | undefined>;
  sameCredential: (a: SavedHost, b: SavedHost) => boolean;
  revoke: (host: SavedHost) => Promise<unknown>;
  attach: (host: SavedHost) => void;
  retireEntry: (entry: HostEntry) => void;
  selectHost: (hostId: string) => void;
  publish: () => void;
}): Pick<RemoteHosts, 'teamSignIn' | 'pair'> {
  const {
    enabled,
    carrier,
    storage,
    record,
    clients,
    pairing,
    readHosts,
    readAutomaticChoices,
    choiceSnapshot,
    persistCredential,
    sameCredential,
    revoke,
    attach,
    retireEntry,
    selectHost,
    publish,
  } = options;
  return {
    async teamSignIn(target, localHostId, signal) {
      if (!enabled) return { ok: false, code: 'owner-required' };
      const preparedFlow = await prepareTeamSignIn({
        target,
        carrier,
        ...(signal ? { signal } : {}),
        previous: (hostId) => readHosts(storage).find((host) => host.hostId === hostId),
        async commit(host, confirmed, flowSignal) {
          if (host.hostId === localHostId) return { ok: false, code: 'this-host' };
          if (flowSignal.aborted) return { ok: false, code: 'request-cancelled' };
          if (
            hostSettingsDrafts.hasDirty(host.hostId) &&
            !(await hostSettingsDrafts.prepare(host.hostId))
          )
            return { ok: false, code: 'request-cancelled' };
          const previous = readHosts(storage).find((item) => item.hostId === host.hostId);
          let refusal: TeamSignInError | undefined;
          let saved: SavedHost | undefined;
          try {
            saved = await persistCredential(host.hostId, previous, (current) => {
              if (flowSignal.aborted) throw new Error('request-cancelled');
              const prepared = prepareMemberIdentity(
                { hosts: current ? [current] : [] },
                host,
                confirmed,
              );
              if (!prepared.ok) {
                refusal = prepared.code;
                throw new Error(prepared.code);
              }
              return host;
            });
          } catch {
            return {
              ok: false,
              code: refusal ?? (flowSignal.aborted ? 'request-cancelled' : 'storage-failed'),
            };
          }
          const existing = clients.get(host.hostId);
          if (existing) {
            const releasing = releaseRemoteHostViewers(existing.client);
            retireEntry(existing);
            await releasing.catch(() => undefined);
          }
          attach(saved ?? host);
          selectHost(host.hostId);
          publish();
          if (previous && previous.credential !== host.credential) {
            try {
              await revoke(previous);
            } catch {}
          }
          return { ok: true, value: saved ?? host };
        },
      });
      if (preparedFlow.ok) {
        const step = preparedFlow.value.getSnapshot();
        if (step.kind === 'fingerprint' && step.host.id === localHostId) {
          await preparedFlow.value.cancel();
          return { ok: false, code: 'this-host' };
        }
      }
      return preparedFlow;
    },
    async pair(link, deviceName, localHostId, trust) {
      if (!enabled) return { ok: false, code: 'owner-required' };
      if (trust?.signal?.aborted) return { ok: false, code: 'cancelled' };
      try {
        if (new URL(link.trim()).hostname === 'team') {
          const invitation = parseTeamInvitation(link);
          return invitation.ok
            ? { ok: false, code: 'team-sign-in-required', invitation: invitation.value }
            : invitation;
        }
      } catch {}
      const parsed = parsePairingLink(link);
      const refused = (code: 'this-host' | 'already-paired') => {
        record('remote_host:host_pair_complete', { outcome: 'refused' });
        return { ok: false, code } as const;
      };
      if (!parsed.ok) {
        record('remote_host:host_pair_complete', {
          outcome: PAIR_FAILURES.has(parsed.code) ? 'failed' : 'refused',
        });
        return parsed;
      }
      if (parsed.payload.host.id === localHostId) return refused('this-host');
      if (clients.has(parsed.payload.host.id)) return refused('already-paired');
      if (pairing.has(parsed.payload.host.id)) return { ok: false, code: 'pairing-in-progress' };
      const priorChoice = readAutomaticChoices(storage).find(
        (choice) => choice.hostId === parsed.payload.host.id,
      );
      pairing.add(parsed.payload.host.id);
      try {
        const redeemed = await redeemPairing({
          payload: parsed.payload,
          deviceName,
          carrier,
          ...trust,
        });
        if (!redeemed.ok) {
          if (trust?.signal?.aborted) return redeemed;
          record('remote_host:host_pair_complete', {
            outcome: PAIR_FAILURES.has(redeemed.code) ? 'failed' : 'refused',
          });
          return redeemed;
        }
        const cancelNew = async () => {
          try {
            await persistCredential(
              redeemed.host.hostId,
              redeemed.host,
              () => undefined,
              priorChoice ? { kind: 'restore', choice: priorChoice } : { kind: 'preserve' },
            );
          } catch {}
          await revoke(redeemed.host);
        };
        if (trust?.signal?.aborted) {
          await cancelNew();
          return { ok: false, code: 'cancelled' };
        }
        try {
          if (!storage) throw new Error('storage-unavailable');
          await persistCredential(redeemed.host.hostId, undefined, () => {
            if (trust?.signal?.aborted) throw new Error('pairing-cancelled');
            return redeemed.host;
          });
        } catch {
          await cancelNew();
          record('remote_host:host_pair_complete', { outcome: 'failed' });
          return { ok: false, code: trust?.signal?.aborted ? 'cancelled' : 'storage-failure' };
        }
        if (trust?.signal?.aborted) {
          await cancelNew();
          return { ok: false, code: 'cancelled' };
        }
        try {
          await persistCredential(
            redeemed.host.hostId,
            redeemed.host,
            (current) => {
              if (trust?.signal?.aborted) throw new Error('pairing-cancelled');
              return current;
            },
            { kind: 'clear', expected: choiceSnapshot(priorChoice) },
          );
        } catch {
          await cancelNew();
          return { ok: false, code: trust?.signal?.aborted ? 'cancelled' : 'storage-failure' };
        }
        if (trust?.signal?.aborted) {
          await cancelNew();
          return { ok: false, code: 'cancelled' };
        }
        const savedNow = readHosts(storage).find((item) => item.hostId === redeemed.host.hostId);
        const existing = clients.get(redeemed.host.hostId);
        if (
          !savedNow ||
          !sameCredential(savedNow, redeemed.host) ||
          (existing && !sameCredential(existing.host, redeemed.host))
        ) {
          await cancelNew();
          return { ok: false, code: 'cancelled' };
        }
        if (!existing) attach(savedNow);
        selectHost(redeemed.host.hostId);
        publish();
        record('remote_host:host_pair_complete', { outcome: 'success' });
        return redeemed;
      } finally {
        pairing.delete(parsed.payload.host.id);
      }
    },
  };
}
