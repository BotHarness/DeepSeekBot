import { channelPolicySchema } from '../src/team/channel-contract.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { enabledFixture, cleanup } from './team-mode-fixtures.js';

afterEach(cleanup);

describe('M4 review integrity', { timeout: 60_000 }, () => {
  it('rejects overlapping policy edits using the observed revision without losing another field', async () => {
    const f = await enabledFixture();
    const group = f.channels.createGroup(owner, { name: 'Concurrent settings', members: [] });
    f.team.channelAccess.addMember(owner, group.id, f.human.humanId);
    f.team.channelAccess.adminsSet(owner, group.id, [f.human.humanId]);
    const snapshot = z.object({
      policy: channelPolicySchema,
      policyRevision: z.string().regex(/^[a-f0-9]{64}$/u),
    });
    const observe = (actor: typeof owner) => {
      const result = f.methods(actor).channelGet({ channelId: group.id });
      if (!result.ok) throw new Error(result.error.code);
      return snapshot.parse(result.value);
    };
    const first = observe(owner);
    const second = observe(f.human);
    expect(second.policyRevision).toBe(first.policyRevision);
    expect(
      await f.methods(owner).channelPolicySet({
        channelId: group.id,
        policy: { ...first.policy, addMembers: 'admins' },
        expectedRevision: first.policyRevision,
      }),
    ).toEqual({ ok: true, value: null });
    const cursor = f.channels.changeCursor!();
    expect(
      await f.methods(f.human).channelPolicySet({
        channelId: group.id,
        policy: { ...second.policy, post: 'admins' },
        expectedRevision: second.policyRevision,
      }),
    ).toMatchObject({ ok: false, error: { code: 'stale-channel-policy' } });
    expect(f.channels.changeCursor!()).toEqual(cursor);
    const current = observe(f.human);
    expect(current.policy).toMatchObject({ addMembers: 'admins', post: 'everyone' });
    expect(current.policyRevision).not.toBe(first.policyRevision);
    expect(
      await f.methods(f.human).channelPolicySet({
        channelId: group.id,
        policy: { ...current.policy, post: 'admins' },
        expectedRevision: current.policyRevision,
      }),
    ).toEqual({ ok: true, value: null });
    expect(observe(owner).policy).toMatchObject({ addMembers: 'admins', post: 'admins' });
    expect(
      await f.methods(owner).channelPolicySet({ channelId: group.id, policy: first.policy }),
    ).toEqual({ ok: true, value: null });
    expect(observe(owner).policy).toEqual(first.policy);
    expect(
      await f
        .methods(owner)
        .channelPolicySet({ channelId: group.id, policy: first.policy, expectedRevision: 1 }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });

  it.each(['roles', 'visibility', 'leave'] as const)(
    'resets cached Channel lists after %s revocation without disclosing invisible ids',
    async (cause) => {
      const f = await enabledFixture();
      const group = f.channels.createGroup(owner, { name: 'Revoked cached Channel', members: [] });
      f.team.channelAccess.visibilitySet(owner, group.id, { kind: 'roles', roleIds: ['member'] });
      expect(await f.methods(f.human).channels({})).toMatchObject({
        ok: true,
        value: { channels: [{ id: group.id }] },
      });
      const cursor = f.channels.changeCursor!();
      if (cause === 'roles') {
        const { role } = f.team.roles.create(owner, 'No audience', []);
        f.team.roles.set(owner, f.human.humanId, [role.roleId]);
      } else if (cause === 'visibility')
        f.team.channelAccess.visibilitySet(owner, group.id, { kind: 'roles', roleIds: ['admin'] });
      else
        f.database.transaction(
          (db) =>
            db
              .prepare(
                'UPDATE channel_human_members SET left_at = ? WHERE channel_id = ? AND human_id = ?',
              )
              .run('after', group.id, f.human.humanId),
          ['channels'],
        );
      await f.team.accessSettled();
      const delta = await f
        .methods(f.human)
        .channelListChanges({ sinceSeq: cursor.seq, epoch: cursor.epoch });
      expect(delta).toMatchObject({ ok: true, value: { reset: true } });
      expect(JSON.stringify(delta)).not.toContain(group.id);
      expect(f.channels.changeCursor!().seq).toBeGreaterThan(cursor.seq);
      expect(await f.methods(f.human).channels({})).toMatchObject({
        ok: true,
        value: { channels: [] },
      });
    },
  );

  it('keeps visible ordinary Channel changes incremental', async () => {
    const f = await enabledFixture();
    const group = f.channels.createGroup(f.human, { name: 'Before', members: [] });
    const cursor = f.channels.changeCursor!();
    f.channels.rename(f.human, group.id, 'After');
    expect(
      await f.methods(f.human).channelListChanges({ sinceSeq: cursor.seq, epoch: cursor.epoch }),
    ).toMatchObject({
      ok: true,
      value: { channels: [{ id: group.id, name: 'After' }], removed: [] },
    });
  });

  it('denies opening observed output after role loss removes membership', async () => {
    const f = await enabledFixture();
    const group = f.channels.createGroup(owner, { name: 'Observed output', members: [] });
    f.team.channelAccess.visibilitySet(owner, group.id, { kind: 'roles', roleIds: ['member'] });
    await f.channels.appendMessage(owner, group.id, {
      id: 'observed-message',
      at: '2026-11-14',
      author: { kind: 'human' },
      body: 'Scoped output',
    });
    const reads = f.db.diagnostics().metrics.reads;
    expect(f.channels.observeOutput(f.human, group.id, 'observed-message')).toMatchObject({
      canRead: true,
      humanParticipant: true,
    });
    expect(f.db.diagnostics().metrics.reads - reads).toBeLessThanOrEqual(8);
    const { role } = f.team.roles.create(owner, 'No output audience', []);
    f.team.roles.set(owner, f.human.humanId, [role.roleId]);
    await f.team.accessSettled();
    expect(f.channels.hasHumanMembership?.(f.human, group.id)).toBe(false);
    expect(f.channels.observeOutput(f.human, group.id, 'observed-message')).toMatchObject({
      canRead: false,
      humanParticipant: false,
    });
  });

  it.each(['owner', 'admin', 'member'] as const)(
    'admits avatar writes from a Channel %s through the member Gateway and enforces editDetails',
    async (role) => {
      const f = await enabledFixture();
      const group = f.channels.createGroup(role === 'owner' ? f.human : owner, {
        name: 'Avatar policy',
        members: [],
      });
      if (role !== 'owner') f.team.channelAccess.addMember(owner, group.id, f.human.humanId);
      if (role === 'admin') f.team.channelAccess.adminsSet(owner, group.id, [f.human.humanId]);
      await f.team.changePassword(f.human, f.initialPassword, 'avatar-password-1');
      const login = await f.team.signIn('bob', 'avatar-password-1', 'avatar-ip');
      const avatar = 'data:image/png;base64,iVBORw0KGgo=';
      const result = f.gateway.invoke({
        namespace: 'botharness',
        method: 'channelGroupAvatarSet',
        args: { channelId: group.id, avatar },
        peer: login.peer,
      });
      if (role === 'member') {
        await expect(result).rejects.toMatchObject({
          code: 'permission-required',
          details: { permission: 'editDetails' },
        });
        expect(f.channels.get(group.id)?.avatar).toBeUndefined();
        f.team.channelAccess.policySet(owner, group.id, {
          ...f.team.channelAccess.view(owner, group.id).policy,
          editDetails: 'everyone',
        });
        await f.team.accessSettled();
        const allowed = await f.team.signIn('bob', 'avatar-password-1', 'avatar-allowed');
        await expect(
          f.gateway.invoke({
            namespace: 'botharness',
            method: 'channelGroupAvatarSet',
            args: { channelId: group.id, avatar },
            peer: allowed.peer,
          }),
        ).resolves.toMatchObject({ channel: { id: group.id, avatar } });
      } else {
        await expect(result).resolves.toMatchObject({ channel: { id: group.id, avatar } });
        expect(f.channels.get(group.id)?.avatar).toBe(avatar);
      }
    },
  );

  it('settles every peer disposal and recovers Team calls after a disposal failure', async () => {
    const f = await enabledFixture();
    const group = f.channels.createGroup(owner, { name: 'Recover disposal', members: [] });
    const first = await f.team.signIn('bob', f.initialPassword, 'dispose-first');
    const second = await f.team.signIn('bob', f.initialPassword, 'dispose-second');
    let failed: () => void = () => {};
    const failureObserved = new Promise<void>((resolve) => {
      failed = resolve;
    });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = first.peer.dispose.bind(first.peer);
    const secondOriginal = second.peer.dispose.bind(second.peer);
    vi.spyOn(first.peer, 'dispose').mockImplementationOnce(async () => {
      await original();
      failed();
      throw new Error('private-disposal-error');
    });
    vi.spyOn(second.peer, 'dispose').mockImplementationOnce(async () => {
      await gate;
      await secondOriginal();
    });
    const policy = f.team.channelAccess.view(owner, group.id).policy;
    let settled = false;
    const mutation = f
      .methods(owner)
      .channelPolicySet({ channelId: group.id, policy: { ...policy, post: 'admins' } });
    void mutation.then(() => {
      settled = true;
    });
    try {
      await failureObserved;
      await Promise.resolve();
      expect(settled).toBe(false);
    } finally {
      release();
    }
    expect(await mutation).toEqual({ ok: true, value: null });
    expect(first.peer.signal.aborted).toBe(true);
    expect(second.peer.signal.aborted).toBe(true);
    await expect(f.team.accessSettled()).resolves.toBeUndefined();
    expect(f.diagnostics).toHaveBeenCalledWith('access-disposal-failed', {
      initiator: 'host',
      reason: 'peer-disposal-failed',
    });
    expect(await f.methods(owner).teamMode({})).toMatchObject({ ok: true });
    expect(await f.methods(owner).channelPolicySet({ channelId: group.id, policy })).toEqual({
      ok: true,
      value: null,
    });
    expect(f.team.channelAccess.view(owner, group.id).policy).toEqual(policy);
  });

  it('returns a participating Host Owner Human DM without Group management and denies outsiders', async () => {
    const f = await enabledFixture();
    const other = await f.team.createMember(owner, 'dm-outsider', 'Outsider');
    const dm = f.team.channelAccess.dm(owner, f.human.humanId).channel;
    for (const actor of [owner, f.human])
      expect(f.methods(actor).channelGet({ channelId: dm.id })).toMatchObject({
        ok: true,
        value: {
          channel: {
            id: dm.id,
            humanParticipants: expect.arrayContaining([owner.humanId, f.human.humanId]),
          },
        },
      });
    expect(
      f.methods(humanContext(other.member.humanId)).channelGet({ channelId: dm.id }),
    ).toMatchObject({ ok: false, error: { code: 'channel-not-found' } });
  });
});
