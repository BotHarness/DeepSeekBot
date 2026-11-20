import type { HumanContext } from '../humans/context.js';
import { isChannelNotice } from './channel-notice.js';
import { projectAttachmentFiles } from '../attachments/message-files.js';
import { replyPreviewOf } from './reply-preview.js';
import { projectQuotes, referencedIds } from './quotes.js';
import { isGrantRequestResolved } from './grant-request.js';
import type { ChannelAttachmentRef } from '../attachments/ref.js';
import { isValidChannelId, type ChannelReaction, type ChannelMessage } from './channel.js';
import {
  DEFAULT_MESSAGE_PAGE,
  MAX_MESSAGE_PAGE,
  CHANNEL_FILES_LIMIT,
  CHANNEL_FILES_MAX,
  CHANNEL_FILES_SCAN,
  pageChannelJournalRange,
  pageChannelTimeline,
  timelineCursorAnchor,
  type ChannelTimelinePage,
  type ChannelTimelineRequest,
} from './timeline.js';
import type { ChannelStore } from './store.js';
import { parseMessage } from './sqlite-store.message-payload.js';
import type { createChannelHumans } from './sqlite-store.humans.js';
import type { createChannelAttachments } from './sqlite-store.attachments.js';
import type { createChannelAdmissions } from './sqlite-store.admissions.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { SqliteChannelStoreOptions, SqliteChannelAccess } from './sqlite-store.types.js';
import type { createChannelReactions } from './sqlite-store.reactions.js';
import type { createChannelRecords } from './sqlite-store.records.js';

export interface PlacementRow {
  message_id: string;
  created_at: string;
  revision: number;
  source_event_id: string;
  payload_json: string;
  body: string;
  home_channel_id?: string | null;
}

const POST_PREVIEW_CHARACTERS = 80;

export function replyProjection(
  message: ChannelMessage,
  byId: ReadonlyMap<string, ChannelMessage>,
  projectThumbnail: (target: ChannelMessage, ref: ChannelAttachmentRef) => ChannelAttachmentRef,
): ChannelMessage {
  const quoted = projectQuotes(
    message,
    (messageId) => byId.get(messageId),
    (target, ref) => projectThumbnail(target as ChannelMessage, ref),
  );
  if (quoted.replyTo === undefined) return quoted;
  const target = byId.get(quoted.replyTo);
  if (target === undefined) return { ...quoted, replyToPreview: null };
  return {
    ...quoted,
    replyToPreview: replyPreviewOf(target, (ref) => projectThumbnail(target, ref)),
  };
}

export function noticeOrigin(
  message: ChannelMessage,
  row: Pick<PlacementRow, 'home_channel_id'>,
  channelId: string,
): Pick<ChannelMessage, 'noticeOrigin'> {
  return isChannelNotice(message) &&
    typeof row.home_channel_id === 'string' &&
    row.home_channel_id !== channelId
    ? { noticeOrigin: { channelId: row.home_channel_id } }
    : {};
}

export const PLACEMENT_SELECT = `
    SELECT p.revision, p.source_event_id, p.message_id, e.payload_json, e.body, e.created_at,
           e.channel_id AS home_channel_id
      FROM channel_placements p
      JOIN source_events e ON e.source_event_id = p.source_event_id`;

export function createChannelPlacements({
  humanMembers,
  attachmentMigration,
  admissionStatuses,
  humanReceiptsFor,
  database,
  options,
  channelReactions,
  humanAccess,
  readRecord,
}: {
  humanMembers: ReturnType<typeof createChannelHumans>['humanMembers'];
  attachmentMigration: ReturnType<typeof createChannelAttachments>['attachmentMigration'];
  admissionStatuses: ReturnType<typeof createChannelAdmissions>['admissionStatuses'];
  humanReceiptsFor: ReturnType<typeof createChannelHumans>['humanReceiptsFor'];
  database: OperationalDatabaseModulePort;
  options: SqliteChannelStoreOptions;
  channelReactions: ReturnType<typeof createChannelReactions>['channelReactions'];
  humanAccess: SqliteChannelAccess;
  readRecord: ReturnType<typeof createChannelRecords>['readRecord'];
}) {
  const placementMessage = (
    row: Pick<PlacementRow, 'payload_json' | 'body' | 'message_id' | 'created_at'>,
    id: string,
  ): ChannelMessage =>
    parseMessage(row.payload_json, row.body, row.message_id, id) ?? {
      id: row.message_id,
      at: row.created_at,
      author: { kind: 'system' },
      body: 'This message was written by a newer version and cannot be shown.',
    };

  const projectPlacement = (
    row: PlacementRow,
    id: string,
    members: ReturnType<typeof humanMembers>,
    reactionsById: ReadonlyMap<string, ChannelReaction[]>,
  ): ChannelMessage => {
    const message = attachmentMigration.project(row.source_event_id, placementMessage(row, id));
    const deliveries = admissionStatuses(row.source_event_id);
    const humanReceipts = humanReceiptsFor(message, row.revision, members);
    const reactions = reactionsById.get(row.message_id);
    return {
      ...message,
      ...noticeOrigin(message, row, id),
      channelRevision: row.revision,
      ...(deliveries === undefined ? {} : { deliveries }),
      ...(humanReceipts === undefined ? {} : { humanReceipts }),
      ...(reactions === undefined ? {} : { reactions }),
    };
  };

  const placementsById = (
    id: string,
    messageIds: readonly (string | undefined)[],
    visibleFrom = 0,
  ): PlacementRow[] => {
    const ids = [...new Set(messageIds.filter((item): item is string => typeof item === 'string'))];
    if (!isValidChannelId(id) || ids.length === 0) return [];
    return database.read((db) =>
      db
        .prepare(`${PLACEMENT_SELECT}
         WHERE p.channel_id = ? AND p.revision >= ?
           AND p.message_id IN (${ids.map(() => '?').join(', ')})
         ORDER BY p.revision`)
        .all(id, visibleFrom, ...ids),
    ) as unknown as PlacementRow[];
  };

  const placementRange = (id: string, first: number, last: number): PlacementRow[] =>
    !isValidChannelId(id) || last < first
      ? []
      : (database.read((db) =>
          db
            .prepare(`${PLACEMENT_SELECT}
             WHERE p.channel_id = ? AND p.revision BETWEEN ? AND ?
             ORDER BY p.revision`)
            .all(id, first, last),
        ) as unknown as PlacementRow[]);

  const placementMessages = (
    id: string,
    messageIds: readonly (string | undefined)[],
    visibleFrom = 0,
  ): ChannelMessage[] =>
    placementsById(id, messageIds, visibleFrom).map((row) =>
      attachmentMigration.project(row.source_event_id, placementMessage(row, id)),
    );

  const projectPostPreview = (message: ChannelMessage): ChannelMessage => {
    const post = message.botChannelPost;
    if (post === undefined) return message;
    const target = database.read((db) =>
      db
        .prepare(`
          SELECT e.body FROM channel_placements p
          JOIN source_events e ON e.source_event_id = p.source_event_id
          WHERE p.channel_id = ? AND p.message_id = ?
        `)
        .get(post.channelId, post.messageId),
    ) as { body: string } | undefined;
    if (target === undefined) return { ...message, botChannelPostPreview: null };
    const characters = Array.from(target.body.replace(/\s+/gu, ' ').trim());
    return {
      ...message,
      botChannelPostPreview:
        characters.length > POST_PREVIEW_CHARACTERS
          ? characters.slice(0, POST_PREVIEW_CHARACTERS).join('') + '...'
          : characters.join(''),
    };
  };

  const projectReplyThumbnail = (
    target: ChannelMessage,
    ref: ChannelAttachmentRef,
  ): ChannelAttachmentRef =>
    projectAttachmentFiles(
      { ...target, attachments: [ref] },
      options.attachments,
      options.mediaVersions,
    ).attachments?.[0] ?? ref;

  const project = (
    messages: readonly ChannelMessage[],
    message: ChannelMessage,
    byId: ReadonlyMap<string, ChannelMessage> = new Map(messages.map((item) => [item.id, item])),
  ): ChannelMessage =>
    projectAttachmentFiles(
      replyProjection(
        {
          ...projectPostPreview(message),
          ...(message.grantRequest
            ? { grantRequestResolved: isGrantRequestResolved(messages, message.id) }
            : {}),
        },
        byId,
        projectReplyThumbnail,
      ),
      options.attachments,
      options.mediaVersions,
    );

  const grantResolutions = (
    id: string,
    grantIds: readonly string[],
    visibleFrom = 0,
  ): ChannelMessage[] =>
    grantIds.length === 0
      ? []
      : database.read((db) => {
          const resolved = new Map<string, ChannelMessage>();
          for (const row of db
            .prepare(`
          SELECT p.message_id, e.payload_json, e.body
            FROM source_events e
            CROSS JOIN channel_placements p ON p.source_event_id = e.source_event_id
           WHERE json_extract(e.payload_json, '$.grantRequestResolution.requestMessageId') IN (${grantIds.map(() => '?').join(', ')})
             AND p.channel_id = ? AND p.revision >= ?
             AND CASE WHEN json_valid(e.payload_json) THEN
               json_extract(e.payload_json, '$.author.kind') = 'human'
               AND json_extract(e.payload_json, '$.replyTo') = json_extract(e.payload_json, '$.grantRequestResolution.requestMessageId')
             ELSE 0 END
           ORDER BY p.revision
        `)
            .iterate(...grantIds, id, visibleFrom)) {
            const candidate = row as unknown as Pick<
              PlacementRow,
              'message_id' | 'payload_json' | 'body'
            >;
            const message = parseMessage(
              candidate.payload_json,
              candidate.body,
              candidate.message_id,
              id,
            );
            const requestId = message?.grantRequestResolution?.requestMessageId;
            if (
              message !== undefined &&
              requestId !== undefined &&
              isGrantRequestResolved([message], requestId)
            )
              resolved.set(requestId, message);
            if (resolved.size === grantIds.length) break;
          }
          return [...resolved.values()];
        });

  const projectRows = (
    id: string,
    rows: readonly PlacementRow[],
    visibleFrom = 0,
    members?: ReturnType<typeof humanMembers>,
  ): ChannelMessage[] => {
    if (rows.length === 0) return [];
    const selectedIds = new Set(rows.map((row) => row.message_id));
    const reactions = channelReactions(id, [...selectedIds]);
    const recipients = members ?? humanMembers(id);
    const selected = rows.map((row) => projectPlacement(row, id, recipients, reactions));
    const dependencies = [
      ...selected,
      ...placementMessages(
        id,
        [
          ...new Set(
            selected.flatMap((message) =>
              referencedIds(message).filter((reference) => !selectedIds.has(reference)),
            ),
          ),
        ],
        visibleFrom,
      ),
      ...grantResolutions(
        id,
        selected.filter((message) => message.grantRequest).map((message) => message.id),
        visibleFrom,
      ),
    ];
    const byId = new Map(dependencies.map((item) => [item.id, item]));
    return selected.map((message) => project(dependencies, message, byId));
  };

  const timelinePage = (
    id: string,
    request: ChannelTimelineRequest = {},
    visibleFrom = 0,
    members?: ReturnType<typeof humanMembers>,
  ): ChannelTimelinePage | undefined => {
    if (!isValidChannelId(id)) return pageChannelTimeline(id, [], request);
    const limit = Math.max(1, Math.min(request.limit ?? DEFAULT_MESSAGE_PAGE, MAX_MESSAGE_PAGE));
    const older = Math.max(0, Math.min(request.olderLimit ?? 20, MAX_MESSAGE_PAGE));
    const newer = Math.max(0, Math.min(request.newerLimit ?? 20, MAX_MESSAGE_PAGE));
    if ((request.direction === 'around' ? [older, newer] : [limit]).some(Number.isNaN))
      return undefined;
    let anchor: PlacementRow | undefined;
    if (
      request.direction === 'around' ||
      request.direction === 'older' ||
      request.direction === 'newer'
    ) {
      const cursor =
        request.direction === 'around' || request.cursor === undefined
          ? undefined
          : timelineCursorAnchor(id, request.cursor);
      const anchorId = request.direction === 'around' ? request.around : cursor?.id;
      if (anchorId === undefined) return undefined;
      anchor = database.read((db) =>
        db
          .prepare(`
        SELECT p.revision, p.source_event_id, p.message_id, e.payload_json, e.body, e.created_at,
               e.channel_id AS home_channel_id
          FROM channel_placements p
          JOIN source_events e ON e.source_event_id = p.source_event_id
         WHERE p.channel_id = ? AND p.message_id = ? AND p.revision >= ?
      `)
          .get(id, anchorId, visibleFrom),
      ) as PlacementRow | undefined;
      if (
        anchor === undefined ||
        (cursor !== undefined && placementMessage(anchor, id).at !== cursor.at)
      )
        return undefined;
    }
    const readSide = (direction: 'older' | 'newer', count: number): PlacementRow[] =>
      database.read((db) =>
        db
          .prepare(`
        SELECT p.revision, p.source_event_id, p.message_id, e.payload_json, e.body, e.created_at,
               e.channel_id AS home_channel_id
          FROM channel_placements p
          JOIN source_events e ON e.source_event_id = p.source_event_id
         WHERE p.channel_id = ? AND p.revision >= ?
           ${anchor === undefined ? '' : `AND p.revision ${direction === 'older' ? '<' : '>'} ?`}
         ORDER BY p.revision ${direction === 'older' ? 'DESC' : 'ASC'} LIMIT ?
      `)
          .all(
            id,
            visibleFrom,
            ...(anchor === undefined ? [] : [anchor.revision]),
            Math.ceil(count) + 1,
          ),
      ) as unknown as PlacementRow[];
    const rows =
      anchor === undefined
        ? readSide('older', limit).reverse()
        : request.direction === 'older'
          ? [...readSide('older', limit).reverse(), anchor]
          : request.direction === 'newer'
            ? [anchor, ...readSide('newer', limit)]
            : [...readSide('older', older).reverse(), anchor, ...readSide('newer', newer)];
    const page = pageChannelTimeline(
      id,
      rows.map((row) => placementMessage(row, id)),
      request,
    );
    if (page === undefined || page.entries.length === 0) return page;
    const selectedIds = new Set(page.entries.map((message) => message.id));
    return {
      ...page,
      entries: projectRows(
        id,
        rows.filter((row) => selectedIds.has(row.message_id)),
        visibleFrom,
        members,
      ),
    };
  };

  const revisionOf = (id: string): number => {
    if (!isValidChannelId(id)) return 0;
    const row = database.read((db) =>
      db
        .prepare(
          'SELECT COALESCE(MAX(revision), 0) AS revision FROM channel_placements WHERE channel_id = ?',
        )
        .get(id),
    ) as { revision: number };
    return row.revision;
  };

  const methods = {
    latestMessage(id) {
      if (!isValidChannelId(id)) return undefined;
      const latest = database.read((db) => {
        for (const row of db
          .prepare(`
          SELECT p.revision, p.source_event_id, p.message_id, e.payload_json, e.body, e.created_at,
                 e.channel_id AS home_channel_id
            FROM channel_placements p
            JOIN source_events e ON e.source_event_id = p.source_event_id
           WHERE p.channel_id = ? AND p.notice = 0 ORDER BY p.revision DESC
        `)
          .iterate(id)) {
          const placement = row as unknown as PlacementRow;
          if (!isChannelNotice(placementMessage(placement, id))) return placement;
        }
        return undefined;
      });
      if (latest === undefined) return undefined;
      return projectRows(id, [latest])[0];
    },
    hasMessage(id, messageId) {
      if (!isValidChannelId(id)) return false;
      return (
        database.read((db) =>
          db
            .prepare(`
              SELECT 1 FROM channel_placements p
              JOIN source_events e ON e.source_event_id = p.source_event_id
              WHERE p.channel_id = ? AND p.message_id = ?
            `)
            .get(id, messageId),
        ) !== undefined
      );
    },
    message(id, messageId) {
      return projectRows(id, placementsById(id, [messageId]))[0];
    },
    storedQuotes(id, messageId) {
      const row = placementsById(id, [messageId])[0];
      return row === undefined
        ? undefined
        : parseMessage(row.payload_json, row.body, row.message_id, id)?.quotes;
    },
    grantRequestResolution(channelId, requestMessageId) {
      const row = database.read((db) =>
        db
          .prepare(`SELECT e.payload_json, e.source_event_id
        FROM source_events e CROSS JOIN channel_placements p ON p.source_event_id = e.source_event_id
        WHERE json_extract(e.payload_json, '$.grantRequestResolution.requestMessageId') = ?
          AND p.channel_id = ?
        ORDER BY p.revision LIMIT 1`)
          .get(requestMessageId, channelId),
      ) as { payload_json: string } | undefined;
      if (!row) return undefined;
      const payload = JSON.parse(row.payload_json) as ChannelMessage;
      return projectRows(channelId, placementsById(channelId, [payload.id]))[0];
    },
    readMessages(id, readOptions) {
      if (!isValidChannelId(id)) return [];
      const limit = Math.max(
        1,
        Math.min(readOptions?.limit ?? DEFAULT_MESSAGE_PAGE, MAX_MESSAGE_PAGE),
      );
      const end =
        readOptions?.before === undefined
          ? revisionOf(id) + 1
          : placementsById(id, [readOptions.before])[0]?.revision;
      if (end === undefined) return [];
      const rows = database.read((db) =>
        db
          .prepare(`${PLACEMENT_SELECT}
           WHERE p.channel_id = ? AND p.revision < ?
           ORDER BY p.revision DESC LIMIT ?`)
          .all(id, end, Number.isNaN(limit) ? MAX_MESSAGE_PAGE : Math.ceil(limit)),
      ) as unknown as PlacementRow[];
      return projectRows(id, rows);
    },
    readTimeline(id, request) {
      return timelinePage(id, request);
    },
    readHumanTimeline(human: HumanContext, id, request) {
      if (humanAccess.current && !humanAccess.current.canRead(human, id)) return undefined;
      const channel = readRecord(id);
      if (channel === undefined) return undefined;
      const members = humanMembers(id);
      const member = members.find((entry) => entry.human_id === human.humanId);
      if (channel.type === 'group' && member === undefined && !humanAccess.current)
        return undefined;
      return timelinePage(id, request, member?.visible_from_revision ?? 0, members);
    },
    readHumanFilesPage(human: HumanContext, id, request) {
      if (humanAccess.current && !humanAccess.current.canRead(human, id)) return undefined;
      const channel = readRecord(id);
      if (channel === undefined || !isValidChannelId(id)) return undefined;
      const member = humanMembers(id).find((entry) => entry.human_id === human.humanId);
      if (channel.type === 'group' && member === undefined && !humanAccess.current)
        return undefined;
      const visibleFrom = member?.visible_from_revision ?? 0;
      const head = revisionOf(id);
      const before = Math.min(request.before ?? head + 1, head + 1);
      const limit = Math.min(Math.max(request.limit ?? CHANNEL_FILES_LIMIT, 1), CHANNEL_FILES_MAX);
      const floor = Math.max(visibleFrom, before - CHANNEL_FILES_SCAN, 0);
      const rows = database.read((db) =>
        db
          .prepare(`${PLACEMENT_SELECT}
             WHERE p.channel_id = ? AND p.revision >= ? AND p.revision < ?
               AND json_array_length(e.payload_json, '$.attachments') > 0
             ORDER BY p.revision DESC LIMIT ?`)
          .all(id, floor, before, limit),
      ) as unknown as PlacementRow[];
      const oldest = rows.length === limit ? rows.at(-1)!.revision : floor;
      const entries = projectRows(id, [...rows].reverse(), visibleFrom)
        .filter((message) => (message.attachments?.length ?? 0) > 0)
        .map((message) => ({ channelId: id, message, revision: message.channelRevision! }));
      return {
        entries,
        ...(oldest > Math.max(visibleFrom, 1) ? { nextBefore: oldest } : {}),
      };
    },
    readHumanJournalPage(human: HumanContext, id, request) {
      if (humanAccess.current && !humanAccess.current.canRead(human, id)) return undefined;
      const channel = readRecord(id);
      if (channel === undefined) return undefined;
      const member = humanMembers(id).find((entry) => entry.human_id === human.humanId);
      if (channel.type === 'group' && member === undefined && !humanAccess.current)
        return undefined;
      const visibleFrom = member?.visible_from_revision ?? 0;
      return pageChannelJournalRange(
        id,
        revisionOf(id),
        { ...request, visibleFrom },
        (first, last) =>
          projectRows(id, placementRange(id, first, last), visibleFrom).map((message) => ({
            message,
            revision: message.channelRevision!,
          })),
      );
    },
    revision: revisionOf,
    messagesAfter(id, revision) {
      if (!isValidChannelId(id) || !Number.isSafeInteger(revision) || revision < 0)
        return undefined;
      if (revision > revisionOf(id)) return undefined;
      return projectRows(id, placementRange(id, revision + 1, Number.MAX_SAFE_INTEGER)).map(
        (message) => ({ channelId: id, message, revision: message.channelRevision! }),
      );
    },
  } satisfies Pick<
    ChannelStore,
    | 'latestMessage'
    | 'hasMessage'
    | 'message'
    | 'storedQuotes'
    | 'grantRequestResolution'
    | 'readMessages'
    | 'readTimeline'
    | 'readHumanTimeline'
    | 'readHumanFilesPage'
    | 'readHumanJournalPage'
    | 'revision'
    | 'messagesAfter'
  >;

  return {
    projectPostPreview,
    projectReplyThumbnail,
    placementsById,
    projectRows,
    placementMessages,
    grantResolutions,
    revisionOf,
    project,
    methods,
  };
}
