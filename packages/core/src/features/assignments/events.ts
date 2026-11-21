import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import { waitForAssignment, type AssignmentWaitOutcome } from '../../runtime/assignment-wait.js';
import { DEFAULT_GROUP_WAKE_POLICY } from '../../channels/channel.js';
import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import type { BotRuntimeOptions, AssignmentDetail } from '../../runtime/bot-runtime.js';
const COMPLETION_DIGEST_COUNT = DEFAULT_GROUP_WAKE_POLICY.count;
const COMPLETION_DIGEST_MS = DEFAULT_GROUP_WAKE_POLICY.intervalSeconds * 1000;
export function createAssignmentEvents({
  database,
  scheduleHarvest,
  completionDigestTimers,
  getAssignment,
  waitOptions,
  waitLifetime,
  now,
  setObserved,
  markReportsHandled,
}: {
  database: OperationalDatabaseModulePort;
  scheduleHarvest: (botSlug: string) => void;
  completionDigestTimers: Map<string, NodeJS.Timeout>;
  getAssignment: (botSlug: string, sessionId: string) => AssignmentDetail | undefined;
  waitOptions: Pick<BotRuntimeOptions, 'database' | 'beginAssignmentWait'>;
  waitLifetime: AbortController;
  now: () => Date;
  setObserved: (sourceEventIds: string[], at: string | null, botSlug?: string) => void;
  markReportsHandled: (sourceEventIds: string[], botSlug?: string, sessionId?: string) => void;
}) {
  function recoverPendingAssignmentReports(): void {
    const due = database.read(
      (database) =>
        database
          .prepare(
            `
          SELECT DISTINCT a.bot_slug
            FROM inbox_admissions a
            JOIN source_events e ON e.source_event_id = a.source_event_id
           WHERE a.reason IN ('assignment-report', 'assignment-lifecycle')
             AND a.attempt_state IN ('pending', 'retryable')
             AND e.observed_at IS NULL
             AND NOT (e.source_kind = 'assignment-lifecycle' AND
                  json_extract(e.payload_json, '$.assignmentLifecycle.reportSourceEventId') IS NOT NULL)
             AND (a.source_policy_wake_mode = 'immediate' OR
                  ((a.source_policy_wake_mode = 'conditional' OR
                    a.source_policy_wake_mode IS NULL) AND
                   (a.reason = 'assignment-lifecycle' OR e.expects_reply = 1 OR
                    e.payload_json IS NULL OR
                    json_extract(e.payload_json, '$.assignmentReport.state')
                      IN ('completed', 'blocked', 'waiting-human', 'failed'))))
           ORDER BY a.bot_slug
        `,
          )
          .all() as { bot_slug: string }[],
    );
    for (const row of due) scheduleHarvest(row.bot_slug);
  }

  function hasPendingAssignmentReport(botSlug: string): boolean {
    const report = database.read((database) =>
      database
        .prepare(
          `
          SELECT 1 AS found FROM inbox_admissions a
           JOIN source_events e ON e.source_event_id = a.source_event_id
          WHERE a.bot_slug = ? AND a.reason IN ('assignment-report', 'assignment-lifecycle')
            AND a.attempt_state = 'pending' AND e.observed_at IS NULL
            AND NOT (e.source_kind = 'assignment-lifecycle' AND
                  json_extract(e.payload_json, '$.assignmentLifecycle.reportSourceEventId') IS NOT NULL)
             AND (a.source_policy_wake_mode = 'immediate' OR
                 ((a.source_policy_wake_mode = 'conditional' OR
                   a.source_policy_wake_mode IS NULL) AND
                  (a.reason = 'assignment-lifecycle' OR e.expects_reply = 1 OR
                   e.payload_json IS NULL OR
                   json_extract(e.payload_json, '$.assignmentReport.state')
                     IN ('completed', 'blocked', 'waiting-human', 'failed'))))
          LIMIT 1
        `,
        )
        .get(botSlug),
    );

    return report !== undefined;
  }

  function scheduleReportHarvest(botSlug: string): boolean {
    if (!holdsCompletionDigest(botSlug)) {
      const prior = completionDigestTimers.get(botSlug);
      if (prior !== undefined) clearTimeout(prior);
      completionDigestTimers.delete(botSlug);
      scheduleHarvest(botSlug);
      return true;
    }
    if (!completionDigestTimers.has(botSlug)) {
      const timer = setTimeout(() => {
        completionDigestTimers.delete(botSlug);
        scheduleHarvest(botSlug);
      }, COMPLETION_DIGEST_MS);
      timer.unref();
      completionDigestTimers.set(botSlug, timer);
    }
    return false;
  }

  function holdsCompletionDigest(botSlug: string): boolean {
    return database.read((database) => {
      const rows = database
        .prepare(
          `SELECT e.assignment_session_id AS session_id, e.source_kind,
                  e.expects_reply, json_extract(e.payload_json, '$.assignmentReport.state') AS state
             FROM inbox_admissions a JOIN source_events e ON e.source_event_id = a.source_event_id
            WHERE a.bot_slug = ? AND a.attempt_state = 'pending' AND e.observed_at IS NULL
              AND a.reason IN ('assignment-report', 'assignment-lifecycle')
              AND NOT (e.source_kind = 'assignment-lifecycle' AND
                json_extract(e.payload_json, '$.assignmentLifecycle.reportSourceEventId') IS NOT NULL)
              AND NOT (e.source_kind = 'assignment-report' AND e.expects_reply = 0 AND
                json_extract(e.payload_json, '$.assignmentReport.state') = 'progress')`,
        )
        .all(botSlug) as unknown as Array<{
        session_id: string | null;
        source_kind: string;
        expects_reply: number;
        state: string | null;
      }>;
      if (
        rows.length === 0 ||
        rows.some(
          (row) =>
            row.session_id === null ||
            row.source_kind !== 'assignment-report' ||
            row.expects_reply !== 0 ||
            row.state !== 'completed',
        )
      )
        return false;
      if (rows.length >= COMPLETION_DIGEST_COUNT) return false;
      const sessions = [...new Set(rows.map((row) => row.session_id!))];
      const other = database
        .prepare(
          `SELECT 1 FROM assignments
            WHERE bot_slug = ? AND activity = 'working' AND stop_state = 'running'
              AND archived_at IS NULL
              AND session_id NOT IN (${sessions.map(() => '?').join(', ')})
            LIMIT 1`,
        )
        .get(botSlug, ...sessions);
      return other !== undefined;
    });
  }

  function wait(
    bot: Pick<PersonaBotRecord, 'slug'>,
    orchestratorSessionId: string | undefined,
    readAdmissions: Set<string> | undefined,
    sessionId: string,
    signal: AbortSignal,
    timeoutMs = 30000,
  ): Promise<AssignmentWaitOutcome> {
    if (orchestratorSessionId === undefined) throw new Error('Orchestrator run is unavailable');
    return waitForAssignment({
      read: () => {
        const assignment = getAssignment(bot.slug, sessionId);
        if (assignment === undefined) throw new Error('Unknown owned Assignment Session');
        const report = database.read((database) =>
          database
            .prepare(
              `SELECT source_event_id FROM source_events
               WHERE bot_slug = ? AND assignment_session_id = ? AND source_kind = 'assignment-report'
               ORDER BY rowid DESC LIMIT 1`,
            )
            .get(bot.slug, sessionId),
        ) as { source_event_id: string } | undefined;
        return { assignment, reportId: report?.source_event_id };
      },
      subscribe: (changed) =>
        waitOptions.database.subscribe((notification) => {
          if (notification.topics.includes('assignments')) changed();
        }),
      begin: () => waitOptions.beginAssignmentWait?.(bot.slug, orchestratorSessionId) ?? (() => {}),
      signal: AbortSignal.any([signal, waitLifetime.signal]),
      timeoutMs,
    }).then((outcome) => {
      if (outcome.outcome === 'timeout' || readAdmissions === undefined) return outcome;
      const inboxIds = claimAssignmentNotices(
        bot.slug,
        sessionId,
        outcome.reportId,
        readAdmissions,
      );
      return inboxIds.length === 0
        ? outcome
        : {
            ...outcome,
            inboxIds,
            resolveHint:
              'You have now seen these Inbox items. Once this result is used, resolve them with inbox_resolve in the same step as your reply, so no triage turn follows.',
          };
    });
  }

  function claimAssignmentNotices(
    botSlug: string,
    sessionId: string,
    reportId: string | undefined,
    readAdmissions: Set<string>,
  ): string[] {
    const at = now().toISOString();
    const claimed = database.transaction(
      (db) =>
        db
          .prepare(
            `UPDATE inbox_admissions SET observed_at = COALESCE(observed_at, ?),
          attempt_state = 'running', last_error = NULL
          WHERE bot_slug = ? AND reason IN ('assignment-report', 'assignment-lifecycle')
            AND attempt_state IN ('pending', 'retryable')
            AND source_event_id IN (SELECT source_event_id FROM source_events
              WHERE bot_slug = ? AND assignment_session_id = ?
                AND COALESCE(json_extract(payload_json, '$.assignmentLifecycle.cause'), '')
                  NOT LIKE 'direct-%'
                AND (? IS NULL
                  OR rowid <= (SELECT rowid FROM source_events WHERE source_event_id = ?)
                  OR json_extract(payload_json, '$.assignmentLifecycle.reportSourceEventId') IN (
                    SELECT r.source_event_id FROM source_events r
                     WHERE r.assignment_session_id = ? AND r.source_kind = 'assignment-report'
                       AND r.rowid <= (SELECT rowid FROM source_events WHERE source_event_id = ?))))
          RETURNING source_event_id`,
          )
          .all(
            at,
            botSlug,
            botSlug,
            sessionId,
            reportId ?? null,
            reportId ?? null,
            sessionId,
            reportId ?? null,
          ) as unknown as Array<{
          source_event_id: string;
        }>,
      ['bot-inbox'],
    );
    if (claimed.length === 0) return [];
    const ids = claimed.map((row) => row.source_event_id);
    database.transaction(
      (db) =>
        db
          .prepare(
            `UPDATE source_events SET observed_at = COALESCE(observed_at, ?)
              WHERE source_event_id IN (${ids.map(() => '?').join(', ')})`,
          )
          .run(at, ...ids),
      ['bot-inbox'],
    );
    for (const id of ids) readAdmissions.add(id);
    return ids;
  }

  function settleSeenPairedNotices(botSlug: string, sourceEventIds: string[]): void {
    if (sourceEventIds.length === 0) return;
    const placeholders = sourceEventIds.map(() => '?').join(', ');
    const seen = database.read(
      (database) =>
        database
          .prepare(
            `SELECT n.source_event_id FROM source_events n
               JOIN source_events r
                 ON r.source_event_id = json_extract(n.payload_json, '$.assignmentLifecycle.reportSourceEventId')
              WHERE n.source_kind = 'assignment-lifecycle' AND r.observed_at IS NOT NULL
                AND n.source_event_id IN (${placeholders})`,
          )
          .all(...sourceEventIds) as unknown as Array<{ source_event_id: string }>,
    );
    const ids = seen.map((row) => row.source_event_id);
    if (ids.length === 0) return;
    setObserved(ids, now().toISOString(), botSlug);
    markReportsHandled(ids, botSlug);
  }

  function linkRequestAssignment(sourceEventId: string, sessionId: string): void {
    database.transaction(
      (database) => {
        database
          .prepare(
            `INSERT INTO request_assignments (request_source_event_id, session_id, linked_at)
             SELECT source_event_id, ?, ? FROM source_events
              WHERE source_event_id = ? AND source_kind = 'human-message'
             ON CONFLICT (request_source_event_id, session_id) DO UPDATE SET linked_at = excluded.linked_at`,
          )
          .run(sessionId, now().toISOString(), sourceEventId);
      },
      ['assignments'],
    );
  }
  return {
    hasPendingAssignmentReport,
    recoverPendingAssignmentReports,
    scheduleReportHarvest,
    wait,
    settleSeenPairedNotices,
    linkRequestAssignment,
  };
}
