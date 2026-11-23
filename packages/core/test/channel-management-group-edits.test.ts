import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { cleanup, fixture } from './support/channel-management.js';

afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of cleanup.splice(0).reverse()) await close();
});

describe('reviewed Group edits', () => {
  it('shares reviewed Group ownership with the Human bridge and returns coded stale failures', () => {
    const f = fixture();
    const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
      registry: f.core.registry,
      channels: f.core.channels,
      states: f.core.states,
      ownership: f.core.ownership,
      roster: f.core.roster,
      channelManagement: f.owner,
    });
    const created = f.owner.create(OWNER_HUMAN_CONTEXT, {
      name: 'Bridge group',
      members: ['ada', 'bob'],
    });
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
    const dm = f.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
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
    const created = f.owner.create(OWNER_HUMAN_CONTEXT, {
      name: 'Research',
      members: ['ada', 'bob'],
    });
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
    const renamed = f.owner.rename(OWNER_HUMAN_CONTEXT, {
      channelId: f.id,
      name: 'Edited',
      expectedChannel: f.created.channelFingerprint,
    });
    expect(renamed.channel.name).toBe('Edited');
    expect(renamed.channelFingerprint).not.toBe(f.created.channelFingerprint);
    const avatar = f.owner.setAvatar(OWNER_HUMAN_CONTEXT, {
      channelId: f.id,
      avatar: png,
      expectedChannel: renamed.channelFingerprint,
    });
    expect(avatar.channel.avatar).toBe(png);
    await f.close();
    const restarted = fixture(f.home);
    expect(restarted.owner.snapshot(f.id).channel).toMatchObject({ name: 'Edited', avatar: png });
    const cleared = restarted.owner.setAvatar(OWNER_HUMAN_CONTEXT, {
      channelId: f.id,
      avatar: null,
      expectedChannel: avatar.channelFingerprint,
    });
    expect(cleared.channel.avatar).toBeUndefined();
  });

  it('rejects invalid names and avatar bytes without changing the Group', () => {
    const f = group();
    for (const name of ['', ' '.repeat(3), 'x'.repeat(121), 'a\nb'])
      expect(() => f.owner.rename(OWNER_HUMAN_CONTEXT, { channelId: f.id, name })).toThrowError(
        expect.objectContaining({ code: 'invalid-input' }),
      );
    expect(() =>
      f.owner.setAvatar(OWNER_HUMAN_CONTEXT, {
        channelId: f.id,
        avatar: 'https://example.com/avatar.png',
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid-input' }));
    expect(f.owner.snapshot(f.id).channelFingerprint).toBe(f.created.channelFingerprint);
  });

  it('binds each edit to the observed Group and refuses stale retried changes', () => {
    const f = group();
    f.owner.rename(OWNER_HUMAN_CONTEXT, { channelId: f.id, name: 'New title' });
    const expectedChannel = f.created.channelFingerprint;
    const edits = [
      () =>
        f.owner.rename(OWNER_HUMAN_CONTEXT, {
          channelId: f.id,
          name: 'Reviewed old title',
          expectedChannel,
        }),
      () =>
        f.owner.setAvatar(OWNER_HUMAN_CONTEXT, { channelId: f.id, avatar: png, expectedChannel }),
      () =>
        f.owner.setWake(OWNER_HUMAN_CONTEXT, {
          channelId: f.id,
          botSlug: 'ada',
          mode: 'silent',
          count: 5,
          intervalSeconds: 30,
          expectedChannel,
        }),
      () =>
        f.owner.removeMember(OWNER_HUMAN_CONTEXT, {
          channelId: f.id,
          botSlug: 'ada',
          expectedChannel,
        }),
    ];
    for (const edit of edits)
      expect(edit).toThrowError(expect.objectContaining({ code: 'stale-channel' }));
    expect(f.core.channels.get(f.id)).toMatchObject({ name: 'New title', members: ['ada', 'bob'] });
  });

  it('detects inherited wake-default changes even when the Group record is unchanged', () => {
    const f = group();
    const before = f.owner.wakePolicies(OWNER_HUMAN_CONTEXT, f.id);
    expect(before.wakePolicies[0]).toMatchObject({
      botSlug: 'ada',
      inherited: true,
      policy: { mode: 'digest' },
    });
    f.core.sourcePolicy.setGroupOrdinary('ada', 'silent', 5, 30, { kind: 'human' });
    expect(f.core.channels.get(f.id)).toEqual(before.channel);
    expect(f.owner.snapshot(f.id).channelFingerprint).not.toBe(before.channelFingerprint);
    expect(() =>
      f.owner.setWake(OWNER_HUMAN_CONTEXT, {
        channelId: f.id,
        botSlug: 'ada',
        mode: 'all',
        count: 5,
        intervalSeconds: 30,
        expectedChannel: before.channelFingerprint,
      }),
    ).toThrowError(expect.objectContaining({ code: 'stale-channel' }));
    const current = f.owner.wakePolicies(OWNER_HUMAN_CONTEXT, f.id);
    const changed = f.owner.setWake(OWNER_HUMAN_CONTEXT, {
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
    const reset = f.owner.setWake(OWNER_HUMAN_CONTEXT, {
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
      () => f.owner.wakePolicies(OWNER_HUMAN_CONTEXT, f.id),
      () => f.owner.rename(OWNER_HUMAN_CONTEXT, { channelId: f.id, name: 'No' }),
      () => f.owner.setAvatar(OWNER_HUMAN_CONTEXT, { channelId: f.id, avatar: png }),
      () =>
        f.owner.setWake(OWNER_HUMAN_CONTEXT, {
          channelId: f.id,
          botSlug: 'ada',
          mode: 'all',
          count: 5,
          intervalSeconds: 30,
        }),
      () => f.owner.removeMember(OWNER_HUMAN_CONTEXT, { channelId: f.id, botSlug: 'ada' }),
    ])
      expect(change).toThrowError(expect.objectContaining({ code: 'channel-access-denied' }));
    const second = group();
    const members = second.core.channels.listHumanMembers.bind(second.core.channels);
    let reads = 0;
    vi.spyOn(second.core.channels, 'listHumanMembers').mockImplementation((human, id) => {
      if (++reads === 2) leave(second);
      return members(human, id);
    });
    expect(() =>
      second.owner.rename(OWNER_HUMAN_CONTEXT, {
        channelId: second.id,
        name: 'Denied mid-operation',
      }),
    ).toThrowError(expect.objectContaining({ code: 'channel-access-denied' }));
    expect(second.core.channels.get(second.id)?.name).toBe('Research');
  });

  it('removes archived members once, keeping the departure event and owner cleanup canonical', () => {
    const f = fixture();
    const created = f.core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
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
    const removed = f.owner.removeMember(OWNER_HUMAN_CONTEXT, {
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
      f.owner.removeMember(OWNER_HUMAN_CONTEXT, {
        channelId: created.id,
        botSlug: 'ada',
        expectedChannel: before.channelFingerprint,
      }),
    ).toThrowError(expect.objectContaining({ code: 'stale-channel' }));
    expect(departures()).toHaveLength(1);
    f.core.registry.setPaused('ada', false);
    f.policy(true);
    f.owner.invite(OWNER_HUMAN_CONTEXT, { channelId: created.id, botSlug: 'ada' });
    expect(() =>
      f.owner.removeMember(OWNER_HUMAN_CONTEXT, {
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
    expect(() =>
      f.owner.removeMember(OWNER_HUMAN_CONTEXT, { channelId: f.id, botSlug: 'tob' }),
    ).toThrowError(expect.objectContaining({ code: 'protected-bot' }));
    expect(() =>
      f.owner.removeMember(OWNER_HUMAN_CONTEXT, { channelId: f.id, botSlug: 'other' }),
    ).toThrowError(expect.objectContaining({ code: 'not-group-member' }));
    const dm = f.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    expect(() =>
      f.owner.rename(OWNER_HUMAN_CONTEXT, { channelId: dm.id, name: 'No' }),
    ).toThrowError(expect.objectContaining({ code: 'not-group-channel' }));
    f.core.channels.deleteGroup(f.id);
    expect(() => f.owner.rename(OWNER_HUMAN_CONTEXT, { channelId: f.id, name: 'No' })).toThrowError(
      expect.objectContaining({ code: 'unknown-channel' }),
    );
  });
});
