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

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

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
  it.each([
    {
      action: 'stopped',
      expected: 'stopped',
      turns: [],
    },
    {
      action: 'switched with a new execution in flight',
      expected: 'working',
      turns: [DEEPSEEK],
      delivery: 'followup',
    },
    {
      action: 'switched with a new execution already finished',
      expected: 'idle',
      turns: [DEEPSEEK],
      delivery: 'followup',
    },
    {
      action: 'switched without a new execution',
      expected: 'idle',
      turns: [DEEPSEEK],
      delivery: 'steer',
    },
  ])('$action during the pick', async ({ expected, turns, delivery }) => {
    const clock = Date.parse('2026-11-18T00:00:00.000Z');
    const rests = createRouteRests({ now: () => clock });
    const choosing = deferred();
    const pick = deferred();
    const finishRequest = deferred();
    const fallback = createGroupFallback({
      plan: () => undefined,
      routes: () => [SPENT, DEEPSEEK],
      rests,
      requireAllowed: () => undefined,
      validate: () => {
        choosing.resolve();
        return pick.promise;
      },
    });
    const workspace = {
      id: 'project',
      path: realpathSync(createTempRoot('bh-assignment-group-stop-project-')),
      title: 'Project',
      status: async () => 'ok' as const,
    };
    let orchestrator: OrchestratorAgentRun | undefined;
    const runs: { route: ModelRoute | undefined; text: string }[] = [];
    const switchText = 'Continue on a single model';
    const drive = async (run: AssignmentAgentRun) => {
      runs.push({ route: run.modelRoute, text: run.text });
      if (run.text === switchText) await finishRequest.promise;
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
        if (delivery === 'steer' && run.text === switchText) return { delivery: 'steer' };
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
      const created = orchestrator!.assignments.create({
        title: 'Research',
        grantId: grant.id,
        description: 'Find the launch date',
        model: SPENT,
        modelGroupId: 'g',
      });
      if (created.outcome !== 'created') throw new Error('Assignment missing');
      const sessionId = created.assignment.sessionId;
      await choosing.promise;
      if (delivery === undefined) {
        await orchestrator!.assignments.stop(sessionId);
      } else {
        const request = orchestrator!.assignments.request({
          sessionId,
          mode: 'next-turn',
          text: switchText,
          model: DEEPSEEK,
        });
        expect(request.delivery).toBe(delivery);
        await Promise.resolve();
        expect(core.runtime.getAssignment('ada', sessionId)?.modelRoute).toEqual(DEEPSEEK);
        if (expected === 'idle') {
          finishRequest.resolve();
          await core.runtime.whenIdle();
        }
      }
      pick.resolve();
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(core.runtime.getAssignment('ada', sessionId)?.activity).toBe(expected);
      expect(runs.map((run) => run.route)).toEqual([SPENT, ...turns]);
      expect(runs.map((run) => run.text).join('\n')).not.toContain(
        'next model in its Routing Group',
      );
      expect(
        core.channels
          .readMessages('dm-ada')
          .filter((message) => message.modelSwitch || message.sessionFailure),
      ).toEqual([]);
    } finally {
      pick.resolve();
      finishRequest.resolve();
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

describe('A Bot without an Assignment model choice inherits the default Routing Group (#4500)', () => {
  it.each([
    { effort: undefined, next: DEEPSEEK, hasPlan: false },
    { effort: 'high', next: { ...DEEPSEEK, reasoningEffort: 'high' }, hasPlan: false },
    { effort: 'high', next: { ...DEEPSEEK, reasoningEffort: 'high' }, hasPlan: true },
  ])(
    'inherits effort $effort with an Orchestrator-only plan present=$hasPlan',
    async ({ effort, next, hasPlan }) => {
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
        if (hasPlan) {
          const applied = core.registry.customizeModelPlan('ada', DEEPSEEK, 0);
          expect(applied.ok).toBe(true);
        }
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
        ).toThrow(
          hasPlan
            ? 'An Assignment Routing Group needs its chosen member route'
            : 'Apply a Model Preset before choosing an Assignment model',
        );
        const created = orchestrator!.assignments.create({
          title: 'Research',
          grantId: grant.id,
          description: 'Find the launch date',
          model: SPENT,
          modelGroupId: 'g',
          ...(effort === undefined ? {} : { modelGroupEffort: effort }),
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
  const third = { provider: 'other', model: 'reasoning-model' };
  const high = { ...SPENT, reasoningEffort: 'high' };
  const thirdHigh = { ...third, reasoningEffort: 'high' };

  it.each([
    {
      name: 'honors a pinned member effort',
      member: { ...DEEPSEEK, reasoningEffort: 'max' },
      expected: [{ ...DEEPSEEK, reasoningEffort: 'max' }],
    },
    {
      name: 'retains legacy effort handling for a row with no stored group effort',
      member: { ...DEEPSEEK, reasoningEffort: 'max' },
      expected: [{ ...DEEPSEEK, reasoningEffort: 'high' }],
      legacy: true,
    },
    {
      name: 'stays on a healthy member when an earlier rest ends',
      member: DEEPSEEK,
      expected: [DEEPSEEK],
    },
    {
      name: 'keeps high through a plain member on automatic fallback',
      member: DEEPSEEK,
      expected: [DEEPSEEK, thirdHigh],
      followup: 'automatic',
    },
    {
      name: 'keeps high when the initial group member has no reasoning',
      member: DEEPSEEK,
      expected: [thirdHigh],
      startOnPlain: true,
      followup: 'automatic',
    },
    {
      name: 'keeps the legacy route-derived behavior across a plain member',
      member: DEEPSEEK,
      expected: [DEEPSEEK, third],
      followup: 'automatic',
      legacy: true,
    },
    {
      name: 'keeps high on a resumed request returning from a plain member',
      member: DEEPSEEK,
      expected: [DEEPSEEK, high],
      followup: 'resume',
    },
    {
      name: 'keeps high when a stopped Assignment resumes on the first member',
      member: DEEPSEEK,
      expected: [DEEPSEEK, high],
      followup: 'stop-and-resume',
    },
    {
      name: 'leaves the group when a request explicitly selects a single model',
      member: DEEPSEEK,
      expected: [DEEPSEEK, DEEPSEEK],
      followup: 'switch-to-single',
    },
  ])(
    '$name when an Assignment Routing Group member is resting',
    async ({ member, expected, legacy, followup, startOnPlain }) => {
      let clock = Date.parse('2026-11-18T00:00:00.000Z');
      const rests = createRouteRests({ now: () => clock });
      const fallback = createGroupFallback({
        plan: () => undefined,
        routes: () => [SPENT, member, third],
        rests,
        requireAllowed: () => undefined,
        validate: async () => undefined,
        withEffort: async (route, effort) =>
          groupMemberRoute(route, effort, [
            { ...DEEPSEEK, providerName: 'DeepSeek', modelName: 'Plain', efforts: [] },
            ...[SPENT, third].map((reasoning) => ({
              ...reasoning,
              providerName: reasoning.provider,
              modelName: reasoning.model,
              efforts: [{ id: 'high', name: 'High' }],
            })),
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
        if (run.modelRoute === undefined) return;
        if (
          !(key(run.modelRoute) === key(SPENT) && !run.resume) &&
          !(followup === 'automatic' && key(run.modelRoute) === key(member))
        )
          return;
        rests.rest(run.modelRoute, clock + 3_600_000, 'quota');
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
        const initial = startOnPlain ? member : high;
        if (startOnPlain) rests.rest(SPENT, clock + 3_600_000, 'quota');
        const created = orchestrator!.assignments.create({
          title: 'Research',
          grantId: grant.id,
          description: 'Find the launch date',
          model: initial,
          modelGroupId: 'g',
          ...(legacy ? {} : { modelGroupEffort: 'high' }),
        });
        if (created.outcome !== 'created') throw new Error('Assignment missing');
        await settle();

        const { sessionId } = created.assignment;
        if (followup === 'switch-to-single') {
          const request = orchestrator!.assignments.request({
            sessionId,
            mode: 'next-turn',
            text: 'Continue on a single model',
            model: member,
          });
          expect(request.delivery).toBe('followup');
          await settle();
          rests.rest(member, clock + 3_600_000, 'quota');
          expect(await orchestrator!.assignments.refreshRoute?.(sessionId)).toEqual(member);
        } else if (followup === 'resume' || followup === 'stop-and-resume') {
          if (followup === 'stop-and-resume') await orchestrator!.assignments.stop(sessionId);
          clock += 3_600_000;
          rests.rest(member, clock + 3_600_000, 'quota');
          await orchestrator!.assignments.refreshRoute?.(sessionId);
          const request = orchestrator!.assignments.request({
            sessionId,
            mode: 'next-turn',
            text: 'Continue the research',
          });
          expect(request.delivery).toBe('followup');
          await settle();
        } else {
          clock += 3_600_000;
          expect(await orchestrator!.assignments.refreshRoute?.(sessionId)).toEqual(
            expected.at(-1),
          );
        }
        expect(runs).toEqual([initial, ...expected]);
      } finally {
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );
});
