import { setImmediate as tick } from 'node:timers/promises';
import { expect, it, vi } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createOutboundMessaging } from '../src/messaging/outbound.js';
import type { MessagingInboundEvent, MessagingProvider } from '../src/messaging/provider.js';
import { createTempRoot } from './helpers.js';
import {
  executeImCommand,
  createImCommandExecutor,
  imCommandAuthority,
  imCommandRequiresAuthority,
  parseImCommand,
  type ImCommandDeps,
  type ImCommandManage,
  type ImCommandServices,
} from '../src/messaging/im-commands.js';
import type { ModelCatalogEntry } from '../src/models/catalog.js';
import type { ModelRoute, PersonaBotModelPlan } from '../src/models/presets.js';
import type { ManualCompactionResult } from '../src/runtime/idle-compaction.js';

const catalog: ModelCatalogEntry[] = [
  {
    provider: 'deepseek',
    providerName: 'DeepSeek',
    model: 'deepseek-chat',
    modelName: 'DeepSeek Chat',
    efforts: [
      { id: 'low', name: 'Low' },
      { id: 'high', name: 'High' },
    ],
    defaultEffort: 'low',
  },
  {
    provider: 'deepseek',
    providerName: 'DeepSeek',
    model: 'deepseek-reasoner',
    modelName: 'DeepSeek Reasoner',
    efforts: [{ id: 'high', name: 'High' }],
    defaultEffort: 'high',
  },
  {
    provider: 'openai',
    providerName: 'OpenAI',
    model: 'gpt-5',
    modelName: 'GPT-5',
    efforts: [{ id: 'medium', name: 'Medium' }],
  },
];

function plan(orchestrator: ModelRoute): PersonaBotModelPlan {
  return {
    revision: 3,
    sourcePresetId: 'preset',
    sourcePresetName: 'Preset',
    orchestrator,
    assignmentDefault: orchestrator,
    appliedAt: '2026-01-01T00:00:00.000Z',
  };
}

function harness(
  overrides: {
    plan?: PersonaBotModelPlan | undefined;
    defaultRoute?: ModelRoute | undefined;
    working?: boolean;
  } = {},
): {
  run: (text: string, manage?: ImCommandManage) => Promise<string>;
  applied: ModelRoute[];
  stopCalls: number;
  freshCalls: number;
  nextStop: ({ sessionId: string } | undefined)[];
  nextFresh: ('started' | 'busy')[];
  nextCompact: ManualCompactionResult[];
  host: ImCommandServices;
} {
  const applied: ModelRoute[] = [];
  const nextStop: ({ sessionId: string } | undefined)[] = [];
  const nextFresh: ('started' | 'busy')[] = [];
  const nextCompact: ManualCompactionResult[] = [];
  let stopCalls = 0;
  let freshCalls = 0;
  let currentPlan = overrides.plan;
  const host: ImCommandServices = {
    botDisplayName: () => 'Ada',
    plan: async () => currentPlan,
    catalog: async () => catalog,
    ...(overrides.defaultRoute === undefined ? {} : { defaultRoute: () => overrides.defaultRoute }),
    applyModel: async (_slug, route) => {
      applied.push(route);
      currentPlan = plan(route);
    },
    stopTurn: async () => {
      stopCalls += 1;
      return nextStop.shift();
    },
    startFreshOrchestrator: async () => {
      freshCalls += 1;
      return nextFresh.shift() ?? 'started';
    },
    turnRunning: () => overrides.working === true,
    compact: async () =>
      nextCompact.shift() ?? { outcome: 'nothing', tokensBefore: 100, tokensAfter: 100 },
  };
  const run = async (text: string, manage: ImCommandManage = 'allowed'): Promise<string> => {
    const command = parseImCommand(text);
    if (command === undefined) throw new Error('not a command');
    const value: ImCommandDeps = {
      command,
      chinese: command.chinese,
      botSlug: 'ada',
      botDisplayName: 'Ada',
      working: overrides.working === true,
      manage,
      host,
    };
    return executeImCommand(value);
  };
  return {
    run,
    applied,
    get stopCalls() {
      return stopCalls;
    },
    get freshCalls() {
      return freshCalls;
    },
    nextStop,
    nextFresh,
    nextCompact,
    host,
  };
}

it('parses names, aliases and full-width slashes and rejects other text', () => {
  expect(parseImCommand('/model')).toEqual({ name: 'model', chinese: false });
  expect(parseImCommand('/MODEL deepseek-chat')).toEqual({
    name: 'model',
    chinese: false,
    argument: 'deepseek-chat',
  });
  expect(parseImCommand('/模型 2')).toEqual({ name: 'model', chinese: true, argument: '2' });
  expect(parseImCommand('／状态')).toEqual({ name: 'status', chinese: true });
  expect(parseImCommand('/命令')).toEqual({ name: 'commands', chinese: true });
  expect(parseImCommand('/unknown')).toBeUndefined();
  expect(parseImCommand('text /status')).toBeUndefined();
  expect(parseImCommand('/status extra')).toBeUndefined();
  expect(parseImCommand('/stop now')).toBeUndefined();
  expect(parseImCommand('/')).toBeUndefined();
});

it('decides which commands need management authority and where IM changes are allowed', () => {
  const read = parseImCommand('/status')!;
  const change = parseImCommand('/model 1')!;
  expect(imCommandRequiresAuthority(read)).toBe(false);
  expect(imCommandRequiresAuthority(change)).toBe(true);
  expect(imCommandRequiresAuthority(parseImCommand('/model')!)).toBe(false);
  expect(imCommandRequiresAuthority(parseImCommand('/new')!)).toBe(true);
  expect(
    imCommandAuthority({
      command: change,
      platform: 'feishu',
      pairingAvailable: true,
      managementPairing: false,
    }),
  ).toBe('pairing-required');
  expect(
    imCommandAuthority({
      command: change,
      platform: 'feishu',
      pairingAvailable: true,
      managementPairing: true,
    }),
  ).toBe('allowed');
  expect(
    imCommandAuthority({
      command: change,
      platform: 'weixin',
      pairingAvailable: false,
      managementPairing: false,
    }),
  ).toBe('allowed');
  expect(
    imCommandAuthority({
      command: change,
      platform: 'slack',
      pairingAvailable: true,
      managementPairing: true,
    }),
  ).toBe('allowed');
  expect(
    imCommandAuthority({
      command: change,
      platform: 'slack',
      pairingAvailable: true,
      managementPairing: false,
    }),
  ).toBe('web-only');
  expect(
    imCommandAuthority({
      command: change,
      platform: 'discord',
      pairingAvailable: false,
      managementPairing: false,
    }),
  ).toBe('web-only');
  expect(
    imCommandAuthority({
      command: read,
      platform: 'slack',
      pairingAvailable: false,
      managementPairing: false,
    }),
  ).toBe('allowed');
});

it('lists every command in the requested language', async () => {
  const { run } = harness();
  expect(await run('/commands')).toContain('/model <number|name>');
  expect(await run('/帮助')).toContain('/model（/模型）');
});

it('reports status with the current model, effort and turn state', async () => {
  const route: ModelRoute = {
    provider: 'deepseek',
    model: 'deepseek-chat',
    reasoningEffort: 'high',
  };
  const { run } = harness({ plan: plan(route), working: true });
  const english = await run('/status');
  expect(english).toContain('Bot: Ada');
  expect(english).toContain('deepseek/deepseek-chat');
  expect(english).toContain('Effort: high');
  expect(english).toContain('Turn: running');
  const chinese = await run('/状态');
  expect(chinese).toContain('名称: Ada');
  expect(chinese).toContain('任务: 运行中');
});

it('falls back to the provider default for status and effort listing', async () => {
  const { run } = harness({ defaultRoute: { provider: 'deepseek', model: 'deepseek-chat' } });
  expect(await run('/status')).toContain('Effort: provider default');
  const list = await run('/effort');
  expect(list).toContain('1. ✓ Provider default');
  expect(list).toContain('2. Low');
  expect(list).toContain('3. High');
});

it('keeps model numbers in catalog order when the current selection changes', async () => {
  const { run, applied } = harness({
    plan: plan({ provider: 'openai', model: 'gpt-5' }),
  });
  const lines = (await run('/model')).split('\n');
  expect(lines[1]).toBe('1. DeepSeek Chat [deepseek/deepseek-chat]');
  expect(lines[3]).toBe('3. ✓ GPT-5 [openai/gpt-5]');
  await run('/model 2');
  expect((await run('/model')).split('\n')[2]).toBe(
    '2. ✓ DeepSeek Reasoner [deepseek/deepseek-reasoner]',
  );
  await run('/model 2');
  expect(applied).toEqual([
    { provider: 'deepseek', model: 'deepseek-reasoner' },
    { provider: 'deepseek', model: 'deepseek-reasoner' },
  ]);
});

it('switches model by number, marks the current one, and keeps a supported effort', async () => {
  const route: ModelRoute = {
    provider: 'deepseek',
    model: 'deepseek-chat',
    reasoningEffort: 'high',
  };
  const { run, applied } = harness({ plan: plan(route) });
  const list = await run('/model');
  expect(list.split('\n')[1]).toBe('1. ✓ DeepSeek Chat [deepseek/deepseek-chat]');
  expect(list).toContain('3. GPT-5 [openai/gpt-5]');
  expect(await run('/model 2')).toContain('DeepSeek Reasoner [deepseek/deepseek-reasoner]');
  expect(applied.at(-1)).toEqual({
    provider: 'deepseek',
    model: 'deepseek-reasoner',
    reasoningEffort: 'high',
  });
  await run('/model gpt-5');
  expect(applied.at(-1)).toEqual({ provider: 'openai', model: 'gpt-5' });
});

it('drops an effort the new model does not support', async () => {
  const route: ModelRoute = {
    provider: 'deepseek',
    model: 'deepseek-chat',
    reasoningEffort: 'low',
  };
  const { run, applied } = harness({ plan: plan(route) });
  await run('/model 2');
  expect(applied.at(-1)).toEqual({ provider: 'deepseek', model: 'deepseek-reasoner' });
});

it('lists candidates and changes nothing on an ambiguous or missing model', async () => {
  const { run, applied } = harness({
    plan: plan({ provider: 'deepseek', model: 'deepseek-chat' }),
  });
  const ambiguous = await run('/model deepseek');
  expect(ambiguous).toContain('candidates:');
  expect(ambiguous).toContain('1. DeepSeek Chat [deepseek/deepseek-chat]');
  expect(ambiguous).toContain('2. DeepSeek Reasoner [deepseek/deepseek-reasoner]');
  expect(applied).toHaveLength(0);
  expect(await run('/model nope')).toContain('No match.');
  expect(applied).toHaveLength(0);
  expect(await run('/model 99')).toContain('No match.');
  expect(applied).toHaveLength(0);
});

it('sets effort by number, name and default in both languages', async () => {
  const route: ModelRoute = {
    provider: 'deepseek',
    model: 'deepseek-chat',
    reasoningEffort: 'low',
  };
  const { run, applied } = harness({ plan: plan(route) });
  expect(await run('/effort 2')).toContain('Effort: Low');
  expect(applied.at(-1)).toEqual({
    provider: 'deepseek',
    model: 'deepseek-chat',
    reasoningEffort: 'low',
  });
  await run('/effort high');
  expect(applied.at(-1)).toEqual({
    provider: 'deepseek',
    model: 'deepseek-chat',
    reasoningEffort: 'high',
  });
  expect(await run('/effort')).toBe('Efforts:\n1. Provider default\n2. Low\n3. ✓ High');
  await run('/effort 2');
  expect(applied.at(-1)?.reasoningEffort).toBe('low');
  expect(await run('/effort')).toBe('Efforts:\n1. Provider default\n2. ✓ Low\n3. High');
  await run('/强度 默认');
  expect(applied.at(-1)).toEqual({ provider: 'deepseek', model: 'deepseek-chat' });
});

it('refuses change commands without authority and never calls the host', async () => {
  const { run, applied, stopCalls, freshCalls } = harness({
    plan: plan({ provider: 'deepseek', model: 'deepseek-chat' }),
  });
  expect(await run('/model 2', 'pairing-required')).toContain('management pairing');
  expect(await run('/new', 'web-only')).toContain('use the Web app');
  expect(await run('/命令', 'pairing-required')).toContain('/model（/模型）');
  expect(applied).toHaveLength(0);
  expect(stopCalls).toBe(0);
  expect(freshCalls).toBe(0);
});

it('stops a running turn and reports an idle Bot', async () => {
  const harnessed = harness();
  expect(await harnessed.run('/stop')).toContain('not working right now');
  harnessed.nextStop.push({ sessionId: 'session-1' });
  expect(await harnessed.run('/停止')).toBe('已停止。');
  expect(harnessed.stopCalls).toBe(2);
});

it('starts a fresh session or asks to stop first', async () => {
  const harnessed = harness();
  expect(await harnessed.run('/new')).toContain('fresh session is ready');
  harnessed.nextFresh.push('busy');
  expect(await harnessed.run('/新会话')).toContain('先 /stop');
});

it('compacts the session and reports busy, unloaded and empty outcomes', async () => {
  const harnessed = harness();
  expect(imCommandRequiresAuthority(parseImCommand('/compact')!)).toBe(true);
  expect(await harnessed.run('/compact', 'web-only')).toContain('use the Web app');
  harnessed.nextCompact.push({ outcome: 'compacted', tokensBefore: 471_070, tokensAfter: 27_782 });
  expect(await harnessed.run('/compact')).toBe('Compacted the context: 471,070 → 27,782 tokens.');
  harnessed.nextCompact.push({ outcome: 'busy', tokensBefore: null, tokensAfter: null });
  expect(await harnessed.run('/压缩')).toContain('先 /stop');
  harnessed.nextCompact.push({ outcome: 'not-loaded', tokensBefore: null, tokensAfter: null });
  expect(await harnessed.run('/compact')).toContain('send a message first');
  expect(await harnessed.run('/compact')).toBe('Nothing to compact.');
  harnessed.host.compact = async () => {
    throw new Error('boom');
  };
  expect(await harnessed.run('/压缩')).toBe('压缩失败，请稍后再试。');
});

it('replies in Chinese for Chinese aliases and English otherwise', async () => {
  const { run } = harness();
  expect(await run('/help')).toContain('list every command');
  expect(await run('/命令')).toContain('列出所有命令');
});

it('claims redelivered DM commands once, including implicit Weixin DMs with disabled routes', async () => {
  const commands = harness({ plan: plan({ provider: 'deepseek', model: 'deepseek-chat' }) });
  const owner = mountOperationalDatabase({
    dshHome: createTempRoot('bh-im-command-dedup-'),
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
  });
  const database = attachOperationalModule(owner, 'messaging');
  const onAdmitted = vi.fn();
  const service = createOutboundMessaging({
    database,
    isBotActive: () => true,
    imCommands: () => commands.host,
    onAdmitted,
  });
  let receiver: Parameters<NonNullable<MessagingProvider['consume']>>[0] | undefined;
  const reply = vi.fn(async () => ({ accepted: true as const }));
  const account = {
    ref: 'app',
    platform: 'weixin' as const,
    name: 'WeChat Bot',
    fingerprint: 'a'.repeat(64),
    connected: true,
  };
  const target = {
    ref: 'human',
    name: 'Human',
    digest: 'b'.repeat(64),
    receiveScope: { kind: 'dm' as const, conversationId: 'private' },
  };
  const provider: MessagingProvider = {
    id: 'dsh-im/weixin',
    accounts: async () => [account],
    targets: async () => [target],
    inspectAccount: async () => account,
    inspect: async () => ({ account, target }),
    consume: async (input) => {
      receiver = input;
      return () => {};
    },
    send: async () => ({ accepted: true }),
    reply,
  };
  const receive = (text: string, messageId: string) => {
    if (!receiver) throw new Error('Not subscribed');
    const event: MessagingInboundEvent = {
      version: 1,
      channel: account.platform,
      botId: account.ref,
      fingerprint: account.fingerprint,
      eventId: messageId,
      messageId,
      actor: { kind: 'user', id: 'human' },
      conversation: { kind: 'dm', id: 'private' },
      mentions: [],
      mentionedAccount: false,
      at: new Date().toISOString(),
      text,
      reply: { messageId, conversationId: 'private', actorId: 'human' },
      replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
    };
    return receiver.onEvent(event, receiver.signal);
  };
  try {
    service.register(provider);
    await service.identity('ada', {
      kind: 'bind',
      providerId: provider.id,
      accountRef: account.ref,
      fingerprint: account.fingerprint,
    });
    await Promise.all([receive('/model 2', 'model'), receive('/model 2', 'model')]);
    await tick();
    expect(commands.applied).toEqual([{ provider: 'deepseek', model: 'deepseek-reasoner' }]);
    expect(reply).toHaveBeenCalledTimes(1);
    await receive('/model 1', 'other-model');
    await tick();
    await receive('/model 2', 'model');
    await tick();
    expect(commands.applied).toHaveLength(2);
    expect(commands.applied.at(-1)?.model).toBe('deepseek-chat');
    expect(reply).toHaveBeenCalledTimes(2);
    const grant = (await service.snapshot('ada')).grants[0]!;
    expect(grant.origin).toBe('implicit');
    database.transaction((db) => {
      db.prepare(
        "UPDATE messaging_grants SET body = json_set(body, '$.bridgeRoutes', json(?)) WHERE id = ?",
      ).run(
        JSON.stringify([
          {
            id: grant.id,
            channelId: null,
            name: 'Private intake',
            enabled: false,
            collection: 'all',
            revision: 1,
          },
        ]),
        grant.id,
      );
    });
    commands.nextStop.push({ sessionId: 'first-turn' });
    await receive('/stop', 'stop');
    await tick();
    commands.nextStop.push({ sessionId: 'later-turn' });
    await receive('/stop', 'stop');
    await tick();
    expect(commands.stopCalls).toBe(1);
    expect(commands.nextStop).toEqual([{ sessionId: 'later-turn' }]);
    expect(reply).toHaveBeenCalledTimes(3);
    await receive('/status', 'status');
    await tick();
    await receive('/status', 'status');
    await tick();
    expect(reply).toHaveBeenCalledTimes(4);
    expect(onAdmitted).not.toHaveBeenCalled();
    expect(
      database.read((db) => db.prepare('SELECT attempt_state FROM inbox_admissions').all()),
    ).toEqual(Array.from({ length: 4 }, () => ({ attempt_state: 'handled' })));
  } finally {
    service.close();
    owner.close();
  }
});

it('serializes model and effort changes without restoring the previous model', async () => {
  let route: ModelRoute = { provider: 'deepseek', model: 'deepseek-chat' };
  let catalogCalls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const host: ImCommandServices = {
    botDisplayName: () => 'Ada',
    plan: async () => plan(route),
    catalog: async () => {
      if (++catalogCalls === 2) await gate;
      return catalog;
    },
    applyModel: async (_slug, next) => {
      route = next;
    },
    stopTurn: async () => undefined,
    startFreshOrchestrator: async () => 'started',
    turnRunning: () => false,
    compact: async () => ({ outcome: 'nothing', tokensBefore: null, tokensAfter: null }),
  };
  const execute = createImCommandExecutor();
  const run = (text: string) =>
    execute(() => ({
      command: parseImCommand(text)!,
      chinese: false,
      botSlug: 'ada',
      botDisplayName: 'Ada',
      working: false,
      manage: 'allowed',
      host,
    }));
  const switching = run('/model 2');
  const effort = run('/effort high');
  await switching;
  expect(route.model).toBe('deepseek-reasoner');
  release();
  await effort;
  expect(route.model).toBe('deepseek-reasoner');
});
