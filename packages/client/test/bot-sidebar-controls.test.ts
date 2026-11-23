// @vitest-environment jsdom
import { type BotModePrefsSnapshot } from '../src/client/bot-mode-prefs.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { menuItem } from './primitive-mocks.js';
import { describe, expect, it, vi } from 'vitest';
import { BotSidebar } from '../src/client/bot-sidebar.js';
import { createQuickSwitcherLauncher } from '../src/client/quick-switcher-launcher.js';
import { zh, zhTranslate } from '../src/client/locale.js';
import { store } from '../src/client/store.js';
import {
  BOT,
  FLAT_CHANNEL,
  DM_CHANNEL,
  NO_INSTALL,
  stubActions,
  prefs,
  setSortMode,
  setSectionSortMode,
  renderSidebar,
  openSidebarMenu,
  rowNames,
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
  it('orders the header icons search, ellipsis, plus', () => {
    const markup = renderSidebar();
    const search = markup.indexOf('data-icon="search"');
    const ellipsis = markup.indexOf('data-icon="ellipsis"');
    const plus = markup.indexOf('data-icon="plus"');

    expect(search).toBeGreaterThan(-1);
    expect(ellipsis).toBeGreaterThan(search);
    expect(plus).toBeGreaterThan(ellipsis);
  });

  it('opens one quick switcher from the control-rail launcher and from Alt+K, tagged by source', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    store.setRoster([BOT], [DM_CHANNEL]);
    const actions = stubActions();
    const launcher = createQuickSwitcherLauncher();
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    const dialogs = () =>
      document.querySelectorAll(`[role="dialog"][aria-label="${zh['quickSwitcher.title']}"]`);
    try {
      await act(() =>
        root.render(
          createElement(BotSidebar, {
            wide: true,
            actions,
            quickSwitcherSettings: { search: () => [], open: vi.fn(), launcher },
            useBotModePrefs: ((selector: (snapshot: BotModePrefsSnapshot) => unknown) =>
              selector(prefs)) as never,
            setSortMode,
            setSectionSortMode,
            t: zhTranslate,
          }),
        ),
      );
      expect(dialogs()).toHaveLength(0);
      await act(() => launcher.open('rail'));
      await act(() => launcher.open('rail'));
      expect(dialogs()).toHaveLength(1);
      expect(actions.telemetryEvent).toHaveBeenCalledWith('search:switcher_open', {
        source: 'rail',
      });
      await act(() => root.render(null));
      await act(() =>
        root.render(
          createElement(BotSidebar, {
            wide: true,
            actions,
            quickSwitcherSettings: { search: () => [], open: vi.fn(), launcher },
            useBotModePrefs: ((selector: (snapshot: BotModePrefsSnapshot) => unknown) =>
              selector(prefs)) as never,
            setSortMode,
            setSectionSortMode,
            t: zhTranslate,
          }),
        ),
      );
      await act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', altKey: true, bubbles: true }),
        );
      });
      expect(dialogs()).toHaveLength(1);
      expect(actions.telemetryEvent).toHaveBeenLastCalledWith('search:switcher_open', {
        source: 'shortcut',
      });
    } finally {
      await act(() => root.unmount());
      node.remove();
    }
    vi.mocked(actions.telemetryEvent).mockClear();
    launcher.open('rail');
    expect(actions.telemetryEvent).not.toHaveBeenCalled();
  });

  it('offers PersonaBot creation when channels already exist and from the create menu', () => {
    store.setRoster([], [FLAT_CHANNEL]);
    const markup = renderSidebar();
    const menu = openSidebarMenu(zhTranslate('roster.new.label'));

    expect(rowNames(menu)).toEqual(['创建 Bot', '创建频道', '创建频道分组', '市场']);
    expect(menu.querySelector('[role=menuitem]')?.getAttribute('aria-disabled')).not.toBe('true');
    expect(menu.querySelector('[role=menuitem]')?.hasAttribute('aria-haspopup')).toBe(false);
    expect(markup).toContain('还没有 Bot');
    expect(markup).toContain('创建第一个 Bot');
    expect(markup).toContain('散装渠道');
    expect(markup).toContain('placeholder="搜索 Bot 或频道"');
  });

  it('keeps computer enrollment out of the Channels create menu', () => {
    captured.dock = true;
    environmentProbe.snapshot = { hosts: [], avatars: new Map(), tab: 'all' };
    renderSidebar();
    const menu = openSidebarMenu(zhTranslate('roster.new.label'));
    expect(rowNames(menu)).not.toContain(zhTranslate('remoteHosts.add'));
    expect(rowNames(menu)).toContain('创建频道');
  });

  it('blocks Bot creation and explains why while Host Git is unusable', () => {
    store.setGit({
      available: false,
      reason: 'too-old',
      version: '2.20.1',
      ...NO_INSTALL,
    });
    const markup = renderSidebar();
    openSidebarMenu(zhTranslate('roster.new.label'));
    const createBot = menuItem('创建 Bot');

    expect(markup).toContain('data-git-unavailable="too-old"');
    expect(markup).toContain('需要 Git 才能创建 Bot');
    expect(markup).toContain('Git 2.20.1 版本太旧，需要 2.28 或更新版本。');
    expect(markup).toContain('href="https://botharness.ai/zh/docs/installation/#git"');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>创建第一个 Bot<\/button>/);
    expect(createBot.getAttribute('aria-disabled')).toBe('true');
  });

  it('names a missing Git and a Git that cannot run differently', () => {
    store.setGit({ available: false, reason: 'missing', ...NO_INSTALL });
    expect(renderSidebar()).toContain('这台电脑上没有找到 Git。');
    store.setGit({ available: false, reason: 'unrunnable', ...NO_INSTALL });
    expect(renderSidebar()).toContain('macOS 需要先安装命令行开发者工具');
  });

  it('offers a one-step Managed Git install and shows its progress and failures', () => {
    store.setGit({
      available: false,
      reason: 'missing',
      installable: true,
      install: { phase: 'idle' },
    });
    let markup = renderSidebar();
    expect(markup).toContain('data-git-install="idle"');
    expect(markup).toMatch(/<button[^>]*>安装 Git<\/button>/);
    expect(markup).toContain('不需要管理员权限');
    expect(markup).toContain('重新检测');

    store.setGit({
      available: false,
      reason: 'missing',
      installable: true,
      install: {
        phase: 'downloading',
        received: 12 * 1024 * 1024,
        total: 62 * 1024 * 1024,
      },
    });
    markup = renderSidebar();
    expect(markup).toContain('正在下载 Git… 12.0 / 62.0 MB');
    expect(markup).toMatch(/<progress[^>]*max="65011712"/);
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>正在安装…<\/button>/);
    expect(markup).not.toContain('重新检测');

    store.setGit({
      available: false,
      reason: 'missing',
      installable: true,
      install: { phase: 'failed', reason: 'network', detail: 'ENOTFOUND' },
    });
    markup = renderSidebar();
    expect(markup).toContain('下载失败，请检查网络后重试。');
    expect(markup).toMatch(/<button[^>]*>重试安装<\/button>/);
  });

  it('leaves out the install button where no pinned build exists', () => {
    store.setGit({ available: false, reason: 'missing', ...NO_INSTALL });
    const markup = renderSidebar();
    expect(markup).not.toContain('安装 Git</button>');
    expect(markup).toContain('安装或升级后重启 DeepSeek Harness');
  });

  it('shows no Git notice once Host Git is usable', () => {
    const markup = renderSidebar();
    openSidebarMenu(zhTranslate('roster.new.label'));
    const createBot = menuItem('创建 Bot');

    expect(markup).not.toContain('data-git-unavailable');
    expect(createBot.getAttribute('aria-disabled')).not.toBe('true');
  });
});
