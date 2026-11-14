import { accountSpaceFiles, removeAccountSpace } from '../workspaces/space-lifecycle.js';
import { acceptMemberBotPurge, type PersonaBotDeletions } from '../bots/deletion.js';
import { z } from 'zod';
import { TeamError } from '../team/error.js';
import { type HumanContext } from '../humans/context.js';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import {
  attachOperationalModule,
  failOperationalDatabase,
  onOperationalDatabaseClose,
  type OperationalDatabaseOwner,
} from '../database/owner.js';
import {
  isChannelMessage,
  isChannelMessageAuthor,
  isChannelRecord,
  isDisbandedGroup,
  type ChannelMessage,
} from '../channels/channel.js';
import {
  ContentPurgeError,
  purgeCheckpointSchema,
  type ContentPurge,
  type DeletedHuman,
  type GroupDisbandResult,
  type PurgeFact,
  type PurgePreview,
  type PurgeSource,
  TEXT_CLEANUP_LIMIT,
  type TextCleanupKeptReason,
  type TextCleanupScope,
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
  position?: number;
}
const zSourceRows = (rows: unknown) =>
  z
    .array(
      z.object({
        source_event_id: z.string(),
        channel_id: z.string(),
        message_id: z.string(),
        source_kind: z.string(),
        body: z.string(),
        created_at: z.string(),
        payload_json: z.string(),
      }),
    )
    .parse(rows);
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
  let memberBots: Pick<PersonaBotDeletions, 'memberPreview' | 'retry'> | undefined;
  const memberWork = new Map<string, Promise<void>>();
  let startupMemberWork: Promise<void> = Promise.resolve();
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
  const readChannel = (
    human: HumanContext,
    db: DatabaseSync,
    channelId: string,
    ended = false,
    revision?: number,
  ) => {
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
      .get(channelId, human.humanId);
    if (!member || (revision !== undefined && revision < Number(member.visible_from_revision)))
      throw unsupported();
    return record;
  };
  const disbandedGroups = (db: DatabaseSync): Set<string> =>
    new Set(
      db
        .prepare(
          "SELECT channel_id FROM channel_records WHERE json_extract(record_json, '$.type') = 'group' AND json_extract(record_json, '$.deletedAt') IS NOT NULL AND json_extract(record_json, '$.name') = ''",
        )
        .all()
        .map((row) => String(row.channel_id)),
    );
  const inspect = (
    human: HumanContext,
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
        readChannel(human, db, String(placement.channel_id), false, Number(placement.revision));
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
  const applyDeletedHumans = () => {
    const deleted = ledger!.checkpoint().deletedHumans ?? [];
    if (!deleted.length) return;
    const topics = ['team', 'channel', 'human-identity'];
    port.transaction((db) => {
      let identityChanged = false;
      for (const fact of deleted) {
        if (db.prepare('SELECT 1 FROM team_settings WHERE owner_human_id = ?').get(fact.humanId))
          throw new Error('Cannot purge current Owner');
        const inserted = db
          .prepare('INSERT OR IGNORE INTO deleted_humans VALUES (?, ?)')
          .run(fact.humanId, fact.deletedAt);
        const rewritten = db
          .prepare(`UPDATE source_events SET payload_json = json_set(payload_json, '$.author', json_object('kind', 'human', 'humanId', ?, 'deleted', json('true')))
          WHERE json_extract(payload_json, '$.author.kind') = 'human'
          AND (human_id = ? OR json_extract(payload_json, '$.author.humanId') = ?)
          AND NOT EXISTS (SELECT 1 FROM messaging_purge_facts f WHERE f.source_event_id = source_events.source_event_id)
          AND (json_extract(payload_json, '$.author.deleted') IS NOT 1
            OR json_type(payload_json, '$.author.displayName') IS NOT NULL
            OR json_extract(payload_json, '$.author.humanId') IS NOT ?)`)
          .run(fact.humanId, fact.humanId, fact.humanId, fact.humanId);
        for (const table of [
          'human_roles',
          'member_grants',
          'member_credentials',
          'team_mode_suspensions',
          'local_human_names',
          'channel_human_nicknames',
          'channel_human_members',
          'channel_read_positions',
          'human_attention_decisions',
          'human_inbox_dismissals',
          'human_inbox_snoozes',
          'genui_private_views',
        ])
          db.prepare(`DELETE FROM ${table} WHERE human_id = ?`).run(fact.humanId);
        for (const table of [
          'push_devices',
          'push_sent',
          'device_notification_preferences',
          'device_live_activities',
        ])
          db.prepare(
            `DELETE FROM ${table} WHERE device_id IN (SELECT device_id FROM paired_devices WHERE human_id = ?)`,
          ).run(fact.humanId);
        db.prepare(`DELETE FROM relationship_device_grants WHERE device_id IN
          (SELECT device_id FROM paired_devices WHERE human_id = ?)`).run(fact.humanId);
        db.prepare('DELETE FROM paired_devices WHERE human_id = ?').run(fact.humanId);
        for (const channelId of fact.privateChannels ?? [])
          db.prepare(
            `UPDATE channel_records SET record_json = json_set(record_json, '$.name', '', '$.deletedAt', ?) WHERE channel_id = ?`,
          ).run(fact.deletedAt, channelId);
        db.prepare(`UPDATE channel_records SET record_json = json_set(record_json, '$.ownerHumanId',
          (SELECT owner_human_id FROM team_settings)) WHERE json_extract(record_json, '$.ownerHumanId') = ?`).run(
          fact.humanId,
        );
        for (const slug of fact.privateBots ?? [])
          acceptMemberBotPurge({
            db,
            humanId: fact.humanId,
            slug,
            acceptedAt: fact.deletedAt,
            rootDir: join(options.dshHome, 'botharness', 'bots'),
          });
        db.prepare('DELETE FROM tob_identity WHERE human_id = ?').run(fact.humanId);
        db.prepare('DELETE FROM workspace_spaces WHERE owner_human_id = ?').run(fact.humanId);
        const removed = db.prepare('DELETE FROM humans WHERE human_id = ?').run(fact.humanId);
        identityChanged ||=
          Number(inserted.changes) + Number(rewritten.changes) + Number(removed.changes) > 0;
      }
      if (identityChanged) topics.push('member-purged');
    }, topics);
  };
  const apply = (recover = true, fresh?: ReadonlySet<string>): number => {
    const all = ledger!.checkpoint().facts;
    const facts = fresh ? all.filter((fact) => fresh.has(fact.sourceEventId)) : all;
    const cleanup = new Set([
      ...(fresh ? pendingFiles : []),
      ...facts.flatMap((fact) => fact.managedFiles ?? []),
    ]);
    port.read((db) => {
      const accepted = new Set(all.map((f) => f.sourceEventId));
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
            "UPDATE source_events SET body = '', payload_json = ?, attempt_state = CASE WHEN attempt_state IN ('handled', 'ignored') THEN attempt_state ELSE 'needs-repair' END WHERE source_event_id = ?",
          ).run(String(applied.tombstone_json), fact.sourceEventId);
          db.prepare(
            "UPDATE inbox_admissions SET attempt_state = 'needs-repair', last_error = 'content-purged' WHERE source_event_id = ? AND attempt_state NOT IN ('handled', 'ignored')",
          ).run(fact.sourceEventId);
          db.prepare(
            'DELETE FROM group_send_review_drafts WHERE channel_id = ? OR source_event_id = ?',
          ).run(fact.channelId, fact.sourceEventId);
          if (
            db
              .prepare(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'genui_private_views'",
              )
              .get()
          )
            db.prepare(
              'DELETE FROM genui_private_views WHERE (channel_id, message_id) IN (SELECT channel_id, message_id FROM channel_placements WHERE source_event_id = ?)',
            ).run(fact.sourceEventId);
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
    applyDeletedHumans();
    if (facts.length)
      port.read((db) => {
        const result = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
        if (Number(result?.busy) !== 0) throw new Error('Purge checkpoint is busy');
      });
    let pending = 0;
    let retained: Set<string> | undefined;
    const references = () => (retained ??= port.read((db) => retainedManagedFiles(db)));
    pendingFiles.clear();
    for (const id of cleanup) {
      options.faultInjector?.('during-file-cleanup');
      try {
        if (attachments.purgeReviewed(id, references) === 'pending') {
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
  const describe = (human: HumanContext, db: DatabaseSync, rows: readonly SourceRow[]) => {
    const ids = rows.map((row) => row.source_event_id);
    const placements: PurgePreview['placements'] = [];
    const admissions: PurgePreview['admissions'] = [];
    const files = new Map<string, PurgePreview['files'][number]>();
    const effects: PurgePreview['effects'] = [];
    const retained = retainedManagedFiles(db, new Set(ids));
    const dependencies: unknown[] = [];
    for (const id of ids) {
      for (const placement of db
        .prepare('SELECT * FROM channel_placements WHERE source_event_id = ? ORDER BY channel_id')
        .all(id)) {
        const channel = readChannel(
          human,
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
    const derivatives = ids.length
      ? (options.derivatives?.(ids, [...new Set(admissions.map((a) => a.botSlug))]) ?? [])
      : [];
    return {
      placements,
      admissions,
      files: [...files.values()],
      effects,
      derivatives,
      dependencies,
    };
  };
  const fingerprint = (
    subject: unknown,
    rows: readonly SourceRow[],
    described: ReturnType<typeof describe>,
  ) =>
    createHash('sha256')
      .update(
        JSON.stringify([
          subject,
          rows,
          described.dependencies,
          described.files,
          described.derivatives,
          ledger!.checkpoint(),
        ]),
      )
      .digest('hex');
  const scope = (human: HumanContext, channelId: string, ids: readonly string[]) =>
    port.read((db) => {
      readChannel(human, db, channelId, true);
      const selected = [...new Set(ids)].sort();
      if (!selected.length || selected.length > 100 || selected.length !== ids.length)
        throw unsupported();
      const rows = selected.map((id) => {
        const row = db
          .prepare(
            'SELECT e.* FROM source_events e JOIN channel_placements p USING(source_event_id) WHERE p.channel_id = ? AND e.source_event_id = ?',
          )
          .get(channelId, id) as unknown as SourceRow | undefined;
        if (!row || inspect(human, db, row).refusal) throw unsupported();
        return row;
      });
      const described = describe(human, db, rows);
      return { rows, ...described, fingerprint: fingerprint(channelId, rows, described) };
    });
  const older = (human: HumanContext, input: TextCleanupScope) =>
    port.read((db) => {
      const before = new Date(Math.min(Date.parse(input.before), now().getTime())).toISOString();
      const channelIds = [...new Set(input.channelIds ?? [])].sort();
      const chosen = input.channelIds === undefined ? undefined : new Set(channelIds);
      const ended = disbandedGroups(db);
      const kept = new Map<TextCleanupKeptReason, number>();
      const rows: SourceRow[] = [];
      const names = new Map<string, string>();
      let more = false;
      for (const candidate of db
        .prepare(
          'SELECT e.* FROM source_events e WHERE e.created_at < ? AND EXISTS (SELECT 1 FROM channel_placements p WHERE p.source_event_id = e.source_event_id) AND NOT EXISTS (SELECT 1 FROM messaging_purge_facts f WHERE f.source_event_id = e.source_event_id) ORDER BY e.created_at, e.source_event_id',
        )
        .iterate(before)) {
        const row = candidate as unknown as SourceRow;
        const placed = db
          .prepare('SELECT channel_id, revision FROM channel_placements WHERE source_event_id = ?')
          .all(row.source_event_id)
          .filter((p) => !ended.has(String(p.channel_id)));
        if (chosen && !placed.some((p) => chosen.has(String(p.channel_id)))) continue;
        if (inspect(human, db, row).refusal) continue;
        const reason: TextCleanupKeptReason | undefined =
          chosen && placed.some((p) => !chosen.has(String(p.channel_id)))
            ? 'shared'
            : db
                  .prepare(
                    "SELECT 1 FROM inbox_admissions WHERE source_event_id = ? AND attempt_state IN ('pending', 'running', 'retryable')",
                  )
                  .get(row.source_event_id)
              ? 'bot-working'
              : db
                    .prepare(
                      "SELECT 1 FROM messaging_outbox WHERE state IN ('pending', 'in-flight') AND (json_extract(body, '$.sourceEventId') = ? OR json_extract(body, '$.forwardSourceEventId') = ? OR 'dm-mirror-' || id = ?)",
                    )
                    .get(row.source_event_id, row.source_event_id, row.source_event_id)
                ? 'delivery-pending'
                : undefined;
        if (reason) {
          kept.set(reason, (kept.get(reason) ?? 0) + 1);
          continue;
        }
        if (rows.length === TEXT_CLEANUP_LIMIT) {
          more = true;
          break;
        }
        rows.push(row);
        for (const p of placed)
          names.set(String(p.channel_id), readChannel(human, db, String(p.channel_id)).name);
      }
      const described = describe(human, db, rows);
      const chats = new Map<string, number>();
      for (const placement of described.placements)
        if (!ended.has(placement.channelId))
          chats.set(placement.channelId, (chats.get(placement.channelId) ?? 0) + 1);
      return {
        rows,
        before,
        channelIds,
        more,
        ...described,
        kept: [...kept].map(([reason, messages]) => ({ reason, messages })),
        chats: [...chats].map(([channelId, messages]) => ({
          channelId,
          name: names.get(channelId) ?? channelId,
          messages,
        })),
        fingerprint: fingerprint([before, channelIds, more], rows, described),
      };
    });
  const purgeAuthor = (author: unknown): PurgeFact['author'] => {
    if (!isChannelMessageAuthor(author)) throw unsupported();
    return author.kind === 'human' ? { kind: 'human' } : author;
  };
  const accept = (human: HumanContext, rows: readonly SourceRow[], deletedHuman?: DeletedHuman) => {
    const acceptedAt = now().toISOString();
    try {
      ledger!.union({
        format: 'botharness-purge',
        version: deletedHuman ? 3 : 2,
        ...(deletedHuman ? { deletedHumans: [deletedHuman] } : {}),
        facts: rows.map((row): PurgeFact => ({
          sourceEventId: row.source_event_id,
          channelId: row.channel_id,
          messageId: row.message_id,
          eventAt: row.created_at,
          author: purgeAuthor(
            deletedHuman
              ? (JSON.parse(row.payload_json).author ?? { kind: 'system' })
              : port.read((db) => inspect(human, db, row).message!.author),
          ),
          managedFiles: port.read((db) => [...managedSourceFiles(db, row.source_event_id).keys()]),
          ...(JSON.parse(row.payload_json).replyTo === undefined
            ? {}
            : { replyTo: JSON.parse(row.payload_json).replyTo }),
          ...(JSON.parse(row.payload_json).botCausation === undefined
            ? {}
            : { causation: JSON.parse(row.payload_json).botCausation }),
          actor: human.humanId,
          reason: 'human-request',
          acceptedAt,
        })),
      });
      options.faultInjector?.('after-acceptance');
      const cleanupPending = apply(false, new Set(rows.map((row) => row.source_event_id)));
      options.warn?.(`content-purge initiator=human phase=complete sources=${rows.length}`);
      return cleanupPending;
    } catch {
      fail();
      throw unavailable();
    }
  };
  const verify = (token: string, digest: string) => {
    const [expiresAt, signed, signature] = token.split('/');
    const value = expiresAt + '/' + signed;
    if (
      !expiresAt ||
      !signature ||
      !/^[a-f0-9]{64}$/u.test(signature) ||
      !Number.isFinite(Date.parse(expiresAt)) ||
      Date.parse(expiresAt) <= now().getTime() ||
      signed !== digest ||
      !timingSafeEqual(Buffer.from(sign(value)), Buffer.from(signature))
    )
      throw new ContentPurgeError(
        'purge-preview-stale',
        'Scope changed or preview expired; review a new preview',
      );
  };
  const issue = (minutes: number, digest: string) => {
    const expiresAt = new Date(now().getTime() + minutes * 60_000).toISOString();
    const value = expiresAt + '/' + digest;
    return { token: value + '/' + sign(value), expiresAt };
  };
  const sign = (value: string): string => createHmac('sha256', secret).update(value).digest('hex');
  const memberTokens = new Map<
    string,
    { actor: string; humanId: string; digest: string; expires: number }
  >();
  const memberScope = (humanId: string) =>
    port.read((db) => {
      const bots = db
        .prepare('SELECT slug, body FROM persona_bots WHERE owner_human_id = ? ORDER BY slug')
        .all(humanId);
      const plans = bots.map((bot) => {
        if (!memberBots) throw unavailable();
        const plan = memberBots.memberPreview(humanId, String(bot.slug));
        if (!plan.eraseAvailable) throw unsupported();
        return plan;
      });
      const channels = db
        .prepare(`SELECT c.channel_id, c.record_json FROM channel_records c
      WHERE json_extract(c.record_json, '$.type') = 'dm'
      AND (json_extract(c.record_json, '$.ownerHumanId') = ? OR
        json_extract(c.record_json, '$.botSlug') IN (SELECT slug FROM persona_bots WHERE owner_human_id = ?) OR
        (json_extract(c.record_json, '$.remoteBot') IS NULL AND json_array_length(c.record_json, '$.members') > 0
          AND NOT EXISTS (SELECT 1 FROM json_each(c.record_json, '$.members') m
            LEFT JOIN persona_bots b ON b.slug = m.value WHERE b.owner_human_id IS NULL OR b.owner_human_id <> ?)) OR (
        EXISTS (SELECT 1 FROM channel_human_members m WHERE m.channel_id = c.channel_id AND m.human_id = ?)
        AND NOT EXISTS (SELECT 1 FROM channel_human_members m WHERE m.channel_id = c.channel_id AND m.human_id <> ?)))
      AND NOT EXISTS (SELECT 1 FROM channel_human_members m WHERE m.channel_id = c.channel_id AND m.human_id <> ?)
      ORDER BY c.channel_id`)
        .all(humanId, humanId, humanId, humanId, humanId, humanId);
      const rows = zSourceRows(
        db
          .prepare(`SELECT e.* FROM source_events e
        WHERE e.channel_id IN (SELECT value FROM json_each(?))
          AND NOT EXISTS (SELECT 1 FROM messaging_purge_facts f WHERE f.source_event_id = e.source_event_id)
          AND NOT EXISTS (SELECT 1 FROM channel_placements p WHERE p.source_event_id = e.source_event_id
            AND p.channel_id NOT IN (SELECT value FROM json_each(?)))
        ORDER BY e.source_event_id`)
          .all(
            JSON.stringify(channels.map((row) => row.channel_id)),
            JSON.stringify(channels.map((row) => row.channel_id)),
          ),
      );
      const files = new Set(
        rows.flatMap((row) => [...managedSourceFiles(db, row.source_event_id).keys()]),
      );
      const retained = files.size
        ? retainedManagedFiles(db, new Set(rows.map((row) => row.source_event_id)))
        : new Set<string>();
      const accountFiles = accountSpaceFiles(options.dshHome, humanId);
      const counts = {
        channels: channels.length,
        bots: bots.length,
        messages: rows.length,
        files: [...files].filter((id) => !retained.has(id)).length,
      };
      return {
        rows,
        bots,
        channels,
        counts,
        digest: createHash('sha256')
          .update(
            JSON.stringify([
              channels,
              rows,
              [...files].sort(),
              [...files].filter((id) => !retained.has(id)).sort(),
              bots,
              plans,
              accountFiles,
            ]),
          )
          .digest('hex'),
      };
    });
  const startMemberCleanup = (fact: DeletedHuman): Promise<void> => {
    const active = memberWork.get(fact.humanId);
    if (active) return active;
    const slugs = fact.privateBots ?? [];

    const provider = memberBots;
    if (slugs.length && !provider) return Promise.reject(unavailable());
    const work = (async () => {
      for (const slug of slugs) {
        const eligible = port.read((db) => {
          const bot = db
            .prepare('SELECT owner_human_id FROM persona_bots WHERE slug = ?')
            .get(slug);
          if (bot) return bot.owner_human_id === fact.humanId;
          return (
            db.prepare('SELECT 1 FROM persona_bot_deletions WHERE slug = ?').get(slug) !== undefined
          );
        });
        if (!eligible) continue;
        const state = await provider!.retry(slug);
        if (state.phase !== 'complete' || state.memory !== 'erased') throw unavailable();
        port.transaction(
          (db) => {
            db.prepare(`UPDATE persona_bots SET body = json_object('slug', slug, 'displayName', '',
            'createdAt', json_extract(body, '$.createdAt'), 'ownerHumanId', owner_human_id, 'workspaces', json('[]')) WHERE slug = ?`).run(
              slug,
            );
            db.prepare(
              "UPDATE persona_bot_deletions SET body = json_set(body, '$.displayName', '') WHERE slug = ?",
            ).run(slug);
          },
          ['bot-registry', 'content-purge'],
        );
      }
      removeAccountSpace(options.dshHome, fact.humanId);
    })();
    memberWork.set(fact.humanId, work);
    void work.then(
      () => memberWork.delete(fact.humanId),
      () => {
        memberWork.delete(fact.humanId);
        fail();
      },
    );
    return work;
  };
  return {
    bindMemberBots(provider) {
      memberBots = provider;
      const facts = ledger?.checkpoint().deletedHumans ?? [];
      startupMemberWork = (async () => {
        for (const fact of facts) await startMemberCleanup(fact);
      })();
      void startupMemberWork.catch(() => fail());
    },
    async memberSettled(humanId) {
      await startupMemberWork;
      if (options.database.mode !== 'ready') throw unavailable();
      if (humanId) {
        const fact = ledger?.checkpoint().deletedHumans?.find((entry) => entry.humanId === humanId);
        if (fact) await startMemberCleanup(fact);
      } else await Promise.all([...memberWork.values()]);
    },
    memberPreview: (human, humanId) =>
      exclusive(() => {
        for (const [token, value] of memberTokens)
          if (value.expires <= now().getTime()) memberTokens.delete(token);
        if (memberTokens.size >= 128) throw new TeamError('rate-limited');
        const scope = memberScope(humanId);
        const token = randomBytes(32).toString('base64url');
        memberTokens.set(token, {
          actor: human.humanId,
          humanId,
          digest: scope.digest,
          expires: now().getTime() + 5 * 60_000,
        });
        return { token, counts: scope.counts };
      }),
    memberConfirm: (human, humanId, token) =>
      exclusive(() => {
        const issued = memberTokens.get(token);
        memberTokens.delete(token);
        if (
          !issued ||
          issued.actor !== human.humanId ||
          issued.humanId !== humanId ||
          issued.expires <= now().getTime()
        )
          throw new TeamError('purge-token-invalid');
        const scope = memberScope(humanId);
        if (issued.digest !== scope.digest) throw new TeamError('purge-token-invalid');
        accept(human, scope.rows, {
          humanId,
          deletedAt: now().toISOString(),
          privateChannels: scope.channels.map((channel) => String(channel.channel_id)),
          privateBots: scope.bots.map((bot) => String(bot.slug)),
        });
      }),
    redactions: () => {
      const files = new Map(
        (ledger?.checkpoint().facts ?? []).flatMap((fact) =>
          fact.managedFiles === undefined || fact.managedFiles.length === 0
            ? []
            : [[fact.sourceEventId, fact.managedFiles] as const],
        ),
      );
      return port.read((db) =>
        db
          .prepare(
            'SELECT p.source_event_id, p.channel_id, p.message_id FROM channel_placements p JOIN messaging_purge_facts f ON f.source_event_id = p.source_event_id',
          )
          .all()
          .map((row) => {
            const sourceEventId = String(row.source_event_id);
            const fileIds = files.get(sourceEventId);
            return {
              sourceEventId,
              channelId: String(row.channel_id),
              messageId: String(row.message_id),
              ...(fileIds === undefined ? {} : { fileIds: [...fileIds] }),
            };
          }),
      );
    },
    history: (human: HumanContext) =>
      exclusive(() =>
        port.read((db) =>
          db
            .prepare(
              "SELECT channel_id, record_json FROM channel_records WHERE json_extract(record_json, '$.type') = 'group' AND json_extract(record_json, '$.deletedAt') IS NOT NULL ORDER BY channel_id",
            )
            .all()
            .flatMap((row) => {
              try {
                const c = readChannel(human, db, String(row.channel_id), true);
                return isDisbandedGroup(c)
                  ? []
                  : [{ id: c.id, name: c.name, deletedAt: c.deletedAt! }];
              } catch {
                return [];
              }
            }),
        ),
      ),
    sources: (human: HumanContext, channelId, before) =>
      exclusive(() =>
        port.read((db) => {
          readChannel(human, db, channelId, true);
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
              readChannel(human, db, channelId, true, Number(placement.revision));
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
                  ...(fact ? { purgedAt: String(fact.accepted_at) } : inspect(human, db, row)),
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
    preview: (human: HumanContext, channelId, ids) =>
      exclusive(() => {
        const result = scope(human, channelId, ids);
        return {
          ...issue(5, result.fingerprint),
          channelId,
          sourceEventIds: result.rows.map((r) => r.source_event_id),
          placements: result.placements,
          admissions: result.admissions,
          files: result.files,
          effects: result.effects,
          derivatives: result.derivatives,
        };
      }),
    confirm: (human: HumanContext, channelId, ids, token) =>
      exclusive(() => {
        const result = scope(human, channelId, ids);
        verify(token, result.fingerprint);
        const cleanupPending = accept(human, result.rows);
        return { accepted: result.rows.length, ...(cleanupPending ? { cleanupPending } : {}) };
      }),
    textPreview: (human: HumanContext, input) =>
      exclusive(() => {
        const result = older(human, input);
        return {
          ...issue(10, result.fingerprint),
          scope: { before: result.before, channelIds: result.channelIds },
          messages: result.rows.length,
          bytes: result.rows.reduce(
            (sum, row) => sum + Buffer.byteLength(row.body) + Buffer.byteLength(row.payload_json),
            0,
          ),
          files: result.files.filter((file) => file.disposition === 'remove').length,
          chats: result.chats,
          kept: result.kept,
          memoryReferences: result.derivatives.filter((d) => d.kind === 'memory').length,
          more: result.more,
        };
      }),
    textConfirm: (human: HumanContext, input, token) =>
      exclusive(() => {
        const result = older(human, input);
        verify(token, result.fingerprint);
        if (!result.rows.length) return { messages: 0, freedBytes: 0 };
        const size = () =>
          port.read((db) => {
            const pages = db.prepare('PRAGMA page_count').get();
            const free = db.prepare('PRAGMA freelist_count').get();
            const unit = db.prepare('PRAGMA page_size').get();
            return {
              used:
                (Number(pages?.page_count) - Number(free?.freelist_count)) *
                Number(unit?.page_size),
            };
          });
        const startUsed = size().used;
        const cleanupPending = accept(human, result.rows);
        try {
          port.read((db) => {
            if (db.isTransaction) return;
            db.exec('VACUUM');
            db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
          });
        } catch {
          options.warn?.('content-purge initiator=human phase=vacuum-skipped');
        }
        return {
          messages: result.rows.length,
          freedBytes: Math.max(0, startUsed - size().used),
          ...(cleanupPending ? { cleanupPending } : {}),
        };
      }),
    disband: (human: HumanContext, channelId): GroupDisbandResult =>
      exclusive(() => {
        const { rows, retained } = port.read((db) => {
          readChannel(human, db, channelId, true);
          const candidates = db
            .prepare(
              'SELECT e.* FROM source_events e JOIN channel_placements p USING(source_event_id) WHERE p.channel_id = ? AND NOT EXISTS (SELECT 1 FROM channel_placements o WHERE o.source_event_id = e.source_event_id AND o.channel_id != ?) AND NOT EXISTS (SELECT 1 FROM messaging_purge_facts f WHERE f.source_event_id = e.source_event_id) ORDER BY p.rowid',
            )
            .all(channelId, channelId) as unknown as SourceRow[];
          const accepted = candidates.filter((row) => !inspect(human, db, row).refusal);
          return { rows: accepted, retained: candidates.length - accepted.length };
        });
        let cleanupPending = 0;
        for (let start = 0; start < rows.length; start += TEXT_CLEANUP_LIMIT)
          cleanupPending += accept(human, rows.slice(start, start + TEXT_CLEANUP_LIMIT));
        if (retained === 0)
          port.transaction(
            (db) =>
              db
                .prepare(
                  "UPDATE channel_records SET record_json = json_set(record_json, '$.name', '') WHERE channel_id = ?",
                )
                .run(channelId),
            ['channel'],
          );
        return {
          messages: rows.length,
          ...(cleanupPending ? { cleanupPending } : {}),
          ...(retained ? { retained } : {}),
        };
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
