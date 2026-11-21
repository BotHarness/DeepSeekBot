import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runEngineCommand } from '../src/bots/cli-engine.js';
import { claudeModels } from '../src/engines/claude-engine.js';
import {
  type CodexTransport,
  CodexEngineSession,
  codexModels,
  codexProcessSpec,
} from '../src/engines/codex-engine.js';
import { createEngineGateway, type EngineGateway } from '../src/engines/engine-gateway.js';
import { EngineHost, type EngineHostOptions, type EngineTool } from '../src/engines/engine-host.js';
import { engineRouteFetch } from '../src/engines/engine-route.js';
import { ownerEngineSelection } from './engine-route-fixture.js';
import { routingGroupEngineOptions } from '../src/models/routing-group-engine-options.js';
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
const MODELS = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures', 'claude-models.json'), 'utf8'),
) as unknown[];
const ACCOUNT = RECORDING.find((line) => line.kind === 'account')!;
const LISTING: ClaudeRecordedLine[] = [ACCOUNT, { kind: 'models', list: MODELS }];

const CODEX_MODELS = {
  data: [
    {
      id: 'gpt-6.1-sol',
      model: 'gpt-6.1-sol',
      displayName: 'GPT-6.1 Sol',
      description: 'Everyday work',
      hidden: false,
      defaultReasoningEffort: 'medium',
      supportedReasoningEfforts: [
        { reasoningEffort: 'low', description: 'Fast' },
        { reasoningEffort: 'medium', description: 'Balanced' },
        { reasoningEffort: 'xhigh', description: 'Deep' },
      ],
      isDefault: true,
    },
    { id: 'gpt-old', model: 'gpt-old', displayName: 'Old', hidden: true },
  ],
  nextCursor: null,
};

const TOOLS: EngineTool[] = [
  {
    name: 'bot_send_message',
    description: 'Send a message',
    parameters: { type: 'object', properties: { body: { type: 'string' } } },
  },
];

const gateways: EngineGateway[] = [];
afterEach(async () => {
  await Promise.all(gateways.splice(0).map((gateway) => gateway.close()));
});

function setup(
  recordings: ClaudeRecordedLine[][],
  options: Pick<EngineHostOptions, 'detectCodex' | 'detectClaude' | 'routingGroupEffort'> = {},
) {
  const root = createTempRoot('engine-models-');
  const dsh = memoryDsh();
  const gateway = createEngineGateway();
  gateways.push(gateway);
  const replay = claudeReplay(recordings);
  const host = new EngineHost({
    root,
    local: true,
    gateway,
    claudeCommand: process.execPath,
    env: { PATH: '/usr/bin', HOME: '/Users/human' },
    sessions: () => dsh.store,
    persistence: () => dsh.persistence,
    openClaude: replay.factory,
    detectCodex: async () => ({ installed: false, login: 'unknown' }),
    detectClaude: async () => ({ installed: true, version: '2.1.327', login: 'subscription' }),
    ...options,
  });
  const request = {
    botSlug: 'ada',
    sessionId: 'orchestrator-ada',
    channelId: 'dm-ada',
    input: 'Hi Ada',
    instructions: 'You are Ada.',
    tools: TOOLS,
    execute: vi.fn(async () => JSON.stringify({ outcome: 'sent' })),
    signal: new AbortController().signal,
  };
  const botExists = (slug: string) => slug === 'ada';
  const route = async (body: Record<string, unknown>) => {
    const response = await engineRouteFetch(
      new Request('http://host/api/botharness/engines', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
      { host, botExists, ...ownerEngineSelection(host, botExists) },
    );
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  return { host, replay, request, route, root };
}

describe('Subscription Engine models', () => {
  it('keeps each Claude account model list in its own cache and config directory', async () => {
    const { host, replay, route, root } = setup([LISTING, LISTING]);
    const work = host.addAccount('claude', 'Work', 0);
    try {
      const personal = await route({ action: 'models', engine: 'claude' });
      const named = await route({ action: 'models', engine: work.id });
      expect(personal.status).toBe(200);
      expect(named).toEqual(personal);
      await route({ action: 'models', engine: work.id });
      await route({ action: 'models', engine: 'claude' });
      expect(replay.options.map((options) => options.env?.CLAUDE_CONFIG_DIR)).toEqual([
        join(root, 'claude', 'home'),
        join(root, 'claude', 'accounts', work.id),
      ]);
    } finally {
      await host.close();
    }
  });

  it('keeps the healthy engine and its models when another status probe fails', async () => {
    const { host, replay } = setup([LISTING], {
      detectCodex: async () => {
        throw new Error('EACCES: cannot open the Codex profile directory');
      },
    });
    try {
      const [codex, claude] = await routingGroupEngineOptions(host);
      expect(codex).toEqual({
        engine: 'codex',
        accountId: 'codex-default',
        accountName: 'Codex',
        available: false,
        reason: 'login-unknown',
      });
      expect(claude).toMatchObject({
        engine: 'claude',
        available: true,
        models: [
          {
            id: 'claude-sonnet-5-5',
            name: 'Sonnet',
            isDefault: true,
            aliases: ['default', 'sonnet'],
            efforts: expect.arrayContaining([{ id: 'max', name: 'Max' }]),
          },
          { id: 'claude-fable-5-2', name: 'Fable' },
          { id: 'claude-opus-5-5', name: 'Opus' },
          { id: 'claude-haiku-5-5', name: 'Haiku' },
        ],
      });
      expect(replay.prompts).toEqual([]);
    } finally {
      await host.close();
    }
  });

  it('lists the Claude subscription models without the gateway and caches them', async () => {
    const { host, replay, route, root } = setup([LISTING]);
    const listed = await route({ action: 'models', engine: 'claude' });
    expect(listed.status).toBe(200);
    expect(listed.body['engine']).toBe('claude');
    const models = listed.body['models'] as Array<Record<string, unknown>>;
    expect(models.map((model) => model['id'])).toEqual([
      'default',
      'sonnet',
      'fable',
      'opus',
      'haiku',
    ]);
    expect(models[0]).toMatchObject({ name: 'Default (recommended)', isDefault: true });
    expect(models[3]).toEqual({
      id: 'opus',
      name: 'Opus',
      resolvedModel: 'claude-opus-5-5',
      description: 'Opus 5.5 · Best for everyday, complex tasks',
      efforts: [
        { id: 'low', name: 'Low' },
        { id: 'medium', name: 'Medium' },
        { id: 'high', name: 'High' },
        { id: 'xhigh', name: 'Extra high' },
        { id: 'max', name: 'Max' },
      ],
    });
    const options = replay.options[0]!;
    expect(options.mcpServers).toEqual({});
    expect(options.mcpServersDelivery).toBeUndefined();
    expect(options.cwd).toBe(join(root, 'workdirs', '.models'));
    expect(replay.prompts).toEqual([]);
    expect(replay.closed).toBe(1);

    await route({ action: 'models', engine: 'claude' });
    expect(replay.options).toHaveLength(1);
    await host.close();
  });

  it('refuses to list models for a signed-out engine', async () => {
    const { host, route } = setup([[{ kind: 'account', info: {} }]]);
    expect(await route({ action: 'models', engine: 'claude' })).toEqual({
      status: 409,
      body: { error: { code: 'engine-signed-out', message: expect.any(String) } },
    });
    expect((await route({ action: 'models', engine: 'gemini' })).body).toMatchObject({
      error: { code: 'unknown-engine' },
    });
    await host.close();
  });

  it('runs the Orchestrator on the chosen model and effort and reopens when they change', async () => {
    const { host, replay, request, route } = setup([LISTING, RECORDING, RECORDING]);
    expect(
      await route({
        action: 'use',
        bot: 'ada',
        role: 'orchestrator',
        engine: 'claude',
        model: 'opus',
        effort: 'high',
      }),
    ).toEqual({
      status: 200,
      body: {
        bot: 'ada',
        role: 'orchestrator',
        engine: 'claude',
        fallback: false,
        model: 'opus',
        effort: 'high',
      },
    });
    expect(host.store.selections()).toEqual([
      {
        botSlug: 'ada',
        role: 'orchestrator',
        engine: 'claude',
        fallback: false,
        model: 'opus',
        effort: 'high',
      },
    ]);
    await host.runTurn(request);
    expect(replay.options[1]).toMatchObject({ model: 'opus', effort: 'high' });
    const first = replay.options[1]!.sessionId;

    await route({
      action: 'use',
      bot: 'ada',
      role: 'orchestrator',
      engine: 'claude',
      model: 'fable',
    });
    await host.runTurn(request);
    expect(replay.options).toHaveLength(3);
    expect(replay.options[2]).toMatchObject({ model: 'fable', resume: first });
    expect(replay.options[2]!.effort).toBeUndefined();

    await route({ action: 'use', bot: 'ada', role: 'orchestrator', engine: 'claude' });
    expect(host.store.choice('ada', 'orchestrator')).toEqual({});
    await host.close();
  });

  it.each([
    { override: 'low', shared: 'high', expected: 'low' },
    { shared: 'high', expected: 'high' },
    { shared: 'turbo', expected: undefined },
  ])(
    'passes a concrete Routing Group model and the applicable effort to start',
    async ({ override, shared, expected }) => {
      const { host, replay, request } = setup([LISTING, RECORDING], {
        routingGroupEffort: () => shared,
      });
      try {
        const model = 'claude-opus-5-5';
        await expect(
          host.validateChoice('claude', { model, effort: 'high' }),
        ).resolves.toBeUndefined();
        await host.runTurn({
          ...request,
          target: {
            kind: 'engine',
            engine: 'claude',
            model,
            ...(override === undefined ? {} : { reasoningEffort: override }),
          },
        });
        expect(replay.options[1]?.model).toBe(model);
        expect(replay.options[1]?.effort).toBe(expected);
        expect(host.store.choice('ada', 'orchestrator')).toEqual({});
      } finally {
        await host.close();
      }
    },
  );

  it('refuses a model or effort the subscription does not offer', async () => {
    const { host, route } = setup([LISTING]);
    const use = (extra: Record<string, unknown>) =>
      route({ action: 'use', bot: 'ada', role: 'orchestrator', engine: 'claude', ...extra });
    expect((await use({ model: 'gpt-6' })).body).toMatchObject({
      error: { code: 'unknown-model' },
    });
    expect((await use({ model: 'opus', effort: 'turbo' })).body).toMatchObject({
      error: { code: 'unknown-effort', message: 'opus takes effort low, medium, high, xhigh, max' },
    });
    expect((await use({ effort: 'max' })).status).toBe(200);
    expect(host.store.choice('ada', 'orchestrator')).toEqual({ effort: 'max' });
    expect((await use({ model: '' })).body).toMatchObject({ error: { code: 'invalid-input' } });
    expect(
      (
        await route({
          action: 'use',
          bot: 'ada',
          role: 'orchestrator',
          engine: null,
          model: 'opus',
        })
      ).body,
    ).toMatchObject({ error: { code: 'invalid-input' } });
    await host.close();
  });

  it('reads Codex model/list and sends the chosen model and effort with each turn', async () => {
    expect(codexModels([CODEX_MODELS])).toEqual([
      {
        id: 'gpt-6.1-sol',
        name: 'GPT-6.1 Sol',
        description: 'Everyday work',
        efforts: [
          { id: 'low', name: 'Low' },
          { id: 'medium', name: 'Medium' },
          { id: 'xhigh', name: 'Extra high' },
        ],
        defaultEffort: 'medium',
        isDefault: true,
      },
    ]);
    expect(codexProcessSpec({ command: 'codex', home: '/h', cwd: '/w' }).args).toEqual([
      'app-server',
    ]);

    const sent: Array<Record<string, unknown>> = [];
    let listener: (message: unknown) => void = () => undefined;
    const answers: Record<string, unknown> = {
      initialize: {},
      'model/list': CODEX_MODELS,
      'thread/start': { thread: { id: 'thread-1' } },
      'turn/start': { turn: { id: 'turn-1' } },
    };
    const transport: CodexTransport = {
      send: (message) => {
        const entry = message as Record<string, unknown>;
        sent.push(entry);
        const method = String(entry['method']);
        if (entry['id'] !== undefined)
          queueMicrotask(() => listener({ id: entry['id'], result: answers[method] }));
        if (method === 'turn/start')
          queueMicrotask(() =>
            listener({
              method: 'turn/completed',
              params: { turn: { id: 'turn-1', status: 'completed' } },
            }),
          );
      },
      onMessage: (next) => {
        listener = next;
      },
      onExit: () => undefined,
      close: async () => undefined,
    };
    const session = new CodexEngineSession(transport, {
      cwd: '/w',
      instructions: 'You are Ada.',
      model: 'gpt-6.1-sol',
      effort: 'xhigh',
    });
    expect((await session.models()).map((model) => model.id)).toEqual(['gpt-6.1-sol']);
    await session.start();
    await session.send('Hi', { onEvent: () => undefined });
    const params = (method: string) =>
      sent.find((entry) => entry['method'] === method)?.['params'] as Record<string, unknown>;
    expect(params('model/list')).toEqual({ limit: 100, includeHidden: false });
    expect(params('thread/start')).toMatchObject({ model: 'gpt-6.1-sol' });
    expect(params('turn/start')).toMatchObject({ model: 'gpt-6.1-sol', effort: 'xhigh' });
  });

  it('maps a Claude model without effort levels to an empty effort list', () => {
    expect(
      claudeModels([
        { value: 'haiku', displayName: 'Haiku', description: '', supportsEffort: false },
      ]),
    ).toEqual([{ id: 'haiku', name: 'Haiku', efforts: [] }]);
  });

  it('lists models and passes the model and effort from the CLI', async () => {
    const http = vi.fn(async (_path: string, body?: Record<string, unknown>) => ({
      bytes: new TextEncoder().encode(
        JSON.stringify(
          body?.['action'] === 'models'
            ? { engine: 'claude', models: [{ id: 'opus', name: 'Opus', efforts: [] }] }
            : { bot: 'ada', role: 'orchestrator', engine: 'claude', model: 'opus', effort: 'high' },
        ),
      ),
    }));
    const connect = async () => ({ http });
    expect(await runEngineCommand('engine-models', ['claude'], {}, connect)).toMatchObject({
      models: [{ id: 'opus' }],
    });
    expect(http.mock.calls.at(-1)).toEqual([
      '/api/botharness/engines',
      { action: 'models', engine: 'claude' },
    ]);
    await runEngineCommand(
      'engine-use',
      ['ada', 'claude'],
      { role: ['orchestrator'], model: 'opus', effort: 'high' },
      connect,
    );
    expect(http.mock.calls.at(-1)).toEqual([
      '/api/botharness/engines',
      {
        action: 'use',
        bot: 'ada',
        role: 'orchestrator',
        engine: 'claude',
        model: 'opus',
        effort: 'high',
      },
    ]);
    await expect(
      runEngineCommand(
        'engine-use',
        ['ada', 'none'],
        { role: ['orchestrator'], model: 'opus' },
        connect,
      ),
    ).rejects.toMatchObject({ code: 'usage' });
    await expect(runEngineCommand('engine-models', [], {}, connect)).rejects.toMatchObject({
      code: 'usage',
    });
  });
});
