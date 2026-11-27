import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createChannelStore } from '../src/channels/store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createBotRuntime } from '../src/core.js';
import { type OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createAssignmentAccessStore } from '../src/workspaces/assignment-access.js';
import { createWorkspaceGrantStore } from '../src/workspaces/grants.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import { admit, DeterministicAgentAdapter, ownershipRows } from './support/bot-runtime.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';

describe('Bot runtime tracer bullet', () => {
  it('keeps the mode an Orchestrator chose for each new Assignment across restarts', async () => {
    const home = createTempRoot('botharness-assignment-mode-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
      id: 'human-1',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: 'Delegate',
    });
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const started: Array<string | undefined> = [];
    const runtime = createBotRuntime({
      database: owner,
      grants: createTestWorkspaceGrants(owner, home),
      registry,
      channels,
      agents: {
        runOrchestrator: async (run) => {
          if (run.message === '') return;
          const create = (mode?: string, key?: string) =>
            run.assignments.create({
              title: 'Assignment',
              description: 'Inspect',
              grantId: TEST_GRANT_ID,
              ...(mode === undefined ? {} : { mode }),
              ...(key === undefined ? {} : { key }),
            });
          expect(create('ptc', 'parser').outcome).toBe('created');
          expect(create().outcome).toBe('created');
        },
        runAssignment: async (run) => {
          started.push(run.agentPreset);
          await run.report({ state: 'completed', summary: 'Done' });
        },
        requestAssignment: () => ({
          delivery: 'followup' as const,
          accepted: Promise.resolve(),
          done: Promise.resolve(),
        }),
        close: async () => undefined,
      },
      now: FIXED_NOW,
      assignmentConcurrencyLimit: 4,
      createSessionId: (() => {
        const ids = ['orchestrator-ada', 'assignment-ptc', 'assignment-default'];
        return () => ids.shift() ?? 'unexpected-session';
      })(),
    });
    await admit(runtime, { channelId: dm.id, messageId: 'human-1', body: 'Delegate' });
    await runtime.whenIdle();
    expect(started).toEqual(['ptc', undefined]);
    expect(runtime.getAssignment('ada', 'assignment-ptc')?.agentPreset).toBe('ptc');
    expect(runtime.getAssignment('ada', 'assignment-default')?.agentPreset).toBeUndefined();
    await runtime.close();
    owner.close();
    const reopenedOwner = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    const reopened = createBotRuntime({
      database: reopenedOwner,
      grants: createTestWorkspaceGrants(reopenedOwner, home),
      registry,
      channels,
      agents: {
        runOrchestrator: async () => undefined,
        runAssignment: async () => undefined,
        requestAssignment: () => ({
          delivery: 'followup' as const,
          accepted: Promise.resolve(),
          done: Promise.resolve(),
        }),
        close: async () => undefined,
      },
      now: FIXED_NOW,
    });
    expect(
      reopened.listAssignments('ada').find((entry) => entry.sessionId === 'assignment-ptc'),
    ).toMatchObject({ agentPreset: 'ptc' });
    await reopened.close();
    reopenedOwner.close();
  });

  it('snapshots default and permitted explicit Assignment routes before creating Sessions', async () => {
    const home = createTempRoot('botharness-assignment-model-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const pro = { provider: 'deepseek', model: 'pro', reasoningEffort: 'off' };
    registry.applyModelPreset('ada', {
      id: 'preset',
      name: 'Choices',
      revision: 1,
      orchestrator: { provider: 'deepseek', model: 'flash', reasoningEffort: 'high' },
      assignmentDefault: pro,
      assignmentModels: [
        { provider: 'deepseek', model: 'pro', allowedEfforts: ['off'], defaultEffort: 'off' },
        {
          provider: 'deepseek',
          model: 'flash',
          allowedEfforts: ['', 'low', 'high'],
          defaultEffort: 'low',
        },
      ],
      createdAt: FIXED_NOW().toISOString(),
    });
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
      id: 'human-1',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: 'Delegate',
    });
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const selections: string[] = [];
    const resumedRoutes: Array<
      { provider: string; model: string; reasoningEffort?: string } | undefined
    > = [];
    let assignmentAccess: OrchestratorAgentRun['assignments'] | undefined;
    const runtime = createBotRuntime({
      database: owner,
      grants: createTestWorkspaceGrants(owner, home),
      registry,
      channels,
      agents: {
        runOrchestrator: async (run) => {
          if (run.message === '') return;
          assignmentAccess = run.assignments;
          const create = (model?: { provider: string; model: string; reasoningEffort?: string }) =>
            run.assignments.create({
              title: 'Assignment',
              description: 'Inspect',
              grantId: TEST_GRANT_ID,
              ...(model === undefined ? {} : { model }),
            });
          expect(() =>
            create({ provider: 'deepseek', model: 'pro', reasoningEffort: 'high' }),
          ).toThrow(/not allowed/);
          expect(() => create({ provider: 'other', model: 'flash' })).toThrow(/not allowed/);
          expect(create().outcome).toBe('created');
          expect(create({ provider: 'deepseek', model: 'flash' }).outcome).toBe('created');
          expect(
            create({ provider: 'deepseek', model: 'flash', reasoningEffort: 'high' }).outcome,
          ).toBe('created');
          expect(
            create({ provider: 'deepseek', model: 'flash', reasoningEffort: '' }).outcome,
          ).toBe('created');
        },
        runAssignment: async (run) => {
          selections.push(
            `${run.modelRoute?.provider}/${run.modelRoute?.model}/${run.modelRoute?.reasoningEffort}`,
          );
          await run.report({ state: 'completed', summary: 'Done' });
        },
        requestAssignment: (run) => {
          if (run.text === 'Delivery failure') throw new Error('Delivery unavailable');
          resumedRoutes.push(run.modelRoute);
          return {
            delivery: 'followup' as const,
            accepted: Promise.resolve(),
            done: Promise.resolve(),
          };
        },
        close: async () => undefined,
      },
      now: FIXED_NOW,
      assignmentConcurrencyLimit: 4,
      createSessionId: (() => {
        const ids = [
          'orchestrator-ada',
          'assignment-default',
          'assignment-low',
          'assignment-high',
          'assignment-provider-default',
        ];
        return () => ids.shift() ?? 'unexpected-session';
      })(),
    });
    await admit(runtime, { channelId: dm.id, messageId: 'human-1', body: 'Delegate' });
    await runtime.whenIdle();
    expect(selections).toEqual([
      'deepseek/pro/off',
      'deepseek/flash/low',
      'deepseek/flash/high',
      'deepseek/flash/undefined',
    ]);
    expect(runtime.listAssignments('ada').map((assignment) => assignment.modelRoute)).toEqual([
      { provider: 'deepseek', model: 'pro', reasoningEffort: 'off' },
      { provider: 'deepseek', model: 'flash', reasoningEffort: 'high' },
      { provider: 'deepseek', model: 'flash', reasoningEffort: 'low' },
      { provider: 'deepseek', model: 'flash' },
    ]);
    registry.applyModelPreset('ada', {
      id: 'new-preset',
      name: 'Pro only',
      revision: 1,
      orchestrator: { provider: 'deepseek', model: 'flash', reasoningEffort: 'high' },
      assignmentDefault: pro,
      assignmentModels: [
        { provider: 'deepseek', model: 'pro', allowedEfforts: ['off'], defaultEffort: 'off' },
      ],
      createdAt: FIXED_NOW().toISOString(),
    });
    expect(assignmentAccess).toBeDefined();
    assignmentAccess!.request({
      sessionId: 'assignment-low',
      mode: 'next-turn',
      text: 'Keep old route',
    });
    await Promise.resolve();
    expect(resumedRoutes.at(-1)).toEqual({
      provider: 'deepseek',
      model: 'flash',
      reasoningEffort: 'low',
    });
    expect(() =>
      assignmentAccess!.request({
        sessionId: 'assignment-low',
        mode: 'next-turn',
        text: 'Reject',
        model: { provider: 'deepseek', model: 'flash', reasoningEffort: 'high' },
      }),
    ).toThrow(/not allowed/);
    expect(runtime.getAssignment('ada', 'assignment-low')?.modelRoute).toEqual({
      provider: 'deepseek',
      model: 'flash',
      reasoningEffort: 'low',
    });
    expect(() =>
      assignmentAccess!.request({
        sessionId: 'assignment-low',
        mode: 'next-turn',
        text: 'Delivery failure',
        model: { provider: 'deepseek', model: 'pro' },
      }),
    ).toThrow(/Delivery unavailable/);
    expect(runtime.getAssignment('ada', 'assignment-low')?.modelRoute).toEqual({
      provider: 'deepseek',
      model: 'flash',
      reasoningEffort: 'low',
    });
    assignmentAccess!.request({
      sessionId: 'assignment-low',
      mode: 'next-turn',
      text: 'Switch',
      model: { provider: 'deepseek', model: 'pro' },
    });
    expect(resumedRoutes.at(-1)).toEqual(pro);
    await Promise.resolve();
    expect(runtime.getAssignment('ada', 'assignment-low')?.modelRoute).toEqual(pro);
    await runtime.close();
    owner.close();
    const reopenedOwner = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    const reopened = createBotRuntime({
      database: reopenedOwner,
      grants: createTestWorkspaceGrants(reopenedOwner, home),
      registry,
      channels,
      agents: {
        runOrchestrator: async () => undefined,
        runAssignment: async () => undefined,
        requestAssignment: () => ({
          delivery: 'followup' as const,
          accepted: Promise.resolve(),
          done: Promise.resolve(),
        }),
        close: async () => undefined,
      },
      now: FIXED_NOW,
    });
    expect(reopened.getAssignment('ada', 'assignment-low')?.modelRoute).toEqual(pro);
    await reopened.close();
    reopenedOwner.close();
  });

  it('freezes each new Assignment access mode while later Bot preset changes leave old Sessions intact', async () => {
    const home = createTempRoot('botharness-bot-runtime-access-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const access = createAssignmentAccessStore(attachOperationalModule(owner, 'assignment-access'));
    access.set('ada', 'danger-full-access');
    const ids = ['orchestrator-ada', 'assignment-danger', 'assignment-safe'];
    const runtime = createBotRuntime({
      database: owner,
      grants: createTestWorkspaceGrants(owner, home),
      assignmentAccess: access,
      registry,
      channels,
      agents: new DeterministicAgentAdapter(),
      now: FIXED_NOW,
      createSessionId: () => ids.shift() ?? 'unexpected-session',
    });
    await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
      id: 'human-danger',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: 'first',
    });
    await admit(runtime, { channelId: dm.id, messageId: 'human-danger', body: 'first' });
    await runtime.whenIdle();
    expect(runtime.getAssignment('ada', 'assignment-danger')?.permission).toMatchObject({
      mode: 'danger-full-access',
      approval: 'ask',
      presetRevision: 1,
    });
    access.set('ada', 'workspace-write');
    await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
      id: 'human-safe',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: 'second',
    });
    await admit(runtime, { channelId: dm.id, messageId: 'human-safe', body: 'second' });
    await runtime.whenIdle();
    expect(runtime.getAssignment('ada', 'assignment-danger')?.permission?.mode).toBe(
      'danger-full-access',
    );
    expect(runtime.getAssignment('ada', 'assignment-safe')?.permission).toMatchObject({
      mode: 'workspace-write',
      approval: 'ask',
      presetRevision: 2,
    });
    await runtime.close();
    owner.close();
  });
});

it('requests a folder in the DM and resumes the same Orchestrator after Human authorization', async () => {
  const home = createTempRoot('botharness-grant-request-');
  const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
  const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  const grants = createWorkspaceGrantStore({
    database: attachOperationalModule(owner, 'grant-request-test'),
    now: FIXED_NOW,
    createId: () => 'human-grant',
    workspaces: () => ({
      get: (id: string) =>
        id === 'project'
          ? { id, path: home, title: 'Project', status: async () => 'ok' as const }
          : undefined,
      list: () => [
        { id: 'project', path: home, title: 'Project', status: async () => 'ok' as const },
      ],
    }),
  });
  let nextSession = 0;
  const runtime = createBotRuntime({
    database: owner,
    registry,
    channels,
    grants,
    agents: {
      runOrchestrator: async (run) => {
        const active = run.assignments.grants().find((grant) => grant.revokedAt === undefined);
        if (active === undefined) {
          await run.channels.requestGrant('需要项目文件夹以完成这项工作');
        } else {
          run.assignments.create({
            title: 'Assignment',
            description: '读取项目',
            grantId: active.id,
            key: 'project-read',
          });
        }
      },
      runAssignment: async (run) => {
        await run.report({ state: 'completed', summary: '项目已读取' });
      },
      requestAssignment: () => ({
        delivery: 'followup' as const,
        accepted: Promise.resolve(),
        done: Promise.resolve(),
      }),
      close: async () => undefined,
    },
    now: FIXED_NOW,
    createSessionId: () => `session-${++nextSession}`,
    createEventId: () => `event-${++nextSession}`,
    createMessageId: () => `message-${++nextSession}`,
  });
  await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
    id: 'human-start',
    at: FIXED_NOW().toISOString(),
    author: { kind: 'human' },
    body: '读取项目',
  });
  await admit(runtime, { channelId: dm.id, messageId: 'human-start', body: '读取项目' });
  const card = channels.readMessages(dm.id).find((message) => message.grantRequest === true);
  expect(card).toMatchObject({
    author: { kind: 'bot', slug: 'ada' },
    body: '需要项目文件夹以完成这项工作',
  });
  expect(runtime.listAssignments('ada')).toHaveLength(0);
  await grants.create('ada', 'project');
  await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
    id: 'human-approved',
    at: FIXED_NOW().toISOString(),
    author: { kind: 'human' },
    body: '已授权工作区「Project」，请继续处理之前的事项。',
    replyTo: card!.id,
  });
  await admit(runtime, {
    channelId: dm.id,
    messageId: 'human-approved',
    body: '已授权工作区「Project」，请继续处理之前的事项。',
  });
  await runtime.whenIdle();
  expect(runtime.listAssignments('ada')).toHaveLength(1);
  expect(runtime.listAssignments('ada')[0]?.permission?.grantId).toBe('human-grant');
  expect(ownershipRows(owner).filter((row) => row.root_role === 'orchestrator')).toHaveLength(1);
  await runtime.close();
  owner.close();
});
