import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationMessage } from '../src/host/conversation';

const native = vi.hoisted(() => ({
  os: 'ios',
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
      if (typeof props['onPress'] === 'function' && typeof props['accessibilityLabel'] === 'string')
        native.presses.set(props['accessibilityLabel'], props['onPress'] as () => void);
      const attributes: Record<string, string> = {};
      for (const key of [
        'accessibilityLabel',
        'accessibilityRole',
        'accessibilityHint',
        'selectable',
        'source',
        'recyclingKey',
        'cachePolicy',
      ])
        if (props[key] !== undefined)
          attributes[`data-${key.toLowerCase()}`] =
            typeof props[key] === 'object' ? JSON.stringify(props[key]) : String(props[key]);
      return (
        <div data-native={name} {...attributes}>
          {children as never}
        </div>
      );
    };
    return Component;
  };
  return {
    useWindowDimensions,
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
  default: () => <svg />,
  Path: () => null,
}));

const { MessageBubble, DraftBubble, deliveryLabel } = await import('../src/ui/chat/message-bubble');
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

describe('message states', () => {
  it('shows a pending Human message as sending, without a retry control', () => {
    const html = renderToStaticMarkup(<MessageBubble message={human({ delivery: 'pending' })} />);
    expect(html).toContain(t.sending);
    expect(html).not.toContain(t.retrySend);
    expect(html).not.toContain('data-accessibilityrole="button"');
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
    expect(html).toContain(`data-accessibilityhint="${t.copyHint}"`);
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
