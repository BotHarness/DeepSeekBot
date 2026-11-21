import { afterEach, describe, expect, it } from 'vitest';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { cleanup, enabledFixture } from './team-mode-fixtures.js';

afterEach(cleanup);

describe('Desktop Group member batches', () => {
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
          { kind: 'human', id: other.member.humanId },
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
    const person = { kind: 'human', id: human.humanId } as const;
    const unavailable = { kind: 'human', id: 'missing-human' } as const;

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
          { ...unavailable, status: 'failed', code: 'member-not-found' },
          { ...person, status: 'joined' },
          { kind: 'bot', id: 'bob-bot', status: 'pending' },
        ],
      },
    });
    expect(team.channelAccess.canRead(human, group.id, true)).toBe(true);
    expect(await methods.channelGroupMembersAdd(request)).toEqual(result);
    expect(channels.get(group.id)?.invitations).toHaveLength(1);
  });
});
