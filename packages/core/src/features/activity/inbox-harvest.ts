import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { ChannelRecord, SessionFailureProgress } from '../../channels/channel.js';
import type { createChannelAdmission } from '../../channels/runtime-admission.js';
import type { ChannelStore } from '../../channels/store.js';
import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import { sourceSenderAllowed } from '../../messaging/sender-access.js';
import type { PromptLimits } from '../../prompts/prompt-limits.js';
import type { PromptText } from '../../prompts/prompt-parts.js';
import type {
  BotHoldCause,
  BotRuntimeOptions,
  GroupPromptBudget,
  InboxReportRow,
} from '../../runtime/bot-runtime.js';
import type { createGroupDigest, DigestRow, GroupContext } from '../../runtime/group-digest.js';
import { type InboxUnit, renderInbox } from '../../runtime/inbox-render.js';
import type { createOrchestratorScheduling } from '../../runtime/orchestrator-scheduling.js';
import type { TobCliTurn } from '../../tob/cli-request.js';
import type { createAssignmentEvents } from '../assignments/events.js';
import type { createMessagingEvents } from '../messaging/events.js';
import { scheduleInboxFacts } from '../schedules/events.js';
import type { DatabaseSync } from 'node:sqlite';

function onlyPairedLifecycle(unit: InboxUnit): boolean {
  return (
    unit.sourceKind === 'assignment-lifecycle' &&
    (unit.lifecycleNotices ?? []).length > 0 &&
    (unit.lifecycleNotices ?? []).every((notice) => notice.reportSourceEventId !== undefined)
  );
}

function keptLifecycleNotice(
  row: InboxReportRow,
): NonNullable<InboxUnit['lifecycleNotices']>[number] | undefined {
  if (row.source_kind !== 'assignment-lifecycle') return undefined;
  if (row.paired_report_id != null)
    return {
      sourceEventId: row.source_event_id,
      reportSourceEventId: row.paired_report_id,
      summary: row.body,
    };
  if (row.lifecycle_cause?.startsWith('direct-') === true)
    return { sourceEventId: row.source_event_id, summary: row.body };
  return undefined;
}

export function coalesceInbox(rows: InboxReportRow[]): InboxUnit[] {
  const units = new Map<string, InboxUnit>();
  for (const row of rows) {
    const key = row.assignment_session_id ?? row.source_event_id;
    const existing = units.get(key);
    const kept = keptLifecycleNotice(row);
    if (kept !== undefined && existing !== undefined) {
      (existing.lifecycleNotices ??= []).push(kept);
      existing.repeats += 1;
      continue;
    }
    if (existing === undefined) {
      units.set(key, {
        sourceEventId: row.source_event_id,
        sourceKind: row.source_kind,
        ...(row.external === undefined ? {} : { external: row.external }),
        ...scheduleInboxFacts(row.schedule_json),
        assignmentSessionId: row.assignment_session_id,
        summary: row.body,
        createdAt: row.created_at,
        openAskId: row.open_ask_id ?? null,
        openAskSummary: row.open_ask_summary ?? null,
        continuityKey: row.continuity_key,
        activity: row.activity,
        repeats: 1,
        ...(kept === undefined ? {} : { lifecycleNotices: [kept] }),
      });
      continue;
    }
    existing.sourceEventId = row.source_event_id;
    existing.sourceKind = row.source_kind;
    existing.summary = row.body;
    existing.createdAt = row.created_at;
    existing.openAskId = row.open_ask_id ?? null;
    existing.openAskSummary = row.open_ask_summary ?? null;
    existing.activity = row.activity;
    existing.repeats += 1;
  }
  return [...units.values()];
}

const GROUP_PROMPT_CHANNEL_LIMIT = 100;

interface InboxHarvestPorts {
  assignmentEvents: Pick<ReturnType<typeof createAssignmentEvents>, 'settleSeenPairedNotices'>;
  channelAdmission: Pick<ReturnType<typeof createChannelAdmission>, 'inboundChannelMessage'>;
  channels: ChannelStore;
  closed: () => boolean;
  database: OperationalDatabaseModulePort;
  digestFailureCount: Map<string, number>;
  digestRetryAt: Map<string, number>;
  dmChannel: (botSlug: string) => ChannelRecord | undefined;
  ensureOrchestrator: (bot: PersonaBotRecord, at: string) => { sessionId: string; resume: boolean };
  failureStreaks: Map<string, number>;
  groupDigest: Pick<ReturnType<typeof createGroupDigest>, 'digestSection' | 'groupContextSection'>;
  held: Map<string, BotHoldCause>;
  inboxFactoryRetries: Map<string, { attempts: number; timer?: NodeJS.Timeout }>;
  markAdmissionsSideEffect: (
    botSlug: string,
    sourceEventIds: string[],
    recordInTurn?: boolean,
    transaction?: DatabaseSync,
  ) => void;
  markReportsHandled: (sourceEventIds: string[], botSlug?: string, sessionId?: string) => void;
  messagingEvents: Pick<ReturnType<typeof createMessagingEvents>, 'collectExternalRows'>;
  noteAutomaticFailure: (
    botSlug: string,
    channelId: string | undefined,
    error: unknown,
  ) => Promise<void>;
  now: () => Date;
  observeAdmission: (
    sourceEventId: string,
    botSlug: string,
    channelId: string,
    messageId: string,
    claimPending?: boolean,
  ) => void;
  promptLimits: (botSlug: string) => PromptLimits;
  promptText: (botSlug: string) => PromptText;
  publishSessionFailure: (input: {
    channelId: string;
    requestMessageId?: string;
    botSlug: string;
    sessionId: string;
    role: 'orchestrator' | 'assignment';
    error: unknown;
    context?: string;
    assignmentAnswerTo?: string;
    progress?: SessionFailureProgress | undefined;
    autoContinue?: { attempt: number; maxAttempts: number; at: string };
  }) => Promise<void>;
  registry: PersonaBotRegistry;
  retireWithdrawnNetworkAdmissions: (botSlug: string, withdrawnHost?: string) => Promise<void>;
  rowQuotes: (channelId: string, messageId: string) => string;
  runOnLiveOrchestrator: (
    bot: PersonaBotRecord,
    orchestrator: { sessionId: string; resume: boolean },
    run: (orchestrator: { sessionId: string; resume: boolean }) => Promise<void>,
  ) => Promise<{ sessionId: string; resume: boolean }>;
  runOrchestratorTurn: (
    bot: PersonaBotRecord,
    orchestrator: { sessionId: string; resume: boolean },
    sourceEventId: string | undefined,
    channelId: string | undefined,
    body: string,
    inboxUnits: InboxUnit[],
    coordinateBranchSwitch?: boolean,
    markAttemptSideEffect?: (database?: DatabaseSync) => void,
    reportEventIds?: readonly string[],
    wakeEventIds?: readonly string[],
    acceptNativeInput?: () => boolean,
    nativeSourceIds?: readonly string[],
    memoryObservation?: 'source-event' | 'recovered-question',
    tobCliTurn?: TobCliTurn,
  ) => Promise<void>;
  scheduling: Pick<
    ReturnType<typeof createOrchestratorScheduling>,
    'retryInboxAfterAgentFactoryStarts'
  >;
  setObserved: (sourceEventIds: string[], at: string | null, botSlug?: string) => void;
  warn: BotRuntimeOptions['warn'];
}

export function createInboxHarvest(ports: InboxHarvestPorts) {
  async function runHarvestTurn(botSlug: string): Promise<void> {
    if (ports.closed() || ports.held.has(botSlug)) return;
    await ports.retireWithdrawnNetworkAdmissions(botSlug);
    if (ports.closed()) return;
    const bot = ports.registry.get(botSlug);
    if (bot === undefined || bot.paused === true) return;
    const collected = collectInbox(botSlug);
    const externalContextChannels = [
      ...new Set(
        collected.units.flatMap((unit) =>
          unit.external?.receptionPaths
            ? unit.external.receptionPaths.flatMap((path) =>
                path.channelId ? [path.channelId] : [],
              )
            : unit.external?.localChannelId
              ? [unit.external.localChannelId]
              : [],
        ),
      ),
    ];
    const claimed = claimHarvest(
      botSlug,
      externalContextChannels,
      renderInbox(collected.units, ports.promptText(botSlug)).length,
    );
    if (
      claimed.items.length === 0 &&
      claimed.digests.length === 0 &&
      (collected.eventIds.length === 0 ||
        (claimed.contexts.length === 0 && collected.units.every(onlyPairedLifecycle)))
    ) {
      ports.assignmentEvents.settleSeenPairedNotices(botSlug, collected.eventIds);
      return;
    }
    const externalChannelId = collected.units.find((unit) => unit.external?.localChannelId)
      ?.external?.localChannelId;
    const primaryChannelId =
      claimed.items[0]?.channelId ??
      claimed.digests[0]?.channelId ??
      externalChannelId ??
      ports.dmChannel(botSlug)?.id;
    const externalOnly =
      claimed.items.length === 0 &&
      claimed.digests.length === 0 &&
      collected.units.every((unit) => unit.sourceKind === 'bridge-message');
    const hasExternalSource = collected.units.some((unit) => unit.sourceKind === 'bridge-message');
    if (primaryChannelId === undefined && !hasExternalSource) return;
    const digestIds = claimed.digests.flatMap((digest) =>
      digest.rows.map((row) => row.source_event_id),
    );
    const contextIds = claimed.contexts.flatMap((context) =>
      context.rows.map((row) => row.source_event_id),
    );
    const includedIds = [
      ...claimed.items.map((item) => item.sourceEventId),
      ...digestIds,
      ...contextIds,
    ];
    const sourceEventId = claimed.items[0]?.sourceEventId ?? digestIds[0] ?? collected.eventIds[0];
    if (sourceEventId === undefined) return;
    const timestamp = ports.now().toISOString();
    for (const item of claimed.items)
      ports.observeAdmission(item.sourceEventId, botSlug, item.channelId, item.messageId);
    if (digestIds.length + contextIds.length > 0)
      ports.database.transaction(
        (database) => {
          for (const id of [...digestIds, ...contextIds])
            database
              .prepare(
                `
        UPDATE inbox_admissions SET observed_at = ?
         WHERE source_event_id = ? AND bot_slug = ? AND attempt_state = 'running'
      `,
              )
              .run(timestamp, id, botSlug);
        },
        ['bot-inbox'],
      );
    ports.setObserved(collected.eventIds, timestamp, botSlug);
    let orchestrator: { sessionId: string; resume: boolean } | undefined;
    try {
      const started = ports.ensureOrchestrator(bot, timestamp);
      orchestrator = started;
      const sections = [
        ...claimed.items.map((item) =>
          ports.channelAdmission.inboundChannelMessage(
            botSlug,
            item.channelId,
            item.messageId,
            item.body,
            item.sourceEventId,
          ),
        ),
        ...claimed.digests.map((digest) =>
          ports.groupDigest.digestSection(
            botSlug,
            digest.channelId,
            digest.rows,
            digest.omittedCount,
          ),
        ),
        ...claimed.contexts.map((context) => ports.groupDigest.groupContextSection(context)),
      ];
      const attentionCount = sections.length + (collected.eventIds.length > 0 ? 1 : 0);
      const preamble =
        attentionCount > 1
          ? `[Bot Inbox harvest] ${attentionCount} attention items are ready. Handle them together where useful and in parallel where independent; long-running work belongs in Assignment Sessions.`
          : undefined;
      const ran = await ports.runOnLiveOrchestrator(bot, started, (session) => {
        orchestrator = session;
        return ports.runOrchestratorTurn(
          bot,
          session,
          sourceEventId,
          externalOnly && externalChannelId === undefined ? undefined : primaryChannelId,
          [preamble, ...sections].filter((part): part is string => part !== undefined).join('\n\n'),
          collected.units,
          collected.eventIds.length > 0,
          (database) => ports.markAdmissionsSideEffect(botSlug, includedIds, true, database),
          collected.eventIds,
          [...new Set([...includedIds, ...collected.eventIds])],
        );
      });
      ports.markReportsHandled(collected.eventIds, botSlug, ran.sessionId);
      settleHarvestHandled(botSlug, includedIds);
      ports.failureStreaks.delete(botSlug);
      for (const digest of claimed.digests) {
        ports.digestRetryAt.delete(`${botSlug}:${digest.channelId}`);
        ports.digestFailureCount.delete(`${botSlug}:${digest.channelId}`);
      }
      const retry = ports.inboxFactoryRetries.get(botSlug);
      if (retry !== undefined) {
        if (retry.timer !== undefined) clearTimeout(retry.timer);
        ports.inboxFactoryRetries.delete(botSlug);
        ports.warn?.(
          JSON.stringify({
            component: 'bot-runtime',
            event: 'inbox-factory-recovered',
            botSlug,
            attempts: retry.attempts,
          }),
        );
      }
    } catch (error) {
      ports.setObserved(collected.eventIds, null, botSlug);
      ports.database.transaction(
        (db) => {
          for (const id of collected.eventIds)
            db.prepare(
              'UPDATE inbox_admissions SET last_error = ? WHERE source_event_id = ? AND bot_slug = ?',
            ).run(String(error).slice(0, 500), id, botSlug);
        },
        ['bot-inbox'],
      );
      settleHarvestFailure(botSlug, includedIds, String(error));
      for (const digest of claimed.digests) {
        const key = `${botSlug}:${digest.channelId}`;
        const failures = Math.min(6, (ports.digestFailureCount.get(key) ?? 0) + 1);
        ports.digestFailureCount.set(key, failures);
        ports.digestRetryAt.set(
          key,
          ports.now().getTime() + Math.min(300_000, 10_000 * 2 ** (failures - 1)),
        );
      }
      if (
        collected.eventIds.length > 0 &&
        ports.scheduling.retryInboxAfterAgentFactoryStarts(botSlug, collected.eventIds, error)
      )
        return;
      const retry = ports.inboxFactoryRetries.get(botSlug);
      if (retry !== undefined) {
        if (retry.timer !== undefined) clearTimeout(retry.timer);
        ports.inboxFactoryRetries.delete(botSlug);
      }
      if (orchestrator !== undefined && primaryChannelId !== undefined) {
        try {
          await ports.publishSessionFailure({
            channelId: primaryChannelId,
            botSlug,
            sessionId: orchestrator.sessionId,
            role: 'orchestrator',
            error,
          });
        } catch (reportError) {
          ports.warn?.(
            JSON.stringify({
              component: 'bot-runtime',
              event: 'session-failure-report-failed',
              botSlug,
              error: String(reportError),
            }),
          );
        }
      }
      await ports.noteAutomaticFailure(botSlug, primaryChannelId, error);
      throw error;
    } finally {
      for (const item of claimed.items)
        ports.channels.admissionChanged?.(item.channelId, item.messageId);
      for (const digest of claimed.digests)
        for (const row of digest.rows)
          ports.channels.admissionChanged?.(digest.channelId, row.message_id);
      for (const context of claimed.contexts)
        for (const row of context.rows)
          ports.channels.admissionChanged?.(context.channelId, row.message_id);
    }
  }

  function claimHarvest(
    botSlug: string,
    externalContextChannels: string[] = [],
    externalCharacters = 0,
  ): {
    items: Array<{
      sourceEventId: string;
      channelId: string;
      messageId: string;
      body: string;
    }>;
    digests: Array<{
      channelId: string;
      rows: DigestRow[];
      omittedCount: number;
    }>;
    contexts: GroupContext[];
  } {
    return ports.database.transaction(
      (database) => {
        const itemRows = database
          .prepare(
            `
        SELECT a.source_event_id, e.channel_id, e.message_id, e.body
          FROM inbox_admissions a
          JOIN source_events e ON e.source_event_id = a.source_event_id
         WHERE a.bot_slug = ? AND a.attempt_state IN ('pending', 'retryable')
           AND a.reason IN ('group-mention', 'bot-dm', 'group-invite', 'group-join-request', 'group-join-decision')
           AND e.channel_id IS NOT NULL AND e.message_id IS NOT NULL AND e.source_kind != 'bridge-message'
         ORDER BY CASE a.reason
                    WHEN 'group-mention' THEN 0
                    WHEN 'bot-dm' THEN 1
                    WHEN 'group-invite' THEN 2
                    WHEN 'group-join-request' THEN 3
                    ELSE 4
                  END,
                  e.created_at, e.rowid
         LIMIT 20
      `,
          )
          .all(botSlug) as unknown as Array<{
          source_event_id: string;
          channel_id: string;
          message_id: string;
          body: string;
        }>;
        for (const row of itemRows)
          database
            .prepare(
              `
          UPDATE inbox_admissions SET attempt_state = 'running', observed_at = NULL, last_error = NULL
           WHERE source_event_id = ? AND bot_slug = ? AND attempt_state IN ('pending', 'retryable')
        `,
            )
            .run(row.source_event_id, botSlug);
        const budget: GroupPromptBudget = {
          remainingCharacters: Math.max(
            0,
            ports.promptLimits(botSlug)['group-context-chars'] -
              externalCharacters -
              itemRows.reduce(
                (size, row) =>
                  size +
                  ports.channelAdmission.inboundChannelMessage(
                    botSlug,
                    row.channel_id,
                    row.message_id,
                    row.body,
                    row.source_event_id,
                  ).length,
                200,
              ),
          ),
          includedByChannel: new Map(),
        };
        const groups = database
          .prepare(
            `
        SELECT e.channel_id AS channel_id, a.wake_policy_revision AS revision,
               a.source_policy_revision AS source_revision, a.external_default_revision AS default_revision, a.external_thread_policy_revision AS thread_revision,
               CASE WHEN a.external_thread_policy_revision IS NOT NULL THEN json_extract(e.payload_json, '$.external.event.reply.threadId') ELSE '' END AS thread_scope,
               MIN(e.created_at) AS first_at, a.wake_interval_ms AS interval_ms,
               a.wake_count AS wake_count, COUNT(*) AS count
          FROM inbox_admissions a
          JOIN source_events e ON e.source_event_id = a.source_event_id
         WHERE a.bot_slug = ? AND a.reason = 'group-ordinary' AND e.channel_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM messaging_bridge_sources rp WHERE rp.source_event_id = e.source_event_id)
           AND a.wake_count IS NOT NULL AND a.observed_at IS NULL
           AND a.attempt_state IN ('pending', 'retryable')
         GROUP BY e.channel_id, a.wake_policy_revision, a.source_policy_revision, default_revision, thread_revision, thread_scope
         ORDER BY first_at, channel_id
      `,
          )
          .all(botSlug) as unknown as Array<{
          channel_id: string;
          revision: number;
          source_revision: number | null;
          default_revision: number | null;
          thread_revision: number | null;
          thread_scope: string;
          first_at: string;
          interval_ms: number;
          wake_count: number;
          count: number;
        }>;
        const now = ports.now().getTime();
        const digests: Array<{
          channelId: string;
          rows: DigestRow[];
          omittedCount: number;
        }> = [];
        for (const group of groups) {
          if (
            group.count < group.wake_count &&
            Date.parse(group.first_at) + group.interval_ms > now
          )
            continue;
          const candidates = database
            .prepare(
              `
          SELECT a.source_event_id, a.bot_slug, e.message_id, e.body, e.created_at,
                 json_extract(e.payload_json, '$.skillInvocations') AS skill_invocations,
                 json_extract(e.payload_json, '$.mentions') AS human_mentions,
                 json_extract(e.payload_json, '$.author.kind') AS author_kind,
                 json_extract(e.payload_json, '$.author.slug') AS author_slug,
                 json_extract(e.payload_json, '$.external.event.actor.name') AS external_sender,
                 json_extract(e.payload_json, '$.external.event.actor.id') AS external_sender_id,
                 json_extract(e.payload_json, '$.external.platform') AS external_platform,
                 json_extract(e.payload_json, '$.external.event.messageId') AS external_message_id,
                 json_extract(e.payload_json, '$.external.event.mentions') AS external_mentions
            FROM inbox_admissions a
            JOIN source_events e ON e.source_event_id = a.source_event_id
           WHERE a.bot_slug = ? AND a.reason = 'group-ordinary' AND e.channel_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM messaging_bridge_sources rp WHERE rp.source_event_id = e.source_event_id)
             AND a.wake_count IS NOT NULL AND a.observed_at IS NULL
             AND a.attempt_state IN ('pending', 'retryable')
             AND e.channel_id = ? AND a.wake_policy_revision = ?
             AND a.source_policy_revision IS ? AND a.external_default_revision IS ? AND a.external_thread_policy_revision IS ?
             AND CASE WHEN a.external_thread_policy_revision IS NOT NULL THEN json_extract(e.payload_json, '$.external.event.reply.threadId') ELSE '' END = ?
           ORDER BY e.created_at, e.rowid LIMIT 100
        `,
            )
            .all(
              botSlug,
              group.channel_id,
              group.revision,
              group.source_revision,
              group.default_revision,
              group.thread_revision,
              group.thread_scope,
            ) as unknown as DigestRow[];
          const rows: DigestRow[] = [];
          const alreadyIncluded = budget.includedByChannel.get(group.channel_id) ?? 0;

          const contextReserve = itemRows.some((row) => row.channel_id === group.channel_id)
            ? 4_000
            : 0;
          for (const row of candidates) {
            if (alreadyIncluded + rows.length >= GROUP_PROMPT_CHANNEL_LIMIT) break;
            const nextLength = ports.groupDigest.digestSection(
              botSlug,
              group.channel_id,
              [...rows, row],
              group.count - rows.length - 1,
            ).length;
            if (
              (budget.includedByChannel.size > 0 || rows.length > 0) &&
              nextLength > budget.remainingCharacters - contextReserve
            )
              break;
            rows.push(row);
          }
          if (rows.length > 0) {
            budget.remainingCharacters -= ports.groupDigest.digestSection(
              botSlug,
              group.channel_id,
              rows,
              group.count - rows.length,
            ).length;
            budget.includedByChannel.set(group.channel_id, alreadyIncluded + rows.length);
          }
          for (const row of rows)
            database
              .prepare(
                `
          UPDATE inbox_admissions SET attempt_state = 'running', last_error = NULL
           WHERE source_event_id = ? AND bot_slug = ? AND attempt_state IN ('pending', 'retryable')
        `,
              )
              .run(row.source_event_id, botSlug);
          if (rows.length > 0)
            digests.push({
              channelId: group.channel_id,
              rows,
              omittedCount: group.count - rows.length,
            });
        }
        const contextChannels = new Set([
          ...externalContextChannels,
          ...itemRows.map((row) => row.channel_id),
          ...digests.map((digest) => digest.channelId),
        ]);
        const contexts = [...contextChannels]
          .map((channelId) => claimGroupContext(database, botSlug, channelId, budget))
          .filter((context): context is GroupContext => context !== undefined);
        return {
          items: itemRows.map((row) => ({
            sourceEventId: row.source_event_id,
            channelId: row.channel_id,
            messageId: row.message_id,
            body: row.body,
          })),
          digests,
          contexts,
        };
      },
      ['bot-inbox'],
    );
  }

  function claimGroupContext(
    database: DatabaseSync,
    botSlug: string,
    channelId: string,
    budget: GroupPromptBudget,
  ): GroupContext | undefined {
    const alreadyIncluded = budget.includedByChannel.get(channelId) ?? 0;
    if (alreadyIncluded >= GROUP_PROMPT_CHANNEL_LIMIT) return undefined;
    const base = `
      FROM inbox_admissions a JOIN source_events e ON e.source_event_id = a.source_event_id
     WHERE a.bot_slug = ? AND a.reason = 'group-ordinary' AND e.channel_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM messaging_bridge_sources rp WHERE rp.source_event_id = e.source_event_id)
       AND (a.wake_mode IN ('all', 'digest', 'mentions') OR (a.wake_mode = 'silent' AND a.source_policy_wake_mode = 'context'))
       AND a.attempt_state IN ('pending', 'retryable') AND e.channel_id = ?`;
    const total = database.prepare(`SELECT COUNT(*) AS count ${base}`).get(botSlug, channelId) as {
      count: number;
    };
    if (total.count === 0) return undefined;
    const columns = `SELECT a.source_event_id, a.bot_slug, e.message_id, e.body, e.created_at,
      json_extract(e.payload_json, '$.skillInvocations') AS skill_invocations,
      json_extract(e.payload_json, '$.mentions') AS human_mentions,
      json_extract(e.payload_json, '$.author.kind') AS author_kind,
      json_extract(e.payload_json, '$.author.slug') AS author_slug,
                 json_extract(e.payload_json, '$.external.event.actor.name') AS external_sender,
                 json_extract(e.payload_json, '$.external.event.actor.id') AS external_sender_id,
                 json_extract(e.payload_json, '$.external.platform') AS external_platform,
                 json_extract(e.payload_json, '$.external.event.messageId') AS external_message_id,
                 json_extract(e.payload_json, '$.external.event.mentions') AS external_mentions`;
    const candidates = database
      .prepare(`${columns} ${base} ORDER BY e.created_at, e.rowid LIMIT ?`)
      .all(botSlug, channelId, GROUP_PROMPT_CHANNEL_LIMIT) as unknown as DigestRow[];
    const bodyLimit = ports.promptLimits(botSlug)['context-message-chars'];
    const rows: DigestRow[] = [];
    for (const row of candidates) {
      if (!sourceSenderAllowed(database, botSlug, row.source_event_id, true)) continue;
      if (alreadyIncluded + rows.length >= GROUP_PROMPT_CHANNEL_LIMIT) break;
      const candidateContext = {
        channelId,
        rows: [...rows, row],
        omittedCount: total.count - rows.length - 1,
        bodyLimit,
      };
      if (
        (budget.includedByChannel.size > 0 || rows.length > 0) &&
        ports.groupDigest.groupContextSection(candidateContext).length > budget.remainingCharacters
      )
        break;
      rows.push(row);
    }
    if (rows.length === 0) return undefined;
    const context = {
      channelId,
      rows,
      omittedCount: total.count - rows.length,
      bodyLimit,
    };
    budget.remainingCharacters -= ports.groupDigest.groupContextSection(context).length;
    budget.includedByChannel.set(channelId, alreadyIncluded + rows.length);
    for (const row of rows)
      database
        .prepare(
          `UPDATE inbox_admissions SET attempt_state = 'running', last_error = NULL
        WHERE source_event_id = ? AND bot_slug = ? AND attempt_state IN ('pending', 'retryable')`,
        )
        .run(row.source_event_id, botSlug);
    return context;
  }

  function claimDmContext(
    database: DatabaseSync,
    botSlug: string,
    channelId: string,
    reason: 'human-dm' | 'bot-dm',
    excludeSourceEventId: string,
  ): GroupContext | undefined {
    const base = `
      FROM inbox_admissions a JOIN source_events e ON e.source_event_id = a.source_event_id
     WHERE a.bot_slug = ? AND a.reason = ? AND a.attempt_state IN ('pending', 'retryable')
       AND e.channel_id = ? AND a.source_event_id != ?`;
    const total = database
      .prepare(`SELECT COUNT(*) AS count ${base}`)
      .get(botSlug, reason, channelId, excludeSourceEventId) as {
      count: number;
    };
    if (total.count === 0) return undefined;
    const columns = `SELECT a.source_event_id, a.bot_slug, e.message_id,
      CASE WHEN json_type(e.payload_json, '$.genuiReplyContext') = 'text'
        THEN e.body || char(10) || char(10) || json_extract(e.payload_json, '$.genuiReplyContext')
        ELSE e.body END AS body, e.created_at,
      json_extract(e.payload_json, '$.author.kind') AS author_kind,
      json_extract(e.payload_json, '$.author.slug') AS author_slug,
                 json_extract(e.payload_json, '$.external.event.actor.name') AS external_sender,
                 json_extract(e.payload_json, '$.external.event.actor.id') AS external_sender_id,
                 json_extract(e.payload_json, '$.external.platform') AS external_platform,
                 json_extract(e.payload_json, '$.external.event.messageId') AS external_message_id,
                 json_extract(e.payload_json, '$.external.event.mentions') AS external_mentions,
      json_extract(e.payload_json, '$.assignmentReply.sessionId') AS reply_session_id,
      json_extract(e.payload_json, '$.assignmentReply.sourceEventId') AS reply_source_event_id`;
    const candidates = database
      .prepare(`${columns} ${base} ORDER BY e.created_at, e.rowid LIMIT ?`)
      .all(
        botSlug,
        reason,
        channelId,
        excludeSourceEventId,
        GROUP_PROMPT_CHANNEL_LIMIT,
      ) as unknown as DigestRow[];
    const limits = ports.promptLimits(botSlug);
    const bodyLimit = limits['context-message-chars'];
    const rows: DigestRow[] = [];
    let characters = 0;
    for (const row of candidates) {
      const cost =
        Math.min(row.body.length, bodyLimit) +
        80 +
        ports.rowQuotes(channelId, row.message_id).length;
      if (
        rows.length >= GROUP_PROMPT_CHANNEL_LIMIT ||
        characters + cost > limits['dm-context-chars']
      )
        break;
      rows.push(row);
      characters += cost;
    }
    if (rows.length === 0) return undefined;
    const context = {
      channelId,
      rows,
      omittedCount: total.count - rows.length,
      bodyLimit,
    };
    for (const row of rows)
      database
        .prepare(
          `
          UPDATE inbox_admissions SET attempt_state = 'running', last_error = NULL
           WHERE source_event_id = ? AND bot_slug = ? AND attempt_state IN ('pending', 'retryable')
        `,
        )
        .run(row.source_event_id, botSlug);
    return context;
  }

  function settleHarvestHandled(botSlug: string, sourceEventIds: string[]): void {
    if (sourceEventIds.length === 0) return;
    ports.database.transaction(
      (database) => {
        for (const id of sourceEventIds)
          database
            .prepare(
              `
          UPDATE inbox_admissions
             SET attempt_state = 'handled', handled_at = ?, opened_at = COALESCE(opened_at, ?)
           WHERE source_event_id = ? AND bot_slug = ? AND attempt_state = 'running'
        `,
            )
            .run(ports.now().toISOString(), ports.now().toISOString(), id, botSlug);
      },
      ['bot-inbox'],
    );
  }

  function settleHarvestFailure(botSlug: string, sourceEventIds: string[], error: string): void {
    if (sourceEventIds.length === 0) return;
    ports.database.transaction(
      (database) => {
        for (const id of sourceEventIds)
          database
            .prepare(
              `
          UPDATE inbox_admissions
             SET attempt_state = CASE WHEN side_effect_started_at IS NULL THEN 'retryable' ELSE 'needs-repair' END,
                 observed_at = CASE
                   WHEN reason = 'group-ordinary' AND side_effect_started_at IS NULL THEN NULL
                   ELSE observed_at END,
                 last_error = ?
           WHERE source_event_id = ? AND bot_slug = ? AND attempt_state = 'running'
        `,
            )
            .run(error.slice(0, 500), id, botSlug);
      },
      ['bot-inbox'],
    );
  }

  function collectInbox(botSlug: string): { units: InboxUnit[]; eventIds: string[] } {
    const rows = ports.database.read(
      (database) =>
        database
          .prepare(
            `SELECT e.source_event_id, e.source_kind, e.assignment_session_id,
                    e.body, e.created_at, e.expects_reply, a.continuity_key,
                    CASE WHEN e.source_kind = 'schedule' THEN e.payload_json END AS schedule_json,
                    json_extract(e.payload_json, '$.assignmentLifecycle.reportSourceEventId') AS paired_report_id,
                    json_extract(e.payload_json, '$.assignmentLifecycle.cause') AS lifecycle_cause,
                    CASE WHEN a.stop_state = 'running' THEN a.open_ask_source_event_id END AS open_ask_id,
                    (SELECT body FROM source_events WHERE source_event_id = a.open_ask_source_event_id) AS open_ask_summary,
                    CASE WHEN a.stop_state = 'stopped' THEN 'stopped'
                         WHEN a.stop_state = 'requested' THEN 'stopping'
                         ELSE a.activity END AS activity
               FROM source_events e
               LEFT JOIN assignments a ON a.session_id = e.assignment_session_id
              WHERE e.bot_slug = ?
                AND e.source_kind IN ('assignment-report', 'assignment-lifecycle', 'schedule')
                AND e.observed_at IS NULL
              ORDER BY e.rowid DESC
              LIMIT 20`,
          )
          .all(botSlug) as unknown as InboxReportRow[],
    );

    rows.reverse();
    ports.messagingEvents.collectExternalRows(botSlug, rows);
    const units = coalesceInbox(rows);
    return {
      units,
      eventIds: rows.map((row) => row.source_event_id),
    };
  }

  return {
    runHarvestTurn,
    claimGroupContext,
    claimDmContext,
    settleHarvestHandled,
    settleHarvestFailure,
    collectInbox,
  };
}
