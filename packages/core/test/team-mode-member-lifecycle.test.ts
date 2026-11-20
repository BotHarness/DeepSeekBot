import { createDevicePairing } from '../src/devices/pairing.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { enabledFixture, cleanup } from './team-mode-fixtures.js';

afterEach(cleanup);

describe('M9 member lifecycle', { timeout: 60_000 }, () => {
  const operations = [
    'memberPasswordReset',
    'memberDeactivate',
    'memberReactivate',
    'memberTransferPreview',
    'memberTransfer',
    'memberPurgePreview',
    'memberPurgeConfirm',
  ] as const;
  const payload = (humanId: string) => ({
    humanId,
    toHumanId: owner.humanId,
    token: 'invalid',
    username: 'bob',
  });

  it.each(operations)(
    '%s enforces permission, Owner protection, self protection and missing targets at the service boundary',
    async (method) => {
      const f = await enabledFixture();
      const { createTeamBridge } = await import('../src/team/bridge.js');
      expect(await createTeamBridge(f.human, f.team)[method](payload('absent'))).toMatchObject({
        ok: false,
        error: { code: 'permission-required', details: { permission: 'members.manage' } },
      });
      f.team.roles.set(owner, f.human.humanId, ['admin']);
      expect(await createTeamBridge(f.human, f.team)[method](payload(owner.humanId))).toMatchObject(
        { ok: false, error: { code: 'owner-protected' } },
      );
      expect(
        await createTeamBridge(f.human, f.team)[method](payload(f.human.humanId)),
      ).toMatchObject({ ok: false, error: { code: 'permission-required' } });
      expect(await createTeamBridge(owner, f.team)[method](payload('absent'))).toMatchObject({
        ok: false,
        error: { code: 'member-not-found' },
      });
      const alice = await f.team.createMember(owner, 'alice', 'Alice', ['admin']);
      expect(
        await createTeamBridge(f.human, f.team)[method](payload(alice.member.humanId)),
      ).toMatchObject({
        ok: false,
        error: { code: 'permission-required', details: { permission: 'owner' } },
      });
      const manager = f.team.roles.create(owner, 'Manager', ['members.manage']).role;
      f.team.roles.set(owner, f.human.humanId, [manager.roleId]);
      f.team.roles.set(owner, alice.member.humanId, ['member']);
      await f.team.deactivate(owner, alice.member.humanId);
      expect(
        await createTeamBridge(f.human, f.team)[method](payload(alice.member.humanId)),
      ).toMatchObject({ ok: false, error: { code: 'permission-not-grantable' } });
    },
  );

  function paired(f: Awaited<ReturnType<typeof enabledFixture>>) {
    const pairing = createDevicePairing({
      database: f.database,
      hostName: 'M9',
      ownerHumanId: () => f.human.humanId,
    });
    f.team.bindPairing(pairing);
    const result = pairing.redeem({ offer: pairing.createOffer().offer });
    if (!result.ok) throw new Error('pairing failed');
    const closed = vi.fn();
    pairing.attachStream(result.device.id, closed);
    return { pairing, result, closed };
  }

  it.each(['reset', 'deactivate', 'off', 'bot-permission'] as const)(
    '%s closes every browser Peer and paired stream and refuses stale calls',
    async (operation) => {
      const f = await enabledFixture();
      if (operation === 'bot-permission')
        f.team.roles.update(owner, 'member', { permissions: ['dm.humans', 'bots.createPrivate'] });
      await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
      const first = await f.team.signIn('bob', 'member-password-1', 'first');
      const second = await f.team.signIn('bob', 'member-password-1', 'second');
      const device = paired(f);
      const stream = await f.gateway.stream({
        namespace: 'botharness',
        method: 'followRoster',
        args: {},
        peer: first.peer,
      });
      const reader = stream[Symbol.asyncIterator]();
      await reader.next();
      const pending =
        operation === 'bot-permission'
          ? expect(reader.next()).resolves.toEqual({ done: true, value: undefined })
          : expect(reader.next()).rejects.toThrow('aborted');
      if (operation === 'reset') await f.team.resetPassword(owner, f.human.humanId);
      if (operation === 'deactivate') await f.team.deactivate(owner, f.human.humanId);
      if (operation === 'off') await f.team.setMode(owner, false);
      if (operation === 'bot-permission') {
        f.team.roles.update(owner, 'member', { permissions: ['dm.humans'] });
        await f.team.accessSettled();
        expect(f.methods(f.human).create({ displayName: 'Refused' })).toMatchObject({
          ok: false,
          error: { code: 'permission-required', details: { permission: 'bots.createPrivate' } },
        });
      }
      expect(first.peer.signal.aborted && second.peer.signal.aborted).toBe(true);
      await pending;
      expect(device.closed).toHaveBeenCalledOnce();
      if (operation === 'bot-permission') {
        for (const previous of [first, second]) {
          const current = f.team.admit(previous.token);
          if (!current)
            throw new Error('Role revocation must permit reconnect with current permissions');
          expect(current === previous.peer).toBe(false);
          await expect(
            f.gateway.invoke({
              namespace: 'botharness',
              method: 'create',
              args: {},
              peer: current,
            }),
          ).rejects.toMatchObject({
            code: 'permission-required',
            details: { permission: 'bots.createPrivate' },
          });
        }
      } else {
        expect(f.team.admit(first.token)).toBeUndefined();
        expect(f.team.admit(second.token)).toBeUndefined();
        expect(device.pairing.admit(`Device ${device.result.credential}`)).toMatchObject({
          ok: false,
          code: 'device-revoked',
        });
      }
      for (const peer of [first.peer, second.peer])
        await expect(
          f.gateway.invoke({
            namespace: 'botharness',
            method: operation === 'bot-permission' ? 'create' : 'teamMode',
            args: {},
            peer,
          }),
        ).rejects.toThrow();
    },
  );

  it.each([undefined, true, false])(
    'password change signOutOthers=%s retains the current grant and optionally the others',
    async (signOutOthers) => {
      const f = await enabledFixture();
      await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
      const current = await f.team.signIn('bob', 'member-password-1', 'first');
      const other = await f.team.signIn('bob', 'member-password-1', 'second');
      const device = paired(f);
      await f.gateway.invoke({
        namespace: 'botharness',
        method: 'memberPasswordChange',
        args: {
          current: 'member-password-1',
          next: 'member-password-2',
          ...(signOutOthers === undefined ? {} : { signOutOthers }),
        },
        peer: current.peer,
      });
      expect(f.team.admit(current.token)).toBe(current.peer);
      expect(other.peer.signal.aborted).toBe(signOutOthers !== false);
      expect(device.closed.mock.calls.length).toBe(signOutOthers === false ? 0 : 1);
      expect(device.pairing.admit(`Device ${device.result.credential}`).ok).toBe(
        signOutOthers === false,
      );
    },
  );

  it('retains data across off/on, restores only previously active members and never revives a grant', async () => {
    const f = await enabledFixture();
    const alice = await f.team.createMember(owner, 'alice', 'Alice');
    await f.team.deactivate(owner, alice.member.humanId);
    const ownerLogin = await f.team.signIn('owner', 'owner-password-1', 'owner');
    const login = await f.team.signIn('bob', f.initialPassword, 'bob');
    const channel = f.channels.createGroup(f.human, { name: 'Data kept', members: [] });
    await f.channels.appendMessage(f.human, channel.id, {
      id: 'retained',
      at: '2026-11-14T00:00:00.000Z',
      author: { kind: 'human', humanId: f.human.humanId, displayName: 'Bob' },
      body: 'retained body',
    });
    const snapshot = f.database.read((db) => ({
      channels: db.prepare('SELECT * FROM channel_records').all(),
      messages: db.prepare('SELECT * FROM source_events').all(),
      membership: db.prepare('SELECT * FROM channel_human_members').all(),
      credentials: db.prepare('SELECT * FROM member_credentials').all(),
    }));
    expect(f.team.mode(owner).activeMembers).toBe(1);
    expect(await f.team.setMode(owner, false)).toMatchObject({
      suspendedMembers: 1,
      activeMembers: 0,
    });
    expect(f.team.member(f.human.humanId)?.status).toBe('suspended');
    expect(f.team.admit(ownerLogin.token)).toBe(ownerLogin.peer);
    expect(ownerLogin.peer.signal.aborted).toBe(false);
    await f.team.setMode(owner, false);
    await f.team.setMode(owner, true);
    expect(f.team.member(f.human.humanId)?.status).toBe('active');
    expect(f.team.member(alice.member.humanId)?.status).toBe('deactivated');
    expect(f.team.admit(login.token)).toBeUndefined();
    expect(
      f.database.read((db) => ({
        channels: db.prepare('SELECT * FROM channel_records').all(),
        messages: db.prepare('SELECT * FROM source_events').all(),
        membership: db.prepare('SELECT * FROM channel_human_members').all(),
        credentials: db.prepare('SELECT * FROM member_credentials').all(),
      })),
    ).toEqual(snapshot);
    await f.team.reactivate(owner, alice.member.humanId);
    expect(f.team.member(alice.member.humanId)?.status).toBe('active');
    expect((await f.team.signIn('bob', f.initialPassword, 'fresh')).member.humanId).toBe(
      f.human.humanId,
    );
  });

  it('transfers owned Channels to an active member or Owner and refuses invalid targets', async () => {
    const f = await enabledFixture();
    const alice = await f.team.createMember(owner, 'alice', 'Alice');
    const channel = f.channels.createGroup(f.human, { name: 'Owned', members: [] });
    expect(f.team.transferPreview(owner, f.human.humanId)).toEqual({
      channels: [{ channelId: channel.id, name: 'Owned' }],
      bots: [],
    });
    await expect(f.team.transfer(owner, f.human.humanId, 'missing')).rejects.toThrowError(
      'member-not-found',
    );
    await expect(f.team.transfer(owner, f.human.humanId, f.human.humanId)).rejects.toThrowError(
      'transfer-target-invalid',
    );
    await f.team.deactivate(owner, alice.member.humanId);
    await expect(
      f.team.transfer(owner, f.human.humanId, alice.member.humanId),
    ).rejects.toThrowError('transfer-target-invalid');
    await f.team.reactivate(owner, alice.member.humanId);
    await f.team.transfer(owner, f.human.humanId, alice.member.humanId);
    expect(f.team.transferPreview(owner, f.human.humanId).channels).toEqual([]);
    expect(f.team.belongs(humanContext(alice.member.humanId), channel.id)).toBe(true);
    await f.team.transfer(owner, alice.member.humanId, owner.humanId);
    expect(f.channels.get(channel.id)?.ownerHumanId).toBe(owner.humanId);
  });

  it('purges private content through Content Purge while retaining shared messages with deleted authorship', async () => {
    const f = await enabledFixture();
    const channel = f.channels.createGroup(f.human, { name: 'Shared', members: [] });
    f.team.setPublic(owner, channel.id, true);
    await f.channels.appendMessage(f.human, channel.id, {
      id: 'shared-message',
      at: '2026-11-14T00:00:00.000Z',
      author: { kind: 'human', humanId: f.human.humanId, displayName: 'Bob' },
      body: 'shared body',
    });
    f.registry.create({
      slug: 'private-bot',
      displayName: 'Private Bot',
      ownerHumanId: f.human.humanId,
    });
    const dm = f.channels.getOrCreateDm(f.human, 'private-bot', 'Private Bot');
    if (!dm) throw new Error('DM unavailable');
    f.database.transaction((db) =>
      db
        .prepare(
          "UPDATE channel_records SET record_json = json_set(record_json, '$.ownerHumanId', ?) WHERE channel_id = ?",
        )
        .run(f.human.humanId, dm.id),
    );
    await f.channels.appendMessage(f.human, dm.id, {
      id: 'private-message',
      at: '2026-11-14T00:00:00.000Z',
      author: { kind: 'human', humanId: f.human.humanId, displayName: 'Bob' },
      body: 'private body',
    });
    expect(() => f.team.purgePreview(owner, f.human.humanId)).toThrowError('member-active');
    await f.team.deactivate(owner, f.human.humanId);
    expect(() => f.team.purgePreview(owner, f.human.humanId)).toThrowError('transfer-required');
    await f.team.transfer(owner, f.human.humanId, owner.humanId);
    const preview = f.team.purgePreview(owner, f.human.humanId);
    expect(preview.counts).toEqual({ channels: 1, bots: 0, messages: 1, files: 0 });
    await expect(
      f.team.purgeConfirm(owner, f.human.humanId, preview.token, 'wrong'),
    ).rejects.toThrowError('purge-token-invalid');
    await f.team.purgeConfirm(owner, f.human.humanId, preview.token, 'bob');
    expect(f.team.member(f.human.humanId)).toBeUndefined();
    expect(f.channels.readMessages(channel.id)).toMatchObject([
      { body: 'shared body', author: { kind: 'human', humanId: f.human.humanId, deleted: true } },
    ]);
    expect(f.channels.readMessages(channel.id)[0]?.author).not.toHaveProperty('displayName');
    expect(
      f.database.read((db) =>
        db.prepare('SELECT body FROM source_events WHERE body = ?').get('private body'),
      ),
    ).toBeUndefined();
    expect(f.purge.checkpoint()).toMatchObject({
      version: 3,
      deletedHumans: [{ humanId: f.human.humanId }],
    });
    expect(JSON.stringify(f.purge.checkpoint())).not.toContain('Bob');
    await expect(
      f.team.purgeConfirm(owner, f.human.humanId, preview.token, 'bob'),
    ).rejects.toThrowError('purge-token-invalid');
  });

  it('bounds purge previews and reclaims expired tokens without a timer', async () => {
    let time = Date.parse('2026-11-14T00:00:00Z');
    const f = await enabledFixture({ now: () => time });
    await f.team.deactivate(owner, f.human.humanId);
    for (let index = 0; index < 128; index++) f.team.purgePreview(owner, f.human.humanId);
    expect(() => f.team.purgePreview(owner, f.human.humanId)).toThrowError('rate-limited');
    time += 5 * 60_000;
    expect(f.team.purgePreview(owner, f.human.humanId).counts).toEqual({
      channels: 0,
      bots: 0,
      messages: 0,
      files: 0,
    });
    const before = f.db.diagnostics().metrics.reads;
    expect(f.team.mode(owner).activeMembers).toBe(0);
    expect(f.db.diagnostics().metrics.reads - before).toBe(7);
  });

  it('binds purge tokens to caller, target, unchanged scope and five-minute expiry', async () => {
    let time = Date.parse('2026-11-14T00:00:00Z');
    const f = await enabledFixture({ now: () => time });
    await f.team.deactivate(owner, f.human.humanId);
    await expect(
      f.team.purgeConfirm(owner, f.human.humanId, 'invalid', 'bob'),
    ).rejects.toThrowError('purge-token-invalid');
    const preview = f.team.purgePreview(owner, f.human.humanId);
    expect(() =>
      f.purge.memberConfirm(humanContext('other'), f.human.humanId, preview.token),
    ).toThrowError('purge-token-invalid');
    const expiring = f.team.purgePreview(owner, f.human.humanId);
    time += 5 * 60_000;
    await expect(
      f.team.purgeConfirm(owner, f.human.humanId, expiring.token, 'bob'),
    ).rejects.toThrowError('purge-token-invalid');
  });
});
