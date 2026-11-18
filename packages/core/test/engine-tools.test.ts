import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Session } from '@deepseek-ai/dsh-session';
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEngineGateway } from '../src/engines/engine-gateway.js';
import {
  engineGatewayResult,
  type EngineToolApproval,
  type EngineToolContext,
  type EngineTurnRequest,
} from '../src/engines/engine-host.js';
import { createEngineToolGate } from '../src/engines/engine-tool-gate.js';
import { requiresHumanToolApproval } from '../src/workspaces/grant-execution.js';
import { createEngineMemoryTools } from '../src/engines/engine-memory-tools.js';
import { engineRouteFetch, type EngineRouteDeps } from '../src/engines/engine-route.js';
import type { EngineBotTool, EngineToolGate } from '../src/engines/engine-tools.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost, FAKE_BOT as BOT } from './dsh-agent-host-fixture.js';

const DSH_GENERIC = [
  'bash',
  'shell',
  'exec_command',
  'read',
  'write',
  'edit',
  'apply_patch',
  'glob',
  'grep',
  'web_fetch',
  'web_search',
];

const run = {
  sessionId: 'orchestrator-ada',
  resume: false,
  bot: BOT,
  message: 'Hi Ada',
  inboundChannelId: 'dm-ada',
  inbox: '',
  channels: {
    list: () => ({ channels: [] }),
    readModel: () => JSON.stringify({ messages: [{ id: 'm1', body: 'Hi Ada' }] }),
  },
} as unknown as OrchestratorAgentRun;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Call = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ text: string; isError: boolean }>;

async function overHttp(
  scenario: (client: Client, call: Call) => Promise<void>,
  options: { asked?: string[]; gate?: EngineToolGate; extra?: EngineBotTool[] } = {},
): Promise<string> {
  const memory = mkdtempSync(join(tmpdir(), 'engine-memory-'));
  dirs.push(memory);
  mkdirSync(join(memory, '.git'));
  writeFileSync(join(memory, '.git', 'config'), '[core]\n');
  writeFileSync(join(memory, 'MEMORY.md'), 'Likes tea.\n');
  const gateway = createEngineGateway();
  await gateway.start();
  let failure: Error | undefined;
  const adapter = createDshBotAgentAdapter({
    agents: new FakeAgentHost({ kind: 'completed' }),
    orchestratorCwd: () => memory,
    ensureWorkspace: () => {},
    defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    engineTools: () => [...createEngineMemoryTools(() => memory), ...(options.extra ?? [])],
    ...(options.gate === undefined ? {} : { engineToolGate: options.gate }),
    engines: {
      engineFor: () => 'codex',
      isLive: () => false,
      release: async () => undefined,
      runTurn: async (request: EngineTurnRequest) => {
        const context = {
          session: { id: request.sessionId },
          ask: async (approval) => {
            options.asked?.push(approval.toolName);
            return 'rejected';
          },
        } as EngineToolContext;
        const grant = gateway.grant({
          botSlug: request.botSlug,
          sessionId: request.sessionId,
          tools: request.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.parameters,
          })),
          channelId: () => request.channelId,
          call: async (name, args, signal) =>
            engineGatewayResult(await request.execute(name, args, signal, context)),
        });
        const client = new Client({ name: 'engine', version: '1' });
        await client.connect(
          new StreamableHTTPClientTransport(new URL(grant.url), {
            requestInit: { headers: { authorization: `Bearer ${grant.token}` } },
          }),
        );
        const call: Call = async (name, args) => {
          const result = await client.callTool({ name, arguments: args });
          const content = result.content as { type: string; text?: string }[];
          return {
            text: content.map((part) => part.text ?? '').join('\n'),
            isError: result.isError === true,
          };
        };
        try {
          await scenario(client, call);
        } catch (error) {
          failure = error instanceof Error ? error : new Error(String(error));
        } finally {
          await client.close();
          grant.revoke();
        }
      },
    },
  });
  try {
    await adapter.runOrchestrator(run);
  } finally {
    await adapter.close();
    await gateway.close();
  }
  if (failure !== undefined) throw failure;
  return memory;
}

it('lists a few Bot tools directly and no DSH generic tool', async () => {
  await overHttp(async (client, call) => {
    const listed = (await client.listTools()).tools.map((tool) => tool.name).sort();
    expect(listed).toEqual([
      'bot_send_message',
      'channel_read',
      'inbox_resolve',
      'tool_call',
      'tool_search',
    ]);
    const all = JSON.parse((await call('tool_search', { query: '' })).text) as {
      tools: { name: string }[];
    };
    const names = all.tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'memory_read',
        'memory_write',
        'memory_switch_branch',
        'channel_action',
        'genui_diagram',
        'create_assignment',
        'bot_schedule_create',
        'group_create',
      ]),
    );
    for (const generic of DSH_GENERIC) {
      expect(listed).not.toContain(generic);
      expect(names).not.toContain(generic);
    }
    expect(names).not.toContain('channel_read_image');
    expect(names).not.toContain('tool_search');
  });
});

it('finds tools through tool_search with their input schema', async () => {
  await overHttp(
    async (_client, call) => {
      const found = JSON.parse((await call('tool_search', { query: 'memory write' })).text) as {
        tools: { name: string; input_schema: { required?: string[] } }[];
      };
      expect(found.tools[0]).toMatchObject({
        name: 'memory_write',
        input_schema: { required: ['path', 'content'] },
      });
      const selected = JSON.parse(
        (await call('tool_search', { query: 'select:todos_list,nope' })).text,
      ) as { tools: { name: string }[]; missing: string[] };
      expect(selected.tools.map((tool) => tool.name)).toEqual(['todos_list']);
      expect(selected.missing).toEqual(['nope']);
    },
    { extra: [todoTool()] },
  );
});

it('runs a searched tool through tool_call inside the Bot Memory folder', async () => {
  const memory = await overHttp(
    async (_client, call) => {
      expect(
        await call('tool_call', { name: 'memory_read', arguments: { path: 'MEMORY.md' } }),
      ).toEqual({ text: 'Likes tea.\n', isError: false });
      expect(
        await call('tool_call', {
          name: 'memory_write',
          arguments: { path: 'notes/people.md', content: 'Vain likes green tea.' },
        }),
      ).toMatchObject({ isError: false });
      const listed = JSON.parse(
        (await call('tool_call', { name: 'memory_list', arguments: {} })).text,
      ) as { files: string[] };
      expect(listed.files).toEqual(['MEMORY.md', 'notes/people.md']);
      expect(await call('tool_call', { name: 'todos_list', arguments: {} })).toEqual({
        text: '[]',
        isError: false,
      });
    },
    { extra: [todoTool()] },
  );
  expect(readFileSync(join(memory, 'notes', 'people.md'), 'utf8')).toBe('Vain likes green tea.');
});

it('refuses out-of-capability calls', async () => {
  const asked: string[] = [];
  const gate: EngineToolGate = async ({ toolName, args, ask }) => {
    if (toolName !== 'bot_create') return undefined;
    const outcome = await ask({ toolName, input: args });
    return outcome === 'allowed-once' ? undefined : `Human approval was ${outcome}`;
  };
  await overHttp(
    async (_client, call) => {
      for (const generic of ['bash', 'apply_patch', 'web_fetch'])
        expect(await call('tool_call', { name: generic, arguments: {} })).toEqual({
          text: `refused: ${generic} is not available to this engine Session`,
          isError: true,
        });
      expect(await call('tool_call', { name: 'browser_open', arguments: {} })).toMatchObject({
        isError: true,
      });
      for (const path of ['.git/config', '../outside.md', '/etc/passwd'])
        expect(await call('tool_call', { name: 'memory_read', arguments: { path } })).toMatchObject(
          { isError: true, text: expect.stringMatching(/Memory/u) },
        );
      expect(
        await call('tool_call', {
          name: 'channel_read',
          arguments: { channel_id: 'dm-someone-else' },
        }),
      ).toEqual({ text: 'refused: channel-out-of-scope', isError: true });
      expect(
        await call('tool_call', { name: 'bot_create', arguments: { display_name: 'Eve' } }),
      ).toEqual({ text: 'refused: Human approval was rejected', isError: true });
    },
    { asked, gate },
  );
  expect(asked).toEqual(['bot_create']);
});

function todoTool(): EngineBotTool {
  return {
    name: 'todos_list',
    description: 'List the to-dos of this PersonaBot.',
    inputSchema: { type: 'object', properties: {} },
    run: vi.fn(async () => '[]'),
  };
}

describe('engine tool gate', () => {
  const session = { id: 'orchestrator-ada' } as unknown as Session;
  const signal = new AbortController().signal;
  function gate(options: { authorized?: boolean; owner?: string; outcome?: ApprovalOutcome } = {}) {
    const asks: EngineToolApproval[] = [];
    let authorized = options.authorized ?? false;
    const browser = {
      ownsTool: (name: string) => name.startsWith('browser_'),
      needsAuthorization: () => !authorized,
      authorizationScope: () => 'scope-1',
      approvalScope: () => 'browser:scope-1',
      markAuthorized: vi.fn(() => {
        authorized = true;
        return true;
      }),
    };
    const check = createEngineToolGate({
      owner: () => options.owner ?? 'ada',
      botExists: (slug) => slug === 'ada',
      fullAccess: () => false,
      devices: () => [{ kind: 'browser', tools: browser, reason: 'Browser please' }],
      approvalRequired: (name, args) => requiresHumanToolApproval(name, args),
    });
    const run = (toolName: string, args: Record<string, unknown> = {}) =>
      check({
        botSlug: 'ada',
        sessionId: session.id,
        session,
        toolName,
        args,
        signal,
        ask: async (request) => {
          asks.push(request);
          return options.outcome ?? 'allowed-once';
        },
      });
    return { run, asks, browser };
  }

  it('asks once for the Bot Browser, then trusts the Session like a DSH Agent', async () => {
    const { run, asks, browser } = gate();
    expect(await run('browser_open', { url: 'https://example.com' })).toBeUndefined();
    expect(await run('browser_observe')).toBeUndefined();
    expect(asks).toHaveLength(1);
    expect(asks[0]).toMatchObject({ toolName: 'browser_open', device: { kind: 'browser' } });
    expect(asks[0]!.device!.authorizationScope?.()).toBe('browser:scope-1');
    expect(browser.markAuthorized).toHaveBeenCalledWith('orchestrator-ada', 'scope-1');
  });

  it('asks for tools that need Human approval and passes ordinary Bot tools', async () => {
    const { run, asks } = gate({ outcome: 'rejected' });
    expect(await run('channel_read')).toBeUndefined();
    expect(await run('memory_write', { path: 'a.md', content: 'x' })).toBeUndefined();
    expect(await run('bot_create', { display_name: 'Eve' })).toBe('Human approval was rejected');
    expect(await run('browser_open')).toBe('Human approval was rejected');
    expect(asks.map((ask) => ask.toolName)).toEqual(['bot_create', 'browser_open']);
  });

  it('refuses a Session that this Bot does not own', async () => {
    const { run, asks } = gate({ owner: 'bob' });
    expect(await run('channel_read')).toBe('BotHarness Session has no durable owner');
    expect(asks).toEqual([]);
  });
});

describe('engine route Bot tools', () => {
  const post = (body: Record<string, unknown>, deps: Partial<EngineRouteDeps> = {}) =>
    engineRouteFetch(
      new Request('http://host/api/botharness/engines', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
      {
        host: {} as EngineRouteDeps['host'],
        botExists: (slug) => slug === 'ada',
        tools: async () => [todoTool()],
        runTool: async (_bot, tool) => {
          if (tool !== 'todos_list') throw new Error(`${tool} is not an engine-only tool`);
          return [];
        },
        ...deps,
      },
    );

  it('searches and runs the same catalog the engine sees', async () => {
    expect(await (await post({ action: 'tools', bot: 'ada', query: 'to-dos' })).json()).toEqual({
      tools: [
        {
          name: 'todos_list',
          description: 'List the to-dos of this PersonaBot.',
          input_schema: { type: 'object', properties: {} },
        },
      ],
    });
    expect(await (await post({ action: 'tool', bot: 'ada', tool: 'todos_list' })).json()).toEqual({
      bot: 'ada',
      tool: 'todos_list',
      result: [],
    });
    const refused = await post({ action: 'tool', bot: 'ada', tool: 'bash' });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: { code: 'tool-failed' } });
    expect((await post({ action: 'tools', bot: 'eve' })).status).toBe(404);
  });
});
