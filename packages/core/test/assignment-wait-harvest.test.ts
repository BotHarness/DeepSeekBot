import { describe, expect, it } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
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
        const created = run.assignments!.create({
          title: 'Assignment',
          grantId: TEST_GRANT_ID,
          description: 'Wait QA',
        });
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
  it('leaves a direct CLI notice for the next Inbox when wait consumes the report', async () => {
    const home = createTempRoot('botharness-wait-direct-notice-');
    const orchestratorRuns: OrchestratorAgentRun[] = [];
    const assignmentRuns: AssignmentAgentRun[] = [];
    const finishes = new Map<string, () => void>();
    let notice: { attempt_state: string } | undefined;
    let insertNotice: (sessionId: string) => void = () => undefined;
    let readNotice: () => { attempt_state: string } | undefined = () => undefined;
    const adapter: BotAgentAdapter = {
      async runOrchestrator(run) {
        orchestratorRuns.push(run);
        if (orchestratorRuns.length > 1) return;
        const created = run.assignments!.create({
          title: 'Assignment',
          grantId: TEST_GRANT_ID,
          description: 'Wait QA',
        });
        if (created.outcome !== 'created') throw new Error('Missing Assignment');
        const sessionId = created.assignment.sessionId;
        const assignment = assignmentRuns.find((item) => item.sessionId === sessionId)!;
        insertNotice(sessionId);
        const pending = run.assignments!.wait!(sessionId, new AbortController().signal);
        await assignment.report({ state: 'completed', summary: 'Release notes drafted' });
        await pending;
        notice = readNotice();
        finishes.get(sessionId)!();
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
    const database = attachOperationalModule(core.operationalDatabase, 'wait-direct-notice-test');
    insertNotice = (sessionId) =>
      database.transaction(
        (db) => {
          db.prepare(
            `INSERT INTO source_events (source_event_id, source_kind, bot_slug, assignment_session_id,
               body, created_at, handled_at, attempt_state, expects_reply, payload_json)
             VALUES ('direct-notice', 'assignment-lifecycle', 'ada', ?, ?, ?, ?, 'handled', 0, ?)`,
          ).run(
            sessionId,
            'The Human sent this Assignment a request directly through the deepseekbot CLI.',
            new Date().toISOString(),
            new Date().toISOString(),
            JSON.stringify({ assignmentLifecycle: { state: 'directed', cause: 'direct-request' } }),
          );
          db.prepare(
            `INSERT INTO inbox_admissions (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode)
             VALUES ('direct-notice', 'ada', 'assignment-lifecycle', 0, 'silent')`,
          ).run();
        },
        ['source-event', 'bot-inbox'],
      );
    readNotice = () =>
      database.read((db) =>
        db
          .prepare(
            "SELECT attempt_state FROM inbox_admissions WHERE source_event_id = 'direct-notice'",
          )
          .get(),
      ) as { attempt_state: string } | undefined;
    const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
    try {
      for (const [id, body] of [
        ['human-1', 'Draft the release notes'],
        ['human-2', 'Anything new?'],
      ] as const) {
        const admission = core.runtime.admitDmMessage({ channelId: dm.id, messageId: id, body });
        if (!admission.admitted) throw new Error('Not admitted');
        await admission.settled;
        await core.runtime.whenIdle();
      }
      expect(notice).toEqual({ attempt_state: 'pending' });
      expect(
        orchestratorRuns
          .slice(1)
          .map((run) => run.inbox)
          .join('\n'),
      ).toContain(
        'Host lifecycle notice [Source Event direct-notice]: The Human sent this Assignment a request directly through the deepseekbot CLI.',
      );
    } finally {
      await adapter.close();
      await core.runtime.whenIdle();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  }, 60000);
});
