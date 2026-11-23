// @vitest-environment jsdom
import { type BotModePrefsSnapshot } from '../src/client/bot-mode-prefs.js';
import { type BotSummary } from '../src/client/store.js';
import { type ChannelSummary } from '../src/client/store.js';
import { act, createElement, Profiler } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { BotSidebar } from '../src/client/bot-sidebar.js';
import { zh, zhTranslate } from '../src/client/locale.js';
import { formatChannelListTime } from '../src/client/channel-row-status.js';
import { store } from '../src/client/store.js';
import {
  AT,
  BOT,
  SECTION_CHANNEL,
  FLAT_CHANNEL,
  DM_CHANNEL,
  stubActions,
  section,
  setRoster,
  prefs,
  setSortMode,
  setSectionSortMode,
  renderSidebar,
  renderRailPreviews,
  environmentProbe,
  captured,
  registerSidebarHooks,
} from './bot-sidebar-helpers.js';

registerSidebarHooks();

vi.mock('../src/client/host-tabs.js', async (original) => ({
  ...(await original<typeof import('../src/client/host-tabs.js')>()),
  useRemoteHosts: () => environmentProbe.snapshot,
}));

vi.mock('../src/client/channel-dock.js', async (original) => ({
  ...(await original<typeof import('../src/client/channel-dock.js')>()),
  useChannelDockActive: () => environmentProbe.dock ?? environmentProbe.snapshot.hosts.length > 0,
}));

vi.mock('../src/client/bot-mode-sidebar-viewport.js', () => ({
  botModeSidebarViewport: () => captured.dock,
  subscribeBotModeSidebarViewport: () => () => {},
}));

vi.mock('../src/client/avatar-appearance-editor.js', () => ({
  AvatarAppearanceEditor: (props: (typeof captured.avatarEditors)[number]) => {
    captured.avatarEditors.push(props);
    return null;
  },
}));

vi.mock('../src/client/ds/tooltip.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/ds/tooltip.js')>();
  return {
    ...actual,
    Tooltip: (props: Parameters<typeof actual.Tooltip>[0]) => {
      if (typeof props.label === 'string') captured.tooltipLabels.push(props.label);
      return actual.Tooltip(props);
    },
  };
});

vi.mock('../src/client/market-upload.js', () => ({
  MarketUploadDialog: (props: { initialSlug?: string | undefined; onListed: () => void }) => {
    captured.uploads.push(props);
    return null;
  },
}));

vi.mock('../src/client/ds/pointer-menu.js', () => ({
  PointerMenu: (props: {
    point: { x: number; y: number };
    items: readonly Record<string, unknown>[];
    onSelect?: (id: string) => void;
  }) => {
    captured.menus.push({ ...props, open: true });
    return null;
  },
}));

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const stub = () => null;
  const icon = (name: string) => (props: { className?: string }) =>
    createElement('span', { 'data-icon': name, className: props.className });
  return {
    ...(await import('./primitive-mocks.js')).shellPrimitives(),
    MarkdownText: ({ text }: { text: string }) => createElement('span', null, text),

    IconCloseFill14: icon('IconCloseFill14'),

    IconTriangleRightFill14: icon('IconTriangleRightFill14'),

    ShortcutKeys: (props: { keys: readonly string[] }) =>
      createElement('kbd', null, props.keys.join(' ')),
    StateDot: stub,

    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

describe('bot sidebar rows', () => {
  it('shows only the latest message time at the right of DM and Group titles', () => {
    const latestAt = '2026-10-10T14:25:00.000Z';
    const latestMessage = {
      id: 'latest',
      at: latestAt,
      author: { kind: 'human' as const },
      body: '最新消息',
    };
    store.setRoster(
      [BOT],
      [{ ...DM_CHANNEL, latestMessage }, { ...SECTION_CHANNEL, latestMessage }, FLAT_CHANNEL],
    );
    const container = document.createElement('div');
    container.innerHTML = renderSidebar();
    for (const channelId of [DM_CHANNEL.id, SECTION_CHANNEL.id]) {
      const titleRow = container.querySelector(`[data-channel-id="${channelId}"] .bh-top`)!;
      const time = titleRow.querySelector('time')!;
      expect(time.getAttribute('datetime')).toBe(latestAt);
      expect(time.textContent).toBe(
        formatChannelListTime(Date.parse(latestAt), Date.now(), zhTranslate),
      );
      expect(titleRow.lastElementChild).toBe(time);
      expect(time.getAttribute('title')).toBe(new Date(latestAt).toLocaleString());
    }
    expect(container.querySelector(`[data-channel-id="${FLAT_CHANNEL.id}"] time`)).toBeNull();
  });

  it('leaves the title time blank for invalid message dates', () => {
    store.setRoster(
      [BOT],
      [
        {
          ...DM_CHANNEL,
          latestMessage: {
            id: 'invalid',
            at: 'invalid',
            author: { kind: 'human' },
            body: '消息',
          },
        },
      ],
    );
    expect(renderSidebar()).not.toContain('bh-channel-message-time');
  });

  it('re-renders only the Bot row whose conversation changed while another Bot streams', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const nova: BotSummary = { ...BOT, slug: 'nova', displayName: 'Nova' };
    const novaDm: ChannelSummary = {
      ...DM_CHANNEL,
      id: 'dm-nova',
      name: 'Nova',
      members: ['nova'],
      botSlug: 'nova',
    };
    store.setRoster([BOT, nova], [DM_CHANNEL, novaDm]);
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(() =>
        root.render(
          createElement(BotSidebar, {
            wide: true,
            actions: stubActions(),
            useBotModePrefs: ((selector: (snapshot: BotModePrefsSnapshot) => unknown) =>
              selector(prefs)) as never,
            setSortMode,
            setSectionSortMode,
            t: zhTranslate,
          }),
        ),
      );
      captured.tooltipLabels.length = 0;
      for (const body of ['写', '写到', '写到一半']) {
        await act(() =>
          store.setRoster(
            [BOT, nova],
            [
              DM_CHANNEL,
              {
                ...novaDm,
                latestMessage: {
                  id: 'nova-reply',
                  at: AT,
                  author: { kind: 'bot', slug: 'nova' },
                  body,
                },
              },
            ],
          ),
        );
      }
      expect(captured.tooltipLabels.filter((label) => label.startsWith('Nova ·'))).toHaveLength(3);
      expect(captured.tooltipLabels.filter((label) => label.startsWith('Atlas ·'))).toEqual([]);
    } finally {
      await act(() => root.unmount());
      node.remove();
    }
  });

  it('does not re-render on Inbox, conversation or session writes it does not show', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    store.setRoster([BOT], [DM_CHANNEL]);
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    let commits = 0;
    try {
      await act(() =>
        root.render(
          createElement(
            Profiler,
            { id: 'sidebar', onRender: () => (commits += 1) },
            createElement(BotSidebar, {
              wide: true,
              actions: stubActions(),
              useBotModePrefs: ((selector: (snapshot: BotModePrefsSnapshot) => unknown) =>
                selector(prefs)) as never,
              setSortMode,
              setSectionSortMode,
              t: zhTranslate,
            }),
          ),
        ),
      );
      commits = 0;
      for (let n = 0; n < 5; n++)
        await act(() => {
          store.setActivityList({ status: n % 2 === 0 ? 'ready' : 'loading', items: [] });
          store.setConversation({ revision: n + 1 });
          store.setSessions({ ...store.getSnapshot().sessions });
        });
      expect(commits).toBe(0);
      await act(() => store.setActivityList({ channelUnread: { [DM_CHANNEL.id]: 3 } }));
      expect(commits).toBeGreaterThan(0);
    } finally {
      await act(() => root.unmount());
      node.remove();
    }
  });

  it('keeps Activity out of the Channel roster in both layouts', () => {
    store.select({ kind: 'inbox' });
    expect(renderSidebar()).not.toContain('bh-activity-list-entry');
    expect(renderSidebar(false)).not.toContain('bh-activity-list-entry');
  });

  it('renders Group conversations with the same two-line anatomy as DMs', () => {
    setRoster({ sections: [section('s1', '工作流', ['c-section'])] });
    store.setRoster(
      [BOT],
      [
        {
          ...SECTION_CHANNEL,
          latestMessage: {
            id: 'group-latest',
            at: AT,
            author: { kind: 'bot', slug: 'atlas' },
            body: '完成第一版\n请查看',
          },
        },
        FLAT_CHANNEL,
      ],
    );
    const markup = renderSidebar();

    expect(markup.match(/bh-channel-row/g)).toHaveLength(2);
    expect(markup).toContain('bh-channel-slot');
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('bh-body');
    expect(markup).toContain('bh-top');
    expect(markup).toContain('bh-name');
    expect(markup).toContain('bh-msg');
    expect(markup).toContain('一级渠道');
    expect(markup).toContain('Atlas：完成第一版 请查看');
    expect(markup).toContain('散装渠道');
    expect(markup).toContain('暂无消息');
  });

  it('localizes system departure previews in the roster and collapsed rail', async () => {
    store.setRoster(
      [BOT],
      [
        {
          ...SECTION_CHANNEL,
          latestMessage: {
            id: 'left',
            at: AT,
            author: { kind: 'system' },
            body: 'Atlas left the Channel.',
            memberDeparture: {
              memberKind: 'bot',
              memberId: 'atlas',
              displayName: 'Atlas',
              departureType: 'left',
            },
          },
        },
        {
          ...FLAT_CHANNEL,
          latestMessage: {
            id: 'removed',
            at: AT,
            author: { kind: 'system' },
            body: 'Bea was removed from the Channel.',
            memberDeparture: {
              memberKind: 'bot',
              memberId: 'bea',
              displayName: 'Bea',
              departureType: 'removed',
            },
          },
        },
      ],
    );

    for (const wide of [true, false]) {
      const markup = wide ? renderSidebar() : await renderRailPreviews();
      expect(markup).toContain('Atlas 退出了频道');
      expect(markup).toContain('Bea 被移出了频道');
      expect(markup).not.toContain('undefined：');
    }
  });

  it('shows the latest DM message below the Bot name', () => {
    store.setRoster(
      [BOT],
      [
        {
          ...DM_CHANNEL,
          latestMessage: {
            id: 'dm-latest',
            at: AT,
            author: { kind: 'human' },
            body: '请继续',
          },
        },
      ],
    );
    const markup = renderSidebar();

    expect(markup).toContain('bh-contact');
    expect(markup).toContain('bh-body');
    expect(markup).toContain('Atlas');
    expect(markup).toContain('你：请继续');
    expect(markup).not.toContain('文件研究助手');
  });

  it('shows each conversation unread count on its row, pinned card and rail icon', () => {
    store.setRoster(
      [{ ...BOT, aggregateState: 'idle' }],
      [
        {
          ...DM_CHANNEL,
          latestMessage: {
            id: 'dm-latest',
            at: AT,
            author: { kind: 'bot', slug: BOT.slug },
            body: '好了',
          },
        },
      ],
    );
    expect(renderSidebar()).not.toContain('bh-unread-count');
    store.setActivityList({ channelUnread: { [DM_CHANNEL.id]: 3 } });
    const wide = renderSidebar();
    expect(wide).toContain('bh-has-unread');
    expect(wide).toMatch(
      /<span class="bh-bottom">.*?<span class="bh-unread-count" aria-label="3 条未读">3<\/span>/u,
    );
    expect(wide).toContain('data-status="done-unread"');
    store.setActivityList({ channelUnread: { [DM_CHANNEL.id]: 120 } });
    expect(renderSidebar(false)).toContain('>99+</span>');
  });

  it('greys a muted conversation and its unread count and marks it with a muted bell', () => {
    store.setRoster([BOT], [DM_CHANNEL]);
    setRoster({ muted: [DM_CHANNEL.id] });
    store.setActivityList({ channelUnread: { [DM_CHANNEL.id]: 2 } });
    const markup = renderSidebar();
    expect(markup).toContain('bh-muted');
    expect(markup).toContain('aria-label="已免打扰"');
    expect(markup).toContain('bh-unread-count bh-unread-count-muted');
  });

  it('shows recent activity for a bodyless latest DM message', () => {
    store.setRoster(
      [BOT],
      [
        {
          ...DM_CHANNEL,
          latestMessage: {
            id: 'dm-action',
            at: AT,
            author: { kind: 'human' },
            body: '',
            botDmAction: {
              channelId: 'dm-other',
              messageId: 'other-message',
              recipientBotSlug: 'other',
            },
          },
        },
      ],
    );

    expect(renderSidebar()).toContain('你：最新动态');
  });

  it('keeps a Group avatar in the roster, pinned grid, and both rail positions', async () => {
    const group = { ...FLAT_CHANNEL, avatar: 'data:image/webp;base64,avatar' };
    store.setRoster([], [group]);

    const roster = renderSidebar();
    expect(roster).toContain('bh-channel-slot bh-group-channel-slot');
    expect(roster).toContain('<img class="bh-group-avatar-image"');

    const ordinaryRail = await renderRailPreviews();
    expect(ordinaryRail).toContain('bh-rail-channel-icon bh-group-channel-icon');
    expect(ordinaryRail.match(/<img class="bh-group-avatar-image"/g)).toHaveLength(2);

    setRoster({ pins: [group.id] });
    const pinned = renderSidebar();
    expect(pinned).toContain('bh-pinned-channel-icon bh-group-pinned-channel-icon');
    expect(pinned).toContain('<img class="bh-group-avatar-image"');

    const pinnedRail = await renderRailPreviews();
    expect(pinnedRail).toContain('bh-rail-channel-icon bh-group-channel-icon');
    expect(pinnedRail.match(/<img class="bh-group-avatar-image"/g)).toHaveLength(2);
  });

  it('stacks member faces for a Group without an avatar in the roster, pinned grid, and rail', async () => {
    const group = { ...FLAT_CHANNEL, members: ['atlas'] };
    store.setRoster([BOT], [group]);

    const roster = renderSidebar();
    expect(roster).toContain('bh-channel-slot bh-group-channel-slot');
    expect(roster.match(/class="bh-group-avatar-stack" data-count="1"/g)).toHaveLength(1);

    const ordinaryRail = await renderRailPreviews();
    expect(ordinaryRail).toContain('bh-rail-channel-icon bh-group-channel-icon');
    expect(ordinaryRail.match(/class="bh-group-avatar-stack"/g)).toHaveLength(2);

    setRoster({ pins: [group.id] });
    const pinned = renderSidebar();
    expect(pinned).toContain('bh-pinned-channel-icon bh-group-pinned-channel-icon');
    expect(pinned).toContain('class="bh-group-avatar-stack"');
    const stack = pinned.slice(pinned.indexOf('class="bh-group-avatar-stack"'));
    expect(stack).toMatch(/^[^]*?class="bh-persona-avatar"[^>]*data-state="idle"/);

    const pinnedRail = await renderRailPreviews();
    expect(pinnedRail.match(/class="bh-group-avatar-stack"/g)).toHaveLength(2);
  });

  it('omits hidden group and DM Channels from the roster, pin grid, and collapsed rail', () => {
    store.setRoster([BOT], [DM_CHANNEL, FLAT_CHANNEL]);
    setRoster({
      pins: [DM_CHANNEL.id],
      hidden: [DM_CHANNEL.id, FLAT_CHANNEL.id],
      topOrder: [{ kind: 'channel', id: FLAT_CHANNEL.id }],
    });

    const wide = renderSidebar();
    expect(wide).not.toContain('Atlas');
    expect(wide).not.toContain('散装渠道');
    expect(wide).toContain(zh['hidden.all']);

    const rail = renderSidebar(false);
    expect(rail).not.toContain('Atlas');
    expect(rail).not.toContain('散装渠道');
  });

  it('moves a deleted Bot DM out of the roster, pin grid, and collapsed rail', () => {
    store.setRoster([{ ...BOT, deleted: true, paused: true }], [DM_CHANNEL, FLAT_CHANNEL]);
    setRoster({
      pins: [DM_CHANNEL.id],
      topOrder: [{ kind: 'channel', id: FLAT_CHANNEL.id }],
    });

    const wide = renderSidebar();
    expect(wide).not.toContain('Atlas');
    expect(wide).toContain('散装渠道');

    const rail = renderSidebar(false);
    expect(rail).not.toContain('Atlas');
    expect(rail).toContain('散装渠道');
  });
});

it('announces pending approvals in the Rail button while preserving working execution', () => {
  store.setRoster([BOT], [DM_CHANNEL]);
  store.applyActivity({
    generation: 'approval-rail-host',
    revision: 1,
    bots: [{ slug: BOT.slug, state: 'working', attention: { approvalCount: 2 } }],
  });
  try {
    const markup = renderSidebar(false);
    expect(markup).toContain('aria-label="Atlas · 正在工作 · 2 个工具待审批"');
    expect(markup).toContain('data-state="working"');
    expect(markup).toContain('data-approval-count="2"');
  } finally {
    store.applyActivity({
      generation: 'approval-rail-host',
      revision: 2,
      bots: [],
    });
  }
});

it('shows one status glyph at the end of the preview line instead of avatar badges', () => {
  store.setRoster([BOT], [DM_CHANNEL]);
  store.applyActivity({
    generation: 'row-status-host',
    revision: 1,
    bots: [{ slug: BOT.slug, state: 'working', attention: { approvalCount: 3 } }],
  });
  setRoster({ sections: [section('s1', '工作流', [DM_CHANNEL.id])] });
  try {
    const markup = renderSidebar();
    const row = markup.slice(markup.indexOf('class="bh-contact'));
    const avatar = row.slice(0, row.indexOf('class="bh-body"'));
    const top = row.slice(row.indexOf('class="bh-top"'), row.indexOf('class="bh-bottom"'));
    const bottom = row.slice(row.indexOf('class="bh-bottom"'), row.indexOf('</button>'));
    const container = document.createElement('div');
    container.innerHTML = markup;
    const portrait = container.querySelector(`[data-channel-id="${DM_CHANNEL.id}"] [role="img"]`);
    expect(portrait?.getAttribute('aria-label')).toContain(BOT.displayName);
    expect(portrait?.closest('[aria-hidden="true"]')).toBeNull();
    expect(avatar).not.toContain('bh-avatar-attention');
    expect(avatar).not.toContain('bh-avatar-botui');
    expect(top).not.toContain('bh-avatar-botui');
    expect(top).not.toContain('bh-row-glyph');
    expect(bottom).toContain('class="bh-row-glyph" data-status="needs-you"');
    expect(bottom).toContain('aria-label="正在等待你"');
    expect(container.querySelector('.bh-section-needs')?.textContent).toBe('1 个需要你');
  } finally {
    store.applyActivity({
      generation: 'row-status-host',
      revision: 2,
      bots: [],
    });
  }
});
