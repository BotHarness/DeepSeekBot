import { channelAudienceSql } from '../team/channel-contract.js';
import type { HumanContext } from '../humans/context.js';
import { notChannelNoticeSql } from './channel-notice.js';
import { projectAttachmentFiles } from '../attachments/message-files.js';
import { referencedIds } from './quotes.js';
import type { DatabaseSync } from 'node:sqlite';
import { isValidChannelId, type ChannelMessage } from './channel.js';
import { prepareChannelMessageQuery, type ChannelStore } from './store.js';
import {
  type PlacementRow,
  noticeOrigin,
  replyProjection,
  type createChannelPlacements,
} from './sqlite-store.placements.js';
import { parseMessage } from './sqlite-store.message-payload.js';
import type { SqliteChannelAccess, SqliteChannelStoreOptions } from './sqlite-store.types.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { createChannelHumans } from './sqlite-store.humans.js';
import type { createChannelReactions } from './sqlite-store.reactions.js';
import type { createChannelAttachments } from './sqlite-store.attachments.js';
import type { createChannelAdmissions } from './sqlite-store.admissions.js';
import type { createChannelRecords } from './sqlite-store.records.js';

const SHORT_SEARCH_MAX = 200;

const SNIPPET_BEFORE = 24;

const SNIPPET_LENGTH = 120;

function messageSearchCursorDecode(value: string): {
  at: string;
  channelId: string;
  messageId: string;
  seen: number;
} {
  try {
    if (value.length > 1024) throw new Error();
    const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const cursor = decoded as Record<string, unknown>;
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      typeof cursor['at'] === 'string' &&
      typeof cursor['channelId'] === 'string' &&
      typeof cursor['messageId'] === 'string' &&
      Number.isSafeInteger(cursor['seen']) &&
      Number(cursor['seen']) >= 0
    )
      return {
        at: cursor['at'],
        channelId: cursor['channelId'],
        messageId: cursor['messageId'],
        seen: Number(cursor['seen']),
      };
  } catch {}
  throw new Error('message_search: invalid cursor');
}

export function searchSnippet(text: string, needle: string): string {
  const chars = Array.from(text.replace(/\s+/gu, ' ').trim());
  const lower = chars.map((char) => char.toLowerCase());
  const target = Array.from(needle).map((char) => char.toLowerCase());
  let match = 0;
  for (let index = 0; index + target.length <= lower.length; index += 1) {
    if (target.every((char, offset) => lower[index + offset] === char)) {
      match = index;
      break;
    }
  }
  const start = Math.max(0, Math.min(match - SNIPPET_BEFORE, chars.length - SNIPPET_LENGTH));
  const end = Math.min(chars.length, start + SNIPPET_LENGTH);
  return (
    (start > 0 ? '…' : '') + chars.slice(start, end).join('') + (end < chars.length ? '…' : '')
  );
}

const approvalContentSql = (payload: string) =>
  [
    'toolApprovalRequest',
    'userQuestionRequest',
    'privateInputRequest',
    'toolApprovalDecision',
    'userQuestionResolution',
    'privateInputResolution',
  ]
    .map((key) => `json_type(${payload}, '$.${key}') IS NOT NULL`)
    .join(' OR ');

const humanSearchTextSql = (text: string) =>
  `CASE WHEN ${approvalContentSql('e.payload_json')} THEN botharness_channel_search_text(?, p.channel_id, p.message_id, ${text}) ELSE ${text} END`;

export function createChannelSearch({
  humanAccess,
  database,
  humanMembers,
  channelReactions,
  attachmentMigration,
  admissionStatuses,
  humanReceiptsFor,
  projectPostPreview,
  projectReplyThumbnail,
  options,
  readRecord,
  projectMessageAttachments,
}: {
  humanAccess: SqliteChannelAccess;
  database: OperationalDatabaseModulePort;
  humanMembers: ReturnType<typeof createChannelHumans>['humanMembers'];
  channelReactions: ReturnType<typeof createChannelReactions>['channelReactions'];
  attachmentMigration: ReturnType<typeof createChannelAttachments>['attachmentMigration'];
  admissionStatuses: ReturnType<typeof createChannelAdmissions>['admissionStatuses'];
  humanReceiptsFor: ReturnType<typeof createChannelHumans>['humanReceiptsFor'];
  projectPostPreview: ReturnType<typeof createChannelPlacements>['projectPostPreview'];
  projectReplyThumbnail: ReturnType<typeof createChannelPlacements>['projectReplyThumbnail'];
  options: SqliteChannelStoreOptions;
  readRecord: ReturnType<typeof createChannelRecords>['readRecord'];
  projectMessageAttachments: ReturnType<
    typeof createChannelAttachments
  >['methods']['projectMessageAttachments'];
}) {
  let lowerRegistered = false;

  const registerLower = (db: DatabaseSync): void => {
    if (lowerRegistered) return;
    db.function('botharness_unicode_lower', { deterministic: true }, (value: unknown) =>
      typeof value === 'string' ? value.toLowerCase() : '',
    );
    db.function(
      'botharness_channel_search_text',
      (humanId: unknown, channelId: unknown, messageId: unknown, text: unknown) => {
        if (
          typeof humanId !== 'string' ||
          typeof channelId !== 'string' ||
          typeof messageId !== 'string' ||
          typeof text !== 'string'
        )
          return '';
        return humanAccess.current?.searchText?.({ humanId }, channelId, messageId, text) ?? text;
      },
    );
    lowerRegistered = true;
  };

  return {
    queryMessages(id, queryOptions) {
      const query = prepareChannelMessageQuery(id, queryOptions);
      if (!isValidChannelId(id)) return { messages: [] };
      let before: { revision: number; at: string; message_id: string } | undefined;
      if (query.beforeId !== undefined) {
        const beforeId = query.beforeId;
        before = database.read((db) =>
          db
            .prepare(`
              SELECT p.revision, e.created_at AS at, p.message_id
                FROM channel_placements p
                JOIN source_events e ON e.source_event_id = p.source_event_id
               WHERE p.channel_id = ? AND p.message_id = ?
            `)
            .get(id, beforeId),
        ) as typeof before;
        if (before === undefined) throw new Error('channel_read: invalid cursor');
      }
      const where = ['p.channel_id = ?'];
      const values: Array<string | number> = [id];
      if (before !== undefined) {
        if (query.orderBy === 'time') {
          const after = query.ascending === true ? '>' : '<';
          where.push(
            `(julianday(e.created_at) ${after} julianday(?) OR (julianday(e.created_at) = julianday(?) AND p.message_id ${after} ?))`,
          );
          values.push(before.at, before.at, before.message_id);
        } else {
          where.push('p.revision < ?');
          values.push(before.revision);
        }
      }
      if (query.orderBy === 'time') where.push('julianday(e.created_at) IS NOT NULL');
      if (query.visibleFrom !== undefined) {
        where.push('p.revision >= ?');
        values.push(query.visibleFrom);
      }
      if (query.text !== undefined && query.text.length > 0) {
        where.push(
          `instr(botharness_unicode_lower(${humanAccess.current && queryOptions?.searchHuman ? humanSearchTextSql('e.body') : 'e.body'}), ?) > 0`,
        );
        if (humanAccess.current && queryOptions?.searchHuman)
          values.push(queryOptions.searchHuman.humanId);
        values.push(query.text);
      }
      if (query.authorBotId !== undefined) {
        where.push("json_extract(e.payload_json, '$.author.kind') = 'bot'");
        where.push("json_extract(e.payload_json, '$.author.slug') = ?");
        values.push(query.authorBotId);
      }
      if (query.authorKind !== undefined) {
        where.push("json_extract(e.payload_json, '$.author.kind') = ?");
        values.push(query.authorKind);
      }
      const julian = (ms: number) => (ms + 210_866_760_000_000) / 86_400_000;
      if (query.from !== undefined) {
        where.push('julianday(e.created_at) >= ?');
        values.push(julian(query.from));
      }
      if (query.to !== undefined) {
        where.push('julianday(e.created_at) <= ?');
        values.push(julian(query.to));
      }
      if (query.callWindow !== undefined) {
        const window = query.callWindow;
        const json = (path: string) => `json_extract(e.payload_json, '${path}')`;
        const overlap = (from: string, to: string) => {
          values.push(window.fromMs);
          if (window.toMs !== undefined) values.push(window.toMs);
          return `${to} >= ?${window.toMs === undefined ? '' : ` AND ${from} <= ?`}`;
        };
        const parts: string[] = [];
        values.push(window.callId);
        parts.push(
          `WHEN ${json('$.voiceCallRecord.state')} = 'frames' AND ${json('$.voiceCallRecord.callId')} = ? THEN (${overlap(json('$.voiceCallRecord.fromMs'), json('$.voiceCallRecord.toMs'))})`,
        );
        values.push(window.callId);
        parts.push(
          `WHEN ${json('$.voiceCall.callId')} = ? AND json_type(e.payload_json, '$.voiceCall.visual.fromMs') IS NOT NULL THEN (${overlap(json('$.voiceCall.visual.fromMs'), json('$.voiceCall.visual.toMs'))})`,
        );
        values.push(julian(window.from));
        if (window.to !== undefined) values.push(julian(window.to));
        parts.push(
          `ELSE (julianday(e.created_at) >= ?${window.to === undefined ? '' : ' AND julianday(e.created_at) <= ?'})`,
        );
        where.push(`(CASE ${parts.join(' ')} END)`);
      }
      const rows = database.read((db) => {
        registerLower(db);
        return db
          .prepare(`
          SELECT p.revision, p.source_event_id, p.message_id, e.payload_json, e.body,
                 e.channel_id AS home_channel_id
            FROM channel_placements p
            JOIN source_events e ON e.source_event_id = p.source_event_id
           WHERE ${where.join(' AND ')}
           ORDER BY ${query.orderBy === 'time' ? (query.ascending === true ? 'julianday(e.created_at) ASC, p.message_id ASC' : 'julianday(e.created_at) DESC, p.message_id DESC') : 'p.revision DESC'} LIMIT ?
        `)
          .all(...values, query.limit + 1);
      }) as unknown as PlacementRow[];
      const members = humanMembers(id);
      const reactionsById = channelReactions(id);
      const selected = rows.slice(0, query.limit).flatMap((row) => {
        const original = parseMessage(row.payload_json, row.body, row.message_id, id);
        if (original === undefined) return [];
        const message = attachmentMigration.project(row.source_event_id, original);
        const deliveries = admissionStatuses(row.source_event_id);
        const humanReceipts = humanReceiptsFor(message, row.revision, members);
        const reactions = reactionsById.get(row.message_id);
        return [
          {
            ...message,
            ...noticeOrigin(message, row, id),
            channelRevision: row.revision,
            ...(deliveries === undefined ? {} : { deliveries }),
            ...(humanReceipts === undefined ? {} : { humanReceipts }),
            ...(reactions === undefined ? {} : { reactions }),
          },
        ];
      });
      const replyIds = [...new Set(selected.flatMap((message) => referencedIds(message)))];
      const byId = new Map<string, ChannelMessage>();
      if (replyIds.length > 0) {
        const placeholders = replyIds.map(() => '?').join(', ');
        const replies = database.read((db) =>
          db
            .prepare(`
            SELECT p.message_id, e.payload_json, e.body
              FROM channel_placements p
              JOIN source_events e ON e.source_event_id = p.source_event_id
             WHERE p.channel_id = ? AND p.revision >= ? AND p.message_id IN (${placeholders})
          `)
            .all(id, query.visibleFrom ?? 0, ...replyIds),
        ) as unknown as Array<Pick<PlacementRow, 'message_id' | 'payload_json' | 'body'>>;
        for (const row of replies) {
          const message = parseMessage(row.payload_json, row.body, row.message_id, id);
          if (message !== undefined) byId.set(message.id, message);
        }
      }
      const last = selected.at(-1);
      return {
        messages: selected.map((message) =>
          projectAttachmentFiles(
            replyProjection(projectPostPreview(message), byId, projectReplyThumbnail),
            options.attachments,
            options.mediaVersions,
          ),
        ),
        ...(rows.length <= query.limit || last === undefined
          ? {}
          : {
              nextCursor: Buffer.from(
                JSON.stringify({ beforeId: last.id, filter: query.filter }),
              ).toString('base64url'),
            }),
      };
    },
    searchHumanMessages(human: HumanContext, id, request) {
      if (humanAccess.current && !humanAccess.current.canRead(human, id)) return undefined;
      const channel = readRecord(id);
      if (channel === undefined) return undefined;
      const member = humanMembers(id).find((entry) => entry.human_id === human.humanId);
      if (channel.type === 'group' && member === undefined && !humanAccess.current)
        return undefined;
      return this.queryMessages(id, {
        ...request,
        searchHuman: human,
        visibleFrom: member?.visible_from_revision ?? 0,
      });
    },
    searchAllHumanMessages(human: HumanContext, request) {
      const text = request.text.trim();
      const length = Array.from(text).length;
      if (length === 0 || length > 200)
        throw new Error('message_search: text must be 1 to 200 characters');
      if (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > 50)
        throw new Error('message_search: limit must be an integer from 1 to 50');
      const cursor =
        request.cursor === undefined ? undefined : messageSearchCursorDecode(request.cursor);
      const indexed = length >= 3;
      const seen = cursor?.seen ?? 0;
      const limit = indexed ? request.limit : Math.min(request.limit, SHORT_SEARCH_MAX - seen);
      const needle = text.toLowerCase();
      const where = [
        `json_extract(c.record_json, '$.deletedAt') IS NULL ${humanAccess.current ? `AND ${channelAudienceSql()}` : ''}`,
        `((json_extract(c.record_json, '$.type') = 'dm'
            AND (json_extract(c.record_json, '$.botSlug') IS NOT NULL OR (json_extract(c.record_json, '$.humanParticipants') IS NOT NULL AND m.human_id IS NOT NULL)))
          OR (json_extract(c.record_json, '$.type') = 'group'
            AND m.human_id IS NOT NULL AND p.revision >= m.visible_from_revision))`,
        notChannelNoticeSql('e.payload_json'),
        'p.channel_id NOT IN (SELECT value FROM json_each(?))',
      ];
      const values: Array<string | number> = [JSON.stringify(request.excludeChannelIds ?? [])];
      if (cursor !== undefined) {
        where.push(
          '(e.created_at < ? OR (e.created_at = ? AND (p.channel_id < ? OR (p.channel_id = ? AND p.message_id < ?))))',
        );
        values.push(cursor.at, cursor.at, cursor.channelId, cursor.channelId, cursor.messageId);
      }
      if (indexed) {
        where.push(
          `(e.rowid IN (SELECT rowid FROM inbox_history_fts WHERE inbox_history_fts MATCH ?) ${humanAccess.current ? `OR ((${approvalContentSql('e.payload_json')}) AND instr(botharness_unicode_lower(botharness_channel_search_text(?, p.channel_id, p.message_id, '')), ?) > 0)` : ''})`,
        );
        values.push('"' + text.replaceAll('"', '""') + '"');
        if (humanAccess.current) values.push(human.humanId, needle);
      } else {
        where.push(
          `instr(botharness_unicode_lower(${humanAccess.current ? humanSearchTextSql('d.search_text') : 'd.search_text'}), ?) > 0`,
        );
        if (humanAccess.current) values.push(human.humanId);
        values.push(needle);
      }
      if (humanAccess.current && indexed) {
        where.push(
          `instr(botharness_unicode_lower(${humanSearchTextSql('d.search_text')}), ?) > 0`,
        );
        values.push(human.humanId, needle);
      }
      const rows =
        limit <= 0
          ? []
          : (database.read((db) => {
              registerLower(db);
              return db
                .prepare(`
          SELECT p.channel_id, p.message_id, p.source_event_id, e.payload_json, e.body,
                 e.created_at, d.search_text
            FROM channel_placements p
            JOIN source_events e ON e.source_event_id = p.source_event_id
            JOIN inbox_history_documents d ON d.rowid = e.rowid
            JOIN channel_records c ON c.channel_id = p.channel_id
            ${humanAccess.current ? "JOIN humans viewer ON viewer.human_id = ? AND viewer.status = 'active'" : ''}
        LEFT JOIN channel_human_members m ON m.channel_id = p.channel_id
              AND m.human_id = ? AND m.left_at IS NULL
           WHERE ${where.join(' AND ')}
           ORDER BY e.created_at DESC, p.channel_id DESC, p.message_id DESC
           LIMIT ?
        `)
                .all(
                  ...(humanAccess.current ? [human.humanId] : []),
                  human.humanId,
                  ...values,
                  limit + 1,
                );
            }) as unknown as Array<{
              channel_id: string;
              message_id: string;
              source_event_id: string;
              payload_json: string;
              body: string;
              created_at: string;
              search_text: string;
            }>);
      const page = rows.slice(0, limit);
      const hits = page.flatMap((row) => {
        const original = parseMessage(row.payload_json, row.body, row.message_id, row.channel_id);
        if (original === undefined) return [];
        return [
          {
            channelId: row.channel_id,
            message: projectMessageAttachments(
              row.source_event_id,
              original.quotes === undefined
                ? original
                : { ...original, quotes: original.quotes.map(({ messageId }) => ({ messageId })) },
            ),
            snippet: searchSnippet(row.search_text, needle),
          },
        ];
      });
      const last = page.at(-1);
      return {
        hits,
        ...(rows.length <= limit ||
        last === undefined ||
        (!indexed && seen + page.length >= SHORT_SEARCH_MAX)
          ? {}
          : {
              nextCursor: Buffer.from(
                JSON.stringify({
                  at: last.created_at,
                  channelId: last.channel_id,
                  messageId: last.message_id,
                  seen: seen + page.length,
                }),
              ).toString('base64url'),
            }),
      };
    },
  } satisfies Pick<
    ChannelStore,
    'queryMessages' | 'searchHumanMessages' | 'searchAllHumanMessages'
  > &
    ThisType<ChannelStore>;
}
