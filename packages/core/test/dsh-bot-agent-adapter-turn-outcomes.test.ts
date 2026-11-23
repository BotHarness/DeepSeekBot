import { SessionId, type TurnEndCancelCause } from '@deepseek-ai/dsh-session';
import { type ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it, vi } from 'vitest';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { sessionRefusalMessage } from '../src/workspaces/grant-execution.js';
import type { AssignmentAgentRun } from '../src/runtime/bot-runtime.js';
import { FakeAgentHost, FAKE_BOT as BOT } from './dsh-agent-host-fixture.js';
import { ASSIGNMENT, groupTools, reportRun } from './support/dsh-bot-agent-adapter.js';

describe('DSH Bot Agent adapter', () => {
  it('fails a Turn the Host pre-step refused with the refusal reason instead of blocked', async () => {
    const host = new FakeAgentHost({ kind: 'blocked' }, { onTurn: async () => undefined });
    const refusal = sessionRefusalMessage(
      'Orchestrator Session requires its Memory working directory',
    );
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: {
        currentSelection: () => ({ provider: 'test', model: 'test' }),
      },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
      turnRefusal: (sessionId) => (sessionId === reportRun.sessionId ? refusal : undefined),
    });
    try {
      await expect(adapter.runOrchestrator(reportRun)).rejects.toThrow(
        "MEMORY_CWD_MISMATCH: The Host refused this turn: Orchestrator Session requires its Memory working directory. Start a new Session; it opens in this Bot's Memory directory.",
      );
    } finally {
      await adapter.close();
    }
  });

  it('leaves Session permission and its refusal to admission when it creates or borrows an Agent', async () => {
    const host = new FakeAgentHost(
      { kind: 'blocked' },
      { onTurn: async () => undefined, assignmentTurnEnd: { kind: 'blocked' } },
    );
    await host.create({
      sessionId: SessionId('moved-assignment'),
      meta: { cwd: '/elsewhere' },
    });
    const refusal = sessionRefusalMessage(
      'Assignment Session permission snapshot is missing or mismatched',
    );
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
      turnRefusal: (sessionId) => (sessionId === 'moved-assignment' ? refusal : undefined),
      admitSession: (agent) => void admitted.push(agent.session.id),
    });
    const admitted: string[] = [];
    const permissionEvents = (index: number) =>
      host.sessions[index]!.snapshotEvents().filter(
        (event) => event.type === 'sandbox/mode' || event.type === 'approval/policy',
      );
    try {
      await expect(adapter.runOrchestrator(reportRun)).rejects.toThrow(
        'Agent turn ended without completion: blocked',
      );
      expect(permissionEvents(1)).toEqual([]);
      await expect(
        adapter.runAssignment({
          sessionId: 'moved-assignment',
          bot: BOT,
          text: 'Continue',
          permission: {
            grantId: 'grant-1',
            workspaceId: 'workspace-1',
            primaryCwd: '/project',
            mode: 'workspace-write',
            approval: 'ask',
            presetRevision: 0,
          },
          report: vi.fn(),
        }),
      ).rejects.toThrow(refusal);
      expect(permissionEvents(0)).toEqual([]);
      expect(admitted).toEqual([reportRun.sessionId, 'moved-assignment']);
    } finally {
      await adapter.close();
    }
  });

  it.each<TurnEndCancelCause>([
    { kind: 'user' },
    { kind: 'parent' },
    { kind: 'hook', reason: 'Fixture hook cancellation' },
    { kind: 'disposed' },
    { kind: 'legacy' },
  ])('only reports Human native cancellation identity: $kind', async (reason) => {
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        assignmentTurnEnd: { kind: 'aborted', reason },
        onTurn: async () => undefined,
      },
    );
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    const cancelledTurn = vi.fn();
    const completedTurn = vi.fn();
    const report = vi.fn();
    try {
      await expect(
        adapter.runAssignment({
          sessionId: 'native-cancel-assignment',
          bot: BOT,
          text: 'Cancelled work',
          permission: {
            grantId: 'grant-1',
            workspaceId: 'workspace-1',
            primaryCwd: '/project',
            mode: 'workspace-write',
            approval: 'ask',
            presetRevision: 0,
          },
          cancelledTurn,
          completedTurn,
          report,
        }),
      ).rejects.toThrow('Agent turn ended without completion: aborted');
      const end = host.sessions[0]!.snapshotEvents().find((e) => e.type === 'turn/end')!;
      if (reason.kind === 'user')
        expect(cancelledTurn).toHaveBeenCalledExactlyOnceWith({ turn: 1, endSeq: end.seq });
      else expect(cancelledTurn).not.toHaveBeenCalled();
      expect(completedTurn).not.toHaveBeenCalled();
      expect(report).not.toHaveBeenCalled();
    } finally {
      await adapter.close();
    }
  });

  it.each([true, false])(
    'ends a Human-stopped Orchestrator turn without an error (stopped: %s)',
    async (stopped) => {
      let started!: () => void;
      let finish!: () => void;
      const running = new Promise<void>((resolve) => {
        started = resolve;
      });
      const host = new FakeAgentHost(
        stopped ? { kind: 'aborted', reason: { kind: 'user' } } : { kind: 'completed' },
        {
          onTurn: () =>
            new Promise<void>((resolve) => {
              finish = resolve;
              started();
            }),
        },
      );
      const adapter = createDshBotAgentAdapter({
        agents: host,
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
        orchestratorCwd: () => '/memory/ada',
        ensureWorkspace: () => undefined,
      });
      try {
        expect(adapter.stopOrchestratorTurn?.(BOT.slug)).toBeUndefined();
        const turn = adapter.runOrchestrator(reportRun);
        await running;
        if (stopped) {
          expect(adapter.stopOrchestratorTurn?.(BOT.slug)).toBe('orchestrator-ada');
          expect(host.cancelled).toEqual([
            { sessionId: 'orchestrator-ada', reason: { kind: 'user' } },
          ]);
        }
        finish();
        await expect(turn).resolves.toBeUndefined();
        expect(adapter.stopOrchestratorTurn?.(BOT.slug)).toBeUndefined();
      } finally {
        await adapter.close();
      }
    },
  );

  it('still fails an Orchestrator turn aborted by anything but a Human stop', async () => {
    const host = new FakeAgentHost(
      { kind: 'aborted', reason: { kind: 'user' } },
      { onTurn: async () => undefined },
    );
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    try {
      await expect(adapter.runOrchestrator(reportRun)).rejects.toThrow(
        'Agent turn ended without completion: aborted',
      );
    } finally {
      await adapter.close();
    }
  });

  it('reports only the committed native error identity without fabricating a Report or completion', async () => {
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        assignmentTurnEnd: {
          kind: 'error',
          error: { code: 'UNKNOWN', message: 'PRIVATE_QA_ERROR_CANARY' },
        },
        onTurn: async () => undefined,
      },
    );
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    const failedTurn = vi.fn();
    const completedTurn = vi.fn();
    const cancelledTurn = vi.fn();
    const report = vi.fn();
    try {
      await expect(
        adapter.runAssignment({
          sessionId: 'native-error-assignment',
          bot: BOT,
          text: 'Failing work',
          permission: {
            grantId: 'grant-1',
            workspaceId: 'workspace-1',
            primaryCwd: '/project',
            mode: 'workspace-write',
            approval: 'ask',
            presetRevision: 0,
          },
          failedTurn,
          completedTurn,
          cancelledTurn,
          report,
        }),
      ).rejects.toThrow('UNKNOWN: PRIVATE_QA_ERROR_CANARY');
      const end = host.sessions[0]!.snapshotEvents().find((e) => e.type === 'turn/end')!;
      expect(failedTurn).toHaveBeenCalledExactlyOnceWith({ turn: 1, endSeq: end.seq });
      expect(completedTurn).not.toHaveBeenCalled();
      expect(cancelledTurn).not.toHaveBeenCalled();
      expect(report).not.toHaveBeenCalled();
    } finally {
      await adapter.close();
    }
  });

  it('rejects when the durable turn outcome is an error even though the Agent becomes idle', async () => {
    const host = new FakeAgentHost({
      kind: 'error',
      error: { code: 'TRANSPORT', message: 'DeepSeek API request failed' },
    });
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });

    await expect(
      adapter.runOrchestrator({
        sessionId: 'orchestrator-ada',
        resume: false,
        bot: BOT,
        inboundChannelId: 'dm-test',
        inbox: '',
        message: '请核对发布状态',
        channels: {
          ...groupTools,
          contacts: async () => ({ outputLimit: 12_000, contacts: [] }),
          sendToBot: async () => {
            throw new Error('unexpected Bot DM');
          },
          ignore: () => ({
            sourceEventId: 'source-1',
            ignoredAt: BOT.createdAt,
            alreadyIgnored: false,
          }),
          read: () => [],
          requestGrant: async () => undefined as never,
          send: async () => undefined as never,
        },
        assignments: {
          create: () => ({ outcome: 'created', assignment: ASSIGNMENT }),
          grants: () => [],
          list: () => [],
          inspect: () => undefined,
          stop: async () => ({
            sessionId: 'test',
            title: 'test',
            description: 'test',
            activity: 'stopped',
            createdAt: '',
            updatedAt: '',
          }),
          request: () => ({ assignment: ASSIGNMENT, delivery: 'followup' }),
        },
      }),
    ).rejects.toThrow(/TRANSPORT.*DeepSeek API request failed/);

    await adapter.close();
  });

  it.each(['prepare', 'resume', 'native-send'] as const)(
    'exposes the %s acceptance failure separately from completion',
    async (phase) => {
      const host = new FakeAgentHost();
      if (phase === 'resume')
        vi.spyOn(host, 'resume').mockRejectedValueOnce(new Error('cold resume unavailable'));
      const adapter = createDshBotAgentAdapter({
        agents: host,
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
        orchestratorCwd: () => '/memory/ada',
        ensureWorkspace: () => undefined,
        ...(phase === 'prepare'
          ? {
              prepareModelRoute: async () => {
                throw new Error('model preparation unavailable');
              },
            }
          : {}),
      });
      const run: AssignmentAgentRun = {
        sessionId: 'acceptance-test',
        bot: BOT,
        text: 'Answer',
        resume: true,
        permission: {
          grantId: 'grant-1',
          workspaceId: 'workspace-1',
          primaryCwd: '/project',
          mode: 'workspace-write',
          approval: 'ask',
          presetRevision: 0,
        },
        report: async (input) => ({ ...input, at: BOT.createdAt }),
      };
      if (phase === 'native-send') {
        await adapter.runAssignment({ ...run, resume: false });
        vi.spyOn(host.get(run.sessionId)!, 'followup').mockImplementationOnce(() => {
          throw new Error('native send threw');
        });
      }
      try {
        const result = adapter.requestAssignment(run);
        if (result.delivery !== 'followup') throw new Error('Missing followup');
        const [acceptance, completion] = await Promise.allSettled([result.accepted, result.done]);
        expect(acceptance.status).toBe('rejected');
        expect(completion.status).toBe('rejected');
        if (acceptance.status !== 'rejected') throw new Error('Missing refusal');
        expect(acceptance.reason.message).toContain(
          phase === 'native-send' ? 'acceptance is uncertain' : 'unavailable',
        );
      } finally {
        await adapter.close();
      }
    },
  );

  it.each([true, false])(
    'joins native Assignment input without replay, accepted=%s',
    async (accept) => {
      const host = new FakeAgentHost();
      const adapter = createDshBotAgentAdapter({
        agents: host,
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
        orchestratorCwd: () => '/memory/ada',
        ensureWorkspace: () => undefined,
      });
      const run: AssignmentAgentRun = {
        sessionId: 'native-wake-assignment',
        bot: BOT,
        text: 'Initial',
        permission: {
          grantId: 'grant-1',
          workspaceId: 'workspace-1',
          primaryCwd: '/project',
          mode: 'workspace-write',
          approval: 'ask',
          presetRevision: 0,
        },
        report: async (input) => ({ ...input, at: BOT.createdAt }),
      };
      try {
        await adapter.runAssignment(run);
        const agent = host.get(run.sessionId)!;
        agent.session.append('turn/start', { turn: 2 });
        const followup = vi.spyOn(agent, 'followup');
        const ready = vi.fn();
        const report = vi.fn(run.report);
        const completed = vi.fn();
        vi.spyOn(agent, 'whenIdle').mockImplementationOnce(async () => {
          const tool = host.scopes
            .get(run.sessionId)!
            .tools.find((definition) => definition.name === 'report_to_orchestrator')!;
          await tool.execute(
            { state: 'completed', summary: 'Native child finished' },
            {} as ToolRunContext,
          );
          agent.session.append('turn/end', { turn: 2, reason: { kind: 'completed' } });
        });
        await adapter.runAssignment({
          ...run,
          text: '',
          resume: true,
          report,
          completedTurn: completed,
          setExecutionReady: ready,
          acceptNativeInput: () => {
            expect(ready).toHaveBeenLastCalledWith(true);
            return accept;
          },
        });
        expect(followup).not.toHaveBeenCalled();
        expect(ready.mock.calls).toEqual([[true], [false]]);
        expect(report).toHaveBeenCalledTimes(accept ? 1 : 0);
        expect(completed).toHaveBeenCalledTimes(accept ? 1 : 0);
        if (accept)
          expect(report).toHaveBeenCalledWith(
            { state: 'completed', summary: 'Native child finished' },
            { turn: 2 },
          );
      } finally {
        await adapter.close();
      }
    },
  );

  it('acknowledges native Inbox acceptance before the resumed turn finishes', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const host = new FakeAgentHost({ kind: 'completed' }, { onTurn: () => pending });
    const adapter = createDshBotAgentAdapter({
      agents: host,
      hasSession: async () => false,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    try {
      const result = adapter.requestAssignment({
        sessionId: 'delayed-completion',
        bot: BOT,
        text: 'Answer',
        resume: true,
        permission: {
          grantId: 'grant-1',
          workspaceId: 'workspace-1',
          primaryCwd: '/project',
          mode: 'workspace-write',
          approval: 'ask',
          presetRevision: 0,
        },
        report: async (input) => ({ ...input, at: BOT.createdAt }),
      });
      if (result.delivery !== 'followup') throw new Error('Missing followup');
      let completed = false;
      void result.done.then(() => {
        completed = true;
      });
      await result.accepted;
      expect(completed).toBe(false);
      finish();
      await result.done;
      expect(completed).toBe(true);
    } finally {
      finish();
      await adapter.close();
    }
  });
});

it('keeps a cancelled native publication reserved until its late handle is cleaned up', async () => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const agents = new FakeAgentHost({ kind: 'completed' }, { onTurn: async () => {} });
  const original = agents.create.bind(agents);
  const create = vi.spyOn(agents, 'create').mockImplementation(async (options) => {
    const handle = await original(options);
    await gate;
    return handle;
  });
  const adapter = createDshBotAgentAdapter({
    agents,
    defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    orchestratorCwd: () => '/memory/ada',
    ensureWorkspace: () => undefined,
  });
  const controller = new AbortController();
  const cancelled = adapter
    .runOrchestrator({
      ...reportRun,
      tobCli: true,
      tobCliTurn: {
        command: { argv: ['approval-templates'], stdin: '' },
        signal: controller.signal,
        complete: () => {
          throw Error('must not execute');
        },
      },
    })
    .catch(() => undefined);
  try {
    await vi.waitFor(() => expect(agents.get(reportRun.sessionId)).toBeDefined());
    controller.abort();
    await cancelled;
    await expect(
      adapter.runOrchestrator({ ...reportRun, message: 'Must wait for native cleanup' }),
    ).rejects.toThrow('preparation');
    expect(agents.received.get(reportRun.sessionId) ?? []).toEqual([]);
    expect(create.mock.calls[0]?.[0].signal?.aborted).toBe(true);
    release?.();
    await vi.waitFor(() => expect(agents.disposed).toContain(reportRun.sessionId));
    create.mockRestore();
    await adapter.runOrchestrator({ ...reportRun, message: 'Run safely after cleanup' });
    expect(agents.received.get(reportRun.sessionId)).toHaveLength(1);
    expect(agents.get(reportRun.sessionId)).toBeDefined();
  } finally {
    release?.();
    await cancelled;
    await adapter.close();
  }
});

it.each(['create', 'resume'] as const)(
  'cancels direct effect execution during native %s before running the Tool',
  async (operation) => {
    const agents = new FakeAgentHost();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const originalCreate = agents.create.bind(agents);
    const originalResume = agents.resume.bind(agents);
    const native =
      operation === 'create'
        ? vi.spyOn(agents, 'create').mockImplementation(async (options) => {
            const handle = await originalCreate(options);
            await gate;
            return handle;
          })
        : vi.spyOn(agents, 'resume').mockImplementation(async (options) => {
            const handle = await originalResume(options);
            await gate;
            return handle;
          });
    const adapter = createDshBotAgentAdapter({
      agents,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    const controller = new AbortController();
    let settled = false;
    const sendToBot = vi.fn(async (): Promise<never> => {
      throw new Error('must not execute');
    });
    const running = adapter.runDirectTool!(
      {
        ...reportRun,
        resume: operation === 'resume',
        channels: { ...reportRun.channels, sendToBot },
      },
      'bot_send_message',
      { bot_id: 'fixture-missing', message: 'fixture' },
      controller.signal,
    ).then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    try {
      await vi.waitFor(() => expect(native).toHaveBeenCalledOnce());
      controller.abort();
      await vi.waitFor(() => expect(settled).toBe(true), { timeout: 500, interval: 5 });
      expect(native.mock.calls[0]?.[0].signal?.aborted).toBe(true);
      release?.();
      await vi.waitFor(() => expect(agents.disposed).toContain(reportRun.sessionId));
      expect(sendToBot).not.toHaveBeenCalled();
    } finally {
      release?.();
      await running;
      await adapter.close();
    }
  },
);
