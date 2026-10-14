// @vitest-environment jsdom
import { act, createElement, type ReactElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronLeftOutlineRegular: () => createElement('svg', { 'aria-hidden': true }),
  IconCloseOutlineRegular: () => createElement('svg', { 'aria-hidden': true }),
  IconFlatListOutlineRegular: () => createElement('svg', { 'aria-hidden': true }),
  IconSettingsOutlineRegular: () => createElement('svg', { 'aria-hidden': true }),
}));
vi.mock('../src/client/bot-icon.js', () => ({
  BotIcon: ({ icon }: { icon: string }) =>
    createElement('span', { 'data-bot-mode-icon': icon, 'aria-hidden': true }),
}));
vi.mock('../src/client/bot-main.js', () => ({
  BotPanel: ({ onMobileBack, t }: { onMobileBack?: () => void; t: BotHarnessTranslate }) =>
    createElement(
      'div',
      { 'data-conversation': true },
      onMobileBack === undefined || store.getSnapshot().selection === undefined
        ? null
        : createElement(MobileConversationHeader, {
            title: store.getSnapshot().selection?.kind === 'bot' ? 'Alpha' : 'Group',
            onBack: onMobileBack,
            onSettings: () => {},
            settingsOpen: false,
            t,
          }),
      'Existing composer',
    ),
}));
vi.mock('../src/client/bot-sidebar.js', () => ({
  BotSidebar: ({ headerEnd }: { headerEnd?: ReactNode }) =>
    createElement(
      'div',
      { className: 'bh-region' },
      createElement('div', { className: 'bh-header' }, 'Messages', headerEnd),
      createElement(
        'button',
        { className: 'bh-contact', onClick: () => store.select({ kind: 'bot', slug: 'alpha' }) },
        'Alpha',
      ),
      createElement(
        'button',
        {
          className: 'bh-channel-row',
          onClick: () => store.select({ kind: 'channel', channelId: 'group' }),
        },
        'Group',
      ),
    ),
}));

import { MobileBotPanel, mountMobileBotShell } from '../src/client/mobile-bot-panel.js';
import { MobileConversationHeader } from '../src/client/mobile-conversation-header.js';
import { MOBILE_BOT_QUERY } from '../src/client/mobile-viewport.js';
import { MOBILE_BOT_CSS } from '../src/client/mobile-bot-styles.js';
import {
  clearConversationDrafts,
  useConversationDraft,
  conversationDraftKey,
} from '../src/client/conversation-draft.js';
import { en, zhTranslate, type BotHarnessTranslate } from '../src/client/locale.js';
import { store } from '../src/client/store.js';
import { ComposerDraftStore } from '../src/client/composer-draft-store.js';
import { BotModePrefs, type BotModePrefsSnapshot } from '../src/client/bot-mode-prefs.js';
import type { BotModeIcon } from '../src/bot-mode-settings.js';
import type { BridgeActions } from '../src/client/actions.js';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let mobile = true;
const english = new Map(Object.entries(en));
const enTranslate: BotHarnessTranslate = (key) => english.get(key) ?? key;
const viewportListeners = new Set<() => void>();

beforeEach(() => {
  mobile = true;
  viewportListeners.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return mobile;
      },
      addEventListener: (_event: string, listener: () => void) => viewportListeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) =>
        viewportListeners.delete(listener),
    })),
  );
  store.select(undefined);
  localStorage.clear();
  clearConversationDrafts();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function click(name: string): void {
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.getAttribute('aria-label') === name || item.textContent?.trim() === name,
  );
  expect(button, name).toBeDefined();
  act(() => button?.click());
}

describe('Mobile Bot navigation', () => {
  function renderPanel(t = enTranslate, icon: BotModeIcon = 'mascot') {
    const exitBotMode = vi.fn();
    const openBotSettings = vi.fn();
    const prefs = new BotModePrefs();
    prefs.setBotIcon(icon);
    const actions = {
      openActivityCenter: async () => {
        store.select({ kind: 'inbox' });
      },
    };
    act(() =>
      root.render(
        createElement(MobileBotPanel, {
          actions: actions as BridgeActions,
          prefs,
          channelSidebar: { entries: [] } as never,
          useBotModePrefs: ((select: (value: BotModePrefsSnapshot) => unknown) =>
            select(prefs.source.getSnapshot())) as never,
          t,
          exitBotMode,
          openBotSettings,
          setSortMode: vi.fn(),
          setSectionSortMode: vi.fn(),
        }),
      ),
    );
    return { exitBotMode, openBotSettings };
  }

  it('opens DM and Group, hides bottom navigation in chat and restores the exact list node/scroll', () => {
    renderPanel();
    expect(window.matchMedia).toHaveBeenCalledWith(MOBILE_BOT_QUERY);
    const list = container.querySelector<HTMLElement>('.bh-region')!;
    list.scrollTop = 238;
    click('Alpha');
    expect(container.querySelector('.bh-mobile-shell')?.getAttribute('data-page')).toBe(
      'conversation',
    );
    expect(container.querySelector('.bh-mobile-nav')).toBeNull();
    click('Back to conversations');
    expect(store.getSnapshot().selection).toBeUndefined();
    expect(container.querySelector('.bh-region')).toBe(list);
    expect(list.scrollTop).toBe(238);
    click('Group');
    expect(store.getSnapshot().selection).toEqual({ kind: 'channel', channelId: 'group' });
    click('Back to conversations');
    click('Alpha');
    expect(container.querySelector('.bh-mobile-shell')?.getAttribute('data-page')).toBe(
      'conversation',
    );
  });

  it('connects only existing top-level actions and restores the desktop component on resize', () => {
    const { exitBotMode, openBotSettings } = renderPanel();
    expect(container.querySelectorAll('.bh-mobile-nav button')).toHaveLength(3);
    click('Activity Center');
    expect(container.querySelector('.bh-mobile-shell')?.getAttribute('data-page')).toBe('inbox');
    expect(container.querySelector<HTMLElement>('.bh-mobile-content')?.hidden).toBe(false);
    click('Conversations');
    expect(container.querySelector('.bh-mobile-shell')?.getAttribute('data-page')).toBe('list');
    click('Bot settings');
    expect(openBotSettings).toHaveBeenCalledOnce();
    click('Exit Bot mode');
    expect(exitBotMode).toHaveBeenCalledOnce();
    act(() => {
      mobile = false;
      for (const listener of viewportListeners) listener();
    });
    expect(container.querySelector('.bh-mobile-shell')).toBeNull();
    expect(container.textContent).toBe('Existing composer');
  });

  it('opens an already selected conversation from the list after restore or rotation', () => {
    store.select({ kind: 'bot', slug: 'alpha' });
    renderPanel();
    expect(container.querySelector('.bh-mobile-shell')?.getAttribute('data-page')).toBe('list');
    click('Alpha');
    expect(container.querySelector('.bh-mobile-shell')?.getAttribute('data-page')).toBe(
      'conversation',
    );
  });

  it('stays on the list when the Host restores its last conversation after mounting', () => {
    renderPanel();
    act(() => store.select({ kind: 'channel', channelId: 'group' }));
    expect(container.querySelector('.bh-mobile-shell')?.getAttribute('data-page')).toBe('list');
    click('Group');
    expect(container.querySelector('.bh-mobile-shell')?.getAttribute('data-page')).toBe(
      'conversation',
    );
  });

  it('provides translated touch and keyboard button names', () => {
    renderPanel(zhTranslate);
    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe('Bot 模式导航');
    click('Alpha');
    click('返回会话列表');
    expect(container.querySelectorAll('.bh-mobile-nav button')).toHaveLength(3);
  });

  it('uses one list header and icon-only top-level navigation with accessible names', () => {
    renderPanel();
    expect(container.querySelector('.bh-mobile-header')).toBeNull();
    expect(container.querySelectorAll('.bh-header')).toHaveLength(1);
    const buttons = [...container.querySelectorAll('.bh-mobile-nav button')];
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Conversations',
      'Activity Center',
      'Bot settings',
    ]);
    for (const button of buttons) {
      expect(button.textContent).toBe('');
      expect(button.querySelector('svg')).not.toBeNull();
    }
    click('Alpha');
    const header = container.querySelector('.bh-mobile-conversation-header')!;
    expect(header.querySelector('h1')?.textContent).toBe('Alpha');
    expect(header.querySelector('button')?.textContent).toBe('');
    expect(container.querySelector('.bh-mobile-header')).toBeNull();
  });

  it('draws the mobile chrome from design-system styles by role and name', () => {
    renderPanel();
    const byRole = (role: string, name: string) =>
      [...container.querySelectorAll<HTMLElement>(role)].find(
        (item) => item.getAttribute('aria-label') === name || item.textContent === name,
      );
    const navigation = byRole('nav', 'Bot mode navigation')!;
    expect(navigation.className).toMatch(/^bh-mobile-nav bhx/);
    for (const name of ['Conversations', 'Activity Center', 'Bot settings'])
      expect(byRole('button', name)?.className, name).toMatch(/^bhx/);
    const exit = byRole('button', 'Exit Bot mode')!;
    expect(exit.className).toMatch(/^bh-mobile-exit bhx/);
    const current = byRole('button', 'Conversations')!;
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(current.className).not.toBe(byRole('button', 'Bot settings')!.className);
    click('Activity Center');
    expect(byRole('button', 'Back to conversations')?.className).toMatch(/^bhx/);
    expect(byRole('button', 'Exit Bot mode')?.className).not.toBe(exit.className);
    click('Back to conversations');
    click('Alpha');
    const heading = byRole('h1', 'Alpha')!;
    expect(heading.className).toMatch(/^bhx/);
    expect(heading.closest('header')?.className).toMatch(/^bh-mobile-conversation-header bhx/);
    expect(byRole('button', 'Conversation settings')?.className).toMatch(/^bhx/);
  });

  it('keeps only cross-component overrides in the mobile stylesheet', () => {
    for (const own of [
      '.bh-mobile-shell {',
      '.bh-mobile-header',
      '.bh-mobile-nav {',
      '.bh-mobile-exit',
      '.bh-mobile-conversation-header',
    ])
      expect(MOBILE_BOT_CSS).not.toContain(own);
    expect(MOBILE_BOT_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(MOBILE_BOT_CSS).toContain('.bh-mobile-list .bh-header-label { font-size: 16px;');
  });

  it('connects the conversation back and settings icons without truncating accessible names', () => {
    const onBack = vi.fn();
    const onSettings = vi.fn();
    const title = 'A deliberately long Group name';
    act(() =>
      root.render(
        createElement(MobileConversationHeader, {
          title,
          onBack,
          onSettings,
          settingsOpen: true,
          t: enTranslate,
        }),
      ),
    );
    expect(container.querySelector('h1')?.getAttribute('title')).toBe(title);
    expect(
      container.querySelector('[aria-controls="bh-channel-sidebar"] svg path')?.getAttribute('d'),
    ).toBe('M4 6h16M4 12h16M4 18h16');
    expect(
      container
        .querySelector('[aria-controls="bh-channel-sidebar"]')
        ?.getAttribute('aria-expanded'),
    ).toBe('true');
    click('Conversation settings');
    expect(onSettings).toHaveBeenCalledOnce();
    click('Back to conversations');
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('fits larger header actions and preserves settings inside the Channel sidebar', () => {
    container.innerHTML = `<style>${MOBILE_BOT_CSS}</style>
      <div class="bh-mobile-list"><div class="bh-header-actions"></div></div>
      <div class="bh-mobile-content"><div class="bh-chat-layout">
        <button class="bh-sidebar-toggle"></button>
        <div class="bh-channel-sidebar"><button class="bh-sidebar-toggle bh-sidebar-settings"></button></div>
      </div></div>`;
    const actions = container.querySelector('.bh-header-actions')!;
    expect(getComputedStyle(actions).maxWidth).toBe('92px');
    actions.classList.add('bh-header-actions-hidden');
    expect(getComputedStyle(actions).maxWidth).toBe('0');
    expect(getComputedStyle(container.querySelector('.bh-chat-layout > button')!).display).toBe(
      'none',
    );
    expect(getComputedStyle(container.querySelector('.bh-sidebar-settings')!).display).not.toBe(
      'none',
    );
  });

  it('keeps the sidebar settings button at the mobile right inset without moving desktop', () => {
    container.innerHTML = `<style>
      .bh-channel-sidebar-head .bh-sidebar-settings-menu { right: 44px; }
      ${MOBILE_BOT_CSS}
      </style>
      <div class="bh-mobile-content"><div class="bh-channel-sidebar-head"><div class="bh-sidebar-settings-menu"></div></div></div>
      <div class="bh-channel-sidebar-head"><div class="bh-sidebar-settings-menu"></div></div>`;
    expect(
      getComputedStyle(container.querySelector('.bh-mobile-content .bh-sidebar-settings-menu')!)
        .right,
    ).toBe('8px');
    expect(
      getComputedStyle(container.querySelector(':scope > .bh-channel-sidebar-head > div')!).right,
    ).toBe('44px');
  });

  it.each(['mascot', 'simple', 'blob', 'bot'] as const)(
    'reuses the selected %s Bot-mode identity for Exit',
    (icon) => {
      renderPanel(enTranslate, icon);
      expect(
        container
          .querySelector('.bh-mobile-exit [data-bot-mode-icon]')
          ?.getAttribute('data-bot-mode-icon'),
      ).toBe(icon);
    },
  );

  it('keeps mobile search borders within their slot and hides only the duplicate Activity title', () => {
    container.innerHTML = `<style>${MOBILE_BOT_CSS}</style>
      <div class="bh-mobile-list"><div class="bh-search bh-search-open"></div></div>
      <div class="bh-mobile-content"><header class="bh-activity-center-header"><h1>Activity Center</h1><div role="tablist"></div></header></div>
      <header class="bh-activity-center-header"><h1>Desktop Activity Center</h1></header>`;
    const search = getComputedStyle(container.querySelector('.bh-search-open')!);
    expect(search.width).toBe('100%');
    expect(search.marginInline).toBe('0');
    expect(getComputedStyle(container.querySelector('.bh-mobile-content h1')!).display).toBe(
      'none',
    );
    expect(
      getComputedStyle(container.querySelector('.bh-mobile-content [role="tablist"]')!).display,
    ).not.toBe('none');
    expect(getComputedStyle(container.querySelector(':scope > header h1')!).display).not.toBe(
      'none',
    );
  });

  it('ellipsizes only the empty mobile placeholder without changing message whitespace', () => {
    container.innerHTML = `<style>${MOBILE_BOT_CSS}</style>`;
    const sheet = container.querySelector('style')!.sheet!;
    const rule = [...sheet.cssRules].find(
      (entry) =>
        entry instanceof CSSStyleRule &&
        entry.selectorText === '.bh-mobile-content .bh-composer-rich-input:empty::before',
    );
    expect(rule).toBeDefined();
    if (!(rule instanceof CSSStyleRule)) throw new Error('Missing mobile placeholder rule');
    expect(rule.style.getPropertyValue('text-overflow')).toBe('ellipsis');
    expect(rule.style.getPropertyValue('white-space')).toBe('nowrap');
    expect(rule.style.getPropertyValue('overflow')).toBe('hidden');
    expect(rule.style.getPropertyValue('max-width')).toBe('100%');
    expect(
      [...sheet.cssRules].some(
        (entry) =>
          entry instanceof CSSStyleRule &&
          entry.selectorText === '.bh-mobile-content .bh-composer-rich-input',
      ),
    ).toBe(false);
  });

  it('owns only the measured native sidebar attribute and removes it on disposal', () => {
    container.innerHTML = '<div><aside><nav></nav></aside><main><section></section></main></div>';
    const section = container.querySelector('section')!;
    const sidebar = container.querySelector('aside')!;
    const release = mountMobileBotShell(section);
    expect(sidebar.getAttribute('data-bh-mobile-sidebar')).toBe('true');
    expect(section.style.getPropertyValue('--bh-mobile-height')).not.toBe('');
    release();
    expect(sidebar.hasAttribute('data-bh-mobile-sidebar')).toBe(false);
    expect(section.style.getPropertyValue('--bh-mobile-height')).toBe('');
  });

  it('tracks visual viewport keyboard contraction and removes its listeners on exit', () => {
    const viewport = new EventTarget();
    Object.assign(viewport, { height: 520, offsetTop: 24 });
    vi.stubGlobal('visualViewport', viewport);
    const release = mountMobileBotShell(container);
    expect(container.style.getPropertyValue('--bh-mobile-height')).toBe('520px');
    expect(container.style.getPropertyValue('--bh-mobile-top')).toBe('24px');
    Object.assign(viewport, { height: 844, offsetTop: 0 });
    viewport.dispatchEvent(new Event('resize'));
    expect(container.style.getPropertyValue('--bh-mobile-height')).toBe('844px');
    release();
    viewport.dispatchEvent(new Event('scroll'));
    expect(container.style.getPropertyValue('--bh-mobile-height')).toBe('');
  });
});

describe('Conversation drafts', () => {
  it('preserves text, functional updates and mention context across unmounts without leaking to another Channel', () => {
    function Draft({ scope }: { scope: string }): ReactElement {
      const [text, setText] = useConversationDraft(scope, 'text', '');
      const [mentions, setMentions] = useConversationDraft(scope, 'mentions', []);
      return createElement(
        'button',
        {
          onClick: () => {
            setText((previous) => `${previous}draft`);
            setMentions([{ botSlug: 'alpha', label: 'Alpha', start: 0, end: 5 }]);
          },
        },
        `${scope}:${text}:${mentions.length}`,
      );
    }
    act(() => root.render(createElement(Draft, { key: 'dm', scope: 'dm' })));
    click('dm::0');
    act(() => root.render(createElement(Draft, { key: 'group', scope: 'group' })));
    expect(container.textContent).toBe('group::0');
    act(() => root.render(createElement(Draft, { key: 'dm', scope: 'dm' })));
    expect(container.textContent).toBe('dm:draft:1');
    click('dm:draft:1');
    expect(container.textContent).toBe('dm:draftdraft:1');
  });

  it('waits for trusted Host/Profile and Channel identity before accessing persisted input', () => {
    store.select({ kind: 'bot', slug: 'alpha' });
    store.setComposerIdentity(undefined);
    expect(conversationDraftKey(store.getSnapshot())).toBeUndefined();
    store.setComposerIdentity({ hostId: 'host', profileId: 'profile', humanId: 'human' });
    store.setRoster(
      [],
      [
        {
          id: 'dm-alpha',
          type: 'dm',
          botSlug: 'alpha',
          name: 'Alpha',
          members: [],
          createdAt: '',
          updatedAt: '',
        },
        { id: 'group', type: 'group', name: 'Group', members: [], createdAt: '', updatedAt: '' },
      ],
    );
    expect(conversationDraftKey(store.getSnapshot())).toBe('["host","profile","human","dm-alpha"]');
    store.select({ kind: 'channel', channelId: 'group' });
    expect(conversationDraftKey(store.getSnapshot())).toBe('["host","profile","human","group"]');
    store.setComposerIdentity(undefined);
  });

  it('restores reply, channel refs and uploads and keeps late failures in the originating draft', () => {
    let restoreFailedSend: (() => void) | undefined;
    function Draft({ scope }: { scope: string }): ReactElement {
      const [text, setText] = useConversationDraft(scope, 'text', '');
      const [reply, setReply] = useConversationDraft(scope, 'reply', undefined);
      const [refs, setRefs] = useConversationDraft(scope, 'channelRefs', []);
      const [uploads, setUploads] = useConversationDraft(scope, 'uploads', []);
      return createElement(
        'button',
        {
          onClick: () => {
            setReply({
              id: 'reply',
              at: '2026-10-12T00:00:00Z',
              author: { kind: 'human' },
              body: 'Reply',
            });
            setRefs([{ channelId: 'group', label: 'Group', start: 0, end: 6 }]);
            setUploads([{ id: 'upload', file: new File(['hello'], 'hello.txt'), status: 'ready' }]);
            restoreFailedSend = () => setText('failed send');
          },
        },
        `${scope}:${text}:${reply?.id ?? ''}:${refs.length}:${uploads.length}`,
      );
    }
    const dm = JSON.stringify(['host', 'profile', 'human', 'dm']);
    const group = JSON.stringify(['host', 'profile', 'human', 'group']);
    act(() => root.render(createElement(Draft, { key: dm, scope: dm })));
    click(`${dm}:::0:0`);
    act(() => root.render(createElement(Draft, { key: group, scope: group })));
    act(() => restoreFailedSend?.());
    expect(container.textContent).toBe(`${group}:::0:0`);
    act(() => root.render(createElement(Draft, { key: dm, scope: dm })));
    expect(container.textContent).toBe(`${dm}:failed send:reply:1:1`);
    const reopened = new ComposerDraftStore(localStorage, 'reopened');
    expect(reopened.read(dm).draft.text).toBe('failed send');
    expect(reopened.read(group).draft.text).toBe('');
  });
});
