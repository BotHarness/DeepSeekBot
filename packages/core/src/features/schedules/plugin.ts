import type { Context } from '@deepseek-ai/cordis';

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
  onAdmitted,
  warn,
}: {
  operationalDatabase: OperationalDatabaseOwner;
  registry: Pick<PersonaBotRegistry, 'get'>;
  onAdmitted: BotScheduleStoreOptions['onAdmitted'];
  warn: BotScheduleStoreOptions['warn'];
}): BotScheduleStore {
  return createBotScheduleStore({
    database: attachOperationalModule(operationalDatabase, 'bot-schedules'),
    isBotActive: (slug) => {
      const bot = registry.get(slug);
      return operationalDatabase.mode === 'ready' && bot !== undefined && bot.paused !== true;
    },
    onAdmitted,
    ...(warn === undefined ? {} : { warn }),
  });
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
