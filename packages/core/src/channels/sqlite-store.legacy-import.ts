import { OWNER_HUMAN_CONTEXT } from '../humans/context.js';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isValidChannelId, type ChannelMessage, type ChannelRecord } from './channel.js';
import { parseRecord } from './sqlite-store.records.js';
import { parseMessage, sourceKind, eventPayload } from './sqlite-store.message-payload.js';
import type { SqliteChannelStoreOptions } from './sqlite-store.types.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { createChannelAdmissions } from './sqlite-store.admissions.js';
import type { BotSourcePolicyStore } from '../runtime/source-policy.js';

export function importLegacyChannels({
  options,
  database,
  rootDir,
  sourceHumanIdentity,
  sourcePolicy,
  sql,
}: {
  options: SqliteChannelStoreOptions;
  database: OperationalDatabaseModulePort;
  rootDir: string;
  sourceHumanIdentity: ReturnType<typeof createChannelAdmissions>['sourceHumanIdentity'];
  sourcePolicy: BotSourcePolicyStore;
  sql: {
    insertLegacySourceEvent: (sourceHumanIdentity: () => boolean) => string;
    updateLegacyPayload: string;
    restoreHumanDmAdmission: string;
    insertLegacyPlacement: string;
    backfillForHuman: string;
  };
}): void {
  if (
    options.databaseOwnerReady !== false &&
    database.read((db) => db.prepare('SELECT channel_id FROM channel_records LIMIT 1').get()) ===
      undefined &&
    existsSync(rootDir)
  ) {
    const legacy: Array<{
      record: ChannelRecord;
      messages: ChannelMessage[];
      readPosition?: {
        messageId: string;
        revision: number;
        readAt: string;
      };
    }> = [];
    for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isValidChannelId(entry.name)) continue;
      const directory = join(rootDir, entry.name);
      let record: ChannelRecord | undefined;
      try {
        record = parseRecord(readFileSync(join(directory, 'channel.json'), 'utf8'), entry.name);
      } catch {
        continue;
      }
      if (record === undefined) continue;
      let messages: ChannelMessage[] = [];
      try {
        messages = readFileSync(join(directory, 'messages.ndjson'), 'utf8')
          .split('\n')
          .flatMap((line) => {
            const parsed = parseMessage(line);
            return parsed === undefined ? [] : [parsed];
          });
      } catch {}
      let readPosition: { messageId: string; revision: number; readAt: string } | undefined;
      try {
        const parsed: unknown = JSON.parse(
          readFileSync(join(directory, 'read-position.json'), 'utf8'),
        );
        if (typeof parsed === 'object' && parsed !== null) {
          const value = parsed as Record<string, unknown>;
          if (
            typeof value['messageId'] === 'string' &&
            typeof value['revision'] === 'number' &&
            typeof value['readAt'] === 'string' &&
            messages[value['revision'] - 1]?.id === value['messageId']
          ) {
            readPosition = {
              messageId: value['messageId'],
              revision: value['revision'],
              readAt: value['readAt'],
            };
          }
        }
      } catch {}
      legacy.push({ record, messages, ...(readPosition === undefined ? {} : { readPosition }) });
    }
    database.transaction(
      (db) => {
        for (const { record, messages, readPosition } of legacy) {
          db.prepare('INSERT INTO channel_records (channel_id, record_json) VALUES (?, ?)').run(
            record.id,
            JSON.stringify(record),
          );
          if (record.type === 'group')
            db.prepare(`
              INSERT OR IGNORE INTO channel_human_members
                (channel_id, human_id, display_name, visible_from_revision, joined_at)
              VALUES (?, ?, 'Human', 1, ?)
            `).run(record.id, OWNER_HUMAN_CONTEXT.humanId, record.createdAt);
          for (const [index, message] of messages.entries()) {
            const existing = db
              .prepare(
                'SELECT source_event_id FROM source_events WHERE channel_id = ? AND message_id = ?',
              )
              .get(record.id, message.id) as { source_event_id: string } | undefined;
            const sourceEventId = existing?.source_event_id ?? randomUUID();
            if (existing === undefined)
              db.prepare(sql.insertLegacySourceEvent(sourceHumanIdentity)).run(
                sourceEventId,
                sourceKind(message),
                message.author.kind === 'bot'
                  ? message.author.slug
                  : record.type === 'dm' && message.author.kind === 'human'
                    ? (record.botSlug ?? null)
                    : null,
                record.id,
                message.id,
                message.body,
                message.at,
                eventPayload(message),
                ...(sourceHumanIdentity()
                  ? [message.author.kind === 'human' ? OWNER_HUMAN_CONTEXT.humanId : null]
                  : []),
              );
            else db.prepare(sql.updateLegacyPayload).run(eventPayload(message), sourceEventId);
            if (
              record.type === 'dm' &&
              message.author.kind === 'human' &&
              record.botSlug !== undefined
            ) {
              const rule = sourcePolicy.resolveIn(db, record.botSlug, 'human-dm');
              db.prepare(sql.restoreHumanDmAdmission).run(
                record.botSlug,
                rule.revision,
                rule.wake,
                sourceEventId,
              );
            }
            db.prepare(sql.insertLegacyPlacement).run(
              record.id,
              index + 1,
              sourceEventId,
              message.id,
            );
          }
          db.prepare(sql.backfillForHuman).run(record.id);
          if (readPosition !== undefined)
            db.prepare(`
          INSERT INTO channel_read_positions (channel_id, human_id, message_id, revision, read_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(
              record.id,
              OWNER_HUMAN_CONTEXT.humanId,
              readPosition.messageId,
              readPosition.revision,
              readPosition.readAt,
            );
        }
      },
      ['channel', 'source-event'],
    );
  }
}
