import { describe, expect, it, vi } from 'vitest';
import { createDshBotAgentAdapter } from '../src/agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { TOB_GROUP_TOOL_CASES, reportRun } from './support/dsh-bot-agent-adapter.js';

describe('DSH Bot Agent adapter', () => {
  it('keeps the tool list and role prompt of a running Session unchanged when its App management grant changes', async () => {
    const grants = [false, true, false];
    const seen: Array<{ tools: string[]; role: string | undefined }> = [];
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onTurn: async (_session, tools) => {
          const scope = host.scopes.get(reportRun.sessionId)!;
          seen.push({
            tools: tools.map((tool) => tool.name),
            role: scope.sections.find((section) => section.name === 'botharness:orchestrator-role')
              ?.text,
          });
          expect(
            scope.guards.some((guard) =>
              guard({ name: 'group_create' })?.includes('scoped deepseekbot CLI'),
            ),
          ).toBe(false);
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
      for (const [index, holds] of grants.entries())
        await adapter.runOrchestrator({
          ...reportRun,
          resume: index > 0,
          holdsManagementGrant: () => holds,
        });
      expect(host.createOptions).toHaveLength(1);
      expect(seen).toHaveLength(grants.length);
      for (const turn of seen) {
        expect(turn.tools).toEqual(seen[0]!.tools);
        expect(turn.role).toBe(seen[0]!.role);
      }
      expect(seen[0]!.tools).not.toContain('bot_create');
      for (const [name] of TOB_GROUP_TOOL_CASES) expect(seen[0]!.tools).toContain(name);
      expect(seen[0]!.role).not.toContain('deepseekbot capabilities');
    } finally {
      await adapter.close();
    }
  });

  it('starts a new Session with the manager line when the Bot holds the grant', async () => {
    let role: string | undefined;
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onTurn: async () => {
          role = host.scopes
            .get(reportRun.sessionId)!
            .sections.find((section) => section.name === 'botharness:orchestrator-role')?.text;
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
      await adapter.runOrchestrator({ ...reportRun, holdsManagementGrant: () => true });
      expect(role).toContain('run deepseekbot capabilities and doctor first');
    } finally {
      await adapter.close();
    }
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
          holdsManagementGrant: () => true,
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
