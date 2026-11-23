import { describe, expect, it, vi } from 'vitest';
import {
  createBridgeCall,
  loadMemoryGitGraph,
  loadMemoryGitCommitDiff,
  loadSessionBotOwner,
  loadProfileSessionUsage,
  botExists,
  parseBotSummary,
  parseChannelMessages,
  parseChannelMessage,
  parseChannelRecord,
  loadChannels,
  parseOwnedSessionSummaries,
  parseSessionBotOwner,
} from '../src/client/bridge.js';
import { bridgeCall, BOT, GROUP, DM } from './bridge-helpers.js';

describe('bridge transport', () => {
  it('parses bounded read-only Session usage and rejects invalid counts, roles and windows', async () => {
    const value = {
      slug: 'ada',
      weeks: 26,
      since: '2026-04-13T00:00:00.000Z',
      rows: [
        {
          sessionId: 'root',
          role: 'orchestrator',
          label: 'orchestrator',
          updatedAt: '2026-10-12T00:00:00.000Z',
          totalTokens: 1000,
          status: 'ready',
        },
      ],
    };
    const handler = vi.fn(() => value);
    expect(
      await loadProfileSessionUsage(bridgeCall({ profileSessionUsage: handler }), 'dm-ada'),
    ).toEqual(value);
    expect(handler).toHaveBeenCalledWith({ channelId: 'dm-ada' });
    for (const malformed of [
      { ...value, weeks: 1 },
      { ...value, rows: Array(7).fill(value.rows[0]) },
      ...[-1, 1.5, Infinity].map((totalTokens) => ({
        ...value,
        rows: [{ ...value.rows[0], totalTokens }],
      })),
      { ...value, rows: [{ ...value.rows[0], role: 'group' }] },
    ]) {
      await expect(
        loadProfileSessionUsage(bridgeCall({ profileSessionUsage: () => malformed }), 'dm-ada'),
      ).rejects.toThrow('invalid Profile Session usage');
    }
  });
  it('proves Bot existence from a complete identity list and rejects malformed results', async () => {
    expect(
      await botExists(
        bridgeCall({ list: () => ({ bots: [{ slug: 'ada', displayName: 'Ada' }] }) }),
        'ada',
      ),
    ).toBe(true);
    expect(await botExists(bridgeCall({ list: () => ({ bots: [] }) }), 'ada')).toBe(false);
    for (const value of [{}, { bots: [{}] }, { bots: [{ slug: 'grace' }, null] }])
      await expect(botExists(bridgeCall({ list: () => value }), 'ada')).rejects.toThrow();
    await expect(
      botExists(async () => {
        throw new Error('Offline');
      }, 'ada'),
    ).rejects.toThrow('Offline');
  });
  it('loads a bounded owner for one native root Session', async () => {
    const owner = await loadSessionBotOwner(
      bridgeCall({
        sessionOwner: ({ sessionId }) => {
          expect(sessionId).toBe('session-ada');
          return {
            owner: {
              botSlug: 'ada',
              displayName: 'Ada',
              avatar: 'https://example.com/ada.png',
              role: 'assignment',
            },
          };
        },
      }),
      'session-ada',
    );
    expect(owner).toEqual({
      botSlug: 'ada',
      displayName: 'Ada',
      avatar: 'https://example.com/ada.png',
      role: 'assignment',
    });
    expect(parseSessionBotOwner({ owner: null })).toBeUndefined();
    expect(
      parseSessionBotOwner({ owner: { botSlug: 'ada', displayName: 'Ada', role: 'child' } }),
    ).toBeUndefined();
  });

  it('decodes the bounded Memory Git graph and changed-file diff from the Host bridge', async () => {
    const sha = 'a'.repeat(40);
    const graph = await loadMemoryGitGraph(
      bridgeCall({
        memoryGitGraph: ({ channelId, offset }) => {
          expect({ channelId, offset }).toEqual({ channelId: 'dm-ada', offset: 0 });
          return {
            head: sha,
            currentBranch: 'main',
            branches: ['main'],
            dirty: false,
            hasMore: false,
            commits: [
              {
                sha,
                parents: [],
                subject: 'Seed',
                authoredAt: '2026-09-25T00:00:00Z',
                branches: ['main'],
                status: 'accepted',
              },
            ],
          };
        },
      }),
      'dm-ada',
      0,
    );
    expect(graph.commits[0]).toMatchObject({ sha, branches: ['main'], status: 'accepted' });
    const detail = await loadMemoryGitCommitDiff(
      bridgeCall({
        memoryGitCommitDiff: ({ channelId, sha: requested }) => {
          expect({ channelId, requested }).toEqual({ channelId: 'dm-ada', requested: sha });
          return { sha, files: [{ path: 'MEMORY.md', status: 'A' }], diff: '+Memory' };
        },
      }),
      'dm-ada',
      sha,
    );
    expect(detail.files).toEqual([{ path: 'MEMORY.md', status: 'A' }]);
  });
  it('wraps named arguments in the typert args envelope and drops undefined', async () => {
    const calls: unknown[][] = [];
    const ctx = {
      connection: {
        rpc: {
          call: async (...args: unknown[]) => {
            calls.push(args);
            return { ok: true, value: { bots: [] } };
          },
        },
      },
    };

    const call = createBridgeCall(ctx as never);
    await call('list', { query: undefined, limit: 5 });

    expect(calls).toEqual([['/api', 'botharness/list', { args: { limit: 5 } }, undefined]]);
  });

  it('refuses a bound Group dispatch after the connection RPC is replaced', async () => {
    const requests: string[] = [];
    const oldRpc = {
      call: async (_channel: string, endpoint: string) => {
        requests.push(endpoint);
        return { ok: true, value: {} };
      },
    };
    const replacement = {
      call: async () => {
        throw new Error('The replacement received a Group request');
      },
    };
    const ctx = { connection: { rpc: oldRpc } };
    const call = createBridgeCall(ctx as never);
    const bound = call.bindConnection?.();
    if (!bound) throw new Error('Expected a live connection');
    await bound('channelCreate', { name: 'QA', members: [] });
    ctx.connection.rpc = replacement;
    await expect(
      bound('channelGroupMembersAdd', { channelId: 'group-qa', targets: [] }),
    ).rejects.toMatchObject({
      code: 'connection-host-changed',
    });
    expect(requests).toEqual(['botharness/channelCreate']);
  });

  it('reports unavailable when the connection rpc is absent', async () => {
    const call = createBridgeCall({} as never);

    await expect(call('list', {})).resolves.toEqual({
      ok: false,
      error: { code: 'unavailable', message: 'Connection RPC is not available', details: {} },
    });
  });
});

describe('bridge parsers', () => {
  it('parses a post trace and a mirrored notice origin for the Bot DM', () => {
    const parsed = parseChannelMessages({
      messages: [
        {
          id: 'bot-channel-post-g-1',
          at: '2026-10-12T00:00:00Z',
          author: { kind: 'bot', slug: 'ada' },
          body: '',
          botChannelPost: { channelId: 'group-crew', messageId: 'g-1' },
          botChannelPostPreview: null,
        },
        {
          id: 'memory-commit-1',
          at: '2026-10-12T00:00:00Z',
          author: { kind: 'system' },
          body: '',
          memoryCommit: {
            botSlug: 'ada',
            sha: 'a'.repeat(40),
            subject: 'Remember',
            authorName: 'Ada',
            authoredAt: '2026-10-12T00:00:00Z',
            files: [],
            moreFiles: 0,
          },
          noticeOrigin: { channelId: 'group-crew' },
        },
        {
          id: 'forged',
          at: '2026-10-12T00:00:00Z',
          author: { kind: 'human' },
          body: '',
          botChannelPost: { channelId: 'group-crew', messageId: 'g-1' },
        },
      ],
    });
    expect(parsed.map((item) => item.id)).toEqual(['bot-channel-post-g-1', 'memory-commit-1']);
    const [trace, mirrored] = parsed;
    expect(trace).toMatchObject({
      botChannelPost: { channelId: 'group-crew', messageId: 'g-1' },
      botChannelPostPreview: null,
    });
    expect(mirrored?.noticeOrigin).toEqual({ channelId: 'group-crew' });
  });

  it('parses one created PersonaBot detail with list-compatible defaults', () => {
    expect(parseBotSummary({ slug: 'new-bot', displayName: 'New Bot', workspaces: [] })).toEqual({
      slug: 'new-bot',
      displayName: 'New Bot',
      aggregateState: 'idle',
      workspaces: [],
      roles: [],
      createdAt: '',
    });
    expect(
      parseBotSummary({ slug: 'legacy', displayName: 'Legacy', tag: '旧岗位' })?.roles,
    ).toEqual(['旧岗位']);
    expect(parseBotSummary({ slug: '', displayName: 'Broken' })).toBeUndefined();
    expect(parseBotSummary({ slug: 'n', displayName: 'N', avatarSeed: 2 })?.avatarSeed).toBe(2);
    expect(parseBotSummary({ slug: 'n', displayName: 'N', avatarSeed: 3 })).not.toHaveProperty(
      'avatarSeed',
    );
  });

  it('loads Channels and keeps botSlug only when present', async () => {
    const latestMessage = {
      id: 'm-latest',
      at: '2026-09-19T00:03:00.000Z',
      author: { kind: 'bot', slug: 'ada' },
      body: '最新进展',
    };
    const channels = await loadChannels(
      bridgeCall({ channels: () => ({ channels: [GROUP, { ...DM, latestMessage }] }) }),
    );

    expect(channels).toHaveLength(2);
    expect(channels[0]).toMatchObject({ id: 'group-team', type: 'group' });
    expect(channels[1]).toMatchObject({
      id: 'dm-ada',
      botSlug: 'ada',
      latestMessage: { id: 'm-latest', body: '最新进展' },
    });
    expect('botSlug' in channels[0]!).toBe(false);
    expect(parseChannelRecord(undefined)).toBeUndefined();
  });

  it('keeps the all attention preset and its revision in a Group snapshot', () => {
    expect(
      parseChannelRecord({
        ...GROUP,
        wakePolicies: {
          ada: { mode: 'all', count: 5, intervalSeconds: 30, revision: 2 },
        },
      })?.wakePolicies,
    ).toEqual({ ada: { mode: 'all', count: 5, intervalSeconds: 30, revision: 2 } });
  });

  it('keeps valid message authors and skips malformed rows', () => {
    const messages = parseChannelMessages({
      messages: [
        {
          id: 'm1',
          at: '2026-09-19T00:00:00.000Z',
          author: { kind: 'bot', slug: 'ada' },
          body: 'hi',
        },
        { id: 'm2', at: '2026-09-19T00:01:00.000Z', author: { kind: 'bridged' }, body: 'x' },
        { id: '', at: 'x', author: { kind: 'human' }, body: 'x' },
        { id: 'm3', at: 'x', author: { kind: 'human' }, body: 'ok' },
      ],
    });

    expect(messages.map((message) => message.id)).toEqual(['m1', 'm3']);
    expect(messages[0]?.author).toEqual({ kind: 'bot', slug: 'ada' });
  });

  it('retains optional QQ receiving-app attribution and refuses malformed fields without rejecting legacy sources', () => {
    const base = {
      id: 'legacy',
      at: '2026-10-08T00:00:00Z',
      body: 'text',
      author: { kind: 'bridged', source: 'member' },
      bridgeOrigin: {
        platform: 'qq',
        conversationId: 'group',
        conversationName: 'Group',
        messageId: 'native',
        senderId: 'member',
        sourceEventId: 'source',
      },
    };
    const app = {
      ...base,
      id: 'app',
      bridgeOrigin: { ...base.bridgeOrigin, accountRef: 'qq-a', accountName: 'QA' },
    };
    const messages = parseChannelMessages({
      messages: [
        base,
        app,
        { ...app, id: 'bad-name', bridgeOrigin: { ...app.bridgeOrigin, accountName: {} } },
        { ...app, id: 'bad-ref', bridgeOrigin: { ...app.bridgeOrigin, accountRef: ' ' } },
      ],
    });
    expect(messages.map((message) => message.id)).toEqual(['legacy', 'app']);
    expect(messages[1]?.bridgeOrigin).toMatchObject({ accountRef: 'qq-a', accountName: 'QA' });
  });

  it('preserves stable Human mentions and rejects forged offsets or authors', () => {
    const message = {
      id: 'mention',
      at: '2026-09-30T00:00:00Z',
      author: { kind: 'bot', slug: 'ada' },
      body: '@Human Launch ready',
      humanMentions: [{ humanId: 'local-human', label: 'Human', start: 0, end: 6 }],
    };
    const messages = parseChannelMessages({
      messages: [
        message,
        { ...message, id: 'bad-offset', humanMentions: [{ ...message.humanMentions[0], end: 5 }] },
        { ...message, id: 'wrong-author', author: { kind: 'human' } },
      ],
    });
    expect(messages.map((entry) => entry.id)).toEqual(['mention']);
    expect(messages[0]?.humanMentions).toEqual(message.humanMentions);
  });

  it('parses reply previews and an unavailable original without accepting malformed links', () => {
    const base = {
      id: 'reply',
      at: '2026-09-19T00:02:00.000Z',
      author: { kind: 'human' },
      body: 'answer',
      replyTo: 'original',
    };
    const messages = parseChannelMessages({
      messages: [
        { ...base, replyToPreview: { author: { kind: 'bot', slug: 'ada' }, body: 'summary' } },
        { ...base, id: 'unavailable', replyToPreview: null },
        { ...base, id: 'invalid', replyTo: '' },
        { ...base, id: 'bad-preview', replyToPreview: { author: { kind: 'bot' }, body: 'x' } },
      ],
    });
    expect(messages.map((message) => message.id)).toEqual(['reply', 'unavailable']);
    expect(messages[0]).toMatchObject({
      replyTo: 'original',
      replyToPreview: { author: { kind: 'bot', slug: 'ada' }, body: 'summary' },
    });
    expect(messages[1]?.replyToPreview).toBeNull();
  });

  it('parses quotes with previews and refuses malformed ones', () => {
    const base = { id: 'q', at: '2026-11-17T00:00:00.000Z', author: { kind: 'human' }, body: 'x' };
    const messages = parseChannelMessages({
      messages: [
        {
          ...base,
          quotes: [
            {
              messageId: 'a',
              text: 'part',
              preview: { author: { kind: 'bot', slug: 'ada' }, body: 'whole' },
            },
            { messageId: 'gone', preview: null },
          ],
        },
        { ...base, id: 'no-id', quotes: [{ text: 'part' }] },
        { ...base, id: 'bad-preview', quotes: [{ messageId: 'a', preview: { body: 1 } }] },
      ],
    });
    expect(messages.map((message) => message.id)).toEqual(['q']);
    expect(messages[0]?.quotes).toEqual([
      {
        messageId: 'a',
        text: 'part',
        preview: { author: { kind: 'bot', slug: 'ada' }, body: 'whole' },
      },
      { messageId: 'gone', preview: null },
    ]);
  });

  it('parses the media hint of a reply preview and drops one it does not understand', () => {
    const thumbnail = {
      fileId: 'file:00000000-0000-4000-8000-000000000001',
      name: 'photo.png',
      mime: 'image/png',
      size: 12,
      version: 'v1',
      width: 640,
      height: 480,
    };
    const reply = (id: string, media: unknown) => ({
      id,
      at: '2026-09-19T00:02:00.000Z',
      author: { kind: 'human' },
      body: 'answer',
      replyTo: 'original',
      replyToPreview: { author: { kind: 'bot', slug: 'ada' }, body: '', media },
    });
    const messages = parseChannelMessages({
      messages: [
        reply('image', { kind: 'image', count: 3, thumbnail }),
        reply('voice', { kind: 'voice', durationMs: 7000 }),
        reply('file', { kind: 'file', name: 'Q3 report.pdf', count: 1 }),
        reply('future', { kind: 'sticker', id: 'x' }),
        reply('text', undefined),
      ],
    });
    expect(messages.map((message) => [message.id, message.replyToPreview?.media])).toEqual([
      ['image', { kind: 'image', count: 3, thumbnail }],
      ['voice', { kind: 'voice', durationMs: 7000 }],
      ['file', { kind: 'file', name: 'Q3 report.pdf', count: 1 }],
      ['future', undefined],
      ['text', undefined],
    ]);
    expect(messages[3]?.replyToPreview).toEqual({
      author: { kind: 'bot', slug: 'ada' },
      body: '',
    });
  });

  it('parses owned root Sessions and drops malformed rows', () => {
    expect(
      parseOwnedSessionSummaries({
        sessions: [
          {
            sessionId: 'orchestrator-1',
            role: 'orchestrator',
            createdAt: BOT.createdAt,
            assignmentAccessMode: 'danger-full-access',
            currentOrchestrator: true,
          },
          {
            sessionId: 'assignment-1',
            role: 'assignment',
            createdAt: BOT.createdAt,
            cwdReference: '/srv/ada',
            assignmentActivity: 'stopped',
            assignmentAccessMode: 'danger-full-access',
            currentOrchestrator: true,
          },
          { sessionId: 'child', role: 'subagent', createdAt: BOT.createdAt },
        ],
      }),
    ).toEqual([
      {
        sessionId: 'orchestrator-1',
        role: 'orchestrator',
        createdAt: BOT.createdAt,
        currentOrchestrator: true,
      },
      {
        sessionId: 'assignment-1',
        role: 'assignment',
        createdAt: BOT.createdAt,
        cwdReference: '/srv/ada',
        assignmentActivity: 'stopped',
        assignmentAccessMode: 'danger-full-access',
      },
    ]);
  });
});

it('preserves trusted approval effects for Chat and Activity while dropping malformed metadata', () => {
  const card = {
    id: 'approval',
    at: '2026-11-15T00:00:00Z',
    body: '',
    author: { kind: 'bot', slug: 'ada' },
    toolApprovalRequest: {
      sessionId: 'session',
      callId: 'call',
      toolName: 'bot_send_message',
      role: 'orchestrator',
      cwd: '/memory',
      input: '{}',
      effects: { changes: 'irreversible', reach: 'external', personalData: true },
    },
  };
  expect(parseChannelMessage(card)?.toolApprovalRequest?.effects).toEqual(
    card.toolApprovalRequest.effects,
  );
  expect(
    parseChannelMessage({
      ...card,
      toolApprovalRequest: {
        ...card.toolApprovalRequest,
        effects: { changes: 'approved', reach: 'external', personalData: true },
      },
    })?.toolApprovalRequest?.effects,
  ).toBeUndefined();
});

it('parses Host-owned Orchestrator runners without restricting future engine ids', () => {
  const bot = { slug: 'ada', displayName: 'Ada' };
  for (const runner of [
    { engine: 'codex', displayName: 'Codex', account: 'ChatGPT Plus' },
    { engine: 'claude', displayName: 'Claude Code', account: 'Claude Pro' },
    { engine: 'future-acp', displayName: 'Custom ACP' },
  ])
    expect(parseBotSummary({ ...bot, orchestratorRunner: runner })?.orchestratorRunner).toEqual(
      runner,
    );
  expect(parseBotSummary(bot)).not.toHaveProperty('orchestratorRunner');
  for (const runner of [
    null,
    {},
    { engine: 'codex' },
    { engine: '', displayName: 'Codex' },
    { engine: 'codex', displayName: 7 },
    { engine: 'codex', displayName: 'Codex', account: 3 },
  ])
    expect(parseBotSummary({ ...bot, orchestratorRunner: runner })).not.toHaveProperty(
      'orchestratorRunner',
    );
});
