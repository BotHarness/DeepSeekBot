import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { humanContext } from '../src/humans/context.js';
import { DEFAULT_CHANNEL_POLICY } from '../src/team/channel-contract.js';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

describe('published Human and Team schemas through M4 Channel access146', () => {
  const e1SchemaPlan = defineSchemaPlan(
    BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 146),
  );
  it('upgrades main generation 145 after legacy Channel writes and preserves M9 ownership', () => {
    const home = createTempRoot('schema-main-m4-');
    const previous = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation <= 145),
      ),
    });
    expect(previous.mode).toBe('ready');
    const port = attachOperationalModule(previous, 'main-channel-fixture');
    port.transaction((db) =>
      db.exec("INSERT INTO humans VALUES ('member', 'Member', 'active', 'before')"),
    );
    const channels = createSqliteChannelStore({ database: port, rootDir: join(home, 'channels') });
    const group = channels.createGroup(humanContext('member'), {
      name: 'Member owned',
      members: [],
    });
    const record = port.read(
      (db) =>
        db.prepare('SELECT record_json FROM channel_records WHERE channel_id = ?').get(group.id)
          ?.record_json,
    );
    port.transaction((db) =>
      db.prepare('UPDATE channel_records SET public = 1 WHERE channel_id = ?').run(group.id),
    );
    previous.close();
    const current = trackTestOwner(
      mountOperationalDatabase({ dshHome: home, schemaPlan: e1SchemaPlan }),
    );
    expect(current.mode).toBe('ready');
    expect(current.generation).toBe(146);
    const migrated = attachOperationalModule(current, 'm4-channel-fixture');
    expect(
      migrated.read((db) =>
        db
          .prepare(
            'SELECT record_json, owner_human_id, visibility_json, policy_json FROM channel_records WHERE channel_id = ?',
          )
          .get(group.id),
      ),
    ).toEqual({
      record_json: record,
      owner_human_id: 'member',
      visibility_json: '{"kind":"public"}',
      policy_json: JSON.stringify(DEFAULT_CHANNEL_POLICY),
    });
    expect(
      migrated.read((db) =>
        db.prepare('SELECT human_id FROM channel_human_members WHERE channel_id = ?').all(group.id),
      ),
    ).toEqual([{ human_id: 'member' }]);
    const upgraded = createSqliteChannelStore({
      database: migrated,
      rootDir: join(home, 'channels'),
    });
    const next = upgraded.createGroup(humanContext('member'), {
      name: 'After upgrade',
      members: [],
    });
    expect(
      migrated.read((db) =>
        db.prepare('SELECT owner_human_id FROM channel_records WHERE channel_id = ?').get(next.id),
      ),
    ).toEqual({ owner_human_id: 'member' });
  });

  it.each([138, 139, 140, 141, 142, 143, 144, 145])(
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
      const deviceId = 'existing-device-id';
      const secret = 'existing-private-device-secret-1234567890';
      database.transaction((db) => {
        db.prepare(
          'INSERT INTO paired_devices(device_id, name, secret_hash, paired_at) VALUES (?, ?, ?, ?)',
        ).run(
          deviceId,
          'Independent Client',
          createHash('sha256').update(secret).digest('hex'),
          'before',
        );
        db.exec(`INSERT INTO source_events(source_event_id, source_kind, bot_slug, body, created_at)
        VALUES ('human', 'human-message', 'ada', 'Existing', '2026-11-14T00:00:00Z')`);
        if (generation >= 140) {
          db.exec(`UPDATE source_events SET human_id = 'human-other';
          INSERT INTO human_attention_decisions VALUES ('local-human', 'human', 'ignored', 'before');
          INSERT INTO human_attention_decisions VALUES ('human-other', 'human', 'ignored', 'before')`);
        } else
          db.exec(`INSERT INTO human_attention_decisions VALUES ('human', 'ignored', 'before')`);
        if (generation >= 141)
          db.exec(`INSERT INTO humans VALUES ('human-other', 'Existing member', 'active', 'before');
            INSERT INTO member_grants VALUES ('member-grant', 'member-token-hash', 'human-other', 'before', 'before', NULL)`);
        if (generation >= 142) db.exec(`INSERT INTO human_roles VALUES ('human-other', 'member')`);
        if (generation >= 143)
          db.exec(`INSERT INTO persona_bots(slug, body, owner_human_id)
            VALUES ('member-bot', '{"slug":"member-bot","ownerHumanId":"human-other"}', 'human-other');
            INSERT INTO tob_identity VALUES ('human-other', 'member-bot')`);
      });
      previous.close();
      for (let restart = 0; restart < 2; restart++) {
        const owner = trackTestOwner(
          mountOperationalDatabase({ dshHome: home, schemaPlan: e1SchemaPlan }),
        );
        expect(owner.mode).toBe('ready');
        expect(owner.generation).toBe(146);
        const current = attachOperationalModule(owner, 'migration-fixture');
        const reopened = createDevicePairing({ database: current, hostName: 'Existing' });
        expect(reopened.admit(`Device ${deviceId}.${secret}`).ok).toBe(true);
        current.read((db) => {
          expect(db.prepare('SELECT human_id FROM source_events').get()?.human_id).toBe(
            generation >= 140 ? 'human-other' : 'local-human',
          );
          expect(
            db.prepare('SELECT human_id FROM human_attention_decisions ORDER BY human_id').all(),
          ).toEqual(
            generation >= 140
              ? [{ human_id: 'human-other' }, { human_id: 'local-human' }]
              : [{ human_id: 'local-human' }],
          );
          expect(db.prepare('SELECT * FROM host_relationships').all()).toEqual([]);
          expect(db.prepare('SELECT * FROM relationship_device_grants').all()).toEqual([]);
          if (generation >= 141) {
            expect(
              db
                .prepare("SELECT display_name, status FROM humans WHERE human_id = 'human-other'")
                .get(),
            ).toEqual({ display_name: 'Existing member', status: 'active' });
            expect(
              db
                .prepare(
                  "SELECT human_id, revoked_at FROM member_grants WHERE grant_id = 'member-grant'",
                )
                .get(),
            ).toEqual({ human_id: 'human-other', revoked_at: null });
          }
          if (generation >= 142)
            expect(
              db.prepare("SELECT role_id FROM human_roles WHERE human_id = 'human-other'").all(),
            ).toEqual([{ role_id: 'member' }]);
          if (generation >= 143) {
            expect(
              db
                .prepare("SELECT owner_human_id, body FROM persona_bots WHERE slug = 'member-bot'")
                .get(),
            ).toEqual({
              owner_human_id: 'human-other',
              body: '{"slug":"member-bot","ownerHumanId":"human-other"}',
            });
            expect(
              db.prepare("SELECT bot_slug FROM tob_identity WHERE human_id = 'human-other'").get(),
            ).toEqual({ bot_slug: 'member-bot' });
          }
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
