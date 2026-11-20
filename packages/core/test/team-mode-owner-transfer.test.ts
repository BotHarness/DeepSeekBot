import { createDevicePairing } from '../src/devices/pairing.js';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveInvocationHuman } from '../src/bridge/rpc.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { NativeSession, actors, cleanup } from './team-mode-fixtures.js';

afterEach(cleanup);

describe('M3 Host Roles and devices', { timeout: 60_000 }, () => {
  it('transfers unique Owner authority atomically without transferring Human data or native access', async () => {
    const f = await actors();
    await expect(
      f.invoke('ownerTransfer', { humanId: f.alice.member.humanId, password: 'owner-password-1' }),
    ).rejects.toMatchObject({ code: 'permission-required', details: { permission: 'owner' } });
    await expect(f.team.transferOwner(owner, f.human.humanId, 'wrong')).rejects.toMatchObject({
      code: 'credentials-invalid',
    });
    await expect(f.team.transferOwner(owner, 'absent', 'owner-password-1')).rejects.toMatchObject({
      code: 'member-not-found',
    });
    await f.team.suspend(owner, f.alice.member.humanId);
    await expect(
      f.team.transferOwner(owner, f.alice.member.humanId, 'owner-password-1'),
    ).rejects.toMatchObject({ code: 'member-suspended' });
    await f.team.transferOwner(owner, f.human.humanId, 'owner-password-1');
    expect(f.team.mode(f.human).viewer).toMatchObject({ owner: true, roleIds: [] });
    expect(f.team.mode(owner).viewer).toMatchObject({ owner: false, roleIds: ['admin'] });
    expect(
      f.team
        .members(f.human)
        .filter((m) => m.owner)
        .map((m) => m.humanId),
    ).toEqual([f.human.humanId]);
    const localPeer = new Peer(f.ctx, { principal: { kind: 'owner' } });
    expect(resolveInvocationHuman(localPeer, undefined, f.team)).toEqual(f.human);
    await expect(
      f.team.transferOwner(owner, f.alice.member.humanId, 'owner-password-1'),
    ).rejects.toMatchObject({ code: 'permission-required' });
    new NativeSession(f.ctx);
    await expect(
      f.gateway.invoke({ namespace: 'session', method: 'list', args: {}, peer: f.bobLogin.peer }),
    ).rejects.toMatchObject({ code: 'remote-access/denied' });
    await expect(f.team.signIn('owner', 'owner-password-1', 'old-owner-ip')).resolves.toMatchObject(
      { member: { owner: false, roleIds: ['admin'] } },
    );
    await expect(f.team.signIn('bob', 'member-password-1', 'new-owner-ip')).resolves.toMatchObject({
      member: { owner: true, roleIds: [] },
    });
    await f.invoke('memberRolesSet', { humanId: f.alice.member.humanId, roleIds: ['admin'] });
  });

  it('revokes old Owner paired-device streams and pending offers without rebinding their Human identity', async () => {
    const f = await actors();
    const onRevoked = vi.fn();
    const pairing = createDevicePairing({
      database: f.database,
      hostName: 'Test',
      ownerHumanId: () => f.team.ownerContext().humanId,
      onRevoked,
    });
    f.team.bindPairing(pairing);
    const oldOffer = pairing.createOffer();
    const old = pairing.redeem({ offer: pairing.createOffer().offer });
    if (!old.ok) throw new Error('pairing failed');
    const close = vi.fn();
    pairing.attachStream(old.device.id, close);
    await f.team.transferOwner(owner, f.human.humanId, 'owner-password-1');
    expect(close).toHaveBeenCalledOnce();
    expect(onRevoked).toHaveBeenCalledWith(old.device.id);
    expect(pairing.admit(`Device ${old.credential}`)).toMatchObject({
      ok: false,
      code: 'device-revoked',
    });
    expect(pairing.redeem({ offer: oldOffer.offer })).toMatchObject({
      ok: false,
      code: 'offer-invalid',
    });
    expect(f.team.memberDevices(f.human, owner.humanId)).toEqual([]);
    const fresh = pairing.redeem({ offer: pairing.createOffer().offer });
    if (!fresh.ok) throw new Error('new Owner pairing failed');
    const before = f.db.diagnostics().metrics.reads;
    expect(pairing.admit(`Device ${fresh.credential}`).ok).toBe(true);
    expect(f.db.diagnostics().metrics.reads - before).toBe(2);
    expect(f.team.memberDevices(f.human, f.human.humanId)).toContainEqual(
      expect.objectContaining({ grantId: fresh.device.id, kind: 'paired-device' }),
    );
  });

  it.each([
    'roster-baseline',
    'roster-queued',
    'roster-publish',
    'roster-sse',
    'channel-open',
    'channel-follow-new',
    'channel-queued',
    'channel-publish',
  ] as const)('removes former Owner-wide live visibility after transfer: %s', async (path) => {
    const f = await actors();
    const alice = humanContext(f.alice.member.humanId);
    const secret = f.channels.getOrCreateRemoteBotDm('local-bot', {
      hostId: 'remote-host',
      botSlug: 'remote-bot',
      displayName: 'Remote Bot',
    });
    if (!secret) throw new Error('missing private DM');
    const placement = {
      sourceEventId: 'alice-secret-source',
      channelId: secret.id,
      messageId: 'alice-secret-message',
    };
    f.setPlacements([placement]);
    const controller = new AbortController();
    const roster = f.live.followRoster(owner, controller.signal)[Symbol.asyncIterator]();
    const channel = f.live
      .followChannel(owner, secret.id, 10, controller.signal)
      [Symbol.asyncIterator]();
    const opened = f.live.open(
      owner,
      new Request('http://localhost/api/botharness/stream?scope=roster'),
    );
    const reader = opened.body?.getReader();
    const publish = async () => {
      f.live.publishCommitted({
        channelId: secret.id,
        message: {
          id: 'alice-secret-message',
          at: '2026-11-14T00:00:00Z',
          author: { kind: 'bot', slug: 'remote-bot' },
          body: 'Remote private text',
        },
        revision: 1,
      });
    };
    try {
      expect((await roster.next()).value).toMatchObject({
        type: 'baseline',
        placements: [placement],
      });
      expect((await channel.next()).value).toMatchObject({ type: 'opened' });
      await reader?.read();
      await reader?.read();
      if (path === 'roster-queued' || path === 'channel-queued') {
        await publish();
        f.live.publishContentPurged();
      }
      await f.team.transferOwner(owner, f.human.humanId, 'owner-password-1');
      if (path === 'roster-baseline') {
        const old = f.live.followRoster(owner, controller.signal)[Symbol.asyncIterator]();
        const current = f.live.followRoster(f.human, controller.signal)[Symbol.asyncIterator]();
        try {
          expect((await old.next()).value).toEqual({ type: 'baseline', placements: [] });
          expect((await current.next()).value).toEqual({
            type: 'baseline',
            placements: [placement],
          });
        } finally {
          await old.return?.();
          await current.return?.();
        }
      } else if (path === 'channel-open') {
        const denied = f.live.open(
          owner,
          new Request(`http://localhost/api/botharness/stream?channelId=${secret.id}`),
        );
        await denied.body?.cancel();
        expect(denied.status).toBe(404);
      } else if (path === 'channel-follow-new') {
        const denied = f.live
          .followChannel(owner, secret.id, 10, controller.signal)
          [Symbol.asyncIterator]();
        await expect(denied.next()).rejects.toMatchObject({ code: 'not-found' });
        await denied.return?.();
      } else if (path === 'channel-queued' || path === 'channel-publish') {
        if (path === 'channel-publish') await publish();
        expect((await channel.next()).done).toBe(true);
      } else {
        if (path !== 'roster-queued') {
          await publish();
          f.live.publishContentPurged();
        }
        f.live.publishRosterCommitted();
        if (path === 'roster-sse') {
          const frame = new TextDecoder().decode((await reader?.read())?.value);
          expect(frame).toContain('event: roster/changed');
          expect(frame).not.toContain('alice-secret');
        } else expect((await roster.next()).value).toEqual({ type: 'changed' });
      }
    } finally {
      controller.abort();
      await reader?.cancel();
      await roster.return?.();
      await channel.return?.();
    }
  });

  it('requires current-Owner credential provenance for transfer, beyond the forced-change flag', async () => {
    const f = await actors();
    f.team.roles.set(owner, f.human.humanId, ['admin']);
    const created = await f.team.createMember(f.human, 'managed-target', 'Target');
    const target = humanContext(created.member.humanId);
    await expect(
      f.team.transferOwner(owner, target.humanId, 'owner-password-1'),
    ).rejects.toMatchObject({ code: 'owner-transfer-target-unverified' });
    await f.team.changePassword(target, created.initialPassword, 'manager-known-password-1');
    expect(f.team.member(target.humanId)?.mustChangePassword).toBe(false);
    const retained = await f.team.signIn(
      'managed-target',
      'manager-known-password-1',
      'manager-ip',
    );
    await expect(
      f.team.transferOwner(owner, target.humanId, 'owner-password-1'),
    ).rejects.toMatchObject({ code: 'owner-transfer-target-unverified' });
    const reset = await f.team.resetPassword(owner, target.humanId);
    expect(retained.peer.signal.aborted).toBe(true);
    await expect(
      f.team.signIn('managed-target', 'manager-known-password-1', 'manager-ip'),
    ).rejects.toMatchObject({ code: 'credentials-invalid' });
    await expect(
      f.team.transferOwner(owner, target.humanId, 'owner-password-1'),
    ).rejects.toMatchObject({ code: 'owner-transfer-target-unverified' });
    await f.team.changePassword(target, reset.initialPassword, 'target-only-password-2');
    await f.team.transferOwner(owner, target.humanId, 'owner-password-1');
    expect(f.team.ownerContext()).toEqual(target);
  });

  it('refuses transfer with unknown legacy credential provenance', async () => {
    const f = await actors();
    f.database.transaction((db) =>
      db
        .prepare(
          "UPDATE member_credentials SET password_json = json_remove(password_json, '$.ownerIssuerHumanId') WHERE human_id = ?",
        )
        .run(f.human.humanId),
    );
    await expect(
      f.team.transferOwner(owner, f.human.humanId, 'owner-password-1'),
    ).rejects.toMatchObject({ code: 'owner-transfer-target-unverified' });
    expect(f.team.ownerContext()).toEqual(owner);
  });

  it('requires credential issuance by the current Owner rather than a previous Owner', async () => {
    const f = await actors();
    const alice = humanContext(f.alice.member.humanId);
    await f.team.transferOwner(owner, f.human.humanId, 'owner-password-1');
    await expect(
      f.team.transferOwner(f.human, alice.humanId, 'member-password-1'),
    ).rejects.toMatchObject({ code: 'owner-transfer-target-unverified' });
    const reset = await f.team.resetPassword(f.human, alice.humanId);
    await f.team.changePassword(alice, reset.initialPassword, 'alice-new-private-password-2');
    await f.team.transferOwner(f.human, alice.humanId, 'member-password-1');
    expect(f.team.ownerContext()).toEqual(alice);
  });

  it('invalidates outstanding pairing offers permanently across an Owner round trip', async () => {
    const f = await actors();
    const pairing = createDevicePairing({
      database: f.database,
      hostName: 'Test',
      ownerHumanId: () => f.team.ownerContext().humanId,
    });
    f.team.bindPairing(pairing);
    const offered = pairing.createOffer();
    await f.team.transferOwner(owner, f.human.humanId, 'owner-password-1');
    const reset = await f.team.resetPassword(f.human, owner.humanId);
    await f.team.changePassword(owner, reset.initialPassword, 'returned-owner-password-2');
    await f.team.transferOwner(f.human, owner.humanId, 'member-password-1');
    expect(pairing.redeem({ offer: offered.offer })).toEqual({ ok: false, code: 'offer-invalid' });
    expect(pairing.offerStatus(offered.receipt)).toMatchObject({ state: 'superseded' });
  });
});
