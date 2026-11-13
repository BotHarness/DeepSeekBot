import { randomBytes } from 'node:crypto';
import type {
  ConnectAccount,
  AccountRelationshipSession,
  AccountRelationshipOffer,
} from './connect-account.js';
import {
  accountRelationshipVerifier,
  type AccountRelationshipProof,
} from './account-relationship-proof.js';
import {
  RelationshipRefused,
  type HostRelationships,
  type RelationshipPeer,
} from './relationships.js';

export interface AccountRelationshipProposal {
  action: 'account-propose';
  proof: AccountRelationshipProof;
  enrollment: { body: string; signature: string };
}

export function createAccountRelationships(options: {
  account(): Pick<ConnectAccount, 'relationshipSession' | 'verifyOffer'> | undefined;
  relationships: HostRelationships;
  identity(): Promise<RelationshipPeer>;
  request(
    peer: RelationshipPeer,
    command: AccountRelationshipProposal | { action: 'activate'; id: string },
    signal: AbortSignal,
  ): Promise<Record<string, unknown>>;
  record?(event: {
    phase: string;
    relationshipId: string;
    durationMs: number;
    refusal?: string;
  }): void;
}) {
  const { relationships } = options;
  const running = new Set<AbortController>();
  let discovery: Promise<void> | undefined;
  let closed = false;
  let lastOutcome: 'idle' | 'running' | 'complete' | 'unavailable' = 'idle';
  const retries = new Map<string, { attempts: number; retryAt: number }>();
  let retryGeneration: string | undefined;
  let discoveryCursor = 0;
  const nonce = () => randomBytes(32).toString('base64url');
  const guard = (session: AccountRelationshipSession, signal: AbortSignal) => {
    if (closed || signal.aborted || !session.current())
      throw new RelationshipRefused('account-enrollment-cancelled');
  };
  const eligible = (peer: RelationshipPeer) => {
    const entries = relationships.list().filter((item) => item.peer.id === peer.id);
    if (entries.some((item) => item.peer.publicKey !== peer.publicKey))
      throw new RelationshipRefused('relationship-identity-mismatch');
    if (entries.some((item) => item.automaticEnrollmentSuppressed))
      throw new RelationshipRefused('relationship-automatic-enrollment-suppressed');
  };
  const own = async (session: AccountRelationshipSession, signal: AbortSignal) => {
    const local = await options.identity();
    guard(session, signal);
    const offered = await session.offer(session.registrationId, nonce(), signal);
    guard(session, signal);
    if (offered.host.id !== local.id || offered.encryption.publicKey !== local.publicKey)
      throw new RelationshipRefused('relationship-identity-mismatch');
    const verified = await options
      .account()
      ?.verifyOffer(offered.enrollment.body, offered.enrollment.signature);
    guard(session, signal);
    if (!verified?.ok) throw new RelationshipRefused('account-enrollment-proof-invalid');
    return local;
  };
  const peer = (offer: AccountRelationshipOffer): RelationshipPeer => ({
    id: offer.host.id,
    name: offer.host.name,
    publicKey: offer.encryption.publicKey,
    routes: [`https://${offer.hostname}`],
  });
  const operation = async <T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    if (closed || running.size >= 2) throw new RelationshipRefused('relationship-busy');
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 10_000);
    running.add(abort);
    try {
      return await work(abort.signal);
    } finally {
      clearTimeout(timer);
      running.delete(abort);
    }
  };
  const originMatches = (
    origin: ReturnType<HostRelationships['read']>['accountOrigin'],
    session: AccountRelationshipSession,
    peerRegistrationId: string,
  ) =>
    origin?.accountId === session.accountId &&
    origin.localRegistrationId === session.registrationId &&
    origin.peerRegistrationId === peerRegistrationId;
  const authorize = async (id: string, expectedGeneration?: string) => {
    const session = await options.account()?.relationshipSession();
    if (
      !session ||
      closed ||
      !session.current() ||
      (expectedGeneration !== undefined && session.generation !== expectedGeneration)
    )
      throw new RelationshipRefused('account-enrollment-cancelled');
    const check = () => {
      const item = relationships.read(id);
      if (
        closed ||
        !session.current() ||
        !originMatches(item.accountOrigin, session, item.accountOrigin?.peerRegistrationId ?? '')
      )
        throw new RelationshipRefused('account-enrollment-origin-mismatch');
      eligible(item.peer);
      if (item.state === 'disconnected') throw new RelationshipRefused('relationship-disconnected');
      return item;
    };
    const item = check();
    const origin = item.accountOrigin;
    if (!origin) throw new RelationshipRefused('account-enrollment-origin-mismatch');
    await operation(async (signal) => {
      await own(session, signal);
      const offered = peer(await session.offer(origin.peerRegistrationId, nonce(), signal));
      guard(session, signal);
      if (offered.id !== item.peer.id || offered.publicKey !== item.peer.publicKey)
        throw new RelationshipRefused('relationship-identity-mismatch');
      check();
    });
    return { session, check };
  };

  return {
    authorize,
    async status() {
      const session = await options.account()?.relationshipSession();
      if (!session?.current() || closed) return { state: 'signed-out' as const, relationships: [] };
      return {
        state: lastOutcome,
        generation: session.generation,
        relationships: relationships
          .list()
          .filter(
            (item) =>
              item.state === 'active' &&
              !item.automaticEnrollmentSuppressed &&
              originMatches(
                item.accountOrigin,
                session,
                item.accountOrigin?.peerRegistrationId ?? '',
              ),
          ),
      };
    },
    startDiscovery() {
      if (discovery || closed) return;
      lastOutcome = 'running';
      void this.discover().then(
        () => {
          lastOutcome = 'complete';
        },
        () => {
          lastOutcome = 'unavailable';
        },
      );
    },
    async receive(peerKey: string, command: AccountRelationshipProposal) {
      const started = Date.now();
      try {
        const answer = await operation(async (signal) => {
          const session = await options.account()?.relationshipSession();
          if (!session) throw new RelationshipRefused('account-enrollment-unavailable');
          const { proof } = command;
          if (
            proof.source.registrationId >= proof.target.registrationId ||
            proof.target.registrationId !== session.registrationId ||
            proof.source.publicKey !== peerKey ||
            proof.expiresAt <= Date.now() ||
            proof.expiresAt > Date.now() + 600_000
          )
            throw new RelationshipRefused('account-enrollment-proof-invalid');
          const local = await own(session, signal);
          if (proof.target.hostId !== local.id || proof.target.publicKey !== local.publicKey)
            throw new RelationshipRefused('relationship-identity-mismatch');
          const verified = await options
            .account()
            ?.verifyOffer(command.enrollment.body, command.enrollment.signature);
          guard(session, signal);
          if (!verified?.ok || verified.verifierHash !== accountRelationshipVerifier(proof))
            throw new RelationshipRefused('account-enrollment-proof-invalid');
          const source = peer(await session.offer(proof.source.registrationId, nonce(), signal));
          guard(session, signal);
          if (source.id !== proof.source.hostId || source.publicKey !== peerKey)
            throw new RelationshipRefused('relationship-identity-mismatch');
          eligible(source);
          const existing = relationships.list().find((item) => item.id === proof.relationshipId);
          if (
            existing &&
            !originMatches(existing.accountOrigin, session, proof.source.registrationId)
          )
            throw new RelationshipRefused('account-enrollment-origin-mismatch');
          for (const prior of relationships.list()) {
            if (
              prior.id !== proof.relationshipId &&
              prior.peer.id === source.id &&
              prior.state !== 'active' &&
              prior.state !== 'disconnected' &&
              prior.expiresAt <= Date.now() &&
              originMatches(prior.accountOrigin, session, proof.source.registrationId)
            )
              relationships.disconnect(prior.id, undefined, false);
          }
          let relationship = relationships.propose({
            id: proof.relationshipId,
            peer: source,
            direction: 'incoming',
            expiresAt: proof.expiresAt,
            accountOrigin: {
              accountId: session.accountId,
              localRegistrationId: session.registrationId,
              peerRegistrationId: proof.source.registrationId,
            },
          });
          guard(session, signal);
          eligible(source);
          relationship = relationships.approve(relationship.id, peerKey);
          return { ok: true, state: relationship.state };
        });
        options.record?.({
          phase: 'account-approved',
          relationshipId: command.proof.relationshipId,
          durationMs: Date.now() - started,
        });
        return answer;
      } catch (error) {
        const refusal =
          error instanceof RelationshipRefused ? error.code : 'account-enrollment-unavailable';
        options.record?.({
          phase: 'account-refused',
          relationshipId: command.proof.relationshipId,
          durationMs: Date.now() - started,
          refusal,
        });
        throw new RelationshipRefused(refusal);
      }
    },
    discover(): Promise<void> {
      if (discovery) return discovery;
      discovery = (async () => {
        const session = await options.account()?.relationshipSession();
        if (!session) throw new RelationshipRefused('account-enrollment-unavailable');
        if (retryGeneration !== session.generation) {
          retries.clear();
          retryGeneration = session.generation;
        }
        const { local, candidates } = await operation(async (signal) => {
          const local = await own(session, signal);
          const candidates = await session.hosts(signal);
          guard(session, signal);
          return { local, candidates };
        });
        const ordered = candidates
          .filter(
            (host) =>
              host.id > session.registrationId &&
              (retries.get(host.id)?.retryAt ?? 0) <= Date.now(),
          )
          .sort((a, b) => a.id.localeCompare(b.id));
        const cursor = ordered.length ? discoveryCursor % ordered.length : 0;
        const pending = [...ordered.slice(cursor), ...ordered.slice(0, cursor)].slice(0, 32);
        discoveryCursor = ordered.length ? (cursor + pending.length) % ordered.length : 0;
        const worker = async () => {
          for (let candidate = pending.shift(); candidate; candidate = pending.shift()) {
            const peerRegistrationId = candidate.id;
            if (!session.current() || closed) return;
            const started = Date.now();
            let relationshipId = '';
            await operation(async (signal) => {
              const offered = await session.offer(peerRegistrationId, nonce(), signal);
              guard(session, signal);
              const remote = peer(offered);
              eligible(remote);
              let existing = relationships
                .list()
                .find((item) => item.peer.id === remote.id && item.state !== 'disconnected');
              if (existing && !originMatches(existing.accountOrigin, session, peerRegistrationId))
                return;
              if (existing?.state === 'active') return;
              if (existing && existing.expiresAt <= Date.now()) {
                relationships.disconnect(existing.id, undefined, false);
                existing = undefined;
              }
              const relationship =
                existing ??
                relationships.propose({
                  peer: remote,
                  direction: 'outgoing',
                  accountOrigin: {
                    accountId: session.accountId,
                    localRegistrationId: session.registrationId,
                    peerRegistrationId,
                  },
                });
              relationshipId = relationship.id;
              const proof: AccountRelationshipProof = {
                purpose: 'account-host-relationship-v1',
                relationshipId: relationship.id,
                source: {
                  registrationId: session.registrationId,
                  hostId: local.id,
                  publicKey: local.publicKey,
                },
                target: {
                  registrationId: peerRegistrationId,
                  hostId: remote.id,
                  publicKey: remote.publicKey,
                },
                expiresAt: relationship.expiresAt,
                nonce: nonce(),
              };
              const signed = await session.offer(
                peerRegistrationId,
                accountRelationshipVerifier(proof),
                signal,
              );
              guard(session, signal);
              if (signed.host.id !== remote.id || signed.encryption.publicKey !== remote.publicKey)
                throw new RelationshipRefused('relationship-identity-mismatch');
              eligible(remote);
              const answer = await options.request(
                remote,
                { action: 'account-propose', proof, enrollment: signed.enrollment },
                signal,
              );
              guard(session, signal);
              eligible(remote);
              if (answer['state'] !== 'approved' && answer['state'] !== 'active') return;
              await options.request(remote, { action: 'activate', id: relationship.id }, signal);
              guard(session, signal);
              eligible(remote);
              relationships.activate(relationship.id, remote.publicKey);
              retries.delete(peerRegistrationId);
              options.record?.({
                phase: 'account-active',
                relationshipId,
                durationMs: Date.now() - started,
              });
            }).catch((error) => {
              const attempts = Math.min((retries.get(peerRegistrationId)?.attempts ?? 0) + 1, 8);
              if (retries.size < 32 || retries.has(peerRegistrationId))
                retries.set(peerRegistrationId, {
                  attempts,
                  retryAt: Date.now() + Math.min(5_000 * 2 ** (attempts - 1), 60_000),
                });
              options.record?.({
                phase: 'account-pending',
                relationshipId,
                durationMs: Date.now() - started,
                refusal:
                  error instanceof RelationshipRefused
                    ? error.code
                    : 'account-enrollment-unavailable',
              });
            });
          }
        };
        await Promise.all([worker(), worker()]);
      })().finally(() => {
        discovery = undefined;
      });
      return discovery;
    },
    close() {
      closed = true;
      retries.clear();
      for (const abort of running) abort.abort();
    },
  };
}
