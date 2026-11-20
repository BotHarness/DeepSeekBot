import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createEngineGateway, type EngineGateway } from '../src/engines/engine-gateway.js';
import {
  type EngineApprovalRequest,
  EngineHost,
  type EngineSessionState,
} from '../src/engines/engine-host.js';
import { engineRouteFetch } from '../src/engines/engine-route.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { summarizeSessionTranscript } from '../src/runtime/session-transcript.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';
import { codexReplay, type CodexReplay, readCodexRecording } from './fixtures/codex-replay.js';
import { memoryDsh } from './fixtures/engine-dsh.js';
import { createTempRoot } from './helpers.js';

type Line = ReturnType<typeof readCodexRecording>[number];

const RECORDING = readCodexRecording(join(import.meta.dirname, 'fixtures', 'codex-dm-turn.jsonl'));
const COMMAND_COMPLETED = RECORDING.findIndex(
  (line) =>
    line.msg['method'] === 'item/completed' &&
    (line.msg['params'] as { item: { type: string } }).item.type === 'commandExecution',
);

function decided(decision: 'accept' | 'decline', recording: readonly Line[] = RECORDING): Line[] {
  return recording.map((line, index) => {
    if (line.dir === 'out' && line.msg['method'] === undefined)
      return { ...line, msg: { ...line.msg, result: { decision } } };
    if (index !== COMMAND_COMPLETED || decision === 'decline') return line;
    const msg = structuredClone(line.msg) as {
      params: { item: Record<string, unknown> };
    };
    Object.assign(msg.params.item, { status: 'completed', exitCode: 0, aggregatedOutput: '' });
    return { ...line, msg: msg as unknown as Record<string, unknown> };
  });
}

function nextTurn(recording: readonly Line[]): Line[] {
  const account = recording.filter((line) => line.msg['id'] === 2);
  const turnStart = recording.findIndex((line) => line.msg['method'] === 'turn/start');
  const renumber = (line: Line, from: number, to: number): Line =>
    line.msg['id'] === from ? { ...line, msg: { ...line.msg, id: to } } : line;
  return [
    ...account.map((line) => renumber(line, 2, 5)),
    ...recording.slice(turnStart).map((line) => renumber(line, 4, 6)),
  ];
}

const gateways: EngineGateway[] = [];
afterEach(async () => {
  await Promise.all(gateways.splice(0).map((gateway) => gateway.close()));
});

function engineHost(
  recording: readonly Line[],
  approve: (
    request: EngineApprovalRequest,
  ) => Promise<'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'>,
) {
  const dsh = memoryDsh();
  const gateway = createEngineGateway();
  gateways.push(gateway);
  const replays: CodexReplay[] = [];
  const states: EngineSessionState[] = [];
  const host = new EngineHost({
    root: createTempRoot('engine-approval-'),
    local: true,
    gateway,
    sessions: () => dsh.store,
    persistence: () => dsh.persistence,
    observe: (_slug, _session, state) => states.push(state),
    approve,
    openCodex: (options) => {
      const replay = codexReplay(recording, options);
      replays.push(replay);
      return replay.transport;
    },
  });
  host.use('ada', 'orchestrator', 'codex');
  const request = {
    botSlug: 'ada',
    sessionId: 'orchestrator-ada',
    channelId: 'dm-ada',
    input: 'Write a file outside your folder',
    instructions: 'You are Ada.',
    tools: [],
    execute: vi.fn(async () => JSON.stringify({ outcome: 'sent' })),
    signal: new AbortController().signal,
  };
  return { dsh, host, replays, states, request };
}

function shellStatus(dsh: ReturnType<typeof memoryDsh>) {
  const events = dsh.stored.get('orchestrator-ada')!.events;
  return summarizeSessionTranscript({ sessionId: 'orchestrator-ada', events })
    .items.filter((item) => item.kind === 'tool' && item.tool === 'shell')
    .map((item) => (item.kind === 'tool' ? item.status : undefined));
}

describe('Codex approval requests (replay)', () => {
  it('runs the command once the Human approves, waiting for approval meanwhile', async () => {
    const asked: EngineApprovalRequest[] = [];
    let described: unknown;
    const { host, dsh, replays, states, request } = engineHost(decided('accept'), async (ask) => {
      asked.push(ask);
      described = host.describe('orchestrator-ada');
      return 'allowed-once';
    });
    await host.runTurn(request);
    expect(replays[0]!.mismatches).toEqual([]);
    expect(replays[0]!.sent).toContainEqual({ id: 0, result: { decision: 'accept' } });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({
      botSlug: 'ada',
      sessionId: 'orchestrator-ada',
      toolName: 'shell',
      input: {
        command: 'touch ../outside-probe',
        cwd: '<bot-workdir>',
        reason: 'Write outside the workspace',
      },
    });
    expect(asked[0]!.session.id).toBe('orchestrator-ada');
    expect(described).toMatchObject({ state: 'waiting-approval' });
    expect(states).toEqual(['starting', 'running', 'waiting-approval', 'running', 'idle']);
    const events = dsh.stored.get('orchestrator-ada')!.events;
    const audit = events.filter((event) => event.type.startsWith('approval/'));
    expect(audit.map((event) => event.type)).toEqual(['approval/asked', 'approval/decided']);
    expect(audit[0]!.data).toMatchObject({ toolName: 'shell', callId: 'item-cmd' });
    expect(audit[1]!.data).toMatchObject({ outcome: 'allowed-once' });
    expect(shellStatus(dsh)).toEqual(['done']);
    await host.close();
  });

  it('returns a refusal to Codex when the Human denies, and shows the call as denied', async () => {
    const { host, dsh, replays, request } = engineHost(decided('decline'), async () => 'rejected');
    await host.runTurn(request);
    expect(replays[0]!.mismatches).toEqual([]);
    expect(replays[0]!.sent).toContainEqual({ id: 0, result: { decision: 'decline' } });
    expect(shellStatus(dsh)).toEqual(['denied']);
    expect(host.describe('orchestrator-ada')).toMatchObject({ state: 'idle' });
    await host.close();
  });

  it('declines and closes the audit pair when the turn is stopped while the card is open', async () => {
    const stop = new AbortController();
    const { host, dsh, request } = engineHost(
      decided('decline'),
      (ask) =>
        new Promise((resolve) => {
          ask.signal.addEventListener('abort', () => resolve('cancelled'));
          stop.abort();
        }),
    );
    await host.runTurn({ ...request, signal: stop.signal });
    const events = dsh.stored.get('orchestrator-ada')!.events;
    const types = events.map((event) => event.type);
    expect(types.filter((type) => type.startsWith('approval/'))).toEqual([
      'approval/asked',
      'approval/decided',
    ]);
    expect(types.indexOf('approval/decided')).toBeLessThan(types.lastIndexOf('turn/end'));
    await host.close();
  });
});

describe('Bot tool approvals through the gateway', () => {
  it('records a gateway tool approval in the engine Session like a Codex approval', async () => {
    const asked: EngineApprovalRequest[] = [];
    let gatewayUrl = '';
    let gatewayToken = '';
    const { host, dsh, request } = engineHost(decided('accept'), async (ask) => {
      asked.push(ask);
      if (ask.toolName !== 'shell') return 'rejected';
      const response = await fetch(gatewayUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${gatewayToken}` },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'tool_call', arguments: { name: 'browser_open', arguments: {} } },
        }),
      });
      const reply = (await response.json()) as { result: { content: { text: string }[] } };
      expect(reply.result.content[0]!.text).toBe('Human approval was rejected');
      return 'allowed-once';
    });
    const gateway = gateways.at(-1)!;
    const grant = gateway.grant.bind(gateway);
    vi.spyOn(gateway, 'grant').mockImplementation((spec) => {
      const granted = grant(spec);
      gatewayUrl = granted.url;
      gatewayToken = granted.token;
      return granted;
    });
    await host.runTurn({
      ...request,
      tools: [{ name: 'tool_call', description: 'Run a Bot tool', parameters: {} }],
      execute: vi.fn(async (_name, _args, _signal, context) => {
        const outcome = await context.ask({
          toolName: 'browser_open',
          input: {},
          reason: 'Browser please',
          device: { kind: 'browser' },
        });
        return `Human approval was ${outcome}`;
      }),
      signal: new AbortController().signal,
    });
    expect(asked.map((ask) => ask.toolName)).toEqual(['shell', 'browser_open']);
    expect(asked[1]).toMatchObject({ reason: 'Browser please', device: { kind: 'browser' } });
    const audit = dsh.stored
      .get('orchestrator-ada')!
      .events.filter((event) => event.type.startsWith('approval/'));
    expect(
      audit.map((event) => [event.type, (event.data as { toolName?: string }).toolName]),
    ).toEqual([
      ['approval/asked', 'shell'],
      ['approval/asked', 'browser_open'],
      ['approval/decided', undefined],
      ['approval/decided', undefined],
    ]);
    await host.close();
  });
});

const agents: BotAgentAdapter = {
  async runOrchestrator() {},
  async runAssignment() {},
  async close() {},
  requestAssignment() {
    throw new Error('No Assignment expected');
  },
};

describe('Codex approvals as Channel tool approval cards', () => {
  it('answers a card from the bridge, and Always allow stops the next card for that tool', async () => {
    const core = createCore({ dshHome: createTempRoot('engine-approval-card-'), agents });
    const broker = new ChannelToolApproval(core.channels, core.ownership, core.toolRules);
    const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, toolApproval: broker });
    const twoTurns = [...decided('accept'), ...nextTurn(decided('accept'))];
    const { host, dsh, replays, request } = engineHost(twoTurns, (ask) => broker.askEngine(ask));
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const channel = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      core.ownership.claim({
        sessionId: 'orchestrator-ada',
        botSlug: 'ada',
        rootRole: 'orchestrator',
        at: '2026-11-18T08:00:00Z',
      });
      const cards = () =>
        core.channels.readMessages(channel.id).filter((m) => m.toolApprovalRequest !== undefined);

      const first = host.runTurn(request);
      await vi.waitFor(() => expect(cards()).toHaveLength(1));
      const card = cards()[0]!;
      expect(card.toolApprovalRequest).toMatchObject({
        sessionId: 'orchestrator-ada',
        toolName: 'shell',
        role: 'orchestrator',
        allowAlways: true,
      });
      expect(JSON.parse(card.toolApprovalRequest!.input)).toMatchObject({
        command: 'touch ../outside-probe',
      });
      const listed = await engineRouteFetch(new Request('http://host/api/botharness/engines'), {
        host,
        botExists: () => true,
        approvals: () =>
          broker.requests('ada').map((notice) => ({
            botSlug: notice.botSlug,
            sessionId: notice.sessionId,
            channelId: notice.channelId,
            messageId: notice.messageId,
            toolName: notice.toolName,
            input: notice.input,
            expiresAt: notice.expiresAt,
          })),
      });
      expect(((await listed.json()) as { approvals: unknown[] }).approvals).toMatchObject([
        { botSlug: 'ada', channelId: channel.id, messageId: card.id, toolName: 'shell' },
      ]);
      expect(
        await methods.toolApprovalDecide({
          channelId: channel.id,
          messageId: card.id,
          outcome: 'allowed-always-tool',
        }),
      ).toMatchObject({ ok: true });
      await first;
      expect(replays[0]!.sent).toContainEqual({ id: 0, result: { decision: 'accept' } });

      await host.runTurn(request);
      expect(replays[0]!.mismatches).toEqual([]);
      expect(cards()).toHaveLength(1);
      expect(methods.toolApprovalRules({ slug: 'ada' })).toMatchObject({
        ok: true,
        value: { rules: [{ kind: 'tool', toolName: 'shell' }] },
      });
      expect(shellStatus(dsh)).toEqual(['done', 'done']);
    } finally {
      await host.close();
      broker.close();
      await core.runtime.close();
      core.externalMessaging.close();
      core.live.close();
      core.operationalDatabase.close();
    }
  });
});
