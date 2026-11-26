import { canReplyToAssignment, humanAssignmentReply } from '../channels/assignment-reply.js';
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
    const reply = humanAssignmentReply(db, botSlug, sessionId, sourceEventId);
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
      canReply: canReplyToAssignment(db, botSlug, sessionId, sourceEventId),
      ...(reply === undefined ? {} : { reply }),
    };
  });
}
