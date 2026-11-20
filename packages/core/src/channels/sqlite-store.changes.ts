import type { HumanContext } from '../humans/context.js';
import type { DatabaseSync } from 'node:sqlite';
import { isValidChannelId, type ChannelMessage } from './channel.js';
import {
  CHANNEL_CHANGES_LIMIT,
  CHANNEL_CHANGES_RETAINED_MS,
  CHANNEL_CHANGES_MAX,
  type ChangedChannels,
  type ChannelChangeCursor,
  type ChannelChangesRequest,
} from './timeline.js';
import type { ChannelStore } from './store.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { SqliteChannelAccess, SqliteChannelStoreOptions } from './sqlite-store.types.js';
import type { createChannelRecords } from './sqlite-store.records.js';
import type { createChannelHumans } from './sqlite-store.humans.js';
import type { createChannelPlacements } from './sqlite-store.placements.js';

export function createChannelChanges({
  database,
  humanAccess,
  readRecord,
  humanMembers,
  placementsById,
  projectRows,
  options,
  now,
}: {
  database: OperationalDatabaseModulePort;
  humanAccess: SqliteChannelAccess;
  readRecord: ReturnType<typeof createChannelRecords>['readRecord'];
  humanMembers: ReturnType<typeof createChannelHumans>['humanMembers'];
  placementsById: ReturnType<typeof createChannelPlacements>['placementsById'];
  projectRows: ReturnType<typeof createChannelPlacements>['projectRows'];
  options: SqliteChannelStoreOptions;
  now: () => Date;
}) {
  const changeLogIn = (db: DatabaseSync): boolean =>
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'channel_change_epoch'")
      .get() !== undefined;

  const changeCursorIn = (db: DatabaseSync): ChannelChangeCursor => {
    if (!changeLogIn(db)) return { epoch: 'none', seq: 0 };
    const epoch = db
      .prepare('SELECT epoch, floor_seq FROM channel_change_epoch WHERE singleton = 1')
      .get() as { epoch: string; floor_seq: number } | undefined;
    const head = db
      .prepare("SELECT seq FROM sqlite_sequence WHERE name = 'channel_changes'")
      .get() as { seq: number } | undefined;
    return {
      epoch: epoch?.epoch ?? 'none',
      seq: Math.max(Number(head?.seq ?? 0), Number(epoch?.floor_seq ?? 0)),
    };
  };

  const changeWindowIn = (
    db: DatabaseSync,
    cursor: ChannelChangeCursor,
    request: Omit<ChannelChangesRequest, 'limit'>,
  ): boolean => {
    if (!changeLogIn(db)) return false;
    const floor = Number(
      (
        db.prepare('SELECT floor_seq FROM channel_change_epoch WHERE singleton = 1').get() as
          | { floor_seq: number }
          | undefined
      )?.floor_seq ?? 0,
    );
    return (
      (request.epoch === undefined || request.epoch === cursor.epoch) &&
      Number.isSafeInteger(request.sinceSeq) &&
      request.sinceSeq >= floor &&
      request.sinceSeq <= cursor.seq
    );
  };

  const pruneChanges = (): void => {
    if (options.databaseOwnerReady !== false)
      database.transaction(
        (db) => {
          if (!changeLogIn(db)) return;
          const floor = Number(
            (
              db
                .prepare('SELECT max(seq) AS seq FROM channel_changes WHERE changed_at < ?')
                .get(now().getTime() - CHANNEL_CHANGES_RETAINED_MS) as { seq: number | null }
            ).seq ?? 0,
          );
          if (floor > 0) {
            db.prepare('DELETE FROM channel_changes WHERE seq <= ?').run(floor);
            db.prepare(
              'UPDATE channel_change_epoch SET floor_seq = max(floor_seq, ?) WHERE singleton = 1',
            ).run(floor);
          }
        },
        ['channel-changes'],
      );
  };

  const methods = {
    changeCursor: () => database.read(changeCursorIn),
    channelChangeHead: (id) =>
      database.read((db) => {
        if (!changeLogIn(db)) return undefined;
        const cursor = changeCursorIn(db);
        const floor = db
          .prepare('SELECT floor_seq FROM channel_change_epoch WHERE singleton = 1')
          .get() as { floor_seq: number } | undefined;
        const head = db
          .prepare("SELECT max(seq) AS seq FROM channel_changes WHERE channel_id IN (?, '*')")
          .get(id) as { seq: number | null } | undefined;
        return {
          epoch: cursor.epoch,
          seq: Math.max(Number(head?.seq ?? 0), Number(floor?.floor_seq ?? 0)),
        };
      }),
    readChangedChannels(request): ChangedChannels {
      return database.read((db) => {
        const cursor = changeCursorIn(db);
        if (!changeWindowIn(db, cursor, request)) return { reset: true, cursor };
        const ids = (
          db
            .prepare('SELECT DISTINCT channel_id FROM channel_changes WHERE seq > ? AND seq <= ?')
            .all(request.sinceSeq, cursor.seq) as { channel_id: string }[]
        ).map((row) => row.channel_id);
        return {
          channelIds: ids.filter((id) => id !== '*'),
          all: ids.includes('*'),
          cursor,
        };
      });
    },
    readHumanChanges(human: HumanContext, id, request) {
      if (humanAccess.current && !humanAccess.current.canRead(human, id)) return undefined;
      const channel = readRecord(id);
      if (channel === undefined || !isValidChannelId(id)) return undefined;
      const member = humanMembers(id).find((entry) => entry.human_id === human.humanId);
      if (channel.type === 'group' && member === undefined && !humanAccess.current)
        return undefined;
      const visibleFrom = member?.visible_from_revision ?? 0;
      const limit = Math.min(
        Math.max(request.limit ?? CHANNEL_CHANGES_LIMIT, 1),
        CHANNEL_CHANGES_MAX,
      );
      const read = database.read((db) => {
        const cursor = changeCursorIn(db);
        if (!changeWindowIn(db, cursor, request)) return { cursor, rows: undefined };
        const rows = db
          .prepare(
            `SELECT seq, message_id, kind FROM channel_changes
              WHERE channel_id IN (?, '*') AND seq > ? ORDER BY seq LIMIT ?`,
          )
          .all(id, request.sinceSeq, limit + 1) as {
          seq: number;
          message_id: string | null;
          kind: string;
        }[];
        return { cursor, rows };
      });
      if (read.rows === undefined) return { reset: true, cursor: read.cursor };
      const hasMore = read.rows.length > limit;
      const rows = read.rows.slice(0, limit);
      const ids = [
        ...new Set(rows.flatMap((row) => (row.message_id === null ? [] : [row.message_id]))),
      ];
      const placements = placementsById(id, ids, visibleFrom);
      const projected = projectRows(id, placements, visibleFrom);
      const present = new Set(projected.map((message) => message.id));
      const purged = (message: ChannelMessage) =>
        (message as { contentPurge?: unknown }).contentPurge !== undefined;
      return {
        upserts: projected
          .filter((message) => !purged(message))
          .map((message) => ({ channelId: id, message, revision: message.channelRevision! })),
        tombstones: projected.filter((message) => purged(message)).map((message) => message.id),
        removed: ids.filter((messageId) => !present.has(messageId)),
        channelChanged: rows.some((row) => row.kind === 'channel'),
        readChanged: rows.some((row) => row.kind === 'read'),
        cursor: {
          epoch: read.cursor.epoch,
          seq: hasMore ? rows.at(-1)!.seq : read.cursor.seq,
        },
        hasMore,
      };
    },
    recordAttachmentChange(fileId) {
      const placements = database.transaction(
        (db) => {
          const rows = db
            .prepare(
              `SELECT DISTINCT p.channel_id, p.message_id
                 FROM channel_placements p
                 JOIN source_events e ON e.source_event_id = p.source_event_id
                WHERE instr(e.payload_json, ?) > 0
                   OR p.source_event_id IN (
                     SELECT source_event_id FROM attachment_file_bindings WHERE file_id = ?
                   )`,
            )
            .all(JSON.stringify(fileId), fileId)
            .map((row) => ({
              channelId: String(row.channel_id),
              messageId: String(row.message_id),
            }));
          if (changeLogIn(db))
            for (const row of rows)
              db.prepare(
                "INSERT INTO channel_changes (channel_id, message_id, kind) VALUES (?, ?, 'message')",
              ).run(row.channelId, row.messageId);
          return rows;
        },
        ['channel-changes'],
      );
      for (const { channelId, messageId } of placements) {
        const message = this.message(channelId, messageId);
        if (message === undefined) continue;
        try {
          options.onAttachmentsChanged?.(channelId, messageId, message);
        } catch (error) {
          options.warn?.('Attachment notification failed: ' + String(error));
        }
      }
      return placements.length;
    },
    rotateChangeEpoch() {
      return database.transaction(
        (db) => {
          if (!changeLogIn(db)) return changeCursorIn(db);
          const head = changeCursorIn(db).seq;
          db.prepare(
            'UPDATE channel_change_epoch SET epoch = lower(hex(randomblob(8))), floor_seq = ? WHERE singleton = 1',
          ).run(head);
          return changeCursorIn(db);
        },
        ['channel-changes'],
      );
    },
  } satisfies Pick<
    ChannelStore,
    | 'changeCursor'
    | 'channelChangeHead'
    | 'readChangedChannels'
    | 'readHumanChanges'
    | 'recordAttachmentChange'
    | 'rotateChangeEpoch'
  > &
    ThisType<ChannelStore>;

  return { pruneChanges, methods };
}
