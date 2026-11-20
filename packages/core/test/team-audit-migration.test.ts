import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { PrivateAudit } from '../src/team/audit.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

it.each([147, 149, 151])(
  'upgrades main generation%i with existing ownership, then retains the audit chain across restart',
  (generation) => {
    const home = createTempRoot('team-audit-upgrade-');
    const previous = trackTestOwner(
      mountOperationalDatabase({
        dshHome: home,
        schemaPlan: defineSchemaPlan(
          BOT_HARNESS_SCHEMA_PLAN.migrations.filter(
            (migration) => migration.generation <= generation,
          ),
        ),
      }),
    );
    const before = attachOperationalModule(previous, 'team');
    before.transaction((db) => {
      db.prepare("INSERT INTO humans VALUES ('member', 'Member', 'active', 'before')").run();
      db.prepare("INSERT INTO human_roles VALUES ('member', 'member')").run();
      db.prepare(
        "INSERT INTO persona_bots(slug, body, owner_human_id) VALUES ('private-bot', '{}', 'member')",
      ).run();
    });
    previous.close();
    for (let restart = 0; restart < 2; restart++) {
      const current = trackTestOwner(
        mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
      );
      expect(current.mode).toBe('ready');
      expect(current.generation).toBe(BOT_HARNESS_SCHEMA_PLAN.targetGeneration);
      const database = attachOperationalModule(current, 'team');
      expect(
        database.read(
          (db) =>
            db.prepare("SELECT owner_human_id FROM persona_bots WHERE slug = 'private-bot'").get()
              ?.owner_human_id,
        ),
      ).toBe('member');
      const audit = new PrivateAudit(database);
      if (!restart)
        audit.append({
          at: 'now',
          viewerHumanId: 'local-human',
          viewerName: 'Owner',
          kind: 'bot',
          objectId: 'private-bot',
          objectName: 'Bot',
          ownerHumanIds: ['member'],
        });
      expect(audit.list({}).records).toHaveLength(1);
      expect(audit.verify()).toEqual({ ok: true });
      current.close();
    }
  },
);
