import { describe, expect, it, vi } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
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
  let turn: { sessionId: string; release: () => void } | undefined;
  let blockNext = false;
  const hold = (sessionId: string) =>
    new Promise<void>((resolve) => finishes.set(sessionId, resolve));
  const adapter: BotAgentAdapter = {
    async runOrchestrator(run) {
      orchestratorRuns.push(`${run.inbox}\n${run.message}`);
      access = run.assignments;
      if (!blockNext) return;
      blockNext = false;
      await new Promise<void>((resolve) => {
        turn = { sessionId: run.sessionId, release: resolve };
      });
      turn = undefined;
    },
    stopOrchestratorTurn() {
      const current = turn;
      current?.release();
      return current?.sessionId;
    },
    runAssignment(run) {
      assignmentRuns.push(run);
      run.accepted?.();
      return hold(run.sessionId);
    },
    requestAssignment(run) {
      assignmentRuns.push(run);
      run.accepted?.();
      return { delivery: 'followup', accepted: Promise.resolve(), done: hold(run.sessionId) };
    },
    async stopAssignment(id) {
      stopped.push(id);
      finishes.get(id)?.();
    },
    async close() {
      turn?.release();
      for (const finish of finishes.values()) finish();
    },
  };
  return {
    adapter,
    orchestratorRuns,
    assignmentRuns,
    stopped,
    access: () => access,
    blockNextTurn: () => {
      blockNext = true;
    },
    turnRunning: () => turn !== undefined,
    finish: (id: string) => finishes.get(id)?.(),
  };
}

async function fixture(home = createTempRoot('bh-orchestrator-stop-')) {
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
  if (core.registry.get('ada') === undefined) {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    createTestWorkspaceGrants(core.operationalDatabase, home);
  }
  const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
  let sent = 0;
  function send(body: string) {
    sent += 1;
    const messageId = `human-${Date.now()}-${sent}`;
    const admission = core.runtime.admitDmMessage({ channelId: dm.id, messageId, body });
    if (!admission.admitted) throw new Error('Not admitted');
    return admission.settled;
  }
  async function create(title: string) {
    if (live.access() === undefined) await send('Start');
    const created = live.access()!.create({ grantId: TEST_GRANT_ID, title, description: title });
    if (created.outcome !== 'created') throw new Error(`Not created: ${created.outcome}`);
    return created.assignment.sessionId;
  }
  async function busyTurn() {
    if (live.access() === undefined) await send('Start');
    live.blockNextTurn();
    const settled = send('Think about it for a long time');
    await vi.waitFor(() => expect(live.turnRunning()).toBe(true));
    return { settled };
  }
  async function close() {
    await live.adapter.close();
    await core.runtime.whenIdle();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
  return { home, core, bridge, live, dm, send, create, busyTurn, close };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('Session Stop on the Orchestrator', () => {
  it('stops only the Orchestrator turn; its Assignments keep running', async () => {
    const f = await fixture();
    try {
      const assignment = await f.create('Crawl every page');
      const { settled } = await f.busyTurn();
      const orchestrator = f.core.runtime.currentOrchestratorSessionId!('ada')!;

      const result = await f.bridge.sessionStop({
        botSlug: 'ada',
        sessionId: orchestrator,
        channelId: f.dm.id,
      });
      await settled;
      expect(result).toMatchObject({
        ok: true,
        value: {
          stopped: [{ botSlug: 'ada', sessionId: orchestrator, role: 'orchestrator' }],
          alreadyIdle: [],
          messageId: expect.any(String),
        },
      });
      expect(f.live.stopped).toEqual([]);
      expect(f.core.runtime.getAssignment('ada', assignment)).toMatchObject({
        activity: 'working',
      });
      expect(f.core.runtime.heldCause?.('ada')).toBeUndefined();
      const notice = f.core.channels
        .readMessages(f.dm.id)
        .find((message) => message.turnStop !== undefined);
      expect(notice).toMatchObject({
        body: "Human stopped Ada's Orchestrator.",
        turnStop: {
          target: { scope: 'session', role: 'orchestrator', sessionId: orchestrator },
        },
      });

      expect(await f.bridge.sessionStop({ botSlug: 'ada', sessionId: orchestrator })).toMatchObject(
        {
          ok: true,
          value: {
            stopped: [],
            alreadyIdle: [{ botSlug: 'ada', sessionId: orchestrator, role: 'orchestrator' }],
          },
        },
      );
    } finally {
      await f.close();
    }
  });

  it('is woken as usual by an Assignment Report after the stop', async () => {
    const f = await fixture();
    try {
      const assignment = await f.create('Draft the report');
      const { settled } = await f.busyTurn();
      const orchestrator = f.core.runtime.currentOrchestratorSessionId!('ada')!;
      await f.bridge.sessionStop({ botSlug: 'ada', sessionId: orchestrator });
      await settled;
      const before = f.live.orchestratorRuns.length;

      const run = f.live.assignmentRuns.find((item) => item.sessionId === assignment)!;
      await run.report({ state: 'completed', summary: 'The report is drafted' });
      f.live.finish(assignment);
      await vi.waitFor(() => expect(f.live.orchestratorRuns.length).toBeGreaterThan(before));
      const next = f.live.orchestratorRuns.slice(before).join('\n');
      expect(next).toContain('Only your Orchestrator Session stopped');
      expect(next).toContain('The report is drafted');
    } finally {
      await f.close();
    }
  });
});

describe('Bot Stop', () => {
  it('stops the Orchestrator and every running Assignment, and is idempotent', async () => {
    const f = await fixture();
    try {
      const first = await f.create('Crawl every page');
      const second = await f.create('Write the summary');
      const idle = await f.create('Quick lookup');
      f.live.finish(idle);
      await vi.waitFor(() =>
        expect(f.core.runtime.getAssignment('ada', idle)?.activity).toBe('idle'),
      );
      const { settled } = await f.busyTurn();
      const orchestrator = f.core.runtime.currentOrchestratorSessionId!('ada')!;

      const result = await f.bridge.botStop({ botSlug: 'ada', channelId: f.dm.id });
      await settled;
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.stopped).toEqual(
        expect.arrayContaining([
          { botSlug: 'ada', sessionId: orchestrator, role: 'orchestrator' },
          { botSlug: 'ada', sessionId: first, role: 'assignment' },
          { botSlug: 'ada', sessionId: second, role: 'assignment' },
        ]),
      );
      expect(result.value.stopped).toHaveLength(3);
      expect(f.live.stopped.sort()).toEqual([first, second].sort());
      expect(f.core.runtime.getAssignment('ada', idle)).toMatchObject({ activity: 'idle' });
      expect(f.core.runtime.heldCause?.('ada')).toBeUndefined();
      expect(
        f.core.channels.readMessages(f.dm.id).find((message) => message.turnStop !== undefined),
      ).toMatchObject({ body: 'Human stopped Ada.', turnStop: { target: { scope: 'bot' } } });

      const again = await f.bridge.botStop({ botSlug: 'ada' });
      expect(again).toEqual({
        ok: true,
        value: {
          stopped: [],
          alreadyIdle: [{ botSlug: 'ada', sessionId: orchestrator, role: 'orchestrator' }],
        },
      });
      expect(f.core.runtime.heldCause?.('ada')).toBeUndefined();

      const resumed = f.live.access()!.request({
        sessionId: first,
        mode: 'next-turn',
        text: 'The Human wants this after all; continue',
      });
      expect(resumed).toMatchObject({ assignment: { sessionId: first } });
    } finally {
      await f.close();
    }
  });

  it('keeps channel-bot-stop as an alias and refuses an idle Bot as not working', async () => {
    const f = await fixture();
    try {
      await f.send('Hello');
      expect(await f.bridge.channelBotStop({ channelId: f.dm.id, botSlug: 'ada' })).toMatchObject({
        ok: false,
        error: { code: 'not-working' },
      });
      expect(f.core.runtime.heldCause?.('ada')).toBeUndefined();
      const assignment = await f.create('Crawl');
      const stopped = await f.bridge.channelBotStop({ channelId: f.dm.id, botSlug: 'ada' });
      expect(stopped).toMatchObject({ ok: true, value: { stopped: { botSlug: 'ada' } } });
      expect(f.live.stopped).toEqual([assignment]);
    } finally {
      await f.close();
    }
  });
});

describe('Stop notices', () => {
  it('posts an Assignment stop only in its own Channel', async () => {
    const f = await fixture();
    try {
      const assignment = await f.create('Crawl every page');
      const elsewhere = f.core.channels.createGroup({ name: 'Elsewhere', members: ['ada'] }).id;
      const unrelated = await f.bridge.sessionStop({
        botSlug: 'ada',
        sessionId: assignment,
        channelId: elsewhere,
      });
      expect(unrelated).toMatchObject({ ok: true });
      if (unrelated.ok) expect(unrelated.value.messageId).toBeUndefined();
      expect(f.core.channels.readMessages(elsewhere).some((message) => message.turnStop)).toBe(
        false,
      );
      const second = await f.create('Write the summary');
      const related = await f.bridge.sessionStop({
        botSlug: 'ada',
        sessionId: second,
        channelId: f.dm.id,
      });
      expect(related).toMatchObject({ ok: true, value: { messageId: expect.any(String) } });
      expect(
        f.core.channels.readMessages(f.dm.id).find((message) => message.turnStop !== undefined),
      ).toMatchObject({
        body: "Human stopped Ada's Assignment “Write the summary”.",
        turnStop: {
          target: {
            scope: 'session',
            role: 'assignment',
            sessionId: second,
            title: 'Write the summary',
          },
        },
      });
    } finally {
      await f.close();
    }
  });
});
