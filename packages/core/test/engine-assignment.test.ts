import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runEngineCommand } from '../src/bots/cli-engine.js';
import { attachOperationalModule } from '../src/database/owner.js';
import {
  createEngineGateway,
  type EngineGateway,
  gatewayScopeRefusal,
} from '../src/engines/engine-gateway.js';
import {
  EngineHost,
  type EngineHostOptions,
  type EngineToolContext,
  type EngineTurnRequest,
} from '../src/engines/engine-host.js';
import { engineRouteFetch } from '../src/engines/engine-route.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createCore } from '../src/plugin.js';
import type { AssignmentAgentRun, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
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
import { codexReplay, readCodexRecording, type CodexReplay } from './fixtures/codex-replay.js';
import { FAKE_BOT as BOT, FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';
import {
  createTestNativeWorkspace,
  createTestWorkspaceGrants,
  TEST_GRANT_ID,
} from './workspace-grant-fixture.js';

const DM = readClaudeRecording(join(import.meta.dirname, 'fixtures', 'claude-dm-turn.jsonl'));
const CODEX_DM = readCodexRecording(join(import.meta.dirname, 'fixtures', 'codex-dm-turn.jsonl'));

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

function hostSetup(
  recordings: ClaudeRecordedLine[][],
  options?: Pick<EngineHostOptions, 'openCodex'>,
) {
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
    releaseGraceMs: 100,
    ...options,
  });
  return { host, replay, dsh, grant, observed, approve };
}

describe('Assignments on a Subscription Engine', () => {
  it.each([
    { scenario: 'the native thread is gone', recovery: 'native' },
    { scenario: 'the Session log is missing', recovery: 'log' },
    { scenario: 'the Directory entry is missing', recovery: 'directory' },
    { scenario: 'the Session log is ahead of the native checkpoint', recovery: 'stale' },
    {
      scenario: 'the checkpoint is stale and the Directory entry is missing',
      recovery: 'stale-directory',
    },
  ] as const)(
    'resumes a matching native Session and checks recovery when $scenario',
    async ({ recovery }) => {
      const recorded = assignmentRecording(true);
      const recordings = [recorded, recorded];
      const { host, replay, dsh } = hostSetup(recordings);
      host.use('ada', 'assignment', 'claude');
      const { adapter } = adapterWith(host);
      const home = createTempRoot('engine-assignment-recovery-');
      const workspace = createTestNativeWorkspace(home);
      const orchestrators: OrchestratorAgentRun[] = [];
      const core = createCore({
        dshHome: home,
        workspaces: () => workspace.lookup,
        agents: {
          runOrchestrator: async (run) => void orchestrators.push(run),
          runAssignment: (run) => adapter.runAssignment(run),
          requestAssignment: (run) => adapter.requestAssignment(run),
          close: () => adapter.close(),
        },
      });
      core.configureAssignmentConcurrencyLimit(() => 1);
      try {
        core.registry.create({ slug: 'ada', displayName: 'Ada' });
        createTestWorkspaceGrants(core.operationalDatabase, workspace.path);
        const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
        const admission = core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
          channelId: dm.id,
          messageId: 'start-recovery',
          body: 'Start the export Assignment.',
        });
        if (!admission.admitted) throw new Error('DM was not admitted');
        await admission.settled;
        const access = orchestrators[0]!.assignments;
        const input = {
          title: 'Export Directory title',
          description: 'Export Directory description',
          instructions: 'The original Assignment Request specified A4.',
          grantId: TEST_GRANT_ID,
        };
        const created = access.create(input);
        if (created.outcome !== 'created') throw new Error('Assignment was not created');
        const { sessionId } = created.assignment;
        expect(access.create(input)).toMatchObject({
          code: 'assignment-capacity',
          activeCount: 1,
          limit: 1,
        });
        await core.runtime.whenIdle();
        const nativeId = replay.options[0]?.sessionId;
        expect(nativeId).toBeDefined();
        expect(host.isLive(sessionId)).toBe(false);

        const stale = recovery === 'stale' || recovery === 'stale-directory';
        const checkpoint = host.store.nativeSession(sessionId);
        if (stale) vi.spyOn(host.store, 'rememberNativeSession').mockImplementationOnce(() => {});
        access.request({ sessionId, mode: 'next-turn', text: 'Keep CSV quoting.' });
        await core.runtime.whenIdle();
        expect(replay.options[1]?.resume).toBe(nativeId);
        expect(replay.prompts[1]).not.toContain('Earlier DSH Session context');

        if (stale) {
          expect(checkpoint?.lastTurn).toBeDefined();
          expect(host.store.nativeSession(sessionId)).toEqual(checkpoint);
          const latest = dsh.stored
            .get(sessionId)
            ?.events.findLast((event) => event.type === 'turn/end');
          expect(latest?.data.turn).toBeGreaterThan(checkpoint?.lastTurn ?? 0);
          recordings.push(recorded);
        } else {
          recordings.push(
            [{ kind: 'exit', detail: `No conversation found with session ID: ${nativeId}` }],
            recorded,
          );
        }
        if (recovery === 'log') dsh.stored.delete(sessionId);
        access.request({ sessionId, mode: 'next-turn', text: 'Now finish the export.' });
        const missingDirectory = recovery === 'directory' || recovery === 'stale-directory';
        if (missingDirectory) {
          attachOperationalModule(core.operationalDatabase, 'engine-recovery-test').transaction(
            (db) => db.prepare('DELETE FROM assignments WHERE session_id = ?').run(sessionId),
          );
        }
        await core.runtime.whenIdle();
        if (recovery === 'log' || missingDirectory) {
          expect(replay.prompts).toHaveLength(2);
          const summary =
            'The engine session was lost and the saved Assignment records are incomplete.';
          expect(orchestrators.filter((run) => run.inbox.includes(summary))).toHaveLength(1);
          if (recovery === 'log') {
            expect(access.inspect(sessionId)).toMatchObject({
              activity: 'error',
              latestReport: { state: 'failed', summary },
            });
          }
          return;
        }
        if (stale) {
          expect(replay.options[2]?.resume).toBeUndefined();
          expect(replay.options[2]?.sessionId).not.toBe(nativeId);
        } else {
          expect(replay.options[2]?.resume).toBe(nativeId);
          expect(replay.options[3]?.sessionId).not.toBe(nativeId);
        }
        expect(replay.prompts[2]).toEqual(
          expect.stringMatching(
            /Export Directory title[\s\S]*specified A4[\s\S]*Keep CSV quoting[\s\S]*Now finish the export/u,
          ),
        );
        expect(access.inspect(sessionId)?.latestReport).toMatchObject({ state: 'completed' });
        expect(
          summarizeSessionTranscript({ sessionId, events: dsh.stored.get(sessionId)!.events })
            .items,
        ).toContainEqual(
          expect.objectContaining({
            source: 'system',
            text: 'Engine session rebuilt from saved context.',
          }),
        );
      } finally {
        await host.close();
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );

  it('runs an Assignment on Claude Code in its Workspace Grant and reports through the gateway', async () => {
    const { host, replay, dsh, grant, observed, approve } = hostSetup([assignmentRecording(true)]);
    const reports: unknown[] = [];
    host.use('ada', 'assignment', 'claude', { model: 'sonnet' });
    expect(host.engineFor('ada')).toBeUndefined();
    const outcome = await host.runTurn({
      botSlug: 'ada',
      role: 'assignment',
      cwd: grant,
      workspaceMode: () => 'workspace-write',
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
      engineWorkspaceMode: () => 'workspace-write',
    }),
  };
}

describe('Engine Assignment at the adapter seam', () => {
  it('interrupts a running Claude Assignment for a steer and delivers one terminal report', async () => {
    const recording = assignmentRecording(true);
    const { host, replay, grant, dsh } = hostSetup([
      [
        ...recording.filter((line) => line.kind === 'account'),
        { kind: 'await-input' },
        { kind: 'await-interrupt' },
        { kind: 'message', msg: { type: 'result', subtype: 'success' } },
        ...recording.filter((line) => line.kind !== 'account'),
      ],
    ]);
    host.use('ada', 'assignment', 'claude', {});
    const { adapter } = adapterWith(host);
    const run = { ...adapterRun(), permission: { ...PERMISSION, primaryCwd: grant } };
    const running = adapter.runAssignment(run);
    void running.catch(() => undefined);
    const text = 'Keep the existing export format.';
    try {
      await vi.waitFor(() => expect(replay.prompts).toHaveLength(1));
      expect(replay.interrupts).toBe(0);
      const delivery = adapter.requestAssignment({ ...run, text, resume: true });
      if (delivery.delivery === 'followup') void delivery.done.catch(() => undefined);
      await vi.waitFor(() => expect(replay.prompts[1]).toBe(text));
      expect(delivery).toEqual({ delivery: 'steer' });
      await running;

      expect(replay.interrupts).toBe(1);
      expect(replay.options).toHaveLength(1);
      expect(run.report).toHaveBeenCalledExactlyOnceWith(
        { state: 'completed', summary: 'Fixed the export button' },
        { turn: 2 },
      );
      expect(run.completedTurn).toHaveBeenCalledExactlyOnceWith({
        turn: 2,
        endSeq: expect.any(Number),
      });
      expect(
        dsh.stored.get(run.sessionId)?.events.filter((event) => event.type === 'turn/end'),
      ).toMatchObject([
        { data: { reason: { kind: 'aborted' } } },
        { data: { reason: { kind: 'completed' } } },
      ]);
    } finally {
      await host.close();
      await adapter.close();
      await running.catch(() => undefined);
    }
  });

  it('delivers report_to_orchestrator from the engine and completes the turn', async () => {
    const requests: EngineTurnRequest[] = [];
    const { host, adapter } = adapterWith({
      engineFor: (_slug, role) => (role === 'assignment' ? 'claude' : undefined),
      isLive: () => false,
      release: async () => undefined,
      runTurn: async (request) => {
        requests.push(request);
        const sendReport = () =>
          request.execute(
            'report_to_orchestrator',
            { state: 'completed', summary: 'Fixed', expects_reply: false },
            request.signal,
            contextAt(3),
          );
        expect(await Promise.all([sendReport(), sendReport()])).toEqual([
          'Report delivered to the Orchestrator.',
          'Terminal report already delivered to the Orchestrator.',
        ]);
        await expect(
          request.execute('bot_send_message', {}, request.signal, contextAt(3)),
        ).rejects.toThrow('refused');
        return { turn: 3, endSeq: 12, text: 'Done.' };
      },
    });
    const run = adapterRun(vi.fn(async () => undefined));
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

describe('Codex Assignment steering through the Bot Inbox', () => {
  it.each([
    { name: 'native steer', native: true, previousReport: false, interruptedStatus: 'interrupted' },
    {
      name: 'codex refusal',
      native: false,
      previousReport: false,
      interruptedStatus: 'interrupted',
    },
    {
      name: 'failed interruption',
      native: false,
      previousReport: false,
      interruptedStatus: 'failed',
    },
    {
      name: 'steer after a report',
      native: true,
      previousReport: true,
      interruptedStatus: 'interrupted',
    },
  ])(
    'delivers one report for the request after $name',
    async ({ native, previousReport, interruptedStatus }) => {
      const text = 'Keep the existing export format.';
      const summary = 'Kept the existing export format';
      const preceding = 'Reported before the new request';
      const beforeSteer = 'I am checking the export button.';
      const originalTurnId = '019a7f10-0000-7000-8000-000000000002';
      const end = (id: string, status: string) => ({
        method: 'turn/completed',
        params: { turn: { id, status } },
      });
      const report = (id: string, reportSummary = summary) => ({
        method: 'item/started',
        params: {
          item: {
            type: 'mcpToolCall',
            id,
            server: 'deepseekbot',
            tool: 'report_to_orchestrator',
            arguments: { state: 'completed', summary: reportSummary },
          },
        },
      });
      const continuation: typeof CODEX_DM = native
        ? [{ dir: 'in', msg: { id: 5, result: { turnId: originalTurnId } } }]
        : [
            { dir: 'in', msg: { id: 5, error: { code: -32601, message: 'Method not found' } } },
            { dir: 'out', msg: { id: 6, method: 'turn/interrupt' } },
            { dir: 'in', msg: { id: 6, result: {} } },
            { dir: 'in', msg: end(originalTurnId, interruptedStatus) },
            ...CODEX_DM.slice(3, 5),
            { dir: 'out', msg: { id: 7, method: 'turn/start' } },
            { dir: 'in', msg: { id: 7, result: { turn: { id: 'continued' } } } },
          ];
      let start!: (replay: CodexReplay) => void;
      const started = new Promise<CodexReplay>((resolve) => (start = resolve));
      const { host, dsh } = hostSetup([], {
        openCodex(options) {
          const replay = codexReplay(
            [
              ...CODEX_DM.slice(0, 11),
              {
                dir: 'in',
                msg: {
                  method: 'item/completed',
                  params: { item: { type: 'agentMessage', id: 'before-steer', text: beforeSteer } },
                },
              },
              ...(previousReport
                ? [{ dir: 'in' as const, msg: report('prior-report', preceding) }]
                : []),
              { dir: 'out', msg: { id: 5, method: 'turn/steer' } },
              ...continuation,
              { dir: 'in', msg: report('report-1') },
              { dir: 'in', msg: report('report-2') },
              {
                dir: 'in',
                msg: end(native ? originalTurnId : 'continued', 'completed'),
              },
            ],
            options,
          );
          start(replay);
          return replay.transport;
        },
      });
      host.use('ada', 'assignment', 'codex', {});
      const { adapter } = adapterWith(host);
      const home = createTempRoot('engine-assignment-inbox-');
      const workspace = createTestNativeWorkspace(home);
      const orchestratorRuns: OrchestratorAgentRun[] = [];
      const core = createCore({
        dshHome: home,
        workspaces: () => workspace.lookup,
        agents: {
          runOrchestrator: async (run) => void orchestratorRuns.push(run),
          runAssignment: (run) => adapter.runAssignment(run),
          requestAssignment: (run) => adapter.requestAssignment(run),
          close: () => adapter.close(),
        },
      });
      try {
        core.registry.create({ slug: 'ada', displayName: 'Ada' });
        createTestWorkspaceGrants(core.operationalDatabase, workspace.path);
        const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
        if (dm === undefined) throw new Error('Missing DM');
        const admission = core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
          channelId: dm.id,
          messageId: 'start-export',
          body: 'Fix the export button',
        });
        if (!admission.admitted) throw new Error('DM was not admitted');
        await admission.settled;
        const access = orchestratorRuns[0]?.assignments;
        if (access === undefined) throw new Error('Missing Orchestrator Assignment access');
        const created = access.create({
          title: 'Fix export',
          description: 'Fix the export button',
          grantId: TEST_GRANT_ID,
        });
        if (created.outcome !== 'created') throw new Error('Assignment was not created');
        const { sessionId } = created.assignment;
        const replay = await started;
        await vi.waitFor(() => expect(replay.sent.at(-1)?.['method']).toBe('turn/start'));
        if (previousReport) {
          await vi.waitFor(() =>
            expect(orchestratorRuns.some((run) => run.inbox.includes(preceding))).toBe(true),
          );
        }

        const delivery = access.request({ sessionId, mode: 'next-step', text });
        await vi.waitFor(() => expect(replay.gatewayCalls).toHaveLength(previousReport ? 3 : 2));
        await core.runtime.whenIdle();
        expect(delivery).toMatchObject({ delivery: 'steer', acceptance: 'accepted' });
        expect(replay.mismatches).toEqual([]);
        expect(
          replay.sent.find((frame) => frame['method'] === 'turn/steer')?.['params'],
        ).toMatchObject({ expectedTurnId: originalTurnId, input: [{ type: 'text', text }] });
        const turns = replay.sent.filter((frame) => frame['method'] === 'turn/start');
        expect(turns).toHaveLength(native ? 1 : 2);
        if (!native)
          expect(turns[1]?.['params']).toMatchObject({ input: [{ type: 'text', text }] });
        const reports = core.attention
          .list({ botSlug: 'ada', limit: 100 })
          .items.filter((item) => item.reason === 'assignment-report');
        expect(reports).toHaveLength(previousReport ? 2 : 1);
        expect(orchestratorRuns.slice(1).filter((run) => run.inbox.includes(summary))).toHaveLength(
          1,
        );
        const events = dsh.stored.get(sessionId)?.events ?? [];
        const transcript = summarizeSessionTranscript({ sessionId, events });
        const before = transcript.items.findIndex(
          (item) => item.kind === 'reply' && item.text === beforeSteer,
        );
        const after = transcript.items.findIndex(
          (item) => item.kind === 'input' && item.text === text,
        );
        expect(before).toBeGreaterThan(-1);
        expect(after).toBeGreaterThan(before);
      } finally {
        await host.close();
        await core.runtime.whenIdle();
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );
});

it('keeps a channelless Assignment grant away from every Channel and destination', () => {
  expect(gatewayScopeRefusal({ state: 'completed' }, undefined, true)).toBeUndefined();
  expect(gatewayScopeRefusal({ channel_id: 'dm-ada' }, undefined, true)).toBe(
    'channel-out-of-scope',
  );
  expect(gatewayScopeRefusal({ bot_id: 'bob' }, undefined, true)).toBe('destination-out-of-scope');
  expect(gatewayScopeRefusal({ state: 'completed' }, undefined)).toBe('session-not-running');
});
