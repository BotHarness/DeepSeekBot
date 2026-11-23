import { type ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it } from 'vitest';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost, FAKE_BOT as BOT } from './dsh-agent-host-fixture.js';
import { ASSIGNMENT, groupTools, reportRun } from './support/dsh-bot-agent-adapter.js';

describe('Assignment Routing Groups (#4420)', () => {
  it.each([true, false])('filters Assignment choices (%s)', async (allowBoth) => {
    const spent = { provider: 'opencode-go', model: 'deepseek-v4.1-flash' };
    const pro = { provider: 'deepseek-official', model: 'deepseek-v4-pro' };
    const until = '2026-11-18T00:00:00.000Z';
    const plan = {
      revision: 2,
      sourcePresetId: '',
      sourcePresetName: '',
      orchestrator: pro,
      assignmentDefault: pro,
      assignmentModels: [
        { ...pro, allowedEfforts: [''], defaultEffort: '' },
        { ...spent, allowedEfforts: [''], defaultEffort: '' },
      ],
      assignmentGroups: ['g'],
      assignmentDefaultGroupId: 'g',
      appliedAt: BOT.createdAt,
    };
    let picks = 0;
    const calls: Array<Promise<unknown>> = [];
    const created: unknown[] = [];
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onAgentCreated: () => {
          const scope = host.scopes.get('orchestrator-ada');
          const tool = (name: string) => {
            const found = scope?.tools.find((candidate) => candidate.name === name);
            if (found === undefined) throw new Error(`${name} not registered`);
            return found;
          };
          const run = async (name: string, args: Record<string, unknown>) =>
            tool(name).execute(args, {} as ToolRunContext);
          calls.push(
            run('list_assignment_models', {}),
            run('create_assignment', {
              title: 'Default group',
              description: 'Runs on the default group.',
              grant_id: 'grant-1',
            }),
            run('create_assignment', {
              title: 'Direct',
              description: 'Runs on a listed model.',
              grant_id: 'grant-1',
              provider: pro.provider,
              model: pro.model,
            }),
            run('create_assignment', {
              title: 'Unknown',
              description: 'Names a group outside the plan.',
              grant_id: 'grant-1',
              group: 'other',
            }).catch((error: Error) => JSON.stringify({ error: error.message })),
            run('create_assignment', {
              title: 'Exhausted',
              description: 'Every member rests.',
              grant_id: 'grant-1',
              group: 'g',
            }),
          );
        },
      },
    );
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      resolveModelPlan: () => plan,
      modelFilter: () => (route) => allowBoth || route.provider === pro.provider,
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
      assignmentGroups: {
        pick: async () =>
          ++picks > 1
            ? {
                kind: 'exhausted',
                rests: [
                  { ...spent, until, reason: 'quota' },
                  { ...pro, until, reason: 'credential' },
                ],
              }
            : { kind: 'route', route: pro },
        describe: (id) => (id === 'g' ? { name: 'Fallback', routes: [spent, pro] } : undefined),
        restingUntil: (route) =>
          route.provider === spent.provider ? { ...spent, until, reason: 'quota' } : undefined,
      },
    });
    await adapter.runOrchestrator({
      sessionId: 'orchestrator-ada',
      resume: false,
      bot: { ...BOT, modelPlan: plan },
      message: 'Start the work',
      inboundChannelId: 'dm-test',
      inbox: '',
      channels: {
        ...groupTools,
        contacts: async () => ({ outputLimit: 12_000, contacts: [] }),
        sendToBot: async () => {
          throw new Error('unexpected Bot DM');
        },
        ignore: () => {
          throw new Error('unexpected ignore');
        },
        read: () => [],
        requestGrant: async () => {
          throw new Error('unexpected Grant request');
        },
        send: async (input) => ({
          id: 'bot-1',
          at: BOT.createdAt,
          author: { kind: 'bot', slug: BOT.slug },
          body: input.body,
        }),
      },
      assignments: {
        create: (input) => {
          created.push(input);
          return { outcome: 'created', assignment: ASSIGNMENT };
        },
        grants: () => [],
        list: () => [],
        inspect: () => undefined,
        stop: async () => ASSIGNMENT,
        request: () => {
          throw new Error('unexpected Assignment request');
        },
      },
    });
    try {
      const parsed = (await Promise.all(calls)).map((value) => JSON.parse(String(value)));
      expect(parsed[0]).toMatchObject({ assignmentDefault: pro });
      expect(
        parsed[0].assignmentModels.map(({ provider }: { provider: string }) => provider),
      ).toEqual(allowBoth ? [pro.provider, spent.provider] : [pro.provider]);
      if (allowBoth) {
        expect(parsed[0].assignmentGroups).toMatchObject([
          {
            group: 'g',
            name: 'Fallback',
            default: true,
            members: [{ ...spent, restingUntil: until }, pro],
          },
        ]);
        expect(parsed[0].assignmentGroups[0].restingUntil).toBeUndefined();
      } else {
        expect(parsed[0]).not.toHaveProperty('assignmentGroups');
      }
      expect(parsed[3].error).toContain('Routing Group other is not allowed');
      expect(parsed[4]).toMatchObject({ outcome: 'refused' });
      expect(parsed[4].message).toContain(`opencode-go/deepseek-v4.1-flash until ${until}`);
      expect(created).toMatchObject([
        { title: 'Default group', model: pro, modelGroupId: 'g' },
        { title: 'Direct', model: pro },
      ]);
      expect(created[1]).not.toHaveProperty('modelGroupId');
    } finally {
      await adapter.close();
    }
  });
});

describe('Effort range for Assignment Routing Groups (#4502)', () => {
  it('lists the group effort range and starts the Assignment at the chosen or default effort', async () => {
    const spent = { provider: 'opencode-go', model: 'deepseek-v4.1-flash' };
    const pro = { provider: 'deepseek-official', model: 'deepseek-v4-pro' };
    const until = '2026-11-18T00:00:00.000Z';
    const plan = {
      revision: 2,
      sourcePresetId: '',
      sourcePresetName: '',
      orchestrator: pro,
      assignmentDefault: pro,
      assignmentGroups: ['g'],
      assignmentDefaultGroupId: 'g',
      assignmentGroupOptions: [
        { group: 'g', allowedEfforts: ['low', 'high'], defaultEffort: 'high', note: 'Cheap first' },
      ],
      appliedAt: BOT.createdAt,
    };
    const calls: Array<Promise<unknown>> = [];
    const created: unknown[] = [];
    const picks: Array<string | undefined> = [];
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onTurn: async () => undefined,
        onAgentCreated: () => {
          const scope = host.scopes.get('orchestrator-ada');
          const run = async (name: string, args: Record<string, unknown>) =>
            scope!.tools.find((tool) => tool.name === name)!.execute(args, {} as ToolRunContext);
          const assignment = (title: string, extra: Record<string, unknown>) =>
            run('create_assignment', {
              title,
              description: 'Runs on the group.',
              grant_id: 'grant-1',
              ...extra,
            }).catch((error: Error) => JSON.stringify({ error: error.message }));
          calls.push(
            run('list_assignment_models', {}),
            assignment('Default effort', {}),
            assignment('Chosen effort', { group: 'g', reasoning_effort: 'low' }),
            assignment('Outside the range', { group: 'g', reasoning_effort: 'max' }),
          );
        },
      },
    );
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      resolveModelPlan: () => plan,
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
      assignmentGroups: {
        pick: async (_slug, _group, effort) => {
          picks.push(effort);
          return {
            kind: 'route',
            route: effort === 'high' ? { ...pro, reasoningEffort: 'high' } : pro,
          };
        },
        describe: (id) => (id === 'g' ? { name: 'Fallback', routes: [spent, pro] } : undefined),
        restingUntil: (route) =>
          route.provider === spent.provider ? { ...spent, until, reason: 'quota' } : undefined,
      },
    });
    await adapter.runOrchestrator({
      ...reportRun,
      bot: { ...BOT, modelPlan: plan },
      assignments: {
        ...reportRun.assignments,
        create: (input) => {
          created.push(input);
          return { outcome: 'created', assignment: ASSIGNMENT };
        },
      },
    });
    try {
      const parsed = (await Promise.all(calls)).map((value) => JSON.parse(String(value)));
      expect(parsed[0].assignmentGroups).toMatchObject([
        {
          group: 'g',
          note: 'Cheap first',
          front: pro,
          efforts: ['low', 'high'],
          defaultEffort: 'high',
        },
      ]);
      expect(parsed[3].error).toContain('Routing Group g allows efforts low, high');
      expect(created).toMatchObject([
        {
          title: 'Default effort',
          model: { ...pro, reasoningEffort: 'high' },
          modelGroupId: 'g',
          modelGroupEffort: 'high',
        },
        { title: 'Chosen effort', model: pro, modelGroupId: 'g', modelGroupEffort: 'low' },
      ]);
      expect(created).toHaveLength(2);
      expect(picks).toEqual(['high', 'low']);
    } finally {
      await adapter.close();
    }
  });
});

describe('An Assignment on the inherited default Routing Group', () => {
  it('runs at the default group effort', async () => {
    const pro = { provider: 'deepseek', model: 'pro' };
    const created: unknown[] = [];
    const picks: Array<string | undefined> = [];
    const calls: Array<Promise<unknown>> = [];
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onTurn: async () => undefined,
        onAgentCreated: () => {
          const scope = host.scopes.get('orchestrator-ada');
          calls.push(
            scope!.tools
              .find((tool) => tool.name === 'create_assignment')!
              .execute(
                { title: 'Inherited', description: 'Runs on the default.', grant_id: 'grant-1' },
                {} as ToolRunContext,
              ),
          );
        },
      },
    );
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => pro },
      resolveModelPlan: () => undefined,
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
      assignmentGroups: {
        pick: async (_slug, _group, effort) => {
          picks.push(effort);
          return { kind: 'route', route: { ...pro, reasoningEffort: effort! } };
        },
        describe: (id) => (id === 'daily' ? { name: 'Daily', routes: [pro] } : undefined),
        restingUntil: () => undefined,
        inherited: () => 'daily',
        inheritedEffort: () => 'high',
      },
    });
    await adapter.runOrchestrator({
      ...reportRun,
      bot: BOT,
      assignments: {
        ...reportRun.assignments,
        create: (input) => {
          created.push(input);
          return { outcome: 'created', assignment: ASSIGNMENT };
        },
      },
    });
    try {
      await Promise.all(calls);
      expect(picks).toEqual(['high']);
      expect(created).toMatchObject([
        {
          model: { ...pro, reasoningEffort: 'high' },
          modelGroupId: 'daily',
          modelGroupEffort: 'high',
        },
      ]);
    } finally {
      await adapter.close();
    }
  });
});
