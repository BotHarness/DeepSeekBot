import fc from 'fast-check';
import { expect, it } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createBotScheduleStore } from '../src/schedules/bot-schedules.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const owner = trackTestOwner(
  mountOperationalDatabase({
    dshHome: createTempRoot('bh-schedule-key-property-'),
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
  }),
);
let run = 0;

it('any sequence of same-key creates leaves exactly one schedule with one revision', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          pad: fc.constantFrom('', ' ', '\t', '  \n'),
          restart: fc.boolean(),
          advanceMinutes: fc.integer({ min: 0, max: 240 }),
        }),
        { minLength: 1, maxLength: 8 },
      ),
      (attempts) => {
        run += 1;
        const slug = `bot-${run}`;
        const operationKey = `tob-property-${run}`;
        const clock = { now: new Date('2026-10-06T00:00:00.000Z') };
        const open = () =>
          createBotScheduleStore({
            database: attachOperationalModule(owner, 'bot-schedules'),
            isBotActive: () => true,
            onAdmitted: () => {},
            now: () => clock.now,
          });
        let store = open();
        const results = attempts.map((attempt) => {
          if (attempt.restart) store = open();
          clock.now = new Date(clock.now.getTime() + attempt.advanceMinutes * 60_000);
          return store.create(
            slug,
            {
              title: `${attempt.pad}Standup${attempt.pad}`,
              prompt: `${attempt.pad}Summarize${attempt.pad}`,
              trigger: { kind: 'every', everySeconds: 3600 },
            },
            'human',
            undefined,
            { operationKey },
          );
        });
        const listed = store.list(slug);
        expect(listed).toHaveLength(1);
        expect(new Set(results.map((result) => result.id))).toEqual(new Set([listed[0]!.id]));
        expect(new Set(results.map((result) => result.revision)).size).toBe(1);
        expect(results.filter((result) => result.reconciled !== true)).toHaveLength(1);
        store.close();
      },
    ),
    { numRuns: 40 },
  );
});
