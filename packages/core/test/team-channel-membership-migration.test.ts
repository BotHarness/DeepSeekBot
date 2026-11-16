import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

it('classifies legacy memberships without changing Owner content and keeps the named migration across restart', () => {
  const home = createTempRoot('m14-membership-upgrade-');
  const old = trackTestOwner(
    mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.slice(
          0,
          BOT_HARNESS_SCHEMA_PLAN.migrations.findIndex(
            (migration) => migration.id === 'channel-membership-basis',
          ),
        ),
      ),
    }),
  );
  const before = attachOperationalModule(old, 'm14-test');
  before.transaction((db) => {
    for (const id of ['channel-owner', 'admin', 'eligible', 'ineligible']) {
      db.prepare('INSERT INTO humans VALUES (?, ?, ?, ?)').run(id, id, 'active', 'before');
      db.prepare('INSERT INTO human_roles VALUES (?, ?)').run(
        id,
        id === 'eligible' ? 'admin' : 'member',
      );
    }
    for (const kind of ['roles', 'private', 'public']) {
      db.prepare(
        'INSERT INTO channel_records(channel_id,record_json,owner_human_id,visibility_json) VALUES (?,?,?,?)',
      ).run(
        kind,
        JSON.stringify({
          id: kind,
          type: 'group',
          name: 'Preserved',
          members: [],
          createdAt: 'before',
          updatedAt: 'before',
        }),
        'channel-owner',
        JSON.stringify(kind === 'roles' ? { kind, roleIds: ['admin'] } : { kind }),
      );
      for (const id of ['local-human', 'channel-owner', 'admin', 'eligible', 'ineligible'])
        db.prepare(
          'INSERT INTO channel_human_members(channel_id,human_id,display_name,visible_from_revision,joined_at) VALUES (?,?,?,1,?)',
        ).run(kind, id, id, 'before');
    }
    db.prepare('INSERT INTO channel_admins VALUES (?,?)').run('roles', 'admin');
  });
  const records = before.read((db) =>
    db.prepare('SELECT * FROM channel_records ORDER BY channel_id').all(),
  );
  old.close();
  for (let restart = 0; restart < 2; restart++) {
    const current = trackTestOwner(
      mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    expect(current.mode).toBe('ready');
    const database = attachOperationalModule(current, 'm14-test');
    database.read((db) => {
      expect(db.prepare('SELECT * FROM channel_records ORDER BY channel_id').all()).toEqual(
        records,
      );
      expect(
        db.prepare("SELECT id FROM schema_migrations WHERE id = 'channel-membership-basis'").all(),
      ).toEqual([{ id: 'channel-membership-basis' }]);
      expect(
        db
          .prepare(
            "SELECT human_id, membership_basis, left_at IS NOT NULL AS leftChannel FROM channel_human_members WHERE channel_id = 'roles' ORDER BY human_id",
          )
          .all(),
      ).toEqual([
        { human_id: 'admin', membership_basis: 'invited', leftChannel: 0 },
        { human_id: 'channel-owner', membership_basis: 'invited', leftChannel: 0 },
        { human_id: 'eligible', membership_basis: 'role', leftChannel: 0 },
        { human_id: 'ineligible', membership_basis: 'role', leftChannel: 1 },
        { human_id: 'local-human', membership_basis: 'invited', leftChannel: 0 },
      ]);
      expect(
        db
          .prepare(
            "SELECT 1 FROM channel_human_members WHERE channel_id IN ('private','public') AND (membership_basis <> 'invited' OR left_at IS NOT NULL)",
          )
          .all(),
      ).toEqual([]);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    });
    current.close();
  }
});
