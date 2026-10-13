import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createTempRoot } from './helpers.js';
it('preserves canonical content and admission snapshots while allowing distinct placements after generation 52', () => {
  const home = createTempRoot('bh635-upgrade-');
  const priorPlan = defineSchemaPlan(
    BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation < 52),
  );
  const prior = mountOperationalDatabase({ dshHome: home, schemaPlan: priorPlan });
  const seed = attachOperationalModule(prior, 'test');
  seed.transaction((db) => {
    for (const id of ['one', 'two'])
      db.prepare('INSERT INTO channel_records(channel_id,record_json) VALUES (?,?)').run(
        id,
        JSON.stringify({
          id,
          type: 'group',
          name: id,
          members: ['ada'],
          createdAt: '2026-10-03',
          updatedAt: '2026-10-03',
        }),
      );
    db.prepare(
      "INSERT INTO source_events(source_event_id,source_kind,bot_slug,body,created_at,payload_json) VALUES ('source','bridge-message','ada','original','2026-10-03',?)",
    ).run(JSON.stringify({ external: { grantRevision: 7 } }));
    db.prepare("INSERT INTO channel_placements VALUES ('one',9,'source','source')").run();
    db.prepare(
      "INSERT INTO inbox_admissions(source_event_id,bot_slug,reason,wake_mode,wake_count,wake_interval_ms) VALUES ('source','ada','group-ordinary','digest',3,60000)",
    ).run();
  });
  const before = seed.read((db) => db.prepare('SELECT * FROM inbox_admissions').all());
  prior.close();
  const current = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  expect(current.mode).toBe('ready');
  const port = attachOperationalModule(current, 'test');
  expect(port.read((db) => db.prepare('SELECT * FROM inbox_admissions').all())).toMatchObject(
    before,
  );
  port.transaction((db) =>
    db.prepare("INSERT INTO channel_placements VALUES ('two',1,'source','source')").run(),
  );
  expect(port.read((db) => db.prepare('SELECT * FROM source_events').all())).toHaveLength(1);
  expect(
    port.read((db) => db.prepare('SELECT * FROM channel_placements ORDER BY channel_id').all()),
  ).toEqual([
    { channel_id: 'one', revision: 9, source_event_id: 'source', message_id: 'source' },
    { channel_id: 'two', revision: 1, source_event_id: 'source', message_id: 'source' },
  ]);
  expect(() =>
    port.transaction((db) =>
      db.prepare("INSERT INTO channel_placements VALUES ('two',2,'source','source')").run(),
    ),
  ).toThrow();
  expect(port.read((db) => db.prepare('PRAGMA foreign_key_check').all())).toEqual([]);
  current.close();
  const old = mountOperationalDatabase({ dshHome: home, schemaPlan: priorPlan });
  expect(old.mode).toBe('recovery');
  expect(old.recovery?.code).toBe('upgrade-required');
  old.close();
});
