import {
  EXTERNAL_GUIDANCE_CHARS,
  inboxLine,
  renderInbox,
  type InboxUnit,
} from '../../runtime/inbox-render.js';
import type { OutboundMessaging } from '../../messaging/outbound.js';
import type { MessagingProcessing } from '../../messaging/typing.js';
import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import { requireSourceEffects } from '../../purge/fence.js';
import type { PromptText } from '../../prompts/prompt-parts.js';
import type { PromptLimits } from '../../prompts/prompt-limits.js';
import type {
  BotHoldCause,
  GroupContext,
  GroupPromptBudget,
  InboxReportRow,
} from '../../runtime/bot-runtime.js';

export function createMessagingEvents({
  closed,
  externalMessaging,
  database,
  release,
  checkHarvestReadiness,
  admitChannelMessage,
  activeTurns,
  delivery,
  steerWithMemory,
  promptText,
  promptLimits,
  claimGroupContext,
  setObserved,
  now,
  markAdmissionsSideEffect,
  requireTurnAccess,
  turnSessionId,
  routingGroupReplyState,
  noteSteeredChannel,
  groupContextSection,
  settleHarvestFailure,
  acceptTurnSources,
  typingTurns,
  observeAdmission,
  markReportsHandled,
  settleHarvestHandled,
  trackSteer,
  held,
  armDigest,
}: {
  closed: () => boolean;
  externalMessaging: OutboundMessaging | undefined;
  database: OperationalDatabaseModulePort;
  release: (botSlug: string) => void;
  checkHarvestReadiness: (botSlug: string) => void;
  admitChannelMessage: (
    channelId: string,
    messageId: string,
    reason:
      | 'group-mention'
      | 'group-ordinary'
      | 'bot-dm'
      | 'group-invite'
      | 'group-join-request'
      | 'group-join-decision',
  ) => void;
  activeTurns: Map<string, Promise<void>>;
  delivery: (
    botSlug: string,
    sourceClass: 'human-dm' | 'bot-dm' | 'group-mention',
  ) => 'steer' | 'turn';
  steerWithMemory:
    | ((botSlug: string, prompt: string, requireAccess: () => void) => boolean | Promise<boolean>)
    | undefined;
  promptText: (botSlug: string) => PromptText;
  promptLimits: (botSlug: string) => PromptLimits;
  claimGroupContext: (
    database: DatabaseSync,
    botSlug: string,
    channelId: string,
    budget: GroupPromptBudget,
  ) => GroupContext | undefined;
  setObserved: (sourceEventIds: string[], at: string | null, botSlug?: string) => void;
  now: () => Date;
  markAdmissionsSideEffect: (botSlug: string, sourceEventIds: string[]) => void;
  requireTurnAccess: (botSlug: string, sourceEventIds: readonly string[]) => void;
  turnSessionId: (botSlug: string) => string | undefined;
  routingGroupReplyState: (
    botSlug: string,
    sessionId: string,
    sourceEventId: string,
  ) => 'delivered' | 'uncertain' | undefined;
  noteSteeredChannel: (botSlug: string, channelId: string) => void;
  groupContextSection: (context: GroupContext) => string;
  settleHarvestFailure: (botSlug: string, sourceEventIds: string[], error: string) => void;
  acceptTurnSources: (botSlug: string, sourceEventIds: readonly string[]) => void;
  typingTurns: Map<string, MessagingProcessing>;
  observeAdmission: (
    sourceEventId: string,
    botSlug: string,
    channelId: string,
    messageId: string,
  ) => void;
  markReportsHandled: (sourceEventIds: string[], botSlug?: string, sessionId?: string) => void;
  settleHarvestHandled: (botSlug: string, sourceEventIds: string[]) => void;
  trackSteer: (settlement: Promise<void>) => void;
  held: Map<string, BotHoldCause>;
  armDigest: (
    botSlug: string,
    key: string,
    groups: Array<{
      first_at: string;
      wake_count: number;
      wake_interval_ms: number;
      pending_count: number;
    }>,
    reschedule: () => void,
  ) => void;
}) {
  function admitExternalSource(botSlug: string, sourceEventId: string): void {
    const inbound = externalMessaging?.inbound;
    if (closed() || !inbound?.available(botSlug, sourceEventId)) return;
    const row = database.read((db) =>
      db
        .prepare(
          `SELECT a.attempt_state, a.reason, a.wake_mode, e.channel_id, e.message_id FROM inbox_admissions a
      JOIN source_events e USING(source_event_id) WHERE a.bot_slug = ? AND a.source_event_id = ?`,
        )
        .get(botSlug, sourceEventId),
    ) as
      | {
          attempt_state: string;
          reason: string;
          wake_mode: string | null;
          channel_id: string | null;
          message_id: string | null;
        }
      | undefined;
    if (row?.reason === 'human-dm' || row?.reason === 'group-mention') release(botSlug);
    if (row?.reason === 'group-ordinary' && inbound.read(botSlug, sourceEventId).receptionPaths) {
      checkHarvestReadiness(botSlug);
      return;
    }
    if (row?.reason === 'group-ordinary' && row.channel_id && row.message_id) {
      admitChannelMessage(row.channel_id, row.message_id, 'group-ordinary');
      return;
    }
    if (!row || !['pending', 'retryable'].includes(row.attempt_state) || row.wake_mode === 'silent')
      return;
    const active = activeTurns.get(botSlug);
    if (
      (row.reason === 'group-mention' || row.reason === 'human-dm') &&
      delivery(botSlug, row.reason) === 'steer' &&
      active &&
      steerWithMemory
    ) {
      const source = inbound.read(botSlug, sourceEventId);
      const unit: InboxUnit = {
        sourceEventId,
        sourceKind: 'bridge-message',
        external: source,
        assignmentSessionId: null,
        summary: source.body,
        createdAt: source.at,
        continuityKey: null,
        activity: null,
        repeats: 1,
      };
      const units = [unit];
      let characters = EXTERNAL_GUIDANCE_CHARS + inboxLine(unit, promptText(botSlug)).length + 1;
      for (const candidate of pendingExternalRows(botSlug, true)) {
        if (
          candidate.source_event_id === sourceEventId ||
          !inbound.available(botSlug, candidate.source_event_id, true)
        )
          continue;
        const context = inbound.read(botSlug, candidate.source_event_id);
        const next: InboxUnit = {
          ...unit,
          sourceEventId: candidate.source_event_id,
          external: context,
          summary: context.body,
          createdAt: context.at,
        };
        const cost = inboxLine(next, promptText(botSlug)).length + 1;
        if (
          context.grantId !== source.grantId ||
          characters + cost > promptLimits(botSlug)['group-context-chars']
        )
          continue;
        characters += cost;
        units.push(next);
      }
      const context = source.localChannelId
        ? database.transaction(
            (db) =>
              claimGroupContext(db, botSlug, source.localChannelId!, {
                remainingCharacters: Math.max(
                  0,
                  promptLimits(botSlug)['group-context-chars'] -
                    renderInbox(units, promptText(botSlug)).length,
                ),
                includedByChannel: new Map(),
              }),
            ['bot-inbox'],
          )
        : undefined;
      const contextIds = context?.rows.map((item) => item.source_event_id) ?? [];
      const included = units.map((item) => item.sourceEventId);
      setObserved(included, now().toISOString(), botSlug);
      const sourceIds = [...included, ...contextIds];
      markAdmissionsSideEffect(botSlug, sourceIds);
      const sessionId = turnSessionId(botSlug);
      const requireAccess = () => {
        for (const id of included) {
          if (!inbound.available(botSlug, id, id !== sourceEventId))
            throw new Error('source-unavailable');
        }
        requireTurnAccess(botSlug, sourceIds);
        database.read((db) => {
          for (const id of sourceIds) requireSourceEffects(db, id, botSlug);
        });
      };
      const failed = () => {
        setObserved(included, null, botSlug);
        settleHarvestFailure(botSlug, contextIds, 'external-steer-failed');
      };
      const accepted = () => {
        if (source.localChannelId !== undefined) noteSteeredChannel(botSlug, source.localChannelId);
        acceptTurnSources(botSlug, sourceIds);
        typingTurns.get(botSlug)?.add(included);
        if (context)
          for (const row of context.rows)
            observeAdmission(row.source_event_id, botSlug, context.channelId, row.message_id);
        return active.then(
          () => {
            markReportsHandled(included, botSlug);
            settleHarvestHandled(botSlug, contextIds);
          },
          () => {
            setObserved(included, null, botSlug);
            settleHarvestFailure(botSlug, contextIds, 'external-steered-turn-failed');
          },
        );
      };
      const restore = () => {
        const pending: string[] = [];
        const handled: string[] = [];
        for (const id of sourceIds) {
          const reply =
            sessionId === undefined ? undefined : routingGroupReplyState(botSlug, sessionId, id);
          if (reply === 'delivered') handled.push(id);
          else if (reply === 'uncertain')
            settleHarvestFailure(botSlug, [id], 'external-reply-uncertain');
          else pending.push(id);
        }
        settleHarvestHandled(botSlug, handled);
        database.transaction(
          (db) => {
            for (const id of pending) {
              db.prepare(
                'UPDATE source_events SET observed_at = NULL WHERE source_event_id = ?',
              ).run(id);
              db.prepare(
                "UPDATE inbox_admissions SET observed_at = NULL, side_effect_started_at = NULL, attempt_state = 'pending' WHERE source_event_id = ? AND bot_slug = ? AND attempt_state = 'running'",
              ).run(id, botSlug);
            }
          },
          ['bot-inbox'],
        );
      };
      let steering: boolean | Promise<boolean>;
      try {
        steering = steerWithMemory(
          botSlug,
          [
            renderInbox(units, promptText(botSlug)),
            ...(context ? [groupContextSection(context)] : []),
          ].join('\n\n'),
          requireAccess,
        );
      } catch {
        failed();
        return;
      }
      if (steering === true) {
        trackSteer(accepted());
        return;
      }
      if (steering !== false) {
        trackSteer(
          steering.then((delivered) => {
            if (delivered) return accepted();
            return active
              .catch(() => undefined)
              .then(() => {
                restore();
                checkHarvestReadiness(botSlug);
              });
          }, failed),
        );
        return;
      }
      restore();
    }
    checkHarvestReadiness(botSlug);
  }

  function scheduleExternalDigest(botSlug: string): void {
    if (held.has(botSlug)) return;
    armDigest(
      botSlug,
      `external:${botSlug}`,
      externalMessaging?.inbound.pendingExternal(botSlug, now()).digests ?? [],
      () => scheduleExternalDigest(botSlug),
    );
  }

  function pendingExternalRows(
    botSlug: string,
    includeContext = false,
  ): Array<{
    source_event_id: string;
    body: string;
    created_at: string;
    attempt_state: string;
  }> {
    return externalMessaging?.inbound.pendingExternal(botSlug, now(), includeContext).ready ?? [];
  }

  function collectExternalRows(botSlug: string, rows: InboxReportRow[]): void {
    let externalCharacters = EXTERNAL_GUIDANCE_CHARS;
    for (const row of pendingExternalRows(botSlug, true)) {
      if (!externalMessaging?.inbound.available(botSlug, row.source_event_id, true)) continue;
      const external = externalMessaging.inbound.read(botSlug, row.source_event_id);
      const cost =
        inboxLine(
          {
            sourceEventId: row.source_event_id,
            sourceKind: 'bridge-message',
            external,
            assignmentSessionId: null,
            summary: row.body,
            createdAt: row.created_at,
            continuityKey: null,
            activity: null,
            repeats: 0,
          },
          promptText(botSlug),
        ).length + 1;
      if (
        externalCharacters > EXTERNAL_GUIDANCE_CHARS &&
        externalCharacters + cost > promptLimits(botSlug)['group-context-chars']
      )
        break;
      externalCharacters += cost;
      rows.push({
        ...row,
        source_kind: 'bridge-message',
        assignment_session_id: null,
        expects_reply: 0,
        continuity_key: null,
        activity: null,
        external,
      });
    }
  }

  function observeExternalRead(botSlug: string, ids: string[], readAdmissions: Set<string>): void {
    const at = now().toISOString();
    database.transaction(
      (db) => {
        for (const id of ids) {
          const row = db
            .prepare(
              `UPDATE inbox_admissions SET observed_at = COALESCE(observed_at, ?),
          side_effect_started_at = COALESCE(side_effect_started_at, ?), attempt_state = 'running', last_error = NULL
          WHERE bot_slug = ? AND source_event_id = ? AND reason IN ('group-mention', 'group-ordinary', 'human-dm')
            AND attempt_state IN ('pending', 'retryable') RETURNING source_event_id`,
            )
            .get(at, at, botSlug, id);
          if (row) readAdmissions.add(id);
        }
      },
      ['bot-inbox'],
    );
  }
  return {
    collectExternalRows,
    admitExternalSource,
    scheduleExternalDigest,
    pendingExternalRows,
    observeExternalRead,
  };
}
