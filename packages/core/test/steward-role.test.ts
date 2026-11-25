import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
import { createTempRoot } from './helpers.js';
import { stewardShellAuthority } from '../src/features/tob/cli-runtime.js';
import { createTobService, TobError } from '../src/tob/service.js';
import { fixture, bob } from './team-member-lifecycle-fixtures.js';

it('admits only the Human Owner to transfer and gives a Team member just the Steward id', async () => {
  const { core } = fixture();
  const home = await core.tob.ensure();
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const methods = createBridgeMethodsForHumans(core);
  const request = { slug: 'ada', confirm: true };
  const denial = { ok: false, error: { code: 'permission-required' } };
  expect(MEMBER_METHODS.has('steward')).toBe(true);
  expect(MEMBER_METHODS.has('stewardTransfer')).toBe(false);
  expect(await methods(bob).steward({})).toEqual({ ok: true, value: { botSlug: home.botSlug } });
  expect(await methods(bob).stewardTransfer(request)).toMatchObject(denial);
  expect(await methods({ ...owner, caller: 'bot' }).stewardTransfer(request)).toMatchObject(denial);
  expect(await methods(owner).stewardTransfer({ slug: 'ada' })).toMatchObject({
    ok: false,
    error: { code: 'invalid-input' },
  });
  expect(await methods(owner).steward({})).toEqual({ ok: true, value: { botSlug: home.botSlug } });
  expect(await methods(owner).stewardTransfer(request)).toEqual({
    ok: true,
    value: { botSlug: 'ada' },
  });
});

it('commits a marker to both Human DMs and keeps the former Tob deletable across restart', async () => {
  const { core, dshHome } = fixture();
  const home = await core.tob.ensure();
  core.registry.create({ slug: 'ada', displayName: 'Ada', persona: 'Ada keeps her Soul.' });
  const soulPath = join(core.registry.memoryDirFor('ada')!, 'SOUL.md');
  const before = readFileSync(soulPath, 'utf8');
  const bridge = createBridgeMethodsForHumans(core)(owner);
  for (let attempt = 0; attempt < 2; attempt++)
    expect(await bridge.stewardTransfer({ slug: 'ada', confirm: true })).toMatchObject({
      ok: true,
    });
  const marker = {
    author: { kind: 'system' },
    body: 'Ada is now the Steward.',
    stewardTransfer: { botSlug: 'ada', botName: 'Ada' },
  };
  for (const channelId of [home.channelId, dmChannelId('ada')])
    expect(core.channels.readMessages(channelId)).toEqual([expect.objectContaining(marker)]);
  expect(readFileSync(soulPath, 'utf8')).toBe(before);
  expect(bridge.pause({ slug: 'ada' })).toMatchObject({
    ok: false,
    error: { code: 'protected-bot' },
  });
  expect(() => core.deletions.preview('ada')).toThrow('protected-bot');
  expect(bridge.pause({ slug: home.botSlug })).toMatchObject({ ok: true });
  const preview = core.deletions.preview(home.botSlug);
  expect(await core.deletions.confirm(home.botSlug, preview.token, false)).toMatchObject({
    phase: 'complete',
  });
  expect(core.registry.get(home.botSlug)).toBeUndefined();
  await core.runtime.close();
  core.operationalDatabase.close();
  const reopened = fixture({ dshHome, seed: false }).core;
  expect(await reopened.tob.steward()).toEqual({ botSlug: 'ada' });
  expect(await reopened.tob.ensure()).toMatchObject({ botSlug: 'ada' });
  expect(reopened.registry.get(home.botSlug)).toBeUndefined();
});

it('gives the Steward role to the incoming Host Owner’s Tob on an Owner transfer', async () => {
  const { core } = fixture();
  const former = await core.tob.ensure(owner);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  expect(await core.tob.transferSteward(owner, 'ada')).toEqual({ botSlug: 'ada' });
  await core.team.setOwnerPassword(owner, 'owner-password-1');
  const member = await core.team.createMember(owner, 'next-owner', 'Next');
  const next = humanContext(member.member.humanId);
  await core.team.changePassword(next, member.initialPassword, 'next-password-1', false);
  await core.team.transferOwner(owner, next.humanId, 'owner-password-1');
  expect(core.tob.isSteward('ada')).toBe(false);
  expect(core.tob.isSteward(core.tob.slug(next) ?? '')).toBe(true);
  expect(() => core.deletions.preview('ada')).not.toThrow();
  const incoming = createBridgeMethodsForHumans(core)(next);
  const steward = await incoming.steward({});
  const target = await core.tob.ensure(next);
  expect(target.botSlug).not.toBe(former.botSlug);
  expect(steward).toEqual({ ok: true, value: { botSlug: target.botSlug } });
  expect(core.tob.isSteward(target.botSlug)).toBe(true);
  expect(() => core.deletions.preview(target.botSlug)).toThrow('protected-bot');
  const own = createBridgeMethodsForHumans(core)(next);
  expect(own.create({ displayName: 'Bea' })).toMatchObject({ ok: true });
  const bea = core.registry.list().find((bot) => bot.displayName === 'Bea')!;
  expect(await incoming.stewardTransfer({ slug: bea.slug, confirm: true })).toEqual({
    ok: true,
    value: { botSlug: bea.slug },
  });
  for (const channelId of [target.channelId, dmChannelId(bea.slug)])
    expect(core.channels.readMessages(channelId)).toEqual([
      expect.objectContaining({ stewardTransfer: { botSlug: bea.slug, botName: 'Bea' } }),
    ]);
});

it('serializes concurrent transfers in a single chain of DM markers', async () => {
  const { core } = fixture();
  const home = await core.tob.ensure();
  for (const slug of ['ada', 'bea']) core.registry.create({ slug, displayName: slug });
  expect(
    await Promise.all(['ada', 'bea'].map((slug) => core.tob.transferSteward(owner, slug))),
  ).toEqual([{ botSlug: 'ada' }, { botSlug: 'bea' }]);
  expect(await core.tob.steward()).toEqual({ botSlug: 'bea' });
  for (const [slug, targets] of [
    [home.botSlug, ['ada']],
    ['ada', ['bea', 'ada']],
    ['bea', ['bea']],
  ] as const)
    expect(
      core.channels
        .readMessages(dmChannelId(slug))
        .map((message) => message.stewardTransfer?.botSlug),
    ).toEqual(targets);
});

it('rolls back the role and both markers if either timeline write fails', async () => {
  const { core, db } = fixture();
  const home = await core.tob.ensure();
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  db.transaction((connection) =>
    connection.exec(`
      CREATE TEMP TRIGGER fail_second_steward_notice BEFORE INSERT ON source_events
      WHEN NEW.channel_id = 'dm-ada' AND NEW.source_kind = 'system-message'
      BEGIN SELECT RAISE(ABORT, 'fixture notice failure'); END;
    `),
  );
  await expect(core.tob.transferSteward(owner, 'ada')).rejects.toThrow('Operational transaction');
  expect(await core.tob.steward()).toEqual({ botSlug: home.botSlug });
  for (const channelId of [home.channelId, dmChannelId('ada')])
    expect(core.channels.readMessages(channelId)).toEqual([]);
});

it('migrates a Profile with an existing built-in Tob', () => {
  const home = createTempRoot('steward-migration-');
  const old = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: defineSchemaPlan(BOT_HARNESS_SCHEMA_PLAN.migrations.slice(0, -1)),
  });
  attachOperationalModule(old, 'steward-fixture').transaction((db) => {
    db.prepare(
      "INSERT INTO persona_bots (slug, body, owner_human_id) VALUES ('tob', '{}', 'local-human')",
    ).run();
    db.prepare("INSERT INTO tob_identity (human_id, bot_slug) VALUES ('local-human', 'tob')").run();
  });
  old.close();
  const upgraded = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  try {
    expect(
      attachOperationalModule(upgraded, 'steward-fixture').read((db) =>
        db.prepare('SELECT bot_slug, revision FROM steward_role').all(),
      ),
    ).toEqual([{ bot_slug: 'tob', revision: 1 }]);
  } finally {
    upgraded.close();
  }
});

it('imports a Bot without importing its Steward role', async () => {
  const { core } = fixture();
  const home = await core.tob.ensure();
  const bridge = createBridgeMethodsForHumans(core)(owner);
  const bytes = writeZip([
    { path: 'SOUL.md', data: Buffer.from('I am the Steward of another Environment.') },
    {
      path: '.botharness/bot.json',
      data: Buffer.from(JSON.stringify({ name: 'Imported', steward: true })),
    },
  ]);
  const input = {
    uploadKey: 'steward-import-upload',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.length,
  };
  expect(bridge.zipUploadBegin(input).ok).toBe(true);
  expect(
    bridge.zipUploadChunk({ ...input, offset: 0, dataBase64: bytes.toString('base64') }).ok,
  ).toBe(true);
  expect(
    await bridge.zipImport({
      ...input,
      operationKey: 'steward-import-operation',
      displayName: 'Imported',
    }),
  ).toMatchObject({ ok: true });
  expect(await core.tob.steward()).toEqual({ botSlug: home.botSlug });
});

it('expires a captured broker on transfer and preserves Sessions and ordinary Group turns', async () => {
  const handled: OrchestratorAgentRun[] = [];
  let core: ReturnType<typeof createCore>;
  let transferObserved = false;
  core = createCore({
    dshHome: createTempRoot('steward-sessions-'),
    agents: {
      async runOrchestrator(run) {
        handled.push(run);
        if (run.message.includes('Transfer twice')) {
          const authority = core.runtime.captureTobCliAuthority!(run.sessionId);
          await core.tob.transferSteward(owner, 'ada');
          await core.tob.transferSteward(owner, run.bot.slug);
          expect(authority).toThrow('tob-authority-required');
          transferObserved = true;
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
    await send(home.channelId, 'Transfer twice');
    expect(transferObserved).toBe(true);
    await send(adaDm.id, 'First DM');
    const before = handled.at(-1)!;
    expect(before.stewardActive?.()).toBe(false);
    await core.tob.transferSteward(owner, 'ada');
    await send(adaDm.id, 'Second DM');
    expect(handled.at(-1)).toMatchObject({ sessionId: before.sessionId, resume: true });
    expect(handled.at(-1)?.stewardActive?.()).toBe(true);
    expect(handled.at(-1)?.message).toContain('"Ada" is now the Steward.');
    await send(group.id, '@Ada Check the Group', [
      { start: 0, end: 4, botSlug: 'ada', label: 'Ada' },
    ]);
    expect(handled.at(-1)?.inboundChannelId).toBe(group.id);
    expect(handled.at(-1)?.stewardActive?.()).toBe(false);
    expect(core.channels.get(group.id)?.members).toEqual(['ada']);
  } finally {
    core.schedules.close();
    core.externalMessaging.close();
    await core.runtime.close();
    await core.tob.close();
    core.operationalDatabase.close();
  }
});

it('refuses Steward CLI commands when the turn has no Human DM authority', () => {
  const authority = stewardShellAuthority(() => {
    throw new TobError('human-dm-required');
  });
  expect(authority).toBeDefined();
  expect(() => authority()).toThrow('human-dm-required');
  expect(() => authority.beginWrite()).toThrow('human-dm-required');
  expect(() => authority.sources).toThrow('human-dm-required');
  const missing = stewardShellAuthority(() => undefined);
  expect(() => missing()).toThrow('tob-authority-required');
});

it('repairs the Steward workspace grant when an earlier preparation failed after the role committed', async () => {
  const workspace = {
    id: 'steward-workspace',
    path: '',
    title: 'Steward',
    status: async () => 'ok' as const,
  };
  const { core, db } = fixture({
    coreOptions: {
      workspaces: () => ({
        get: (id: string) => (id === workspace.id ? workspace : undefined),
        list: () => [workspace],
      }),
    },
  });
  let failures = 1;
  const tob = createTobService({
    database: db,
    registry: core.registry,
    channels: core.channels,
    workspaceRoot: createTempRoot('steward-workspaces-'),
    grants: core.grants,
    ensureWorkspace: async (path) => {
      workspace.path = path;
      if (failures-- > 0) throw new Error('workspace-offline');
      return { id: 'steward-workspace' };
    },
  });
  await expect(tob.ensure()).rejects.toThrow('workspace-offline');
  const { botSlug } = await tob.steward();
  expect(core.grants.list(botSlug).map((grant) => grant.workspaceId)).toEqual([
    'steward-workspace',
  ]);
});

it('describes a superseded transfer marker as history in the former holder’s next turn', async () => {
  const handled: OrchestratorAgentRun[] = [];
  const core = createCore({
    dshHome: createTempRoot('steward-superseded-'),
    agents: {
      async runOrchestrator(run) {
        handled.push(run);
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
    for (const slug of ['ada', 'bea']) core.registry.create({ slug, displayName: slug });
    await core.tob.transferSteward(owner, 'ada');
    await core.tob.transferSteward(owner, 'bea');
    const bridge = createBridgeMethodsForHumans(core)(owner);
    expect(
      (
        await bridge.channelSend({
          channelId: home.channelId,
          messageId: 'human-' + randomUUID(),
          body: 'Hi',
        })
      ).ok,
    ).toBe(true);
    await core.runtime.whenIdle();
    expect(handled.at(-1)?.message).toContain('"ada" was the Steward until a later transfer');
    expect(handled.at(-1)?.message).not.toContain('is now the Steward');
  } finally {
    core.schedules.close();
    core.externalMessaging.close();
    await core.runtime.close();
    await core.tob.close();
    core.operationalDatabase.close();
  }
});
