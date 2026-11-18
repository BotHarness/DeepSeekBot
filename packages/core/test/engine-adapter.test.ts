import { expect, it, vi } from 'vitest';

import type { DshBotEngines } from '../src/runtime/dsh-bot-agent-adapter.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import type { EngineTurnRequest } from '../src/engines/engine-host.js';
import { FakeAgentHost, FAKE_BOT as BOT } from './dsh-agent-host-fixture.js';
import { runEngineCommand } from '../src/bots/cli-engine.js';

const run = {
  sessionId: 'orchestrator-ada',
  resume: false,
  bot: BOT,
  message: 'Hi Ada',
  inboundChannelId: 'dm-test',
  inbox: '',
  channels: {
    list: () => ({ channels: [] }),
    readModel: () => JSON.stringify({ messages: [{ id: 'm1', body: 'Hi Ada' }] }),
  },
} as unknown as OrchestratorAgentRun;

it('runs an engine-backed Orchestrator turn without a DSH Agent and offers only gateway tools', async () => {
  const host = new FakeAgentHost({ kind: 'completed' });
  const requests: EngineTurnRequest[] = [];
  const engines: DshBotEngines = {
    engineFor: () => 'codex',
    isLive: () => false,
    release: async () => undefined,
    runTurn: async (request) => {
      requests.push(request);
      expect(await request.execute('channel_read', {}, request.signal)).toContain('Hi Ada');
    },
  };
  const adapter = createDshBotAgentAdapter({
    agents: host,
    orchestratorCwd: () => '/memory/ada',
    ensureWorkspace: () => {},
    defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    engines,
    enginePersona: () => ({ soul: 'Ada is calm.', coreMemory: 'Likes tea.' }),
  });
  const ready = vi.fn();
  try {
    await adapter.runOrchestrator({ ...run, setExecutionReady: ready });
  } finally {
    await adapter.close();
  }
  expect(host.createOptions).toHaveLength(0);
  expect(host.resumeOptions).toHaveLength(0);
  expect(requests).toHaveLength(1);
  const request = requests[0]!;
  expect(request.tools.map((tool) => tool.name).sort()).toEqual([
    'bot_send_message',
    'channel_read',
  ]);
  expect(request.channelId).toBe('dm-test');
  expect(request.input.startsWith('Hi Ada')).toBe(true);
  expect(request.instructions).toContain('Ada is calm.');
  expect(request.instructions).toContain('Likes tea.');
  expect(request.instructions).toContain('bot_send_message');
  expect(ready.mock.calls).toEqual([[true], [false]]);
});

it('drives engine list, status, login and use through the Host engine route', async () => {
  const http = vi.fn(async (_path: string, body?: Record<string, unknown>) => ({
    bytes: new TextEncoder().encode(
      JSON.stringify(
        body === undefined
          ? {
              engines: [
                {
                  engine: 'codex',
                  available: false,
                  reason: 'signed-out',
                  installed: true,
                  login: 'signed-out',
                },
              ],
              selections: [],
            }
          : body['action'] === 'login'
            ? { engine: 'codex', started: true, url: 'https://auth.openai.com/x' }
            : { bot: 'ada', role: 'orchestrator', engine: body['engine'] },
      ),
    ),
  }));
  const connect = async () => ({ http });
  expect(await runEngineCommand('engine-list', [], {}, connect)).toEqual({
    engines: [{ engine: 'codex', available: false, reason: 'signed-out' }],
  });
  expect(await runEngineCommand('engine-status', [], {}, connect)).toMatchObject({
    selections: [],
  });
  expect(await runEngineCommand('engine-login', ['codex'], {}, connect)).toMatchObject({
    started: true,
  });
  expect(
    await runEngineCommand('engine-use', ['ada', 'none'], { role: ['orchestrator'] }, connect),
  ).toEqual({ bot: 'ada', role: 'orchestrator', engine: null });
  expect(http.mock.calls.at(-1)).toEqual([
    '/api/botharness/engines',
    { action: 'use', bot: 'ada', role: 'orchestrator', engine: null },
  ]);
  await expect(runEngineCommand('engine-use', ['ada', 'codex'], {}, connect)).rejects.toMatchObject(
    {
      code: 'usage',
    },
  );
});
