import type { Agent } from '@deepseek-ai/dsh-agent';
import { describe, expect, it, vi } from 'vitest';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost, FAKE_BOT as BOT } from './dsh-agent-host-fixture.js';
import { ASSIGNMENT, reportRun } from './support/dsh-bot-agent-adapter.js';

describe('direct Subagent execution', () => {
  it('passes the report identity through the direct inspect tool without selecting latest text', async () => {
    const reportPage = vi.fn(async () => ({
      reportSourceEventId: 'report-a',
      text: 'A remainder',
      offset: 2000,
      totalCharacters: 2011,
      matchedEvents: 2,
      readCount: 2,
      sourceEventBytes: 5000,
      returnedCharacters: 11,
      estimatedTokens: 3,
    }));
    const adapter = createDshBotAgentAdapter({
      agents: new FakeAgentHost(),
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    });
    const run = {
      ...reportRun,
      assignments: {
        ...reportRun.assignments,
        inspect: () => ({
          ...ASSIGNMENT,
          botSlug: BOT.slug,
          sourceEventId: 'assignment-origin',
          latestReport: { state: 'progress' as const, summary: 'B', at: BOT.createdAt },
        }),
        reportPage,
      },
    };
    try {
      const result = await adapter.runDirectTool!(
        run,
        'inspect_assignment',
        {
          session_id: ASSIGNMENT.sessionId,
          report_offset: 2000,
          report_source_event_id: 'report-a',
        },
        new AbortController().signal,
      );
      expect(reportPage).toHaveBeenCalledWith({
        sessionId: ASSIGNMENT.sessionId,
        offset: 2000,
        reportSourceEventId: 'report-a',
      });
      expect(result).toMatchObject({
        reportPage: { reportSourceEventId: 'report-a', text: 'A remainder' },
      });
      await expect(
        adapter.runDirectTool!(
          run,
          'inspect_assignment',
          {
            session_id: ASSIGNMENT.sessionId,
            report_source_event_id: 'report-a',
          },
          new AbortController().signal,
        ),
      ).rejects.toThrow('REPORT_OFFSET_REQUIRED');
    } finally {
      await adapter.close();
    }
  });

  it.each(['secret_cli', 'secret_http', 'protected_cli', 'secret_mcp_connect', 'ask_secret'])(
    'executes %s through the live parent tool pipeline without a model turn',
    async (name) => {
      const agents = new FakeAgentHost();
      const execute = vi.fn(async () => ({
        isError: true,
        error: { message: 'Select with ask_secret', info: { code: 'private-source-required' } },
      }));
      const parent = {
        id: 'live-parent',
        ctx: { tools: { execute, get: () => ({ name }) } },
      } as unknown as Agent;
      vi.spyOn(agents, 'get').mockReturnValue(parent);
      const adapter = createDshBotAgentAdapter({
        agents,
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      });
      try {
        await expect(
          adapter.runDirectTool!(
            reportRun,
            name,
            { account: 'synthetic' },
            new AbortController().signal,
            'live-parent',
          ),
        ).rejects.toMatchObject({ code: 'private-source-required' });
        expect(execute).toHaveBeenCalledOnce();
        expect(execute).toHaveBeenCalledWith(
          expect.objectContaining({ agent: parent, name, arguments: { account: 'synthetic' } }),
        );
        expect(agents.createOptions).toEqual([]);
      } finally {
        await adapter.close();
      }
    },
  );
  function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>((accept) => {
      resolve = accept;
    });
    return { promise, resolve };
  }
  it.each(['stop', 'steer'] as const)(
    'keeps a later Human turn reachable for %s while a direct Subagent is pending',
    async (operation) => {
      const directResult = deferred<{ isError: false; value: string }>();
      const activeTurn = deferred<void>();
      const turnStarted = deferred<void>();
      let turns = 0;
      const agents = new FakeAgentHost(
        { kind: 'completed' },
        {
          onTurn: async () => {
            if (++turns === 1) return;
            turnStarted.resolve();
            await activeTurn.promise;
          },
          onAgentCreated: (agent) => {
            Object.assign((agent as Agent).ctx.tools, {
              execute: () => directResult.promise,
            });
          },
        },
      );
      const adapter = createDshBotAgentAdapter({
        agents,
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
        orchestratorCwd: () => '/memory/ada',
        ensureWorkspace: () => undefined,
        subagentTools: () => [],
      });
      let direct: Promise<unknown> | undefined;
      let turn: Promise<void> | undefined;
      try {
        await adapter.runOrchestrator(reportRun);
        direct = adapter.runDirectTool!(
          { ...reportRun, sessionId: 'direct-pending-subagent' },
          'bot_subagent',
          { description: 'Review', prompt: 'Review', run_in_background: false },
          new AbortController().signal,
          reportRun.sessionId,
        );
        turn = adapter.runOrchestrator({ ...reportRun, resume: true, message: 'A new request' });
        await turnStarted.promise;
        if (operation === 'stop') {
          expect(adapter.stopOrchestratorTurn?.(BOT.slug)).toBe(reportRun.sessionId);
          expect(agents.cancelled).toEqual([
            { sessionId: reportRun.sessionId, reason: { kind: 'user' } },
          ]);
        } else {
          expect(adapter.steerOrchestrator?.(BOT.slug, 'Update the active request')).toBe(true);
          expect(agents.steered.get(reportRun.sessionId)).toHaveLength(1);
        }
      } finally {
        directResult.resolve({ isError: false, value: 'complete' });
        activeTurn.resolve();
        await Promise.allSettled([direct, turn]);
        await adapter.close();
      }
    },
  );

  it('requires an existing parent without creating a replacement Agent', async () => {
    const agents = new FakeAgentHost();
    const adapter = createDshBotAgentAdapter({
      agents,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      subagentTools: () => [],
    });
    try {
      await expect(
        adapter.runDirectTool!(reportRun, 'bot_subagent', {}, new AbortController().signal),
      ).rejects.toMatchObject({ code: 'parent-unavailable' });
      expect(agents.createOptions).toEqual([]);
      expect(agents.resumeOptions).toEqual([]);
    } finally {
      await adapter.close();
    }
  });

  it.each([false, true])(
    'preserves the parent native pipeline result (refused: %s)',
    async (refused) => {
      const agents = new FakeAgentHost();
      const execute = vi.fn(async () =>
        refused
          ? {
              isError: true,
              error: { message: 'Preset is not allowed', info: { code: 'INVALID_ARGS' } },
            }
          : { isError: false, value: '{"accepted":true}' },
      );
      const parent = { id: 'live-parent', ctx: { tools: { execute } } } as unknown as Agent;
      vi.spyOn(agents, 'get').mockReturnValue(parent);
      const adapter = createDshBotAgentAdapter({
        agents,
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
        subagentTools: () => [],
      });
      const signal = new AbortController().signal;
      const args = { description: 'Review', prompt: 'Review', agent_preset: 'reviewer' };
      try {
        const result = adapter.runDirectTool!(
          reportRun,
          'bot_subagent',
          args,
          signal,
          'live-parent',
        );
        if (refused) await expect(result).rejects.toMatchObject({ code: 'invalid-args' });
        else await expect(result).resolves.toEqual({ accepted: true });
        expect(execute).toHaveBeenCalledWith(
          expect.objectContaining({ agent: parent, signal, arguments: args, name: 'bot_subagent' }),
        );
        expect(agents.createOptions).toEqual([]);
      } finally {
        await adapter.close();
      }
    },
  );
});
