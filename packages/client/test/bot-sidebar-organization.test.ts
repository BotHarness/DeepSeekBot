// @vitest-environment jsdom
import { type BotModePrefsSnapshot } from '../src/client/bot-mode-prefs.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { menuItem } from './primitive-mocks.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BotSidebar } from '../src/client/bot-sidebar.js';
import { typeInto } from './primitive-mocks.js';
import { PINNED_SORT_SCOPE_ID } from '@botharness/host-client/shared/bot-mode-settings';
import { zhTranslate } from '../src/client/locale.js';
import { store } from '../src/client/store.js';
import {
  AT,
  BOT,
  SECTION_CHANNEL,
  FLAT_CHANNEL,
  DM_CHANNEL,
  stubActions,
  config,
  section,
  setRoster,
  setSortMode,
  setSectionSortMode,
  renderRailPreviews,
  rowNames,
  environmentProbe,
  captured,
  registerSidebarHooks,
  prefs as sidebarPrefs,
  renderSidebar as renderSidebarWithPrefs,
  openSidebarMenu as openSidebarMenuWithPrefs,
  setSidebarPrefs,
} from './bot-sidebar-helpers.js';

registerSidebarHooks();

let prefs = sidebarPrefs;

beforeEach(() => {
  prefs = sidebarPrefs;
});

function renderSidebar(wide = true) {
  setSidebarPrefs(prefs);
  return renderSidebarWithPrefs(wide);
}

function openSidebarMenu(label: string) {
  setSidebarPrefs(prefs);
  return openSidebarMenuWithPrefs(label);
}

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
  it('renders the glyph-free section header anatomy', () => {
    setRoster({ sections: [section('s1', '工作流', ['c-section'])] });
    store.setRoster([BOT], [SECTION_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();

    const renderedSection = new DOMParser()
      .parseFromString(markup, 'text/html')
      .querySelector('[data-section-id="s1"]');
    const toggle = renderedSection?.querySelector<HTMLButtonElement>('button[data-group-heading]');
    expect(toggle?.classList.contains('bh-section-head')).toBe(true);
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.querySelector('button')).toBeNull();
    expect(markup).not.toContain('IconTriangleRightFill14');
    expect(markup).not.toContain('bh-arrow');
    expect(markup).not.toContain('bh-row-slot');
    expect(markup).toContain('bh-section-name');
    expect(markup).toContain('data-icon="chevron-down"');
    expect(markup).toContain('data-panel-chevron');
    expect(markup).not.toContain('bh-chevron-collapsed');
    expect(markup).toContain('bh-row-actions');
    expect(markup).toContain('aria-label="「工作流」排序方式"');
    expect(markup).toContain('aria-label="在「工作流」中新建"');
    const menuButtons =
      renderedSection?.querySelectorAll<HTMLButtonElement>('button.bh-row-action');
    expect(menuButtons).toHaveLength(2);
    expect(Array.from(menuButtons ?? []).every((button) => !button.disabled)).toBe(true);
    const createMenu = captured.menus.find(
      (menu) =>
        menu.items.some((item) => item['id'] === 'bot') &&
        menu.items.some((item) => item['id'] === 'channel') &&
        !menu.items.some((item) => item['id'] === 'section'),
    );
    expect(rowNames(openSidebarMenu('在「工作流」中新建'))).toEqual(['创建 Bot', '创建频道']);
  });

  it('keeps an empty pin target collapsed before a drag begins', () => {
    store.setRoster([BOT], [DM_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).toContain('bh-pin-zone bh-pin-zone-empty bh-pin-zone-hidden');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('拖到此处置顶');
    expect(markup.indexOf('bh-pin-zone')).toBeLessThan(markup.indexOf('bh-roster-list'));
  });

  it('renders pinned PersonaBot DMs as draggable cards inside the pin drop zone', () => {
    setRoster({ pins: [DM_CHANNEL.id] });
    store.setRoster([BOT], [DM_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).toContain('bh-pin-zone bh-pin-zone-filled');
    expect(markup).toContain('bh-pinned-grid');
    const pin = new DOMParser()
      .parseFromString(markup, 'text/html')
      .querySelector<HTMLButtonElement>('button.bh-pinned');
    expect(pin?.draggable).toBe(true);
    expect(markup).not.toContain('拖到此处置顶');
    expect(markup).toContain('bh-unpin-zone bh-unpin-zone-hidden');
  });

  it('renders pinned group Channels with their hash glyph and removes their roster row', () => {
    setRoster({ pins: [FLAT_CHANNEL.id] });
    store.setRoster([BOT], [DM_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).toContain('bh-pin-zone bh-pin-zone-filled');
    expect(markup).toContain('bh-pinned-channel-icon');
    expect(markup).toContain('散装渠道');
    expect(markup.match(/bh-channel-row/g) ?? []).toHaveLength(0);
  });

  it('projects every ordered Channel into the collapsed rail with separate pinned and unpinned groups and previews', async () => {
    setRoster({
      pins: [DM_CHANNEL.id],
      sections: [section('s1', '工作流', [SECTION_CHANNEL.id])],
      topOrder: [
        { kind: 'section', id: 's1' },
        { kind: 'channel', id: FLAT_CHANNEL.id },
      ],
    });
    store.setRoster(
      [BOT],
      [
        {
          ...DM_CHANNEL,
          latestMessage: {
            id: 'm1',
            at: AT,
            author: { kind: 'bot', slug: 'atlas' },
            body: '已完成调研',
          },
        },
        {
          ...SECTION_CHANNEL,
          latestMessage: {
            id: 'm2',
            at: AT,
            author: { kind: 'human' },
            body: '继续处理',
          },
        },
        FLAT_CHANNEL,
      ],
    );

    const markup = await renderRailPreviews();

    expect(markup).toContain('bh-region-rail');
    const rail = new DOMParser().parseFromString(markup, 'text/html');
    expect(rail.querySelectorAll('button.bh-rail-channel')).toHaveLength(3);
    expect(markup).toContain('data-rail-unpinned');
    expect(markup.indexOf('Atlas')).toBeLessThan(markup.indexOf('data-rail-unpinned'));
    expect(markup.indexOf('一级渠道')).toBeLessThan(markup.indexOf('散装渠道'));
    expect(markup).toContain('Atlas：已完成调研');
    expect(markup).toContain('你：继续处理');
    expect(markup).toContain('暂无消息');
  });

  it('renders a PersonaBot DM inside a section with the same channel drag lifecycle', () => {
    setRoster({ sections: [section('s1', '工作流', ['dm-atlas'])] });
    store.setRoster([BOT], [DM_CHANNEL]);
    const markup = renderSidebar();

    expect(markup.indexOf('工作流')).toBeLessThan(markup.indexOf('Atlas'));
    expect(markup).toContain('bh-contact');
    expect(markup).toContain('data-channel-id="dm-atlas"');
    expect(markup.match(/draggable="true"/g)).toHaveLength(2);
  });

  it('places a loose PersonaBot DM between sections through topOrder', () => {
    setRoster({
      sections: [section('s1', '工作流', []), section('s2', '研究', [])],
      topOrder: [
        { kind: 'section', id: 's1' },
        { kind: 'channel', id: 'dm-atlas' },
        { kind: 'section', id: 's2' },
      ],
    });
    store.setRoster([BOT], [DM_CHANNEL]);
    const markup = renderSidebar();

    expect(markup.indexOf('工作流')).toBeLessThan(markup.indexOf('Atlas'));
    expect(markup.indexOf('Atlas')).toBeLessThan(markup.indexOf('研究'));
  });

  it('renders the read-only note after a roster write reported storage-unavailable', () => {
    setRoster();
    store.setRosterState({ readOnly: true });
    const markup = renderSidebar();

    expect(markup).toContain('名册存储不可用，陈列只读');
  });

  it('drops the channel run while a section is collapsed', () => {
    setRoster({ sections: [section('s1', '工作流', ['c-section'])] });
    store.setConfig(config({ collapsed: { s1: true } }));
    store.setRoster([], [SECTION_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toMatch(/<button(?=[^>]*data-group-heading="")(?=[^>]*aria-expanded="false")/);
    expect(markup).not.toContain('一级渠道');
    expect(markup).toContain('bh-row-actions');
  });

  it('sorts the pinned grid independently and offers a pinned sort menu', () => {
    const older = {
      ...FLAT_CHANNEL,
      id: 'pin-old',
      name: '旧置顶',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };
    const newer = {
      ...FLAT_CHANNEL,
      id: 'pin-new',
      name: '新置顶',
      updatedAt: '2026-09-19T12:00:00.000Z',
    };
    setRoster({ pins: [older.id, newer.id] });
    store.setRoster([], [older, newer]);

    const auto = renderSidebar();
    expect(auto.indexOf('新置顶')).toBeLessThan(auto.indexOf('旧置顶'));
    expect(auto).toContain('aria-label="置顶排序"');
    let menu = openSidebarMenu('置顶排序');
    expect(rowNames(menu)).toEqual(['最近更新', '手动排序', '恢复自动']);
    expect(menu.querySelector('[data-selected]')?.textContent).toBe('恢复自动');
    act(() => menuItem('手动排序').click());
    expect(setSectionSortMode).toHaveBeenCalledWith(PINNED_SORT_SCOPE_ID, 'manual');
    prefs = { ...prefs, sortModes: { [PINNED_SORT_SCOPE_ID]: 'manual' } };
    captured.menus.length = 0;
    const manual = renderSidebar();
    expect(manual.indexOf('旧置顶')).toBeLessThan(manual.indexOf('新置顶'));
    menu = openSidebarMenu('置顶排序');
    expect(menu.querySelector('[data-selected]')?.textContent).toBe('手动排序');
    act(() => menuItem('恢复自动').click());
    expect(setSectionSortMode).toHaveBeenCalledWith(PINNED_SORT_SCOPE_ID, undefined);
  });

  it('renders the global sort menu from the shared policy store', () => {
    prefs = {
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      sendKey: 'enter' as const,
      autoCollapseMessages: false,
      showDeliveryReceipts: false,
      showDmAvatar: false,
      showOwnAvatar: false,
      streamReplies: false,
      sessionDetailLevel: 'standard',
      sessionCollapse: 'completion',
      sessionFoldedReplies: 'all',
      autoAcceptGroupInvites: true,
      assignmentConcurrencyLimit: 3,
      botHopLimit: 128,
      developerMode: false,
      showBotSessions: false,
      showApprovalReviewSessions: false,
      effectiveMotion: 'full',
      sortMode: 'manual',
      sortModes: {},
      mode: 'host',
      status: 'ready',
    };
    renderSidebar();

    const menu = openSidebarMenu(zhTranslate('roster.menu.label'));
    expect(menu.querySelector('[role=presentation]')?.textContent).toBe('排序方式');
    expect(menu.querySelectorAll('[role=separator]')).toHaveLength(1);
    expect(menu.querySelector('[role=separator]')?.previousElementSibling?.textContent).toBe(
      '手动排序',
    );
    expect(rowNames(menu)).toEqual([
      '最近更新',
      '手动排序',
      '全部标为已读',
      '隐藏的频道与 Bot 私聊',
      '已结束会话的历史',
    ]);
    expect(menu.querySelector('[data-danger]')).toBeNull();
    expect(menu.querySelector('[data-selected]')?.textContent).toBe('手动排序');
  });

  it('writes the shared policy store when the global sort menu picks a mode', () => {
    renderSidebar();

    openSidebarMenu(zhTranslate('roster.menu.label'));
    act(() => menuItem('手动排序').click());
    expect(setSortMode).toHaveBeenCalledWith('manual');

    setSortMode.mockClear();
    openSidebarMenu(zhTranslate('roster.menu.label'));
    act(() => menuItem('全部标为已读').click());
    expect(setSortMode).not.toHaveBeenCalled();
  });

  it('renders the section menu in native order with the mode checked and danger last', () => {
    setRoster({ sections: [section('s1', '工作流', ['c-section'])] });
    prefs = {
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      sendKey: 'enter' as const,
      autoCollapseMessages: false,
      showDeliveryReceipts: false,
      showDmAvatar: false,
      showOwnAvatar: false,
      streamReplies: false,
      sessionDetailLevel: 'standard',
      sessionCollapse: 'completion',
      sessionFoldedReplies: 'all',
      autoAcceptGroupInvites: true,
      assignmentConcurrencyLimit: 3,
      botHopLimit: 128,
      developerMode: false,
      showBotSessions: false,
      showApprovalReviewSessions: false,
      effectiveMotion: 'full',
      sortMode: 'updated',
      sortModes: { s1: 'manual' },
      mode: 'host',
      status: 'ready',
    };
    store.setRoster([], [SECTION_CHANNEL]);
    renderSidebar();

    const menu = openSidebarMenu('「工作流」排序方式');
    expect(rowNames(menu)).toEqual([
      '最近更新',
      '手动排序',
      '恢复自动',
      '上移分组',
      '下移分组',
      '重命名',
      '删除',
    ]);
    expect(menu.querySelectorAll('[role=separator]')).toHaveLength(2);
    expect(
      [...menu.querySelectorAll('[role=separator]')].map(
        (separator) => separator.previousElementSibling?.textContent,
      ),
    ).toEqual(['恢复自动', '下移分组']);
    expect(menuItem('上移分组').getAttribute('aria-disabled')).toBe('true');
    expect(menuItem('下移分组').getAttribute('aria-disabled')).toBe('true');
    expect(menuItem('删除').hasAttribute('data-danger')).toBe(true);
    expect([...menu.querySelectorAll('[role=menuitem]')].at(-1)?.textContent).toBe('删除');
    expect(menu.querySelector('[data-selected]')?.textContent).toBe('手动排序');
  });

  it('checks inherit when a section has no stored mode', () => {
    setRoster({ sections: [section('s1', '工作流', [])] });
    renderSidebar();

    expect(
      openSidebarMenu('「工作流」排序方式').querySelector('[data-selected]')?.textContent,
    ).toBe('恢复自动');
  });

  it('writes section modes through the shared policy and clears with inherit', () => {
    setRoster({ sections: [section('s1', '工作流', [])] });
    renderSidebar();

    openSidebarMenu('「工作流」排序方式');
    act(() => menuItem('手动排序').click());
    expect(setSectionSortMode).toHaveBeenCalledWith('s1', 'manual');

    setSectionSortMode.mockClear();
    openSidebarMenu('「工作流」排序方式');
    act(() => menuItem('恢复自动').click());
    expect(setSectionSortMode).toHaveBeenCalledWith('s1', undefined);

    setSectionSortMode.mockClear();
    openSidebarMenu('「工作流」排序方式');
    act(() => menuItem('上移分组').click());
    expect(setSectionSortMode).not.toHaveBeenCalled();
  });

  it('orders a section by its resolved mode: manual override, else the global default', () => {
    const older = {
      ...SECTION_CHANNEL,
      id: 'c-old',
      name: '旧频道',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };
    const newer = {
      ...SECTION_CHANNEL,
      id: 'c-new',
      name: '新频道',
      updatedAt: '2026-09-19T12:00:00.000Z',
    };
    setRoster({ sections: [section('s1', '工作流', ['c-old', 'c-new'])] });
    store.setRoster([], [older, newer]);

    const auto = renderSidebar();
    expect(auto.indexOf('新频道')).toBeLessThan(auto.indexOf('旧频道'));

    prefs = {
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      sendKey: 'enter' as const,
      autoCollapseMessages: false,
      showDeliveryReceipts: false,
      showDmAvatar: false,
      showOwnAvatar: false,
      streamReplies: false,
      sessionDetailLevel: 'standard',
      sessionCollapse: 'completion',
      sessionFoldedReplies: 'all',
      autoAcceptGroupInvites: true,
      assignmentConcurrencyLimit: 3,
      botHopLimit: 128,
      developerMode: false,
      showBotSessions: false,
      showApprovalReviewSessions: false,
      effectiveMotion: 'full',
      sortMode: 'updated',
      sortModes: { s1: 'manual' },
      mode: 'host',
      status: 'ready',
    };
    const manual = renderSidebar();
    expect(manual.indexOf('旧频道')).toBeLessThan(manual.indexOf('新频道'));

    prefs = {
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      sendKey: 'enter' as const,
      autoCollapseMessages: false,
      showDeliveryReceipts: false,
      showDmAvatar: false,
      showOwnAvatar: false,
      streamReplies: false,
      sessionDetailLevel: 'standard',
      sessionCollapse: 'completion',
      sessionFoldedReplies: 'all',
      autoAcceptGroupInvites: true,
      assignmentConcurrencyLimit: 3,
      botHopLimit: 128,
      developerMode: false,
      showBotSessions: false,
      showApprovalReviewSessions: false,
      effectiveMotion: 'full',
      sortMode: 'manual',
      sortModes: {},
      mode: 'host',
      status: 'ready',
    };
    const inherited = renderSidebar();
    expect(inherited.indexOf('旧频道')).toBeLessThan(inherited.indexOf('新频道'));
  });

  it('sorts loose channels by latest message in updated mode and keeps flat order in manual mode', () => {
    const older = {
      ...FLAT_CHANNEL,
      id: 'c-old',
      name: '旧频道',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };
    const newer = {
      ...FLAT_CHANNEL,
      id: 'c-new',
      name: '新频道',
      updatedAt: '2026-09-19T12:00:00.000Z',
    };
    store.setRoster([], [older, newer]);

    prefs = {
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      sendKey: 'enter' as const,
      autoCollapseMessages: false,
      showDeliveryReceipts: false,
      showDmAvatar: false,
      showOwnAvatar: false,
      streamReplies: false,
      sessionDetailLevel: 'standard',
      sessionCollapse: 'completion',
      sessionFoldedReplies: 'all',
      autoAcceptGroupInvites: true,
      assignmentConcurrencyLimit: 3,
      botHopLimit: 128,
      developerMode: false,
      showBotSessions: false,
      showApprovalReviewSessions: false,
      effectiveMotion: 'full',
      sortMode: 'updated',
      sortModes: {},
      mode: 'host',
      status: 'ready',
    };
    const auto = renderSidebar();
    expect(auto).not.toContain('未分组');
    expect(auto.indexOf('新频道')).toBeLessThan(auto.indexOf('旧频道'));

    prefs = {
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      sendKey: 'enter' as const,
      autoCollapseMessages: false,
      showDeliveryReceipts: false,
      showDmAvatar: false,
      showOwnAvatar: false,
      streamReplies: false,
      sessionDetailLevel: 'standard',
      sessionCollapse: 'completion',
      sessionFoldedReplies: 'all',
      autoAcceptGroupInvites: true,
      assignmentConcurrencyLimit: 3,
      botHopLimit: 128,
      developerMode: false,
      showBotSessions: false,
      showApprovalReviewSessions: false,
      effectiveMotion: 'full',
      sortMode: 'manual',
      sortModes: {},
      mode: 'host',
      status: 'ready',
    };
    const manual = renderSidebar();
    expect(manual.indexOf('旧频道')).toBeLessThan(manual.indexOf('新频道'));
  });

  it('renders a loose channel between sections at its flat position', () => {
    setRoster({
      sections: [section('s1', '工作流', []), section('s2', '研究', [])],
      topOrder: [
        { kind: 'section', id: 's1' },
        { kind: 'channel', id: 'c-flat' },
        { kind: 'section', id: 's2' },
      ],
    });
    store.setRoster([], [FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup.indexOf('工作流')).toBeLessThan(markup.indexOf('散装渠道'));
    expect(markup.indexOf('散装渠道')).toBeLessThan(markup.indexOf('研究'));
    expect(markup).toContain('bh-loose');
  });

  it('wires drag on section and loose channels plus the section header', () => {
    setRoster({ sections: [section('s1', '工作流', ['c-section'])] });
    store.setRoster([], [SECTION_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup.match(/draggable="true"/g)).toHaveLength(3);
    expect(markup).toContain('一级渠道');
    expect(markup).toContain('散装渠道');
  });

  it('renders empty sections as bare headers with no layout-taking drop zone', () => {
    store.setConfig(config());
    setRoster({
      sections: [section('s1', '工作流', ['c-section']), section('s-empty', '空分组', [])],
    });
    store.setRoster([], [SECTION_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();
    expect(markup).toContain('空分组');
    expect(markup).not.toContain('bh-empty-drop');
    expect(markup).not.toContain('bh-drop-scope');
  });

  it('renders a deleted section channel as a loose channel with no bucket', () => {
    setRoster({ sections: [section('s1', '工作流', ['c-section'])] });
    store.setRoster([], [SECTION_CHANNEL]);
    const before = renderSidebar();
    expect(before).toContain('一级渠道');
    expect(before.indexOf('工作流')).toBeLessThan(before.indexOf('一级渠道'));

    setRoster({ sections: [] });
    const after = renderSidebar();
    expect(after).not.toContain('工作流');
    expect(after).not.toContain('未分组');
    expect(after).toContain('一级渠道');
  });
});

describe('section mutation completion', () => {
  it.each(['rename', 'delete'] as const)(
    'retains the %s dialog and local state until the Host succeeds',
    async (kind) => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      const actions = stubActions();
      const mutation = vi
        .fn<() => Promise<boolean>>()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      if (kind === 'rename') actions.renameSection = mutation;
      else actions.removeSection = mutation;
      setRoster({ sections: [section('s1', '工作流', [SECTION_CHANNEL.id])] });
      store.setRoster([], [SECTION_CHANNEL, FLAT_CHANNEL]);
      store.select({ kind: 'channel', channelId: FLAT_CHANNEL.id });
      try {
        await act(async () =>
          root.render(
            createElement(BotSidebar, {
              wide: true,
              actions,
              useBotModePrefs: ((selector: (snapshot: BotModePrefsSnapshot) => unknown) =>
                selector(prefs)) as never,
              setSortMode,
              setSectionSortMode,
              t: zhTranslate as never,
            }),
          ),
        );
        openSidebarMenu('「工作流」排序方式');
        await act(async () => menuItem(kind === 'rename' ? '重命名' : '删除').click());
        const submit = async () => {
          const form = document.querySelector<HTMLFormElement>('[role="dialog"] form');
          if (!form) throw new Error('Missing section dialog');
          await act(async () => form.requestSubmit());
        };
        await submit();
        expect(document.querySelector('[role="dialog"]')).not.toBeNull();
        expect(document.querySelector('[role="alert"]')).not.toBeNull();
        expect(setSectionSortMode).not.toHaveBeenCalled();
        await submit();
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        if (kind === 'delete') expect(setSectionSortMode).toHaveBeenCalledWith('s1', undefined);
        expect(store.getSnapshot().selection).toEqual({
          kind: 'channel',
          channelId: FLAT_CHANNEL.id,
        });
      } finally {
        await act(async () => root.unmount());
        host.remove();
      }
    },
  );
});

it('keeps a successfully created section when the subsequent move fails, without offering duplicate creation', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const actions = stubActions();
  const created = section('new', 'New group', []);
  actions.createSection = vi.fn(async () => {
    setRoster({ sections: [created] });
    return created;
  });
  actions.batchRoster = vi.fn(async () => false);
  store.setRoster([], [FLAT_CHANNEL]);
  try {
    await act(async () =>
      root.render(
        createElement(BotSidebar, {
          wide: true,
          actions,
          useBotModePrefs: ((selector: (snapshot: BotModePrefsSnapshot) => unknown) =>
            selector(prefs)) as never,
          setSortMode,
          setSectionSortMode,
          t: zhTranslate,
        }),
      ),
    );
    await act(async () =>
      host
        .querySelector('[data-channel-id="c-flat"]')!
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    );
    await act(async () => captured.menus.at(-1)?.onSelect?.('new-section'));
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
    await typeInto(input, 'New group');
    await act(async () =>
      document.querySelector<HTMLFormElement>('[role="dialog"] form')!.requestSubmit(),
    );
    expect(actions.createSection).toHaveBeenCalledTimes(1);
    expect(actions.batchRoster).toHaveBeenCalledWith({
      action: 'move',
      channelIds: [FLAT_CHANNEL.id],
      sectionId: 'new',
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(store.getSnapshot().roster.sections).toEqual([created]);
    expect(host.querySelector('.bh-error')?.textContent).toBe(zhTranslate('bulk.failed'));
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
