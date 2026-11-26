import type { Context } from '@deepseek-ai/cordis';
import type { InboxWakeSource } from '../../kernel/runtime-host.js';
import { hasPendingScheduleFiring } from './events.js';

import type { PersonaBotRegistry } from '../../bots/registry.js';
import { attachOperationalModule, type OperationalDatabaseOwner } from '../../database/owner.js';
import {
  createBotScheduleStore,
  type BotScheduleStore,
  type BotScheduleStoreOptions,
} from '../../schedules/bot-schedules.js';

export function apply({
  operationalDatabase,
  registry,
  warn,
}: {
  operationalDatabase: OperationalDatabaseOwner;
  registry: Pick<PersonaBotRegistry, 'get'>;
  warn: BotScheduleStoreOptions['warn'];
}): { schedules: BotScheduleStore; wakeSource: InboxWakeSource } {
  const database = attachOperationalModule(operationalDatabase, 'bot-schedules');
  const listeners = new Set<(botSlug: string) => void>();
  const schedules = createBotScheduleStore({
    database,
    isBotActive: (slug) => {
      const bot = registry.get(slug);
      return operationalDatabase.mode === 'ready' && bot !== undefined && bot.paused !== true;
    },
    onAdmitted: (slug) => {
      for (const wake of listeners) wake(slug);
    },
    ...(warn === undefined ? {} : { warn }),
  });
  return {
    schedules,
    wakeSource: createWakeSource(database, (wake) => {
      listeners.add(wake);
      return () => {
        listeners.delete(wake);
      };
    }),
  };
}

export function createWakeSource(
  database: Parameters<typeof hasPendingScheduleFiring>[0],
  subscribe: InboxWakeSource['subscribe'] = () => () => {},
): InboxWakeSource {
  return { hasPending: (slug) => hasPendingScheduleFiring(database, slug), subscribe };
}

export function start(
  schedules: BotScheduleStore,
  database: Pick<OperationalDatabaseOwner, 'mode'>,
) {
  if (database.mode === 'ready') schedules.start();
}

export function mountCleanup(ctx: Context, owner: { schedules: BotScheduleStore }): void {
  ctx.effect(() => () => owner.schedules.close(), 'botharness: bot schedules');
}
