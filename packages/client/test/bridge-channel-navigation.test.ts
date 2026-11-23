import { describe, expect, it, vi } from 'vitest';
import { BridgeCallError } from '../src/client/bridge.js';
import { BOT, GROUP, DM, setup } from './bridge-helpers.js';

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

  it('reopens the same Bot Inbox on each explicit navigation request', async () => {
    const { clientStore, actions } = setup();
    await actions.load();
    await actions.openBot('ada', 'inbox');
    expect(clientStore.getSnapshot().selection).toEqual({
      kind: 'bot',
      slug: 'ada',
      inboxRequest: 1,
    });
    await actions.openBot('ada', 'inbox');
    expect(clientStore.getSnapshot().selection).toEqual({
      kind: 'bot',
      slug: 'ada',
      inboxRequest: 2,
    });
    expect(clientStore.getSnapshot().conversation.status).toBe('ready');
    await actions.openBot('ada');
    expect(clientStore.getSnapshot().selection).toEqual({ kind: 'bot', slug: 'ada' });
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

  it.each([
    ['group-channel', true],
    ['group-channel', false],
    ['dm-channel', true],
    ['dm-channel', false],
    ['bot', true],
    ['bot', false],
  ] as const)(
    'does not fetch an abandoned %s timeline after a late read position (anchor=%s)',
    async (opener, hasAnchor) => {
      const target = opener === 'group-channel' ? GROUP.id : DM.id;
      const destination = target === GROUP.id ? DM.id : GROUP.id;
      let releaseRead: ((value: Record<string, unknown>) => void) | undefined;
      const pendingRead = new Promise<Record<string, unknown>>((resolve) => {
        releaseRead = resolve;
      });
      const timelineRequests: Array<Record<string, unknown>> = [];
      const readPosition = vi.fn((payload: Record<string, unknown>) =>
        payload['channelId'] === target ? pendingRead : {},
      );
      const { clientStore, actions } = setup({
        channelReadPosition: readPosition,
        channelTimeline: (payload) => {
          timelineRequests.push(payload);
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
      });
      await actions.load();
      const abandoned = opener === 'bot' ? actions.openBot('ada') : actions.openChannel(target);
      await vi.waitFor(() => expect(readPosition).toHaveBeenCalledWith({ channelId: target }));
      await actions.openChannel(destination);
      const visible = clientStore.getSnapshot().conversation;
      expect(visible.status).toBe('ready');
      expect(releaseRead).toBeDefined();
      releaseRead?.(hasAnchor ? { position: { messageId: 'old-read' } } : {});
      await abandoned;
      expect(timelineRequests.map((request) => request['channelId'])).toEqual([destination]);
      expect(clientStore.getSnapshot().conversation).toBe(visible);
    },
  );

  it('does not fetch latest after an abandoned opening anchor expires', async () => {
    let rejectAnchor: ((reason: unknown) => void) | undefined;
    const pendingAnchor = new Promise<unknown>((_resolve, reject) => {
      rejectAnchor = reject;
    });
    const requests: Array<Record<string, unknown>> = [];
    const { actions, clientStore } = setup({
      channelReadPosition: ({ channelId }) =>
        channelId === GROUP.id ? { position: { messageId: 'expired' } } : {},
      channelTimeline: (payload) => {
        requests.push(payload);
        return payload['channelId'] === GROUP.id && payload['direction'] === 'around'
          ? pendingAnchor
          : {
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
    });
    await actions.load();
    const abandoned = actions.openChannel(GROUP.id);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await actions.openChannel(DM.id);
    const visible = clientStore.getSnapshot().conversation;
    expect(rejectAnchor).toBeDefined();
    rejectAnchor?.(new BridgeCallError('invalid-input', 'expired anchor'));
    await abandoned;
    expect(requests).toEqual([
      { channelId: GROUP.id, direction: 'around', around: 'expired' },
      { channelId: DM.id },
    ]);
    expect(clientStore.getSnapshot().conversation).toBe(visible);
  });

  it('distinguishes the first opening from a later opening of the same Channel in an ABA switch', async () => {
    let releaseRead: ((value: Record<string, unknown>) => void) | undefined;
    const pendingRead = new Promise<Record<string, unknown>>((resolve) => {
      releaseRead = resolve;
    });
    let targetReads = 0;
    const requests: Array<Record<string, unknown>> = [];
    const { clientStore, actions } = setup({
      channelReadPosition: ({ channelId }) =>
        channelId === GROUP.id && ++targetReads === 1 ? pendingRead : {},
      channelTimeline: (payload) => {
        requests.push(payload);
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
    });
    await actions.load();
    const first = actions.openChannel(GROUP.id);
    await actions.openChannel(DM.id);
    await actions.openChannel(GROUP.id);
    const visible = clientStore.getSnapshot().conversation;
    expect(releaseRead).toBeDefined();
    releaseRead?.({ position: { messageId: 'old-read' } });
    await first;
    expect(requests.map((request) => request['channelId'])).toEqual([DM.id, GROUP.id]);
    expect(clientStore.getSnapshot().conversation).toBe(visible);
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
});
