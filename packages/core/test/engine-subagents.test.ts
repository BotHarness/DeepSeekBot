import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { refuseSubagentGateway } from '../src/engines/claude-engine.js';
import { createEngineGateway, type EngineGateway } from '../src/engines/engine-gateway.js';
import { EngineHost, type EngineTool } from '../src/engines/engine-host.js';
import { SUBAGENT_GATEWAY_REFUSAL } from '../src/engines/engine-session.js';
import { summarizeSessionTranscript } from '../src/runtime/session-transcript.js';
import {
  type ClaudeRecordedLine,
  claudeReplay,
  readClaudeRecording,
} from './fixtures/claude-replay.js';
import { codexReplay, type CodexReplay, readCodexRecording } from './fixtures/codex-replay.js';
import { memoryDsh } from './fixtures/engine-dsh.js';
import { createTempRoot } from './helpers.js';

const CLAUDE = readClaudeRecording(join(import.meta.dirname, 'fixtures', 'claude-dm-turn.jsonl'));
const CODEX = readCodexRecording(join(import.meta.dirname, 'fixtures', 'codex-dm-turn.jsonl'));
const CLAUDE_SESSION = '4f0c2a8e-0000-4000-8000-00000000c1a0';
const MAIN_THREAD = '019a7f10-0000-7000-8000-000000000001';
const CHILD_THREAD = '019a7f10-0000-7000-8000-0000000000c1';

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

function claudeMessage(msg: Record<string, unknown>): ClaudeRecordedLine {
  return { kind: 'message', msg: { session_id: CLAUDE_SESSION, ...msg } };
}

function withClaudeSubagent(): ClaudeRecordedLine[] {
  const at = CLAUDE.findIndex((line) => line.kind === 'message' && line.msg['type'] === 'result');
  const agent = 'toolu_09Agent';
  const lines: ClaudeRecordedLine[] = [
    claudeMessage({
      type: 'assistant',
      parent_tool_use_id: null,
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: agent,
            name: 'Agent',
            input: {
              description: 'Check the forecast',
              prompt: 'Find tomorrow’s forecast for Lisbon.',
              subagent_type: 'general-purpose',
            },
          },
        ],
      },
    }),
    claudeMessage({
      type: 'assistant',
      parent_tool_use_id: agent,
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Read the saved forecast.' },
          {
            type: 'tool_use',
            id: 'toolu_10Read',
            name: 'Read',
            input: { file_path: 'f.md' },
          },
        ],
      },
    }),
    claudeMessage({
      type: 'user',
      parent_tool_use_id: agent,
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_10Read',
            content: 'Sunny, 24°C',
          },
        ],
      },
    }),
    {
      kind: 'permission',
      tool: 'mcp__deepseekbot__bot_send_message',
      input: { body: 'Sunny' },
      toolUseID: 'toolu_11Send',
      agentID: 'agent-1',
    },
    claudeMessage({
      type: 'assistant',
      parent_tool_use_id: agent,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Sunny, 24°C.' }],
      },
    }),
    claudeMessage({
      type: 'user',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: agent, content: 'Sunny, 24°C.' }],
      },
    }),
  ];
  return [...CLAUDE.slice(0, at), ...lines, ...CLAUDE.slice(at)];
}

function host(
  dsh: ReturnType<typeof memoryDsh>,
  options: Partial<ConstructorParameters<typeof EngineHost>[0]>,
) {
  const gateway = createEngineGateway();
  gateways.push(gateway);
  return new EngineHost({
    root: createTempRoot('engine-subagents-'),
    local: true,
    claudeCommand: process.execPath,
    codexCommand: process.execPath,
    gateway,
    sessions: () => dsh.store,
    persistence: () => dsh.persistence,
    detectCodex: async () => ({
      installed: true,
      version: '0.172.0',
      login: 'chatgpt',
    }),
    detectClaude: async () => ({
      installed: true,
      version: '2.1.327',
      login: 'subscription',
    }),
    ...options,
  });
}

function request() {
  return {
    botSlug: 'ada',
    sessionId: 'orchestrator-ada',
    channelId: 'dm-ada',
    input: 'Hi Ada',
    instructions: 'You are Ada.',
    tools: TOOLS,
    execute: vi.fn(async (name: string, args: Record<string, unknown>) =>
      name === 'channel_read'
        ? { messages: [{ id: 'm1', body: 'Hi Ada', author: 'human' }] }
        : JSON.stringify({ outcome: 'sent', channelId: 'dm-ada', args }),
    ),
    signal: new AbortController().signal,
  };
}

function children(dsh: ReturnType<typeof memoryDsh>) {
  return [...dsh.stored.values()].filter((entry) => entry.header.origin === 'subagent');
}

describe('engine sub-agents become read-only DSH Subagent Sessions', () => {
  it('writes a Claude Code sub-agent into a child Session of the Orchestrator', async () => {
    const dsh = memoryDsh();
    const claim = vi.fn();
    const replay = claudeReplay([withClaudeSubagent()]);
    const engines = host(dsh, {
      openClaude: replay.factory,
      claimSubagent: claim,
    });
    engines.use('ada', 'orchestrator', 'claude');
    await engines.runTurn(request());

    expect(replay.options[0]).toMatchObject({ forwardSubagentText: true });
    const [child] = children(dsh);
    expect(child?.header).toMatchObject({
      parentSession: 'orchestrator-ada',
      origin: 'subagent',
      delegationDepth: 1,
    });
    expect(claim).toHaveBeenCalledWith(child!.header.id, 'orchestrator-ada');
    const transcript = summarizeSessionTranscript({
      sessionId: child!.header.id,
      events: child!.events,
    });
    expect(transcript.items.map((item) => item.kind)).toEqual([
      'input',
      'reasoning',
      'tool',
      'reply',
      'turn-end',
    ]);
    expect(transcript.items[0]).toMatchObject({
      text: 'Find tomorrow’s forecast for Lisbon.',
    });
    expect(transcript.items.at(-1)).toMatchObject({
      kind: 'turn-end',
      state: 'done',
    });
    expect(child!.events.find((event) => event.type === 'session/title')?.data).toMatchObject({
      title: 'Check the forecast',
    });

    const main = summarizeSessionTranscript({
      sessionId: 'orchestrator-ada',
      events: dsh.stored.get('orchestrator-ada')!.events,
    });
    const tools = main.items.filter((item) => item.kind === 'tool').map((item) => item.tool);
    expect(tools).toContain('Agent');
    expect(tools).not.toContain('Read');
    expect(replay.permissions.at(-1)).toEqual({
      tool: 'mcp__deepseekbot__bot_send_message',
      decision: { behavior: 'deny', message: SUBAGENT_GATEWAY_REFUSAL },
    });
    await engines.close();
  });

  it('refuses gateway tools to Claude Code sub-agents through a PreToolUse hook', async () => {
    const replay = claudeReplay([CLAUDE]);
    const dsh = memoryDsh();
    const engines = host(dsh, { openClaude: replay.factory });
    engines.use('ada', 'orchestrator', 'claude');
    await engines.runTurn(request());
    const [matcher] = replay.options[0]!.hooks!.PreToolUse!;
    expect(matcher!.matcher).toBe('mcp__deepseekbot__.*');
    expect(
      await refuseSubagentGateway({
        hook_event_name: 'PreToolUse',
        tool_name: 'mcp__deepseekbot__tool_call',
        agent_id: 'agent-1',
      }),
    ).toMatchObject({
      hookSpecificOutput: {
        permissionDecision: 'deny',
        permissionDecisionReason: SUBAGENT_GATEWAY_REFUSAL,
      },
    });
    expect(
      await refuseSubagentGateway({
        hook_event_name: 'PreToolUse',
        tool_name: 'mcp__deepseekbot__report_to_orchestrator',
      }),
    ).toEqual({ continue: true });
    expect(await refuseSubagentGateway({ tool_name: 'Read', agent_id: 'agent-1' })).toEqual({
      continue: true,
    });
    await engines.close();
  });

  it('keeps Codex sub-agent threads out of the main Session and refuses their Bot actions', async () => {
    const at = CODEX.findIndex(
      (line) => line.dir === 'in' && line.msg['method'] === 'turn/completed',
    );
    const notify = (method: string, params: Record<string, unknown>) => ({
      dir: 'in' as const,
      msg: { method, params },
    });
    const spawn = {
      type: 'collabAgentToolCall',
      id: 'item-spawn',
      tool: 'spawnAgent',
      senderThreadId: MAIN_THREAD,
      receiverThreadIds: [CHILD_THREAD],
      prompt: 'Count the open TODOs\nin src/',
      agentsStates: {},
    };
    const send = {
      type: 'mcpToolCall',
      id: 'item-child-send',
      server: 'deepseekbot',
      tool: 'bot_send_message',
      arguments: { source_event_id: 'source-1', body: 'From the sub-agent' },
      status: 'inProgress',
    };
    const wait = {
      type: 'collabAgentToolCall',
      id: 'item-wait',
      tool: 'wait',
      senderThreadId: MAIN_THREAD,
      receiverThreadIds: [CHILD_THREAD],
      agentsStates: {},
    };
    const lines = [
      notify('item/started', {
        threadId: MAIN_THREAD,
        item: { ...spawn, status: 'inProgress' },
      }),
      notify('item/completed', {
        threadId: MAIN_THREAD,
        item: { ...spawn, status: 'completed' },
      }),
      notify('turn/started', {
        threadId: CHILD_THREAD,
        turn: { id: 'child-turn' },
      }),
      notify('item/started', { threadId: CHILD_THREAD, item: send }),
      notify('item/completed', { threadId: CHILD_THREAD, item: send }),
      notify('item/completed', {
        threadId: CHILD_THREAD,
        item: {
          type: 'agentMessage',
          id: 'item-child-answer',
          text: '3 TODOs',
        },
      }),
      notify('turn/completed', {
        threadId: CHILD_THREAD,
        turn: { id: 'child-turn', status: 'completed' },
      }),
      notify('item/started', {
        threadId: MAIN_THREAD,
        item: { ...wait, status: 'inProgress' },
      }),
      notify('item/completed', {
        threadId: MAIN_THREAD,
        item: {
          ...wait,
          status: 'completed',
          agentsStates: {
            [CHILD_THREAD]: { status: 'completed', message: '3 TODOs' },
          },
        },
      }),
    ];
    const recording = [...CODEX.slice(0, at), ...lines, ...CODEX.slice(at)];
    const dsh = memoryDsh();
    const replays: CodexReplay[] = [];
    const engines = host(dsh, {
      openCodex: (options) => {
        const replay = codexReplay(recording, options);
        replays.push(replay);
        return replay.transport;
      },
    });
    engines.use('ada', 'orchestrator', 'codex');
    const turn = request();
    await engines.runTurn(turn);

    expect(replays[0]!.mismatches).toEqual([]);
    expect(turn.execute.mock.calls.map(([name]) => name)).toEqual([
      'channel_read',
      'bot_send_message',
    ]);
    const refused = replays[0]!.gatewayCalls.find((call) =>
      JSON.stringify(call.result).includes('subagent-not-bot'),
    );
    expect(refused?.tool).toBe('bot_send_message');

    const [child] = children(dsh);
    expect(child?.header).toMatchObject({
      parentSession: 'orchestrator-ada',
      origin: 'subagent',
    });
    const transcript = summarizeSessionTranscript({
      sessionId: child!.header.id,
      events: child!.events,
    });
    expect(transcript.items.map((item) => item.kind)).toEqual([
      'input',
      'tool',
      'reply',
      'turn-end',
    ]);
    expect(transcript.items.at(-1)).toMatchObject({
      kind: 'turn-end',
      state: 'done',
    });
    expect(child!.events.find((event) => event.type === 'session/title')?.data).toMatchObject({
      title: 'Count the open TODOs',
    });

    const main = summarizeSessionTranscript({
      sessionId: 'orchestrator-ada',
      events: dsh.stored.get('orchestrator-ada')!.events,
    });
    expect(main.items.at(-1)).toMatchObject({
      kind: 'turn-end',
      state: 'done',
    });
    expect(main.items.filter((item) => item.kind === 'tool').map((item) => item.tool)).toEqual([
      'channel_read',
      'bot_send_message',
      'shell',
      'spawn_agent',
      'wait_agent',
    ]);
    expect(main.items.some((item) => item.kind === 'reply' && item.text === '3 TODOs')).toBe(false);
    await engines.close();
  });
});
