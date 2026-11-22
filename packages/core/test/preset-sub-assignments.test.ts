import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import { createEngineGateway } from '../src/engines/engine-gateway.js';
import { EngineHost } from '../src/engines/engine-host.js';
import { createAssignmentTool } from '../src/features/assignments/tools.js';
import { createListAssignmentModelsTool } from '../src/features/models/tools.js';
import { humanContext, OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import {
  resolveBotModelPlan,
  type PresetSub,
  type PresetSubChoice,
} from '../src/models/presets.js';
import { createRouteRests } from '../src/models/route-rest.js';
import { createCore } from '../src/plugin.js';
import type { AssignmentAgentRun, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { TeamError } from '../src/team/error.js';
import { botModelFilter, requireBotEngineAccount } from '../src/team/models.js';
import { createTempRoot } from './helpers.js';

it('discovers and enforces the preset choices through the Orchestrator tools and Host runtime', async () => {
  const fast = { provider: 'go', model: 'fast' };
  const careful = { provider: 'go', model: 'careful' };
  const choice = (route: typeof fast, effort: string): PresetSubChoice => ({
    kind: 'model',
    ...route,
    allowedEfforts: [effort],
    defaultEffort: effort,
  });
  const sub: PresetSub = {
    choices: [choice(fast, 'low'), choice(careful, 'high')],
    default: { kind: 'model', ...fast },
  };
  const member = humanContext('sub-test-member');
  const rests = createRouteRests();
  const root = createTempRoot('bh-preset-sub-assignments-');
  const gateway = createEngineGateway();
  const engineHost = new EngineHost({
    root: join(root, 'engines'),
    local: true,
    gateway,
    sessions: () => undefined,
    persistence: () => undefined,
    requireAccountGrant: (slug, id): void =>
      requireBotEngineAccount(core.team, core.registry.get(slug), id),
  });
  const account = engineHost.addAccount('codex', 'Work', 0);
  const runs: AssignmentAgentRun[] = [];
  let orchestrator: OrchestratorAgentRun | undefined;
  let holdEngineRun: Promise<void> | undefined;
  const core = createCore({
    dshHome: root,
    routeRests: rests,
    requireAssignmentEngine: (slug, target) => engineHost.assertAssignmentAccount(slug, target),
    agents: {
      async runOrchestrator(run) {
        orchestrator = run;
      },
      async runAssignment(run) {
        runs.push(run);
        if (run.routingTarget?.kind === 'engine') await holdEngineRun;
      },
      requestAssignment() {
        throw new Error('Unexpected Assignment request');
      },
      async close() {},
    },
  });
  try {
    attachOperationalModule(core.operationalDatabase, 'team').transaction(
      (db) => {
        db.prepare("INSERT INTO humans VALUES (?, 'Member', 'active', '2026-11-21')").run(
          member.humanId,
        );
        db.prepare('UPDATE team_settings SET enabled = 1').run();
      },
      ['team'],
    );
    core.spaces.ensureAccount(member.humanId);
    const role = core.team.roles.create(OWNER_HUMAN_CONTEXT, 'Sub use', ['models.use']).role;
    core.team.roles.set(OWNER_HUMAN_CONTEXT, member.humanId, [role.roleId]);
    const grantRoutes = (routes: string[], engineAccounts: string[] = []) =>
      core.team.roles.update(OWNER_HUMAN_CONTEXT, role.roleId, {
        models: { kind: 'only', routes, engineAccounts },
      });
    grantRoutes(['go/fast', 'go/careful']);
    core.registry.create({ slug: 'ada', displayName: 'Ada', ownerHumanId: member.humanId });
    const initial = core.modelPresets.create({
      name: 'Daily',
      orchestrator: fast,
      assignmentDefault: fast,
    });
    const preset = core.modelPresets.setSub(initial.id, initial.revision, sub);
    core.registry.applyModelPreset('ada', preset);
    const dm = core.channels.getOrCreateDm(member, 'ada', 'Ada')!;
    await core.channels.appendMessage(member, dm.id, {
      id: 'start',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Start',
    });
    core.runtime.admitDmMessage(member, { channelId: dm.id, messageId: 'start', body: 'Start' });
    await core.runtime.whenIdle();
    const run = orchestrator!;
    const grant = core.grants.list('ada')[0]!;
    const resolveModelPlan = () => resolveBotModelPlan(core.registry.get('ada')!, () => undefined);
    const list = createListAssignmentModelsTool({
      run,
      isRunActive: () => true,
      resolveModelPlan,
      loadAssignmentModes: () => undefined,
      openAssignmentRoutes: undefined,
      groups: {
        describe: () => undefined,
        restingUntil: (route) => rests.restingUntil(route),
        describeEngine: (slug, engine, accountId) =>
          engineHost.describeAssignmentAccount(slug, engine, accountId),
      },
      modelFilter: () => botModelFilter(core.team, core.registry.get('ada')),
    });
    const createOptions = {
      run,
      currentRun: () => ({ run }),
      resolveModelPlan,
      loadAssignmentModes: () => undefined,
      openAssignmentRoutes: undefined,
      assignmentGroups: undefined,
      modeChoices: undefined,
    };
    const create = createAssignmentTool(createOptions);
    const execute = async (tool: typeof create, args: Record<string, unknown>) =>
      JSON.parse(String(await tool.execute(args, {} as ToolRunContext)));
    const dispatch = (title: string, args = {}) =>
      execute(create, {
        title,
        description: 'Check the Assignment route.',
        grant_id: grant.id,
        ...args,
      });
    expect(await execute(list, {})).toMatchObject({
      sub: {
        choices: sub.choices,
        default: { ...sub.default, defaultEffort: 'low' },
      },
    });
    expect(await dispatch('Default')).toMatchObject({
      outcome: 'created',
      modelRoute: { ...fast, reasoningEffort: 'low' },
    });
    expect(await dispatch('Alternate', careful)).toMatchObject({
      outcome: 'created',
      modelRoute: { ...careful, reasoningEffort: 'high' },
    });
    expect(await dispatch('Unlisted', { provider: 'go', model: 'third' })).toMatchObject({
      outcome: 'refused',
      code: 'assignment-choice-not-allowed',
    });
    expect(await dispatch('Wrong effort', { ...fast, reasoning_effort: 'high' })).toMatchObject({
      outcome: 'refused',
      code: 'assignment-choice-not-allowed',
    });
    grantRoutes(['go/fast']);
    expect(await execute(list, {})).toMatchObject({ sub: { choices: [sub.choices[0]] } });
    expect(await dispatch('No grant', careful)).toMatchObject({
      outcome: 'refused',
      code: 'model-not-allowed',
    });
    rests.rest(fast, Date.now() + 60_000, 'quota');
    expect(await dispatch('Quota')).toMatchObject({
      outcome: 'refused',
      code: 'assignment-choice-resting',
    });
    const selection = {
      kind: 'engine' as const,
      engine: 'codex' as const,
      accountId: account.id,
      model: 'gpt-test',
    };
    const enginePreset = core.modelPresets.setSub(preset.id, preset.revision, {
      choices: [
        { ...selection, effort: 'high', note: 'Use the Work subscription' },
        choice(careful, 'high'),
      ],
      default: selection,
    });
    core.registry.applyModelPreset('ada', enginePreset);
    const explicit = { engine: selection.engine, account_id: account.id, model: selection.model };
    grantRoutes(['go/fast', 'go/careful'], [account.id]);
    expect(await execute(list, {})).toMatchObject({
      sub: {
        default: { ...selection, defaultEffort: 'high' },
        choices: [{ ...selection, accountName: 'Work', effort: 'high' }, choice(careful, 'high')],
      },
    });
    expect(
      await dispatch('Unlisted account', { ...explicit, account_id: 'codex-default' }),
    ).toMatchObject({
      outcome: 'refused',
      code: 'assignment-choice-not-allowed',
    });
    expect(
      await dispatch('Wrong engine effort', { ...explicit, reasoning_effort: 'low' }),
    ).toMatchObject({
      outcome: 'refused',
      code: 'assignment-choice-not-allowed',
    });
    let finishEngineRun = () => {};
    holdEngineRun = new Promise<void>((resolve) => {
      finishEngineRun = resolve;
    });
    let implicitSessionId: string;
    try {
      const implicit = await dispatch('Engine default');
      expect(implicit).toMatchObject({ outcome: 'created' });
      implicitSessionId = implicit.sessionId;
      expect(() =>
        run.assignments.request({
          sessionId: implicitSessionId,
          mode: 'next-turn',
          text: 'Switch to the allowed API model',
          model: careful,
        }),
      ).toThrow('Wait for the current Assignment turn to finish before changing its model');
    } finally {
      holdEngineRun = undefined;
      finishEngineRun();
    }
    const named = await dispatch('Explicit engine', { ...explicit, reasoning_effort: 'high' });
    expect(named).toMatchObject({ outcome: 'created' });
    expect(await dispatch('Explicit API model', careful)).toMatchObject({
      outcome: 'created',
      modelRoute: { ...careful, reasoningEffort: 'high' },
    });
    await core.runtime.whenIdle();
    const target = { ...selection, reasoningEffort: 'high' };
    expect(runs.slice(-3).map((run) => run.routingTarget)).toEqual([
      target,
      target,
      { kind: 'route', route: { ...careful, reasoningEffort: 'high' } },
    ]);
    const readAssignments = () =>
      attachOperationalModule(core.operationalDatabase, 'assignments').read((db) =>
        db.prepare('SELECT session_id, model_route_json FROM assignments').all(),
      );
    expect(readAssignments()).toContainEqual({
      session_id: implicitSessionId,
      model_route_json: JSON.stringify(target),
    });
    const count = readAssignments().length;
    const reset = new Date(Date.now() + 60_000).toISOString();
    engineHost.store.rememberQuota(
      'codex',
      {
        limitedUntil: reset,
        windows: {},
        observedAt: new Date().toISOString(),
        source: 'live',
      },
      account.id,
    );
    expect(await execute(list, {})).toMatchObject({
      sub: { choices: [{ ...selection, restingUntil: reset }, choice(careful, 'high')] },
    });
    expect(await dispatch('Engine quota')).toMatchObject({
      outcome: 'refused',
      code: 'assignment-choice-resting',
      message: expect.stringContaining(reset),
    });
    grantRoutes(['go/fast', 'go/careful']);
    expect(await execute(list, {})).toMatchObject({
      sub: { choices: [choice(careful, 'high')], default: null },
    });
    for (const args of [{}, explicit]) {
      expect(await dispatch('Revoked account', args)).toMatchObject({
        outcome: 'refused',
        code: 'model-not-allowed',
      });
    }
    expect(readAssignments()).toHaveLength(count);

    const legacyEngine = core.modelPresets.create({
      name: 'Use the engine default model',
      orchestrator: careful,
      assignmentDefault: careful,
      engines: { assignmentEngine: { engine: 'codex', accountId: account.id, effort: 'high' } },
    });
    engineHost.store.clearQuota('codex', account.id);
    grantRoutes(['go/fast', 'go/careful'], [account.id]);
    core.registry.applyModelPreset('ada', legacyEngine);
    const legacyDefault = await dispatch('Default engine model');
    expect(legacyDefault).toMatchObject({ outcome: 'created' });
    const defaultTarget = {
      kind: 'engine',
      engine: 'codex',
      accountId: account.id,
      reasoningEffort: 'high',
    };
    await core.runtime.whenIdle();
    expect(runs.at(-1)?.routingTarget).toEqual(defaultTarget);
    expect(readAssignments()).toContainEqual({
      session_id: legacyDefault.sessionId,
      model_route_json: JSON.stringify(defaultTarget),
    });

    const { sub: _sub, ...legacyPlan } = resolveModelPlan()!;
    const deniedRoutingGroup = createAssignmentTool({
      ...createOptions,
      resolveModelPlan: () => ({
        ...legacyPlan,
        assignmentGroups: ['backup'],
        assignmentDefaultGroupId: 'backup',
      }),
      assignmentGroups: {
        async pick() {
          throw new TeamError('model-not-allowed');
        },
      },
    });
    expect(
      await execute(deniedRoutingGroup, {
        title: 'Revoked Routing Group',
        description: 'Refuse this legacy plan.',
        grant_id: grant.id,
      }),
    ).toEqual({
      outcome: 'refused',
      retryable: false,
      message: 'Routing Group backup has no usable model',
    });
  } finally {
    await core.runtime.close();
    core.schedules.close();
    core.externalMessaging.close();
    await core.roster.detach();
    await engineHost.close();
    await gateway.close();
    core.operationalDatabase.close();
  }
});
