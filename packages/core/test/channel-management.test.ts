import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createChannelManagement } from '../src/channels/management.js';
import { createCore } from '../src/plugin.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createTempRoot } from './helpers.js';

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of cleanup.splice(0).reverse()) await close();
});
function fixture(home = createTempRoot('channel-management-')) {
  let autoAccept = false;
  const core = createCore({
    dshHome: home,
    autoAcceptGroupInvitations: () => autoAccept,
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      async close() {},
      requestAssignment() {
        throw new Error('unexpected');
      },
    },
  });
  const database = attachOperationalModule(core.operationalDatabase, 'channel-management-test');
  const admitted = vi.fn();
  const joinDecided = vi.fn();
  const owner = createChannelManagement({
    database,
    registry: core.registry,
    channels: core.channels,
    isProtectedBot: (slug) => slug === 'tob',
    autoAcceptGroupInvitations: () => autoAccept,
    onInvitation: admitted,
    onJoinDecision: joinDecided,
  });
  for (const slug of ['ada', 'bob'])
    if (!core.registry.get(slug)) core.registry.create({ slug, displayName: slug });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await core.runtime.close();
    core.operationalDatabase.close();
  };
  cleanup.push(close);
  return {
    home,
    core,
    database,
    owner,
    admitted,
    joinDecided,
    close,
    policy(value: boolean) {
      autoAccept = value;
    },
  };
}
const key = 'group-operation-001';
const input = { name: 'Research', members: ['ada'] };
function inviteFixture() {
  const f = fixture();
  const created = f.owner.create(input, key);
  const invite = {
    channelId: created.channel.id,
    botSlug: 'bob',
    expectedChannel: created.channelFingerprint,
  };
  return { ...f, created, invite };
}

describe('canonical Channel management receipts', () => {
  it('preserves initial membership and reuses one Group after retry and restart without reverting a later rename', async () => {
    const f = fixture();
    expect(f.owner.lookupCreate(key, input)).toBeUndefined();
    const created = f.owner.create(input, key);
    expect(created.channel.members).toEqual(['ada']);
    expect(created.channel.ownerBotSlug).toBeUndefined();
    expect(created.channel.invitations).toBeUndefined();
    expect(f.owner.create(input, key)).toEqual(created);
    f.core.channels.rename(created.channel.id, 'Renamed later');
    await f.close();
    const restarted = fixture(f.home);
    const replay = restarted.owner.create(input, key);
    expect(replay.receipt).toEqual(created.receipt);
    expect(replay.channel.name).toBe('Renamed later');
    expect(
      restarted.core.channels.list().filter((channel) => channel.type === 'group'),
    ).toHaveLength(1);
  });

  it('supports an empty Group and rejects conflicting payload or operation kind with no additional Group', () => {
    const f = fixture();
    const created = f.owner.create({ name: 'Empty', members: [] }, key);
    expect(created.channel.members).toEqual([]);
    expect(() => f.owner.create(input, key)).toThrowError(
      expect.objectContaining({ code: 'operation-key-conflict' }),
    );
    expect(() =>
      f.owner.lookupInvite(key, { channelId: created.channel.id, botSlug: 'ada' }),
    ).toThrowError(expect.objectContaining({ code: 'operation-key-conflict' }));
    expect(f.core.channels.list()).toHaveLength(1);
  });

  it('refuses invalid, archived, removed and protected initial members before reserving a key', () => {
    const f = fixture();
    f.core.registry.setPaused('ada', true);
    for (const [members, code] of [
      [['missing'], 'unknown-bot'],
      [['ada'], 'archived-bot'],
      [['tob'], 'protected-bot'],
      [['bob', 'bob'], 'invalid-input'],
    ] as const)
      expect(() => f.owner.create({ name: 'Invalid', members: [...members] }, key)).toThrowError(
        expect.objectContaining({ code }),
      );
    expect(
      f.database.read((db) => db.prepare('SELECT * FROM channel_management_operations').all()),
    ).toEqual([]);
    expect(f.core.channels.list()).toEqual([]);
  });

  it('recovers a committed Group after a lost response with effect-free lookup', async () => {
    const f = fixture();
    const create = f.core.channels.createGroup.bind(f.core.channels);
    const spy = vi.spyOn(f.core.channels, 'createGroup').mockImplementation((value) => {
      create(value);
      throw new Error('lost Group response');
    });
    expect(() => f.owner.create(input, key)).toThrow('lost Group response');
    const count = f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted;
    const receipt = f.owner.lookupCreate(key, input)!;
    expect(receipt.receipt?.status).toBe('completed');
    expect(f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted).toBe(count);
    spy.mockRestore();
    await f.close();
    const restarted = fixture(f.home);
    expect(restarted.owner.create(input, key).receipt).toEqual(receipt.receipt);
    expect(
      restarted.core.channels.list().filter((channel) => channel.type === 'group'),
    ).toHaveLength(1);
  });

  it('never resurrects a deleted Group through a creation retry', () => {
    const f = fixture();
    const created = f.owner.create(input, key);
    f.core.channels.deleteGroup(created.channel.id);
    expect(() => f.owner.create(input, key)).toThrowError(
      expect.objectContaining({ code: 'channel-operation-unavailable' }),
    );
    expect(f.core.channels.get(created.channel.id)).toBeUndefined();
  });

  it('creates one pending invitation and admission, then replays it without auto-admitting or notifying twice', async () => {
    const f = inviteFixture();
    const result = f.owner.invite(f.invite, 'invite-operation-001');
    expect(result.invitation).toMatchObject({
      targetBotSlug: 'bob',
      inviterHuman: true,
      status: 'pending',
    });
    expect(result.channel.members).toEqual(['ada']);
    expect(f.admitted).toHaveBeenCalledTimes(1);
    expect(f.owner.invite(f.invite, 'invite-operation-001')).toEqual(result);
    const before = f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted;
    expect(f.owner.lookupInvite('invite-operation-001', f.invite)).toEqual(result);
    expect(f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted).toBe(before);
    expect(f.admitted).toHaveBeenCalledTimes(1);
    const sources = () =>
      f.database.read((db) =>
        db
          .prepare('SELECT source_event_id FROM source_events WHERE message_id = ?')
          .all(result.invitation!.id),
      );
    expect(sources()).toHaveLength(1);
    await f.close();
    const restarted = fixture(f.home);
    const replay = restarted.owner.invite(f.invite, 'invite-operation-001');
    expect(replay.receipt).toEqual(result.receipt);
    expect(replay.invitation?.status).toBe('pending');
    expect(restarted.admitted).not.toHaveBeenCalled();
  });

  it('replays the same cancelled invitation instead of issuing a new invitation', () => {
    const f = inviteFixture();
    const first = f.owner.invite(f.invite, 'invite-operation-001');
    f.core.channels.cancelGroupInvite(first.channel.id, first.invitation!.id);
    const retry = f.owner.invite(f.invite, 'invite-operation-001');
    expect(retry.invitation).toMatchObject({ id: first.invitation!.id, status: 'cancelled' });
    expect(retry.channel.invitations).toHaveLength(1);
    expect(f.admitted).toHaveBeenCalledTimes(1);
  });

  it('returns the canonical accepted invitation after the invitee responds', () => {
    const f = inviteFixture();
    const first = f.owner.invite(f.invite, 'invite-operation-001');
    f.core.channels.respondToGroupInvite({
      invitationId: first.invitation!.id,
      targetBotSlug: 'bob',
      targetBotCreatedAt: f.core.registry.get('bob')!.createdAt,
      accept: true,
    });
    const replay = f.owner.invite(f.invite, 'invite-operation-001');
    expect(replay.invitation?.status).toBe('accepted');
    expect(replay.channel.members).toEqual(['ada', 'bob']);
    expect(f.admitted).toHaveBeenCalledTimes(1);
  });

  it('recovers a lost invitation response without duplicating its canonical source or admission', async () => {
    const f = inviteFixture();
    const invite = f.core.channels.inviteGroupBot.bind(f.core.channels);
    const spy = vi.spyOn(f.core.channels, 'inviteGroupBot').mockImplementation((value) => {
      invite(value);
      throw new Error('lost invitation response');
    });
    expect(() => f.owner.invite(f.invite, 'invite-operation-001')).toThrowError(
      expect.objectContaining({ code: 'group-invite-unavailable' }),
    );
    const replay = f.owner.lookupInvite('invite-operation-001', f.invite)!;
    expect(replay.receipt?.status).toBe('completed');
    expect(replay.channel.invitations).toHaveLength(1);
    expect(
      f.database.read((db) =>
        db
          .prepare('SELECT source_event_id FROM source_events WHERE message_id = ?')
          .all(replay.invitation!.id),
      ),
    ).toHaveLength(1);
    spy.mockRestore();
    await f.close();
    const restarted = fixture(f.home);
    expect(restarted.owner.invite(f.invite, 'invite-operation-001').receipt).toEqual(
      replay.receipt,
    );
    expect(restarted.admitted).not.toHaveBeenCalled();
  });

  it('reuses an existing invitation without notifying again even with a distinct operation key', () => {
    const f = inviteFixture();
    const first = f.owner.invite(f.invite, 'invite-operation-001');
    const second = f.owner.invite(
      { ...f.invite, expectedChannel: first.channelFingerprint },
      'invite-operation-002',
    );
    expect(second.invitation?.id).toBe(first.invitation?.id);
    expect(second.receipt?.invitationId).toBe(first.invitation?.id);
    expect(f.admitted).toHaveBeenCalledTimes(1);
  });

  it('binds invitation retries to the original Bot incarnation and refuses archived targets', () => {
    const f = inviteFixture();
    f.owner.invite(f.invite, 'invite-operation-001');
    f.core.registry.setPaused('bob', true);
    expect(() => f.owner.invite(f.invite, 'invite-operation-001')).toThrowError(
      expect.objectContaining({ code: 'archived-bot' }),
    );
    f.core.registry.setPaused('bob', false);
    const get = f.core.registry.get.bind(f.core.registry);
    vi.spyOn(f.core.registry, 'get').mockImplementation((slug) => {
      const bot = get(slug);
      return bot && slug === 'bob' ? { ...bot, createdAt: '2090-01-01T00:00:00.000Z' } : bot;
    });
    expect(() => f.owner.lookupInvite('invite-operation-001', f.invite)).toThrowError(
      expect.objectContaining({ code: 'channel-operation-unavailable' }),
    );
    expect(f.admitted).toHaveBeenCalledTimes(1);
  });

  it('preserves the existing auto-accept policy and rejects a policy changed after observation', () => {
    const f = inviteFixture();
    f.policy(true);
    expect(() => f.owner.invite(f.invite, 'invite-operation-001')).toThrowError(
      expect.objectContaining({ code: 'stale-channel' }),
    );
    const current = f.owner.snapshot(f.created.channel.id);
    const result = f.owner.invite(
      { ...f.invite, expectedChannel: current.channelFingerprint },
      'invite-operation-001',
    );
    expect(result.invitation).toMatchObject({ status: 'accepted', respondedBy: 'profile-policy' });
    expect(result.channel.members).toEqual(['ada', 'bob']);
    expect(result.invitationPolicy.autoAccept).toBe(true);
  });

  it('rejects management metadata changes but ignores ordinary message activity for conflict detection', async () => {
    const f = inviteFixture();
    await f.core.channels.appendMessage(f.created.channel.id, {
      id: 'message-1',
      author: { kind: 'human' },
      body: 'hello',
      at: new Date().toISOString(),
    });
    expect(f.owner.snapshot(f.created.channel.id).channelFingerprint).toBe(
      f.created.channelFingerprint,
    );
    f.core.channels.rename(f.created.channel.id, 'Changed');
    expect(() => f.owner.invite(f.invite, 'invite-operation-001')).toThrowError(
      expect.objectContaining({ code: 'stale-channel' }),
    );
    expect(f.admitted).not.toHaveBeenCalled();
  });

  it('checks the Group and policy again immediately after ensuring the target DM', () => {
    const f = inviteFixture();
    const ensure = f.core.channels.getOrCreateDm.bind(f.core.channels);
    vi.spyOn(f.core.channels, 'getOrCreateDm').mockImplementation((...args) => {
      const dm = ensure(...args);
      f.policy(true);
      return dm;
    });
    expect(() => f.owner.invite(f.invite, 'invite-operation-001')).toThrowError(
      expect.objectContaining({ code: 'stale-channel' }),
    );
    expect(f.core.channels.get(f.created.channel.id)?.invitations).toBeUndefined();
  });

  it('blocks protected Tob as invitation target, initial member, or malformed existing Group owner', () => {
    const f = inviteFixture();
    expect(() =>
      f.owner.invite({ ...f.invite, botSlug: 'tob' }, 'invite-protected-001'),
    ).toThrowError(expect.objectContaining({ code: 'protected-bot' }));
    const malformed = f.core.channels.createGroup({
      name: 'Invalid owner',
      members: ['tob'],
      ownerBotSlug: 'tob',
    });
    expect(() => f.owner.snapshot(malformed.id)).toThrowError(
      expect.objectContaining({ code: 'protected-bot' }),
    );
    expect(() => f.owner.invite({ channelId: malformed.id, botSlug: 'bob' })).toThrowError(
      expect.objectContaining({ code: 'protected-bot' }),
    );
  });

  it('migrates generation 97 receipts without changing their Bot identity', () => {
    const home = createTempRoot('channel-management-migration-');
    const before = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 97),
      ),
    });
    attachOperationalModule(before, 'migration-test').transaction((db) => {
      db.prepare(
        "INSERT INTO bot_creation_operations(operation_key,payload_hash,bot_slug,status) VALUES(?,?,?,'created')",
      ).run('original-key', 'original-hash', 'original-bot');
    });
    before.close();
    const after = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    cleanup.push(() => after.close());
    expect(after.generation).toBe(BOT_HARNESS_SCHEMA_PLAN.targetGeneration);
    const port = attachOperationalModule(after, 'migration-test');
    expect(
      port.read((db) => db.prepare('SELECT bot_slug FROM bot_creation_operations').get()),
    ).toEqual({ bot_slug: 'original-bot' });
    expect(
      port.read((db) => db.prepare('SELECT * FROM channel_management_operations').all()),
    ).toEqual([]);
  });
});

describe('reviewed Group edits', () => {
  it('shares reviewed Group ownership with the Human bridge and returns coded stale failures', () => {
    const f = fixture();
    const methods = createBridgeMethods({
      registry: f.core.registry,
      channels: f.core.channels,
      states: f.core.states,
      ownership: f.core.ownership,
      roster: f.core.roster,
      channelManagement: f.owner,
    });
    const created = f.owner.create({ name: 'Bridge group', members: ['ada', 'bob'] });
    const channelId = created.channel.id;
    expect(
      methods.channelRename({
        channelId,
        name: 'Bridge renamed',
        expectedChannel: created.channelFingerprint,
      }),
    ).toMatchObject({ ok: true, value: { channel: { name: 'Bridge renamed' } } });
    const stale = { channelId, expectedChannel: created.channelFingerprint };
    expect(methods.channelGroupMemberRemove({ ...stale, botSlug: 'ada' })).toMatchObject({
      ok: false,
      error: { code: 'stale-channel' },
    });
    expect(
      methods.channelGroupWakeSet({
        ...stale,
        botSlug: 'ada',
        mode: 'silent',
        count: 5,
        intervalSeconds: 30,
      }),
    ).toMatchObject({ ok: false, error: { code: 'stale-channel' } });
    expect(methods.channelGroupAvatarSet({ ...stale, avatar: null })).toMatchObject({
      ok: false,
      error: { code: 'stale-channel' },
    });
    expect(methods.channelGroupMemberRemove({ channelId, botSlug: 'bob' })).toMatchObject({
      ok: true,
      value: { channel: { members: ['ada'] } },
    });
    const dm = f.core.channels.getOrCreateDm('ada', 'Ada')!;
    expect(
      methods.channelRename({
        channelId: dm.id,
        name: 'Unrelated rename',
        expectedChannel: created.channelFingerprint,
      }),
    ).toMatchObject({ ok: false, error: { code: 'not-group-channel' } });
    expect(f.core.registry.get('ada')?.displayName).toBe('ada');
  });

  function group() {
    const f = fixture();
    const created = f.owner.create({ name: 'Research', members: ['ada', 'bob'] });
    return { ...f, id: created.channel.id, created };
  }
  function leave(f: ReturnType<typeof group>) {
    f.database.transaction((db) =>
      db
        .prepare(
          "UPDATE channel_human_members SET left_at = ? WHERE channel_id = ? AND human_id = 'local-human'",
        )
        .run(new Date().toISOString(), f.id),
    );
  }
  const png = 'data:image/png;base64,iVBORw0KGgo=';

  it('renames and changes avatar through the canonical owner, then persists both after restart', async () => {
    const f = group();
    const renamed = f.owner.rename({
      channelId: f.id,
      name: 'Edited',
      expectedChannel: f.created.channelFingerprint,
    });
    expect(renamed.channel.name).toBe('Edited');
    expect(renamed.channelFingerprint).not.toBe(f.created.channelFingerprint);
    const avatar = f.owner.setAvatar({
      channelId: f.id,
      avatar: png,
      expectedChannel: renamed.channelFingerprint,
    });
    expect(avatar.channel.avatar).toBe(png);
    await f.close();
    const restarted = fixture(f.home);
    expect(restarted.owner.snapshot(f.id).channel).toMatchObject({ name: 'Edited', avatar: png });
    const cleared = restarted.owner.setAvatar({
      channelId: f.id,
      avatar: null,
      expectedChannel: avatar.channelFingerprint,
    });
    expect(cleared.channel.avatar).toBeUndefined();
  });

  it('rejects invalid names and avatar bytes without changing the Group', () => {
    const f = group();
    for (const name of ['', ' '.repeat(3), 'x'.repeat(121), 'a\nb'])
      expect(() => f.owner.rename({ channelId: f.id, name })).toThrowError(
        expect.objectContaining({ code: 'invalid-input' }),
      );
    expect(() =>
      f.owner.setAvatar({ channelId: f.id, avatar: 'https://example.com/avatar.png' }),
    ).toThrowError(expect.objectContaining({ code: 'invalid-input' }));
    expect(f.owner.snapshot(f.id).channelFingerprint).toBe(f.created.channelFingerprint);
  });

  it('binds each edit to the observed Group and refuses stale retried changes', () => {
    const f = group();
    f.owner.rename({ channelId: f.id, name: 'New title' });
    const expectedChannel = f.created.channelFingerprint;
    const edits = [
      () => f.owner.rename({ channelId: f.id, name: 'Reviewed old title', expectedChannel }),
      () => f.owner.setAvatar({ channelId: f.id, avatar: png, expectedChannel }),
      () =>
        f.owner.setWake({
          channelId: f.id,
          botSlug: 'ada',
          mode: 'silent',
          count: 5,
          intervalSeconds: 30,
          expectedChannel,
        }),
      () => f.owner.removeMember({ channelId: f.id, botSlug: 'ada', expectedChannel }),
    ];
    for (const edit of edits)
      expect(edit).toThrowError(expect.objectContaining({ code: 'stale-channel' }));
    expect(f.core.channels.get(f.id)).toMatchObject({ name: 'New title', members: ['ada', 'bob'] });
  });

  it('detects inherited wake-default changes even when the Group record is unchanged', () => {
    const f = group();
    const before = f.owner.wakePolicies(f.id);
    expect(before.wakePolicies[0]).toMatchObject({
      botSlug: 'ada',
      inherited: true,
      policy: { mode: 'digest' },
    });
    f.core.sourcePolicy.setGroupOrdinary('ada', 'silent', 5, 30, { kind: 'human' });
    expect(f.core.channels.get(f.id)).toEqual(before.channel);
    expect(f.owner.snapshot(f.id).channelFingerprint).not.toBe(before.channelFingerprint);
    expect(() =>
      f.owner.setWake({
        channelId: f.id,
        botSlug: 'ada',
        mode: 'all',
        count: 5,
        intervalSeconds: 30,
        expectedChannel: before.channelFingerprint,
      }),
    ).toThrowError(expect.objectContaining({ code: 'stale-channel' }));
    const current = f.owner.wakePolicies(f.id);
    const changed = f.owner.setWake({
      channelId: f.id,
      botSlug: 'ada',
      mode: 'mentions',
      count: 5,
      intervalSeconds: 30,
      expectedChannel: current.channelFingerprint,
    });
    expect(changed.wakePolicies[0]).toMatchObject({
      inherited: false,
      policy: { mode: 'mentions', lastActor: { kind: 'human' } },
    });
    const reset = f.owner.setWake({
      channelId: f.id,
      botSlug: 'ada',
      mode: 'digest',
      count: 5,
      intervalSeconds: 30,
      inherit: true,
      expectedChannel: changed.channelFingerprint,
    });
    expect(reset.wakePolicies[0]).toMatchObject({ inherited: true, policy: { mode: 'silent' } });
  });

  it('refuses reads and edits after the Human leaves, including departure during the final check', () => {
    const f = group();
    leave(f);
    for (const change of [
      () => f.owner.wakePolicies(f.id),
      () => f.owner.rename({ channelId: f.id, name: 'No' }),
      () => f.owner.setAvatar({ channelId: f.id, avatar: png }),
      () =>
        f.owner.setWake({
          channelId: f.id,
          botSlug: 'ada',
          mode: 'all',
          count: 5,
          intervalSeconds: 30,
        }),
      () => f.owner.removeMember({ channelId: f.id, botSlug: 'ada' }),
    ])
      expect(change).toThrowError(expect.objectContaining({ code: 'channel-access-denied' }));
    const second = group();
    const members = second.core.channels.listHumanMembers.bind(second.core.channels);
    let reads = 0;
    vi.spyOn(second.core.channels, 'listHumanMembers').mockImplementation((id) => {
      if (++reads === 2) leave(second);
      return members(id);
    });
    expect(() =>
      second.owner.rename({ channelId: second.id, name: 'Denied mid-operation' }),
    ).toThrowError(expect.objectContaining({ code: 'channel-access-denied' }));
    expect(second.core.channels.get(second.id)?.name).toBe('Research');
  });

  it('removes archived members once, keeping the departure event and owner cleanup canonical', () => {
    const f = fixture();
    const created = f.core.channels.createGroup({
      name: 'Owner group',
      members: ['ada', 'bob'],
      ownerBotSlug: 'ada',
    });
    f.core.channels.setGroupWakePolicy(created.id, 'ada', {
      mode: 'silent',
      count: 5,
      intervalSeconds: 30,
    });
    f.core.registry.setPaused('ada', true);
    const before = f.owner.snapshot(created.id);
    const removed = f.owner.removeMember({
      channelId: created.id,
      botSlug: 'ada',
      expectedChannel: before.channelFingerprint,
    });
    expect(removed.channel.members).toEqual(['bob']);
    expect(removed.channel.ownerBotSlug).toBeUndefined();
    expect(removed.channel.wakePolicies?.ada).toBeUndefined();
    const departures = () =>
      f.database.read((db) =>
        db
          .prepare(
            "SELECT message_id FROM source_events WHERE channel_id = ? AND message_id LIKE 'member-left-%'",
          )
          .all(created.id),
      );
    expect(departures()).toHaveLength(1);
    expect(() =>
      f.owner.removeMember({
        channelId: created.id,
        botSlug: 'ada',
        expectedChannel: before.channelFingerprint,
      }),
    ).toThrowError(expect.objectContaining({ code: 'stale-channel' }));
    expect(departures()).toHaveLength(1);
    f.core.registry.setPaused('ada', false);
    f.policy(true);
    f.owner.invite({ channelId: created.id, botSlug: 'ada' });
    expect(() =>
      f.owner.removeMember({
        channelId: created.id,
        botSlug: 'ada',
        expectedChannel: before.channelFingerprint,
      }),
    ).toThrowError(expect.objectContaining({ code: 'stale-channel' }));
    expect(f.core.channels.get(created.id)?.members).toContain('ada');
    expect(departures()).toHaveLength(1);
  });

  it('requires an existing Group member and protects Tob from member mutations', () => {
    const f = group();
    expect(() => f.owner.removeMember({ channelId: f.id, botSlug: 'tob' })).toThrowError(
      expect.objectContaining({ code: 'protected-bot' }),
    );
    expect(() => f.owner.removeMember({ channelId: f.id, botSlug: 'other' })).toThrowError(
      expect.objectContaining({ code: 'not-group-member' }),
    );
    const dm = f.core.channels.getOrCreateDm('ada', 'Ada')!;
    expect(() => f.owner.rename({ channelId: dm.id, name: 'No' })).toThrowError(
      expect.objectContaining({ code: 'not-group-channel' }),
    );
    f.core.channels.deleteGroup(f.id);
    expect(() => f.owner.rename({ channelId: f.id, name: 'No' })).toThrowError(
      expect.objectContaining({ code: 'unknown-channel' }),
    );
  });
});

describe('reviewed pending Group decisions', () => {
  function pendingInvite() {
    const f = inviteFixture();
    const invited = f.owner.invite(f.invite);
    return {
      ...f,
      id: invited.channel.id,
      invitationId: invited.invitation!.id,
      observed: invited.channelFingerprint,
    };
  }
  function pendingJoin() {
    const f = fixture();
    const group = f.core.channels.createGroup({
      name: 'Owned Group',
      members: ['ada'],
      ownerBotSlug: 'ada',
    });
    const ownerDm = f.core.channels.getOrCreateDm('ada', 'Ada')!;
    const request = f.core.channels.requestGroupJoin({
      channelId: group.id,
      requesterBotSlug: 'bob',
      requesterBotCreatedAt: f.core.registry.get('bob')!.createdAt,
      ownerDmChannelId: ownerDm.id,
    });
    return {
      ...f,
      id: group.id,
      requestId: request.id,
      observed: f.owner.snapshot(group.id).channelFingerprint,
    };
  }
  function decisionEvents(f: ReturnType<typeof pendingJoin>) {
    return f.database.read((db) =>
      db
        .prepare('SELECT source_event_id FROM source_events WHERE message_id = ?')
        .all('group-join-decision-' + f.requestId),
    );
  }
  function leave(f: ReturnType<typeof fixture>, id: string) {
    f.database.transaction((db) =>
      db
        .prepare(
          "UPDATE channel_human_members SET left_at = ? WHERE channel_id = ? AND human_id = 'local-human'",
        )
        .run(new Date().toISOString(), id),
    );
  }
  function bridge(f: ReturnType<typeof fixture>) {
    return createBridgeMethods({
      registry: f.core.registry,
      channels: f.core.channels,
      states: f.core.states,
      ownership: f.core.ownership,
      roster: f.core.roster,
      runtime: f.core.runtime,
      channelManagement: f.owner,
    });
  }

  it('cancels only a pending invitation, settles its admission and persists without touching membership', async () => {
    const f = pendingInvite();
    const result = f.owner.cancelInvite({
      channelId: f.id,
      invitationId: f.invitationId,
      expectedChannel: f.observed,
    });
    expect(result.channel.members).toEqual(['ada']);
    expect(result.channel.invitations?.find((entry) => entry.id === f.invitationId)?.status).toBe(
      'cancelled',
    );
    expect(
      f.database.read((db) =>
        db
          .prepare(
            'SELECT attempt_state FROM inbox_admissions WHERE source_event_id IN (SELECT source_event_id FROM source_events WHERE message_id = ?)',
          )
          .all(f.invitationId),
      ),
    ).toEqual([{ attempt_state: 'handled' }]);
    const transactions = f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted;
    expect(() =>
      f.owner.cancelInvite({
        channelId: f.id,
        invitationId: f.invitationId,
        expectedChannel: f.observed,
      }),
    ).toThrowError(expect.objectContaining({ code: 'stale-channel' }));
    expect(() =>
      f.owner.cancelInvite({
        channelId: f.id,
        invitationId: f.invitationId,
        expectedChannel: result.channelFingerprint,
      }),
    ).toThrowError(expect.objectContaining({ code: 'invitation-not-pending' }));
    expect(f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted).toBe(
      transactions,
    );
    expect(f.admitted).toHaveBeenCalledTimes(1);
    await f.close();
    const restarted = fixture(f.home);
    expect(restarted.owner.snapshot(f.id).channel.invitations?.[0]?.status).toBe('cancelled');
  });

  it('does not reinterpret an automatically accepted invitation as removal', () => {
    const f = inviteFixture();
    f.policy(true);
    const accepted = f.owner.invite({ channelId: f.created.channel.id, botSlug: 'bob' });
    expect(accepted.invitation?.status).toBe('accepted');
    expect(() =>
      f.owner.cancelInvite({
        channelId: accepted.channel.id,
        invitationId: accepted.invitation!.id,
        expectedChannel: accepted.channelFingerprint,
      }),
    ).toThrowError(expect.objectContaining({ code: 'invitation-not-pending' }));
    expect(f.core.channels.get(accepted.channel.id)?.members).toEqual(['ada', 'bob']);
  });

  it('permits paused-target invitation cleanup but rejects missing or reincarnated targets', () => {
    const f = pendingInvite();
    const get = f.core.registry.get.bind(f.core.registry);
    const spy = vi.spyOn(f.core.registry, 'get').mockImplementation((slug) => {
      const record = get(slug);
      return slug === 'bob' && record ? { ...record, paused: true } : record;
    });
    expect(
      f.owner.cancelInvite({ channelId: f.id, invitationId: f.invitationId }).channel
        .invitations?.[0]?.status,
    ).toBe('cancelled');
    spy.mockRestore();
    const second = pendingInvite();
    const secondGet = second.core.registry.get.bind(second.core.registry);
    const target = secondGet('bob')!;
    const missing = vi
      .spyOn(second.core.registry, 'get')
      .mockImplementation((slug) => (slug === 'bob' ? undefined : secondGet(slug)));
    expect(() =>
      second.owner.cancelInvite({ channelId: second.id, invitationId: second.invitationId }),
    ).toThrowError(expect.objectContaining({ code: 'unknown-bot' }));
    missing.mockImplementation((slug) =>
      slug === 'bob' ? { ...target, createdAt: '2099-01-01T00:00:00.000Z' } : secondGet(slug),
    );
    expect(() =>
      second.owner.cancelInvite({ channelId: second.id, invitationId: second.invitationId }),
    ).toThrowError(expect.objectContaining({ code: 'stale-profile' }));
    expect(second.core.channels.get(second.id)?.invitations?.[0]?.status).toBe('pending');
  });

  it.each([true, false])(
    'decides a pending request once (accept=%s), preserving canonical notification and Human replay',
    async (accept) => {
      const f = pendingJoin();
      const result = f.owner.decideJoin({
        channelId: f.id,
        requestId: f.requestId,
        accept,
        expectedChannel: f.observed,
      });
      expect(result.channel.joinRequests?.[0]).toMatchObject({
        status: accept ? 'accepted' : 'declined',
        decidedBy: 'human',
      });
      expect(result.channel.members.includes('bob')).toBe(accept);
      expect(f.joinDecided).toHaveBeenCalledExactlyOnceWith('dm-bob', f.requestId);
      expect(decisionEvents(f)).toHaveLength(1);
      expect(
        f.database.read((db) =>
          db
            .prepare(
              "SELECT attempt_state FROM inbox_admissions WHERE reason = 'group-join-request' AND source_event_id IN (SELECT source_event_id FROM source_events WHERE message_id = ?)",
            )
            .all(f.requestId),
        ),
      ).toEqual([{ attempt_state: 'handled' }]);
      const transactions = f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted;
      expect(f.owner.decideJoin({ channelId: f.id, requestId: f.requestId, accept })).toEqual(
        result,
      );
      expect(() =>
        f.owner.decideJoin({
          channelId: f.id,
          requestId: f.requestId,
          accept,
          expectedChannel: f.observed,
        }),
      ).toThrowError(expect.objectContaining({ code: 'stale-channel' }));
      expect(() =>
        f.owner.decideJoin({
          channelId: f.id,
          requestId: f.requestId,
          accept,
          expectedChannel: result.channelFingerprint,
        }),
      ).toThrowError(expect.objectContaining({ code: 'join-request-not-pending' }));
      expect(f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted).toBe(
        transactions,
      );
      expect(f.joinDecided).toHaveBeenCalledTimes(1);
      await f.close();
      const restarted = fixture(f.home);
      expect(
        restarted.owner.decideJoin({ channelId: f.id, requestId: f.requestId, accept }).channel
          .joinRequests?.[0]?.status,
      ).toBe(accept ? 'accepted' : 'declined');
      expect(restarted.joinDecided).not.toHaveBeenCalled();
    },
  );

  it('checks current request status, Group access and target identity before a decision', () => {
    const f = pendingJoin();
    const target = f.core.registry.get('bob')!;
    const get = f.core.registry.get.bind(f.core.registry);
    const changed = vi
      .spyOn(f.core.registry, 'get')
      .mockImplementation((slug) => (slug === 'bob' ? { ...target, paused: true } : get(slug)));
    expect(() =>
      f.owner.decideJoin({ channelId: f.id, requestId: f.requestId, accept: false }),
    ).toThrowError(expect.objectContaining({ code: 'archived-bot' }));
    changed.mockImplementation((slug) => (slug === 'bob' ? undefined : get(slug)));
    expect(() =>
      f.owner.decideJoin({ channelId: f.id, requestId: f.requestId, accept: true }),
    ).toThrowError(expect.objectContaining({ code: 'unknown-bot' }));
    changed.mockImplementation((slug) =>
      slug === 'bob' ? { ...target, createdAt: '2099-01-01T00:00:00.000Z' } : get(slug),
    );
    expect(() =>
      f.owner.decideJoin({ channelId: f.id, requestId: f.requestId, accept: true }),
    ).toThrowError(expect.objectContaining({ code: 'stale-profile' }));
    changed.mockRestore();
    leave(f, f.id);
    expect(() =>
      f.owner.decideJoin({ channelId: f.id, requestId: f.requestId, accept: true }),
    ).toThrowError(expect.objectContaining({ code: 'channel-access-denied' }));
    expect(decisionEvents(f)).toHaveLength(0);
    expect(f.joinDecided).not.toHaveBeenCalled();
    expect(f.core.channels.get(f.id)?.joinRequests?.[0]?.status).toBe('pending');
  });

  it('rechecks Group and requester after ensuring the requester DM', () => {
    const f = pendingJoin();
    const ensure = f.core.channels.getOrCreateDm.bind(f.core.channels);
    vi.spyOn(f.core.channels, 'getOrCreateDm').mockImplementation((...args) => {
      const dm = ensure(...args);
      f.core.channels.rename(f.id, 'Changed during DM creation');
      return dm;
    });
    expect(() =>
      f.owner.decideJoin({
        channelId: f.id,
        requestId: f.requestId,
        accept: true,
        expectedChannel: f.observed,
      }),
    ).toThrowError(expect.objectContaining({ code: 'stale-channel' }));
    expect(decisionEvents(f)).toHaveLength(0);
    expect(f.joinDecided).not.toHaveBeenCalled();
  });

  it('reports unknown targets, protects acceptance of Tob and preserves Human protected-decline cleanup', () => {
    const f = pendingJoin();
    expect(() => f.owner.cancelInvite({ channelId: f.id, invitationId: 'missing' })).toThrowError(
      expect.objectContaining({ code: 'unknown-invitation' }),
    );
    expect(() =>
      f.owner.decideJoin({ channelId: f.id, requestId: 'missing', accept: true }),
    ).toThrowError(expect.objectContaining({ code: 'unknown-join-request' }));
    const tob = f.core.registry.create({ slug: 'tob', displayName: 'Tob' });
    if (!tob.ok) throw new Error('fixture Tob creation failed');
    const request = f.core.channels.requestGroupJoin({
      channelId: f.id,
      requesterBotSlug: 'tob',
      requesterBotCreatedAt: tob.record.createdAt,
    });
    expect(() =>
      f.owner.decideJoin({ channelId: f.id, requestId: request.id, accept: true }),
    ).toThrowError(expect.objectContaining({ code: 'protected-bot' }));
    const declined = f.owner.decideJoin({ channelId: f.id, requestId: request.id, accept: false });
    expect(declined.channel.joinRequests?.find((entry) => entry.id === request.id)?.status).toBe(
      'declined',
    );
    expect(declined.channel.members).not.toContain('tob');
  });

  it('wires committed decisions into the live Core admission callback exactly once', () => {
    const f = pendingJoin();
    const admitted = vi
      .spyOn(f.core.runtime, 'admitGroupJoinDecision')
      .mockImplementation(() => {});
    f.core.channelManagement.decideJoin({
      channelId: f.id,
      requestId: f.requestId,
      accept: true,
      expectedChannel: f.observed,
    });
    expect(admitted).toHaveBeenCalledExactlyOnceWith('dm-bob', f.requestId);
    f.core.channelManagement.decideJoin({ channelId: f.id, requestId: f.requestId, accept: true });
    expect(admitted).toHaveBeenCalledTimes(1);
  });

  it('does not cancel after Human access is revoked or the target invitation changes', () => {
    const f = pendingInvite();
    f.core.channels.rename(f.id, 'Changed while reviewing');
    expect(() =>
      f.owner.cancelInvite({
        channelId: f.id,
        invitationId: f.invitationId,
        expectedChannel: f.observed,
      }),
    ).toThrowError(expect.objectContaining({ code: 'stale-channel' }));
    leave(f, f.id);
    expect(() =>
      f.owner.cancelInvite({ channelId: f.id, invitationId: f.invitationId }),
    ).toThrowError(expect.objectContaining({ code: 'channel-access-denied' }));
    expect(f.core.channels.get(f.id)?.invitations?.[0]?.status).toBe('pending');
  });

  it('shares decisions with the Human bridge without duplicate runtime notifications', () => {
    const f = pendingJoin();
    const methods = bridge(f);
    const runtime = vi.spyOn(f.core.runtime, 'admitGroupJoinDecision');
    const result = methods.channelGroupJoinDecide({
      channelId: f.id,
      requestId: f.requestId,
      accept: true,
      expectedChannel: f.observed,
    });
    expect(result).toMatchObject({ ok: true, value: { channel: { members: ['ada', 'bob'] } } });
    expect(
      methods.channelGroupJoinDecide({ channelId: f.id, requestId: f.requestId, accept: true }),
    ).toMatchObject({ ok: true });
    expect(
      methods.channelGroupJoinDecide({
        channelId: f.id,
        requestId: f.requestId,
        accept: true,
        expectedChannel: f.observed,
      }),
    ).toMatchObject({ ok: false, error: { code: 'stale-channel' } });
    expect(f.joinDecided).toHaveBeenCalledTimes(1);
    expect(runtime).not.toHaveBeenCalled();
    const invited = pendingInvite();
    expect(
      bridge(invited).channelGroupInviteCancel({
        channelId: invited.id,
        invitationId: invited.invitationId,
        expectedChannel: invited.observed,
      }),
    ).toMatchObject({ ok: true, value: { channel: { invitations: [{ status: 'cancelled' }] } } });
  });
});
