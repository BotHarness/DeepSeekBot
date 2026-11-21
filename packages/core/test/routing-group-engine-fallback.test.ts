import { join } from 'node:path';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { expect, it, vi } from 'vitest';

import { dmChannelId } from '../src/channels/channel.js';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { requireBotEngineAccount } from '../src/team/models.js';
import { teamModelFixture } from './team-model-fixture.js';
import {
  API,
  AssignmentReplay,
  CLAUDE,
  CLAUDE_LIMIT,
  CLAUDE_REPLY,
  CODEX,
  CODEX_REPLY,
  LIMIT,
  NativeReplay,
  RESETS_AT,
  START,
  limitAfter,
  nativeRuntime,
  setup,
} from './fixtures/routing-group-engine.js';

it('continues a native quota turn on an engine, then resumes DSH on the same Session', async () => {
  const model = new NativeReplay(true);
  const writerClosing = vi.fn();
  let allowClose!: () => void;
  const release = new Promise<void>((resolve) => {
    allowClose = resolve;
  });
  const runtime = await nativeRuntime(model, async () => {
    writerClosing();
    await release;
  });
  const { ctx, dsh } = runtime;
  const bot = setup({
    members: [CODEX],
    nativeFirst: true,
    codexRecording: CODEX_REPLY,
    nativeRuntime: runtime,
    beforeNativeHandle: async (id, cwd) => {
      if (dsh.stored.has(id)) return;
      await ctx.agents.create({ sessionId: SessionId(id), meta: { cwd }, agentOptions: API });
    },
  });
  expect(await bot.grantWorkspace()).toMatchObject({ orchestratorWrite: false });
  const first = bot.message('first', 'Read the DM before replying. My lucky word is orchid.');
  try {
    await vi.waitFor(() => expect(writerClosing).toHaveBeenCalledTimes(1), { timeout: 7_500 });
    const old = ctx.agents.get(SessionId(bot.sessionId()));
    expect(old).toBeDefined();
    expect(bot.adapter.steerOrchestrator?.('ada', 'Arrived during the handoff')).toBe(false);
    expect(() =>
      old?.followup(
        createUserMessage({
          content: [{ type: 'text', text: 'Native concurrent input' }],
          source: { kind: 'user' },
        }),
      ),
    ).toThrow('releasing its Session');
    expect(bot.codex).toHaveLength(0);
  } finally {
    allowClose();
    await first;
  }
  const id = bot.sessionId();
  expect(bot.channelMessages().flatMap((message) => message.sessionFailure ?? [])).toEqual([]);
  expect(bot.codex[0]?.mismatches).toEqual([]);
  expect(bot.sendStatus('first')).toMatchObject({
    state: 'handled',
    replies: [{ body: 'Hello from Codex' }],
  });
  expect(bot.codex[0]?.sent.find((request) => request['method'] === 'thread/start')).toMatchObject({
    params: { sandbox: 'read-only', approvalPolicy: 'never' },
  });
  expect(bot.codex[0]?.sent.find((request) => request['method'] === 'turn/start')).toMatchObject({
    params: {
      input: [
        {
          text: expect.stringMatching(
            /Tool result \(native-read\)[\s\S]+orchid[\s\S]+Continue from where you stopped/u,
          ),
        },
      ],
      sandboxPolicy: { type: 'readOnly', networkAccess: false },
      approvalPolicy: 'never',
    },
  });
  expect(ctx.agents.get(SessionId(id))).toBeUndefined();
  expect(bot.host.isLive(id)).toBe(true);
  expect(bot.channelMessages().filter((message) => message.modelSwitch)).toMatchObject([
    { modelSwitch: { sessionId: id, from: API, to: { provider: 'codex' } } },
  ]);

  bot.clock.now += 1_001;
  await bot.message('second', 'Continue on DSH');
  expect(bot.sessionId()).toBe(id);
  expect(bot.host.isLive(id)).toBe(false);
  expect(ctx.agents.get(SessionId(id))?.session).toBe(dsh.store.get(SessionId(id)));
  expect(model.requests[2]?.messages).toContainEqual(
    expect.objectContaining({
      role: 'assistant',
      content: expect.arrayContaining([{ type: 'text', text: 'I replied in the DM.' }]),
    }),
  );
  expect(
    dsh.stored
      .get(id)
      ?.events.flatMap((event) => (event.type === 'turn/start' ? [event.data.turn] : [])),
  ).toEqual([1, 2, 3]);
});

it('keeps the manual engine use switch working after a native turn', async () => {
  const model = new NativeReplay(false);
  const runtime = await nativeRuntime(model);
  const { ctx } = runtime;
  const bot = setup({ members: [], codexRecording: CODEX_REPLY, nativeRuntime: runtime });
  await bot.message('first', 'Remember orchid');
  const id = bot.sessionId();
  expect(ctx.agents.get(SessionId(id))).toBeDefined();

  bot.host.use('ada', 'orchestrator', 'codex');
  await bot.message('second', 'Use the selected engine');
  expect(bot.sessionId()).toBe(id);
  expect(bot.sendStatus('second')).toMatchObject({
    state: 'handled',
    replies: [{ body: 'Hello from Codex' }],
  });
  expect(ctx.agents.get(SessionId(id))).toBeUndefined();

  bot.host.use('ada', 'orchestrator', undefined);
  await bot.message('third', 'Return to DSH');
  expect(bot.sessionId()).toBe(id);
  expect(ctx.agents.get(SessionId(id))).toBeDefined();
  expect(model.requests[2]?.messages).toContainEqual(
    expect.objectContaining({
      role: 'assistant',
      content: expect.arrayContaining([{ type: 'text', text: 'I replied in the DM.' }]),
    }),
  );
});

it('seeds a returning engine after a native quota turn without logging a rebuild', async () => {
  const model = new NativeReplay(true);
  const runtime = await nativeRuntime(model);
  const bot = setup({
    members: [CODEX],
    nativeFirst: true,
    nativeRuntime: runtime,
    codexRecording: CODEX_REPLY,
  });
  bot.routeRests.rest(API, bot.clock.now + 1_000, 'quota');
  await bot.message('first', 'Remember orchid');
  const sessionId = bot.sessionId();
  expect(bot.host.store.nativeSession(sessionId)).toMatchObject({ engine: 'codex', lastTurn: 1 });

  bot.clock.now += 1_001;
  await bot.message('second', 'Read the Channel before replying');

  expect(bot.sessionId()).toBe(sessionId);
  expect(bot.codex).toHaveLength(2);
  expect(bot.codex[1]?.mismatches).toEqual([]);
  expect(bot.codex[1]?.sent.find((request) => request['method'] === 'turn/start')).toMatchObject({
    params: {
      input: [
        {
          text: expect.stringMatching(
            /Tool result \(native-read\)[\s\S]+Continue from where you stopped/u,
          ),
        },
      ],
    },
  });
  const events = bot.dsh.stored.get(sessionId)?.events ?? [];
  expect(events.flatMap((event) => (event.type === 'turn/start' ? [event.data.turn] : []))).toEqual(
    [1, 2, 3],
  );
  expect(
    events.flatMap((event) => (event.type === 'user/message' ? [event.data.source.kind] : [])),
  ).not.toContain('botharness-engine-rebuild');
  expect(bot.sendStatus('second')).toMatchObject({
    state: 'handled',
    replies: [{ body: 'Hello from Codex' }],
  });
});

it('answers the first Human message on DSH when the engine hits quota before output', async () => {
  const bot = setup({ members: [CODEX], nativeReply: 'Orchid noted.' });
  await bot.message('first', 'My lucky word is orchid');
  const sessionId = bot.sessionId();
  expect(bot.codex).toHaveLength(1);
  expect(bot.codex[0]?.mismatches).toEqual([]);
  expect(bot.codex[0]?.sent.find((request) => request['method'] === 'thread/start')).toMatchObject({
    params: { model: CODEX.model },
  });
  expect(bot.native.createOptions).toEqual([]);
  expect(bot.native.resumeOptions).toMatchObject([
    { resumeSessionId: sessionId, agentOptions: API },
  ]);
  expect(bot.native.received.get(sessionId)?.[0]?.content).toContainEqual({
    type: 'text',
    text: expect.stringContaining('Continue from where you stopped'),
  });
  expect(bot.held()).toBeUndefined();
  expect(bot.sendStatus('first')).toMatchObject({
    state: 'handled',
    replies: [{ body: 'Orchid noted.' }],
  });
  expect(
    bot.channelMessages().filter((message) => message.turnStop || message.sessionFailure),
  ).toEqual([]);
  expect(bot.channelMessages().filter((message) => message.modelSwitch)).toMatchObject([
    { modelSwitch: { sessionId, from: { provider: 'codex' }, to: API, until: RESETS_AT } },
  ]);
  expect(bot.dsh.stored.get(sessionId)?.header.cwd).toBe(bot.memoryDirectory);
  expect(bot.codex[0]?.closed).toBe(true);
  expect(bot.prepareModelRoute).toHaveBeenCalledExactlyOnceWith('ada', 'orchestrator', API);
  expect(bot.host.store.selections()).toEqual([]);
  expect(bot.host.quota('codex')?.limitedUntil).toBe(RESETS_AT);
});

it('passes the model and effort to a mixed-group engine before falling back to DSH', async () => {
  const member = { ...CODEX, reasoningEffort: 'high' };
  const bot = setup({ members: [member], nativeReply: 'Orchid noted.' });

  await bot.message('with-effort', 'My lucky word is orchid');

  expect(bot.codex).toHaveLength(1);
  expect(bot.codex[0]?.mismatches).toEqual([]);
  expect(bot.codex[0]?.sent.find((request) => request['method'] === 'thread/start')).toMatchObject({
    params: { model: member.model },
  });
  expect(bot.codex[0]?.sent.find((request) => request['method'] === 'turn/start')).toMatchObject({
    params: { model: member.model, effort: member.reasoningEffort },
  });
  expect(bot.native.resumeOptions).toMatchObject([
    { resumeSessionId: bot.sessionId(), agentOptions: API },
  ]);
  expect(bot.sendStatus('with-effort')).toMatchObject({
    state: 'handled',
    replies: [{ body: 'Orchid noted.' }],
  });
});

it('continues from the completed engine tool call and result in the same DSH Session', async () => {
  const bot = setup({
    members: [CODEX],
    codexRecording: limitAfter('channel_read'),
    nativeReply: 'I used the Channel read.',
  });
  await bot.message('first', 'Read the Channel before replying');
  const sessionId = bot.sessionId();
  expect(bot.codex[0]?.gatewayCalls.map((call) => call.tool)).toEqual(['channel_read']);
  const events = bot.native.sessions.find((session) => session.id === sessionId)?.snapshotEvents();
  expect(events?.filter((event) => event.type === 'tool/result')).toMatchObject([
    {
      data: {
        message: {
          toolCallId: 'item-mcp-read',
          content: [
            { type: 'text', text: expect.stringContaining('Read the Channel before replying') },
          ],
        },
      },
    },
  ]);
  expect(bot.native.received.get(sessionId)?.[0]?.content).not.toContainEqual({
    type: 'text',
    text: expect.stringContaining('Read the Channel before replying'),
  });
  expect(bot.sendStatus('first')).toMatchObject({
    state: 'handled',
    replies: [{ body: 'I used the Channel read.' }],
  });
});

it('carries Session context through Codex to Claude Code to DSH in the same turn chain', async () => {
  const bot = setup({
    members: [CODEX, CLAUDE],
    namedEngine: 'claude',
    codexRecording: limitAfter('channel_read'),
    claudeRecording: CLAUDE_LIMIT,
    nativeReply: 'The lucky word is orchid.',
  });
  await bot.message('first', 'My lucky word is orchid');
  const sessionId = bot.sessionId();
  const accountId = bot.account?.id;
  expect(accountId).toEqual(expect.any(String));
  expect(bot.claude.options).toMatchObject([
    {
      model: CLAUDE.model,
      env: {
        CLAUDE_CONFIG_DIR: expect.stringContaining(join('claude', 'accounts', accountId ?? '')),
      },
    },
  ]);
  expect(bot.host.limit('claude')).toBeUndefined();
  expect(bot.host.limit('claude', accountId)?.until).toBe(
    new Date(Date.parse(RESETS_AT) + 60_000).toISOString(),
  );
  expect(bot.claude.prompts).toEqual([
    expect.stringMatching(
      /My lucky word is orchid[\s\S]+Tool result \(item-mcp-read\)[\s\S]+Current input:[\s\S]+Continue from where you stopped/u,
    ),
  ]);
  expect([...bot.dsh.stored.keys()]).toEqual([sessionId]);
  expect(
    bot.dsh.stored
      .get(sessionId)
      ?.events.filter((event) => event.type === 'turn/start')
      .map((event) => event.data.turn),
  ).toEqual([1, 2]);
  expect(bot.native.createOptions).toEqual([]);
  expect(bot.native.resumeOptions).toMatchObject([
    { resumeSessionId: sessionId, agentOptions: API },
  ]);
  expect(bot.sendStatus('first')).toMatchObject({
    state: 'handled',
    replies: [{ body: 'The lucky word is orchid.' }],
  });
  expect(bot.channelMessages().filter((message) => message.turnStop)).toEqual([]);
  expect(
    bot
      .channelMessages()
      .filter((message) => message.modelSwitch)
      .reverse(),
  ).toMatchObject([
    { modelSwitch: { sessionId, from: { provider: 'codex' }, to: { provider: 'claude' } } },
    { modelSwitch: { sessionId, from: { provider: 'claude' }, to: API } },
  ]);
});

it('starts mixed-group engines in read-only mode across quota continuation', async () => {
  const bot = setup({ members: [CODEX, CLAUDE] });
  expect(await bot.grantWorkspace()).toMatchObject({ orchestratorWrite: false });

  await bot.message('first', 'Check the granted workspace');

  expect(bot.codex[0]?.sent.find((request) => request['method'] === 'thread/start')).toMatchObject({
    params: { sandbox: 'read-only', approvalPolicy: 'never' },
  });
  expect(bot.codex[0]?.sent.find((request) => request['method'] === 'turn/start')).toMatchObject({
    params: { sandboxPolicy: { type: 'readOnly', networkAccess: false }, approvalPolicy: 'never' },
  });
  expect(bot.claude.options).toMatchObject([
    {
      model: CLAUDE.model,
      permissionMode: 'default',
      tools: ['Read', 'Glob', 'Grep'],
      disallowedTools: ['Edit', 'Write', 'NotebookEdit', 'Bash', 'PowerShell'],
    },
  ]);
  expect(bot.claude.prompts).toEqual([expect.stringContaining('Check the granted workspace')]);
});

it('closes the old engine on a quota switch and gives the next engine its own idle deadline', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const bot = setup({
    members: [CODEX, CLAUDE],
    idleMs: 100,
    beforeEngineLimit: (engine) => {
      if (engine === 'claude') vi.advanceTimersByTime(60);
    },
  });
  try {
    await bot.message('first', 'Continue across the quota limit');
    const sessionId = bot.sessionId();
    expect(bot.codex[0]?.closed).toBe(true);
    expect(bot.claude.prompts).toEqual([
      expect.stringContaining('Continue from where you stopped'),
    ]);
    expect(bot.claude.options[0]?.resume).toBeUndefined();
    expect([...bot.dsh.stored.keys()]).toEqual([sessionId]);
    const events = bot.dsh.stored.get(sessionId)?.events ?? [];
    expect(
      events.flatMap((event) => (event.type === 'user/message' ? [event.data.source.kind] : [])),
    ).not.toContain('botharness-engine-rebuild');

    await vi.advanceTimersByTimeAsync(40);
    expect(bot.host.isLive(sessionId)).toBe(true);
    expect(bot.claude.closed).toBe(0);

    await vi.advanceTimersByTimeAsync(60);
    expect(bot.host.isLive(sessionId)).toBe(false);
    expect(bot.claude.closed).toBe(1);
  } finally {
    vi.useRealTimers();
  }
});

it('blocks a second reply when the engine delivered one before quota', async () => {
  const bot = setup({
    members: [CODEX],
    codexRecording: limitAfter('bot_send_message'),
    nativeReply: 'Duplicate reply from DSH',
  });
  await bot.message('first', 'Please say hello');
  expect(bot.codex[0]?.gatewayCalls.map((call) => call.tool)).toEqual(['bot_send_message']);
  expect(bot.native.received.get(bot.sessionId())?.[0]?.content).toContainEqual({
    type: 'text',
    text: expect.stringContaining('already delivered a reply'),
  });
  expect(bot.replies).toHaveBeenCalledWith(expect.objectContaining({ isError: true }));
  expect(bot.sendStatus('first')).toMatchObject({
    state: 'handled',
    replies: [{ body: 'Hello from Codex' }],
  });
});

it('does not revisit an engine whose rest ends during the same quota chain', async () => {
  const bot = setup({
    members: [CODEX, { ...CODEX, model: 'gpt-6-mini' }, CLAUDE],
    claudeRecording: CLAUDE_LIMIT,
    beforeEngineLimit: (engine, clock) => {
      if (engine === 'claude') clock.now = Date.parse(RESETS_AT) + 1;
    },
    nativeReply: 'Finished without looping.',
  });
  await bot.message('first', 'Continue when limits change');
  expect(bot.codex).toHaveLength(1);
  expect(bot.claude.prompts).toHaveLength(1);
  expect(bot.sendStatus('first')).toMatchObject({
    state: 'handled',
    replies: [{ body: 'Finished without looping.' }],
  });
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

it.each(['explicit', 'routing-group'] as const)(
  'rechecks the Bot owner’s account grant before every %s Orchestrator turn',
  async (selection) => {
    const f = teamModelFixture();
    const bot = setup({
      members: selection === 'routing-group' ? [CODEX] : [],
      namedEngine: 'codex',
      codexRecording: CODEX_REPLY,
      requireAccountGrant: (slug, id) => requireBotEngineAccount(f.team, f.registry.get(slug), id),
    });
    const accountId = bot.account?.id;
    if (accountId === undefined) throw new Error('Missing fixture account');
    const grant = (engineAccounts: string[]) =>
      f.team.roles.update(owner, 'member', { models: { kind: 'all', engineAccounts } });
    grant([accountId]);
    if (selection === 'explicit') bot.host.use('ada', 'orchestrator', 'codex', { accountId });
    await bot.message('allowed', 'Use my Work subscription');
    expect(bot.sendStatus('allowed')).toMatchObject({ state: 'handled' });
    expect(bot.codex).toHaveLength(1);
    const engine = bot.codex[0];
    const turns = () => engine?.sent.filter((row) => row['method'] === 'turn/start');
    expect(turns()).toHaveLength(1);
    grant([]);
    await bot.message('revoked', 'Continue with the previous account');
    expect(turns()).toHaveLength(1);
    expect(bot.native.createOptions).toHaveLength(0);
    expect(
      bot.channelMessages().find((message) => message.sessionFailure)?.sessionFailure,
    ).toMatchObject({ code: 'model-not-allowed' });
  },
);

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

it.each([
  ['DSH only', [], { kind: 'dsh', ...API }],
  ['Codex then DSH', [{ ...CODEX, reasoningEffort: 'high' }], { kind: 'dsh', ...API }],
] as const)(
  'records the reply path and restores Current after reopening: %s',
  async (_name, members, current) => {
    const text = 'The orchid is noted.';
    const actual = await nativeRuntime(new NativeReplay(false, text));
    const bot = setup({ members: [...members], nativeRuntime: actual });
    await bot.message('attributed', 'Please remember the orchid.');
    const sessionId = bot.sessionId();
    const turnTargets = [
      ...members.map((target) => expect.objectContaining({ ...target, model: expect.any(String) })),
      current,
    ];
    expect(bot.current()).toEqual(current);
    expect(bot.channelMessages()).toContainEqual(
      expect.objectContaining({ body: text, turnTargets }),
    );

    const reopened = await bot.reopen(sessionId);
    const turnStarts = reopened.events.flatMap((event) =>
      event.type === 'turn/start' ? [event.data.turn] : [],
    );
    expect(turnStarts).toHaveLength(turnTargets.length);
    expect(reopened.segments).toEqual(
      turnTargets.map((target, index) => ({
        turn: turnStarts[index],
        step: index < members.length ? 0 : 1,
        request: expect.any(String),
        target,
      })),
    );
    expect(new Set(reopened.segments.map((segment) => segment.request)).size).toBe(1);
    expect(new Set(reopened.segments.map(({ turn, step }) => `${turn}:${step}`)).size).toBe(
      turnTargets.length,
    );
    expect(reopened.current).toEqual(current);
    expect(reopened.messages).toContainEqual(expect.objectContaining({ body: text, turnTargets }));
    expect(reopened.transcript).toContainEqual(
      expect.objectContaining({ kind: 'reply', text, turnTargets }),
    );
  },
);

it.each([
  ['Codex', CODEX_REPLY, [CODEX], 'codex'],
  ['Codex then Claude Code', LIMIT, [CODEX, CLAUDE], 'claude'],
] as const)(
  'records the executing engine after reopening: %s',
  async (_name, codexRecording, members, engine) => {
    const text = 'Hello from Claude';
    const claudeRecording: typeof CLAUDE_REPLY = [
      ...CLAUDE_REPLY.slice(0, -1),
      {
        kind: 'message',
        msg: {
          type: 'assistant',
          message: {
            id: 'attributed-claude',
            model: CLAUDE.model,
            content: [
              { type: 'text', text },
              {
                type: 'tool_use',
                id: 'attributed-send',
                name: 'mcp__deepseekbot__bot_send_message',
                input: { channel_id: dmChannelId('ada'), body: text },
              },
            ],
          },
        },
      },
      {
        kind: 'message',
        msg: {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'attributed-send',
                content: [{ type: 'text', text: '<gateway>' }],
              },
            ],
          },
        },
      },
      CLAUDE_REPLY.at(-1)!,
    ];
    const bot = setup({ members: [...members], codexRecording, claudeRecording });
    await bot.message('attributed', 'Please answer.');
    const sessionId = bot.sessionId();
    const targets = members.map((member) =>
      expect.objectContaining({ kind: 'engine', engine: member.engine, model: expect.any(String) }),
    );
    expect(bot.current()).toMatchObject({ kind: 'engine', engine });
    expect(bot.channelMessages()).toContainEqual(expect.objectContaining({ turnTargets: targets }));

    const reopened = await bot.reopen(sessionId);
    expect(reopened.current).toMatchObject({ kind: 'engine', engine });
    expect(reopened.messages).toContainEqual(expect.objectContaining({ turnTargets: targets }));
    expect(reopened.transcript.at(-1)).toMatchObject({ kind: 'turn-end', turnTargets: targets });
    if (engine === 'claude')
      expect(reopened.transcript).toContainEqual(
        expect.objectContaining({ kind: 'reply', text, turnTargets: targets }),
      );
  },
);

it.each(['api-first', 'engine-first'] as const)(
  'continues a mixed Assignment on the same Session after quota (%s)',
  async (order) => {
    const apiFirst = order === 'api-first';
    const model = new AssignmentReplay(apiFirst);
    const native = await nativeRuntime(model);
    const bot = setup({
      members: [apiFirst ? CLAUDE : CODEX],
      namedEngine: apiFirst ? 'claude' : 'codex',
      nativeFirst: apiFirst,
      nativeRuntime: native,
      inherited: true,
      claudeRecording: [
        ...CLAUDE_REPLY.slice(0, -1),
        {
          kind: 'message',
          msg: {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'The engine Assignment finished.' }],
            },
          },
        },
        ...CLAUDE_REPLY.slice(-1),
      ],
    });
    const grant = await bot.grantWorkspace();
    expect(await bot.tool('list_assignment_models')).toMatchObject({
      result: {
        assignmentGroups: [
          {
            group: bot.groupId,
            members: apiFirst
              ? [API, { ...CLAUDE, accountId: bot.account?.id }]
              : [{ ...CODEX, accountId: bot.account?.id }, API],
          },
        ],
      },
    });
    const created = await bot.tool('create_assignment', {
      title: 'Mixed group assignment',
      description: 'Finish the fixture task and report.',
      grant_id: grant.id,
      group: bot.groupId,
    });
    expect(created).toMatchObject({
      result: { outcome: 'created', sessionId: expect.any(String) },
    });
    const result = created?.result;
    if (
      typeof result !== 'object' ||
      result === null ||
      !('sessionId' in result) ||
      typeof result.sessionId !== 'string'
    )
      throw new Error('Assignment creation produced no Session');
    const { sessionId } = result;
    await bot.idle();
    expect(
      bot.channelMessages().filter((message) => message.sessionFailure?.sessionId === sessionId),
    ).toEqual([]);
    if (!apiFirst) {
      const accountId = bot.account?.id;
      expect(accountId).toEqual(expect.any(String));
      expect(bot.host.limit('codex')).toBeUndefined();
      expect(bot.host.limit('codex', accountId)?.until).toBe(RESETS_AT);
    }
    expect(bot.assignment(sessionId)).toMatchObject({
      activity: 'idle',
      latestReport: { state: 'completed' },
    });
    expect(bot.channelMessages().flatMap((message) => message.modelSwitch ?? [])).toContainEqual(
      expect.objectContaining({
        sessionId,
        from: apiFirst ? API : { provider: 'codex', model: CODEX.model },
        to: apiFirst ? { provider: 'claude', model: CLAUDE.model } : API,
      }),
    );
    expect(
      bot.dsh.stored.get(sessionId)?.events.filter((event) => event.type === 'turn/end'),
    ).toHaveLength(2);
    expect(model.requests.filter((request) => request.sessionId === sessionId)).toHaveLength(1);
    if (apiFirst) {
      expect(bot.claude.prompts[0]).toContain('Finish the fixture task and report.');
      expect(bot.claude.options[0]?.env?.CLAUDE_CONFIG_DIR).toContain(
        join('claude', 'accounts', bot.account?.id ?? ''),
      );
      expect(bot.host.store.nativeSession(sessionId)?.accountId).toBe(bot.account?.id);
    } else expect(bot.codex).toHaveLength(1);
  },
);
