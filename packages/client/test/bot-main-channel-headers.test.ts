// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import type { BridgeActions } from '../src/client/actions.js';
import { BotMain } from '../src/client/bot-main.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { createChannelSidebarRegistry } from '../src/client/channel-sidebar.js';
import { ChannelSidebarEntrySection } from '../src/client/channel-sidebar-view.js';
import { zhTranslate } from '../src/client/locale.js';
import { store } from '../src/client/store.js';
import { WindowCompanions } from '../src/client/window-companions.js';
import { inertSubmissionActions } from './inert-submissions.js';
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

const entryProps = {
  scope: 'personabot' as const,
  channelId: 'dm-ada',
  botSlug: 'ada',
  actions: { ...inertSubmissionActions } as BridgeActions,
  t: zhTranslate,
};

describe('Bot main Sessions pane', () => {
  it.each(['bot', 'channel'] as const)('omits tags from the %s DM header chip', (selectionKind) => {
    const bot = {
      slug: 'chip-bot',
      displayName: 'Chip Bot',
      roles: ['GEO', 'SEO'],
      aggregateState: 'idle' as const,
      workspaces: [],
      createdAt: '2026-10-10T00:00:00.000Z',
    };
    const channel = {
      id: 'chip-dm',
      type: 'dm' as const,
      name: 'Chip Bot',
      members: [bot.slug],
      botSlug: bot.slug,
      createdAt: bot.createdAt,
      updatedAt: bot.createdAt,
    };
    store.setRoster([bot], [channel]);
    store.select(
      selectionKind === 'bot'
        ? { kind: 'bot', slug: bot.slug }
        : { kind: 'channel', channelId: channel.id },
    );
    store.setConversation({ status: 'ready', channel, messages: [] });
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(
      createElement(BotMain, {
        actions: { ...inertSubmissionActions } as BridgeActions,
        channelSidebar: sidebarRegistry(),
      }),
    );
    const chip = container.querySelector('.bh-channel-island')!;
    expect(chip.querySelector('[data-conversation-title]')?.textContent).toBe('Chip Bot');
    expect(chip.querySelector('.bh-role-badges')).toBeNull();
    expect(chip.textContent).not.toContain('GEO');
    expect(chip.textContent).not.toContain('SEO');
  });

  it('retains global Panel DOM and local input state across Channel loading and updates', async () => {
    const previous = store.getSnapshot();
    const originalMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('min-width'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      onchange: null,
      addListener() {},
      removeListener() {},
      dispatchEvent: () => true,
    })) as typeof window.matchMedia;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const first = {
      id: 'stable-first',
      type: 'group' as const,
      name: 'First',
      members: [],
      createdAt: '2026-10-17T00:00:00.000Z',
      updatedAt: '2026-10-17T00:00:00.000Z',
    };
    const second = { ...first, id: 'stable-second', name: 'Second' };
    store.setRoster([], [first, second]);
    store.select({ kind: 'channel', channelId: first.id });
    store.setConversation({ status: 'ready', channel: first });
    const registry = createDockPanelRegistry();
    registry.register({
      id: 'sessions',
      title: 'Global probe',
      icon: 'hash',
      scope: 'global',
      component: () =>
        createElement('input', {
          'data-global-probe': '',
          defaultValue: 'untouched',
        }),
    });
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(() =>
        root.render(
          createElement(BotMain, {
            actions: {
              ...inertSubmissionActions,
              skillCatalog: async () => [],
              allBotPreview: async () => undefined,
            } as unknown as BridgeActions,
            channelSidebar: createChannelSidebarRegistry(),
            dockPanels: registry,
          }),
        ),
      );
      const dock = node.querySelector('.bh-dock');
      const input = node.querySelector<HTMLInputElement>('[data-global-probe]')!;
      expect(input).not.toBeNull();
      input.value = 'local state retained';
      for (const channel of [second, first]) {
        await act(() => store.select({ kind: 'channel', channelId: channel.id }));
        expect(node.querySelector('.bh-dock')).toBe(dock);
        expect(node.querySelector('[data-global-probe]')).toBe(input);
        await act(() => store.setConversation({ status: 'ready', channel }));
        expect(input.isConnected).toBe(true);
        expect(input.value).toBe('local state retained');
        await act(() =>
          store.setConversation({
            revision: store.getSnapshot().conversation.revision + 1,
          }),
        );
        expect(node.querySelector('[data-global-probe]')).toBe(input);
      }
    } finally {
      await act(() => root.unmount());
      node.remove();
      window.matchMedia = originalMedia;
      vi.unstubAllGlobals();
      store.setRoster(previous.bots, previous.channels);
      store.select(previous.selection);
      store.setConversation(previous.conversation);
    }
  });

  it('keeps the docked Channel sidebar present on every state update while switching Channels', () => {
    const previous = store.getSnapshot();
    const first = {
      id: 'group-first',
      type: 'group' as const,
      name: 'First',
      members: [],
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:00.000Z',
    };
    const second = { ...first, id: 'group-second', name: 'Second' };
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle' as const,
      workspaces: [],
      createdAt: first.createdAt,
    };
    const registry = sidebarRegistry();
    const render = () =>
      renderToStaticMarkup(
        createElement(BotMain, {
          actions: { ...inertSubmissionActions } as BridgeActions,
          channelSidebar: registry,
        }),
      );

    store.setRoster([bot], [first, second]);
    store.select({ kind: 'channel', channelId: first.id });
    store.setConversation({ status: 'ready', channel: first });
    const renders: string[] = [];
    const unsubscribe = store.subscribe(() => renders.push(render()));
    try {
      store.select({ kind: 'channel', channelId: second.id });
      store.setConversation({ status: 'loading', channel: second });
      store.select({ kind: 'bot', slug: bot.slug });
      store.setConversation({ status: 'loading', channel: undefined });
      expect(renders).toHaveLength(4);
      expect(renders.every((markup) => markup.includes('id="bh-channel-sidebar"'))).toBe(true);
      expect(renders.every((markup) => markup.includes('aria-expanded="true"'))).toBe(true);
    } finally {
      unsubscribe();
      store.setRoster(previous.bots, previous.channels);
      store.select(previous.selection);
      store.setConversation(previous.conversation);
      store.setSessions(previous.sessions);
      store.setBotInbox(previous.botInbox);
      store.setActivityList(previous.activityList);
    }
  });

  it('shows the DM profile menu without the retired header pin shortcut', async () => {
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
      name: 'bot-ada',
      members: ['ada'],
      botSlug: 'ada',
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:01:00.000Z',
    };
    const previous = store.getSnapshot();
    store.setRoster([bot], [channel]);
    store.select({ kind: 'bot', slug: 'ada' });
    store.setConversation({
      status: 'ready',
      channel,
      messages: [],
      error: undefined,
      sending: false,
    });
    store.setSessions({
      status: 'ready',
      items: [
        {
          sessionId: 'orchestrator-1',
          role: 'orchestrator',
          createdAt: '2026-09-21T00:00:00.000Z',
        },
      ],
      error: undefined,
    });

    const companion = new WindowCompanions({
      context: async () => ({ profileId: 'dm-header-qa' }),
      source: () => ({ addEventListener() {}, close() {} }),
      update: async () => {},
    });
    await companion.start();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    await act(() =>
      root.render(
        createElement(BotMain, {
          actions: {
            profileActivity: vi.fn().mockRejectedValue(new Error('Unavailable')),
            listWorkspaceGrants: async () => [],
            modelPlanState: async () => undefined,
            botSourcePolicies: async () => [],
            ...inertSubmissionActions,
          } as unknown as BridgeActions,
          channelSidebar: sidebarRegistry(),
          companion,
        }),
      ),
    );
    const markup = node.innerHTML;
    expect(node.querySelector('.bh-companion-pin')).toBeNull();
    expect(node.querySelector('button button')).toBeNull();
    expect(companion.get('ada')).toBeUndefined();
    await act(() => root.unmount());
    node.remove();

    expect(markup).toContain('会话');
    expect(markup).toContain('收起 Channel sidebar');
    expect(markup).toContain('class="bh-channel-island"');
    expect(markup).toContain('aria-haspopup="menu"');
    expect(markup).toContain('aria-label="Ada · ' + zhTranslate('humanNickname.menu') + '"');
    expect(markup).toContain('data-channel-menu-caret=""');
    expect(markup).toMatch(/<span data-conversation-title="" class="[^"]+">Ada<\/span>/);
    expect(markup).not.toContain('bh-channel-sidebar-title');
    expect(markup).not.toContain('bh-chat-top-fade');
    expect(markup).not.toContain('研究发布状态');
    expect(markup).not.toContain('Ada 空闲');
    expect(markup).not.toContain('bh-composer-activity-status');

    const beforeChannelSelection = store.getSnapshot();
    store.select({ kind: 'channel', channelId: channel.id });
    store.setConversation(beforeChannelSelection.conversation);
    const channelMarkup = renderToStaticMarkup(
      createElement(BotMain, {
        actions: { ...inertSubmissionActions } as BridgeActions,
        channelSidebar: sidebarRegistry(),
      }),
    );
    expect(channelMarkup).toMatch(/<span data-conversation-title="" class="[^"]+">Ada<\/span>/);
    expect(channelMarkup).not.toContain('bh-channel-sidebar-title');
    store.select(beforeChannelSelection.selection);
    store.setConversation(beforeChannelSelection.conversation);
    store.setSessions(previous.sessions);
    companion.dispose();
  });

  it('opens Group Profile from the group Channel header', () => {
    const previous = store.getSnapshot();
    const channel = {
      id: 'group-design',
      type: 'group' as const,
      name: '设计组',
      members: [],
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:01:00.000Z',
    };
    store.setRoster([], [channel]);
    store.select({ kind: 'channel', channelId: channel.id });
    store.setConversation({
      status: 'ready',
      channel,
      messages: [],
      error: undefined,
      sending: false,
    });
    store.setSessions({ status: 'ready', items: [], error: undefined });

    const markup = renderToStaticMarkup(
      createElement(BotMain, {
        actions: { ...inertSubmissionActions } as BridgeActions,
        channelSidebar: sidebarRegistry(),
      }),
    );

    expect(markup).toContain('class="bh-channel-island bh-group-channel-header"');
    expect(markup).toContain('data-group-channel-name=""');
    expect(markup).toContain('aria-label="设计组 · ' + zhTranslate('humanNickname.menu') + '"');
    expect(markup).toContain('aria-haspopup="menu"');
    expect(markup).toContain('data-channel-menu-caret=""');
    expect(markup).toMatch(/<span data-conversation-title="" class="[^"]+">设计组<\/span>/);

    store.setRoster(previous.bots, previous.channels);
    store.select(previous.selection);
    store.setConversation(previous.conversation);
    store.setSessions(previous.sessions);
  });

  it('renders native Session title, role and workspace in the expanded entry', () => {
    store.setSessions({
      status: 'ready',
      items: [
        {
          sessionId: 'orchestrator-1',
          role: 'orchestrator',
          createdAt: '2026-09-21T00:00:00.000Z',
        },
      ],
      error: undefined,
    });
    const native = {
      subscribe: () => () => undefined,
      getSnapshot: () => ({
        ids: ['orchestrator-1'],
        byId: {
          'orchestrator-1': {
            displayTitle: 'Plan release',
            cwd: '/srv/ada',
            updatedAt: Date.parse('2026-09-21T00:01:00.000Z'),
            running: true,
          },
        },
      }),
    };
    const sessions = createChannelSidebarBuiltins(zhTranslate, undefined, native).find(
      (entry) => entry.id === 'sessions',
    );
    expect(sessions).toBeDefined();

    const markup = renderToStaticMarkup(
      createElement(ChannelSidebarEntrySection, {
        entry: sessions!,
        expanded: true,
        onToggle: () => undefined,
        entryProps,
      }),
    );
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('Plan release');
    expect(markup).toContain('Orchestrator');
    expect(markup).toContain('ada');
    expect(markup).not.toContain('事项');
  });

  it('renders a collapsed Sessions header without its body', () => {
    const sessions = createChannelSidebarBuiltins(zhTranslate).find(
      (entry) => entry.id === 'sessions',
    );
    const markup = renderToStaticMarkup(
      createElement(ChannelSidebarEntrySection, {
        entry: sessions!,
        expanded: false,
        onToggle: () => undefined,
        entryProps,
      }),
    );
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('会话');
    expect(markup).not.toContain('Plan release');
  });

  it('keeps a Bot DM read-only when its stored member list is incomplete', () => {
    const previous = store.getSnapshot();
    const channel = {
      id: 'bot-dm-ada-bea',
      type: 'dm' as const,
      name: 'Ada ↔ Bea',
      members: ['ada'],
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:01:00.000Z',
    };
    store.setRoster([], [channel]);
    store.select({ kind: 'channel', channelId: channel.id });
    store.setConversation({
      status: 'ready',
      channel,
      messages: [
        {
          id: 'bot-message-1',
          at: '2026-09-21T00:01:00.000Z',
          author: { kind: 'bot', slug: 'ada' },
          body: 'hello',
        },
      ],
      sending: false,
    });

    const markup = renderToStaticMarkup(
      createElement(BotMain, {
        actions: { ...inertSubmissionActions } as BridgeActions,
        channelSidebar: sidebarRegistry(),
      }),
    );
    expect(markup).toContain('bh-bot-dm-readonly');
    expect(markup).not.toContain('class="bh-memory-chat-composer"');
    expect(markup).not.toContain('aria-label="回复"');

    store.setRoster(previous.bots, previous.channels);
    store.select(previous.selection);
    store.setConversation(previous.conversation);
  });

  it('opens the message menu in a read-only DM with only the time and copy', async () => {
    const previous = store.getSnapshot();
    const channel = {
      id: 'dm-ada',
      type: 'dm' as const,
      name: 'Ada',
      members: ['ada'],
      botSlug: 'ada',
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:01:00.000Z',
    };
    store.setRoster(
      [
        {
          slug: 'ada',
          displayName: 'Ada',
          roles: [],
          aggregateState: 'idle',
          workspaces: [],
          createdAt: '2026-09-21T00:00:00.000Z',
          deleted: true,
          paused: true,
        },
      ],
      [channel],
    );
    store.select({ kind: 'channel', channelId: channel.id });
    store.setConversation({
      status: 'ready',
      channel,
      sending: false,
      messages: [
        {
          id: 'b1',
          at: '2026-09-21T00:01:00.000Z',
          author: { kind: 'bot', slug: 'ada' },
          body: 'Ready',
          channelRevision: 1,
        },
      ],
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          createElement(BotMain, {
            actions: {
              profileActivity: vi.fn().mockRejectedValue(new Error('Unavailable')),
              listWorkspaceGrants: async () => [],
              modelPlanState: async () => undefined,
              botSourcePolicies: async () => [],
              reactToMessage: vi.fn().mockResolvedValue(undefined),
              ...inertSubmissionActions,
            } as unknown as BridgeActions,
            channelSidebar: sidebarRegistry(),
          }),
        ),
      );
      await act(async () =>
        container.querySelector('.bh-bubble-wrap')!.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: 40,
            clientY: 60,
          }),
        ),
      );
      const popup = document.querySelector('[role="menu"]')!;
      expect(popup.querySelector('[role=presentation]')?.textContent).toMatch(/\S/);
      expect(
        [...popup.querySelectorAll('[role=menuitem]')].map((item) => item.textContent),
      ).toEqual([zhTranslate('message.copy'), zhTranslate('message.select')]);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.select(previous.selection);
      store.setConversation(previous.conversation);
    }
  });

  it('labels a deleted Bot DM as read-only history', () => {
    const previous = store.getSnapshot();
    const channel = {
      id: 'dm-ada',
      type: 'dm' as const,
      name: 'Ada',
      members: ['ada'],
      botSlug: 'ada',
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:01:00.000Z',
    };
    const render = (deleted: boolean): string => {
      store.setRoster(
        [
          {
            slug: 'ada',
            displayName: 'Ada',
            roles: [],
            aggregateState: 'idle',
            workspaces: [],
            createdAt: '2026-09-21T00:00:00.000Z',
            ...(deleted ? { deleted: true, paused: true } : {}),
          },
        ],
        [channel],
      );
      store.select({ kind: 'channel', channelId: channel.id });
      store.setConversation({
        status: 'ready',
        channel,
        messages: [
          {
            id: 'local-failed-1',
            at: '2026-09-21T00:02:00.000Z',
            author: { kind: 'human' },
            body: 'hello',
            failed: 'network disconnected',
          },
        ],
        sending: false,
      });
      return renderToStaticMarkup(
        createElement(BotMain, {
          actions: { ...inertSubmissionActions } as BridgeActions,
          channelSidebar: sidebarRegistry(),
        }),
      );
    };
    try {
      const live = render(false);
      expect(live).not.toContain('bh-bot-dm-readonly');
      expect(live).toContain('<button type="button" class="bh-bubble-failed-action"');
      const markup = render(true);
      expect(markup).toContain('已删除的 Bot · 仅供查看');
      expect(markup).toContain('发送失败');
      expect(markup).not.toContain('<button type="button" class="bh-bubble-failed-action"');
      expect(markup).not.toContain('Bot 之间的私聊 · 仅供查看');
    } finally {
      store.setRoster(previous.bots, previous.channels);
      store.select(previous.selection);
      store.setConversation(previous.conversation);
    }
  });

  it('locks reactions in a shared-Bot DM whose Bot can no longer be reached', async () => {
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '2026-09-21T00:00:00.000Z',
    };
    const channel = {
      id: 'dm-member-ada',
      type: 'dm' as const,
      name: 'Ada',
      members: ['ada'],
      botSlug: 'ada',
      readOnly: true as const,
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:01:00.000Z',
    };
    store.setRoster([bot], [channel]);
    store.select({ kind: 'bot', slug: 'ada' });
    store.setConversation({
      status: 'ready',
      channel,
      sending: false,
      focusMessageId: undefined,
      messages: [
        {
          id: 'b1',
          at: '2026-09-21T00:01:00.000Z',
          author: { kind: 'bot', slug: 'ada' },
          body: 'Ready',
          channelRevision: 1,
          reactions: [{ emoji: '🎉', actors: [{ kind: 'bot', id: 'ada' }] }],
        },
      ],
    });
    const reactToMessage = vi.fn().mockResolvedValue(undefined);
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
            reactToMessage,
            ...inertSubmissionActions,
          } as unknown as BridgeActions,
          channelSidebar: sidebarRegistry(),
        }),
      ),
    );
    container.querySelector<HTMLButtonElement>('[data-reaction="🎉"]')?.click();
    await act(async () =>
      container
        .querySelector('.bh-bubble-wrap')!
        .dispatchEvent(new MouseEvent('pointermove', { bubbles: true })),
    );
    expect(container.querySelector('[data-reaction-picker-trigger]')).toBeNull();
    expect(reactToMessage).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    container.remove();
  });
});
