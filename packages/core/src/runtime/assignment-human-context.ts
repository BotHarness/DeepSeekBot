import type { DatabaseSync } from 'node:sqlite';
import type { ChannelMessage, ChannelRecord } from '../channels/channel.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';

export interface HumanAssignmentReport {
  sourceEventId: string;
  at: string;
  state: 'progress' | 'completed' | 'blocked' | 'waiting-human' | 'failed';
  summary: string;
}

export interface HumanAssignmentContext {
  botSlug: string;
  sessionId: string;
  title: string;
  description: string;
  purpose: string;
  sourceEventId: string;
  reports: HumanAssignmentReport[];
  hasOlder?: boolean;
  hasNewer?: boolean;
  canReply: boolean;
  reply?: { id: string; at: string; body: string };
}

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

function humanReply(
  db: DatabaseSync,
  botSlug: string,
  sessionId: string,
  sourceEventId: string,
): HumanAssignmentContext['reply'] {
  const row = db
    .prepare(`
    SELECT message_id AS id, created_at AS at, body FROM source_events
    WHERE channel_id = ? AND source_kind = 'human-message'
      AND json_extract(payload_json, '$.author.kind') = 'human'
      AND json_extract(payload_json, '$.assignmentReply.sessionId') = ?
      AND json_extract(payload_json, '$.assignmentReply.sourceEventId') = ?
    ORDER BY rowid LIMIT 1
  `)
    .get('dm-' + botSlug, sessionId, sourceEventId) as HumanAssignmentContext['reply'];
  return row;
}

function canReply(
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
  if (humanReply(db, botSlug, sessionId, sourceEventId) === undefined) return true;
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
    !canReply(db, channel.botSlug, target.sessionId, target.sourceEventId)
  )
    throw new AssignmentReplyTargetError();
}

export function readHumanAssignmentContext(
  database: OperationalDatabaseModulePort,
  botSlug: string,
  sessionId: string,
  sourceEventId: string,
): HumanAssignmentContext | undefined {
  return database.read((db) => {
    const source = db
      .prepare(`
      SELECT e.rowid AS position, a.title, a.description FROM source_events e
      JOIN assignments a ON a.session_id = e.assignment_session_id AND a.bot_slug = e.bot_slug
      WHERE a.bot_slug = ? AND a.session_id = ? AND e.source_event_id = ?
        AND e.source_kind = 'assignment-report'
    `)
      .get(botSlug, sessionId, sourceEventId) as
      | { position: number; title: string; description: string }
      | undefined;
    if (source === undefined) return undefined;
    const rows = db
      .prepare(`
      SELECT source_event_id, created_at, body, json_extract(payload_json, '$.assignmentReport.state') AS state
      FROM source_events WHERE rowid IN (
        SELECT rowid FROM source_events WHERE assignment_session_id = ? AND source_kind = 'assignment-report' AND rowid < ? ORDER BY rowid DESC LIMIT 2
      ) OR rowid IN (
        SELECT rowid FROM source_events WHERE assignment_session_id = ? AND source_kind = 'assignment-report' AND rowid >= ? ORDER BY rowid LIMIT 3
      ) ORDER BY rowid
    `)
      .all(sessionId, source.position, sessionId, source.position) as Array<{
      source_event_id: string;
      created_at: string;
      body: string;
      state: HumanAssignmentReport['state'];
    }>;
    const edge = (id: string | undefined, direction: '<' | '>'): boolean =>
      id !== undefined &&
      db
        .prepare(
          `SELECT 1 FROM source_events WHERE assignment_session_id = ? AND source_kind = 'assignment-report' AND rowid ${direction} (SELECT rowid FROM source_events WHERE source_event_id = ?) LIMIT 1`,
        )
        .get(sessionId, id) !== undefined;
    const reply = humanReply(db, botSlug, sessionId, sourceEventId);
    return {
      botSlug,
      sessionId,
      title: source.title,
      description: source.description,
      purpose: source.description,
      sourceEventId,
      hasOlder: edge(rows[0]?.source_event_id, '<'),
      hasNewer: edge(rows.at(-1)?.source_event_id, '>'),
      reports: rows.map((row) => ({
        sourceEventId: row.source_event_id,
        at: row.created_at,
        summary: row.body,
        state: row.state,
      })),
      canReply: canReply(db, botSlug, sessionId, sourceEventId),
      ...(reply === undefined ? {} : { reply }),
    };
  });
}
