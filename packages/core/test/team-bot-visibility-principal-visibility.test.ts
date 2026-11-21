import {
  alice,
  bob,
  closes,
  everyone,
  fixture,
  publicBot,
} from './team-bot-visibility-fixtures.js';
import { describe, expect, it, vi } from 'vitest';
import { createTempRoot } from './helpers.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { createTeamBridge } from '../src/team/bridge.js';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';

describe('M7 Bot principal and participant authority', () => {
  it('preserves omitted switches and performs no write for a slug-only bridge read', async () => {
    const f = fixture();
    f.team.bots.switches(alice, 'alice-bot', {
      proactiveDms: true,
      joinPrincipalChannels: false,
      speakerContext: false,
    });
    const methods = createTeamBridge(alice, f.team);
    expect(await methods.botSwitches({ slug: 'alice-bot', speakerContext: true })).toMatchObject({
      ok: true,
      value: {
        switches: { proactiveDms: true, joinPrincipalChannels: false, speakerContext: true },
      },
    });
    const writes = vi.spyOn(f.db, 'transaction');
    expect(await methods.botSwitches({ slug: 'alice-bot' })).toMatchObject({
      ok: true,
      value: {
        switches: { proactiveDms: true, joinPrincipalChannels: false, speakerContext: true },
      },
    });
    expect(writes).not.toHaveBeenCalled();
  });
  it('defaults private, requires createPublic for widening and returns metadata-only reachability', async () => {
    const f = fixture();
    const customRole = f.team.roles.create(owner, 'Audience role', []).role;
    const visibility = f.team.bots.view(alice, 'alice-bot');
    expect(visibility.visibility).toEqual({ kind: 'private' });
    expect(visibility.audienceDirectory.roles).toEqual(
      expect.arrayContaining([
        { roleId: 'admin', name: 'admin', builtin: 'admin' },
        { roleId: 'member', name: 'member', builtin: 'member' },
        { roleId: customRole.roleId, name: 'Audience role', builtin: null },
      ]),
    );
    expect(
      await createTeamBridge(alice, f.team).botVisibilitySet({
        slug: 'alice-bot',
        visibility: everyone,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'permission-required', details: { permission: 'bots.createPublic' } },
    });
    publicBot(f);
    expect(
      f.team.privateAccess
        .log(owner, {})
        .records.some((r) => r.action === 'botVisibilitySet' && r.objectId === 'alice-bot'),
    ).toBe(true);
    expect(f.team.bots.reachable(bob)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'alice-bot',
          visibility: 'public',
          principalDisplayName: 'alice',
        }),
      ]),
    );
    expect(f.team.bots.reachable(bob).find((b) => b.slug === 'alice-bot')).not.toHaveProperty(
      'body',
    );
    expect(f.team.bots.canReach(bob, 'owner-bot')).toBe(false);
    expect(await f.bridge(bob).channelDm({ slug: 'owner-bot' })).toMatchObject({ ok: false });
  });
  it('keeps Human DM identity and privacy across a public Bot principal transfer', () => {
    const f = fixture();
    publicBot(f);
    const aliceDm = f.team.bots.dm(alice, 'alice-bot')!,
      bobDm = f.team.bots.dm(bob, 'alice-bot')!;
    f.db.transaction((db) =>
      db
        .prepare(
          "UPDATE persona_bots SET owner_human_id='bob',body=json_set(body,'$.ownerHumanId','bob') WHERE slug='alice-bot'",
        )
        .run(),
    );
    expect(f.team.bots.dm(bob, 'alice-bot')!.id).toBe(bobDm.id);
    expect(f.team.bots.dm(alice, 'alice-bot')!.id).toBe(aliceDm.id);
    expect(f.team.channelAccess.canRead(bob, aliceDm.id)).toBe(false);
    expect(f.team.channelAccess.canRead(alice, aliceDm.id)).toBe(true);
    expect(
      f.channels.list().filter((c) => c.botSlug === 'alice-bot' && c.dmHumanId === 'bob'),
    ).toHaveLength(1);
  });
  it('keeps hard grants unioned and advisory topics Deny-wins with explicit conflicting role pairs', async () => {
    const f = fixture();
    const allow = f.team.roles.create(owner, 'Finance', ['bots.createPrivate'], { kind: 'all' }, [
      { topic: 'money', text: 'Show balances', effect: 'allow' },
    ]).role;
    const deny = f.team.roles.create(owner, 'Intern', ['dm.humans'], { kind: 'all' }, [
      { topic: 'money', text: 'Do not show balances', effect: 'deny' },
    ]).role;
    f.team.roles.set(owner, 'bob', [allow.roleId, deny.roleId]);
    expect(f.team.roles.permissions(bob)).toEqual(
      expect.arrayContaining(['bots.createPrivate', 'dm.humans']),
    );
    expect(await createTeamBridge(owner, f.team).roleConflicts({ humanId: 'bob' })).toMatchObject({
      ok: true,
      value: [
        { topic: 'money', allowRole: { roleId: allow.roleId }, denyRole: { roleId: deny.roleId } },
      ],
    });
    expect(f.team.speakerPolicy.forHuman('bob', 'money').resolved).toMatchObject([
      { effect: 'deny', conflict: true },
    ]);
    const first = f.team.speakerPolicy.envelope('session', 'bob', 'hello');
    expect(first.text).toContain('[bob ·');
    expect(first.text).toContain('Show balances');
    first.commit();
    const writes = f.database.diagnostics().metrics.transactionsCommitted;
    first.commit();
    f.team.speakerPolicy.envelope('session', 'bob', 'repeat').commit();
    expect(f.database.diagnostics().metrics.transactionsCommitted).toBe(writes);
    expect(f.team.speakerPolicy.envelope('session', 'bob', 'again').text).not.toContain(
      'Show balances',
    );
    f.team.roles.update(owner, allow.roleId, {
      policy: [{ topic: 'money', text: 'New revision', effect: 'allow' }],
    });
    expect(f.team.speakerPolicy.envelope('session', 'bob', 'changed').text).toContain(
      '"revision":2',
    );
    expect(f.team.speakerPolicy.envelope('another-session', 'bob', 'new').text).toContain(
      'Do not show balances',
    );
  });
  it('keeps reachable discovery to one read and never decodes unrelated private Bot data', () => {
    const f = fixture();
    publicBot(f);
    f.db.transaction((db) => {
      for (let i = 0; i < 1000; i++)
        db.prepare('INSERT INTO persona_bots(slug,owner_human_id,body) VALUES (?,?,?)').run(
          'hidden-' + i,
          'alice',
          '{"secret":"not-metadata"}',
        );
    });
    const before = f.database.diagnostics().metrics.reads;
    expect(f.team.bots.reachable(bob).map((b) => b.slug)).toEqual(['alice-bot', 'bob-bot']);
    expect(f.database.diagnostics().metrics.reads - before).toBe(1);
  });
  it('preserves the documented private Owner/member reach upgrading the historical 153 boundary', () => {
    const root = createTempRoot('m7-upgrade-');
    const old = mountOperationalDatabase({
      dshHome: root,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation <= 153),
      ),
    });
    attachOperationalModule(old, 'fixture').transaction((db) => {
      db.prepare("INSERT INTO humans VALUES ('alice','alice','active','now')").run();
      for (const id of ['local-human', 'alice'])
        db.prepare('INSERT INTO persona_bots(slug,body,owner_human_id) VALUES (?,?,?)').run(
          id,
          JSON.stringify({ slug: id, displayName: id }),
          id,
        );
      for (const id of ['group-existing', 'group-revoked'])
        db.prepare(
          'INSERT INTO channel_records(channel_id,record_json,owner_human_id,visibility_json) VALUES (?,?,?,?)',
        ).run(
          id,
          JSON.stringify({
            id,
            type: 'group',
            name: id,
            members: ['local-human'],
            createdAt: '2026-11-15T00:00:00Z',
            updatedAt: '2026-11-15T00:00:00Z',
          }),
          'alice',
          JSON.stringify({ kind: 'roles', roleIds: ['member'] }),
        );
      db.prepare(
        "INSERT INTO channel_human_members(channel_id,human_id,display_name,visible_from_revision,joined_at,left_at) VALUES ('group-revoked','local-human','Human',1,'before','removed')",
      ).run();
    });
    old.close();
    const migrated = mountOperationalDatabase({
      dshHome: root,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    closes.push(() => migrated.close());
    const db = attachOperationalModule(migrated, 'test');
    expect(
      db.read((db) =>
        db.prepare('SELECT owner_human_id,visibility_json FROM persona_bots ORDER BY slug').all(),
      ),
    ).toEqual([
      { owner_human_id: 'alice', visibility_json: '{"kind":"private"}' },
      { owner_human_id: 'local-human', visibility_json: '{"kind":"private"}' },
    ]);
    expect(
      db.read((db) =>
        db
          .prepare(
            "SELECT channel_id,left_at FROM channel_human_members WHERE human_id='local-human' ORDER BY channel_id",
          )
          .all(),
      ),
    ).toEqual([
      { channel_id: 'group-existing', left_at: null },
      { channel_id: 'group-revoked', left_at: 'removed' },
    ]);
    expect(
      db.read((db) =>
        db.prepare('SELECT channel_id,human_id FROM channel_admins ORDER BY channel_id').all(),
      ),
    ).toEqual([{ channel_id: 'group-existing', human_id: 'local-human' }]);
    expect(
      db.read((db) =>
        db
          .prepare('SELECT id FROM schema_migrations WHERE generation=?')
          .get(BOT_HARNESS_SCHEMA_PLAN.generationOf('bot-visibility')),
      ),
    ).toEqual({ id: 'bot-visibility' });
  });
});
