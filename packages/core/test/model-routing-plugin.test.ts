import { agentEvents } from '@deepseek-ai/dsh-agent';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { SubagentRuntime } from '@deepseek-ai/dsh-subagent';
import { afterEach, expect, it, vi } from 'vitest';

import { attachOperationalModule } from '../src/database/owner.js';
import {
  createCatalog,
  createFallback,
  mountEngines,
  mountRetry,
} from '../src/features/models/plugin.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { DEFAULT_MODEL_PRESET_ID } from '../src/models/presets.js';
import { createRouteRests } from '../src/models/route-rest.js';
import { apply, createCore } from '../src/plugin.js';
import { executeFixtureNativeTool } from './fixtures/native-tools.js';
import { API, NativeReplay, nativeRuntime } from './fixtures/routing-group-engine.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const at = '2026-11-22T00:00:00.000Z';

afterEach(() => vi.unstubAllEnvs());

async function routingHarness() {
  const { ctx } = await nativeRuntime(new NativeReplay(false));
  const dshHome = createTempRoot('bh-model-routing-plugin-');
  const core = createCore({ dshHome });
  trackTestOwner(core.operationalDatabase);
  const { routingDefaults, modelCatalog } = createCatalog(ctx, () => core);
  return { ctx, dshHome, core, routingDefaults, modelCatalog };
}

it('returns unavailable for an Assignment Routing Group after an engine grant is revoked', async () => {
  const { ctx, dshHome, core, modelCatalog, routingDefaults } = await routingHarness();
  const { engineHost } = mountEngines(
    ctx,
    { enabled: true },
    dshHome,
    () => core,
    () => undefined,
    routingDefaults,
  );
  const { groupFallback } = createFallback(
    () => core,
    true,
    engineHost,
    modelCatalog,
    routingDefaults,
  );
  const member = 'routing-member';
  attachOperationalModule(core.operationalDatabase, 'team').transaction(
    (db) => {
      db.prepare(
        "INSERT INTO humans (human_id, display_name, status, created_at) VALUES (?, 'Member', 'active', ?)",
      ).run(member, at);
      db.prepare("INSERT INTO human_roles VALUES (?, 'member')").run(member);
      db.prepare('UPDATE team_settings SET enabled = 1').run();
    },
    ['team'],
  );
  core.spaces.ensureAccount(member);
  expect(core.registry.create({ slug: 'ada', displayName: 'Ada', ownerHumanId: member }).ok).toBe(
    true,
  );
  const account = engineHost.addAccount('codex', 'Work', 0);
  const engine = { kind: 'engine', engine: 'codex', accountId: account.id } as const;
  const group = core.routingGroups.create({
    name: 'Work fallback',
    members: [engine, { kind: 'model', ...API }],
  });
  const grant = (engineAccounts: string[]) =>
    core.team.roles.update(OWNER_HUMAN_CONTEXT, 'member', {
      models: { kind: 'all', engineAccounts },
    });

  grant([account.id]);
  await expect(groupFallback.pickMixedAssignment('ada', group.id)).resolves.toMatchObject({
    kind: 'target',
    target: engine,
  });
  grant([]);
  await expect(groupFallback.pickMixedAssignment('ada', group.id)).resolves.toEqual({
    kind: 'unavailable',
  });
});

it('rests a rate-limited route for a Bot that inherits its Routing Group', async () => {
  const { ctx, dshHome, core, routingDefaults } = await routingHarness();
  const group = core.routingGroups.create({
    name: 'Default',
    members: [{ kind: 'model', ...API }],
  });
  core.modelPresets.migrateDefault({ main: API, groupId: group.id });
  expect(core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  expect(core.registry.get('ada')?.modelPlan).toBeUndefined();
  const id = SessionId('inherited-group-session');
  core.ownership.claim({ sessionId: id, botSlug: 'ada', rootRole: 'orchestrator', at });
  const routeRests = createRouteRests();
  mountRetry(ctx, core, routeRests, routingDefaults.effectivePlan);
  await ctx.agents.create({
    sessionId: id,
    meta: { cwd: dshHome },
    agentOptions: API,
  });
  const agent = ctx.agents.get(id);
  if (agent === undefined) throw new Error('Agent unavailable');
  agent.model.select(API);

  await agentEvents(ctx, agent).waterfall(
    'agent/request-error',
    {
      turn: 1,
      step: 1,
      provider: API.provider,
      failure: {
        code: 'RATE_LIMIT',
        message: 'Rate limited',
        status: 429,
        providerRetryAfterMs: 120_000,
      },
      retryPolicy: undefined,
      signal: new AbortController().signal,
    },
    async () => undefined,
  );

  expect(routeRests.restingUntil(API)).toMatchObject({ ...API, reason: 'rate-limit' });
});

it('lists the inherited Default Model Preset in a live Assignment’s Subagent tools', async () => {
  const { ctx } = await nativeRuntime(new NativeReplay(false));
  const dshHome = createTempRoot('bh-subagent-model-routing-');
  vi.stubEnv('DSH_HOME', dshHome);
  await ctx
    .plugin({
      name: 'test-subagents',
      apply(subagentCtx) {
        new SubagentRuntime(subagentCtx, SubagentRuntime.Config({}));
      },
    })
    .await();
  apply(ctx, { enabled: true, subscriptionEngines: false });
  const core = ctx.get('botharness');
  if (core === undefined) throw new Error('Core unavailable');
  const sub = { provider: API.provider, model: 'deepseek-v4-flash' };
  const preset = core.modelPresets.get(DEFAULT_MODEL_PRESET_ID);
  if (preset === undefined) throw new Error('Default Model Preset unavailable');
  const choice = { kind: 'model', ...sub } as const;
  core.modelPresets.setSub(preset.id, preset.revision, {
    choices: [{ ...choice, allowedEfforts: [''], defaultEffort: '' }],
    default: choice,
  });
  expect(core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  expect(core.registry.get('ada')?.modelPlan).toBeUndefined();
  const id = SessionId('inherited-subagent-models');
  core.ownership.claim({ sessionId: id, botSlug: 'ada', rootRole: 'assignment', at });
  await ctx.agents.create({
    sessionId: id,
    meta: { cwd: dshHome },
    agentOptions: API,
  });
  const agent = ctx.agents.get(id);
  if (agent === undefined) throw new Error('Agent unavailable');

  const name = 'list_bot_subagent_models';
  const tool = ctx.tools.definitions(agent).find((definition) => definition.name === name);
  if (tool === undefined) throw new Error('Subagent model tool unavailable');
  const result = await executeFixtureNativeTool(
    {
      name,
      callId: ToolCallId('list-inherited-subagent-models'),
      arguments: {},
      agent,
      signal: new AbortController().signal,
    },
    [tool],
    [],
  );

  if (result.isError) throw new Error(JSON.stringify(result.error));
  if (typeof result.value !== 'string') throw new Error('Expected the Subagent model list');
  expect(result.value).toContain(sub.model);
  expect(JSON.parse(result.value)).toMatchObject({ default: sub, parentSession: id });
});
