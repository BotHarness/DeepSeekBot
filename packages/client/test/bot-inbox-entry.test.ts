// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  const Tag = ({ children }: PropsWithChildren) => createElement('span', null, children);
  return {
    Button: ({
      children,
      onClick,
      disabled,
    }: PropsWithChildren<{ onClick?(): void; disabled?: boolean }>) =>
      createElement('button', { onClick, disabled }, children),
    Input: stub,
    Tag,
    Modal: ({ children, onClose }: PropsWithChildren<{ onClose(): void }>) =>
      createElement(
        'div',
        { role: 'dialog' },
        children,
        createElement('button', { onClick: onClose }, 'Close source'),
      ),
    StateDot: stub,
    IconChevronDownOutlineRegular: stub,
    IconCloseOutlineRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconSearchOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    Menu: ({ anchor }: { anchor: unknown }) => anchor,
    Tooltip: ({ children }: PropsWithChildren) => children,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { ExternalSource } from '../../core/src/messaging/inbound.js';
import type { BridgeActions } from '../src/client/actions.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { ChannelSidebarEntrySection } from '../src/client/channel-sidebar-view.js';
import { setInboxLayout } from '../src/client/inbox-view-prefs.js';
import { zhTranslate } from '../src/client/locale.js';
import { store, type BotAttentionItem } from '../src/client/store.js';

const item: BotAttentionItem = {
  id: 'source-1',
  botSlug: 'ada',
  reason: 'group-mention',
  state: 'pending',
  createdAt: '2026-09-26T00:00:00.000Z',
  sourceKind: 'human-message',
  sourceChannelId: 'group-team',
  sourceChannelName: 'Team',
  sourceMessageId: 'm1',
  sourceAvailable: true,
  authorKind: 'human',
  summary: 'Please check this',
};

describe('DM Bot Inbox sidebar entry', () => {
  beforeEach(() => setInboxLayout('source'));
  afterEach(() => setInboxLayout('time'));
  it.each(['group', 'dm'] as const)(
    'shows a readable %s source and opens the same message without consuming it',
    async (type) => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      const previous = store.getSnapshot().botInbox;
      const previousRoster = store.getSnapshot();
      store.setRoster(
        [
          {
            slug: 'ada',
            displayName: 'Ada Lovelace',
            roles: [],
            aggregateState: 'idle',
            workspaces: [],
            createdAt: item.createdAt,
          },
        ],
        [
          {
            id: 'group-team',
            createdAt: item.createdAt,
            updatedAt: item.createdAt,
            type,
            name: type === 'dm' ? 'ada' : 'Team',
            members: ['ada'],
            ...(type === 'dm' ? { botSlug: 'ada' } : {}),
          },
        ],
      );
      const sourceItem = { ...item, sourceChannelName: type === 'dm' ? 'ada' : 'Team' };
      const entry = createChannelSidebarBuiltins(zhTranslate).find(
        (candidate) => candidate.id === 'bot-inbox',
      );
      expect(entry).toBeDefined();
      store.setBotInbox({ status: 'ready', items: [], error: undefined });
      expect(entry?.visible?.(store.getSnapshot())).toBe(false);
      store.setBotInbox({
        status: 'ready',
        items: [
          sourceItem,
          { ...sourceItem, id: 'source-2', state: 'handled', sourceMessageId: 'm2' },
          { ...sourceItem, id: 'source-3', state: 'ignored', sourceMessageId: 'm3' },
        ],
        error: undefined,
      });
      expect(entry?.visible?.(store.getSnapshot())).toBe(true);
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      const openChannel = vi.fn(async () => undefined);
      const openAround = vi.fn(async () => undefined);
      try {
        await act(async () =>
          root.render(
            createElement(ChannelSidebarEntrySection, {
              entry: entry!,
              expanded: true,
              onToggle: () => undefined,
              entryProps: {
                scope: 'personabot',
                channelId: 'dm-ada',
                botSlug: 'ada',
                actions: { openChannel, openAround } as unknown as BridgeActions,
                t: zhTranslate,
              },
            }),
          ),
        );
        expect(container.querySelector('.bh-inbox-group-head')?.textContent).toContain(
          type === 'dm' ? 'Ada Lovelace' : 'Team',
        );
        expect(container.textContent).toContain('待处理');
        expect(container.textContent).toContain('已忽略');
        const button = [...container.querySelectorAll<HTMLButtonElement>('.bh-inbox-item')].find(
          (node) => node.textContent?.includes('Please check this'),
        );
        expect(button).toBeDefined();
        await act(async () => {
          button?.click();
          await Promise.resolve();
        });
        expect(openChannel).toHaveBeenCalledWith('group-team');
        expect(openAround).toHaveBeenCalledWith('group-team', 'm1');
        expect(store.getSnapshot().botInbox.items[0]?.state).toBe('pending');
      } finally {
        await act(async () => root.unmount());
        container.remove();
        store.setBotInbox(previous);
        store.setRoster(previousRoster.bots, previousRoster.channels);
      }
    },
  );

  it('reveals newly active or escalated attention in an existing collapsed source group', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const previous = store.getSnapshot().botInbox;
    const entry = createChannelSidebarBuiltins(zhTranslate).find(
      (candidate) => candidate.id === 'bot-inbox',
    )!;
    store.setBotInbox({
      status: 'ready',
      items: [{ ...item, state: 'handled' }],
      error: undefined,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const render = async (): Promise<void> => {
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
              actions: {} as BridgeActions,
              t: zhTranslate,
            },
          }),
        ),
      );
    };
    try {
      await render();
      const group = container.querySelector<HTMLDetailsElement>('.bh-inbox-group')!;
      expect(group.open).toBe(false);
      await act(async () =>
        store.setBotInbox({
          status: 'ready',
          items: [
            { ...item, state: 'handled' },
            { ...item, id: 'source-2', state: 'pending' },
          ],
        }),
      );
      await render();
      expect(group.open).toBe(true);
      await act(async () => {
        group.open = false;
        group.dispatchEvent(new Event('toggle', { bubbles: true }));
      });
      await render();
      expect(group.open).toBe(false);
      await act(async () =>
        store.setBotInbox({
          status: 'ready',
          items: [
            { ...item, state: 'handled' },
            { ...item, id: 'source-2', state: 'needs-repair' },
          ],
        }),
      );
      await render();
      expect(group.open).toBe(true);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.setBotInbox(previous);
    }
  });

  it('keeps an unavailable source readable without a broken action', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const previous = store.getSnapshot().botInbox;
    store.setBotInbox({
      status: 'ready',
      items: [{ ...item, sourceAvailable: false }],
      error: undefined,
    });
    const entry = createChannelSidebarBuiltins(zhTranslate).find(
      (candidate) => candidate.id === 'bot-inbox',
    )!;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
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
              actions: {} as BridgeActions,
              t: zhTranslate,
            },
          }),
        ),
      );
      expect(container.querySelector<HTMLButtonElement>('.bh-inbox-item')?.disabled).toBe(true);
      expect(container.textContent).toContain('来源不可打开');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.setBotInbox(previous);
    }
  });
  it('opens an Assignment report in its native DSH Session', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const previous = store.getSnapshot().botInbox;
    store.setBotInbox({
      status: 'ready',
      items: [
        {
          id: 'report-1',
          botSlug: 'ada',
          reason: 'assignment-report',
          state: 'handled',
          createdAt: '2026-09-26T00:00:00.000Z',
          sourceKind: 'assignment-report',
          assignmentSessionId: 'assignment-one',
          assignmentPurpose: 'Investigate the issue',
          assignmentReportState: 'waiting-human',
          sourceAvailable: true,
          authorKind: 'system',
          summary: 'Need a Human decision',
        },
      ],
      error: undefined,
    });
    const entry = createChannelSidebarBuiltins(zhTranslate).find(
      (candidate) => candidate.id === 'bot-inbox',
    )!;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const openSession = vi.fn();
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
              actions: { openSession } as unknown as BridgeActions,
              t: zhTranslate,
            },
          }),
        ),
      );
      expect(container.textContent).toContain('Investigate the issue');
      expect(container.textContent).toContain('等你处理');
      const button = container.querySelector<HTMLButtonElement>('.bh-inbox-item');
      expect(button?.disabled).toBe(false);
      await act(async () => {
        button?.click();
        await Promise.resolve();
      });
      expect(openSession).toHaveBeenCalledWith('assignment-one');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.setBotInbox(previous);
    }
  });
});

it('lists every source newest first by default with a compact author, time and state head', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = store.getSnapshot().botInbox;
  store.setBotInbox({
    status: 'ready',
    items: [
      { ...item, id: 'older', state: 'handled', summary: 'Older handled note' },
      {
        ...item,
        id: 'newer',
        createdAt: '2026-09-27T00:00:00.000Z',
        sourceChannelId: 'group-other',
        sourceChannelName: 'Other',
        summary: 'Newer pending note',
      },
    ],
    error: undefined,
  });
  const entry = createChannelSidebarBuiltins(zhTranslate).find((e) => e.id === 'bot-inbox')!;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
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
            actions: {} as BridgeActions,
            t: zhTranslate,
          },
        }),
      ),
    );
    expect(container.querySelector('.bh-inbox-group:not(.bh-inbox-section)')).toBeNull();
    const rows = [...container.querySelectorAll('.bh-card-row')];
    expect(rows.map((row) => row.querySelector('.bh-card-summary')?.textContent)).toEqual([
      'Newer pending note',
      'Older handled note',
    ]);
    expect(rows[0]?.querySelector('.bh-inbox-item-author')?.textContent).toBe('你 · Other');
    expect(rows[0]?.querySelector('.bh-card-badge')?.textContent).toBe('待处理');
    expect(rows[1]?.querySelector('.bh-card-badge')?.textContent).toBe('已处理');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.setBotInbox(previous);
  }
});

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
    act(async () => container.querySelector<HTMLButtonElement>('.bh-inbox-item')!.click());
  const close = async () =>
    act(async () =>
      [...container.querySelectorAll('button')]
        .find((b) => b.textContent === 'Close source')!
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
    expect(container.textContent).toContain('CURRENT SOURCE');
    const messages = [...container.querySelectorAll('.bh-external-message')];
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
    expect(container.textContent).toContain('上下文不完整');
    expect(container.querySelector('.bh-external-audit')?.hasAttribute('open')).toBe(false);
    expect(container.textContent).toContain('ONLY RETURNED CONTEXT');
    expect(container.textContent).toContain('context-one');
    expect(container.textContent).toContain('Alex (external-human)');
    expect(container.textContent).toContain('消息 remote-one [事件 context-one]');
    expect(container.textContent).toContain('@_user_1 → QA Bot (bot-one)');
    expect(container.textContent).toContain('消息 om [事件 source-1]');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await close();
    await open();
    expect(container.textContent).not.toContain('CURRENT SOURCE');
    await close();
    await open();
    await act(async () => requests[3]!.resolve({ ...source, body: 'NEWEST SOURCE' }));
    await act(async () => requests[2]!.resolve({ ...source, body: 'STALE SOURCE' }));
    expect(container.textContent).toContain('NEWEST SOURCE');
    expect(container.textContent).not.toContain('STALE SOURCE');
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
      [...container.querySelectorAll<HTMLButtonElement>('button')]
        .find((b) => b.textContent === label)!
        .click();
    });
  const open = async () =>
    act(async () => container.querySelector<HTMLButtonElement>('.bh-inbox-item')!.click());
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
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector('.bh-external-message-text')?.textContent).not.toContain(
      '[Image]',
    );
    expect(create).not.toHaveBeenCalled();
    await click('重新加载图片');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('.bh-external-message-text img')?.getAttribute('src')).toBe(
      'blob:checked-preview',
    );
    expect(container.querySelector('.bh-external-message-text')?.textContent).not.toContain(
      '[Image]',
    );
    expect(container.querySelector('.bh-external-source-file img')).toBeNull();
    expect(fetchImage.mock.calls[1]?.[0]).toBe(
      '/api/botharness/attachment?slug=ada&sourceEventId=source-1&attachmentId=image-one',
    );
    expect(fetchImage.mock.calls[1]?.[1].credentials).toBe('same-origin');
    await click('Close source');
    expect(revoke).toHaveBeenCalledWith('blob:checked-preview');
    fetchImage.mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(['<svg/>'], { type: 'image/svg+xml' }),
    });
    await open();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
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
    expect(container.querySelector('.bh-external-message-text img')).not.toBeNull();
    expect(container.querySelector('.bh-external-message-text')?.textContent).toContain(
      'Please inspect this layout',
    );
    await click('Close source');
    source.body = '[Image]';
    source.event.attachments = [];
    const imageCalls = fetchImage.mock.calls.length;
    await open();
    expect(container.querySelector('.bh-external-message-text')?.textContent).toBe('[Image]');
    expect(container.querySelector('.bh-external-message-text img')).toBeNull();
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
      [...container.querySelectorAll<HTMLButtonElement>('button')]
        .find((b) => b.textContent === label)!
        .click();
    });
  const open = async () =>
    act(async () => container.querySelector<HTMLButtonElement>('.bh-inbox-item')!.click());
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
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector('.bh-external-message-text')?.textContent).not.toContain(
      '[Video]',
    );
    expect(create).not.toHaveBeenCalled();
    await click('重试播放');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('.bh-external-message-text video')?.getAttribute('src')).toBe(
      'blob:checked-preview',
    );
    expect(container.querySelector('.bh-external-message-text')?.textContent).not.toContain(
      '[Video]',
    );
    expect(container.querySelector('.bh-external-source-file video')).toBeNull();
    const player = container.querySelector('video')!;
    expect(player.controls).toBe(true);
    expect(player.autoplay).toBe(false);
    expect(fetchVideo.mock.calls[1]?.[0]).toBe(
      '/api/botharness/attachment?slug=ada&sourceEventId=source-1&attachmentId=video-one',
    );
    expect(fetchVideo.mock.calls[1]?.[1].credentials).toBe('same-origin');
    await click('Close source');
    expect(revoke).toHaveBeenCalledWith('blob:checked-preview');
    fetchVideo.mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(['not-mp4'], { type: 'text/html' }),
    });
    await open();
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
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
    expect(container.querySelector('.bh-external-message-text video')).not.toBeNull();
    expect(container.querySelector('.bh-external-message-text')?.textContent).toContain(
      'Please inspect this layout',
    );
    await click('Close source');
    source.body = '[Video]';
    source.event.attachments = [];
    const videoCalls = fetchVideo.mock.calls.length;
    await open();
    expect(container.querySelector('.bh-external-message-text')?.textContent).toBe('[Video]');
    expect(container.querySelector('.bh-external-message-text video')).toBeNull();
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

it('puts open items first, snoozed by return time next, and folds done items with their notes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = store.getSnapshot().botInbox;
  store.setBotInbox({
    status: 'ready',
    items: [
      {
        ...item,
        id: 'done',
        state: 'handled',
        createdAt: '2026-09-28T00:00:00.000Z',
        summary: 'Done item',
        resolutionNote: 'Shipped the fix',
      },
      {
        ...item,
        id: 'later',
        state: 'snoozed',
        summary: 'Later item',
        snoozedUntil: '2026-10-02T00:00:00.000Z',
      },
      {
        ...item,
        id: 'sooner',
        state: 'snoozed',
        summary: 'Sooner item',
        snoozedUntil: '2026-10-01T00:00:00.000Z',
        snoozeNote: 'After the vendor replies',
      },
      { ...item, id: 'open', state: 'open', summary: 'Open item' },
    ],
    error: undefined,
  });
  const entries = createChannelSidebarBuiltins(zhTranslate);
  const entry = entries.find((e) => e.id === 'bot-inbox')!;
  const Badge = entry.badge!;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const entryProps = {
    scope: 'personabot' as const,
    channelId: 'dm-ada',
    botSlug: 'ada',
    actions: {} as BridgeActions,
    t: zhTranslate,
  };
  try {
    await act(async () =>
      root.render(
        createElement(
          'div',
          null,
          createElement('span', { className: 'badge' }, createElement(Badge, entryProps)),
          createElement(ChannelSidebarEntrySection, {
            entry,
            expanded: true,
            onToggle: () => undefined,
            entryProps,
          }),
        ),
      ),
    );
    expect(container.querySelector('.badge')?.textContent).toBe('1');
    const rows = [...container.querySelectorAll('.bh-card-row')];
    expect(rows.map((row) => row.querySelector('.bh-card-summary')?.textContent)).toEqual([
      'Open item',
      'Sooner item',
      'Later item',
      'Done item',
    ]);
    const sections = [...container.querySelectorAll<HTMLDetailsElement>('.bh-inbox-section')];
    expect(sections.map((section) => [section.dataset['section'], section.open])).toEqual([
      ['snoozed', true],
      ['done', false],
    ]);
    expect(rows[1]?.textContent).toContain('After the vendor replies');
    expect(rows[1]?.querySelector('.bh-inbox-item-return')?.textContent).toContain('回来');
    expect(rows[3]?.textContent).toContain('Shipped the fix');

    store.setBotInbox({
      status: 'ready',
      items: [{ ...item, id: 'only-snoozed', state: 'snoozed' }],
      error: undefined,
    });
    await act(async () => undefined);
    expect(container.querySelector('.badge')?.textContent).toBe('');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.setBotInbox(previous);
  }
});
