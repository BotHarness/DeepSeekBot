import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { runEngineCommand } from '../src/bots/cli-engine.js';
import { parseBotCliArgs } from '../src/bots/cli-options.js';
import { claudeQuotaReport, type ClaudeQueryFactory } from '../src/engines/claude-engine.js';
import { codexQuotaReport, type CodexProcessOptions } from '../src/engines/codex-engine.js';
import { createEngineGateway } from '../src/engines/engine-gateway.js';
import { EngineHost, type EngineHostOptions } from '../src/engines/engine-host.js';
import { createEngineStore, engineStorePath } from '../src/engines/engine-store.js';
import { codexReplay } from './fixtures/codex-replay.js';
import { createTempRoot } from './helpers.js';

const START = Date.parse('2026-11-18T12:00:00.000Z');
const SESSION_RESET = '2026-11-18T15:00:00.000Z';
const WEEKLY_RESET = '2026-11-22T12:00:00.000Z';
const CODEX_RATE_LIMITS = {
  primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: Date.parse(SESSION_RESET) / 1000 },
  secondary: {
    usedPercent: 72,
    windowDurationMins: 10_080,
    resetsAt: Date.parse(WEEKLY_RESET) / 1000,
  },
};
const CODEX_REPORT = {
  rateLimits: { ...CODEX_RATE_LIMITS, limitId: 'codex' },
  rateLimitsByLimitId: { codex: CODEX_RATE_LIMITS, other: { primary: null } },
  ordinaryUsageAllowed: true,
};
const CLAUDE_REPORT = {
  type: 'assistant',
  usage_report: {
    rate_limits: {
      limits: [
        {
          kind: 'session',
          group: 'session',
          percent: 12,
          resets_at: SESSION_RESET,
          severity: 'normal',
          is_active: true,
        },
        {
          kind: 'weekly_scoped',
          group: 'weekly',
          percent: 99,
          resets_at: WEEKLY_RESET,
          scope: { model: { display_name: 'Opus' } },
          severity: 'critical',
          is_active: false,
        },
        {
          kind: 'weekly_all',
          group: 'weekly',
          percent: 72,
          resets_at: WEEKLY_RESET,
          severity: 'normal',
          is_active: false,
        },
      ],
    },
  },
};
const WINDOWS = {
  session: { remainingPercent: 88, resetsAt: SESSION_RESET, windowMinutes: 300 },
  weekly: { remainingPercent: 28, resetsAt: WEEKLY_RESET, windowMinutes: 10_080 },
};
const QUOTA = { windows: WINDOWS, observedAt: new Date(START).toISOString(), source: 'live' };
const EMAIL = 'work@example.test';

const hosts: EngineHost[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const host of hosts.splice(0)) await host.close();
});

function setup(options: Partial<EngineHostOptions>) {
  const root = createTempRoot('engine-quota-refresh-');
  const clock = { now: START };
  const host = new EngineHost({
    root,
    local: true,
    gateway: createEngineGateway(),
    sessions: () => undefined,
    persistence: () => undefined,
    now: () => clock.now,
    ...options,
  });
  hosts.push(host);
  return { host, clock, root };
}

function replayCodex(options: CodexProcessOptions, signedIn = true) {
  return codexReplay(
    [
      { dir: 'out', msg: { id: 1, method: 'initialize' } },
      { dir: 'in', msg: { id: 1, result: {} } },
      { dir: 'out', msg: { method: 'initialized' } },
      { dir: 'out', msg: { id: 2, method: 'account/read' } },
      {
        dir: 'in',
        msg: {
          id: 2,
          result: {
            account: signedIn ? { type: 'chatgpt', planType: 'pro', email: EMAIL } : null,
            requiresOpenaiAuth: true,
          },
        },
      },
      ...(signedIn
        ? [
            { dir: 'out' as const, msg: { id: 3, method: 'account/rateLimits/read' } },
            { dir: 'in' as const, msg: { id: 3, result: CODEX_REPORT } },
          ]
        : []),
    ],
    options,
  );
}

it('maps the provider payloads without filling an unreported quota window', () => {
  expect(codexQuotaReport(CODEX_REPORT)).toEqual({ windows: WINDOWS, blocked: false });
  expect(claudeQuotaReport(CLAUDE_REPORT)).toEqual(WINDOWS);
  expect(
    codexQuotaReport({ rateLimits: { primary: CODEX_RATE_LIMITS.secondary, secondary: null } }),
  ).toEqual({ windows: { weekly: WINDOWS.weekly } });
  expect(claudeQuotaReport({ usage_report: { rate_limits: { limits: null } } })).toBeUndefined();
  expect(claudeQuotaReport({ usage_report: { rate_limits: { limits: [] } } })).toEqual({});
  expect(
    claudeQuotaReport({
      usage_report: {
        rate_limits: {
          limits: [
            { kind: 'session', percent: 107, resets_at: null },
            { kind: 'weekly_all', percent: -4, resets_at: null },
          ],
        },
      },
    }),
  ).toEqual({
    session: { remainingPercent: 0, windowMinutes: 300 },
    weekly: { remainingPercent: 100, windowMinutes: 10_080 },
  });
});

it('refreshes only the selected Codex home, joins concurrent reads, and reuses the cached report for 30 seconds', async () => {
  let signedIn = true;
  const replays: ReturnType<typeof replayCodex>[] = [];
  const openCodex = vi.fn((options: CodexProcessOptions) => {
    const replay = replayCodex(options, signedIn);
    replays.push(replay);
    return replay.transport;
  });
  const { host, clock, root } = setup({ openCodex });
  const { id } = host.addAccount('codex', 'Work', 0);
  const first = host.refreshQuota(id);
  expect(() => host.removeAccount(id, 1)).toThrow('still running');
  await expect(Promise.all([first, host.refreshQuota(id)])).resolves.toEqual([
    { status: 'ok', quota: expect.objectContaining(QUOTA) },
    { status: 'ok', quota: expect.objectContaining(QUOTA) },
  ]);
  clock.now += 29_999;
  await expect(host.refreshQuota(id)).resolves.toMatchObject({ status: 'ok', quota: QUOTA });
  expect(openCodex).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ home: join(root, 'codex', 'accounts', id) }),
  );
  expect(replays[0]).toMatchObject({ mismatches: [], closed: true });
  expect(host.quota('codex')).toBeUndefined();
  expect(host.accounts(true).accounts.find((account) => account.id === id)).toMatchObject({
    email: EMAIL,
    quota: QUOTA,
  });
  expect(host.accounts().accounts.find((account) => account.id === id)).not.toHaveProperty('email');
  expect(createEngineStore(engineStorePath(root)).quota('codex', id)).toMatchObject({
    ...QUOTA,
    email: EMAIL,
  });

  signedIn = false;
  clock.now++;
  await expect(host.refreshQuota(id)).resolves.toEqual({ status: 'signed-out' });
  expect(openCodex).toHaveBeenCalledTimes(2);
  expect(host.accounts(true).accounts.find((account) => account.id === id)).not.toHaveProperty(
    'email',
  );
  expect(host.quota('codex', id)).toBeUndefined();
});

it('records simultaneous refreshes for two accounts with prior snapshots', async () => {
  const { host } = setup({ openCodex: (options) => replayCodex(options).transport });
  const { id: work } = host.addAccount('codex', 'Work', 0);
  for (const id of ['codex-default', work]) {
    host.store.rememberQuota(
      'codex',
      {
        windows: {},
        email: EMAIL,
        observedAt: new Date(START - 1).toISOString(),
        source: 'turn',
      },
      id,
    );
  }
  await expect(
    Promise.all([host.refreshQuota('codex-default'), host.refreshQuota(work)]),
  ).resolves.toEqual([
    { status: 'ok', quota: QUOTA },
    { status: 'ok', quota: QUOTA },
  ]);
});

it('gets the Claude SDK usage report and account email with a tool-free slash command in the selected home', async () => {
  const close = vi.fn();
  const accountInfo = vi.fn(async () => ({
    apiProvider: 'firstParty',
    apiKeySource: 'none',
    subscriptionType: 'max',
    email: EMAIL,
  }));
  const openClaude = vi.fn<ClaudeQueryFactory>(({ prompt }) => ({
    accountInfo,
    close,
    supportedModels: vi.fn(),
    interrupt: vi.fn(),
    async *[Symbol.asyncIterator]() {
      for await (const message of prompt) {
        expect(message.message.content).toBe('/usage');
        yield { type: 'system', subtype: 'init' };
        yield CLAUDE_REPORT;
      }
    },
  }));
  const { root, host } = setup({ openClaude, claudeCommand: process.execPath });
  const { id } = host.addAccount('claude', 'Work', 0);
  const home = join(root, 'claude', 'accounts', id);
  await expect(host.refreshQuota(id)).resolves.toMatchObject({ status: 'ok', quota: QUOTA });
  expect(openClaude).toHaveBeenCalledExactlyOnceWith({
    prompt: expect.anything(),
    options: expect.objectContaining({
      env: expect.objectContaining({ CLAUDE_CONFIG_DIR: home, HOME: home }),
      tools: [],
      settingSources: [],
      persistSession: false,
    }),
  });
  expect(accountInfo).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
  expect(host.accounts(true).accounts.find((account) => account.id === id)).toMatchObject({
    email: EMAIL,
    quota: QUOTA,
  });
  expect(host.quota('claude')).toBeUndefined();
});

it('times out an unresponsive provider and preserves the last observed windows', async () => {
  vi.useFakeTimers();
  const close = vi.fn(async () => {});
  const send = vi.fn();
  const { host } = setup({
    openCodex: () => ({ send, onMessage: vi.fn(), onExit: vi.fn(), close }),
  });
  host.store.rememberQuota('codex', {
    source: 'turn',
    observedAt: new Date(START).toISOString(),
    windows: { session: WINDOWS.session },
  });
  const pending = host.refreshQuota('codex');
  await vi.advanceTimersByTimeAsync(15_000);
  await expect(pending).resolves.toMatchObject({
    status: 'timeout',
    quota: { source: 'turn', windows: { session: WINDOWS.session } },
  });
  await expect(host.refreshQuota('codex')).resolves.toMatchObject({ status: 'timeout' });
  expect(close).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledTimes(1);
  await expect(host.refreshQuota('unknown')).resolves.toEqual({ status: 'unavailable' });
});

it('reads cached quota and refreshes through the same account RPCs as the bridge', async () => {
  expect(
    parseBotCliArgs(['engine', 'quota', 'codex-default', '--refresh', '--json']),
  ).toMatchObject({
    values: { refresh: true, json: true },
    positionals: ['engine', 'quota', 'codex-default'],
  });
  const rpc = vi.fn(async (method: string) =>
    method === 'engineAccounts'
      ? { accounts: [{ id: 'codex-default', quota: QUOTA }] }
      : { status: 'ok', quota: QUOTA },
  );
  const connect = async () => ({ rpc, http: vi.fn() });
  await expect(runEngineCommand('engine-quota', ['codex'], {}, connect)).resolves.toEqual({
    id: 'codex-default',
    quota: QUOTA,
  });
  expect(rpc).toHaveBeenLastCalledWith('engineAccounts', { grantable: true });
  await expect(
    runEngineCommand('engine-quota', ['codex-default'], { refresh: true }, connect),
  ).resolves.toEqual({ status: 'ok', quota: QUOTA });
  expect(rpc).toHaveBeenLastCalledWith('engineAccountQuotaRefresh', { id: 'codex-default' });
});
