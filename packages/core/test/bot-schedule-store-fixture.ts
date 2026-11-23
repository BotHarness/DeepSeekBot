import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createBotScheduleStore, type BotScheduleStore } from '../src/schedules/bot-schedules.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

export function storeAt(
  start: string,
  options: { active?: (slug: string) => boolean } = {},
): {
  store: BotScheduleStore;
  owner: OperationalDatabaseOwner;
  clock: { now: Date };
  admitted: string[];
} {
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('bh-schedules-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const clock = { now: new Date(start) };
  const admitted: string[] = [];
  let next = 0;
  const store = createBotScheduleStore({
    database: attachOperationalModule(owner, 'bot-schedules'),
    isBotActive: options.active ?? (() => true),
    onAdmitted: (_slug, sourceEventId) => admitted.push(sourceEventId),
    now: () => clock.now,
    createId: () => `id-${++next}`,
  });
  return { store, owner, clock, admitted };
}
