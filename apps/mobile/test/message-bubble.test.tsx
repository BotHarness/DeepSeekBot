import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationMessage } from '../src/host/conversation';

const native = vi.hoisted(() => ({
  os: 'ios',
  copied: [] as string[],
  sheets: [] as Array<{ options: string[]; cancelButtonIndex?: number }>,
  toasts: [] as string[],
  pick: 0,
}));

vi.mock('react-native', () => {
  const host = (name: string) => {
    const Component = ({ children, ...props }: Record<string, unknown>) => {
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
    View: host('View'),
    Text: host('Text'),
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    Image: host('Image'),
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
const { t } = await import('../src/ui/strings');
const { openMessageMenu } = await import('../src/ui/chat/message-menu');

beforeEach(() => {
  native.os = 'ios';
  native.copied.length = 0;
  native.sheets.length = 0;
  native.toasts.length = 0;
  native.pick = 0;
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

  it('shows a card note for interactive messages and a typing line for drafts', () => {
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
    expect(draft).toContain(t.typing);
  });

  it('names the Bot above its group bubbles and its draft in a group Channel', () => {
    const bot = human({ author: 'bot', bot: 'ada', body: 'On it' });
    expect(renderToStaticMarkup(<MessageBubble message={bot} author="Ada" />)).toContain('Ada');
    expect(renderToStaticMarkup(<MessageBubble message={bot} />)).not.toContain('Ada');
    const draft = renderToStaticMarkup(
      <DraftBubble draft={{ draftId: 'd', botSlug: 'grace', body: 'Hel' }} author="Grace" />,
    );
    expect(draft).toContain('Grace');
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
