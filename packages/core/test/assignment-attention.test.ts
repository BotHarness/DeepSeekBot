import { describe, expect, it, vi } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import type {
  AssignmentAgentRun,
  BotAgentAdapter,
  OrchestratorAssignmentAccess,
} from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';

function agents() {
  const runs: AssignmentAgentRun[] = [];
  const finishes = new Map<string, () => void>();
  let access: OrchestratorAssignmentAccess | undefined;
  const adapter: BotAgentAdapter = {
    async runOrchestrator(run) {
      access = run.assignments;
    },
    runAssignment(run) {
      runs.push(run);
      return new Promise<void>((resolve) => finishes.set(run.sessionId, resolve));
    },
    requestAssignment(run) {
      runs.push(run);
      return {
        delivery: 'followup',
        accepted: Promise.resolve(),
        done: new Promise<void>((resolve) => finishes.set(run.sessionId, resolve)),
      };
    },
    async stopAssignment(id) {
      finishes.get(id)?.();
    },
    async close() {
      for (const finish of finishes.values()) finish();
    },
  };
  return { adapter, runs, access: () => access, finish: (id: string) => finishes.get(id)?.() };
}

async function fixture(home = createTempRoot('botharness-assignment-attention-')) {
  const live = agents();
  const core = createCore({
    dshHome: home,
    agents: live.adapter,
    workspaces: () => ({
      get: (id) =>
        id === 'test-workspace'
          ? {
              id,
              path: home,
              title: 'Test Workspace',
              status: async () => 'ok',
            }
          : undefined,
      list: () => [],
    }),
  });
  if (core.registry.get('ada') === undefined)
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
  createTestWorkspaceGrants(core.operationalDatabase, home);
  const dm = core.channels.getOrCreateDm('ada', 'Ada');
  if (dm === undefined) throw new Error('Missing DM');
  const channelId = dm.id;
  const methods = createBridgeMethods({ ...core });
  async function start(state: 'waiting-human' | 'blocked' | 'completed', expectsReply = true) {
    const admission = core.runtime.admitDmMessage({
      channelId,
      messageId: 'human-' + crypto.randomUUID(),
      body: 'Start',
    });
    if (!admission.admitted) throw new Error('Not admitted');
    await admission.settled;
    const access = live.access();
    if (access === undefined) throw new Error('Missing Orchestrator');
    const created = access.create({ grantId: TEST_GRANT_ID, purpose: 'Attention QA' });
    if (created.outcome !== 'created') throw new Error('Missing Assignment');
    const run = live.runs.find((run) => run.sessionId === created.assignment.sessionId);
    if (run === undefined) throw new Error('Assignment not started');
    await run.report({ state, summary: 'Private report text', expectsReply });
    return { access, run };
  }
  function reopenReportDelivery() {
    attachOperationalModule(core.operationalDatabase, 'report-delivery-test').transaction(
      (db) =>
        db
          .prepare(
            "UPDATE inbox_admissions SET attempt_state = 'running' WHERE reason = 'assignment-report'",
          )
          .run(),
      ['bot-inbox'],
    );
  }
  async function close() {
    await live.adapter.close();
    await core.runtime.whenIdle();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
  return { home, core, live, methods, dm, start, reopenReportDelivery, close };
}

describe('shared Assignment Human attention', () => {
  it('uses canonical actions, clears after answer acceptance, and retains independent execution and native counts', async () => {
    const f = await fixture();
    try {
      f.core.states.setSessionState('ada', 'orchestrator', 'thinking', undefined, 'orchestrator');
      f.core.states.setApprovalCount('ada', 1);
      f.core.states.setQuestionCount('ada', 1);
      const waiting = await f.start('waiting-human');
      const blocked = await f.start('blocked');
      expect(f.core.states.snapshot('ada')).toMatchObject({
        state: 'thinking',
        attention: {
          approvalCount: 1,
          questionCount: 1,
          waitingHumanCount: 1,
          blockedCount: 1,
        },
      });
      const item = f.core.humanAttention
        .list({ category: 'action' })
        .items.find((item) => item.assignmentSessionId === waiting.run.sessionId);
      if (item?.sourceEventId === undefined) throw new Error('Missing waiting action');
      expect(
        await f.methods.channelSend({
          channelId: f.dm.id,
          messageId: 'human-' + crypto.randomUUID(),
          body: 'Canary',
          assignmentReply: {
            sessionId: waiting.run.sessionId,
            sourceEventId: item.sourceEventId,
          },
        }),
      ).toMatchObject({ ok: true });
      expect(f.core.states.snapshot('ada').attention?.waitingHumanCount).toBe(1);
      waiting.access.request({
        sessionId: waiting.run.sessionId,
        mode: 'next-turn',
        text: 'Canary',
        answerTo: item.sourceEventId,
      });
      await Promise.resolve();
      expect(f.core.states.snapshot('ada').attention).toEqual({
        approvalCount: 1,
        questionCount: 1,
        blockedCount: 1,
      });
      await blocked.access.stop(blocked.run.sessionId);
      expect(f.core.states.snapshot('ada').attention).toEqual({
        approvalCount: 1,
        questionCount: 1,
      });
      expect(f.core.states.snapshot('ada').state).toBe('thinking');
    } finally {
      await f.close();
    }
  }, 60000);

  it.each(['sync', 'async'] as const)(
    'keeps source navigation and enables an explicit Human retry after %s preacceptance failure',
    async (phase) => {
      const f = await fixture();
      try {
        const waiting = await f.start('waiting-human');
        f.live.finish(waiting.run.sessionId);
        await f.core.runtime.whenIdle();
        const ask = f.core.runtime.getAssignment('ada', waiting.run.sessionId)!.openAsk!;
        const reply = {
          channelId: f.dm.id,
          body: 'Choose A',
          assignmentReply: { sessionId: waiting.run.sessionId, sourceEventId: ask.sourceEventId },
        };
        const firstAnswerId = 'human-' + crypto.randomUUID();
        const sent = await f.methods.channelSend({ ...reply, messageId: firstAnswerId });
        if (!sent.ok) throw new Error(sent.error.message);
        expect(sent.ok).toBe(true);
        const refusal =
          phase === 'sync' ? undefined : Promise.reject(new Error('cold resume unavailable'));
        const request = vi.spyOn(f.live.adapter, 'requestAssignment');
        if (refusal === undefined)
          request.mockImplementationOnce(() => {
            throw new Error('sync Inbox unavailable');
          });
        else
          request.mockReturnValueOnce({ delivery: 'followup', accepted: refusal, done: refusal });
        const relay = () =>
          waiting.access.request({
            sessionId: waiting.run.sessionId,
            mode: 'next-turn',
            text: 'Choose A',
            answerTo: ask.sourceEventId,
          });
        if (phase === 'sync') expect(relay).toThrow('sync Inbox unavailable');
        else relay();
        await f.core.runtime.whenIdle();
        expect(f.core.humanAttention.list({ category: 'action' }).items).toContainEqual(
          expect.objectContaining({ sourceEventId: ask.sourceEventId }),
        );
        expect(f.core.humanAttention.list({ category: 'handled' }).items).toEqual([]);
        expect(
          await f.methods.humanAssignmentContext({
            slug: 'ada',
            sessionId: waiting.run.sessionId,
            sourceEventId: ask.sourceEventId,
          }),
        ).toMatchObject({
          ok: true,
          value: { context: { canReply: true, reply: { id: firstAnswerId } } },
        });
        expect(
          await f.methods.channelSend({ ...reply, messageId: 'human-' + crypto.randomUUID() }),
        ).toMatchObject({ ok: true });
        expect(
          await f.methods.channelSend({ ...reply, messageId: 'human-' + crypto.randomUUID() }),
        ).toMatchObject({ ok: false });
        waiting.access.request({
          sessionId: waiting.run.sessionId,
          mode: 'next-turn',
          text: 'Choose A',
          answerTo: ask.sourceEventId,
        });
        await Promise.resolve();
        expect(f.core.humanAttention.list({ category: 'action' }).items).toEqual([]);
        expect(f.core.humanAttention.list({ category: 'handled' }).items).toHaveLength(1);
        expect(
          await f.methods.channelSend({ ...reply, messageId: 'human-' + crypto.randomUUID() }),
        ).toMatchObject({ ok: false });
      } finally {
        await f.close();
      }
    },
  );

  it('deduplicates notifications, rebuilds unresolved durable attention, and clears dismissed or stopped work', async () => {
    const before = await fixture();
    const waiting = await before.start('waiting-human');
    before.live.finish(waiting.run.sessionId);
    await before.core.runtime.whenIdle();
    const version = before.core.states.version();
    attachOperationalModule(before.core.operationalDatabase, 'attention-test').transaction(
      () => undefined,
      ['assignments'],
    );
    expect(before.core.states.version()).toEqual(version);
    await before.close();
    const after = await fixture(before.home);
    try {
      expect(after.core.states.snapshot('ada')).toMatchObject({
        state: 'idle',
        attention: { approvalCount: 0, waitingHumanCount: 1 },
      });
      const item = after.core.humanAttention
        .list({ category: 'action' })
        .items.find((item) => item.assignmentSessionId === waiting.run.sessionId);
      if (item === undefined) throw new Error('Missing durable action');
      expect(after.core.humanAttentionDecisions.dismiss(item)).toBe(true);
      expect(after.core.states.snapshot('ada').attention).toBeUndefined();
      const blocked = await after.start('blocked', false);
      expect(after.core.states.snapshot('ada').attention).toBeUndefined();
      after.live.finish(blocked.run.sessionId);
      await after.core.runtime.whenIdle();
      expect(after.core.states.snapshot('ada').attention).toEqual({
        approvalCount: 0,
        blockedCount: 1,
      });
      await blocked.access.stop(blocked.run.sessionId);
      expect(after.core.states.snapshot('ada').attention).toBeUndefined();
    } finally {
      await after.close();
    }
  }, 60000);
});

describe('shared informational Assignment attention', () => {
  it('projects only canonical completed reports and keeps action count and execution independent', async () => {
    const f = await fixture();
    try {
      f.core.states.setSessionState('ada', 'orch', 'thinking', undefined, 'orchestrator');
      const completed = await f.start('completed', false);
      f.reopenReportDelivery();
      expect(f.core.states.snapshot('ada')).toMatchObject({
        state: 'thinking',
        attention: { approvalCount: 0, informationalCount: 1 },
      });
      expect(f.core.humanAttention.actionSummary().count).toBe(0);
      const revision = f.core.states.version();
      attachOperationalModule(f.core.operationalDatabase, 'information-test').transaction(
        () => undefined,
        ['assignments'],
      );
      expect(f.core.states.version()).toEqual(revision);
      const second = await f.start('completed', false);
      const waiting = await f.start('waiting-human');
      f.reopenReportDelivery();
      expect(f.core.states.snapshot('ada').attention).toEqual({
        approvalCount: 0,
        informationalCount: 2,
        waitingHumanCount: 1,
      });
      const item = f.core.humanAttention
        .list({ category: 'info' })
        .items.find((item) => item.assignmentSessionId === completed.run.sessionId)!;
      const events: unknown[] = [];
      const stop = f.core.states.onActivity((event) => events.push(event));
      expect(f.methods.humanAttentionIgnore({ sourceEventId: item.sourceEventId })).toMatchObject({
        ok: true,
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        revision: f.core.states.version().revision,
        state: 'thinking',
        attention: { approvalCount: 0, informationalCount: 1, waitingHumanCount: 1 },
      });
      expect(JSON.stringify(events)).not.toContain('Private report text');
      expect(f.methods.humanAttentionIgnore({ sourceEventId: item.sourceEventId })).toMatchObject({
        ok: true,
      });
      expect(events).toHaveLength(1);
      const remaining = f.core.humanAttention
        .list({ category: 'info' })
        .items.find((item) => item.assignmentSessionId === second.run.sessionId)!;
      expect(
        f.methods.humanAttentionDismiss({ itemId: remaining.id, sourceKey: 'stale' }),
      ).toMatchObject({ ok: false });
      expect(
        f.methods.humanAttentionDismiss({
          itemId: remaining.id,
          sourceKey: remaining.sourceEventId,
        }),
      ).toMatchObject({ ok: true });
      expect(f.core.states.snapshot('ada').attention).toEqual({
        approvalCount: 0,
        waitingHumanCount: 1,
      });
      expect(f.core.states.snapshot('ada').state).toBe('thinking');
      stop();
      await waiting.access.stop(waiting.run.sessionId);
    } finally {
      await f.close();
    }
  }, 60000);
  it('clears information once the Orchestrator has handled the completed report', async () => {
    const f = await fixture();
    try {
      const completed = await f.start('completed', false);
      f.reopenReportDelivery();
      expect(f.core.states.snapshot('ada').attention).toEqual({
        approvalCount: 0,
        informationalCount: 1,
      });
      attachOperationalModule(f.core.operationalDatabase, 'report-delivery-test').transaction(
        (db) =>
          db
            .prepare(
              "UPDATE inbox_admissions SET attempt_state = 'handled' WHERE reason = 'assignment-report'",
            )
            .run(),
        ['bot-inbox'],
      );
      expect(f.core.states.snapshot('ada').attention).toBeUndefined();
      expect(
        f.core.humanAttention
          .list({ category: 'info' })
          .items.some((item) => item.assignmentSessionId === completed.run.sessionId),
      ).toBe(true);
      f.live.finish(completed.run.sessionId);
    } finally {
      await f.close();
    }
  }, 60000);
  it('reconstructs undismissed information at idle after restart without recreating a live Session', async () => {
    const before = await fixture();
    const first = await before.start('completed', false);
    before.live.finish(first.run.sessionId);
    await before.core.runtime.whenIdle();
    before.reopenReportDelivery();
    const info = before.core.humanAttention.list({ category: 'info' }).items[0]!;
    await before.close();
    const after = await fixture(before.home);
    try {
      expect(after.core.states.snapshot('ada')).toEqual({
        slug: 'ada',
        state: 'idle',
        sessions: {},
        attention: { approvalCount: 0, informationalCount: 1 },
      });
      expect(
        after.methods.humanAttentionIgnore({ sourceEventId: info.sourceEventId }),
      ).toMatchObject({ ok: true });
      expect(after.core.states.snapshot('ada').attention).toBeUndefined();
    } finally {
      await after.close();
    }
  }, 60000);
});
