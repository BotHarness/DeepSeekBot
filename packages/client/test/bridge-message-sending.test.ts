import { describe, expect, it, vi } from 'vitest';
import { BridgeCallError } from '../src/client/bridge.js';
import { onboardingFor } from '../src/client/onboarding.js';
import { BOT, GROUP, DM, setup } from './bridge-helpers.js';

describe('bridge actions', () => {
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

  it('sends Home attachments with the stable request ID and selects the canonical DM', async () => {
    const attachment = {
      hash: 'sha256:' + 'a'.repeat(64),
      name: 'note.txt',
      mime: 'text/plain',
      size: 4,
    };
    const send = vi.fn((payload: Record<string, unknown>) => ({
      message: {
        id: payload.messageId,
        body: payload.body,
        attachments: payload.attachments,
        author: { kind: 'human' },
        at: BOT.createdAt,
      },
    }));
    const { actions, clientStore } = setup({
      channelSend: send,
      gitStatus: () => ({ installed: true, autoInstall: false }),
    });
    await actions.load();
    await actions.openChannel(GROUP.id);
    await actions.sendHome(DM.id, 'Home request', 'human-stable-home', [attachment]);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: DM.id,
        body: 'Home request',
        messageId: 'human-stable-home',
        attachments: [attachment],
      }),
    );
    expect(clientStore.getSnapshot().conversation.channel?.id).toBe(DM.id);
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

  it('echoes a reply to a file with the same media hint the Host will return', async () => {
    const report = {
      fileId: 'file:00000000-0000-4000-8000-000000000002',
      name: 'Q3 report.pdf',
      mime: 'application/pdf',
      size: 2048,
    };
    const entries = [
      {
        id: 'm1',
        at: '2026-09-19T00:01:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Here   it\nis',
        attachments: [report],
      },
    ];
    const { clientStore, actions } = setup({
      channelTimeline: () => ({
        revision: 1,
        page: { entries, olderCursor: 'm1', newerCursor: 'm1', hasOlder: false, hasNewer: false },
      }),
      channelMessages: () => ({ revision: 1, messages: entries }),
      channelSend: () => new Promise(() => undefined),
    });
    await actions.load();
    await actions.openBot('ada');
    void actions.send('thanks', 'm1');
    expect(clientStore.getSnapshot().conversation.messages.at(-1)?.replyToPreview).toEqual({
      author: { kind: 'bot', slug: 'ada' },
      body: 'Here it is',
      media: { kind: 'file', name: 'Q3 report.pdf', count: 1 },
    });
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
      onboardingModel: () => ({ revision: 1 }),
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
});
