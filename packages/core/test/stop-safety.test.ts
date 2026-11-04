import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent';
import type { UserMessage } from '@deepseek-ai/dsh-llm';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it, vi } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import type { ChannelDraftEvent } from '../src/channels/draft.js';
import { createCore } from '../src/plugin.js';
import type {
  AssignmentAgentRun,
  BotAgentAdapter,
  OrchestratorAgentRun,
} from '../src/runtime/bot-runtime.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost, type FakeSession } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';

const never = () => new Promise<never>(() => undefined);

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function humanMessageId(index: number): string {
  return `human-00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function textOf(message: UserMessage | undefined): string {
  return (message?.content ?? []).map((part) => (part.type === 'text' ? part.text : '')).join('\n');
}

function delta(argumentsDelta: string, index: number): AssistantStreamFrame {
  return {
    type: 'chunk',
    attemptId: 'attempt-1',
    revision: 1,
    index,
    time: 1,
    chunk: {
      type: 'tool-call-delta',
      index: 0,
      id: 'call-send',
      name: 'bot_send_message',
      argumentsDelta,
    },
  } as AssistantStreamFrame;
}

type Script = (session: FakeSession, tools: readonly ToolDefinition[]) => Promise<void>;

function dshFixture(options: { stopSettleTimeoutMs?: number } = {}) {
  const scripts: Script[] = [];
  const drafts: ChannelDraftEvent[] = [];
  let running = deferred();
  let host!: FakeAgentHost;
  const cancelled = (sessionId: string) =>
    vi.waitFor(
      () => {
        if (!host.cancelled.some((entry) => entry.sessionId === sessionId))
          throw new Error('not cancelled yet');
      },
      { timeout: 5_000, interval: 5 },
    );
  host = new FakeAgentHost(
    { kind: 'completed' },
    {
      onTurn: async (session, tools) => {
        const script = scripts.shift();
        running.resolve();
        await script?.(session, tools);
      },
    },
  );
  const adapter = createDshBotAgentAdapter({
    agents: host,
    orchestratorCwd: (bot) => `/memory/${bot.slug}`,
    ensureWorkspace: () => undefined,
    defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    publishDraft: (event) => drafts.push(event),
  });
  const core = createCore({
    dshHome: createTempRoot('bh-stop-safety-'),
    agents: adapter,
    ...(options.stopSettleTimeoutMs === undefined
      ? {}
      : { stopSettleTimeoutMs: options.stopSettleTimeoutMs }),
  });
  const bridge = createBridgeMethods({ ...core });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
  let sent = 0;
  return {
    core,
    bridge,
    host,
    adapter,
    drafts,
    dm,
    cancelled,
    script(next: Script) {
      scripts.push(next);
    },
    async send(body: string) {
      running = deferred();
      sent += 1;
      const result = await bridge.channelSend({
        channelId: dm.id,
        messageId: humanMessageId(sent),
        body,
      });
      expect(result).toMatchObject({ ok: true });
      await running.promise;
    },
    botMessages() {
      return core.channels.readMessages(dm.id).filter((message) => message.author.kind === 'bot');
    },
    async close() {
      await core.runtime.close();
      await adapter.close();
      core.operationalDatabase.close();
    },
  };
}

describe('A Human stop mid-stream', () => {
  it('discards the half-streamed message with the interrupted note and commits nothing', async () => {
    const f = dshFixture();
    try {
      f.script(async (session) => {
        for (const [index, fragment] of [
          `{"channel_id":"${f.dm.id}","body":"Here is the first half`,
          ' of the report',
        ].entries())
          f.adapter.acceptAssistantStream?.(session.id, delta(fragment, index));
        await f.cancelled(session.id);
      });
      await f.send('Write the report');
      await vi.waitFor(() => expect(f.drafts.some((event) => event.type === 'update')).toBe(true));

      const stopped = await f.bridge.channelBotStop({ channelId: f.dm.id, botSlug: 'ada' });
      expect(stopped).toMatchObject({ ok: true });
      await f.core.runtime.whenIdle();

      expect(f.drafts.at(-1)).toMatchObject({ type: 'abandoned', reason: 'interrupted' });
      expect(f.drafts.some((event) => event.type === 'settled')).toBe(false);
      expect(f.botMessages()).toEqual([]);
    } finally {
      await f.close();
    }
  });
});

describe('A Human stop mid-tool-call', () => {
  it('records the running call as stopped with an unknown result and tells the next turn once', async () => {
    const f = dshFixture();
    try {
      f.script(async (session) => {
        session.append('tool/call', {
          turn: 1,
          step: 1,
          callId: 'call-read',
          name: 'channel_read',
          arguments: '{}',
        });
        session.append('tool/result', {
          turn: 1,
          step: 1,
          message: { role: 'tool', source: { callId: 'call-read' }, content: [] },
        });
        session.append('tool/call', {
          turn: 1,
          step: 1,
          callId: 'call-deploy',
          name: 'bash',
          arguments: '{"command":"./deploy.sh production"}',
        });
        await f.cancelled(session.id);
        session.append('tool/result', {
          turn: 1,
          step: 1,
          message: { role: 'tool', source: { callId: 'call-deploy' }, content: [] },
        });
      });
      await f.send('Deploy it');
      expect(await f.bridge.channelBotStop({ channelId: f.dm.id, botSlug: 'ada' })).toMatchObject({
        ok: true,
      });
      await f.core.runtime.whenIdle();

      f.script(async () => undefined);
      await f.send('What happened?');
      await f.core.runtime.whenIdle();
      f.script(async () => undefined);
      await f.send('And now?');
      await f.core.runtime.whenIdle();

      const [, next, later] = [...f.host.received.values()][0]!;
      expect(textOf(next)).toContain('stopped by the Human with an unknown result');
      expect(textOf(next)).toContain(
        'bash (call call-deploy): {"command":"./deploy.sh production"}',
      );
      expect(textOf(next)).not.toContain('call-read');
      expect(textOf(later)).not.toContain('unknown result');
    } finally {
      await f.close();
    }
  });

  it('refuses a side effect that a drained call reaches after the stop', async () => {
    const f = dshFixture();
    let refusal: unknown;
    try {
      f.script(async (session, tools) => {
        await f.cancelled(session.id);
        const send = tools.find((tool) => tool.name === 'bot_send_message')!;
        try {
          await send.execute({ channel_id: f.dm.id, body: 'Sent after the stop' }, {
            callId: 'call-late',
            signal: new AbortController().signal,
          } as ToolRunContext);
        } catch (error) {
          refusal = error;
        }
      });
      await f.send('Tell me when done');
      await f.bridge.channelBotStop({ channelId: f.dm.id, botSlug: 'ada' });
      await f.core.runtime.whenIdle();

      expect(String(refusal)).toContain('The Human stopped this Session');
      expect(f.botMessages()).toEqual([]);
    } finally {
      await f.close();
    }
  });
});

describe('A stop that does not settle', () => {
  it('abandons the hung Orchestrator run after the deadline so the next message runs', async () => {
    const f = dshFixture({ stopSettleTimeoutMs: 50 });
    try {
      f.script(() => never());
      await f.send('Start');
      const sessionId = f.core.runtime.currentOrchestratorSessionId!('ada')!;

      const stopped = await f.bridge.channelBotStop({ channelId: f.dm.id, botSlug: 'ada' });
      expect(stopped).toMatchObject({ ok: true, value: { stopped: { sessionId } } });
      expect(f.host.disposed).toContain(sessionId);

      f.script(async () => undefined);
      await f.send('Again');
      await f.core.runtime.whenIdle();
      expect(f.host.received.get(sessionId)).toHaveLength(2);
    } finally {
      await f.close();
    }
  });
});

function scriptedAgents() {
  const assignmentRuns: AssignmentAgentRun[] = [];
  const finishes = new Map<string, () => void>();
  const abandoned: string[] = [];
  let orchestrator: ((run: OrchestratorAgentRun) => Promise<void>) | undefined;
  let stopTurn: (() => void) | undefined;
  let sessionId: string | undefined;
  let hangOnStop = false;
  const hold = (id: string) => new Promise<void>((resolve) => finishes.set(id, resolve));
  const adapter: BotAgentAdapter = {
    async runOrchestrator(run) {
      sessionId = run.sessionId;
      const stop = deferred();
      stopTurn = stop.resolve;
      try {
        await orchestrator?.({ ...run, stopped: stop.promise } as OrchestratorAgentRun);
      } finally {
        sessionId = undefined;
      }
    },
    stopOrchestratorTurn() {
      stopTurn?.();
      return sessionId;
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
      if (hangOnStop) return never();
      finishes.get(id)?.();
    },
    async abandonSession(id) {
      abandoned.push(id);
      finishes.get(id)?.();
    },
    async close() {
      for (const finish of finishes.values()) finish();
    },
  };
  return {
    adapter,
    assignmentRuns,
    abandoned,
    finish: (id: string) => finishes.get(id)?.(),
    orchestrate(next: (run: OrchestratorAgentRun & { stopped: Promise<void> }) => Promise<void>) {
      orchestrator = next as (run: OrchestratorAgentRun) => Promise<void>;
    },
    hangOnStop() {
      hangOnStop = true;
    },
  };
}

async function assignmentFixture(options: { stopSettleTimeoutMs?: number } = {}) {
  const home = createTempRoot('bh-stop-safety-assignment-');
  const live = scriptedAgents();
  const closed: string[][] = [];
  const core = createCore({
    dshHome: home,
    agents: live.adapter,
    closeSessionApprovals: (ids) => closed.push([...ids]),
    ...(options.stopSettleTimeoutMs === undefined
      ? {}
      : { stopSettleTimeoutMs: options.stopSettleTimeoutMs }),
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
  return {
    core,
    bridge,
    live,
    dm,
    closed,
    human(body: string) {
      sent += 1;
      const admission = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: `human-${sent}`,
        body,
      });
      if (!admission.admitted) throw new Error('Not admitted');
      return admission.settled;
    },
    async close() {
      await live.adapter.close();
      await core.runtime.whenIdle();
      await core.runtime.close();
      core.operationalDatabase.close();
    },
  };
}

describe('A Human stop mid-Assignment-creation', () => {
  it('stops the Assignment the stopped turn was creating and refuses further creates', async () => {
    const f = await assignmentFixture();
    let created: string | undefined;
    let refusal: unknown;
    const creating = deferred();
    try {
      f.live.orchestrate(async (run) => {
        const outcome = run.assignments.create!({
          grantId: TEST_GRANT_ID,
          title: 'Crawl every page',
          description: 'Crawl every page',
        });
        if (outcome.outcome === 'created') created = outcome.assignment.sessionId;
        creating.resolve();
        await run.stopped;
        try {
          run.assignments.create!({
            grantId: TEST_GRANT_ID,
            title: 'Second crawl',
            description: 'Second crawl',
          });
        } catch (error) {
          refusal = error;
        }
      });
      const turn = f.human('Crawl the site');
      await creating.promise;
      expect(f.core.runtime.getAssignment('ada', created!)).toMatchObject({ activity: 'working' });

      expect(await f.bridge.channelBotStop({ channelId: f.dm.id, botSlug: 'ada' })).toMatchObject({
        ok: true,
      });
      await turn;

      expect(f.core.runtime.getAssignment('ada', created!)).toMatchObject({ activity: 'stopped' });
      expect(String(refusal)).toContain('The Human stopped this Session');
      expect(f.core.runtime.listAssignments('ada')).toHaveLength(1);
      expect(f.live.assignmentRuns).toHaveLength(1);
    } finally {
      await f.close();
    }
  });
});

describe('Session Stop on an Assignment', () => {
  it('closes its approval cards and carries its interrupted tool calls into the next request', async () => {
    const f = await assignmentFixture();
    let sessionId: string | undefined;
    try {
      f.live.orchestrate(async (run) => {
        const outcome = run.assignments.create!({
          grantId: TEST_GRANT_ID,
          title: 'Migrate the database',
          description: 'Migrate the database',
        });
        if (outcome.outcome === 'created') sessionId = outcome.assignment.sessionId;
      });
      await f.human('Migrate it');
      f.live.assignmentRuns[0]!.accepted?.();
      f.live.assignmentRuns[0]!.toolsInterrupted?.([
        { callId: 'call-migrate', name: 'bash', arguments: '{"command":"./migrate.sh"}' },
      ]);

      const result = await f.bridge.sessionStop({ botSlug: 'ada', sessionId });
      expect(result).toMatchObject({ ok: true, value: { stopped: [{ sessionId }] } });
      expect(f.closed).toContainEqual([sessionId]);

      f.live.orchestrate(async (run) => {
        run.assignments.request!({ sessionId: sessionId!, mode: 'next-turn', text: 'Continue' });
      });
      await f.human('Please continue the migration');
      const resumed = f.live.assignmentRuns.at(-1)!;
      expect(resumed.text).toContain('bash (call call-migrate): {"command":"./migrate.sh"}');
      expect(resumed.text.endsWith('Continue')).toBe(true);
    } finally {
      await f.close();
    }
  });

  it('marks a stop that does not settle within the deadline as stopped', async () => {
    const f = await assignmentFixture({ stopSettleTimeoutMs: 50 });
    let sessionId: string | undefined;
    try {
      f.live.orchestrate(async (run) => {
        const outcome = run.assignments.create!({
          grantId: TEST_GRANT_ID,
          title: 'Hang forever',
          description: 'Hang forever',
        });
        if (outcome.outcome === 'created') sessionId = outcome.assignment.sessionId;
      });
      await f.human('Start');
      f.live.hangOnStop();

      const result = await f.bridge.sessionStop({ botSlug: 'ada', sessionId });
      expect(result).toMatchObject({ ok: true, value: { stopped: [{ sessionId }] } });
      expect(f.live.abandoned).toEqual([sessionId]);
      expect(f.core.runtime.getAssignment('ada', sessionId!)).toMatchObject({
        activity: 'stopped',
      });
    } finally {
      await f.close();
    }
  });
});
