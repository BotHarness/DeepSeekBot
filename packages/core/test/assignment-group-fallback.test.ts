import { realpathSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { groupMemberRoute } from '../src/models/catalog.js';
import { createGroupFallback } from '../src/models/group-fallback.js';
import {
  isPersonaBotModelPlan,
  selectAssignmentGroup,
  selectAssignmentRoute,
  type ModelRoute,
  type PersonaBotModelPlan,
} from '../src/models/presets.js';
import { createRouteRests } from '../src/models/route-rest.js';
import { createCore } from '../src/plugin.js';
import type {
  AssignmentAgentRun,
  BotAgentAdapter,
  OrchestratorAgentRun,
} from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const SPENT = { provider: 'opencode-go', model: 'deepseek-v4.1-flash' };
const DEEPSEEK = { provider: 'deepseek-official', model: 'deepseek-v4-pro' };
const key = (route: ModelRoute | undefined) =>
  route === undefined ? 'none' : `${route.provider}/${route.model}`;

const options = [{ ...DEEPSEEK, allowedEfforts: [''], defaultEffort: '' }];

const basePlan: PersonaBotModelPlan = {
  revision: 1,
  sourcePresetId: '',
  sourcePresetName: '',
  orchestrator: DEEPSEEK,
  assignmentDefault: DEEPSEEK,
  appliedAt: '2026-11-17T00:00:00.000Z',
};

describe('Assignment Routing Groups in the plan (#4420)', () => {
  it('picks the default group, accepts a listed group and refuses others', () => {
    const plan = { ...basePlan, assignmentGroups: ['g', 'h'], assignmentDefaultGroupId: 'g' };
    expect(isPersonaBotModelPlan(plan)).toBe(true);
    expect(selectAssignmentGroup(plan)).toBe('g');
    expect(selectAssignmentGroup(plan, { group: 'h' })).toBe('h');
    expect(selectAssignmentGroup(plan, SPENT)).toBeUndefined();
    expect(() => selectAssignmentGroup(plan, { group: 'x' })).toThrow(
      'Assignment Routing Group x is not allowed',
    );
    expect(selectAssignmentGroup(basePlan)).toBeUndefined();
    expect(selectAssignmentRoute(basePlan)).toEqual(DEEPSEEK);
  });

  it('rejects a default group outside the list, duplicates and groups without a default route', () => {
    expect(isPersonaBotModelPlan({ ...basePlan, assignmentGroups: ['g', 'g'] })).toBe(false);
    expect(
      isPersonaBotModelPlan({
        ...basePlan,
        assignmentGroups: ['g'],
        assignmentDefaultGroupId: 'h',
      }),
    ).toBe(false);
    expect(isPersonaBotModelPlan({ ...basePlan, assignmentDefaultGroupId: 'g' })).toBe(false);
    const { assignmentDefault: _default, ...noDefault } = basePlan;
    expect(isPersonaBotModelPlan({ ...noDefault, assignmentGroups: ['g'] })).toBe(false);
  });
});

describe('An Assignment on a Routing Group keeps working when its route runs out (#4420)', () => {
  it('does not resume an Assignment stopped while its next model is being chosen', async () => {
    const clock = Date.parse('2026-11-18T00:00:00.000Z');
    const rests = createRouteRests({ now: () => clock });
    let picking: (() => void) | undefined;
    let release: () => void = () => undefined;
    const fallback = createGroupFallback({
      plan: () => undefined,
      routes: () => [SPENT, DEEPSEEK],
      rests,
      requireAllowed: () => undefined,
      validate: () =>
        new Promise<void>((resolve) => {
          release = resolve;
          picking?.();
        }),
    });
    const workspace = {
      id: 'project',
      path: realpathSync(createTempRoot('bh-assignment-group-stop-project-')),
      title: 'Project',
      status: async () => 'ok' as const,
    };
    let orchestrator: OrchestratorAgentRun | undefined;
    const runs: string[] = [];
    const drive = async (run: AssignmentAgentRun) => {
      runs.push(key(run.modelRoute));
      if (key(run.modelRoute) !== key(SPENT)) return;
      rests.rest(SPENT, clock + 3_600_000, 'quota');
      run.failedTurn?.({ turn: runs.length, endSeq: runs.length });
      throw Object.assign(new Error('QUOTA: OpenCode Go usage limit reached'), { code: 'QUOTA' });
    };
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        orchestrator = run;
      },
      runAssignment: drive,
      requestAssignment(run) {
        return { delivery: 'followup', accepted: Promise.resolve(), done: drive(run) };
      },
      async stopAssignment() {},
      async close() {},
    };
    const core = createCore({
      dshHome: createTempRoot('bh-assignment-group-stop-'),
      agents,
      routeRests: rests,
      groupFallback: fallback,
      workspaces: () => ({
        get: (id: string) => (id === workspace.id ? workspace : undefined),
        list: () => [workspace],
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const applied = core.registry.setModelPlan(
        'ada',
        { orchestrator: DEEPSEEK, assignmentDefault: DEEPSEEK, assignmentModels: options },
        0,
      );
      if (!applied.ok) throw new Error('plan');
      const grouped = core.registry.setAssignmentModels(
        'ada',
        DEEPSEEK,
        options,
        applied.record.modelPlan!.revision,
        undefined,
        { ids: ['g'], defaultId: 'g' },
      );
      if (!grouped.ok) throw new Error('groups');
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
        id: 'start',
        at: new Date(clock).toISOString(),
        author: { kind: 'human' },
        body: 'Start',
      });
      core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: dm.id,
        messageId: 'start',
        body: 'Start',
      });
      await core.runtime.whenIdle();
      const grant = await core.grants.create('ada', workspace.id);
      const choosing = new Promise<void>((resolve) => {
        picking = resolve;
      });
      const created = orchestrator!.assignments.create({
        title: 'Research',
        grantId: grant.id,
        description: 'Find the launch date',
        model: SPENT,
        modelGroupId: 'g',
      });
      if (created.outcome !== 'created') throw new Error('Assignment missing');
      const sessionId = created.assignment.sessionId;
      await choosing;
      await orchestrator!.assignments.stop(sessionId);
      release();
      for (let index = 0; index < 4; index += 1) {
        await core.runtime.whenIdle();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(runs).toEqual([key(SPENT)]);
      expect(core.runtime.getAssignment('ada', sessionId)).toMatchObject({ activity: 'stopped' });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('moves the Session to the next member with one notice and continues the Turn', async () => {
    const clock = Date.parse('2026-11-18T00:00:00.000Z');
    const until = clock + 3_600_000;
    const rests = createRouteRests({ now: () => clock });
    const fallback = createGroupFallback({
      plan: () => undefined,
      routes: (groupId) => {
        if (groupId !== 'g') throw new Error('missing');
        return [SPENT, DEEPSEEK];
      },
      rests,
      requireAllowed: () => undefined,
      validate: async () => undefined,
    });
    const workspace = {
      id: 'project',
      path: realpathSync(createTempRoot('bh-assignment-group-project-')),
      title: 'Project',
      status: async () => 'ok' as const,
    };
    let orchestrator: OrchestratorAgentRun | undefined;
    const runs: { route: string; text: string }[] = [];
    let everyRouteSpent = false;
    const drive = async (run: AssignmentAgentRun) => {
      runs.push({ route: key(run.modelRoute), text: run.text });
      if (key(run.modelRoute) !== key(SPENT)) return;
      rests.rest(SPENT, until, 'quota');
      if (everyRouteSpent) rests.rest(DEEPSEEK, until, 'credential');
      run.failedTurn?.({ turn: runs.length, endSeq: runs.length });
      throw Object.assign(new Error('QUOTA: OpenCode Go usage limit reached'), { code: 'QUOTA' });
    };
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        orchestrator = run;
      },
      runAssignment: drive,
      requestAssignment(run) {
        return { delivery: 'followup', accepted: Promise.resolve(), done: drive(run) };
      },
      async close() {},
    };
    const core = createCore({
      dshHome: createTempRoot('bh-assignment-group-'),
      agents,
      routeRests: rests,
      groupFallback: fallback,
      workspaces: () => ({
        get: (id: string) => (id === workspace.id ? workspace : undefined),
        list: () => [workspace],
      }),
    });
    const settle = async () => {
      for (let index = 0; index < 4; index += 1) {
        await core.runtime.whenIdle();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const applied = core.registry.setModelPlan(
        'ada',
        { orchestrator: DEEPSEEK, assignmentDefault: DEEPSEEK, assignmentModels: options },
        0,
      );
      if (!applied.ok) throw new Error('plan');
      const grouped = core.registry.setAssignmentModels(
        'ada',
        DEEPSEEK,
        options,
        applied.record.modelPlan!.revision,
        undefined,
        { ids: ['g'], defaultId: 'g' },
      );
      if (!grouped.ok) throw new Error('groups');
      expect(grouped.record.modelPlan).toMatchObject({
        assignmentGroups: ['g'],
        assignmentDefaultGroupId: 'g',
      });
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
        id: 'start',
        at: new Date(clock).toISOString(),
        author: { kind: 'human' },
        body: 'Start',
      });
      core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: dm.id,
        messageId: 'start',
        body: 'Start',
      });
      await settle();
      const grant = await core.grants.create('ada', workspace.id);
      expect(() =>
        orchestrator!.assignments.create({
          title: 'Refused',
          grantId: grant.id,
          description: 'Wrong group',
          model: SPENT,
          modelGroupId: 'other',
        }),
      ).toThrow('Assignment Routing Group other is not allowed');
      const created = orchestrator!.assignments.create({
        title: 'Research',
        grantId: grant.id,
        description: 'Find the launch date',
        model: SPENT,
        modelGroupId: 'g',
      });
      if (created.outcome !== 'created') throw new Error('Assignment missing');
      await settle();

      expect(runs.map((run) => run.route)).toEqual([key(SPENT), key(DEEPSEEK)]);
      expect(runs[1]!.text).toContain('next model in its Routing Group');
      const notices = core.channels.readMessages('dm-ada').filter((message) => message.modelSwitch);
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({
        modelSwitch: {
          botSlug: 'ada',
          from: SPENT,
          to: DEEPSEEK,
          reason: 'quota',
          until: new Date(until).toISOString(),
        },
      });
      expect(core.runtime.getAssignment('ada', created.assignment.sessionId)).toMatchObject({
        modelRoute: DEEPSEEK,
        activity: 'idle',
      });
      expect(
        core.channels.readMessages('dm-ada').filter((message) => message.sessionFailure),
      ).toEqual([]);

      everyRouteSpent = true;
      runs.length = 0;
      const stuck = orchestrator!.assignments.create({
        title: 'Stuck',
        grantId: grant.id,
        description: 'Every member runs out',
        model: SPENT,
        modelGroupId: 'g',
      });
      if (stuck.outcome !== 'created') throw new Error('Assignment missing');
      await settle();
      expect(runs.map((run) => run.route)).toEqual([key(SPENT)]);
      expect(core.runtime.getAssignment('ada', stuck.assignment.sessionId)).toMatchObject({
        modelRoute: SPENT,
        activity: 'error',
      });
      expect(
        core.channels
          .readMessages('dm-ada')
          .filter((message) => message.sessionFailure?.sessionId === stuck.assignment.sessionId),
      ).toMatchObject([{ sessionFailure: { code: 'QUOTA' } }]);
      expect(core.channels.readMessages('dm-ada').filter((m) => m.modelSwitch)).toHaveLength(1);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});

describe('A Bot without a Model Plan runs Assignments on the default Routing Group (#4500)', () => {
  it.each([
    { effort: undefined, next: DEEPSEEK },
    { effort: 'high', next: { ...DEEPSEEK, reasoningEffort: 'high' } },
  ])(
    'starts on the inherited group, refuses another group and moves to the next member at effort $effort',
    async ({ effort, next }) => {
      const clock = Date.parse('2026-11-18T00:00:00.000Z');
      const rests = createRouteRests({ now: () => clock });
      const fallback = createGroupFallback({
        plan: () => undefined,
        inheritedGroup: () => 'g',
        inheritedEffort: () => effort,
        withEffort: async (route, value) =>
          key(route) === key(DEEPSEEK) && value !== undefined
            ? { ...route, reasoningEffort: value }
            : route,
        routes: (groupId) => {
          if (groupId !== 'g') throw new Error('missing');
          return [SPENT, DEEPSEEK];
        },
        rests,
        requireAllowed: () => undefined,
        validate: async () => undefined,
      });
      const workspace = {
        id: 'project',
        path: realpathSync(createTempRoot('bh-assignment-inherited-project-')),
        title: 'Project',
        status: async () => 'ok' as const,
      };
      let orchestrator: OrchestratorAgentRun | undefined;
      const runs: string[] = [];
      const drive = async (run: AssignmentAgentRun) => {
        runs.push(key(run.modelRoute));
        if (key(run.modelRoute) !== key(SPENT)) return;
        rests.rest(SPENT, clock + 3_600_000, 'quota');
        run.failedTurn?.({ turn: runs.length, endSeq: runs.length });
        throw Object.assign(new Error('QUOTA: OpenCode Go usage limit reached'), { code: 'QUOTA' });
      };
      const agents: BotAgentAdapter = {
        async runOrchestrator(run) {
          orchestrator = run;
        },
        runAssignment: drive,
        requestAssignment(run) {
          return { delivery: 'followup', accepted: Promise.resolve(), done: drive(run) };
        },
        async close() {},
      };
      const core = createCore({
        dshHome: createTempRoot('bh-assignment-inherited-'),
        agents,
        routeRests: rests,
        groupFallback: fallback,
        workspaces: () => ({
          get: (id: string) => (id === workspace.id ? workspace : undefined),
          list: () => [workspace],
        }),
      });
      const settle = async () => {
        for (let index = 0; index < 4; index += 1) {
          await core.runtime.whenIdle();
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      };
      try {
        core.registry.create({ slug: 'ada', displayName: 'Ada' });
        const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
        await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
          id: 'start',
          at: new Date(clock).toISOString(),
          author: { kind: 'human' },
          body: 'Start',
        });
        core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
          channelId: dm.id,
          messageId: 'start',
          body: 'Start',
        });
        await settle();
        const grant = await core.grants.create('ada', workspace.id);
        expect(() =>
          orchestrator!.assignments.create({
            title: 'Refused',
            grantId: grant.id,
            description: 'Not the default group',
            model: SPENT,
            modelGroupId: 'other',
          }),
        ).toThrow('Apply a Model Preset before choosing an Assignment model');
        const created = orchestrator!.assignments.create({
          title: 'Research',
          grantId: grant.id,
          description: 'Find the launch date',
          model: effort === undefined ? SPENT : { ...SPENT, reasoningEffort: effort },
          modelGroupId: 'g',
        });
        if (created.outcome !== 'created') throw new Error('Assignment missing');
        await settle();

        expect(runs).toEqual([key(SPENT), key(DEEPSEEK)]);
        expect(core.runtime.getAssignment('ada', created.assignment.sessionId)).toMatchObject({
          modelRoute: next,
          activity: 'idle',
        });
      } finally {
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );
});

describe('An Assignment on a Routing Group keeps its chosen effort after a fallback (#4502)', () => {
  it.each([
    {
      member: { ...DEEPSEEK, reasoningEffort: 'max' },
      next: { ...DEEPSEEK, reasoningEffort: 'high' },
    },
    { member: DEEPSEEK, next: DEEPSEEK },
  ])(
    'moves to the next member at the same effort it supports and stays there after the rest ends',
    async ({ member, next }) => {
      let clock = Date.parse('2026-11-18T00:00:00.000Z');
      const rests = createRouteRests({ now: () => clock });
      const fallback = createGroupFallback({
        plan: () => undefined,
        routes: () => [SPENT, member],
        rests,
        requireAllowed: () => undefined,
        validate: async () => undefined,
        withEffort: async (route, effort) =>
          groupMemberRoute(route, effort, [
            { ...DEEPSEEK, providerName: 'DeepSeek', modelName: 'Plain', efforts: [] },
          ]),
      });
      const workspace = {
        id: 'project',
        path: realpathSync(createTempRoot('bh-assignment-effort-project-')),
        title: 'Project',
        status: async () => 'ok' as const,
      };
      let orchestrator: OrchestratorAgentRun | undefined;
      const runs: (ModelRoute | undefined)[] = [];
      const drive = async (run: AssignmentAgentRun) => {
        runs.push(run.modelRoute);
        if (key(run.modelRoute) !== key(SPENT)) return;
        rests.rest(SPENT, clock + 3_600_000, 'quota');
        run.failedTurn?.({ turn: runs.length, endSeq: runs.length });
        throw Object.assign(new Error('QUOTA: OpenCode Go usage limit reached'), { code: 'QUOTA' });
      };
      const agents: BotAgentAdapter = {
        async runOrchestrator(run) {
          orchestrator = run;
        },
        runAssignment: drive,
        requestAssignment(run) {
          return { delivery: 'followup', accepted: Promise.resolve(), done: drive(run) };
        },
        async close() {},
      };
      const core = createCore({
        dshHome: createTempRoot('bh-assignment-effort-'),
        agents,
        routeRests: rests,
        groupFallback: fallback,
        workspaces: () => ({
          get: (id: string) => (id === workspace.id ? workspace : undefined),
          list: () => [workspace],
        }),
      });
      const settle = async () => {
        for (let index = 0; index < 4; index += 1) {
          await core.runtime.whenIdle();
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      };
      try {
        core.registry.create({ slug: 'ada', displayName: 'Ada' });
        const applied = core.registry.setModelPlan(
          'ada',
          { orchestrator: DEEPSEEK, assignmentDefault: DEEPSEEK, assignmentModels: options },
          0,
        );
        if (!applied.ok) throw new Error('plan');
        const grouped = core.registry.setAssignmentModels(
          'ada',
          DEEPSEEK,
          options,
          applied.record.modelPlan!.revision,
          undefined,
          {
            ids: ['g'],
            defaultId: 'g',
            options: [{ group: 'g', allowedEfforts: ['high'], defaultEffort: 'high' }],
          },
        );
        if (!grouped.ok) throw new Error('groups');
        const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
        await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
          id: 'start',
          at: new Date(clock).toISOString(),
          author: { kind: 'human' },
          body: 'Start',
        });
        core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
          channelId: dm.id,
          messageId: 'start',
          body: 'Start',
        });
        await settle();
        const grant = await core.grants.create('ada', workspace.id);
        const created = orchestrator!.assignments.create({
          title: 'Research',
          grantId: grant.id,
          description: 'Find the launch date',
          model: { ...SPENT, reasoningEffort: 'high' },
          modelGroupId: 'g',
        });
        if (created.outcome !== 'created') throw new Error('Assignment missing');
        await settle();

        expect(runs).toEqual([{ ...SPENT, reasoningEffort: 'high' }, next]);
        clock += 3_600_000;
        expect(
          await orchestrator!.assignments.refreshRoute?.(created.assignment.sessionId),
        ).toEqual(next);
      } finally {
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );
});
