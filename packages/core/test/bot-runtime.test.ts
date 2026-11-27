import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createChannelStore } from '../src/channels/store.js';
import { mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createBotRuntime } from '../src/core.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import { admit, DeterministicAgentAdapter, ownershipRows } from './support/bot-runtime.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';

describe('Bot runtime tracer bullet', () => {
  it('runs one DM through an Orchestrator and durable Assignment report, then restores the read model', async () => {
    const home = createTempRoot('botharness-bot-runtime-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    expect(dm).toBeDefined();
    await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm!.id, {
      id: 'human-1',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: '请调查发布状态',
    });

    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const agents = new DeterministicAgentAdapter();
    const runtime = createBotRuntime({
      database: owner,
      grants: createTestWorkspaceGrants(owner, home),
      registry,
      channels,
      agents,
      now: FIXED_NOW,
      createSessionId: (() => {
        const ids = ['orchestrator-ada', 'assignment-1'];
        return () => ids.shift() ?? 'unexpected-session';
      })(),
    });

    await admit(runtime, {
      channelId: dm!.id,
      messageId: 'human-1',
      body: '请调查发布状态',
    });
    await runtime.whenIdle();

    const messages = channels.readMessages(dm!.id);
    expect(messages[0]).toMatchObject({
      author: { kind: 'bot', slug: 'ada' },
      body: '已完成：Assignment 已处理「调查并回答：请调查发布状态」',
    });
    expect(messages.filter((message) => message.author.kind === 'bot')).toHaveLength(1);
    expect(agents.runs).toEqual([
      { role: 'orchestrator', sessionId: 'orchestrator-ada' },
      { role: 'assignment', sessionId: 'assignment-1' },
      { role: 'orchestrator', sessionId: 'orchestrator-ada' },
    ]);
    expect(runtime.listAssignments('ada')).toEqual([
      expect.objectContaining({
        sessionId: 'assignment-1',
        description: '调查并回答：请调查发布状态',
        activity: 'idle',
        permission: {
          grantId: TEST_GRANT_ID,
          workspaceId: 'test-workspace',
          primaryCwd: home,
          mode: 'workspace-write',
          approval: 'ask',
          presetRevision: 0,
        },
        latestReport: expect.objectContaining({
          state: 'completed',
          summary: 'Assignment 已处理「调查并回答：请调查发布状态」',
        }),
      }),
    ]);

    expect(runtime.latestAssignmentActivity?.().get('ada')).toBe(
      Date.parse(runtime.listAssignments('ada')[0]!.latestReport!.at),
    );

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
      agents: new DeterministicAgentAdapter(),
      now: FIXED_NOW,
    });
    expect(reopened.listAssignments('ada')).toEqual([
      expect.objectContaining({
        sessionId: 'assignment-1',
        activity: 'idle',
        permission: {
          grantId: TEST_GRANT_ID,
          workspaceId: 'test-workspace',
          primaryCwd: home,
          mode: 'workspace-write',
          approval: 'ask',
          presetRevision: 0,
        },
        latestReport: expect.objectContaining({
          state: 'completed',
          summary: 'Assignment 已处理「调查并回答：请调查发布状态」',
        }),
      }),
    ]);
    await reopened.close();
    reopenedOwner.close();
  });

  it('owns Sessions explicitly and records the run cwd as evidence, not identity', async () => {
    const home = createTempRoot('botharness-bot-runtime-ownership-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(
      registry.create({ slug: 'ada', displayName: 'Ada', workspaces: ['/srv/shared'] }).ok,
    ).toBe(true);
    expect(
      registry.create({ slug: 'bob', displayName: 'Bob', workspaces: ['/srv/shared'] }).ok,
    ).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const adaDm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    const bobDm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'bob', 'Bob');
    for (const [id, channelId] of [
      ['human-ada', adaDm!.id],
      ['human-bob', bobDm!.id],
    ] as const) {
      await channels.appendMessage(OWNER_HUMAN_CONTEXT, channelId, {
        id,
        at: FIXED_NOW().toISOString(),
        author: { kind: 'human' },
        body: id,
      });
    }
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const sessionIds = ['orchestrator-ada', 'orchestrator-bob'];
    const runtime = createBotRuntime({
      database: owner,
      grants: createTestWorkspaceGrants(owner, home),
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
      createSessionId: () => sessionIds.shift() ?? 'unexpected-session',
    });

    await admit(runtime, { channelId: adaDm!.id, messageId: 'human-ada', body: 'hi' });
    await admit(runtime, { channelId: bobDm!.id, messageId: 'human-bob', body: 'hi' });

    expect(ownershipRows(owner)).toEqual([
      {
        session_id: 'orchestrator-ada',
        bot_slug: 'ada',
        root_role: 'orchestrator',
        provenance: 'created',
        parent_session_id: null,
        cwd_reference: '/srv/shared',
      },
      {
        session_id: 'orchestrator-bob',
        bot_slug: 'bob',
        root_role: 'orchestrator',
        provenance: 'created',
        parent_session_id: null,
        cwd_reference: '/srv/shared',
      },
    ]);
    expect(runtime.getAssignment('ada', 'orchestrator-bob')).toBeUndefined();

    await runtime.close();
    owner.close();
  });

  it('records the default runtime workspace as the cwd reference when no workspace is configured', async () => {
    const home = createTempRoot('botharness-bot-runtime-cwd-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm!.id, {
      id: 'human-1',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: 'hi',
    });
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const runtime = createBotRuntime({
      database: owner,
      grants: createTestWorkspaceGrants(owner, home),
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
      workspaceRoot: '/srv/runtime-workspaces',
      now: FIXED_NOW,
      createSessionId: () => 'orchestrator-ada',
    });

    await admit(runtime, { channelId: dm!.id, messageId: 'human-1', body: 'hi' });

    expect(ownershipRows(owner)).toEqual([
      expect.objectContaining({
        session_id: 'orchestrator-ada',
        cwd_reference: join('/srv/runtime-workspaces', 'ada'),
      }),
    ]);

    await runtime.close();
    owner.close();
  });
});
