import type { ExternalSource } from '../messaging/inbound.js';
import type { ChannelStore } from '../channels/store.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';

export type BotAttentionState =
  | 'pending'
  | 'processing'
  | 'observed'
  | 'deferred'
  | 'needs-repair'
  | 'open'
  | 'snoozed'
  | 'handled'
  | 'ignored';

export const OPEN_ADMISSION_SQL = `(a.attempt_state = 'handled' AND a.opened_at IS NOT NULL
  AND a.resolved_at IS NULL AND a.ignored_at IS NULL)`;

export function channelSql(event: string): string {
  return `COALESCE(${event}.channel_id, (SELECT p.channel_id FROM channel_placements p
  WHERE p.source_event_id = ${event}.source_event_id ORDER BY p.channel_id LIMIT 1))`;
}

export function conversationSql(event: string): string {
  return `CASE
    WHEN ${event}.assignment_session_id IS NOT NULL THEN 'assignment:' || ${event}.assignment_session_id
    WHEN ${channelSql(event)} IS NOT NULL THEN 'channel:' || ${channelSql(event)}
    WHEN ${event}.source_kind = 'schedule' THEN 'schedule:' || COALESCE(json_extract(${event}.payload_json, '$.schedule.id'), ${event}.source_event_id)
    ELSE 'event:' || ${event}.source_event_id
  END`;
}

export const SNOOZED_SQL = `(a.snoozed_until IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM inbox_admissions later_admission
    JOIN source_events later ON later.source_event_id = later_admission.source_event_id
   WHERE later_admission.bot_slug = a.bot_slug
     AND later.created_at > a.snoozed_at
     AND later.source_event_id <> a.source_event_id
     AND ${conversationSql('later')} = ${conversationSql('e')}))`;

export const ATTENTION_STATE_SQL = `CASE
    WHEN a.attempt_state = 'needs-repair' THEN 'needs-repair'
    WHEN a.ignored_at IS NOT NULL AND a.attempt_state = 'handled' THEN 'ignored'
    WHEN a.resolution = 'ignored' THEN 'ignored'
    WHEN ${OPEN_ADMISSION_SQL} AND ${SNOOZED_SQL} THEN 'snoozed'
    WHEN ${OPEN_ADMISSION_SQL} THEN 'open'
    WHEN a.attempt_state = 'handled' THEN 'handled'
    WHEN a.attempt_state = 'running' THEN 'processing'
    WHEN a.attempt_state = 'retryable' OR
      (a.reason = 'group-ordinary' AND a.wake_count IS NOT NULL AND a.attempt_state = 'pending')
      THEN 'deferred'
    ELSE 'pending'
  END`;

export interface BotAttentionItem {
  id: string;
  botSlug: string;
  reason: string;
  state: BotAttentionState;
  createdAt: string;
  observedAt?: string;
  handledAt?: string;
  ignoredAt?: string;
  resolutionNote?: string;
  snoozedUntil?: string;
  snoozeNote?: string;
  sourceKind: string;
  sourceChannelId?: string;
  sourceChannelName?: string;
  sourceMessageId?: string;
  assignmentSessionId?: string;
  assignmentPurpose?: string;
  assignmentReportState?: 'progress' | 'completed' | 'blocked' | 'waiting-human' | 'failed';
  assignmentTurn?: number;
  relatedReportSourceEventId?: string;
  scheduleId?: string;
  sourceAvailable: boolean;
  authorKind: 'human' | 'bot' | 'bridged' | 'system';
  authorBotSlug?: string;
  externalOrigin?: {
    platform: string;
    accountName: string;
    conversationName: string;
    conversationId: string;
    senderId: string;
    senderName?: string;
    voice?: NonNullable<ExternalSource['event']['voice']>;
  };
  summary: string;
}

export interface BotAttentionPage {
  items: BotAttentionItem[];
  nextCursor?: string;
}

export interface BotAttentionQuery {
  list(input: {
    botSlug: string;
    limit?: number;
    cursor?: string;
    state?: BotAttentionState;
  }): BotAttentionPage;
}

interface AttentionRow {
  source_event_id: string;
  bot_slug: string;
  reason: string;
  attempt_state: string;
  observed_at: string | null;
  handled_at: string | null;
  ignored_at: string | null;
  resolution_note: string | null;
  snoozed_until: string | null;
  snooze_note: string | null;
  source_kind: string;
  channel_id: string | null;
  message_id: string | null;
  placed_message_id: string | null;
  assignment_session_id: string | null;
  available_assignment_session_id: string | null;
  assignment_purpose: string | null;
  assignment_report_state: string | null;
  assignment_turn: number | null;
  related_report_source_event_id: string | null;
  schedule_id: string | null;
  available_schedule_id: string | null;
  body: string;
  payload_json: string | null;
  created_at: string;
  author_kind: string | null;
  author_slug: string | null;
  state: BotAttentionState;
}

export function createBotAttentionQuery(
  database: OperationalDatabaseModulePort,
  channels: ChannelStore,
): BotAttentionQuery {
  return {
    list(input) {
      const limit = input.limit ?? 30;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new Error('Bot attention limit must be 1–100');
      const cursor = input.cursor;
      const anchor =
        cursor === undefined
          ? undefined
          : database.read(
              (db) =>
                db
                  .prepare(`
          SELECT e.created_at, e.source_event_id FROM inbox_admissions a
          JOIN source_events e ON e.source_event_id = a.source_event_id
          WHERE a.bot_slug = ? AND e.source_event_id = ?
        `)
                  .get(input.botSlug, cursor) as
                  | { created_at: string; source_event_id: string }
                  | undefined,
            );
      if (input.cursor !== undefined && anchor === undefined)
        throw new Error('Bot attention cursor is unavailable');
      const rows = database.read(
        (db) =>
          db
            .prepare(`
        WITH attention AS (
          SELECT a.source_event_id, a.bot_slug, a.reason, a.attempt_state,
                 a.observed_at, a.handled_at, a.ignored_at, a.resolution_note,
                 a.snoozed_until, a.snooze_note, e.source_kind,
                 CASE WHEN e.source_kind = 'bridge-message' THEN p.channel_id ELSE e.channel_id END AS channel_id,
                 e.message_id, p.message_id AS placed_message_id,
                 e.assignment_session_id,
                 assignment.session_id AS available_assignment_session_id,
                 assignment.purpose AS assignment_purpose,
                 json_extract(e.payload_json, '$.assignmentReport.state') AS assignment_report_state,
                 COALESCE(json_extract(e.payload_json, '$.assignmentReport.turn'), json_extract(e.payload_json, '$.assignmentLifecycle.turn')) AS assignment_turn,
                 json_extract(e.payload_json, '$.assignmentLifecycle.reportSourceEventId') AS related_report_source_event_id,
                 CASE WHEN e.source_kind = 'schedule' THEN json_extract(e.payload_json, '$.schedule.id') END AS schedule_id,
                 schedule.schedule_id AS available_schedule_id,
                 e.body, e.payload_json, e.created_at, json_extract(e.payload_json, '$.author.kind') AS author_kind,
                 json_extract(e.payload_json, '$.author.slug') AS author_slug,
                 ${ATTENTION_STATE_SQL} AS state
          FROM inbox_admissions a
          JOIN source_events e ON e.source_event_id = a.source_event_id
          LEFT JOIN channel_placements p ON p.source_event_id = e.source_event_id
            AND p.channel_id = (SELECT MIN(p2.channel_id) FROM channel_placements p2
              JOIN channel_records c2 ON c2.channel_id = p2.channel_id, json_each(c2.record_json, '$.members') member
              WHERE p2.source_event_id = e.source_event_id AND member.value = a.bot_slug)
          LEFT JOIN assignments assignment
            ON assignment.session_id = e.assignment_session_id AND assignment.bot_slug = a.bot_slug
          LEFT JOIN bot_schedules schedule
            ON e.source_kind = 'schedule' AND schedule.bot_slug = a.bot_slug
              AND schedule.schedule_id = json_extract(e.payload_json, '$.schedule.id')
          WHERE a.bot_slug = ?
        )
        SELECT * FROM attention
        WHERE (? IS NULL OR state = ?)
          AND (? IS NULL OR created_at < ? OR
               (created_at = ? AND source_event_id < ?))
        ORDER BY created_at DESC, source_event_id DESC
        LIMIT ?
      `)
            .all(
              input.botSlug,
              input.state ?? null,
              input.state ?? null,
              anchor?.created_at ?? null,
              anchor?.created_at ?? null,
              anchor?.created_at ?? null,
              anchor?.source_event_id ?? null,
              limit + 1,
            ) as unknown as AttentionRow[],
      );
      const page = rows.slice(0, limit);
      const items = page.map((row): BotAttentionItem => {
        const channel = row.channel_id === null ? undefined : channels.get(row.channel_id);
        const authorKind =
          row.author_kind === 'human' || row.author_kind === 'bot' || row.author_kind === 'bridged'
            ? row.author_kind
            : 'system';
        const external =
          row.source_kind === 'bridge-message' && row.payload_json !== null
            ? (JSON.parse(row.payload_json) as { external: ExternalSource }).external
            : undefined;
        return {
          ...(external === undefined
            ? {}
            : {
                externalOrigin: {
                  platform: external.platform,
                  accountName: external.accountName,
                  conversationName: external.conversationName,
                  conversationId: external.event.conversation.id,
                  senderId: external.event.actor.id,
                  ...(external.event.voice ? { voice: external.event.voice } : {}),
                  ...(external.event.actor.name ? { senderName: external.event.actor.name } : {}),
                },
              }),
          id: row.source_event_id,
          botSlug: row.bot_slug,
          reason: row.reason,
          state: row.state,
          createdAt: row.created_at,
          ...(row.observed_at === null ? {} : { observedAt: row.observed_at }),
          ...(row.handled_at === null ? {} : { handledAt: row.handled_at }),
          ...(row.ignored_at === null ? {} : { ignoredAt: row.ignored_at }),
          ...(row.resolution_note === null ? {} : { resolutionNote: row.resolution_note }),
          ...(row.state === 'snoozed' && row.snoozed_until !== null
            ? { snoozedUntil: row.snoozed_until }
            : {}),
          ...(row.state === 'snoozed' && row.snooze_note !== null
            ? { snoozeNote: row.snooze_note }
            : {}),
          sourceKind: row.source_kind,
          ...(row.channel_id === null ? {} : { sourceChannelId: row.channel_id }),
          ...(channel === undefined ? {} : { sourceChannelName: channel.name }),
          ...(row.placed_message_id === null ? {} : { sourceMessageId: row.placed_message_id }),
          ...(row.assignment_session_id === null
            ? {}
            : { assignmentSessionId: row.assignment_session_id }),
          ...(row.assignment_purpose === null ? {} : { assignmentPurpose: row.assignment_purpose }),
          ...(row.assignment_report_state === 'progress' ||
          row.assignment_report_state === 'completed' ||
          row.assignment_report_state === 'blocked' ||
          row.assignment_report_state === 'waiting-human' ||
          row.assignment_report_state === 'failed'
            ? { assignmentReportState: row.assignment_report_state }
            : {}),
          ...(row.assignment_turn === null ? {} : { assignmentTurn: row.assignment_turn }),
          ...(row.related_report_source_event_id === null
            ? {}
            : { relatedReportSourceEventId: row.related_report_source_event_id }),
          ...(row.schedule_id === null ? {} : { scheduleId: row.schedule_id }),
          sourceAvailable:
            (channel !== undefined && row.placed_message_id !== null) ||
            row.available_assignment_session_id !== null ||
            row.available_schedule_id !== null ||
            external !== undefined,
          authorKind,
          ...(authorKind === 'bot' && row.author_slug !== null
            ? { authorBotSlug: row.author_slug }
            : {}),
          summary: row.body.slice(0, 240),
        };
      });
      return {
        items,
        ...(rows.length > limit && page.length > 0
          ? { nextCursor: page[page.length - 1]!.source_event_id }
          : {}),
      };
    },
  };
}
