import { createHash, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { writeZip } from '../src/bots/zip-archive.js';
import { dmChannelId } from '../src/channels/channel.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { MEMBER_METHODS } from '../src/team/member-methods.js';
import { createCore } from '../src/plugin.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { orchestratorPromptSections } from '../src/runtime/dsh-bot-agent-adapter-orchestrator-prompt.js';
import { managerShellAuthority } from '../src/features/tob/cli-runtime.js';
import { TobError } from '../src/tob/service.js';
import { alwaysAsksHuman } from '../src/tob/cli-approval.js';
import { createTempRoot } from './helpers.js';
import { fixture, bob } from './team-member-lifecycle-fixtures.js';

const both = ['manage-app', 'manage-bots'];

it('gives a new built-in Tob both grants and lets only the Human Owner change them', async () => {
  const { core } = fixture();
  const home = await core.tob.ensure();
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const methods = createBridgeMethodsForHumans(core);
  const on = { slug: 'ada', capability: 'manage-app', enabled: true, confirm: true };
  const denial = { ok: false, error: { code: 'permission-required' } };
  expect(MEMBER_METHODS.has('managementGrants')).toBe(true);
  expect(MEMBER_METHODS.has('managementGrantSet')).toBe(false);
  expect(methods(bob).managementGrants({})).toEqual({
    ok: true,
    value: { tobSlug: home.botSlug, holders: [], editable: false },
  });
  expect(methods(owner).managementGrants({})).toEqual({
    ok: true,
    value: {
      tobSlug: home.botSlug,
      holders: [{ botSlug: home.botSlug, capabilities: both }],
      editable: true,
    },
  });
  expect(methods(bob).managementGrantSet(on)).toMatchObject(denial);
  expect(methods({ ...owner, caller: 'bot' }).managementGrantSet(on)).toMatchObject(denial);
  expect(methods(owner).managementGrantSet({ ...on, confirm: false })).toMatchObject({
    ok: false,
    error: { code: 'invalid-input' },
  });
  expect(methods(owner).managementGrantSet(on)).toMatchObject({
    ok: true,
    value: { botSlug: 'ada', capabilities: ['manage-app'], changed: true, noAppManager: false },
  });
  expect(core.tob.managementGrantHolders()).toEqual(
    [
      { botSlug: 'ada', capabilities: ['manage-app'] },
      { botSlug: home.botSlug, capabilities: both },
    ].sort((a, b) => a.botSlug.localeCompare(b.botSlug)),
  );
});

it('writes one timeline marker per change into the Bot’s own Human DM only', async () => {
  const { core } = fixture();
  const home = await core.tob.ensure();
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  core.tob.setManagementGrant(owner, 'ada', 'manage-app', true);
  expect(core.tob.setManagementGrant(owner, 'ada', 'manage-app', true)).toMatchObject({
    changed: false,
  });
  core.tob.setManagementGrant(owner, 'ada', 'manage-app', false);
  expect(
    core.channels.readMessages(dmChannelId('ada')).map((message) => message.managementGrant),
  ).toEqual([
    { botSlug: 'ada', botName: 'Ada', capability: 'manage-app', enabled: false },
    { botSlug: 'ada', botName: 'Ada', capability: 'manage-app', enabled: true },
  ]);
  expect(core.channels.readMessages(home.channelId)).toEqual([]);
});

it('lets the built-in Tob be archived and deleted and warns about the last App manager', async () => {
  const { core } = fixture();
  const home = await core.tob.ensure();
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const bridge = createBridgeMethodsForHumans(core)(owner);
  expect(core.deletions.preview(home.botSlug)).toMatchObject({ lastAppManager: true });
  core.tob.setManagementGrant(owner, 'ada', 'manage-app', true);
  expect(core.deletions.preview(home.botSlug).lastAppManager).toBeUndefined();
  expect(bridge.pause({ slug: home.botSlug })).toMatchObject({ ok: true });
  expect(core.deletions.preview('ada')).toMatchObject({ lastAppManager: true });
  expect(core.tob.setManagementGrant(owner, 'ada', 'manage-app', false)).toMatchObject({
    noAppManager: true,
  });
  const preview = core.deletions.preview(home.botSlug);
  expect(await core.deletions.confirm(home.botSlug, preview.token, false)).toMatchObject({
    phase: 'complete',
  });
  expect(core.tob.managementGrantHolders()).toEqual([]);
  await expect(core.tob.ensure()).rejects.toThrow('tob-identity-unavailable');
});

it('revokes every grant on an Owner transfer and grants both to the incoming Owner’s Tob', async () => {
  const { core } = fixture();
  await core.tob.ensure(owner);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  core.tob.setManagementGrant(owner, 'ada', 'manage-app', true);
  await core.team.setOwnerPassword(owner, 'owner-password-1');
  const member = await core.team.createMember(owner, 'next-owner', 'Next');
  const next = humanContext(member.member.humanId);
  await core.team.changePassword(next, member.initialPassword, 'next-password-1', false);
  await core.team.transferOwner(owner, next.humanId, 'owner-password-1');
  await core.tob.onOwnerChanged();
  const target = await core.tob.ensure(next);
  expect(core.tob.managementGrantHolders()).toEqual([
    { botSlug: target.botSlug, capabilities: both },
  ]);
});

it('migrates a Profile with an existing built-in Tob to both grants', () => {
  const home = createTempRoot('management-grant-migration-');
  const old = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: defineSchemaPlan(BOT_HARNESS_SCHEMA_PLAN.migrations.slice(0, -1)),
  });
  attachOperationalModule(old, 'grant-fixture').transaction((db) => {
    db.prepare(
      "INSERT INTO persona_bots (slug, body, owner_human_id) VALUES ('tob', '{}', 'local-human')",
    ).run();
    db.prepare("INSERT INTO tob_identity (human_id, bot_slug) VALUES ('local-human', 'tob')").run();
  });
  old.close();
  const upgraded = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  try {
    expect(
      attachOperationalModule(upgraded, 'grant-fixture').read((db) =>
        db
          .prepare('SELECT bot_slug, capability FROM bot_management_grants ORDER BY capability')
          .all(),
      ),
    ).toEqual([
      { bot_slug: 'tob', capability: 'manage-app' },
      { bot_slug: 'tob', capability: 'manage-bots' },
    ]);
  } finally {
    upgraded.close();
  }
});

it('imports a Bot without any management grant', async () => {
  const { core } = fixture();
  const home = await core.tob.ensure();
  const bridge = createBridgeMethodsForHumans(core)(owner);
  const bytes = writeZip([
    { path: 'SOUL.md', data: Buffer.from('I manage another Environment.') },
    {
      path: '.botharness/bot.json',
      data: Buffer.from(JSON.stringify({ name: 'Imported', managementGrants: both })),
    },
  ]);
  const input = {
    uploadKey: 'grant-import-upload',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.length,
  };
  expect(bridge.zipUploadBegin(input).ok).toBe(true);
  expect(
    bridge.zipUploadChunk({ ...input, offset: 0, dataBase64: bytes.toString('base64') }).ok,
  ).toBe(true);
  expect(
    await bridge.zipImport({ ...input, operationKey: 'grant-import-op', displayName: 'Imported' }),
  ).toMatchObject({ ok: true });
  expect(core.tob.managementGrantHolders().map((holder) => holder.botSlug)).toEqual([home.botSlug]);
});

it('tells the Bot about a toggle once, in its next Human DM turn, and expires a captured broker', async () => {
  const handled: OrchestratorAgentRun[] = [];
  let core: ReturnType<typeof createCore>;
  let revokeObserved = false;
  core = createCore({
    dshHome: createTempRoot('management-grant-sessions-'),
    agents: {
      async runOrchestrator(run) {
        handled.push(run);
        if (run.message.includes('Revoke now')) {
          const authority = core.runtime.captureTobCliAuthority!(run.sessionId);
          core.tob.setManagementGrant(owner, run.bot.slug, 'manage-app', false);
          core.tob.setManagementGrant(owner, run.bot.slug, 'manage-bots', false);
          expect(authority).toThrow('tob-authority-required');
          revokeObserved = true;
        }
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('unexpected Assignment');
      },
      async close() {},
    },
  });
  try {
    const home = await core.tob.ensure();
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const adaDm = core.channels.getOrCreateDm(owner, 'ada', 'Ada')!;
    const group = core.channels.createGroup(owner, { name: 'Ada Group', members: ['ada'] });
    const bridge = createBridgeMethodsForHumans(core)(owner);
    const send = async (channelId: string, body: string, mentions?: object[]) => {
      expect(
        (
          await bridge.channelSend({
            channelId,
            messageId: 'human-' + randomUUID(),
            body,
            mentions,
          })
        ).ok,
      ).toBe(true);
      await core.runtime.whenIdle();
    };
    await send(home.channelId, 'Revoke now');
    expect(revokeObserved).toBe(true);
    await send(adaDm.id, 'First DM');
    const before = handled.at(-1)!;
    expect(before.holdsManagementGrant?.()).toBe(false);
    core.tob.setManagementGrant(owner, 'ada', 'manage-app', true);
    await send(adaDm.id, 'Second DM');
    expect(handled.at(-1)).toMatchObject({ sessionId: before.sessionId, resume: true });
    expect(handled.at(-1)?.holdsManagementGrant?.()).toBe(true);
    expect(handled.at(-1)?.message).toContain('turned on "Manage the App" for you');
    await send(adaDm.id, 'Third DM');
    expect(handled.at(-1)?.message).not.toContain('[Host timeline]');
    await send(group.id, '@Ada Check the Group', [
      { start: 0, end: 4, botSlug: 'ada', label: 'Ada' },
    ]);
    expect(handled.at(-1)?.inboundChannelId).toBe(group.id);
    expect(handled.at(-1)?.message).not.toContain('[Host timeline]');
    expect(core.channels.get(group.id)?.members).toEqual(['ada']);
  } finally {
    core.schedules.close();
    core.externalMessaging.close();
    await core.runtime.close();
    await core.tob.close();
    core.operationalDatabase.close();
  }
});

it('refuses CLI commands when the turn has no Human DM authority', () => {
  const authority = managerShellAuthority(() => {
    throw new TobError('human-dm-required');
  });
  expect(() => authority()).toThrow('human-dm-required');
  expect(() => authority.beginWrite()).toThrow('human-dm-required');
  expect(() => authority.sources).toThrow('human-dm-required');
  const missing = managerShellAuthority(() => undefined);
  expect(() => missing()).toThrow('tob-authority-required');
});

it('adds the one manager line only for a grant holder and keeps the Group tools text for everyone', () => {
  const text = () => '';
  const manager = orchestratorPromptSections(text, true).role;
  const ordinary = orchestratorPromptSections(text, false).role;
  expect(manager).toContain('run deepseekbot capabilities and doctor first');
  expect(ordinary).not.toContain('deepseekbot capabilities');
  for (const role of [manager, ordinary]) {
    expect(role).toContain('group_create');
    expect(role).not.toContain('bot_create');
    expect(role).not.toContain('delegate once');
  }
});

it('always asks the Human for deletion, other Bots’ Memory, backup restore, credentials and pairing', () => {
  for (const command of [
    'bot-delete-confirm',
    'pause',
    'memory-save',
    'memory-restore-commit',
    'profile-backup-restore',
    'secret-put',
    'connector-key-set',
    'connector-grant',
    'connector-remove',
    'device-pair',
    'pairing-review',
  ])
    expect(alwaysAsksHuman(command)).toBe(true);
  for (const command of [
    'model-default',
    'settings-set',
    'create',
    'group-create',
    'doctor',
    'connectors',
  ])
    expect(alwaysAsksHuman(command)).toBe(false);
});
