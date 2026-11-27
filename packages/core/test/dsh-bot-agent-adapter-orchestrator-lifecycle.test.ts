import { expect, it, vi } from 'vitest';
import { createDshBotAgentAdapter } from '../src/agent-adapter.js';
import { type DshBotAgentAdapterOptions } from '../src/runtime/dsh-bot-agent-adapter.js';
import { deferred } from './deferred.js';
import { FakeAgentHost, FAKE_BOT as BOT } from './dsh-agent-host-fixture.js';
import { reportRun } from './support/dsh-bot-agent-adapter.js';

function setup(options: Partial<DshBotAgentAdapterOptions> = {}) {
  const agents = new FakeAgentHost({ kind: 'completed' }, { onTurn: async () => undefined });
  const adapter = createDshBotAgentAdapter({
    agents,
    defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    orchestratorCwd: () => '/memory/ada',
    ensureWorkspace: () => undefined,
    ...options,
  });
  return { adapter, agents };
}

it('retries native preparation while the timed-out model route check is still pending', async () => {
  const route = deferred<void>();
  const check = vi.fn<() => Promise<void>>().mockReturnValueOnce(route.promise);
  check.mockResolvedValue(undefined);
  const { adapter, agents } = setup({ prepareModelRoute: check, preparationTimeoutMs: 100 });
  try {
    await expect(adapter.runOrchestrator(reportRun)).rejects.toThrow('Preparing this turn');
    await adapter.runOrchestrator(reportRun);
    expect(agents.received.get(reportRun.sessionId)).toHaveLength(1);
  } finally {
    route.resolve();
    await adapter.close();
  }
});

it('refuses native load if an engine claimed the Session during the persistence lookup', async () => {
  const exists = deferred<boolean>();
  const engineEntered = deferred<void>();
  const engineFinished = deferred<void>();
  const { adapter, agents } = setup({
    hasSession: () => exists.promise,
    engines: {
      engineFor: () => 'codex',
      isLive: () => false,
      release: async () => undefined,
      runTurn: async () => {
        engineEntered.resolve();
        await engineFinished.promise;
      },
    },
  });
  const loading = adapter.loadOrchestrator!({ ...reportRun, resume: true });
  const running = adapter.runOrchestrator(reportRun);
  try {
    await engineEntered.promise;
    exists.resolve(true);
    await expect(loading).rejects.toMatchObject({ code: 'bot-busy' });
    expect(agents.resumeOptions).toHaveLength(0);
  } finally {
    exists.resolve(true);
    engineFinished.resolve();
    await Promise.allSettled([loading, running]);
    await adapter.close();
  }
});

it('honors Stop while releasing the engine Session for a native turn', async () => {
  const release = deferred<void>();
  const releasing = deferred<void>();
  const { adapter, agents } = setup({
    engines: {
      engineFor: () => undefined,
      isLive: () => true,
      release: () => {
        releasing.resolve();
        return release.promise;
      },
      runTurn: async () => {
        throw new Error('unexpected engine turn');
      },
    },
  });
  const running = adapter.runOrchestrator(reportRun);
  try {
    await releasing.promise;
    const stopped = adapter.stopOrchestratorTurn?.(BOT.slug);
    release.resolve();
    await running;
    expect(stopped).toBe(reportRun.sessionId);
    expect(agents.received.get(reportRun.sessionId)).toBeUndefined();
  } finally {
    release.resolve();
    await running;
    await adapter.close();
  }
});

it('disposes the other native handles and retains the failed handle for retry', async () => {
  const { adapter, agents } = setup();
  const first = reportRun.sessionId;
  const second = 'orchestrator-second';
  const create = agents.create.bind(agents);
  const failure = new Error('disposal failed');
  vi.spyOn(agents, 'create').mockImplementation(async (options) => {
    const handle = await create(options);
    if (options.sessionId !== first) return handle;
    return {
      ...handle,
      dispose: vi.fn(handle.dispose).mockRejectedValueOnce(failure),
    };
  });
  try {
    await adapter.loadOrchestrator!(reportRun);
    await adapter.loadOrchestrator!({ ...reportRun, sessionId: second });
    await expect(adapter.stopBot!(BOT.slug, [first, second])).rejects.toBe(failure);
    expect(agents.disposed).toEqual([second]);
    await adapter.stopBot!(BOT.slug, [first, second]);
    expect(agents.disposed).toEqual([second, first]);
  } finally {
    await adapter.close();
  }
});
