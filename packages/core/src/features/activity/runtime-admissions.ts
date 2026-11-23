import type { DatabaseSync } from 'node:sqlite';

import type {
  ChannelMessageView,
  OrchestratorChannelAccess,
} from '../../channels/runtime-access-types.js';
import type { ChannelStore } from '../../channels/store.js';
import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import type { HumanContext } from '../../humans/context.js';
import type { PromptLimits } from '../../prompts/prompt-limits.js';
import { requireSourceContent, requireSourceEffects } from '../../purge/fence.js';
import type { SourceEventAttemptState, SourceEventClaim } from '../../runtime/bot-runtime.js';
import type { createGroupDigest, GroupContext } from '../../runtime/group-digest.js';
import type { createOrchestratorContinuation } from '../../runtime/orchestrator-continuation.js';
import type { BotSourcePolicyStore } from '../../runtime/source-policy.js';
import { linkScheduleFiringsToSession } from '../schedules/events.js';
import type { createInboxHarvest } from './inbox-harvest.js';

interface SourceEventRow {
  source_event_id: string;
  bot_slug: string;
  body: string;
  handled_at: string | null;
  attempt_state: SourceEventAttemptState;
}

interface RuntimeAdmissionsPorts {
  channels: ChannelStore;
  closed: () => boolean;
  continuation: ReturnType<typeof createOrchestratorContinuation>;
  createEventId: () => string;
  database: OperationalDatabaseModulePort;
  groupDigest: ReturnType<typeof createGroupDigest>;
  inboxHarvest: ReturnType<typeof createInboxHarvest>;
  now: () => Date;
  promptLimits: (botSlug: string) => PromptLimits;
  sourcePolicy: BotSourcePolicyStore;
  tails: Map<string, Promise<unknown>>;
  turnSources: Map<
    string,
    {
      sessionId: string;
      eventIds: Set<string>;
      acceptedEventIds: Set<string>;
      inboundChannelId: string | undefined;
      steeredChannelIds: Set<string>;
      memoryObservation: 'source-event' | 'recovered-question';
    }
  >;
}

export function createRuntimeAdmissions(ports: RuntimeAdmissionsPorts) {
  function claimDmContinuation(botSlug: string, sourceEventId: string): boolean {
    return ports.database.transaction(
      (database) => {
        const events = database
          .prepare(
            `UPDATE source_events SET attempt_state = 'running'
              WHERE source_event_id = ? AND attempt_state IN ('retryable', 'needs-repair')`,
          )
          .run(sourceEventId).changes;
        database
          .prepare(
            `
          UPDATE inbox_admissions SET attempt_state = 'running', last_error = NULL
           WHERE source_event_id = ? AND bot_slug = ? AND attempt_state IN ('retryable', 'needs-repair')
        `,
          )
          .run(sourceEventId, botSlug);
        return events > 0;
      },
      ['source-event', 'bot-inbox'],
    );
  }

  function claimSteeredDm(
    botSlug: string,
    channelId: string,
    reason: 'human-dm' | 'bot-dm',
    sourceEventId: string,
  ): GroupContext | undefined {
    return ports.database.transaction(
      (database) => {
        database
          .prepare(
            `
        UPDATE inbox_admissions SET attempt_state = 'running', last_error = NULL
         WHERE source_event_id = ? AND bot_slug = ?
           AND attempt_state IN ('pending', 'retryable')
      `,
          )
          .run(sourceEventId, botSlug);
        return ports.inboxHarvest.claimDmContext(
          database,
          botSlug,
          channelId,
          reason,
          sourceEventId,
        );
      },
      ['bot-inbox'],
    );
  }

  function claimSteeredGroupMention(
    sourceEventId: string,
    botSlug: string,
    channelId: string,
    mentionPrompt: string,
  ): GroupContext | false | undefined {
    return ports.database.transaction(
      (database) => {
        const mention =
          database
            .prepare(
              `
        UPDATE inbox_admissions SET attempt_state = 'running', last_error = NULL
         WHERE source_event_id = ? AND bot_slug = ?
           AND attempt_state IN ('pending', 'retryable')
      `,
            )
            .run(sourceEventId, botSlug).changes > 0;
        return mention
          ? ports.inboxHarvest.claimGroupContext(database, botSlug, channelId, {
              remainingCharacters: Math.max(
                0,
                ports.promptLimits(botSlug)['group-context-chars'] - mentionPrompt.length,
              ),
              includedByChannel: new Map(),
            })
          : false;
      },
      ['bot-inbox'],
    );
  }

  function restoreSteeredAdmissions(
    admissions: Array<{ sourceEventId: string; messageId: string }>,
    botSlug: string,
    turn: { sessionId: string } | undefined,
    now: string,
    error?: { cause: unknown },
  ): void {
    ports.database.transaction(
      (db) => {
        for (const { sourceEventId } of admissions) {
          const reply =
            turn &&
            ports.continuation.routingGroupReplyState(botSlug, turn.sessionId, sourceEventId);
          const state =
            reply === 'delivered'
              ? 'handled'
              : error || reply === 'uncertain'
                ? 'needs-repair'
                : 'pending';
          db.prepare(`UPDATE inbox_admissions SET attempt_state = ?,
            side_effect_started_at = CASE WHEN ? = 'pending' THEN NULL ELSE side_effect_started_at END,
            handled_at = CASE WHEN ? = 'handled' THEN ? ELSE handled_at END,
            last_error = ?
            WHERE source_event_id = ? AND bot_slug = ? AND attempt_state = 'running'`).run(
            state,
            state,
            state,
            now,
            error ? String(error.cause).slice(0, 500) : null,
            sourceEventId,
            botSlug,
          );
        }
      },
      ['bot-inbox'],
    );
  }

  function settleSteeredAdmission(
    admissions: Array<{ sourceEventId: string; messageId: string }>,
    botSlug: string,
    channelId: string,
    succeeded: boolean,
  ): void {
    ports.database.transaction(
      (database) => {
        for (const admission of admissions)
          database
            .prepare(
              `
        UPDATE inbox_admissions
           SET attempt_state = ?,
               handled_at = CASE WHEN ? THEN ? ELSE handled_at END,
               opened_at = CASE WHEN ? THEN COALESCE(opened_at, ?) ELSE opened_at END,
               last_error = CASE WHEN ? THEN NULL ELSE 'Steered Orchestrator turn failed' END
         WHERE source_event_id = ? AND bot_slug = ? AND attempt_state = 'running'
      `,
            )
            .run(
              succeeded ? 'handled' : 'needs-repair',
              succeeded ? 1 : 0,
              ports.now().toISOString(),
              succeeded ? 1 : 0,
              ports.now().toISOString(),
              succeeded ? 1 : 0,
              admission.sourceEventId,
              botSlug,
            );
      },
      ['bot-inbox'],
    );
    for (const admission of admissions)
      ports.channels.admissionChanged?.(channelId, admission.messageId);
  }

  function noteSteeredChannel(botSlug: string, channelId: string): void {
    const turn = ports.turnSources.get(botSlug);
    if (turn !== undefined && turn.inboundChannelId !== channelId)
      turn.steeredChannelIds.add(channelId);
  }

  function acceptTurnSources(botSlug: string, sourceEventIds: readonly string[]): void {
    const turn = ports.turnSources.get(botSlug);
    if (turn === undefined) return;
    for (const id of sourceEventIds) {
      turn.eventIds.add(id);
      turn.acceptedEventIds.add(id);
    }
  }

  function markAdmissionsSideEffect(
    botSlug: string,
    sourceEventIds: string[],
    recordInTurn = true,
    transaction?: DatabaseSync,
  ): void {
    if (sourceEventIds.length === 0) return;
    if (recordInTurn) {
      const turn = ports.turnSources.get(botSlug);
      if (turn !== undefined) for (const id of sourceEventIds) turn.eventIds.add(id);
    }
    const record = (database: DatabaseSync): void => {
      for (const id of sourceEventIds) {
        requireSourceEffects(database, id, botSlug);
        database
          .prepare(
            `
          UPDATE inbox_admissions
             SET side_effect_started_at = COALESCE(side_effect_started_at, ?)
           WHERE source_event_id = ? AND bot_slug = ? AND attempt_state = 'running'
        `,
          )
          .run(ports.now().toISOString(), id, botSlug);
      }
    };
    if (transaction === undefined) ports.database.transaction(record, ['bot-inbox']);
    else record(transaction);
  }

  function observeAdmission(
    sourceEventId: string,
    botSlug: string,
    channelId: string,
    messageId: string,
    claimPending = false,
  ): void {
    const changed = ports.database.transaction(
      (database) =>
        database
          .prepare(
            `
        UPDATE inbox_admissions
           SET observed_at = COALESCE(observed_at, ?), attempt_state = 'running',
               last_error = CASE WHEN attempt_state = 'running' THEN last_error ELSE NULL END
         WHERE source_event_id = ? AND bot_slug = ?
           AND (attempt_state = 'running' OR (? AND attempt_state IN ('pending', 'retryable')))
      `,
          )
          .run(ports.now().toISOString(), sourceEventId, botSlug, Number(claimPending)).changes > 0,
      ['bot-inbox'],
    );
    if (changed) ports.channels.admissionChanged?.(channelId, messageId);
  }

  function hasPendingInbox(botSlug: string): boolean {
    if (ports.closed() || ports.tails.has(botSlug)) return true;
    return ports.database.read(
      (database) =>
        database
          .prepare(
            `SELECT 1 FROM inbox_admissions
              WHERE bot_slug = ? AND attempt_state IN ('pending', 'running', 'retryable')
              LIMIT 1`,
          )
          .get(botSlug) !== undefined,
    );
  }

  function admissionHandled(sourceEventId: string, botSlug: string): boolean {
    const row = ports.database.read((database) =>
      database
        .prepare(
          `SELECT attempt_state FROM inbox_admissions WHERE source_event_id = ? AND bot_slug = ?`,
        )
        .get(sourceEventId, botSlug),
    ) as { attempt_state: string } | undefined;
    return row?.attempt_state === 'handled';
  }

  function claimSourceEvent(
    human: HumanContext,
    botSlug: string,
    channelId: string,
    messageId: string,
    body: string,
    createdAt: string,
  ): SourceEventClaim {
    return ports.database.transaction(
      (database) => {
        const sourcePolicy = ports.sourcePolicy.resolveIn(database, botSlug, 'human-dm');
        const existing = database
          .prepare(
            `SELECT source_event_id, bot_slug, body, handled_at, attempt_state
               FROM source_events
              WHERE channel_id = ? AND message_id = ?`,
          )
          .get(channelId, messageId) as SourceEventRow | undefined;
        if (existing !== undefined) {
          if (existing.bot_slug !== botSlug || existing.body !== body) {
            throw new Error(`Source Event identity conflict for Channel message ${messageId}`);
          }
          database
            .prepare(
              `
            INSERT OR IGNORE INTO inbox_admissions (
              source_event_id, bot_slug, reason, attempt_state, handled_at,
              source_policy_revision, source_policy_wake_mode
            ) VALUES (?, ?, 'human-dm', ?, ?, ?, ?)
          `,
            )
            .run(
              existing.source_event_id,
              botSlug,
              existing.attempt_state,
              existing.handled_at,
              sourcePolicy.revision,
              sourcePolicy.wake,
            );
          if (existing.handled_at !== null || existing.attempt_state === 'handled') {
            return {
              sourceEventId: existing.source_event_id,
              shouldRun: false,
            };
          }
          if (existing.attempt_state === 'running' || existing.attempt_state === 'needs-repair') {
            return {
              sourceEventId: existing.source_event_id,
              shouldRun: false,
              reconciliationRequired: true,
            };
          }
          database
            .prepare(
              `UPDATE source_events SET attempt_state = 'running'
                WHERE source_event_id = ?`,
            )
            .run(existing.source_event_id);
          database
            .prepare(
              `
            UPDATE inbox_admissions SET attempt_state = 'running', last_error = NULL
            WHERE source_event_id = ? AND bot_slug = ?
          `,
            )
            .run(existing.source_event_id, botSlug);
          return { sourceEventId: existing.source_event_id, shouldRun: true };
        }

        const sourceEventId = ports.createEventId();
        database
          .prepare(
            `INSERT INTO source_events (
               source_event_id, source_kind, bot_slug, channel_id, message_id,
               body, created_at, attempt_state, human_id
             ) VALUES (?, 'human-message', ?, ?, ?, ?, ?, 'running', ?)`,
          )
          .run(sourceEventId, botSlug, channelId, messageId, body, createdAt, human.humanId);
        database
          .prepare(
            `
          INSERT INTO inbox_admissions
            (source_event_id, bot_slug, reason, attempt_state,
             source_policy_revision, source_policy_wake_mode)
          VALUES (?, ?, 'human-dm', 'running', ?, ?)
        `,
          )
          .run(sourceEventId, botSlug, sourcePolicy.revision, sourcePolicy.wake);
        return { sourceEventId, shouldRun: true };
      },
      ['source-event', 'bot-inbox'],
    );
  }

  function markSideEffectStarted(sourceEventId: string, transaction?: DatabaseSync): void {
    const record = (database: DatabaseSync): void => {
      requireSourceContent(database, sourceEventId);
      database
        .prepare(
          `UPDATE source_events
                SET side_effect_started_at = COALESCE(side_effect_started_at, ?)
              WHERE source_event_id = ? AND attempt_state = 'running'`,
        )
        .run(ports.now().toISOString(), sourceEventId);
      database
        .prepare(
          `
          UPDATE inbox_admissions
             SET side_effect_started_at = COALESCE(side_effect_started_at, ?)
           WHERE source_event_id = ? AND attempt_state = 'running'
        `,
        )
        .run(ports.now().toISOString(), sourceEventId);
    };
    if (transaction === undefined)
      ports.database.transaction(record, ['source-event', 'bot-inbox']);
    else record(transaction);
  }

  function markSourceEventFailed(sourceEventId: string): void {
    ports.database.transaction(
      (database) => {
        database
          .prepare(
            `UPDATE source_events
                SET attempt_state = CASE
                      WHEN side_effect_started_at IS NULL THEN 'retryable'
                      ELSE 'needs-repair'
                    END
              WHERE source_event_id = ? AND attempt_state = 'running'`,
          )
          .run(sourceEventId);
        database
          .prepare(
            `
          UPDATE inbox_admissions
             SET attempt_state = CASE
               WHEN side_effect_started_at IS NULL THEN 'retryable' ELSE 'needs-repair' END
           WHERE source_event_id = ? AND attempt_state = 'running'
        `,
          )
          .run(sourceEventId);
      },
      ['source-event', 'bot-inbox'],
    );
  }

  function ignoreAdmission(
    botSlug: string,
    sessionId: string,
    channelId: string,
    messageId: string,
  ): ReturnType<OrchestratorChannelAccess['ignore']> {
    const decision = ports.database.transaction(
      (database) => {
        const row = database
          .prepare(
            `
                SELECT a.source_event_id, a.reason, a.attempt_state, a.observed_at, a.ignored_at
                  FROM inbox_admissions a
                  JOIN source_events e ON e.source_event_id = a.source_event_id
                 WHERE a.bot_slug = ? AND e.channel_id = ? AND e.message_id = ?
              `,
          )
          .get(botSlug, channelId, messageId) as
          | {
              source_event_id: string;
              reason: string;
              attempt_state: string;
              observed_at: string | null;
              ignored_at: string | null;
            }
          | undefined;
        if (row === undefined)
          return {
            error: 'inbox_ignore: no Inbox Admission for this Bot',
          } as const;
        if (row.attempt_state === 'needs-repair')
          return {
            error: 'inbox_ignore: this admission needs repair',
          } as const;
        if (row.ignored_at !== null)
          return {
            sourceEventId: row.source_event_id,
            ignoredAt: row.ignored_at,
            alreadyIgnored: true,
          };
        if (
          row.attempt_state !== 'running' &&
          row.attempt_state !== 'handled' &&
          row.observed_at === null
        )
          return {
            error: 'inbox_ignore: observe this message before ignoring it',
          } as const;
        const ignoredAt = ports.now().toISOString();
        database
          .prepare(
            `
                UPDATE inbox_admissions
                   SET ignored_at = ?, ignored_by_session_id = ?,
                       resolved_at = COALESCE(resolved_at, ?),
                       resolution = COALESCE(resolution, 'ignored'),
                       resolved_by_session_id = COALESCE(resolved_by_session_id, ?),
                       observed_at = COALESCE(observed_at, ?),
                       attempt_state = CASE
                         WHEN attempt_state IN ('pending', 'retryable', 'running') THEN 'handled'
                         ELSE attempt_state END,
                       handled_at = CASE
                         WHEN attempt_state IN ('pending', 'retryable', 'running') THEN ?
                         ELSE handled_at END
                 WHERE source_event_id = ? AND bot_slug = ? AND ignored_at IS NULL
              `,
          )
          .run(
            ignoredAt,
            sessionId,
            ignoredAt,
            sessionId,
            ignoredAt,
            ignoredAt,
            row.source_event_id,
            botSlug,
          );
        if (row.reason === 'human-dm') {
          database
            .prepare(
              `UPDATE source_events
                  SET handled_at = COALESCE(handled_at, ?), attempt_state = 'handled'
                WHERE source_event_id = ? AND bot_slug = ? AND source_kind = 'human-message'
                  AND attempt_state IN ('pending', 'retryable', 'running')`,
            )
            .run(ignoredAt, row.source_event_id, botSlug);
        }
        return {
          sourceEventId: row.source_event_id,
          ignoredAt,
          alreadyIgnored: false,
        };
      },
      ['source-event', 'bot-inbox'],
    );
    if ('error' in decision) throw new Error(decision.error);
    ports.channels.admissionChanged?.(channelId, messageId);
    return decision;
  }

  function turnSideEffectStarted(botSlug: string): boolean {
    return (
      ports.database.read((database) =>
        database
          .prepare(
            `SELECT 1 FROM inbox_admissions
              WHERE bot_slug = ? AND attempt_state = 'running'
                AND side_effect_started_at IS NOT NULL
              LIMIT 1`,
          )
          .get(botSlug),
      ) !== undefined
    );
  }

  function observeReadMessages(
    botSlug: string,
    messages: ChannelMessageView[],
    readAdmissions: Set<string>,
  ): void {
    if (messages.length === 0) return;
    const observedAt = ports.now().toISOString();
    const { changedChannels, changedMessages } = ports.database.transaction(
      (database) => {
        const update = database.prepare(`
          UPDATE inbox_admissions
             SET observed_at = COALESCE(observed_at, ?),
                 side_effect_started_at = COALESCE(side_effect_started_at, ?),
                 attempt_state = 'running', last_error = NULL
           WHERE bot_slug = ?
             AND reason NOT IN ('assignment-report', 'assignment-lifecycle')
             AND attempt_state IN ('pending', 'retryable')
             AND source_event_id IN (
               SELECT source_event_id FROM channel_placements
                WHERE channel_id = ? AND message_id = ?
             )
           RETURNING source_event_id
        `);
        const changedChannels = new Set<string>();
        const changedMessages: Array<{ channelId: string; messageId: string }> = [];
        for (const item of messages) {
          const claimed = update.get(
            observedAt,
            observedAt,
            botSlug,
            item.channelId,
            item.message.id,
          ) as { source_event_id: string } | undefined;
          if (claimed === undefined) continue;
          readAdmissions.add(claimed.source_event_id);
          changedChannels.add(item.channelId);
          changedMessages.push({
            channelId: item.channelId,
            messageId: item.message.id,
          });
        }
        return { changedChannels, changedMessages };
      },
      ['bot-inbox'],
    );
    for (const { channelId, messageId } of changedMessages)
      ports.channels.admissionChanged?.(channelId, messageId);
    for (const channelId of changedChannels) ports.groupDigest.scheduleDigest(botSlug, channelId);
  }

  function notifyReadAdmissions(sourceEventIds: Set<string>): void {
    if (sourceEventIds.size === 0) return;
    const ids = [...sourceEventIds];
    const placeholders = ids.map(() => '?').join(', ');
    const rows = ports.database.read((database) =>
      database
        .prepare(
          `SELECT channel_id, message_id FROM source_events
          WHERE source_event_id IN (${placeholders})`,
        )
        .all(...ids),
    ) as Array<{ channel_id: string | null; message_id: string | null }>;
    for (const source of rows) {
      if (source.channel_id !== null && source.message_id !== null)
        ports.channels.admissionChanged?.(source.channel_id, source.message_id);
    }
  }

  function markReportSideEffects(
    sourceEventIds: readonly string[],
    botSlug: string,
    transaction?: DatabaseSync,
  ): void {
    if (sourceEventIds.length === 0) return;
    const placeholders = sourceEventIds.map(() => '?').join(', ');
    const record = (database: DatabaseSync): void => {
      database
        .prepare(
          `
            UPDATE inbox_admissions
               SET side_effect_started_at = COALESCE(side_effect_started_at, ?)
             WHERE bot_slug = ? AND reason IN ('assignment-report', 'assignment-lifecycle', 'memory-change', 'schedule', 'group-mention', 'group-ordinary', 'human-dm')
               AND attempt_state = 'running'
               AND source_event_id IN (${placeholders})
          `,
        )
        .run(ports.now().toISOString(), botSlug, ...sourceEventIds);
    };
    if (transaction === undefined) ports.database.transaction(record, ['bot-inbox']);
    else record(transaction);
  }

  function setObserved(sourceEventIds: string[], at: string | null, botSlug?: string): void {
    if (sourceEventIds.length === 0) return;
    const placeholders = sourceEventIds.map(() => '?').join(', ');
    ports.database.transaction(
      (database) => {
        database
          .prepare(
            `UPDATE source_events SET observed_at = ?
              WHERE source_event_id IN (${placeholders})`,
          )
          .run(at, ...sourceEventIds);
        database
          .prepare(
            `
            UPDATE inbox_admissions
               SET observed_at = ?,
                   attempt_state = CASE
                     WHEN ? IS NOT NULL THEN 'running'
                     WHEN side_effect_started_at IS NULL THEN 'retryable'
                     ELSE 'needs-repair'
                   END
             WHERE reason IN ('assignment-report', 'assignment-lifecycle', 'memory-change', 'schedule', 'group-mention', 'group-ordinary', 'human-dm')
               AND attempt_state IN ('pending', 'retryable', 'running')
               AND (? IS NULL OR bot_slug = ?)
               AND source_event_id IN (${placeholders})
          `,
          )
          .run(at, at, botSlug ?? null, botSlug ?? null, ...sourceEventIds);
      },
      ['source-event', 'bot-inbox'],
    );
  }

  function markReportsHandled(
    sourceEventIds: string[],
    botSlug?: string,
    sessionId?: string,
  ): void {
    if (sourceEventIds.length === 0) return;
    const placeholders = sourceEventIds.map(() => '?').join(', ');
    ports.database.transaction(
      (database) => {
        database
          .prepare(
            `
            UPDATE inbox_admissions
               SET attempt_state = 'handled', handled_at = ?, opened_at = COALESCE(opened_at, ?)
             WHERE reason IN ('assignment-report', 'assignment-lifecycle', 'memory-change', 'schedule', 'group-mention', 'group-ordinary', 'human-dm')
               AND attempt_state = 'running'
               AND (? IS NULL OR bot_slug = ?)
               AND source_event_id IN (${placeholders})
          `,
          )
          .run(
            ports.now().toISOString(),
            ports.now().toISOString(),
            botSlug ?? null,
            botSlug ?? null,
            ...sourceEventIds,
          );
        if (sessionId !== undefined)
          linkScheduleFiringsToSession(database, sourceEventIds, placeholders, sessionId);
      },
      ['bot-inbox', 'bot-schedules'],
    );
  }

  return {
    claimDmContinuation,
    claimSteeredDm,
    claimSteeredGroupMention,
    restoreSteeredAdmissions,
    settleSteeredAdmission,
    noteSteeredChannel,
    acceptTurnSources,
    markAdmissionsSideEffect,
    observeAdmission,
    hasPendingInbox,
    admissionHandled,
    claimSourceEvent,
    markSideEffectStarted,
    markSourceEventFailed,
    ignoreAdmission,
    turnSideEffectStarted,
    observeReadMessages,
    notifyReadAdmissions,
    markReportSideEffects,
    setObserved,
    markReportsHandled,
  };
}
