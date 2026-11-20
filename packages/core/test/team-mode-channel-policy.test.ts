import { createDevicePairing } from '../src/devices/pairing.js';
import { DatabaseSync } from 'node:sqlite';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { enabledFixture, cleanup } from './team-mode-fixtures.js';

afterEach(cleanup);

describe('M4 Channel audience and policy', { timeout: 60_000 }, () => {
  it.each(['private', 'roles-nonmember', 'roles-member'] as const)(
    'hides %s through every read path',
    async (kind) => {
      const f = await enabledFixture();
      const secret = f.channels.createGroup(owner, { name: 'm4-confidential', members: [] });
      await f.channels.appendMessage(owner, secret.id, {
        id: 'm4-secret',
        at: '2026-11-14T00:00:00Z',
        author: { kind: 'human', humanId: owner.humanId },
        body: 'm4-confidential-content',
      });
      if (kind === 'roles-member') {
        f.team.channelAccess.visibilitySet(owner, secret.id, {
          kind: 'roles',
          roleIds: ['member'],
        });
      }
      if (kind !== 'private') {
        const { role } = f.team.roles.create(owner, 'restricted', []);
        f.team.channelAccess.visibilitySet(owner, secret.id, {
          kind: 'roles',
          roleIds: [role.roleId],
        });
      }
      const methods = f.methods(f.human);
      const cursor = f.channels.changeCursor!();
      f.setPlacements([
        { channelId: secret.id, messageId: 'm4-secret', sourceEventId: 'm4-source' },
      ]);
      const results = [
        await methods.channels({}),
        await methods.messageSearch({ text: 'm4-confidential' }),
        await methods.channelListChanges({ sinceSeq: 0, epoch: cursor.epoch }),
        methods.channelUnreadCounts({}),
      ];
      for (const [index, result] of results.entries())
        expect(JSON.stringify(result), `read path ${index}`).not.toContain('m4-confidential');
      for (const method of [
        'channelGet',
        'channelMessages',
        'channelTimeline',
        'channelSearch',
        'channelAllBotPreview',
        'channelReadPosition',
      ] as const) {
        const result = await methods[method]({ channelId: secret.id, text: 'm4-confidential' });
        expect(result, method).toMatchObject({ ok: false, error: { code: 'channel-not-found' } });
      }
      expect(
        f.channels.readHumanJournalPage(f.human, secret.id, { through: 10, limit: 10 }),
      ).toBeUndefined();
      expect(f.channels.readHumanFilesPage(f.human, secret.id, {})).toBeUndefined();
      expect(
        f.channels.searchHumanMessages?.(f.human, secret.id, {
          text: 'm4-confidential',
          limit: 10,
        }),
      ).toBeUndefined();
      f.registry.create({ slug: 'm4-bot', displayName: 'M4 Bot', ownerHumanId: f.human.humanId });
      const dm = f.channels.getOrCreateDm(f.human, 'm4-bot', 'M4 Bot');
      if (!dm) throw new Error('missing dm');
      expect(
        await methods.channelSend({
          channelId: dm.id,
          body: '#m4-confidential',
          channelRefs: [{ channelId: secret.id, label: 'm4-confidential', start: 0, end: 16 }],
        }),
      ).toMatchObject({ ok: false, error: { code: 'channel-not-found' } });
      const abort = new AbortController();
      const roster = f.live.followRoster(f.human, abort.signal)[Symbol.asyncIterator]();
      const channel = f.live
        .followChannel(f.human, secret.id, 10, abort.signal)
        [Symbol.asyncIterator]();
      try {
        expect((await roster.next()).value).toEqual({ type: 'baseline', placements: [] });
        await expect(channel.next()).rejects.toMatchObject({ code: 'not-found' });
        const response = f.live.open(
          f.human,
          new Request(`http://localhost/api/botharness/stream?channelId=${secret.id}`),
        );
        expect(response.status).toBe(404);
        await response.body?.cancel();
      } finally {
        abort.abort();
        await roster.return?.();
        await channel.return?.();
      }
    },
  );

  it('auto-joins public and eligible role Channels so the member can post at once', async () => {
    const f = await enabledFixture();
    const group = f.channels.createGroup(owner, { name: 'Public preview', members: [] });
    for (const visibility of [
      { kind: 'public' },
      { kind: 'roles', roleIds: ['member'] },
    ] as const) {
      f.team.channelAccess.visibilitySet(
        owner,
        group.id,
        visibility.kind === 'public'
          ? visibility
          : { kind: 'roles', roleIds: [...visibility.roleIds] },
      );
      expect(f.team.channelAccess.visibleIds(f.human).has(group.id)).toBe(true);
      expect(await f.methods(f.human).channelGet({ channelId: group.id })).toMatchObject({
        ok: true,
        value: { role: 'member', visibility },
      });
      expect(f.channels.listHumanMembers(f.human, group.id)).toHaveLength(2);
      expect(
        await f.methods(f.human).channelSend({ channelId: group.id, body: visibility.kind }),
      ).toMatchObject({ ok: true });
    }
  });

  it('enforces each policy, owner-only admins and exact member metadata', async () => {
    const f = await enabledFixture();
    f.registry.create({
      slug: 'policy-bot',
      displayName: 'Policy Bot',
      ownerHumanId: f.human.humanId,
    });
    const group = f.channels.createGroup(owner, { name: 'Policy', members: [] });
    f.team.channelAccess.addMember(owner, group.id, f.human.humanId);
    const allAdmins = {
      addMembers: 'admins',
      post: 'admins',
      mentionAll: 'admins',
      addBots: 'admins',
      editDetails: 'admins',
    } as const;
    f.team.channelAccess.policySet(owner, group.id, allAdmins);
    const methods = f.methods(f.human);
    expect(methods.channelGet({ channelId: group.id })).toEqual({
      ok: true,
      value: {
        channel: expect.any(Object),
        role: 'member',
        policy: allAdmins,
        policyRevision: expect.any(String),
        visibility: { kind: 'private' },
        admins: [],
      },
    });
    expect(methods.channelGet({ channelId: group.id })).not.toHaveProperty(
      'value.channelFingerprint',
    );
    for (const [method, payload, key] of [
      ['channelSend', { body: 'announcement' }, 'post'],
      ['channelHumanAdd', { humanId: 'absent' }, 'addMembers'],
      ['channelGroupInvite', { botSlug: 'policy-bot' }, 'addBots'],
      ['channelRename', { name: 'edited' }, 'editDetails'],
      ['channelDescriptionSet', { description: 'edited' }, 'editDetails'],
    ] as const) {
      const result = await methods[method]({ channelId: group.id, ...payload });
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: key === 'post' ? 'channel-post-restricted' : 'permission-required',
          details: { permission: key },
        },
      });
    }
    f.team.channelAccess.policySet(owner, group.id, { ...allAdmins, post: 'everyone' });
    expect(
      await methods.channelSend({
        channelId: group.id,
        body: '@All Bots',
        allBotMention: {
          start: 0,
          end: 9,
          label: 'All Bots',
          preview: f.channels.previewAllBotMention(group.id),
        },
      }),
    ).toMatchObject({ ok: false, error: { code: 'channel-mention-restricted' } });
    expect(await methods.channelAdminsSet({ channelId: group.id, humanIds: [] })).toMatchObject({
      ok: false,
      error: { code: 'permission-required' },
    });
    expect(
      await methods.channelPolicySet({ channelId: group.id, policy: allAdmins }),
    ).toMatchObject({ ok: false, error: { code: 'permission-required' } });
    expect(
      await methods.channelVisibilitySet({ channelId: group.id, visibility: { kind: 'public' } }),
    ).toMatchObject({ ok: false, error: { code: 'permission-required' } });
    expect(await methods.channelRoleDirectory({ channelId: group.id })).toMatchObject({
      ok: false,
      error: { code: 'permission-required' },
    });
    f.team.channelAccess.adminsSet(owner, group.id, [f.human.humanId]);
    expect(await methods.channelRoleDirectory({ channelId: group.id })).toMatchObject({
      ok: true,
      value: expect.arrayContaining([{ roleId: 'member', name: 'member' }]),
    });
    expect(methods.channelGet({ channelId: group.id })).toMatchObject({
      ok: true,
      value: { role: 'admin', admins: [{ humanId: f.human.humanId, displayName: 'Bob' }] },
    });
    f.team.channelAccess.policySet(f.human, group.id, allAdmins);
    expect(
      await methods.channelSend({ channelId: group.id, body: 'admin announcement' }),
    ).toMatchObject({ ok: true });
    expect(
      await methods.channelVisibilitySet({
        channelId: group.id,
        visibility: { kind: 'roles', roleIds: ['absent'] },
      }),
    ).toMatchObject({ ok: false, error: { code: 'role-not-found' } });
    expect(
      await methods.channelVisibilitySet({ channelId: 'absent', visibility: { kind: 'public' } }),
    ).toMatchObject({ ok: false, error: { code: 'channel-not-found' } });
  });

  it('creates member-owned groups and keeps Host-wide management separate from private reading', async () => {
    const f = await enabledFixture();
    const group = f.channels.createGroup(f.human, { name: 'Member-owned', members: [] });
    expect(f.team.channelAccess.view(f.human, group.id).role).toBe('owner');
    expect(f.team.channelAccess.canRead(owner, group.id)).toBe(false);
    f.team.channelAccess.visibilitySet(owner, group.id, { kind: 'public' });
    expect(f.team.channelAccess.visibleIds(owner).has(group.id)).toBe(true);
    expect(() => f.team.channelAccess.adminsSet(f.human, group.id, [owner.humanId])).toThrow(
      'permission-required',
    );
    const { role } = f.team.roles.create(owner, 'no channel creation', []);
    f.team.roles.set(owner, f.human.humanId, [role.roleId]);
    expect(f.methods(f.human).channelCreate({ name: 'denied', members: [] })).toMatchObject({
      ok: false,
      error: { code: 'permission-required', details: { permission: 'channels.create' } },
    });
  });

  it('opens one Human DM per pair, permits files and denies every other Human including Owner', async () => {
    const f = await enabledFixture();
    const alice = await f.team.createMember(owner, 'm4alice', 'Alice');
    const other = humanContext(alice.member.humanId);
    const first = f.team.channelAccess.dm(f.human, other.humanId).channel;
    expect(f.team.channelAccess.dm(other, f.human.humanId).channel.id).toBe(first.id);
    expect(first).toMatchObject({
      type: 'dm',
      members: [],
      humanParticipants: expect.arrayContaining([f.human.humanId, other.humanId]),
    });
    expect(
      await f.methods(f.human).channelSend({ channelId: first.id, body: 'DM secret' }),
    ).toMatchObject({ ok: true });
    expect(await f.methods(other).channelMessages({ channelId: first.id })).toMatchObject({
      ok: true,
      value: { messages: [expect.objectContaining({ body: 'DM secret' })] },
    });
    expect(
      f.channels.searchAllHumanMessages?.(other, { text: 'DM secret', limit: 10 }),
    ).toMatchObject({ hits: [expect.objectContaining({ channelId: first.id })] });
    expect(await f.methods(owner).channelMessages({ channelId: first.id })).toMatchObject({
      ok: false,
      error: { code: 'channel-not-found' },
    });
    expect(
      f.channels.readHumanJournalPage(owner, first.id, { through: 10, limit: 10 }),
    ).toBeUndefined();
    const attachment = await f.attachments.upload({
      name: 'human-dm.txt',
      data: (async function* () {
        yield Buffer.from('private file bytes');
      })(),
    });
    expect(
      await f
        .methods(f.human)
        .channelSend({ channelId: first.id, body: 'file', attachments: [attachment] }),
    ).toMatchObject({ ok: true });
    expect(JSON.stringify(f.channels.readHumanFilesPage(other, first.id, {}))).toContain(
      'human-dm.txt',
    );
    expect(f.channels.readHumanFilesPage(owner, first.id, {})).toBeUndefined();
    expect(JSON.stringify(await f.methods(owner).channels({}))).not.toContain(first.id);
    expect(f.team.channelAccess.directory(f.human)).toContainEqual({
      humanId: other.humanId,
      displayName: 'Alice',
    });
    for (const row of f.team.channelAccess.directory(f.human))
      expect(Object.keys(row).sort()).toEqual(['displayName', 'humanId']);
    expect(() => f.team.channelAccess.dm(f.human, 'missing')).toThrow('member-not-found');
    expect(() => f.team.channelAccess.dm(f.human, f.human.humanId)).toThrow('member-not-found');
    await f.team.suspend(owner, other.humanId);
    expect(() => f.team.channelAccess.dm(f.human, other.humanId)).toThrow('member-not-found');
    expect(f.team.channelAccess.directory(f.human)).not.toContainEqual(
      expect.objectContaining({ humanId: other.humanId }),
    );
    const { role } = f.team.roles.create(owner, 'No DMs', []);
    f.team.roles.set(owner, f.human.humanId, [role.roleId]);
    expect(await f.methods(f.human).humanDm({ humanId: other.humanId })).toMatchObject({
      ok: false,
      error: { code: 'permission-required', details: { permission: 'dm.humans' } },
    });
    expect(await f.methods(f.human).teamDirectory({})).toMatchObject({
      ok: false,
      error: { code: 'permission-required', details: { permission: 'dm.humans' } },
    });
  });

  it('lists a Human DM for both people only once the first message is sent', async () => {
    const f = await enabledFixture();
    const alice = await f.team.createMember(owner, 'm4222alice', 'Alice');
    const other = humanContext(alice.member.humanId);
    const listed = async (human: ReturnType<typeof humanContext>) => {
      const result = await f.methods(human).channels({});
      if (!result.ok) throw new Error('channels-refused');
      return result.value.channels.map((channel) => channel.id);
    };
    const opened = await f.methods(f.human).humanDm({ humanId: other.humanId });
    if (!opened.ok) throw new Error('human-dm-refused');
    const dm = opened.value.channel;
    expect(await listed(f.human)).not.toContain(dm.id);
    expect(await listed(other)).not.toContain(dm.id);
    expect(await f.methods(f.human).channelGet({ channelId: dm.id })).toMatchObject({ ok: true });
    const abort = new AbortController();
    const roster = f.live.followRoster(other, abort.signal)[Symbol.asyncIterator]();
    try {
      await roster.next();
      const next = roster.next();
      expect(
        await f.methods(f.human).channelSend({ channelId: dm.id, body: 'first DM' }),
      ).toMatchObject({ ok: true });
      expect(f.channels.revision(dm.id)).toBe(1);
      const [message] = f.channels.readMessages(dm.id);
      f.live.publishCommitted({ channelId: dm.id, message: message!, revision: 1 });
      const frames = [(await next).value];
      if (frames[0]?.type !== 'changed') frames.push((await roster.next()).value);
      expect(frames).toContainEqual({ type: 'changed' });
      expect(await listed(other)).toContain(dm.id);
      expect(await listed(f.human)).toContain(dm.id);
    } finally {
      abort.abort();
      await roster.return?.();
    }
  });

  it.each(['visibility', 'role'] as const)(
    'immediately closes browser Peers, paired mux and queued streams on %s revocation',
    async (cause) => {
      const f = await enabledFixture();
      await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
      const group = f.channels.createGroup(owner, { name: 'Revoked', members: [] });
      f.team.channelAccess.visibilitySet(owner, group.id, { kind: 'roles', roleIds: ['member'] });
      const first = await f.team.signIn('bob', 'member-password-1', 'one');
      const second = await f.team.signIn('bob', 'member-password-1', 'two');
      const pairing = createDevicePairing({
        database: f.database,
        hostName: 'M4',
        ownerHumanId: () => f.human.humanId,
      });
      f.team.bindPairing(pairing);
      const device = pairing.redeem({ offer: pairing.createOffer().offer });
      if (!device.ok) throw new Error('pair failed');
      const close = vi.fn();
      pairing.attachStream(device.device.id, close);
      const abort = new AbortController();
      const channel = f.live
        .followChannel(f.human, group.id, 10, abort.signal)
        [Symbol.asyncIterator]();
      const roster = f.live.followRoster(f.human, abort.signal)[Symbol.asyncIterator]();
      try {
        await channel.next();
        await roster.next();
        const message = await f.channels.appendMessage(f.human, group.id, {
          id: 'queued-secret',
          at: '2026-11-14',
          author: { kind: 'human', humanId: f.human.humanId },
          body: 'queued-secret',
        });
        if (!message) throw new Error('missing message');
        f.live.publishCommitted({
          channelId: group.id,
          message,
          revision: f.channels.revision(group.id),
        });
        if (cause === 'visibility')
          f.team.channelAccess.visibilitySet(owner, group.id, {
            kind: 'roles',
            roleIds: ['admin'],
          });
        else {
          const { role } = f.team.roles.create(owner, 'Revoked', []);
          f.team.roles.set(owner, f.human.humanId, [role.roleId]);
        }
        await f.team.accessSettled();
        expect(first.peer.signal.aborted).toBe(true);
        expect(second.peer.signal.aborted).toBe(true);
        expect(close).toHaveBeenCalledOnce();
        expect((await channel.next()).done).toBe(true);
        expect((await roster.next()).done).toBe(true);
        expect(await f.methods(f.human).channelMessages({ channelId: group.id })).toMatchObject({
          ok: false,
          error: { code: 'channel-not-found' },
        });
        expect(
          f.live.open(
            f.human,
            new Request(`http://localhost/api/botharness/stream?channelId=${group.id}`),
          ).status,
        ).toBe(404);
      } finally {
        abort.abort();
        await channel.return?.();
        await roster.return?.();
      }
    },
  );
});

describe('M4 migration and query budgets', () => {
  it('migrates public booleans and existing group owners without changing records or memberships', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`CREATE TABLE humans(human_id TEXT PRIMARY KEY); INSERT INTO humans VALUES ('owner');
        CREATE TABLE team_settings(owner_human_id TEXT); INSERT INTO team_settings VALUES ('owner');
        CREATE TABLE channel_records(channel_id TEXT PRIMARY KEY,record_json TEXT,public INTEGER);
        INSERT INTO channel_records VALUES ('public','{"type":"group"}',1),('private','{"type":"group"}',0);`);
      const migration = BOT_HARNESS_SCHEMA_PLAN.migrations.find(
        (m) => m.description === 'Channel visibility, Human ownership, policy and admins',
      );
      if (!migration) throw new Error('missing migration');
      migration.migrate(db);
      expect(
        db
          .prepare(
            'SELECT channel_id,visibility_json,owner_human_id FROM channel_records ORDER BY channel_id',
          )
          .all(),
      ).toEqual([
        { channel_id: 'private', visibility_json: '{"kind":"private"}', owner_human_id: 'owner' },
        { channel_id: 'public', visibility_json: '{"kind":"public"}', owner_human_id: 'owner' },
      ]);
      expect(db.prepare('SELECT record_json FROM channel_records').all()).toEqual([
        { record_json: '{"type":"group"}' },
        { record_json: '{"type":"group"}' },
      ]);
    } finally {
      db.close();
    }
  });
  it('bounds audience and browse queries independently of the Channel count', async () => {
    const f = await enabledFixture();
    f.database.transaction((db) => {
      const insert = db.prepare(
        'INSERT INTO channel_records(channel_id,record_json,owner_human_id,visibility_json) VALUES (?, ?, ?, ?)',
      );
      for (let index = 0; index < 1000; index++)
        insert.run(
          `scale-group-${index}`,
          JSON.stringify({
            id: `scale-group-${index}`,
            type: 'group',
            name: 'scale',
            members: [],
            createdAt: '2026-11-14',
            updatedAt: '2026-11-14',
          }),
          owner.humanId,
          '{"kind":"public"}',
        );
    });
    let before = f.db.diagnostics().metrics.reads;
    expect(f.team.channelAccess.visibleIds(f.human, false).size).toBe(1000);
    expect(f.db.diagnostics().metrics.reads - before).toBe(1);
    before = f.db.diagnostics().metrics.reads;
    expect(f.team.channelAccess.canRead(f.human, 'scale-group-999')).toBe(true);
    expect(f.db.diagnostics().metrics.reads - before).toBe(1);
  });
});

describe('M4 Channel admin delegation ceiling', { timeout: 60_000 }, () => {
  it('checks removed admins against a non-Owner Channel owner ceiling', async () => {
    const f = await enabledFixture();
    const alice = await f.team.createMember(owner, 'ceiling-alice', 'Alice');
    f.team.roles.set(owner, f.human.humanId, ['admin']);
    f.team.roles.set(owner, alice.member.humanId, ['admin']);
    const group = f.channels.createGroup(f.human, { name: 'Owned group', members: [] });
    f.team.channelAccess.addMember(f.human, group.id, alice.member.humanId);
    f.team.channelAccess.adminsSet(f.human, group.id, [alice.member.humanId]);
    f.team.roles.set(owner, f.human.humanId, ['member']);
    expect(() => f.team.channelAccess.adminsSet(f.human, group.id, [])).toThrow(
      'permission-required',
    );
    expect(f.team.channelAccess.view(f.human, group.id).admins).toEqual([
      { humanId: alice.member.humanId, displayName: 'Alice' },
    ]);
  });
});

describe('M4 review regressions', { timeout: 60_000 }, () => {
  const restrictedPolicy = {
    addMembers: 'admins',
    post: 'admins',
    mentionAll: 'admins',
    addBots: 'admins',
    editDetails: 'admins',
  } as const;

  it('retains joined Channel owners/admins while hiding an ordinary member after role loss', async () => {
    const f = await enabledFixture();
    const alice = await f.team.createMember(owner, 'design-alice', 'Alice');
    const human = humanContext(alice.member.humanId);
    const group = f.channels.createGroup(owner, { name: 'Design Room', members: [] });
    f.team.channelAccess.addMember(owner, group.id, 'bob');
    expect(() => f.team.channelAccess.adminsSet(owner, group.id, ['design-alice'])).toThrow(
      'member-not-found',
    );
    f.team.channelAccess.adminsSet(owner, group.id, ['bob']);
    const { role } = f.team.roles.create(owner, 'Design', ['channels.create', 'dm.humans']);
    f.team.roles.set(owner, human.humanId, [role.roleId]);
    f.team.channelAccess.visibilitySet(owner, group.id, { kind: 'roles', roleIds: [role.roleId] });
    expect(f.team.mode(owner).viewer.roleIds).not.toContain(role.roleId);
    expect(f.team.mode(f.human).viewer.roleIds).not.toContain(role.roleId);
    expect(() => f.team.channelAccess.addMember(owner, group.id, 'bob')).not.toThrow();
    expect(
      await f.methods(owner).channelSend({ channelId: group.id, body: 'design-review-secret' }),
    ).toMatchObject({ ok: true });
    expect(f.team.channelAccess.canRead(human, group.id)).toBe(true);
    f.team.roles.set(owner, human.humanId, ['member']);
    await f.team.accessSettled();
    for (const manager of [owner, f.human]) {
      expect(f.team.channelAccess.canRead(manager, group.id, true)).toBe(true);
      expect(f.team.channelAccess.visibleIds(manager).has(group.id)).toBe(true);
      expect(await f.methods(manager).channels({})).toMatchObject({
        ok: true,
        value: { channels: expect.arrayContaining([expect.objectContaining({ id: group.id })]) },
      });
      expect(f.methods(manager).channelGet({ channelId: group.id })).toMatchObject({
        ok: true,
        value: { role: manager === owner ? 'owner' : 'admin' },
      });
      expect(
        f.channels.searchAllHumanMessages?.(manager, { text: 'design-review-secret', limit: 10 }),
      ).toMatchObject({ hits: [expect.objectContaining({ channelId: group.id })] });
      const abort = new AbortController();
      const stream = f.live
        .followChannel(manager, group.id, 10, abort.signal)
        [Symbol.asyncIterator]();
      try {
        expect((await stream.next()).value).toMatchObject({ type: 'opened' });
      } finally {
        abort.abort();
        await stream.return?.();
      }
    }
    expect(f.team.channelAccess.canRead(human, group.id)).toBe(false);
    expect(f.team.channelAccess.visibleIds(human, false).has(group.id)).toBe(false);
    expect(await f.methods(human).channels({})).toMatchObject({
      ok: true,
      value: { channels: [] },
    });
    expect(
      f.channels.searchAllHumanMessages?.(human, { text: 'design-review-secret', limit: 10 }),
    ).toMatchObject({ hits: [] });
    expect(f.channels.hasHumanMembership?.(human, group.id)).toBe(false);
  });

  it('transfers a role-restricted Channel owner through M9, closes old streams and retains named access', async () => {
    const f = await enabledFixture();
    const alice = await f.team.createMember(owner, 'transfer-alice', 'Alice');
    const target = humanContext(alice.member.humanId);
    const group = f.channels.createGroup(f.human, { name: 'Transferred Design', members: [] });
    f.team.channelAccess.visibilitySet(f.human, group.id, { kind: 'roles', roleIds: ['admin'] });
    await f.team.changePassword(f.human, f.initialPassword, 'transfer-password-1');
    const login = await f.team.signIn('bob', 'transfer-password-1', 'transfer-ip');
    const response = f.live.open(
      f.human,
      new Request(`http://localhost/api/botharness/stream?channelId=${group.id}`),
    );
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    await reader.read();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      'channel/draft-baseline',
    );
    await f.team.transfer(owner, f.human.humanId, target.humanId);
    await f.team.accessSettled();
    expect(login.peer.signal.aborted).toBe(true);
    expect((await reader.read()).done).toBe(true);
    expect(f.team.channelAccess.canRead(f.human, group.id)).toBe(true);
    expect(f.team.channelAccess.view(target, group.id).role).toBe('owner');
    expect(f.team.transferPreview(owner, target.humanId).channels).toEqual([
      { channelId: group.id, name: 'Transferred Design' },
    ]);
    expect(f.channels.get(group.id)?.ownerHumanId).toBe(target.humanId);
    await reader.cancel();
  });

  it('uses the same active/group/management guard for policy and visibility writes', async () => {
    const f = await enabledFixture();
    const group = f.channels.createGroup(f.human, { name: 'Member managed', members: [] });
    const dm = f.channels.getOrCreateDm(owner, 'review-dm', 'Review DM');
    if (!dm) throw new Error('missing dm');
    const { role } = f.team.roles.create(owner, 'Channel managers', ['channels.manageAll']);
    const manager = await f.team.createMember(owner, 'policy-manager', 'Manager', [role.roleId]);
    const actor = humanContext(manager.member.humanId);
    for (const human of [owner, actor]) {
      expect(f.team.channelAccess.policySet(human, group.id, restrictedPolicy)).toBeNull();
      expect(() => f.team.channelAccess.policySet(human, dm.id, restrictedPolicy)).toThrow(
        'channel-not-found',
      );
      expect(() => f.team.channelAccess.policySet(human, 'missing', restrictedPolicy)).toThrow(
        'channel-not-found',
      );
    }
    f.database.transaction((db) =>
      db.prepare("UPDATE humans SET status = 'suspended' WHERE human_id = ?").run(actor.humanId),
    );
    expect(() =>
      f.team.channelAccess.policySet(actor, group.id, { ...restrictedPolicy, post: 'everyone' }),
    ).toThrow('permission-required');
    expect(f.team.channelAccess.view(f.human, group.id).policy).toEqual(restrictedPolicy);
  });

  it.each(['owner', 'admin'] as const)(
    'treats a joined Host %s as an admin for every policy',
    async (kind) => {
      const f = await enabledFixture();
      const creator = await f.team.createMember(owner, 'announcement-creator', 'Creator');
      const human = humanContext(creator.member.humanId);
      const group = f.channels.createGroup(human, { name: 'Member announcement', members: [] });
      f.team.channelAccess.visibilitySet(human, group.id, { kind: 'public' });
      const actor = kind === 'owner' ? owner : f.human;
      if (kind === 'admin') f.team.roles.set(owner, actor.humanId, ['admin']);
      f.team.channelAccess.policySet(human, group.id, restrictedPolicy);
      expect(f.team.channelAccess.view(actor, group.id).role).toBe('member');
      for (const key of Object.keys(restrictedPolicy)) {
        const parsed = z
          .enum(['addMembers', 'post', 'mentionAll', 'addBots', 'editDetails'])
          .parse(key);
        expect(() => f.team.channelAccess.requirePolicy(actor, group.id, parsed)).not.toThrow();
      }
      expect(
        await f.methods(actor).channelSend({ channelId: group.id, body: 'admin-policy-bypass' }),
      ).toMatchObject({ ok: true });
      expect(
        await f.methods(actor).channelRename({ channelId: group.id, name: 'Managed announcement' }),
      ).toMatchObject({ ok: true });
      expect(
        await f
          .methods(actor)
          .channelDescriptionSet({ channelId: group.id, description: 'managed' }),
      ).toMatchObject({ ok: true });
      expect(() =>
        f.team.channelAccess.requirePolicy(humanContext('missing'), group.id, 'post'),
      ).toThrow('channel-not-found');
    },
  );

  it('resolves usernames inside authorized Channel operations and keeps Human IDs working', async () => {
    const f = await enabledFixture();
    const alice = await f.team.createMember(owner, 'lookup-alice', 'Alice');
    const group = f.channels.createGroup(owner, { name: 'References', members: [] });
    f.team.channelAccess.addMember(owner, group.id, 'BOB');
    f.team.channelAccess.addMember(owner, group.id, alice.member.humanId);
    f.team.channelAccess.adminsSet(owner, group.id, ['bob', alice.member.humanId]);
    expect(
      f.team.channelAccess
        .view(owner, group.id)
        .admins.map((row) => row.humanId)
        .sort(),
    ).toEqual([f.human.humanId, alice.member.humanId].sort());
    expect(() => f.team.channelAccess.adminsSet(owner, group.id, ['missing'])).toThrow(
      'member-not-found',
    );
    expect(() => f.team.channelAccess.addMember(owner, group.id, 'missing')).toThrow(
      'member-not-found',
    );
    expect(() => f.team.channelAccess.adminsSet(f.human, group.id, ['missing'])).toThrow(
      'permission-required',
    );
    expect(f.team.channelAccess.view(owner, group.id).admins).toHaveLength(2);
  });

  it('returns the identical Gateway refusal for an invisible and nonexistent Channel id', async () => {
    const f = await enabledFixture();
    await f.team.changePassword(f.human, f.initialPassword, 'review-member-password-1');
    const group = f.channels.createGroup(owner, { name: 'Hidden Design', members: [] });
    f.team.channelAccess.visibilitySet(owner, group.id, { kind: 'roles', roleIds: ['admin'] });
    const login = await f.team.signIn('bob', 'review-member-password-1', 'review-ip');
    for (const channelId of [group.id, 'nonexistent-design-room']) {
      await expect(
        f.gateway.invoke({
          namespace: 'botharness',
          method: 'channelGet',
          args: { channelId },
          peer: login.peer,
        }),
      ).rejects.toMatchObject({
        code: 'remote-access/denied',
        details: { reason: 'channel-not-found' },
      });
    }
  });
});
