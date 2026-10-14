import { describe, expect, it, vi } from 'vitest';

import { createActions } from '../src/client/actions.js';
import {
  readMessagingSource,
  channelAttachmentUrl,
  BridgeCallError,
  createBridgeCall,
  loadMemoryGitGraph,
  loadMemoryGitCommitDiff,
  loadSessionBotOwner,
  loadActivityOverview,
  loadProfileSessionUsage,
  botExists,
  parseBotSummary,
  parseChannelMessages,
  parseChannelRecord,
  parseChannelRecords,
  parseOwnedSessionSummaries,
  parseSessionBotOwner,
  type BridgeCall,
} from '../src/client/bridge.js';
import { createStore } from '../src/client/store.js';
import { onboardingFor } from '../src/client/onboarding.js';

type Handler = (payload: Record<string, unknown>) => unknown;

function bridgeCall(handlers: Record<string, Handler>): BridgeCall {
  return async (endpoint, payload) => {
    const handler = handlers[endpoint];
    if (handler === undefined) throw new Error(`unexpected endpoint: ${endpoint}`);
    return { ok: true, value: await handler(payload) };
  };
}

const BOT = {
  slug: 'ada',
  displayName: 'Ada',
  roles: ['研究'],
  aggregateState: 'working',
  workspaces: ['/srv/ada'],
  createdAt: '2026-09-19T00:00:00.000Z',
};

const GROUP = {
  id: 'group-team',
  type: 'group' as const,
  name: 'Team',
  members: ['ada'],
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
};

const DM = {
  id: 'dm-ada',
  type: 'dm' as const,
  name: 'Ada',
  members: ['ada'],
  botSlug: 'ada',
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
};

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
    expect(await botExists(bridgeCall({ list: () => ({ bots: [{ slug: 'ada' }] }) }), 'ada')).toBe(
      true,
    );
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

  it('drops malformed channels and keeps botSlug only when present', () => {
    const latestMessage = {
      id: 'm-latest',
      at: '2026-09-19T00:03:00.000Z',
      author: { kind: 'bot', slug: 'ada' },
      body: '最新进展',
    };
    const channels = parseChannelRecords({
      channels: [GROUP, { ...DM, latestMessage }, { id: 'bad', type: 'nope', name: 'x' }, null],
    });

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

describe('bridge actions', () => {
  it('opens a newly observed source from the owner roster and refuses lost read permission before selection', async () => {
    const fresh = { ...GROUP, id: 'new-source' };
    let readable = true;
    const { clientStore, actions } = setup({
      channels: () => ({ channels: [fresh] }),
      channelTimeline: ({ channelId, direction, around }) => {
        expect({ channelId, direction, around }).toEqual({
          channelId: 'new-source',
          direction: 'around',
          around: 'reply',
        });
        if (!readable) throw new Error('Source permission revoked');
        return {
          revision: 1,
          page: {
            entries: [],
            olderCursor: null,
            newerCursor: null,
            hasOlder: false,
            hasNewer: false,
          },
        };
      },
    });
    expect(clientStore.getSnapshot().channels).toEqual([]);
    await actions.openChannelAtMessage('new-source', 'reply');
    expect(clientStore.getSnapshot().conversation).toMatchObject({
      status: 'ready',
      channel: { id: 'new-source' },
      focusMessageId: 'reply',
    });
    clientStore.select(undefined);
    readable = false;
    await expect(actions.openChannelAtMessage('new-source', 'reply')).rejects.toThrow(
      'Source permission revoked',
    );
    expect(clientStore.getSnapshot().selection).toBeUndefined();
    await expect(actions.openChannelAtMessage('deleted', 'reply')).rejects.toThrow(
      'Source Channel is no longer available',
    );
  });
  it('keeps All Bots intent out of failed local echoes and preserves the stale-preview error for composer recovery', async () => {
    const preview = { revision: 'fresh', recipients: [{ botSlug: 'ada', label: 'Ada' }] };
    const { clientStore, actions } = setup({
      channelSend: () => {
        throw new BridgeCallError('all-bot-preview-changed', 'changed', { preview });
      },
    });
    await actions.load();
    await actions.openChannel('group-team');
    await expect(
      actions.send('@All Bots check', undefined, undefined, undefined, [], [], undefined, {
        start: 0,
        end: 9,
        label: 'All Bots',
        preview,
      }),
    ).rejects.toMatchObject({ code: 'all-bot-preview-changed', details: { preview } });
    expect(clientStore.getSnapshot().conversation.messages.map((m) => m.body)).toEqual([
      'older',
      'newer',
    ]);
    expect(clientStore.getSnapshot().conversation.sending).toBe(false);
  });
  function setup(extra: Record<string, Handler> = {}) {
    const clientStore = createStore();
    let topOrder: Array<{ kind: 'section' | 'channel'; id: string }> = [];
    let pins: string[] = [];
    const call = bridgeCall({
      list: () => ({ bots: [BOT] }),
      channels: () => ({ channels: [GROUP, DM] }),
      channelDm: () => ({ channel: DM }),
      channelMessages: () => ({
        revision: 2,
        messages: [
          { id: 'm2', at: '2026-09-19T00:02:00.000Z', author: { kind: 'human' }, body: 'newer' },
          { id: 'm1', at: '2026-09-19T00:01:00.000Z', author: { kind: 'human' }, body: 'older' },
        ],
      }),
      channelReadPosition: () => ({}),
      channelMarkRead: () => ({
        position: { messageId: 'm2', revision: 2, readAt: BOT.createdAt },
      }),
      channelTimeline: () => ({
        revision: 2,
        page: {
          entries: [
            { id: 'm1', at: '2026-09-19T00:01:00.000Z', author: { kind: 'human' }, body: 'older' },
            { id: 'm2', at: '2026-09-19T00:02:00.000Z', author: { kind: 'human' }, body: 'newer' },
          ],
          olderCursor: 'm1',
          newerCursor: 'm2',
          hasOlder: false,
          hasNewer: false,
        },
      }),
      channelSend: (payload) => ({
        message: {
          id: 'm3',
          at: '2026-09-19T00:03:00.000Z',
          author: { kind: 'human' },
          body: payload['body'],
        },
      }),
      channelCreate: (payload) => ({
        channel: { ...GROUP, name: payload['name'], members: [] },
      }),
      channelRename: (payload) => ({
        channel: { ...DM, name: payload['name'] },
        bot: { ...BOT, displayName: payload['name'] },
      }),
      sessions: () => ({
        sessions: [
          { sessionId: 'orchestrator-1', role: 'orchestrator', createdAt: BOT.createdAt },
          {
            sessionId: 'assignment-1',
            role: 'assignment',
            createdAt: BOT.createdAt,
            cwdReference: '/srv/ada',
            assignmentActivity: 'idle',
          },
        ],
      }),
      rosterGet: () => ({ pins, sections: [], topOrder }),
      pinsSet: (payload) => {
        pins = payload['pins'] as string[];
        return { pins };
      },
      channelAssign: () => ({}),
      topReorder: (payload) => {
        topOrder = payload['order'] as typeof topOrder;
        return { topOrder };
      },
      ...extra,
    });
    return { clientStore, actions: createActions(call, clientStore) };
  }

  it('keeps Session rows visible and ignores an older refresh response', async () => {
    const initial = { sessionId: 'initial', role: 'orchestrator', createdAt: BOT.createdAt };
    const latest = { sessionId: 'latest', role: 'orchestrator', createdAt: BOT.createdAt };
    const stale = { sessionId: 'stale', role: 'orchestrator', createdAt: BOT.createdAt };
    const pending: Array<(value: unknown) => void> = [];
    let loads = 0;
    const { clientStore, actions } = setup({
      sessions: () => {
        if (++loads === 1) return { sessions: [initial] };
        return new Promise((resolve) => pending.push(resolve));
      },
    });
    await actions.load();
    await actions.openBot('ada');
    const first = actions.refreshSessions('ada');
    const second = actions.refreshSessions('ada');
    expect(pending).toHaveLength(2);
    expect(clientStore.getSnapshot().sessions).toMatchObject({
      status: 'ready',
      items: [{ sessionId: 'initial' }],
    });
    pending[1]!({ sessions: [latest] });
    await second;
    pending[0]!({ sessions: [stale] });
    await first;
    expect(clientStore.getSnapshot().sessions).toMatchObject({
      status: 'ready',
      items: [{ sessionId: 'latest' }],
    });
  });

  it('loads the roster and opens a DM with its history in chronological order', async () => {
    const { clientStore, actions } = setup();

    await actions.load();
    expect(clientStore.getSnapshot()).toMatchObject({
      status: 'ready',
      bots: [{ slug: 'ada' }],
      channels: [{ id: 'group-team' }, { id: 'dm-ada' }],
    });

    await actions.openBot('ada');
    const state = clientStore.getSnapshot();
    expect(state.selection).toEqual({ kind: 'bot', slug: 'ada' });
    expect(state.conversation.status).toBe('ready');
    expect(state.conversation.channel?.id).toBe('dm-ada');
    expect(state.conversation.messages.map((message) => message.body)).toEqual(['older', 'newer']);
    expect(state.channels.find((channel) => channel.id === 'dm-ada')?.latestMessage?.body).toBe(
      'newer',
    );
    expect(state.sessions.items.map((session) => session.sessionId)).toEqual([
      'orchestrator-1',
      'assignment-1',
    ]);
  });

  it('refreshes owned Sessions from a Channel-selected DM after sending', async () => {
    let reads = 0;
    const { clientStore, actions } = setup({
      sessions: () => {
        reads += 1;
        return {
          sessions: [
            { sessionId: 'orchestrator-1', role: 'orchestrator', createdAt: BOT.createdAt },
          ],
        };
      },
    });
    await actions.load();
    await actions.openChannel('dm-ada');
    expect(reads).toBe(1);
    expect(clientStore.getSnapshot().sessions.items[0]?.sessionId).toBe('orchestrator-1');
    await actions.send('检查进度');
    expect(reads).toBe(2);
  });

  it('clears owned Sessions when selecting a Group after a Bot DM', async () => {
    const { clientStore, actions } = setup();
    await actions.load();
    await actions.openChannel('dm-ada');
    expect(clientStore.getSnapshot().sessions.items).toHaveLength(2);
    await actions.openChannel('group-team');
    expect(clientStore.getSnapshot().sessions.items).toEqual([]);
  });

  it('opens an Inbox source at its captured message without exposing a cached latest window', async () => {
    let resolveAround: ((value: unknown) => void) | undefined;
    const groupRequests: Record<string, unknown>[] = [];
    const { clientStore, actions } = setup({
      channelTimeline: (payload) => {
        if (payload['channelId'] !== 'group-team')
          return {
            revision: 1,
            page: {
              entries: [],
              olderCursor: null,
              newerCursor: null,
              hasOlder: false,
              hasNewer: false,
            },
          };
        groupRequests.push(payload);
        if (payload['direction'] === 'around')
          return new Promise((resolve) => {
            resolveAround = resolve;
          });
        return {
          revision: 2,
          page: {
            entries: [
              {
                id: 'm-new',
                at: BOT.createdAt,
                author: { kind: 'bot', slug: 'ada' },
                body: 'newer unread',
              },
            ],
            olderCursor: null,
            newerCursor: null,
            hasOlder: false,
            hasNewer: false,
          },
        };
      },
    });
    await actions.load();
    await actions.openChannel('group-team');
    await actions.openChannel('dm-ada');
    const frames: Array<{ status: string; messageIds: string[] }> = [];
    const unsubscribe = clientStore.subscribe(() => {
      const snapshot = clientStore.getSnapshot();
      if (snapshot.selection?.kind !== 'channel' || snapshot.selection.channelId !== 'group-team')
        return;
      frames.push({
        status: snapshot.conversation.status,
        messageIds: snapshot.conversation.messages.map((message) => message.id),
      });
    });
    const opening = actions.openChannelAtMessage('group-team', 'm-captured');
    await vi.waitFor(() => expect(resolveAround).toBeDefined());
    expect(frames).not.toContainEqual({ status: 'ready', messageIds: ['m-new'] });
    expect(clientStore.getSnapshot().selection).toEqual({ kind: 'channel', channelId: 'dm-ada' });
    expect(clientStore.getSnapshot().conversation.status).toBe('ready');
    resolveAround!({
      revision: 3,
      page: {
        entries: [
          {
            id: 'm-captured',
            at: BOT.createdAt,
            author: { kind: 'bot', slug: 'ada' },
            body: 'captured unread',
          },
        ],
        olderCursor: null,
        newerCursor: 'm-captured',
        hasOlder: false,
        hasNewer: true,
      },
    });
    await opening;
    unsubscribe();
    expect(groupRequests).toHaveLength(2);
    expect(groupRequests[1]).toMatchObject({ direction: 'around', around: 'm-captured' });
    expect(clientStore.getSnapshot().conversation).toMatchObject({
      status: 'ready',
      focusMessageId: 'm-captured',
      messages: [{ id: 'm-captured' }],
    });
  });

  it('shows a previously opened Channel immediately while its timeline refreshes', async () => {
    let resolveRefresh: ((value: unknown) => void) | undefined;
    let groupReads = 0;
    const { clientStore, actions } = setup({
      channelTimeline: (payload) => {
        if (payload['channelId'] === 'group-team' && ++groupReads === 2)
          return new Promise((resolve) => {
            resolveRefresh = resolve;
          });
        return {
          revision: 2,
          page: {
            entries: [
              {
                id: 'm1',
                at: BOT.createdAt,
                author: { kind: 'human' },
                body: String(payload['channelId']),
              },
            ],
            olderCursor: null,
            newerCursor: null,
            hasOlder: false,
            hasNewer: false,
          },
        };
      },
    });
    await actions.load();
    await actions.openChannel('group-team');
    await actions.openChannel('dm-ada');
    const frames: Array<{ status: string; channelId: string | undefined; bodies: string[] }> = [];
    const unsubscribe = clientStore.subscribe(() => {
      const { conversation } = clientStore.getSnapshot();
      frames.push({
        status: conversation.status,
        channelId: conversation.channel?.id,
        bodies: conversation.messages.map((message) => message.body),
      });
    });
    const reopened = actions.openChannel('group-team');
    expect(
      frames.every((frame) => frame.channelId === 'group-team' && frame.bodies[0] === 'group-team'),
    ).toBe(true);
    expect(clientStore.getSnapshot().conversation.status).toBe('ready');
    await vi.waitFor(() => expect(resolveRefresh).toBeDefined());
    resolveRefresh!({
      revision: 3,
      page: {
        entries: [{ id: 'm2', at: BOT.createdAt, author: { kind: 'human' }, body: 'fresh' }],
        olderCursor: null,
        newerCursor: null,
        hasOlder: false,
        hasNewer: false,
      },
    });
    await reopened;
    unsubscribe();
    expect(
      clientStore.getSnapshot().conversation.messages.map((message) => message.body),
    ).toContain('fresh');
  });

  it('starts a first Channel visit in loading state without an empty ready frame', async () => {
    const { clientStore, actions } = setup();
    await actions.load();
    const statuses: string[] = [];
    const unsubscribe = clientStore.subscribe(() => {
      if (clientStore.getSnapshot().selection?.kind === 'channel')
        statuses.push(clientStore.getSnapshot().conversation.status);
    });
    await actions.openChannel('group-team');
    unsubscribe();
    expect(statuses[0]).toBe('loading');
    expect(statuses).not.toContain('idle');
  });

  it('reconciles an off-screen send in the cached Channel', async () => {
    let resolveSend: ((value: unknown) => void) | undefined;
    const { clientStore, actions } = setup({
      channelSend: () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    });
    await actions.load();
    await actions.openChannel('group-team');
    const sending = actions.send('while away');
    await actions.openChannel('dm-ada');
    resolveSend!({
      message: {
        id: 'committed-offscreen',
        at: BOT.createdAt,
        author: { kind: 'human' },
        body: 'while away',
      },
    });
    await sending;
    const reopening = actions.openChannel('group-team');
    const committed = clientStore
      .getSnapshot()
      .conversation.messages.filter((message) => message.body === 'while away');
    expect(committed).toHaveLength(1);
    expect(committed[0]?.id).toBe('committed-offscreen');
    expect(committed[0]?.pending).toBeUndefined();
    await reopening;
  });

  it('keeps a committed send when an older background timeline refresh finishes', async () => {
    let resolveRefresh: ((value: unknown) => void) | undefined;
    let groupReads = 0;
    const original = {
      id: 'm1',
      at: BOT.createdAt,
      author: { kind: 'human' },
      body: 'original',
    };
    const page = {
      entries: [original],
      olderCursor: null,
      newerCursor: null,
      hasOlder: false,
      hasNewer: false,
    };
    const { clientStore, actions } = setup({
      channelTimeline: (payload) => {
        if (payload['channelId'] === 'group-team' && ++groupReads === 2)
          return new Promise((resolve) => {
            resolveRefresh = resolve;
          });
        return { revision: 2, page };
      },
      channelSend: () => ({
        message: {
          id: 'committed-after-refresh-started',
          at: BOT.createdAt,
          author: { kind: 'human' },
          body: 'new message',
        },
      }),
    });
    await actions.load();
    await actions.openChannel('group-team');
    await actions.openChannel('dm-ada');
    const reopened = actions.openChannel('group-team');
    await vi.waitFor(() => expect(resolveRefresh).toBeDefined());
    expect(await actions.send('new message')).toBe(true);
    resolveRefresh!({
      revision: 3,
      page: {
        ...page,
        entries: [
          original,
          { id: 'm2', at: BOT.createdAt, author: { kind: 'human' }, body: 'another reply' },
        ],
      },
    });
    await reopened;
    expect(clientStore.getSnapshot().conversation.messages.map((message) => message.body)).toEqual([
      'original',
      'another reply',
      'new message',
    ]);
  });

  it('reopens DM and group Channels around the profile read anchor', async () => {
    const requests: Array<Record<string, unknown>> = [];
    const entry = (id: string) => ({ id, at: BOT.createdAt, author: { kind: 'human' }, body: id });
    const { clientStore, actions } = setup({
      channelReadPosition: () => ({
        position: { messageId: 'm2', revision: 2, readAt: BOT.createdAt },
      }),
      channelTimeline: (payload) => {
        requests.push(payload);
        return {
          revision: 4,
          page: {
            entries: [entry('m1'), entry('m2'), entry('m3')],
            olderCursor: 'older-m1',
            newerCursor: 'newer-m3',
            hasOlder: true,
            hasNewer: true,
          },
        };
      },
    });
    await actions.load();
    await actions.openBot('ada');
    expect(clientStore.getSnapshot().conversation.focusMessageId).toBeUndefined();
    expect(clientStore.getSnapshot().conversation.unreadAfterMessageId).toBe('m2');
    expect(clientStore.getSnapshot().conversation.timeline.hasNewer).toBe(true);
    await actions.openChannel('group-team');
    expect(clientStore.getSnapshot().conversation.unreadAfterMessageId).toBe('m2');
    expect(requests).toEqual([
      { channelId: 'dm-ada', direction: 'around', around: 'm2' },
      { channelId: 'group-team', direction: 'around', around: 'm2' },
    ]);
  });

  it('draws no divider when only the Human wrote after the anchor and refreshes it on a cached reopen', async () => {
    let position = 'm2';
    let entries = [
      { id: 'm1', at: BOT.createdAt, author: { kind: 'bot', slug: 'ada' }, body: 'm1' },
      { id: 'm2', at: BOT.createdAt, author: { kind: 'bot', slug: 'ada' }, body: 'm2' },
      { id: 'm3', at: BOT.createdAt, author: { kind: 'human' }, body: 'm3' },
    ];
    const { clientStore, actions } = setup({
      channelReadPosition: () => ({
        position: { messageId: position, revision: 2, readAt: BOT.createdAt },
      }),
      channelTimeline: () => ({
        revision: entries.length,
        page: {
          entries,
          olderCursor: null,
          newerCursor: null,
          hasOlder: false,
          hasNewer: false,
        },
      }),
    });
    await actions.load();
    await actions.openChannel('group-team');
    expect(clientStore.getSnapshot().conversation.unreadAfterMessageId).toBeUndefined();
    await actions.openChannel('dm-ada');
    position = 'm3';
    entries = [
      ...entries,
      { id: 'm4', at: BOT.createdAt, author: { kind: 'bot', slug: 'ada' }, body: 'm4' },
    ];
    await actions.openChannel('group-team');
    expect(clientStore.getSnapshot().conversation.messages.map((message) => message.id)).toContain(
      'm4',
    );
    expect(clientStore.getSnapshot().conversation.unreadAfterMessageId).toBe('m3');
  });

  it('falls back to latest for an expired anchor and sends explicit read marks', async () => {
    const marked: Array<Record<string, unknown>> = [];
    const { clientStore, actions } = setup({
      channelReadPosition: () => ({ position: { messageId: 'gone' } }),
      channelTimeline: (payload) => {
        if (payload['direction'] === 'around') {
          throw new BridgeCallError('invalid-input', 'invalid or expired timeline anchor');
        }
        return {
          revision: 0,
          page: {
            entries: [],
            olderCursor: null,
            newerCursor: null,
            hasOlder: false,
            hasNewer: false,
          },
        };
      },
      channelMarkRead: (payload) => {
        marked.push(payload);
        return {
          position: { messageId: payload['messageId'], revision: 1, readAt: BOT.createdAt },
        };
      },
    });
    await actions.load();
    await actions.openBot('ada');
    expect(clientStore.getSnapshot().conversation.status).toBe('ready');
    expect(clientStore.getSnapshot().conversation.focusMessageId).toBeUndefined();
    await actions.markRead('dm-ada', 'm1');
    expect(marked).toEqual([{ channelId: 'dm-ada', messageId: 'm1' }]);
  });

  it('keeps the visible window on older-page failure and prepends exactly once on retry', async () => {
    const entry = (id: string) => ({
      id,
      at: '2026-09-19T00:01:00.000Z',
      author: { kind: 'human' },
      body: id,
    });
    let failOlder = true;
    const { clientStore, actions } = setup({
      channelTimeline: (payload) => {
        if (payload['direction'] === 'older') {
          expect(payload['cursor']).toBe('cursor-m2');
          if (failOlder) throw new Error('temporarily unavailable');
          return {
            revision: 4,
            page: {
              entries: [entry('m0'), entry('m1')],
              olderCursor: 'cursor-m0',
              newerCursor: 'cursor-m1',
              hasOlder: false,
              hasNewer: true,
            },
          };
        }
        return {
          revision: 4,
          page: {
            entries: [entry('m2'), entry('m3')],
            olderCursor: 'cursor-m2',
            newerCursor: 'cursor-m3',
            hasOlder: true,
            hasNewer: false,
          },
        };
      },
    });
    await actions.load();
    await actions.openBot('ada');
    expect(clientStore.getSnapshot().conversation.messages.map((item) => item.id)).toEqual([
      'm2',
      'm3',
    ]);
    await actions.loadOlder('dm-ada');
    expect(clientStore.getSnapshot().conversation.messages.map((item) => item.id)).toEqual([
      'm2',
      'm3',
    ]);
    expect(clientStore.getSnapshot().conversation.timeline.olderError).toBe(
      'temporarily unavailable',
    );
    failOlder = false;
    await actions.loadOlder('dm-ada');
    expect(clientStore.getSnapshot().conversation.messages.map((item) => item.id)).toEqual([
      'm0',
      'm1',
      'm2',
      'm3',
    ]);
    expect(clientStore.getSnapshot().conversation.timeline.hasOlder).toBe(false);
  });
  it('opens around a target, pages forward contiguously, then returns to latest', async () => {
    const entry = (id: string) => ({
      id,
      at: '2026-09-19T00:01:00.000Z',
      author: { kind: 'human' },
      body: id,
    });
    const { clientStore, actions } = setup({
      channelTimeline: (payload) => {
        if (payload['direction'] === 'around') {
          expect(payload['around']).toBe('m2');
          return {
            revision: 7,
            page: {
              entries: [entry('m1'), entry('m2'), entry('m3')],
              olderCursor: 'c1',
              newerCursor: 'c3',
              hasOlder: true,
              hasNewer: true,
            },
          };
        }
        if (payload['direction'] === 'newer') {
          expect(payload['cursor']).toBe('c3');
          return {
            revision: 7,
            page: {
              entries: [entry('m4'), entry('m5'), entry('m6')],
              olderCursor: 'c4',
              newerCursor: 'c6',
              hasOlder: true,
              hasNewer: false,
            },
          };
        }
        return {
          revision: 7,
          page: {
            entries: [entry('m5'), entry('m6')],
            olderCursor: 'c5',
            newerCursor: 'c6',
            hasOlder: true,
            hasNewer: false,
          },
        };
      },
    });
    await actions.load();
    await actions.openBot('ada');
    await actions.openAround('dm-ada', 'm2');
    expect(clientStore.getSnapshot().conversation.messages.map((item) => item.id)).toEqual([
      'm1',
      'm2',
      'm3',
    ]);
    expect(clientStore.getSnapshot().conversation.focusMessageId).toBe('m2');
    await actions.loadNewer('dm-ada');
    expect(clientStore.getSnapshot().conversation.messages.map((item) => item.id)).toEqual([
      'm1',
      'm2',
      'm3',
      'm4',
      'm5',
      'm6',
    ]);
    expect(clientStore.getSnapshot().conversation.timeline.hasNewer).toBe(false);
    await actions.openLatest('dm-ada');
    expect(clientStore.getSnapshot().conversation.messages.map((item) => item.id)).toEqual([
      'm5',
      'm6',
    ]);
    expect(clientStore.getSnapshot().conversation.focusMessageId).toBeUndefined();
  });
  it('stops newer pagination when the Host cursor does not advance', async () => {
    const entry = (id: string) => ({
      id,
      at: '2026-09-19T00:01:00.000Z',
      author: { kind: 'human' },
      body: id,
    });
    const { clientStore, actions } = setup({
      channelTimeline: (payload) => {
        if (payload['direction'] === 'around') {
          return {
            revision: 4,
            page: {
              entries: [entry('m1'), entry('m2')],
              olderCursor: null,
              newerCursor: 'c2',
              hasOlder: false,
              hasNewer: true,
            },
          };
        }
        if (payload['direction'] === 'newer') {
          return {
            revision: 4,
            page: {
              entries: [],
              olderCursor: 'c2',
              newerCursor: 'c2',
              hasOlder: true,
              hasNewer: true,
            },
          };
        }
        return {
          revision: 4,
          page: {
            entries: [entry('m3'), entry('m4')],
            olderCursor: 'c3',
            newerCursor: null,
            hasOlder: true,
            hasNewer: false,
          },
        };
      },
    });
    await actions.load();
    await actions.openBot('ada');
    await actions.openAround('dm-ada', 'm2');
    await actions.loadNewer('dm-ada');
    expect(clientStore.getSnapshot().conversation.timeline).toMatchObject({
      hasNewer: false,
      loadingNewer: false,
      newerError: 'Timeline newer cursor did not advance',
    });
  });
  it('does not splice an in-flight older page into a newly opened around window', async () => {
    let completeOlder: (value: unknown) => void = () => {};
    const delayedOlder = new Promise<unknown>((resolve) => {
      completeOlder = resolve;
    });
    const entry = (id: string) => ({
      id,
      at: '2026-09-19T00:01:00.000Z',
      author: { kind: 'human' },
      body: id,
    });
    const page = (ids: string[], olderCursor: string, hasNewer: boolean) => ({
      revision: 4,
      page: {
        entries: ids.map(entry),
        olderCursor,
        newerCursor: ids.at(-1) ?? null,
        hasOlder: true,
        hasNewer,
      },
    });
    const { clientStore, actions } = setup({
      channelTimeline: (payload) =>
        payload['direction'] === 'older'
          ? delayedOlder
          : payload['direction'] === 'around'
            ? page(['m1', 'm2'], 'around-m1', true)
            : page(['m3', 'm4'], 'latest-m3', false),
    });
    await actions.load();
    await actions.openBot('ada');
    const loading = actions.loadOlder('dm-ada');
    await actions.openAround('dm-ada', 'm1');
    completeOlder(page(['m0'], 'older-m0', true));
    await loading;
    expect(clientStore.getSnapshot().conversation.messages.map((item) => item.id)).toEqual([
      'm1',
      'm2',
    ]);
    expect(clientStore.getSnapshot().conversation.timeline.olderCursor).toBe('around-m1');
  });
  it('renames a DM Channel and its PersonaBot projection without changing either id', async () => {
    const { clientStore, actions } = setup();
    await actions.load();
    await actions.openBot('ada');

    await expect(actions.renameChannel('dm-ada', 'Ada Lovelace')).resolves.toBe(true);

    const state = clientStore.getSnapshot();
    expect(state.bots.find((bot) => bot.slug === 'ada')).toMatchObject({
      slug: 'ada',
      displayName: 'Ada Lovelace',
    });
    expect(state.channels.find((channel) => channel.id === 'dm-ada')?.name).toBe('Ada Lovelace');
    expect(state.conversation.channel?.name).toBe('Ada Lovelace');
  });

  it('pins and unpins group and DM Channels through the durable roster before refreshing', async () => {
    const writes: string[][] = [];
    let pins: string[] = [];
    const { clientStore, actions } = setup({
      rosterGet: () => ({ pins, sections: [], topOrder: [] }),
      pinsSet: (payload) => {
        pins = [...(payload['pins'] as string[])];
        writes.push(pins);
        return { pins };
      },
    });
    await actions.load();

    await expect(actions.setChannelPinned('group-team', true)).resolves.toBe(true);
    expect(clientStore.getSnapshot().roster.pins).toEqual(['group-team']);
    await expect(actions.setChannelPinned('group-team', true)).resolves.toBe(true);
    expect(writes).toEqual([['group-team']]);

    await expect(actions.setChannelPinned('dm-ada', true)).resolves.toBe(true);
    await expect(actions.setChannelPinned('group-team', false)).resolves.toBe(true);
    expect(clientStore.getSnapshot().roster.pins).toEqual(['dm-ada']);
    expect(writes).toEqual([['group-team'], ['group-team', 'dm-ada'], ['dm-ada']]);
  });

  it('switches pinned scope to manual even when the drop matches stored pin order', async () => {
    const pins = ['group-team', 'dm-ada'];
    const pinsSet = vi.fn(() => ({ pins }));
    const { actions } = setup({
      rosterGet: () => ({ pins, sections: [], topOrder: [] }),
      pinsSet,
    });
    await actions.load();

    const beforePublish = vi.fn();
    await expect(actions.reorderPinnedChannels([...pins], beforePublish)).resolves.toBe(true);
    expect(beforePublish).toHaveBeenCalledOnce();
    expect(pinsSet).not.toHaveBeenCalled();
  });

  it('hides and restores a Channel without changing its pin, section, or flat order', async () => {
    const writes: string[][] = [];
    let hidden: string[] = [];
    const pins = ['group-team'];
    const sections = [{ id: 's1', name: 'A', channelIds: ['group-team'] }];
    const topOrder = [{ kind: 'section' as const, id: 's1' }];
    const { clientStore, actions } = setup({
      rosterGet: () => ({ pins, hidden, sections, topOrder }),
      hiddenSet: (payload) => {
        hidden = [...(payload['hidden'] as string[])];
        writes.push(hidden);
        return { hidden };
      },
    });
    await actions.load();

    await expect(actions.setChannelHidden('group-team', true)).resolves.toBe(true);
    expect(clientStore.getSnapshot().roster).toMatchObject({
      pins,
      hidden: ['group-team'],
      sections,
      topOrder,
    });
    await expect(actions.setChannelHidden('group-team', true)).resolves.toBe(true);
    expect(writes).toEqual([['group-team']]);

    await expect(actions.setChannelHidden('group-team', false)).resolves.toBe(true);
    expect(clientStore.getSnapshot().roster).toMatchObject({
      pins,
      hidden: [],
      sections,
      topOrder,
    });
    expect(writes).toEqual([['group-team'], []]);
  });

  it('unpins and places a Channel inside a section before one roster refresh', async () => {
    const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
    let reads = 0;
    let pins = ['group-team'];
    let channelIds = ['dm-ada'];
    const { clientStore, actions } = setup({
      rosterGet: () => {
        reads += 1;
        return { pins, sections: [{ id: 's1', name: 'A', channelIds }], topOrder: [] };
      },
      channelAssign: (payload) => {
        calls.push({ endpoint: 'channelAssign', payload });
        const channelId = String(payload['channelId']);
        const index = Number(payload['index']);
        const without = channelIds.filter((id) => id !== channelId);
        channelIds = [...without.slice(0, index), channelId, ...without.slice(index)];
        return {};
      },
      pinsSet: (payload) => {
        calls.push({ endpoint: 'pinsSet', payload });
        pins = [...(payload['pins'] as string[])];
        return { pins };
      },
    });
    await actions.load();

    await expect(
      actions.movePinnedChannel('group-team', 's1', ['group-team', 'dm-ada']),
    ).resolves.toBe(true);

    expect(calls).toEqual([
      {
        endpoint: 'channelAssign',
        payload: { channelId: 'group-team', sectionId: 's1', index: 0 },
      },
      {
        endpoint: 'channelAssign',
        payload: { channelId: 'dm-ada', sectionId: 's1', index: 1 },
      },
      { endpoint: 'pinsSet', payload: { pins: [] } },
    ]);
    expect(reads).toBe(2);
    expect(clientStore.getSnapshot().roster).toMatchObject({
      pins: [],
      sections: [{ id: 's1', channelIds: ['group-team', 'dm-ada'] }],
    });
  });

  it('unpins and places a Channel at an exact loose top-level position', async () => {
    const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
    let pins = ['group-team'];
    let topOrder: Array<{ kind: 'section' | 'channel'; id: string }> = [
      { kind: 'section', id: 's1' },
    ];
    let channelIds = ['group-team'];
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins,
        sections: [{ id: 's1', name: 'A', channelIds }],
        topOrder,
      }),
      channelAssign: (payload) => {
        calls.push({ endpoint: 'channelAssign', payload });
        channelIds = channelIds.filter((id) => id !== payload['channelId']);
        return {};
      },
      topReorder: (payload) => {
        calls.push({ endpoint: 'topReorder', payload });
        topOrder = payload['order'] as typeof topOrder;
        return { topOrder };
      },
      pinsSet: (payload) => {
        calls.push({ endpoint: 'pinsSet', payload });
        pins = [...(payload['pins'] as string[])];
        return { pins };
      },
    });
    await actions.load();

    await expect(
      actions.movePinnedChannelToFlat('group-team', [
        { kind: 'channel', id: 'group-team' },
        { kind: 'section', id: 's1' },
      ]),
    ).resolves.toBe(true);

    expect(calls.map((call) => call.endpoint)).toEqual(['channelAssign', 'topReorder', 'pinsSet']);
    expect(clientStore.getSnapshot().roster).toMatchObject({
      pins: [],
      topOrder: [
        { kind: 'channel', id: 'group-team' },
        { kind: 'section', id: 's1' },
      ],
    });
  });

  it('canonicalises legacy PersonaBot-slug pins to their DM Channel ids', async () => {
    const writes: string[][] = [];
    let pins = ['ada'];
    const { clientStore, actions } = setup({
      rosterGet: () => ({ pins, sections: [], topOrder: [] }),
      pinsSet: (payload) => {
        pins = [...(payload['pins'] as string[])];
        writes.push(pins);
        return { pins };
      },
    });
    await actions.load();

    await expect(actions.ensureChannelPins()).resolves.toBe(true);
    expect(clientStore.getSnapshot().roster.pins).toEqual(['dm-ada']);
    expect(writes).toEqual([['dm-ada']]);
  });

  it('echoes a DM message locally, then reconciles it with the committed message', async () => {
    let sessionReads = 0;
    let resolveSend: (value: { message: Record<string, unknown> }) => void = () => undefined;
    let requestedId = '';
    const response = new Promise<{ message: Record<string, unknown> }>((resolve) => {
      resolveSend = resolve;
    });
    const { clientStore, actions } = setup({
      channelSend: (payload) => {
        requestedId = String(payload['messageId']);
        return response;
      },
      sessions: () => {
        sessionReads += 1;
        return { sessions: [] };
      },
    });
    await actions.load();
    await actions.openBot('ada');

    const sending = actions.send('hello');
    const echoed = clientStore.getSnapshot().conversation;
    expect(echoed.sending).toBe(true);
    expect(echoed.messages.map((message) => message.body)).toEqual(['older', 'newer', 'hello']);
    expect(echoed.messages.at(-1)?.pending).toBe(true);

    resolveSend({
      message: {
        id: requestedId,
        at: '2026-09-19T00:03:00.000Z',
        author: { kind: 'human' },
        body: 'hello',
      },
    });
    await expect(sending).resolves.toBe(true);

    const settled = clientStore.getSnapshot();
    expect(settled.conversation.sending).toBe(false);
    expect(settled.conversation.messages).toEqual([
      { id: 'm1', at: '2026-09-19T00:01:00.000Z', author: { kind: 'human' }, body: 'older' },
      { id: 'm2', at: '2026-09-19T00:02:00.000Z', author: { kind: 'human' }, body: 'newer' },
      {
        id: requestedId,
        at: '2026-09-19T00:03:00.000Z',
        author: { kind: 'human' },
        body: 'hello',
      },
    ]);
    expect(sessionReads).toBe(2);
    expect(settled.channels.find((channel) => channel.id === 'dm-ada')?.updatedAt).toBe(
      '2026-09-19T00:03:00.000Z',
    );
    expect(settled.channels.find((channel) => channel.id === 'dm-ada')?.latestMessage?.body).toBe(
      'hello',
    );
  });

  it('echoes a reply immediately and sends its target ID through the Channel RPC', async () => {
    let requested: Record<string, unknown> | undefined;
    let finish: (value: unknown) => void = () => undefined;
    const response = new Promise<unknown>((resolve) => {
      finish = resolve;
    });
    const { clientStore, actions } = setup({
      channelSend: (payload) => {
        requested = payload;
        return response;
      },
    });
    await actions.load();
    await actions.openBot('ada');

    const sending = actions.send('answer', 'm1');
    expect(requested).toMatchObject({
      channelId: 'dm-ada',
      body: 'answer',
      replyTo: 'm1',
      messageId: expect.stringMatching(/^human-/),
    });

    expect(clientStore.getSnapshot().conversation.messages.at(-1)).toMatchObject({
      body: 'answer',
      pending: true,
      replyTo: 'm1',
      replyToPreview: { author: { kind: 'human' }, body: 'older' },
    });
    finish({
      message: {
        id: 'm3',
        at: '2026-09-19T00:03:00.000Z',
        author: { kind: 'human' },
        body: 'answer',
        replyTo: 'm1',
        replyToPreview: { author: { kind: 'human' }, body: 'older' },
      },
    });
    await expect(sending).resolves.toBe(true);
    expect(clientStore.getSnapshot().conversation.messages.at(-1)).toMatchObject({
      id: 'm3',
      replyTo: 'm1',
    });
    expect(clientStore.getSnapshot().conversation.messages.at(-1)?.pending).toBeUndefined();
  });

  it('restores a hidden failed bubble when newer paging reaches the tail', async () => {
    const entry = (id: string) => ({
      id,
      at: '2026-09-19T00:01:00.000Z',
      author: { kind: 'human' },
      body: id,
    });
    const { clientStore, actions } = setup({
      channelSend: () => {
        throw new Error('offline');
      },
      channelTimeline: (payload) => {
        if (payload['direction'] === 'around') {
          return {
            revision: 4,
            page: {
              entries: [entry('m1'), entry('m2')],
              olderCursor: null,
              newerCursor: 'c2',
              hasOlder: false,
              hasNewer: true,
            },
          };
        }
        if (payload['direction'] === 'newer') {
          return {
            revision: 4,
            page: {
              entries: [entry('m3'), entry('m4')],
              olderCursor: 'c3',
              newerCursor: null,
              hasOlder: true,
              hasNewer: false,
            },
          };
        }
        return {
          revision: 4,
          page: {
            entries: [entry('m3'), entry('m4')],
            olderCursor: 'c3',
            newerCursor: null,
            hasOlder: true,
            hasNewer: false,
          },
        };
      },
    });
    await actions.load();
    await actions.openBot('ada');
    await actions.send('restore me');
    const failedId = clientStore.getSnapshot().conversation.messages.at(-1)?.id;
    await actions.openAround('dm-ada', 'm2');
    expect(
      clientStore.getSnapshot().conversation.messages.some((item) => item.id === failedId),
    ).toBe(false);
    await actions.loadNewer('dm-ada');
    expect(clientStore.getSnapshot().conversation.messages.at(-1)).toMatchObject({
      id: failedId,
      body: 'restore me',
      failed: 'offline',
    });
    await actions.openAround('dm-ada', 'm2');
    await actions.send('second failure');
    const retained = clientStore
      .getSnapshot()
      .conversation.messages.find((message) => message.id === failedId);
    expect(retained).toMatchObject({ body: 'restore me', failed: 'offline' });
  });

  it('does not turn an SSE-reconciled commit back into a failed bubble', async () => {
    let rejectSend: (reason: Error) => void = () => {};
    const { clientStore, actions } = setup({
      channelSend: () =>
        new Promise((_, reject) => {
          rejectSend = reject;
        }),
    });
    await actions.load();
    await actions.openBot('ada');
    const sending = actions.send('committed despite response loss');
    const local = clientStore.getSnapshot().conversation.messages.at(-1)!;
    clientStore.setConversation({
      messages: clientStore.getSnapshot().conversation.messages.map((message) =>
        message.id === local.id
          ? (() => {
              const { pending: _pending, ...committed } = message;
              return committed;
            })()
          : message,
      ),
    });
    rejectSend(new Error('response lost'));
    await expect(sending).resolves.toBe(true);
    const committed = clientStore.getSnapshot().conversation.messages.at(-1);
    expect(committed?.id).toBe(local.id);
    expect(committed?.pending).toBeUndefined();
    expect(committed?.failed).toBeUndefined();
  });

  it('hands a confirmed onboarding draft to its original message when the accepted response is lost', async () => {
    const accepted: Array<{ id: string; at: string; author: { kind: 'human' }; body: string }> = [];
    const { clientStore, actions } = setup({
      onboardingModel: () => ({}),
      channelSend: (payload) => {
        accepted.push({
          id: String(payload['messageId']),
          at: BOT.createdAt,
          author: { kind: 'human' },
          body: String(payload['body']),
        });
        throw new Error('response lost');
      },
      channelTimeline: () => ({
        revision: accepted.length,
        page: {
          entries: accepted,
          olderCursor: null,
          newerCursor: null,
          hasOlder: false,
          hasNewer: false,
        },
      }),
    });
    await actions.load();
    await actions.openBot('ada');
    const controller = onboardingFor(actions);
    controller.chooseModel('dm-ada', 'ada', 'Only one question');
    await controller.saveModel({ provider: 'deepseek', model: 'chat' }, true, 0);
    await controller.sendPending();
    expect(clientStore.getSnapshot().conversation.messages).toEqual([
      expect.objectContaining({ id: accepted[0]!.id, failed: 'response lost' }),
    ]);
    expect(controller.getSnapshot().pending).toBeUndefined();
    await actions.refreshChannelMessages('dm-ada');
    controller.reviewPending();
    await controller.sendPending();
    expect(accepted).toHaveLength(1);
    expect(clientStore.getSnapshot().conversation.messages).toEqual([accepted[0]]);
    expect(controller.getSnapshot().modelOpen).toBe(false);
  });

  it('merges a journal tail page into the visible window and leaves a detached window alone', async () => {
    const at = BOT.createdAt;
    const item = (revision: number) => ({
      id: `m${revision}`,
      at,
      author: { kind: 'human' as const },
      body: `m${revision}`,
      channelRevision: revision,
    });
    const { clientStore, actions } = setup({
      channelTimeline: () => ({
        revision: 5,
        page: {
          entries: [item(3), item(4), item(5)],
          olderCursor: 'c3',
          newerCursor: null,
          hasOlder: true,
          hasNewer: false,
        },
      }),
    });
    await actions.load();
    await actions.openBot('ada');
    const ids = () => clientStore.getSnapshot().conversation.messages.map((message) => message.id);
    expect(ids()).toEqual(['m3', 'm4', 'm5']);

    actions.applyChannelTail('dm-ada', {
      entries: [item(5), item(6)],
      olderCursor: 'c5',
      hasOlder: true,
    });
    expect(ids()).toEqual(['m3', 'm4', 'm5', 'm6']);
    expect(clientStore.getSnapshot().conversation.revision).toBe(6);
    expect(clientStore.getSnapshot().conversation.timeline.olderCursor).toBe('c3');

    actions.applyChannelTail('dm-ada', {
      entries: [item(7), item(8)],
      olderCursor: 'c7',
      hasOlder: true,
    });
    expect(ids()).toEqual(['m3', 'm4', 'm5', 'm6', 'm7', 'm8']);

    actions.applyChannelTail('dm-ada', {
      entries: [item(20), item(21)],
      olderCursor: 'c20',
      hasOlder: true,
    });
    expect(ids()).toEqual(['m20', 'm21']);
    expect(clientStore.getSnapshot().conversation.timeline).toMatchObject({
      olderCursor: 'c20',
      hasOlder: true,
    });

    clientStore.setConversation({
      timeline: { ...clientStore.getSnapshot().conversation.timeline, hasNewer: true },
    });
    actions.applyChannelTail('dm-ada', {
      entries: [item(30)],
      olderCursor: 'c30',
      hasOlder: true,
    });
    expect(ids()).toEqual(['m20', 'm21']);
    expect(clientStore.getSnapshot().conversation.revision).toBe(30);
  });

  it('generates a Host-valid UUID fallback when Web Crypto is unavailable', async () => {
    let sentId = '';
    const { actions } = setup({
      channelSend: (payload) => {
        sentId = String(payload['messageId']);
        return {
          message: {
            id: sentId,
            at: BOT.createdAt,
            author: { kind: 'human' },
            body: String(payload['body']),
          },
        };
      },
    });
    vi.stubGlobal('crypto', undefined);
    try {
      await actions.load();
      await actions.openBot('ada');
      await expect(actions.send('fallback')).resolves.toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(sentId).toMatch(/^human-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
  });

  it('keeps a failed local echo for explicit draft restoration when a send is rejected', async () => {
    const { clientStore, actions } = setup({
      channelSend: () => {
        throw new Error('PersonaBot is archived: ada');
      },
    });
    await actions.load();
    await actions.openBot('ada');

    const attachment = {
      hash: 'sha256:abc',
      name: 'photo.png',
      mime: 'image/png',
      size: 123,
    };
    await expect(actions.send('hello', undefined, [attachment])).resolves.toBe(false);

    const state = clientStore.getSnapshot();
    expect(state.conversation.messages.map((message) => message.body)).toEqual([
      'older',
      'newer',
      'hello',
    ]);
    expect(state.conversation.messages.at(-1)).toMatchObject({
      id: expect.stringMatching(/^human-/),
      pending: false,
      failed: 'PersonaBot is archived: ada',
    });
    expect(state.conversation.sending).toBe(false);
    expect(state.conversation.error).toBe('PersonaBot is archived: ada');
    expect(state.conversation.messages.at(-1)?.attachments).toEqual([attachment]);
    await actions.openChannel('group-team');
    await actions.openBot('ada');
    expect(clientStore.getSnapshot().conversation.messages.at(-1)?.failed).toBe(
      'PersonaBot is archived: ada',
    );
    expect(clientStore.getSnapshot().conversation.messages.at(-1)?.attachments).toEqual([
      attachment,
    ]);
    expect(actions.dismissFailedMessage('dm-ada', state.conversation.messages.at(-1)!.id)).toBe(
      true,
    );
    expect(clientStore.getSnapshot().conversation.messages.map((message) => message.body)).toEqual([
      'older',
      'newer',
    ]);
  });

  it('creates a group channel, selects it, and surfaces failures', async () => {
    const { clientStore, actions } = setup();
    await actions.load();

    const channel = await actions.createGroup('Team');

    expect(channel?.id).toBe('group-team');
    const state = clientStore.getSnapshot();
    expect(state.channels[0]?.id).toBe('group-team');
    expect(state.selection).toEqual({ kind: 'channel', channelId: 'group-team' });
    expect(state.conversation.status).toBe('ready');
    expect(state.roster.topOrder?.[0]).toEqual({ kind: 'channel', id: 'group-team' });

    const failing = createActions(
      bridgeCall({
        list: () => ({ bots: [] }),
        channels: () => ({ channels: [] }),
        channelCreate: () => {
          throw new Error('bridge down');
        },
      }),
      clientStore,
    );
    await expect(failing.createGroup('Nope')).rejects.toThrow('bridge down');
  });

  it('creates a group channel as the first row of a target section', async () => {
    const assignments: Array<Record<string, unknown>> = [];
    const { actions } = setup({
      channelAssign: (payload) => {
        assignments.push(payload);
        return {};
      },
    });
    await actions.load();

    await actions.createGroup('Team', 'section-work');

    expect(assignments).toEqual([{ channelId: 'group-team', sectionId: 'section-work', index: 0 }]);
  });

  it('can send the first DM immediately after creating a PersonaBot', async () => {
    const creates: Array<Record<string, unknown>> = [];
    const { clientStore, actions } = setup({
      list: () => ({
        bots:
          creates.length === 0
            ? [BOT]
            : [{ ...BOT, ...creates.at(-1), slug: 'bot-generated' }, BOT],
      }),
      create: (payload) => {
        creates.push(payload);
        return {
          bot: {
            slug: 'bot-generated',
            displayName: payload['displayName'],
            roles: payload['roles'],
            description: payload['description'],
            aggregateState: 'idle',
            workspaces: [],
            createdAt: '2026-09-20T00:00:00.000Z',
          },
        };
      },
      channelDm: () => ({ channel: { ...DM, id: 'dm-bot-generated', botSlug: 'bot-generated' } }),
    });
    await actions.load();

    const created = await actions.createBot({
      displayName: '小研',
      roles: ['研究员', '写作'],
      description: '负责资料研究与写作。',
      persona: '# Custom colleague\n',
    });

    expect(creates).toEqual([
      {
        displayName: '小研',
        roles: ['研究员', '写作'],
        description: '负责资料研究与写作。',
        persona: '# Custom colleague\n',
      },
    ]);
    expect(created.slug).toBe('bot-generated');
    expect(clientStore.getSnapshot().bots[0]).toMatchObject({
      slug: 'bot-generated',
      displayName: '小研',
      roles: ['研究员', '写作'],
      description: '负责资料研究与写作。',
    });
    expect(clientStore.getSnapshot().selection).toEqual({
      kind: 'bot',
      slug: 'bot-generated',
    });
    await expect(actions.send('创建后第一条消息')).resolves.toBe(true);
    expect(clientStore.getSnapshot().conversation.status).toBe('ready');
    expect(clientStore.getSnapshot().conversation.channel?.id).toBe('dm-bot-generated');
    expect(clientStore.getSnapshot().conversation.messages.at(-1)?.body).toBe('创建后第一条消息');
    expect(clientStore.getSnapshot().roster.topOrder?.[0]).toEqual({
      kind: 'channel',
      id: 'dm-bot-generated',
    });
  });

  it('routes Git-backed creation through its async Host endpoint and opens the DM', async () => {
    const imports: Array<Record<string, unknown>> = [];
    const { actions, clientStore } = setup({
      list: () => ({
        bots:
          imports.length === 0 ? [BOT] : [{ ...BOT, ...imports.at(-1), slug: 'bot-imported' }, BOT],
      }),
      createFromGit: (payload) => {
        imports.push(payload);
        return { bot: { ...BOT, slug: 'bot-imported', displayName: payload['displayName'] } };
      },
      channelDm: () => ({ channel: { ...DM, id: 'dm-bot-imported', botSlug: 'bot-imported' } }),
    });
    await actions.load();

    const created = await actions.createBot({
      displayName: 'Imported',
      roles: [],
      gitUrl: 'https://github.com/owner/memory.git',
    });

    expect(imports).toEqual([
      { displayName: 'Imported', roles: [], gitUrl: 'https://github.com/owner/memory.git' },
    ]);
    expect(created.slug).toBe('bot-imported');
    expect(clientStore.getSnapshot().selection).toEqual({ kind: 'bot', slug: 'bot-imported' });
    await expect(actions.send('What is in your memory?')).resolves.toBe(true);
  });
  it('creates a PersonaBot DM as the first row of a target section', async () => {
    const assignments: Array<Record<string, unknown>> = [];
    const { actions } = setup({
      create: () => ({ bot: { ...BOT, slug: 'bot-generated' } }),
      channelDm: () => ({ channel: { ...DM, id: 'dm-bot-generated', botSlug: 'bot-generated' } }),
      channelAssign: (payload) => {
        assignments.push(payload);
        return {};
      },
    });
    await actions.load();

    await actions.createBot({ displayName: '小研', roles: [] }, 'section-work');

    expect(assignments).toEqual([
      { channelId: 'dm-bot-generated', sectionId: 'section-work', index: 0 },
    ]);
  });

  it('reports roster failures without throwing', async () => {
    const failing: BridgeCall = async () => ({
      ok: false,
      error: { code: 'unavailable', message: 'RPC is not available', details: {} },
    });
    const clientStore = createStore();

    await createActions(failing, clientStore).load();

    expect(clientStore.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'RPC is not available',
    });
  });

  it('keeps successful roster metadata when the channel refresh fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let failChannels = false;
    let pins: string[] = [];
    const { clientStore, actions } = setup({
      channels: () => {
        if (failChannels) throw new Error('channel read failed');
        return { channels: [GROUP, DM] };
      },
      rosterGet: () => ({ pins, sections: [] }),
    });
    try {
      await actions.load();
      failChannels = true;
      pins = ['ada'];
      await actions.refreshRoster();
      expect(clientStore.getSnapshot().roster.pins).toEqual(['ada']);
      expect(clientStore.getSnapshot().channels.map((channel) => channel.id)).toEqual([
        GROUP.id,
        DM.id,
      ]);
      expect(clientStore.getSnapshot().roster.readOnly).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it('removes a deleted Group locally even when the reload fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let failChannels = false;
    const { clientStore, actions } = setup({
      channels: () => {
        if (failChannels) throw new Error('channel read failed');
        return { channels: [GROUP, DM] };
      },
      channelGroupDelete: () => ({ deleted: true }),
    });
    try {
      await actions.load();
      clientStore.select({ kind: 'channel', channelId: GROUP.id });
      clientStore.setConversation({ channel: GROUP });
      failChannels = true;
      await expect(actions.deleteGroupChannel(GROUP.id)).resolves.toBe(true);
      expect(clientStore.getSnapshot().selection).toBeUndefined();
      expect(clientStore.getSnapshot().channels.map((channel) => channel.id)).toEqual([DM.id]);
    } finally {
      warn.mockRestore();
    }
  });

  it('mirrors the host arrangement into the roster state', async () => {
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: ['ada'],
        sections: [
          { id: 's2', name: '研究', channelIds: [] },
          { id: 's1', name: '工作流', channelIds: ['c1'] },
        ],
      }),
    });

    await actions.load();

    expect(clientStore.getSnapshot().roster).toEqual({
      pins: ['ada'],
      hidden: [],
      sections: [
        { id: 's2', name: '研究', channelIds: [] },
        { id: 's1', name: '工作流', channelIds: ['c1'] },
      ],
      topOrder: undefined,
      readOnly: false,
    });
  });

  it('creates a section through the bridge and refreshes the roster', async () => {
    const writes: unknown[] = [];
    let sections: Array<{ id: string; name: string; channelIds: string[] }> = [];
    const { clientStore, actions } = setup({
      sectionCreate: (payload) => {
        writes.push(payload);
        const created = { id: 'host-1', name: String(payload['name']), channelIds: [] };
        sections = [...sections, created];
        return { section: created };
      },
      rosterGet: () => ({ pins: [], sections }),
    });

    const created = await actions.createSection('研究');

    expect(writes).toEqual([{ name: '研究' }]);
    expect(created).toEqual({ id: 'host-1', name: '研究', channelIds: [] });
    expect(clientStore.getSnapshot().roster.sections).toEqual([
      { id: 'host-1', name: '研究', channelIds: [] },
    ]);
  });

  it('freezes a section order through positioned channelAssign writes', async () => {
    const assignments: Array<Record<string, unknown>> = [];
    let channelIds = ['c1', 'c2', 'c3'];
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: [{ id: 's1', name: 'A', channelIds }],
      }),
      channelAssign: (payload) => {
        assignments.push(payload);
        const channelId = String(payload['channelId']);
        const index = Number(payload['index']);
        const without = channelIds.filter((id) => id !== channelId);
        channelIds = [...without.slice(0, index), channelId, ...without.slice(index)];
      },
    });
    await actions.load();

    const applied = await actions.setSectionChannelOrder('s1', ['c3', 'c1', 'c2']);

    expect(applied).toBe(true);
    expect(assignments).toEqual([
      { channelId: 'c3', sectionId: 's1', index: 0 },
      { channelId: 'c1', sectionId: 's1', index: 1 },
      { channelId: 'c2', sectionId: 's1', index: 2 },
    ]);
    expect(clientStore.getSnapshot().roster.sections[0]?.channelIds).toEqual(['c3', 'c1', 'c2']);
  });

  it('moves a channel into a section through positioned channelAssign writes', async () => {
    const assignments: Array<Record<string, unknown>> = [];
    let channelIds = ['c1', 'c2'];
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: [{ id: 's1', name: 'A', channelIds }],
      }),
      channelAssign: (payload) => {
        assignments.push(payload);
        const channelId = String(payload['channelId']);
        const index = Number(payload['index']);
        const without = channelIds.filter((id) => id !== channelId);
        channelIds = [...without.slice(0, index), channelId, ...without.slice(index)];
      },
    });
    await actions.load();

    const applied = await actions.moveChannel('c3', 's1', ['c1', 'c3', 'c2']);

    expect(applied).toBe(true);
    expect(assignments).toEqual([
      { channelId: 'c1', sectionId: 's1', index: 0 },
      { channelId: 'c3', sectionId: 's1', index: 1 },
      { channelId: 'c2', sectionId: 's1', index: 2 },
    ]);
    expect(clientStore.getSnapshot().roster.sections[0]?.channelIds).toEqual(['c1', 'c3', 'c2']);
  });

  it('moves a channel into an empty section with a single index-0 write', async () => {
    const assignments: Array<Record<string, unknown>> = [];
    let channelIds: string[] = [];
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: [{ id: 's-empty', name: 'Empty', channelIds }],
      }),
      channelAssign: (payload) => {
        assignments.push(payload);
        const channelId = String(payload['channelId']);
        const index = Number(payload['index']);
        const without = channelIds.filter((id) => id !== channelId);
        channelIds = [...without.slice(0, index), channelId, ...without.slice(index)];
      },
    });
    await actions.load();

    const applied = await actions.moveChannel('c1', 's-empty', ['c1']);

    expect(applied).toBe(true);
    expect(assignments).toEqual([{ channelId: 'c1', sectionId: 's-empty', index: 0 }]);
    expect(clientStore.getSnapshot().roster.sections[0]?.channelIds).toEqual(['c1']);
  });

  it('persists the section display order through the bridge', async () => {
    const writes: unknown[] = [];
    let sectionOrder = ['s1', 's2'];
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: sectionOrder.map((id) => ({ id, name: id, channelIds: [] })),
      }),
      sectionReorder: (payload) => {
        writes.push(payload);
        sectionOrder = payload['order'] as string[];
        return { sectionOrder };
      },
    });
    await actions.load();

    const applied = await actions.reorderSections(['s2', 's1']);

    expect(applied).toBe(true);
    expect(writes).toEqual([{ order: ['s2', 's1'] }]);
    expect(clientStore.getSnapshot().roster.sections.map((section) => section.id)).toEqual([
      's2',
      's1',
    ]);
  });

  it('persists absolute flat orders and moves channels into flat slots', async () => {
    const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
    let topOrder: unknown[] = [{ kind: 'section', id: 's1' }];
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: [{ id: 's1', name: 'A', channelIds: ['c1'] }],
        topOrder,
      }),
      channelAssign: (payload) => {
        calls.push({ endpoint: 'channelAssign', payload });
        return {};
      },
      topReorder: (payload) => {
        calls.push({ endpoint: 'topReorder', payload });
        topOrder = payload['order'] as unknown[];
        return { topOrder };
      },
    });
    await actions.load();

    await actions.reorderFlat([
      { kind: 'channel', id: 'c9' },
      { kind: 'section', id: 's1' },
    ]);
    await actions.moveToFlat('c1', [
      { kind: 'channel', id: 'c1' },
      { kind: 'section', id: 's1' },
    ]);

    expect(calls.map((call) => call.endpoint)).toEqual([
      'topReorder',
      'channelAssign',
      'topReorder',
    ]);
    expect(calls[1]).toEqual({
      endpoint: 'channelAssign',
      payload: { channelId: 'c1', sectionId: undefined },
    });
    expect(clientStore.getSnapshot().roster.topOrder).toEqual([
      { kind: 'channel', id: 'c1' },
      { kind: 'section', id: 's1' },
    ]);
  });

  it('converts a pre-flat host arrangement once and then stays quiet', async () => {
    let topOrder: unknown[] | undefined;
    let writes = 0;
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: [{ id: 's1', name: 'A', channelIds: ['c1'] }],
        ...(topOrder === undefined ? {} : { topOrder }),
      }),
      topReorder: (payload) => {
        writes += 1;
        topOrder = payload['order'] as unknown[];
        return { topOrder };
      },
    });
    await actions.load();
    clientStore.setRoster(
      [],
      [
        { ...GROUP, id: 'c1' },
        { ...GROUP, id: 'loose' },
      ],
    );

    expect(await actions.ensureFlatTopOrder()).toBe(true);
    expect(writes).toBe(1);
    expect(topOrder).toEqual([
      { kind: 'section', id: 's1' },
      { kind: 'channel', id: 'loose' },
    ]);

    expect(await actions.ensureFlatTopOrder()).toBe(true);
    expect(writes).toBe(1);
  });

  it('projects the flat order and drops malformed entries while parsing', async () => {
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: [{ id: 's1', name: 'A', channelIds: [] }],
        topOrder: [
          { kind: 'section', id: 's1' },
          { kind: 'channel', id: 'c1' },
          { kind: 'channel', id: '' },
          { kind: 'nope', id: 'x' },
          null,
          { kind: 'channel', id: 'c1' },
        ],
      }),
    });
    await actions.load();

    expect(clientStore.getSnapshot().roster.topOrder).toEqual([
      { kind: 'section', id: 's1' },
      { kind: 'channel', id: 'c1' },
    ]);
  });

  it('leaves legacy hosts without a flat order for the migration', async () => {
    const { clientStore, actions } = setup({
      rosterGet: () => ({ pins: [], sections: [] }),
    });
    await actions.load();

    expect(clientStore.getSnapshot().roster.topOrder).toBeUndefined();
  });

  it('marks the roster read-only when a write reports storage-unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const clientStore = createStore();
    const call: BridgeCall = async (endpoint) => {
      if (endpoint === 'rosterGet') {
        return { ok: true, value: { pins: [], sections: [] } };
      }
      if (endpoint === 'sectionCreate') {
        return {
          ok: false,
          error: {
            code: 'storage-unavailable',
            message: 'roster storage is unavailable',
            details: {},
          },
        };
      }
      throw new Error(`unexpected endpoint: ${endpoint}`);
    };
    const actions = createActions(call, clientStore);
    await actions.load();

    await expect(actions.createSection('A')).resolves.toBeUndefined();
    expect(clientStore.getSnapshot().roster.readOnly).toBe(true);
    warn.mockRestore();
  });

  it('marks the roster read-only on the first load and clears it when a later load succeeds', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const clientStore = createStore();
    let unavailable = true;
    const call: BridgeCall = async (endpoint) => {
      if (endpoint === 'list') return { ok: true, value: { bots: [] } };
      if (endpoint === 'channels') return { ok: true, value: { channels: [] } };
      if (endpoint === 'rosterGet') {
        return unavailable
          ? {
              ok: false,
              error: {
                code: 'storage-unavailable',
                message: 'roster storage is unavailable',
                details: {},
              },
            }
          : { ok: true, value: { pins: ['ada'], sections: [] } };
      }
      throw new Error(`unexpected endpoint: ${endpoint}`);
    };
    const actions = createActions(call, clientStore);

    await actions.load();
    expect(clientStore.getSnapshot().roster.readOnly).toBe(true);
    expect(clientStore.getSnapshot().status).toBe('ready');

    unavailable = false;
    await actions.refreshRoster();
    expect(clientStore.getSnapshot().roster).toEqual({
      pins: ['ada'],
      hidden: [],
      sections: [],
      topOrder: undefined,
      readOnly: false,
    });
    warn.mockRestore();
  });
});

describe('Workspace folder authorization action', () => {
  it('uses the Host picker, DSH Workspace registration, and BotHarness Grant in that order', async () => {
    const steps: string[] = [];
    const grant = {
      id: 'grant-1',
      botSlug: 'ada',
      workspaceId: 'workspace-1',
      workspacePath: '/tmp/project',
      workspaceTitle: 'project',
      createdAt: '2026-09-24T00:00:00.000Z',
    };
    const call = bridgeCall({
      grantCreate(payload) {
        steps.push('grant');
        expect(payload).toEqual({ slug: 'ada', workspaceId: 'workspace-1' });
        return { grant };
      },
    });
    const actions = createActions(call, createStore(), {
      async pickDirectory() {
        steps.push('pick');
        return '/tmp/project';
      },
      async createWorkspace(input) {
        steps.push('register');
        expect(input).toEqual({ path: '/tmp/project' });
        return { workspaceId: 'workspace-1' };
      },
    });

    await expect(actions.addWorkspaceFolder('ada')).resolves.toMatchObject(grant);
    expect(steps).toEqual(['pick', 'register', 'grant']);
  });

  it('does not register or grant a cancelled folder choice', async () => {
    const createWorkspace = vi.fn(async () => ({ workspaceId: 'workspace-1' }));
    const call: BridgeCall = vi.fn(async () => {
      throw new Error('unexpected Grant call');
    });
    const actions = createActions(call, createStore(), {
      pickDirectory: async () => null,
      createWorkspace,
    });

    await expect(actions.addWorkspaceFolder('ada')).resolves.toBeUndefined();
    expect(createWorkspace).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });
});

describe('Workspace native action bridge', () => {
  it('resolves the owner before discovery/open and makes no Grant or Session mutations', async () => {
    const call = vi.fn<BridgeCall>(async (method, payload) => {
      expect(method).toBe('workspaceFileTarget');
      expect(payload).toEqual({ slug: 'ada', grantId: 'grant-1' });
      return {
        ok: true,
        value: { target: { path: '/host/project', relativePath: '', kind: 'directory' } },
      };
    });
    const nativeFiles = {
      applications: vi.fn(async () => ({ available: true, applications: [] })),
      open: vi.fn(async () => {}),
    };
    const store = createStore();
    const before = store.getSnapshot();
    const actions = createActions(call, store, {
      nativeFiles,
      pickDirectory: async () => null,
      createWorkspace: async () => {
        throw new Error('not used');
      },
    });
    await actions.workspaceFileApplications('ada', 'grant-1');
    await actions.workspaceFileOpen('ada', 'grant-1', { application: 'finder' });
    expect(nativeFiles.open).toHaveBeenCalledWith(
      { path: '/host/project', relativePath: '', kind: 'directory' },
      { application: 'finder' },
    );
    expect(store.getSnapshot()).toEqual(before);
    call.mockResolvedValueOnce({
      ok: false,
      error: { code: 'invalid-grant', message: 'revoked', details: {} },
    });
    await expect(
      actions.workspaceFileOpen('ada', 'grant-1', { application: 'finder' }),
    ).rejects.toThrow('revoked');
    expect(nativeFiles.open).toHaveBeenCalledTimes(1);
    call.mockResolvedValueOnce({
      ok: true,
      value: { target: { path: '/host/file', relativePath: '', kind: 'file' } },
    });
    await expect(actions.workspaceFileTarget('ada', 'grant-1')).rejects.toThrow(
      'Invalid Workspace directory target',
    );
  });
});

describe('message attachment native action bridge', () => {
  it('requires the same owning message for legacy and canonical download URLs', () => {
    const owner = { channelId: 'group-owner', messageId: 'message-owner' };
    const legacy = {
      hash: `sha256:${'a'.repeat(64)}`,
      name: 'notes.txt',
      mime: 'text/plain',
      size: 4,
    };
    const canonical = {
      fileId: 'file:00000000-0000-4000-8000-000000000001',
      name: 'notes.txt',
      mime: 'text/plain',
      size: 4,
    };
    for (const ref of [legacy, canonical]) {
      const url = new URL(channelAttachmentUrl(ref, owner), 'http://local');
      expect(url.searchParams.get('channelId')).toBe(owner.channelId);
      expect(url.searchParams.get('messageId')).toBe(owner.messageId);
      expect(() => Reflect.apply(channelAttachmentUrl, undefined, [ref])).toThrow('ownership');
    }
  });

  it('resolves current ownership again before launch and refuses a removed message without mutating UI authority', async () => {
    const call = vi.fn<BridgeCall>(async (method, payload) => {
      expect(method).toBe('messageAttachmentTarget');
      expect(payload).toEqual({
        channelId: 'group-owner',
        messageId: 'message-owner',
        fileId: 'file-id',
      });
      return {
        ok: true,
        value: {
          target: { path: '/host/files/notes.txt', relativePath: 'notes.txt', kind: 'file' },
        },
      };
    });
    const nativeFiles = {
      applications: vi.fn(async () => ({ available: true, applications: [] })),
      open: vi.fn(async () => undefined),
    };
    const store = createStore();
    const before = store.getSnapshot();
    const actions = createActions(call, store, {
      nativeFiles,
      pickDirectory: async () => null,
      createWorkspace: async () => {
        throw new Error('not used');
      },
    });
    await actions.messageAttachmentApplications('group-owner', 'message-owner', 'file-id');
    await actions.messageAttachmentOpen('group-owner', 'message-owner', 'file-id', {
      application: 'editor',
    });
    expect(call).toHaveBeenCalledTimes(2);
    expect(nativeFiles.open).toHaveBeenCalledWith(
      { path: '/host/files/notes.txt', relativePath: 'notes.txt', kind: 'file' },
      { application: 'editor' },
    );
    call.mockResolvedValueOnce({
      ok: false,
      error: { code: 'not-found', message: 'message is unavailable', details: {} },
    });
    await expect(
      actions.messageAttachmentOpen('group-owner', 'message-owner', 'file-id', {
        action: 'reveal',
      }),
    ).rejects.toThrow('message is unavailable');
    expect(nativeFiles.open).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual(before);
  });
});

const EXTERNAL_SOURCE = {
  id: 'im-source',
  body: 'Please reply',
  platform: 'lark',
  accountName: 'Bot',
  conversationName: 'Team',
  at: '2026-10-01T00:00:00Z',
  grantId: 'grant',
  grantRevision: 2,
  event: {
    version: 1,
    channel: 'feishu',
    botId: 'app',
    fingerprint: 'a'.repeat(64),
    eventId: 'ev',
    messageId: 'om',
    at: '2026-10-01T00:00:00Z',
    mentionedAccount: true,
    mentions: [{ id: 'bot', key: '@bot' }],
    actor: { kind: 'user', id: 'human' },
    conversation: { kind: 'group', id: 'group' },
    reply: { messageId: 'om', conversationId: 'group', actorId: 'human', threadId: 'thread' },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  },
};

it('preserves native Slack source identities for the external message modal', async () => {
  const source = {
    ...EXTERNAL_SOURCE,
    platform: 'slack',
    event: {
      ...EXTERNAL_SOURCE.event,
      channel: 'slack',
      messageId: '1791132922.718839',
      conversation: { kind: 'group', id: 'C0C6FPES0G5' },
      reply: {
        messageId: '1791132922.718839',
        conversationId: 'C0C6FPES0G5',
        actorId: 'U064CFNDJGK',
        threadId: '1791132786.447879',
        rootId: '1791132786.447879',
      },
    },
  };
  const read = (value: unknown) =>
    readMessagingSource(
      bridgeCall({ messagingSource: () => ({ source: value }) }),
      'ada',
      'im-source',
    );
  await expect(read(source)).resolves.toEqual(source);
  await expect(
    read({ ...source, event: { ...source.event, channel: 'unqualified' } }),
  ).rejects.toMatchObject({ code: 'invalid-response' });
});

it('rejects incomplete external source responses before the source modal can render them', async () => {
  const read = (source: unknown) =>
    readMessagingSource(bridgeCall({ messagingSource: () => ({ source }) }), 'ada', 'im-source');
  await expect(read(EXTERNAL_SOURCE)).resolves.toEqual(EXTERNAL_SOURCE);
  for (const key of Object.keys(EXTERNAL_SOURCE)) {
    const incomplete: Record<string, unknown> = { ...EXTERNAL_SOURCE };
    delete incomplete[key];
    await expect(read(incomplete)).rejects.toMatchObject({ code: 'invalid-response' });
  }
  for (const event of [
    { ...EXTERNAL_SOURCE.event, actor: null },
    { ...EXTERNAL_SOURCE.event, conversation: {} },
    { ...EXTERNAL_SOURCE.event, reply: { threadId: 42 } },
    { ...EXTERNAL_SOURCE.event, mentions: [null] },
    { ...EXTERNAL_SOURCE.event, replay: null },
    { ...EXTERNAL_SOURCE.event, attachments: [null] },
    { ...EXTERNAL_SOURCE.event, attachments: [{ name: 'file.zip' }] },
    { ...EXTERNAL_SOURCE.event, attachments: 'file.zip' },
  ])
    await expect(read({ ...EXTERNAL_SOURCE, event })).rejects.toBeInstanceOf(BridgeCallError);
});

it('admits only a bounded safe Tool summary into Overview and rejects malformed or idle detail', async () => {
  const activity = {
    toolKind: 'execute',
    effect: 'executing',
    toolName: 'bash',
    startedAt: 1,
    activeToolCount: 1,
    sources: [{ role: 'orchestrator', count: 1 }],
  };
  const row = {
    slug: 'ada',
    displayName: 'Ada',
    paused: false,
    hasAction: true,
    state: 'working',
    sessions: [],
    activity: { ...activity, arguments: 'private', detailRefs: ['private locator'] },
  };
  const call = bridgeCall({ activityOverview: () => ({ actionCount: 1, bots: [row] }) });
  expect((await loadActivityOverview(call)).bots[0]?.activity).toEqual(activity);
  row.activity.toolName = 'unsafe\nname';
  await expect(loadActivityOverview(call)).rejects.toThrow('Invalid Overview activity');
  row.activity.toolName = 'bash';
  row.state = 'idle';
  await expect(loadActivityOverview(call)).rejects.toThrow('Invalid Overview activity');
});

it('reads retained WeChat context audits through the actual Client bridge before rendering', async () => {
  const read = (source: unknown) =>
    readMessagingSource(bridgeCall({ messagingSource: () => ({ source }) }), 'ada', 'im-source');
  const source = {
    ...EXTERNAL_SOURCE,
    platform: 'weixin',
    event: { ...EXTERNAL_SOURCE.event, channel: 'weixin' },
    quote: { kind: 'unavailable', reason: 'no-server-message-id' },
    contextReads: ['retained', 'retained-nearby'].map((scope) => ({
      at: EXTERNAL_SOURCE.at,
      sessionId: 'session',
      scope,
      outcome: 'read',
      sourceEventIds: ['original'],
      omitted: 0,
      incomplete: false,
      coverage: 'retained-local-sources',
    })),
    contextMessages: [
      {
        sourceEventId: 'original',
        messageId: '9007199254740993',
        senderId: 'owner',
        at: EXTERNAL_SOURCE.at,
        text: 'actual local original',
      },
    ],
  };
  await expect(read(source)).resolves.toEqual(source);
  const providerSource = {
    ...EXTERNAL_SOURCE,
    contextReads: [
      { ...source.contextReads[0], scope: 'group', coverage: 'provider-visible-human-text' },
    ],
  };
  await expect(read(providerSource)).resolves.toEqual(providerSource);
  for (const patch of [
    { scope: 'invented-history' },
    { coverage: 'remote-wechat-history' },
    { sourceEventIds: [42] },
  ])
    await expect(
      read({ ...source, contextReads: [{ ...source.contextReads[0], ...patch }] }),
    ).rejects.toMatchObject({ code: 'invalid-response' });
});
