// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type ConversationMessage } from '@botharness/host-client/conversation';

const { native, mockGestureHandler, mockReactNative, mockEnrichedMarkdown, resetNative } =
  await vi.hoisted(() => import('./message-bubble-mocks'));

import {
  MessageActions,
  MessageBubble,
  dismissQueue,
  human,
  menuTime,
  messageMenuActions,
  replyable,
  secondTap,
  t,
} from './message-bubble-fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../src/ui/chat/message-attachment-picker', () => ({
  MessageAttachmentPicker: () => null,
}));

vi.mock('react-native-reanimated', () => import('./reanimated-shim'));

vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));

vi.mock('react-native-gesture-handler', mockGestureHandler);

vi.mock('react-native', mockReactNative);

vi.mock('../src/ui/primitives/system-symbol', () => ({ SystemSymbol: () => null }));

vi.mock('../src/ui/chat/genui-document-card', () => ({
  GenuiDocumentCard: () => <input aria-label="GenUI note" />,
}));

vi.mock('expo-haptics', () => import('./expo-haptics-shim'));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));

vi.mock('expo-image', async () => ({ Image: (await import('react-native')).Image }));

vi.mock('expo-clipboard', () => ({
  setStringAsync: async (text: string) => {
    native.copied.push(text);
    return true;
  },
}));

vi.mock('react-native-enriched-markdown', mockEnrichedMarkdown);

vi.mock('react-native-svg', () => ({
  default: ({ children }: { children?: unknown }) => <svg>{children as never}</svg>,
  Circle: ({ fill }: { fill: string }) => <circle fill={fill} />,
  Path: ({ fill }: { fill?: string }) => (fill === undefined ? null : <path fill={fill} />),
  Rect: () => null,
}));

const { openMessageMenu, shareText } = await import('../src/ui/chat/message-menu');

const { MENU_REACTIONS, QUICK_REACTIONS } = await import('@botharness/host-client/conversation');

beforeEach(resetNative);

describe('reply swipe touch region', () => {
  it('leaves the speaker and row space outside the reply gesture', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(
      <MessageBubble
        message={human({ author: 'bot', bot: 'ada', body: 'On it' })}
        speaker={{ name: 'Ada', bot: undefined, group: 'g', first: true, last: true }}
        onReply={() => undefined}
      />,
    );
    const region = container.querySelector('[data-nativeid="horizontal-swipe-owner"]')!;
    expect(region).not.toBeNull();
    expect(region.textContent).not.toContain('Ada');
    expect(region.parentElement?.textContent).not.toContain('Ada');
    expect(container.textContent).toContain('Ada');
  });

  it('leaves the delivery control beside a human bubble outside the reply gesture', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(
      <MessageBubble
        message={human({ mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 3 }] })}
        onOpenDelivery={() => undefined}
        onReply={() => undefined}
      />,
    );
    const region = container.querySelector('[data-nativeid="horizontal-swipe-owner"]')!;
    expect(region.textContent).toContain('hello');
    expect(container.querySelector('[data-accessibilityrole="button"]')).not.toBeNull();
    expect(region.querySelector('[data-accessibilityrole="button"]')).toBeNull();
  });
});

describe('reactions', () => {
  const reacted = human({
    id: 'bot-1',
    author: 'bot',
    body: 'Done.',
    revision: 2,
    reactions: [
      {
        emoji: '👍',
        actors: [
          { kind: 'human', id: 'local-human' },
          { kind: 'bot', id: 'ada' },
        ],
      },
      { emoji: '👀', actors: [{ kind: 'bot', id: 'ada' }] },
    ],
  });
  const names = (id: string) => (id === 'ada' ? 'Ada' : id);

  it('shows each reaction as a chip with its count and who reacted', () => {
    const html = renderToStaticMarkup(
      <MessageBubble message={reacted} onReact={() => {}} botName={names} />,
    );
    expect(html).toContain(
      `data-accessibilitylabel="${t.reactionSummary(`${t.reactionYou}${t.reactionSeparator}Ada`, '👍')}"`,
    );
    expect(html).toContain(`data-accessibilityhint="${t.unreact('👍')}"`);
    expect(html).toContain(`data-accessibilitylabel="${t.reactionSummary('Ada', '👀')}"`);
    expect(html).toContain(`data-accessibilityhint="${t.react('👀')}"`);
    expect(html).toContain('>2<');
    expect(html).toContain(`data-accessibilityhint="${t.messageActionsHint}"`);
  });

  it('lets a committed attachment-only message take reactions, but not a pending one', () => {
    const image = human({ author: 'bot', body: '', revision: 3 });
    expect(renderToStaticMarkup(<MessageBubble message={image} onReact={() => {}} />)).toContain(
      `data-accessibilityhint="${t.messageActionsHint}"`,
    );
    expect(
      renderToStaticMarkup(
        <MessageBubble message={human({ body: '', delivery: 'pending' })} onReact={() => {}} />,
      ),
    ).not.toContain('data-accessibilityhint');
  });
});

describe('copying a message', () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('offers Copy in the iOS action sheet and copies the whole text', async () => {
    openMessageMenu('Line one\n\nLine two');
    await flush();
    expect(native.sheets).toEqual([{ options: [t.copy, t.cancel], cancelButtonIndex: 1 }]);
    expect(native.copied).toEqual(['Line one\n\nLine two']);
  });

  it('copies nothing when the sheet is cancelled', async () => {
    native.pick = 1;
    openMessageMenu('hello');
    await flush();
    expect(native.copied).toEqual([]);
  });

  it('copies at once on Android and confirms with a toast', async () => {
    native.os = 'android';
    openMessageMenu('hello');
    await flush();
    expect(native.sheets).toEqual([]);
    expect(native.copied).toEqual(['hello']);
    expect(native.toasts).toEqual([t.copied]);
  });
});

describe('double-tap to react', () => {
  const bot: ConversationMessage = {
    id: 'bot-1',
    revision: 3,
    at: '2026-10-14T08:00:00.000Z',
    author: 'bot',
    body: 'Done.',
    attachments: [],
    delivery: 'committed',
  };
  const doubleTap = (message: ConversationMessage) => {
    const onReact = vi.fn();
    renderToStaticMarkup(<MessageBubble message={message} onReact={onReact} />);
    const press = native.presses.get(t.messageActionsHint);
    press?.();
    press?.();
    return onReact;
  };

  it('counts a second tap only inside the double-tap window', () => {
    expect(secondTap(undefined, 1000)).toBe(false);
    expect(secondTap(1000, 1300)).toBe(true);
    expect(secondTap(1000, 1301)).toBe(false);
  });

  it('adds a thumbs up', () => {
    expect(doubleTap(bot)).toHaveBeenCalledWith('bot-1', '👍', true);
  });

  it('takes the thumbs up back when it is already mine', () => {
    const mine = { emoji: '👍', actors: [{ kind: 'human' as const, id: 'local-human' }] };
    expect(doubleTap({ ...bot, reactions: [mine] })).toHaveBeenCalledWith('bot-1', '👍', false);
  });

  it('works the same on Android', () => {
    native.os = 'android';
    expect(doubleTap(bot)).toHaveBeenCalledWith('bot-1', '👍', true);
  });

  it('leaves messages that cannot take reactions alone', () => {
    expect(doubleTap({ ...bot, delivery: 'pending' })).not.toHaveBeenCalled();
  });

  it('on Android with selection, selects on a long press and no longer reacts to taps', () => {
    native.os = 'android';
    const onReact = vi.fn();
    const onSelect = vi.fn();
    renderToStaticMarkup(<MessageBubble message={bot} onReact={onReact} onSelect={onSelect} />);
    native.presses.get(t.messageActionsHint)?.();
    native.presses.get(t.messageActionsHint)?.();
    expect(onReact).not.toHaveBeenCalled();
    native.longPresses.find((gesture) => gesture.enabled)?.start();
    expect(onSelect).toHaveBeenCalledWith(bot);
  });

  it('recognizes Android bubble holds natively without the transformed React responder region', () => {
    native.os = 'android';
    const onSelect = vi.fn();
    renderToStaticMarkup(<MessageBubble message={bot} onSelect={onSelect} />);
    const gestures = native.longPresses.filter((gesture) => gesture.enabled);
    expect(gestures).toHaveLength(1);
    expect(native.holds.has(t.messageActionsHint)).toBe(false);
    gestures[0]?.start();
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(bot);
  });

  it('keeps an iOS native hold opening message actions instead of selecting the message', async () => {
    const measurement = await import('../src/ui/primitives/measure-message-view');
    const measured = vi
      .spyOn(measurement, 'measureMessageView')
      .mockImplementation((_view, then) => {
        then(16, 400, 200, 60);
      });
    const onLongPress = vi.fn();
    const onSelect = vi.fn();
    try {
      renderToStaticMarkup(
        <MessageBubble message={bot} onLongPress={onLongPress} onSelect={onSelect} />,
      );
      native.longPresses.find((gesture) => gesture.enabled)?.start();
      expect(onLongPress).toHaveBeenCalledExactlyOnceWith(
        bot,
        { x: 16, y: 400, width: 200, height: 60 },
        expect.anything(),
      );
      expect(onSelect).not.toHaveBeenCalled();
    } finally {
      measured.mockRestore();
    }
  });
});

describe('the long-press menu', () => {
  const anchor = { x: 16, y: 400, width: 200, height: 60 };
  const group = { first: true, last: true };
  const bot: ConversationMessage = {
    id: 'bot-1',
    revision: 3,
    at: '2026-10-14T08:00:00.000Z',
    author: 'bot',
    body: 'Which one first?',
    attachments: [],
    delivery: 'committed',
    reactions: [{ emoji: '🔥', actors: [{ kind: 'human', id: 'local-human' }] }],
  };
  const menu = (message: ConversationMessage, readOnly = false) =>
    renderToStaticMarkup(
      <MessageActions
        target={{ message, anchor, group }}
        readOnly={readOnly}
        onClose={() => {}}
        onReact={() => {}}
        onCopy={() => {}}
        onShareText={() => {}}
      />,
    );

  it('offers the Web Client reactions first, then more in a scrolling island', () => {
    expect(MENU_REACTIONS.slice(0, QUICK_REACTIONS.length)).toEqual([...QUICK_REACTIONS]);
    const html = menu(bot);
    expect(html).toContain(`data-accessibilitylabel="${t.reactions}"`);
    for (const emoji of MENU_REACTIONS)
      expect(html).toContain(
        `data-accessibilitylabel="${emoji === '🔥' ? t.unreact(emoji) : t.react(emoji)}"`,
      );
  });

  it('lifts the pressed bubble between the island and the actions', () => {
    const html = menu(bot);
    const island = html.indexOf(t.reactions);
    const bubble = html.indexOf('Which one first?');
    const copy = html.indexOf(`data-accessibilitylabel="${t.copy}"`);
    expect(island).toBeGreaterThan(-1);
    expect(bubble).toBeGreaterThan(island);
    expect(copy).toBeGreaterThan(bubble);
    expect(html).toContain(`data-accessibilitylabel="${t.shareText}"`);
  });

  it('keeps copy and share but removes the reaction island in a read-only Bot DM', () => {
    const html = menu(bot, true);
    expect(html).not.toContain(`data-accessibilitylabel="${t.reactions}"`);
    for (const emoji of MENU_REACTIONS) {
      expect(html).not.toContain(`data-accessibilitylabel="${t.react(emoji)}"`);
      expect(html).not.toContain(`data-accessibilitylabel="${t.unreact(emoji)}"`);
    }
    expect(html).toContain(`data-accessibilitylabel="${t.copy}"`);
    expect(html).toContain(`data-accessibilitylabel="${t.shareText}"`);
  });

  it('shows no island for a message that cannot take reactions, and no actions without text', () => {
    const { revision: _, ...unsent } = bot;
    const pending = menu({ ...unsent, delivery: 'pending' });
    expect(pending).not.toContain(t.reactions);
    expect(pending).toContain(`data-accessibilitylabel="${t.copy}"`);
    expect(messageMenuActions({ ...bot, body: '  ' })).toEqual([]);
  });

  it('adds navigation only for activities with a destination', () => {
    expect(messageMenuActions(bot, { label: 'Open memory', onOpen: () => {} })[0]).toEqual({
      key: 'open',
      label: 'Open memory',
    });
    expect(messageMenuActions(bot, {})).toEqual(messageMenuActions(bot));
  });

  it('shows complete scrollable activity text without reactions and waits for dismissal to navigate', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const full = 'Ada updated memory: ' + 'A long memory description. '.repeat(100);
    const html = renderToStaticMarkup(
      <MessageActions
        target={{
          message: { ...bot, body: full },
          anchor,
          group,
          activity: { label: t.activityRow.openMemory, onOpen },
        }}
        onClose={onClose}
        onReact={() => {}}
        onCopy={() => {}}
        onShareText={() => {}}
      />,
    );
    expect(html).toContain(full);
    expect(html).toContain('data-native="ScrollView"');
    expect(html).not.toContain(`data-accessibilitylabel="${t.reactions}"`);
    expect(onOpen).not.toHaveBeenCalled();
    native.presses.get(t.activityRow.openMemory)!();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
    native.dismiss();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('heads the actions with the message time, marking today', () => {
    const now = new Date('2026-10-14T09:00:00.000Z');
    expect(menuTime(bot.at, now).startsWith(`${t.today} `)).toBe(true);
    const earlier = new Date(2026, 9, 13, 8);
    expect(menuTime(earlier.toISOString(), now)).toBe(
      new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(earlier),
    );
    expect(menuTime('invalid', now)).toBe('');
  });

  it('opens the share sheet on iOS only once the menu has gone', () => {
    const ran: string[] = [];
    const ios = dismissQueue('ios');
    ios.after(() => ran.push('ios'));
    expect(ran).toEqual([]);
    ios.flush();
    ios.flush();
    expect(ran).toEqual(['ios']);
    dismissQueue('android').after(() => ran.push('android'));
    expect(ran).toEqual(['ios', 'android']);
  });

  it('shares the whole text through the system share sheet', async () => {
    shareText('Line one\n\nLine two');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(native.shared).toEqual(['Line one\n\nLine two']);
  });
});

describe('replies', () => {
  it('quotes the replied message in a block named for its author, or says it is gone', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(
      <MessageBubble
        message={human({
          body: 'this one',
          replyTo: 'bot-1',
          replyPreview: { author: { kind: 'bot', slug: 'ada' }, body: 'Pick a file' },
        })}
        botName={(id) => (id === 'ada' ? 'Ada' : id)}
      />,
    );
    const quote = container.querySelector('[data-testid="reply-quote"]')!;
    expect(container.querySelector('[data-testid="reply-quote-author"]')?.textContent).toBe('Ada');
    expect(container.querySelector('[data-testid="reply-quote-text"]')?.textContent).toBe(
      'Pick a file',
    );
    expect(
      quote.compareDocumentPosition(container.querySelector('[data-testid="message-text"]')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const gone = document.createElement('div');
    gone.innerHTML = renderToStaticMarkup(
      <MessageBubble message={human({ replyTo: 'bot-1', replyPreview: null })} />,
    );
    expect(gone.querySelector('[data-testid="reply-quote-author"]')).toBeNull();
    expect(gone.querySelector('[data-testid="reply-quote-text"]')?.textContent).toBe(
      t.reply.unavailable,
    );
    expect(renderToStaticMarkup(<MessageBubble message={human({})} />)).not.toContain(
      'reply-quote',
    );
    const person = document.createElement('div');
    person.innerHTML = renderToStaticMarkup(
      <MessageBubble
        message={human({
          replyTo: 'bob-1',
          replyPreview: {
            author: { kind: 'human', humanId: 'human-bob', displayName: 'Bob' },
            body: 'hi alice',
          },
        })}
      />,
    );
    expect(person.querySelector('[data-testid="reply-quote-author"]')?.textContent).toBe('Bob');
    const unnamed = document.createElement('div');
    unnamed.innerHTML = renderToStaticMarkup(
      <MessageBubble
        message={human({
          replyTo: 'bob-1',
          replyPreview: { author: { kind: 'human', humanId: 'human-bob' }, body: 'hi alice' },
        })}
      />,
    );
    expect(unnamed.querySelector('[data-testid="reply-quote-author"]')?.textContent).toBe(
      t.reply.member,
    );
  });

  it('jumps to the original when its quote is tapped', () => {
    const open = vi.fn();
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(
      <MessageBubble
        message={{
          ...human({ id: 'bot-2', body: 'Done', replyTo: 'human-0' }),
          author: 'bot',
          bot: 'ada',
          replyPreview: { author: { kind: 'human' }, body: 'Fix the build' },
        }}
        onOpenReply={open}
      />,
    );
    const label = t.reply.quote(t.reply.you, 'Fix the build');
    const button = container.querySelector(`[data-accessibilitylabel="${label}"]`);
    expect(button?.getAttribute('data-accessibilityrole')).toBe('button');
    expect(button?.getAttribute('data-testid')).toBe('reply-quote');
    native.presses.get(label)!();
    expect(open).toHaveBeenCalledWith('human-0');
  });

  it("lets a screen reader jump from a reply to its original through the bubble's actions", () => {
    const open = vi.fn();
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(
      <MessageBubble
        message={human({
          replyTo: 'bot-1',
          replyPreview: {
            author: { kind: 'bot', slug: 'ada' },
            body: 'Pick a file',
          },
        })}
        onOpenReply={open}
      />,
    );
    const bubble = container.querySelector(`[data-accessibilityhint="${t.messageActionsHint}"]`)!;
    expect(JSON.parse(bubble.getAttribute('data-accessibilityactions')!)).toContainEqual({
      name: 'reply-original',
      label: t.reply.jumpHint,
    });
    native.actions.get(t.messageActionsHint)!({
      nativeEvent: { actionName: 'reply-original' },
    });
    expect(open).toHaveBeenCalledWith('bot-1');
  });

  it('offers a swipe reply only on committed Human and Bot messages', () => {
    expect(replyable(human({}))).toBe(true);
    expect(replyable({ ...human({}), author: 'bot', bot: 'ada' })).toBe(true);
    expect(replyable(human({ delivery: 'pending' }))).toBe(false);
    expect(replyable(human({ delivery: 'failed' }))).toBe(false);
    expect(replyable({ ...human({}), author: 'system' })).toBe(false);
    expect(replyable(human({ welcome: true }))).toBe(false);
  });
});
