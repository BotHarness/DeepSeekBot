import { afterEach, expect, it } from 'vitest';
import { readBotInternalMembers, readRoleChannels } from '@botharness/host-client/team-roles';
import { DEFAULT_CHANNEL_POLICY } from '@botharness/host-protocol/channel-policy';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { host, run } from './cli-team-fixtures.js';
import { actors, cleanup } from './team-mode-fixtures.js';

afterEach(cleanup);

it('projects role auto-join and policy overrides independently after each write', async () => {
  const f = await actors({ liveRosterChanges: true });
  const roleId = 'member';
  const group = f.channels.createGroup(owner, { name: 'Dispatch', members: [] });
  const link = { channelId: group.id, name: group.name, tab: 'permissions' };
  const read = () => f.team.channelAccess.roleChannels(owner, roleId);

  expect(read()).toEqual({
    roleId,
    autoJoin: [],
    overrides: [],
    privateChannelsRequireInvitation: true,
  });
  f.team.channelAccess.policySet(owner, group.id, {
    ...DEFAULT_CHANNEL_POLICY,
    overrides: [{ roleId, actions: { post: 'deny' } }],
  });
  expect(read()).toMatchObject({ autoJoin: [], overrides: [link] });

  const abort = new AbortController();
  const roster = f.live.followRoster(owner, abort.signal)[Symbol.asyncIterator]();
  try {
    await roster.next();
    f.team.channelAccess.visibilitySet(owner, group.id, { kind: 'public' });
    expect((await roster.next()).value).toEqual({ type: 'changed' });
    expect(read()).toMatchObject({ autoJoin: [link], overrides: [link] });

    f.team.channelAccess.policySet(owner, group.id, DEFAULT_CHANNEL_POLICY);
    expect((await roster.next()).done).toBe(true);
    expect(read()).toMatchObject({ autoJoin: [link], overrides: [] });
  } finally {
    abort.abort();
    await roster.return?.();
  }

  f.team.channelAccess.visibilitySet(owner, group.id, { kind: 'roles', roleIds: [roleId] });
  expect(read()).toMatchObject({ autoJoin: [link], overrides: [] });
});

it('applies caller authorization through the bridge and CLI for both reads', async () => {
  const f = await actors();
  const alice = humanContext(f.alice.member.humanId);
  const target = { roleId: 'member' };
  const slug = 'dispatch';
  const args = { slug };
  expect(f.registry.create({ ...args, displayName: 'Dispatch' }).ok).toBe(true);
  const publicGroup = f.channels.createGroup(owner, { name: 'Public dispatch', members: [slug] });
  const privateGroup = f.channels.createGroup(owner, { name: 'Private dispatch', members: [slug] });
  f.team.channelAccess.visibilitySet(owner, publicGroup.id, { kind: 'public' });
  f.team.channelAccess.policySet(owner, privateGroup.id, {
    ...DEFAULT_CHANNEL_POLICY,
    overrides: [{ ...target, actions: { post: 'deny' } }],
  });

  await expect(f.invoke('roleChannels', target)).rejects.toMatchObject({
    code: 'permission-required',
  });
  const manager = f.team.roles.create(owner, 'Read manager', ['roles.manage', 'bots.manageAll']);
  f.team.roles.set(owner, f.human.humanId, ['member', manager.role.roleId]);

  expect(await readRoleChannels({ call: f.invoke }, target.roleId)).toMatchObject({
    autoJoin: [{ channelId: publicGroup.id, tab: 'permissions' }],
    overrides: [],
  });
  await expect(f.invoke('roleChannels', { roleId: 'missing' })).rejects.toMatchObject({
    code: 'role-not-found',
  });
  await expect(f.invoke('roleChannels', { roleId: '' })).rejects.toMatchObject({
    code: 'invalid-input',
  });

  await expect(f.invoke('botInternalMembers', args)).rejects.toMatchObject({
    code: 'bot-not-found',
  });
  expect(
    await f.methods(owner).botVisibilitySet({
      ...args,
      visibility: {
        kind: 'public',
        audience: { kind: 'members', humanIds: [alice.humanId, f.human.humanId] },
      },
    }),
  ).toMatchObject({ ok: true });
  await expect(
    f.invoke('botInternalMembers', args, f.team.admit(f.aliceLogin.token) ?? f.aliceLogin.peer),
  ).rejects.toMatchObject({
    code: 'bot-not-found',
  });

  const dm = f.team.bots.dm(f.human, slug);
  if (!dm) throw new Error('DM unavailable');
  const foreignDm = f.team.bots.dm(alice, slug);
  if (!foreignDm) throw new Error('DM unavailable');
  const at = '2026-11-13T00:00:00.000Z';
  const append = (human: typeof alice, channelId: string, id: string, timestamp: string) =>
    f.channels.appendMessage(human, channelId, {
      id,
      at: timestamp,
      author: { kind: 'human', humanId: human.humanId },
      body: 'DM body',
    });
  await append(f.human, dm.id, 'old', '2026-10-01T00:00:00.000Z');
  expect((await readBotInternalMembers({ call: f.invoke }, slug)).recentInteractions).toEqual([]);
  await append(f.human, dm.id, 'recent', at);
  await append(alice, foreignDm.id, 'foreign', at);

  const expected = {
    ...args,
    displayName: 'Dispatch',
    dmMembers: [{ humanId: f.human.humanId, displayName: 'Bob' }],
    recentInteractions: [{ humanId: f.human.humanId, channelId: dm.id, at }],
    channels: [
      { channelId: dm.id, name: dm.name, type: 'dm' },
      { channelId: publicGroup.id, name: publicGroup.name, type: 'group' },
    ],
  };
  expect(await readBotInternalMembers({ call: f.invoke }, slug)).toEqual(expected);
  expect(
    f.team.botRoleAccess.internalMembers(owner, slug).dmMembers.map(({ humanId }) => humanId),
  ).toEqual([owner.humanId, alice.humanId, f.human.humanId].sort());

  const cli = await host(undefined, undefined, undefined, undefined, async (input) => {
    try {
      const value = await f.team.asMember(input.username, (peer) =>
        f.gateway.invoke({ ...input, peer }),
      );
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: f.gateway.wireStream.failure(error) };
    }
  });
  expect(await run(cli.url, ['--as', 'bob', 'roles', 'channels', target.roleId])).toMatchObject({
    status: 0,
    output: { autoJoin: [{ channelId: publicGroup.id }] },
  });
  expect(await run(cli.url, ['--as', 'bob', 'bots', 'channels', slug])).toMatchObject({
    status: 0,
    output: expected,
  });
});
