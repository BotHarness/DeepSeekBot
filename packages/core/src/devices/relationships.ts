import { randomBytes } from 'node:crypto';
import { OperationalDatabaseError, type OperationalDatabaseModulePort } from '../database/owner.js';
import type { DevicePairing, PairingOffer } from './pairing.js';

export const RELATIONSHIP_APPROVAL_TTL_MS = 10 * 60 * 1000;
const MAX_LIVE_RELATIONSHIPS = 32;

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
              'SELECT peer_key FROM host_relationships WHERE peer_host_id = ? ORDER BY created_at DESC LIMIT 1',
            )
            .get(input.peer.id) as { peer_key: string } | undefined;
          if (prior && prior.peer_key !== input.peer.publicKey)
            throw new RelationshipRefused('relationship-identity-mismatch');
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
      return relationship.state === 'active' ? relationship : transition(id, 'active');
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
    disconnect(id: string, peerKey?: string): HostRelationship {
      const relationship = peerKey === undefined ? read(id) : authenticated(id, peerKey);
      database.transaction(
        (db) => {
          const date = new Date(now()).toISOString();
          db.prepare(
            "UPDATE host_relationships SET state = 'disconnected', updated_at = ?, peer_revocation_pending = ? WHERE relationship_id = ?",
          ).run(date, peerKey === undefined ? 1 : 0, id);
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
    acknowledgeDisconnect(id: string, peerKey: string): HostRelationship {
      const relationship = authenticated(id, peerKey);
      if (relationship.state !== 'disconnected')
        throw new RelationshipRefused('relationship-state-invalid');
      database.transaction(
        (db) => {
          db.prepare(
            'UPDATE host_relationships SET peer_revocation_pending = 0 WHERE relationship_id = ?',
          ).run(id);
        },
        ['host-relationships'],
      );
      return read(id);
    },
  };
}

export type HostRelationships = ReturnType<typeof createHostRelationships>;
