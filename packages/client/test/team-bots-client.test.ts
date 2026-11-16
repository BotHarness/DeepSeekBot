import { describe, expect, it, vi } from 'vitest';

import {
  loadBotAccess,
  loadReachableBots,
  parseRoleConflict,
  sameVisibility,
  setBotSwitches,
  setBotVisibility,
} from '../src/client/team-bots-bridge.js';

const ok = (value: unknown) => vi.fn(async () => ({ ok: true as const, value }));

describe('Bot access client', () => {
  it('reads visibility, switches and a directory with built-in roles', async () => {
    const call = ok({
      visibility: { kind: 'public', audience: { kind: 'roles', roleIds: ['finance'] } },
      switches: { proactiveDms: true, joinPrincipalChannels: false },
      audienceDirectory: {
        roles: [
          { roleId: 'member', name: 'member', builtin: 'member' },
          { roleId: 'finance', name: 'Finance' },
          { roleId: 7 },
        ],
        members: [{ humanId: 'bob', displayName: 'Bob' }, { humanId: 'x' }],
      },
    });
    const access = await loadBotAccess(call, 'diary');
    expect(call).toHaveBeenCalledWith('botVisibility', { slug: 'diary' }, undefined);
    expect(access.visibility).toEqual({
      kind: 'public',
      audience: { kind: 'roles', roleIds: ['finance'] },
    });
    expect(access.switches).toEqual({
      proactiveDms: true,
      joinPrincipalChannels: false,
      speakerContext: true,
    });
    expect(access.directory.roles).toEqual([
      { roleId: 'member', name: 'member', builtin: 'member' },
      { roleId: 'finance', name: 'Finance', builtin: null },
    ]);
    expect(access.directory.members).toEqual([{ humanId: 'bob', displayName: 'Bob' }]);
  });

  it('returns a preview with counts and Memory labels until confirmed', async () => {
    const call = ok({
      applied: false,
      preview: {
        dmsBecomingReadOnly: [{ channelId: 'd1', humanId: 'bob' }],
        channelsLeaving: [{ channelId: 'c1' }, { channelId: 'c2' }],
        memory: { from: 'Bob’s folder', to: 'Diary (public)' },
      },
    });
    const visibility = { kind: 'public', audience: { kind: 'everyone' } } as const;
    expect(await setBotVisibility(call, 'diary', visibility, false)).toEqual({
      applied: false,
      preview: {
        dmsBecomingReadOnly: 1,
        channelsLeaving: 2,
        memoryFrom: 'Bob’s folder',
        memoryTo: 'Diary (public)',
      },
    });
    expect(call).toHaveBeenCalledWith(
      'botVisibilitySet',
      { slug: 'diary', visibility: { kind: 'public', audience: { kind: 'everyone' } } },
      undefined,
    );
    const confirm = ok({ applied: true, visibility: { kind: 'private' } });
    expect(await setBotVisibility(confirm, 'diary', { kind: 'private' }, true)).toEqual({
      applied: true,
      visibility: { kind: 'private' },
    });
    expect(confirm).toHaveBeenCalledWith(
      'botVisibilitySet',
      { slug: 'diary', visibility: { kind: 'private' }, confirm: true },
      undefined,
    );
  });

  it('sends only the changed switch and lists reachable Bots as metadata', async () => {
    const call = ok({
      switches: { proactiveDms: false, joinPrincipalChannels: true, speakerContext: false },
    });
    expect(await setBotSwitches(call, 'diary', { speakerContext: false })).toMatchObject({
      speakerContext: false,
    });
    expect(call).toHaveBeenCalledWith(
      'botSwitches',
      { slug: 'diary', speakerContext: false },
      undefined,
    );
    const reach = ok([
      { slug: 'helper', displayName: 'Helper', visibility: 'public', principalDisplayName: 'Ada' },
      { displayName: 'broken' },
    ]);
    expect(await loadReachableBots(reach)).toEqual([
      { slug: 'helper', displayName: 'Helper', visibility: 'public', principalDisplayName: 'Ada' },
    ]);
  });

  it('compares visibility ignoring order and reads conflicts by role name', () => {
    expect(
      sameVisibility(
        { kind: 'public', audience: { kind: 'members', humanIds: ['a', 'b'] } },
        { kind: 'public', audience: { kind: 'members', humanIds: ['b', 'a'] } },
      ),
    ).toBe(true);
    expect(
      sameVisibility({ kind: 'private' }, { kind: 'public', audience: { kind: 'everyone' } }),
    ).toBe(false);
    expect(
      parseRoleConflict({
        topic: 'salaries',
        allowRole: { roleId: 'f', name: 'Finance' },
        denyRole: { roleId: 'i', name: 'Intern' },
      }),
    ).toEqual({ topic: 'salaries', allowRole: 'Finance', denyRole: 'Intern' });
  });
});
