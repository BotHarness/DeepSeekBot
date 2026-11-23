// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type ConversationMessage } from '@botharness/host-client/conversation';
import { syntheticGenuiDocument } from '../../../packages/core/test/fixtures/genui-document';

const { native, mockGestureHandler, mockReactNative, mockEnrichedMarkdown, resetNative } =
  await vi.hoisted(() => import('./message-bubble-mocks'));

import {
  BubbleBody,
  DraftBubble,
  MessageActions,
  MessageBubble,
  deliveryLabel,
  human,
  messageMenuActions,
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

const { createSpeakerRegistry } = await import('../src/ui/chat/speaker-row');

beforeEach(resetNative);

describe('linked Sessions', () => {
  const message = human({
    author: 'bot',
    bot: 'ada',
    body: 'I queued the review and sent a follow-up.',
    sessionLinks: [
      { sessionId: 'review', kind: 'created', title: 'Release review' },
      { sessionId: 'follow-up', kind: 'sent', title: 'Follow up' },
    ],
  });

  it.each(['ios', 'android'])(
    'keeps message actions and Session chips separately accessible on %s',
    async (os) => {
      native.os = os;
      const measurement = await import('../src/ui/primitives/measure-message-view');
      const measure = vi
        .spyOn(measurement, 'measureMessageView')
        .mockImplementation((_view, then) => {
          then(16, 400, 200, 60);
        });
      try {
        const onLongPress = vi.fn();
        const onOpenSession = vi.fn();
        const onOpenReply = vi.fn();
        const holder = document.createElement('div');
        holder.innerHTML = renderToStaticMarkup(
          <MessageBubble
            message={{
              ...message,
              replyTo: 'original',
              replyPreview: {
                author: { kind: 'human', humanId: 'human' },
                body: 'How is the review?',
              },
            }}
            onLongPress={onLongPress}
            onOpenSession={onOpenSession}
            onOpenReply={onOpenReply}
          />,
        );
        const actionTarget = holder.querySelector(
          '[data-accessible="true"][data-accessibilityactions]',
        );
        const chip = holder.querySelector('[data-testid="message-session-review"]');
        expect(actionTarget?.getAttribute('data-accessibilitylabel')).toBe(message.body);
        expect(actionTarget?.getAttribute('data-accessibilityactions')).toContain('longpress');
        expect(actionTarget?.getAttribute('data-accessibilityactions')).toContain('reply-original');
        expect(chip?.getAttribute('data-accessibilityrole')).toBe('button');
        expect(actionTarget?.contains(chip)).toBe(false);
        native.presses.get(t.sessionDetail.open('Release review'))?.();
        expect(onOpenSession).toHaveBeenCalledOnce();
        expect(onLongPress).not.toHaveBeenCalled();
        native.actions.get(message.body)?.({ nativeEvent: { actionName: 'longpress' } });
        expect(onLongPress).toHaveBeenCalledOnce();
        native.actions.get(message.body)?.({ nativeEvent: { actionName: 'reply-original' } });
        expect(onOpenReply).toHaveBeenCalledExactlyOnceWith('original');
        native.longPresses.find((gesture) => gesture.enabled)?.start();
        expect(onLongPress).toHaveBeenCalledTimes(2);
      } finally {
        measure.mockRestore();
      }
    },
  );

  it('keeps actions available for a reply containing only a Session chip', () => {
    const holder = document.createElement('div');
    holder.innerHTML = renderToStaticMarkup(
      <MessageBubble message={{ ...message, body: '' }} onOpenSession={() => {}} />,
    );
    const actionTarget = holder.querySelector(
      '[data-accessible="true"][data-accessibilityactions]',
    );
    expect(actionTarget?.getAttribute('data-accessibilitylabel')).toBe(t.messageActions);
    expect(actionTarget?.getAttribute('data-accessibilityactions')).toContain('longpress');
  });
  it('places sent and created Session chips around the text inside the bubble and opens the selected Session', () => {
    const onOpenSession = vi.fn();
    const holder = document.createElement('div');
    holder.innerHTML = renderToStaticMarkup(
      <BubbleBody
        message={message}
        group={{ first: true, last: true }}
        onOpenSession={onOpenSession}
      />,
    );
    expect(holder.children).toHaveLength(1);
    const bubble = holder.firstElementChild!;
    const text = bubble.querySelector('[data-markdown]')!;
    const sent = bubble.querySelector('[data-testid="message-session-follow-up"]')!;
    const created = bubble.querySelector('[data-testid="message-session-review"]')!;
    expect(text?.getAttribute('data-markdown')).toBe(message.body);
    expect(sent.textContent).toBe('Follow up');
    expect(created.textContent).toBe('Release review');
    expect(sent.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(text.compareDocumentPosition(created) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    native.presses.get(t.sessionDetail.open('Release review'))?.();
    expect(onOpenSession).toHaveBeenCalledWith(
      { sessionId: 'review', kind: 'created', title: 'Release review' },
      'ada',
    );
  });

  it('folds multiple links by kind and shows the warning next to the matching Session', async () => {
    const holder = document.createElement('div');
    const root = createRoot(holder);
    const onOpenSession = vi.fn();
    const second = { sessionId: 'proof', kind: 'created', title: 'Check evidence' } as const;
    const needs = new Map([['proof', 'waiting-human']] as const);
    const title = t.sessionDetail.linkCount('created', 2);
    const toggle = () => holder.querySelector('[data-testid="message-session-toggle-created"]');
    try {
      await act(() =>
        root.render(
          <BubbleBody
            message={{ ...message, sessionLinks: [...message.sessionLinks!, second] }}
            group={{ first: true, last: true }}
            onOpenSession={onOpenSession}
            sessionLinkNeeds={needs}
          />,
        ),
      );
      expect(toggle()?.getAttribute('data-accessibilitystate')).toBe('{"expanded":false}');
      expect(holder.textContent).toContain('Follow up');
      expect(holder.textContent).not.toContain(second.title);
      await act(() => native.presses.get(title)?.());
      expect(toggle()?.getAttribute('data-accessibilitystate')).toBe('{"expanded":true}');
      expect(holder.textContent).toContain(
        second.title + t.sessionDetail.linkNeeds['waiting-human'],
      );
      const chip = holder.querySelector('[data-testid="message-session-proof"]');
      await act(() => native.presses.get(chip?.getAttribute('data-accessibilitylabel') ?? '')?.());
      expect(onOpenSession).toHaveBeenCalledWith(second, 'ada');
      await act(() => native.presses.get(title)?.());
      expect(holder.textContent).not.toContain(second.title);
      expect(holder.textContent).toContain('Follow up');
    } finally {
      await act(() => root.unmount());
    }
  });

  it('omits Session chips from a purged message even when cached links are present', () => {
    const markup = renderToStaticMarkup(
      <BubbleBody
        message={{
          ...message,
          body: '',
          source: {
            channelId: 'dm-ada',
            revision: 1,
            message: {
              id: message.id,
              at: message.at,
              body: '',
              author: { kind: 'bot', slug: 'ada' },
              contentPurge: {},
            },
          },
        }}
        group={{ first: true, last: true }}
        onOpenSession={vi.fn()}
      />,
    );
    expect(markup).not.toContain('message-session-');
    expect(markup).not.toContain('Release review');
  });
});

describe('GenUI keyboard interaction', () => {
  it.each(['ios', 'android'])(
    'pauses following before an embedded input opens the keyboard on %s',
    (os) => {
      native.os = os;
      const onInteractionStart = vi.fn();
      const container = document.createElement('div');
      const root = createRoot(container);
      act(() =>
        root.render(
          <MessageBubble
            {...{
              message: human({ author: 'bot', genuiDocument: syntheticGenuiDocument }),
              onInteractionStart,
            }}
          />,
        ),
      );
      act(() => {
        container.querySelector('input')!.dispatchEvent(new Event('touchstart', { bubbles: true }));
      });
      expect(onInteractionStart).toHaveBeenCalledTimes(os === 'ios' ? 1 : 0);
      act(() => root.unmount());
    },
  );
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

  it('keeps standalone selectable Markdown block menus available', async () => {
    const { MarkdownView } = await import('../src/ui/markdown-view');
    const html = renderToStaticMarkup(<MarkdownView source={'```ts\nconst value = 1;\n```'} />);
    expect(html).toContain('data-selectable="true"');
    expect(html).toContain('data-block-context-menu="true"');
  });

  it('preserves the Android renderer block-menu default', async () => {
    native.os = 'android';
    const { MarkdownView } = await import('../src/ui/markdown-view');
    const html = renderToStaticMarkup(
      <MarkdownView source={'```ts\nconst value = 1;\n```'} selectable={false} />,
    );
    expect(html).toContain('data-block-context-menu="true"');
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
    expect(html).toContain('data-block-context-menu="false"');
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

  it('shows a Bot voice bar above the text, and the text alone when the voice failed', () => {
    const audio = {
      key: 'computer:c:m:voice',
      identity: 'voice-hash',
      kind: 'audio' as const,
      name: 'voice-m.mp3',
      mime: 'audio/mpeg',
      size: 4096,
      local: false,
      source: { uri: 'https://computer.test/attachment', headers: {} },
    };
    const ready = renderToStaticMarkup(
      <MessageBubble
        message={human({
          author: 'bot',
          bot: 'ada',
          body: 'All checks passed.',
          voice: { state: 'ready', audio },
        })}
      />,
    );
    expect(ready).toContain(`data-accessibilitylabel="${t.playVoice}"`);
    expect(ready.indexOf(t.playVoice)).toBeLessThan(ready.indexOf('All checks passed.'));
    expect(ready).not.toContain('voice-m.mp3');

    const failed = renderToStaticMarkup(
      <MessageBubble
        message={human({
          author: 'bot',
          bot: 'ada',
          body: 'Still here.',
          voice: { state: 'failed', error: 'The voice service is busy.' },
        })}
      />,
    );
    expect(failed).toContain('Still here.');
    expect(failed).toContain(t.voiceFailed('The voice service is busy.'));
    expect(failed).not.toContain(t.playVoice);
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

describe('message time', () => {
  const time = (html: string) => {
    const container = document.createElement('div');
    container.innerHTML = html;
    return container.querySelector('[data-testid="message-time"]')?.textContent;
  };
  const bot = (overrides: Partial<ConversationMessage>) =>
    human({
      id: 'bot-1',
      author: 'bot',
      bot: 'ada',
      body: 'On it',
      ...overrides,
    });

  it.each([
    human({}),
    bot({}),
    bot({ body: 'First paragraph\n\nSecond one' }),
    human({ delivery: 'pending' }),
    human({ delivery: 'failed' }),
  ])('keeps the timestamp off a $delivery $author bubble', (message) => {
    const html = renderToStaticMarkup(<MessageBubble message={message} />);
    expect(time(html)).toBeUndefined();
    expect(html).not.toContain('message-time-unsent');
    expect(html).not.toContain('✓');
  });

  it('shows no time while a reply streams', () => {
    expect(
      time(renderToStaticMarkup(<MessageBubble message={bot({})} streaming />)),
    ).toBeUndefined();
    expect(
      time(
        renderToStaticMarkup(
          <DraftBubble draft={{ draftId: 'd', botSlug: 'ada', body: 'Thinking' } as never} />,
        ),
      ),
    ).toBeUndefined();
  });
});

describe('media bubbles', () => {
  const source = { uri: 'https://host/a', headers: {} };
  const image = (index: number) => ({
    key: `img-${index}`,
    kind: 'image' as const,
    name: `photo-${index}.jpg`,
    source,
    local: false,
  });
  const render = (message: ConversationMessage, props: Record<string, unknown> = {}) => {
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(<MessageBubble message={message} {...props} />);
    return container;
  };
  const byTest = (container: Element, id: string) =>
    container.querySelectorAll(`[data-testid="${id}"]`);

  it.each(['ios', 'android'])('routes each file row to its own attachment on %s', async (os) => {
    native.os = os;
    const files: ConversationMessage['attachments'] = ['first.txt', 'second.pdf', 'third.csv'].map(
      (name, index) => ({
        key: `multi-file:${index}`,
        kind: 'file',
        name,
        source: { uri: `https://host/file-${index}`, headers: {} },
        local: false,
      }),
    );
    const shared = vi.fn(async (_attachment: ConversationMessage['attachments'][number]) => {});
    const menu = vi.fn();
    const select = vi.fn();
    render(human({ body: '', attachments: files }), {
      onShare: shared,
      onLongPress: menu,
      onSelect: select,
    });
    for (const name of ['second.pdf', 'third.csv', 'first.txt']) {
      const press = native.presses.get(t.shareFile(name));
      expect(press).toBeDefined();
      await act(async () => press?.());
    }
    expect(shared.mock.calls.map(([attachment]) => attachment.source?.uri)).toEqual([
      'https://host/file-1',
      'https://host/file-2',
      'https://host/file-0',
    ]);
    expect(menu).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it('shows an uncaptioned image without a time pill', () => {
    const container = render(human({ body: '', attachments: [image(1)] }));
    const album = byTest(container, 'message-album')[0]!;
    expect(byTest(album, 'message-album-tile')).toHaveLength(1);
    expect(byTest(container, 'message-image-time')).toHaveLength(0);
    expect(byTest(container, 'message-time')).toHaveLength(0);
  });

  it('puts a caption below the image without a bubble time', () => {
    const container = render(human({ body: 'Sunset', attachments: [image(1)] }));
    const album = byTest(container, 'message-album')[0]!;
    const caption = byTest(container, 'message-text')[0]!;
    expect(album.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(byTest(container, 'message-image-time')).toHaveLength(0);
    expect(album.querySelector('[data-testid="message-time"]')).toBeNull();
    expect(byTest(container, 'message-time')).toHaveLength(0);
  });

  it('gathers several images into one album with +N on the last tile', () => {
    const opened: string[] = [];
    const images = Array.from({ length: 7 }, (_, index) => image(index + 1));
    const container = render(human({ body: '', attachments: images }), {
      onOpenImage: (attachment: { key: string }) => opened.push(attachment.key),
    });
    const albums = byTest(container, 'message-album');
    expect(albums).toHaveLength(1);
    expect(albums[0]!.getAttribute('data-accessibilitylabel')).toBe(t.imageCount(7));
    const tiles = byTest(container, 'message-album-tile');
    expect(tiles).toHaveLength(5);
    expect(tiles[4]!.textContent).toContain('+2');
    expect(tiles[3]!.textContent).not.toContain('+');
    native.presses.get(t.openImage('photo-3.jpg'))!();
    expect(opened).toEqual(['img-3']);
  });

  it('plays voice from one row with the played and total time, no title or download', () => {
    const audio = {
      key: 'voice-key',
      identity: 'voice-hash',
      kind: 'audio' as const,
      name: 'voice-m.mp3',
      size: 4096,
      local: false,
      source,
    };
    const container = render(
      human({
        author: 'bot',
        bot: 'ada',
        body: 'Spoken',
        voice: { state: 'ready', audio, durationMs: 7000 },
      }),
    );
    const row = byTest(container, 'voice-bar')[0]!;
    expect(row.getAttribute('data-accessibilitylabel')).toBe(t.playVoice);
    expect(byTest(row, 'voice-time')[0]?.textContent).toBe('0:00 / 0:07');
    expect(row.textContent).not.toContain(t.voiceLabel);
    expect(row.textContent).not.toContain('4 KB');
    expect(container.querySelectorAll('[data-accessibilityrole="button"]')).toHaveLength(1);
  });

  it('shows a file as one row with a type tile, its name, and size · type', () => {
    const container = render(
      human({
        author: 'bot',
        body: '',
        attachments: [
          { key: 'f', kind: 'file', name: 'Q3 report.pdf', size: 3_500_000, source, local: false },
        ],
      }),
    );
    const row = byTest(container, 'message-file')[0]!;
    expect(row.getAttribute('data-accessibilitylabel')).toBe(t.shareFile('Q3 report.pdf'));
    expect(byTest(row, 'message-file-tile')[0]?.textContent).toBe('PDF');
    expect(row.textContent).toContain('Q3 report.pdf');
    expect(row.textContent).toContain('3.3 MB · PDF');
    expect(row.querySelectorAll('[data-accessibilityrole="button"]')).toHaveLength(0);
  });

  it('hints at quoted media: a thumbnail for images, the length for voice, the name for files', () => {
    const quote = (media: never, body = '', extra: Partial<ConversationMessage> = {}) => {
      const container = render(
        human({
          body: 'this',
          replyTo: 'm-1',
          replyPreview: { author: { kind: 'bot', slug: 'ada' }, body, media },
          ...extra,
        }),
      );
      return {
        text: byTest(container, 'reply-quote-text')[0]?.textContent,
        thumb: byTest(container, 'reply-quote-thumb')[0],
      };
    };
    const photo = quote({ kind: 'image', count: 1 } as never, '', {
      replyThumbnail: { source, thumbhash: 'abc' },
    });
    expect(photo.text).toBe(t.reply.photo);
    expect(photo.thumb?.getAttribute('data-native')).toBe('Image');
    expect(quote({ kind: 'image', count: 3 } as never, 'Trip').text).toBe('Trip');
    expect(quote({ kind: 'image', count: 3 } as never).text).toBe(t.reply.photos(3));
    expect(quote({ kind: 'image', count: 3 } as never).thumb).toBeUndefined();
    expect(quote({ kind: 'voice', durationMs: 7000 } as never, 'Spoken').text).toBe(
      t.reply.voice('0:07'),
    );
    expect(quote({ kind: 'voice' } as never, 'Spoken').text).toBe(t.reply.voice('Spoken'));
    expect(quote({ kind: 'file', name: 'Q3.pdf', count: 1 } as never).text).toBe(
      t.reply.file('Q3.pdf'),
    );
    expect(quote({ kind: 'file', name: 'Q3.pdf', count: 1 } as never, 'See this').text).toBe(
      'See this',
    );
  });

  it('moves downloading and sharing attachments into the long-press menu', () => {
    const shared: string[] = [];
    const file = {
      key: 'f',
      kind: 'file' as const,
      name: 'Q3.pdf',
      size: 10,
      source,
      local: false,
    };
    const photo = image(1);
    const message = human({ author: 'bot', body: '', attachments: [photo, file] });
    renderToStaticMarkup(
      <MessageActions
        target={{
          message,
          anchor: { x: 0, y: 400, width: 200, height: 60 },
          group: { first: true, last: true },
        }}
        onClose={() => {}}
        onReact={() => {}}
        onCopy={() => {}}
        onShareText={() => {}}
        onShareAttachment={(attachment) => shared.push(attachment.key)}
      />,
    );
    expect(messageMenuActions(message).map((action) => action.label)).toEqual([
      t.shareFile('photo-1.jpg'),
      t.shareFile('Q3.pdf'),
    ]);
    native.presses.get(t.shareFile('Q3.pdf'))!();
    expect(shared).toEqual([]);
    native.dismiss();
    expect(shared).toEqual(['f']);
    const audio = { ...file, key: 'v', kind: 'audio' as const, name: 'voice.mp3' };
    expect(
      messageMenuActions(
        human({ author: 'bot', body: 'Hi', voice: { state: 'ready', audio } }),
      ).map((action) => action.label),
    ).toContain(t.shareFile('voice.mp3'));
    expect(
      messageMenuActions(
        human({ author: 'bot', body: '', attachments: [{ ...file, source: undefined } as never] }),
      ),
    ).toEqual([]);
  });

  it('keeps two images side by side in one album', () => {
    const container = render(human({ body: '', attachments: [image(1), image(2)] }));
    expect(byTest(container, 'message-album')).toHaveLength(1);
    expect(byTest(container, 'message-album-tile')).toHaveLength(2);
    expect(container.textContent).not.toContain('+');
  });
});

it('keeps the displayed image mounted when reply becomes unavailable and recovers', () => {
  native.os = 'android';
  const message = human({
    author: 'bot',
    body: 'image',
    attachments: [
      {
        key: 'photo',
        name: 'photo.png',
        kind: 'image',
        local: false,
        source: { uri: 'https://example.test/photo.png', headers: {} },
      },
    ],
  });
  const container = document.createElement('div');
  const root = createRoot(container);
  const reply = vi.fn();
  try {
    act(() => root.render(<MessageBubble message={message} onReply={reply} />));
    const image = container.querySelector('[data-native="Image"]');
    expect(image).not.toBeNull();
    act(() => root.render(<MessageBubble message={message} />));
    expect(container.querySelector('[data-native="Image"]')).toBe(image);
    expect(container.querySelector('[data-nativeid="horizontal-swipe-owner"]')).toBeNull();
    act(() => root.render(<MessageBubble message={message} onReply={reply} />));
    expect(container.querySelector('[data-native="Image"]')).toBe(image);
    expect(container.querySelector('[data-nativeid="horizontal-swipe-owner"]')).not.toBeNull();
  } finally {
    act(() => root.unmount());
  }
});
