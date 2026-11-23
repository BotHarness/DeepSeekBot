// @vitest-environment jsdom
import { type BotModePrefsSnapshot } from '../src/client/bot-mode-prefs.js';
import { type BotSummary } from '../src/client/store.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BotSidebar, BulkChannelMenu, ChannelMoveMenu } from '../src/client/bot-sidebar.js';
import { seededAvatarFor } from '../../core/src/bots/avatar-appearance.js';
import { isolateTeamIdentity, setTeamModeSnapshot } from '../src/client/team-state.js';
import { UNGROUPED_MOVE_TARGET } from '../src/client/section-management.js';
import { zhTranslate } from '../src/client/locale.js';
import { store } from '../src/client/store.js';
import { WindowCompanions } from '../src/client/window-companions.js';
import {
  BOT,
  SECTION_CHANNEL,
  FLAT_CHANNEL,
  DM_CHANNEL,
  stubActions,
  section,
  prefs,
  setSortMode,
  setSectionSortMode,
  menuWithItem,
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
  it('selects and removes a companion through the real DM context menu without changing Channel pins', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    store.setRoster([BOT], [DM_CHANNEL]);
    const actions = stubActions();
    const source = vi.fn(() => ({ addEventListener() {}, close() {} }));
    const companion = new WindowCompanions({
      context: async () => ({ profileId: 'sidebar-qa' }),
      source,
      update: async () => {},
    });
    await companion.start();
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(() =>
        root.render(
          createElement(BotSidebar, {
            wide: true,
            actions,
            companion,
            useBotModePrefs: ((selector: (snapshot: BotModePrefsSnapshot) => unknown) =>
              selector(prefs)) as never,
            setSortMode,
            setSectionSortMode,
            t: zhTranslate,
          }),
        ),
      );
      const open = () =>
        node
          .querySelector('[data-channel-id="dm-atlas"]')!
          .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      await act(open);
      expect(
        menuWithItem('companion').items.find((item) => item['id'] === 'companion')?.['label'],
      ).toBe(zhTranslate('companion.show'));
      await act(() => menuWithItem('companion').onSelect!('companion'));
      expect(companion.get('atlas')?.getSnapshot().selection?.botId).toBe('atlas');
      expect(actions.setChannelPinned).not.toHaveBeenCalled();
      expect(source).toHaveBeenCalledOnce();
      captured.menus.length = 0;
      await act(open);
      expect(
        menuWithItem('companion').items.find((item) => item['id'] === 'companion')?.['label'],
      ).toBe(zhTranslate('companion.remove'));
      await act(() => menuWithItem('companion').onSelect!('companion'));
      expect(companion.get('atlas')).toBeUndefined();
      expect(actions.setChannelPinned).not.toHaveBeenCalled();
    } finally {
      await act(() => root.unmount());
      node.remove();
      companion.dispose();
    }
  });

  it('opens Marketplace upload for the right-clicked Bot from its DM context menu', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    store.setRoster([BOT], [DM_CHANNEL]);
    const open = vi.fn();
    captured.uploads.length = 0;
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
            dockPanels: { open } as never,
            t: zhTranslate,
          }),
        ),
      );
      await act(() =>
        node
          .querySelector('[data-channel-id="dm-atlas"]')!
          .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
      );
      expect(
        menuWithItem('share-market').items.find((item) => item['id'] === 'share-market')?.['label'],
      ).toBe('分享到市场');
      await act(() => menuWithItem('share-market').onSelect!('share-market'));
      expect(captured.uploads.at(-1)?.initialSlug).toBe('atlas');
      captured.uploads.at(-1)?.onListed();
      expect(open).toHaveBeenCalledWith('bot-market');
    } finally {
      await act(() => root.unmount());
      node.remove();
    }
  });

  it.each([
    ['owner', 'image', true],
    ['owner', 'appearance', true],
    ['owner', 'blobatar', false],
    ['member', 'image', false],
    ['member', 'appearance', false],
  ] as const)(
    'shows the Bot Avatar publish menu for %s with %s: %s',
    async (kind, source, visible) => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      const bot: BotSummary = { ...BOT };
      if (source === 'image') bot.avatar = '/api/botharness/bot-avatar?slug=atlas&v=1';
      if (source === 'appearance')
        bot.appearance = { recipe: seededAvatarFor('Atlas', 2), revision: 'preview' };
      store.setRoster([bot], [DM_CHANNEL]);
      const open = vi.fn();
      const teamCall = vi.fn();
      isolateTeamIdentity(teamCall);
      setTeamModeSnapshot(teamCall, {
        enabled: true,
        ownerPasswordSet: false,
        insecureHttpAllowed: false,
        memberUrls: [],
        isolation: 'trial',
        viewer: {
          kind,
          humanId: kind,
          displayName: kind,
          mustChangePassword: false,
          owner: kind === 'owner',
          permissions: ['bots.manageAll'],
          roleIds: [],
        },
      });
      const node = document.createElement('div');
      document.body.append(node);
      const root = createRoot(node);
      try {
        await act(async () =>
          root.render(
            createElement(BotSidebar, {
              wide: true,
              actions: { ...stubActions(), teamCall },
              useBotModePrefs: ((selector: (snapshot: BotModePrefsSnapshot) => unknown) =>
                selector(prefs)) as never,
              setSortMode,
              setSectionSortMode,
              dockPanels: { open } as never,
              t: zhTranslate,
            }),
          ),
        );
        await act(async () =>
          node
            .querySelector('[data-channel-id="dm-atlas"]')
            ?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
        );
        const menu = menuWithItem('share-market');
        expect(menu.items.some((item) => item['id'] === 'publish-avatar')).toBe(visible);
        if (visible) {
          await act(async () => menu.onSelect?.('publish-avatar'));
          expect(open).toHaveBeenCalledWith('bot-market');
        }
      } finally {
        await act(async () => root.unmount());
        node.remove();
      }
    },
  );

  it('changes a Bot avatar from its DM context menu through the Profile avatar editor', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    store.setRoster([BOT], [DM_CHANNEL]);
    captured.avatarEditors.length = 0;
    const actions = stubActions();
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(() =>
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
      await act(() =>
        node
          .querySelector('[data-channel-id="dm-atlas"]')!
          .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
      );
      const menu = menuWithItem('change-avatar');
      const ids = menu.items.filter((item) => item['type'] === undefined).map((item) => item['id']);
      expect(ids.slice(0, 2)).toEqual(['profile', 'change-avatar']);
      expect(menu.items.find((item) => item['id'] === 'change-avatar')).toMatchObject({
        label: '修改头像…',
      });
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      await act(() => menu.onSelect!('change-avatar'));
      const dialog = document.querySelector('[role="dialog"]');
      expect(dialog?.getAttribute('aria-label')).toBe(zhTranslate('profile.avatar.section'));
      const editor = captured.avatarEditors.at(-1)!;
      expect(editor.bot.slug).toBe('atlas');
      expect(editor.channelId).toBe('dm-atlas');
      const recipe = { version: 1 };
      await act(async () => {
        await editor.onSave('dm-atlas', recipe);
      });
      expect(actions.setBotAppearance).toHaveBeenCalledWith('dm-atlas', recipe);
    } finally {
      await act(() => root.unmount());
      node.remove();
    }
  });

  it('anchors a Channel menu at viewport coordinates and exposes localized profile navigation', () => {
    const profileAction = vi.fn();
    renderToStaticMarkup(
      createElement(ChannelMoveMenu, {
        menu: { channelId: DM_CHANNEL.id, x: 140, y: 180 },
        sections: [],
        currentSectionId: undefined,
        t: zhTranslate,
        profileAction,
        onPick: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    const menu = captured.menus.at(-1)!;
    expect(menu.point).toMatchObject({ x: 140, y: 180 });
    expect(menu.items[0]).toMatchObject({ id: 'profile', label: '查看资料' });
    menu.onSelect?.('profile');
    expect(profileAction).toHaveBeenCalledOnce();
  });

  it('opens the shared model picker from a Bot DM row', async () => {
    const actions = stubActions();
    const route = { provider: 'deepseek', model: 'flash' };
    actions.modelCatalog = vi.fn(async () => ({
      default: route,
      models: [{ ...route, providerName: 'DeepSeek', modelName: 'Flash', efforts: [] }],
    }));
    store.setRoster([BOT], [DM_CHANNEL]);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          createElement(BotSidebar, {
            wide: true,
            actions,
            useBotModePrefs: (selector) => selector(prefs),
            setSortMode,
            setSectionSortMode,
            t: zhTranslate,
          }),
        ),
      );
      await act(async () =>
        host
          .querySelector(`[data-channel-id="${DM_CHANNEL.id}"]`)!
          .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
      );
      await act(async () => menuWithItem('bot-model').onSelect?.('bot-model'));
      const modelTrigger = document.body.querySelector<HTMLButtonElement>(
        'button[data-picker-trigger]',
      )!;
      await act(async () => modelTrigger.click());
      expect(
        document.body.querySelector('[role="dialog"] [data-picker-filter="deepseek"]'),
      ).not.toBeNull();
      expect(
        document.body.querySelector('[data-filter-picker] input[role="combobox"]'),
      ).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it('renders the 移动到 menu from every section plus 未分组 and maps picks to scopes', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    const onRename = vi.fn();
    const onCreateSection = vi.fn();
    renderToStaticMarkup(
      createElement(ChannelMoveMenu, {
        menu: { channelId: 'c-section', x: 40, y: 80 },
        sections: [section('s1', '工作流', []), section('s2', '研究', [])],
        currentSectionId: 's1',
        t: zhTranslate as never,
        onPick,
        onRename,
        onCreateSection,
        onClose,
      }),
    );

    const menu = captured.menus.at(-1);
    if (menu === undefined) throw new Error('move menu not rendered');
    const items = menu.items as readonly {
      id: string;
      submenu?: readonly { id: string }[];
    }[];
    expect(items.map((item) => item.id)).toEqual([
      'pin',
      'pin-separator',
      'move',
      'channel-action-separator',
      'rename',
      'hide-separator',
      'hide',
    ]);
    expect(items[2]?.submenu?.map((item) => item.id)).toEqual([
      'new-section',
      's1',
      's2',
      UNGROUPED_MOVE_TARGET,
    ]);

    const onSelect = menu.onSelect as (id: string) => void;
    onSelect('s2');
    expect(onPick).toHaveBeenCalledWith('s2');
    onSelect(UNGROUPED_MOVE_TARGET);
    expect(onPick).toHaveBeenCalledWith(undefined);
    onSelect('rename');
    expect(onRename).toHaveBeenCalledWith('c-section');
    onSelect('new-section');
    expect(onCreateSection).toHaveBeenCalledWith('c-section');
  });

  it('uses a count-aware bulk menu and keeps destructive deletion unavailable', () => {
    const onPick = vi.fn();
    const onPin = vi.fn();
    const onHide = vi.fn();
    const onCreateSection = vi.fn();
    renderToStaticMarkup(
      createElement(BulkChannelMenu, {
        menu: {
          channelId: DM_CHANNEL.id,
          channelIds: [DM_CHANNEL.id, SECTION_CHANNEL.id],
          x: 40,
          y: 80,
        },
        sections: [section('s1', '工作流', [])],
        itemsLabel: '2 个频道',
        t: zhTranslate as never,
        onPick,
        onPin,
        onHide,
        onCreateSection,
        onClose: vi.fn(),
      }),
    );
    const menu = captured.menus.at(-1);
    if (menu === undefined) throw new Error('bulk menu not rendered');
    expect(menu.items.map((item) => item['id'])).toEqual([
      'pin',
      'bulk-pin-separator',
      'move',
      'bulk-action-separator',
      'hide',
    ]);
    expect(menu.items[0]?.['label']).toBe('置顶 2 个频道');
    expect(menu.items[2]?.['label']).toBe('将 2 个频道 移动到');
    expect(menu.items[4]?.['label']).toBe('隐藏 2 个频道');
    menu.onSelect?.('pin');
    expect(onPin).toHaveBeenCalledOnce();
    expect(onPin).toHaveBeenCalledWith(true);
    menu.onSelect?.('s1');
    expect(onPick).toHaveBeenCalledWith('s1');
    menu.onSelect?.(UNGROUPED_MOVE_TARGET);
    expect(onPick).toHaveBeenCalledWith(undefined);
    menu.onSelect?.('new-section');
    expect(onCreateSection).toHaveBeenCalledOnce();
    menu.onSelect?.('hide');
    expect(onHide).toHaveBeenCalledOnce();
  });

  it('offers bulk unpin and move for channels selected in the pin area', () => {
    const onPick = vi.fn();
    const onPin = vi.fn();
    renderToStaticMarkup(
      createElement(BulkChannelMenu, {
        menu: {
          channelId: DM_CHANNEL.id,
          channelIds: [DM_CHANNEL.id, FLAT_CHANNEL.id],
          x: 40,
          y: 80,
        },
        sections: [section('s1', '工作流', [])],
        itemsLabel: '2 个频道',
        allPinned: true,
        t: zhTranslate as never,
        onPick,
        onPin,
        onCreateSection: vi.fn(),
        onHide: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    const menu = captured.menus.at(-1);
    if (menu === undefined) throw new Error('pinned bulk menu not rendered');
    expect(menu.items.map((item) => item['id'])).toEqual([
      'unpin',
      'bulk-pin-separator',
      'move',
      'bulk-action-separator',
      'hide',
    ]);
    expect(menu.items[0]?.['label']).toBe('取消置顶 2 个频道');
    menu.onSelect?.('unpin');
    expect(onPin).toHaveBeenCalledOnce();
    expect(onPin).toHaveBeenCalledWith(false);
    menu.onSelect?.('s1');
    expect(onPick).toHaveBeenCalledWith('s1');
  });

  it('offers the same organization actions on ordinary and pinned Channel menus', () => {
    const onSetPinned = vi.fn();
    const onHide = vi.fn();
    const onPick = vi.fn();
    const onClose = vi.fn();
    renderToStaticMarkup(
      createElement(ChannelMoveMenu, {
        menu: { channelId: DM_CHANNEL.id, x: 40, y: 80 },
        sections: [section('s1', '工作流', [])],
        currentSectionId: 's1',
        t: zhTranslate as never,
        onSetPinned,
        onHide,
        onPick,
        onClose,
      }),
    );

    let menu = captured.menus.at(-1);
    if (menu === undefined) throw new Error('PersonaBot menu not rendered');
    expect(menu.items.map((item) => item['id'])).toEqual([
      'pin',
      'pin-separator',
      'move',
      'channel-action-separator',
      'rename',
      'hide-separator',
      'hide',
    ]);
    menu.onSelect?.('pin');
    expect(onSetPinned).toHaveBeenCalledWith(DM_CHANNEL.id, true);
    expect(onPick).not.toHaveBeenCalled();
    menu.onSelect?.('hide');
    expect(onHide).toHaveBeenCalledWith(DM_CHANNEL.id);

    renderToStaticMarkup(
      createElement(ChannelMoveMenu, {
        menu: { channelId: DM_CHANNEL.id, pinnedView: true, x: 40, y: 80 },
        sections: [section('s1', '工作流', [])],
        currentSectionId: 's1',
        pinned: true,
        t: zhTranslate as never,
        onSetPinned,
        onHide,
        onPick,
        onClose,
      }),
    );

    menu = captured.menus.at(-1);
    if (menu === undefined) throw new Error('pinned PersonaBot menu not rendered');
    expect(menu.items.map((item) => item['id'])).toEqual([
      'unpin',
      'pin-separator',
      'move',
      'channel-action-separator',
      'rename',
      'hide-separator',
      'hide',
    ]);
    menu.onSelect?.('unpin');
    expect(onSetPinned).toHaveBeenLastCalledWith(DM_CHANNEL.id, false);
    menu.onSelect?.('hide');
    expect(onHide).toHaveBeenLastCalledWith(DM_CHANNEL.id);
  });

  it('puts Mark as read right after Pin on the Channel menu when the Channel has unread messages', () => {
    const read = vi.fn();
    renderToStaticMarkup(
      createElement(ChannelMoveMenu, {
        menu: { channelId: DM_CHANNEL.id, x: 40, y: 80 },
        sections: [],
        currentSectionId: undefined,
        readAction: { label: '标为已读', run: read },
        t: zhTranslate as never,
        onPick: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    const menu = captured.menus.at(-1);
    if (menu === undefined) throw new Error('Channel menu not rendered');
    const ids = menu.items.map((item) => item['id']);
    expect(ids.slice(ids.indexOf('pin'), ids.indexOf('pin') + 3)).toEqual([
      'pin',
      'mark-read',
      'pin-separator',
    ]);
    menu.onSelect?.('mark-read');
    expect(read).toHaveBeenCalledOnce();
  });

  it('offers Mute or Unmute right after Pin on the Channel menu', () => {
    const mute = vi.fn();
    for (const muted of [false, true]) {
      renderToStaticMarkup(
        createElement(ChannelMoveMenu, {
          menu: { channelId: DM_CHANNEL.id, x: 40, y: 80 },
          sections: [],
          currentSectionId: undefined,
          muteAction: {
            label: muted ? '取消免打扰' : '免打扰',
            muted,
            run: mute,
          },
          t: zhTranslate as never,
          onPick: vi.fn(),
          onClose: vi.fn(),
        }),
      );
      const menu = captured.menus.at(-1);
      if (menu === undefined) throw new Error('Channel menu not rendered');
      const id = muted ? 'unmute' : 'mute';
      const ids = menu.items.map((item) => item['id']);
      expect(ids.slice(ids.indexOf('pin'), ids.indexOf('pin') + 3)).toEqual([
        'pin',
        id,
        'pin-separator',
      ]);
      menu.onSelect?.(id);
    }
    expect(mute).toHaveBeenCalledTimes(2);
  });

  it('gives every Channel menu row an icon and offers Delete Bot last as a danger row', () => {
    const share = vi.fn();
    const market = vi.fn();
    const companion = vi.fn();
    const remove = vi.fn();
    renderToStaticMarkup(
      createElement(ChannelMoveMenu, {
        menu: { channelId: DM_CHANNEL.id, x: 40, y: 80 },
        sections: [section('s1', '工作流', [])],
        currentSectionId: 's1',
        t: zhTranslate as never,
        companionAction: { label: '显示为窗口伙伴', run: companion },
        shareAction: { label: '分享', run: share },
        marketAction: market,
        deleteAction: { label: '删除 Bot', run: remove },
        onPick: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    const menu = captured.menus.at(-1);
    if (menu === undefined) throw new Error('PersonaBot menu not rendered');
    const rows = menu.items.filter((item) => item['type'] === undefined);
    expect(rows.map((item) => item['id'])).toEqual([
      'companion',
      'share',
      'share-market',
      'pin',
      'move',
      'rename',
      'hide',
      'delete',
    ]);
    for (const row of rows) expect(row['icon']).toBeDefined();
    expect(rows.at(-1)?.['danger']).toBe(true);
    expect(rows.find((row) => row['id'] === 'share-market')?.['label']).toBe('分享到市场');
    menu.onSelect?.('share-market');
    expect(market).toHaveBeenCalledOnce();
    menu.onSelect?.('delete');
    expect(remove).toHaveBeenCalledOnce();
  });

  it('offers Channel settings first, then nickname and DM action toggles beside Rename', () => {
    const openSettings = vi.fn();
    const editNickname = vi.fn();
    const toggle = vi.fn();
    renderToStaticMarkup(
      createElement(ChannelMoveMenu, {
        menu: { channelId: DM_CHANNEL.id, x: 40, y: 80 },
        sections: [section('s1', '工作流', [])],
        currentSectionId: 's1',
        t: zhTranslate as never,
        settingsAction: { attention: true, run: openSettings },
        nicknameAction: editNickname,
        dmActions: {
          hidden: ['memory'],
          toggle,
          memoryDisplay: 'compact',
          setMemoryDisplay: vi.fn(),
        },
        onPick: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    const menu = captured.menus.at(-1);
    if (menu === undefined) throw new Error('PersonaBot menu not rendered');
    expect(menu.items.map((item) => item['id'])).toEqual([
      'settings',
      'settings-separator',
      'pin',
      'pin-separator',
      'move',
      'channel-action-separator',
      'rename',
      'nickname',
      'dm-actions',
      'hide-separator',
      'hide',
    ]);
    const dmRow = menu.items.find((item) => item['id'] === 'dm-actions') as
      | { submenu?: readonly { id: string }[] }
      | undefined;
    expect(dmRow?.submenu?.map((item) => item.id)).toEqual([
      'dm:posts',
      'dm:memory',
      'dm:memory-display:compact',
      'dm:memory-display:detailed',
    ]);
    menu.onSelect?.('settings');
    expect(openSettings).toHaveBeenCalledOnce();
    menu.onSelect?.('nickname');
    expect(editNickname).toHaveBeenCalledOnce();
    menu.onSelect?.('dm:memory');
    expect(toggle).toHaveBeenCalledWith('memory');
  });
});
