import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { MEMBER_METHODS } from '../src/team/member-methods.js';
import { ADMIN_PERMISSIONS, ownerGrantedPermission } from '../src/team/permissions.js';
import { MEMBER_BOT_CAPABILITIES } from '../src/features/tob/plugin.js';
import { fixture, bob, alice } from './team-member-lifecycle-fixtures.js';

function authorize(core: ReturnType<typeof fixture>['core'], humanId: string) {
  const { role } = core.team.roles.create(owner, 'Bot stewards', ['bots.manageGrants']);
  core.team.roles.set(owner, humanId, ['member', role.roleId]);
  return role.roleId;
}

function seedBots(core: ReturnType<typeof fixture>['core']) {
  core.registry.create({
    slug: 'bob-bot',
    displayName: 'Bob Bot',
    ownerHumanId: bob.humanId,
  });
  core.registry.create({
    slug: 'bob-two',
    displayName: 'Bob Two',
    ownerHumanId: bob.humanId,
  });
  core.registry.create({
    slug: 'ali-bot',
    displayName: 'Ali Bot',
    ownerHumanId: alice.humanId,
  });
}

const on = (slug: string, capability = 'manage-app') => ({
  slug,
  capability,
  enabled: true,
  confirm: true,
});

it('keeps the new permission Owner-granted and out of the built-in Admin role', () => {
  expect(ownerGrantedPermission('bots.manageGrants')).toBe(true);
  expect(ADMIN_PERMISSIONS).not.toContain('bots.manageGrants');
  expect(MEMBER_METHODS.has('managementGrantSet')).toBe(true);
  const { core } = fixture();
  core.team.roles.set(owner, bob.humanId, ['admin']);
  expect(() => core.team.roles.create(bob, 'Escalate', ['bots.manageGrants'])).toThrow(
    'permission-not-grantable',
  );
  const admin = core.team.roles.list(owner).find((role) => role.builtin === 'admin')!;
  expect(() =>
    core.team.roles.update(owner, admin.roleId, {
      permissions: [...admin.permissions, 'bots.manageGrants'],
    }),
  ).toThrow('permission-not-grantable');
});

it('lets a member turn grants on for their own Bots only once the Owner authorizes them', async () => {
  const { core } = fixture();
  await core.tob.ensure();
  seedBots(core);
  const methods = createBridgeMethodsForHumans(core);
  const denial = { ok: false, error: { code: 'permission-required' } };
  expect(methods(bob).managementGrantSet(on('bob-bot'))).toMatchObject(denial);
  expect(methods(bob).managementGrants({ slug: 'bob-bot' })).toMatchObject({
    ok: true,
    value: { holders: [], editable: false },
  });
  authorize(core, bob.humanId);
  expect(methods(bob).managementGrants({ slug: 'bob-bot' })).toMatchObject({
    ok: true,
    value: { editable: true, memberBot: true },
  });
  expect(methods(bob).managementGrants({ slug: 'ali-bot' })).toMatchObject({
    ok: false,
    error: { code: 'bot-not-found' },
  });
  expect(methods({ ...bob, caller: 'bot' }).managementGrantSet(on('bob-bot'))).toMatchObject(
    denial,
  );
  expect(methods(bob).managementGrantSet(on('ali-bot'))).toMatchObject({
    ok: false,
    error: { code: 'bot-not-found' },
  });
  expect(methods(bob).managementGrantSet(on('bob-bot'))).toMatchObject({
    ok: true,
    value: {
      botSlug: 'bob-bot',
      capabilities: ['manage-app'],
      changed: true,
      noAppManager: false,
    },
  });
  expect(core.tob.holdsManagementGrant('bob-bot', 'manage-app')).toBe(true);
  expect(methods(bob).managementGrants({ slug: 'bob-bot' })).toMatchObject({
    ok: true,
    value: { holders: [{ botSlug: 'bob-bot', capabilities: ['manage-app'] }] },
  });
  const ownerHolders = methods(owner).managementGrants({});
  expect(ownerHolders.ok && ownerHolders.value.holders.map((holder) => holder.botSlug)).toEqual([
    (await core.tob.ensure()).botSlug,
  ]);
  expect(
    core.channels
      .readMessages(core.channels.getOrCreateDm(bob, 'bob-bot', 'Bob Bot')!.id)
      .map((message) => message.managementGrant),
  ).toEqual([
    {
      botSlug: 'bob-bot',
      botName: 'Bob Bot',
      capability: 'manage-app',
      enabled: true,
    },
  ]);
  expect(
    methods(bob).managementGrantSet({
      ...on('bob-bot'),
      enabled: false,
      confirm: undefined,
    }),
  ).toMatchObject({
    ok: true,
    value: { capabilities: [], noAppManager: true },
  });
});

it('stops counting a member Bot’s grant when the Owner withdraws the authorization', () => {
  const { core } = fixture();
  seedBots(core);
  const roleId = authorize(core, bob.humanId);
  core.tob.setManagementGrant(bob, 'bob-bot', 'manage-bots', true);
  expect(core.tob.holdsManagementGrant('bob-bot')).toBe(true);
  core.team.roles.update(owner, roleId, { permissions: [] });
  expect(core.tob.holdsManagementGrant('bob-bot')).toBe(false);
  expect(core.tob.canManageGrants(bob)).toBe(false);
  expect(() => core.tob.setManagementGrant(bob, 'bob-bot', 'manage-bots', false)).toThrow(
    'permission-required',
  );
  core.team.roles.update(owner, roleId, { permissions: ['bots.manageGrants'] });
  expect(core.tob.holdsManagementGrant('bob-bot')).toBe(true);
  core.team.roles.set(owner, bob.humanId, ['member']);
  expect(core.tob.holdsManagementGrant('bob-bot')).toBe(false);
});

it('stops counting a member Bot’s grant when the member is suspended or Team mode is off', async () => {
  const { core, db } = fixture();
  seedBots(core);
  authorize(core, bob.humanId);
  core.tob.setManagementGrant(bob, 'bob-bot', 'manage-app', true);
  db.transaction((connection) => connection.prepare('UPDATE team_settings SET enabled = 0').run());
  expect(core.tob.holdsManagementGrant('bob-bot')).toBe(false);
  db.transaction((connection) => connection.prepare('UPDATE team_settings SET enabled = 1').run());
  expect(core.tob.holdsManagementGrant('bob-bot')).toBe(true);
  await core.team.suspend(owner, bob.humanId);
  expect(core.tob.holdsManagementGrant('bob-bot')).toBe(false);
});

it('gives a member Bot CLI authority only in its own Human’s DM turn', async () => {
  const { core, runs } = fixture();
  seedBots(core);
  authorize(core, bob.humanId);
  core.tob.setManagementGrant(bob, 'bob-bot', 'manage-app', true);
  const outcomes: string[] = [];
  runs.mockImplementation(async (run) => {
    try {
      core.runtime.captureTobCliAuthority!(run.sessionId)();
      outcomes.push(`${run.bot.slug}:ok`);
    } catch (error) {
      outcomes.push(`${run.bot.slug}:${(error as Error).message}`);
    }
  });
  const send = async (human: typeof bob, slug: string, name: string) => {
    const dm = core.channels.getOrCreateDm(human, slug, name)!;
    const sent = await createBridgeMethodsForHumans(core)(human).channelSend({
      channelId: dm.id,
      messageId: 'human-' + randomUUID(),
      body: 'Check the App',
    });
    expect(sent.ok).toBe(true);
    await core.runtime.whenIdle();
  };
  await send(bob, 'bob-bot', 'Bob Bot');
  await send(bob, 'bob-two', 'Bob Two');
  core.team.roles.set(owner, bob.humanId, ['member']);
  await send(bob, 'bob-bot', 'Bob Bot');
  expect(outcomes).toEqual([
    'bob-bot:ok',
    'bob-two:tob-authority-required',
    'bob-bot:tob-authority-required',
  ]);
});

it('limits member Bots to commands that run through the member’s own bridge', () => {
  const commands = MEMBER_BOT_CAPABILITIES.map((entry) => entry.command);
  expect(commands).toContain('create');
  expect(commands).toContain('memory-save');
  expect(commands).toContain('share-draft-show');
  expect(commands).toContain('update');
  expect(commands.filter((command) => command.startsWith('bot-delete-'))).toEqual([]);
  for (const ownerOnly of [
    'cli',
    'doctor',
    'diagnostic-logs',
    'group-create',
    'memory-snapshot',
    'pause',
    'resume',
    'bot-delete-confirm',
  ])
    expect(commands).not.toContain(ownerOnly);
});
