import { describe, expect, it, vi } from 'vitest';

import {
  audienceReady,
  createSpace,
  directoryFrom,
  loadAudienceDirectory,
  loadSpaces,
  parseSpace,
  sameAudience,
  updateSpace,
} from '../src/client/team-spaces-bridge.js';
import { audienceOptions, audienceSummary } from '../src/client/team-spaces-view.js';

const t = (key: string, values?: Record<string, string>): string =>
  values === undefined ? key : `${key}:${JSON.stringify(values)}`;

describe('Team spaces client', () => {
  it('keeps well-formed account and shared spaces', async () => {
    const call = vi.fn(async () => ({
      ok: true as const,
      value: [
        { spaceId: 'a', kind: 'account', name: 'Bob', ownerHumanId: 'h1', canManage: false },
        {
          spaceId: 's',
          kind: 'shared',
          name: 'Finance',
          audience: { kind: 'roles', roleIds: ['r1'] },
          canManage: true,
        },
        { spaceId: 'x', kind: 'other', name: 'Bad' },
        { kind: 'shared', name: 'No id' },
      ],
    }));
    const spaces = await loadSpaces(call);
    expect(call).toHaveBeenCalledWith('spaces', {}, undefined);
    expect(spaces.map((space) => space.spaceId)).toEqual(['a', 's']);
    expect(spaces[1]?.audience).toEqual({ kind: 'roles', roleIds: ['r1'] });
  });

  it('sends a shared space with its audience', async () => {
    const call = vi.fn(async () => ({ ok: true as const, value: {} }));
    await createSpace(call, { name: 'Team', audience: { kind: 'members', humanIds: ['h2'] } });
    expect(call).toHaveBeenCalledWith(
      'spaceCreate',
      { name: 'Team', audience: { kind: 'members', humanIds: ['h2'] } },
      undefined,
    );
  });

  it('requires a non-empty audience list and summarises it', () => {
    expect(audienceReady({ kind: 'roles', roleIds: [] })).toBe(false);
    expect(audienceReady({ kind: 'everyone' })).toBe(true);
    expect(
      parseSpace({ spaceId: 's', kind: 'shared', name: 'S', audience: { kind: 'nope' } })?.audience,
    ).toBeUndefined();
    expect(
      audienceSummary(
        t as never,
        { kind: 'roles', roleIds: ['admin', 'gone'] },
        { roles: [{ roleId: 'admin', name: 'admin', builtin: 'admin' }], members: [] },
      ),
    ).toBe('team.spaces.audienceList:{"names":"team.role.admin"}');
    expect(
      audienceSummary(
        t as never,
        { kind: 'members', humanIds: ['h9'] },
        { roles: [], members: [] },
      ),
    ).toBe('team.spaces.audienceSomePeople');
  });

  it('loads only audience names for folder managers', async () => {
    const call = vi.fn(async () => ({
      ok: true as const,
      value: {
        roles: [
          { roleId: 'r1', name: 'admin', builtin: 'admin', permissions: ['x'] },
          { roleId: 'r2', name: 'Finance', builtin: null },
          { name: 'No id' },
        ],
        members: [{ humanId: 'h1', displayName: 'Bob', username: 'bob' }, { humanId: 'h2' }],
      },
    }));
    expect(await loadAudienceDirectory(call)).toEqual({
      roles: [
        { roleId: 'r1', name: 'admin', builtin: 'admin' },
        { roleId: 'r2', name: 'Finance', builtin: null },
      ],
      members: [{ humanId: 'h1', displayName: 'Bob' }],
    });
    expect(call).toHaveBeenCalledWith('spaceAudienceDirectory', {}, undefined);
  });

  it('builds the directory from admin lists with active members only', () => {
    const member = (humanId: string, status: string) =>
      ({ humanId, displayName: humanId, status }) as never;
    expect(
      directoryFrom(
        [{ roleId: 'r1', name: 'Finance', builtin: null } as never],
        [member('h1', 'active'), member('h2', 'suspended')],
      ),
    ).toEqual({
      roles: [{ roleId: 'r1', name: 'Finance', builtin: null }],
      members: [{ humanId: 'h1', displayName: 'h1' }],
    });
  });

  it('keeps stored audience entries that left the directory so they can be cleared', () => {
    const directory = { roles: [], members: [{ humanId: 'h1', displayName: 'Bob' }] };
    const stored = { kind: 'members' as const, humanIds: ['h1', 'gone'] };
    expect(audienceOptions(t as never, stored, stored, directory)).toEqual([
      { id: 'h1', label: 'Bob' },
      { id: 'gone', label: 'team.spaces.inactiveMember' },
    ]);
    expect(audienceOptions(t as never, { kind: 'roles', roleIds: [] }, stored, directory)).toEqual(
      [],
    );
    expect(audienceOptions(t as never, { kind: 'everyone' }, stored, directory)).toEqual([]);
  });

  it('renames without resending an unchanged audience', async () => {
    const call = vi.fn(async () => ({ ok: true as const, value: {} }));
    await updateSpace(call, { spaceId: 's', name: 'Renamed' });
    expect(call).toHaveBeenCalledWith('spaceUpdate', { spaceId: 's', name: 'Renamed' }, undefined);
    expect(
      sameAudience(
        { kind: 'members', humanIds: ['a', 'b'] },
        { kind: 'members', humanIds: ['b', 'a'] },
      ),
    ).toBe(true);
    expect(
      sameAudience({ kind: 'members', humanIds: ['a'] }, { kind: 'roles', roleIds: ['a'] }),
    ).toBe(false);
    expect(sameAudience({ kind: 'everyone' }, { kind: 'everyone' })).toBe(true);
  });
});
