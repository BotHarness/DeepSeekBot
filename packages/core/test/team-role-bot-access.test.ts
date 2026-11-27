import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { host, run } from './cli-team-fixtures.js';
import { actors, cleanup } from './team-mode-fixtures.js';

afterEach(cleanup);

const rolesAudience = (roleIds: string[]) => ({
  kind: 'public',
  audience: { kind: 'roles', roleIds },
});

async function liveMemberCli(f: Awaited<ReturnType<typeof actors>>) {
  return host(undefined, undefined, undefined, undefined, async (input) => {
    try {
      const value = await f.team.asMember(input.username, (peer) =>
        f.gateway.invoke({ ...input, peer }),
      );
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: f.gateway.wireStream.failure(error) };
    }
  });
}

it('grants and revokes participant DM access through the same selected role audience', async () => {
  const f = await actors();
  const api = f.methods(owner);
  const { role } = f.team.roles.create(owner, 'Dispatch', []);
  f.team.roles.set(owner, f.member.humanId, [role.roleId]);
  expect(f.registry.create({ slug: 'dispatch', displayName: 'Dispatch' }).ok).toBe(true);
  expect(await api.botVisibility({ slug: 'dispatch' })).toMatchObject({
    ok: true,
    value: { visibility: { kind: 'private' } },
  });
  await api.botVisibilitySet({ slug: 'dispatch', visibility: rolesAudience([]) });
  const before = await api.roleBotScope({ roleId: role.roleId });
  expect(before).toMatchObject({
    ok: true,
    value: { kind: 'selected', bots: [{ slug: 'dispatch', selected: false, editable: true }] },
  });
  if (!before.ok) throw new Error(before.error.code);
  await expect(f.invoke('channelDm', { slug: 'dispatch' })).rejects.toMatchObject({
    code: 'bot-not-found',
  });

  const patch = { roleId: role.roleId, expectedRevision: before.value.revision };
  expect(
    await api.roleBotScopeSet({
      ...patch,
      scope: { kind: 'selected', botSlugs: ['dispatch', 'missing'] },
    }),
  ).toMatchObject({ ok: false, error: { code: 'bot-not-editable' } });
  expect(await api.roleBotScope({ roleId: role.roleId })).toEqual(before);
  const applied = await api.roleBotScopeSet({
    ...patch,
    scope: { kind: 'selected', botSlugs: ['dispatch'] },
  });
  expect(applied).toMatchObject({
    ok: true,
    value: { bots: [{ slug: 'dispatch', selected: true }] },
  });
  if (!applied.ok) throw new Error(applied.error.code);
  expect(await api.botVisibility({ slug: 'dispatch' })).toMatchObject({
    ok: true,
    value: { visibility: rolesAudience([role.roleId]) },
  });
  expect(await api.botAccessRoles({ slug: 'dispatch' })).toMatchObject({
    ok: true,
    value: {
      roles: [{ roleId: role.roleId, name: 'Dispatch', source: 'selected' }],
      invitedMembers: [],
    },
  });
  const { channel } = z
    .object({ channel: z.object({ id: z.string() }) })
    .parse(await f.invoke('channelDm', { slug: 'dispatch' }));
  const cli = await liveMemberCli(f);
  const send = (body: string) =>
    run(cli.url, ['--as', 'bob', 'channels', 'send', channel.id, '--body-stdin'], body);
  expect(await send('Selected by role')).toMatchObject({
    status: 0,
    output: { message: { body: 'Selected by role' } },
  });
  expect(
    await api.roleBotScopeSet({ ...patch, scope: { kind: 'selected', botSlugs: [] } }),
  ).toMatchObject({ ok: false, error: { code: 'stale-role' } });
  expect(
    await api.roleBotScopeSet({
      ...patch,
      expectedRevision: applied.value.revision,
      scope: { kind: 'selected', botSlugs: [] },
    }),
  ).toMatchObject({ ok: true });
  await expect(f.invoke('channelDm', { slug: 'dispatch' })).resolves.toMatchObject({
    channel: { id: channel.id, readOnly: true },
  });
  expect(await send('Revoked')).toMatchObject({
    status: 1,
    output: { error: { code: 'bot-dm-read-only' } },
  });
});

it('keeps new roles and Bots at the existing default until the Owner explicitly enables all-public access', async () => {
  const f = await actors();
  const api = f.methods(owner);
  const { role } = f.team.roles.create(owner, 'Observers', []);
  f.team.roles.set(owner, f.member.humanId, [role.roleId]);
  expect(f.registry.create({ slug: 'named', displayName: 'Named' }).ok).toBe(true);
  await api.botVisibilitySet({
    slug: 'named',
    visibility: {
      kind: 'public',
      audience: { kind: 'members', humanIds: [f.alice.member.humanId] },
    },
  });
  const renamed = f.team.roles.update(owner, role.roleId, { name: 'Observers Renamed' }).role;
  await expect(f.invoke('channelDm', { slug: 'named' })).rejects.toMatchObject({
    code: 'bot-not-found',
  });
  expect(
    await api.roleBotScopeSet({
      roleId: role.roleId,
      expectedRevision: renamed.revision,
      scope: { kind: 'all' },
    }),
  ).toMatchObject({ ok: true, value: { kind: 'all' } });
  expect(await api.botAccessRoles({ slug: 'named' })).toMatchObject({
    ok: true,
    value: {
      audience: 'members',
      roles: [{ roleId: role.roleId, source: 'all' }],
      invitedMembers: [{ humanId: f.alice.member.humanId, displayName: 'Alice' }],
    },
  });
  for (const slug of ['future-public', 'future-private'])
    expect(f.registry.create({ slug, displayName: slug }).ok).toBe(true);
  await api.botVisibilitySet({ slug: 'future-public', visibility: rolesAudience([]) });
  await expect(f.invoke('reachableBots')).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ slug: 'named' }),
      expect.objectContaining({ slug: 'future-public' }),
    ]),
  );
  await expect(f.invoke('reachableBots')).resolves.not.toEqual(
    expect.arrayContaining([expect.objectContaining({ slug: 'future-private' })]),
  );
  await expect(f.invoke('channelDm', { slug: 'future-public' })).resolves.toMatchObject({
    channel: { botSlug: 'future-public' },
  });
  await expect(f.invoke('channelDm', { slug: 'future-private' })).rejects.toMatchObject({
    code: 'bot-not-found',
  });
  expect(await api.botAccessRoles({ slug: 'future-private' })).toMatchObject({
    ok: true,
    value: { audience: 'private', availableToMembers: false, roles: [], invitedMembers: [] },
  });
});

it('uses the same revision from either editing surface and restricts delegated CLI changes', async () => {
  const f = await actors();
  const api = f.methods(owner);
  const { role } = f.team.roles.create(owner, 'Readers', []);
  f.team.roles.set(owner, f.member.humanId, ['admin']);
  expect(f.registry.create({ slug: 'owner-public', displayName: 'Public' }).ok).toBe(true);
  expect(f.registry.create({ slug: 'owner-private', displayName: 'Private' }).ok).toBe(true);
  await api.botVisibilitySet({ slug: 'owner-public', visibility: rolesAudience([]) });
  const cli = await liveMemberCli(f);
  const asAdmin = (...args: string[]) => run(cli.url, ['--as', 'bob', ...args]);
  const before = await asAdmin('roles', 'bot-scope', role.roleId);
  expect(before).toMatchObject({ status: 0, output: { canSetAll: false, canSetSelected: true } });
  const revision = z.object({ revision: z.number() }).parse(before.output).revision;
  expect(await asAdmin('bots', 'access-directory')).toMatchObject({ status: 0 });
  expect((await asAdmin('bots', 'access-directory')).output).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ slug: 'owner-private' })]),
  );
  expect(await asAdmin('bots', 'access-roles', 'owner-private')).toMatchObject({
    status: 1,
    output: { error: { code: 'bot-not-found' } },
  });
  const save = (value: string, at: number) =>
    asAdmin(
      'roles',
      'bot-scope-set',
      role.roleId,
      '--expected-revision',
      String(at),
      '--set',
      value,
    );
  expect(await save('all', revision)).toMatchObject({
    status: 1,
    output: { error: { code: 'permission-required' } },
  });
  expect(
    await api.botVisibilitySet({ slug: 'owner-public', visibility: rolesAudience([role.roleId]) }),
  ).toMatchObject({ ok: true, value: { applied: true } });
  expect(await save('selected:', revision)).toMatchObject({
    status: 1,
    output: { error: { code: 'stale-role' } },
  });
  expect(await asAdmin('bots', 'access-roles', 'owner-public')).toMatchObject({
    status: 0,
    output: { roles: [{ roleId: role.roleId, source: 'selected' }] },
  });
  const current = z
    .object({ revision: z.number() })
    .parse((await asAdmin('roles', 'bot-scope', role.roleId)).output).revision;
  expect(await save('selected:', current)).toMatchObject({
    status: 0,
    output: { bots: [{ slug: 'owner-public', selected: false }] },
  });
  expect(await api.botAccessRoles({ slug: 'owner-public' })).toMatchObject({
    ok: true,
    value: { roles: [] },
  });
  const adminScope = await api.roleBotScope({ roleId: 'admin' });
  if (!adminScope.ok) throw new Error(adminScope.error.code);
  expect(
    await api.roleBotScopeSet({
      roleId: 'admin',
      expectedRevision: adminScope.value.revision,
      scope: { kind: 'all' },
    }),
  ).toMatchObject({ ok: true });
  const afterDelegation = await asAdmin('roles', 'bot-scope', role.roleId);
  expect(afterDelegation).toMatchObject({
    status: 0,
    output: { canSetAll: true, canSetSelected: true },
  });
  expect(await asAdmin('roles', 'bot-scope', 'admin')).toMatchObject({
    status: 0,
    output: { canSetAll: false, canSetSelected: false },
  });
  const delegatedRevision = z
    .object({ revision: z.number() })
    .parse(afterDelegation.output).revision;
  expect(await save('all', delegatedRevision)).toMatchObject({
    status: 0,
    output: { kind: 'all' },
  });
});
