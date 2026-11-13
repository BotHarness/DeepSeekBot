import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

describe('main Human140 to E1 relationship141', () => {
  const e1SchemaPlan = defineSchemaPlan(
    BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 141),
  );
  it.each([138, 139, 140])(
    'upgrades supported generation %i with Human data and independent pairing intact',
    (generation) => {
      const home = createTempRoot('schema-main-e1-');
      const previous = trackTestOwner(
        mountOperationalDatabase({
          dshHome: home,
          schemaPlan: defineSchemaPlan(
            BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation <= generation),
          ),
        }),
      );
      expect(previous.mode).toBe('ready');
      const database = attachOperationalModule(previous, 'migration-fixture');
      const pairing = createDevicePairing({ database, hostName: 'Existing' });
      const paired = pairing.redeem({
        offer: pairing.createOffer().offer,
        name: 'Independent Client',
      });
      if (!paired.ok) throw new Error(paired.code);
      database.transaction((db) => {
        db.exec(`INSERT INTO source_events(source_event_id, source_kind, bot_slug, body, created_at)
        VALUES ('human', 'human-message', 'ada', 'Existing', '2026-11-14T00:00:00Z')`);
        if (generation === 140) {
          db.exec(`UPDATE source_events SET human_id = 'human-other';
          INSERT INTO human_attention_decisions VALUES ('local-human', 'human', 'ignored', 'before');
          INSERT INTO human_attention_decisions VALUES ('human-other', 'human', 'ignored', 'before')`);
        } else
          db.exec(`INSERT INTO human_attention_decisions VALUES ('human', 'ignored', 'before')`);
      });
      previous.close();
      for (let restart = 0; restart < 2; restart++) {
        const owner = trackTestOwner(
          mountOperationalDatabase({ dshHome: home, schemaPlan: e1SchemaPlan }),
        );
        expect(owner.mode).toBe('ready');
        expect(owner.generation).toBe(141);
        const current = attachOperationalModule(owner, 'migration-fixture');
        const reopened = createDevicePairing({ database: current, hostName: 'Existing' });
        expect(reopened.admit('Device ' + paired.credential).ok).toBe(true);
        current.read((db) => {
          expect(db.prepare('SELECT human_id FROM source_events').get()?.human_id).toBe(
            generation === 140 ? 'human-other' : 'local-human',
          );
          expect(
            db.prepare('SELECT human_id FROM human_attention_decisions ORDER BY human_id').all(),
          ).toEqual(
            generation === 140
              ? [{ human_id: 'human-other' }, { human_id: 'local-human' }]
              : [{ human_id: 'local-human' }],
          );
          expect(db.prepare('SELECT * FROM host_relationships').all()).toEqual([]);
          expect(db.prepare('SELECT * FROM relationship_device_grants').all()).toEqual([]);
        });
        owner.close();
      }
      const db = new DatabaseSync(join(home, 'botharness', 'botharness.db'), { readOnly: true });
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE name IN ('relationship_client_enrollments')",
          )
          .all(),
      ).toEqual([]);
      expect(
        db
          .prepare('PRAGMA table_info(host_relationships)')
          .all()
          .map((row) => row.name),
      ).not.toContain('revocation_attempts');
      db.close();
    },
  );
});
