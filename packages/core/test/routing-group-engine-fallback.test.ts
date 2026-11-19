import { join } from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { createEngineGateway } from '../src/engines/engine-gateway.js';
import { EngineHost } from '../src/engines/engine-host.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createGroupFallback } from '../src/models/group-fallback.js';
import { createRouteRests } from '../src/models/route-rest.js';
import type { RoutingGroupMember } from '../src/models/routing-groups.js';
import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { claudeReplay, readClaudeRecording } from './fixtures/claude-replay.js';
import { codexReplay, readCodexRecording, type CodexReplay } from './fixtures/codex-replay.js';
import { memoryDsh } from './fixtures/engine-dsh.js';
import { createTempRoot } from './helpers.js';

const START = 1_795_010_000_000;
const RESETS_AT = new Date(1_795_027_200_000).toISOString();
const API = { provider: 'deepseek-official', model: 'deepseek-v4-pro' };
const CODEX = { kind: 'engine', engine: 'codex', model: 'gpt-6-astra' } as const;
const CLAUDE = { kind: 'engine', engine: 'claude', model: 'claude-opus-5-5' } as const;
const LIMIT = readCodexRecording(join(import.meta.dirname, 'fixtures', 'codex-limit-turn.jsonl'));
const CLAUDE_REPLY = readClaudeRecording(
  join(import.meta.dirname, 'fixtures', 'claude-dm-turn.jsonl'),
).filter(
  (line) =>
    line.kind === 'account' ||
    line.kind === 'await-input' ||
    (line.kind === 'message' && ['system', 'result'].includes(String(line.msg['type']))),
);

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function setup(options: {
  members: RoutingGroupMember[];
  allowed?: (route: typeof API) => void;
  enginesAllowed?: boolean;
  codexRecording?: typeof LIMIT;
  inherited?: boolean;
}) {
  const clock = { now: START };
  const root = createTempRoot('routing-group-engine-');
  const dsh = memoryDsh();
  const native = new FakeAgentHost();
  const gateway = createEngineGateway();
  const codex: CodexReplay[] = [];
  const claude = claudeReplay([CLAUDE_REPLY]);
  const host = new EngineHost({
    root: join(root, 'engines'),
    local: true,
    gateway,
    now: () => clock.now,
    sessions: () => dsh.store,
    persistence: () => dsh.persistence,
    openCodex: (params) => {
      const replay = codexReplay(options.codexRecording ?? LIMIT, params);
      codex.push(replay);
      return replay.transport;
    },
    claudeCommand: process.execPath,
    detectClaude: async () => ({ installed: true, version: '2.1.327', login: 'subscription' }),
    openClaude: claude.factory,
  });
  const routeRests = createRouteRests({ now: () => clock.now });
  const groupFallback = createGroupFallback({
    plan: (slug) => core.registry.get(slug)?.modelPlan,
    inheritedGroup: (): string | undefined => core.routingGroups.defaultGroup().groupId,
    routes: (id): (typeof API)[] => core.routingGroups.routes(id),
    engines: {
      targets: (id) => core.routingGroups.targets(id),
      canRoute: (slug) => host.engineFor(slug) === undefined,
      allowed: () => options.enginesAllowed ?? true,
      limit: (engine) => host.limit(engine),
    },
    rests: routeRests,
    requireAllowed: (_slug, route) => options.allowed?.(route),
    validate: async () => undefined,
  });
  const memoryDirectory = join(root, 'memory', 'ada');
  const prepareModelRoute = vi.fn(async () => {});
  const adapter = createDshBotAgentAdapter({
    agents: native,
    engines: host,
    orchestratorCwd: () => memoryDirectory,
    ensureWorkspace: () => {},
    prepareModelRoute,
    hasSession: async (id) =>
      dsh.stored.has(id) || native.sessions.some((session) => session.id === id),
    defaultModel: { currentSelection: () => API },
    orchestratorRoute: (id) => groupFallback.route(id),
  });
  const core = createCore({
    dshHome: root,
    agents: adapter,
    groupFallback,
    routeRests,
    sessionRoute: (_slug, id) => groupFallback.route(id) ?? adapter.modelSelection(id) ?? API,
  });
  cleanups.push(async () => {
    await core.runtime.close();
    await host.close();
    await gateway.close();
    core.operationalDatabase.close();
  });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const group = core.routingGroups.create({
    name: 'Fallback',
    members: [...options.members, { kind: 'model', ...API }],
  });
  if (options.inherited) core.routingGroups.setDefaultGroup(group.id, 0);
  else expect(core.registry.customizeModelPlan('ada', API, 0, group.id).ok).toBe(true);
  const channel = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  async function message(id: string, body: string) {
    await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, channel.id, {
      id,
      at: new Date(clock.now).toISOString(),
      author: { kind: 'human' },
      body,
    });
    core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
      channelId: channel.id,
      messageId: id,
      body,
    });
    await core.runtime.whenIdle();
  }
  return {
    host,
    dsh,
    codex,
    claude,
    native,
    clock,
    routeRests,
    prepareModelRoute,
    memoryDirectory,
    message,
    sessionId: () => core.runtime.currentOrchestratorSessionId?.('ada')!,
    channelMessages: () => core.channels.readMessages(channel.id),
    held: () => core.runtime.heldCause?.('ada'),
  };
}

it('runs an engine-first group, then resumes the same DSH Session on its model after quota', async () => {
  const bot = setup({ members: [CODEX] });
  await bot.message('first', 'My lucky word is orchid');
  const sessionId = bot.sessionId();
  expect(bot.codex).toHaveLength(1);
  expect(bot.codex[0]?.mismatches).toEqual([]);
  expect(bot.codex[0]?.sent.find((request) => request['method'] === 'thread/start')).toMatchObject({
    params: { model: CODEX.model },
  });
  expect(bot.native.createOptions).toEqual([]);
  expect(bot.native.resumeOptions).toEqual([]);
  expect(bot.held()).toBeUndefined();
  expect(
    bot.channelMessages().filter((message) => message.turnStop || message.sessionFailure),
  ).toEqual([]);
  expect(bot.channelMessages().filter((message) => message.modelSwitch)).toMatchObject([
    { modelSwitch: { sessionId, from: { provider: 'codex' }, to: API, until: RESETS_AT } },
  ]);
  expect(bot.dsh.stored.get(sessionId)?.header.cwd).toBe(bot.memoryDirectory);
  expect(bot.dsh.stored.get(sessionId)?.events.at(-1)?.type).toBe('turn/end');

  await bot.message('second', 'Use the model');
  expect(bot.sessionId()).toBe(sessionId);
  expect(bot.native.resumeOptions).toMatchObject([
    { resumeSessionId: sessionId, agentOptions: API },
  ]);
  expect(bot.native.createOptions).toEqual([]);
  expect(bot.codex[0]?.closed).toBe(true);
  expect(bot.prepareModelRoute).toHaveBeenCalledExactlyOnceWith('ada', 'orchestrator', API);
  expect(bot.host.store.selections()).toEqual([]);
  expect(bot.host.quota('codex')?.limitedUntil).toBe(RESETS_AT);
});

it('seeds the next engine from the same Session after Codex runs out', async () => {
  const bot = setup({ members: [CODEX, CLAUDE] });
  await bot.message('first', 'My lucky word is orchid');
  const sessionId = bot.sessionId();
  expect(bot.claude.prompts).toEqual([]);
  await bot.message('second', 'Recall the lucky word');

  expect(bot.sessionId()).toBe(sessionId);
  expect(bot.claude.options).toMatchObject([{ model: CLAUDE.model }]);
  expect(bot.claude.prompts).toEqual([
    expect.stringMatching(/My lucky word is orchid[\s\S]+Recall the lucky word/u),
  ]);
  expect([...bot.dsh.stored.keys()]).toEqual([sessionId]);
  expect(
    bot.dsh.stored
      .get(sessionId)
      ?.events.filter((event) => event.type === 'turn/start')
      .map((event) => event.data.turn),
  ).toEqual([1, 2]);
  expect(bot.native.createOptions).toEqual([]);
  expect(bot.native.resumeOptions).toEqual([]);
  expect(bot.channelMessages().filter((message) => message.turnStop)).toEqual([]);
  expect(bot.channelMessages().filter((message) => message.modelSwitch)).toMatchObject([
    { modelSwitch: { sessionId, from: { provider: 'codex' }, to: { provider: 'claude' } } },
  ]);
});

it('posts one limit card when every target rests and retries the first available target after reset', async () => {
  const bot = setup({ members: [CODEX] });
  const apiReset = START + 90_000;
  bot.routeRests.rest(API, apiReset, 'quota');
  await bot.message('first', 'Use the first target');
  const sessionId = bot.sessionId();
  expect(bot.held()).toBe('quota');
  expect(bot.channelMessages().filter((message) => message.turnStop)).toMatchObject([
    {
      turnStop: {
        sessionId,
        cause: 'quota',
        routingGroup: true,
        engine: { engine: 'codex', account: 'ChatGPT pro', until: RESETS_AT },
        rests: [
          { ...API, until: new Date(apiReset).toISOString() },
          { provider: 'codex', model: 'ChatGPT pro', until: RESETS_AT },
        ],
      },
    },
  ]);
  expect(
    bot.channelMessages().filter((message) => message.modelSwitch || message.sessionFailure),
  ).toEqual([]);
  expect(bot.native.resumeOptions).toEqual([]);
  bot.clock.now = apiReset + 1;
  await bot.message('second', 'Use whichever target recovered');
  expect(bot.native.resumeOptions).toMatchObject([
    { resumeSessionId: sessionId, agentOptions: API },
  ]);
  expect(bot.held()).toBeUndefined();
  expect(bot.codex).toHaveLength(1);
});

it('keeps an explicit engine selection in charge of a Bot with a mixed group', async () => {
  const bot = setup({ members: [CODEX, CLAUDE] });
  bot.routeRests.rest(API, START + 90_000, 'quota');
  bot.host.use('ada', 'orchestrator', 'claude', { model: CLAUDE.model });
  await bot.message('first', 'Explicit engine');
  expect(bot.codex).toEqual([]);
  expect(bot.claude.prompts).toEqual([expect.stringContaining('Explicit engine')]);
  expect(bot.host.store.selections()).toMatchObject([{ engine: 'claude', role: 'orchestrator' }]);
});

it('does not show a limit card for a DSH candidate that is unavailable without resting', async () => {
  const bot = setup({
    members: [CODEX],
    allowed: () => {
      throw new Error('Not allowed');
    },
  });
  await bot.message('first', 'Exhaust Codex');
  expect(bot.held()).toBeUndefined();
  expect(bot.native.resumeOptions).toEqual([]);
  expect(bot.channelMessages().filter((message) => message.turnStop)).toEqual([]);
  expect(
    bot.channelMessages().find((message) => message.sessionFailure)?.sessionFailure,
  ).toMatchObject({ code: 'ROUTING_GROUP_UNAVAILABLE' });
});

it('skips engines for a role limited to explicitly allowed DSH models', async () => {
  const bot = setup({ members: [CODEX], enginesAllowed: false });
  await bot.message('first', 'Use an allowed model');
  expect(bot.native.createOptions).toMatchObject([{ agentOptions: API }]);
  expect(bot.codex).toEqual([]);
});

it('applies the default quota rest when Codex has no reset time', async () => {
  const recording = LIMIT.filter((line) => line.msg['method'] !== 'account/rateLimits/updated');
  const bot = setup({ members: [CODEX], codexRecording: recording });
  await bot.message('first', 'Use Codex');
  expect(bot.host.quota('codex')?.limitedUntil).toBe(new Date(START + 3_600_000).toISOString());
  expect(bot.channelMessages().filter((message) => message.turnStop)).toEqual([]);
});

it('continues using the existing ordered DSH-only default group', async () => {
  const fallbackRoute = { provider: 'next', model: 'ready' };
  const bot = setup({ members: [{ kind: 'model', ...fallbackRoute }], inherited: true });
  await bot.message('first', 'Use a DSH model');
  expect(bot.native.createOptions).toMatchObject([{ agentOptions: fallbackRoute }]);
  expect(bot.codex).toEqual([]);
  expect(bot.claude.prompts).toEqual([]);
});
