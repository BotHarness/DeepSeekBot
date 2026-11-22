import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runEngineCommand } from '../src/bots/cli-engine.js';
import { CliLiveError } from '../src/bots/cli-live-error.js';
import { codexRateLimit, codexUsageLimit } from '../src/engines/codex-engine.js';
import { createEngineGateway, type EngineGateway } from '../src/engines/engine-gateway.js';
import { EngineHost, type EngineTool } from '../src/engines/engine-host.js';
import { engineRouteFetch } from '../src/engines/engine-route.js';
import { ownerEngineSelection } from './engine-route-fixture.js';
import { EngineLimitError } from '../src/engines/engine-session.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { summarizeSessionTranscript } from '../src/runtime/session-transcript.js';
import { codexReplay, type CodexReplay, readCodexRecording } from './fixtures/codex-replay.js';
import { memoryDsh } from './fixtures/engine-dsh.js';
import { createTempRoot } from './helpers.js';

const fixture = (name: string) => readCodexRecording(join(import.meta.dirname, 'fixtures', name));
const DM_TURN = fixture('codex-dm-turn.jsonl');
const LIMIT_TURN = fixture('codex-limit-turn.jsonl');
const RESETS_AT = new Date(1_795_027_200_000).toISOString();
const START = 1_795_010_000_000;

const TOOLS: EngineTool[] = [
  { name: 'bot_send_message', description: 'Send', parameters: { type: 'object' } },
  { name: 'channel_read', description: 'Read', parameters: { type: 'object' } },
];

const gateways: EngineGateway[] = [];
afterEach(async () => {
  await Promise.all(gateways.splice(0).map((gateway) => gateway.close()));
});

function setup(recordings: Array<typeof DM_TURN>) {
  const dsh = memoryDsh();
  const gateway = createEngineGateway();
  gateways.push(gateway);
  const replays: CodexReplay[] = [];
  const clock = { now: START };
  const host = new EngineHost({
    root: createTempRoot('engine-quota-'),
    local: true,
    gateway,
    now: () => clock.now,
    sessions: () => dsh.store,
    persistence: () => dsh.persistence,
    openCodex: (options) => {
      const recording = recordings.shift();
      if (recording === undefined) throw new Error('No Codex process expected');
      const replay = codexReplay(recording, options);
      replays.push(replay);
      return replay.transport;
    },
    detectCodex: async () => ({ installed: true, version: '0.170.0', login: 'chatgpt' }),
  });
  const request = {
    botSlug: 'ada',
    sessionId: 'orchestrator-ada',
    channelId: 'dm-ada',
    input: 'Hi Ada',
    instructions: 'You are Ada.',
    tools: TOOLS,
    execute: vi.fn(async () => 'ok'),
    signal: new AbortController().signal,
  };
  return { dsh, host, replays, clock, request };
}

describe('Codex quota and limits (#4493)', () => {
  it.each([
    ['You’ve hit your usage limit. Try again at 5:26 PM.', 15, new Date(2026, 10, 18, 17, 26)],
    ['You’ve hit your usage limit. Try again at 5:26 PM.', 18, new Date(2026, 10, 19, 17, 26)],
    [
      'You’ve hit your usage limit for codex_other. Switch to another model now, or try again at Nov 22nd, 2026 12:07 AM.',
      15,
      new Date(2026, 10, 22, 0, 7),
    ],
  ])('uses the upstream retry timestamp in %s', async (message, hour, reset) => {
    const notification = LIMIT_TURN.findIndex(
      ({ msg }) => msg['method'] === 'account/rateLimits/updated',
    );
    const error = { message, codexErrorInfo: 'usageLimitExceeded' };
    const { host, clock, request } = setup([
      [
        ...LIMIT_TURN.slice(0, notification),
        { dir: 'in', msg: { method: 'error', params: { willRetry: false, error } } },
        {
          dir: 'in',
          msg: { method: 'turn/completed', params: { turn: { status: 'failed', error } } },
        },
      ],
    ]);
    clock.now = new Date(2026, 10, 18, hour).getTime();
    host.use('ada', 'orchestrator', 'codex');
    try {
      await expect(host.runTurn(request)).rejects.toMatchObject({ until: reset.toISOString() });
    } finally {
      await host.close();
    }
  });

  it('maps identified windows and leaves a window with no duration unclassified', () => {
    expect(
      codexRateLimit({
        primary: { usedPercent: 12, resetsAt: 10, windowDurationMins: 300 },
        secondary: { usedPercent: 64, resetsAt: 20, windowDurationMins: 10_080 },
        rateLimitReachedType: null,
      }),
    ).toEqual({
      kind: 'rate-limit',
      windows: {
        session: {
          remainingPercent: 88,
          resetsAt: new Date(10_000).toISOString(),
          windowMinutes: 300,
        },
        weekly: {
          remainingPercent: 36,
          resetsAt: new Date(20_000).toISOString(),
          windowMinutes: 10_080,
        },
      },
      limited: false,
    });
    expect(
      codexRateLimit({
        primary: { usedPercent: 100, resetsAt: 10 },
        secondary: { usedPercent: 64, resetsAt: 20 },
        rateLimitReachedType: 'primary',
      }),
    ).toEqual({
      kind: 'rate-limit',
      unclassified: { remainingPercent: 0, resetsAt: new Date(10_000).toISOString() },
      resetsAt: new Date(10_000).toISOString(),
      limited: true,
    });
    expect(codexRateLimit({ primary: null, spendControlReached: true })).toEqual({
      kind: 'rate-limit',
      limited: true,
    });
    expect(codexUsageLimit({ codexErrorInfo: 'usageLimitExceeded' })).toBe(true);
    expect(codexUsageLimit({ codexErrorInfo: { usageLimitExceeded: {} } })).toBe(true);
    expect(codexUsageLimit({ message: 'stream disconnected' })).toBe(false);
  });

  it('records the quota a turn reports and shows it in status and Session detail', async () => {
    const { host, request } = setup([DM_TURN]);
    host.use('ada', 'orchestrator', 'codex');
    await host.runTurn(request);
    const quota = {
      usedPercent: 79,
      resetsAt: new Date(1_795_249_567_000).toISOString(),
      observedAt: new Date(START).toISOString(),
      windows: {
        weekly: {
          remainingPercent: 21,
          windowMinutes: 10_080,
          resetsAt: new Date(1_795_249_567_000).toISOString(),
        },
      },
      source: 'turn',
    };
    expect(host.describe('orchestrator-ada')).toEqual({
      engine: 'codex',
      account: 'ChatGPT pro',
      state: 'idle',
      quota,
    });
    expect((await host.status())[0]?.quota).toEqual(quota);
  });

  it('stops on a replayed limit, refuses later turns without starting Codex, and runs again after the reset', async () => {
    const { host, dsh, replays, clock, request } = setup([LIMIT_TURN, DM_TURN]);
    host.renameAccount('codex-default', 'Work subscription', 0);
    host.use('ada', 'orchestrator', 'codex');

    const failure = await host.runTurn(request).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(EngineLimitError);
    expect(failure).toMatchObject({
      code: 'ENGINE_LIMIT',
      engine: 'codex',
      account: 'Work subscription',
      until: RESETS_AT,
    });
    expect(replays[0]!.mismatches).toEqual([]);
    const transcript = summarizeSessionTranscript({
      sessionId: 'orchestrator-ada',
      events: dsh.stored.get('orchestrator-ada')!.events,
    });
    expect(transcript.items.at(-1)?.kind).toBe('turn-end');
    expect(host.describe('orchestrator-ada')?.quota).toMatchObject({
      usedPercent: 100,
      limitedUntil: RESETS_AT,
    });
    expect((await host.status())[0]?.quota?.limitedUntil).toBe(RESETS_AT);

    clock.now += 60_000;
    await expect(host.runTurn(request)).rejects.toBeInstanceOf(EngineLimitError);
    expect(replays).toHaveLength(1);
    expect(host.runsOnEngine('ada')).toBe(true);

    await host.release('orchestrator-ada');
    clock.now = Date.parse(RESETS_AT) + 1;
    expect(host.describe('orchestrator-ada')?.quota?.limitedUntil).toBeUndefined();
    await host.runTurn(request);
    expect(host.describe('orchestrator-ada')?.quota).toMatchObject({ usedPercent: 79 });
    await host.close();
  });

  it('leaves the engine for the API model only when the Human chose a fallback beforehand', async () => {
    const { host, request } = setup([LIMIT_TURN]);
    host.use('ada', 'orchestrator', 'codex');
    await expect(host.runTurn(request)).rejects.toBeInstanceOf(EngineLimitError);
    expect(host.fallsBack('ada')).toBe(false);
    expect(host.runsOnEngine('ada')).toBe(true);
    host.use('ada', 'orchestrator', 'codex', { fallback: true });
    expect(host.fallsBack('ada')).toBe(true);
    expect(host.runsOnEngine('ada')).toBe(false);
    host.use('ada', 'orchestrator', 'codex');
    expect(host.runsOnEngine('ada')).toBe(true);
    await host.close();
  });

  it('switches through the Host route and the CLI, and resumes a paused Bot', async () => {
    const { host } = setup([]);
    const released: string[] = [];
    const botExists = (slug: string) => slug === 'ada';
    const deps = {
      host,
      botExists,
      ...ownerEngineSelection(host, botExists, (slug) => void released.push(slug)),
    };
    const connect = async () => ({
      http: async (_path: string, body?: Record<string, unknown>) => {
        const response = await engineRouteFetch(
          new Request('http://host/api/botharness/engines', {
            method: body === undefined ? 'GET' : 'POST',
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          }),
          deps,
        );
        return { bytes: new Uint8Array(await response.arrayBuffer()) };
      },
    });
    expect(
      await runEngineCommand(
        'engine-use',
        ['ada', 'codex'],
        { role: ['orchestrator'], fallback: 'on' },
        connect,
      ),
    ).toEqual({ bot: 'ada', role: 'orchestrator', engine: 'codex', fallback: true });
    expect(host.fallsBack('ada')).toBe(true);
    expect(
      await runEngineCommand('engine-use', ['ada', 'none'], { role: ['orchestrator'] }, connect),
    ).toEqual({ bot: 'ada', role: 'orchestrator', engine: null });
    expect(host.engineFor('ada')).toBeUndefined();
    expect(released).toEqual(['ada', 'ada']);
    await expect(
      runEngineCommand(
        'engine-use',
        ['ada', 'codex'],
        { role: ['orchestrator'], fallback: 'yes' },
        connect,
      ),
    ).rejects.toBeInstanceOf(CliLiveError);
    await expect(
      runEngineCommand(
        'engine-use',
        ['ada', 'none'],
        { role: ['orchestrator'], fallback: 'on' },
        connect,
      ),
    ).rejects.toThrow('engine use none takes no --fallback.');
    expect(host.store.selections()).toEqual([]);
    await host.close();
  });
});

describe('A Bot whose subscription runs out (#4493)', () => {
  const clock = Date.parse('2026-11-18T12:00:00.000Z');
  const until = new Date(clock + 3 * 3_600_000).toISOString();
  const API_ROUTE = { provider: 'deepseek-official', model: 'deepseek-v4-pro' };

  function bot(options: { fallback: boolean }) {
    const runs: string[] = [];
    let limited = true;
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        if (limited) {
          runs.push('engine');
          if (options.fallback) limited = false;
          throw new EngineLimitError('codex', 'ChatGPT pro', until);
        }
        runs.push('api');
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({
      dshHome: createTempRoot('bh-engine-limit-'),
      agents,
      autoContinueDelaysMs: [1],
      engineFallback: (_slug, limit) =>
        options.fallback
          ? {
              kind: 'switch',
              from: { provider: limit.engine, model: limit.account },
              to: API_ROUTE,
              reason: 'quota',
              until: limit.until,
            }
          : undefined,
    });
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = async (id: string) => {
      const channel = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, channel.id, {
        id,
        at: new Date(clock).toISOString(),
        author: { kind: 'human' },
        body: 'Hello',
      });
      core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: channel.id,
        messageId: id,
        body: 'Hello',
      });
      for (let index = 0; index < 3; index += 1) {
        await core.runtime.whenIdle();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };
    return { core, runs, dm };
  }

  it('stops the Bot and posts the limit card with the reset time when no fallback was chosen', async () => {
    const { core, runs, dm } = bot({ fallback: false });
    try {
      await dm('ada-1');
      expect(runs).toEqual(['engine']);
      expect(core.runtime.heldCause?.('ada')).toBe('quota');
      const cards = core.channels.readMessages('dm-ada').filter((message) => message.turnStop);
      expect(cards).toHaveLength(1);
      expect(cards[0]!.turnStop).toMatchObject({
        botSlug: 'ada',
        held: true,
        cause: 'quota',
        engine: { engine: 'codex', account: 'ChatGPT pro', until },
        rests: [{ provider: 'codex', model: 'ChatGPT pro', until }],
      });
      expect(
        core.channels.readMessages('dm-ada').filter((message) => message.sessionFailure),
      ).toEqual([]);
      expect(core.channels.readMessages('dm-ada').filter((m) => m.modelSwitch)).toEqual([]);
      expect(core.runtime.releaseQuotaHold?.('ada')).toBe(true);
      expect(core.runtime.heldCause?.('ada')).toBeUndefined();
      expect(core.runtime.releaseQuotaHold?.('ada')).toBe(false);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('continues on the fallback model chosen beforehand, with a Model Switch Notice and no hold', async () => {
    const { core, runs, dm } = bot({ fallback: true });
    try {
      await dm('ada-1');
      expect(runs).toEqual(['engine', 'api']);
      expect(core.runtime.heldCause?.('ada')).toBeUndefined();
      expect(core.channels.readMessages('dm-ada').filter((m) => m.turnStop)).toEqual([]);
      const notices = core.channels.readMessages('dm-ada').filter((m) => m.modelSwitch);
      expect(notices).toHaveLength(1);
      expect(notices[0]!.modelSwitch).toMatchObject({
        from: { provider: 'codex', model: 'ChatGPT pro' },
        to: API_ROUTE,
        reason: 'quota',
        until,
      });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
