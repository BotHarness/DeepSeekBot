import { expect, it, vi } from 'vitest';

import type { DshBotEngines } from '../src/runtime/dsh-bot-agent-adapter.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import type { EngineToolContext, EngineTurnRequest } from '../src/engines/engine-host.js';
import { FakeAgentHost, FAKE_BOT as BOT } from './dsh-agent-host-fixture.js';
import { runEngineCommand } from '../src/bots/cli-engine.js';

const CONTEXT = {
  session: { id: 'orchestrator-ada' },
  ask: async () => 'allowed-once' as const,
} as unknown as EngineToolContext;

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
      expect(await request.execute('channel_read', {}, request.signal, CONTEXT)).toContain(
        'Hi Ada',
      );
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
    'inbox_resolve',
    'tool_call',
    'tool_search',
  ]);
  expect(request.channelId).toBe('dm-test');
  expect(request.input.startsWith('Hi Ada')).toBe(true);
  expect(request.instructions).toContain('Ada is calm.');
  expect(request.instructions).toContain('Likes tea.');
  expect(request.instructions).toContain('bot_send_message');
  expect(ready.mock.calls).toEqual([[true], [false]]);
});

it('gives each engine tool call its own delivery key', async () => {
  const keys: string[] = [];
  const engines: DshBotEngines = {
    engineFor: () => 'codex',
    isLive: () => false,
    release: async () => undefined,
    runTurn: async (request) => {
      for (const body of ['first', 'second'])
        await request.execute('bot_send_message', { bot_id: 'bob', body }, request.signal, CONTEXT);
    },
  };
  const adapter = createDshBotAgentAdapter({
    agents: new FakeAgentHost({ kind: 'completed' }),
    orchestratorCwd: () => '/memory/ada',
    ensureWorkspace: () => {},
    defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    engines,
  });
  const channels = {
    ...run.channels,
    sendToBot: async (input: { body: string; deliveryKey: string }) => {
      keys.push(input.deliveryKey);
      return { channelId: 'bot-dm', message: { id: `m-${keys.length}`, body: input.body } };
    },
  };
  try {
    await adapter.runOrchestrator({ ...run, channels } as unknown as OrchestratorAgentRun);
  } finally {
    await adapter.close();
  }
  expect(keys).toHaveLength(2);
  expect(new Set(keys).size).toBe(2);
});

it('writes a member selection through the caller-scoped subscription bridge', async () => {
  const selection = { bot: 'ada', role: 'orchestrator', engine: 'codex', accountId: 'codex-work' };
  const http = vi.fn(async () => {
    throw new Error('Member selection used the native Owner route');
  });
  const rpc = vi.fn(async () => selection);
  expect(
    await runEngineCommand(
      'engine-use',
      ['ada', 'codex'],
      { as: 'bob', role: ['orchestrator'], account: 'codex-work' },
      async () => ({ http, rpc }),
    ),
  ).toEqual(selection);
  expect(rpc).toHaveBeenCalledWith('engineSelection', { request: { action: 'use', ...selection } });
  expect(http).not.toHaveBeenCalled();
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
                  displayName: 'Codex',
                  available: false,
                  reason: 'signed-out',
                  installed: true,
                  login: 'signed-out',
                },
              ],
              selections: [],
              approvals: [
                {
                  botSlug: 'ada',
                  sessionId: 'orchestrator-ada',
                  channelId: 'dm-ada',
                  messageId: 'card-1',
                  toolName: 'shell',
                  input: '{"command":"touch ../x"}',
                  expiresAt: '2026-11-19T08:00:00.000Z',
                },
              ],
            }
          : body['action'] === 'login'
            ? { engine: 'codex', started: true, url: 'https://auth.openai.com/x' }
            : { bot: 'ada', role: 'orchestrator', engine: body['engine'] },
      ),
    ),
  }));
  const rpc = vi.fn(async () => ({
    engine: 'codex',
    started: true,
    url: 'https://auth.openai.com/x',
  }));
  const connect = async () => ({ http, rpc });
  expect(await runEngineCommand('engine-list', [], {}, connect)).toEqual({
    engines: [{ engine: 'codex', displayName: 'Codex', available: false, reason: 'signed-out' }],
  });
  expect(await runEngineCommand('engine-status', [], {}, connect)).toMatchObject({
    selections: [],
  });
  expect(await runEngineCommand('engine-approvals', [], {}, connect)).toMatchObject({
    approvals: [{ channelId: 'dm-ada', messageId: 'card-1', toolName: 'shell' }],
  });
  expect(await runEngineCommand('engine-login', ['codex'], {}, connect)).toMatchObject({
    started: true,
  });
  expect(rpc).toHaveBeenCalledWith('engineAccountLogin', { id: 'codex' });
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

it('lists and runs engine Bot tools through the Host engine route', async () => {
  const http = vi.fn(async (_path: string, body?: Record<string, unknown>) => ({
    bytes: new TextEncoder().encode(
      JSON.stringify(
        body?.['action'] === 'tools'
          ? { tools: [{ name: 'memory_read', description: 'Read Memory' }] }
          : { bot: 'ada', tool: body?.['tool'], result: 'Likes tea.' },
      ),
    ),
  }));
  const connect = async () => ({ http });
  expect(await runEngineCommand('engine-tools', ['ada'], { query: 'memory' }, connect)).toEqual({
    tools: [{ name: 'memory_read', description: 'Read Memory' }],
  });
  expect(http.mock.calls.at(-1)).toEqual([
    '/api/botharness/engines',
    { action: 'tools', bot: 'ada', query: 'memory' },
  ]);
  expect(
    await runEngineCommand(
      'engine-tool',
      ['ada', 'memory_read'],
      { 'args-stdin': true },
      connect,
      async () => '{"path":"MEMORY.md"}',
    ),
  ).toEqual({ bot: 'ada', tool: 'memory_read', result: 'Likes tea.' });
  expect(http.mock.calls.at(-1)).toEqual([
    '/api/botharness/engines',
    { action: 'tool', bot: 'ada', tool: 'memory_read', args: { path: 'MEMORY.md' } },
  ]);
  await expect(
    runEngineCommand(
      'engine-tool',
      ['ada', 'memory_read'],
      { 'args-stdin': true },
      connect,
      async () => '[]',
    ),
  ).rejects.toMatchObject({ code: 'usage' });
  await expect(runEngineCommand('engine-tools', [], {}, connect)).rejects.toMatchObject({
    code: 'usage',
  });
});

it('refuses a Host engine response that does not have the expected shape', async () => {
  const connect = async () => ({
    http: async () => ({ bytes: new TextEncoder().encode('{}') }),
  });
  await expect(runEngineCommand('engine-status', [], {}, connect)).rejects.toMatchObject({
    code: 'host-protocol-error',
  });
  await expect(runEngineCommand('engine-list', [], {}, connect)).rejects.toMatchObject({
    code: 'host-protocol-error',
  });
  await expect(runEngineCommand('engine-login', ['codex'], {}, connect)).rejects.toMatchObject({
    code: 'host-protocol-error',
  });
  await expect(runEngineCommand('engine-approvals', [], {}, connect)).rejects.toMatchObject({
    code: 'host-protocol-error',
  });
});
