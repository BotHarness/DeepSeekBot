import { attachOperationalModule } from '../src/database/owner.js';
import { SessionLiveStreams } from '../src/runtime/session-live.js';
import { sessionModelChoices } from '../src/runtime/session-model-choices.js';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import { RemoteAccessService } from '@deepseek-ai/dsh-api-remote-access';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { createBridgeMethods, createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { registerBridge } from '../src/bridge/rpc.js';
import { createEngineGateway } from '../src/engines/engine-gateway.js';
import { EngineHost } from '../src/engines/engine-host.js';
import { engineRouteFetch } from '../src/engines/engine-route.js';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createModelPresetStore } from '../src/models/presets.js';
import { routingGroupEngineOptions } from '../src/models/routing-group-engine-options.js';
import { requireBotEngineAccount } from '../src/team/models.js';
import { DUMMY_PASSWORD_HASH } from '../src/team/password.js';
import { memberPolicy } from '../src/team/policy.js';
import { requestListener } from './async-listener.js';
import { permitted, teamModelFixture } from './team-model-fixture.js';

const hosts: EngineHost[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.close();
});

const refusal = (id: string) => ({
  ok: false,
  error: { code: 'model-not-allowed', details: { route: id } },
});

function fixture(local = true) {
  const f = teamModelFixture();
  f.catalog.list.mockResolvedValue([
    { ...permitted, providerName: 'Provider', modelName: 'Allowed', efforts: [] },
  ]);
  const detectCodex = vi.fn(async () => ({ installed: true, login: 'chatgpt' as const }));
  const host = new EngineHost({
    root: join(f.root, 'engines'),
    local,
    gateway: createEngineGateway(),
    sessions: () => undefined,
    persistence: () => undefined,
    detectCodex,
    detectClaude: async () => ({ installed: false, login: 'unknown' }),
    requireAccountGrant: (slug, id) => requireBotEngineAccount(f.team, f.registry.get(slug), id),
  });
  hosts.push(host);
  const work = host.store.addAccount('codex', 'Work', 0);
  const personal = host.store.addAccount('codex', 'Personal', 1);
  const models = vi
    .spyOn(host, 'models')
    .mockResolvedValue([{ id: 'gpt-test', name: 'Fake GPT', efforts: [], isDefault: true }]);
  vi.spyOn(host, 'validateChoice').mockResolvedValue();
  const role = f.team.roles.create(owner, 'Operators', [
    'models.use',
    'models.configure',
    'roles.manage',
    'members.manage',
  ]).role;
  f.team.roles.set(owner, f.member.humanId, [role.roleId]);
  const grant = (...engineAccounts: string[]) =>
    f.team.roles.update(owner, role.roleId, { models: { kind: 'all', engineAccounts } });
  grant();
  const modelPresets = createModelPresetStore({ database: f.db, rootDir: f.root });
  attachOperationalModule(f.db, 'session-ownership').transaction((db) => {
    db.prepare(
      "INSERT INTO session_ownership (session_id, bot_slug, root_role, created_at) VALUES ('session', 'ada', 'orchestrator', '2026-11-14T12:00:00Z')",
    ).run();
  });
  const deps = {
    sessionModels: sessionModelChoices(attachOperationalModule(f.db, 'bot-runtime')),
    ...f.deps,
    readUsageSessionLog: async () => undefined,
    sessionLive: new SessionLiveStreams(),
    modelPresets,
    subscriptionEngines: host,
    engineSelection: host,
    engineAccounts: host,
    localSubscriptionEngines: local,
    routingGroupEngineOptions: (allowed: (id: string) => boolean) =>
      routingGroupEngineOptions(host, local ? allowed : undefined),
  };
  return {
    ...f,
    deps,
    host,
    work,
    personal,
    role,
    grant,
    modelPresets,
    models,
    detectCodex,
    methods: createBridgeMethods(f.member, deps),
    ownerMethods: createBridgeMethods(owner, deps),
  };
}

async function memberCli(f: ReturnType<typeof fixture>) {
  const username = 'session-member';
  f.database.transaction((db) =>
    db
      .prepare('INSERT INTO member_credentials VALUES (?, ?, ?, ?, 0)')
      .run(f.member.humanId, username, JSON.stringify(DUMMY_PASSWORD_HASH), '[]'),
  );
  const ctx = new Context();
  ctx.provide('typert');
  ctx.set('typert', {
    local: { get: () => undefined, hasSeen: () => false },
    lookups: { definitions: () => [], get: () => undefined },
    resources: { entries: () => [{ kind: 'session', field: 'sessionId' }] },
  });
  const access = new RemoteAccessService(ctx);
  access.registerPolicy('botharness-member', memberPolicy(f.team));
  const gateway = new TypertGatewayService(ctx, {});
  registerBridge(ctx, createBridgeMethodsForHumans(f.deps), undefined, undefined, f.team);
  const unbind = f.team.bindRuntime({
    createPeer: (principal) => new Peer(ctx, { principal }),
    invalidate: () => access.invalidate(),
    urls: () => [],
  });
  const server = createServer(
    requestListener(async (request, response) => {
      if (request.method === 'GET') {
        response.writeHead(302, { 'set-cookie': 'authority=owner', location: '/' }).end();
        return;
      }
      expect(request.url).toBe('/api/botharness/team-as');
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const input = z
        .object({
          username: z.literal(username),
          namespace: z.literal('botharness'),
          method: z.string(),
          args: z.record(z.string(), z.unknown()),
        })
        .parse(JSON.parse(Buffer.concat(chunks).toString()));
      try {
        const value = await f.team.asMember(input.username, (peer) => {
          f.team.assertCall(peer.principal, input.method);
          return gateway.invoke({ ...input, peer });
        });
        response.end(JSON.stringify({ ok: true, value }));
      } catch (error) {
        response.end(JSON.stringify({ ok: false, error: gateway.wireStream.failure(error) }));
      }
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  return {
    async run(...args: string[]) {
      const stdout: string[] = [];
      const exit = await runBotCreateCli([...args, '--as', username], {
        env: {
          DEEPSEEKBOT_HOST: `http://127.0.0.1:${address.port}`,
          DEEPSEEKBOT_HOST_TOKEN: 'test-owner-token',
        },
        stdout: (value) => stdout.push(value),
        stderr: () => {},
      });
      expect(stdout).toHaveLength(1);
      const output: unknown = JSON.parse(stdout.join(''));
      return { exit, output };
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await unbind();
      await ctx.fiber.dispose();
    },
  };
}

describe('Team subscription grants', () => {
  it('reads and sets an owned Session through the member CLI with account grants enforced', async () => {
    const f = fixture();
    const cli = await memberCli(f);
    const session = ['ada', '--session', 'session'];
    const model = { kind: 'model', ...permitted };
    const engine = { kind: 'engine', engine: 'codex', accountId: f.work.id, model: 'gpt-test' };
    try {
      expect(await cli.run('bot-sessions', 'ada')).toMatchObject({ exit: 0 });
      expect(await cli.run('session-transcript', ...session)).toMatchObject({
        exit: 0,
        output: { sessionId: 'session', role: 'orchestrator', items: [] },
      });
      expect(await cli.run('session-model', ...session)).toMatchObject({
        exit: 0,
        output: { override: null, default: model },
      });
      expect(
        await cli.run('session-model', ...session, '--set', JSON.stringify(model)),
      ).toMatchObject({
        exit: 0,
        output: { override: model },
      });
      expect(
        await cli.run('session-model', ...session, '--set', JSON.stringify(engine)),
      ).toMatchObject({
        exit: 1,
        output: { error: { code: 'model-not-allowed', details: { route: f.work.id } } },
      });
      expect(await cli.run('session-model', ...session)).toMatchObject({
        exit: 0,
        output: { override: model },
      });
      expect(await cli.run('session-transcript', 'bob', '--session', 'session')).toMatchObject({
        exit: 1,
        output: { error: { code: 'bot-not-found' } },
      });
      expect(await cli.run('session-subagents', ...session)).toMatchObject({
        exit: 0,
        output: { sessionId: 'session', lanes: [] },
      });
      expect(await cli.run('session-progress', ...session)).toMatchObject({
        exit: 0,
        output: { sessions: [{ sessionId: 'session' }] },
      });
      expect(await cli.run('session-live', ...session)).toMatchObject({
        exit: 0,
        output: { sessionId: 'session', revision: 0 },
      });
      expect(await cli.run('session-tool', ...session, '--call', 'missing')).toMatchObject({
        exit: 1,
        output: { error: { code: 'not-found' } },
      });
      for (const args of [
        ['session-transcript', 'ada', '--session', 'unowned'],
        ['session-model', 'ada', '--session', 'unowned', '--set', JSON.stringify(model)],
      ]) {
        expect(await cli.run(...args)).toMatchObject({
          exit: 1,
          output: { error: { code: 'not-found' } },
        });
      }
      f.team.bots.setVisibility(owner, 'ada', { kind: 'public', audience: { kind: 'everyone' } });
      expect(f.team.bots.dm(owner, 'ada')?.dmHumanId).toBe(owner.humanId);
      for (const command of [
        'session-transcript',
        'session-model',
        'session-live',
        'session-progress',
      ])
        expect(await cli.run(command, ...session)).toMatchObject({
          exit: 1,
          output: { error: { code: 'bot-session-private' } },
        });
    } finally {
      await cli.close();
    }
  });

  it('checks the acting Team member’s account grant before saving a Session Model Choice', async () => {
    const f = fixture();
    const choice = { kind: 'engine', engine: 'codex', accountId: f.work.id, model: 'gpt-test' };
    const payload = { slug: 'ada', sessionId: 'session' };
    expect(await f.methods.sessionModel({ ...payload, choice })).toMatchObject(refusal(f.work.id));
    f.grant(f.work.id);
    expect(await f.methods.sessionModel({ ...payload, choice })).toMatchObject({
      ok: true,
      value: { override: choice },
    });
    f.grant();
    expect(await f.methods.sessionModel({ ...payload, choice })).toMatchObject(refusal(f.work.id));
  });

  it('lets members read their granted quota without the email and reserves refresh for managers', async () => {
    const f = fixture();
    f.grant(f.work.id);
    const email = 'work@example.test';
    const quota = {
      source: 'live' as const,
      observedAt: '2026-11-20T08:00:00.000Z',
      windows: { weekly: { remainingPercent: 55 } },
    };
    f.host.store.rememberQuota('codex', { ...quota, email }, f.work.id);
    const refresh = vi.spyOn(f.host, 'refreshQuota').mockResolvedValue({ status: 'ok', quota });
    await expect(f.methods.engineAccounts({})).resolves.toMatchObject({
      ok: false,
      error: { code: 'permission-required' },
    });
    const member = await f.methods.engineAccounts({ grantable: true });
    expect(member).toMatchObject({
      ok: true,
      value: { accounts: [{ id: f.work.id, quota }] },
    });
    expect(JSON.stringify(member)).not.toContain('email');
    expect(JSON.stringify(member)).not.toContain(f.personal.id);
    await expect(f.methods.engineAccountQuotaRefresh({ id: f.work.id })).resolves.toMatchObject({
      ok: false,
      error: { code: 'permission-required' },
    });
    expect(refresh).not.toHaveBeenCalled();

    const manager = f.team.roles.create(owner, 'Model source manager', [
      'modelSources.manage',
    ]).role;
    f.team.roles.set(owner, f.member.humanId, [f.role.roleId, manager.roleId]);
    await expect(f.methods.engineAccounts({ grantable: true })).resolves.toMatchObject({
      ok: true,
      value: { accounts: [{ id: f.work.id, email, quota }] },
    });
    await expect(f.ownerMethods.engineAccounts({})).resolves.toMatchObject({
      ok: true,
      value: {
        accounts: expect.arrayContaining([expect.objectContaining({ id: f.work.id, email })]),
      },
    });
    await expect(f.methods.engineAccountQuotaRefresh({ id: f.work.id })).resolves.toEqual({
      ok: true,
      value: { status: 'ok', quota },
    });
    expect(refresh).toHaveBeenCalledExactlyOnceWith(f.work.id);
  });

  it('unions explicit accounts across API policies and applies the delegation ceiling', () => {
    const f = fixture();
    f.grant(f.work.id, f.work.id);
    const extra = f.team.roles.create(owner, 'Extra account', [], {
      kind: 'only',
      routes: [],
      engineAccounts: [f.personal.id],
    }).role;
    f.team.roles.set(owner, f.member.humanId, [f.role.roleId, extra.roleId]);
    expect(f.team.roles.modelsAllowed(f.member)).toEqual({
      all: true,
      engineAccounts: [f.personal.id, f.work.id].sort(),
    });
    const delegated = f.team.roles.create(f.member, 'Delegated', [], {
      kind: 'all',
      engineAccounts: [f.work.id],
    }).role;
    expect(f.team.roles.validateAssignments(f.member, [delegated.roleId])).toEqual([
      delegated.roleId,
    ]);
    f.grant();
    for (const operation of [
      () => f.team.roles.create(f.member, 'Over ceiling', [], delegated.models),
      () => f.team.roles.update(f.member, delegated.roleId, { models: delegated.models }),
      () => f.team.roles.validateAssignments(f.member, [delegated.roleId]),
    ])
      expect(operation).toThrow(expect.objectContaining(refusal(f.work.id).error));
  });

  it('scopes the picker to permitted accounts, models and selections for the member’s own Bot', async () => {
    const f = fixture();
    const use = {
      action: 'use',
      bot: 'ada',
      role: 'orchestrator',
      engine: 'codex',
      accountId: f.work.id,
      model: 'gpt-test',
    };
    expect(await f.methods.engineSelection({ action: 'status' })).toEqual({
      ok: true,
      value: { engines: [], selections: [] },
    });
    expect(f.detectCodex).not.toHaveBeenCalled();
    expect(await f.methods.engineSelection({ action: 'status', engine: f.work.id })).toMatchObject(
      refusal(f.work.id),
    );
    expect(await f.methods.engineSelection({ action: 'models', engine: f.work.id })).toMatchObject(
      refusal(f.work.id),
    );
    expect(await f.methods.engineSelection(use)).toMatchObject(refusal(f.work.id));
    expect(f.models).not.toHaveBeenCalled();
    f.grant(f.work.id);
    expect(await f.methods.engineAccounts({ grantable: true })).toMatchObject({
      ok: true,
      value: { accounts: [{ id: f.work.id, name: 'Work' }] },
    });
    expect(f.detectCodex).not.toHaveBeenCalled();
    expect(await f.methods.engineSelection({ action: 'models', engine: f.work.id })).toMatchObject({
      ok: true,
      value: { engine: 'codex', models: [{ id: 'gpt-test' }] },
    });
    expect(await f.methods.engineSelection({ action: 'models', engine: 'codex' })).toMatchObject(
      refusal('codex-default'),
    );
    expect(await f.methods.engineSelection({ ...use, bot: 'bob' })).toMatchObject({
      ok: false,
      error: { code: 'bot-not-found' },
    });
    expect(await f.methods.engineSelection(use)).toMatchObject({
      ok: true,
      value: {
        bot: 'ada',
        role: 'orchestrator',
        engine: 'codex',
        accountId: f.work.id,
        model: 'gpt-test',
      },
    });
    f.host.use('bob', 'orchestrator', 'codex', { accountId: f.work.id });
    expect(await f.methods.engineSelection({ action: 'status' })).toMatchObject({
      ok: true,
      value: {
        engines: [{ accountId: f.work.id }],
        selections: [{ botSlug: 'ada', accountId: f.work.id }],
      },
    });
    expect(f.detectCodex).toHaveBeenCalledOnce();
    f.grant();
    expect(await f.methods.engineSelection({ action: 'status' })).toMatchObject({
      ok: true,
      value: { engines: [], selections: [] },
    });
    expect(await f.ownerMethods.engineSelection(use)).toMatchObject(refusal(f.work.id));
    expect(
      await f.methods.engineSelection({
        ...use,
        engine: null,
        accountId: undefined,
        model: undefined,
      }),
    ).toMatchObject({ ok: true });
  });

  it('serves the same selection through Owner RPC and the HTTP route', async () => {
    const f = fixture();
    const url = 'http://host/api/botharness/engines';
    const deps = {
      host: f.host,
      botExists: (slug: string) => f.registry.get(slug) !== undefined,
      engineSelection: f.ownerMethods.engineSelection,
    };
    const post = (body: object) =>
      engineRouteFetch(new Request(url, { method: 'POST', body: JSON.stringify(body) }), deps);
    const use = {
      action: 'use',
      bot: 'ada',
      role: 'orchestrator',
      engine: 'codex',
      accountId: f.work.id,
      model: 'gpt-test',
    };
    const denied = await post(use);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({
      error: { code: 'model-not-allowed', message: 'model-not-allowed' },
    });
    expect(f.host.store.selections()).toEqual([]);
    const unknown = await post({ ...use, bot: 'missing' });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({
      error: { code: 'unknown-bot', message: 'Unknown PersonaBot' },
    });

    f.grant(f.work.id);
    const used = await post(use);
    expect(used.status).toBe(200);
    expect(await f.ownerMethods.engineSelection(use)).toEqual({
      ok: true,
      value: await used.json(),
    });
    for (const action of ['status', 'models']) {
      const payload = { action, engine: f.work.id };
      const response = await post(payload);
      expect(response.status).toBe(200);
      const body = await response.json();
      if (action === 'status') {
        expect(body.approvals).toEqual([]);
        expect(body.selections).toMatchObject([{ botSlug: 'ada', accountId: f.work.id }]);
        delete body.approvals;
      }
      expect(await f.ownerMethods.engineSelection(payload)).toEqual({ ok: true, value: body });
    }
  });

  it('checks each nested Routing Group and every Model Plan and Preset account before writes', async () => {
    const f = fixture();
    const engine = { kind: 'engine' as const, engine: 'codex' as const, accountId: f.work.id };
    const members = [{ kind: 'model' as const, ...permitted }, engine];
    const nestedMember = (id: string) => ({ kind: 'group' as const, id });
    const args = { name: 'Group', members };
    const preset = {
      name: 'Preset',
      orchestrator: permitted,
      assignmentDefault: permitted,
      orchestratorEngine: { engine: 'codex', accountId: f.work.id, model: 'gpt-test' },
      assignmentEngine: { engine: 'codex', accountId: f.work.id, model: 'gpt-test' },
    };
    const group = f.deps.routingGroups.create(args);
    const nested = f.deps.routingGroups.create({
      name: 'Nested',
      members: [nestedMember(group.id)],
    });
    const savedPreset = await f.ownerMethods.modelPresetCreate(preset);
    if (!savedPreset.ok) throw new Error(savedPreset.error.code);
    const presetId = savedPreset.value.preset.id;
    const groupSub = { kind: 'group', group: nested.id };
    const subUpdate = {
      id: presetId,
      expectedRevision: 1,
      sub: { choices: [groupSub], default: groupSub },
    };
    const groupPlan = {
      slug: 'ada',
      expectedRevision: 1,
      orchestratorGroupId: nested.id,
      assignmentDefault: permitted,
      assignmentModels: [{ ...permitted, allowedEfforts: [''], defaultEffort: '' }],
      assignmentGroups: [nested.id],
      assignmentDefaultGroupId: nested.id,
    };
    expect(await f.methods.modelCatalog({ includeRoutingGroupEngines: true })).toMatchObject({
      ok: true,
      value: { groups: [], routingGroupEngines: [] },
    });
    for (const result of [
      f.methods.modelGroupCreate({ name: 'Other', members: [nestedMember(group.id)] }),
      f.methods.modelGroupUpdate({ ...args, id: group.id, expectedRevision: 1 }),
      f.methods.modelPlanSet(groupPlan),
      f.methods.modelPresetCreate(preset),
      f.methods.modelPresetUpdate({ ...preset, id: presetId, expectedRevision: 1 }),
      f.methods.modelPresetSubSet(subUpdate),
      f.methods.modelPresetApply({ slug: 'ada', presetId }),
    ])
      expect(await result).toMatchObject(refusal(f.work.id));
    expect(f.methods.modelPresets({})).toMatchObject({ ok: true, value: { presets: [] } });
    f.grant(f.work.id);
    expect(f.methods.modelPresetSub({ id: presetId })).toMatchObject({ ok: true });
    expect(await f.methods.modelCatalog({ includeRoutingGroupEngines: true })).toMatchObject({
      ok: true,
      value: {
        groups: [{ id: group.id }, { id: nested.id }],
        routingGroupEngines: [{ accountId: f.work.id, available: true }],
      },
    });
    expect(
      await f.methods.modelGroupCreate({ name: 'Other', members: [nestedMember(group.id)] }),
    ).toMatchObject({ ok: true });
    expect(
      await f.methods.modelGroupUpdate({ ...args, id: group.id, expectedRevision: 1 }),
    ).toMatchObject({ ok: true });
    expect(await f.methods.modelPresetCreate({ ...preset, name: 'Member preset' })).toMatchObject({
      ok: true,
    });
    expect(
      await f.methods.modelPresetUpdate({ ...preset, id: presetId, expectedRevision: 1 }),
    ).toMatchObject({ ok: true });
    expect(await f.methods.modelPresetApply({ slug: 'ada', presetId })).toMatchObject({ ok: true });
    expect(
      f.host.store
        .selections()
        .map(({ role, accountId }) => [role, accountId])
        .sort(),
    ).toEqual([
      ['assignment', f.work.id],
      ['orchestrator', f.work.id],
    ]);
    expect(await f.methods.modelPlanSet(groupPlan)).toMatchObject({ ok: true });
    f.grant();
    expect(
      await f.methods.modelPlanAssignmentsSet({ ...groupPlan, expectedRevision: 2 }),
    ).toMatchObject(refusal(f.work.id));
    expect(
      await f.methods.modelPlanCustomize({
        slug: 'ada',
        expectedRevision: 2,
        orchestratorGroupId: nested.id,
      }),
    ).toMatchObject(refusal(f.work.id));
  });

  it('keeps subscription accounts local even after the role is granted', async () => {
    const f = fixture(false);
    f.grant(f.work.id);
    expect(await f.methods.engineAccounts({ grantable: true })).toMatchObject({
      ok: true,
      value: { accounts: [] },
    });
    expect(
      await f.methods.engineSelection({
        action: 'use',
        bot: 'ada',
        role: 'assignment',
        engine: 'codex',
        accountId: f.work.id,
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: 'engine-unavailable',
        message: 'Subscription Engines run only on a local Host',
      },
    });
    expect(f.detectCodex).not.toHaveBeenCalled();
  });
});
