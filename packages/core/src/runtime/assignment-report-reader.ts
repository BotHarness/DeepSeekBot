import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { requireSourceContent } from '../purge/fence.js';
import { parseReportContent, type AssignmentReportContent } from './assignment-report.js';
import type { AssignmentReportPage } from './assignment-tail.js';

export interface AssignmentReportRead {
  sessionId: string;
  offset: number;
  reportSourceEventId?: string;
}

export type AcceptedAssignmentReportPage = AssignmentReportPage & { reportSourceEventId: string };

export type NativeAssignmentReportReader = (
  sessionId: string,
  summary: string,
  offset: number,
  content?: AssignmentReportContent,
) => Promise<AssignmentReportPage>;

export async function readAcceptedAssignmentReport(
  database: OperationalDatabaseModulePort,
  readNative: NativeAssignmentReportReader | undefined,
  botSlug: string,
  request: AssignmentReportRead,
): Promise<AcceptedAssignmentReportPage> {
  const { sessionId, offset, reportSourceEventId } = request;
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid report offset');
  if (offset > 0 && reportSourceEventId === undefined)
    throw new Error(
      'REPORT_ID_REQUIRED: Continue with report_source_event_id, or restart at report_offset=0',
    );
  const accepted = database.read((db) => {
    const assignment = db
      .prepare(`SELECT latest_report_summary, latest_report_at FROM assignments
      WHERE bot_slug = ? AND session_id = ?`)
      .get(botSlug, sessionId);
    if (assignment === undefined) throw new Error(`Unknown Assignment Session: ${sessionId}`);
    const row =
      reportSourceEventId === undefined
        ? db
            .prepare(`SELECT source_event_id, body, payload_json FROM source_events
          WHERE source_kind = 'assignment-report' AND bot_slug = ? AND assignment_session_id = ?
            AND body = ? AND created_at = ? ORDER BY rowid DESC LIMIT 1`)
            .get(
              botSlug,
              sessionId,
              assignment.latest_report_summary!,
              assignment.latest_report_at!,
            )
        : db
            .prepare(`SELECT source_event_id, body, payload_json FROM source_events
          WHERE source_kind = 'assignment-report' AND bot_slug = ? AND assignment_session_id = ?
            AND source_event_id = ?`)
            .get(botSlug, sessionId, reportSourceEventId);
    if (row === undefined)
      throw new Error('REPORT_UNAVAILABLE: Accepted Assignment report is unavailable');
    if (
      typeof row.source_event_id !== 'string' ||
      typeof row.body !== 'string' ||
      (row.payload_json !== null && typeof row.payload_json !== 'string')
    )
      throw new Error('Invalid Assignment report record');
    requireSourceContent(db, row.source_event_id);
    return {
      id: row.source_event_id,
      summary: row.body,
      content: parseReportContent(row.payload_json),
    };
  });
  if (readNative === undefined) throw new Error('DSH Session Query is unavailable');
  const page = await readNative(sessionId, accepted.summary, offset, accepted.content);
  database.read((db) => requireSourceContent(db, accepted.id));
  return { ...page, reportSourceEventId: accepted.id };
}
