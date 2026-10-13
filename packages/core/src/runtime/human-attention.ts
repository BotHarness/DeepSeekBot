import { notChannelNoticeSql } from '../channels/channel-notice.js';
import { LOCAL_HUMAN_ID } from '../channels/channel.js';
import {
  readHumanAssignmentContext,
  type HumanAssignmentContext,
} from './assignment-human-context.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';

export type HumanAttentionCategory = 'action' | 'info' | 'unread' | 'replies' | 'handled';
export type HumanAttentionSort = 'newest' | 'oldest';

export interface HumanAttentionItem {
  id: string;
  category: HumanAttentionCategory;
  kind:
    | 'group-join-request'
    | 'user-question'
    | 'private-input'
    | 'tool-approval'
    | 'workspace-grant-request'
    | 'bot-dm-message'
    | 'assignment-waiting-human'
    | 'assignment-blocked'
    | 'assignment-report'
    | 'bot-message-needs-repair'
    | 'channel-unread'
    | 'channel-reply'
    | 'channel-mention';
  createdAt: string;
  channelId?: string;
  channelName?: string;
  botSlug: string;
  summary: string;
  requestId?: string;
  messageId?: string;
  assignmentSessionId?: string;
  sourceEventId?: string;
  unreadCount?: number;
  isUnread?: boolean;
  responseMessageId?: string;
  responseSourceEventId?: string;
}

export interface HumanAttentionPage {
  items: HumanAttentionItem[];
  nextCursor?: string;
}

export interface HumanAttentionQuery {
  item(id: string, sourceKey?: string): HumanAttentionItem | undefined;
  assignmentContext(
    botSlug: string,
    sessionId: string,
    sourceEventId: string,
  ): HumanAssignmentContext | undefined;
  list(input: {
    itemId?: string;
    includeDismissed?: boolean;
    category?: HumanAttentionCategory;
    sort?: HumanAttentionSort;
    botSlug?: string;
    channelId?: string;
    cursor?: string;
    limit?: number;
  }): HumanAttentionPage;
  status(): { unreadCount: number; hasAction: boolean };
  durableAttention(): Array<{
    botSlug: string;
    waitingHumanCount: number;
    blockedCount: number;
    workspaceGrantCount: number;
    informationalCount: number;
  }>;
  actionCount(): number;
  actionSummary(): { count: number; botSlugs: string[] };
  openTimedQuestionCards(): Array<{ channelId: string; messageId: string }>;
}

interface AttentionRow {
  id: string;
  category: HumanAttentionCategory;
  kind: HumanAttentionItem['kind'];
  created_at: string;
  channel_id: string | null;
  channel_name: string | null;
  bot_slug: string;
  summary: string;
  request_id: string | null;
  message_id: string | null;
  assignment_session_id: string | null;
  source_event_id: string | null;
  response_message_id?: string;
  response_source_event_id?: string;
}

interface Cursor {
  version: 1;
  filters: string;
  createdAt: string;
  id: string;
}

const ACTION_ATTENTION_CTE = `WITH attention AS (
          SELECT 'join:' || json_extract(j.value, '$.id') AS id,
                 'action' AS category, 'group-join-request' AS kind,
                 json_extract(j.value, '$.createdAt') AS created_at,
                 c.channel_id, json_extract(c.record_json, '$.name') AS channel_name,
                 json_extract(j.value, '$.requesterBotSlug') AS bot_slug,
                 '' AS summary, json_extract(j.value, '$.id') AS request_id,
                 NULL AS message_id, NULL AS assignment_session_id,
                 NULL AS source_event_id
            FROM channel_records c, json_each(c.record_json, '$.joinRequests') j
           WHERE json_extract(c.record_json, '$.type') = 'group'
             AND json_extract(c.record_json, '$.deletedAt') IS NULL
             AND json_extract(j.value, '$.status') = 'pending'
          UNION ALL
          SELECT 'question:' || e.source_event_id AS id,
                 'action' AS category, 'user-question' AS kind,
                 e.created_at, c.channel_id,
                 json_extract(c.record_json, '$.name') AS channel_name,
                 e.bot_slug, e.body, NULL AS request_id, e.message_id,
                 NULL AS assignment_session_id, e.source_event_id
            FROM source_events e
            JOIN channel_placements p ON p.source_event_id = e.source_event_id
            JOIN channel_records c ON c.channel_id = p.channel_id
           WHERE (json_extract(c.record_json, '$.type') = 'group'
               OR (json_extract(c.record_json, '$.type') = 'dm' AND json_extract(c.record_json, '$.botSlug') IS NOT NULL))
             AND json_extract(c.record_json, '$.deletedAt') IS NULL
             AND e.source_kind = 'bot-message'
             AND json_extract(e.payload_json, '$.userQuestionRequest') IS NOT NULL
             AND e.message_id IN (SELECT value FROM json_each(?))
             AND NOT EXISTS (
               SELECT 1 FROM source_events resolution
                WHERE resolution.channel_id = e.channel_id
                  AND json_extract(resolution.payload_json,
                    '$.userQuestionResolution.requestMessageId') = e.message_id
             )
          UNION ALL
          SELECT 'approval:' || e.source_event_id AS id,
                 'action' AS category, 'tool-approval' AS kind,
                 e.created_at, c.channel_id,
                 json_extract(c.record_json, '$.name') AS channel_name,
                 e.bot_slug, e.body, NULL AS request_id, e.message_id,
                 NULL AS assignment_session_id, e.source_event_id
            FROM source_events e
            JOIN channel_placements p ON p.source_event_id = e.source_event_id
            JOIN channel_records c ON c.channel_id = p.channel_id
           WHERE (json_extract(c.record_json, '$.type') = 'group'
               OR (json_extract(c.record_json, '$.type') = 'dm' AND json_extract(c.record_json, '$.botSlug') IS NOT NULL))
             AND json_extract(c.record_json, '$.deletedAt') IS NULL
             AND e.source_kind = 'bot-message'
             AND json_extract(e.payload_json, '$.toolApprovalRequest') IS NOT NULL
             AND e.message_id IN (SELECT value FROM json_each(?))
             AND NOT EXISTS (
               SELECT 1 FROM source_events decision
                WHERE decision.channel_id = e.channel_id
                  AND json_extract(decision.payload_json,
                    '$.toolApprovalDecision.requestMessageId') = e.message_id
             )
          UNION ALL
          SELECT 'private:' || e.source_event_id AS id,
                 'action' AS category, 'private-input' AS kind,
                 e.created_at, c.channel_id,
                 json_extract(c.record_json, '$.name') AS channel_name,
                 e.bot_slug, json_extract(e.payload_json, '$.privateInputRequest.account') || ' · ' || e.body AS summary,
                 NULL AS request_id, e.message_id,
                 NULL AS assignment_session_id, e.source_event_id
            FROM source_events e
            JOIN channel_placements p ON p.source_event_id = e.source_event_id
            JOIN channel_records c ON c.channel_id = p.channel_id
           WHERE (json_extract(c.record_json, '$.type') = 'group'
               OR (json_extract(c.record_json, '$.type') = 'dm' AND json_extract(c.record_json, '$.botSlug') = e.bot_slug))
             AND json_extract(c.record_json, '$.deletedAt') IS NULL
             AND e.source_kind = 'bot-message'
             AND json_extract(e.payload_json, '$.privateInputRequest') IS NOT NULL
             AND e.message_id IN (SELECT value FROM json_each(?))
             AND NOT EXISTS (
               SELECT 1 FROM source_events resolution
                WHERE resolution.channel_id = e.channel_id
                  AND json_extract(resolution.payload_json,
                    '$.privateInputResolution.requestMessageId') = e.message_id
             )
          UNION ALL
          SELECT 'grant:' || e.source_event_id AS id,
                 'action' AS category, 'workspace-grant-request' AS kind,
                 e.created_at, c.channel_id,
                 json_extract(c.record_json, '$.name') AS channel_name,
                 e.bot_slug, e.body, NULL AS request_id, e.message_id,
                 NULL AS assignment_session_id, e.source_event_id
            FROM source_events e
            JOIN channel_placements p ON p.source_event_id = e.source_event_id
            JOIN channel_records c ON c.channel_id = p.channel_id
           WHERE (json_extract(c.record_json, '$.type') = 'group'
               OR (json_extract(c.record_json, '$.type') = 'dm' AND json_extract(c.record_json, '$.botSlug') = e.bot_slug))
             AND json_extract(c.record_json, '$.deletedAt') IS NULL
             AND e.source_kind = 'bot-message'
             AND json_extract(e.payload_json, '$.grantRequest') = 1
             AND NOT EXISTS (
               SELECT 1 FROM source_events resolution
                WHERE resolution.channel_id = e.channel_id
                  AND resolution.source_kind = 'human-message'
                  AND json_extract(resolution.payload_json, '$.author.kind') = 'human'
                  AND json_extract(resolution.payload_json,
                    '$.grantRequestResolution.requestMessageId') = e.message_id
             )
          UNION ALL
          SELECT 'assignment:' || a.session_id AS id,
                 'action' AS category,
                 CASE coalesce(json_extract(ask.payload_json, '$.assignmentReport.state'), a.latest_report_state)
                   WHEN 'blocked' THEN 'assignment-blocked'
                   ELSE 'assignment-waiting-human'
                 END AS kind,
                 coalesce(ask.created_at, a.latest_report_at) AS created_at, 'dm-' || a.bot_slug AS channel_id,
                 coalesce((SELECT json_extract(dm.record_json, '$.name') FROM channel_records dm WHERE dm.channel_id = 'dm-' || a.bot_slug), a.bot_slug) AS channel_name, a.bot_slug,
                 coalesce(ask.body, a.latest_report_summary) AS summary, NULL AS request_id,
                 NULL AS message_id, a.session_id AS assignment_session_id,
                 coalesce(a.open_ask_source_event_id, (
                   SELECT latest.source_event_id FROM source_events latest
                    WHERE latest.assignment_session_id = a.session_id
                      AND latest.source_kind = 'assignment-report'
                    ORDER BY latest.rowid DESC LIMIT 1
                 )) AS source_event_id
            FROM assignments a
            LEFT JOIN source_events ask ON ask.source_event_id = a.open_ask_source_event_id
           WHERE ((coalesce(json_extract(ask.payload_json, '$.assignmentReport.state'), a.latest_report_state) = 'waiting-human'
                   AND a.open_ask_source_event_id IS NOT NULL)
               OR (coalesce(json_extract(ask.payload_json, '$.assignmentReport.state'), a.latest_report_state) = 'blocked'
                   AND (a.open_ask_source_event_id IS NOT NULL
                        OR a.activity IN ('idle', 'error'))))
             AND a.stop_state = 'running'
             AND a.latest_report_at IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM channel_records dm WHERE dm.channel_id = 'dm-' || a.bot_slug AND json_extract(dm.record_json, '$.deletedAt') IS NOT NULL)
             AND (a.open_ask_source_event_id IS NOT NULL OR NOT EXISTS (
               SELECT 1 FROM source_events reply WHERE reply.channel_id = 'dm-' || a.bot_slug
                 AND reply.source_kind = 'human-message' AND json_extract(reply.payload_json, '$.author.kind') = 'human'
                 AND json_extract(reply.payload_json, '$.assignmentReply.sessionId') = +a.session_id
                 AND json_extract(reply.payload_json, '$.assignmentReply.sourceEventId') = coalesce(a.open_ask_source_event_id, (
                   SELECT latest.source_event_id FROM source_events latest WHERE latest.assignment_session_id = a.session_id AND latest.source_kind = 'assignment-report' ORDER BY latest.rowid DESC LIMIT 1
                 ))
             ))
          UNION ALL
          SELECT 'repair:' || a.source_event_id || ':' || a.bot_slug AS id,
                 'action' AS category, 'bot-message-needs-repair' AS kind,
                 e.created_at, e.channel_id,
                 CASE WHEN json_extract(c.record_json, '$.deletedAt') IS NULL
                      THEN coalesce(json_extract(c.record_json, '$.name'), '')
                      ELSE '' END AS channel_name,
                 a.bot_slug, e.body AS summary, NULL AS request_id,
                 p.message_id, NULL AS assignment_session_id, e.source_event_id
            FROM inbox_admissions a
            JOIN source_events e ON e.source_event_id = a.source_event_id
            LEFT JOIN channel_placements p ON p.source_event_id = e.source_event_id AND p.channel_id = e.channel_id
            LEFT JOIN channel_records c ON c.channel_id = e.channel_id
           WHERE a.attempt_state = 'needs-repair'
             AND e.channel_id IS NOT NULL
          UNION ALL
          SELECT 'report:' || e.source_event_id AS id,
                 'info' AS category, 'assignment-report' AS kind,
                 e.created_at, NULL AS channel_id, NULL AS channel_name,
                 e.bot_slug, e.body AS summary, NULL AS request_id,
                 NULL AS message_id, a.session_id AS assignment_session_id,
                 e.source_event_id
            FROM assignments a
            JOIN source_events e ON e.source_event_id = (
              SELECT latest.source_event_id FROM source_events latest
               WHERE latest.assignment_session_id = a.session_id
                 AND latest.source_kind = 'assignment-report'
               ORDER BY latest.rowid DESC LIMIT 1
            )
            LEFT JOIN human_attention_decisions d ON d.source_event_id = e.source_event_id
           WHERE a.latest_report_state = 'completed'
             AND d.source_event_id IS NULL
        )`;

const CHANNEL_ATTENTION_CTE = `
  WITH visible_messages AS (
    SELECT p.channel_id, p.revision, p.message_id, p.source_event_id,
           e.created_at, e.body, e.bot_slug,
           json_extract(c.record_json, '$.name') AS channel_name,
           coalesce(r.revision, 0) AS read_revision,
           CASE WHEN json_extract(c.record_json, '$.type') = 'group'
                 AND json_extract(e.payload_json, '$.author.kind') = 'bot'
                 AND json_extract(target.payload_json, '$.author.kind') = 'human'
                 AND original.revision >= m.visible_from_revision
                THEN 1 ELSE 0 END AS is_reply,
           CASE WHEN json_extract(c.record_json, '$.type') = 'group'
                 AND json_extract(e.payload_json, '$.author.kind') = 'bot'
                 AND EXISTS (
                   SELECT 1 FROM json_each(e.payload_json, '$.humanMentions') mention
                    WHERE json_extract(mention.value, '$.humanId') = m.human_id
                 ) THEN 1 ELSE 0 END AS is_mention
      FROM channel_placements p
      JOIN source_events e ON e.source_event_id = p.source_event_id
      JOIN channel_records c ON c.channel_id = p.channel_id
      LEFT JOIN channel_placements original ON original.channel_id = p.channel_id
        AND original.message_id = json_extract(e.payload_json, '$.replyTo')
      LEFT JOIN source_events target ON target.source_event_id = original.source_event_id
      LEFT JOIN channel_read_positions r
        ON r.channel_id = p.channel_id AND r.human_id = ?
      LEFT JOIN channel_human_members m
        ON m.channel_id = p.channel_id AND m.human_id = ?
     WHERE json_extract(c.record_json, '$.deletedAt') IS NULL
       AND ((json_extract(c.record_json, '$.type') = 'dm'
             AND json_extract(c.record_json, '$.botSlug') IS NOT NULL)
         OR (json_extract(c.record_json, '$.type') = 'group'
             AND m.left_at IS NULL AND m.visible_from_revision IS NOT NULL
             AND p.revision >= m.visible_from_revision))
       AND json_extract(e.payload_json, '$.author.kind') != 'human'
       AND ${notChannelNoticeSql('e.payload_json')}
  ), visible_unread AS (
    SELECT * FROM visible_messages WHERE revision > read_revision
  )`;

function decodeCursor(value: string, filters: string): Cursor {
  try {
    if (value.length > 1024) throw new Error('oversized');
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('version' in parsed) ||
      parsed.version !== 1 ||
      !('filters' in parsed) ||
      parsed.filters !== filters ||
      !('createdAt' in parsed) ||
      typeof parsed.createdAt !== 'string' ||
      !('id' in parsed) ||
      typeof parsed.id !== 'string'
    )
      throw new Error('invalid');
    return parsed as Cursor;
  } catch {
    throw new Error('Human attention cursor is invalid for these filters');
  }
}

function attentionItem(row: AttentionRow): HumanAttentionItem {
  return {
    id: row.id,
    category: row.category,
    kind: row.kind,
    createdAt: row.created_at,
    ...(row.channel_id === null ? {} : { channelId: row.channel_id }),
    ...(row.channel_name === null ? {} : { channelName: row.channel_name }),
    botSlug: row.bot_slug,
    summary: row.summary,
    ...(row.request_id === null ? {} : { requestId: row.request_id }),
    ...(row.message_id === null ? {} : { messageId: row.message_id }),
    ...(row.assignment_session_id === null
      ? {}
      : { assignmentSessionId: row.assignment_session_id }),
    ...(row.source_event_id === null ? {} : { sourceEventId: row.source_event_id }),
    ...(row.response_message_id === undefined
      ? {}
      : { responseMessageId: row.response_message_id }),
    ...(row.response_source_event_id === undefined
      ? {}
      : { responseSourceEventId: row.response_source_event_id }),
  };
}

export function createHumanAttentionQuery(
  database: OperationalDatabaseModulePort,
  activeQuestionMessageIds: () => readonly string[] = () => [],
  activeToolApprovalMessageIds: () => readonly string[] = () => [],
  activePrivateInputMessageIds: () => readonly string[] = () => [],
): HumanAttentionQuery {
  return {
    item(id, sourceKey) {
      if (id.startsWith('unread:') && sourceKey !== undefined) {
        const row = database.read(
          (db) =>
            db
              .prepare(`${CHANNEL_ATTENTION_CTE}
          SELECT 'unread:' || channel_id AS id, 'unread' AS category, 'channel-unread' AS kind,
                 created_at, channel_id, channel_name, coalesce(bot_slug, '') AS bot_slug,
                 body AS summary, NULL AS request_id, message_id, NULL AS assignment_session_id, source_event_id
            FROM visible_messages WHERE ('unread:' || channel_id) = ? AND source_event_id = ? AND is_reply = 0 AND is_mention = 0 LIMIT 1
        `)
              .get(LOCAL_HUMAN_ID, LOCAL_HUMAN_ID, id, sourceKey) as AttentionRow | undefined,
        );
        return row === undefined ? undefined : attentionItem(row);
      }
      const prefix = id.split(':')[0];
      const category =
        prefix === 'unread'
          ? 'unread'
          : prefix === 'reply'
            ? 'replies'
            : prefix === 'report'
              ? 'info'
              : prefix === 'handled'
                ? 'handled'
                : 'action';
      return this.list({ category, itemId: id, includeDismissed: true, limit: 1 }).items[0];
    },
    assignmentContext(botSlug, sessionId, sourceEventId) {
      return readHumanAssignmentContext(database, botSlug, sessionId, sourceEventId);
    },
    list(input) {
      const limit = input.limit ?? 30;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new Error('Human attention limit must be 1-100');
      const category = input.category ?? 'action';
      const sort = input.sort ?? (category === 'action' ? 'oldest' : 'newest');
      if (sort !== 'newest' && sort !== 'oldest') throw new Error('Invalid Human attention sort');
      const direction = sort === 'newest' ? 'DESC' : 'ASC';
      const cursorComparison = sort === 'newest' ? '<' : '>';
      const filters = JSON.stringify([
        category,
        input.botSlug ?? null,
        input.channelId ?? null,
        sort,
      ]);
      const dismissFilter = (id: string, source: string): string =>
        input.includeDismissed
          ? ''
          : `AND NOT EXISTS (SELECT 1 FROM human_inbox_dismissals d WHERE d.human_id = '${LOCAL_HUMAN_ID}' AND d.item_id = ${id} AND d.source_key = coalesce(${source}, ''))`;
      const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor, filters);
      if (category === 'handled') {
        const pageParameters = [
          input.itemId ?? null,
          input.itemId ?? null,
          input.botSlug ?? null,
          input.botSlug ?? null,
          input.channelId ?? null,
          input.channelId ?? null,
          cursor?.createdAt ?? null,
          cursor?.createdAt ?? null,
          cursor?.createdAt ?? null,
          cursor?.id ?? null,
          ...(cursor === undefined ? [] : [cursor.createdAt]),
          limit + 1,
        ];
        const rows = database.read((db) =>
          db
            .prepare(`WITH native_handled AS (
SELECT 'handled:' || request.source_event_id AS id,
                 'handled' AS category, CASE WHEN json_extract(request.payload_json, '$.userQuestionRequest') IS NOT NULL THEN 'user-question' WHEN json_extract(request.payload_json, '$.toolApprovalRequest') IS NOT NULL THEN 'tool-approval' ELSE 'workspace-grant-request' END AS kind,
                 response.created_at, c.channel_id, json_extract(c.record_json, '$.name') AS channel_name,
                 request.bot_slug, request.body AS summary, NULL AS request_id,
                 request.message_id, NULL AS assignment_session_id, request.source_event_id,
                 response.message_id AS response_message_id, response.source_event_id AS response_source_event_id
            FROM source_events response INDEXED BY source_events_human_response_time
            JOIN channel_placements reply_source ON reply_source.source_event_id = response.source_event_id
            JOIN channel_records c ON c.channel_id = reply_source.channel_id
            JOIN channel_placements placement ON placement.channel_id = c.channel_id
              AND placement.message_id = coalesce(
                json_extract(response.payload_json, '$.userQuestionResolution.requestMessageId'),
                json_extract(response.payload_json, '$.toolApprovalDecision.requestMessageId'),
                json_extract(response.payload_json, '$.grantRequestResolution.requestMessageId'))
            JOIN source_events request ON request.source_event_id = placement.source_event_id
            JOIN channel_placements reply_placement ON reply_placement.source_event_id = response.source_event_id
              AND reply_placement.channel_id = c.channel_id
           WHERE response.source_kind = 'human-message'
             AND json_extract(response.payload_json, '$.author.kind') = 'human'
             AND ((json_extract(request.payload_json, '$.userQuestionRequest') IS NOT NULL
                   AND json_extract(response.payload_json, '$.userQuestionResolution.requestMessageId') = request.message_id
                   AND json_extract(response.payload_json, '$.userQuestionResolution.state') = 'answered')
               OR (json_extract(request.payload_json, '$.toolApprovalRequest') IS NOT NULL
                   AND json_extract(response.payload_json, '$.toolApprovalDecision.requestMessageId') = request.message_id)
               OR (json_extract(request.payload_json, '$.grantRequest') = 1
                   AND json_extract(response.payload_json, '$.grantRequestResolution.requestMessageId') = request.message_id))
             AND json_extract(c.record_json, '$.deletedAt') IS NULL
             AND (json_extract(c.record_json, '$.type') = 'group'
               OR (json_extract(c.record_json, '$.type') = 'dm' AND json_extract(c.record_json, '$.botSlug') = request.bot_slug))
             AND request.source_kind = 'bot-message'
             AND NOT EXISTS (SELECT 1 FROM source_events earlier INDEXED BY source_events_human_native_response
               WHERE earlier.source_kind = 'human-message' AND json_extract(earlier.payload_json, '$.author.kind') = 'human'
                 AND coalesce(json_extract(earlier.payload_json, '$.userQuestionResolution.requestMessageId'),
                     json_extract(earlier.payload_json, '$.toolApprovalDecision.requestMessageId'),
                     json_extract(earlier.payload_json, '$.grantRequestResolution.requestMessageId')) = +request.message_id
                 AND earlier.channel_id = c.channel_id AND earlier.rowid < response.rowid)
             AND (json_extract(request.payload_json, '$.userQuestionRequest') IS NOT NULL
                  OR json_extract(request.payload_json, '$.toolApprovalRequest') IS NOT NULL
                  OR json_extract(request.payload_json, '$.grantRequest') = 1)


             AND (? IS NULL OR ('handled:' || request.source_event_id) = ?)
             ${dismissFilter("'handled:' || request.source_event_id", 'request.source_event_id')}
             AND (? IS NULL OR request.bot_slug = ?) AND (? IS NULL OR c.channel_id = ?)
             AND (? IS NULL OR response.created_at ${cursorComparison} ? OR
                  (response.created_at = ? AND ('handled:' || request.source_event_id) ${cursorComparison} ?))
             ${cursor === undefined ? '' : `AND response.created_at ${cursorComparison}= ?`}
           ORDER BY response.created_at ${direction}, id ${direction} LIMIT ?
          ), assignment_handled AS (
          SELECT 'handled:' || request.source_event_id AS id, 'handled' AS category,
                 CASE json_extract(request.payload_json, '$.assignmentReport.state') WHEN 'blocked' THEN 'assignment-blocked' ELSE 'assignment-waiting-human' END AS kind,
                 response.created_at, c.channel_id, json_extract(c.record_json, '$.name') AS channel_name,
                 a.bot_slug, request.body AS summary, NULL AS request_id, NULL AS message_id,
                 a.session_id AS assignment_session_id, request.source_event_id,
                 response.message_id AS response_message_id, response.source_event_id AS response_source_event_id
            FROM source_events response INDEXED BY source_events_human_response_time
            JOIN source_events request ON request.source_event_id = json_extract(response.payload_json, '$.assignmentReply.sourceEventId')
            JOIN assignments a ON a.session_id = request.assignment_session_id AND a.bot_slug = request.bot_slug
              AND a.session_id = json_extract(response.payload_json, '$.assignmentReply.sessionId')
            JOIN channel_placements placement ON placement.source_event_id = response.source_event_id
            JOIN channel_records c ON c.channel_id = placement.channel_id
           WHERE response.source_kind = 'human-message'
             AND json_extract(response.payload_json, '$.author.kind') = 'human'
             AND json_extract(c.record_json, '$.type') = 'dm'
             AND json_extract(c.record_json, '$.botSlug') = a.bot_slug
             AND json_extract(c.record_json, '$.deletedAt') IS NULL
             AND a.open_ask_source_event_id IS NOT request.source_event_id
             AND request.source_kind = 'assignment-report'
             AND NOT EXISTS (SELECT 1 FROM source_events earlier INDEXED BY source_events_human_assignment_response
               WHERE earlier.source_kind = 'human-message' AND json_extract(earlier.payload_json, '$.author.kind') = 'human'
                 AND json_extract(earlier.payload_json, '$.assignmentReply.sourceEventId') = +request.source_event_id
                 AND json_extract(earlier.payload_json, '$.assignmentReply.sessionId') = +a.session_id
                 AND earlier.rowid < response.rowid)
             AND json_extract(request.payload_json, '$.assignmentReport.state') IN ('blocked', 'waiting-human')

             AND (? IS NULL OR ('handled:' || request.source_event_id) = ?)
             ${dismissFilter("'handled:' || request.source_event_id", 'request.source_event_id')}
             AND (? IS NULL OR a.bot_slug = ?) AND (? IS NULL OR c.channel_id = ?)
             AND (? IS NULL OR response.created_at ${cursorComparison} ? OR
                  (response.created_at = ? AND ('handled:' || request.source_event_id) ${cursorComparison} ?))
             ${cursor === undefined ? '' : `AND response.created_at ${cursorComparison}= ?`}
           ORDER BY response.created_at ${direction}, id ${direction} LIMIT ?
          )
          SELECT * FROM native_handled UNION ALL SELECT * FROM assignment_handled
          ORDER BY created_at ${direction}, id ${direction} LIMIT ?`)
            .all(...pageParameters, ...pageParameters, limit + 1),
        ) as unknown as AttentionRow[];
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        return {
          items: page.map(attentionItem),
          ...(rows.length > limit && last !== undefined
            ? {
                nextCursor: Buffer.from(
                  JSON.stringify({
                    version: 1,
                    filters,
                    createdAt: last.created_at,
                    id: last.id,
                  } satisfies Cursor),
                ).toString('base64url'),
              }
            : {}),
        };
      }
      if (category === 'replies') {
        const rows = database.read((db) =>
          db
            .prepare(`${CHANNEL_ATTENTION_CTE}
          SELECT 'reply:' || source_event_id AS id, channel_id, channel_name,
                 created_at, message_id, source_event_id, body AS summary, bot_slug,
                 revision > read_revision AS is_unread, is_mention
            FROM visible_messages
           WHERE (is_reply = 1 OR is_mention = 1)
             AND (? IS NULL OR ('reply:' || source_event_id) = ?)
             ${dismissFilter("'reply:' || source_event_id", 'source_event_id')}
             AND (? IS NULL OR bot_slug = ?)
             AND (? IS NULL OR channel_id = ?)
             AND (? IS NULL OR created_at ${cursorComparison} ? OR
                  (created_at = ? AND ('reply:' || source_event_id) ${cursorComparison} ?))
           ORDER BY created_at ${direction}, id ${direction}
           LIMIT ?
        `)
            .all(
              LOCAL_HUMAN_ID,
              LOCAL_HUMAN_ID,
              input.itemId ?? null,
              input.itemId ?? null,
              input.botSlug ?? null,
              input.botSlug ?? null,
              input.channelId ?? null,
              input.channelId ?? null,
              cursor?.createdAt ?? null,
              cursor?.createdAt ?? null,
              cursor?.createdAt ?? null,
              cursor?.id ?? null,
              limit + 1,
            ),
        ) as Array<{
          id: string;
          channel_id: string;
          channel_name: string;
          created_at: string;
          message_id: string;
          source_event_id: string;
          summary: string;
          bot_slug: string;
          is_unread: number;
          is_mention: number;
        }>;
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        return {
          items: page.map((row) => ({
            id: row.id,
            category: 'replies',
            kind: row.is_mention === 1 ? 'channel-mention' : 'channel-reply',
            createdAt: row.created_at,
            channelId: row.channel_id,
            channelName: row.channel_name,
            botSlug: row.bot_slug,
            summary: row.summary,
            messageId: row.message_id,
            sourceEventId: row.source_event_id,
            isUnread: row.is_unread === 1,
          })),
          ...(rows.length > limit && last !== undefined
            ? {
                nextCursor: Buffer.from(
                  JSON.stringify({
                    version: 1,
                    filters,
                    createdAt: last.created_at,
                    id: last.id,
                  } satisfies Cursor),
                ).toString('base64url'),
              }
            : {}),
        };
      }
      if (category === 'unread') {
        const rows = database.read(
          (db) =>
            db
              .prepare(`${CHANNEL_ATTENTION_CTE},
          filtered_unread AS (
            SELECT * FROM visible_unread v WHERE ${input.includeDismissed ? '' : `NOT EXISTS (SELECT 1 FROM human_inbox_dismissals d WHERE d.human_id = '${LOCAL_HUMAN_ID}' AND d.item_id = 'unread:' || v.channel_id AND v.revision <= d.through_revision) AND`} is_reply = 0 AND is_mention = 0 AND (? IS NULL OR bot_slug = ?)
          ),
          unread_channels AS (
            SELECT channel_id, count(DISTINCT source_event_id) AS unread_count, max(revision) AS last_revision
              FROM filtered_unread GROUP BY channel_id
          )
          SELECT 'unread:' || v.channel_id AS id, v.channel_id, v.channel_name,
                 v.created_at, v.message_id, v.source_event_id, v.body AS summary,
                 coalesce(v.bot_slug, '') AS bot_slug, u.unread_count
            FROM unread_channels u
            JOIN filtered_unread v
              ON v.channel_id = u.channel_id AND v.revision = u.last_revision
           WHERE (? IS NULL OR ('unread:' || v.channel_id) = ?)
             AND (? IS NULL OR v.channel_id = ?)
             AND (? IS NULL OR v.created_at ${cursorComparison} ? OR
                  (v.created_at = ? AND v.channel_id ${cursorComparison} ?))
           ORDER BY v.created_at ${direction}, v.channel_id ${direction}
           LIMIT ?
        `)
              .all(
                LOCAL_HUMAN_ID,
                LOCAL_HUMAN_ID,
                input.botSlug ?? null,
                input.botSlug ?? null,
                input.itemId ?? null,
                input.itemId ?? null,
                input.channelId ?? null,
                input.channelId ?? null,
                cursor?.createdAt ?? null,
                cursor?.createdAt ?? null,
                cursor?.createdAt ?? null,
                cursor?.id.replace(/^unread:/, '') ?? null,
                limit + 1,
              ) as unknown as Array<{
              id: string;
              channel_id: string;
              channel_name: string;
              created_at: string;
              message_id: string;
              source_event_id: string;
              summary: string;
              bot_slug: string;
              unread_count: number;
            }>,
        );
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        return {
          items: page.map((row) => ({
            id: row.id,
            category: 'unread' as const,
            kind: 'channel-unread' as const,
            createdAt: row.created_at,
            channelId: row.channel_id,
            channelName: row.channel_name,
            botSlug: row.bot_slug,
            summary: row.summary,
            messageId: row.message_id,
            sourceEventId: row.source_event_id,
            unreadCount: row.unread_count,
          })),
          ...(rows.length > limit && last !== undefined
            ? {
                nextCursor: Buffer.from(
                  JSON.stringify({
                    version: 1,
                    filters,
                    createdAt: last.created_at,
                    id: last.id,
                  } satisfies Cursor),
                ).toString('base64url'),
              }
            : {}),
        };
      }
      const rows = database.read(
        (db) =>
          db
            .prepare(`
        ${ACTION_ATTENTION_CTE}
        SELECT * FROM attention
         WHERE category = ?
           AND (? IS NULL OR id = ?)
           ${dismissFilter('attention.id', 'attention.source_event_id')}
           AND (? IS NULL OR bot_slug = ?)
           AND (? IS NULL OR channel_id = ?)
           AND (? IS NULL OR created_at ${cursorComparison} ? OR
                (created_at = ? AND id ${cursorComparison} ?))
         ORDER BY created_at ${direction}, id ${direction}
         LIMIT ?
      `)
            .all(
              JSON.stringify(activeQuestionMessageIds()),
              JSON.stringify(activeToolApprovalMessageIds()),
              JSON.stringify(activePrivateInputMessageIds()),
              category,
              input.itemId ?? null,
              input.itemId ?? null,
              input.botSlug ?? null,
              input.botSlug ?? null,
              input.channelId ?? null,
              input.channelId ?? null,
              cursor?.createdAt ?? null,
              cursor?.createdAt ?? null,
              cursor?.createdAt ?? null,
              cursor?.id ?? null,
              limit + 1,
            ) as unknown as AttentionRow[],
      );
      const page = rows.slice(0, limit);
      const items = page.map(attentionItem);
      const last = page.at(-1);
      return {
        items,
        ...(rows.length > limit && last !== undefined
          ? {
              nextCursor: Buffer.from(
                JSON.stringify({
                  version: 1,
                  filters,
                  createdAt: last.created_at,
                  id: last.id,
                } satisfies Cursor),
              ).toString('base64url'),
            }
          : {}),
      };
    },
    openTimedQuestionCards() {
      return database.read(
        (db) =>
          db
            .prepare(`
          SELECT p.channel_id AS channelId, e.message_id AS messageId
            FROM source_events e
            JOIN channel_placements p ON p.source_event_id = e.source_event_id
           WHERE e.source_kind = 'bot-message'
             AND e.message_id IS NOT NULL
             AND json_extract(e.payload_json, '$.userQuestionRequest.callId') IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM source_events resolution
                 JOIN channel_placements rp ON rp.source_event_id = resolution.source_event_id
                WHERE rp.channel_id = p.channel_id
                  AND json_extract(resolution.payload_json,
                    '$.userQuestionResolution.requestMessageId') = e.message_id
             )
           ORDER BY e.created_at, e.source_event_id`)
            .all() as Array<{ channelId: string; messageId: string }>,
      );
    },
    durableAttention() {
      return database.read(
        (db) =>
          db
            .prepare(`${ACTION_ATTENTION_CTE}
          SELECT bot_slug AS botSlug,
                 sum(kind = 'assignment-waiting-human') AS waitingHumanCount,
                 sum(kind = 'assignment-blocked') AS blockedCount,
                 sum(kind = 'workspace-grant-request') AS workspaceGrantCount,
                 sum(kind = 'assignment-report') AS informationalCount
            FROM attention
           WHERE kind IN ('assignment-waiting-human', 'assignment-blocked', 'workspace-grant-request', 'assignment-report')
             AND NOT (kind = 'assignment-report' AND EXISTS (SELECT 1 FROM inbox_admissions handled
               WHERE handled.source_event_id = attention.source_event_id
                 AND handled.bot_slug = attention.bot_slug
                 AND handled.attempt_state = 'handled'))
             AND NOT EXISTS (SELECT 1 FROM human_inbox_dismissals d
               WHERE d.human_id = '${LOCAL_HUMAN_ID}' AND d.item_id = attention.id
                 AND d.source_key = coalesce(attention.source_event_id, ''))
           GROUP BY bot_slug`)
            .all('[]', '[]') as Array<{
            botSlug: string;
            waitingHumanCount: number;
            blockedCount: number;
            workspaceGrantCount: number;
            informationalCount: number;
          }>,
      );
    },
    actionCount() {
      return this.actionSummary().count;
    },
    actionSummary() {
      const rows = database.read(
        (db) =>
          db
            .prepare(
              `${ACTION_ATTENTION_CTE} SELECT bot_slug, count(DISTINCT id) AS count FROM attention WHERE category = 'action' AND NOT EXISTS (SELECT 1 FROM human_inbox_dismissals d WHERE d.human_id = '${LOCAL_HUMAN_ID}' AND d.item_id = attention.id AND d.source_key = coalesce(attention.source_event_id, '')) GROUP BY bot_slug`,
            )
            .all(
              JSON.stringify(activeQuestionMessageIds()),
              JSON.stringify(activeToolApprovalMessageIds()),
              JSON.stringify(activePrivateInputMessageIds()),
            ) as { bot_slug: string; count: number }[],
      );
      return {
        count: rows.reduce((total, row) => total + row.count, 0),
        botSlugs: rows.map((row) => row.bot_slug),
      };
    },
    status() {
      const unreadCount = database.read(
        (db) =>
          (
            db
              .prepare(`${CHANNEL_ATTENTION_CTE}
        SELECT count(DISTINCT source_event_id) AS unread_count FROM visible_unread
      `)
              .get(LOCAL_HUMAN_ID, LOCAL_HUMAN_ID) as { unread_count: number }
          ).unread_count,
      );
      return {
        unreadCount,
        hasAction: this.list({ category: 'action', limit: 1 }).items.length > 0,
      };
    },
  };
}

export interface HumanAttentionDecisions {
  dismiss(item: HumanAttentionItem): boolean;
  ignoreAssignmentReport(sourceEventId: string): boolean;
}

export function createHumanAttentionDecisions(
  database: OperationalDatabaseModulePort,
  now: () => Date = () => new Date(),
): HumanAttentionDecisions {
  return {
    dismiss(item) {
      return database.transaction(
        (db) => {
          const revision =
            item.kind === 'channel-unread' &&
            item.channelId !== undefined &&
            item.messageId !== undefined
              ? (
                  db
                    .prepare(
                      'SELECT revision FROM channel_placements WHERE channel_id = ? AND message_id = ?',
                    )
                    .get(item.channelId, item.messageId) as { revision: number } | undefined
                )?.revision
              : undefined;
          if (item.kind === 'channel-unread' && revision === undefined) return false;
          db.prepare(
            'INSERT OR IGNORE INTO human_inbox_dismissals (human_id, item_id, source_key, through_revision, dismissed_at) VALUES (?, ?, ?, ?, ?)',
          ).run(
            LOCAL_HUMAN_ID,
            item.id,
            item.sourceEventId ?? '',
            revision ?? null,
            now().toISOString(),
          );
          return true;
        },
        ['human-attention'],
      );
    },
    ignoreAssignmentReport(sourceEventId) {
      return database.transaction(
        (db) => {
          const latest = db
            .prepare(`
            SELECT e.source_event_id
              FROM source_events e
              JOIN assignments a ON a.session_id = e.assignment_session_id
             WHERE e.source_event_id = ?
               AND e.source_kind = 'assignment-report'
               AND a.latest_report_state = 'completed'
               AND e.source_event_id = (
                 SELECT newer.source_event_id FROM source_events newer
                  WHERE newer.assignment_session_id = a.session_id
                    AND newer.source_kind = 'assignment-report'
                  ORDER BY newer.rowid DESC LIMIT 1
               )
          `)
            .get(sourceEventId);
          if (latest === undefined) return false;
          db.prepare(`
            INSERT OR IGNORE INTO human_attention_decisions
              (source_event_id, decision, decided_at) VALUES (?, 'ignored', ?)
          `).run(sourceEventId, now().toISOString());
          return true;
        },
        ['human-attention'],
      );
    },
  };
}
