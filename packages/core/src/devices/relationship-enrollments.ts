import { OperationalDatabaseError, type OperationalDatabaseModulePort } from '../database/owner.js';
import { PAIRING_OFFER_TTL_MS, type DevicePairing } from './pairing.js';

const RETAIN_AFTER_EXPIRY_MS = 60_000;
const MAX_ENROLLMENT_RECORDS = 1024;
const MAX_CLEANUP_ATTEMPTS = 8;

export interface RelationshipEnrollment {
  relationshipId: string;
  publicKey: string;
  direction: 'incoming' | 'outgoing';
  state: 'unconfirmed' | 'committed' | 'cleanup-pending' | 'cleaned' | 'cancelled';
  expiresAt: number;
  cleanupAttempts: number;
  retryAt: number | null;
  accountGeneration: string | null;
}

interface Row {
  relationship_id: string;
  public_key: string;
  direction: RelationshipEnrollment['direction'];
  state: RelationshipEnrollment['state'];
  expires_at: number;
  cleanup_attempts: number;
  retry_at: number | null;
  account_generation: string | null;
}
const view = (row: Row): RelationshipEnrollment => ({
  relationshipId: row.relationship_id,
  publicKey: row.public_key,
  direction: row.direction,
  state: row.state,
  expiresAt: row.expires_at,
  cleanupAttempts: row.cleanup_attempts,
  retryAt: row.retry_at,
  accountGeneration: row.account_generation,
});

export class EnrollmentRefused extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function createRelationshipEnrollments(options: {
  database: OperationalDatabaseModulePort;
  pairing: DevicePairing;
  now?: () => number;
}) {
  const { database, pairing } = options;
  const now = options.now ?? Date.now;
  const transact: OperationalDatabaseModulePort['transaction'] = (command, topics) => {
    try {
      return database.transaction(command, topics);
    } catch (error) {
      if (error instanceof OperationalDatabaseError && error.cause instanceof EnrollmentRefused)
        throw error.cause;
      throw error;
    }
  };
  const read = (id: string, publicKey: string, direction: RelationshipEnrollment['direction']) =>
    database.read((db) =>
      db
        .prepare(
          'SELECT * FROM relationship_client_enrollments WHERE relationship_id = ? AND public_key = ? AND direction = ?',
        )
        .get(id, publicKey, direction),
    ) as Row | undefined;
  const validateKey = (publicKey: string) => {
    if (!/^[a-f0-9]{64}$/u.test(publicKey))
      throw new EnrollmentRefused('relationship-client-key-invalid');
  };
  type Connection = Parameters<Parameters<OperationalDatabaseModulePort['transaction']>[0]>[0];
  const reserveRow = (
    db: Connection,
    id: string,
    publicKey: string,
    direction: RelationshipEnrollment['direction'],
    expiresAt: number,
    state: RelationshipEnrollment['state'],
    accountGeneration?: string,
  ) => {
    validateKey(publicKey);
    db.prepare(
      "DELETE FROM relationship_client_enrollments WHERE state IN ('cleaned', 'cancelled') AND expires_at + ? <= ?",
    ).run(RETAIN_AFTER_EXPIRY_MS, now());
    db.prepare(
      "DELETE FROM relationship_client_enrollments WHERE direction = 'incoming' AND state = 'unconfirmed' AND expires_at + ? <= ?",
    ).run(RETAIN_AFTER_EXPIRY_MS, now());
    db.prepare(`DELETE FROM relationship_client_enrollments AS e WHERE e.direction = 'incoming' AND e.state = 'committed' AND e.expires_at + ? <= ? AND NOT EXISTS (
        SELECT 1 FROM relationship_device_grants g JOIN paired_devices p ON p.device_id = g.device_id
        WHERE g.relationship_id = e.relationship_id AND p.public_key = e.public_key AND p.revoked_at IS NULL
      )`).run(RETAIN_AFTER_EXPIRY_MS, now());
    db.prepare(`DELETE FROM relationship_client_enrollments WHERE direction = 'outgoing' AND state = 'committed' AND expires_at + ? <= ? AND EXISTS (
        SELECT 1 FROM host_relationships r WHERE r.relationship_id = relationship_client_enrollments.relationship_id AND r.state = 'disconnected'
      )`).run(RETAIN_AFTER_EXPIRY_MS, now());
    const count = db
      .prepare('SELECT count(*) AS total FROM relationship_client_enrollments')
      .get() as { total: number };
    if (count.total >= MAX_ENROLLMENT_RECORDS)
      throw new EnrollmentRefused('relationship-enrollment-history-limit');
    db.prepare(
      'INSERT INTO relationship_client_enrollments (relationship_id, public_key, direction, state, expires_at, retry_at, account_generation) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id,
      publicKey,
      direction,
      state,
      expiresAt,
      state === 'cleanup-pending' ? now() : null,
      accountGeneration ?? null,
    );
  };
  const reserve = (
    id: string,
    publicKey: string,
    direction: RelationshipEnrollment['direction'],
    expiresAt: number,
    state: RelationshipEnrollment['state'],
    accountGeneration?: string,
  ) => {
    transact(
      (db) => reserveRow(db, id, publicKey, direction, expiresAt, state, accountGeneration),
      ['host-relationships'],
    );
  };
  return {
    list(): RelationshipEnrollment[] {
      return database.read((db) =>
        (
          db
            .prepare(
              'SELECT * FROM relationship_client_enrollments ORDER BY relationship_id, public_key, direction',
            )
            .all() as unknown as Row[]
        ).map(view),
      );
    },
    beginOutgoing(
      id: string,
      publicKey: string,
      accountGeneration?: string,
    ): RelationshipEnrollment {
      validateKey(publicKey);
      const existing = read(id, publicKey, 'outgoing');
      if (existing) {
        if (existing.state !== 'unconfirmed' && existing.state !== 'committed')
          throw new EnrollmentRefused('relationship-enrollment-cancelled');
        if (existing.state === 'unconfirmed' && existing.expires_at <= now())
          throw new EnrollmentRefused('relationship-enrollment-expired');
        return view(existing);
      }
      if (
        accountGeneration !== undefined &&
        database.read((db) =>
          db
            .prepare(
              "SELECT 1 FROM relationship_client_enrollments WHERE relationship_id = ? AND direction = 'outgoing' AND state IN ('unconfirmed', 'cleanup-pending')",
            )
            .get(id),
        )
      )
        throw new EnrollmentRefused('relationship-enrollment-cleanup-pending');
      reserve(
        id,
        publicKey,
        'outgoing',
        now() + PAIRING_OFFER_TTL_MS,
        'unconfirmed',
        accountGeneration,
      );
      return view(read(id, publicKey, 'outgoing')!);
    },
    beginIncoming(id: string, publicKey: string, expiresAt: number): void {
      validateKey(publicKey);
      if (
        !Number.isSafeInteger(expiresAt) ||
        expiresAt <= now() ||
        expiresAt > now() + PAIRING_OFFER_TTL_MS + RETAIN_AFTER_EXPIRY_MS
      )
        throw new EnrollmentRefused('relationship-enrollment-expired');
      const existing = read(id, publicKey, 'incoming');
      if (existing) {
        if (existing.state !== 'unconfirmed' || existing.expires_at !== expiresAt)
          throw new EnrollmentRefused('relationship-enrollment-cancelled');
        return;
      }
      reserve(id, publicKey, 'incoming', expiresAt, 'unconfirmed');
    },
    commit(id: string, publicKey: string): RelationshipEnrollment {
      const existing = read(id, publicKey, 'outgoing');
      if (!existing) throw new EnrollmentRefused('relationship-enrollment-not-found');
      if (existing.state === 'committed') return view(existing);
      if (existing.state !== 'unconfirmed' || existing.expires_at <= now())
        throw new EnrollmentRefused('relationship-enrollment-expired');
      database.transaction(
        (db) => {
          db.prepare(
            "UPDATE relationship_client_enrollments SET state = 'committed' WHERE relationship_id = ? AND public_key = ? AND direction = 'outgoing' AND state = 'unconfirmed'",
          ).run(id, publicKey);
        },
        ['host-relationships'],
      );
      return view(read(id, publicKey, 'outgoing')!);
    },
    queueCleanup(id: string, publicKey: string): RelationshipEnrollment {
      validateKey(publicKey);
      const existing = read(id, publicKey, 'outgoing');
      if (!existing)
        reserve(id, publicKey, 'outgoing', now() + PAIRING_OFFER_TTL_MS, 'cleanup-pending');
      else if (existing.state !== 'cleaned')
        database.transaction(
          (db) => {
            db.prepare(
              "UPDATE relationship_client_enrollments SET state = 'cleanup-pending', retry_at = COALESCE(retry_at, ?) WHERE relationship_id = ? AND public_key = ? AND direction = 'outgoing'",
            ).run(now(), id, publicKey);
          },
          ['host-relationships'],
        );
      return view(read(id, publicKey, 'outgoing')!);
    },
    cancelIncoming(id: string, publicKey: string, expiresAt: number): { revoked: number } {
      validateKey(publicKey);
      if (
        !Number.isSafeInteger(expiresAt) ||
        expiresAt > now() + PAIRING_OFFER_TTL_MS + RETAIN_AFTER_EXPIRY_MS
      )
        throw new EnrollmentRefused('relationship-enrollment-expired');
      const existing = read(id, publicKey, 'incoming');
      const devices = transact(
        (db) => {
          if (!existing && expiresAt > now())
            reserveRow(db, id, publicKey, 'incoming', expiresAt, 'cancelled');
          db.prepare(
            "UPDATE relationship_client_enrollments SET state = 'cancelled' WHERE relationship_id = ? AND public_key = ? AND direction = 'incoming'",
          ).run(id, publicKey);
          const devices = db
            .prepare(
              'SELECT p.device_id FROM paired_devices p JOIN relationship_device_grants g ON g.device_id = p.device_id WHERE g.relationship_id = ? AND p.public_key = ?',
            )
            .all(id, publicKey) as unknown as { device_id: string }[];
          db.prepare(
            'UPDATE paired_devices SET revoked_at = COALESCE(revoked_at, ?) WHERE public_key = ? AND device_id IN (SELECT device_id FROM relationship_device_grants WHERE relationship_id = ?)',
          ).run(new Date(now()).toISOString(), publicKey, id);
          return devices;
        },
        ['host-relationships', 'paired-devices'],
      );
      pairing.cancelRelationshipOffers(id, publicKey);
      for (const device of devices) pairing.revoke(device.device_id);
      return { revoked: devices.length };
    },
    dueCleanup(): RelationshipEnrollment[] {
      database.transaction(
        (db) => {
          db.prepare(
            "UPDATE relationship_client_enrollments SET state = 'cleanup-pending', retry_at = ? WHERE direction = 'outgoing' AND state = 'unconfirmed' AND expires_at <= ?",
          ).run(now(), now());
        },
        ['host-relationships'],
      );
      return this.list()
        .filter(
          (item) =>
            item.direction === 'outgoing' &&
            item.state === 'cleanup-pending' &&
            item.cleanupAttempts < MAX_CLEANUP_ATTEMPTS &&
            item.retryAt !== null &&
            item.retryAt <= now(),
        )
        .slice(0, 2);
    },
    beginCleanupAttempt(id: string, publicKey: string, manual = false): RelationshipEnrollment {
      const current = read(id, publicKey, 'outgoing');
      if (!current || current.state !== 'cleanup-pending')
        throw new EnrollmentRefused('relationship-enrollment-not-pending');
      if (
        !manual &&
        (current.cleanup_attempts >= MAX_CLEANUP_ATTEMPTS ||
          current.retry_at === null ||
          current.retry_at > now())
      )
        throw new EnrollmentRefused('relationship-enrollment-retry-not-due');
      const attempts = manual ? 1 : current.cleanup_attempts + 1;
      database.transaction(
        (db) => {
          db.prepare(
            "UPDATE relationship_client_enrollments SET cleanup_attempts = ?, retry_at = ? WHERE relationship_id = ? AND public_key = ? AND direction = 'outgoing'",
          ).run(
            attempts,
            attempts >= MAX_CLEANUP_ATTEMPTS
              ? null
              : now() + Math.min(60_000, 1000 * 2 ** attempts),
            id,
            publicKey,
          );
        },
        ['host-relationships'],
      );
      return view(read(id, publicKey, 'outgoing')!);
    },
    acknowledgeCleanup(id: string, publicKey: string): void {
      database.transaction(
        (db) => {
          db.prepare(
            "UPDATE relationship_client_enrollments SET state = 'cleaned', retry_at = NULL WHERE relationship_id = ? AND public_key = ? AND direction = 'outgoing' AND state = 'cleanup-pending'",
          ).run(id, publicKey);
        },
        ['host-relationships'],
      );
    },
  };
}
