import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  claudeAccount,
  claudeQueryOptions,
  claudeRateLimit,
  claudeToolName,
  spawnClaudeProcess,
} from '../src/engines/claude-engine.js';
import { parseClaudeAuthStatus } from '../src/engines/claude-status.js';
import { createEngineGateway, type EngineGateway } from '../src/engines/engine-gateway.js';
import { EngineHost, type EngineTool } from '../src/engines/engine-host.js';
import { resolveEngineCommand } from '../src/engines/engine-launch.js';
import { engineRouteFetch } from '../src/engines/engine-route.js';
import { EngineRefusal } from '../src/engines/engine-session.js';
import { summarizeSessionTranscript } from '../src/runtime/session-transcript.js';
import {
  type ClaudeRecordedLine,
  claudeReplay,
  readClaudeRecording,
} from './fixtures/claude-replay.js';
import { memoryDsh } from './fixtures/engine-dsh.js';
import { createTempRoot } from './helpers.js';

const RECORDING = readClaudeRecording(
  join(import.meta.dirname, 'fixtures', 'claude-dm-turn.jsonl'),
);
const SESSION = '4f0c2a8e-0000-4000-8000-00000000c1a0';

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
];

const gateways: EngineGateway[] = [];
afterEach(async () => {
  await Promise.all(gateways.splice(0).map((gateway) => gateway.close()));
});

function withAccount(info: Record<string, unknown>): ClaudeRecordedLine[] {
  return RECORDING.map((line) => (line.kind === 'account' ? { kind: 'account', info } : line));
}

function setup(
  recordings: ClaudeRecordedLine[][] = [RECORDING],
  root = createTempRoot('claude-'),
  approve?: ConstructorParameters<typeof EngineHost>[0]['approve'],
) {
  const dsh = memoryDsh();
  const gateway = createEngineGateway();
  gateways.push(gateway);
  const replay = claudeReplay(recordings);
  const host = new EngineHost({
    root,
    local: true,
    gateway,
    claudeCommand: process.execPath,
    env: {
      PATH: '/usr/bin',
      HOME: '/Users/human',
      ANTHROPIC_API_KEY: 'sk-ant-leak',
      ANTHROPIC_AUTH_TOKEN: 'leak',
      CLAUDE_CODE_OAUTH_TOKEN: 'leak',
      CLAUDE_CONFIG_DIR: '/Users/human/.claude',
    },
    sessions: () => dsh.store,
    persistence: () => dsh.persistence,
    openClaude: replay.factory,
    ...(approve === undefined ? {} : { approve }),
    detectCodex: async () => ({ installed: false, login: 'unknown' }),
    detectClaude: async () => ({ installed: true, version: '2.1.327', login: 'subscription' }),
    startClaudeLogin: async () => ({ url: 'https://claude.ai/oauth/authorize?x=1' }),
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
  host.use('ada', 'orchestrator', 'claude');
  return { dsh, host, replay, execute, request, root };
}

describe('Claude Code Subscription Engine Session (replay)', () => {
  it('answers a DM through bot_send_message and writes the turn into the DSH Session', async () => {
    const { host, dsh, replay, execute, request, root } = setup();
    await host.runTurn(request);

    expect(replay.prompts).toEqual(['Hi Ada']);
    expect(replay.gatewayCalls.map((call) => [call.tool, call.status])).toEqual([
      ['channel_read', 200],
      ['bot_send_message', 200],
    ]);
    expect(execute.mock.calls.map(([name, args]) => [name, args])).toEqual([
      ['channel_read', {}],
      ['bot_send_message', { source_event_id: 'source-1', body: 'Hello from Claude' }],
    ]);
    expect(replay.permissions).toEqual([
      {
        tool: 'Bash',
        decision: { behavior: 'deny', message: 'The Human did not approve this tool call.' },
      },
    ]);

    const options = replay.options[0]!;
    expect(options).toMatchObject({
      cwd: join(root, 'workdirs', 'ada'),
      pathToClaudeCodeExecutable: process.execPath,
      settingSources: [],
      strictMcpConfig: true,
      mcpServersDelivery: 'initialize',
      permissionMode: 'default',
      systemPrompt: { type: 'preset', preset: 'claude_code', append: 'You are Ada.' },
    });
    expect(options.env).toEqual({
      PATH: '/usr/bin',
      HOME: '/Users/human',
      CLAUDE_CONFIG_DIR: join(root, 'claude', 'home'),
      CLAUDE_AGENT_SDK_CLIENT_APP: 'deepseekbot',
    });
    expect(options.mcpServers['deepseekbot']).toMatchObject({ type: 'http', alwaysLoad: true });
    expect(options.mcpServers['deepseekbot']!.headers['Authorization']).toMatch(/^Bearer /u);
    expect(options.sessionId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(options.resume).toBeUndefined();

    const log = dsh.stored.get('orchestrator-ada')!.events;
    const transcript = summarizeSessionTranscript({ sessionId: 'orchestrator-ada', events: log });
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
      ['Bash', 'denied'],
      ['bot_send_message', 'done'],
    ]);
    expect(transcript.items.at(-1)).toMatchObject({ kind: 'turn-end', state: 'done' });

    expect(host.store.nativeSession('orchestrator-ada')).toEqual({
      engine: 'claude',
      nativeId: options.sessionId,
      account: 'Claude max',
    });
    expect(host.describe('orchestrator-ada')).toEqual({
      engine: 'claude',
      account: 'Claude max',
      state: 'idle',
    });
    await host.close();
    expect(replay.closed).toBe(1);
  });

  it('turns a canUseTool request into an approval card and returns the answer to Claude', async () => {
    const approve = vi.fn(async () => 'allowed-once' as const);
    const { host, request, replay } = setup(
      [RECORDING],
      createTempRoot('claude-approve-'),
      approve,
    );
    await host.runTurn(request);
    expect(approve).toHaveBeenCalledWith(
      expect.objectContaining({
        botSlug: 'ada',
        sessionId: 'orchestrator-ada',
        callId: 'toolu_02Touch',
        toolName: 'Bash',
        input: {
          command: 'touch ../outside.txt',
          description: 'Create a file outside the Bot folder',
        },
      }),
    );
    expect(replay.permissions).toEqual([
      {
        tool: 'Bash',
        decision: {
          behavior: 'allow',
          updatedInput: {
            command: 'touch ../outside.txt',
            description: 'Create a file outside the Bot folder',
          },
        },
      },
    ]);
    await host.close();
  });

  it('refuses a Console API-key login with a sign-in hint and opens no DSH Session', async () => {
    const { host, request, dsh } = setup([
      withAccount({ email: '<redacted>', apiKeySource: '/login managed key' }),
    ]);
    const refused = await host.runTurn(request).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(EngineRefusal);
    expect(refused).toMatchObject({ code: 'engine-not-subscription' });
    expect(String((refused as Error).message)).toContain('deepseekbot engine login claude');
    expect(dsh.stored.size).toBe(0);
    expect(host.describe('orchestrator-ada')).toBeUndefined();

    const signedOut = setup([withAccount({})]);
    await expect(signedOut.host.runTurn(signedOut.request)).rejects.toMatchObject({
      code: 'engine-signed-out',
    });
  });

  it('stops a turn whose init reports an API key, even after the account looked like a subscription', async () => {
    const metered = RECORDING.map((line) =>
      line.kind === 'message' && line.msg['subtype'] === 'init'
        ? { ...line, msg: { ...line.msg, apiKeySource: 'ANTHROPIC_API_KEY' } }
        : line,
    );
    const { host, request, replay } = setup([metered]);
    await expect(host.runTurn(request)).rejects.toMatchObject({
      code: 'engine-failed',
      message: expect.stringContaining('bills per use'),
    });
    expect(replay.interrupts).toBe(1);
    await expect(host.runTurn(request)).rejects.toMatchObject({
      code: 'engine-not-subscription',
    });
  });

  it('sends no prompt when the API-key init arrives before the first turn', async () => {
    const init = RECORDING.find(
      (line) => line.kind === 'message' && line.msg['subtype'] === 'init',
    )!;
    const early = [
      RECORDING[0]!,
      { ...init, msg: { ...(init as { msg: object }).msg, apiKeySource: 'ANTHROPIC_API_KEY' } },
      ...RECORDING.slice(1).filter((line) => line !== init),
    ] as ClaudeRecordedLine[];
    const { host, request, replay } = setup([early]);
    await expect(host.runTurn(request)).rejects.toMatchObject({
      message: expect.stringContaining('bills per use'),
    });
    expect(replay.prompts).toEqual([]);
  });

  it('stops a turn on a Claude Code too old to take the gateway at initialize', async () => {
    const old = RECORDING.map((line) =>
      line.kind === 'message' && line.msg['subtype'] === 'init'
        ? { ...line, msg: { ...line.msg, claude_code_version: '2.1.99' } }
        : line,
    );
    const { host, request } = setup([old]);
    await expect(host.runTurn(request)).rejects.toMatchObject({
      message: expect.stringContaining('Update it to 2.1.326 or newer'),
    });
  });

  it('resumes the stored native session and starts a new one only when Claude has lost it', async () => {
    const root = createTempRoot('claude-resume-');
    const first = setup([RECORDING], root);
    await first.host.runTurn(first.request);
    const stored = first.host.store.nativeSession('orchestrator-ada')!.nativeId;
    await first.host.close();

    const second = setup([RECORDING], root);
    await second.host.runTurn(second.request);
    expect(second.replay.options[0]).toMatchObject({ resume: stored });
    expect(second.replay.options[0]!.sessionId).toBeUndefined();
    expect(second.host.store.nativeSession('orchestrator-ada')!.nativeId).toBe(stored);
    await second.host.close();

    const gone = setup(
      [
        [
          {
            kind: 'exit',
            detail: `Claude Code process exited with code 1: No conversation found with session ID: ${stored}`,
          },
        ],
        RECORDING,
      ],
      root,
    );
    await gone.host.runTurn(gone.request);
    expect(gone.replay.options.map((options) => options.resume)).toEqual([stored, undefined]);
    const fresh = gone.replay.options[1]!.sessionId!;
    expect(fresh).not.toBe(stored);
    expect(gone.host.store.nativeSession('orchestrator-ada')!.nativeId).toBe(fresh);
    expect(gone.replay.prompts).toEqual(['Hi Ada']);
    await gone.host.close();
  });

  it('fails the turn when Claude Code exits mid-turn and reopens it for the next one', async () => {
    const crash = RECORDING.slice(0, 5).concat([
      { kind: 'exit', detail: 'Claude Code exited (1)' },
    ]);
    const { host, request, replay } = setup([crash, RECORDING]);
    await expect(host.runTurn(request)).rejects.toMatchObject({
      code: 'engine-failed',
      message: expect.stringContaining('exited'),
    });
    await host.runTurn(request);
    expect(replay.options).toHaveLength(2);
    expect(replay.options[1]).toMatchObject({ resume: replay.options[0]!.sessionId });
    await host.close();
  });

  it('lists Claude Code beside Codex and starts its sign-in through the Host route', async () => {
    const { host } = setup();
    const deps = { host, botExists: (slug: string) => slug === 'ada' };
    const listed = await (
      await engineRouteFetch(new Request('http://host/api/botharness/engines'), deps)
    ).json();
    expect(listed.engines).toEqual([
      {
        engine: 'codex',
        available: false,
        reason: 'not-installed',
        installed: false,
        login: 'unknown',
      },
      {
        engine: 'claude',
        available: true,
        installed: true,
        version: '2.1.327',
        login: 'subscription',
      },
    ]);
    expect(listed.selections).toEqual([{ botSlug: 'ada', role: 'orchestrator', engine: 'claude' }]);
    const login = await engineRouteFetch(
      new Request('http://host/api/botharness/engines', {
        method: 'POST',
        body: JSON.stringify({ action: 'login', engine: 'claude' }),
      }),
      deps,
    );
    expect(await login.json()).toEqual({
      engine: 'claude',
      started: true,
      url: 'https://claude.ai/oauth/authorize?x=1',
    });
  });
});

describe('Claude Code engine boundaries', () => {
  it('reads the account report: a subscription only with a plan and no API key', () => {
    expect(claudeAccount({ subscriptionType: 'pro', tokenSource: 'claude.ai' })).toEqual({
      kind: 'subscription',
      engine: 'claude',
      plan: 'pro',
    });
    expect(claudeAccount({ subscriptionType: 'max', apiKeySource: 'none' })).toMatchObject({
      kind: 'subscription',
    });
    expect(
      claudeAccount({ subscriptionType: 'max', apiKeySource: 'ANTHROPIC_API_KEY' }),
    ).toMatchObject({ kind: 'metered' });
    expect(claudeAccount({ apiProvider: 'bedrock' })).toMatchObject({ kind: 'metered' });
    expect(claudeAccount({ email: 'x' })).toMatchObject({ kind: 'metered' });
    expect(claudeAccount(undefined)).toEqual({ kind: 'signed-out', engine: 'claude' });
  });

  it('reads `claude auth status --json`', () => {
    expect(parseClaudeAuthStatus('{"loggedIn":false}')).toBe('signed-out');
    expect(
      parseClaudeAuthStatus(
        '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","subscriptionType":"max"}',
      ),
    ).toBe('subscription');
    expect(parseClaudeAuthStatus('{"loggedIn":true,"authMethod":"console"}')).toBe('api-key');
    expect(parseClaudeAuthStatus('{"loggedIn":true,"apiProvider":"vertex"}')).toBe('api-key');
    expect(parseClaudeAuthStatus('{"loggedIn":true,"authMethod":"oauth_token"}')).toBe('unknown');
    expect(parseClaudeAuthStatus('Login method: Claude API account')).toBe('unknown');
  });

  it('turns a rate-limit report into the engine quota event', () => {
    expect(claudeRateLimit({ status: 'allowed', utilization: 0.42, resetsAt: 1795400000 })).toEqual(
      { kind: 'rate-limit', usedPercent: 42, resetsAt: 1795400000, limited: false },
    );
    expect(claudeRateLimit({ status: 'rejected' })).toMatchObject({ limited: true });
    expect(claudeRateLimit({ status: 'allowed', isUsingOverage: true })).toMatchObject({
      limited: true,
    });
    expect(claudeToolName('mcp__deepseekbot__bot_send_message')).toBe('bot_send_message');
    expect(claudeToolName('mcp__other__x')).toBe('mcp__other__x');
  });

  it('keeps the gateway token off the command line and provider keys out of the process', async () => {
    const stderr = vi.fn();
    const options = claudeQueryOptions(
      {
        executable: '/usr/local/bin/claude',
        home: '/bots/engines/claude/home',
        cwd: '/bots/engines/workdirs/ada',
        instructions: 'You are Ada.',
        gateway: { url: 'http://127.0.0.1:1/mcp/ada/s', token: 'secret-token' },
        env: { PATH: '/usr/bin', ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'b', LANG: 'C' },
      },
      { canUseTool: vi.fn(), stderr },
      { sessionId: SESSION },
    );
    expect(options.mcpServersDelivery).toBe('initialize');
    expect(options.env).toEqual({
      PATH: '/usr/bin',
      LANG: 'C',
      CLAUDE_CONFIG_DIR: '/bots/engines/claude/home',
      CLAUDE_AGENT_SDK_CLIENT_APP: 'deepseekbot',
    });
    expect(JSON.stringify(options.env)).not.toContain('secret-token');

    const child = spawnClaudeProcess(
      {
        command: process.execPath,
        args: ['-e', 'process.stdout.write(JSON.stringify(Object.keys(process.env)))'],
        env: {
          ...options.env,
          ANTHROPIC_API_KEY: 'injected',
          ANTHROPIC_BASE_URL: 'https://proxy',
          CLAUDE_CODE_USE_BEDROCK: '1',
          CLAUDE_CODE_ENTRYPOINT: 'sdk-ts',
        },
        signal: new AbortController().signal,
      },
      stderr,
    ) as import('node:child_process').ChildProcessWithoutNullStreams;
    const out = await new Promise<string>((resolve, reject) => {
      let text = '';
      child.stdout.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')));
      child.on('error', (error) => reject(new Error('spawn failed', { cause: error })));
      child.on('close', () => resolve(text));
    });
    const keys = JSON.parse(out) as string[];
    expect(keys).toContain('CLAUDE_CODE_ENTRYPOINT');
    expect(keys).toContain('CLAUDE_CONFIG_DIR');
    expect(keys.filter((key) => /^ANTHROPIC_|CLAUDE_CODE_USE_/u.test(key))).toEqual([]);
  });

  it('finds the Human claude on PATH and reports a missing one', () => {
    const exists = (path: string) => ['/tmp/stale/claude', '/opt/claude/bin/claude'].includes(path);
    const executable = (path: string) => path === '/opt/claude/bin/claude';
    expect(
      resolveEngineCommand('claude', {
        platform: 'darwin',
        env: { PATH: '/usr/bin:/tmp/stale:/opt/claude/bin' },
        exists,
        executable,
      }),
    ).toBe('/opt/claude/bin/claude');
    expect(
      resolveEngineCommand('claude', {
        platform: 'linux',
        env: { PATH: '/usr/bin' },
        exists,
        executable,
      }),
    ).toBeUndefined();
  });

  it('refuses a Claude turn when claude is not on PATH', async () => {
    const dsh = memoryDsh();
    const gateway = createEngineGateway();
    gateways.push(gateway);
    const host = new EngineHost({
      root: createTempRoot('claude-missing-'),
      local: true,
      gateway,
      claudeCommand: 'claude-not-installed-here',
      env: { PATH: '/nonexistent' },
      sessions: () => dsh.store,
      persistence: () => dsh.persistence,
    });
    host.use('ada', 'orchestrator', 'claude');
    await expect(
      host.runTurn({
        botSlug: 'ada',
        sessionId: 'orchestrator-ada',
        channelId: 'dm-ada',
        input: 'Hi',
        instructions: 'You are Ada.',
        tools: TOOLS,
        execute: vi.fn(),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'engine-not-installed' });
  });
});
