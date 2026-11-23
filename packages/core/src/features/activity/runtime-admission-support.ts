import type { AssignmentActivity } from '@botharness/host-protocol/wire';
import type { ExternalSource } from '../../messaging/inbound.js';

export interface InboxReportRow {
  source_event_id: string;
  source_kind:
    | 'assignment-report'
    | 'assignment-lifecycle'
    | 'memory-change'
    | 'bridge-message'
    | 'schedule';
  external?: ExternalSource;
  schedule_json?: string | null;
  assignment_session_id: string | null;
  body: string;
  created_at: string;
  expects_reply: number;
  open_ask_id?: string | null;
  open_ask_summary?: string | null;
  continuity_key: string | null;
  activity: AssignmentActivity | null;
  paired_report_id?: string | null;
  lifecycle_cause?: string | null;
}

export interface GroupPromptBudget {
  remainingCharacters: number;
  includedByChannel: Map<string, number>;
}

export type SourceEventAttemptState =
  | 'pending'
  | 'running'
  | 'retryable'
  | 'needs-repair'
  | 'handled';

export interface SourceEventClaim {
  sourceEventId: string;
  shouldRun: boolean;
  reconciliationRequired?: true;
}

import { type OperationalDatabaseModulePort } from '../../database/owner.js';

export function interruptedDmNotice(
  database: OperationalDatabaseModulePort,
  botSlug: string,
  channelId: string | undefined,
): string {
  const rows = database.read((database) =>
    database
      .prepare(
        `
        SELECT e.channel_id, e.message_id
          FROM inbox_admissions a
          JOIN source_events e ON e.source_event_id = a.source_event_id
         WHERE a.bot_slug = ? AND a.reason = 'human-dm' AND e.source_kind = 'human-message'
           AND a.attempt_state IN ('retryable', 'needs-repair')
           AND e.channel_id IS NOT NULL AND e.message_id IS NOT NULL AND e.channel_id != ?
           AND e.created_at > COALESCE((
             SELECT MAX(handled_at) FROM inbox_admissions WHERE bot_slug = ? AND handled_at IS NOT NULL
           ), '')
         ORDER BY e.created_at, e.message_id
         LIMIT 5
      `,
      )
      .all(botSlug, channelId ?? '', botSlug),
  ) as Array<{ channel_id: string; message_id: string }>;
  return rows
    .map(
      (row) =>
        `[Host: your earlier turn for Human DM ${row.channel_id}, message ${row.message_id}, ended without a reply. It stays in that DM for the Human to retry; do not answer it in another Channel.]\n\n`,
    )
    .join('');
}
