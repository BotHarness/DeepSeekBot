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
