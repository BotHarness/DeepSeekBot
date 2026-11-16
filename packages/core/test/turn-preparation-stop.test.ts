import { setImmediate } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';

import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { FakeAgentHost, FAKE_BOT as BOT } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

const run = {
  sessionId: 'orchestrator-ada',
  resume: false,
  bot: BOT,
  message: 'hello',
  inbox: '',
  channels: {},
  assignments: {},
} as unknown as OrchestratorAgentRun;

function preparation() {
  let release: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    wait: () => pending,
    async settle() {
      release();
      await setImmediate();
    },
  };
}

function adapterWith(
  host: FakeAgentHost,
  prepareModelRoute: () => Promise<void>,
  preparationTimeoutMs?: number,
  observePreparation?: (botSlug: string, sessionId: string, preparing: boolean) => void,
) {
  const memoryDir = createTempRoot('turn-preparation-memory-');
  return createDshBotAgentAdapter({
    ...(observePreparation === undefined ? {} : { observePreparation, preparationVisibleMs: 0 }),
    agents: host,
    defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    orchestratorCwd: () => memoryDir,
    ensureWorkspace: () => undefined,
    prepareModelRoute,
    ...(preparationTimeoutMs === undefined ? {} : { preparationTimeoutMs }),
  });
}

describe('a Turn stuck before its Agent starts', () => {
  it('is released by a Human stop while the model route is preparing, and the next Turn runs', async () => {
    const host = new FakeAgentHost({ kind: 'completed' }, { onTurn: async () => undefined });
    const pending = preparation();
    const prepare = vi.fn<() => Promise<void>>().mockImplementationOnce(pending.wait);
    prepare.mockResolvedValue(undefined);
    const preparing = vi.fn();
    const adapter = adapterWith(host, prepare, undefined, preparing);
    try {
      const stuck = adapter.runOrchestrator(run);
      await vi.waitFor(() =>
        expect(preparing.mock.calls).toEqual([[BOT.slug, run.sessionId, true]]),
      );

      expect(adapter.stopOrchestratorTurn?.(BOT.slug)).toBe(run.sessionId);
      await expect(stuck).resolves.toBeUndefined();
      expect(host.createOptions).toHaveLength(0);
      expect(preparing.mock.calls.at(-1)).toEqual([BOT.slug, run.sessionId, false]);

      await expect(adapter.runOrchestrator(run)).rejects.toMatchObject({ code: 'bot-busy' });
      expect(host.createOptions).toHaveLength(0);
      await pending.settle();

      await expect(adapter.runOrchestrator({ ...run, message: 'again' })).resolves.toBeUndefined();
      expect(host.received.get(run.sessionId)).toHaveLength(1);
    } finally {
      await pending.settle();
      await adapter.close();
    }
  });

  it('is released by a Human stop when the Session already ran a Turn', async () => {
    const host = new FakeAgentHost({ kind: 'completed' }, { onTurn: async () => undefined });
    const pending = preparation();
    const prepare = vi.fn<() => Promise<void>>().mockResolvedValueOnce(undefined);
    prepare.mockImplementationOnce(pending.wait).mockResolvedValue(undefined);
    const adapter = adapterWith(host, prepare);
    try {
      await adapter.runOrchestrator(run);
      const stuck = adapter.runOrchestrator({ ...run, message: 'second' });
      await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(2));

      expect(adapter.stopOrchestratorTurn?.(BOT.slug)).toBe(run.sessionId);
      await expect(stuck).resolves.toBeUndefined();

      await expect(adapter.runOrchestrator(run)).rejects.toMatchObject({ code: 'bot-busy' });
      expect(host.createOptions).toHaveLength(1);
      await pending.settle();

      await expect(adapter.runOrchestrator({ ...run, message: 'third' })).resolves.toBeUndefined();
      expect(host.received.get(run.sessionId)).toHaveLength(2);
    } finally {
      await pending.settle();
      await adapter.close();
    }
  });

  it('is released by a Human stop while the Session is resuming', async () => {
    const host = new FakeAgentHost({ kind: 'completed' }, { onTurn: async () => undefined });
    const pending = preparation();
    const realResume = host.resume.bind(host);
    const resume = vi.spyOn(host, 'resume').mockImplementationOnce(async (options) => {
      await pending.wait();
      return realResume(options);
    });
    const adapter = adapterWith(host, async () => undefined);
    try {
      const stuck = adapter.runOrchestrator({ ...run, resume: true });
      await vi.waitFor(() => expect(resume).toHaveBeenCalledTimes(1));

      expect(adapter.stopOrchestratorTurn?.(BOT.slug)).toBe(run.sessionId);
      await expect(stuck).resolves.toBeUndefined();

      await expect(adapter.runOrchestrator(run)).rejects.toMatchObject({ code: 'bot-busy' });
      expect(host.createOptions).toHaveLength(0);
      await pending.settle();

      await expect(adapter.runOrchestrator(run)).resolves.toBeUndefined();
      expect(host.received.get(run.sessionId)).toHaveLength(1);
    } finally {
      await pending.settle();
      await adapter.close();
    }
  });

  it('fails a preparation that outlives its timeout with a clear message, then runs the next Turn', async () => {
    const host = new FakeAgentHost({ kind: 'completed' }, { onTurn: async () => undefined });
    const pending = preparation();
    const prepare = vi.fn<() => Promise<void>>().mockImplementationOnce(pending.wait);
    prepare.mockResolvedValue(undefined);
    const adapter = adapterWith(host, prepare, 20);
    try {
      await expect(adapter.runOrchestrator(run)).rejects.toThrow(
        /Preparing this turn took longer than/,
      );
      await expect(adapter.runOrchestrator(run)).rejects.toMatchObject({ code: 'bot-busy' });
      expect(host.createOptions).toHaveLength(0);
      await pending.settle();

      await expect(adapter.runOrchestrator(run)).resolves.toBeUndefined();
      expect(host.received.get(run.sessionId)).toHaveLength(1);
    } finally {
      await pending.settle();
      await adapter.close();
    }
  });
});
