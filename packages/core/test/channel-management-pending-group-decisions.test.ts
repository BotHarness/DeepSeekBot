import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { cleanup, fixture, inviteFixture } from './support/channel-management.js';

afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of cleanup.splice(0).reverse()) await close();
});

describe('reviewed pending Group decisions', () => {
  function pendingInvite() {
    const f = inviteFixture();
    const invited = f.owner.invite(OWNER_HUMAN_CONTEXT, f.invite);
    return {
      ...f,
      id: invited.channel.id,
      invitationId: invited.invitation!.id,
      observed: invited.channelFingerprint,
    };
  }
  function pendingJoin() {
    const f = fixture();
    const group = f.core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Owned Group',
      members: ['ada'],
      ownerBotSlug: 'ada',
    });
    const ownerDm = f.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
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
    return createBridgeMethods(OWNER_HUMAN_CONTEXT, {
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
    const result = f.owner.cancelInvite(OWNER_HUMAN_CONTEXT, {
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
      f.owner.cancelInvite(OWNER_HUMAN_CONTEXT, {
        channelId: f.id,
        invitationId: f.invitationId,
        expectedChannel: f.observed,
      }),
    ).toThrowError(expect.objectContaining({ code: 'stale-channel' }));
    expect(() =>
      f.owner.cancelInvite(OWNER_HUMAN_CONTEXT, {
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
    const accepted = f.owner.invite(OWNER_HUMAN_CONTEXT, {
      channelId: f.created.channel.id,
      botSlug: 'bob',
    });
    expect(accepted.invitation?.status).toBe('accepted');
    expect(() =>
      f.owner.cancelInvite(OWNER_HUMAN_CONTEXT, {
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
      f.owner.cancelInvite(OWNER_HUMAN_CONTEXT, { channelId: f.id, invitationId: f.invitationId })
        .channel.invitations?.[0]?.status,
    ).toBe('cancelled');
    spy.mockRestore();
    const second = pendingInvite();
    const secondGet = second.core.registry.get.bind(second.core.registry);
    const target = secondGet('bob')!;
    const missing = vi
      .spyOn(second.core.registry, 'get')
      .mockImplementation((slug) => (slug === 'bob' ? undefined : secondGet(slug)));
    expect(() =>
      second.owner.cancelInvite(OWNER_HUMAN_CONTEXT, {
        channelId: second.id,
        invitationId: second.invitationId,
      }),
    ).toThrowError(expect.objectContaining({ code: 'unknown-bot' }));
    missing.mockImplementation((slug) =>
      slug === 'bob' ? { ...target, createdAt: '2099-01-01T00:00:00.000Z' } : secondGet(slug),
    );
    expect(() =>
      second.owner.cancelInvite(OWNER_HUMAN_CONTEXT, {
        channelId: second.id,
        invitationId: second.invitationId,
      }),
    ).toThrowError(expect.objectContaining({ code: 'stale-profile' }));
    expect(second.core.channels.get(second.id)?.invitations?.[0]?.status).toBe('pending');
  });

  it.each([true, false])(
    'decides a pending request once (accept=%s), preserving canonical notification and Human replay',
    async (accept) => {
      const f = pendingJoin();
      const result = f.owner.decideJoin(OWNER_HUMAN_CONTEXT, {
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
      expect(
        f.owner.decideJoin(OWNER_HUMAN_CONTEXT, {
          channelId: f.id,
          requestId: f.requestId,
          accept,
        }),
      ).toEqual(result);
      expect(() =>
        f.owner.decideJoin(OWNER_HUMAN_CONTEXT, {
          channelId: f.id,
          requestId: f.requestId,
          accept,
          expectedChannel: f.observed,
        }),
      ).toThrowError(expect.objectContaining({ code: 'stale-channel' }));
      expect(() =>
        f.owner.decideJoin(OWNER_HUMAN_CONTEXT, {
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
        restarted.owner.decideJoin(OWNER_HUMAN_CONTEXT, {
          channelId: f.id,
          requestId: f.requestId,
          accept,
        }).channel.joinRequests?.[0]?.status,
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
      f.owner.decideJoin(OWNER_HUMAN_CONTEXT, {
        channelId: f.id,
        requestId: f.requestId,
        accept: false,
      }),
    ).toThrowError(expect.objectContaining({ code: 'archived-bot' }));
    changed.mockImplementation((slug) => (slug === 'bob' ? undefined : get(slug)));
    expect(() =>
      f.owner.decideJoin(OWNER_HUMAN_CONTEXT, {
        channelId: f.id,
        requestId: f.requestId,
        accept: true,
      }),
    ).toThrowError(expect.objectContaining({ code: 'unknown-bot' }));
    changed.mockImplementation((slug) =>
      slug === 'bob' ? { ...target, createdAt: '2099-01-01T00:00:00.000Z' } : get(slug),
    );
    expect(() =>
      f.owner.decideJoin(OWNER_HUMAN_CONTEXT, {
        channelId: f.id,
        requestId: f.requestId,
        accept: true,
      }),
    ).toThrowError(expect.objectContaining({ code: 'stale-profile' }));
    changed.mockRestore();
    leave(f, f.id);
    expect(() =>
      f.owner.decideJoin(OWNER_HUMAN_CONTEXT, {
        channelId: f.id,
        requestId: f.requestId,
        accept: true,
      }),
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
      f.core.channels.rename(OWNER_HUMAN_CONTEXT, f.id, 'Changed during DM creation');
      return dm;
    });
    expect(() =>
      f.owner.decideJoin(OWNER_HUMAN_CONTEXT, {
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
    expect(() =>
      f.owner.cancelInvite(OWNER_HUMAN_CONTEXT, { channelId: f.id, invitationId: 'missing' }),
    ).toThrowError(expect.objectContaining({ code: 'unknown-invitation' }));
    expect(() =>
      f.owner.decideJoin(OWNER_HUMAN_CONTEXT, {
        channelId: f.id,
        requestId: 'missing',
        accept: true,
      }),
    ).toThrowError(expect.objectContaining({ code: 'unknown-join-request' }));
    const tob = f.core.registry.create({ slug: 'tob', displayName: 'Tob' });
    if (!tob.ok) throw new Error('fixture Tob creation failed');
    const request = f.core.channels.requestGroupJoin({
      channelId: f.id,
      requesterBotSlug: 'tob',
      requesterBotCreatedAt: tob.record.createdAt,
    });
    expect(() =>
      f.owner.decideJoin(OWNER_HUMAN_CONTEXT, {
        channelId: f.id,
        requestId: request.id,
        accept: true,
      }),
    ).toThrowError(expect.objectContaining({ code: 'protected-bot' }));
    const declined = f.owner.decideJoin(OWNER_HUMAN_CONTEXT, {
      channelId: f.id,
      requestId: request.id,
      accept: false,
    });
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
    f.core.channelManagement.decideJoin(OWNER_HUMAN_CONTEXT, {
      channelId: f.id,
      requestId: f.requestId,
      accept: true,
      expectedChannel: f.observed,
    });
    expect(admitted).toHaveBeenCalledExactlyOnceWith('dm-bob', f.requestId);
    f.core.channelManagement.decideJoin(OWNER_HUMAN_CONTEXT, {
      channelId: f.id,
      requestId: f.requestId,
      accept: true,
    });
    expect(admitted).toHaveBeenCalledTimes(1);
  });

  it('does not cancel after Human access is revoked or the target invitation changes', () => {
    const f = pendingInvite();
    f.core.channels.rename(OWNER_HUMAN_CONTEXT, f.id, 'Changed while reviewing');
    expect(() =>
      f.owner.cancelInvite(OWNER_HUMAN_CONTEXT, {
        channelId: f.id,
        invitationId: f.invitationId,
        expectedChannel: f.observed,
      }),
    ).toThrowError(expect.objectContaining({ code: 'stale-channel' }));
    leave(f, f.id);
    expect(() =>
      f.owner.cancelInvite(OWNER_HUMAN_CONTEXT, { channelId: f.id, invitationId: f.invitationId }),
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
