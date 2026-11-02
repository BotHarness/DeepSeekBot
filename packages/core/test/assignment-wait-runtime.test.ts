import { describe, expect, it } from 'vitest';
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
  async function start(state: 'waiting-human' | 'blocked', expectsReply = true) {
    const admission = core.runtime.admitDmMessage({
      channelId,
      messageId: 'human-' + crypto.randomUUID(),
      body: 'Start',
    });
    if (!admission.admitted) throw new Error('Not admitted');
    await admission.settled;
    const access = live.access();
    if (access === undefined) throw new Error('Missing Orchestrator');
    const created = access.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: 'Wait QA',
    });
    if (created.outcome !== 'created') throw new Error('Missing Assignment');
    const run = live.runs.find((run) => run.sessionId === created.assignment.sessionId);
    if (run === undefined) throw new Error('Assignment not started');
    void state;
    void expectsReply;
    return { access, run };
  }
  async function close() {
    await live.adapter.close();
    await core.runtime.whenIdle();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
  return { home, core, live, methods, dm, start, close };
}

describe('owned Runtime Assignment wait', () => {
  it('uses committed reports, rejects another Bot target and cancels on close', async () => {
    const f = await fixture();
    try {
      const { access, run } = await f.start('waiting-human');
      if (access.wait === undefined) throw new Error('Missing wait operation');
      const unknown = 'unknown-assignment';
      expect(() => access.wait?.(unknown, new AbortController().signal)).toThrow('Unknown owned');
      const signal = new AbortController().signal;
      const pending = access.wait(run.sessionId, signal);
      await run.report({ state: 'progress', summary: 'Work committed' });
      expect(await pending).toMatchObject({
        outcome: 'report',
        assignment: { latestReport: { summary: 'Work committed' } },
      });
      const cancelled = access.wait(run.sessionId, signal);
      const rejected = expect(cancelled).rejects.toThrow('Runtime closed');
      f.live.finish(run.sessionId);
      const closing = f.core.runtime.close();
      await rejected;
      await closing;
    } finally {
      await f.close();
    }
  }, 60000);
});
