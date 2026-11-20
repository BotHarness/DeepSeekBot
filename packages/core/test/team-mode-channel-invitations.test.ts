import { afterEach, describe, expect, it } from 'vitest';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { enabledFixture, cleanup } from './team-mode-fixtures.js';

afterEach(cleanup);

describe('M14 invitation access', { timeout: 60_000 }, () => {
  it.each(['private', 'roles'] as const)(
    'invites by name into %s with immediate list, stream and search access',
    async (kind) => {
      const f = await enabledFixture();
      f.registry.create({
        slug: 'm14-private-bot',
        displayName: 'Private Bot',
        ownerHumanId: owner.humanId,
      });
      const group = f.channels.createGroup(owner, {
        name: 'M14 secret',
        members: ['m14-private-bot'],
      });
      if (kind === 'roles')
        f.team.channelAccess.visibilitySet(owner, group.id, { kind, roleIds: ['admin'] });
      await f.channels.appendMessage(owner, group.id, {
        id: 'm14-history',
        at: '2026-11-16T00:00:00Z',
        author: { kind: 'human' },
        body: 'm14-invitation-history',
      });
      expect(f.team.channelAccess.canRead(f.human, group.id)).toBe(false);
      expect(
        await f.methods(owner).channelHumanAdd({ channelId: group.id, humanId: 'bob' }),
      ).toEqual({ ok: true, value: null });
      expect(await f.methods(f.human).channels({})).toMatchObject({
        ok: true,
        value: { channels: [expect.objectContaining({ id: group.id })] },
      });
      expect(
        f.channels.searchAllHumanMessages?.(f.human, { text: 'm14-invitation-history', limit: 10 }),
      ).toMatchObject({ hits: [expect.objectContaining({ channelId: group.id })] });
      const abort = new AbortController();
      const stream = f.live
        .followChannel(f.human, group.id, 10, abort.signal)
        [Symbol.asyncIterator]();
      try {
        expect((await stream.next()).value).toMatchObject({ type: 'opened' });
      } finally {
        abort.abort();
        await stream.return?.();
      }
    },
  );

  it.each(['owner', 'manager', 'channel-owner', 'admin', 'everyone'] as const)(
    'allows %s to add even a higher-permission target and searches only available active people',
    async (authority) => {
      const f = await enabledFixture();
      const group = f.channels.createGroup(authority === 'channel-owner' ? f.human : owner, {
        name: 'M14 authority',
        members: [],
      });
      if (authority === 'manager') {
        const role = f.team.roles.create(owner, 'M14 manager', ['channels.manageAll']).role;
        f.team.roles.set(owner, f.human.humanId, [role.roleId]);
      } else if (authority !== 'owner' && authority !== 'channel-owner') {
        f.team.channelAccess.addMember(owner, group.id, 'bob');
        if (authority === 'admin') f.team.channelAccess.adminsSet(owner, group.id, ['bob']);
      }
      const target = await f.team.createMember(owner, 'm14-target', 'Search Target', ['admin']);
      const inactive = await f.team.createMember(owner, 'm14-inactive', 'Search Inactive');
      await f.team.deactivate(owner, inactive.member.humanId);
      f.team.channelAccess.policySet(owner, group.id, {
        ...f.team.channelAccess.view(authority === 'channel-owner' ? f.human : owner, group.id)
          .policy,
        addMembers: authority === 'everyone' ? 'everyone' : 'admins',
      });
      const actor = authority === 'owner' ? owner : f.human;
      const reads = f.db.diagnostics().metrics.reads;
      expect(
        await f.methods(actor).channelMemberCandidates({ channelId: group.id, query: 'Search' }),
      ).toEqual({
        ok: true,
        value: [
          { humanId: target.member.humanId, displayName: 'Search Target', username: 'm14-target' },
        ],
      });
      expect(f.db.diagnostics().metrics.reads - reads).toBeLessThanOrEqual(12);
      expect(
        await f.methods(actor).channelHumanAdd({ channelId: group.id, humanId: 'm14-target' }),
      ).toEqual({ ok: true, value: null });
      expect(
        await f
          .methods(actor)
          .channelMemberCandidates({ channelId: group.id, query: 'm14-target' }),
      ).toEqual({ ok: true, value: [] });
      expect(
        f.team.channelAccess.canRead(humanContext(target.member.humanId), group.id, true),
      ).toBe(true);
    },
  );

  it('enforces addMembers through the member Gateway for invitation and candidate search without trusting payload identity', async () => {
    const f = await enabledFixture();
    const alice = await f.team.createMember(owner, 'm14-target', 'Alice');
    const group = f.channels.createGroup(owner, { name: 'M14 denied', members: [] });
    f.team.channelAccess.addMember(owner, group.id, 'bob');
    f.team.channelAccess.policySet(owner, group.id, {
      ...f.team.channelAccess.view(owner, group.id).policy,
      addMembers: 'admins',
    });
    await f.team.changePassword(f.human, f.initialPassword, 'm14-password-2', false);
    const login = await f.team.signIn('bob', 'm14-password-2', 'm14-ip');
    for (const method of ['channelHumanAdd', 'channelMemberCandidates']) {
      await expect(
        f.gateway.invoke({
          namespace: 'botharness',
          method,
          args: {
            channelId: group.id,
            ...(method === 'channelHumanAdd' ? { humanId: alice.member.humanId } : {}),
          },
          peer: login.peer,
        }),
      ).rejects.toMatchObject({
        code: 'permission-required',
        details: { permission: 'addMembers' },
      });
    }
    await expect(
      f.gateway.invoke({
        namespace: 'botharness',
        method: 'channelHumanAdd',
        args: { channelId: group.id, humanId: alice.member.humanId, callerHumanId: owner.humanId },
        peer: login.peer,
      }),
    ).rejects.toMatchObject({ code: 'gateway/arguments-invalid' });
    expect(f.channels.hasHumanMembership?.(humanContext(alice.member.humanId), group.id)).toBe(
      false,
    );
    f.team.channelAccess.policySet(owner, group.id, {
      ...f.team.channelAccess.view(owner, group.id).policy,
      addMembers: 'everyone',
    });
    await f.team.accessSettled();
    const allowed = await f.team.signIn('bob', 'm14-password-2', 'm14-ip-allowed');
    await expect(
      f.gateway.invoke({
        namespace: 'botharness',
        method: 'channelMemberCandidates',
        args: { channelId: group.id, query: 'target' },
        peer: allowed.peer,
      }),
    ).resolves.toEqual([
      { humanId: alice.member.humanId, displayName: 'Alice', username: 'm14-target' },
    ]);
    await expect(
      f.gateway.invoke({
        namespace: 'botharness',
        method: 'channelHumanAdd',
        args: { channelId: group.id, humanId: 'm14-target' },
        peer: allowed.peer,
      }),
    ).resolves.toBe(null);
    await f.team.deactivate(owner, f.human.humanId);
    expect(await f.methods(f.human).channelMemberCandidates({ channelId: group.id })).toMatchObject(
      { ok: false, error: { code: 'member-suspended' } },
    );
  });

  it('bounds candidate output and database reads independently of directory size', async () => {
    const f = await enabledFixture();
    const group = f.channels.createGroup(owner, { name: 'M14 directory budget', members: [] });
    f.database.transaction((db) => {
      const insert = db.prepare('INSERT INTO humans VALUES (?, ?, ?, ?)');
      for (let index = 0; index < 1000; index++)
        insert.run(
          `candidate-${String(index).padStart(4, '0')}`,
          `Candidate ${index}`,
          'active',
          'before',
        );
    });
    const reads = f.db.diagnostics().metrics.reads;
    const candidates = f.team.channelAccess.memberCandidates(owner, group.id, 'Candidate');
    expect(candidates).toHaveLength(100);
    expect(f.db.diagnostics().metrics.reads - reads).toBe(4);
    expect(f.team.channelAccess.memberCandidates(owner, group.id, 'Candidate 999')).toEqual([
      { humanId: 'candidate-0999', displayName: 'Candidate 999', username: null },
    ]);
    expect(
      await f
        .methods(owner)
        .channelMemberCandidates({ channelId: group.id, query: 'x'.repeat(201) }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      await f.methods(owner).channelHumanAdd({ channelId: group.id, humanId: 'missing' }),
    ).toMatchObject({ ok: false, error: { code: 'member-not-found' } });
    expect(
      await f.methods(f.human).channelHumanAdd({ channelId: group.id, humanId: owner.humanId }),
    ).toMatchObject({
      ok: false,
      error: { code: 'permission-required', details: { permission: 'addMembers' } },
    });
  });

  it('keeps a role join while another allowed role remains, then removes it when neither remains', async () => {
    const f = await enabledFixture();
    const first = f.team.roles.create(owner, 'First audience', []).role;
    const second = f.team.roles.create(owner, 'Second audience', []).role;
    f.team.roles.set(owner, f.human.humanId, [first.roleId, second.roleId]);
    const group = f.channels.createGroup(owner, { name: 'Union of roles', members: [] });
    f.team.channelAccess.visibilitySet(owner, group.id, {
      kind: 'roles',
      roleIds: [first.roleId, second.roleId],
    });
    f.team.roles.set(owner, f.human.humanId, [second.roleId]);
    expect(f.channels.hasHumanMembership?.(f.human, group.id)).toBe(true);
    f.team.roles.set(owner, f.human.humanId, ['member']);
    expect(f.channels.hasHumanMembership?.(f.human, group.id)).toBe(false);
    expect(f.team.channelAccess.memberCandidates(owner, group.id, 'bob')).toEqual([
      { humanId: f.human.humanId, displayName: 'Bob', username: 'bob' },
    ]);
    f.team.channelAccess.addMember(owner, group.id, 'bob');
    expect(f.team.channelAccess.canRead(f.human, group.id, true)).toBe(true);
  });

  it.each(['delete-role', 'transfer-owner'] as const)(
    'ends role access on %s while preserving named access',
    async (operation) => {
      const f = await enabledFixture();
      const role = f.team.roles.create(owner, 'Removed audience', []).role;
      f.team.roles.set(owner, f.human.humanId, [role.roleId]);
      const groups = ['role', 'invited'].map((basis) => {
        const group = f.channels.createGroup(owner, { name: `M14 ${basis}`, members: [] });
        f.team.channelAccess.visibilitySet(owner, group.id, {
          kind: 'roles',
          roleIds: [role.roleId],
        });
        if (basis === 'invited') f.team.channelAccess.addMember(owner, group.id, 'bob');
        return group;
      });
      if (operation === 'delete-role') f.team.roles.delete(owner, role.roleId);
      else {
        await f.team.changePassword(f.human, f.initialPassword, 'm14-new-owner-password');
        await f.team.transferOwner(owner, f.human.humanId, 'owner-password-1');
      }
      expect(f.channels.hasHumanMembership?.(f.human, groups[0]!.id)).toBe(false);
      expect(f.team.channelAccess.canRead(f.human, groups[0]!.id, true)).toBe(false);
      expect(f.channels.hasHumanMembership?.(f.human, groups[1]!.id)).toBe(true);
      expect(f.team.channelAccess.canRead(f.human, groups[1]!.id, true)).toBe(true);
    },
  );

  it('upgrades an automatic role join on a named invitation and never downgrades it on role change', async () => {
    const f = await enabledFixture();
    const group = f.channels.createGroup(owner, { name: 'Upgrade invitation', members: [] });
    f.team.channelAccess.visibilitySet(owner, group.id, { kind: 'roles', roleIds: ['member'] });
    f.team.channelAccess.addMember(owner, group.id, 'bob');
    f.team.roles.set(owner, f.human.humanId, ['admin']);
    expect(f.team.channelAccess.canRead(f.human, group.id, true)).toBe(true);
    expect(
      f.database.read((db) =>
        db
          .prepare(
            'SELECT membership_basis FROM channel_human_members WHERE channel_id = ? AND human_id = ?',
          )
          .get(group.id, f.human.humanId),
      ),
    ).toEqual({ membership_basis: 'invited' });
  });

  it('removes role-joined membership and its live stream on role revoke, retaining named invitations', async () => {
    const f = await enabledFixture();
    const alice = await f.team.createMember(owner, 'm14-alice', 'Alice');
    const invited = humanContext(alice.member.humanId);
    const role = f.team.roles.create(owner, 'M14 audience', []).role;
    f.team.roles.set(owner, f.human.humanId, [role.roleId]);
    f.team.roles.set(owner, invited.humanId, [role.roleId]);
    const group = f.channels.createGroup(owner, { name: 'Role basis', members: [] });
    f.team.channelAccess.visibilitySet(owner, group.id, { kind: 'roles', roleIds: [role.roleId] });
    f.team.channelAccess.addMember(owner, group.id, invited.humanId);
    await f.channels.appendMessage(owner, group.id, {
      id: 'm14-role-history',
      at: '2026-11-16',
      author: { kind: 'human' },
      body: 'm14-role-history',
    });
    const abort = new AbortController();
    const stream = f.live
      .followChannel(f.human, group.id, 10, abort.signal)
      [Symbol.asyncIterator]();
    try {
      expect((await stream.next()).value).toMatchObject({ type: 'opened' });
      await stream.next();
      const next = stream.next();
      f.team.roles.set(owner, f.human.humanId, ['member']);
      f.team.roles.set(owner, invited.humanId, ['member']);
      await f.team.accessSettled();
      expect((await next).done).toBe(true);
      expect(f.channels.hasHumanMembership?.(f.human, group.id)).toBe(false);
      expect(await f.methods(f.human).channels({})).toMatchObject({
        ok: true,
        value: { channels: [] },
      });
      expect(
        f.channels.searchAllHumanMessages?.(f.human, { text: 'm14-role-history', limit: 10 }),
      ).toMatchObject({ hits: [] });
      expect(f.team.channelAccess.canRead(invited, group.id, true)).toBe(true);
      expect(
        f.channels.searchAllHumanMessages?.(invited, { text: 'm14-role-history', limit: 10 }),
      ).toMatchObject({ hits: [expect.objectContaining({ channelId: group.id })] });
      f.team.roles.set(owner, f.human.humanId, [role.roleId]);
      expect(f.channels.hasHumanMembership?.(f.human, group.id)).toBe(true);
    } finally {
      abort.abort();
      await stream.return?.();
    }
  });
});
