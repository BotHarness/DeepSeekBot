import { describe, expect, it, vi } from 'vitest';

import {
  filterDirectory,
  postRestricted,
  visibilitySummary,
} from '../src/client/channel-access.js';
import {
  DEFAULT_POLICY,
  loadBrowsableChannels,
  loadTeamDirectory,
  openHumanDm,
  parseChannelAccess,
  setChannelVisibility,
} from '../src/client/team-channels-bridge.js';

const t = (key: string, values?: Record<string, string>): string =>
  values === undefined ? key : `${key}:${JSON.stringify(values)}`;

describe('Team Channel access client', () => {
  it('keeps only well-formed browsable Channels and marks role-restricted ones', async () => {
    const call = vi.fn(async () => ({
      ok: true as const,
      value: [
        { channelId: 'c1', name: 'General', memberCount: 3, joined: false, visibility: 'public' },
        { channelId: 'c2' },
        { channelId: 'c3', name: 'Ops', memberCount: -1, joined: true, visibility: 'roles' },
      ],
    }));
    expect(await loadBrowsableChannels(call)).toEqual([
      { channelId: 'c1', name: 'General', memberCount: 3, joined: false, visibility: 'public' },
      { channelId: 'c3', name: 'Ops', memberCount: 0, joined: true, visibility: 'roles' },
    ]);
    expect(call).toHaveBeenCalledWith('browsableChannels', {}, undefined);
  });

  it('reads Channel access with safe defaults and rejects unknown roles', () => {
    expect(parseChannelAccess({ role: 'stranger' })).toBeUndefined();
    expect(
      parseChannelAccess({
        role: 'admin',
        visibility: { kind: 'roles', roleIds: ['r1', 2] },
        policy: { post: 'admins', addBots: 'nobody' },
        admins: [{ humanId: 'h1', displayName: 'Bob' }, { displayName: 'x' }],
      }),
    ).toEqual({
      role: 'admin',
      visibility: { kind: 'roles', roleIds: ['r1'] },
      policy: { ...DEFAULT_POLICY, post: 'admins' },
      admins: [{ humanId: 'h1', displayName: 'Bob' }],
    });
    expect(parseChannelAccess({ role: 'member' })?.visibility).toEqual({ kind: 'private' });
  });

  it('sends visibility through channelVisibilitySet', async () => {
    const call = vi.fn(async () => ({ ok: true as const, value: {} }));
    await setChannelVisibility(call, 'c1', { kind: 'roles', roleIds: ['r1'] });
    expect(call).toHaveBeenCalledWith(
      'channelVisibilitySet',
      { channelId: 'c1', visibility: { kind: 'roles', roleIds: ['r1'] } },
      undefined,
    );
  });

  it('opens a Human DM and lists the directory', async () => {
    const dm = vi.fn(async () => ({ ok: true as const, value: { channel: { id: 'dm1' } } }));
    expect(await openHumanDm(dm, 'h2')).toBe('dm1');
    const directory = vi.fn(async () => ({
      ok: true as const,
      value: { items: [{ humanId: 'h2', displayName: 'Zoe' }, { humanId: '' }] },
    }));
    expect(await loadTeamDirectory(directory)).toEqual([{ humanId: 'h2', displayName: 'Zoe' }]);
  });

  it('restricts the composer only for plain members of an announcement Channel', () => {
    const base = parseChannelAccess({ role: 'member', policy: { post: 'admins' } });
    expect(postRestricted(base)).toBe(true);
    expect(postRestricted(base && { ...base, role: 'admin' })).toBe(false);
    expect(postRestricted(parseChannelAccess({ role: 'member' }))).toBe(false);
    expect(postRestricted(undefined)).toBe(false);
  });

  it('summarises visibility and filters the directory', () => {
    expect(
      visibilitySummary(t as never, { kind: 'roles', roleIds: ['r1', 'gone'] }, [
        { roleId: 'r1', name: 'Design' } as never,
      ]),
    ).toBe('channelAccess.rolesHint:{"roles":"Design, gone"}');
    expect(
      filterDirectory(
        [
          { humanId: 'b', displayName: 'Zoe' },
          { humanId: 'a', displayName: 'Amy' },
        ],
        ' zo ',
      ),
    ).toEqual([{ humanId: 'b', displayName: 'Zoe' }]);
  });
});
