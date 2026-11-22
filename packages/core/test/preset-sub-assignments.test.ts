import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import { expect, it } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
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
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { botModelFilter } from '../src/team/models.js';
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
  let orchestrator: OrchestratorAgentRun | undefined;
  const core = createCore({
    dshHome: createTempRoot('bh-preset-sub-assignments-'),
    routeRests: rests,
    agents: {
      async runOrchestrator(run) {
        orchestrator = run;
      },
      async runAssignment() {},
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
    const grantRoutes = (routes: string[]) =>
      core.team.roles.update(OWNER_HUMAN_CONTEXT, role.roleId, {
        models: { kind: 'only', routes },
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
      groups: undefined,
      modelFilter: () => botModelFilter(core.team, core.registry.get('ada')),
    });
    const create = createAssignmentTool({
      run,
      currentRun: () => ({ run }),
      resolveModelPlan,
      loadAssignmentModes: () => undefined,
      openAssignmentRoutes: undefined,
      assignmentGroups: undefined,
      modeChoices: undefined,
    });
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
  } finally {
    await core.runtime.close();
    core.schedules.close();
    core.externalMessaging.close();
    await core.roster.detach();
    core.operationalDatabase.close();
  }
});
