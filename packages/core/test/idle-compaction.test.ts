import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runIdleCompactionCommand } from '../src/bots/cli-idle-compaction.js';
import { createBridgeMethods, type BridgeMethodsDeps } from '../src/bridge/methods.js';
import { mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import {
  compactionThresholdTokens,
  createIdleCompaction,
  DEEPSEEK_DEFAULT_LIFETIME_MS,
  idleCompactionDelayMs,
  meetsSizeFloor,
  MIN_IDLE_MS,
  observeCacheSample,
  resolveCacheLifetime,
  runCompactCommand,
  type IdleCompactionAgent,
  type IdleCompactionPorts,
  type IdleCompactionRecord,
} from '../src/runtime/idle-compaction.js';
import {
  createIdleCompactionSettings,
  IDLE_COMPACTION_SETTINGS_FILE,
} from '../src/runtime/idle-compaction-settings.js';
import type { DshSessionEvent } from '../src/sessions/source.js';
import { createUsageProjection } from '../src/usage/usage.js';
import { createTempRoot, createTestOwnership, trackTestOwner } from './helpers.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const deepseek = { provider: 'deepseek', model: 'deepseek-v4-flash' };

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function profileDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'botharness-idle-compaction-'));
  dirs.push(dir);
  return dir;
}

describe('cache lifetime resolution', () => {
  it('prefers the Host setting, then the catalog, then observation, then the DeepSeek default', () => {
    const anthropic = { provider: 'anthropic', model: 'claude-x' };
    expect(
      resolveCacheLifetime({ route: deepseek, overrides: { 'deepseek/deepseek-v4-flash': 600 } }),
    ).toEqual({ ms: 600_000, source: 'setting' });
    expect(resolveCacheLifetime({ route: anthropic, overrides: {} })).toEqual({
      ms: 300_000,
      source: 'catalog',
    });
    expect(
      resolveCacheLifetime({
        route: deepseek,
        overrides: {},
        observation: { samples: 3, warmGapMs: 5 * HOUR },
      }),
    ).toEqual({ ms: 5 * HOUR, source: 'observed' });
    expect(resolveCacheLifetime({ route: deepseek, overrides: {} })).toEqual({
      ms: DEEPSEEK_DEFAULT_LIFETIME_MS,
      source: 'default',
    });
    expect(
      resolveCacheLifetime({ route: { provider: 'opencode-go', model: 'other' }, overrides: {} }),
    ).toEqual({ source: 'unknown' });
  });

  it('treats a warm gap as a lower bound and a longer cold gap as a cap', () => {
    expect(
      resolveCacheLifetime({
        route: deepseek,
        overrides: {},
        observation: { samples: 1, warmGapMs: 40 * MINUTE },
      }),
    ).toEqual({ ms: DEEPSEEK_DEFAULT_LIFETIME_MS, source: 'default' });
    expect(
      resolveCacheLifetime({
        route: { provider: 'opencode-go', model: 'other' },
        overrides: {},
        observation: { samples: 1, warmGapMs: 40 * MINUTE },
      }),
    ).toEqual({ ms: 40 * MINUTE, source: 'observed' });
    expect(
      resolveCacheLifetime({
        route: deepseek,
        overrides: {},
        observation: { samples: 2, warmGapMs: 20 * MINUTE, coldGapMs: 50 * MINUTE },
      }),
    ).toEqual({ ms: 50 * MINUTE, source: 'observed' });
  });

  it('records the longest warm gap and the shortest cold gap beyond it', () => {
    let observed = observeCacheSample(undefined, 30 * MINUTE, 0.95);
    expect(observed).toEqual({ samples: 1, warmGapMs: 30 * MINUTE });
    expect(observeCacheSample(observed, 30 * 1000, 0.95)).toBeUndefined();
    expect(observeCacheSample(observed, 10 * MINUTE, 0.95)).toBeUndefined();
    observed = observeCacheSample(observed, 3 * HOUR, 0.01)!;
    expect(observed).toEqual({ samples: 2, warmGapMs: 30 * MINUTE, coldGapMs: 3 * HOUR });
    observed = observeCacheSample(observed, 4 * HOUR, 0.9)!;
    expect(observed).toEqual({ samples: 3, warmGapMs: 4 * HOUR });
  });
});

describe('idle compaction trigger', () => {
  it('fires at half the lifetime, never before 15 minutes, and skips lifetimes under 15 minutes', () => {
    expect(idleCompactionDelayMs(2 * HOUR)).toBe(HOUR);
    expect(idleCompactionDelayMs(20 * MINUTE)).toBe(MIN_IDLE_MS);
    expect(idleCompactionDelayMs(5 * MINUTE)).toBeUndefined();
    expect(idleCompactionDelayMs(undefined)).toBeUndefined();
  });

  it('needs more than half the automatic threshold', () => {
    const threshold = compactionThresholdTokens({}, deepseek, 1_000_000, 384_000);
    expect(threshold).toBe(550_464);
    expect(meetsSizeFloor(275_232, threshold)).toBe(false);
    expect(meetsSizeFloor(275_233, threshold)).toBe(true);
    expect(
      compactionThresholdTokens(
        { thresholdRatio: 0.5, modelPolicies: [{ ...deepseek, thresholdRatio: 0.25 }] },
        deepseek,
        1_000_000,
        0,
      ),
    ).toBe(250_000);
  });
});

interface FakeAgent extends IdleCompactionAgent {
  events: DshSessionEvent[];
}

function harness(options: { enabled?: boolean; tokens?: number } = {}) {
  const dir = profileDir();
  const settings = createIdleCompactionSettings(dir);
  if (options.enabled === false) settings.setEnabled(false);
  let clock = 10 * HOUR;
  const timers: Array<{ at: number; task: () => void; handle: number }> = [];
  let next = 0;
  const agent: FakeAgent = {
    status: 'idle',
    events: [],
    session: {
      id: 'orchestrator',
      requestHeader: () => ({ config: { ...deepseek, maxTokens: 384_000 } }),
      snapshotEvents: () => agent.events,
    },
  };
  const busy = { inbox: false };
  let tokens = options.tokens ?? 400_000;
  const records: IdleCompactionRecord[] = [];
  const compactNow = vi.fn(async (_agent: FakeAgent, _signal: AbortSignal) => {
    agent.events.push({
      type: 'compaction/summary',
      seq: 99,
      time: clock,
      data: { usage: { inputTokens: 1_000, cacheReadTokens: 399_000, outputTokens: 2_000 } },
    });
    tokens = 30_000;
    return { summarySeq: 99, shadowedTokenCount: 370_000 };
  });
  const ports: IdleCompactionPorts<FakeAgent> = {
    settings,
    orchestratorBot: (sessionId) => (sessionId === 'orchestrator' ? 'ada' : undefined),
    botBusy: () => busy.inbox,
    agent: (sessionId) => (sessionId === 'orchestrator' ? agent : undefined),
    measure: () => tokens,
    threshold: async () => 550_464,
    compactNow,
    record: (record) => records.push(record),
    log: () => undefined,
    now: () => clock,
    setTimer: (task, ms) => {
      timers.push({ at: clock + ms, task, handle: ++next });
      return next;
    },
    clearTimer: (handle) => {
      const index = timers.findIndex((timer) => timer.handle === handle);
      if (index >= 0) timers.splice(index, 1);
    },
  };
  const idle = createIdleCompaction(ports);
  const answer = (time: number) => {
    const event = { type: 'assistant/message', seq: agent.events.length, time, data: {} };
    agent.events.push(event);
    idle.observeEvent('orchestrator', event);
  };
  const advance = async (ms: number) => {
    clock += ms;
    const due = timers.filter((entry) => entry.at <= clock);
    for (const timer of due) timers.splice(timers.indexOf(timer), 1);
    for (const timer of due) timer.task();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return {
    agent,
    busy,
    compactNow,
    records,
    idle,
    settings,
    timers,
    answer,
    advance,
    get clock() {
      return clock;
    },
  };
}

describe('idle compaction scheduler', () => {
  it('compacts an idle Orchestrator Session once at half the cache lifetime and records it', async () => {
    const h = harness();
    h.answer(h.clock);
    h.idle.agentStatus('orchestrator', 'idle');
    expect(h.timers).toMatchObject([{ at: h.clock + HOUR }]);
    await h.advance(HOUR - 1);
    expect(h.compactNow).not.toHaveBeenCalled();
    await h.advance(1);
    expect(h.compactNow).toHaveBeenCalledTimes(1);
    expect(h.records).toEqual([
      expect.objectContaining({
        botSlug: 'ada',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        idleGapMs: HOUR,
        cacheLifetimeMs: 2 * HOUR,
        cacheLifetimeSource: 'default',
        tokensBefore: 400_000,
        tokensAfter: 30_000,
        outcome: 'compacted',
        inputTokens: 1_000,
        cacheReadTokens: 399_000,
        outputTokens: 2_000,
      }),
    ]);
    expect(h.settings.observations()['deepseek/deepseek-v4-flash']).toEqual({
      samples: 1,
      warmGapMs: HOUR,
    });
    h.idle.observeEvent('orchestrator', { type: 'compaction/end', time: h.clock, data: {} });
    h.idle.agentStatus('orchestrator', 'idle');
    expect(h.timers).toEqual([]);
  });

  it('waits for a pending Bot Inbox Admission and reschedules after the next answer', async () => {
    const h = harness();
    h.answer(h.clock);
    h.idle.agentStatus('orchestrator', 'idle');
    h.busy.inbox = true;
    await h.advance(HOUR);
    expect(h.compactNow).not.toHaveBeenCalled();
    h.busy.inbox = false;
    h.answer(h.clock);
    h.idle.agentStatus('orchestrator', 'idle');
    await h.advance(HOUR);
    expect(h.compactNow).toHaveBeenCalledTimes(1);
  });

  it('cancels when the Session runs again and leaves small Sessions alone', async () => {
    const h = harness({ tokens: 100_000 });
    h.answer(h.clock);
    h.idle.agentStatus('orchestrator', 'idle');
    h.idle.agentStatus('orchestrator', 'running');
    expect(h.timers).toEqual([]);
    h.idle.agentStatus('orchestrator', 'idle');
    await h.advance(HOUR);
    expect(h.compactNow).not.toHaveBeenCalled();
    expect(h.records).toEqual([]);
  });

  it('ignores other Sessions, a disabled setting and a cache that already went cold', async () => {
    const h = harness({ enabled: false });
    h.answer(h.clock);
    h.idle.agentStatus('orchestrator', 'idle');
    h.idle.agentStatus('assignment', 'idle');
    expect(h.timers).toEqual([]);
    h.settings.setEnabled(true);
    await h.advance(3 * HOUR);
    h.idle.rescan(['orchestrator']);
    await h.advance(0);
    expect(h.compactNow).not.toHaveBeenCalled();
  });

  it('records a failed attempt without retrying it', async () => {
    const h = harness();
    h.compactNow.mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'busy' }));
    h.answer(h.clock);
    h.idle.agentStatus('orchestrator', 'idle');
    await h.advance(HOUR);
    expect(h.records).toEqual([
      expect.objectContaining({ outcome: 'failed', error: 'busy', tokensAfter: null }),
    ]);
    h.idle.agentStatus('orchestrator', 'idle');
    expect(h.timers).toEqual([]);
  });

  it('compacts on demand, refuses while busy and does not compact the same history again', async () => {
    const h = harness();
    h.answer(h.clock);
    h.idle.agentStatus('orchestrator', 'idle');
    h.busy.inbox = true;
    await expect(h.idle.compactNow('orchestrator')).resolves.toEqual({
      outcome: 'busy',
      tokensBefore: null,
      tokensAfter: null,
    });
    h.busy.inbox = false;
    h.agent.status = 'running';
    await expect(h.idle.compactNow('orchestrator')).resolves.toMatchObject({ outcome: 'busy' });
    h.agent.status = 'idle';
    await expect(h.idle.compactNow('assignment')).resolves.toMatchObject({
      outcome: 'not-loaded',
    });
    await expect(h.idle.compactNow('orchestrator')).resolves.toEqual({
      outcome: 'compacted',
      tokensBefore: 400_000,
      tokensAfter: 30_000,
    });
    expect(h.timers).toEqual([]);
    h.idle.observeEvent('orchestrator', { type: 'compaction/end', time: h.clock, data: {} });
    h.idle.agentStatus('orchestrator', 'idle');
    await h.advance(3 * HOUR);
    expect(h.compactNow).toHaveBeenCalledTimes(1);
    expect(h.records).toEqual([]);
    h.compactNow.mockResolvedValueOnce(null as never);
    await expect(h.idle.compactNow('orchestrator')).resolves.toMatchObject({ outcome: 'nothing' });
    h.compactNow.mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'busy' }));
    await expect(h.idle.compactNow('orchestrator')).resolves.toMatchObject({ outcome: 'busy' });
    h.compactNow.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'summary' }));
    await expect(h.idle.compactNow('orchestrator')).resolves.toMatchObject({ outcome: 'nothing' });
    h.compactNow.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'persistence' }));
    await expect(h.idle.compactNow('orchestrator')).rejects.toThrow('x');
  });

  it('learns from the idle gap before a Human message and that request’s cache hits', () => {
    const h = harness();
    h.answer(h.clock);
    h.idle.observeEvent('orchestrator', {
      type: 'user/message',
      time: h.clock + 3 * HOUR,
      data: {},
    });
    h.idle.observeEvent('orchestrator', {
      type: 'assistant/message',
      time: h.clock + 3 * HOUR + 5_000,
      data: { usage: { inputTokens: 2_000, cacheReadTokens: 398_000, outputTokens: 10 } },
    });
    expect(h.settings.observations()['deepseek/deepseek-v4-flash']).toEqual({
      samples: 1,
      warmGapMs: 3 * HOUR,
    });
    expect(h.idle.describe([deepseek])).toEqual([
      expect.objectContaining({
        cacheLifetimeSeconds: 3 * 3600,
        source: 'observed',
        compactAfterSeconds: 1.5 * 3600,
      }),
    ]);
  });
});

describe('DSH /compact command', () => {
  it('runs /compact for the agent and maps its result', async () => {
    const execute = vi.fn(async () => ({
      result: { kind: 'success', text: 'Compacted', sourceEventSeq: 42 },
    }));
    const signal = new AbortController().signal;
    expect(await runCompactCommand({ execute }, 'agent', signal)).toEqual({ summarySeq: 42 });
    expect(execute).toHaveBeenCalledWith('agent', '/compact', [], signal);
    execute.mockResolvedValueOnce({
      result: { kind: 'success', text: 'No compactable history yet.' },
    } as never);
    expect(await runCompactCommand({ execute }, 'agent', signal)).toBeNull();
    execute.mockResolvedValueOnce({
      result: {
        kind: 'error',
        text: 'Compaction is unavailable because this process has an active compaction, or the agent is not idle.',
      },
    } as never);
    await expect(runCompactCommand({ execute }, 'agent', signal)).rejects.toMatchObject({
      code: 'busy',
    });
    execute.mockResolvedValueOnce(undefined as never);
    await expect(runCompactCommand({ execute }, 'agent', signal)).rejects.toMatchObject({
      code: 'compact-command-missing',
    });
  });
});

describe('idle compaction settings and bridge', () => {
  it('defaults on, persists overrides and reports an unreadable file', () => {
    const dir = profileDir();
    const settings = createIdleCompactionSettings(dir);
    const rescan = vi.fn();
    const bridge = createBridgeMethods({
      idleCompaction: {
        settings,
        scheduler: { describe: () => [], scheduled: () => 0 },
        routes: () => [],
        rescan,
      },
    } as unknown as BridgeMethodsDeps);
    expect(bridge.idleCompaction({})).toMatchObject({
      ok: true,
      value: { enabled: true, settingReadable: true, minimumIdleSeconds: 900 },
    });
    expect(bridge.idleCompactionSet({ enabled: false })).toMatchObject({
      ok: true,
      value: { enabled: false },
    });
    expect(bridge.idleCompactionCacheLifetimeSet({ ...deepseek, seconds: 3600 })).toMatchObject({
      ok: true,
    });
    expect(settings.read()).toEqual({
      enabled: false,
      cacheLifetimes: { 'deepseek/deepseek-v4-flash': 3600 },
    });
    bridge.idleCompactionCacheLifetimeSet({ ...deepseek, seconds: null });
    expect(settings.read()).toEqual({ enabled: false, cacheLifetimes: {} });
    expect(rescan).toHaveBeenCalledTimes(2);
    expect(bridge.idleCompactionSet({ enabled: 'yes' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(bridge.idleCompactionCacheLifetimeSet({ ...deepseek, seconds: -1 })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    writeFileSync(join(dir, IDLE_COMPACTION_SETTINGS_FILE), '{');
    expect(bridge.idleCompaction({})).toMatchObject({
      ok: true,
      value: { enabled: false, settingReadable: false },
    });
  });

  it('compacts a Bot on demand and maps a busy Bot to bot-busy', async () => {
    const compactBot = vi.fn(async (slug: string) =>
      slug === 'busy'
        ? { outcome: 'busy' as const, tokensBefore: null, tokensAfter: null }
        : { outcome: 'compacted' as const, tokensBefore: 400_000, tokensAfter: 30_000 },
    );
    const bridge = createBridgeMethods({
      registry: { get: (slug: string) => (slug === 'missing' ? undefined : { slug }) },
      idleCompaction: {
        settings: createIdleCompactionSettings(profileDir()),
        scheduler: { describe: () => [], scheduled: () => 0 },
        routes: () => [],
        rescan: () => undefined,
        compactBot,
      },
    } as unknown as BridgeMethodsDeps);
    await expect(bridge.botCompact({ slug: 'ada' })).resolves.toEqual({
      ok: true,
      value: { outcome: 'compacted', tokensBefore: 400_000, tokensAfter: 30_000 },
    });
    await expect(bridge.botCompact({ slug: 'busy' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'bot-busy' },
    });
    await expect(bridge.botCompact({ slug: 'missing' })).resolves.toMatchObject({ ok: false });
    compactBot.mockRejectedValueOnce(new Error('boom'));
    await expect(bridge.botCompact({ slug: 'ada' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'compaction-failed' },
    });
  });

  it('keeps idle compaction records per Bot and purges them with the Bot', () => {
    const owner = trackTestOwner(
      mountOperationalDatabase({
        dshHome: createTempRoot('botharness-idle-usage-'),
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      }),
    );
    const usage = createUsageProjection({
      ownership: createTestOwnership({ root: { botSlug: 'ada', rootRole: 'orchestrator' } }),
      database: owner,
    });
    const record: IdleCompactionRecord = {
      botSlug: 'ada',
      at: '2026-10-19T12:00:00.000Z',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      idleGapMs: HOUR,
      cacheLifetimeMs: 2 * HOUR,
      cacheLifetimeSource: 'default',
      tokensBefore: 400_000,
      tokensAfter: 30_000,
      outcome: 'compacted',
      inputTokens: 1_000,
      cacheReadTokens: 399_000,
      outputTokens: 2_000,
    };
    usage.recordIdleCompaction(record);
    usage.recordIdleCompaction({ ...record, botSlug: 'bea' });
    expect(usage.idleCompactions('ada', '2026-10-01T00:00:00.000Z')).toEqual([record]);
    expect(usage.idleCompactions('ada', '2026-10-20T00:00:00.000Z')).toEqual([]);
    usage.purgeBot('ada');
    expect(usage.idleCompactions('ada', '2026-10-01T00:00:00.000Z')).toEqual([]);
    expect(usage.idleCompactions('bea', '2026-10-01T00:00:00.000Z')).toHaveLength(1);
  });
});

describe('idle compaction CLI', () => {
  const rpc = () => {
    const calls: [string, Record<string, unknown>][] = [];
    return {
      calls,
      connect: async () => async (method: string, payload: Record<string, unknown>) => {
        calls.push([method, payload]);
        return { enabled: true };
      },
    };
  };

  it('reads and changes the Host setting through the bridge', async () => {
    const host = rpc();
    await runIdleCompactionCommand('idle-compaction', [], host.connect);
    await runIdleCompactionCommand('idle-compaction-set', ['off'], host.connect);
    await runIdleCompactionCommand(
      'idle-compaction-cache-set',
      ['deepseek/deepseek-v4-flash', '3600'],
      host.connect,
    );
    await runIdleCompactionCommand(
      'idle-compaction-cache-set',
      ['openrouter/deepseek/some-model', 'auto'],
      host.connect,
    );
    expect(host.calls).toEqual([
      ['idleCompaction', {}],
      ['idleCompactionSet', { enabled: false }],
      [
        'idleCompactionCacheLifetimeSet',
        { provider: 'deepseek', model: 'deepseek-v4-flash', seconds: 3600 },
      ],
      [
        'idleCompactionCacheLifetimeSet',
        { provider: 'openrouter', model: 'deepseek/some-model', seconds: null },
      ],
    ]);
  });

  it('refuses malformed arguments before connecting', async () => {
    const host = rpc();
    for (const [command, rest] of [
      ['idle-compaction', ['x']],
      ['idle-compaction-set', []],
      ['idle-compaction-set', ['yes']],
      ['idle-compaction-cache-set', ['deepseek/x']],
      ['idle-compaction-cache-set', ['deepseek', '60']],
      ['idle-compaction-cache-set', ['deepseek/x', '1.5']],
      ['idle-compaction-cache-set', ['deepseek/x', '99999999']],
    ] as const)
      await expect(
        runIdleCompactionCommand(command, [...rest], host.connect),
      ).rejects.toMatchObject({ code: 'usage' });
    expect(host.calls).toEqual([]);
  });
});
