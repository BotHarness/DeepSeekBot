// @vitest-environment jsdom
import { type ChannelMessage } from '../src/client/store.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeActions } from '../src/client/actions.js';
import { BotModePrefs } from '../src/client/bot-mode-prefs.js';
import { BotMain, committedMessageIds, resolvedGrantRequestIds } from '../src/client/bot-main.js';
import { zhTranslate } from '../src/client/locale.js';
import { store } from '../src/client/store.js';
import { inertSubmissionActions } from './inert-submissions.js';
import * as messageAuthorCards from '../src/client/message-author-card.js';
import { sidebarRegistry } from './bot-main-helpers.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const stub = () => null;

  return {
    ...(await import('./primitive-mocks.js')).shellPrimitives(),

    IconCloseFill14: stub,

    FileTypeIcon: stub,

    fileSizeText: (size: number) => `${size} B`,
    ImageLightbox: stub,

    MarkdownText: stub,

    StateDot: stub,

    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

it('keeps settled message groups mounted without rerendering their author cards during drafts', async () => {
  const previous = store.getSnapshot();
  const bot = {
    slug: 'stream-isolation',
    displayName: 'Stream isolation',
    roles: [],
    aggregateState: 'idle',
    workspaces: [],
    createdAt: '2026-10-24T00:00:00.000Z',
  };
  const channel = {
    id: 'group-stream-isolation',
    type: 'group' as const,
    name: 'Stream isolation',
    members: [bot.slug],
    createdAt: bot.createdAt,
    updatedAt: bot.createdAt,
  };
  const committed: ChannelMessage = {
    id: 'settled-human',
    at: bot.createdAt,
    author: { kind: 'human' },
    body: 'History stays available',
  };
  const actions = {
    profileActivity: async () => ({
      slug: bot.slug,
      modelUsageStatus: 'ready',
      modelUsageRows: [],
    }),
    modelPlanState: async () => ({}),
    modelCatalog: async () => ({ models: [] }),
    listWorkspaceGrants: async () => [],
    botSourcePolicies: async () => [],
    skillCatalog: async () => [],
    allBotPreview: async () => ({ recipients: [], excluded: [] }),
    listWorkspaceOptions: async () => [],
    markRead: async () => undefined,
    ...inertSubmissionActions,
  } as unknown as BridgeActions;
  const prefs = new BotModePrefs();
  prefs.setStreamReplies(true);
  const authorCards = vi.spyOn(messageAuthorCards, 'messageAuthorCardModel');
  const humanRenders = () =>
    authorCards.mock.calls.filter(([author]) => author.kind === 'human').length;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  store.setRoster([bot], [channel]);
  store.select({ kind: 'channel', channelId: channel.id });
  store.setConversation({
    status: 'ready',
    channel,
    messages: [committed],
    drafts: [],
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(BotMain, {
          prefs,
          actions,
          channelSidebar: sidebarRegistry(),
        }),
      ),
    );
    const settled = container.querySelector('[data-message-id="settled-human"]');
    expect(settled).not.toBeNull();
    const initialRenders = humanRenders();
    expect(initialRenders).toBeGreaterThan(0);
    for (let revision = 1; revision <= 10; revision++) {
      await act(async () =>
        store.setConversation({
          drafts: [
            {
              channelId: channel.id,
              draftId: 'streaming-draft',
              attemptId: 'attempt',
              revision,
              botSlug: bot.slug,
              body: 'x'.repeat(revision),
            },
          ],
          draftRevision: revision,
        }),
      );
      expect(container.querySelector('[data-message-id="settled-human"]')).toBe(settled);
      expect(container.querySelector('[data-message-id="streaming-draft"]')).not.toBeNull();
    }
    expect(humanRenders()).toBe(initialRenders);
    await act(async () => prefs.setStreamReplies(false));
    expect(container.querySelector('[data-message-id="streaming-draft"]')).toBeNull();
    expect(container.querySelector('[data-message-id="settled-human"]')).toBe(settled);
    await act(async () => prefs.setStreamReplies(true));
    expect(container.querySelector('[data-message-id="streaming-draft"]')).not.toBeNull();
    expect(humanRenders()).toBe(initialRenders);
    await act(async () =>
      store.setConversation({
        messages: [{ ...committed, body: 'History changed' }],
        drafts: [],
      }),
    );
    expect(humanRenders()).toBeGreaterThan(initialRenders);
    expect(container.querySelector('[data-message-id="streaming-draft"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    authorCards.mockRestore();
    prefs.dispose();
    store.setRoster(previous.bots, previous.channels);
    store.select(previous.selection);
    store.setConversation(previous.conversation);
  }
});

describe('Channel read position candidates', () => {
  it('does not resolve a Grant request from a pending or failed local echo', () => {
    const response: ChannelMessage = {
      id: 'human-approved',
      at: '2026-09-26T00:00:00.000Z',
      author: { kind: 'human' },
      body: 'Workspace authorized.',
      replyTo: 'grant-request',
      grantRequestResolution: {
        requestMessageId: 'grant-request',
        grantId: 'grant-1',
      },
    };
    expect([...resolvedGrantRequestIds([{ ...response, pending: true }])]).toEqual([]);
    expect([...resolvedGrantRequestIds([{ ...response, failed: 'network disconnected' }])]).toEqual(
      [],
    );
    expect([...resolvedGrantRequestIds([response])]).toEqual(['grant-request']);
  });

  it('ignores optimistic echoes and process-only streaming drafts', () => {
    const committed: ChannelMessage = {
      id: 'm1',
      at: '2026-09-19T00:00:00.000Z',
      author: { kind: 'human' },
      body: 'Hello',
    };
    expect([
      ...committedMessageIds([
        committed,
        { ...committed, id: 'local-echo-1', pending: true },
        { ...committed, id: 'local-failed-1', failed: 'network disconnected' },
        { ...committed, id: 'draft-1', streaming: true },
      ]),
    ]).toEqual(['m1']);
  });
});

describe('Bot main Sessions pane', () => {
  it('draws the new-messages divider after the read anchor and splits the group there', () => {
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '2026-09-21T00:00:00.000Z',
    };
    const channel = {
      id: 'dm-ada',
      type: 'dm' as const,
      name: 'Ada',
      members: ['ada'],
      botSlug: 'ada',
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:01:00.000Z',
    };
    store.setRoster([bot], [channel]);
    store.select({ kind: 'bot', slug: 'ada' });
    store.setConversation({
      status: 'ready',
      channel,
      sending: false,
      unreadAfterMessageId: 'b1',
      messages: ['b1', 'b2', 'b3'].map((id, index) => ({
        id,
        at: `2026-09-21T00:01:0${index}.000Z`,
        author: { kind: 'bot' as const, slug: 'ada' },
        body: id,
      })),
    });
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(
      createElement(BotMain, {
        actions: { ...inertSubmissionActions } as BridgeActions,
        channelSidebar: sidebarRegistry(),
      }),
    );
    const divider = container.querySelector('[data-unread-divider]')!;
    expect(divider.getAttribute('role')).toBe('separator');
    expect(divider.textContent).toBe('以下为新消息');
    expect(container.querySelectorAll('[data-unread-divider]')).toHaveLength(1);
    const block = divider.closest('.bh-message-block')!;
    expect(block.querySelector('[data-message-id]')?.getAttribute('data-message-id')).toBe('b2');
    expect(
      Array.from(container.querySelectorAll('.bh-message-group')).map((group) =>
        group.getAttribute('data-group-size'),
      ),
    ).toEqual(['1', '2']);
  });

  it('opens conversation search with Ctrl+F and jumps to a result', async () => {
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '2026-09-21T00:00:00.000Z',
    };
    const channel = {
      id: 'dm-ada',
      type: 'dm' as const,
      name: 'Ada',
      members: ['ada'],
      botSlug: 'ada',
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:01:00.000Z',
    };
    const hit = {
      id: 'b0',
      at: '2026-09-20T00:01:00.000Z',
      author: { kind: 'bot' as const, slug: 'ada' },
      body: 'The launch checklist lives in docs/launch.md',
      channelRevision: 1,
    };
    store.setRoster([bot], [channel]);
    store.select({ kind: 'bot', slug: 'ada' });
    store.setConversation({
      status: 'ready',
      channel,
      sending: false,
      focusMessageId: undefined,
      messages: [{ ...hit, id: 'b1', body: 'Latest', channelRevision: 2 }],
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const searchChannel = vi.fn().mockResolvedValue({ messages: [hit] });
    const openAround = vi.fn().mockResolvedValue(undefined);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        createElement(BotMain, {
          actions: {
            profileActivity: vi.fn().mockRejectedValue(new Error('Unavailable')),
            listWorkspaceGrants: async () => [],
            modelPlanState: async () => undefined,
            botSourcePolicies: async () => [],
            searchChannel,
            openAround,
            ...inertSubmissionActions,
          } as unknown as BridgeActions,
          channelSidebar: sidebarRegistry(),
        }),
      ),
    );
    const shortcut = new KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: true,
      cancelable: true,
    });
    await act(async () => {
      document.dispatchEvent(shortcut);
    });
    expect(shortcut.defaultPrevented).toBe(true);
    const input = container.querySelector<HTMLInputElement>('[data-conversation-search] input');
    expect(document.activeElement).toBe(input);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'LAUNCH');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(searchChannel).toHaveBeenCalledWith('dm-ada', 'LAUNCH', undefined);
    const result = container.querySelector<HTMLElement>('[data-search-result="b0"]');
    expect(result?.querySelector('mark')?.textContent).toBe('launch');
    expect(container.querySelector('[data-conversation-search] [role="status"]')?.textContent).toBe(
      '1 条结果',
    );
    await act(async () => {
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(openAround).toHaveBeenCalledWith('dm-ada', 'b0');
    await act(async () => {
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(container.querySelector('[data-conversation-search]')).toBeNull();
    vi.useRealTimers();
    await act(async () => root.unmount());
    container.remove();
  });
});

describe('DM usage refresh', () => {
  it('retains the current snapshot while a committed-message refresh is pending', async () => {
    const previous = store.getSnapshot();
    const bot = {
      slug: 'usage-refresh',
      displayName: 'Usage refresh',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '2026-10-11T00:00:00.000Z',
    };
    const channel = {
      id: 'dm-usage-refresh',
      type: 'dm' as const,
      name: bot.displayName,
      members: [bot.slug],
      botSlug: bot.slug,
      createdAt: bot.createdAt,
      updatedAt: bot.createdAt,
    };
    const profileActivity = vi
      .fn()
      .mockResolvedValueOnce({
        slug: bot.slug,
        modelUsageStatus: 'ready',
        modelUsageRows: [],
      })
      .mockImplementationOnce(() => new Promise(() => {}));
    const actions = {
      profileActivity,
      modelPlanState: async () => ({}),
      modelCatalog: async () => ({ models: [] }),
      listWorkspaceGrants: async () => [],
      botSourcePolicies: async () => [],
      markRead: async () => undefined,
      ...inertSubmissionActions,
    } as unknown as BridgeActions;
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    store.setRoster([bot], [channel]);
    store.select({ kind: 'bot', slug: bot.slug });
    store.setConversation({
      status: 'ready',
      channel,
      messages: [],
      sending: false,
    });
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(async () =>
        root.render(
          createElement(BotMain, {
            actions,
            channelSidebar: sidebarRegistry(),
          }),
        ),
      );
      const before = node.querySelector('[data-composer-chip="usage"]')!.textContent;
      expect(before).toContain('— / —');
      await act(async () => {
        store.setConversation({
          messages: [
            {
              id: 'usage-committed',
              at: bot.createdAt,
              author: { kind: 'human' },
              body: 'Hello',
            },
          ],
        });
      });
      expect(profileActivity).toHaveBeenCalledTimes(2);
      expect(node.querySelector('[data-composer-chip="usage"]')!.textContent).toBe(before);
    } finally {
      await act(async () => root.unmount());
      node.remove();
      store.setRoster(previous.bots, previous.channels);
      store.select(previous.selection);
      store.setConversation(previous.conversation);
    }
  });
});

describe('return to latest messages', () => {
  it('appears on ordinary history scroll, counts live messages and hides after return', async () => {
    const previous = store.getSnapshot();
    const bot = {
      slug: 'timeline-return',
      displayName: 'Timeline return',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '2026-10-24T00:00:00.000Z',
    };
    const channel = {
      id: 'dm-timeline-return',
      type: 'dm' as const,
      name: bot.displayName,
      members: [bot.slug],
      botSlug: bot.slug,
      createdAt: bot.createdAt,
      updatedAt: bot.createdAt,
    };
    const message = (id: string): ChannelMessage => ({
      id,
      at: bot.createdAt,
      author: { kind: 'bot', slug: bot.slug },
      body: id,
    });
    const actions = {
      profileActivity: async () => ({
        slug: bot.slug,
        modelUsageStatus: 'ready',
        modelUsageRows: [],
      }),
      modelPlanState: async () => ({}),
      modelCatalog: async () => ({ models: [] }),
      listWorkspaceGrants: async () => [],
      botSourcePolicies: async () => [],
      markRead: async () => undefined,
      ...inertSubmissionActions,
    } as unknown as BridgeActions;
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    store.setRoster([bot], [channel]);
    store.select({ kind: 'bot', slug: bot.slug });
    store.setConversation({
      status: 'ready',
      channel,
      messages: [message('first')],
      revision: 1,
      sending: false,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          createElement(BotMain, {
            actions,
            channelSidebar: sidebarRegistry(),
          }),
        ),
      );
      const viewport = container.querySelector<HTMLElement>('.bh-chat-body')!;
      Object.defineProperties(viewport, {
        scrollHeight: { value: 2000 },
        clientHeight: { value: 500 },
      });
      const button = () => container.querySelector<HTMLButtonElement>('.bh-timeline-new');
      expect(button()).toBeNull();
      await act(async () => {
        viewport.scrollTop = 1000;
        viewport.dispatchEvent(new Event('scroll'));
      });
      expect(button()?.getAttribute('aria-label')).toBe(zhTranslate('messages.latest'));
      expect(button()?.textContent).toBe('');
      expect(button()?.querySelector('.bh-timeline-new-count')).toBeNull();
      expect(button()?.hasAttribute('data-unseen')).toBe(false);
      await act(async () => {
        store.setConversation({
          messages: [message('first'), message('second'), message('third')],
          revision: 3,
        });
      });
      expect(button()?.textContent).toBe('2');
      expect(button()?.getAttribute('aria-description')).toBe(
        zhTranslate('messages.unseen', { count: 2 }),
      );
      await act(async () => button()!.click());
      expect(viewport.scrollTop).toBe(2000);
      expect(button()).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.setRoster(previous.bots, previous.channels);
      store.select(previous.selection);
      store.setConversation(previous.conversation);
    }
  });

  it('stays where a small upward scroll leaves it while a Bot reply grows', async () => {
    const previous = store.getSnapshot();
    const bot = {
      slug: 'timeline-hold',
      displayName: 'Timeline hold',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '2026-10-24T00:00:00.000Z',
    };
    const channel = {
      id: 'dm-timeline-hold',
      type: 'dm' as const,
      name: bot.displayName,
      members: [bot.slug],
      botSlug: bot.slug,
      createdAt: bot.createdAt,
      updatedAt: bot.createdAt,
    };
    const message = (id: string): ChannelMessage => ({
      id,
      at: bot.createdAt,
      author: { kind: 'bot', slug: bot.slug },
      body: id,
    });
    const actions = {
      profileActivity: async () => ({
        slug: bot.slug,
        modelUsageStatus: 'ready',
        modelUsageRows: [],
      }),
      modelPlanState: async () => ({}),
      modelCatalog: async () => ({ models: [] }),
      listWorkspaceGrants: async () => [],
      botSourcePolicies: async () => [],
      markRead: async () => undefined,
      ...inertSubmissionActions,
    } as unknown as BridgeActions;
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    store.setRoster([bot], [channel]);
    store.select({ kind: 'bot', slug: bot.slug });
    store.setConversation({
      status: 'ready',
      channel,
      messages: [message('first')],
      revision: 1,
      sending: false,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          createElement(BotMain, {
            actions,
            channelSidebar: sidebarRegistry(),
          }),
        ),
      );
      const viewport = container.querySelector<HTMLElement>('.bh-chat-body')!;
      Object.defineProperties(viewport, {
        scrollHeight: { value: 2000 },
        clientHeight: { value: 500 },
      });
      await act(async () => {
        viewport.scrollTop = 1500;
        viewport.dispatchEvent(new Event('scroll'));
      });
      await act(async () => {
        viewport.scrollTop = 1460;
        viewport.dispatchEvent(new Event('scroll'));
      });
      await act(async () => {
        store.setConversation({
          messages: [message('first'), message('second')],
          revision: 2,
        });
      });
      expect(viewport.scrollTop).toBe(1460);
      await act(async () => {
        viewport.scrollTop = 1500;
        viewport.dispatchEvent(new Event('scroll'));
      });
      await act(async () => {
        viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, bubbles: true }));
        store.setConversation({
          messages: [message('first'), message('second'), message('third')],
          revision: 3,
        });
      });
      expect(viewport.scrollTop).toBe(1500);
      await act(async () => {
        viewport.scrollTop = 1490;
        viewport.dispatchEvent(new Event('scroll'));
      });
      await act(async () => {
        viewport.scrollTop = 1495;
        viewport.dispatchEvent(new Event('scroll'));
      });
      await act(async () => {
        store.setConversation({
          messages: [message('first'), message('second'), message('third'), message('fourth')],
          revision: 4,
        });
      });
      expect(viewport.scrollTop).toBe(2000);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.setRoster(previous.bots, previous.channels);
      store.select(previous.selection);
      store.setConversation(previous.conversation);
    }
  });
});
