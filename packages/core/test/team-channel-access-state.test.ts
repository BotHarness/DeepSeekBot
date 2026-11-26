import { afterEach, describe, expect, it } from 'vitest';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { enabledFixture, cleanup } from './team-mode-fixtures.js';

afterEach(cleanup);

describe('channelAccessState', { timeout: 60_000 }, () => {
  it('tells a member their access was removed while the Group still exists', async () => {
    const f = await enabledFixture();
    const group = f.channels.createGroup(owner, { name: 'Design Room', members: [] });
    f.team.channelAccess.visibilitySet(owner, group.id, { kind: 'roles', roleIds: ['member'] });
    await f.team.accessSettled();
    expect(await f.methods(f.human).channelAccessState({ channelId: group.id })).toEqual({
      ok: true,
      value: { channelId: group.id, state: 'readable' },
    });
    const { role } = f.team.roles.create(owner, 'No audience', []);
    f.team.roles.set(owner, f.human.humanId, [role.roleId]);
    await f.team.accessSettled();
    expect(await f.methods(f.human).channelAccessState({ channelId: group.id })).toEqual({
      ok: true,
      value: { channelId: group.id, state: 'removed' },
    });
  });

  it('keeps a deleted Group and a Group the person never joined unavailable', async () => {
    const f = await enabledFixture();
    const joined = f.channels.createGroup(owner, { name: 'Disbanded', members: [] });
    f.team.channelAccess.addMember(owner, joined.id, f.human.humanId);
    const hidden = f.channels.createGroup(owner, { name: 'Private plans', members: [] });
    f.channels.deleteGroup(joined.id);
    await f.team.accessSettled();
    for (const channelId of [joined.id, hidden.id, 'group-unknown'])
      expect(await f.methods(f.human).channelAccessState({ channelId })).toEqual({
        ok: true,
        value: { channelId, state: 'unavailable' },
      });
  });

  it('does not reveal another member’s removal', async () => {
    const f = await enabledFixture();
    const group = f.channels.createGroup(owner, { name: 'Design Room', members: [] });
    f.team.channelAccess.visibilitySet(owner, group.id, { kind: 'roles', roleIds: ['member'] });
    const other = await f.team.createMember(owner, 'access-outsider', 'Outsider');
    const { role } = f.team.roles.create(owner, 'No audience', []);
    f.team.roles.set(owner, f.human.humanId, [role.roleId]);
    await f.team.accessSettled();
    expect(
      await f
        .methods(humanContext(other.member.humanId))
        .channelAccessState({ channelId: group.id }),
    ).toMatchObject({ ok: true, value: { state: 'readable' } });
    expect(await f.methods(owner).channelAccessState({ channelId: group.id })).toMatchObject({
      ok: true,
      value: { state: 'readable' },
    });
  });

  it('refuses a missing Channel id', async () => {
    const f = await enabledFixture();
    expect(await f.methods(f.human).channelAccessState({})).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });
});
