// @vitest-environment jsdom
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createConversation, type ConversationMessage } from '../src/host/conversation';
import { createHostClient } from '../src/host/client';
import { FakeHost } from './fake-host';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const native = vi.hoisted(() => ({
  os: 'ios',
  appState: 'active',
  appStateListeners: new Set<(state: string) => void>(),
  copied: [] as string[],
  sheets: [] as Array<{ options: string[]; cancelButtonIndex?: number }>,
  toasts: [] as string[],
  shared: [] as string[],
  pick: 0,
  presses: new Map<string, () => void>(),
  dismiss: () => {},
}));

vi.mock('react-native-reanimated', () => import('./reanimated-shim'));

vi.mock('react-native', async () => {
  const { useWindowDimensions, StyleSheet } = await import('./react-native-shim');
  const host = (name: string) => {
    const Component = ({ children, ...props }: Record<string, unknown>) => {
      const pressKey = props['accessibilityLabel'] ?? props['accessibilityHint'];
      if (typeof props['onPress'] === 'function' && typeof pressKey === 'string')
        native.presses.set(pressKey, props['onPress'] as () => void);
      const attributes: Record<string, string> = {};
      for (const key of [
        'accessible',
        'accessibilityLabel',
        'accessibilityRole',
        'accessibilityHint',
        'accessibilityState',
        'accessibilityValue',
        'selectable',
        'source',
        'recyclingKey',
        'cachePolicy',
      ])
        if (props[key] !== undefined)
          attributes[`data-${key.toLowerCase()}`] =
            typeof props[key] === 'object' ? JSON.stringify(props[key]) : String(props[key]);
      const style = props['style'] as { opacity?: number } | undefined;
      return (
        <div
          data-native={name}
          {...attributes}
          style={{ opacity: style?.opacity }}
          onClick={props['onPress'] as (() => void) | undefined}
        >
          {children as never}
        </div>
      );
    };
    return Component;
  };
  return {
    useWindowDimensions,
    AppState: {
      get currentState() {
        return native.appState;
      },
      addEventListener(_type: string, listener: (state: string) => void) {
        native.appStateListeners.add(listener);
        return { remove: () => native.appStateListeners.delete(listener) };
      },
    },
    StyleSheet,
    View: host('View'),
    Text: host('Text'),
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    Modal: ({
      visible,
      children,
      onDismiss,
    }: {
      visible: boolean;
      children: unknown;
      onDismiss: () => void;
    }) => {
      native.dismiss = onDismiss;
      return visible ? <div data-native="Modal">{children as never}</div> : null;
    },
    Image: host('Image'),
    Share: { share: async ({ message }: { message: string }) => native.shared.push(message) },
    ActivityIndicator: host('ActivityIndicator'),
    Linking: { openURL: async () => undefined },
    Platform: {
      get OS() {
        return native.os;
      },
      select: (options: Record<string, unknown>) => options['ios'],
    },
    ActionSheetIOS: {
      showActionSheetWithOptions(
        options: { options: string[]; cancelButtonIndex?: number },
        callback: (index: number) => void,
      ) {
        native.sheets.push(options);
        callback(native.pick);
      },
    },
    ToastAndroid: { SHORT: 0, show: (text: string) => native.toasts.push(text) },
    useColorScheme: () => 'light',
  };
});

vi.mock('../src/ui/primitives/system-symbol', () => ({ SystemSymbol: () => null }));
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

vi.mock('react-native-enriched-markdown', () => ({
  EnrichedMarkdownText: (props: {
    markdown: string;
    selectable?: boolean;
    flavor?: string;
    md4cFlags?: { latexMath?: boolean };
    onLinkPress?: unknown;
  }) => (
    <div
      data-native="EnrichedMarkdownText"
      data-selectable={String(props.selectable)}
      data-flavor={props.flavor}
      data-latex={String(props.md4cFlags?.latexMath)}
      data-links={String(typeof props.onLinkPress === 'function')}
      data-markdown={props.markdown}
    />
  ),
}));

vi.mock('react-native-svg', () => ({
  default: ({ children }: { children?: unknown }) => <svg>{children as never}</svg>,
  Circle: ({ fill }: { fill: string }) => <circle fill={fill} />,
  Path: ({ fill }: { fill?: string }) => (fill === undefined ? null : <path fill={fill} />),
  Rect: () => null,
}));

const { MessageBubble, DraftBubble, deliveryLabel, secondTap } =
  await import('../src/ui/chat/message-bubble');
const { createSpeakerRegistry } = await import('../src/ui/chat/speaker-row');
const { t } = await import('../src/ui/strings');
const { openMessageMenu, shareText } = await import('../src/ui/chat/message-menu');
const { MessageActions, dismissQueue, menuTime, messageMenuActions } =
  await import('../src/ui/chat/message-actions');
const { MENU_REACTIONS, QUICK_REACTIONS } = await import('../src/host/conversation');

beforeEach(() => {
  native.os = 'ios';
  native.copied.length = 0;
  native.sheets.length = 0;
  native.toasts.length = 0;
  native.shared.length = 0;
  native.pick = 0;
  native.presses.clear();
});

const human = (overrides: Partial<ConversationMessage>): ConversationMessage => ({
  id: 'human-1',
  at: '2026-10-14T08:00:00.000Z',
  author: 'human',
  body: 'hello',
  attachments: [],
  delivery: 'committed',
  ...overrides,
});

describe('message delivery receipt', () => {
  const mentioned = human({
    revision: 4,
    body: '@ADA @BEA check',
    mentions: [
      { botSlug: 'ada', label: 'ADA', start: 0, end: 4 },
      { botSlug: 'bea', label: 'BEA', start: 5, end: 9 },
    ],
    deliveries: [{ botSlug: 'ada', state: 'handled' }],
  });

  it('opens the receipt for a Human message with Bot recipients', () => {
    const open = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      act(() => root.render(<MessageBubble message={mentioned} onOpenDelivery={open} />));
      const label = t.delivery.summary(
        `1 ${t.delivery.state.handled} · 1 ${t.delivery.state.missing}`,
      );
      const button = container.querySelector<HTMLElement>(`[data-accessibilitylabel="${label}"]`);
      expect(button?.textContent).toBe('AB');
      act(() => button!.click());
      expect(open).toHaveBeenCalledWith(mentioned);
    } finally {
      act(() => root.unmount());
    }
  });

  it('shows the Bots reading a message until their turn ends', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const reading = `[data-accessibilitylabel="${t.delivery.reading('ada, bea')}"]`;
    try {
      act(() => root.render(<MessageBubble message={mentioned} readers={['ada', 'bea']} />));
      expect(container.querySelector(reading)?.textContent).toBe('AB');
      act(() => root.render(<MessageBubble message={mentioned} readers={[]} />));
      expect(container.querySelector(reading)).toBeNull();
      act(() =>
        root.render(<MessageBubble message={mentioned} readers={['ada', 'bea']} streaming />),
      );
      expect(container.querySelector(reading)).toBeNull();
    } finally {
      act(() => root.unmount());
    }
  });

  it('keeps the receipt off messages without recipients or while sending', () => {
    for (const message of [
      human({ revision: 4 }),
      { ...mentioned, delivery: 'pending' as const },
      { ...mentioned, delivery: 'failed' as const },
    ]) {
      const html = renderToStaticMarkup(
        <MessageBubble message={message} onOpenDelivery={() => {}} />,
      );
      expect(html).not.toContain(t.delivery.summary(''));
      expect(html).not.toContain('<svg');
    }
  });
});

describe('message states', () => {
  it.each(['hello', ''])(
    'keeps pending status accessible without visible sending text (body: %s)',
    (body) => {
      const html = renderToStaticMarkup(
        <MessageBubble message={human({ delivery: 'pending', body })} />,
      );
      expect(html).not.toContain(`>${t.sending}<`);
      expect(html).toContain('data-accessibilitystate="{&quot;busy&quot;:true}"');
      expect(html).toContain(
        body
          ? `data-accessibilityvalue="{&quot;text&quot;:&quot;${t.sending}&quot;}"`
          : `data-accessibilitylabel="${t.sending}"`,
      );
      expect(html).not.toContain(t.retrySend);
      expect(html).not.toContain('data-accessibilityrole="button"');
    },
  );

  it('keeps pending attachment actions outside the sending accessibility group', () => {
    const source = { uri: 'file:///local/chart.png', headers: {} };
    const image = {
      key: 'pending-image',
      kind: 'image' as const,
      name: 'chart.png',
      source,
      local: true,
    };
    const file = {
      key: 'pending-file',
      kind: 'file' as const,
      name: 'report.pdf',
      source,
      local: true,
    };
    const open = vi.fn();
    const share = vi.fn(async () => {});
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      act(() =>
        root.render(
          <MessageBubble
            message={human({ body: '', delivery: 'pending', attachments: [image, file] })}
            onOpenImage={open}
            onShare={share}
            onReact={() => {}}
          />,
        ),
      );
      const buttons = [
        ...container.querySelectorAll<HTMLElement>(
          '[data-accessibilityrole="imagebutton"], [data-accessibilityrole="button"]',
        ),
      ];
      expect(buttons).toHaveLength(2);
      for (const button of buttons) {
        expect(button.parentElement?.closest('[data-accessible="true"]')).toBeNull();
      }
      const status = container.querySelector('[data-accessible="true"]');
      expect(status?.getAttribute('data-accessibilitystate')).toBe('{"busy":true}');
      expect(status?.getAttribute('data-accessibilitylabel')).toBe(t.sending);
      expect(container.textContent).not.toContain(t.sending);
      act(() => buttons[0]!.click());
      act(() => buttons[1]!.click());
      expect(open).toHaveBeenCalledWith(image);
      expect(share).toHaveBeenCalledWith(file);
    } finally {
      act(() => root.unmount());
    }
  });

  it('shows a delivered message as sent until its journal entry arrives', () => {
    expect(deliveryLabel(human({}))).toBe(t.sent);
    const html = renderToStaticMarkup(<MessageBubble message={human({ revision: 4 })} />);
    expect(html).not.toContain(t.sent);
    expect(html).toContain('hello');
  });

  it('shows a failed message with a retry button', () => {
    const html = renderToStaticMarkup(
      <MessageBubble
        message={human({ delivery: 'failed', error: 'offline' })}
        onRetry={() => {}}
      />,
    );
    expect(html).toContain(
      `data-native="Pressable" data-accessibilitylabel="${t.notSent} · ${t.retrySend}"`,
    );
    expect(html).toContain('data-accessibilityrole="button"');
  });

  it('renders a Bot reply as Markdown that long-press copies whole', () => {
    const html = renderToStaticMarkup(
      <MessageBubble
        message={human({
          id: 'bot-1',
          author: 'bot',
          body: 'Use `pnpm test`:\n\n- one\n- [docs](https://botharness.ai)',
          revision: 2,
        })}
      />,
    );
    expect(html).toContain('data-selectable="false"');
    expect(html).not.toContain('data-selectable="true"');
    expect(html).toContain(`data-accessibilityhint="${t.messageActionsHint}"`);
    expect(html).toContain(
      'data-markdown="Use `pnpm test`:\n\n- one\n- [docs](https://botharness.ai)"',
    );
    expect(html).toContain('data-flavor="github"');
    expect(html).toContain('data-latex="false"');
    expect(html).toContain('data-links="true"');
    expect(deliveryLabel(human({ author: 'bot' }))).toBeUndefined();
  });

  it('shows images as thumbnails and files as rows with their size', () => {
    const source = { uri: 'https://host/a', headers: { authorization: 'Device x' } };
    const html = renderToStaticMarkup(
      <MessageBubble
        message={human({
          author: 'bot',
          body: '',
          attachments: [
            { key: 'a', kind: 'image', name: 'chart.png', source, local: false },
            { key: 'b', kind: 'file', name: 'report.pdf', size: 3_500_000, source, local: false },
            { key: 'c', kind: 'audio', name: 'voice.ogg', local: false },
          ],
        })}
      />,
    );
    expect(html).toContain(`data-accessibilitylabel="${t.openImage('chart.png')}"`);
    expect(html).toContain('data-native="Image"');
    expect(html).toContain('Device x');
    expect(html).toContain('data-recyclingkey="a"');
    expect(html).toContain('data-cachepolicy="memory-disk"');
    expect(html).not.toContain(`data-accessibilityhint="${t.copyHint}"`);
    expect(html).toContain(`data-accessibilitylabel="${t.shareFile('report.pdf')}"`);
    expect(html).toContain('3.3 MB');
    expect(html).toContain('voice.ogg');
    expect(html).toContain(t.attachmentElsewhere);
    expect(html).not.toContain('full client to view.');
  });

  it('shows a card note for interactive messages without a typing caption below drafts', () => {
    expect(
      renderToStaticMarkup(
        <MessageBubble
          message={human({
            author: 'bot',
            card: { kind: 'private-input', channelId: 'dm-ada' },
            body: '',
          })}
        />,
      ),
    ).toContain(t.card);
    const draft = renderToStaticMarkup(
      <DraftBubble draft={{ draftId: 'd', botSlug: 'b', body: 'Hel' }} />,
    );
    expect(draft).toContain('Hel');
    expect(draft).not.toContain(t.typing);
  });

  it('names a group Channel Bot above its first bubble and puts its avatar at the last one', () => {
    const bot = human({ author: 'bot', bot: 'ada', body: 'On it' });
    const speaker = { name: 'Ada', bot: undefined, group: 'g' };
    const avatar = '"Text">A</div>';
    const only = renderToStaticMarkup(
      <MessageBubble message={bot} speaker={{ ...speaker, first: true, last: true }} />,
    );
    expect(only).toContain('>Ada<');
    expect(only).toContain(avatar);
    const opening = renderToStaticMarkup(
      <MessageBubble message={bot} speaker={{ ...speaker, first: true, last: false }} />,
    );
    expect(opening).toContain('>Ada<');
    expect(opening).not.toContain(avatar);
    const closing = renderToStaticMarkup(
      <MessageBubble message={bot} speaker={{ ...speaker, first: false, last: true }} />,
    );
    expect(closing).not.toContain('>Ada<');
    expect(closing).toContain(avatar);
    expect(renderToStaticMarkup(<MessageBubble message={bot} />)).not.toContain('Ada');
    const draft = renderToStaticMarkup(
      <DraftBubble
        draft={{ draftId: 'd', botSlug: 'grace', body: 'Hel' }}
        speaker={{ name: 'Grace', bot: undefined, group: 'draft:d', first: true, last: true }}
      />,
    );
    expect(draft).toContain('>Grace<');
    expect(draft).toContain('"Text">G</div>');
  });

  it('keeps sticky avatar spans only for rows still in the Channel', () => {
    const registry = createSpeakerRegistry();
    registry.setGroups([
      { key: 'a', group: 'a' },
      { key: 'b', group: 'a' },
    ]);
    registry.layout('a', 'a', { height: 80, bubbleTop: 30 });
    registry.layout('b', 'a', { height: 50, bubbleTop: 4 });
    const span = registry.span('a');
    expect(span.value).toBe(50);
    registry.setGroups([{ key: 'b', group: 'b' }]);
    expect(registry.span('b').value).toBe(-4);
    expect(registry.span('a')).not.toBe(span);
    registry.setGroups([
      { key: 'a', group: 'a' },
      { key: 'b', group: 'a' },
    ]);
    expect(registry.span('a').value).toBe(0);
  });

  it('closes half-written Markdown in a streaming draft', () => {
    const draft = renderToStaticMarkup(
      <DraftBubble draft={{ draftId: 'd', botSlug: 'b', body: 'Use **pnpm te' }} />,
    );
    expect(draft).toContain('data-markdown="Use **pnpm te**"');
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
    expect(menuTime('2026-10-13T08:00:00.000Z', now).startsWith(t.yesterday)).toBe(true);
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

describe('outgoing delivery presentation through Conversation', () => {
  let root: Root | undefined;
  let stop: (() => void) | undefined;
  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = undefined;
    stop?.();
    stop = undefined;
    vi.useRealTimers();
    native.appState = 'active';
    native.appStateListeners.clear();
  });

  async function open() {
    const host = new FakeHost();
    host.channel('quiet-dm');
    let settle: (fail?: boolean) => void = () => {};
    host.methods.set(
      'channelSend',
      (args) =>
        new Promise((resolve, reject) => {
          settle = (fail = false) => {
            if (fail) reject(new Error('offline'));
            else {
              const channel = host.channel('quiet-dm');
              channel.append({ id: String(args['messageId']), body: String(args['body']) });
              resolve({ message: channel.messages.at(-1) });
            }
          };
        }),
    );
    const client = createHostClient({
      routes: ['https://studio.tailnet-example.ts.net'],
      credential: host.credential,
      carrier: host.carrier,
      timeoutMs: 60_000,
    });
    client.start();
    const target = createConversation({
      host: client,
      channelId: 'quiet-dm',
      messageId: () => 'quiet-message',
    });
    target.start();
    stop = () => {
      target.stop();
      client.stop();
    };
    await vi.waitFor(() => expect(target.getSnapshot().status).toBe('live'));
    const container = document.createElement('div');
    function Messages() {
      const snapshot = useSyncExternalStore(target.subscribe, target.getSnapshot);
      return snapshot.messages.map((message) => (
        <MessageBubble key={message.id} message={message} onRetry={target.retry} />
      ));
    }
    root = createRoot(container);
    act(() => root!.render(<Messages />));
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(10_000);
    const flush = () =>
      act(async () => {
        for (let n = 0; n < 30; n++) await Promise.resolve();
      });
    const send = async () => {
      act(() => {
        target.send('A quiet message');
      });
      await flush();
    };
    const surface = () =>
      Array.from(container.querySelectorAll<HTMLElement>('[data-native="View"]')).findLast(
        (node) => node.textContent === 'A quiet message',
      )!;
    return {
      container,
      target,
      host,
      send,
      surface,
      flush,
      settle: async (fail?: boolean) => {
        await act(async () => settle(fail));
        await flush();
      },
      remount: () => {
        act(() => root!.unmount());
        root = createRoot(container);
        act(() => root!.render(<Messages />));
      },
    };
  }

  it('keeps a send normal for three seconds, then shows feedback beside that pending bubble', async () => {
    const view = await open();
    await view.send();
    expect(view.container.textContent).not.toContain(t.sending);
    expect(view.surface().style.opacity).not.toBe('0.7');
    expect(view.container.textContent).not.toContain('…');
    act(() => vi.advanceTimersByTime(2_999));
    expect(view.surface().style.opacity).not.toBe('0.7');
    expect(view.container.textContent).not.toContain('…');
    act(() => vi.advanceTimersByTime(1));
    expect(view.surface().style.opacity).not.toBe('0.7');
    expect(view.container.textContent).toContain('…');
    expect(
      view.container
        .querySelector('[data-accessibilitystate]')
        ?.getAttribute('data-accessibilitystate'),
    ).toBe('{"busy":true}');
    const bubble = view.surface();
    await view.settle();
    expect(view.surface()).toBe(bubble);
    expect(view.container.querySelector('[data-accessibilityvalue]')).toBeNull();
    expect(view.container.querySelector('[data-accessibilitystate]')).toBeNull();
    expect(view.surface().style.opacity).not.toBe('0.7');
    expect(view.container.textContent).not.toContain('…');
    expect(view.host.channel('quiet-dm').messages).toHaveLength(1);
    expect(view.target.getSnapshot().messages).toHaveLength(1);
  });

  it('never shows feedback for a fast committed send when its old deadline passes', async () => {
    const view = await open();
    await view.send();
    act(() => vi.advanceTimersByTime(2_900));
    await view.settle();
    expect(view.surface().style.opacity).not.toBe('0.7');
    expect(view.container.textContent).not.toContain('…');
    act(() => vi.advanceTimersByTime(3_100));
    expect(view.surface().style.opacity).not.toBe('0.7');
    expect(view.container.textContent).not.toContain('…');
    expect(view.container.textContent).not.toContain(t.sending);
  });

  it.each([100, 3_200])(
    'retains failure and restarts feedback when retrying after %i ms',
    async (delay) => {
      const view = await open();
      await view.send();
      act(() => vi.advanceTimersByTime(delay));
      const originalAt = view.target.getSnapshot().messages[0]!.at;
      await view.settle(true);
      expect(view.container.textContent).toContain('!');
      expect(view.surface().style.opacity).not.toBe('0.7');
      expect(view.container.textContent).not.toContain('…');
      const retry = Array.from(
        view.container.querySelectorAll<HTMLElement>('[data-accessibilityrole="button"]'),
      ).find((element) => element.dataset.accessibilitylabel?.includes(t.retrySend));
      expect(retry).toBeDefined();
      act(() => retry!.click());
      await view.flush();
      expect(view.surface().style.opacity).not.toBe('0.7');
      expect(view.container.textContent).not.toContain('…');
      expect(view.container.textContent).not.toContain(t.notSent);
      act(() => vi.advanceTimersByTime(2_999));
      expect(view.surface().style.opacity).not.toBe('0.7');
      expect(view.container.textContent).not.toContain('…');
      act(() => vi.advanceTimersByTime(1));
      expect(view.surface().style.opacity).not.toBe('0.7');
      expect(view.container.textContent).toContain('…');
      await view.settle();
      expect(view.surface().style.opacity).not.toBe('0.7');
      expect(view.container.textContent).not.toContain('…');
      expect(view.host.channel('quiet-dm').messages).toHaveLength(1);
      expect(view.target.getSnapshot().messages).toHaveLength(1);
      expect(
        view.host.calls
          .filter((call) => call.method === 'channelSend')
          .map((call) => call.args['messageId']),
      ).toEqual(['quiet-message', 'quiet-message']);
      expect(originalAt).toBe(new Date(10_000).toISOString());
    },
  );

  it('keeps elapsed attempt time when the bubble is virtualized and remounted', async () => {
    const view = await open();
    await view.send();
    act(() => vi.advanceTimersByTime(2_000));
    view.remount();
    expect(view.surface().style.opacity).not.toBe('0.7');
    expect(view.container.textContent).not.toContain('…');
    act(() => vi.advanceTimersByTime(1_000));
    expect(view.surface().style.opacity).not.toBe('0.7');
    expect(view.container.textContent).toContain('…');
    view.remount();
    expect(view.surface().style.opacity).not.toBe('0.7');
    expect(view.container.textContent).toContain('…');
  });

  it('rechecks a pending attempt on foreground return even when its timer was suspended', async () => {
    const view = await open();
    await view.send();
    act(() => {
      native.appState = 'background';
      for (const listener of native.appStateListeners) listener('background');
    });
    vi.setSystemTime(20_000);
    act(() => {
      native.appState = 'active';
      for (const listener of native.appStateListeners) listener('active');
    });
    expect(view.surface().style.opacity).not.toBe('0.7');
    expect(view.container.textContent).toContain('…');
    await view.settle();
    act(() => {
      for (const listener of native.appStateListeners) listener('active');
      vi.advanceTimersByTime(3_000);
    });
    expect(view.surface().style.opacity).not.toBe('0.7');
    expect(view.container.textContent).not.toContain('…');
  });
});
