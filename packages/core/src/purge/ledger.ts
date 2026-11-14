import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ContentPurgeError,
  deletedHumanSchema,
  purgeCheckpointSchema,
  purgeFactSchema,
  type PurgeCheckpoint,
  type PurgeFact,
} from './contracts.js';

export function openPurgeLedger(path: string, required: boolean) {
  if ((required || existsSync(dirname(path))) && !existsSync(path))
    throw new ContentPurgeError('purge-unavailable', 'Required Purge Ledger is missing');
  mkdirSync(dirname(path), { recursive: true });
  const existed = existsSync(path);
  const db = new DatabaseSync(path);
  let closed = false;
  try {
    db.exec('PRAGMA synchronous = FULL; PRAGMA journal_mode = DELETE;');
    if (!existed)
      db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE ledger_meta (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), version INTEGER NOT NULL);
      INSERT INTO ledger_meta VALUES (1, 1);
      CREATE TABLE purge_facts (source_event_id TEXT PRIMARY KEY, fact TEXT NOT NULL CHECK(json_valid(fact)));
      CREATE TRIGGER purge_facts_no_update BEFORE UPDATE ON purge_facts BEGIN SELECT RAISE(ABORT, 'monotonic purge ledger'); END;
      CREATE TRIGGER purge_facts_no_delete BEFORE DELETE ON purge_facts BEGIN SELECT RAISE(ABORT, 'monotonic purge ledger'); END;
      COMMIT;
    `);
    const version = db.prepare('SELECT version FROM ledger_meta WHERE singleton = 1').get();
    if (version?.version !== 1 || db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok')
      throw new Error('Invalid ledger');
    db.exec(`CREATE TABLE IF NOT EXISTS deleted_humans (human_id TEXT PRIMARY KEY, fact TEXT NOT NULL CHECK(json_valid(fact)));
      CREATE TRIGGER IF NOT EXISTS deleted_humans_no_update BEFORE UPDATE ON deleted_humans BEGIN SELECT RAISE(ABORT, 'monotonic purge ledger'); END;
      CREATE TRIGGER IF NOT EXISTS deleted_humans_no_delete BEFORE DELETE ON deleted_humans BEGIN SELECT RAISE(ABORT, 'monotonic purge ledger'); END;`);
    read();
    readDeletedHumans();
  } catch {
    db.close();
    throw new ContentPurgeError(
      'purge-unavailable',
      'Purge Ledger validation failed; Messaging is unavailable',
    );
  }
  function read(): PurgeFact[] {
    if (closed) throw new ContentPurgeError('purge-unavailable', 'Purge Ledger is closed');
    return db
      .prepare('SELECT source_event_id, fact FROM purge_facts ORDER BY source_event_id')
      .all()
      .map((row) => {
        const fact = purgeFactSchema.parse(JSON.parse(String(row.fact)));
        if (fact.sourceEventId !== row.source_event_id) throw new Error('Invalid ledger selector');
        return fact;
      });
  }
  function readDeletedHumans() {
    return db
      .prepare('SELECT human_id, fact FROM deleted_humans ORDER BY human_id')
      .all()
      .map((row) => {
        const fact = deletedHumanSchema.parse(JSON.parse(String(row.fact)));
        if (fact.humanId !== row.human_id) throw new Error('Invalid member selector');
        return fact;
      });
  }
  function checkpoint(): PurgeCheckpoint {
    const facts = read();
    const deletedHumans = readDeletedHumans();
    return {
      format: 'botharness-purge',
      version: deletedHumans.length
        ? 3
        : facts.some(
              (fact) =>
                fact.managedFiles !== undefined || !['human', 'bot'].includes(fact.author.kind),
            )
          ? 2
          : 1,
      facts,
      ...(deletedHumans.length ? { deletedHumans } : {}),
    };
  }
  return {
    checkpoint,
    union(input: unknown): void {
      const parsed = purgeCheckpointSchema.parse(input);
      const packageFacts = parsed.facts;
      const unique = new Map<string, PurgeFact>();
      for (const fact of [...read(), ...packageFacts]) {
        const previous = unique.get(fact.sourceEventId);
        if (
          previous &&
          (previous.channelId !== fact.channelId ||
            previous.messageId !== fact.messageId ||
            previous.eventAt !== fact.eventAt ||
            JSON.stringify(previous.author) !== JSON.stringify(fact.author) ||
            previous.replyTo !== fact.replyTo ||
            JSON.stringify(previous.causation) !== JSON.stringify(fact.causation) ||
            (previous.managedFiles !== undefined &&
              fact.managedFiles !== undefined &&
              JSON.stringify([...previous.managedFiles].sort()) !==
                JSON.stringify([...fact.managedFiles].sort())))
        )
          throw new Error('Conflicting purge selector');
        if (previous === undefined) unique.set(fact.sourceEventId, fact);
      }
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const fact of unique.values())
          db.prepare('INSERT OR IGNORE INTO purge_facts VALUES (?, ?)').run(
            fact.sourceEventId,
            JSON.stringify(fact),
          );
        for (const fact of parsed.deletedHumans ?? []) {
          const serialized = JSON.stringify(fact);
          const stored = db
            .prepare('SELECT fact FROM deleted_humans WHERE human_id = ?')
            .get(fact.humanId);
          if (stored !== undefined && stored.fact !== serialized)
            throw new Error('Conflicting deleted Human');
          db.prepare('INSERT OR IGNORE INTO deleted_humans VALUES (?, ?)').run(
            fact.humanId,
            serialized,
          );
        }
        db.exec('COMMIT');
      } catch (error) {
        if (db.isTransaction) db.exec('ROLLBACK');
        throw error;
      }
    },
    close() {
      if (!closed) {
        closed = true;
        db.close();
      }
    },
  };
}
