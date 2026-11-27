import { createAssistantMessage, ToolCallId } from '@deepseek-ai/dsh-llm';
import { Session, SessionId } from '@deepseek-ai/dsh-session';
import { expect, it, vi } from 'vitest';
import type { AssignmentAgentRun } from '../src/runtime/bot-runtime.js';
import { createDshBotAgentAdapter } from '../src/agent-adapter.js';
import { type DshBotAgentAdapterOptions } from '../src/runtime/dsh-bot-agent-adapter.js';
import { deferred } from './deferred.js';
import { FakeAgentHost, FAKE_BOT as BOT } from './dsh-agent-host-fixture.js';
import { executeFixtureNativeTool } from './fixtures/native-tools.js';

const route = { provider: 'first', model: 'test' };

function setup(options: Partial<DshBotAgentAdapterOptions> = {}) {
  return createDshBotAgentAdapter({
    agents: new FakeAgentHost(),
    defaultModel: { currentSelection: () => route },
    orchestratorCwd: () => '/memory/ada',
    ensureWorkspace: () => undefined,
    ...options,
  });
}

function assignment() {
  const report = vi.fn<AssignmentAgentRun['report']>(async (input) => ({
    ...input,
    at: BOT.createdAt,
  }));
  return {
    sessionId: 'assignment-1',
    bot: BOT,
    text: 'Check the release.',
    permission: {
      grantId: 'grant-1',
      workspaceId: 'workspace-1',
      primaryCwd: '/project',
      mode: 'workspace-write',
      approval: 'ask',
      presetRevision: 0,
    },
    report,
  } satisfies AssignmentAgentRun;
}

it('rejects Inbox acceptance when a mixed Assignment follow-up stops during preparation', async () => {
  const checking = deferred<void>();
  const checked = deferred<void>();
  const adapter = setup({
    prepareModelRoute: () => {
      checking.resolve();
      return checked.promise;
    },
  });
  try {
    const delivery = adapter.requestAssignment({
      ...assignment(),
      selectGroupTarget: async () => ({ kind: 'route', route }),
    });
    if (delivery.delivery !== 'followup') throw new Error('Expected a follow-up');
    const acceptance = vi.fn();
    const settled = delivery.accepted.then(
      () => acceptance('accepted'),
      (error: unknown) => acceptance(error),
    );
    await checking.promise;
    await adapter.stopAssignment!('assignment-1');
    checked.resolve();
    await delivery.done;
    await vi.waitFor(
      () =>
        expect(acceptance).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Assignment finished before Inbox acceptance' }),
        ),
      { timeout: 300 },
    );
    await settled;
  } finally {
    checked.resolve();
    await adapter.close();
  }
});

it.each(['native', 'engine'])(
  'publishes the final text after only a progress report on the %s Assignment',
  async (kind) => {
    const completed = 'The release is ready.';
    const progress = { state: 'progress', summary: 'Checking the release' };
    const host = new FakeAgentHost(undefined, {
      onTurn: async (session, tools) => {
        const result = await executeFixtureNativeTool(
          {
            callId: ToolCallId('progress'),
            name: 'report_to_orchestrator',
            arguments: progress,
            signal: new AbortController().signal,
          },
          tools,
          [],
        );
        expect(result.isError).toBe(false);
        session.append('assistant/message', {
          message: createAssistantMessage({
            content: [{ type: 'text', text: completed }],
            source: route,
          }),
        });
      },
    });
    const adapter = setup({
      agents: host,
      ...(kind === 'native'
        ? {}
        : {
            engines: {
              engineFor: () => 'codex',
              isLive: () => false,
              release: async () => undefined,
              runTurn: async (request) => {
                const session = Session.create(SessionId(request.sessionId));
                session.append('turn/start', { turn: 1 });
                await request.execute('report_to_orchestrator', progress, request.signal, {
                  session,
                  ask: async () => 'allowed-once',
                });
                return { turn: 1, endSeq: 4, text: completed };
              },
            },
          }),
    });
    const run = assignment();
    try {
      await adapter.runAssignment(run);
      expect(run.report.mock.calls.map(([report]) => report)).toEqual([
        progress,
        { state: 'completed', summary: expect.stringContaining(completed) },
      ]);
    } finally {
      await adapter.close();
    }
  },
);

it('attributes an Assignment failure to the request provider before a steer changes selection', async () => {
  const error = { code: 'INVALID_CREDENTIAL', message: 'Credential refused' };
  const steer = vi.fn();
  const observe = vi.fn();
  const run = { ...assignment(), modelRoute: route };
  const host = new FakeAgentHost(undefined, {
    assignmentTurnEnd: { kind: 'error', error },
    onSessionEvent: (session, event) => {
      if (event.type !== 'turn/start') return;
      session.append('step/start', { turn: 1, step: 1 });
      session.append('request/header', { header: { config: route }, reason: 'initial' });
      queueMicrotask(steer);
    },
  });
  const adapter = setup({ agents: host, observeTurnFailure: observe });
  steer.mockImplementation(() => {
    expect(
      adapter.requestAssignment({ ...run, modelRoute: { provider: 'second', model: 'test' } }),
    ).toEqual({ delivery: 'steer' });
  });
  try {
    await expect(adapter.runAssignment(run)).rejects.toThrow(error.code);
    expect(steer).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledExactlyOnceWith('first', error.code);
  } finally {
    await adapter.close();
  }
});
