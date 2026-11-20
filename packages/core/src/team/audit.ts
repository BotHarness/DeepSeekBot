import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { auditListSchema, auditRecordSchema, type AuditRecord } from './private-contract.js';
import { TeamError } from './error.js';

const rowSchema = z.object({ seq: z.number(), audit_id: z.string(), record_json: z.string() });
const headSchema = z.object({ seq: z.number(), audit_id: z.string(), hash: z.string() });
const digest = (record: Omit<AuditRecord, 'hash'>): string =>
  createHash('sha256').update(JSON.stringify(record)).digest('hex');
const unsigned = (record: AuditRecord): Omit<AuditRecord, 'hash'> => {
  const { hash: _hash, ...value } = auditRecordSchema.parse(record);
  return value;
};

export class PrivateAudit {
  constructor(private readonly db: OperationalDatabaseModulePort) {}

  append(
    input: Omit<AuditRecord, 'auditId' | 'prevHash' | 'hash'>,
    transaction?: DatabaseSync,
  ): AuditRecord {
    const write = (db: DatabaseSync) => {
      const head = headSchema.parse(db.prepare('SELECT * FROM private_audit_head').get());
      const tail = db.prepare('SELECT * FROM private_access_audit ORDER BY seq DESC LIMIT 1').get();
      if (head.seq > 0) {
        const parsed = rowSchema.safeParse(tail);
        if (
          !parsed.success ||
          parsed.data.seq !== head.seq ||
          parsed.data.audit_id !== head.audit_id
        )
          return undefined;
        const record = auditRecordSchema.safeParse(JSON.parse(parsed.data.record_json));
        if (
          !record.success ||
          record.data.hash !== head.hash ||
          digest(unsigned(record.data)) !== head.hash
        )
          return undefined;
      } else if (tail !== undefined) return undefined;
      const value = auditRecordSchema.omit({ hash: true }).parse({
        auditId: randomUUID(),
        ...input,
        prevHash: head.hash,
      });
      const record = { ...value, hash: digest(value) };
      db.prepare('INSERT INTO private_access_audit VALUES (?, ?, ?)').run(
        head.seq + 1,
        record.auditId,
        JSON.stringify(record),
      );
      db.prepare('UPDATE private_audit_head SET seq = ?, audit_id = ?, hash = ?').run(
        head.seq + 1,
        record.auditId,
        record.hash,
      );
      return record;
    };
    if (transaction && !transaction.isTransaction) throw new Error('audit-transaction-required');
    const appended = transaction
      ? write(transaction)
      : this.db.transaction(write, ['private-audit']);
    if (!appended) throw new TeamError('audit-integrity-failed');
    return appended;
  }

  list(input: z.infer<typeof auditListSchema>) {
    return this.db.read((db) => {
      let after = 0;
      if (input.after !== undefined) {
        const row = z
          .object({ seq: z.number() })
          .safeParse(
            db.prepare('SELECT seq FROM private_access_audit WHERE audit_id = ?').get(input.after),
          );
        if (!row.success) throw new TeamError('invalid-input');
        after = row.data.seq;
      }
      const limit = input.limit ?? 50;
      const rows = z
        .array(rowSchema)
        .parse(
          db
            .prepare('SELECT * FROM private_access_audit WHERE seq > ? ORDER BY seq LIMIT ?')
            .all(after, limit + 1),
        );
      const records = rows
        .slice(0, limit)
        .map((row) => auditRecordSchema.parse(JSON.parse(row.record_json)));
      return { records, ...(rows.length > limit ? { next: records.at(-1)?.auditId } : {}) };
    });
  }

  verify(): { ok: true } | { ok: false; brokenAt: string } {
    return this.db.read((db) => {
      const head = headSchema.parse(db.prepare('SELECT * FROM private_audit_head').get());
      let seq = 0;
      let hash = '';
      let auditId = '';
      for (const raw of db.prepare('SELECT * FROM private_access_audit ORDER BY seq').iterate()) {
        const row = rowSchema.parse(raw);
        let record: AuditRecord;
        try {
          record = auditRecordSchema.parse(JSON.parse(row.record_json));
        } catch {
          return { ok: false, brokenAt: row.audit_id };
        }
        if (
          row.seq !== seq + 1 ||
          row.audit_id !== record.auditId ||
          record.prevHash !== hash ||
          digest(unsigned(record)) !== record.hash
        )
          return { ok: false, brokenAt: row.audit_id };
        seq = row.seq;
        hash = record.hash;
        auditId = record.auditId;
      }
      return seq === head.seq && hash === head.hash && auditId === head.audit_id
        ? { ok: true }
        : { ok: false, brokenAt: head.audit_id || auditId };
    });
  }
}
