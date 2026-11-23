// @vitest-environment jsdom
import { mountAppearanceFixture } from './appearance-fixture.js';
import { type ChannelMessage } from '../src/client/store.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { menuItem } from './primitive-mocks.js';
import type { BridgeActions } from '../src/client/actions.js';
import { BotModePrefs } from '../src/client/bot-mode-prefs.js';
import {
  botNameColor,
  contrastRatio,
  parseColor,
  REFERENCE_SURFACES,
} from '../src/client/bot-primary-color.js';
import { seededAvatarFor } from '../../core/src/bots/avatar-appearance.js';
import { BotMain } from '../src/client/bot-main.js';
import { createChannelSidebarRegistry } from '../src/client/channel-sidebar.js';
import { zhTranslate } from '../src/client/locale.js';
import { store } from '../src/client/store.js';
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

describe('Bot main Sessions pane', () => {
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
    expect(markup).not.toContain('>发送中<');
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
    expect(markup).not.toContain('>发送中<');
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
    const group = {
      ...dm,
      id: 'group-team',
      type: 'group' as const,
      name: 'Team',
    };
    const messages: ChannelMessage[] = [
      { id: 'human-1', at, author: { kind: 'human' }, body: 'hello' },
      {
        id: 'bot-1',
        at,
        author: { kind: 'bot', slug: 'ada' },
        body: 'an existing reply',
      },
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
      store.setConversation({
        status: 'ready',
        channel,
        sending: false,
        messages,
      });
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
    const appearance = mountAppearanceFixture();
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
      appearance.owner.update({ preference: 'dark' });
      const dark = authors(white, group)[0]!;
      expect(dark.getAttribute('data-bot-name-color')).toBe('#ffffff');
      expect(dark.style.color).not.toBe('');
      expect(contrast('#ffffff', 'dark')).toBeGreaterThanOrEqual(4.5);

      const [groupBot] = authors(white, group);
      expect(groupBot!.getAttribute('data-bot-name-color')).toBe('#ffffff');
      appearance.owner.update({ preference: 'light' });
      expect(authors(white, group)[0]!.getAttribute('data-bot-name-color')).toBe(light);
      const gone = bot({ mode: 'custom', color: '#ffffff', retained: '#1d1b22' }, true);
      expect(authors(gone, group)[0]!.getAttribute('data-bot-name-color')).toBe('#1d1b22');
    } finally {
      appearance.dispose();
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

  it('keeps times out of adjacent Bot bubbles and mounts no toolbar until hover', () => {
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
    const parsed = document.createElement('div');
    parsed.innerHTML = markup;
    const anchors = parsed.querySelectorAll('.bh-message-group-avatar-link, .bh-bubble-author');
    expect(anchors).toHaveLength(2);
    expect([...anchors].every((anchor) => anchor.parentElement?.id.startsWith('base-ui-'))).toBe(
      true,
    );
    const start = markup.indexOf('class="bh-message-group"');
    const group = markup.slice(start, markup.indexOf('class="bh-bubble-wrap', start));
    expect(group).toContain('class="bh-persona-avatar"');
    expect(group).not.toMatch(/class="bh-persona-avatar"[^>]*title=/);
    expect(markup).not.toContain('bh-bubble-time');
    expect(markup).not.toContain('bh-bubble-meta');
    expect(markup).not.toMatch(/<time[^>]*dateTime="2026-09-21T00:01:00.000Z"/);
    expect(markup).not.toContain('bh-bubble-toolbar');
    expect(markup).toContain('bh-bubble-focused');
    expect(markup).not.toMatch(/<time[^>]*dateTime="2026-09-21T00:01:05.000Z"/);
    expect(markup).not.toContain('data-unread-divider');
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
    expect([...popup.querySelectorAll('[role=menuitem]')].map((item) => item.textContent)).toEqual([
      zhTranslate('message.quote'),
      zhTranslate('message.react'),
      zhTranslate('message.copy'),
      zhTranslate('message.select'),
      zhTranslate('feedback.title'),
    ]);
    const identity = store.getSnapshot().composerIdentity;
    await act(async () =>
      store.setComposerIdentity({
        hostId: 'host',
        profileId: 'quotes',
        humanId: 'human',
      }),
    );
    const bodyText = document.createTextNode('Ready');
    container.querySelector('.bh-bubble-wrap .bh-bubble-body')!.append(bodyText);
    const range = document.createRange();
    range.setStart(bodyText, 0);
    range.setEnd(bodyText, 2);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
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
    expect(menuItem(zhTranslate('message.quoteSelection'))).not.toBeNull();
    expect(menuItem(zhTranslate('message.copySelection'))).not.toBeNull();
    await act(async () => menuItem(zhTranslate('message.quoteSelection')).click());
    const quoteChip = container.querySelector('[data-quote-chip]');
    expect(quoteChip?.hasAttribute('data-quote-part')).toBe(true);
    expect(quoteChip?.textContent).toContain((bodyText.textContent ?? '').slice(0, 2));
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-quote-chip] button')!.click(),
    );
    expect(container.querySelector('[data-quote-chip]')).toBeNull();
    await act(async () =>
      container
        .querySelector('.bh-bubble-wrap')!
        .dispatchEvent(new MouseEvent('pointermove', { bubbles: true })),
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          `.bh-bubble-toolbar [aria-label="${zhTranslate('message.quote')}"]`,
        )!
        .click(),
    );
    const wholeChip = container.querySelector('[data-quote-chip]');
    expect(wholeChip?.hasAttribute('data-quote-part')).toBe(false);
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-quote-chip] button')!.click(),
    );
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(100, 200, 40, 16),
    });
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
    const toolbar = document.body.querySelector('[data-selection-toolbar]');
    expect(toolbar).not.toBeNull();
    await act(async () => toolbar!.querySelector<HTMLButtonElement>('button')!.click());
    expect(container.querySelector('[data-quote-chip]')?.hasAttribute('data-quote-part')).toBe(
      true,
    );
    expect(document.body.querySelector('[data-selection-toolbar]')).toBeNull();
    const noteInput = container.querySelector<HTMLInputElement>('[data-quote-chip] input')!;
    expect(noteInput.placeholder).toBe(zhTranslate('message.quoteNote'));
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        noteInput,
        'Agreed',
      );
      noteInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.querySelector<HTMLInputElement>('[data-quote-chip] input')!.value).toBe(
      'Agreed',
    );
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
    window.getSelection()!.removeAllRanges();
    await act(async () => store.setComposerIdentity(identity));
    localStorage.clear();
    await act(async () =>
      container
        .querySelector('.bh-bubble-wrap')!
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    );
    await act(async () => menuItem(zhTranslate('message.react')).click());
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
      replyToPreview: {
        author: { kind: 'bot', slug: 'ada' },
        body: 'original summary',
      },
    };
    store.setRoster([bot], [channel]);
    store.select({ kind: 'bot', slug: 'ada' });
    store.setConversation({
      status: 'ready',
      channel,
      messages: [reply],
      sending: false,
    });
    const render = () =>
      renderToStaticMarkup(
        createElement(BotMain, {
          actions: { ...inertSubmissionActions } as BridgeActions,
          channelSidebar: sidebarRegistry(),
        }),
      );
    const linked = render();
    expect(linked).toContain('data-bubble-quote="bot"');
    expect(linked).toContain('original summary');
    expect(linked).toContain('data-bubble-quote-author');

    store.setConversation({
      messages: [
        {
          ...reply,
          quotes: [{ messageId: 'm1', preview: reply.replyToPreview! }],
        },
      ],
    });
    expect(render().match(/data-bubble-quote="bot"/gu)).toHaveLength(1);
    store.setConversation({
      messages: [
        {
          ...reply,
          quotes: [
            { messageId: 'm1', text: 'original', note: 'Agreed', preview: reply.replyToPreview! },
          ],
        },
      ],
    });
    const noted = render();
    expect(noted).toContain('data-bubble-quote-note');
    expect(noted.indexOf('original')).toBeLessThan(noted.indexOf('Agreed'));

    store.setConversation({ messages: [{ ...reply, replyToPreview: null }] });
    const unavailable = render();
    expect(unavailable).toContain('data-bubble-quote="unavailable"');
    expect(unavailable).not.toContain('data-bubble-quote="bot"');
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
