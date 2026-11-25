import { expect, it, vi } from 'vitest';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { SessionLiveStreams } from '../src/runtime/session-live.js';
import { alice, fixture } from './team-bot-visibility-fixtures.js';

it('returns root Sessions in last Human prompt order and scopes every native operation to the Owner', async () => {
  const list = vi.fn(async () => [
    { sessionId: 'native', cwd: '/work/research', running: true, lastPromptAt: 30, updatedAt: 31 },
    { sessionId: 'alice', cwd: '/work/alpha', running: false, lastPromptAt: 20, updatedAt: 50 },
    { sessionId: 'other', running: false, lastPromptAt: 10, updatedAt: 100 },
    {
      sessionId: 'child',
      parentSessionId: 'native',
      running: true,
      lastPromptAt: 40,
      updatedAt: 40,
    },
  ]);
  const read = vi.fn(async () => ({
    events: [
      { type: 'session/title', time: 1, seq: 1, data: { title: 'Research run' } },
      {
        type: 'user/message',
        time: 2,
        seq: 2,
        data: {
          source: { kind: 'agent-instructions' },
          content: [{ type: 'text', text: 'internal workspace instructions' }],
        },
      },
    ],
    seq: 2,
    running: true,
  }));
  const isRoot = vi.fn(async (id: string) => id === 'native');
  const send = vi.fn(async () => ({ requestId: 'prompt-1' }));
  const live = new SessionLiveStreams();
  live.observe('native', { type: 'turn/start', seq: 2 });
  const f = fixture({
    nativeSessions: { list, read, isRoot, send },
    sessionLive: live,
    readSessionTitles: async () =>
      new Map([
        ['native', 'Research run'],
        ['alice', 'Alpha'],
      ]),
  });
  for (const [id, botSlug] of [
    ['alice', 'alice-bot'],
    ['other', 'owner-bot'],
  ] as const)
    f.ownership.claim({ sessionId: id, botSlug, rootRole: 'orchestrator', at: '2026-11-22' });
  const owner = f.bridge(OWNER_HUMAN_CONTEXT);
  const member = f.bridge(alice);
  expect(await owner.sessionList({})).toMatchObject({
    ok: true,
    value: {
      sessions: [
        {
          sessionId: 'native',
          source: { kind: 'native' },
          title: 'Research run',
          folderName: 'research',
          running: true,
        },
        { sessionId: 'alice', source: { kind: 'bot', botSlug: 'alice-bot' }, folderName: 'alpha' },
        { sessionId: 'other', source: { kind: 'bot', botSlug: 'owner-bot' } },
      ],
    },
  });
  expect(await member.sessionList({})).toMatchObject({
    ok: true,
    value: { sessions: [{ sessionId: 'alice' }] },
  });

  const target = { slug: null, sessionId: 'native' };
  const prompt = { botSlug: null, sessionId: 'native', text: 'Continue' };
  for (const result of [
    await member.sessionTranscript(target),
    await member.sessionLive(target),
    await member.sessionMessageSend(prompt),
  ])
    expect(result).toMatchObject({ ok: false, error: { code: 'permission-required' } });
  expect(read).not.toHaveBeenCalled();
  expect(isRoot).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();

  expect(await owner.sessionTranscript(target)).toMatchObject({
    ok: true,
    value: { role: 'native', displayTitle: 'Research run', running: true, seq: 2, items: [] },
  });
  expect(await owner.sessionLive(target)).toMatchObject({ ok: true, value: { seq: 2 } });
  expect(await owner.sessionMessageSend(prompt)).toMatchObject({ ok: true });
  expect(send).toHaveBeenCalledWith('native', 'Continue');
  expect(await owner.sessionMessageSend({ ...prompt, sessionId: 'alice' })).toMatchObject({
    ok: false,
    error: { code: 'not-found' },
  });
  expect(send).toHaveBeenCalledTimes(1);
});

it('reads fallback titles once per Session version across Session list calls', async () => {
  const list = vi.fn(async () =>
    Array.from({ length: 300 }, (_, index) => ({
      sessionId: `direct-${index}`,
      running: false,
      lastPromptAt: index,
      updatedAt: index,
    })),
  );
  const readSessionTitles = vi.fn(async (ids: readonly string[]) => new Map([[ids[0]!, 'First']]));
  const f = fixture({
    nativeSessions: { list, read: vi.fn(), isRoot: vi.fn(), send: vi.fn() },
    readSessionTitles,
  });
  const owner = f.bridge(OWNER_HUMAN_CONTEXT);

  expect(await owner.sessionList({ queryVersion: 1 })).toMatchObject({ ok: true });
  const calls = readSessionTitles.mock.calls.length;
  expect(calls).toBeGreaterThan(0);
  const again = await owner.sessionList({ queryVersion: 1 });
  expect(readSessionTitles).toHaveBeenCalledTimes(calls);
  expect(again.ok && again.value.sessions.filter((row) => row.title === 'First')).toHaveLength(
    calls,
  );
});

it('pages the Session list by cursor and reads fallback titles only for the page it returns', async () => {
  const list = vi.fn(async () =>
    Array.from({ length: 120 }, (_, index) => ({
      sessionId: `s-${String(index).padStart(3, '0')}`,
      running: false,
      lastPromptAt: index % 7 === 0 ? null : 1_000 - index,
      updatedAt: 5_000 - index,
    })),
  );
  const readSessionTitles = vi.fn(
    async (ids: readonly string[]) => new Map(ids.map((id) => [id, `T ${id}`])),
  );
  const owner = fixture({
    nativeSessions: { list, read: vi.fn(), isRoot: vi.fn(), send: vi.fn() },
    readSessionTitles,
  }).bridge(OWNER_HUMAN_CONTEXT);

  const all = await owner.sessionList({ queryVersion: 1 });
  const expected = all.ok ? all.value.sessions.map((row) => row.sessionId) : [];
  expect(expected).toHaveLength(120);
  readSessionTitles.mockClear();

  const seen: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 3; page += 1) {
    const result = await owner.sessionList({
      queryVersion: 1,
      limit: 50,
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (!result.ok) throw new Error('list failed');
    seen.push(...result.value.sessions.map((row) => row.sessionId));
    expect(result.value.sessions.every((row) => row.title === `T ${row.sessionId}`)).toBe(true);
    cursor = result.value.nextCursor;
    if (page < 2) expect(cursor).toBeDefined();
  }
  expect(cursor).toBeUndefined();
  expect(seen).toEqual(expected);
  expect(readSessionTitles.mock.calls.flat(2).length).toBeLessThanOrEqual(120);

  for (const payload of [
    { limit: 0 },
    { limit: 201 },
    { limit: 1.5 },
    { cursor: 'nope' },
    { cursor: '[1,2]' },
  ])
    expect(await owner.sessionList({ queryVersion: 1, ...payload })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
});

it('combines title and Human-message matches inside the authorized source and sorts the result', async () => {
  const searchHumanMessages = vi.fn(
    async (_search: string, rows: readonly { sessionId: string }[]) =>
      new Set(
        rows
          .map((row) => row.sessionId)
          .filter((id) => ['allowed-a', 'native', 'private'].includes(id)),
      ),
  );
  const f = fixture({
    nativeSessions: {
      list: async () => [
        { sessionId: 'allowed-a', title: 'Alpha', running: false, lastPromptAt: 30, updatedAt: 31 },
        {
          sessionId: 'allowed-b',
          title: 'Budget',
          running: false,
          lastPromptAt: 20,
          updatedAt: 50,
        },
        { sessionId: 'native', title: 'Native', running: false, lastPromptAt: 10, updatedAt: 11 },
        { sessionId: 'private', title: 'Budget', running: false, lastPromptAt: 15, updatedAt: 90 },
      ],
      searchHumanMessages,
      sortTimes: async (sort: string, ids: readonly string[]) =>
        new Map(ids.map((id) => [id, id === 'allowed-a' ? 1 : sort === 'created' ? 10 : 70])),
      read: async () => ({ events: [], seq: 0, running: false }),
      send: async () => ({ requestId: '1' }),
      isRoot: async () => true,
    },
  });
  for (const [id, botSlug] of [
    ['allowed-a', 'alice-bot'],
    ['allowed-b', 'alice-bot'],
    ['private', 'owner-bot'],
  ] as const)
    f.ownership.claim({ sessionId: id, botSlug, rootRole: 'orchestrator', at: '2026-11-22' });
  const member = f.bridge(alice);
  const owner = f.bridge(OWNER_HUMAN_CONTEXT);

  expect(
    await member.sessionList({ search: ' budget ', sort: 'created', source: 'bot:alice-bot' }),
  ).toMatchObject({
    ok: true,
    value: { sessions: [{ sessionId: 'allowed-b' }, { sessionId: 'allowed-a' }] },
  });
  expect(searchHumanMessages).toHaveBeenCalledWith(
    'budget',
    [expect.objectContaining({ sessionId: 'allowed-a' })],
    expect.any(Function),
  );
  expect(await member.sessionList({ search: 'budget', source: 'native' })).toMatchObject({
    ok: true,
    value: { sessions: [] },
  });
  expect(await member.sessionList({ search: 'budget', source: 'bot:owner-bot' })).toMatchObject({
    ok: true,
    value: { sessions: [] },
  });
  expect(searchHumanMessages).toHaveBeenCalledTimes(1);
  expect(
    await owner.sessionList({ search: 'budget', source: 'native', sort: 'last-activity' }),
  ).toMatchObject({ ok: true, value: { sessions: [{ sessionId: 'native' }] } });
  expect(await member.sessionList({ search: 'budget' })).toMatchObject({
    ok: true,
    value: { sessions: [{ sessionId: 'allowed-a' }, { sessionId: 'allowed-b' }] },
  });
  expect(await member.sessionList({ sort: 'bogus' })).toMatchObject({
    ok: false,
    error: { code: 'invalid-input' },
  });
});

it('lets only the Host Owner create a native Session in a folder and prompts it once', async () => {
  const create = vi.fn(async () => ({ sessionId: 'created' }));
  const model = vi.fn(async () => ({ override: null, default: null }));
  const send = vi.fn(async () => ({ requestId: 'prompt-1' }));
  const f = fixture({
    nativeSessions: {
      list: async () => [],
      read: async () => ({ events: [], seq: 0, running: false }),
      isRoot: async () => true,
      create,
      model,
      send,
    },
  });
  const owner = f.bridge(OWNER_HUMAN_CONTEXT);
  const member = f.bridge(alice);
  const request = { cwd: '/work/research', text: 'Map the repository' };
  expect(await member.sessionCreate(request)).toMatchObject({
    ok: false,
    error: { code: 'permission-required' },
  });
  expect(create).not.toHaveBeenCalled();

  for (const invalid of [
    { text: 'Map' },
    { cwd: '/work', workspaceId: 'ws-1', text: 'Map' },
    { cwd: '/work', text: '   ' },
    { cwd: '/work', text: 'Map', choice: { kind: 'group', id: 'fast' } },
  ])
    expect(await owner.sessionCreate(invalid)).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  expect(create).not.toHaveBeenCalled();

  expect(await owner.sessionCreate(request)).toEqual({
    ok: true,
    value: { sessionId: 'created', requestId: 'prompt-1' },
  });
  expect(create).toHaveBeenCalledWith({ cwd: '/work/research' });
  expect(model).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledExactlyOnceWith('created', 'Map the repository');

  const choice = { kind: 'model', provider: 'opencode-go', model: 'kimi-k2' };
  expect(
    await owner.sessionCreate({ workspaceId: 'ws-1', text: 'Continue', choice }),
  ).toMatchObject({ ok: true });
  expect(create).toHaveBeenLastCalledWith({ workspaceId: 'ws-1' });
  expect(model).toHaveBeenCalledExactlyOnceWith('created', choice);
});

it('carries the model, a waiting question and the sort time on each queried row', async () => {
  const f = fixture({
    nativeSessions: {
      list: async () => [
        {
          sessionId: 'asking',
          cwd: '/work/app',
          running: false,
          waiting: true,
          model: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
          lastPromptAt: 40,
          updatedAt: 41,
        },
        { sessionId: 'fresh', running: true, lastPromptAt: null, updatedAt: 30 },
      ],
      read: async () => ({ events: [], seq: 0, running: false }),
      isRoot: async () => true,
      send: async () => ({ requestId: 'unused' }),
    },
  });
  const owner = f.bridge(OWNER_HUMAN_CONTEXT);
  expect(await owner.sessionList({ queryVersion: 1 })).toMatchObject({
    ok: true,
    value: {
      sessions: [
        {
          sessionId: 'asking',
          waiting: true,
          model: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
          sortedAt: 40,
        },
        { sessionId: 'fresh', sortedAt: -1 },
      ],
    },
  });
  const legacy = await owner.sessionList({});
  expect(legacy.ok && legacy.value.sessions[0]).not.toHaveProperty('sortedAt');
});

it('reports the created Session when its model choice fails, and reuses it on retry', async () => {
  const create = vi.fn(async (target: { sessionId?: string }) => ({
    sessionId: target.sessionId ?? 'blank',
  }));
  const model = vi
    .fn()
    .mockRejectedValueOnce(new Error('model unavailable'))
    .mockResolvedValue({ override: null, default: null });
  const send = vi.fn(async () => ({ requestId: 'prompt-1' }));
  const f = fixture({
    nativeSessions: {
      list: async () => [],
      read: async () => ({ events: [], seq: 0, running: false }),
      isRoot: async () => true,
      create,
      model,
      send,
    },
  });
  const owner = f.bridge(OWNER_HUMAN_CONTEXT);
  const choice = { kind: 'model', provider: 'opencode-go', model: 'kimi-k2' };
  const failed = await owner.sessionCreate({ cwd: '/work/app', text: 'Map', choice });
  expect(failed).toMatchObject({
    ok: false,
    error: {
      code: 'session/model-unavailable',
      message: 'model unavailable',
      details: { sessionId: 'blank' },
    },
  });
  expect(send).not.toHaveBeenCalled();
  expect(
    await owner.sessionCreate({ cwd: '/work/app', text: 'Map', choice, sessionId: 'blank' }),
  ).toEqual({ ok: true, value: { sessionId: 'blank', requestId: 'prompt-1' } });
  expect(create).toHaveBeenLastCalledWith({ cwd: '/work/app', sessionId: 'blank' });
});

it('refuses a model choice before creating when the Host cannot set models', async () => {
  const create = vi.fn(async () => ({ sessionId: 'never' }));
  const f = fixture({
    nativeSessions: {
      list: async () => [],
      read: async () => ({ events: [], seq: 0, running: false }),
      isRoot: async () => true,
      create,
      send: async () => ({ requestId: 'unused' }),
    },
  });
  const owner = f.bridge(OWNER_HUMAN_CONTEXT);
  expect(
    await owner.sessionCreate({
      cwd: '/work/app',
      text: 'Map',
      choice: { kind: 'model', provider: 'opencode-go', model: 'kimi-k2' },
    }),
  ).toMatchObject({ ok: false, error: { code: 'unavailable' } });
  expect(create).not.toHaveBeenCalled();
});

it('returns the native Session folder with its transcript', async () => {
  const f = fixture({
    nativeSessions: {
      list: async () => [],
      read: async () => ({
        events: [],
        seq: 0,
        running: false,
        cwd: '/Users/me/code/app-worktree',
      }),
      isRoot: async () => true,
      send: async () => ({ requestId: 'prompt-1' }),
    },
  });
  expect(
    await f.bridge(OWNER_HUMAN_CONTEXT).sessionTranscript({ slug: null, sessionId: 'native' }),
  ).toMatchObject({ ok: true, value: { cwd: '/Users/me/code/app-worktree' } });
});

it('marks a native Session title as a fallback until a generated title replaces it', async () => {
  const userMessage = {
    type: 'user/message',
    time: 1,
    seq: 1,
    data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Plan the launch' }] },
  };
  const fallback = {
    type: 'session/title',
    time: 2,
    seq: 2,
    data: { title: 'Plan the launch', source: { kind: 'fallback' } },
  };
  const generated = {
    type: 'session/title',
    time: 3,
    seq: 3,
    data: { title: 'Launch plan', source: { kind: 'dsh-session-title-llm' } },
  };
  let events: unknown[] = [userMessage];
  const read = vi.fn(async () => ({ events, seq: events.length, running: true }));
  const f = fixture({
    nativeSessions: {
      list: async () => [],
      read: read as never,
      isRoot: async () => true,
      send: async () => ({ requestId: 'prompt-1' }),
    },
  });
  const owner = f.bridge(OWNER_HUMAN_CONTEXT);
  const target = { slug: null, sessionId: 'native' };

  expect(await owner.sessionTranscript(target)).toMatchObject({
    ok: true,
    value: { titleFallback: true },
  });
  events = [userMessage, fallback];
  expect(await owner.sessionTranscript(target)).toMatchObject({
    ok: true,
    value: { displayTitle: 'Plan the launch', titleFallback: true },
  });
  events = [userMessage, fallback, generated];
  const settled = await owner.sessionTranscript(target);
  expect(settled).toMatchObject({ ok: true, value: { displayTitle: 'Launch plan' } });
  expect(settled.ok && 'titleFallback' in settled.value).toBe(false);
});

it('lets only the Owner stop an unowned root Session', async () => {
  const stop = vi.fn(async () => {});
  const f = fixture({
    nativeSessions: {
      list: async () => [],
      read: async () => ({ events: [], seq: 0, running: false }),
      isRoot: async (id) => id !== 'child',
      send: async () => ({ requestId: '1' }),
      stop,
    },
  });
  f.ownership.claim({
    sessionId: 'bot-owned',
    botSlug: 'alice-bot',
    rootRole: 'orchestrator',
    at: '2026-11-25',
  });
  const owner = f.bridge(OWNER_HUMAN_CONTEXT);
  const member = f.bridge(alice);
  expect(await member.sessionNativeStop({ sessionId: 'native' })).toMatchObject({
    ok: false,
    error: { code: 'permission-required' },
  });
  for (const sessionId of ['child', 'bot-owned'])
    expect(await owner.sessionNativeStop({ sessionId })).toMatchObject({
      ok: false,
      error: { code: 'not-found' },
    });
  expect(stop).not.toHaveBeenCalled();
  expect(await owner.sessionNativeStop({ sessionId: 'native' })).toEqual({
    ok: true,
    value: { sessionId: 'native', accepted: true },
  });
  expect(stop).toHaveBeenCalledExactlyOnceWith('native');
});

it('archives a native root and excludes it from default inventory and search', async () => {
  let archived = false;
  const searchHumanMessages = vi.fn(async () => new Set(['native']));
  const archive = vi.fn(async () => {
    archived = true;
  });
  const f = fixture({
    nativeSessions: {
      list: async () => [
        { sessionId: 'native', archived, running: false, lastPromptAt: 0, updatedAt: 1 },
      ],
      read: async () => ({ events: [], seq: 0, running: false }),
      isRoot: async () => true,
      send: async () => ({ requestId: '1' }),
      searchHumanMessages,
      archive,
    },
  });
  const owner = f.bridge(OWNER_HUMAN_CONTEXT);
  const member = f.bridge(alice);
  const target = { sessionId: 'native' };
  expect(await member.sessionNativeArchive(target)).toMatchObject({
    ok: false,
    error: { code: 'permission-required' },
  });
  expect(archive).not.toHaveBeenCalled();
  expect(await owner.sessionNativeArchive(target)).toEqual({
    ok: true,
    value: { sessionId: 'native', accepted: true },
  });
  expect(await owner.sessionList({ search: 'prompt' })).toEqual({
    ok: true,
    value: { sessions: [] },
  });
  expect(searchHumanMessages).not.toHaveBeenCalled();
  expect(await owner.sessionList({ includeArchived: true, search: 'prompt' })).toMatchObject({
    ok: true,
    value: { sessions: [{ sessionId: 'native', archived: true }], includeArchived: true },
  });
  expect(await member.sessionList({ includeArchived: true })).toMatchObject({
    ok: true,
    value: { sessions: [] },
  });
});

it('exposes live native requests and lets only the Owner answer the addressed request', async () => {
  const pending = [
    {
      kind: 'approval' as const,
      requestId: 'approval-1',
      toolName: 'write',
      reason: 'Test approval',
    },
    {
      kind: 'question' as const,
      requestId: 'question-1',
      questions: [{ id: 'style', question: 'Which style?', options: [{ label: 'Compact' }] }],
    },
  ];
  const answerApproval = vi.fn(async () => true);
  const answerQuestion = vi.fn(async () => true);
  const f = fixture({
    nativeSessions: {
      list: async () => [],
      read: async () => ({ events: [], seq: 0, running: true }),
      pendingInput: async () => pending,
      isRoot: async () => true,
      send: async () => ({ requestId: '1' }),
      answerApproval,
      answerQuestion,
    },
    sessionLive: new SessionLiveStreams(),
  });
  const owner = f.bridge(OWNER_HUMAN_CONTEXT);
  const member = f.bridge(alice);
  const target = { sessionId: 'native', slug: null };
  const approval = { sessionId: 'native', requestId: 'approval-1', decision: 'allowed-once' };
  const question = {
    sessionId: 'native',
    requestId: 'question-1',
    answer: { answers: [{ id: 'style', selected: ['Compact'] }] },
  };
  for (const result of [
    await member.sessionTranscript(target),
    await member.sessionLive(target),
    await member.sessionAnswerApproval(approval),
    await member.sessionAnswerQuestion(question),
  ])
    expect(result).toMatchObject({ ok: false, error: { code: 'permission-required' } });
  expect(answerApproval).not.toHaveBeenCalled();
  expect(answerQuestion).not.toHaveBeenCalled();

  for (const result of [await owner.sessionTranscript(target), await owner.sessionLive(target)])
    expect(result).toMatchObject({ ok: true, value: { pendingInput: pending } });
  expect(await owner.sessionAnswerApproval({ ...approval, decision: 'always' })).toMatchObject({
    ok: false,
    error: { code: 'invalid-input' },
  });
  expect(await owner.sessionAnswerQuestion({ ...question, answer: {} })).toMatchObject({
    ok: false,
    error: { code: 'invalid-input' },
  });
  expect(await owner.sessionAnswerApproval(approval)).toMatchObject({ ok: true });
  expect(answerApproval).toHaveBeenCalledExactlyOnceWith('native', 'approval-1', 'allowed-once');
  expect(await owner.sessionAnswerQuestion(question)).toMatchObject({ ok: true });
  expect(answerQuestion).toHaveBeenCalledExactlyOnceWith(
    'native',
    'question-1',
    question.answer,
    expect.any(Function),
  );
  const allowed = (answerQuestion.mock.calls[0] as unknown[])[3] as () => boolean;
  expect(allowed()).toBe(true);

  answerApproval.mockResolvedValueOnce(false);
  expect(await owner.sessionAnswerApproval(approval)).toMatchObject({
    ok: false,
    error: { code: 'session-input-not-pending' },
  });
});

it('applies one needs-you rule to native and Bot Session rows', async () => {
  const f = fixture({
    nativeSessions: {
      list: async () => [
        {
          sessionId: 'approve',
          running: true,
          waiting: true,
          pendingInput: 'approval',
          lastPromptAt: 9,
          updatedAt: 9,
        },
        { sessionId: 'ask', running: true, waiting: true, lastPromptAt: 8, updatedAt: 8 },
        { sessionId: 'broke', running: false, failed: true, lastPromptAt: 7, updatedAt: 7 },
        { sessionId: 'busy', running: true, lastPromptAt: 6, updatedAt: 6 },
        { sessionId: 'quiet', running: false, lastPromptAt: 5, updatedAt: 5 },
        { sessionId: 'bot-approve', running: false, lastPromptAt: 4, updatedAt: 4 },
        { sessionId: 'bot-ask', running: false, lastPromptAt: 3, updatedAt: 3 },
        { sessionId: 'bot-error', running: false, lastPromptAt: 2, updatedAt: 2 },
        { sessionId: 'bot-idle', running: false, lastPromptAt: 1, updatedAt: 1 },
      ],
      read: async () => ({ events: [], seq: 0, running: false }),
      isRoot: async () => true,
      send: async () => ({ requestId: 'unused' }),
    },
    describeEngineSession: (sessionId: string) =>
      sessionId === 'bot-approve' ? { state: 'waiting-approval' } : undefined,
    runtime: {
      listAssignments: () => [
        {
          sessionId: 'bot-ask',
          title: 'Pick a region',
          activity: 'idle',
          openAsk: { sourceEventId: 'e', summary: 'Which region?', at: '2026-11-25' },
        },
        { sessionId: 'bot-error', title: 'Build', activity: 'error' },
        {
          sessionId: 'bot-idle',
          title: 'Done',
          activity: 'idle',
          latestReport: { state: 'completed', summary: 'Done', at: '2026-11-25' },
        },
      ],
    },
  } as never);
  for (const id of ['bot-approve', 'bot-ask', 'bot-error', 'bot-idle'])
    f.ownership.claim({
      sessionId: id,
      botSlug: 'owner-bot',
      rootRole: 'orchestrator',
      at: '2026-11-25',
    });
  const result = await f.bridge(OWNER_HUMAN_CONTEXT).sessionList({});
  expect(
    result.ok && result.value.sessions.map((row) => [row.sessionId, row.status, row.attention]),
  ).toEqual([
    ['approve', 'needs-you', 'approval'],
    ['ask', 'needs-you', 'question'],
    ['broke', 'needs-you', 'failed'],
    ['busy', 'running', undefined],
    ['quiet', 'idle', undefined],
    ['bot-approve', 'needs-you', 'approval'],
    ['bot-ask', 'needs-you', 'question'],
    ['bot-error', 'needs-you', 'failed'],
    ['bot-idle', 'idle', undefined],
  ]);
});
