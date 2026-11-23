// @vitest-environment jsdom
import { type ChannelMessage } from '../src/client/store.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeActions } from '../src/client/actions.js';
import { BotModePrefs } from '../src/client/bot-mode-prefs.js';
import { contrastRatio, parseColor, REFERENCE_SURFACES } from '../src/client/bot-primary-color.js';
import { BotMain } from '../src/client/bot-main.js';
import { store } from '../src/client/store.js';
import { CSS } from '../src/client/styles.js';
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
  const show = (
    channel: typeof dm | typeof group,
    messages: ChannelMessage[],
    avatars = { dm: false, own: false },
  ): HTMLElement => {
    store.setRoster([ada, bob], [channel]);
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
    const prefs = new BotModePrefs();
    prefs.setShowDmAvatar(avatars.dm);
    prefs.setShowOwnAvatar(avatars.own);
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(
      createElement(BotMain, {
        actions: { ...inertSubmissionActions } as BridgeActions,
        channelSidebar: sidebarRegistry(),
        prefs,
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

  it('keeps message times out of the timeline and shows no avatar or name in a DM by default', () => {
    const previous = store.getSnapshot();
    try {
      const host = show(dm, [
        { id: 'h1', at, author: { kind: 'human' }, body: 'hello' },
        {
          id: 'b1',
          at,
          author: { kind: 'bot', slug: 'ada' },
          body: 'hi there',
        },
        {
          id: 'b2',
          at,
          author: { kind: 'bot', slug: 'ada' },
          body: 'how can I help',
        },
        {
          id: 'h2',
          at,
          author: { kind: 'human' },
          body: 'sending',
          pending: true,
        },
      ]);
      const timeline = host.querySelector('.bh-chat-body')!;
      expect(timeline.querySelector('.bh-message-identity')).toBeNull();
      expect(timeline.querySelector('.bh-message-group-avatar')).toBeNull();
      expect(timeline.textContent).not.toContain('Ada');
      expect(timeline.querySelectorAll('time')).toHaveLength(0);
      expect(CSS).not.toMatch(/bh-bubble-stamp/);
    } finally {
      restore(previous);
    }
  });

  it('shows the DM avatar and my avatar only when those settings are on', () => {
    const previous = store.getSnapshot();
    const messages: ChannelMessage[] = [
      { id: 'h1', at, author: { kind: 'human' }, body: 'hello' },
      { id: 'b1', at, author: { kind: 'bot', slug: 'ada' }, body: 'hi there' },
    ];
    const avatarIn = (host: HTMLElement, mine: boolean) =>
      host.querySelector(
        `.bh-message-group${mine ? '.bh-message-group-me' : ':not(.bh-message-group-me)'} > .bh-message-group-avatar`,
      );
    try {
      const peer = show(dm, messages, { dm: true, own: false });
      expect(avatarIn(peer, false)).not.toBeNull();
      expect(avatarIn(peer, true)).toBeNull();
      expect(peer.querySelector('.bh-message-identity')).toBeNull();
      const own = show(dm, messages, { dm: false, own: true });
      expect(avatarIn(own, false)).toBeNull();
      const mine = avatarIn(own, true)!;
      expect(mine.previousElementSibling?.classList.contains('bh-message-stack')).toBe(true);
      const both = show(group, messages, { dm: false, own: true });
      expect(avatarIn(both, false)).not.toBeNull();
      expect(avatarIn(both, true)).not.toBeNull();
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
    } finally {
      restore(previous);
    }
  });

  it('floats the reading chip opposite the time without adding anything to the row', () => {
    const previous = store.getSnapshot();
    const message: ChannelMessage = {
      id: 'h1',
      at,
      author: { kind: 'human' },
      body: 'hello',
    };
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
    const quoted = {
      author: { kind: 'bot' as const, slug: 'ada' },
      body: 'the question',
    };
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
        skillCatalog: async () => [],
        allBotPreview: async () => ({ recipients: [], excluded: [] }),
        listWorkspaceOptions: async () => [],
        markRead: async () => undefined,
        openAround,
        ...inertSubmissionActions,
      } as unknown as BridgeActions;
      await act(async () =>
        root.render(
          createElement(BotMain, {
            actions,
            channelSidebar: sidebarRegistry(),
          }),
        ),
      );
      const quote = (id: string) =>
        container.querySelector<HTMLButtonElement>(
          `[data-message-id="${id}"] .bh-bubble [data-bubble-quote]`,
        )!;
      const mine = quote('h1');
      expect(mine.tagName).toBe('BUTTON');
      expect(mine.getAttribute('aria-label')).toContain('Ada');
      expect(mine.getAttribute('aria-label')).toContain('the question');
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

  it('keeps the first eight quotes and says so when a ninth is added', async () => {
    const previous = store.getSnapshot();
    const identity = previous.composerIdentity;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    try {
      store.setComposerIdentity({ hostId: 'host', profileId: 'limit', humanId: 'human' });
      store.setRoster([ada, bob], [group]);
      store.select({ kind: 'channel', channelId: group.id });
      store.setConversation({
        status: 'ready',
        channel: group,
        sending: false,
        messages: Array.from({ length: 9 }, (_, index) => ({
          id: `m${index}`,
          at,
          author: { kind: 'bot' as const, slug: 'ada' },
          body: index === 8 ? '' : `message ${index}`,
          ...(index === 8
            ? {
                attachments: [
                  {
                    hash: `sha256:${'1'.repeat(64)}`,
                    name: 'plan.pdf',
                    mime: 'application/pdf',
                    size: 1,
                  },
                ],
              }
            : {}),
        })),
      });
      const actions = {
        modelPlanState: async () => ({}),
        listWorkspaceGrants: async () => [],
        botSourcePolicies: async () => [],
        skillCatalog: async () => [],
        allBotPreview: async () => ({ recipients: [], excluded: [] }),
        listWorkspaceOptions: async () => [],
        markRead: async () => undefined,
        ...inertSubmissionActions,
      } as unknown as BridgeActions;
      await act(async () =>
        root.render(createElement(BotMain, { actions, channelSidebar: sidebarRegistry() })),
      );
      const quote = async (id: string) => {
        await act(async () =>
          container
            .querySelector(`[data-message-id="${id}"]`)!
            .dispatchEvent(new MouseEvent('pointermove', { bubbles: true })),
        );
        const button = container.querySelector<HTMLButtonElement>(
          `[data-message-id="${id}"] [data-bubble-action][aria-label="Quote"], [data-message-id="${id}"] [data-bubble-action][aria-label="引用"]`,
        )!;
        await act(async () => button.click());
      };
      const chips = () =>
        [...container.querySelectorAll('[data-quote-chip]')].map((chip) => chip.textContent ?? '');
      await quote('m8');
      expect(chips()[0]).toContain('plan.pdf');
      for (let index = 0; index < 8; index += 1) await quote(`m${index}`);
      expect(chips()).toHaveLength(8);
      expect(chips()[0]).toContain('plan.pdf');
      expect(chips().some((chip) => chip.includes('message 7'))).toBe(false);
      expect(container.textContent).toMatch(
        /A message can quote at most 8 messages|一条消息最多引用 8 条/u,
      );
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.setComposerIdentity(identity);
      localStorage.clear();
      restore(previous);
    }
  });

  it('restores the quote of a failed message whose target is not loaded', async () => {
    const previous = store.getSnapshot();
    const identity = previous.composerIdentity;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    try {
      store.setComposerIdentity({ hostId: 'host', profileId: 'restore', humanId: 'human' });
      store.setRoster([ada, bob], [group]);
      store.select({ kind: 'channel', channelId: group.id });
      store.setConversation({
        status: 'ready',
        channel: group,
        sending: false,
        messages: [
          {
            id: 'local-failed-q',
            at,
            author: { kind: 'human' },
            body: 'Still true?',
            failed: 'network disconnected',
            quotes: [
              {
                messageId: 'old-1',
                text: 'ship Friday',
                note: 'Is it?',
                preview: { author: { kind: 'bot', slug: 'ada' }, body: 'We ship Friday.' },
              },
            ],
          },
        ],
      });
      const actions = {
        modelPlanState: async () => ({}),
        listWorkspaceGrants: async () => [],
        botSourcePolicies: async () => [],
        skillCatalog: async () => [],
        allBotPreview: async () => ({ recipients: [], excluded: [] }),
        listWorkspaceOptions: async () => [],
        markRead: async () => undefined,
        ...inertSubmissionActions,
        dismissFailedMessage: () => true,
      } as unknown as BridgeActions;
      await act(async () =>
        root.render(createElement(BotMain, { actions, channelSidebar: sidebarRegistry() })),
      );
      await act(async () =>
        container.querySelector<HTMLButtonElement>('button.bh-bubble-failed-action')!.click(),
      );
      const chip = container.querySelector('[data-quote-chip]');
      expect(chip?.textContent).toContain('Ada');
      expect(chip?.textContent).toContain('ship Friday');
      expect(chip?.querySelector('input')?.value).toBe('Is it?');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.setComposerIdentity(identity);
      localStorage.clear();
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
        {
          id: 'h1',
          at,
          author: { kind: 'human' },
          body: '',
          attachments: [photo('a.png')],
        },
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
    } finally {
      restore(previous);
    }
  });

  it('lays several images out as one album with +N on the last visible tile', () => {
    const previous = store.getSnapshot();
    try {
      const host = show(dm, [
        {
          id: 'a2',
          at,
          author: { kind: 'human' },
          body: '',
          attachments: photos(2),
        },
        {
          id: 'a3',
          at,
          author: { kind: 'human' },
          body: '',
          attachments: photos(3),
        },
        {
          id: 'a4',
          at,
          author: { kind: 'human' },
          body: '',
          attachments: photos(4),
        },
        {
          id: 'a8',
          at,
          author: { kind: 'bot', slug: 'ada' },
          body: '',
          attachments: photos(8),
        },
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
          replyToPreview: quote({
            kind: 'image',
            count: 1,
            thumbnail: photo('thumb.png'),
          }),
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
      expect(block('r1').querySelector('[data-bubble-quote-body]')?.textContent).toBe('图片');
      expect(block('r2').querySelector('img')).toBeNull();
      expect(block('r2').querySelector('[data-bubble-quote-body]')?.textContent).toBe('3 张图片');
      expect(block('r3').querySelector('[data-bubble-quote-body]')?.textContent).toBe(
        '语音 · 0:07',
      );
      expect(block('r4').querySelector('[data-bubble-quote-body]')?.textContent).toBe('report.pdf');
    } finally {
      restore(previous);
    }
  });

  it('puts no label above the Human in a group', () => {
    const previous = store.getSnapshot();
    try {
      const host = show(group, [
        { id: 'h1', at, author: { kind: 'human' }, body: 'hello' },
        { id: 'b1', at, author: { kind: 'bot', slug: 'ada' }, body: 'hi' },
        {
          id: 'h2',
          at,
          author: { kind: 'human' },
          body: 'later',
          pending: true,
        },
      ]);
      const identities = host.querySelectorAll('.bh-message-identity');
      expect([...identities].map((node) => node.textContent)).toEqual(['Ada']);
      expect(host.querySelector('.bh-message-group-me .bh-bubble-author')).toBeNull();
      expect(host.querySelector('[data-bubble-check]')).toBeNull();
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
        messages: [
          {
            id: 'a8',
            at,
            author: { kind: 'human' },
            body: '',
            attachments: photos(8),
          },
        ],
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
