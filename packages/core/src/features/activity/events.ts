import type { InboxUnit } from '../../runtime/inbox-render.js';
import { channelSql, OPEN_ADMISSION_SQL, SNOOZED_SQL } from '../../runtime/attention.js';
import type { InboxTriage } from '../../runtime/inbox-triage.js';
import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { ChannelRecord } from '../../channels/channel.js';
import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import type { PromptText } from '../../prompts/prompt-parts.js';
import type { BotHoldCause } from '../../runtime/bot-runtime.js';

export function createActivityEvents({
  snoozeTimers,
  registry,
  closed,
  database,
  now,
  held,
  enqueue,
  triageContinuation,
  triageQueued,
  inboxTriage,
  triageBaseline,
  triageStalled,
  dmChannel,
  promptText,
  triageRunning,
  ensureOrchestrator,
  runOrchestratorTurn,
  failureStreaks,
  noteAutomaticFailure,
  warn,
}: {
  snoozeTimers: Map<string, NodeJS.Timeout>;
  registry: PersonaBotRegistry;
  closed: () => boolean;
  database: OperationalDatabaseModulePort;
  now: () => Date;
  held: Map<string, BotHoldCause>;
  enqueue: (turnKey: string, task: () => Promise<void>) => Promise<void>;
  triageContinuation: boolean;
  triageQueued: Set<string>;
  inboxTriage: InboxTriage;
  triageBaseline: Map<string, number>;
  triageStalled: Map<string, Set<string>>;
  dmChannel: (botSlug: string) => ChannelRecord | undefined;
  promptText: (botSlug: string) => PromptText;
  triageRunning: Map<string, number>;
  ensureOrchestrator: (bot: PersonaBotRecord, at: string) => { sessionId: string; resume: boolean };
  runOrchestratorTurn: (
    bot: PersonaBotRecord,
    orchestrator: { sessionId: string; resume: boolean },
    sourceEventId: string,
    channelId: string | undefined,
    body: string,
    inboxUnits: InboxUnit[],
    coordinateBranchSwitch: boolean,
    markAttemptSideEffect: () => void,
    reportEventIds: readonly string[],
    wakeEventIds: readonly string[],
  ) => Promise<void>;
  failureStreaks: Map<string, number>;
  noteAutomaticFailure: (
    botSlug: string,
    channelId: string | undefined,
    error: unknown,
  ) => Promise<void>;
  warn: ((message: string) => void) | undefined;
}) {
  function armSnooze(botSlug: string): void {
    const prior = snoozeTimers.get(botSlug);
    if (prior !== undefined) clearTimeout(prior);
    snoozeTimers.delete(botSlug);
    const bot = registry.get(botSlug);
    if (closed() || bot === undefined) return;
    const next = database.read((database) =>
      database
        .prepare(
          `
          SELECT MIN(snoozed_until) AS next FROM inbox_admissions
           WHERE bot_slug = ? AND snoozed_until IS NOT NULL AND resolved_at IS NULL
        `,
        )
        .get(botSlug),
    ) as { next: string | null } | undefined;
    if (next?.next == null) return;
    const delay = Math.min(
      2_147_483_647,
      Math.max(bot.paused === true ? 60_000 : 1, Date.parse(next.next) - now().getTime()),
    );
    const timer = setTimeout(() => {
      snoozeTimers.delete(botSlug);
      if (closed() || held.has(botSlug)) return;
      void enqueue(botSlug, () => runSnoozeReturnTurn(botSlug))
        .finally(() => armSnooze(botSlug))
        .catch(() => undefined);
    }, delay);
    timer.unref();
    snoozeTimers.set(botSlug, timer);
  }

  function queueTriage(botSlug: string): void {
    if (!triageContinuation || closed() || held.has(botSlug) || triageQueued.has(botSlug)) return;
    triageQueued.add(botSlug);
    void enqueue(botSlug, () => runTriageTurn(botSlug)).catch(() => undefined);
  }

  async function runTriageTurn(botSlug: string): Promise<void> {
    triageQueued.delete(botSlug);
    const bot = registry.get(botSlug);
    if (closed() || bot === undefined || bot.paused === true || held.has(botSlug)) return;
    const ids = withoutWorkingAssignment(inboxTriage.openIds(botSlug));
    const baseline = triageBaseline.get(botSlug);
    triageBaseline.delete(botSlug);
    if (ids.length === 0) {
      triageStalled.delete(botSlug);
      return;
    }
    if (baseline !== undefined && ids.length >= baseline) {
      triageStalled.set(botSlug, new Set(ids));
      return;
    }
    const stalled = triageStalled.get(botSlug);
    if (stalled !== undefined && ids.every((id) => stalled.has(id))) return;
    triageStalled.delete(botSlug);
    const anchor = ids[0]!;
    const channel = database.read((database) =>
      database
        .prepare(
          `SELECT ${channelSql('e')} AS channel_id FROM source_events e WHERE e.source_event_id = ?`,
        )
        .get(anchor),
    ) as { channel_id: string | null } | undefined;
    const channelId = channel?.channel_id ?? dmChannel(botSlug)?.id;
    const body = `[Triage] ${ids.length} item${ids.length === 1 ? ' is' : 's are'} still open after your last turn. ${promptText(botSlug)('triage')}`;
    triageBaseline.set(botSlug, ids.length);
    triageRunning.set(botSlug, ids.length);
    try {
      const orchestrator = ensureOrchestrator(bot, now().toISOString());
      await runOrchestratorTurn(
        bot,
        orchestrator,
        anchor,
        channelId,
        body,
        [],
        false,
        () => undefined,
        [],
        [],
      );
      failureStreaks.delete(botSlug);
    } catch (error) {
      triageBaseline.delete(botSlug);
      await noteAutomaticFailure(botSlug, channelId, error);
      warn?.(
        JSON.stringify({
          component: 'bot-runtime',
          event: 'triage-turn-failed',
          botSlug,
          error: String(error).slice(0, 500),
        }),
      );
    } finally {
      triageRunning.delete(botSlug);
    }
  }

  function withoutWorkingAssignment(ids: string[]): string[] {
    if (ids.length === 0) return ids;
    const delegated = new Set(
      database
        .read(
          (database) =>
            database
              .prepare(
                `SELECT DISTINCT ra.request_source_event_id AS id FROM request_assignments ra
                 JOIN assignments s ON s.session_id = ra.session_id
                WHERE ra.request_source_event_id IN (${ids.map(() => '?').join(', ')})
                  AND s.activity = 'working' AND s.stop_state = 'running' AND s.archived_at IS NULL`,
              )
              .all(...ids) as unknown as Array<{ id: string }>,
        )
        .map((row) => row.id),
    );
    return ids.filter((id) => !delegated.has(id));
  }

  async function runSnoozeReturnTurn(botSlug: string): Promise<void> {
    if (closed() || held.has(botSlug)) return;
    const bot = registry.get(botSlug);
    if (bot === undefined || bot.paused === true) return;
    const timestamp = now().toISOString();
    const due = database.transaction(
      (database) => {
        const rows = database
          .prepare(
            `
            SELECT a.source_event_id, a.snoozed_until, a.snooze_note, e.body,
                   ${channelSql('e')} AS channel_id,
                   CASE WHEN ${OPEN_ADMISSION_SQL} AND ${SNOOZED_SQL} THEN 1 ELSE 0 END AS hidden
              FROM inbox_admissions a
              JOIN source_events e ON e.source_event_id = a.source_event_id
             WHERE a.bot_slug = ? AND a.snoozed_until IS NOT NULL AND a.snoozed_until <= ?
               AND a.resolved_at IS NULL
             ORDER BY a.snoozed_until, e.created_at
          `,
          )
          .all(botSlug, timestamp) as unknown as Array<{
          source_event_id: string;
          snoozed_until: string;
          snooze_note: string | null;
          body: string;
          channel_id: string | null;
          hidden: number;
        }>;
        for (const row of rows)
          database
            .prepare(
              'UPDATE inbox_admissions SET snoozed_until = NULL WHERE source_event_id = ? AND bot_slug = ?',
            )
            .run(row.source_event_id, botSlug);
        return rows.filter((row) => row.hidden === 1);
      },
      ['bot-inbox'],
    );
    const anchor = due[0];
    if (anchor === undefined) return;
    const channelId = anchor.channel_id ?? dmChannel(botSlug)?.id;
    const body = [
      `[Snooze returned] ${due.length} item${due.length === 1 ? '' : 's'} you snoozed ${due.length === 1 ? 'is' : 'are'} back. Decide what each needs now, then resolve it, act on it, or snooze it again.`,
      ...due.map(
        (row) =>
          `- [Source Event ${row.source_event_id}] snoozed until ${row.snoozed_until}${row.snooze_note === null ? '' : `, note: ${JSON.stringify(row.snooze_note)}`}: ${JSON.stringify(row.body.replace(/\s+/g, ' ').slice(0, 300))}`,
      ),
    ].join('\n');
    try {
      const orchestrator = ensureOrchestrator(bot, timestamp);
      await runOrchestratorTurn(
        bot,
        orchestrator,
        anchor.source_event_id,
        channelId,
        body,
        [],
        false,
        () => undefined,
        [],
        [],
      );
      failureStreaks.delete(botSlug);
    } catch (error) {
      await noteAutomaticFailure(botSlug, channelId, error);
      const retryAt = new Date(now().getTime() + 300_000).toISOString();
      database.transaction(
        (database) => {
          for (const row of due)
            database
              .prepare(
                `
                UPDATE inbox_admissions SET snoozed_until = ?
                 WHERE source_event_id = ? AND bot_slug = ? AND resolved_at IS NULL
                   AND snoozed_until IS NULL
              `,
              )
              .run(retryAt, row.source_event_id, botSlug);
        },
        ['bot-inbox'],
      );
      warn?.(
        JSON.stringify({
          component: 'bot-runtime',
          event: 'snooze-return-failed',
          botSlug,
          error: String(error).slice(0, 500),
        }),
      );
    }
  }
  return { armSnooze, queueTriage };
}
