import { Peer } from '@deepseek-ai/dsh-client-connection';
import { parseTeamInvitation } from '@botharness/host-protocol/team-invitation';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { host, run } from './cli-team-fixtures.js';
import { cleanup, enabledFixture } from './team-mode-fixtures.js';

afterEach(cleanup);

describe('Internal member settings', () => {
  it('uses the new settings for future invitations and implicit role assignments', async () => {
    const now = Date.parse('2026-11-14T00:00:00Z');
    const f = await enabledFixture({ now: () => now });
    const peer = new Peer(f.ctx, { principal: { kind: 'owner' } });
    const call = (method: string, args = {}) =>
      f.gateway.invoke({ namespace: 'botharness', method, args, peer });
    const invite = async (humanId: string) =>
      z
        .object({ link: z.string(), expiresAt: z.string() })
        .parse(await call('memberInvitation', { humanId }));
    const initial = { inviteLifetimeMinutes: 10, defaultRoleId: 'member' };
    expect(await call('teamMode')).toMatchObject({
      memberSettings: initial,
      memberUrls: ['https://host.test/botharness-device/team/'],
    });
    expect(await call('teamInsecureHttpSet', { allowed: false })).toMatchObject({
      memberSettings: initial,
    });
    const earlier = await invite(f.human.humanId);
    const role = f.team.roles.create(owner, 'New joiners', []).role;

    const configured = { inviteLifetimeMinutes: 45, defaultRoleId: role.roleId };
    expect(await call('teamMemberSettingsSet', configured)).toEqual(configured);
    expect(await call('teamMode')).toMatchObject({ memberSettings: configured });
    const later = await invite(f.human.humanId);
    expect(earlier.expiresAt).toBe('2026-11-14T00:10:00.000Z');
    expect(later.expiresAt).toBe('2026-11-14T00:45:00.000Z');
    expect(parseTeamInvitation(earlier.link, now + 10 * 60_000)).toEqual({
      ok: false,
      code: 'invitation-expired',
    });
    expect(parseTeamInvitation(later.link, now + 10 * 60_000)).toMatchObject({
      ok: true,
      value: { username: 'bob', expiresAt: later.expiresAt },
    });
    expect(await call('memberCreate', { username: 'alice', displayName: 'Alice' })).toMatchObject({
      member: { roleIds: [role.roleId] },
    });
    expect(
      await call('memberCreate', {
        username: 'carol',
        displayName: 'Carol',
        roleIds: ['member'],
      }),
    ).toMatchObject({ member: { roleIds: ['member'] } });
    expect(await call('members')).toContainEqual(
      expect.objectContaining({ username: 'bob', roleIds: ['member'] }),
    );

    for (const invalid of [
      {},
      { inviteLifetimeMinutes: 0 },
      { inviteLifetimeMinutes: 43_201 },
      { inviteLifetimeMinutes: 1.5 },
      { defaultRoleId: '' },
    ]) {
      await expect(call('teamMemberSettingsSet', invalid)).rejects.toMatchObject({
        code: 'invalid-input',
      });
    }
    await expect(
      call('teamMemberSettingsSet', { defaultRoleId: 'missing', inviteLifetimeMinutes: 2 }),
    ).rejects.toMatchObject({ code: 'role-not-found' });
    expect(await call('teamMode')).toMatchObject({ memberSettings: configured });

    await call('roleDelete', { roleId: role.roleId });
    expect(await call('teamMode')).toMatchObject({
      memberSettings: { inviteLifetimeMinutes: 45, defaultRoleId: 'member' },
    });
  });

  it('applies the caller’s Team settings and role delegation checks through the CLI', async () => {
    const f = await enabledFixture();
    await f.team.changePassword(f.human, f.initialPassword, 'bob-password-2', false);
    const endpoint = await host(undefined, undefined, undefined, undefined, async (input) => {
      try {
        const value = await f.team.asMember(input.username, (peer) =>
          f.gateway.invoke({ ...input, peer }),
        );
        return { ok: true, value };
      } catch (error) {
        return { ok: false, error: f.gateway.wireStream.failure(error) };
      }
    });
    const update = (...args: string[]) =>
      run(endpoint.url, ['--as', 'bob', 'team-mode', 'member-settings', ...args]);
    const status = () => run(endpoint.url, ['--as', 'bob', 'team-mode', 'status']);

    expect(await update('--invite-lifetime-minutes', '60')).toMatchObject({
      status: 1,
      output: { error: { code: 'permission-required', details: { permission: 'team.settings' } } },
    });
    const settingsOnly = f.team.roles.create(owner, 'Settings', ['team.settings']).role;
    f.team.roles.set(owner, f.human.humanId, [settingsOnly.roleId]);
    expect(await update('--invite-lifetime-minutes', '60')).toMatchObject({
      status: 0,
      output: { inviteLifetimeMinutes: 60, defaultRoleId: 'member' },
    });
    expect(await update('--default-role', 'member')).toMatchObject({
      status: 1,
      output: { error: { code: 'permission-required', details: { permission: 'members.manage' } } },
    });

    const manager = f.team.roles.create(owner, 'Member manager', ['members.manage']).role;
    f.team.roles.set(owner, f.human.humanId, [settingsOnly.roleId, manager.roleId]);
    expect(await update('--default-role', 'admin')).toMatchObject({
      status: 1,
      output: { error: { code: 'permission-required', details: { permission: 'owner' } } },
    });
    expect(await update('--default-role', manager.roleId)).toMatchObject({
      status: 0,
      output: { inviteLifetimeMinutes: 60, defaultRoleId: manager.roleId },
    });

    f.team.setMemberSettings(owner, { defaultRoleId: 'admin' });
    const refused = await run(endpoint.url, [
      '--as',
      'bob',
      'members',
      'create',
      '--username',
      'alice',
      '--display-name',
      'Alice',
      '--initial-password-file',
      `${f.root}/alice.pw`,
    ]);
    expect(refused).toMatchObject({
      status: 1,
      output: { error: { code: 'permission-required', details: { permission: 'owner' } } },
    });
    expect(await status()).toMatchObject({
      status: 0,
      output: { memberSettings: { inviteLifetimeMinutes: 60, defaultRoleId: 'admin' } },
    });
    expect(f.team.members(owner).map(({ username }) => username)).not.toContain('alice');
  });
});
