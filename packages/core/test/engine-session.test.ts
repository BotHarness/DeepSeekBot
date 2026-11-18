import { join } from 'node:path';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import {
  Session,
  type SessionEvent,
  type SessionHeader,
  SessionId,
  SessionLogOffset,
} from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CODEX_TURN_SANDBOX,
  codexAccount,
  codexProcessSpec,
  type CodexProcessOptions,
} from '../src/engines/codex-engine.js';
import { parseCodexLoginStatus } from '../src/engines/codex-status.js';
import type {
  EngineSessionHandle,
  EngineSessionPersistence,
  EngineSessionStore,
} from '../src/engines/engine-dsh-session.js';
import { createEngineGateway, type EngineGateway } from '../src/engines/engine-gateway.js';
import { EngineHost, type EngineTool } from '../src/engines/engine-host.js';
import { engineRouteFetch } from '../src/engines/engine-route.js';
import { EngineRefusal } from '../src/engines/engine-session.js';
import { subscriptionEnginesAllowed } from '../src/engines/engine-plugin.js';
import { summarizeSessionTranscript } from '../src/runtime/session-transcript.js';
import { codexReplay, type CodexReplay, readCodexRecording } from './fixtures/codex-replay.js';
import { createTempRoot } from './helpers.js';

const RECORDING = readCodexRecording(join(import.meta.dirname, 'fixtures', 'codex-dm-turn.jsonl'));

function memoryDsh(): {
  store: EngineSessionStore;
  persistence: EngineSessionPersistence;
  stored: Map<string, { header: SessionHeader; events: SessionEvent[] }>;
} {
  const live = new Map<string, Session>();
  const stored = new Map<string, { header: SessionHeader; events: SessionEvent[] }>();
  const handle = (id: string): EngineSessionHandle => {
    const entry = stored.get(id)!;
    return {
      header: entry.header,
      inheritedEventCount: SessionLogOffset(0),
      read: async () => ({ events: structuredClone(entry.events), eventState: 'detached' }),
      append: async (events) => {
        entry.events.push(...structuredClone(events));
      },
      close: async () => undefined,
    };
  };
  return {
    stored,
    store: {
      prepare: (id, options) =>
        options.eventState === undefined
          ? Session.create(id)
          : Session.fromRestore(
              id,
              options.seed,
              options.meta,
              options.inheritedEventCount,
              options.eventState,
            ),
      enter: (session) => {
        live.set(session.id, session);
        return () => live.delete(session.id);
      },
      announce: () => undefined,
      get: (id) => live.get(id),
    },
    persistence: {
      stat: async (id) => stored.get(id),
      create: async (header) => {
        stored.set(header.id, { header, events: [] });
        return handle(header.id);
      },
      open: async (id) => handle(id),
    },
  };
}

const TOOLS: EngineTool[] = [
  {
    name: 'bot_send_message',
    description: 'Send a message',
    parameters: { type: 'object', properties: { body: { type: 'string' } } },
  },
  {
    name: 'channel_read',
    description: 'Read the Channel',
    parameters: { type: 'object', properties: {} },
  },
  { name: 'memory_switch_branch', description: 'Not for engines', parameters: { type: 'object' } },
];

const gateways: EngineGateway[] = [];
afterEach(async () => {
  await Promise.all(gateways.splice(0).map((gateway) => gateway.close()));
});

function setup(recording = RECORDING, local = true) {
  const dsh = memoryDsh();
  const gateway = createEngineGateway();
  gateways.push(gateway);
  const replays: CodexReplay[] = [];
  const opened: CodexProcessOptions[] = [];
  const root = createTempRoot('engine-host-');
  const host = new EngineHost({
    root,
    local,
    gateway,
    sessions: () => dsh.store,
    persistence: () => dsh.persistence,
    openCodex: (options) => {
      opened.push(options);
      const replay = codexReplay(recording, options);
      replays.push(replay);
      return replay.transport;
    },
    detectCodex: async () => ({ installed: true, version: '0.170.0', login: 'chatgpt' }),
    startCodexLogin: async () => ({ url: 'https://auth.openai.com/oauth/authorize?x=1' }),
  });
  const execute = vi.fn(async (name: string, args: Record<string, unknown>) =>
    name === 'channel_read'
      ? { messages: [{ id: 'm1', body: 'Hi Ada', author: 'human' }] }
      : JSON.stringify({ outcome: 'sent', channelId: 'dm-ada', args }),
  );
  const request = {
    botSlug: 'ada',
    sessionId: 'orchestrator-ada',
    channelId: 'dm-ada',
    input: 'Hi Ada',
    instructions: 'You are Ada.',
    tools: TOOLS,
    execute,
    signal: new AbortController().signal,
  };
  return { dsh, gateway, host, replays, opened, execute, request, root };
}

describe('Codex Subscription Engine Session (replay)', () => {
  it('answers a DM through bot_send_message and writes the turn into the DSH Session', async () => {
    const { host, dsh, replays, opened, execute, request, root } = setup();
    host.use('ada', 'orchestrator', 'codex');
    await host.runTurn(request);

    const replay = replays[0]!;
    expect(replay.mismatches).toEqual([]);
    expect(replay.gatewayCalls.map((call) => [call.tool, call.status])).toEqual([
      ['channel_read', 200],
      ['bot_send_message', 200],
    ]);
    expect(execute.mock.calls.map(([name, args]) => [name, args])).toEqual([
      ['channel_read', {}],
      ['bot_send_message', { source_event_id: 'source-1', body: 'Hello from Codex' }],
    ]);
    expect(execute).toHaveBeenCalledTimes(2);

    const turnStart = replay.sent.find((message) => message['method'] === 'turn/start');
    expect(turnStart?.['params']).toMatchObject({
      input: [{ type: 'text', text: 'Hi Ada' }],
      sandboxPolicy: { excludeTmpdirEnvVar: true, excludeSlashTmp: true, networkAccess: false },
    });
    const threadStart = replay.sent.find((message) => message['method'] === 'thread/start');
    expect(threadStart?.['params']).toMatchObject({
      cwd: join(root, 'workdirs', 'ada'),
      developerInstructions: 'You are Ada.',
      approvalPolicy: 'on-request',
    });
    expect(replay.sent).toContainEqual({ id: 0, result: { decision: 'decline' } });
    expect(opened[0]!.home).toBe(join(root, 'codex', 'home'));

    const log = dsh.stored.get('orchestrator-ada')!.events;
    const transcript = summarizeSessionTranscript({ sessionId: 'orchestrator-ada', events: log });
    expect(transcript.running).toBe(false);
    expect(transcript.items.map((item) => item.kind)).toEqual([
      'input',
      'reasoning',
      'tool',
      'tool',
      'tool',
      'reply',
      'turn-end',
    ]);
    const tools = transcript.items.filter((item) => item.kind === 'tool');
    expect(tools.map((item) => [item.tool, item.status])).toEqual([
      ['channel_read', 'done'],
      ['bot_send_message', 'done'],
      ['shell', 'failed'],
    ]);
    expect(transcript.items.at(-1)).toMatchObject({ kind: 'turn-end', state: 'done' });

    expect(host.store.nativeSession('orchestrator-ada')).toEqual({
      engine: 'codex',
      nativeId: '019a7f10-0000-7000-8000-000000000001',
      account: 'ChatGPT pro',
    });
    expect(host.describe('orchestrator-ada')).toEqual({
      engine: 'codex',
      account: 'ChatGPT pro',
      state: 'idle',
    });
    await host.close();
    expect(replay.closed).toBe(true);
  });

  it('refuses a Codex login that is not a ChatGPT subscription, with a sign-in hint', async () => {
    const apiKey = RECORDING.map((line) =>
      line.msg['id'] === 2 && line.dir === 'in'
        ? { ...line, msg: { id: 2, result: { account: { type: 'apiKey' } } } }
        : line,
    );
    const { host, request, gateway, dsh } = setup(apiKey);
    host.use('ada', 'orchestrator', 'codex');
    const refused = await host.runTurn(request).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(EngineRefusal);
    expect(refused).toMatchObject({ code: 'engine-not-subscription' });
    expect(String((refused as Error).message)).toContain('deepseekbot engine login codex');
    expect(dsh.stored.size).toBe(0);
    expect(host.describe('orchestrator-ada')).toBeUndefined();
    void gateway;

    expect(codexAccount({ account: null })).toEqual({ kind: 'signed-out', engine: 'codex' });
    expect(codexAccount({ account: { type: 'chatgpt', planType: 'plus' } })).toEqual({
      kind: 'subscription',
      engine: 'codex',
      plan: 'plus',
    });
  });

  it('keeps provider keys and the Human Codex config out of the engine process', () => {
    const spec = codexProcessSpec({
      command: 'codex',
      home: '/bots/engines/codex/home',
      cwd: '/bots/engines/workdirs/ada',
      gateway: { url: 'http://127.0.0.1:1/mcp/ada/s', token: 'secret-token' },
      env: {
        PATH: '/usr/bin',
        HOME: '/Users/human',
        OPENAI_API_KEY: 'sk-1',
        OPENAI_BASE_URL: 'https://proxy',
        CODEX_API_KEY: 'k',
        CODEX_ACCESS_TOKEN: 't',
        CODEX_HOME: '/Users/human/.codex',
        ANTHROPIC_API_KEY: 'a',
        ANTHROPIC_AUTH_TOKEN: 'b',
        AZURE_OPENAI_API_KEY: 'c',
        OPENCODE_GO_API_KEY: 'd',
        GITHUB_TOKEN: 'e',
        LC_ALL: 'C.UTF-8',
      },
    });
    expect(spec.env).toEqual({
      PATH: '/usr/bin',
      HOME: '/Users/human',
      LC_ALL: 'C.UTF-8',
      CODEX_HOME: '/bots/engines/codex/home',
      DEEPSEEKBOT_ENGINE_GATEWAY_TOKEN: 'secret-token',
    });
    expect(spec.args.join(' ')).not.toContain('secret-token');
    expect(spec.args).toContain('mcp_servers.deepseekbot.url="http://127.0.0.1:1/mcp/ada/s"');
    expect(CODEX_TURN_SANDBOX).toMatchObject({ excludeTmpdirEnvVar: true, excludeSlashTmp: true });
  });

  it('continues after a crash: the open turn is closed and the next turn is numbered after it', async () => {
    const { host, dsh, request } = setup();
    const crashed = Session.create(SessionId('orchestrator-ada'));
    crashed.append('turn/start', { turn: 1 });
    crashed.append('step/start', { turn: 1, step: 1 });
    crashed.append(
      'user/message',
      createUserMessage({ content: [{ type: 'text', text: 'before' }], source: { kind: 'user' } }),
      { surfaceOp: 'append' },
    );
    dsh.stored.set('orchestrator-ada', {
      header: crashed.header,
      events: [...structuredClone(crashed.snapshotEvents())],
    });
    host.use('ada', 'orchestrator', 'codex');
    await host.runTurn(request);
    const events = dsh.stored.get('orchestrator-ada')!.events;
    expect(events.filter((event) => event.type === 'turn/end').map((event) => event.data)).toEqual([
      { turn: 1, reason: { kind: 'interrupted' } },
      { turn: 2, reason: { kind: 'completed' } },
    ]);
    await host.close();
  });
});

describe('Engine MCP gateway', () => {
  async function granted() {
    const gateway = createEngineGateway();
    gateways.push(gateway);
    await gateway.start();
    let channel: string | undefined = 'dm-ada';
    const call = vi.fn(async (name: string) => ({ text: `ran ${name}`, isError: false }));
    const grant = gateway.grant({
      botSlug: 'ada',
      sessionId: 'orchestrator-ada',
      tools: TOOLS.slice(0, 2).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.parameters,
      })),
      channelId: () => channel,
      call,
    });
    const other = gateway.grant({
      botSlug: 'bob',
      sessionId: 'orchestrator-bob',
      tools: [],
      channelId: () => 'dm-bob',
      call,
    });
    const post = (url: string, token: string, args: Record<string, unknown>) =>
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: { name: 'channel_read', arguments: args },
        }),
      });
    return { grant, other, call, post, setChannel: (next?: string) => (channel = next) };
  }

  it('serves an MCP client with the Session token', async () => {
    const { grant, call } = await granted();
    const client = new Client({ name: 'test', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(grant.url), {
        requestInit: { headers: { authorization: `Bearer ${grant.token}` } },
      }),
    );
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual(['bot_send_message', 'channel_read']);
    const result = await client.callTool({ name: 'channel_read', arguments: {} });
    expect(result.content).toEqual([{ type: 'text', text: 'ran channel_read' }]);
    expect(call).toHaveBeenCalledTimes(1);
    await client.close();
  });

  it('refuses another Bot, another Channel, a Session between turns and an ended Session', async () => {
    const { grant, other, call, post, setChannel } = await granted();
    expect((await post(other.url, grant.token, {})).status).toBe(401);
    expect((await post(grant.url, other.token, {})).status).toBe(401);
    const otherChannel = await (
      await post(grant.url, grant.token, { channel_id: 'dm-bob' })
    ).json();
    expect(otherChannel.result).toEqual({
      content: [{ type: 'text', text: 'refused: channel-out-of-scope' }],
      isError: true,
    });
    const joined = await (
      await post(grant.url, grant.token, { scope: 'joined', text: 'x' })
    ).json();
    expect(joined.result.isError).toBe(true);
    setChannel(undefined);
    const idle = await (await post(grant.url, grant.token, {})).json();
    expect(idle.result.content[0].text).toBe('refused: session-not-running');
    setChannel('dm-ada');
    grant.revoke();
    expect((await post(grant.url, grant.token, {})).status).toBe(401);
    expect(call).not.toHaveBeenCalled();
  });
});

describe('Engine selection, status and route', () => {
  it('lists no engines on a Cloud or VPS Host and refuses to select one', async () => {
    const { host } = setup(RECORDING, false);
    expect(await host.status()).toEqual([]);
    expect(() => host.use('ada', 'orchestrator', 'codex')).toThrow(EngineRefusal);
    expect(host.engineFor('ada')).toBeUndefined();
    expect(subscriptionEnginesAllowed({}, { DEEPSEEKBOT_HOST_KIND: 'vps' })).toBe(false);
    expect(subscriptionEnginesAllowed({ subscriptionEngines: false }, {})).toBe(false);
    expect(subscriptionEnginesAllowed({}, {})).toBe(true);
  });

  it('reads Codex login status text', () => {
    expect(parseCodexLoginStatus('Logged in using ChatGPT')).toBe('chatgpt');
    expect(parseCodexLoginStatus('Logged in using an API key - sk-***')).toBe('api-key');
    expect(parseCodexLoginStatus('Not logged in')).toBe('signed-out');
  });

  it('serves list, use and login through the Host route', async () => {
    const { host } = setup();
    const deps = { host, botExists: (slug: string) => slug === 'ada' };
    const post = (body: unknown) =>
      engineRouteFetch(
        new Request('http://host/api/botharness/engines', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
        deps,
      );
    expect(
      await (
        await post({ action: 'use', bot: 'ada', role: 'orchestrator', engine: 'codex' })
      ).json(),
    ).toEqual({ bot: 'ada', role: 'orchestrator', engine: 'codex' });
    expect(
      (await post({ action: 'use', bot: 'eve', role: 'orchestrator', engine: 'codex' })).status,
    ).toBe(404);
    expect(
      (await post({ action: 'use', bot: 'ada', role: 'orchestrator', engine: 'gpt' })).status,
    ).toBe(400);
    expect(await (await post({ action: 'login', engine: 'codex' })).json()).toEqual({
      engine: 'codex',
      started: true,
      url: 'https://auth.openai.com/oauth/authorize?x=1',
    });
    const listed = await (
      await engineRouteFetch(new Request('http://host/api/botharness/engines'), deps)
    ).json();
    expect(listed).toEqual({
      engines: [
        { engine: 'codex', available: true, installed: true, version: '0.170.0', login: 'chatgpt' },
      ],
      selections: [{ botSlug: 'ada', role: 'orchestrator', engine: 'codex' }],
    });
    await post({ action: 'use', bot: 'ada', role: 'orchestrator', engine: null });
    expect(host.engineFor('ada')).toBeUndefined();
  });
});
