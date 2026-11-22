import { afterEach, describe, expect, it, vi } from 'vitest';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { cleanup, enabledFixture } from './team-mode-fixtures.js';

afterEach(cleanup);

describe('Desktop Group member batches', () => {
  it('uses the signed-in creator on the member gateway and confirms a pending invitation', async () => {
    const f = await enabledFixture();
    const alice = await f.team.createMember(owner, 'alice', 'Alice');
    f.team.roles.set(owner, f.human.humanId, ['admin']);
    await f.team.changePassword(f.human, f.initialPassword, 'batch-member-fixture-2', false);
    const login = await f.team.signIn('bob', 'batch-member-fixture-2', 'batch-member-ip');
    f.registry.create({
      slug: 'bob-helper',
      displayName: 'Bob Helper',
      ownerHumanId: f.human.humanId,
    });
    const invoke = (method: string, args: Record<string, unknown>) =>
      f.gateway.invoke({ namespace: 'botharness', method, args, peer: login.peer });

    await expect(invoke('channelGroupMemberPicker', { query: 'Alice' })).resolves.toMatchObject({
      people: [{ id: alice.member.humanId, displayName: 'Alice' }],
    });
    const creation = {
      name: 'Bob private Group',
      members: [],
      operationKey: 'batch-bob-group-001',
    };
    await expect(invoke('channelCreate', creation)).resolves.toMatchObject({
      channel: { type: 'group', name: creation.name },
    });
    const group = f.channels.list().find((channel) => channel.name === creation.name);
    if (!group) throw new Error('Group was not created');
    const manager = f.methods(owner);
    expect(manager.channelCreate(creation)).toMatchObject({
      ok: false,
      error: { code: 'operation-key-conflict' },
    });
    expect(manager.channelGroupMemberPicker({ channelId: group.id, query: 'Alice' })).toMatchObject(
      {
        ok: true,
        value: { canAddPeople: true, canAddBots: false, people: [{ id: alice.member.humanId }] },
      },
    );
    await expect(
      invoke('channelGroupMembersAdd', {
        channelId: group.id,
        targets: [{ kind: 'bot', id: 'bob-helper', operationKey: 'batch-bob-helper-001' }],
      }),
    ).resolves.toMatchObject({
      results: [{ kind: 'bot', id: 'bob-helper', status: 'pending' }],
    });
  });

  it('replays a Human receipt without restoring role access that ended', async () => {
    const f = await enabledFixture();
    const group = f.channels.createGroup(owner, { name: 'Role Group', members: [] });
    const methods = f.methods(owner);
    const target = { kind: 'human', id: f.human.humanId, operationKey: 'batch-role-bob-001' };
    const request = { channelId: group.id, targets: [target] };

    f.team.channelAccess.visibilitySet(owner, group.id, { kind: 'roles', roleIds: ['member'] });
    expect(f.team.channelAccess.canRead(f.human, group.id, true)).toBe(true);
    expect(methods.channelGroupMembersAdd(request)).toMatchObject({
      ok: true,
      value: { results: [{ kind: 'human', id: target.id, status: 'joined' }] },
    });

    f.team.channelAccess.visibilitySet(owner, group.id, { kind: 'private' });
    expect(f.team.channelAccess.canRead(f.human, group.id, true)).toBe(false);
    expect(methods.channelGroupMembersAdd(request)).toMatchObject({
      ok: true,
      value: {
        results: [
          { kind: 'human', id: target.id, status: 'failed', code: 'channel-membership-ended' },
        ],
      },
    });
    expect(f.team.channelAccess.canRead(f.human, group.id, true)).toBe(false);
  });

  it('scopes creation candidates and keeps Human and Bot permissions independent', async () => {
    const fixture = await enabledFixture();
    const { team, registry, channels, human } = fixture;
    registry.create({ slug: 'bob-helper', displayName: 'Bob Helper', ownerHumanId: human.humanId });
    const manager = fixture.methods(owner);
    const member = fixture.methods(human);
    const group = channels.createGroup(owner, { name: 'Member policy', members: [] });

    expect(member.channelGroupMemberPicker({ query: 'Bob' })).toMatchObject({
      ok: false,
      error: { code: 'permission-required', details: { permission: 'channels.create' } },
    });
    team.channelAccess.addMember(owner, group.id, { humanId: human.humanId });
    const other = await team.createMember(owner, 'alice', 'Alice');
    expect(member.channelGroupMemberPicker({ channelId: group.id })).toMatchObject({
      ok: true,
      value: {
        canAddPeople: true,
        canAddBots: false,
        bots: [],
        people: [{ id: other.member.humanId, displayName: 'Alice' }],
      },
    });
    expect(
      member.channelGroupMembersAdd({
        channelId: group.id,
        targets: [
          { kind: 'human', id: other.member.humanId, operationKey: 'alice-policy-test' },
          { kind: 'bot', id: 'bob-helper', operationKey: 'bob-helper-policy-test' },
        ],
      }),
    ).toMatchObject({
      ok: true,
      value: {
        results: [
          { kind: 'human', id: other.member.humanId, status: 'joined' },
          { kind: 'bot', id: 'bob-helper', status: 'failed', code: 'permission-required' },
        ],
      },
    });
    expect(manager.channelGroupMemberPicker({ channelId: group.id })).toMatchObject({
      ok: true,
      value: { canAddPeople: true, canAddBots: true, people: [] },
    });
  });

  it('grants Human access before inviting their Bot and preserves independent successes', async () => {
    const fixture = await enabledFixture();
    const { team, registry, channels, human } = fixture;
    registry.create({ slug: 'bob-bot', displayName: 'Bob Bot', ownerHumanId: human.humanId });
    team.bots.setVisibility(owner, 'bob-bot', { kind: 'public', audience: { kind: 'everyone' } });
    const group = channels.createGroup(owner, { name: 'Mixed roster', members: [] });
    const methods = fixture.methods(owner);
    const bot = { kind: 'bot', id: 'bob-bot', operationKey: 'mixed-roster-bob-bot' } as const;
    const person = { kind: 'human', id: human.humanId, operationKey: 'mixed-roster-bob' } as const;
    const unavailable = {
      kind: 'human',
      id: 'missing-human',
      operationKey: 'mixed-roster-missing',
    } as const;

    expect(
      await methods.channelGroupMemberPicker({ channelId: group.id, query: 'bob' }),
    ).toMatchObject({
      ok: true,
      value: {
        people: [{ id: human.humanId, displayName: 'Bob' }],
        bots: [{ id: 'bob-bot', requiredHumanId: human.humanId, requiresOwner: true }],
      },
    });
    expect(
      await methods.channelGroupMembersAdd({ channelId: group.id, targets: [bot] }),
    ).toMatchObject({
      ok: true,
      value: {
        results: [
          { kind: 'bot', id: 'bob-bot', status: 'failed', code: 'bot-principal-channel-denied' },
        ],
      },
    });
    const request = { channelId: group.id, targets: [bot, unavailable, person] };
    const result = await methods.channelGroupMembersAdd(request);
    expect(result).toMatchObject({
      ok: true,
      value: {
        results: [
          { kind: 'human', id: unavailable.id, status: 'failed', code: 'member-not-found' },
          { kind: 'human', id: person.id, status: 'joined' },
          { kind: 'bot', id: 'bob-bot', status: 'pending' },
        ],
      },
    });
    expect(team.channelAccess.canRead(human, group.id, true)).toBe(true);
    expect(await methods.channelGroupMembersAdd(request)).toEqual(result);
    expect(channels.get(group.id)?.invitations).toHaveLength(1);
  });

  it('reports unconfirmed targets and continues after unexpected errors on both target kinds', async () => {
    const warn = vi.fn<(message: string) => void>();
    const { team, registry, channels, human, methods } = await enabledFixture({ warn });
    const alice = await team.createMember(owner, 'alice', 'Alice');
    registry.create({ slug: 'first-bot', displayName: 'First Bot' });
    registry.create({ slug: 'second-bot', displayName: 'Second Bot' });
    const group = channels.createGroup(owner, { name: 'Interrupted batch', members: [] });
    const addMember = team.channelAccess.addMember.bind(team.channelAccess);
    vi.spyOn(team.channelAccess, 'addMember').mockImplementationOnce((...args) => {
      addMember(...args);
      throw Object.assign(new Error('Human result interrupted after commit'), {
        code: 'SQLITE_BUSY',
      });
    });
    vi.spyOn(team.bots, 'recordAdder').mockImplementationOnce(() => {
      throw new TypeError('Bot result interrupted after commit');
    });

    const targets = [
      { kind: 'human', id: human.humanId, operationKey: 'interrupt-bob-001' },
      { kind: 'human', id: alice.member.humanId, operationKey: 'interrupt-alice-001' },
      { kind: 'bot', id: 'first-bot', operationKey: 'interrupt-first-001' },
      { kind: 'bot', id: 'second-bot', operationKey: 'interrupt-second-001' },
    ];
    const request = { channelId: group.id, targets };
    const manager = methods(owner);
    expect(manager.channelGroupMembersAdd(request)).toEqual({
      ok: true,
      value: {
        results: [
          { kind: 'human', id: human.humanId, status: 'failed', code: 'group-member-unconfirmed' },
          { kind: 'human', id: alice.member.humanId, status: 'joined' },
          { kind: 'bot', id: 'first-bot', status: 'failed', code: 'group-member-unconfirmed' },
          { kind: 'bot', id: 'second-bot', status: 'pending' },
        ],
      },
    });
    expect(warn.mock.calls.flat()).toEqual([
      `botharness.group_members_add.unconfirmed ${JSON.stringify({
        channelId: group.id,
        targetKind: 'human',
        targetId: human.humanId,
        errorType: 'Error',
        errorCode: 'SQLITE_BUSY',
      })}`,
      `botharness.group_members_add.unconfirmed ${JSON.stringify({
        channelId: group.id,
        targetKind: 'bot',
        targetId: 'first-bot',
        errorType: 'TypeError',
      })}`,
    ]);
    expect(team.channelAccess.canRead(human, group.id, true)).toBe(true);
    expect(channels.get(group.id)?.invitations).toHaveLength(2);
    expect(manager.channelGroupMembersAdd(request)).toMatchObject({
      ok: true,
      value: {
        results: [
          { id: human.humanId, status: 'joined' },
          { id: alice.member.humanId, status: 'joined' },
          { id: 'first-bot', status: 'pending' },
          { id: 'second-bot', status: 'pending' },
        ],
      },
    });
    expect(channels.get(group.id)?.invitations).toHaveLength(2);
  });
});
