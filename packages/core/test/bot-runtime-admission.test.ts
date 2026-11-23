import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createChannelStore } from '../src/channels/store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createBotRuntime, type BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import { admit, sourceEvents } from './support/bot-runtime.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';

describe('Bot runtime tracer bullet', () => {
  it('keeps an invalid Bot reply retryable because no Channel side effect started', async () => {
    const home = createTempRoot('botharness-bot-runtime-invalid-reply-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    expect(dm).toBeDefined();
    await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm!.id, {
      id: 'human-invalid-reply',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: 'Please reply',
    });
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const runtime = createBotRuntime({
      database: owner,
      grants: createTestWorkspaceGrants(owner, home),
      registry,
      channels,
      agents: {
        runOrchestrator: async (run) => {
          await run.channels.send({ body: 'bad reply', replyTo: 'missing' });
        },
        runAssignment: async () => undefined,
        requestAssignment: () => ({
          delivery: 'followup' as const,
          accepted: Promise.resolve(),
          done: Promise.resolve(),
        }),
        close: async () => undefined,
      },
      now: FIXED_NOW,
      createEventId: () => 'source-invalid-reply',
      createMessageId: () => 'bot-invalid-reply',
      createSessionId: () => 'orchestrator-ada',
    });

    await expect(
      admit(runtime, {
        channelId: dm!.id,
        messageId: 'human-invalid-reply',
        body: 'Please reply',
      }),
    ).rejects.toThrow('Reply target must exist in this Channel');
    expect(sourceEvents(owner)).toEqual([
      {
        source_event_id: 'source-invalid-reply',
        handled_at: null,
        attempt_state: 'retryable',
        side_effect_started_at: null,
      },
    ]);
    expect(
      channels
        .readMessages(dm!.id)
        .filter((message) => message.author.kind === 'human')
        .map((message) => message.id),
    ).toEqual(['human-invalid-reply']);
    expect(
      channels.readMessages(dm!.id).filter((message) => message.sessionFailure !== undefined),
    ).toHaveLength(1);
    await runtime.close();
    owner.close();
  });

  it('keeps a failed Source Event pending, then retries and acknowledges it exactly once', async () => {
    const home = createTempRoot('botharness-bot-runtime-retry-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    expect(dm).toBeDefined();
    await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm!.id, {
      id: 'human-retry',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: '请重试发布状态',
    });
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    let orchestratorAttempts = 0;
    let assignmentRuns = 0;
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        orchestratorAttempts += 1;
        if (run.message.trim().length > 0) {
          if (orchestratorAttempts === 1) throw new Error('TRANSPORT: DeepSeek API request failed');
          const outcome = run.assignments.create({
            title: 'Assignment',
            grantId: TEST_GRANT_ID,
            description: `调查并回答：${run.message.split('\n').at(-1)}`,
          });
          if (outcome.outcome === 'created' || outcome.outcome === 'reused') return;
          throw new Error(outcome.message);
        }
        const latest = run.assignments
          .list()
          .map((assignment) => assignment.latestReport)
          .find((report) => report !== undefined);
        if (latest !== undefined) await run.channels.send({ body: `已完成：${latest.summary}` });
      },
      async runAssignment(run) {
        assignmentRuns += 1;
        await run.report({ state: 'completed', summary: `Assignment 已处理「${run.text}」` });
      },
      requestAssignment(run) {
        return { delivery: 'followup', accepted: Promise.resolve(), done: this.runAssignment(run) };
      },
      async close() {},
    };
    const runtime = createBotRuntime({
      database: owner,
      grants: createTestWorkspaceGrants(owner, home),
      registry,
      channels,
      agents,
      now: FIXED_NOW,
      createEventId: (() => {
        const ids = ['source-retry', 'report-retry'];
        return () => ids.shift() ?? 'unexpected-event';
      })(),
      createMessageId: () => 'bot-retry',
      createSessionId: (() => {
        const ids = ['orchestrator-ada', 'assignment-retry'];
        return () => ids.shift() ?? 'unexpected-session';
      })(),
    });
    const input = {
      channelId: dm!.id,
      messageId: 'human-retry',
      body: '请重试发布状态',
    };

    await expect(admit(runtime, input)).rejects.toThrow(/TRANSPORT/);
    expect(sourceEvents(owner)).toEqual([
      {
        source_event_id: 'source-retry',
        handled_at: null,
        attempt_state: 'retryable',
        side_effect_started_at: null,
      },
    ]);
    expect(assignmentRuns).toBe(0);
    expect(
      channels.readMessages(dm!.id).filter((message) => message.sessionFailure !== undefined),
    ).toHaveLength(1);

    await expect(admit(runtime, input)).resolves.toBeUndefined();
    await runtime.whenIdle();
    expect(sourceEvents(owner)).toEqual([
      {
        source_event_id: 'source-retry',
        handled_at: FIXED_NOW().toISOString(),
        attempt_state: 'handled',

        side_effect_started_at: expect.any(String),
      },
    ]);

    expect(orchestratorAttempts).toBe(3);
    expect(assignmentRuns).toBe(1);
    expect(
      channels.readMessages(dm!.id).filter((message) => message.id === 'bot-retry'),
    ).toHaveLength(1);

    await expect(admit(runtime, input)).resolves.toBeUndefined();
    await runtime.whenIdle();
    expect(sourceEvents(owner)).toHaveLength(1);
    expect(orchestratorAttempts).toBe(3);
    expect(assignmentRuns).toBe(1);
    expect(
      channels.readMessages(dm!.id).filter((message) => message.id === 'bot-retry'),
    ).toHaveLength(1);

    await runtime.close();
    owner.close();
  });

  it('keeps a partially executed Source Event pending for reconciliation instead of replaying effects', async () => {
    const home = createTempRoot('botharness-bot-runtime-repair-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    expect(dm).toBeDefined();
    await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm!.id, {
      id: 'human-repair',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: '请核对副作用',
    });
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    let orchestratorAttempts = 0;
    let assignmentRuns = 0;
    const runtime = createBotRuntime({
      database: owner,
      grants: createTestWorkspaceGrants(owner, home),
      registry,
      channels,
      agents: {
        async runOrchestrator(run) {
          orchestratorAttempts += 1;
          if (run.message.trim().length > 0) {
            const outcome = run.assignments.create({
              title: 'Assignment',
              grantId: TEST_GRANT_ID,
              description: '核对副作用',
            });
            if (outcome.outcome === 'capacity' || outcome.outcome === 'key-busy') {
              throw new Error(outcome.message);
            }
            await run.channels.send({ body: '副作用已开始' });
            throw new Error('TRANSPORT after side effects');
          }
          const latest = run.assignments
            .list()
            .map((assignment) => assignment.latestReport)
            .find((report) => report !== undefined);
          if (latest !== undefined) await run.channels.send({ body: latest.summary });
        },
        async runAssignment(run) {
          assignmentRuns += 1;
          await run.report({ state: 'completed', summary: '副作用已完成' });
        },
        requestAssignment(run) {
          return {
            delivery: 'followup',
            accepted: Promise.resolve(),
            done: this.runAssignment(run),
          };
        },
        async close() {},
      },
      now: FIXED_NOW,
      createEventId: (() => {
        const ids = ['source-repair', 'report-repair'];
        return () => ids.shift() ?? 'unexpected-event';
      })(),
      createMessageId: () => 'bot-repair',
      createSessionId: (() => {
        const ids = ['orchestrator-ada', 'assignment-repair'];
        return () => ids.shift() ?? 'unexpected-session';
      })(),
    });
    const input = {
      channelId: dm!.id,
      messageId: 'human-repair',
      body: '请核对副作用',
    };

    await expect(admit(runtime, input)).rejects.toThrow(/TRANSPORT after side effects/);
    await runtime.whenIdle();
    await expect(admit(runtime, input)).rejects.toThrow(/requires reconciliation/);

    expect(sourceEvents(owner)).toEqual([
      {
        source_event_id: 'source-repair',
        handled_at: null,
        attempt_state: 'needs-repair',
        side_effect_started_at: expect.any(String),
      },
    ]);

    expect(orchestratorAttempts).toBe(2);
    expect(assignmentRuns).toBe(1);
    expect(runtime.listAssignments('ada')).toHaveLength(1);
    expect(
      channels
        .readMessages(dm!.id)
        .filter((message) => message.author.kind === 'bot' && message.sessionFailure === undefined)
        .map((message) => message.body)
        .sort(),
    ).toEqual(['副作用已完成', '副作用已开始'].sort());
    expect(
      channels.readMessages(dm!.id).filter((message) => message.sessionFailure !== undefined),
    ).toHaveLength(1);

    await runtime.close();
    owner.close();
  });

  it('keeps an attempt running while its side effect is in flight', async () => {
    const home = createTempRoot('botharness-bot-runtime-inflight-');
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
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runtime = createBotRuntime({
      database: owner,
      grants: createTestWorkspaceGrants(owner, home),
      registry,
      channels,
      agents: {
        async runOrchestrator(run) {
          await run.channels.send({ body: 'working' });
          await gate;
        },
        runAssignment: async () => undefined,
        requestAssignment: () => ({
          delivery: 'followup' as const,
          accepted: Promise.resolve(),
          done: Promise.resolve(),
        }),
        close: async () => undefined,
      },
      now: FIXED_NOW,
      createSessionId: () => 'orchestrator-ada',
    });

    const admission = runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
      channelId: dm!.id,
      messageId: 'human-1',
      body: 'hi',
    });
    if (!admission.admitted) throw new Error('expected admission');
    await new Promise((resolve) => setImmediate(resolve));

    expect(sourceEvents(owner)).toEqual([
      {
        source_event_id: expect.any(String),
        handled_at: null,
        attempt_state: 'running',
        side_effect_started_at: FIXED_NOW().toISOString(),
      },
    ]);

    release();
    await admission.settled;
    expect(sourceEvents(owner)).toEqual([
      {
        source_event_id: expect.any(String),
        handled_at: FIXED_NOW().toISOString(),
        attempt_state: 'handled',
        side_effect_started_at: FIXED_NOW().toISOString(),
      },
    ]);

    await runtime.close();
    owner.close();
  });

  it('recovers attempts a previous process left behind at boot', async () => {
    const home = createTempRoot('botharness-bot-runtime-recover-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    attachOperationalModule(owner, 'test-seed').transaction((database) => {
      database
        .prepare(
          `INSERT INTO source_events
             (source_event_id, source_kind, bot_slug, message_id, body, created_at,
              attempt_state, side_effect_started_at)
           VALUES ('with-effect', 'human-message', 'ada', 'm1', 'body', ?, 'running', ?),
                  ('without-effect', 'human-message', 'ada', 'm2', 'body', ?, 'running', NULL)`,
        )
        .run(FIXED_NOW().toISOString(), FIXED_NOW().toISOString(), FIXED_NOW().toISOString());
    });

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
    });

    expect(sourceEvents(owner)).toEqual([
      {
        source_event_id: 'with-effect',
        handled_at: null,
        attempt_state: 'needs-repair',
        side_effect_started_at: FIXED_NOW().toISOString(),
      },
      {
        source_event_id: 'without-effect',
        handled_at: null,
        attempt_state: 'retryable',
        side_effect_started_at: null,
      },
    ]);

    await runtime.close();
    owner.close();
  });

  it('admits DM messages without waiting and runs them serially in order', async () => {
    const home = createTempRoot('botharness-bot-runtime-queue-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    expect(dm).toBeDefined();
    for (const id of ['human-1', 'human-2']) {
      await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm!.id, {
        id,
        at: FIXED_NOW().toISOString(),
        author: { kind: 'human' },
        body: id,
      });
    }
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const started: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runtime = createBotRuntime({
      database: owner,
      grants: createTestWorkspaceGrants(owner, home),
      registry,
      channels,
      agents: {
        async runOrchestrator(run) {
          started.push(run.message.split('\n').at(-1)!);
          if (started.length === 1) await gate;
        },
        runAssignment: async () => undefined,
        requestAssignment: () => ({
          delivery: 'followup' as const,
          accepted: Promise.resolve(),
          done: Promise.resolve(),
        }),
        close: async () => undefined,
      },
      now: FIXED_NOW,
      createSessionId: () => 'orchestrator-ada',
    });

    const first = runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
      channelId: dm!.id,
      messageId: 'human-1',
      body: 'human-1',
    });
    const second = runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
      channelId: dm!.id,
      messageId: 'human-2',
      body: 'human-2',
    });

    expect(first.admitted).toBe(true);
    expect(second.admitted).toBe(true);
    expect(started).toEqual([]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(started).toEqual(['human-1']);

    release();
    if (!first.admitted || !second.admitted) throw new Error('expected both admissions');
    await Promise.all([first.settled, second.settled]);
    expect(started).toEqual(['human-1', 'human-2']);
    const events = sourceEvents(owner);
    expect(events).toHaveLength(2);
    expect(
      events.every((event) => event.attempt_state === 'handled' && event.handled_at !== null),
    ).toBe(true);

    await runtime.close();
    owner.close();
  });

  it('rejects admission for unknown, non-DM, archived, and blank targets without scheduling', async () => {
    const home = createTempRoot('botharness-bot-runtime-admission-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    const group = channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Team', members: [] });
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const runs: string[] = [];
    const runtime = createBotRuntime({
      database: owner,
      grants: createTestWorkspaceGrants(owner, home),
      registry,
      channels,
      agents: {
        async runOrchestrator(run) {
          runs.push(run.message);
        },
        runAssignment: async () => undefined,
        requestAssignment: () => ({
          delivery: 'followup' as const,
          accepted: Promise.resolve(),
          done: Promise.resolve(),
        }),
        close: async () => undefined,
      },
      now: FIXED_NOW,
      createSessionId: () => 'orchestrator-ada',
    });

    expect(
      runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: 'dm-missing',
        messageId: 'm-1',
        body: 'hello',
      }),
    ).toEqual({ admitted: false, reason: 'unknown-channel' });
    expect(
      runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: group.id,
        messageId: 'm-2',
        body: 'hello',
      }),
    ).toEqual({ admitted: false, reason: 'not-dm' });
    expect(
      runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: dm!.id,
        messageId: 'm-3',
        body: '   ',
      }),
    ).toEqual({
      admitted: false,
      reason: 'blank-body',
    });

    registry.setPaused('ada', true);
    expect(
      runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: dm!.id,
        messageId: 'm-4',
        body: 'hello',
      }),
    ).toEqual({
      admitted: false,
      reason: 'archived-bot',
    });
    registry.setPaused('ada', false);

    await runtime.close();
    expect(
      runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: dm!.id,
        messageId: 'm-5',
        body: 'hello',
      }),
    ).toEqual({
      admitted: false,
      reason: 'runtime-closed',
    });
    expect(runs).toEqual([]);
    owner.close();
  });
});
