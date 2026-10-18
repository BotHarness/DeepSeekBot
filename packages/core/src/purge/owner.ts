import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import {
  attachOperationalModule,
  failOperationalDatabase,
  onOperationalDatabaseClose,
  type OperationalDatabaseOwner,
} from '../database/owner.js';
import { isChannelMessage, isChannelRecord, type ChannelMessage } from '../channels/channel.js';
import {
  ContentPurgeError,
  purgeCheckpointSchema,
  type ContentPurge,
  type PurgeFact,
  type PurgePreview,
  type PurgeSource,
} from './contracts.js';
import { openPurgeLedger } from './ledger.js';
import { createAttachmentStore, type AttachmentStore } from '../attachments/store.js';
import { managedSourceFiles, retainedManagedFiles } from './references.js';

interface SourceRow {
  source_event_id: string;
  channel_id: string;
  message_id: string;
  source_kind: string;
  body: string;
  created_at: string;
  payload_json: string;
  position: number;
}
const unsupported = () =>
  new ContentPurgeError(
    'purge-scope-unsupported',
    'The selected source or one of its placements is outside current Human read access',
  );

export function mountContentPurge(options: {
  dshHome: string;
  database: OperationalDatabaseOwner;
  restoreCheckpoint?: unknown;
  restoring?: boolean;
  attachments?: AttachmentStore;
  derivatives?(
    sourceEventIds: readonly string[],
    botSlugs: readonly string[],
  ): PurgePreview['derivatives'];
  now?: () => Date;
  faultInjector?: (
    stage: 'after-acceptance' | 'during-application' | 'during-file-cleanup',
  ) => void;
  warn?: (message: string) => void;
}): ContentPurge {
  const port = attachOperationalModule(options.database, 'messaging-purge');
  const now = options.now ?? (() => new Date());
  const attachments =
    options.attachments ??
    createAttachmentStore({ rootDir: join(options.dshHome, 'botharness', 'attachments') });
  let ledger: ReturnType<typeof openPurgeLedger> | undefined;
  let barrier = false;
  const pendingFiles = new Set<string>();
  const secret = randomBytes(32);
  const unavailable = () =>
    new ContentPurgeError(
      'purge-unavailable',
      'Purge authority is unavailable; restart in recovery mode',
    );
  const fail = (): void => {
    options.warn?.('content-purge initiator=host phase=failed action=repair-ledger-and-restart');
    if (options.database.mode === 'ready')
      failOperationalDatabase(options.database, 'Required Content Purge authority failed');
  };
  const exclusive = <T>(operation: () => T): T => {
    if (barrier || ledger === undefined || options.database.mode !== 'ready') throw unavailable();
    barrier = true;
    try {
      return operation();
    } finally {
      barrier = false;
    }
  };
  const readChannel = (db: DatabaseSync, channelId: string, ended = false, revision?: number) => {
    const row = db
      .prepare('SELECT record_json FROM channel_records WHERE channel_id = ?')
      .get(channelId);
    const record: unknown = row && JSON.parse(String(row.record_json));
    if (
      !isChannelRecord(record, channelId) ||
      (ended && (record.type !== 'group' || !record.deletedAt))
    )
      throw unsupported();
    if (record.type === 'dm' && record.botSlug && record.id === 'dm-' + record.botSlug)
      return record;
    const member = db
      .prepare(
        'SELECT visible_from_revision FROM channel_human_members WHERE channel_id = ? AND human_id = ? AND left_at IS NULL',
      )
      .get(channelId, 'local-human');
    if (!member || (revision !== undefined && revision < Number(member.visible_from_revision)))
      throw unsupported();
    return record;
  };
  const inspect = (
    db: DatabaseSync,
    row: SourceRow,
  ): { message?: ChannelMessage; refusal?: string } => {
    const payload = JSON.parse(row.payload_json);
    const message: unknown =
      row.source_kind === 'bridge-message' && payload.external?.event?.actor?.id
        ? {
            id: row.message_id,
            at: row.created_at,
            body: row.body,
            author: { kind: 'bridged', source: payload.external.event.actor.id },
          }
        : { ...payload, body: row.body };
    if (!isChannelMessage(message)) return { refusal: unsupported().message };
    for (const placement of db
      .prepare('SELECT channel_id, revision FROM channel_placements WHERE source_event_id = ?')
      .all(row.source_event_id)) {
      try {
        readChannel(db, String(placement.channel_id), false, Number(placement.revision));
      } catch {
        return { refusal: unsupported().message };
      }
    }
    return { message: { ...(message as ChannelMessage), body: row.body } };
  };
  const tombstone = (fact: PurgeFact): string => {
    return JSON.stringify({
      id: fact.messageId,
      at: fact.eventAt,
      author: fact.author,
      ...(fact.replyTo === undefined ? {} : { replyTo: fact.replyTo }),
      ...(fact.causation === undefined ? {} : { botCausation: fact.causation }),
      contentPurge: { actor: fact.actor, at: fact.acceptedAt, reason: fact.reason },
    });
  };
  const apply = (recover = true): number => {
    const facts = ledger!.checkpoint().facts;
    const cleanup = new Set(facts.flatMap((fact) => fact.managedFiles ?? []));
    port.read((db) => {
      const accepted = new Set(facts.map((f) => f.sourceEventId));
      for (const row of db.prepare('SELECT source_event_id FROM messaging_purge_facts').all()) {
        if (!accepted.has(String(row.source_event_id)))
          throw new Error('Operational snapshot requires missing purge facts');
      }
      db.exec('PRAGMA secure_delete = ON');
    });
    port.transaction(
      (db) => {
        for (const fact of facts) {
          const row = db
            .prepare('SELECT * FROM source_events WHERE source_event_id = ?')
            .get(fact.sourceEventId) as unknown as SourceRow | undefined;
          if (row && (row.channel_id !== fact.channelId || row.message_id !== fact.messageId))
            throw new Error('Purge selector collision');
          for (const id of managedSourceFiles(db, fact.sourceEventId).keys()) cleanup.add(id);
          db.prepare('INSERT OR IGNORE INTO messaging_purge_facts VALUES (?, ?, ?, ?, ?)').run(
            fact.sourceEventId,
            fact.channelId,
            fact.messageId,
            fact.acceptedAt,
            tombstone(fact),
          );
          const applied = db
            .prepare('SELECT tombstone_json FROM messaging_purge_facts WHERE source_event_id = ?')
            .get(fact.sourceEventId)!;
          db.prepare(
            "UPDATE source_events SET body = '', payload_json = ?, attempt_state = 'needs-repair' WHERE source_event_id = ?",
          ).run(String(applied.tombstone_json), fact.sourceEventId);
          db.prepare(
            "UPDATE inbox_admissions SET attempt_state = 'needs-repair', last_error = 'content-purged' WHERE source_event_id = ?",
          ).run(fact.sourceEventId);
          db.prepare(
            'DELETE FROM group_send_review_drafts WHERE channel_id = ? OR source_event_id = ?',
          ).run(fact.channelId, fact.sourceEventId);
          db.prepare('DELETE FROM attachment_file_bindings WHERE source_event_id = ?').run(
            fact.sourceEventId,
          );
          db.prepare('DELETE FROM messaging_managed_files WHERE source_event_id = ?').run(
            fact.sourceEventId,
          );
          for (const pending of db
            .prepare(
              "SELECT id, state, body FROM messaging_outbox WHERE (json_extract(body, '$.sourceEventId') = ? OR json_extract(body, '$.forwardSourceEventId') = ?) OR 'dm-mirror-' || id = ?",
            )
            .all(fact.sourceEventId, fact.sourceEventId, fact.sourceEventId)) {
            const intent = JSON.parse(String(pending.body));
            const state =
              pending.state === 'pending'
                ? 'cancelled'
                : pending.state === 'in-flight' && recover
                  ? 'unknown-outcome'
                  : pending.state;
            delete intent.file;
            for (const mirror of db
              .prepare(
                "SELECT source_event_id, payload_json FROM source_events WHERE json_extract(payload_json, '$.outboxOrigin.intentId') = ?",
              )
              .all(String(pending.id))) {
              const payload = JSON.parse(String(mirror.payload_json));
              db.prepare(
                "UPDATE source_events SET body = '', payload_json = ?, attempt_state = 'needs-repair' WHERE source_event_id = ?",
              ).run(
                JSON.stringify({
                  id: payload.id,
                  at: payload.at,
                  author: payload.author,
                  outboxOrigin: payload.outboxOrigin,
                  contentPurge: { actor: fact.actor, at: fact.acceptedAt, reason: fact.reason },
                }),
                String(mirror.source_event_id),
              );
            }
            const interrupted =
              pending.state === 'pending' || (pending.state === 'in-flight' && recover);
            const settledAt = now().toISOString();
            db.prepare('UPDATE messaging_outbox SET state = ?, body = ? WHERE id = ?').run(
              String(state),
              JSON.stringify({
                ...intent,
                text: '',
                state,
                ...(interrupted ? { reason: 'content-purged', settledAt } : {}),
              }),
              String(pending.id),
            );
            if (interrupted)
              db.prepare(
                'UPDATE messaging_outbox_attempts SET state = ?, finished_at = ?, reason = ? WHERE intent_id = ?',
              ).run(String(state), settledAt, 'content-purged', String(pending.id));
          }
          options.faultInjector?.('during-application');
        }
      },
      ['content-purge', 'channel', 'bot-inbox', 'outbox'],
    );
    if (facts.length)
      port.read((db) => {
        const result = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
        if (Number(result?.busy) !== 0) throw new Error('Purge checkpoint is busy');
      });
    let pending = 0;
    pendingFiles.clear();
    for (const id of cleanup) {
      options.faultInjector?.('during-file-cleanup');
      try {
        if (
          attachments.purgeReviewed(id, () => port.read((db) => retainedManagedFiles(db))) ===
          'pending'
        ) {
          pending++;
          pendingFiles.add(id);
        }
      } catch {
        pending++;
        pendingFiles.add(id);
      }
    }
    options.warn?.(`content-purge initiator=host phase=file-cleanup pending=${pending}`);
    return pending;
  };
  try {
    if (options.database.mode !== 'ready') throw unavailable();
    const required = port.read(
      (db) => db.prepare('SELECT 1 FROM messaging_purge_requirement').get() !== undefined,
    );
    if (options.restoring) purgeCheckpointSchema.parse(options.restoreCheckpoint);
    ledger = openPurgeLedger(
      join(options.dshHome, 'botharness', 'purge', 'ledger.db'),
      required && !options.restoring,
    );
    onOperationalDatabaseClose(options.database, () => ledger?.close());
    if (options.restoring) ledger.union(options.restoreCheckpoint);
    else if (options.restoreCheckpoint !== undefined)
      throw new Error('Checkpoint requires cold restore');
    port.transaction((db) =>
      db.prepare('INSERT OR IGNORE INTO messaging_purge_requirement VALUES (1, 1)').run(),
    );
    apply();
    options.warn?.('content-purge initiator=host-startup phase=applied-before-messaging');
  } catch {
    fail();
  }
  const scope = (channelId: string, ids: readonly string[]) =>
    port.read((db) => {
      readChannel(db, channelId, true);
      const selected = [...new Set(ids)].sort();
      if (!selected.length || selected.length > 100 || selected.length !== ids.length)
        throw unsupported();
      const rows: SourceRow[] = [];
      const placements: PurgePreview['placements'] = [];
      const admissions: PurgePreview['admissions'] = [];
      const files = new Map<string, PurgePreview['files'][number]>();
      const effects: PurgePreview['effects'] = [];
      const retained = retainedManagedFiles(db, new Set(selected));
      const dependencies: unknown[] = [];
      for (const id of selected) {
        const row = db
          .prepare(
            'SELECT e.* FROM source_events e JOIN channel_placements p USING(source_event_id) WHERE p.channel_id = ? AND e.source_event_id = ?',
          )
          .get(channelId, id) as unknown as SourceRow | undefined;
        if (!row || inspect(db, row).refusal) throw unsupported();
        rows.push(row);
        for (const placement of db
          .prepare('SELECT * FROM channel_placements WHERE source_event_id = ? ORDER BY channel_id')
          .all(id)) {
          const channel = readChannel(
            db,
            String(placement.channel_id),
            false,
            Number(placement.revision),
          );
          placements.push({
            channelId: channel.id,
            name: channel.name,
            messageId: String(placement.message_id),
          });
          dependencies.push(placement, channel);
        }
        const admitted = db
          .prepare('SELECT * FROM inbox_admissions WHERE source_event_id = ? ORDER BY bot_slug')
          .all(id);
        dependencies.push(admitted);
        for (const a of admitted)
          admissions.push({ botSlug: String(a.bot_slug), state: String(a.attempt_state) });
        for (const [identity, name] of managedSourceFiles(db, id))
          files.set(identity, {
            identity,
            name,
            disposition: retained.has(identity) ? 'shared' : 'remove',
          });
        for (const entry of db
          .prepare(
            "SELECT id, state, body FROM messaging_outbox WHERE (json_extract(body, '$.sourceEventId') = ? OR json_extract(body, '$.forwardSourceEventId') = ?) OR 'dm-mirror-' || id = ? ORDER BY id",
          )
          .all(id, id, id)) {
          effects.push({ id: String(entry.id), kind: 'outbox', state: String(entry.state) });
          dependencies.push(entry);
        }
        for (const entry of db
          .prepare(
            'SELECT session_id, activity FROM assignments WHERE source_event_id = ? ORDER BY session_id',
          )
          .all(id)) {
          effects.push({
            id: String(entry.session_id),
            kind: 'assignment',
            state: String(entry.activity),
          });
          dependencies.push(entry);
        }
        for (const entry of db
          .prepare(
            "SELECT source_event_id, attempt_state FROM source_events WHERE source_event_id != ? AND (json_extract(payload_json, '$.botCausation.rootSourceEventId') = ? OR json_extract(payload_json, '$.botCausation.parentSourceEventId') = ? OR json_extract(payload_json, '$.outboxOrigin.sourceEventId') = ?) ORDER BY source_event_id",
          )
          .all(id, id, id, id)) {
          effects.push({
            id: String(entry.source_event_id),
            kind: 'causal-source',
            state: String(entry.attempt_state),
          });
          dependencies.push(entry);
        }
      }
      const derivatives =
        options.derivatives?.(selected, [...new Set(admissions.map((a) => a.botSlug))]) ?? [];
      return {
        rows,
        placements,
        admissions,
        files: [...files.values()],
        effects,
        derivatives,
        fingerprint: createHash('sha256')
          .update(
            JSON.stringify([
              channelId,
              rows,
              dependencies,
              [...files.values()],
              derivatives,
              ledger!.checkpoint(),
            ]),
          )
          .digest('hex'),
      };
    });
  const sign = (value: string): string => createHmac('sha256', secret).update(value).digest('hex');
  return {
    redactions: () =>
      port.read((db) =>
        db
          .prepare(
            'SELECT p.source_event_id, p.channel_id, p.message_id FROM channel_placements p JOIN messaging_purge_facts f ON f.source_event_id = p.source_event_id',
          )
          .all()
          .map((row) => ({
            sourceEventId: String(row.source_event_id),
            channelId: String(row.channel_id),
            messageId: String(row.message_id),
          })),
      ),
    history: () =>
      exclusive(() =>
        port.read((db) =>
          db
            .prepare(
              "SELECT channel_id, record_json FROM channel_records WHERE json_extract(record_json, '$.type') = 'group' AND json_extract(record_json, '$.deletedAt') IS NOT NULL ORDER BY channel_id",
            )
            .all()
            .flatMap((row) => {
              try {
                const c = readChannel(db, String(row.channel_id), true);
                return [{ id: c.id, name: c.name, deletedAt: c.deletedAt! }];
              } catch {
                return [];
              }
            }),
        ),
      ),
    sources: (channelId, before) =>
      exclusive(() =>
        port.read((db) => {
          readChannel(db, channelId, true);
          if (before !== undefined && !/^\d+$/u.test(before)) throw unsupported();
          const rows = db
            .prepare(
              'SELECT e.*, p.rowid AS position FROM source_events e JOIN channel_placements p USING(source_event_id) WHERE p.channel_id = ? AND p.rowid < ? ORDER BY p.rowid DESC LIMIT 101',
            )
            .all(channelId, before ?? Number.MAX_SAFE_INTEGER) as unknown as SourceRow[];
          const page = rows.slice(0, 100).filter((row) => {
            try {
              const placement = db
                .prepare(
                  'SELECT revision FROM channel_placements WHERE channel_id = ? AND source_event_id = ?',
                )
                .get(channelId, row.source_event_id)!;
              readChannel(db, channelId, true, Number(placement.revision));
              return true;
            } catch {
              return false;
            }
          });
          return {
            sources: page
              .map((row): PurgeSource => {
                const fact = db
                  .prepare(
                    'SELECT accepted_at FROM messaging_purge_facts WHERE source_event_id = ?',
                  )
                  .get(row.source_event_id);
                return {
                  sourceEventId: row.source_event_id,
                  messageId: row.message_id,
                  at: row.created_at,
                  body: row.body,
                  ...(pendingFiles.size
                    ? {
                        cleanupPending:
                          ledger!
                            .checkpoint()
                            .facts.find((fact) => fact.sourceEventId === row.source_event_id)
                            ?.managedFiles?.filter((id) => pendingFiles.has(id)).length ?? 0,
                      }
                    : {}),
                  ...(fact ? { purgedAt: String(fact.accepted_at) } : inspect(db, row)),
                };
              })
              .map(({ sourceEventId, messageId, at, body, purgedAt, refusal, cleanupPending }) => ({
                sourceEventId,
                messageId,
                at,
                body,
                ...(purgedAt ? { purgedAt } : {}),
                ...(refusal ? { refusal } : {}),
                ...(cleanupPending ? { cleanupPending } : {}),
              })),
            ...(rows.length > 100 ? { before: String(rows[99]!.position) } : {}),
          };
        }),
      ),
    preview: (channelId, ids) =>
      exclusive(() => {
        const result = scope(channelId, ids);
        const expiresAt = new Date(now().getTime() + 5 * 60_000).toISOString();
        const value = expiresAt + '/' + result.fingerprint;
        return {
          token: value + '/' + sign(value),
          expiresAt,
          channelId,
          sourceEventIds: result.rows.map((r) => r.source_event_id),
          placements: result.placements,
          admissions: result.admissions,
          files: result.files,
          effects: result.effects,
          derivatives: result.derivatives,
        };
      }),
    confirm: (channelId, ids, token) =>
      exclusive(() => {
        const result = scope(channelId, ids);
        const [expiresAt, digest, signature] = token.split('/');
        const value = expiresAt + '/' + digest;
        if (
          !expiresAt ||
          !signature ||
          !/^[a-f0-9]{64}$/u.test(signature) ||
          !Number.isFinite(Date.parse(expiresAt)) ||
          Date.parse(expiresAt) <= now().getTime() ||
          digest !== result.fingerprint ||
          !timingSafeEqual(Buffer.from(sign(value)), Buffer.from(signature))
        )
          throw new ContentPurgeError(
            'purge-preview-stale',
            'Scope changed or preview expired; review a new preview',
          );
        const acceptedAt = now().toISOString();
        try {
          ledger!.union({
            format: 'botharness-purge',
            version: 2,
            facts: result.rows.map((row): PurgeFact => ({
              sourceEventId: row.source_event_id,
              channelId: row.channel_id,
              messageId: row.message_id,
              eventAt: row.created_at,
              author: port.read((db) => inspect(db, row).message!.author),
              managedFiles: port.read((db) => [
                ...managedSourceFiles(db, row.source_event_id).keys(),
              ]),
              ...(JSON.parse(row.payload_json).replyTo === undefined
                ? {}
                : { replyTo: JSON.parse(row.payload_json).replyTo }),
              ...(JSON.parse(row.payload_json).botCausation === undefined
                ? {}
                : { causation: JSON.parse(row.payload_json).botCausation }),
              actor: 'local-human',
              reason: 'human-request',
              acceptedAt,
            })),
          });
          options.faultInjector?.('after-acceptance');
          const cleanupPending = apply(false);
          options.warn?.(
            `content-purge initiator=human phase=complete sources=${result.rows.length}`,
          );
          return { accepted: result.rows.length, ...(cleanupPending ? { cleanupPending } : {}) };
        } catch {
          fail();
          throw unavailable();
        }
      }),
    checkpoint: () =>
      exclusive(() => {
        try {
          return ledger!.checkpoint();
        } catch {
          fail();
          throw unavailable();
        }
      }),
    withCheckpoint: <T>(
      exportSnapshot: (checkpoint: ReturnType<ContentPurge['checkpoint']>) => T,
    ): T => {
      if (barrier || ledger === undefined || options.database.mode !== 'ready') throw unavailable();
      barrier = true;
      try {
        const result = exportSnapshot(ledger.checkpoint());
        if (result !== null && typeof result === 'object' && 'then' in result)
          return Promise.resolve(result).finally(() => {
            barrier = false;
          }) as T;
        barrier = false;
        return result;
      } catch (error) {
        barrier = false;
        throw error;
      }
    },
    close: () => ledger?.close(),
  };
}
