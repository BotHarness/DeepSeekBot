import { describe, expect, it, vi } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type {
  AssignmentAgentRun,
  BotAgentAdapter,
  OrchestratorAssignmentAccess,
} from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';

function agents() {
  const orchestratorRuns: string[] = [];
  const assignmentRuns: AssignmentAgentRun[] = [];
  const stopped: string[] = [];
  const finishes = new Map<string, () => void>();
  let access: OrchestratorAssignmentAccess | undefined;
  const hold = (sessionId: string) =>
    new Promise<void>((resolve) => finishes.set(sessionId, resolve));
  const adapter: BotAgentAdapter = {
    async runOrchestrator(run) {
      orchestratorRuns.push(`${run.inbox}\n${run.message}`);
      access = run.assignments;
    },
    runAssignment(run) {
      assignmentRuns.push(run);
      return hold(run.sessionId);
    },
    requestAssignment(run) {
      assignmentRuns.push(run);
      return { delivery: 'followup', accepted: Promise.resolve(), done: hold(run.sessionId) };
    },
    async stopAssignment(id) {
      stopped.push(id);
      finishes.get(id)?.();
    },
    async close() {
      for (const finish of finishes.values()) finish();
    },
  };
  return {
    adapter,
    orchestratorRuns,
    assignmentRuns,
    stopped,
    access: () => access,
    finish: (id: string) => finishes.get(id)?.(),
  };
}

async function fixture() {
  const home = createTempRoot('bh-session-stop-');
  const live = agents();
  const core = createCore({
    dshHome: home,
    agents: live.adapter,
    workspaces: () => ({
      get: (id) =>
        id === 'test-workspace'
          ? { id, path: home, title: 'Test Workspace', status: async () => 'ok' }
          : undefined,
      list: () => [],
    }),
  });
  const bridge = createBridgeMethods({ ...core });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  createTestWorkspaceGrants(core.operationalDatabase, home);
  const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
  let sent = 0;
  async function human(body: string) {
    sent += 1;
    const admission = core.runtime.admitDmMessage({
      channelId: dm.id,
      messageId: `human-${sent}`,
      body,
    });
    if (!admission.admitted) throw new Error('Not admitted');
    await admission.settled;
  }
  await human('Start');
  const access = live.access()!;
  function create(title: string) {
    const created = access.create({ grantId: TEST_GRANT_ID, title, description: title });
    if (created.outcome !== 'created') throw new Error(`Not created: ${created.outcome}`);
    return created.assignment.sessionId;
  }
  async function close() {
    await live.adapter.close();
    await core.runtime.whenIdle();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
  return { core, bridge, live, access, human, create, close };
}

describe('Session Stop on an Assignment', () => {
  it('stops one Assignment without waking the Orchestrator or touching its siblings', async () => {
    const f = await fixture();
    try {
      const runaway = f.create('Crawl every page');
      const sibling = f.create('Write the summary');
      const before = f.live.orchestratorRuns.length;

      const result = await f.bridge.sessionStop({ botSlug: 'ada', sessionId: runaway });
      expect(result).toEqual({
        ok: true,
        value: {
          stopped: [{ botSlug: 'ada', sessionId: runaway, role: 'assignment' }],
          alreadyIdle: [],
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(f.live.stopped).toEqual([runaway]);
      expect(f.core.runtime.getAssignment('ada', runaway)).toMatchObject({ activity: 'stopped' });
      expect(f.core.runtime.getAssignment('ada', runaway)?.archivedAt).toBeUndefined();
      expect(f.core.runtime.getAssignment('ada', sibling)).toMatchObject({ activity: 'working' });
      expect(f.live.orchestratorRuns).toHaveLength(before);

      await f.human('How is it going?');
      const next = f.live.orchestratorRuns.at(-1)!;
      expect(next).toContain(runaway);
      expect(next).toContain('The Human stopped this Assignment');
      expect(next).toContain('Do not send it another Assignment Request or redispatch');
    } finally {
      await f.close();
    }
  });

  it('succeeds with alreadyIdle for an idle, already stopped or twice-stopped Assignment', async () => {
    const f = await fixture();
    try {
      const idle = f.create('Quick lookup');
      f.live.finish(idle);
      await vi.waitFor(() =>
        expect(f.core.runtime.getAssignment('ada', idle)?.activity).toBe('idle'),
      );
      const ref = { botSlug: 'ada', sessionId: idle, role: 'assignment' };
      expect(await f.bridge.sessionStop({ botSlug: 'ada', sessionId: idle })).toEqual({
        ok: true,
        value: { stopped: [], alreadyIdle: [ref] },
      });
      expect(f.core.runtime.getAssignment('ada', idle)).toMatchObject({ activity: 'idle' });

      const busy = f.create('Long crawl');
      const [first, second] = await Promise.all([
        f.bridge.sessionStop({ botSlug: 'ada', sessionId: busy }),
        f.bridge.sessionStop({ botSlug: 'ada', sessionId: busy }),
      ]);
      expect(first).toMatchObject({ ok: true });
      expect(second).toMatchObject({ ok: true });
      expect(await f.bridge.sessionStop({ botSlug: 'ada', sessionId: busy })).toEqual({
        ok: true,
        value: { stopped: [], alreadyIdle: [{ ...ref, sessionId: busy }] },
      });
      const notices = attachOperationalModule(f.core.operationalDatabase, 'session-stop-test').read(
        (database) =>
          database
            .prepare(
              `SELECT payload_json FROM source_events
              WHERE assignment_session_id = ? AND source_kind = 'assignment-lifecycle'`,
            )
            .all(busy),
      ) as Array<{ payload_json: string }>;
      expect(notices.map((row) => JSON.parse(row.payload_json))).toEqual([
        {
          assignmentLifecycle: {
            state: 'stopped',
            cause: 'human-session-stop',
            stoppedBy: 'human',
          },
        },
      ]);
    } finally {
      await f.close();
    }
  });

  it('resumes only on an Assignment Request', async () => {
    const f = await fixture();
    try {
      const id = f.create('Draft the report');
      await f.bridge.sessionStop({ botSlug: 'ada', sessionId: id });
      await f.human('Something else');
      expect(f.core.runtime.getAssignment('ada', id)).toMatchObject({ activity: 'stopped' });
      expect(f.live.assignmentRuns).toHaveLength(1);

      const resumed = f.access.request({
        sessionId: id,
        mode: 'next-turn',
        text: 'The Human wants the report after all; continue',
      });
      expect(resumed).toMatchObject({ assignment: { sessionId: id } });
      await vi.waitFor(() =>
        expect(f.core.runtime.getAssignment('ada', id)?.activity).toBe('working'),
      );
      expect(f.live.assignmentRuns.at(-1)).toMatchObject({ sessionId: id, resume: true });
    } finally {
      await f.close();
    }
  });

  it('keeps refusing requests to an Assignment the Orchestrator stopped', async () => {
    const f = await fixture();
    try {
      const id = f.create('Draft the report');
      await f.access.stop!(id);
      expect(() => f.access.request({ sessionId: id, mode: 'next-turn', text: 'Go on' })).toThrow(
        /stopped or stopping/,
      );
    } finally {
      await f.close();
    }
  });

  it('refuses the Orchestrator Session and Sessions the Bot does not own', async () => {
    const f = await fixture();
    try {
      const orchestrator = f.core.runtime.currentOrchestratorSessionId!('ada')!;
      expect(await f.bridge.sessionStop({ botSlug: 'ada', sessionId: orchestrator })).toMatchObject(
        { ok: false, error: { code: 'unsupported-role' } },
      );
      expect(
        await f.bridge.sessionStop({ botSlug: 'ada', sessionId: 'not-a-session' }),
      ).toMatchObject({ ok: false, error: { code: 'unknown-session' } });
      expect(await f.bridge.sessionStop({ botSlug: 'zed', sessionId: 'x' })).toMatchObject({
        ok: false,
        error: { code: 'not-found' },
      });
    } finally {
      await f.close();
    }
  });
});
