import {
  readAcceptedAssignmentReport,
  type AssignmentReportRead,
} from '../../runtime/assignment-report-reader.js';
import type {
  AssignmentReport,
  AssignmentReportInput,
  AssignmentReportState,
} from '@botharness/host-protocol/wire';
import { prepareAssignmentReport } from '../../runtime/assignment-report.js';
import { requireSourceContent } from '../../purge/fence.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import type { SessionOwnership } from '../../sessions/ownership.js';
import type { BotSourcePolicyStore } from '../../runtime/source-policy.js';
import type { BotRuntimeOptions, AssignmentDetail } from '../../runtime/bot-runtime.js';
import { requireNonBlank } from '../../runtime/require-non-blank.js';
const DIRECT_NOTICE_TEXT_LIMIT = 2_000;
export function createAssignmentReporting({
  createEventId,
  now,
  database,
  sourcePolicy,
  scheduleHarvest,
  ownership,
  closed,
  registry,
  assignmentRow,
  getAssignment,
  saveReportSpill,
  readAssignmentReportPage,
  scheduleReportHarvest,
}: {
  createEventId: () => string;
  now: () => Date;
  database: OperationalDatabaseModulePort;
  sourcePolicy: BotSourcePolicyStore;
  scheduleHarvest: (botSlug: string) => void;
  ownership: SessionOwnership;
  closed: () => boolean;
  registry: PersonaBotRegistry;
  assignmentRow: (botSlug: string, sessionId: string) => { source_event_id: string } | undefined;
  getAssignment: (botSlug: string, sessionId: string) => AssignmentDetail | undefined;
  saveReportSpill: BotRuntimeOptions['saveReportSpill'];
  readAssignmentReportPage: BotRuntimeOptions['readAssignmentReportPage'];
  scheduleReportHarvest: (botSlug: string) => boolean;
}) {
  function noticeDirectAssignmentCall(
    botSlug: string,
    tool: string,
    args: Record<string, unknown>,
    result: unknown,
  ): void {
    if (typeof result !== 'object' || result === null) return;
    const outcome = result as { outcome?: unknown; sessionId?: unknown; delivery?: unknown };
    if (typeof outcome.sessionId !== 'string') return;
    const sessionId = outcome.sessionId;
    const quoted = (value: unknown) =>
      typeof value !== 'string'
        ? undefined
        : value.length > DIRECT_NOTICE_TEXT_LIMIT
          ? `${JSON.stringify(value.slice(0, DIRECT_NOTICE_TEXT_LIMIT))} (${value.length - DIRECT_NOTICE_TEXT_LIMIT} more characters omitted)`
          : JSON.stringify(value);
    let body: string;
    let cause: string;
    if (tool === 'create_assignment') {
      if (outcome.outcome !== 'created' && outcome.outcome !== 'reused') return;
      cause = outcome.outcome === 'created' ? 'direct-create' : 'direct-reuse';
      body = [
        outcome.outcome === 'created'
          ? 'The Human created this Assignment directly through the deepseekbot CLI, not through you.'
          : 'The Human continued this keyed Assignment directly through the deepseekbot CLI, not through you.',
        `Title: ${quoted(args.title) ?? '(none)'}.`,
        `Description: ${quoted(args.description) ?? '(none)'}.`,
        ...(quoted(args.instructions) === undefined
          ? []
          : [`Instructions: ${quoted(args.instructions)}.`]),
        'It is yours to manage like any Assignment you created: its reports come to you; continue it with send_assignment_request and archive it when its work is finished.',
      ].join(' ');
    } else {
      if (outcome.delivery !== 'steer' && outcome.delivery !== 'followup') return;
      cause = 'direct-request';
      body = `The Human sent this Assignment a request directly from its Session detail or the deepseekbot CLI, not through you: ${quoted(tool === 'unarchive_assignment' ? args.message : args.text) ?? '(empty)'}. Its next report answers that request.`;
    }
    const id = createEventId();
    const at = now().toISOString();
    database.transaction(
      (database) => {
        const owned = database
          .prepare('SELECT 1 FROM assignments WHERE bot_slug = ? AND session_id = ?')
          .get(botSlug, sessionId);
        if (owned === undefined) return;
        const rule = sourcePolicy.resolveIn(database, botSlug, 'assignment-lifecycle');
        database
          .prepare(
            `INSERT INTO source_events (source_event_id, source_kind, bot_slug, assignment_session_id,
               body, created_at, handled_at, attempt_state, expects_reply, payload_json)
             VALUES (?, 'assignment-lifecycle', ?, ?, ?, ?, ?, 'handled', 0, ?)`,
          )
          .run(
            id,
            botSlug,
            sessionId,
            body,
            at,
            at,
            JSON.stringify({
              author: { kind: 'system' },
              assignmentLifecycle: { state: 'directed', cause },
            }),
          );
        database
          .prepare(
            `INSERT INTO inbox_admissions (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode)
             VALUES (?, ?, 'assignment-lifecycle', ?, 'silent')`,
          )
          .run(id, botSlug, rule.revision);
      },
      ['source-event', 'bot-inbox'],
    );
  }

  function recordUnsuccessfulAssignment(
    botSlug: string,
    sessionId: string,
    execution: { turn: number; endSeq: number },
    state: 'cancelled' | 'failed',
  ): void {
    if (
      !Number.isSafeInteger(execution.turn) ||
      execution.turn < 1 ||
      !Number.isSafeInteger(execution.endSeq) ||
      execution.endSeq < 0
    )
      throw new Error('Invalid native Assignment unsuccessful settlement');
    const cause = state === 'cancelled' ? 'native-turn-aborted' : 'native-turn-error';
    const outcome = state === 'cancelled' ? 'was cancelled' : 'ended with an execution error';
    const at = now().toISOString();
    const created = database.transaction(
      (database) => {
        const assignment = database
          .prepare(
            `
          SELECT 1 FROM assignments WHERE bot_slug = ? AND session_id = ?
            AND stop_state = 'running'
        `,
          )
          .get(botSlug, sessionId);
        if (assignment === undefined) return false;
        const existing = database
          .prepare(
            `
          SELECT 1 FROM source_events WHERE bot_slug = ? AND assignment_session_id = ?
            AND source_kind = 'assignment-lifecycle'
            AND json_extract(payload_json, '$.assignmentLifecycle.turn') = ?
            AND json_extract(payload_json, '$.assignmentLifecycle.cause') = ?
        `,
          )
          .get(botSlug, sessionId, execution.turn, cause);
        if (existing !== undefined) return false;
        const id = createEventId();
        const rule = sourcePolicy.resolveIn(database, botSlug, 'assignment-lifecycle');
        database
          .prepare(
            `
          UPDATE assignments SET activity = 'error', updated_at = ?
            WHERE bot_slug = ? AND session_id = ? AND stop_state = 'running'
        `,
          )
          .run(at, botSlug, sessionId);
        database
          .prepare(
            `
          INSERT INTO source_events (source_event_id, source_kind, bot_slug, assignment_session_id,
            body, created_at, handled_at, attempt_state, expects_reply, payload_json)
          VALUES (?, 'assignment-lifecycle', ?, ?, ?, ?, ?, 'handled', 0, ?)
        `,
          )
          .run(
            id,
            botSlug,
            sessionId,
            'DSH confirmed Assignment Turn ' +
              execution.turn +
              ' ' +
              outcome +
              '. Execution did not complete successfully. Its context is kept: send_assignment_request with this Session id continues it; archive_assignment resolves it.',
            at,
            at,
            JSON.stringify({
              author: { kind: 'system' },
              assignmentLifecycle: {
                state,
                cause,
                turn: execution.turn,
                endSeq: execution.endSeq,
              },
            }),
          );
        database
          .prepare(
            `
          INSERT INTO inbox_admissions (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode)
          VALUES (?, ?, 'assignment-lifecycle', ?, ?)
        `,
          )
          .run(id, botSlug, rule.revision, rule.wake);
        return rule.wake === 'immediate';
      },
      ['assignments', 'source-event', 'bot-inbox'],
    );
    if (created) scheduleHarvest(botSlug);
  }

  function recordCompletedAssignment(
    botSlug: string,
    sessionId: string,
    execution: { turn: number; endSeq: number },
  ): void {
    if (
      !Number.isSafeInteger(execution.turn) ||
      execution.turn < 1 ||
      !Number.isSafeInteger(execution.endSeq) ||
      execution.endSeq < 0
    )
      throw new Error('Invalid native Assignment completion');
    const at = now().toISOString();
    database.transaction(
      (database) => {
        const report = database
          .prepare(
            `
        SELECT e.source_event_id FROM source_events e
          JOIN assignments a ON a.session_id = e.assignment_session_id AND a.bot_slug = e.bot_slug
         WHERE e.bot_slug = ? AND e.assignment_session_id = ? AND a.stop_state = 'running'
           AND e.source_kind = 'assignment-report'
           AND json_extract(e.payload_json, '$.assignmentReport.state') = 'completed'
           AND json_extract(e.payload_json, '$.assignmentReport.turn') = ?
         ORDER BY e.rowid DESC LIMIT 1
      `,
          )
          .get(botSlug, sessionId, execution.turn) as { source_event_id: string } | undefined;
        if (report === undefined) return;
        const existing = database
          .prepare(
            `
        SELECT 1 FROM source_events WHERE bot_slug = ? AND assignment_session_id = ?
          AND source_kind = 'assignment-lifecycle'
          AND json_extract(payload_json, '$.assignmentLifecycle.turn') = ?
          AND json_extract(payload_json, '$.assignmentLifecycle.cause') = 'native-turn-completed'
      `,
          )
          .get(botSlug, sessionId, execution.turn);
        if (existing !== undefined) return;
        const id = createEventId();
        const rule = sourcePolicy.resolveIn(database, botSlug, 'assignment-lifecycle');
        database
          .prepare(
            `
        INSERT INTO source_events (source_event_id, source_kind, bot_slug, assignment_session_id,
          body, created_at, handled_at, attempt_state, expects_reply, payload_json)
        VALUES (?, 'assignment-lifecycle', ?, ?, ?, ?, ?, 'handled', 0, ?)
      `,
          )
          .run(
            id,
            botSlug,
            sessionId,
            'DSH confirmed successful completion of Assignment Turn ' + execution.turn + '.',
            at,
            at,
            JSON.stringify({
              author: { kind: 'system' },
              assignmentLifecycle: {
                state: 'completed',
                cause: 'native-turn-completed',
                turn: execution.turn,
                endSeq: execution.endSeq,
                reportSourceEventId: report.source_event_id,
              },
            }),
          );
        database
          .prepare(
            `
        INSERT INTO inbox_admissions (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode)
        VALUES (?, ?, 'assignment-lifecycle', ?, ?)
      `,
          )
          .run(id, botSlug, rule.revision, rule.wake);
      },
      ['source-event', 'bot-inbox'],
    );
  }

  function recordEngineRecoveryFailure(botSlug: string, sessionId: string, summary: string) {
    const owner = ownership.resolve(sessionId);
    if (
      closed() ||
      registry.get(botSlug) === undefined ||
      owner?.botSlug !== botSlug ||
      owner.rootRole !== 'assignment' ||
      owner.parentSessionId !== undefined
    )
      throw new Error(`Assignment Session ${sessionId} is unavailable`);
    return recordReport(botSlug, sessionId, { state: 'failed', summary }, undefined, true);
  }

  async function recordReport(
    botSlug: string,
    sessionId: string,
    input: AssignmentReportInput,
    execution?: { turn: number },
    engineRecoveryFailure = false,
  ): Promise<AssignmentReport> {
    const origin = assignmentRow(botSlug, sessionId)?.source_event_id;
    if (origin && !engineRecoveryFailure) database.read((db) => requireSourceContent(db, origin));
    if (execution !== undefined && (!Number.isSafeInteger(execution.turn) || execution.turn < 1))
      throw new Error('Invalid native Assignment Turn');
    const content = requireNonBlank(input.summary, 'Assignment report summary');
    const assignment = getAssignment(botSlug, sessionId);
    if (
      (assignment === undefined && !engineRecoveryFailure) ||
      assignment?.activity === 'stopping' ||
      assignment?.activity === 'stopped'
    )
      throw new Error(`Assignment Session ${sessionId} is unavailable or stopping`);
    const preparation = prepareAssignmentReport(sessionId, content, saveReportSpill);
    const prepared = preparation instanceof Promise ? await preparation : preparation;
    const { summary } = prepared;
    const at = now().toISOString();
    const expectsReply = input.expectsReply === true;
    const report: AssignmentReport = {
      state: input.state,
      summary,
      at,
      ...(expectsReply ? { expectsReply: true } : {}),
    };
    const sourceEventId = createEventId();
    const reportWake = database.transaction(
      (database) => {
        const priorAsk = database
          .prepare(
            `SELECT a.open_ask_source_event_id AS id, a.open_ask_at AS at,
          json_extract(e.payload_json, '$.assignmentReport.state') AS state,
          EXISTS (SELECT 1 FROM source_events response INDEXED BY source_events_human_assignment_response
            WHERE response.source_kind = 'human-message'
              AND json_extract(response.payload_json, '$.author.kind') = 'human'
              AND json_extract(response.payload_json, '$.assignmentReply.sessionId') = +a.session_id
              AND json_extract(response.payload_json, '$.assignmentReply.sourceEventId') = +a.open_ask_source_event_id
          ) AS answered
          FROM assignments a LEFT JOIN source_events e ON e.source_event_id = a.open_ask_source_event_id
          WHERE a.session_id = ? AND a.bot_slug = ?`,
          )
          .get(sessionId, botSlug) as
          | {
              id: string | null;
              at: string | null;
              state: string | null;
              answered: number;
            }
          | undefined;
        const terminal = input.state === 'completed' || input.state === 'failed';
        const keepAsk =
          !terminal &&
          ((input.state === 'progress' && !expectsReply) ||
            (expectsReply &&
              priorAsk?.state === 'blocked' &&
              priorAsk.answered === 0 &&
              input.state !== 'blocked'));
        const askId = terminal
          ? null
          : keepAsk
            ? (priorAsk?.id ?? null)
            : expectsReply
              ? sourceEventId
              : null;
        const askAt = terminal ? null : keepAsk ? (priorAsk?.at ?? null) : expectsReply ? at : null;
        const changed = database
          .prepare(
            `UPDATE assignments
                SET latest_report_state = ?, latest_report_summary = ?, latest_report_at = ?,
                    updated_at = ?,
                    open_ask_source_event_id = ?,
                    open_ask_at = ?
              WHERE session_id = ? AND bot_slug = ? AND stop_state = 'running'`,
          )
          .run(input.state, summary, at, at, askId, askAt, sessionId, botSlug);
        if (changed.changes !== 1 && !(engineRecoveryFailure && priorAsk === undefined))
          throw new Error(`Assignment Session ${sessionId} is unavailable or stopping`);
        const sourceRule = sourcePolicy.resolveIn(database, botSlug, 'assignment-report');
        database
          .prepare(
            `INSERT INTO source_events (
               source_event_id, source_kind, bot_slug, assignment_session_id,
               body, created_at, handled_at, attempt_state, expects_reply, payload_json
             ) VALUES (?, 'assignment-report', ?, ?, ?, ?, ?, 'handled', ?, ?)`,
          )
          .run(
            sourceEventId,
            botSlug,
            sessionId,
            summary,
            at,
            at,
            expectsReply ? 1 : 0,
            JSON.stringify({
              author: { kind: 'bot', slug: botSlug },
              assignmentReport: {
                state: input.state,
                content: prepared.content,
                ...(execution === undefined ? {} : { turn: execution.turn }),
              },
            }),
          );
        database
          .prepare(
            `
            INSERT INTO inbox_admissions
              (source_event_id, bot_slug, reason,
               source_policy_revision, source_policy_wake_mode)
            VALUES (?, ?, 'assignment-report', ?, ?)
          `,
          )
          .run(sourceEventId, botSlug, sourceRule.revision, sourceRule.wake);
        return sourceRule.wake;
      },
      ['assignments', 'assignment-report', 'source-event', 'bot-inbox'],
    );
    if (
      reportWake === 'immediate' ||
      (reportWake === 'conditional' && shouldWakeNow(input.state, expectsReply))
    )
      scheduleReportHarvest(botSlug);
    return report;
  }

  function shouldWakeNow(state: AssignmentReportState, expectsReply: boolean): boolean {
    return expectsReply || state !== 'progress';
  }
  function reportPage(botSlug: string, request: AssignmentReportRead) {
    return readAcceptedAssignmentReport(database, readAssignmentReportPage, botSlug, request);
  }

  return {
    reportPage,
    noticeDirectAssignmentCall,
    recordUnsuccessfulAssignment,
    recordCompletedAssignment,
    recordEngineRecoveryFailure,
    recordReport,
  };
}
