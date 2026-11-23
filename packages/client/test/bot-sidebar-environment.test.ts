// @vitest-environment jsdom
import { type BotModePrefsSnapshot } from '../src/client/bot-mode-prefs.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { menuItem } from './primitive-mocks.js';
import { describe, expect, it, vi } from 'vitest';
import { BotSidebar } from '../src/client/bot-sidebar.js';
import { typeInto } from './primitive-mocks.js';
import { zhTranslate } from '../src/client/locale.js';
import { store } from '../src/client/store.js';
import * as hostTabs from '../src/client/host-tabs.js';
import * as hostLooks from '../src/client/host-looks.js';
import {
  SECTION_CHANNEL,
  FLAT_CHANNEL,
  stubActions,
  config,
  section,
  setRoster,
  prefs,
  setSortMode,
  setSectionSortMode,
  openSidebarMenu,
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
  it.each(['member', 'admin'])(
    'retains local sections, pins and create actions for docked %s pages',
    async (role) => {
      vi.stubGlobal('__DSH_REMOTE_ACCESS__', { owner: false, role });
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      captured.dock = true;
      environmentProbe.dock = true;
      environmentProbe.snapshot = { hosts: [], avatars: new Map(), tab: 'all' };
      const remote = vi
        .spyOn(hostTabs, 'useRemoteHosts')
        .mockReturnValue({ hosts: [], avatars: new Map(), tab: 'all' });
      const look = vi.spyOn(hostLooks, 'useHostName');
      setRoster({ pins: ['c-flat'], sections: [section('s1', '工作流', ['c-section'])] });
      store.setRoster([], [SECTION_CHANNEL, FLAT_CHANNEL]);
      const actions = stubActions();
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
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
        expect(host.querySelector('.bh-section-name')?.textContent).toContain('工作流');
        expect(host.querySelector('[data-environment-channel]')).toBeNull();
        expect(
          host.querySelector('[data-section-id="s1"] [data-channel-id="c-section"]'),
        ).not.toBeNull();
        expect(host.querySelector('.bh-pin-zone')).not.toBeNull();
        expect(host.querySelector('[data-channel-id="c-section"]')?.getAttribute('draggable')).toBe(
          'true',
        );
        const sectionMenu = captured.menus.find(
          (menu) =>
            menu.items.some((item) => item['id'] === 'bot') &&
            menu.items.some((item) => item['id'] === 'channel') &&
            !menu.items.some((item) => item['id'] === 'section'),
        );
        expect(
          sectionMenu?.items.find((item) => item['id'] === 'bot')?.['submenu'],
        ).toBeUndefined();
        captured.menus.length = 0;
        await act(async () =>
          host
            .querySelector('[data-channel-id="c-section"]')!
            .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
        );
        await act(async () => menuWithItem('pin').onSelect?.('pin'));
        expect(actions.setChannelPinned).toHaveBeenCalledWith('c-section', true);
        openSidebarMenu(zhTranslate('roster.new.label'));
        await act(async () => menuItem('创建频道分组').click());
        expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
          '创建频道分组',
        );
        const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
        await typeInto(input, 'Member section');
        await act(async () =>
          document.querySelector<HTMLFormElement>('[role="dialog"] form')!.requestSubmit(),
        );
        expect(actions.createSection).toHaveBeenCalledWith('Member section');
        expect(look).not.toHaveBeenCalled();
      } finally {
        await act(async () => root.unmount());
        host.remove();
        remote.mockRestore();
        look.mockRestore();
      }
    },
  );
});

describe('All Environment local row interactions', () => {
  async function mountMixed(pinned = true, includeRemote = true) {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    environmentProbe.snapshot = {
      tab: 'all',
      avatars: new Map(),
      hosts: includeRemote
        ? [
            {
              host: {
                hostId: 'remote',
                hostName: 'Remote',
                routes: ['http://localhost:12345'],
                credential: 'fixture',
                deviceId: 'device',
              },
              snapshot: {
                connection: { status: 'connected', route: 'http://localhost:12345' },
                roster: { bots: [], channels: [] },
              },
              inbox: {
                status: 'ready',
                sections: { action: [], replies: [], unread: [], handled: [] },
                unread: {},
              },
            },
          ]
        : [],
    };
    store.setRoster([], [SECTION_CHANNEL, FLAT_CHANNEL]);
    setRoster({
      pins: pinned ? [FLAT_CHANNEL.id] : [],
      sections: [section('s1', 'Collapsed', [SECTION_CHANNEL.id])],
    });
    store.setConfig(config({ collapsed: { s1: true } }));
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    const actions = stubActions();
    await act(() =>
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
    return { node, root, actions };
  }
  it('keeps pinned channels visible in All after the last remote is removed', async () => {
    const { node, root } = await mountMixed(true, false);
    try {
      expect(node.querySelector('[data-channel-id="c-flat"]')).not.toBeNull();
    } finally {
      await act(() => root.unmount());
      node.remove();
    }
  });
  it('keeps Host-owned Section membership unchanged when dragging in All', async () => {
    const { node, root, actions } = await mountMixed(false);
    const dispatch = (target: Element, type: string) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: 0 });
      Object.defineProperty(event, 'dataTransfer', {
        value: { effectAllowed: '', setData: vi.fn(), dropEffect: '' },
      });
      target.dispatchEvent(event);
    };
    try {
      const source = node.querySelector('[data-channel-id="c-section"]')!;
      const target = node.querySelector('[data-channel-id="c-flat"]')!;
      expect(source.getAttribute('draggable')).toBe('false');
      expect(target.getAttribute('draggable')).toBe('false');
      await act(() => dispatch(source, 'dragstart'));
      await act(() => dispatch(target, 'dragover'));
      await act(() => dispatch(target, 'drop'));
      expect(actions.moveToFlat).not.toHaveBeenCalled();
      expect(actions.reorderFlat).not.toHaveBeenCalled();
      expect(store.getSnapshot().roster.sections).toEqual([
        section('s1', 'Collapsed', [SECTION_CHANNEL.id]),
      ]);
    } finally {
      await act(() => root.unmount());
      node.remove();
    }
  });
  it('offers Unpin for a pinned channel presented as a mixed row', async () => {
    const { node, root } = await mountMixed();
    try {
      const row = node.querySelector('[data-channel-id="c-flat"]');
      if (!row) throw Error('missing pinned mixed row');
      await act(() =>
        row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
      );
      expect(menuWithItem('unpin').items.some((item) => item['id'] === 'pin')).toBe(false);
    } finally {
      await act(() => root.unmount());
      node.remove();
    }
  });
  it('selects a displayed channel from a collapsed section and ranges in mixed order', async () => {
    const { node, root } = await mountMixed();
    try {
      const rows = [
        ...node.querySelectorAll<HTMLButtonElement>('[data-environment-channel] [data-channel-id]'),
      ];
      expect(rows.map((row) => row.dataset.channelId)).toEqual(['c-flat', 'c-section']);
      const sectionRow = rows.find((row) => row.dataset.channelId === 'c-section');
      if (!sectionRow) throw Error('missing section mixed row');
      await act(() =>
        sectionRow.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })),
      );
      expect(sectionRow.getAttribute('aria-pressed')).toBe('true');
      const first = rows[0];
      if (!first) throw Error('missing first row');
      await act(() =>
        first.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })),
      );
      expect(rows.map((row) => row.getAttribute('aria-pressed'))).toEqual(['true', 'true']);
    } finally {
      await act(() => root.unmount());
      node.remove();
    }
  });
});
