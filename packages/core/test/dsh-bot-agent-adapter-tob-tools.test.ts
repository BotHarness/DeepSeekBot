import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { TOB_GROUP_TOOL_CASES, reportRun } from './support/dsh-bot-agent-adapter.js';

describe('DSH Bot Agent adapter', () => {
  it('keeps the model tool catalog across changes to management authority', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.boolean(), { minLength: 1, maxLength: 5 }), async (states) => {
        const catalog: string[][] = [];
        const host = new FakeAgentHost(
          { kind: 'completed' },
          {
            onTurn: async (_session, tools) => {
              catalog.push(tools.map((tool) => tool.name).sort());
            },
          },
        );
        const adapter = createDshBotAgentAdapter({
          agents: host,
          defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
          orchestratorCwd: () => '/memory/ada',
          ensureWorkspace: () => undefined,
        });
        try {
          for (const [index, tobCli] of [false, ...states].entries())
            await adapter.runOrchestrator({ ...reportRun, resume: index > 0, tobCli });
          const first = catalog[0];
          expect(first).toBeDefined();
          expect(first).not.toContain('bot_create');
          for (const [name] of TOB_GROUP_TOOL_CASES) expect(first).toContain(name);
          for (const tools of catalog) expect(tools).toEqual(first);
        } finally {
          await adapter.close();
        }
      }),
      { numRuns: 15 },
    );
  });
});

describe('model-free Tob preparation cancellation', () => {
  it.each([
    { operation: 'create', cancellation: 'signal' },
    { operation: 'resume', cancellation: 'signal' },
    { operation: 'create', cancellation: 'session-stop' },
    { operation: 'resume', cancellation: 'session-stop' },
  ] satisfies { operation: 'create' | 'resume'; cancellation: 'signal' | 'session-stop' }[])(
    'cancels pending native $operation through $cancellation and disposes its late handle before execution',
    async ({ operation, cancellation }) => {
      const agents = new FakeAgentHost();
      let release: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const originalCreate = agents.create.bind(agents);
      const originalResume = agents.resume.bind(agents);
      const pending =
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
      const complete = vi.fn();
      let settled = false;
      const running = adapter
        .runOrchestrator({
          ...reportRun,
          resume: operation === 'resume',
          tobCli: true,
          tobCliTurn: {
            command: { argv: ['approval-templates'], stdin: '' },
            signal: controller.signal,
            complete,
          },
        })
        .then(
          () => {
            settled = true;
          },
          () => {
            settled = true;
          },
        );
      try {
        await vi.waitFor(() => expect(pending).toHaveBeenCalledOnce());
        expect(adapter.steerOrchestrator?.(reportRun.bot.slug, 'interruption')).toBe(false);
        if (cancellation === 'signal') controller.abort();
        else expect(adapter.stopOrchestratorTurn?.(reportRun.bot.slug)).toBe(reportRun.sessionId);
        await vi.waitFor(() => expect(settled).toBe(true), { timeout: 500, interval: 5 });
        expect(complete).not.toHaveBeenCalled();
        release?.();
        await vi.waitFor(() => expect(agents.disposed).toContain(reportRun.sessionId));
        expect(agents.received.get(reportRun.sessionId) ?? []).toEqual([]);
      } finally {
        release?.();
        await running;
        await adapter.close();
      }
    },
  );
});
