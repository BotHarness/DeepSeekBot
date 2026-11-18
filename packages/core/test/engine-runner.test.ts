import { z } from 'zod';
import { memoryDsh } from './fixtures/engine-dsh.js';
import type { CodexTransport } from '../src/engines/codex-engine.js';
import { describe, expect, it, vi } from 'vitest';

import { createEngineGateway } from '../src/engines/engine-gateway.js';
import { EngineHost } from '../src/engines/engine-host.js';
import { createEngineStore, engineStorePath } from '../src/engines/engine-store.js';
import { createTempRoot } from './helpers.js';

describe('Orchestrator runner summaries', () => {
  it('reads legacy Session accounts only for the selected engine and the owning Bot', async () => {
    const root = createTempRoot('runner-legacy-');
    const sessions = vi.fn((slug: string) =>
      slug === 'ada' ? ['newest', 'oldest'] : slug === 'eve' ? ['other'] : [],
    );
    const detect = vi.fn();
    const host = new EngineHost({
      root,
      local: true,
      gateway: createEngineGateway(),
      sessions: () => undefined,
      persistence: () => undefined,
      sessionIdsForBot: sessions,
      detectCodex: detect,
    });
    try {
      host.store.rememberNativeSession('oldest', 'codex', 'thread-old', 'ChatGPT Plus');
      host.store.rememberNativeSession('newest', 'codex', 'thread-new', 'ChatGPT Pro');
      host.store.rememberNativeSession('other', 'codex', 'thread-other', 'ChatGPT Team');
      expect(host.orchestratorRunner('ada')).toBeUndefined();
      expect(sessions).not.toHaveBeenCalled();
      host.use('ada', 'orchestrator', 'codex');
      expect(host.orchestratorRunner('ada')).toEqual({
        engine: 'codex',
        displayName: 'Codex',
        account: 'ChatGPT Pro',
      });
      expect(host.orchestratorRunner('eve')).toBeUndefined();
      host.store.rememberAccount('ada', 'codex', 'ChatGPT Plus');
      sessions.mockClear();
      for (let index = 0; index < 100; index += 1)
        expect(host.orchestratorRunner('ada')).toEqual({
          engine: 'codex',
          displayName: 'Codex',
          account: 'ChatGPT Plus',
        });
      expect(sessions).not.toHaveBeenCalled();
      expect(detect).not.toHaveBeenCalled();
      host.use('fresh', 'orchestrator', 'codex');
      for (let index = 0; index < 100; index += 1)
        expect(host.orchestratorRunner('fresh')).toEqual({ engine: 'codex', displayName: 'Codex' });
      expect(sessions).toHaveBeenCalledTimes(1);
      host.use('fresh', 'orchestrator', undefined);
      const restored = createEngineStore(engineStorePath(root));
      expect(restored.account('ada', 'codex')).toBe('ChatGPT Plus');
      expect(restored.account('eve', 'codex')).toBeUndefined();
      host.use('ada', 'orchestrator', undefined);
      expect(host.orchestratorRunner('ada')).toBeUndefined();
      expect(restored.selections()).toEqual([
        { botSlug: 'ada', role: 'orchestrator', engine: 'codex', fallback: false },
      ]);
      expect(createEngineStore(engineStorePath(root)).selections()).toEqual([]);
    } finally {
      await host.close();
    }
  });
});

it('updates runner notifications and emits only one title through fake engine turns and resume', async () => {
  const root = createTempRoot('runner-turn-');
  const dsh = memoryDsh();
  const snapshots: unknown[] = [];
  let plan = 'plus';
  const host = new EngineHost({
    root,
    local: true,
    sessions: () => dsh.store,
    persistence: () => dsh.persistence,
    gateway: {
      start: async () => 'http://engine-test.invalid',
      grant: () => ({
        url: 'http://engine-test.invalid',
        token: 'test-only',
        revoke: () => undefined,
      }),
      close: async () => undefined,
    },
    changed: () => snapshots.push(host.orchestratorRunner('ada')),
    openCodex: () => {
      const listeners: Array<(message: unknown) => void> = [];
      const emit = (message: unknown) => listeners.forEach((listener) => listener(message));
      return {
        onMessage: (listener) => {
          listeners.push(listener);
        },
        onExit: () => undefined,
        close: async () => undefined,
        send: (message) => {
          const parsed = z.object({ id: z.number(), method: z.string() }).safeParse(message);
          if (!parsed.success) return;
          const { id, method } = parsed.data;
          const result =
            method === 'account/read'
              ? { account: { type: 'chatgpt', planType: plan } }
              : method.startsWith('thread/')
                ? { thread: { id: 'native-thread' }, model: 'gpt-6-astra' }
                : method === 'turn/start'
                  ? { turn: { id: 'turn' } }
                  : {};
          queueMicrotask(() => emit({ id, result }));
          if (method === 'turn/start')
            setTimeout(
              () => emit({ method: 'turn/completed', params: { turn: { status: 'completed' } } }),
              5,
            );
        },
      } satisfies CodexTransport;
    },
  });
  const request = {
    botSlug: 'ada',
    sessionId: 'runner-turn',
    channelId: 'dm-ada',
    input:
      '[Human DM]\nSource Event ID: s1 [Human]\nChannel: dm-ada\nMessage ID: m1\nFix the build',
    instructions: 'You are Ada',
    tools: [],
    execute: async () => undefined,
    signal: new AbortController().signal,
  };
  try {
    host.use('ada', 'orchestrator', 'codex');
    await host.runTurn(request);
    plan = 'pro';
    await host.runTurn({ ...request, input: 'Second message' });
    expect(host.describe(request.sessionId)?.account).toBe('ChatGPT pro');
    expect(snapshots).toEqual([
      { engine: 'codex', displayName: 'Codex' },
      { engine: 'codex', displayName: 'Codex', account: 'ChatGPT plus' },
      { engine: 'codex', displayName: 'Codex', account: 'ChatGPT plus', model: 'gpt-6-astra' },
      { engine: 'codex', displayName: 'Codex', account: 'ChatGPT pro', model: 'gpt-6-astra' },
    ]);
    await host.release(request.sessionId);
    await host.runTurn({ ...request, input: 'Third message after resume' });
    const events = dsh.stored.get(request.sessionId)!.events;
    expect(
      events.filter((event) => event.type === 'session/title').map((event) => event.data.title),
    ).toEqual(['Fix the build']);
    expect(
      events.filter((event) => event.type === 'turn/start').map((event) => event.data.turn),
    ).toEqual([1, 2, 3]);
    expect(createEngineStore(engineStorePath(root)).account('ada', 'codex')).toBe('ChatGPT pro');
    host.use('ada', 'orchestrator', undefined);
    expect(snapshots.at(-1)).toBeUndefined();
  } finally {
    await host.close();
  }
});
