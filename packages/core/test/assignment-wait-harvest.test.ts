import { describe, expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import type {
  AssignmentAgentRun,
  BotAgentAdapter,
  OrchestratorAgentRun,
} from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';

describe('Assignment report consumed by wait', () => {
  it('does not wake the Orchestrator again for a report it already waited on', async () => {
    const home = createTempRoot('botharness-wait-harvest-');
    const orchestratorRuns: OrchestratorAgentRun[] = [];
    const assignmentRuns: AssignmentAgentRun[] = [];
    const finishes = new Map<string, () => void>();
    let waited: unknown;
    let current: string[] = [];
    const adapter: BotAgentAdapter = {
      async runOrchestrator(run) {
        orchestratorRuns.push(run);
        if (orchestratorRuns.length > 1) return;
        const created = run.assignments!.create({ grantId: TEST_GRANT_ID, purpose: 'Wait QA' });
        if (created.outcome !== 'created') throw new Error('Missing Assignment');
        const sessionId = created.assignment.sessionId;
        const assignment = assignmentRuns.find((item) => item.sessionId === sessionId)!;
        const pending = run.assignments!.wait!(sessionId, new AbortController().signal);
        await assignment.report({ state: 'completed', summary: 'Release notes drafted' });
        waited = await pending;
        finishes.get(sessionId)!();
        current = run.triage!.current();
        run.triage!.resolve({ ids: current, outcome: 'done', note: 'Accepted the release notes' });
      },
      runAssignment(run) {
        assignmentRuns.push(run);
        return new Promise<void>((resolve) => finishes.set(run.sessionId, resolve));
      },
      requestAssignment() {
        throw new Error('No follow-up expected');
      },
      async close() {
        for (const finish of finishes.values()) finish();
      },
    };
    const core = createCore({
      dshHome: home,
      agents: adapter,
      triageContinuation: true,
      workspaces: () => ({
        get: (id) =>
          id === 'test-workspace'
            ? { id, path: home, title: 'Test Workspace', status: async () => 'ok' }
            : undefined,
        list: () => [],
      }),
    });
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    createTestWorkspaceGrants(core.operationalDatabase, home);
    const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
    try {
      const admission = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'human-1',
        body: 'Draft the release notes and tell me when done',
      });
      if (!admission.admitted) throw new Error('Not admitted');
      await admission.settled;
      await core.runtime.whenIdle();
      expect(waited).toMatchObject({ outcome: 'report' });
      const report = core.attention
        .list({ botSlug: 'ada', limit: 100 })
        .items.find((item) => item.reason === 'assignment-report')!;
      expect(current).toContain(report.id);
      expect(report.state).toBe('handled');
      expect(orchestratorRuns).toHaveLength(1);
    } finally {
      await adapter.close();
      await core.runtime.whenIdle();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  }, 60000);
});
