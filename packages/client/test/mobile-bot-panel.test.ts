// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeActions } from '../src/client/actions.js';
import { BotModePrefs } from '../src/client/bot-mode-prefs.js';
import { createChannelSidebarRegistry } from '../src/client/channel-sidebar.js';

import {
  CompactNavigationHeader,
  MobileConversationHeader,
} from '../src/client/mobile-conversation-header.js';
import { MobileBotPanel, mountMobileBotShell } from '../src/client/mobile-bot-panel.js';
import type { BotModeSidebarProps } from '../src/client/bot-mode-sidebar.js';
import { en, type BotHarnessTranslate } from '../src/client/locale.js';
import { MOBILE_BOT_CSS } from '../src/client/mobile-bot-styles.js';
import {
  clearConversationDrafts,
  conversationDraftKey,
  useConversationDraft,
} from '../src/client/conversation-draft.js';
import { ComposerDraftStore } from '../src/client/composer-draft-store.js';
import { store } from '../src/client/store.js';
import { buttonNamed } from './primitive-mocks.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./primitive-mocks.js')).shellPrimitives(),
);

vi.mock('../src/client/bot-main.js', () => ({
  BotPanel: ({
    openCompactSidebar,
    t,
  }: {
    openCompactSidebar?: () => void;
    t: BotHarnessTranslate;
  }) =>
    createElement(
      'div',
      null,
      openCompactSidebar &&
        createElement(CompactNavigationHeader, {
          title: 'Tob',
          openSidebar: openCompactSidebar,
          t,
        }),
      createElement('input', { 'aria-label': 'Message Tob' }),
    ),
}));

vi.mock('../src/client/bot-mode-sidebar.js', () => ({
  BotModeSidebar: ({ closeDrawer, toggleSidebar, collapsed, t }: BotModeSidebarProps) =>
    createElement(
      'nav',
      { 'aria-label': 'Messages' },
      createElement(
        'button',
        { type: 'button', onClick: toggleSidebar, 'data-modal-autofocus': '' },
        t(
          closeDrawer
            ? 'panel.sidebar.close'
            : collapsed
              ? 'panel.sidebar.open'
              : 'panel.sidebar.collapse',
        ),
      ),
      createElement('button', { type: 'button', onClick: closeDrawer }, 'Tob'),
    ),
}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let width: number;
const listeners = new Set<() => void>();
const labels = new Map(Object.entries(en));
const t: BotHarnessTranslate = (key) => labels.get(key) ?? key;

beforeEach(() => {
  width = 400;
  store.select(undefined);
  store.setComposerIdentity(undefined);
  localStorage.clear();
  clearConversationDrafts();
  listeners.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return width >= Number(query.match(/\d+/)?.[0]);
    },
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
  }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function resize(next: number): void {
  act(() => {
    width = next;
    for (const listener of [...listeners]) listener();
  });
}

function renderPanel(): void {
  const prefs = new BotModePrefs();
  act(() =>
    root.render(
      createElement(MobileBotPanel, {
        t,
        actions: {} as BridgeActions,
        channelSidebar: createChannelSidebarRegistry(),
        useBotModePrefs: (selector) => selector(prefs.source.getSnapshot()),
        setSortMode: vi.fn(),
        setSectionSortMode: vi.fn(),
        openBotSettings: vi.fn(),
      }),
    ),
  );
}

function open(): HTMLButtonElement {
  const trigger = buttonNamed('Open sidebar', container);
  trigger.focus();
  act(() => trigger.click());
  return trigger;
}

it('opens the compact drawer as a labelled modal and closes it from its close button', () => {
  renderPanel();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  open();
  const dialog = document.querySelector<HTMLElement>(
    '[role="dialog"][aria-label="Bot mode navigation"]',
  );
  if (dialog === null) throw new Error('The sidebar drawer did not open');
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  act(() => buttonNamed('Close sidebar', dialog).click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('closes the compact drawer when choosing a conversation or clicking the scrim', () => {
  renderPanel();
  open();
  act(() => buttonNamed('Tob').click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  open();
  act(() => document.querySelector<HTMLElement>('[data-tobs-dialog-scrim]')?.click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('keeps the same conversation mounted across the compact, medium and expanded shell', () => {
  renderPanel();
  const composer = container.querySelector('input');
  if (composer === null) throw new Error('The conversation did not mount');
  composer.value = 'Draft';
  open();
  resize(600);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(
    container.querySelector('[data-bot-window-class]')?.getAttribute('data-bot-window-class'),
  ).toBe('medium');
  act(() => buttonNamed('Collapse sidebar', container).click());
  expect(buttonNamed('Open sidebar', container)).toBeTruthy();
  resize(840);
  expect(container.querySelector('nav')).toBeNull();
  expect(container.querySelector('input')).toBe(composer);
  expect(composer.value).toBe('Draft');
  resize(400);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('keeps the compact conversation actions named and operable', () => {
  const callbacks = {
    openSidebar: vi.fn(),
    onSettings: vi.fn(),
    onFiles: vi.fn(),
    onInbox: vi.fn(),
  };
  act(() =>
    root.render(
      createElement(MobileConversationHeader, {
        ...callbacks,
        title: 'Tob',
        settingsOpen: false,
        filesOpen: true,
        inboxOpen: false,
        t,
      }),
    ),
  );
  const pairs = [
    [t('panel.sidebar.open'), callbacks.openSidebar],
    [t('mobile.channelSettings'), callbacks.onSettings],
    [t('generatedFiles.title'), callbacks.onFiles],
    [t('entry.botInbox'), callbacks.onInbox],
  ] as const;
  for (const [label, callback] of pairs) {
    const button = buttonNamed(label, container);
    button.focus();
    act(() => button.click());
    expect(callback).toHaveBeenCalledOnce();
  }
  expect(buttonNamed(t('generatedFiles.title'), container).getAttribute('aria-expanded')).toBe(
    'true',
  );
});

describe('Compact layout compatibility', () => {
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
    container.innerHTML =
      '<div><aside><div data-slot="sidebar"></div></aside><main><section></section></main></div>';
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

function click(name: string): void {
  act(() => buttonNamed(name, container).click());
}

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
