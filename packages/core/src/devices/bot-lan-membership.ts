import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { hostId } from './bot-network-wire.js';

const publicKey = z.string().regex(/^[a-f0-9]{64}$/u);
const identity = z.object({ hostId, publicKey });
const admission = identity.extend({
  id: z.string().regex(/^[a-f0-9]{32}$/u),
  name: z.string().max(128),
  admittedAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
});
export type LanBotAdmission = z.infer<typeof admission>;
export interface LanBotCandidate {
  hostId: string;
  publicKey: string;
  name: string;
}

const SELECT = `SELECT host_id AS hostId, public_key AS publicKey,
  admission_id AS id, name, admitted_at AS admittedAt, revoked_at AS revokedAt
  FROM bot_lan_admissions`;

export function createLanBotMembership(options: {
  database: OperationalDatabaseModulePort;
  candidate(hostId: string): LanBotCandidate | undefined;
  knownKey?(hostId: string): string | undefined;
}) {
  const { database } = options;
  function find(id: string) {
    const row = database.read((db) => db.prepare(`${SELECT} WHERE host_id = ?`).get(id));
    return row === undefined ? undefined : admission.parse(row);
  }
  return {
    get: find,
    list(): LanBotAdmission[] {
      return database
        .read((db) => db.prepare(`${SELECT} ORDER BY host_id`).all())
        .map((row) => admission.parse(row));
    },
    current(id: string, key: string): LanBotAdmission | undefined {
      const value = find(id);
      return value?.publicKey === key && value.revokedAt === null ? value : undefined;
    },
    admit(input: { hostId: string; publicKey: string }): LanBotAdmission {
      const expected = identity.parse(input);
      const candidate = options.candidate(expected.hostId);
      const pinned = options.knownKey?.(expected.hostId);
      if (!candidate) throw new Error('network-candidate-unavailable');
      if (
        candidate.publicKey !== expected.publicKey ||
        (pinned !== undefined && pinned !== expected.publicKey)
      )
        throw new Error('network-identity-changed');
      const current = find(expected.hostId);
      if (current?.publicKey === expected.publicKey && current.revokedAt === null) return current;
      const next = admission.parse({
        ...expected,
        id: randomBytes(16).toString('hex'),
        name: candidate.name,
        admittedAt: new Date().toISOString(),
        revokedAt: null,
      });
      database.transaction(
        (db) => {
          if (current === undefined) {
            const count = z
              .object({ total: z.number() })
              .parse(db.prepare('SELECT COUNT(*) AS total FROM bot_lan_admissions').get());
            if (count.total >= 256) throw new Error('network-admission-limit');
          }
          db.prepare(`INSERT INTO bot_lan_admissions
          (host_id, public_key, admission_id, name, admitted_at, revoked_at)
          VALUES (?, ?, ?, ?, ?, NULL)
          ON CONFLICT(host_id) DO UPDATE SET public_key = excluded.public_key,
            admission_id = excluded.admission_id, name = excluded.name,
            admitted_at = excluded.admitted_at, revoked_at = NULL`).run(
            next.hostId,
            next.publicKey,
            next.id,
            next.name,
            next.admittedAt,
          );
        },
        ['bot-lan'],
      );
      return next;
    },
    revoke(id: string): boolean {
      hostId.parse(id);
      return database.transaction(
        (db) =>
          Number(
            db
              .prepare(`UPDATE bot_lan_admissions SET revoked_at = ?
          WHERE host_id = ? AND revoked_at IS NULL`)
              .run(new Date().toISOString(), id).changes,
          ) > 0,
        ['bot-lan'],
      );
    },
  };
}
