import { join } from 'node:path';

import { expect, it } from 'vitest';

import { createChannelStore } from '../src/channels/store.js';
import { mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createBotRuntime } from '../src/core.js';
import { type BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { OrchestratorWorkingDirectoryError } from '../src/runtime/orchestrator-working-directory.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import { admit, ownershipRows } from './support/bot-runtime.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';

it('publishes failed Orchestrator and Assignment turns into the owning DM', async () => {
  const home = createTempRoot('botharness-turn-failure-');
  const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
  const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
  expect(dm).toBeDefined();
  const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  let attempts = 0;
  const agents: BotAgentAdapter = {
    async runOrchestrator(run) {
      attempts += 1;
      if (attempts === 1) throw new Error('QUOTA: Insufficient Balance (request_id: test-123)');
      if (attempts === 2) throw new Error('TRANSPORT: retry outage');
      const outcome = run.assignments.create({
        title: '检查余额',
        grantId: TEST_GRANT_ID,
        description: '检查余额',
      });
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

it('tells the Human plainly when a turn fails on context overflow', async () => {
  const home = createTempRoot('botharness-turn-overflow-');
  const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
  const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
  const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  const agents: BotAgentAdapter = {
    async runOrchestrator() {
      throw new Error('CONTEXT_WINDOW_EXCEEDED: Context window exceeded after compaction retry');
    },
    async runAssignment() {},
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
  await expect(
    admit(runtime, { channelId: dm!.id, messageId: 'human-overflow', body: '读完整个日志' }),
  ).rejects.toThrow(/CONTEXT_WINDOW_EXCEEDED/);
  const notices = channels
    .readMessages(dm!.id)
    .filter((message) => message.sessionFailure !== undefined);
  expect(notices).toHaveLength(1);
  expect(notices[0]?.sessionFailure).toMatchObject({
    role: 'orchestrator',
    code: 'CONTEXT_WINDOW_EXCEEDED',
    detail: 'Context window exceeded after compaction retry',
    requestMessageId: 'human-overflow',
  });
  expect(notices[0]?.body).toBe(
    "Session failed: CONTEXT_WINDOW_EXCEEDED: This conversation's context is full and automatic compaction could not recover it. Retry with a smaller request, for example ask for one part of a large file or command output instead of all of it.",
  );
  await runtime.close();
  owner.close();
});

async function archivedMidTurn(sendFirst: boolean) {
  const home = createTempRoot('botharness-archived-mid-turn-');
  const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
  const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
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
        if (runs.length === 1) {
          if (sendFirst) await run.channels.send({ body: 'partial' });
          archived.add(run.sessionId);
          throw new Error('Session is archived');
        }
        await run.channels.send({ body: 'answered' });
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
  await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
    id: 'human-1',
    at: FIXED_NOW().toISOString(),
    author: { kind: 'human' },
    body: 'hello',
  });
  await admit(runtime, { channelId: dm.id, messageId: 'human-1', body: 'hello' }).catch(
    () => undefined,
  );
  await runtime.whenIdle();
  const bodies = channels.readMessages(dm.id).map((message) => message.body);
  await runtime.close();
  owner.close();
  return { runs, bodies };
}

it('replays a DM on a new Orchestrator Session when DSH archives the old one mid-turn', async () => {
  const { runs, bodies } = await archivedMidTurn(false);
  expect(runs).toHaveLength(2);
  expect(runs[1]!.sessionId).not.toBe(runs[0]!.sessionId);
  expect(runs[1]!.resume).toBe(false);
  expect(bodies).toContain('answered');
});

it('does not replay a DM whose archived turn already acted', async () => {
  const { runs, bodies } = await archivedMidTurn(true);
  expect(runs).toHaveLength(1);
  expect(bodies).toContain('partial');
  expect(bodies).not.toContain('answered');
});

async function misplacedOrchestrator(archiveRefused: boolean) {
  const home = createTempRoot('botharness-misplaced-orchestrator-');
  const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
  const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  const archived = new Set<string>();
  const runs: Array<{ sessionId: string; resume: boolean }> = [];
  const warnings: string[] = [];
  let nextSession = 0;
  let nextId = 0;
  const runtime = createBotRuntime({
    database: owner,
    registry,
    channels,
    sessionArchived: (sessionId) => archived.has(sessionId),
    sessionArchive: () => ({
      archiveSession: async (sessionId) => {
        if (archiveRefused)
          throw Object.assign(new Error('active'), { name: 'WorkspaceActiveSessionError' });
        archived.add(sessionId);
      },
      unarchiveSession: async (sessionId) => {
        archived.delete(sessionId);
      },
    }),
    agents: {
      runOrchestrator: async (run) => {
        runs.push({ sessionId: run.sessionId, resume: run.resume });
        if (run.sessionId === 'session-1' && run.resume)
          throw new OrchestratorWorkingDirectoryError(
            run.sessionId,
            '/old-home/bots/ada/memory',
            '/new-home/bots/ada/memory',
          );
        await run.channels.send({ body: 'answered ' + runs.length });
      },
      runAssignment: async () => undefined,
      requestAssignment: () => ({
        delivery: 'followup' as const,
        accepted: Promise.resolve(),
        done: Promise.resolve(),
      }),
      close: async () => undefined,
    },
    warn: (message) => warnings.push(message),
    now: FIXED_NOW,
    createSessionId: () => `session-${++nextSession}`,
    createEventId: () => `event-${++nextId}`,
    createMessageId: () => `message-${++nextId}`,
  });
  for (const [id, body] of [
    ['human-1', 'hello'],
    ['human-2', 'still there?'],
  ] as const) {
    await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
      id,
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body,
    });
    await admit(runtime, { channelId: dm.id, messageId: id, body }).catch(() => undefined);
    await runtime.whenIdle();
  }
  const bodies = channels.readMessages(dm.id).map((message) => message.body);
  const current = runtime.currentOrchestratorSessionId?.('ada');
  await runtime.close();
  owner.close();
  return { runs, bodies, archived, current, warnings };
}

it('moves the Bot to a new Orchestrator Session when its Session runs outside the Memory directory', async () => {
  const { runs, bodies, archived, current, warnings } = await misplacedOrchestrator(false);
  expect(runs.map((run) => run.sessionId)).toEqual(['session-1', 'session-1', current]);
  expect(current).not.toBe('session-1');
  expect(runs[2]!.resume).toBe(false);
  expect([...archived]).toEqual(['session-1']);
  expect(bodies).toContain('answered 3');
  expect(warnings.some((line) => line.includes('orchestrator-working-directory-replaced'))).toBe(
    true,
  );
});

it('keeps a misplaced Orchestrator Session when DSH refuses to archive it', async () => {
  const { runs, bodies, archived, current } = await misplacedOrchestrator(true);
  expect(runs.map((run) => run.sessionId)).toEqual(['session-1', 'session-1']);
  expect(current).toBe('session-1');
  expect(archived.size).toBe(0);
  expect(bodies).not.toContain('answered 3');
});

it('starts a new Orchestrator Session when DSH archived the current one', async () => {
  const home = createTempRoot('botharness-archived-orchestrator-');
  const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
  const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  const archived = new Set<string>();
  const runs: Array<{ sessionId: string; resume: boolean }> = [];
  const released: string[] = [];
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
      releaseSession: async (sessionId) => {
        released.push(sessionId);
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
    await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
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
  expect(released).toEqual([]);

  archived.add(first);
  expect(runtime.currentOrchestratorSessionId?.('ada')).toBeUndefined();
  await say('human-3', 'hello again');
  const replacement = runs[2]!;
  expect(replacement.sessionId).not.toBe(first);
  expect(replacement.resume).toBe(false);
  expect(ownershipRows(owner).filter((row) => row.root_role === 'orchestrator')).toHaveLength(2);
  expect(released).toContain(first);
  expect(released).not.toContain(replacement.sessionId);

  await say('human-4', 'and again');
  expect(runs[3]).toEqual({ sessionId: replacement.sessionId, resume: true });
  expect(runtime.currentOrchestratorSessionId?.('ada')).toBe(replacement.sessionId);
  await runtime.close();
  owner.close();
});
