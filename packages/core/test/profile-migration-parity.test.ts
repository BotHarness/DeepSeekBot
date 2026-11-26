import { afterEach, expect, it, vi } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { defineSchemaPlan, type SchemaPlan } from '../src/database/schema.js';
import { createTempRoot } from './helpers.js';

const legacyChannel = JSON.stringify({ id: 'legacy', type: 'dm', members: [] });

function withProfile<T>(
  dshHome: string,
  schemaPlan: SchemaPlan,
  run: (port: ReturnType<typeof attachOperationalModule>) => T,
): T {
  const owner = mountOperationalDatabase({ dshHome, schemaPlan });
  try {
    expect(owner.mode, owner.recovery?.message).toBe('ready');
    expect(owner.generation).toBe(schemaPlan.targetGeneration);
    return run(attachOperationalModule(owner, 'migration-parity'));
  } finally {
    owner.close();
  }
}

function insertChannel(port: ReturnType<typeof attachOperationalModule>) {
  port.transaction((db) =>
    db
      .prepare("INSERT INTO channel_records (channel_id, record_json) VALUES ('legacy', ?)")
      .run(legacyChannel),
  );
}

function readDefaults(port: ReturnType<typeof attachOperationalModule>) {
  return port.read((db) => ({
    roles: db.prepare('SELECT role_id, permissions_json FROM host_roles ORDER BY role_id').all(),
    channel: db
      .prepare("SELECT policy_json FROM channel_records WHERE channel_id = 'legacy'")
      .get(),
  }));
}

afterEach(() => {
  vi.doUnmock('../src/team/permissions.js');
  vi.doUnmock('../src/team/channel-contract.js');
  vi.resetModules();
});

it('persists the same historical Role grants and Channel policy in fresh and upgraded Profiles', async () => {
  const { BOT_HARNESS_SCHEMA_PLAN: originalPlan } = await import('../src/database/schema-plan.js');
  const upgradedHome = createTempRoot('bh-migration-upgraded-');
  const prefix = (generation: number) =>
    defineSchemaPlan(
      originalPlan.migrations.filter((migration) => migration.generation <= generation),
    );
  const teamRoles = originalPlan.generationOf('team-roles');
  const channelAccess = originalPlan.generationOf('channel-access');
  withProfile(upgradedHome, prefix(teamRoles - 1), insertChannel);
  withProfile(upgradedHome, prefix(teamRoles), () => undefined);
  withProfile(upgradedHome, prefix(channelAccess), () => undefined);

  vi.resetModules();
  vi.doMock('../src/team/permissions.js', async (original) => ({
    ...(await original<typeof import('../src/team/permissions.js')>()),
    ADMIN_PERMISSIONS: ['channels.create'],
    MEMBER_PERMISSIONS: [],
  }));
  vi.doMock('../src/team/channel-contract.js', async (original) => {
    const domain = await original<typeof import('../src/team/channel-contract.js')>();
    return {
      ...domain,
      DEFAULT_CHANNEL_POLICY: { ...domain.DEFAULT_CHANNEL_POLICY, post: 'admins' },
    };
  });

  const { BOT_HARNESS_SCHEMA_PLAN: currentPlan } = await import('../src/database/schema-plan.js');
  const upgraded = withProfile(upgradedHome, currentPlan, readDefaults);
  const fresh = withProfile(createTempRoot('bh-migration-fresh-'), currentPlan, (port) => {
    insertChannel(port);
    return readDefaults(port);
  });

  expect(fresh).toEqual(upgraded);
  expect(fresh).toEqual({
    roles: [
      {
        role_id: 'admin',
        permissions_json: JSON.stringify([
          'members.manage',
          'roles.manage',
          'team.settings',
          'channels.create',
          'channels.manageAll',
          'dm.humans',
          'bots.createPrivate',
          'bots.createPublic',
          'bots.manageAll',
          'models.use',
          'models.configure',
          'im.bind',
          'workspaces.manageShared',
          'workspaces.createFolder',
          'approvals.opaqueTools',
          'usage.view',
          'audit.view',
        ]),
      },
      { role_id: 'member', permissions_json: '["dm.humans"]' },
    ],
    channel: {
      policy_json:
        '{"addMembers":"everyone","post":"everyone","mentionAll":"everyone","addBots":"admins","editDetails":"admins"}',
    },
  });
});
