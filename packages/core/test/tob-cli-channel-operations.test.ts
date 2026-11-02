import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createTobChannelOperations } from '../src/tob/cli-channel-operations.js';
import { startTobCliBroker } from '../src/tob/cli-broker.js';
import { TobError } from '../src/tob/service.js';
import { createTempRoot } from './helpers.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});
function fixture() {
  const root = createTempRoot('tob-channel-cli-');
  let autoAccept = false;
  const core = createCore({ dshHome: root, autoAcceptGroupInvitations: () => autoAccept });
  cleanup.push(async () => {
    await core.runtime.close();
    core.externalMessaging.close();
    core.operationalDatabase.close();
    rmSync(root, { recursive: true, force: true });
  });
  for (const slug of ['research', 'writer'])
    expect(core.registry.create({ slug, displayName: slug }).ok).toBe(true);
  const prepare = createTobChannelOperations({
    management: core.channelManagement,
    channels: core.channels,
    registry: core.registry,
    isProtectedBot: (slug) => core.tob.isTob(slug),
  });
  const run = async (
    command: string,
    args: Record<string, unknown>,
    guard = () => {},
    before = () => {},
  ) => {
    const prepared = await prepare(command, args);
    if (!prepared) throw new Error('Unexpected missing operation');
    return prepared.run(guard, before);
  };
  return {
    core,
    prepare,
    run,
    setAutoAccept(value: boolean) {
      autoAccept = value;
    },
  };
}
const createArgs = () => ({
  name: 'Project',
  members: ['research'],
  operationKey: 'create-project-01',
});
function inviteArgs(f: ReturnType<typeof fixture>, channelId: string) {
  return {
    channelId,
    botSlug: 'writer',
    expectedChannel: f.core.channelManagement.snapshot(channelId).channelFingerprint,
    operationKey: 'invite-writer-01',
  };
}
async function broker(f: ReturnType<typeof fixture>, approve: () => Promise<void>) {
  const effect = vi.fn();
  const transport = await startTobCliBroker({
    signal: new AbortController().signal,
    authorize() {},
    approve,
    beforeWrite: effect,
    prepareOperation: f.prepare,
    readSetting: () => ({ scope: 'global', value: 8, revision: 0 }),
    writeSetting: async () => {
      throw new Error('Unexpected setting mutation');
    },
  });
  cleanup.push(() => transport.close());
  const invoke = async (command: string, args: Record<string, unknown>) => {
    const response = await fetch(transport.endpoint + '/invoke', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + transport.token, 'content-type': 'application/json' },
      body: JSON.stringify({ command, args }),
    });
    return response.json();
  };
  return { invoke, effect };
}

describe('scoped Channel operations through the canonical owner', () => {
  it('rejects denied or revoked source authority before creating a Group or receipt', async () => {
    const f = fixture();
    const before = f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted;
    const prepared = (await f.prepare('group-create', createArgs()))!;
    const effect = vi.fn();
    expect(() =>
      prepared.run(() => {
        throw new TobError('human-dm-required');
      }, effect),
    ).toThrow('human-dm-required');
    const b = await broker(f, async () => {
      throw new TobError('approval-denied');
    });
    expect(await b.invoke('group-create', createArgs())).toMatchObject({
      ok: false,
      error: { code: 'approval-denied' },
    });
    expect(effect).not.toHaveBeenCalled();
    expect(b.effect).not.toHaveBeenCalled();
    expect(f.core.channels.list()).toHaveLength(0);
    expect(f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted).toBe(before);
  });
  it('reviews explicit initial members, creates once and replays the same receipt without another approval', async () => {
    const f = fixture();
    const approve = vi.fn(async () => {});
    const b = await broker(f, approve);
    const input = createArgs();
    const prepared = (await f.prepare('group-create', input))!;
    expect(prepared.proposal).toMatchObject({
      patch: { initialMembership: 'join-directly', members: [{ slug: 'research' }] },
    });
    const created = await b.invoke('group-create', input);
    expect(created).toMatchObject({
      ok: true,
      value: { channel: { members: ['research'] }, receipt: { status: 'completed' } },
    });
    const before = f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted;
    expect(await b.invoke('group-create', input)).toEqual(created);
    expect(approve).toHaveBeenCalledOnce();
    expect(b.effect).toHaveBeenCalledOnce();
    expect(f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted).toBe(before);
    expect(f.core.channels.list()).toHaveLength(1);
  });
  it('preserves pending invitations, canonical acceptance, and no duplicate invite on response-loss retry', async () => {
    const f = fixture();
    const group = f.core.channels.createGroup({ name: 'Project', members: ['research'] });
    const input = inviteArgs(f, group.id);
    const prepared = (await f.prepare('group-invite', input))!;
    expect(prepared.proposal).toMatchObject({
      previousValue: { invitationPolicy: { autoAccept: false } },
      patch: { invite: { slug: 'writer' } },
    });
    const invite = f.core.channelManagement.invite.bind(f.core.channelManagement);
    vi.spyOn(f.core.channelManagement, 'invite').mockImplementationOnce((...args) => {
      invite(...args);
      throw new Error('private lost response diagnostic');
    });
    const approve = vi.fn(async () => {});
    const b = await broker(f, approve);
    expect(await b.invoke('group-invite', input)).toMatchObject({
      ok: false,
      error: { code: 'operation-failed' },
    });
    const replay = await b.invoke('group-invite', input);
    expect(replay).toMatchObject({
      ok: true,
      value: {
        channel: { members: ['research'] },
        invitation: { status: 'pending' },
        receipt: { status: 'completed' },
      },
    });
    expect(approve).toHaveBeenCalledOnce();
    expect(b.effect).toHaveBeenCalledOnce();
    const invitation = f.core.channels.get(group.id)!.invitations![0]!;
    expect(f.core.channels.get(group.id)!.invitations).toHaveLength(1);
    f.core.channels.respondToGroupInvite({
      invitationId: invitation.id,
      targetBotSlug: 'writer',
      targetBotCreatedAt: f.core.registry.get('writer')!.createdAt,
      accept: true,
    });
    expect(await f.run('channel', { channelId: group.id })).toMatchObject({
      channel: { members: ['research', 'writer'], invitations: [{ status: 'accepted' }] },
    });
  });
  it('rechecks Channel state, invitation policy and Bot identity after review', async () => {
    const f = fixture();
    const group = f.core.channels.createGroup({ name: 'Project', members: ['research'] });
    const initial = inviteArgs(f, group.id);
    const changedPolicy = (await f.prepare('group-invite', initial))!;
    f.setAutoAccept(true);
    const effect = vi.fn();
    expect(() => changedPolicy.run(() => {}, effect)).toThrow('stale-channel');
    f.setAutoAccept(false);
    const changedBot = (await f.prepare('group-invite', initial))!;
    f.core.registry.update('writer', { displayName: 'Renamed after review' });
    expect(() => changedBot.run(() => {}, effect)).toThrow('stale-profile');
    const changedGroup = (await f.prepare('group-invite', initial))!;
    f.core.channels.rename(group.id, 'Renamed group');
    expect(() => changedGroup.run(() => {}, effect)).toThrow('stale-channel');
    expect(effect).not.toHaveBeenCalled();
    expect(f.core.channels.get(group.id)?.invitations ?? []).toHaveLength(0);
  });
  it('does not invalidate reviewed management for unrelated messages and reports automatic acceptance honestly', async () => {
    const f = fixture();
    f.setAutoAccept(true);
    const group = f.core.channels.createGroup({ name: 'Project', members: ['research'] });
    const input = inviteArgs(f, group.id);
    const prepared = (await f.prepare('group-invite', input))!;
    expect(prepared.proposal).toMatchObject({ patch: { invitationPolicy: { autoAccept: true } } });
    input.botSlug = 'research';
    await f.core.channels.appendMessage(group.id, {
      id: 'unrelated-human-message',
      at: '2099-01-01T00:00:00.000Z',
      author: { kind: 'human' },
      body: 'Unrelated discussion, not a management instruction.',
    });
    expect(f.core.channelManagement.snapshot(group.id).channelFingerprint).toBe(
      input.expectedChannel,
    );
    const effect = vi.fn();
    expect(await prepared.run(() => {}, effect)).toMatchObject({
      channel: { members: ['research', 'writer'] },
      invitation: { status: 'accepted', respondedBy: 'profile-policy' },
    });
    expect(effect).toHaveBeenCalledOnce();
  });

  it('refuses protected, archived, removed or injected targets before any effect', async () => {
    const f = fixture();
    const home = await f.core.tob.ensure();
    await expect(
      f.run('group-create', { ...createArgs(), members: [home.botSlug] }),
    ).rejects.toMatchObject({ code: 'protected-bot' });
    f.core.registry.setPaused('writer', true);
    await expect(
      f.run('group-create', { ...createArgs(), members: ['writer'] }),
    ).rejects.toMatchObject({ code: 'archived-bot' });
    await expect(
      f.run('group-create', { ...createArgs(), members: ['missing'] }),
    ).rejects.toMatchObject({ code: 'unknown-bot' });
    await expect(
      f.run('group-create', { ...createArgs(), ownerBotSlug: 'research' }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    expect(f.core.channels.list().filter((channel) => channel.type === 'group')).toHaveLength(0);
  });
  it('returns bounded metadata without messages, images or private Bot DMs', async () => {
    const f = fixture();
    const group = f.core.channels.createGroup({ name: 'Project', members: ['research'] });
    f.core.channels.getOrCreateDm('research');
    const privateDm = f.core.channels.getOrCreateBotDm('research', 'writer', 'private');
    const page = (await f.run('channels', { limit: 1 })) as {
      channels: Array<{ id: string }>;
      nextCursor?: string;
    };
    expect(page.channels).toHaveLength(1);
    expect(page.nextCursor).toBe(page.channels[0]!.id);
    const next = (await f.run('channels', { limit: 1, cursor: page.nextCursor })) as {
      channels: Array<{ id: string }>;
    };
    expect(next.channels).toHaveLength(1);
    expect([...page.channels, ...next.channels].map((channel) => channel.id)).not.toContain(
      privateDm?.id,
    );
    expect(JSON.stringify(page)).not.toContain('latestMessage');
    const detail = await f.run('channel', { channelId: group.id });
    expect(detail).toMatchObject({
      channelFingerprint: f.core.channelManagement.snapshot(group.id).channelFingerprint,
    });
  });
});

describe('reviewed Group settings and member removal', () => {
  function groupFixture() {
    const f = fixture();
    f.setAutoAccept(true);
    const group = f.core.channels.createGroup({ name: 'Project', members: ['research', 'writer'] });
    const args = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
      channelId: group.id,
      expectedChannel: f.core.channelManagement.snapshot(group.id).channelFingerprint,
      ...patch,
    });
    return { ...f, group, args };
  }
  it('reviews immutable before/after values, renames a Group, and reads back the canonical state', async () => {
    const f = groupFixture();
    const input = f.args({ name: 'Reviewed name' });
    const prepared = (await f.prepare('channel-rename', input))!;
    expect(prepared.proposal).toMatchObject({
      target: f.group.id,
      previousValue: { channel: { name: 'Project' } },
      patch: { changes: { name: 'Reviewed name' } },
    });
    expect(Object.isFrozen(prepared.proposal!.patch)).toBe(true);
    input.name = 'Unreviewed name';
    const effect = vi.fn();
    expect(await prepared.run(() => {}, effect)).toMatchObject({
      channel: { name: 'Reviewed name' },
    });
    expect(effect).toHaveBeenCalledOnce();
    expect(f.core.channels.get(f.group.id)?.name).toBe('Reviewed name');
  });
  it('denied review and revoked Human source cannot rename or remove a member', async () => {
    const f = groupFixture();
    const b = await broker(f, async () => {
      throw new TobError('approval-denied');
    });
    for (const [command, changes] of [
      ['channel-rename', { name: 'Denied' }],
      ['group-member-remove', { botSlug: 'writer' }],
    ] as const) {
      const input = f.args(changes);
      expect(await b.invoke(command, input)).toMatchObject({
        ok: false,
        error: { code: 'approval-denied' },
      });
      const prepared = (await f.prepare(command, input))!;
      expect(() =>
        prepared.run(() => {
          throw new TobError('human-dm-required');
        }),
      ).toThrow('human-dm-required');
    }
    expect(b.effect).not.toHaveBeenCalled();
    expect(f.core.channels.get(f.group.id)).toEqual(f.group);
  });
  it('rejects a Group changed during review without overwriting the independent edit', async () => {
    const f = groupFixture();
    const rename = (await f.prepare('channel-rename', f.args({ name: 'Stale name' })))!;
    const remove = (await f.prepare('group-member-remove', f.args({ botSlug: 'writer' })))!;
    f.core.channels.rename(f.group.id, 'Independent name');
    const effect = vi.fn();
    expect(() => rename.run(() => {}, effect)).toThrow('stale-channel');
    expect(() => remove.run(() => {}, effect)).toThrow('stale-channel');
    expect(effect).not.toHaveBeenCalled();
    expect(f.core.channels.get(f.group.id)).toMatchObject({
      name: 'Independent name',
      members: ['research', 'writer'],
    });
  });
  it('rejects a target profile changed during removal review', async () => {
    const f = groupFixture();
    const remove = (await f.prepare('group-member-remove', f.args({ botSlug: 'writer' })))!;
    f.core.registry.update('writer', { displayName: 'Changed identity presentation' });
    const effect = vi.fn();
    expect(() => remove.run(() => {}, effect)).toThrow('stale-profile');
    expect(effect).not.toHaveBeenCalled();
    expect(f.core.channels.get(f.group.id)?.members).toContain('writer');
  });
  it('removes an archived member through the owner while keeping its Bot and the Group history', async () => {
    const f = groupFixture();
    f.core.registry.setPaused('writer', true);
    await f.core.channels.appendMessage(f.group.id, {
      id: 'preserved-message',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Keep this history',
    });
    const input = f.args({ botSlug: 'writer' });
    const b = await broker(f, async () => {});
    expect(await b.invoke('group-member-remove', input)).toMatchObject({
      ok: true,
      value: { channel: { members: ['research'] } },
    });
    expect(f.core.registry.get('writer')).toMatchObject({ paused: true });
    expect(
      f.core.channels
        .readMessages(f.group.id)
        .some((message) => message.id === 'preserved-message'),
    ).toBe(true);
    expect(
      f.core.channels
        .readMessages(f.group.id)
        .filter((message) => message.memberDeparture?.memberId === 'writer'),
    ).toHaveLength(1);
    expect(await b.invoke('group-member-remove', input)).toMatchObject({
      ok: false,
      error: { code: 'stale-channel' },
    });
    expect(b.effect).toHaveBeenCalledOnce();
  });
  it('reviews and applies a member wake override, then restores inheritance', async () => {
    const f = groupFixture();
    const input = f.args({ botSlug: 'research', mode: 'mentions', count: 5, intervalSeconds: 30 });
    const prepared = (await f.prepare('group-wake-set', input))!;
    expect(prepared.proposal).toMatchObject({
      patch: { changes: { wake: { botSlug: 'research', mode: 'mentions' } } },
    });
    await prepared.run(() => {});
    expect(f.core.channels.getGroupWakePolicy(f.group.id, 'research').mode).toBe('mentions');
    expect(await f.run('group-wake-policies', { channelId: f.group.id })).toMatchObject({
      wakePolicies: expect.arrayContaining([
        {
          botSlug: 'research',
          inherited: false,
          policy: expect.objectContaining({ mode: 'mentions' }),
        },
      ]),
    });
    await f.run(
      'group-wake-set',
      f.args({ botSlug: 'research', mode: 'digest', count: 5, intervalSeconds: 30, inherit: true }),
    );
    expect(f.core.channels.get(f.group.id)?.wakePolicies?.research).toBeUndefined();
  });
  it('hashes image bytes in approval/readback without leaking the full image payload', async () => {
    const f = groupFixture();
    const avatar = 'data:image/png;base64,iVBORw0KGgo=';
    const prepared = (await f.prepare('group-avatar-set', f.args({ avatar })))!;
    expect(JSON.stringify(prepared.proposal)).not.toContain(avatar);
    expect(prepared.proposal).toMatchObject({
      patch: { changes: { avatar: { present: true, sha256: expect.any(String) } } },
    });
    await prepared.run(() => {});
    expect(f.core.channels.get(f.group.id)?.avatar).toBe(avatar);
    await f.run('group-avatar-set', f.args({ avatar: null }));
    expect(f.core.channels.get(f.group.id)?.avatar).toBeUndefined();
  });
  it('rejects malformed inputs before presenting a mutation', async () => {
    const f = groupFixture();
    for (const [command, input] of [
      ['channel-rename', { channelId: f.group.id, name: 'Missing fingerprint' }],
      ['channel-rename', f.args({ name: 'x'.repeat(121) })],
      ['group-avatar-set', f.args({ avatar: 'https://untrusted.example/avatar.png' })],
      [
        'group-wake-set',
        f.args({ botSlug: 'research', mode: 'mentions', count: 0, intervalSeconds: 30 }),
      ],
      ['group-member-remove', f.args({ botSlug: 'writer', ownerBotSlug: 'writer' })],
    ] as const)
      await expect(f.run(command, input)).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(
      f.run('group-member-remove', f.args({ botSlug: 'missing' })),
    ).rejects.toMatchObject({ code: 'not-group-member' });
    const dm = f.core.channels.getOrCreateDm('research')!;
    await expect(
      f.run('channel-rename', {
        channelId: dm.id,
        name: 'Wrong scope',
        expectedChannel: 'a'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'not-group-channel' });
  });
});

describe('reviewed invitation cancellation and join decisions', () => {
  function decisionFixture() {
    const f = fixture();
    const group = f.core.channels.createGroup({ name: 'Decisions', members: ['research'] });
    const args = (patch: Record<string, unknown>): Record<string, unknown> => ({
      channelId: group.id,
      expectedChannel: f.core.channelManagement.snapshot(group.id).channelFingerprint,
      ...patch,
    });
    const invite = () =>
      f.core.channelManagement.invite({ channelId: group.id, botSlug: 'writer' }).invitation!;
    const join = () =>
      f.core.channels.requestGroupJoin({
        channelId: group.id,
        requesterBotSlug: 'writer',
        requesterBotCreatedAt: f.core.registry.get('writer')!.createdAt,
      });
    return { ...f, group, args, invite, join };
  }
  it('discovers actual join request IDs without reading conversation bodies', async () => {
    const f = decisionFixture();
    const request = f.join();
    const detail = await f.run('channel', { channelId: f.group.id });
    expect(detail).toMatchObject({
      channel: {
        joinRequests: [{ id: request.id, status: 'pending', requesterBotSlug: 'writer' }],
      },
    });
    expect(JSON.stringify(detail)).not.toContain('latestMessage');
  });
  it('reviews and cancels one pending invitation without changing membership or invite policy', async () => {
    const f = decisionFixture();
    const invitation = f.invite();
    const input = f.args({ invitationId: invitation.id });
    const prepared = (await f.prepare('group-invite-cancel', input))!;
    expect(prepared.proposal).toMatchObject({
      patch: {
        changes: {
          cancelInvitation: { id: invitation.id, status: 'pending', targetBot: { slug: 'writer' } },
          preservesMembers: true,
        },
      },
    });
    expect(Object.isFrozen(prepared.proposal!.patch)).toBe(true);
    input.invitationId = 'unreviewed';
    const effect = vi.fn();
    expect(await prepared.run(() => {}, effect)).toMatchObject({
      channel: { members: ['research'], invitations: [{ id: invitation.id, status: 'cancelled' }] },
      invitationPolicy: { autoAccept: false },
    });
    expect(effect).toHaveBeenCalledOnce();
    expect(() => prepared.run(() => {}, effect)).toThrow('stale-channel');
    expect(effect).toHaveBeenCalledOnce();
  });
  it('never cancels an automatically accepted invitation or removes its member', async () => {
    const f = decisionFixture();
    f.setAutoAccept(true);
    const invitation = f.invite();
    const b = await broker(f, vi.fn());
    expect(
      await b.invoke('group-invite-cancel', f.args({ invitationId: invitation.id })),
    ).toMatchObject({
      ok: false,
      error: { code: 'invitation-not-pending' },
    });
    expect(b.effect).not.toHaveBeenCalled();
    expect(f.core.channels.get(f.group.id)?.members).toContain('writer');
  });
  it.each([true, false])(
    'reviews a pending join and applies accept=%s only once',
    async (accept) => {
      const f = decisionFixture();
      const request = f.join();
      const input = f.args({ requestId: request.id, accept });
      const prepared = (await f.prepare('group-join-decide', input))!;
      expect(prepared.proposal).toMatchObject({
        patch: {
          changes: {
            joinDecision: {
              id: request.id,
              status: 'pending',
              accept,
              requester: { slug: 'writer' },
            },
          },
        },
      });
      input.accept = !accept;
      const effect = vi.fn();
      expect(await prepared.run(() => {}, effect)).toMatchObject({
        channel: {
          members: accept ? ['research', 'writer'] : ['research'],
          joinRequests: [
            { id: request.id, status: accept ? 'accepted' : 'declined', decidedBy: 'human' },
          ],
        },
      });
      expect(() => prepared.run(() => {}, effect)).toThrow('stale-channel');
      await expect(
        f.run('group-join-decide', f.args({ requestId: request.id, accept })),
      ).rejects.toMatchObject({ code: 'join-request-not-pending' });
      expect(effect).toHaveBeenCalledOnce();
    },
  );
  it.each(['group-invite-cancel', 'group-join-decide'])(
    'denial and revoked source leave %s pending',
    async (command) => {
      const f = decisionFixture();
      const patch =
        command === 'group-invite-cancel'
          ? { invitationId: f.invite().id }
          : { requestId: f.join().id, accept: true };
      const initial = f.core.channelManagement.snapshot(f.group.id);
      const b = await broker(f, async () => {
        throw new TobError('approval-denied');
      });
      expect(await b.invoke(command, f.args(patch))).toMatchObject({
        ok: false,
        error: { code: 'approval-denied' },
      });
      const prepared = (await f.prepare(command, f.args(patch)))!;
      expect(() =>
        prepared.run(() => {
          throw new TobError('human-dm-required');
        }),
      ).toThrow('human-dm-required');
      expect(f.core.channelManagement.snapshot(f.group.id)).toEqual(initial);
      expect(b.effect).not.toHaveBeenCalled();
    },
  );
  it('does not override a join decision made while Tob review was pending', async () => {
    const f = decisionFixture();
    const request = f.join();
    const prepared = (await f.prepare(
      'group-join-decide',
      f.args({ requestId: request.id, accept: true }),
    ))!;
    f.core.channelManagement.decideJoin({
      channelId: f.group.id,
      requestId: request.id,
      accept: false,
    });
    const effect = vi.fn();
    expect(() => prepared.run(() => {}, effect)).toThrow('stale-channel');
    expect(effect).not.toHaveBeenCalled();
    expect(f.core.channels.get(f.group.id)).toMatchObject({
      members: ['research'],
      joinRequests: [{ status: 'declined' }],
    });
  });
  it('refuses a changed requester or revoked Human group access before effects', async () => {
    const f = decisionFixture();
    const request = f.join();
    const prepared = (await f.prepare(
      'group-join-decide',
      f.args({ requestId: request.id, accept: true }),
    ))!;
    const effect = vi.fn();
    f.core.registry.update('writer', { displayName: 'Changed after review' });
    expect(() => prepared.run(() => {}, effect)).toThrow('stale-profile');
    const renewed = (await f.prepare(
      'group-join-decide',
      f.args({ requestId: request.id, accept: true }),
    ))!;
    vi.spyOn(f.core.channels, 'listHumanMembers').mockReturnValue([]);
    expect(() => renewed.run(() => {}, effect)).toThrow('channel-access-denied');
    expect(effect).not.toHaveBeenCalled();
    expect(f.core.channels.get(f.group.id)?.joinRequests?.[0]?.status).toBe('pending');
  });
  it('rejects missing, foreign and malformed targets before review', async () => {
    const f = decisionFixture();
    const request = f.join();
    const foreign = f.core.channels.createGroup({ name: 'Other', members: [] });
    await expect(
      f.run('group-join-decide', {
        channelId: foreign.id,
        requestId: request.id,
        accept: true,
        expectedChannel: f.core.channelManagement.snapshot(foreign.id).channelFingerprint,
      }),
    ).rejects.toMatchObject({ code: 'unknown-join-request' });
    for (const [command, patch, code] of [
      ['group-invite-cancel', { invitationId: 'missing' }, 'unknown-invitation'],
      ['group-join-decide', { requestId: request.id, accept: 'true' }, 'invalid-input'],
      [
        'group-join-decide',
        { requestId: request.id, accept: true, decidedBy: 'human' },
        'invalid-input',
      ],
      ['group-invite-cancel', { invitationId: '' }, 'invalid-input'],
    ] as const)
      await expect(f.run(command, f.args(patch))).rejects.toMatchObject({ code });
    expect(f.core.channels.get(f.group.id)?.joinRequests?.[0]?.status).toBe('pending');
  });
});
