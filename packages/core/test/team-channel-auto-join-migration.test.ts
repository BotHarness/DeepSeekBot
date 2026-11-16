import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

it('joins active Humans to every viewable Channel on upgrade and ends role joins of private Channels', () => {
  const home = createTempRoot('auto-join-upgrade-');
  const old = trackTestOwner(
    mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.slice(
          0,
          BOT_HARNESS_SCHEMA_PLAN.migrations.findIndex(
            (migration) => migration.id === 'channel-auto-join',
          ),
        ),
      ),
    }),
  );
  const before = attachOperationalModule(old, 'auto-join-test');
  before.transaction((db) => {
    for (const [id, status] of [
      ['finance', 'active'],
      ['plain', 'active'],
      ['gone', 'deactivated'],
    ] as const)
      db.prepare('INSERT INTO humans VALUES (?, ?, ?, ?)').run(id, id, status, 'before');
    db.prepare("INSERT INTO human_roles VALUES ('finance', 'admin')").run();
    db.prepare("INSERT INTO human_roles VALUES ('plain', 'member')").run();
    db.prepare("INSERT INTO human_roles VALUES ('gone', 'admin')").run();
    for (const kind of ['public', 'roles', 'private', 'deleted']) {
      db.prepare(
        'INSERT INTO channel_records(channel_id,record_json,owner_human_id,visibility_json) VALUES (?,?,?,?)',
      ).run(
        kind,
        JSON.stringify({
          id: kind,
          type: 'group',
          name: kind,
          members: [],
          createdAt: 'before',
          updatedAt: 'before',
          ...(kind === 'deleted' ? { deletedAt: 'before' } : {}),
        }),
        'local-human',
        JSON.stringify(
          kind === 'roles'
            ? { kind, roleIds: ['admin'] }
            : { kind: kind === 'deleted' ? 'public' : kind },
        ),
      );
    }
    db.prepare(
      "INSERT INTO channel_human_members(channel_id,human_id,display_name,visible_from_revision,joined_at,membership_basis) VALUES ('private','plain','plain',1,'before','role')",
    ).run();
    db.prepare(
      "INSERT INTO channel_human_members(channel_id,human_id,display_name,visible_from_revision,joined_at,membership_basis) VALUES ('private','finance','finance',1,'before','invited')",
    ).run();
    db.prepare(
      "INSERT INTO channel_human_members(channel_id,human_id,display_name,visible_from_revision,joined_at,left_at,membership_basis) VALUES ('public','plain','plain',1,'before','before','role')",
    ).run();
  });
  old.close();
  for (let restart = 0; restart < 2; restart++) {
    const current = trackTestOwner(
      mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    const after = attachOperationalModule(current, 'auto-join-test');
    expect(
      after.read((db) =>
        db
          .prepare(
            "SELECT channel_id AS channel, human_id AS human, membership_basis AS basis FROM channel_human_members WHERE left_at IS NULL AND human_id IN ('finance','plain','gone') ORDER BY channel_id, human_id",
          )
          .all(),
      ),
    ).toEqual([
      { channel: 'private', human: 'finance', basis: 'invited' },
      { channel: 'public', human: 'finance', basis: 'role' },
      { channel: 'public', human: 'plain', basis: 'role' },
      { channel: 'roles', human: 'finance', basis: 'role' },
    ]);
    current.close();
  }
});
