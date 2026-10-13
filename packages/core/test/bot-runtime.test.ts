import { createTestRegistry } from './registry-fixture.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createAttachmentStore } from '../src/attachments/store.js';

import { createChannelStore } from '../src/channels/store.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import {
  createBotRuntime,
  type AssignmentAgentRun,
  type AssignmentRequestDelivery,
  type BotAgentAdapter,
  type BotRuntime,
  type HandleDmMessageInput,
  type OrchestratorAgentRun,
} from '../src/runtime/bot-runtime.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';
import { createWorkspaceGrantStore } from '../src/workspaces/grants.js';
import { createAssignmentAccessStore } from '../src/workspaces/assignment-access.js';

class DeterministicAgentAdapter implements BotAgentAdapter {
  readonly runs: Array<{ role: 'orchestrator' | 'assignment'; sessionId: string }> = [];

  async runOrchestrator(run: OrchestratorAgentRun): Promise<void> {
    this.runs.push({ role: 'orchestrator', sessionId: run.sessionId });
    if (run.message.trim().length > 0) {
      const outcome = run.assignments.create({
        grantId: TEST_GRANT_ID,
        purpose: `调查并回答：${run.message.split('\n').at(-1)}`,
      });
      if (outcome.outcome === 'created' || outcome.outcome === 'reused') return;
      throw new Error(outcome.message);
    }
    if (run.inbox.includes('reported')) {
      const latest = run.assignments
        .list()
        .map((assignment) => assignment.latestReport)
        .find((report) => report !== undefined);
      if (latest !== undefined) await run.channels.send({ body: `已完成：${latest.summary}` });
    }
  }

  async runAssignment(run: AssignmentAgentRun): Promise<void> {
    this.runs.push({ role: 'assignment', sessionId: run.sessionId });
    await run.report({ state: 'completed', summary: `Assignment 已处理「${run.purpose}」` });
  }

  requestAssignment(run: AssignmentAgentRun): AssignmentRequestDelivery {
    return { delivery: 'followup', accepted: Promise.resolve(), done: this.runAssignment(run) };
  }

  async stopAssignment(): Promise<void> {}

  async close(): Promise<void> {}
}

function admit(runtime: BotRuntime, input: HandleDmMessageInput): Promise<void> {
  const admission = runtime.admitDmMessage(input);
  if (!admission.admitted) throw new Error(`admission rejected: ${admission.reason}`);
  return admission.settled;
}

function ownershipRows(owner: OperationalDatabaseOwner): Array<{
  session_id: string;
  bot_slug: string;
  root_role: string;
  provenance: string;
  parent_session_id: string | null;
  cwd_reference: string | null;
}> {
  return attachOperationalModule(owner, 'bot-runtime-test').read((database) =>
    database
      .prepare(
        `SELECT session_id, bot_slug, root_role, provenance, parent_session_id, cwd_reference
           FROM session_ownership ORDER BY created_at, session_id`,
      )
      .all(),
  ) as Array<{
    session_id: string;
    bot_slug: string;
    root_role: string;
    provenance: string;
    parent_session_id: string | null;
    cwd_reference: string | null;
  }>;
}

function sourceEvents(owner: OperationalDatabaseOwner): Array<{
  source_event_id: string;
  handled_at: string | null;
  attempt_state: string;
  side_effect_started_at: string | null;
}> {
  return attachOperationalModule(owner, 'bot-runtime-test').read((database) =>
    database
      .prepare(
        `SELECT source_event_id, handled_at, attempt_state, side_effect_started_at
           FROM source_events
          WHERE source_kind = 'human-message' ORDER BY source_event_id`,
      )
      .all(),
  ) as Array<{
    source_event_id: string;
    handled_at: string | null;
    attempt_state: string;
    side_effect_started_at: string | null;
  }>;
}

it('publishes failed Orchestrator and Assignment turns into the owning DM', async () => {
  const home = createTempRoot('botharness-turn-failure-');
  const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
  const dm = channels.getOrCreateDm('ada', 'Ada');
  expect(dm).toBeDefined();
  const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  let attempts = 0;
  const agents: BotAgentAdapter = {
    async runOrchestrator(run) {
      attempts += 1;
      if (attempts === 1) throw new Error('QUOTA: Insufficient Balance (request_id: test-123)');
      if (attempts === 2) throw new Error('TRANSPORT: retry outage');
      const outcome = run.assignments.create({ grantId: TEST_GRANT_ID, purpose: '检查余额' });
      expect(outcome.outcome).toBe('created');
    },
    async runAssignment() {
      throw new Error('TRANSPORT: provider unavailable');
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
  });
  const input = { channelId: dm!.id, messageId: 'human-error', body: '检查余额' };
  await expect(admit(runtime, input)).rejects.toThrow(/Insufficient Balance/);
  let notices = channels
    .readMessages(dm!.id)
    .filter((message) => message.sessionFailure !== undefined);
  expect(notices).toHaveLength(1);
  expect(notices[0]?.sessionFailure).toMatchObject({
    role: 'orchestrator',
    code: 'QUOTA',
    detail: 'Insufficient Balance (request_id: test-123)',
  });
  await expect(admit(runtime, input)).rejects.toThrow(/retry outage/);
  notices = channels.readMessages(dm!.id).filter((message) => message.sessionFailure !== undefined);
  expect(notices).toHaveLength(2);
  expect(
    notices.find((message) => message.sessionFailure?.detail === 'retry outage'),
  ).toBeDefined();
  await expect(admit(runtime, input)).resolves.toBeUndefined();
  await runtime.whenIdle();
  notices = channels.readMessages(dm!.id).filter((message) => message.sessionFailure !== undefined);
  expect(notices).toHaveLength(3);
  expect(
    notices.find((message) => message.sessionFailure?.role === 'assignment')?.sessionFailure,
  ).toMatchObject({
    role: 'assignment',
    code: 'TRANSPORT',
    detail: 'provider unavailable',
    context: '检查余额',
  });
  expect(runtime.listAssignments('ada')[0]?.activity).toBe('error');
  await runtime.close();
  owner.close();
});

it('reads only a joined Channel image by durable message and attachment reference', async () => {
  const home = createTempRoot('botharness-bot-runtime-image-read-');
  const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const attachments = createAttachmentStore({ rootDir: join(home, 'attachments') });
  const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const image = await attachments.upload({
    data: (async function* () {
      yield bytes;
    })(),
    name: 'visual.png',
  });
  const channels = createChannelStore({
    rootDir: join(home, 'channels'),
    attachments,
    now: FIXED_NOW,
  });
  const joined = channels.createGroup({ name: 'Joined', members: ['ada'] });
  const privateChannel = channels.createGroup({ name: 'Private', members: [] });
  const dm = channels.getOrCreateDm('ada', 'Ada')!;
  await channels.appendMessage(joined.id, {
    id: 'image-message',
    at: FIXED_NOW().toISOString(),
    author: { kind: 'human' },
    body: 'What is in this image?',
    attachments: [image],
  });
  for (let index = 0; index < 201; index += 1) {
    await channels.appendMessage(joined.id, {
      id: `newer-${index}`,
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: `Newer message ${index}`,
    });
  }
  await channels.appendMessage(privateChannel.id, {
    id: 'private-image',
    at: FIXED_NOW().toISOString(),
    author: { kind: 'human' },
    body: '',
    attachments: [image],
  });
  await channels.appendMessage(dm.id, {
    id: 'trigger-image-read',
    at: FIXED_NOW().toISOString(),
    author: { kind: 'human' },
    body: 'Inspect the group image',
  });
  const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  let inspected = false;
  const runtime = createBotRuntime({
    database: owner,
    grants: createTestWorkspaceGrants(owner, home),
    registry,
    channels,
    attachments,
    agents: {
      runOrchestrator: async (run) => {
        const access = run.channels.readAttachment;
        expect(access).toBeDefined();
        const result = await access!({
          channelId: joined.id,
          messageId: 'image-message',
          attachmentId: image.fileId!,
          maxBytes: 1024,
        });
        expect(result.ref).toEqual(image);
        expect(result.data).toEqual(bytes);
        const path = attachments.fileTarget(image.fileId!).path;
        const edited = Uint8Array.from([...bytes, 4, 5]);
        writeFileSync(path, edited);
        const current = await access!({
          channelId: joined.id,
          messageId: 'image-message',
          attachmentId: image.fileId!,
          maxBytes: 1024,
        });
        expect(current.data).toEqual(edited);
        expect(current.ref.size).toBe(edited.length);
        await expect(
          access!({
            channelId: joined.id,
            messageId: 'image-message',
            attachmentId: image.fileId!,
            maxBytes: bytes.length,
          }),
        ).rejects.toThrow('read limit');
        await expect(
          access!({
            channelId: joined.id,
            messageId: 'image-message',
            attachmentId: image.fileId!,
            hash: 'sha256:' + 'a'.repeat(64),
            maxBytes: 1024,
          }),
        ).rejects.toThrow('Exactly one');
        writeFileSync(path, 'now plain text');
        await expect(
          access!({
            channelId: joined.id,
            messageId: 'image-message',
            attachmentId: image.fileId!,
            maxBytes: 1024,
          }),
        ).rejects.toThrow('supported Channel image');
        await expect(
          access!({
            channelId: privateChannel.id,
            messageId: 'private-image',
            attachmentId: image.fileId!,
            maxBytes: 1024,
          }),
        ).rejects.toThrow(/not a member/);
        await expect(
          access!({
            channelId: joined.id,
            messageId: 'missing',
            attachmentId: image.fileId!,
            maxBytes: 1024,
          }),
        ).rejects.toThrow(/not found/);
        inspected = true;
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
    createEventId: () => 'source-image-read',
    createSessionId: () => 'orchestrator-ada',
  });
  await admit(runtime, {
    channelId: dm.id,
    messageId: 'trigger-image-read',
    body: 'Inspect the group image',
  });
  expect(inspected).toBe(true);
  await runtime.close();
  owner.close();
});
describe('Bot runtime tracer bullet', () => {
  it('sends a staged attachment through the trusted Orchestrator Channel access', async () => {
    const home = createTempRoot('botharness-bot-runtime-attachment-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const attachments = createAttachmentStore({ rootDir: join(home, 'attachments') });
    const ref = await attachments.upload({
      data: (async function* () {
        yield new TextEncoder().encode('bot artifact');
      })(),
      name: 'result.txt',
    });
    const channels = createChannelStore({
      rootDir: join(home, 'channels'),
      attachments,
      now: FIXED_NOW,
    });
    const dm = channels.getOrCreateDm('ada', 'Ada')!;
    await channels.appendMessage(dm.id, {
      id: 'human-attachment-request',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: 'Send the artifact',
    });
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const runtime = createBotRuntime({
      database: owner,
      grants: createTestWorkspaceGrants(owner, home),
      registry,
      channels,
      agents: {
        runOrchestrator: async (run) => {
          await run.channels.send({ body: '', attachments: [ref] });
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
      createEventId: () => 'source-attachment',
      createMessageId: () => 'bot-attachment',
      createSessionId: () => 'orchestrator-ada',
    });
    await admit(runtime, {
      channelId: dm.id,
      messageId: 'human-attachment-request',
      body: 'Send the artifact',
    });
    expect(channels.readMessages(dm.id)[0]).toMatchObject({
      id: 'bot-attachment',
      author: { kind: 'bot', slug: 'ada' },
      attachments: [ref],
    });
    await runtime.close();
    owner.close();
  });

  it('keeps an invalid Bot reply retryable because no Channel side effect started', async () => {
    const home = createTempRoot('botharness-bot-runtime-invalid-reply-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const dm = channels.getOrCreateDm('ada', 'Ada');
    expect(dm).toBeDefined();
    await channels.appendMessage(dm!.id, {
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
    const dm = channels.getOrCreateDm('ada', 'Ada');
    expect(dm).toBeDefined();
    await channels.appendMessage(dm!.id, {
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
            grantId: TEST_GRANT_ID,
            purpose: `调查并回答：${run.message.split('\n').at(-1)}`,
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
        await run.report({ state: 'completed', summary: `Assignment 已处理「${run.purpose}」` });
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
    const dm = channels.getOrCreateDm('ada', 'Ada');
    expect(dm).toBeDefined();
    await channels.appendMessage(dm!.id, {
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
              grantId: TEST_GRANT_ID,
              purpose: '核对副作用',
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

  it('rejects Channel read, search, and send outside the trusted PersonaBot membership', async () => {
    const home = createTempRoot('botharness-bot-runtime-membership-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    expect(registry.create({ slug: 'bob', displayName: 'Bob' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const adaDm = channels.getOrCreateDm('ada', 'Ada');
    const bobDm = channels.getOrCreateDm('bob', 'Bob');
    expect(adaDm).toBeDefined();
    expect(bobDm).toBeDefined();
    await channels.appendMessage(adaDm!.id, {
      id: 'human-1',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: '尝试越权',
    });
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const runtime = createBotRuntime({
      database: owner,
      grants: createTestWorkspaceGrants(owner, home),
      registry,
      channels,
      agents: {
        runOrchestrator: async (run) => {
          expect(() => run.channels.read({ channelId: bobDm!.id })).toThrow(/not a member/);
          expect(() => run.channels.query({ channelId: bobDm!.id, text: '越权' })).toThrow(
            /not a member/,
          );
          await run.channels.send({ channelId: bobDm!.id, body: '冒充 Bob' });
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

    await expect(
      admit(runtime, {
        channelId: adaDm!.id,
        messageId: 'human-1',
        body: '尝试越权',
      }),
    ).rejects.toThrow(/not a member/);
    expect(channels.readMessages(bobDm!.id)).toEqual([]);

    await runtime.close();
    owner.close();
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
    const dm = channels.getOrCreateDm('ada', 'Ada')!;
    await channels.appendMessage(dm.id, {
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
              purpose: 'Inspect',
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
          if (run.purpose === 'Delivery failure') throw new Error('Delivery unavailable');
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

  it('runs one DM through an Orchestrator and durable Assignment report, then restores the read model', async () => {
    const home = createTempRoot('botharness-bot-runtime-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const dm = channels.getOrCreateDm('ada', 'Ada');
    expect(dm).toBeDefined();
    await channels.appendMessage(dm!.id, {
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
        purpose: '调查并回答：请调查发布状态',
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

  it('freezes each new Assignment access mode while later Bot preset changes leave old Sessions intact', async () => {
    const home = createTempRoot('botharness-bot-runtime-access-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const dm = channels.getOrCreateDm('ada', 'Ada')!;
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
    await channels.appendMessage(dm.id, {
      id: 'human-danger',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: 'first',
    });
    await admit(runtime, { channelId: dm.id, messageId: 'human-danger', body: 'first' });
    await runtime.whenIdle();
    expect(runtime.getAssignment('ada', 'assignment-danger')?.permission).toMatchObject({
      mode: 'danger-full-access',
      approval: 'never',
      presetRevision: 1,
    });
    access.set('ada', 'workspace-write');
    await channels.appendMessage(dm.id, {
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
    const adaDm = channels.getOrCreateDm('ada', 'Ada');
    const bobDm = channels.getOrCreateDm('bob', 'Bob');
    for (const [id, channelId] of [
      ['human-ada', adaDm!.id],
      ['human-bob', bobDm!.id],
    ] as const) {
      await channels.appendMessage(channelId, {
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
    const dm = channels.getOrCreateDm('ada', 'Ada');
    await channels.appendMessage(dm!.id, {
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

  it('keeps an attempt running while its side effect is in flight', async () => {
    const home = createTempRoot('botharness-bot-runtime-inflight-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const dm = channels.getOrCreateDm('ada', 'Ada');
    await channels.appendMessage(dm!.id, {
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

    const admission = runtime.admitDmMessage({
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
    const dm = channels.getOrCreateDm('ada', 'Ada');
    expect(dm).toBeDefined();
    for (const id of ['human-1', 'human-2']) {
      await channels.appendMessage(dm!.id, {
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

    const first = runtime.admitDmMessage({
      channelId: dm!.id,
      messageId: 'human-1',
      body: 'human-1',
    });
    const second = runtime.admitDmMessage({
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
    const dm = channels.getOrCreateDm('ada', 'Ada');
    const group = channels.createGroup({ name: 'Team', members: [] });
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
      runtime.admitDmMessage({ channelId: 'dm-missing', messageId: 'm-1', body: 'hello' }),
    ).toEqual({ admitted: false, reason: 'unknown-channel' });
    expect(
      runtime.admitDmMessage({ channelId: group.id, messageId: 'm-2', body: 'hello' }),
    ).toEqual({ admitted: false, reason: 'not-dm' });
    expect(runtime.admitDmMessage({ channelId: dm!.id, messageId: 'm-3', body: '   ' })).toEqual({
      admitted: false,
      reason: 'blank-body',
    });

    registry.setPaused('ada', true);
    expect(runtime.admitDmMessage({ channelId: dm!.id, messageId: 'm-4', body: 'hello' })).toEqual({
      admitted: false,
      reason: 'archived-bot',
    });
    registry.setPaused('ada', false);

    await runtime.close();
    expect(runtime.admitDmMessage({ channelId: dm!.id, messageId: 'm-5', body: 'hello' })).toEqual({
      admitted: false,
      reason: 'runtime-closed',
    });
    expect(runs).toEqual([]);
    owner.close();
  });
});

it('requests a folder in the DM and resumes the same Orchestrator after Human authorization', async () => {
  const home = createTempRoot('botharness-grant-request-');
  const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
  const dm = channels.getOrCreateDm('ada', 'Ada')!;
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
          run.assignments.create({ purpose: '读取项目', grantId: active.id, key: 'project-read' });
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
  await channels.appendMessage(dm.id, {
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
  await channels.appendMessage(dm.id, {
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

it('starts a new Orchestrator Session when DSH archived the current one', async () => {
  const home = createTempRoot('botharness-archived-orchestrator-');
  const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
  const dm = channels.getOrCreateDm('ada', 'Ada')!;
  const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  const archived = new Set<string>();
  const runs: Array<{ sessionId: string; resume: boolean }> = [];
  let nextSession = 0;
  const runtime = createBotRuntime({
    database: owner,
    registry,
    channels,
    sessionArchived: (sessionId) => archived.has(sessionId),
    agents: {
      runOrchestrator: async (run) => {
        runs.push({ sessionId: run.sessionId, resume: run.resume });
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
    createSessionId: () => `session-${++nextSession}`,
    createEventId: () => `event-${++nextSession}`,
    createMessageId: () => `message-${++nextSession}`,
  });
  const say = async (id: string, body: string): Promise<void> => {
    await channels.appendMessage(dm.id, {
      id,
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body,
    });
    await admit(runtime, { channelId: dm.id, messageId: id, body });
    await runtime.whenIdle();
  };

  await say('human-1', 'hello');
  await say('human-2', 'still there?');
  const first = runs[0]!.sessionId;
  expect(runs.map((run) => run.sessionId)).toEqual([first, first]);
  expect(runs[1]!.resume).toBe(true);
  expect(runtime.currentOrchestratorSessionId?.('ada')).toBe(first);

  archived.add(first);
  expect(runtime.currentOrchestratorSessionId?.('ada')).toBeUndefined();
  await say('human-3', 'hello again');
  const replacement = runs[2]!;
  expect(replacement.sessionId).not.toBe(first);
  expect(replacement.resume).toBe(false);
  expect(ownershipRows(owner).filter((row) => row.root_role === 'orchestrator')).toHaveLength(2);

  await say('human-4', 'and again');
  expect(runs[3]).toEqual({ sessionId: replacement.sessionId, resume: true });
  expect(runtime.currentOrchestratorSessionId?.('ada')).toBe(replacement.sessionId);
  await runtime.close();
  owner.close();
});
