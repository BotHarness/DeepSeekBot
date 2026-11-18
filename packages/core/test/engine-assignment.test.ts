import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runEngineCommand } from '../src/bots/cli-engine.js';
import {
  createEngineGateway,
  type EngineGateway,
  gatewayScopeRefusal,
} from '../src/engines/engine-gateway.js';
import {
  EngineHost,
  type EngineToolContext,
  type EngineTurnRequest,
} from '../src/engines/engine-host.js';
import { engineRouteFetch } from '../src/engines/engine-route.js';
import type { AssignmentAgentRun } from '../src/runtime/bot-runtime.js';
import {
  createDshBotAgentAdapter,
  type DshBotEngines,
} from '../src/runtime/dsh-bot-agent-adapter.js';
import { summarizeSessionTranscript } from '../src/runtime/session-transcript.js';
import {
  type ClaudeRecordedLine,
  claudeReplay,
  readClaudeRecording,
} from './fixtures/claude-replay.js';
import { memoryDsh } from './fixtures/engine-dsh.js';
import { FAKE_BOT as BOT, FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

const DM = readClaudeRecording(join(import.meta.dirname, 'fixtures', 'claude-dm-turn.jsonl'));

type Block = Record<string, unknown>;
const blocks = (line: ClaudeRecordedLine): Block[] => {
  if (line.kind !== 'message') return [];
  const content = (line.msg['message'] as Block | undefined)?.['content'];
  return Array.isArray(content) ? (content as Block[]) : [];
};
const usesTool = (line: ClaudeRecordedLine, id: string) =>
  blocks(line).some((block) => block['id'] === id || block['tool_use_id'] === id);

function assignmentRecording(reports: boolean): ClaudeRecordedLine[] {
  return DM.filter(
    (line) =>
      !usesTool(line, 'toolu_01ChannelRead') && (reports || !usesTool(line, 'toolu_03Send')),
  ).map((line) => {
    if (!usesTool(line, 'toolu_03Send') || line.kind !== 'message') return line;
    const msg = structuredClone(line.msg);
    for (const block of blocks({ kind: 'message', msg }))
      if (block['type'] === 'tool_use') {
        block['name'] = 'mcp__deepseekbot__report_to_orchestrator';
        block['input'] = { state: 'completed', summary: 'Fixed the export button' };
      }
    return { kind: 'message', msg };
  });
}

const PERMISSION = {
  grantId: 'grant-1',
  workspaceId: 'workspace-1',
  primaryCwd: '/project',
  mode: 'workspace-write' as const,
  approval: 'ask' as const,
  presetRevision: 0,
};

const gateways: EngineGateway[] = [];
afterEach(async () => {
  await Promise.all(gateways.splice(0).map((gateway) => gateway.close()));
});

function hostSetup(recordings: ClaudeRecordedLine[][]) {
  const root = createTempRoot('engine-assignment-');
  const grant = join(root, 'project');
  mkdirSync(grant, { recursive: true });
  const dsh = memoryDsh();
  const gateway = createEngineGateway();
  gateways.push(gateway);
  const replay = claudeReplay(recordings);
  const observed: Array<[string, string]> = [];
  const approve = vi.fn(async () => 'rejected' as const);
  const host = new EngineHost({
    root,
    local: true,
    gateway,
    claudeCommand: process.execPath,
    env: { PATH: '/usr/bin', HOME: '/Users/human' },
    sessions: () => dsh.store,
    persistence: () => dsh.persistence,
    openClaude: replay.factory,
    approve,
    observe: (_slug, _id, state, role) => observed.push([state, role]),
    detectCodex: async () => ({ installed: false, login: 'unknown' }),
    detectClaude: async () => ({ installed: true, version: '2.1.327', login: 'subscription' }),
  });
  return { host, replay, dsh, grant, observed, approve };
}

describe('Assignments on a Subscription Engine', () => {
  it('runs an Assignment on Claude Code in its Workspace Grant and reports through the gateway', async () => {
    const { host, replay, dsh, grant, observed, approve } = hostSetup([assignmentRecording(true)]);
    const reports: unknown[] = [];
    host.use('ada', 'assignment', 'claude', { model: 'sonnet' });
    expect(host.engineFor('ada')).toBeUndefined();
    const outcome = await host.runTurn({
      botSlug: 'ada',
      role: 'assignment',
      cwd: grant,
      sessionId: 'assignment-1',
      channelId: undefined,
      input: 'Fix the export button',
      instructions: 'You are an Assignment Agent.',
      tools: [
        {
          name: 'report_to_orchestrator',
          description: 'Report',
          parameters: { type: 'object', properties: {} },
        },
      ],
      execute: async (name, args) => {
        reports.push([name, args]);
        return 'Report delivered to the Orchestrator.';
      },
      signal: new AbortController().signal,
    });

    const options = replay.options[0]!;
    expect(options).toMatchObject({ cwd: grant, permissionMode: 'acceptEdits', model: 'sonnet' });
    expect(reports).toEqual([
      ['report_to_orchestrator', { state: 'completed', summary: 'Fixed the export button' }],
    ]);
    expect(replay.gatewayCalls.map((call) => [call.tool, call.status])).toEqual([
      ['report_to_orchestrator', 200],
    ]);
    expect(approve).toHaveBeenCalledWith(expect.objectContaining({ toolName: 'Bash' }));
    expect(replay.permissions[0]?.decision.behavior).toBe('deny');
    expect(outcome).toMatchObject({ turn: 1, text: 'I answered Ada in the DM.' });
    expect(outcome.endSeq).toBeGreaterThan(0);
    expect(observed).toContainEqual(['running', 'assignment']);
    expect(observed.every(([, role]) => role === 'assignment')).toBe(true);

    const events = dsh.stored.get('assignment-1')!.events;
    const transcript = summarizeSessionTranscript({ sessionId: 'assignment-1', events });
    expect(
      transcript.items.filter((item) => item.kind === 'tool').map((item) => item.tool),
    ).toEqual(['Bash', 'report_to_orchestrator']);
    expect(host.store.selections()).toEqual([
      { botSlug: 'ada', role: 'assignment', engine: 'claude', fallback: false, model: 'sonnet' },
    ]);
    expect(host.orchestratorRunner('ada')).toBeUndefined();
    await host.close();
  });

  it('chooses the Assignment engine through the route and the CLI', async () => {
    const { host } = hostSetup([assignmentRecording(true)]);
    const route = async (body: Record<string, unknown>) =>
      (await (
        await engineRouteFetch(
          new Request('http://host/api/botharness/engines', {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          { host, botExists: (slug) => slug === 'ada' },
        )
      ).json()) as Record<string, unknown>;
    expect(
      await route({ action: 'use', bot: 'ada', role: 'assignment', engine: 'claude' }),
    ).toEqual({ bot: 'ada', role: 'assignment', engine: 'claude' });
    expect(host.engineFor('ada', 'assignment')).toBe('claude');
    expect(
      await route({
        action: 'use',
        bot: 'ada',
        role: 'assignment',
        engine: 'claude',
        fallback: true,
      }),
    ).toMatchObject({ error: { code: 'invalid-input' } });
    expect(await route({ action: 'use', bot: 'ada', role: 'assignment', engine: null })).toEqual({
      bot: 'ada',
      role: 'assignment',
      engine: null,
    });
    expect(host.engineFor('ada', 'assignment')).toBeUndefined();
    await host.close();

    const http = vi.fn(async (_path: string, body?: Record<string, unknown>) => ({
      bytes: new TextEncoder().encode(
        JSON.stringify({ bot: 'ada', role: body?.['role'], engine: body?.['engine'] }),
      ),
    }));
    await runEngineCommand('engine-use', ['ada', 'codex'], { role: ['assignment'] }, async () => ({
      http,
    }));
    expect(http.mock.calls.at(-1)?.[1]).toEqual({
      action: 'use',
      bot: 'ada',
      role: 'assignment',
      engine: 'codex',
    });
    await expect(
      runEngineCommand(
        'engine-use',
        ['ada', 'codex'],
        { role: ['assignment'], fallback: 'on' },
        async () => ({ http }),
      ),
    ).rejects.toMatchObject({ code: 'usage' });
  });
});

function adapterRun(report = vi.fn()): AssignmentAgentRun {
  return {
    sessionId: 'assignment-1',
    bot: BOT,
    text: 'Fix the export button',
    permission: PERMISSION,
    report,
    completedTurn: vi.fn(),
  } as unknown as AssignmentAgentRun;
}

const contextAt = (turn: number) =>
  ({
    session: {
      id: 'assignment-1',
      snapshotEvents: () => [{ type: 'turn/start', data: { turn } }],
    },
    ask: async () => 'allowed-once' as const,
  }) as unknown as EngineToolContext;

function adapterWith(engines: DshBotEngines, host = new FakeAgentHost({ kind: 'completed' })) {
  return {
    host,
    adapter: createDshBotAgentAdapter({
      agents: host,
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => {},
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      engines,
    }),
  };
}

describe('Engine Assignment at the adapter seam', () => {
  it('delivers report_to_orchestrator from the engine and completes the turn', async () => {
    const requests: EngineTurnRequest[] = [];
    const { host, adapter } = adapterWith({
      engineFor: (_slug, role) => (role === 'assignment' ? 'claude' : undefined),
      isLive: () => false,
      release: async () => undefined,
      runTurn: async (request) => {
        requests.push(request);
        expect(
          await request.execute(
            'report_to_orchestrator',
            { state: 'completed', summary: 'Fixed', expects_reply: false },
            request.signal,
            contextAt(3),
          ),
        ).toBe('Report delivered to the Orchestrator.');
        await expect(
          request.execute('bot_send_message', {}, request.signal, contextAt(3)),
        ).rejects.toThrow('refused');
        return { turn: 3, endSeq: 12, text: 'Done.' };
      },
    });
    const run = adapterRun();
    try {
      await adapter.runAssignment(run);
    } finally {
      await adapter.close();
    }
    expect(host.createOptions).toHaveLength(0);
    const request = requests[0]!;
    expect(request).toMatchObject({ role: 'assignment', cwd: '/project', channelId: undefined });
    expect(request.tools.map((tool) => tool.name)).toEqual(['report_to_orchestrator']);
    expect(request.input).toContain('Fix the export button');
    expect(request.instructions).toContain('report_to_orchestrator');
    expect(request.instructions).toContain('/project');
    expect(run.report).toHaveBeenCalledTimes(1);
    expect(run.report).toHaveBeenCalledWith(
      { state: 'completed', summary: 'Fixed', expectsReply: false },
      { turn: 3 },
    );
    expect(run.completedTurn).toHaveBeenCalledWith({ turn: 3, endSeq: 12 });
  });

  it('forwards the final text of an engine Assignment that did not report', async () => {
    const { adapter } = adapterWith({
      engineFor: (_slug, role) => (role === 'assignment' ? 'codex' : undefined),
      isLive: () => false,
      release: async () => undefined,
      runTurn: async () => ({ turn: 1, endSeq: 4, text: 'I fixed the button.' }),
    });
    const run = adapterRun();
    try {
      await adapter.runAssignment(run);
    } finally {
      await adapter.close();
    }
    expect(run.report).toHaveBeenCalledWith(
      {
        state: 'completed',
        summary: expect.stringMatching(
          /^\[Host: this Assignment ended its turn without report_to_orchestrator\.[\s\S]*I fixed the button\.$/u,
        ),
      },
      { turn: 1 },
    );

    const silent = adapterWith({
      engineFor: (_slug, role) => (role === 'assignment' ? 'codex' : undefined),
      isLive: () => false,
      release: async () => undefined,
      runTurn: async () => ({ turn: 1, endSeq: 4 }),
    });
    try {
      await expect(silent.adapter.runAssignment(adapterRun())).rejects.toThrow(
        'Assignment finished without report_to_orchestrator',
      );
    } finally {
      await silent.adapter.close();
    }
  });

  it('runs a DSH Assignment for an engine Orchestrator and the reverse', async () => {
    const runTurn = vi.fn(async () => ({}));
    const engineOrchestrator = adapterWith(
      {
        engineFor: (_slug, role) => (role === 'assignment' ? undefined : 'claude'),
        isLive: () => false,
        release: async () => undefined,
        runTurn,
      },
      new FakeAgentHost(),
    );
    try {
      await engineOrchestrator.adapter.runAssignment(adapterRun());
    } finally {
      await engineOrchestrator.adapter.close();
    }
    expect(runTurn).not.toHaveBeenCalled();
    expect(engineOrchestrator.host.createOptions).toHaveLength(1);

    const roles: Array<string | undefined> = [];
    const engineAssignment = adapterWith({
      engineFor: (_slug, role) => (role === 'assignment' ? 'claude' : undefined),
      isLive: () => false,
      release: async () => undefined,
      runTurn: async (request) => {
        roles.push(request.role);
        return { turn: 1, endSeq: 2, text: 'ok' };
      },
    });
    try {
      await engineAssignment.adapter.runAssignment(adapterRun());
    } finally {
      await engineAssignment.adapter.close();
    }
    expect(roles).toEqual(['assignment']);
    expect(engineAssignment.host.createOptions).toHaveLength(0);
  });
});

it('keeps a channelless Assignment grant away from every Channel and destination', () => {
  expect(gatewayScopeRefusal({ state: 'completed' }, undefined, true)).toBeUndefined();
  expect(gatewayScopeRefusal({ channel_id: 'dm-ada' }, undefined, true)).toBe(
    'channel-out-of-scope',
  );
  expect(gatewayScopeRefusal({ bot_id: 'bob' }, undefined, true)).toBe('destination-out-of-scope');
  expect(gatewayScopeRefusal({ state: 'completed' }, undefined)).toBe('session-not-running');
});
