import type { DatabaseSync } from 'node:sqlite';
import type { ChannelMessage, ChannelRecord } from './channel.js';

export class AssignmentReplyTargetError extends Error {
  constructor() {
    super('Assignment request is no longer awaiting this Human response');
    this.name = 'AssignmentReplyTargetError';
  }
}

function currentReport(db: DatabaseSync, botSlug: string, sessionId: string): string | undefined {
  const row = db
    .prepare(`
    SELECT coalesce(a.open_ask_source_event_id, (
      SELECT e.source_event_id FROM source_events e
      WHERE e.assignment_session_id = a.session_id AND e.source_kind = 'assignment-report'
      ORDER BY e.rowid DESC LIMIT 1
    )) AS source_event_id
    FROM assignments a LEFT JOIN source_events ask ON ask.source_event_id = a.open_ask_source_event_id
    WHERE a.bot_slug = ? AND a.session_id = ? AND a.stop_state = 'running'
      AND a.latest_report_state NOT IN ('completed', 'failed')
      AND ((a.open_ask_source_event_id IS NOT NULL
            AND json_extract(ask.payload_json, '$.assignmentReport.state') IN ('blocked', 'waiting-human'))
        OR (a.latest_report_state = 'blocked' AND a.activity IN ('idle', 'error')))
  `)
    .get(botSlug, sessionId) as { source_event_id: string } | undefined;
  return row?.source_event_id;
}

export function humanAssignmentReply(
  db: DatabaseSync,
  botSlug: string,
  sessionId: string,
  sourceEventId: string,
): { id: string; at: string; body: string } | undefined {
  const row = db
    .prepare(`
    SELECT message_id AS id, created_at AS at, body FROM source_events
    WHERE channel_id = ? AND source_kind = 'human-message'
      AND json_extract(payload_json, '$.author.kind') = 'human'
      AND json_extract(payload_json, '$.assignmentReply.sessionId') = ?
      AND json_extract(payload_json, '$.assignmentReply.sourceEventId') = ?
    ORDER BY rowid LIMIT 1
  `)
    .get('dm-' + botSlug, sessionId, sourceEventId) as
    | { id: string; at: string; body: string }
    | undefined;
  return row;
}

export function canReplyToAssignment(
  db: DatabaseSync,
  botSlug: string,
  sessionId: string,
  sourceEventId: string,
): boolean {
  if (currentReport(db, botSlug, sessionId) !== sourceEventId) return false;
  if (
    db
      .prepare(
        `SELECT 1 FROM assignments WHERE bot_slug = ? AND session_id = ? AND activity = 'error'`,
      )
      .get(botSlug, sessionId) !== undefined
  )
    return false;
  if (humanAssignmentReply(db, botSlug, sessionId, sourceEventId) === undefined) return true;
  return (
    db
      .prepare(`SELECT 1 FROM assignments a JOIN source_events failure
    ON failure.channel_id = 'dm-' || a.bot_slug
    WHERE a.bot_slug = ? AND a.session_id = ? AND a.open_ask_source_event_id = ?
      AND a.activity = 'idle' AND a.stop_state = 'running'
      AND failure.source_kind = 'bot-message'
      AND json_extract(failure.payload_json, '$.sessionFailure.role') = 'assignment'
      AND json_extract(failure.payload_json, '$.sessionFailure.sessionId') = a.session_id
      AND json_extract(failure.payload_json, '$.sessionFailure.assignmentAnswerTo') = a.open_ask_source_event_id
      AND failure.rowid > (SELECT max(reply.rowid) FROM source_events reply
        WHERE reply.channel_id = 'dm-' || a.bot_slug AND reply.source_kind = 'human-message'
          AND json_extract(reply.payload_json, '$.author.kind') = 'human'
          AND json_extract(reply.payload_json, '$.assignmentReply.sessionId') = a.session_id
          AND json_extract(reply.payload_json, '$.assignmentReply.sourceEventId') = a.open_ask_source_event_id)
    LIMIT 1`)
      .get(botSlug, sessionId, sourceEventId) !== undefined
  );
}

export function assertAssignmentHumanReply(
  db: DatabaseSync,
  channel: ChannelRecord,
  message: ChannelMessage,
): void {
  const target = message.assignmentReply;
  if (target === undefined) return;
  if (
    channel.type !== 'dm' ||
    channel.botSlug === undefined ||
    message.author.kind !== 'human' ||
    !canReplyToAssignment(db, channel.botSlug, target.sessionId, target.sourceEventId)
  )
    throw new AssignmentReplyTargetError();
}
