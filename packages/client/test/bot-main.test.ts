// @vitest-environment jsdom
import { act, createElement, forwardRef, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const menus = vi.hoisted(
  () => [] as Array<{ items?: Array<{ id: string }>; onSelect?(id: string): void }>,
);

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  const Tag = ({ children }: PropsWithChildren) => createElement('span', null, children);
  return {
    IconWarningTriangleOutlineRegular: () => null,
    IconCodeOutlineRegular: () => null,
    IconStopFillRegular: () => null,
    IconBranchOutlineRegular: () => null,
    Button: stub,
    Toast: stub,
    IconAgentPresetOutlineRegular: stub,
    IconCheckOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconChevronLeftOutlineRegular: stub,
    IconChevronRightOutlineRegular: stub,
    IconDownloadOutlineRegular: stub,
    IconCloseFill14: stub,
    IconCopyOutlineRegular: stub,
    IconGoalOutlineRegular: stub,
    IconChecklistOutlineRegular: stub,
    IconCloseOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    IconSettingsOutlineRegular: stub,
    IconUserOutlineRegular: stub,
    IconFolderCloseRegular: stub,
    IconFolderOpenRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconNewChatOutlineRegular: stub,
    IconPanelLeftOutlineRegular: stub,
    IconPaperclipOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconRefreshOutlineRegular: stub,
    IconSearchOutlineRegular: stub,
    IconSendOutlineRegular: stub,
    IconPinFillRegular: stub,
    IconPinOutlineRegular: stub,
    IconTrashOutlineRegular: stub,
    FileTypeIcon: stub,
    HoverCard: ({ anchor }: PropsWithChildren<{ anchor: unknown }>) =>
      createElement('span', { 'data-hover-card': 'author' }, anchor as never),
    fileSizeText: (size: number) => `${size} B`,
    ImageLightbox: stub,
    Input: stub,
    Menu: (props: { anchor?: unknown; items?: Array<{ id: string }> }) => {
      menus.push(props);
      return props.anchor ?? null;
    },
    MenuItemButton: stub,
    MenuSurface: forwardRef<HTMLDivElement, PropsWithChildren>((props, ref) =>
      createElement('div', { ...props, ref }),
    ),
    MarkdownText: stub,
    Modal: stub,
    SegmentedControl: stub,
    StateDot: stub,
    Tag,
    Tooltip: ({ children }: PropsWithChildren) => children,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import type { BridgeActions } from '../src/client/actions.js';
import { BotModePrefs } from '../src/client/bot-mode-prefs.js';
import {
  botNameColor,
  contrastRatio,
  parseColor,
  REFERENCE_SURFACES,
} from '../src/client/bot-primary-color.js';
import { seededAvatarFor } from '../../core/src/bots/avatar-appearance.js';
import { BotMain, committedMessageIds, resolvedGrantRequestIds } from '../src/client/bot-main.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { createChannelSidebarRegistry } from '../src/client/channel-sidebar.js';
import { ChannelSidebarEntrySection } from '../src/client/channel-sidebar-view.js';
import { zhTranslate } from '../src/client/locale.js';
import { store, type ChannelMessage } from '../src/client/store.js';
import { WindowCompanions } from '../src/client/window-companions.js';
import { CSS } from '../src/client/styles.js';
import { inertSubmissionActions } from './inert-submissions.js';
import * as messageAuthorCards from '../src/client/message-author-card.js';

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
  store.setConversation({ status: 'ready', channel, messages: [committed], drafts: [] });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(createElement(BotMain, { prefs, actions, channelSidebar: sidebarRegistry() })),
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
      store.setConversation({ messages: [{ ...committed, body: 'History changed' }], drafts: [] }),
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
      grantRequestResolution: { requestMessageId: 'grant-request', grantId: 'grant-1' },
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

const entryProps = {
  scope: 'personabot' as const,
  channelId: 'dm-ada',
  botSlug: 'ada',
  actions: { ...inertSubmissionActions } as BridgeActions,
  t: zhTranslate,
};

function sidebarRegistry() {
  const registry = createChannelSidebarRegistry();
  for (const entry of createChannelSidebarBuiltins(zhTranslate)) registry.register(entry);
  return registry;
}

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
        createElement('input', { 'data-global-probe': '', defaultValue: 'untouched' }),
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
          store.setConversation({ revision: store.getSnapshot().conversation.revision + 1 }),
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

  it('marks a locally echoed Human message as pending until the Host commits it', () => {
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
      messages: [
        {
          id: 'local-echo-1',
          at: '2026-09-21T00:02:00.000Z',
          author: { kind: 'human' },
          body: 'hello',
          pending: true,
        },
      ],
      error: undefined,
      sending: true,
    });
    store.setSessions({ status: 'ready', items: [], error: undefined });

    const markup = renderToStaticMarkup(
      createElement(BotMain, {
        actions: { ...inertSubmissionActions } as BridgeActions,
        channelSidebar: sidebarRegistry(),
      }),
    );
    expect(markup).toContain('bh-bubble-pending');
    expect(markup).not.toContain('发送中');
    expect(markup).toContain('hello');
    expect(markup).not.toContain('bh-message-group-avatar');
  });

  it('keeps a failed Human bubble with an explicit restore affordance', () => {
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
      messages: [
        {
          id: 'local-failed-1',
          at: '2026-09-21T00:02:00.000Z',
          author: { kind: 'human' },
          body: 'hello',
          failed: 'network disconnected',
        },
      ],
      error: undefined,
      sending: false,
    });
    const markup = renderToStaticMarkup(
      createElement(BotMain, {
        actions: { ...inertSubmissionActions } as BridgeActions,
        channelSidebar: sidebarRegistry(),
      }),
    );
    expect(markup).toContain('hello');
    expect(markup).toContain('bh-bubble-failed');
    expect(markup).toContain('将失败消息放回输入框修改后重发');
    expect(markup).toContain('network disconnected');
    expect(markup).not.toContain('发送中');
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
  it('shows no own name above the Human in a group row and no header time', () => {
    const previous = store.getSnapshot();
    const channel = {
      id: 'group-ada',
      type: 'group' as const,
      name: 'Team',
      members: ['ada'],
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:01:00.000Z',
    };
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle' as const,
      workspaces: [],
      createdAt: channel.createdAt,
    };
    try {
      store.setRoster([bot], [channel]);
      store.select({ kind: 'channel', channelId: channel.id });
      store.setConversation({
        status: 'ready',
        channel,
        sending: false,
        messages: [
          {
            id: 'human-1',
            at: '2026-09-21T00:01:00.000Z',
            author: { kind: 'human' },
            body: 'hello',
          },
        ],
      });
      const markup = renderToStaticMarkup(
        createElement(BotMain, {
          actions: { ...inertSubmissionActions } as BridgeActions,
          channelSidebar: sidebarRegistry(),
        }),
      );
      expect(markup).toContain('bh-message-group-me');
      expect(markup).not.toContain('bh-message-identity');
      expect(markup).not.toContain('bh-bubble-author');
      expect(markup).not.toContain('bh-bubble-time');
    } finally {
      store.setRoster(previous.bots, previous.channels);
      store.select(previous.selection);
      store.setConversation(previous.conversation);
    }
  });
  it('colors Group Bot author names from the saved Bot Primary Color and shows none in a DM', () => {
    const previous = store.getSnapshot();
    const at = '2026-10-12T00:00:00.000Z';
    const dm = {
      id: 'dm-ada',
      type: 'dm' as const,
      name: 'Ada',
      members: ['ada'],
      botSlug: 'ada',
      createdAt: at,
      updatedAt: at,
    };
    const group = { ...dm, id: 'group-team', type: 'group' as const, name: 'Team' };
    const messages: ChannelMessage[] = [
      { id: 'human-1', at, author: { kind: 'human' }, body: 'hello' },
      { id: 'bot-1', at, author: { kind: 'bot', slug: 'ada' }, body: 'an existing reply' },
    ];
    const bot = (
      primaryColor?: { mode: 'custom'; color: string; retained?: string },
      deleted = false,
    ) => ({
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle' as const,
      workspaces: [],
      createdAt: at,
      ...(primaryColor === undefined ? {} : { primaryColor }),
      ...(deleted ? { deleted: true } : {}),
    });
    const authors = (
      summary: ReturnType<typeof bot>,
      channel: typeof dm | typeof group,
    ): HTMLElement[] => {
      store.setRoster([summary], [channel]);
      store.select(
        channel.type === 'dm'
          ? { kind: 'bot', slug: 'ada' }
          : { kind: 'channel', channelId: channel.id },
      );
      store.setConversation({ status: 'ready', channel, sending: false, messages });
      const host = document.createElement('div');
      host.innerHTML = renderToStaticMarkup(
        createElement(BotMain, {
          actions: { ...inertSubmissionActions } as BridgeActions,
          channelSidebar: sidebarRegistry(),
        }),
      );
      expect(host.querySelector('.bh-message-group [style*="color"]:not(.bh-bubble-author)')).toBe(
        null,
      );
      return [...host.querySelectorAll<HTMLElement>('.bh-bubble-author')];
    };
    const contrast = (name: string, theme: 'light' | 'dark') =>
      contrastRatio(parseColor(name)!.rgb, parseColor(REFERENCE_SURFACES[theme].background)!.rgb);
    try {
      expect(authors(bot(), dm)).toHaveLength(0);
      const [automatic] = authors(bot(), group);
      expect(authors(bot(), group)).toHaveLength(1);
      const hair = seededAvatarFor('Ada', undefined).hairColor;
      expect(automatic!.getAttribute('data-bot-name-color')).toBe(botNameColor(hair, '#ffffff'));

      const white = bot({ mode: 'custom', color: '#ffffff' });
      const light = authors(white, group)[0]!.getAttribute('data-bot-name-color')!;
      expect(light).not.toBe('#ffffff');
      expect(contrast(light, 'light')).toBeGreaterThanOrEqual(4.5);
      document.body.setAttribute('data-ds-dark-theme', '');
      const dark = authors(white, group)[0]!;
      expect(dark.getAttribute('data-bot-name-color')).toBe('#ffffff');
      expect(dark.style.color).not.toBe('');
      expect(contrast('#ffffff', 'dark')).toBeGreaterThanOrEqual(4.5);

      const [groupBot] = authors(white, group);
      expect(groupBot!.getAttribute('data-bot-name-color')).toBe('#ffffff');
      document.body.removeAttribute('data-ds-dark-theme');
      expect(authors(white, group)[0]!.getAttribute('data-bot-name-color')).toBe(light);
      const gone = bot({ mode: 'custom', color: '#ffffff', retained: '#1d1b22' }, true);
      expect(authors(gone, group)[0]!.getAttribute('data-bot-name-color')).toBe('#1d1b22');
    } finally {
      document.body.removeAttribute('data-ds-dark-theme');
      store.setRoster(previous.bots, previous.channels);
      store.select(previous.selection);
      store.setConversation(previous.conversation);
    }
  });
  it('keeps external provenance in an author dialog control outside the unchanged bubble', () => {
    const previous = store.getSnapshot();
    const channel = {
      id: 'group-source',
      type: 'group' as const,
      name: 'Team',
      members: [],
      createdAt: '2026-10-03T00:00:00Z',
      updatedAt: '2026-10-03T00:00:00Z',
    };
    try {
      store.setRoster([], [channel]);
      store.select({ kind: 'channel', channelId: channel.id });
      store.setConversation({
        status: 'ready',
        channel,
        sending: false,
        messages: [
          {
            id: 'source',
            at: channel.createdAt,
            author: { kind: 'bridged', source: 'Alex' },
            body: 'original external text',
            format: 'text',
            bridgeOrigin: {
              sourceEventId: 'source-event-id',
              platform: 'feishu',
              conversationId: 'conversation-id',
              conversationName: 'QA group',
              messageId: 'external-message-id',
              senderId: 'sender-private-id',
              senderName: 'Alex',
            },
          },
        ],
      });
      const markup = renderToStaticMarkup(
        createElement(BotMain, {
          actions: { ...inertSubmissionActions } as BridgeActions,
          channelSidebar: sidebarRegistry(),
        }),
      );
      expect(markup).toMatch(
        /aria-haspopup="dialog"[^>]*>Alex · 【Lark\/飞书 QA group】<\/button>.*class="bh-bubble[ "]/,
      );
      expect(markup).toContain('original external text');
      expect(markup).not.toContain('sender-private-id');
      expect(markup).not.toContain('source-event-id');
      expect(markup).not.toContain('bh-external-details');
    } finally {
      store.setRoster(previous.bots, previous.channels);
      store.select(previous.selection);
      store.setConversation(previous.conversation);
    }
  });
  it('renders a time inside each bubble and individual inline actions for adjacent Bot messages', () => {
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '2026-09-21T00:00:00.000Z',
    };
    const channel = {
      id: 'group-ada',
      type: 'group' as const,
      name: 'Team',
      members: ['ada'],
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:01:00.000Z',
    };
    store.setRoster([bot], [channel]);
    store.select({ kind: 'channel', channelId: channel.id });
    store.setConversation({
      status: 'ready',
      channel,
      sending: false,
      focusMessageId: 'b1',
      messages: [
        {
          id: 'b1',
          at: '2026-09-21T00:01:00.000Z',
          author: { kind: 'bot', slug: 'ada' },
          body: 'first',
        },
        {
          id: 'b2',
          at: '2026-09-21T00:01:05.000Z',
          author: { kind: 'bot', slug: 'ada' },
          body: 'second',
        },
      ],
    });

    const markup = renderToStaticMarkup(
      createElement(BotMain, {
        actions: { ...inertSubmissionActions } as BridgeActions,
        channelSidebar: sidebarRegistry(),
      }),
    );
    expect(markup).toContain('data-group-size="2"');
    expect(markup).toContain('data-group-position="first"');
    expect(markup).toContain('data-group-position="last"');
    expect(markup.match(/class="bh-message-group-avatar"/g)).toHaveLength(1);
    expect(markup.match(/class="bh-message-group-avatar-link"/g)).toHaveLength(1);
    expect(markup.match(/data-hover-card="author"/g)).toHaveLength(2);
    const start = markup.indexOf('class="bh-message-group"');
    const group = markup.slice(start, markup.indexOf('class="bh-bubble-wrap', start));
    expect(group).toContain('class="bh-persona-avatar"');
    expect(group).not.toMatch(/class="bh-persona-avatar"[^>]*title=/);
    expect(markup).not.toContain('bh-bubble-time');
    expect(markup).not.toContain('bh-bubble-meta');
    expect(markup.match(/<time[^>]*dateTime="2026-09-21T00:01:00.000Z"/g)).toHaveLength(1);
    expect(markup).not.toContain('bh-bubble-toolbar');
    expect(markup).toContain('bh-bubble-focused');
    expect(markup.match(/<time[^>]*dateTime="2026-09-21T00:01:05.000Z"/g)).toHaveLength(1);
    expect(markup).not.toContain('data-unread-divider');
  });
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
  it('steps through every image attachment of the conversation in one preview', async () => {
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
    const image = (name: string) => ({
      fileId: `file:${name}`,
      name,
      mime: 'image/png',
      size: 1,
    });
    store.setRoster([bot], [channel]);
    store.select({ kind: 'bot', slug: 'ada' });
    store.setConversation({
      status: 'ready',
      channel,
      sending: false,
      messages: [
        {
          id: 'p1',
          at: '2026-09-21T00:01:00.000Z',
          author: { kind: 'human' },
          body: '',
          attachments: [image('one.png'), image('two.png')],
        },
        {
          id: 'p2',
          at: '2026-09-21T00:05:00.000Z',
          author: { kind: 'human' },
          body: '',
          attachments: [image('three.png')],
        },
      ],
    });
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
            ...inertSubmissionActions,
          } as unknown as BridgeActions,
          channelSidebar: sidebarRegistry(),
        }),
      ),
    );
    const thumbs = container.querySelectorAll<HTMLButtonElement>('button.bh-message-image-link');
    expect(thumbs).toHaveLength(3);
    await act(async () => thumbs[1]!.click());
    const dialog = () => document.body.querySelector('[role="dialog"][aria-modal="true"]');
    expect(dialog()?.getAttribute('aria-label')).toBe('图片预览：two.png');
    expect(dialog()?.textContent).toContain('2 / 3');
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    });
    expect(dialog()?.getAttribute('aria-label')).toBe('图片预览：three.png');
    expect(dialog()?.querySelector<HTMLButtonElement>('[aria-label="下一张"]')?.disabled).toBe(
      true,
    );
    await act(async () =>
      dialog()?.querySelector<HTMLButtonElement>('[aria-label="上一张"]')?.click(),
    );
    expect(dialog()?.getAttribute('aria-label')).toBe('图片预览：two.png');
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(dialog()).toBeNull();
    await act(async () => root.unmount());
    container.remove();
  });
  it('reacts from the hover bar and toggles reactions from their chips', async () => {
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
    const chip = container.querySelector<HTMLButtonElement>('[data-reaction="🎉"]');
    expect(chip?.getAttribute('aria-label')).toBe('Ada 用 🎉 回应');
    expect(chip?.getAttribute('aria-pressed')).toBe('false');
    await act(async () => chip!.click());
    expect(reactToMessage).toHaveBeenLastCalledWith('dm-ada', 'b1', '🎉', true);
    expect(container.querySelector('.bh-bubble-toolbar')).toBeNull();
    await act(async () =>
      container
        .querySelector('.bh-bubble-wrap')!
        .dispatchEvent(new MouseEvent('pointermove', { bubbles: true })),
    );
    expect(container.querySelectorAll('.bh-bubble-toolbar [data-bubble-action]')).toHaveLength(3);
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-reaction-picker-trigger]')!.click(),
    );
    const picker = document.body.querySelector('[data-reaction-picker]');
    expect(picker?.getAttribute('role')).toBe('menu');
    const thumbs = picker!.querySelector<HTMLButtonElement>('[aria-label="回应 👍"]');
    expect(document.activeElement?.textContent).toBe('👍');
    await act(async () => thumbs!.click());
    expect(reactToMessage).toHaveBeenLastCalledWith('dm-ada', 'b1', '👍', true);
    expect(document.body.querySelector('[data-reaction-picker]')).toBeNull();
    menus.length = 0;
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
    const menu = menus.findLast((props) => props.items?.some((item) => item.id === 'react'));
    expect(menu?.items?.map((item) => item.id)).toEqual([
      'reply',
      'react',
      'copy',
      'select',
      'feedback',
    ]);
    await act(async () => menu!.onSelect!('react'));
    const pressed = document.body.querySelector('[data-reaction-picker]');
    expect(pressed).not.toBeNull();
    await act(async () =>
      pressed!.querySelector<HTMLButtonElement>('[aria-label="回应 🎉"]')!.click(),
    );
    expect(reactToMessage).toHaveBeenLastCalledWith('dm-ada', 'b1', '🎉', true);
    expect(document.body.querySelector('[data-reaction-picker]')).toBeNull();
    await act(async () => root.unmount());
    container.remove();
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
    const shortcut = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, cancelable: true });
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
  it('renders a linked reply summary and safely degrades when the original is gone', () => {
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle' as const,
      workspaces: [],
      createdAt: '2026-09-21T00:00:00.000Z',
    };
    const channel = {
      id: 'dm-ada',
      type: 'dm' as const,
      name: 'Ada',
      members: ['ada'],
      botSlug: 'ada',
      createdAt: bot.createdAt,
      updatedAt: bot.createdAt,
    };
    const reply: ChannelMessage = {
      id: 'm2',
      at: bot.createdAt,
      author: { kind: 'human' },
      body: 'answer',
      replyTo: 'm1',
      replyToPreview: { author: { kind: 'bot', slug: 'ada' }, body: 'original summary' },
    };
    store.setRoster([bot], [channel]);
    store.select({ kind: 'bot', slug: 'ada' });
    store.setConversation({ status: 'ready', channel, messages: [reply], sending: false });
    const render = () =>
      renderToStaticMarkup(
        createElement(BotMain, {
          actions: { ...inertSubmissionActions } as BridgeActions,
          channelSidebar: sidebarRegistry(),
        }),
      );
    const linked = render();
    expect(linked).toContain('class="bh-bubble-reply"');
    expect(linked).toContain('original summary');
    expect(linked).toContain('bh-bubble-reply-author');

    store.setConversation({ messages: [{ ...reply, replyToPreview: null }] });
    const unavailable = render();
    expect(unavailable).toContain('bh-bubble-reply-unavailable');
    expect(unavailable).not.toContain('class="bh-bubble-reply"');
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
      .mockResolvedValueOnce({ slug: bot.slug, modelUsageStatus: 'ready', modelUsageRows: [] })
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
    store.setConversation({ status: 'ready', channel, messages: [], sending: false });
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(async () =>
        root.render(createElement(BotMain, { actions, channelSidebar: sidebarRegistry() })),
      );
      const before = node.querySelector('[data-composer-chip="usage"]')!.textContent;
      expect(before).toContain('— / —');
      await act(async () => {
        store.setConversation({
          messages: [
            { id: 'usage-committed', at: bot.createdAt, author: { kind: 'human' }, body: 'Hello' },
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

describe('Bot main question developer details', () => {
  it('reacts to the shared Bot settings preference without remounting the question', async () => {
    const previous = store.getSnapshot();
    const channel = {
      id: 'dm-ada',
      type: 'dm' as const,
      name: 'Ada',
      members: ['ada'],
      botSlug: 'ada',
      createdAt: '2026-10-08T00:00:00.000Z',
      updatedAt: '2026-10-08T00:00:00.000Z',
    };
    const message: ChannelMessage = {
      id: 'developer-question',
      at: channel.createdAt,
      author: { kind: 'bot', slug: 'ada' },
      body: '',
      userQuestionRequest: {
        sessionId: 'orchestrator-private',
        questions: [
          {
            id: 'start',
            header: 'Start',
            question: 'Where should we start?',
            options: [{ label: 'News' }],
          },
        ],
      },
    };
    const actions = {
      profileActivity: vi.fn().mockRejectedValue(new Error('Unavailable')),
      modelPlanState: async () => ({}),
      listWorkspaceGrants: async () => [],
      userQuestionStatus: vi.fn().mockResolvedValue('pending'),
      markRead: vi.fn().mockResolvedValue(undefined),
      ...inertSubmissionActions,
    } as unknown as BridgeActions;
    const prefs = new BotModePrefs();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    store.select({ kind: 'channel', channelId: channel.id });
    store.setConversation({ status: 'ready', channel, messages: [message] });
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(async () =>
        root.render(
          createElement(BotMain, {
            prefs,
            actions,
            channelSidebar: createChannelSidebarRegistry(),
          }),
        ),
      );
      expect(node.querySelector('.bh-question-source')).toBeNull();
      const choice = node.querySelector<HTMLButtonElement>('.bh-question-item button')!;
      await act(async () => prefs.setDeveloperMode(true));
      expect(node.querySelector('.bh-question-source code')?.textContent).toBe(
        'orchestrator-private',
      );
      expect(node.querySelector('.bh-question-item button')).toBe(choice);
      await act(async () => prefs.setDeveloperMode(false));
      expect(node.querySelector('.bh-question-source')).toBeNull();
      expect(node.querySelector('.bh-question-item button')).toBe(choice);
      expect(actions.userQuestionStatus).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      node.remove();
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
        root.render(createElement(BotMain, { actions, channelSidebar: sidebarRegistry() })),
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
        root.render(createElement(BotMain, { actions, channelSidebar: sidebarRegistry() })),
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
        store.setConversation({ messages: [message('first'), message('second')], revision: 2 });
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

describe('B2 chat bubbles', () => {
  const at = '2026-11-09T09:41:00.000Z';
  const ada = {
    slug: 'ada',
    displayName: 'Ada',
    roles: [],
    aggregateState: 'idle' as const,
    workspaces: [],
    createdAt: at,
    primaryColor: { mode: 'custom' as const, color: '#e8590c' },
  };
  const bob = { ...ada, slug: 'bob', displayName: 'Bob' };
  const dm = {
    id: 'dm-ada',
    type: 'dm' as const,
    name: 'Ada',
    members: ['ada'],
    botSlug: 'ada',
    createdAt: at,
    updatedAt: at,
  };
  const group = {
    id: 'group-team',
    type: 'group' as const,
    name: 'Team',
    members: ['ada', 'bob'],
    createdAt: at,
    updatedAt: at,
  };
  const show = (channel: typeof dm | typeof group, messages: ChannelMessage[]): HTMLElement => {
    store.setRoster([ada, bob], [channel]);
    store.select(
      channel.type === 'dm'
        ? { kind: 'bot', slug: 'ada' }
        : { kind: 'channel', channelId: channel.id },
    );
    store.setConversation({ status: 'ready', channel, sending: false, messages });
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(
      createElement(BotMain, {
        actions: { ...inertSubmissionActions } as BridgeActions,
        channelSidebar: sidebarRegistry(),
      }),
    );
    return host;
  };
  const bubble = (host: HTMLElement, id: string) =>
    host.querySelector<HTMLElement>(`[data-message-id="${id}"] .bh-bubble`);
  const restore = (previous: ReturnType<typeof store.getSnapshot>) => {
    store.setRoster(previous.bots, previous.channels);
    store.select(previous.selection);
    store.setConversation(previous.conversation);
  };

  it('shows each committed message time inside its bubble and no avatar or name in a DM', () => {
    const previous = store.getSnapshot();
    try {
      const host = show(dm, [
        { id: 'h1', at, author: { kind: 'human' }, body: 'hello' },
        { id: 'b1', at, author: { kind: 'bot', slug: 'ada' }, body: 'hi there' },
        { id: 'b2', at, author: { kind: 'bot', slug: 'ada' }, body: 'how can I help' },
        { id: 'h2', at, author: { kind: 'human' }, body: 'sending', pending: true },
      ]);
      const timeline = host.querySelector('.bh-chat-body')!;
      expect(timeline.querySelector('.bh-message-identity')).toBeNull();
      expect(timeline.querySelector('.bh-message-group-avatar')).toBeNull();
      expect(timeline.textContent).not.toContain('Ada');
      for (const id of ['h1', 'b1', 'b2']) {
        const time = bubble(host, id)?.querySelector('time[data-bubble-time]');
        expect(time?.getAttribute('datetime')).toBe(at);
        expect(time?.textContent).toMatch(/\d{1,2}:\d{2}/);
      }
      expect(bubble(host, 'h2')?.querySelector('[data-bubble-time]')).toBeNull();
      expect(timeline.querySelectorAll('time')).toHaveLength(3);
    } finally {
      restore(previous);
    }
  });

  it('keeps the Bot name outside the first bubble of a group run without a header time', () => {
    const previous = store.getSnapshot();
    try {
      const host = show(group, [
        { id: 'b1', at, author: { kind: 'bot', slug: 'ada' }, body: 'first' },
        { id: 'b2', at, author: { kind: 'bot', slug: 'ada' }, body: 'second' },
      ]);
      const identities = host.querySelectorAll('.bh-message-identity');
      expect(identities).toHaveLength(1);
      expect(identities[0]!.textContent).toBe('Ada');
      expect(identities[0]!.querySelector('time')).toBeNull();
      expect(host.querySelectorAll('.bh-message-group-avatar')).toHaveLength(1);
      expect(bubble(host, 'b1')?.querySelector('[data-bubble-time]')).not.toBeNull();
      expect(bubble(host, 'b2')?.querySelector('[data-bubble-time]')).not.toBeNull();
    } finally {
      restore(previous);
    }
  });

  it('floats the reading chip opposite the time without adding anything to the row', () => {
    const previous = store.getSnapshot();
    const message: ChannelMessage = { id: 'h1', at, author: { kind: 'human' }, body: 'hello' };
    try {
      const idle = show(group, [message]);
      const reading = show(group, [
        { ...message, deliveries: [{ botSlug: 'ada', state: 'running' }] },
      ]);
      const surface = (host: HTMLElement) =>
        host.querySelector<HTMLElement>('[data-message-id="h1"] .bh-bubble-surface')!;
      const chip = surface(reading).querySelector('.bh-bubble-badges [data-message-reading]');
      expect(chip).not.toBeNull();
      expect(surface(idle).querySelector('.bh-bubble-badges')).toBeNull();
      expect(bubble(reading, 'h1')!.outerHTML).toBe(bubble(idle, 'h1')!.outerHTML);
      const badges = surface(reading).querySelector('.bh-bubble-badges')!;
      badges.remove();
      expect(surface(reading).outerHTML).toBe(surface(idle).outerHTML);
      expect(CSS).toMatch(/\n\.bh-bubble-badges \{\s*position: absolute;/);
      expect(CSS).toMatch(/\n\.bh-bubble-stamp \{\s*position: absolute;\s*right: /);
      expect(CSS).toMatch(
        /\n\.bh-message-group-me \.bh-bubble-badges \.bh-reading \{\s*margin-right: auto;/,
      );
      expect(CSS).not.toMatch(/\n\.bh-bubble-badges \.bh-reading \{[^}]*margin-left: auto/);
    } finally {
      restore(previous);
    }
  });

  it('opens a reply with a quote block naming the quoted author, ahead of the body', async () => {
    const previous = store.getSnapshot();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const quoted = { author: { kind: 'bot' as const, slug: 'ada' }, body: 'the question' };
    const openAround = vi.fn(async () => undefined);
    try {
      store.setRoster([ada, bob], [group]);
      store.select({ kind: 'channel', channelId: group.id });
      store.setConversation({
        status: 'ready',
        channel: group,
        sending: false,
        messages: [
          {
            id: 'h1',
            at,
            author: { kind: 'human' },
            body: 'my answer',
            replyTo: 'b0',
            replyToPreview: quoted,
          },
          {
            id: 'b1',
            at,
            author: { kind: 'bot', slug: 'bob' },
            body: 'adding to that',
            replyTo: 'b0',
            replyToPreview: quoted,
          },
          {
            id: 'b2',
            at,
            author: { kind: 'bot', slug: 'bob' },
            body: 'noted',
            replyTo: 'h1',
            replyToPreview: { author: { kind: 'human' }, body: 'my answer' },
          },
        ],
      });
      const actions = {
        modelPlanState: async () => ({}),
        listWorkspaceGrants: async () => [],
        botSourcePolicies: async () => [],
        allBotPreview: async () => ({ recipients: [], excluded: [] }),
        listWorkspaceOptions: async () => [],
        markRead: async () => undefined,
        openAround,
        ...inertSubmissionActions,
      } as unknown as BridgeActions;
      await act(async () =>
        root.render(createElement(BotMain, { actions, channelSidebar: sidebarRegistry() })),
      );
      const quote = (id: string) =>
        container.querySelector<HTMLButtonElement>(
          `[data-message-id="${id}"] .bh-bubble [data-bubble-quote]`,
        )!;
      const mine = quote('h1');
      expect(mine.tagName).toBe('BUTTON');
      expect(mine.getAttribute('aria-label')).toContain('Ada');
      expect(mine.querySelector('[data-bubble-quote-author]')?.textContent).toBe('Ada');
      expect(mine.textContent).toContain('the question');
      expect(mine.hasAttribute('data-bot-name-color')).toBe(false);
      const body = container.querySelector('[data-message-id="h1"] .bh-bubble-body')!;
      expect(mine.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      const quotedBot = quote('b1');
      const colour = quotedBot.getAttribute('data-bot-name-color');
      expect(colour).toMatch(/^#[0-9a-f]{6}$/);
      expect(
        contrastRatio(
          parseColor(colour!)!.rgb,
          parseColor(REFERENCE_SURFACES.light.background)!.rgb,
        ),
      ).toBeGreaterThanOrEqual(4.5);

      const quotedHuman = quote('b2');
      expect(quotedHuman.hasAttribute('data-bot-name-color')).toBe(false);
      expect(quotedHuman.dataset['bubbleQuote']).toBe('human');

      await act(async () => quotedHuman.click());
      expect(openAround).toHaveBeenCalledWith(group.id, 'h1');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      restore(previous);
    }
  });

  const photo = (name: string, extra: Partial<{ width: number; height: number }> = {}) => ({
    fileId: `file:${name}`,
    name,
    mime: 'image/png',
    size: 2048,
    version: 'v1',
    ...extra,
  });
  const photos = (count: number) =>
    Array.from({ length: count }, (_, index) => photo(`p${index + 1}.png`));

  it('fills an uncaptioned image to the bubble edge with its time on a pill and puts a caption below', () => {
    const previous = store.getSnapshot();
    try {
      const host = show(dm, [
        { id: 'h1', at, author: { kind: 'human' }, body: '', attachments: [photo('a.png')] },
        {
          id: 'h2',
          at,
          author: { kind: 'human' },
          body: 'the gate',
          attachments: [photo('b.png')],
        },
        { id: 'h3', at, author: { kind: 'human' }, body: 'plain text' },
      ]);
      const bare = bubble(host, 'h1')!;
      expect(bare.dataset['bubbleMedia']).toBe('bare');
      expect(bare.querySelector('[data-album-count="1"]')).not.toBeNull();
      expect(bare.querySelector('[data-bubble-time]')).not.toBeNull();
      const captioned = bubble(host, 'h2')!;
      expect(captioned.dataset['bubbleMedia']).toBe('captioned');
      const album = captioned.querySelector('.bh-message-album')!;
      const caption = captioned.querySelector('.bh-bubble-body')!;
      expect(
        album.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(bubble(host, 'h3')!.hasAttribute('data-bubble-media')).toBe(false);
      expect(CSS).toMatch(
        /\.bh-bubble\[data-bubble-media\] \{[^}]*padding: 0;[^}]*overflow: hidden;/,
      );
      expect(CSS).toMatch(
        /\.bh-bubble\[data-bubble-media='bare'\] \.bh-bubble-stamp \{[^}]*background: color-mix\(in srgb, black 45%, transparent\);[^}]*color: white;/,
      );
    } finally {
      restore(previous);
    }
  });

  it('lays several images out as one album with +N on the last visible tile', () => {
    const previous = store.getSnapshot();
    try {
      const host = show(dm, [
        { id: 'a2', at, author: { kind: 'human' }, body: '', attachments: photos(2) },
        { id: 'a3', at, author: { kind: 'human' }, body: '', attachments: photos(3) },
        { id: 'a4', at, author: { kind: 'human' }, body: '', attachments: photos(4) },
        { id: 'a8', at, author: { kind: 'bot', slug: 'ada' }, body: '', attachments: photos(8) },
      ]);
      const album = (id: string) =>
        bubble(host, id)!.querySelector<HTMLElement>('.bh-message-album')!;
      const tiles = (id: string) => album(id).querySelectorAll('[data-album-tile]');
      expect(['a2', 'a3', 'a4', 'a8'].map((id) => tiles(id).length)).toEqual([2, 3, 4, 5]);
      expect(album('a3').style.gridTemplateColumns).toBe('2fr 1fr');
      expect(
        album('a3').querySelector<HTMLElement>('.bh-message-album-cell')!.style.gridRow,
      ).toContain('span 2');
      expect(album('a8').getAttribute('role')).toBe('group');
      expect(album('a8').getAttribute('aria-label')).toBe('8 张图片');
      expect(album('a8').dataset['albumCount']).toBe('8');
      expect(tiles('a8')[4]!.textContent).toBe('+3');
      expect(tiles('a8')[3]!.textContent).toBe('');
      expect(bubble(host, 'a8')!.querySelectorAll('.bh-message-file')).toHaveLength(0);
      expect(CSS).toMatch(/\.bh-message-album \{[^}]*display: grid;[^}]*gap: 0;/);
    } finally {
      restore(previous);
    }
  });

  it('shows what a quoted media message was inside the quote block', () => {
    const previous = store.getSnapshot();
    const quote = (media: NonNullable<ChannelMessage['replyToPreview']>['media'], body = '') => ({
      author: { kind: 'bot' as const, slug: 'ada' },
      body,
      ...(media === undefined ? {} : { media }),
    });
    try {
      const host = show(dm, [
        {
          id: 'r1',
          at,
          author: { kind: 'human' },
          body: 'this one',
          replyTo: 'q1',
          replyToPreview: quote({ kind: 'image', count: 1, thumbnail: photo('thumb.png') }),
        },
        {
          id: 'r2',
          at,
          author: { kind: 'human' },
          body: 'those',
          replyTo: 'q2',
          replyToPreview: quote({ kind: 'image', count: 3 }),
        },
        {
          id: 'r3',
          at,
          author: { kind: 'human' },
          body: 'heard it',
          replyTo: 'q3',
          replyToPreview: quote({ kind: 'voice', durationMs: 7000 }, 'transcript'),
        },
        {
          id: 'r4',
          at,
          author: { kind: 'human' },
          body: 'got it',
          replyTo: 'q4',
          replyToPreview: quote({ kind: 'file', name: 'report.pdf', count: 1 }),
        },
      ]);
      const block = (id: string) =>
        bubble(host, id)!.querySelector<HTMLElement>('[data-bubble-quote]')!;
      const thumb = block('r1').querySelector('img[data-bubble-quote-thumb]')!;
      expect(thumb.getAttribute('src')).toContain('messageId=q1');
      expect(thumb.getAttribute('src')).toContain('variant=96c');
      expect(block('r1').querySelector('.bh-bubble-reply-body')?.textContent).toBe('图片');
      expect(block('r2').querySelector('img')).toBeNull();
      expect(block('r2').querySelector('.bh-bubble-reply-body')?.textContent).toBe('3 张图片');
      expect(block('r3').querySelector('.bh-bubble-reply-body')?.textContent).toBe('语音 · 0:07');
      expect(block('r4').querySelector('.bh-bubble-reply-body')?.textContent).toBe('report.pdf');
    } finally {
      restore(previous);
    }
  });

  it('puts the delivery check after the Human time and no label above the Human in a group', () => {
    const previous = store.getSnapshot();
    try {
      const host = show(group, [
        { id: 'h1', at, author: { kind: 'human' }, body: 'hello' },
        { id: 'b1', at, author: { kind: 'bot', slug: 'ada' }, body: 'hi' },
        { id: 'h2', at, author: { kind: 'human' }, body: 'later', pending: true },
      ]);
      const identities = host.querySelectorAll('.bh-message-identity');
      expect([...identities].map((node) => node.textContent)).toEqual(['Ada']);
      expect(host.querySelector('.bh-message-group-me .bh-bubble-author')).toBeNull();
      const stamp = bubble(host, 'h1')!.querySelector('.bh-bubble-stamp')!;
      expect(stamp.querySelector('[data-bubble-check]')?.getAttribute('aria-hidden')).toBe('true');
      expect(bubble(host, 'b1')!.querySelector('[data-bubble-check]')).toBeNull();
      expect(bubble(host, 'h2')!.querySelector('[data-bubble-check]')).toBeNull();
    } finally {
      restore(previous);
    }
  });

  it('opens the gallery at the clicked album tile, including the tile that hides the rest', async () => {
    const previous = store.getSnapshot();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    try {
      store.setRoster([ada, bob], [dm]);
      store.select({ kind: 'bot', slug: 'ada' });
      store.setConversation({
        status: 'ready',
        channel: dm,
        sending: false,
        messages: [{ id: 'a8', at, author: { kind: 'human' }, body: '', attachments: photos(8) }],
      });
      await act(async () =>
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
          }),
        ),
      );
      const tiles = container.querySelectorAll<HTMLButtonElement>('[data-album-tile]');
      expect(tiles).toHaveLength(5);
      const dialog = () => document.body.querySelector('[role="dialog"][aria-modal="true"]');
      await act(async () => tiles[1]!.click());
      expect(dialog()?.getAttribute('aria-label')).toBe('图片预览：p2.png');
      expect(dialog()?.textContent).toContain('2 / 8');
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });
      await act(async () => tiles[4]!.click());
      expect(dialog()?.getAttribute('aria-label')).toBe('图片预览：p5.png');
      expect(dialog()?.textContent).toContain('5 / 8');
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      });
      expect(dialog()?.getAttribute('aria-label')).toBe('图片预览：p6.png');
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });
    } finally {
      await act(async () => root.unmount());
      container.remove();
      restore(previous);
    }
  });
});
