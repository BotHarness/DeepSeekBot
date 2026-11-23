import {
  attachOperationalModule,
  type OperationalDatabaseOwner,
} from '../../src/database/owner.js';
import { OWNER_HUMAN_CONTEXT } from '../../src/humans/context.js';
import type {
  AssignmentAgentRun,
  AssignmentRequestDelivery,
  BotAgentAdapter,
  BotRuntime,
  HandleDmMessageInput,
  OrchestratorAgentRun,
} from '../../src/runtime/bot-runtime.js';
import { TEST_GRANT_ID } from '../workspace-grant-fixture.js';

export class DeterministicAgentAdapter implements BotAgentAdapter {
  readonly runs: Array<{ role: 'orchestrator' | 'assignment'; sessionId: string }> = [];

  async runOrchestrator(run: OrchestratorAgentRun): Promise<void> {
    this.runs.push({ role: 'orchestrator', sessionId: run.sessionId });
    if (run.message.trim().length > 0) {
      const outcome = run.assignments.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: `调查并回答：${run.message.split('\n').at(-1)}`,
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
    await run.report({ state: 'completed', summary: `Assignment 已处理「${run.text}」` });
  }

  requestAssignment(run: AssignmentAgentRun): AssignmentRequestDelivery {
    return { delivery: 'followup', accepted: Promise.resolve(), done: this.runAssignment(run) };
  }

  async stopAssignment(): Promise<void> {}

  async close(): Promise<void> {}
}

export function admit(runtime: BotRuntime, input: HandleDmMessageInput): Promise<void> {
  const admission = runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, input);
  if (!admission.admitted) throw new Error(`admission rejected: ${admission.reason}`);
  return admission.settled;
}

export function ownershipRows(owner: OperationalDatabaseOwner): Array<{
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

export function sourceEvents(owner: OperationalDatabaseOwner): Array<{
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
