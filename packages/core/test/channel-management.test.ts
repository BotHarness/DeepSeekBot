import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createTempRoot } from './helpers.js';
import { cleanup, fixture, key, input, inviteFixture } from './support/channel-management.js';

afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of cleanup.splice(0).reverse()) await close();
});

describe('canonical Channel management receipts', () => {
  it('preserves initial membership and reuses one Group after retry and restart without reverting a later rename', async () => {
    const f = fixture();
    expect(f.owner.lookupCreate(key, input)).toBeUndefined();
    const created = f.owner.create(OWNER_HUMAN_CONTEXT, input, key);
    expect(created.channel.members).toEqual(['ada']);
    expect(created.channel.ownerBotSlug).toBeUndefined();
    expect(created.channel.invitations).toBeUndefined();
    expect(f.owner.create(OWNER_HUMAN_CONTEXT, input, key)).toEqual(created);
    f.core.channels.rename(OWNER_HUMAN_CONTEXT, created.channel.id, 'Renamed later');
    await f.close();
    const restarted = fixture(f.home);
    const replay = restarted.owner.create(OWNER_HUMAN_CONTEXT, input, key);
    expect(replay.receipt).toEqual(created.receipt);
    expect(replay.channel.name).toBe('Renamed later');
    expect(
      restarted.core.channels.list().filter((channel) => channel.type === 'group'),
    ).toHaveLength(1);
  });

  it('supports an empty Group and rejects conflicting payload or operation kind with no additional Group', () => {
    const f = fixture();
    const created = f.owner.create(OWNER_HUMAN_CONTEXT, { name: 'Empty', members: [] }, key);
    expect(created.channel.members).toEqual([]);
    expect(() => f.owner.create(OWNER_HUMAN_CONTEXT, input, key)).toThrowError(
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
      expect(() =>
        f.owner.create(OWNER_HUMAN_CONTEXT, { name: 'Invalid', members: [...members] }, key),
      ).toThrowError(expect.objectContaining({ code }));
    expect(
      f.database.read((db) => db.prepare('SELECT * FROM channel_management_operations').all()),
    ).toEqual([]);
    expect(f.core.channels.list()).toEqual([]);
  });

  it('recovers a committed Group after a lost response with effect-free lookup', async () => {
    const f = fixture();
    const create = f.core.channels.createGroup.bind(f.core.channels);
    const spy = vi.spyOn(f.core.channels, 'createGroup').mockImplementation((human, value) => {
      create(human, value);
      throw new Error('lost Group response');
    });
    expect(() => f.owner.create(OWNER_HUMAN_CONTEXT, input, key)).toThrow('lost Group response');
    const count = f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted;
    const receipt = f.owner.lookupCreate(key, input)!;
    expect(receipt.receipt?.status).toBe('completed');
    expect(f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted).toBe(count);
    spy.mockRestore();
    await f.close();
    const restarted = fixture(f.home);
    expect(restarted.owner.create(OWNER_HUMAN_CONTEXT, input, key).receipt).toEqual(
      receipt.receipt,
    );
    expect(
      restarted.core.channels.list().filter((channel) => channel.type === 'group'),
    ).toHaveLength(1);
  });

  it('never resurrects a deleted Group through a creation retry', () => {
    const f = fixture();
    const created = f.owner.create(OWNER_HUMAN_CONTEXT, input, key);
    f.core.channels.deleteGroup(created.channel.id);
    expect(() => f.owner.create(OWNER_HUMAN_CONTEXT, input, key)).toThrowError(
      expect.objectContaining({ code: 'channel-operation-unavailable' }),
    );
    expect(f.core.channels.get(created.channel.id)).toBeUndefined();
  });

  it('creates one pending invitation and admission, then replays it without auto-admitting or notifying twice', async () => {
    const f = inviteFixture();
    const result = f.owner.invite(OWNER_HUMAN_CONTEXT, f.invite, 'invite-operation-001');
    expect(result.invitation).toMatchObject({
      targetBotSlug: 'bob',
      inviterHuman: true,
      status: 'pending',
    });
    expect(result.channel.members).toEqual(['ada']);
    expect(f.admitted).toHaveBeenCalledTimes(1);
    expect(f.owner.invite(OWNER_HUMAN_CONTEXT, f.invite, 'invite-operation-001')).toEqual(result);
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
    const replay = restarted.owner.invite(OWNER_HUMAN_CONTEXT, f.invite, 'invite-operation-001');
    expect(replay.receipt).toEqual(result.receipt);
    expect(replay.invitation?.status).toBe('pending');
    expect(restarted.admitted).not.toHaveBeenCalled();
  });

  it('replays the same cancelled invitation instead of issuing a new invitation', () => {
    const f = inviteFixture();
    const first = f.owner.invite(OWNER_HUMAN_CONTEXT, f.invite, 'invite-operation-001');
    f.core.channels.cancelGroupInvite(first.channel.id, first.invitation!.id);
    const retry = f.owner.invite(OWNER_HUMAN_CONTEXT, f.invite, 'invite-operation-001');
    expect(retry.invitation).toMatchObject({ id: first.invitation!.id, status: 'cancelled' });
    expect(retry.channel.invitations).toHaveLength(1);
    expect(f.admitted).toHaveBeenCalledTimes(1);
  });

  it('returns the canonical accepted invitation after the invitee responds', () => {
    const f = inviteFixture();
    const first = f.owner.invite(OWNER_HUMAN_CONTEXT, f.invite, 'invite-operation-001');
    f.core.channels.respondToGroupInvite({
      invitationId: first.invitation!.id,
      targetBotSlug: 'bob',
      targetBotCreatedAt: f.core.registry.get('bob')!.createdAt,
      accept: true,
    });
    const replay = f.owner.invite(OWNER_HUMAN_CONTEXT, f.invite, 'invite-operation-001');
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
    expect(() =>
      f.owner.invite(OWNER_HUMAN_CONTEXT, f.invite, 'invite-operation-001'),
    ).toThrowError(expect.objectContaining({ code: 'group-invite-unavailable' }));
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
    expect(
      restarted.owner.invite(OWNER_HUMAN_CONTEXT, f.invite, 'invite-operation-001').receipt,
    ).toEqual(replay.receipt);
    expect(restarted.admitted).not.toHaveBeenCalled();
  });

  it('reuses an existing invitation without notifying again even with a distinct operation key', () => {
    const f = inviteFixture();
    const first = f.owner.invite(OWNER_HUMAN_CONTEXT, f.invite, 'invite-operation-001');
    const second = f.owner.invite(
      OWNER_HUMAN_CONTEXT,
      { ...f.invite, expectedChannel: first.channelFingerprint },
      'invite-operation-002',
    );
    expect(second.invitation?.id).toBe(first.invitation?.id);
    expect(second.receipt?.invitationId).toBe(first.invitation?.id);
    expect(f.admitted).toHaveBeenCalledTimes(1);
  });

  it('binds invitation retries to the original Bot incarnation and refuses archived targets', () => {
    const f = inviteFixture();
    f.owner.invite(OWNER_HUMAN_CONTEXT, f.invite, 'invite-operation-001');
    f.core.registry.setPaused('bob', true);
    expect(() =>
      f.owner.invite(OWNER_HUMAN_CONTEXT, f.invite, 'invite-operation-001'),
    ).toThrowError(expect.objectContaining({ code: 'archived-bot' }));
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
    expect(() =>
      f.owner.invite(OWNER_HUMAN_CONTEXT, f.invite, 'invite-operation-001'),
    ).toThrowError(expect.objectContaining({ code: 'stale-channel' }));
    const current = f.owner.snapshot(f.created.channel.id);
    const result = f.owner.invite(
      OWNER_HUMAN_CONTEXT,
      { ...f.invite, expectedChannel: current.channelFingerprint },
      'invite-operation-001',
    );
    expect(result.invitation).toMatchObject({ status: 'accepted', respondedBy: 'profile-policy' });
    expect(result.channel.members).toEqual(['ada', 'bob']);
    expect(result.invitationPolicy.autoAccept).toBe(true);
  });

  it('rejects management metadata changes but ignores ordinary message activity for conflict detection', async () => {
    const f = inviteFixture();
    await f.core.channels.appendMessage(OWNER_HUMAN_CONTEXT, f.created.channel.id, {
      id: 'message-1',
      author: { kind: 'human' },
      body: 'hello',
      at: new Date().toISOString(),
    });
    expect(f.owner.snapshot(f.created.channel.id).channelFingerprint).toBe(
      f.created.channelFingerprint,
    );
    f.core.channels.rename(OWNER_HUMAN_CONTEXT, f.created.channel.id, 'Changed');
    expect(() =>
      f.owner.invite(OWNER_HUMAN_CONTEXT, f.invite, 'invite-operation-001'),
    ).toThrowError(expect.objectContaining({ code: 'stale-channel' }));
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
    expect(() =>
      f.owner.invite(OWNER_HUMAN_CONTEXT, f.invite, 'invite-operation-001'),
    ).toThrowError(expect.objectContaining({ code: 'stale-channel' }));
    expect(f.core.channels.get(f.created.channel.id)?.invitations).toBeUndefined();
  });

  it('blocks protected Tob as invitation target, initial member, or malformed existing Group owner', () => {
    const f = inviteFixture();
    expect(() =>
      f.owner.invite(OWNER_HUMAN_CONTEXT, { ...f.invite, botSlug: 'tob' }, 'invite-protected-001'),
    ).toThrowError(expect.objectContaining({ code: 'protected-bot' }));
    const malformed = f.core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Invalid owner',
      members: ['tob'],
      ownerBotSlug: 'tob',
    });
    expect(() => f.owner.snapshot(malformed.id)).toThrowError(
      expect.objectContaining({ code: 'protected-bot' }),
    );
    expect(() =>
      f.owner.invite(OWNER_HUMAN_CONTEXT, { channelId: malformed.id, botSlug: 'bob' }),
    ).toThrowError(expect.objectContaining({ code: 'protected-bot' }));
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
