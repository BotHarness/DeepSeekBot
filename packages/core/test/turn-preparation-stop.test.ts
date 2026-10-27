import { describe, expect, it, vi } from 'vitest';

import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { FakeAgentHost, FAKE_BOT as BOT } from './dsh-agent-host-fixture.js';

const run = {
  sessionId: 'orchestrator-ada',
  resume: false,
  bot: BOT,
  message: 'hello',
  inbox: '',
  channels: {},
  assignments: {},
} as unknown as OrchestratorAgentRun;

const never = () => new Promise<never>(() => undefined);

function adapterWith(
  host: FakeAgentHost,
  prepareModelRoute: () => Promise<void>,
  preparationTimeoutMs?: number,
  observePreparation?: (botSlug: string, sessionId: string, preparing: boolean) => void,
) {
  return createDshBotAgentAdapter({
    ...(observePreparation === undefined ? {} : { observePreparation }),
    agents: host,
    defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    orchestratorCwd: () => '/memory/ada',
    ensureWorkspace: () => undefined,
    prepareModelRoute,
    ...(preparationTimeoutMs === undefined ? {} : { preparationTimeoutMs }),
  });
}

describe('a Turn stuck before its Agent starts', () => {
  it('is released by a Human stop while the model route is preparing, and the next Turn runs', async () => {
    const host = new FakeAgentHost({ kind: 'completed' }, { onTurn: async () => undefined });
    const prepare = vi.fn<() => Promise<void>>().mockImplementationOnce(never);
    prepare.mockResolvedValue(undefined);
    const preparing = vi.fn();
    const adapter = adapterWith(host, prepare, undefined, preparing);
    try {
      const stuck = adapter.runOrchestrator(run);
      await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
      expect(preparing.mock.calls).toEqual([[BOT.slug, run.sessionId, true]]);

      expect(adapter.stopOrchestratorTurn?.(BOT.slug)).toBe(run.sessionId);
      await expect(stuck).resolves.toBeUndefined();
      expect(host.createOptions).toHaveLength(0);
      expect(preparing.mock.calls.at(-1)).toEqual([BOT.slug, run.sessionId, false]);

      await expect(adapter.runOrchestrator({ ...run, message: 'again' })).resolves.toBeUndefined();
      expect(host.received.get(run.sessionId)).toHaveLength(1);
    } finally {
      await adapter.close();
    }
  });

  it('is released by a Human stop when the Session already ran a Turn', async () => {
    const host = new FakeAgentHost({ kind: 'completed' }, { onTurn: async () => undefined });
    const prepare = vi.fn<() => Promise<void>>().mockResolvedValueOnce(undefined);
    prepare.mockImplementationOnce(never).mockResolvedValue(undefined);
    const adapter = adapterWith(host, prepare);
    try {
      await adapter.runOrchestrator(run);
      const stuck = adapter.runOrchestrator({ ...run, message: 'second' });
      await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(2));

      expect(adapter.stopOrchestratorTurn?.(BOT.slug)).toBe(run.sessionId);
      await expect(stuck).resolves.toBeUndefined();

      await expect(adapter.runOrchestrator({ ...run, message: 'third' })).resolves.toBeUndefined();
      expect(host.received.get(run.sessionId)).toHaveLength(2);
    } finally {
      await adapter.close();
    }
  });

  it('is released by a Human stop while the Session is resuming', async () => {
    const host = new FakeAgentHost({ kind: 'completed' }, { onTurn: async () => undefined });
    const resume = vi.spyOn(host, 'resume').mockImplementationOnce(never);
    const adapter = adapterWith(host, async () => undefined);
    try {
      const stuck = adapter.runOrchestrator({ ...run, resume: true });
      await vi.waitFor(() => expect(resume).toHaveBeenCalledTimes(1));

      expect(adapter.stopOrchestratorTurn?.(BOT.slug)).toBe(run.sessionId);
      await expect(stuck).resolves.toBeUndefined();

      await expect(adapter.runOrchestrator(run)).resolves.toBeUndefined();
      expect(host.received.get(run.sessionId)).toHaveLength(1);
    } finally {
      await adapter.close();
    }
  });

  it('fails a preparation that outlives its timeout with a clear message, then runs the next Turn', async () => {
    const host = new FakeAgentHost({ kind: 'completed' }, { onTurn: async () => undefined });
    const prepare = vi.fn<() => Promise<void>>().mockImplementationOnce(never);
    prepare.mockResolvedValue(undefined);
    const adapter = adapterWith(host, prepare, 20);
    try {
      await expect(adapter.runOrchestrator(run)).rejects.toThrow(
        /Preparing this turn took longer than/,
      );
      await expect(adapter.runOrchestrator(run)).resolves.toBeUndefined();
      expect(host.received.get(run.sessionId)).toHaveLength(1);
    } finally {
      await adapter.close();
    }
  });
});
