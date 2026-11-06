import { realpathSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import type {
  AssignmentAgentRun,
  BotAgentAdapter,
  OrchestratorAgentRun,
} from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

describe('Human Inbox addressed Assignment response', () => {
  it('commits one addressed Human DM reply, keeps report authority and rejects stale, foreign and stopped requests', async () => {
    const home = createTempRoot('botharness-inbox-assignment-');
    const workspace = {
      id: 'project',
      path: realpathSync(createTempRoot('botharness-inbox-project-')),
      title: 'QA Project',
      status: async () => 'ok' as const,
    };
    let orchestrator: OrchestratorAgentRun | undefined;
    const runs: AssignmentAgentRun[] = [];
    const finish = new Map<string, () => void>();
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        orchestrator = run;
      },
      runAssignment(run) {
        runs.push(run);
        return new Promise<void>((resolve) => finish.set(run.sessionId, resolve));
      },
      requestAssignment() {
        return { delivery: 'followup', accepted: Promise.resolve(), done: Promise.resolve() };
      },
      async stopAssignment(id) {
        finish.get(id)?.();
      },
      async close() {},
    };
    const workspaces = () => ({
      get: (id: string) => (id === workspace.id ? workspace : undefined),
      list: () => [workspace],
    });
    const core = createCore({ dshHome: home, agents, workspaces });
    const methods = createBridgeMethods({ ...core });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      core.channels.getOrCreateDm('bea', 'Bea');
      const grant = await core.grants.create('ada', workspace.id);
      await methods.channelSend({ channelId: dm.id, body: 'Start research' });
      await core.runtime.whenIdle();
      const created = orchestrator!.assignments.create({
        title: 'Assignment',
        grantId: grant.id,
        description: 'Choose a launch channel',
      });
      if (created.outcome !== 'created') throw new Error('Assignment missing');
      const sessionId = created.assignment.sessionId;
      const run = runs[0]!;
      await run.report({
        state: 'waiting-human',
        summary: 'Canary or stable?',
        expectsReply: true,
      });
      await run.report({
        state: 'blocked',
        summary: 'Launch blocked without a route',
        expectsReply: true,
      });
      const sourceEventId = core.runtime.getAssignment('ada', sessionId)!.openAsk!.sourceEventId;
      await run.report({ state: 'progress', summary: 'Checking dependencies' });
      finish.get(sessionId)?.();
      await core.runtime.whenIdle();
      expect(core.humanAttention.list({ category: 'action' }).items).toMatchObject([
        { kind: 'assignment-blocked', sourceEventId, summary: 'Launch blocked without a route' },
      ]);
      const context = methods.humanAssignmentContext({ slug: 'ada', sessionId, sourceEventId });
      expect(context).toMatchObject({
        ok: true,
        value: {
          context: {
            sessionId,
            description: 'Choose a launch channel',
            canReply: true,
            reports: [
              { summary: 'Canary or stable?' },
              { sourceEventId, state: 'blocked' },
              { summary: 'Checking dependencies' },
            ],
          },
        },
      });
      expect(
        methods.humanAssignmentContext({ slug: 'bea', sessionId, sourceEventId }),
      ).toMatchObject({ ok: false });
      const stopped = orchestrator!.assignments.create({
        title: 'Assignment',
        grantId: grant.id,
        description: 'Stopped review',
      });
      if (stopped.outcome !== 'created') throw new Error('Assignment missing');
      const stoppedRun = runs.at(-1)!;
      await stoppedRun.report({
        state: 'waiting-human',
        summary: 'Choose a target',
        expectsReply: true,
      });
      const stoppedAsk = core.runtime.getAssignment('ada', stopped.assignment.sessionId)!.openAsk!
        .sourceEventId;
      await orchestrator!.assignments.stop(stopped.assignment.sessionId);
      expect(
        methods.humanAssignmentContext({
          slug: 'ada',
          sessionId: stopped.assignment.sessionId,
          sourceEventId: stoppedAsk,
        }),
      ).toMatchObject({ ok: true, value: { context: { canReply: false } } });
      expect(
        await methods.channelSend({
          channelId: dm.id,
          body: 'Too late',
          assignmentReply: { sessionId: stopped.assignment.sessionId, sourceEventId: stoppedAsk },
        }),
      ).toMatchObject({ ok: false });
      const payload = {
        channelId: dm.id,
        body: 'Use canary.',
        assignmentReply: { sessionId, sourceEventId },
      };
      const result = await Promise.all([
        methods.channelSend({
          ...payload,
          messageId: 'human-00000000-0000-4000-8000-000000000011',
        }),
        methods.channelSend({
          ...payload,
          messageId: 'human-00000000-0000-4000-8000-000000000012',
        }),
      ]);
      expect(result.map((row) => row.ok).sort()).toEqual([false, true]);
      expect(
        core.channels.readMessages(dm.id).filter((message) => message.assignmentReply),
      ).toHaveLength(1);
      const response = core.channels.readMessages(dm.id).find((m) => m.assignmentReply)!;
      expect(core.humanAttention.list({ category: 'action' }).items).toMatchObject([
        { sourceEventId },
      ]);
      expect(core.humanAttention.list({ category: 'handled' }).items).toEqual([]);
      expect(core.runtime.getAssignment('ada', sessionId)?.openAsk?.sourceEventId).toBe(
        sourceEventId,
      );
      orchestrator!.assignments.request({
        sessionId,
        mode: 'next-turn',
        text: 'Use canary.',
        answerTo: sourceEventId,
      });
      await Promise.resolve();
      expect(core.humanAttention.list({ category: 'action' }).items).toEqual([]);
      expect(methods.humanAttention({ category: 'handled', channelId: dm.id })).toMatchObject({
        ok: true,
        value: {
          items: [
            {
              kind: 'assignment-blocked',
              assignmentSessionId: sessionId,
              sourceEventId,
              responseMessageId: response.id,
            },
          ],
        },
      });
      expect(core.runtime.getAssignment('ada', sessionId)?.openAsk).toBeUndefined();
      expect(
        methods.humanAssignmentContext({ slug: 'ada', sessionId, sourceEventId }),
      ).toMatchObject({
        ok: true,
        value: { context: { canReply: false, reply: { body: 'Use canary.' } } },
      });
      await run.report({
        state: 'waiting-human',
        summary: 'Choose the next rollout',
        expectsReply: true,
      });
      const nextAsk = core.runtime.getAssignment('ada', sessionId)!.openAsk!.sourceEventId;
      expect(nextAsk).not.toBe(sourceEventId);
      expect(core.humanAttention.list({ category: 'action' }).items).toMatchObject([
        {
          kind: 'assignment-waiting-human',
          sourceEventId: nextAsk,
          summary: 'Choose the next rollout',
        },
      ]);
      expect(core.humanAttention.status().hasAction).toBe(true);
      expect(core.humanAttention.list({ category: 'handled' }).items).toMatchObject([
        { kind: 'assignment-blocked', sourceEventId },
      ]);
      await run.report({ state: 'completed', summary: 'Launched' });
      expect(core.humanAttention.list({ category: 'action' }).items).toEqual([]);
      expect(
        await methods.channelSend({
          ...payload,
          messageId: 'human-00000000-0000-4000-8000-000000000013',
        }),
      ).toMatchObject({ ok: false });
    } finally {
      for (const done of finish.values()) done();
      await core.runtime.whenIdle();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
    const resumed = createCore({ dshHome: home, agents, workspaces });
    try {
      expect(
        resumed.channels.readMessages('dm-ada').filter((message) => message.assignmentReply),
      ).toHaveLength(1);
      expect(resumed.humanAttention.list({ category: 'action' }).items).toEqual([]);
      expect(resumed.humanAttention.list({ category: 'handled' }).items).toMatchObject([
        { kind: 'assignment-blocked', botSlug: 'ada' },
      ]);
    } finally {
      await resumed.runtime.close();
      resumed.operationalDatabase.close();
    }
  }, 60_000);
});
