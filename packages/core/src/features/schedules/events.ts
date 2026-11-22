import type { DatabaseSync } from 'node:sqlite';
import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import type { ScheduleFiringFacts } from '../../runtime/inbox-render.js';
import type {
  BotScheduleChange,
  BotScheduleInput,
  BotScheduleStore,
} from '../../schedules/bot-schedules.js';

export function hasPendingScheduleFiring(
  database: OperationalDatabaseModulePort,
  botSlug: string,
): boolean {
  const scheduled = database.read((db) =>
    db
      .prepare(
        `
        SELECT 1 AS found FROM inbox_admissions a JOIN source_events e USING(source_event_id)
         WHERE a.bot_slug = ? AND a.reason = 'schedule' AND a.attempt_state = 'pending'
           AND e.observed_at IS NULL
         LIMIT 1
      `,
      )
      .get(botSlug),
  );

  return scheduled !== undefined;
}

export function scheduleInboxFacts(scheduleJson: string | null | undefined) {
  return scheduleJson == null
    ? {}
    : {
        schedule: (
          JSON.parse(scheduleJson) as {
            schedule: ScheduleFiringFacts;
          }
        ).schedule,
      };
}

export function linkScheduleFiringsToSession(
  database: DatabaseSync,
  sourceEventIds: string[],
  placeholders: string,
  sessionId: string,
): void {
  database
    .prepare(
      `
      UPDATE bot_schedule_firings SET session_id = ?
       WHERE session_id IS NULL AND source_event_id IN (${placeholders})
    `,
    )
    .run(sessionId, ...sourceEventIds);
}

export function bindScheduleCommands(
  store: Pick<BotScheduleStore, 'list' | 'create' | 'update' | 'remove'>,
  bot: Pick<PersonaBotRecord, 'slug'>,
  markSideEffect: () => void,
) {
  return {
    list: () => store.list(bot.slug),
    create: (input: BotScheduleInput) => {
      markSideEffect();
      return store.create(bot.slug, input, 'personabot');
    },
    update: (id: string, change: BotScheduleChange) => {
      markSideEffect();
      return store.update(bot.slug, id, change, 'personabot');
    },
    remove: (id: string) => {
      markSideEffect();
      return store.remove(bot.slug, id, 'personabot');
    },
  };
}
