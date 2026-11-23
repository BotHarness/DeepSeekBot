// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { ExternalSource } from '../../core/src/messaging/inbound.js';
import type { BridgeActions } from '../src/client/actions.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { ChannelSidebarEntrySection } from '../src/client/channel-sidebar-view.js';
import { zhTranslate } from '../src/client/locale.js';
import { store } from '../src/client/store.js';
import { item } from './support/bot-inbox-entry.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./support/bot-inbox-entry.js')).mockInboxPrimitives(),
);

it('clears previous source content and ignores older requests after reopening', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = store.getSnapshot().botInbox;
  store.setBotInbox({
    status: 'ready',
    items: [
      {
        ...item,
        sourceKind: 'bridge-message',
        externalOrigin: {
          platform: 'lark',
          accountName: 'Bot',
          conversationName: 'Team',
          conversationId: 'group',
          senderId: 'human',
        },
      },
    ],
  });
  const entry = createChannelSidebarBuiltins(zhTranslate).find((e) => e.id === 'bot-inbox')!;
  const requests: { resolve(source: ExternalSource): void; reject(error: Error): void }[] = [];
  const messagingSource = vi.fn(
    () => new Promise<ExternalSource>((resolve, reject) => requests.push({ resolve, reject })),
  );
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const source: ExternalSource = {
    id: 'source-1',
    body: 'CURRENT SOURCE',
    platform: 'lark',
    accountName: 'Bot',
    conversationName: 'Team',
    at: '2026-10-01T00:00:00Z',
    grantId: 'grant',
    grantRevision: 1,
    contextReads: [
      {
        at: '2026-10-01T00:00:00Z',
        sessionId: 'session',
        scope: 'thread',
        outcome: 'read',
        sourceEventIds: ['context-one'],
        omitted: 2,
        incomplete: true,
      },
    ],
    contextMessages: [
      {
        sourceEventId: 'context-one',
        messageId: 'remote-one',
        senderId: 'external-human',
        senderName: 'Alex',
        mentions: [{ id: 'bot-one', key: '@_user_1', name: 'QA Bot' }],
        at: '2026-10-01T00:00:00Z',
        text: 'ONLY RETURNED CONTEXT @_user_1 and @_user_10 <script>plain</script>',
      },
    ],
    event: {
      version: 1,
      channel: 'feishu',
      botId: 'app',
      fingerprint: 'a'.repeat(64),
      eventId: 'ev',
      messageId: 'om',
      actor: { kind: 'user', id: 'human' },
      conversation: { kind: 'group', id: 'group' },
      mentions: [],
      mentionedAccount: true,
      at: '2026-10-01T00:00:00Z',
      reply: { messageId: 'om', conversationId: 'group', actorId: 'human' },
      replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
    },
  };
  const open = async () =>
    act(async () => document.body.querySelector<HTMLButtonElement>('.bh-inbox-item')!.click());
  const close = async () =>
    act(async () =>
      [...document.body.querySelectorAll('button')]
        .find((b) => b.getAttribute('aria-label') === zhTranslate('common.close'))!
        .click(),
    );
  try {
    await act(async () =>
      root.render(
        createElement(ChannelSidebarEntrySection, {
          entry,
          expanded: true,
          onToggle: () => undefined,
          entryProps: {
            scope: 'personabot',
            channelId: 'dm-ada',
            botSlug: 'ada',
            actions: { messagingSource } as unknown as BridgeActions,
            t: zhTranslate,
          },
        }),
      ),
    );
    await open();
    await close();
    await open();
    await act(async () => requests[1]!.resolve(source));
    await act(async () => requests[0]!.reject(new Error('Old request failed')));
    expect(document.body.textContent).toContain('CURRENT SOURCE');
    const messages = [...document.body.querySelectorAll('.bh-external-message')];
    const context = messages[1]!;
    expect(context.querySelector('strong')?.textContent).toBe('Alex');
    expect(context.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-01T00:00:00Z');
    expect(context.querySelector('.bh-external-message-text')?.textContent).toBe(
      'ONLY RETURNED CONTEXT @QA Bot and @_user_10 <script>plain</script>',
    );
    expect(context.querySelector('script')).toBeNull();
    const details = context.querySelector('details')!;
    expect(details.open).toBe(false);
    details.open = true;
    expect(details.textContent).toContain('@_user_1 and @_user_10');
    expect(document.body.textContent).toContain('上下文不完整');
    expect(document.body.querySelector('.bh-external-audit')?.hasAttribute('open')).toBe(false);
    expect(document.body.textContent).toContain('ONLY RETURNED CONTEXT');
    expect(document.body.textContent).toContain('context-one');
    expect(document.body.textContent).toContain('Alex (external-human)');
    expect(document.body.textContent).toContain('消息 remote-one [事件 context-one]');
    expect(document.body.textContent).toContain('@_user_1 → QA Bot (bot-one)');
    expect(document.body.textContent).toContain('消息 om [事件 source-1]');
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
    await close();
    await open();
    expect(document.body.textContent).not.toContain('CURRENT SOURCE');
    await close();
    await open();
    await act(async () => requests[3]!.resolve({ ...source, body: 'NEWEST SOURCE' }));
    await act(async () => requests[2]!.resolve({ ...source, body: 'STALE SOURCE' }));
    expect(document.body.textContent).toContain('NEWEST SOURCE');
    expect(document.body.textContent).not.toContain('STALE SOURCE');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.setBotInbox(previous);
  }
});

it('loads checked images into their message bubble on open, retries refusals and preserves captions', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = store.getSnapshot().botInbox;
  store.setBotInbox({
    status: 'ready',
    items: [
      {
        ...item,
        sourceKind: 'bridge-message',
        externalOrigin: {
          platform: 'weixin',
          accountName: 'WeChat Bot',
          conversationName: 'Owner',
          conversationId: 'owner',
          senderId: 'owner',
        },
      },
    ],
  });
  const source: ExternalSource = {
    id: item.id,
    body: '[Image]',
    platform: 'weixin',
    accountName: 'WeChat Bot',
    conversationName: 'Owner',
    at: item.createdAt,
    grantId: 'grant',
    grantRevision: 1,
    event: {
      version: 1,
      channel: 'weixin',
      botId: 'bot',
      fingerprint: 'a'.repeat(64),
      eventId: 'ev',
      messageId: 'remote',
      actor: { kind: 'user', id: 'owner' },
      conversation: { kind: 'dm', id: 'owner' },
      mentions: [],
      mentionedAccount: false,
      at: item.createdAt,
      reply: { messageId: 'remote', conversationId: 'owner', actorId: 'owner' },
      replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
      attachments: [
        {
          id: 'image-one',
          messageId: 'remote',
          name: 'image',
          resourceKey: 'safe-key',
          mediaType: 'image/unknown',
        },
      ],
    },
  };
  const entry = createChannelSidebarBuiltins(zhTranslate).find((e) => e.id === 'bot-inbox')!;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const fetchImage = vi
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['image-bytes'], { type: 'image/png' }),
    });
  vi.stubGlobal('fetch', fetchImage);
  const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  const create = vi.fn(() => 'blob:checked-preview');
  const revoke = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
  const click = async (label: string) =>
    act(async () => {
      [...document.body.querySelectorAll<HTMLButtonElement>('button')]
        .find(
          (b) =>
            b.textContent === label ||
            b.getAttribute('aria-label') ===
              (label === 'Close source' ? zhTranslate('common.close') : label),
        )!
        .click();
    });
  const open = async () =>
    act(async () => document.body.querySelector<HTMLButtonElement>('.bh-inbox-item')!.click());
  try {
    await act(async () =>
      root.render(
        createElement(ChannelSidebarEntrySection, {
          entry,
          expanded: true,
          onToggle: () => undefined,
          entryProps: {
            scope: 'personabot',
            channelId: 'dm-ada',
            botSlug: 'ada',
            actions: { messagingSource: async () => source } as unknown as BridgeActions,
            t: zhTranslate,
          },
        }),
      ),
    );
    expect(fetchImage).not.toHaveBeenCalled();
    await open();
    expect(document.body.querySelector('[role="alert"]')).not.toBeNull();
    expect(document.body.querySelector('.bh-external-message-text')?.textContent).not.toContain(
      '[Image]',
    );
    expect(create).not.toHaveBeenCalled();
    await click('重新加载图片');
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
    expect(document.body.querySelector('.bh-external-message-text img')?.getAttribute('src')).toBe(
      'blob:checked-preview',
    );
    expect(document.body.querySelector('.bh-external-message-text')?.textContent).not.toContain(
      '[Image]',
    );
    expect(document.body.querySelector('.bh-external-source-file img')).toBeNull();
    expect(fetchImage.mock.calls[1]?.[0]).toBe(
      './api/botharness/attachment?slug=ada&sourceEventId=source-1&attachmentId=image-one',
    );
    expect(fetchImage.mock.calls[1]?.[1].credentials).toBe('same-origin');
    await click('Close source');
    expect(revoke).toHaveBeenCalledWith('blob:checked-preview');
    fetchImage.mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(['<svg/>'], { type: 'image/svg+xml' }),
    });
    await open();
    expect(document.body.querySelector('img')).toBeNull();
    expect(document.body.querySelector('[role="alert"]')).not.toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
    fetchImage.mockImplementationOnce(
      (_url, request) =>
        new Promise((_resolve, reject) =>
          request.signal.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    );
    await click('重新加载图片');
    const signal: AbortSignal = fetchImage.mock.calls.at(-1)?.[1].signal;
    expect(signal.aborted).toBe(false);
    await click('Close source');
    expect(signal.aborted).toBe(true);
    source.body = 'Please inspect this layout';
    await open();
    expect(document.body.querySelector('.bh-external-message-text img')).not.toBeNull();
    expect(document.body.querySelector('.bh-external-message-text')?.textContent).toContain(
      'Please inspect this layout',
    );
    await click('Close source');
    source.body = '[Image]';
    source.event.attachments = [];
    const imageCalls = fetchImage.mock.calls.length;
    await open();
    expect(document.body.querySelector('.bh-external-message-text')?.textContent).toBe('[Image]');
    expect(document.body.querySelector('.bh-external-message-text img')).toBeNull();
    expect(fetchImage).toHaveBeenCalledTimes(imageCalls);
    await act(async () => root.unmount());
    expect(revoke).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.setBotInbox(previous);
    vi.unstubAllGlobals();
    if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
    else Reflect.deleteProperty(URL, 'createObjectURL');
    if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
    else Reflect.deleteProperty(URL, 'revokeObjectURL');
  }
});

it('opening a Lark video source does not acquire the video or cover before an explicit original download', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = store.getSnapshot().botInbox;
  const videoId = 'a'.repeat(64);
  const coverId = 'b'.repeat(64);
  store.setBotInbox({
    status: 'ready',
    items: [
      {
        ...item,
        sourceKind: 'bridge-message',
        externalOrigin: {
          platform: 'feishu',
          accountName: 'Lark QA',
          conversationName: 'Group',
          conversationId: 'group',
          senderId: 'human',
        },
      },
    ],
  });
  const source: ExternalSource = {
    id: item.id,
    body: 'Please inspect the quoted video',
    platform: 'feishu',
    accountName: 'Lark QA',
    conversationName: 'Group',
    at: item.createdAt,
    grantId: 'grant',
    grantRevision: 1,
    event: {
      version: 1,
      channel: 'feishu',
      botId: 'bot',
      fingerprint: 'c'.repeat(64),
      eventId: 'event',
      messageId: 'mention',
      actor: { kind: 'user', id: 'human' },
      conversation: { kind: 'group', id: 'group' },
      mentions: [],
      mentionedAccount: true,
      at: item.createdAt,
      reply: {
        messageId: 'mention',
        conversationId: 'group',
        actorId: 'human',
        parentId: 'parent-video',
      },
      video: { itemId: videoId, durationMs: 6000, posterAttachmentId: coverId },
      replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
      attachments: [
        {
          id: videoId,
          messageId: 'parent-video',
          name: 'clip.mp4',
          resourceKey: 'native-video',
          mediaType: 'video/unknown',
        },
        {
          id: coverId,
          messageId: 'parent-video',
          name: 'video-cover',
          resourceKey: 'native-cover',
          mediaType: 'image/unknown',
        },
      ],
    },
  };
  const fetchMedia = vi.fn(async (_url: string, _request?: RequestInit) => ({
    ok: true,
    blob: async () => new Blob(['original'], { type: 'video/mp4' }),
  }));
  vi.stubGlobal('fetch', fetchMedia);
  const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: () => 'blob:original',
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => {} });
  const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    const entry = createChannelSidebarBuiltins(zhTranslate).find(
      (entry) => entry.id === 'bot-inbox',
    )!;
    await act(async () =>
      root.render(
        createElement(ChannelSidebarEntrySection, {
          entry,
          expanded: true,
          onToggle: () => {},
          entryProps: {
            scope: 'personabot',
            channelId: 'dm-ada',
            botSlug: 'ada',
            actions: { messagingSource: async () => source } as unknown as BridgeActions,
            t: zhTranslate,
          },
        }),
      ),
    );
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>('.bh-inbox-item')!.click(),
    );
    expect(document.body.textContent).toContain('Please inspect the quoted video');
    expect(fetchMedia).not.toHaveBeenCalled();
    expect(document.body.querySelector('video')).toBeNull();
    expect(document.body.querySelector('.bh-external-message-text img')).toBeNull();
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>('.bh-external-source-file button')!.click(),
    );
    expect(fetchMedia).toHaveBeenCalledTimes(1);
    expect(fetchMedia.mock.calls[0]?.[0]).toBe(
      './api/botharness/attachment?slug=ada&sourceEventId=source-1&attachmentId=' + videoId,
    );
    expect(clicked).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.setBotInbox(previous);
    clicked.mockRestore();
    vi.unstubAllGlobals();
    if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
    else Reflect.deleteProperty(URL, 'createObjectURL');
    if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
    else Reflect.deleteProperty(URL, 'revokeObjectURL');
  }
});

it('loads checked video into its bubble without autoplay, retries refusals and preserves captions', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = store.getSnapshot().botInbox;
  store.setBotInbox({
    status: 'ready',
    items: [
      {
        ...item,
        sourceKind: 'bridge-message',
        externalOrigin: {
          platform: 'weixin',
          accountName: 'WeChat Bot',
          conversationName: 'Owner',
          conversationId: 'owner',
          senderId: 'owner',
        },
      },
    ],
  });
  const source: ExternalSource = {
    id: item.id,
    body: '[Video]',
    platform: 'weixin',
    accountName: 'WeChat Bot',
    conversationName: 'Owner',
    at: item.createdAt,
    grantId: 'grant',
    grantRevision: 1,
    event: {
      version: 1,
      channel: 'weixin',
      botId: 'bot',
      fingerprint: 'a'.repeat(64),
      eventId: 'ev',
      messageId: 'remote',
      actor: { kind: 'user', id: 'owner' },
      conversation: { kind: 'dm', id: 'owner' },
      mentions: [],
      mentionedAccount: false,
      at: item.createdAt,
      reply: { messageId: 'remote', conversationId: 'owner', actorId: 'owner' },
      video: { itemId: 'native-video', reportedSizeBytes: 16 },
      replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
      attachments: [
        {
          id: 'video-one',
          messageId: 'remote',
          name: 'video',
          resourceKey: 'safe-key',
          mediaType: 'video/mp4',
        },
      ],
    },
  };
  const entry = createChannelSidebarBuiltins(zhTranslate).find((e) => e.id === 'bot-inbox')!;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const fetchVideo = vi
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['video-bytes'], { type: 'video/mp4' }),
    });
  vi.stubGlobal('fetch', fetchVideo);
  const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  const create = vi.fn(() => 'blob:checked-preview');
  const revoke = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
  const click = async (label: string) =>
    act(async () => {
      [...document.body.querySelectorAll<HTMLButtonElement>('button')]
        .find(
          (b) =>
            b.textContent === label ||
            b.getAttribute('aria-label') ===
              (label === 'Close source' ? zhTranslate('common.close') : label),
        )!
        .click();
    });
  const open = async () =>
    act(async () => document.body.querySelector<HTMLButtonElement>('.bh-inbox-item')!.click());
  try {
    await act(async () =>
      root.render(
        createElement(ChannelSidebarEntrySection, {
          entry,
          expanded: true,
          onToggle: () => undefined,
          entryProps: {
            scope: 'personabot',
            channelId: 'dm-ada',
            botSlug: 'ada',
            actions: { messagingSource: async () => source } as unknown as BridgeActions,
            t: zhTranslate,
          },
        }),
      ),
    );
    expect(fetchVideo).not.toHaveBeenCalled();
    await open();
    expect(document.body.querySelector('[role="alert"]')).not.toBeNull();
    expect(document.body.querySelector('.bh-external-message-text')?.textContent).not.toContain(
      '[Video]',
    );
    expect(create).not.toHaveBeenCalled();
    await click('重试播放');
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
    expect(
      document.body.querySelector('.bh-external-message-text video')?.getAttribute('src'),
    ).toBe('blob:checked-preview');
    expect(document.body.querySelector('.bh-external-message-text')?.textContent).not.toContain(
      '[Video]',
    );
    expect(document.body.querySelector('.bh-external-source-file video')).toBeNull();
    const player = document.body.querySelector('video')!;
    expect(player.controls).toBe(true);
    expect(player.autoplay).toBe(false);
    expect(fetchVideo.mock.calls[1]?.[0]).toBe(
      './api/botharness/attachment?slug=ada&sourceEventId=source-1&attachmentId=video-one',
    );
    expect(fetchVideo.mock.calls[1]?.[1].credentials).toBe('same-origin');
    await click('Close source');
    expect(revoke).toHaveBeenCalledWith('blob:checked-preview');
    fetchVideo.mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(['not-mp4'], { type: 'text/html' }),
    });
    await open();
    expect(document.body.querySelector('video')).toBeNull();
    expect(document.body.querySelector('[role="alert"]')).not.toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
    fetchVideo.mockImplementationOnce(
      (_url, request) =>
        new Promise((_resolve, reject) =>
          request.signal.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    );
    await click('重试播放');
    const signal: AbortSignal = fetchVideo.mock.calls.at(-1)?.[1].signal;
    expect(signal.aborted).toBe(false);
    await click('Close source');
    expect(signal.aborted).toBe(true);
    source.body = 'Please inspect this layout';
    await open();
    expect(document.body.querySelector('.bh-external-message-text video')).not.toBeNull();
    expect(document.body.querySelector('.bh-external-message-text')?.textContent).toContain(
      'Please inspect this layout',
    );
    await click('Close source');
    source.body = '[Video]';
    source.event.attachments = [];
    const videoCalls = fetchVideo.mock.calls.length;
    await open();
    expect(document.body.querySelector('.bh-external-message-text')?.textContent).toBe('[Video]');
    expect(document.body.querySelector('.bh-external-message-text video')).toBeNull();
    expect(fetchVideo).toHaveBeenCalledTimes(videoCalls);
    await act(async () => root.unmount());
    expect(revoke).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.setBotInbox(previous);
    vi.unstubAllGlobals();
    if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
    else Reflect.deleteProperty(URL, 'createObjectURL');
    if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
    else Reflect.deleteProperty(URL, 'revokeObjectURL');
  }
});
