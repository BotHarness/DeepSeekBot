import { randomBytes } from 'node:crypto';
import { OperationalDatabaseError, type OperationalDatabaseModulePort } from '../database/owner.js';
import type { DevicePairing, PairingOffer } from './pairing.js';

export const RELATIONSHIP_APPROVAL_TTL_MS = 10 * 60 * 1000;
const MAX_LIVE_RELATIONSHIPS = 32;
const MAX_RETAINED_RELATIONSHIPS = 256;
export const MAX_REVOCATION_ATTEMPTS = 8;

export interface RelationshipPeer {
  id: string;
  name: string;
  publicKey: string;
  routes: string[];
}

export interface HostRelationship {
  id: string;
  peer: RelationshipPeer;
  direction: 'incoming' | 'outgoing';
  state: 'pending' | 'approved' | 'active' | 'disconnected';
  expiresAt: number;
  peerRevocationPending: boolean;
  revocationAttempts: number;
  revocationRetryAt: number | null;
  automaticEnrollmentSuppressed: boolean;
}

interface Row {
  relationship_id: string;
  peer_host_id: string;
  peer_name: string;
  peer_key: string;
  peer_routes: string;
  direction: HostRelationship['direction'];
  state: HostRelationship['state'];
  expires_at: number;
  peer_revocation_pending: number;
  revocation_attempts: number;
  revocation_retry_at: number | null;
  automatic_enrollment_suppressed: number;
}

export class RelationshipRefused extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function view(row: Row): HostRelationship {
  return {
    id: row.relationship_id,
    peer: {
      id: row.peer_host_id,
      name: row.peer_name,
      publicKey: row.peer_key,
      routes: JSON.parse(row.peer_routes) as string[],
    },
    direction: row.direction,
    state: row.state,
    expiresAt: row.expires_at,
    peerRevocationPending: row.peer_revocation_pending === 1,
    revocationAttempts: row.revocation_attempts,
    revocationRetryAt: row.revocation_retry_at,
    automaticEnrollmentSuppressed: row.automatic_enrollment_suppressed === 1,
  };
}

export function createHostRelationships(options: {
  database: OperationalDatabaseModulePort;
  pairing: DevicePairing;
  now?: () => number;
  record?: (event: { phase: string; relationshipId: string }) => void;
}) {
  const { database, pairing } = options;
  const now = options.now ?? Date.now;
  const transact: OperationalDatabaseModulePort['transaction'] = (command, topics) => {
    try {
      return database.transaction(command, topics);
    } catch (error) {
      if (error instanceof OperationalDatabaseError && error.cause instanceof RelationshipRefused)
        throw error.cause;
      throw error;
    }
  };
  const read = (id: string): HostRelationship => {
    const row = database.read((db) =>
      db.prepare('SELECT * FROM host_relationships WHERE relationship_id = ?').get(id),
    ) as Row | undefined;
    if (!row) throw new RelationshipRefused('relationship-not-found');
    return view(row);
  };
  const authenticated = (id: string, peerKey: string): HostRelationship => {
    const relationship = read(id);
    if (relationship.peer.publicKey !== peerKey)
      throw new RelationshipRefused('relationship-identity-mismatch');
    return relationship;
  };
  const live = (relationship: HostRelationship) => {
    if (relationship.state === 'disconnected')
      throw new RelationshipRefused('relationship-disconnected');
    if (relationship.state !== 'active' && relationship.expiresAt <= now())
      throw new RelationshipRefused('relationship-expired');
  };
  const transition = (id: string, state: HostRelationship['state']) => {
    database.transaction(
      (db) => {
        db.prepare(
          'UPDATE host_relationships SET state = ?, updated_at = ? WHERE relationship_id = ?',
        ).run(state, new Date(now()).toISOString(), id);
      },
      ['host-relationships'],
    );
    options.record?.({ phase: state, relationshipId: id });
    return read(id);
  };
  return {
    read,
    updateRoutes(id: string, peerKey: string, routes: string[]): HostRelationship {
      const relationship = authenticated(id, peerKey);
      live(relationship);
      if (JSON.stringify(relationship.peer.routes) === JSON.stringify(routes)) return relationship;
      database.transaction(
        (db) => {
          db.prepare(
            'UPDATE host_relationships SET peer_routes = ?, updated_at = ? WHERE relationship_id = ?',
          ).run(JSON.stringify(routes), new Date(now()).toISOString(), id);
        },
        ['host-relationships'],
      );
      return read(id);
    },
    list(): HostRelationship[] {
      return database.read((db) =>
        (
          db
            .prepare('SELECT * FROM host_relationships ORDER BY created_at, relationship_id')
            .all() as unknown as Row[]
        ).map(view),
      );
    },
    propose(input: {
      id?: string;
      peer: RelationshipPeer;
      direction: HostRelationship['direction'];
      expiresAt?: number;
      explicitReconnect?: boolean;
    }): HostRelationship {
      const id = input.id ?? randomBytes(24).toString('base64url');
      if (
        !/^[A-Za-z0-9_-]{32}$/u.test(id) ||
        !/^[0-9a-f]{64}$/u.test(input.peer.publicKey) ||
        !/^[A-Za-z0-9_-]{1,128}$/u.test(input.peer.id) ||
        input.peer.id === pairing.host().id ||
        input.peer.name.length > 120 ||
        input.peer.routes.length > 8
      )
        throw new RelationshipRefused('relationship-input-invalid');
      const expiresAt = Math.min(
        input.expiresAt ?? now() + RELATIONSHIP_APPROVAL_TTL_MS,
        now() + RELATIONSHIP_APPROVAL_TTL_MS,
      );
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= now())
        throw new RelationshipRefused('relationship-expired');
      transact(
        (db) => {
          const existing = db
            .prepare('SELECT * FROM host_relationships WHERE relationship_id = ?')
            .get(id) as Row | undefined;
          if (existing) {
            if (
              existing.peer_host_id !== input.peer.id ||
              existing.peer_key !== input.peer.publicKey ||
              existing.direction !== input.direction
            )
              throw new RelationshipRefused('relationship-identity-mismatch');
            live(view(existing));
            return;
          }
          const prior = db
            .prepare(
              'SELECT peer_key, state FROM host_relationships WHERE peer_host_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
            )
            .get(input.peer.id) as
            | { peer_key: string; state: HostRelationship['state'] }
            | undefined;
          if (prior && prior.peer_key !== input.peer.publicKey)
            throw new RelationshipRefused('relationship-identity-mismatch');
          if (
            !input.explicitReconnect &&
            db
              .prepare(`SELECT 1 FROM host_relationships
            WHERE peer_host_id = ? AND automatic_enrollment_suppressed = 1`)
              .get(input.peer.id)
          )
            throw new RelationshipRefused('relationship-reconnect-required');
          const retained = db.prepare('SELECT count(*) AS total FROM host_relationships').get() as {
            total: number;
          };
          if (retained.total >= MAX_RETAINED_RELATIONSHIPS)
            throw new RelationshipRefused('relationship-history-limit');
          if (
            db
              .prepare(
                "SELECT 1 FROM host_relationships WHERE peer_host_id = ? AND state != 'disconnected'",
              )
              .get(input.peer.id)
          )
            throw new RelationshipRefused('relationship-already-exists');
          const count = db
            .prepare(
              "SELECT count(*) AS total FROM host_relationships WHERE state != 'disconnected'",
            )
            .get() as { total: number };
          if (count.total >= MAX_LIVE_RELATIONSHIPS)
            throw new RelationshipRefused('relationship-limit');
          const date = new Date(now()).toISOString();
          db.prepare(`INSERT INTO host_relationships
          (relationship_id, peer_host_id, peer_name, peer_key, peer_routes, direction, state, expires_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`).run(
            id,
            input.peer.id,
            input.peer.name,
            input.peer.publicKey,
            JSON.stringify(input.peer.routes),
            input.direction,
            expiresAt,
            date,
            date,
          );
        },
        ['host-relationships'],
      );
      options.record?.({ phase: 'proposed', relationshipId: id });
      return read(id);
    },
    approve(id: string, peerKey: string): HostRelationship {
      const relationship = authenticated(id, peerKey);
      live(relationship);
      if (relationship.direction !== 'incoming')
        throw new RelationshipRefused('relationship-approval-invalid');
      return relationship.state === 'pending' ? transition(id, 'approved') : relationship;
    },
    activate(id: string, peerKey: string): HostRelationship {
      const relationship = authenticated(id, peerKey);
      live(relationship);
      if (relationship.direction === 'incoming' && relationship.state === 'pending')
        throw new RelationshipRefused('relationship-approval-required');
      if (relationship.state !== 'active') transition(id, 'active');
      database.transaction(
        (db) => {
          db.prepare(
            'UPDATE host_relationships SET automatic_enrollment_suppressed = 0 WHERE peer_host_id = ?',
          ).run(relationship.peer.id);
        },
        ['host-relationships'],
      );
      return read(id);
    },
    enrollment(
      id: string,
      peerKey: string,
      client: { publicKey: string; name: string },
    ): PairingOffer {
      const relationship = authenticated(id, peerKey);
      live(relationship);
      if (relationship.state !== 'active')
        throw new RelationshipRefused('relationship-approval-required');
      if (!/^[0-9a-f]{64}$/u.test(client.publicKey))
        throw new RelationshipRefused('relationship-client-key-invalid');
      const offer = pairing.createOffer({ relationshipId: id, name: client.name });
      const request = pairing.requestKey({
        offer: offer.offer,
        publicKey: client.publicKey,
        name: client.name,
      });
      if (!request.ok || !pairing.approveKey(request.receipt, client.publicKey))
        throw new RelationshipRefused('relationship-enrollment-failed');
      return offer;
    },
    disconnect(id: string, peerKey?: string, suppressAutomaticEnrollment = true): HostRelationship {
      const relationship = peerKey === undefined ? read(id) : authenticated(id, peerKey);
      database.transaction(
        (db) => {
          const date = new Date(now()).toISOString();
          db.prepare(
            `UPDATE host_relationships SET state = 'disconnected', updated_at = ?,
             peer_revocation_pending = ?, revocation_attempts = 0, revocation_retry_at = ?
             WHERE relationship_id = ? AND state != 'disconnected'`,
          ).run(date, peerKey === undefined ? 1 : 0, peerKey === undefined ? now() : null, id);
          if (suppressAutomaticEnrollment && relationship.state !== 'disconnected')
            db.prepare(`UPDATE host_relationships
            SET automatic_enrollment_suppressed = 1 WHERE relationship_id = ?`).run(id);
        },
        ['host-relationships', 'paired-devices'],
      );
      const devices = database.read((db) =>
        db
          .prepare('SELECT device_id FROM relationship_device_grants WHERE relationship_id = ?')
          .all(id),
      ) as { device_id: string }[];
      for (const device of devices) pairing.revoke(device.device_id);
      options.record?.({ phase: 'disconnected', relationshipId: relationship.id });
      return read(id);
    },
    beginRevocationAttempt(id: string, manual = false): HostRelationship {
      const relationship = read(id);
      if (relationship.state !== 'disconnected' || !relationship.peerRevocationPending)
        return relationship;
      if (
        !manual &&
        (relationship.revocationAttempts >= MAX_REVOCATION_ATTEMPTS ||
          (relationship.revocationRetryAt !== null && relationship.revocationRetryAt > now()))
      )
        throw new RelationshipRefused('relationship-retry-not-due');
      const attempt = manual ? 1 : relationship.revocationAttempts + 1;
      database.transaction(
        (db) => {
          db.prepare(`UPDATE host_relationships SET revocation_attempts = ?, revocation_retry_at = ?
          WHERE relationship_id = ? AND state = 'disconnected' AND peer_revocation_pending = 1`).run(
            attempt,
            attempt >= MAX_REVOCATION_ATTEMPTS
              ? null
              : now() + Math.min(60_000, 1000 * 2 ** attempt),
            id,
          );
        },
        ['host-relationships'],
      );
      return read(id);
    },
    acknowledgeDisconnect(id: string, peerKey: string): HostRelationship {
      const relationship = authenticated(id, peerKey);
      if (relationship.state !== 'disconnected')
        throw new RelationshipRefused('relationship-state-invalid');
      database.transaction(
        (db) => {
          db.prepare(
            'UPDATE host_relationships SET peer_revocation_pending = 0, revocation_retry_at = NULL WHERE relationship_id = ?',
          ).run(id);
        },
        ['host-relationships'],
      );
      return read(id);
    },
  };
}

export type HostRelationships = ReturnType<typeof createHostRelationships>;
