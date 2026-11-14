// @vitest-environment jsdom
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createConversation, type ConversationMessage } from '../src/host/conversation';
import { createHostClient } from '../src/host/client';
import { FakeHost } from './fake-host';
import { syntheticGenuiDocument } from '../../../packages/core/test/fixtures/genui-document';

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
  holds: new Map<string, () => void>(),
  actions: new Map<string, (event: { nativeEvent: { actionName: string } }) => void>(),
  layouts: new Map<string, (event: { nativeEvent: { layout: { height: number } } }) => void>(),
  dismiss: () => {},
  longPresses: Array<{ enabled: boolean; duration: number; start: () => void }>(),
}));

vi.mock('../src/ui/chat/message-attachment-picker', () => ({
  MessageAttachmentPicker: () => null,
}));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));

vi.mock('react-native-gesture-handler', async () => {
  const shim = await import('./gesture-handler-shim');
  return {
    ...shim,
    Gesture: new Proxy(shim.Gesture, {
      get: (target, key) => {
        if (key !== 'LongPress') return Reflect.get(target, key);
        return () => {
          const gesture = { enabled: true, duration: 500, start: () => {} };
          native.longPresses.push(gesture);
          const builder = {
            enabled: (value: boolean) => ((gesture.enabled = value), builder),
            minDuration: (value: number) => ((gesture.duration = value), builder),
            runOnJS: () => builder,
            onStart: (callback: () => void) => ((gesture.start = callback), builder),
          };
          return builder;
        };
      },
    }),
  };
});
vi.mock('react-native', async () => {
  const { useWindowDimensions, StyleSheet } = await import('./react-native-shim');
  const host = (name: string) => {
    const Component = ({ children, ...props }: Record<string, unknown>) => {
      const pressKey = props['accessibilityLabel'] ?? props['accessibilityHint'];
      if (typeof props['onPress'] === 'function' && typeof pressKey === 'string')
        native.presses.set(pressKey, props['onPress'] as () => void);
      if (typeof props['onLongPress'] === 'function' && typeof pressKey === 'string')
        native.holds.set(pressKey, props['onLongPress'] as () => void);
      if (typeof props['onAccessibilityAction'] === 'function' && typeof pressKey === 'string')
        native.actions.set(pressKey, props['onAccessibilityAction'] as never);
      if (typeof props['onLayout'] === 'function' && typeof props['testID'] === 'string')
        native.layouts.set(props['testID'], props['onLayout'] as never);
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
        'nativeID',
        'testID',
        'accessibilityElementsHidden',
        'accessibilityActions',
        'importantForAccessibility',
      ])
        if (props[key] !== undefined)
          attributes[`data-${key.toLowerCase()}`] =
            typeof props[key] === 'object' ? JSON.stringify(props[key]) : String(props[key]);
      const style = props['style'] as { opacity?: number } | undefined;
      const touch = props['onTouchStart'];
      return (
        <div
          ref={props['ref'] as never}
          data-native={name}
          {...attributes}
          style={{ opacity: style?.opacity }}
          onClick={props['onPress'] as (() => void) | undefined}
          onTouchStart={typeof touch === 'function' ? () => touch() : undefined}
        >
          {children as never}
        </div>
      );
    };
    return Component;
  };
  return {
    I18nManager: { isRTL: false },
    useWindowDimensions,
    Dimensions: {
      get: useWindowDimensions,
      addEventListener: (_event: string, _changed: () => void) => ({ remove() {} }),
    },
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

vi.mock('react-native-enriched-markdown', () => ({
  EnrichedMarkdownText: (props: {
    markdown: string;
    selectable?: boolean;
    enableBlockContextMenu?: boolean;
    flavor?: string;
    md4cFlags?: { latexMath?: boolean };
    onLinkPress?: unknown;
  }) => (
    <div
      data-native="EnrichedMarkdownText"
      data-selectable={String(props.selectable)}
      data-block-context-menu={String(props.enableBlockContextMenu)}
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

const { MessageBubble, DraftBubble, deliveryLabel, secondTap, replyable } =
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
  native.holds.clear();
  native.layouts.clear();
  native.actions.clear();
  native.longPresses.length = 0;
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
      act(() =>
        container.querySelector('input')!.dispatchEvent(new Event('touchstart', { bubbles: true })),
      );
      expect(onInteractionStart).toHaveBeenCalledTimes(os === 'ios' ? 1 : 0);
      act(() => root.unmount());
    },
  );
});

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
      act(() => root.render(<MessageBubble message={mentioned} readers={['ada']} />));
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
        (node) =>
          node
            .querySelector(':scope > [data-testid="message-text"]')
            ?.textContent?.startsWith('A quiet message') === true,
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

  it("shows the time inside a committed bubble, with a check after the Human's", () => {
    expect(time(renderToStaticMarkup(<MessageBubble message={human({})} />))).toMatch(
      /^\d{1,2}:\d{2}.*✓$/,
    );
    expect(time(renderToStaticMarkup(<MessageBubble message={bot({})} />))).toMatch(
      /^\d{1,2}:\d{2}(?:\s?[AP]M)?$/,
    );
  });

  it("puts a one-line Bot reply's time beside its text, and a longer reply's on its own line", () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const timeRow = () =>
      container.querySelector('[data-testid="message-time"]')?.parentElement?.dataset['testid'];
    try {
      act(() => root.render(<MessageBubble message={bot({ body: 'On it' })} />));
      expect(timeRow()).toBe('message-body-row');
      act(() =>
        native.layouts.get('message-body')!({
          nativeEvent: { layout: { height: 22 } },
        }),
      );
      expect(timeRow()).toBe('message-body-row');
      act(() =>
        native.layouts.get('message-body')!({
          nativeEvent: { layout: { height: 66 } },
        }),
      );
      expect(timeRow()).not.toBe('message-body-row');
      expect(
        container
          .querySelector('[data-testid="message-time"]')
          ?.previousElementSibling?.getAttribute('data-native'),
      ).toBe('EnrichedMarkdownText');
      act(() =>
        root.render(<MessageBubble message={bot({ body: 'First paragraph\n\nSecond one' })} />),
      );
      expect(timeRow()).not.toBe('message-body-row');
    } finally {
      act(() => root.unmount());
    }
  });

  it("lets the Human's text flow around its time, which a screen reader hears once", () => {
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(<MessageBubble message={human({})} />);
    const shown = container.querySelector('[data-testid="message-time"]')!;
    const text = container.querySelector('[data-testid="message-text"]')!;
    expect(text.contains(shown)).toBe(false);
    const spacer = text.querySelector('[data-importantforaccessibility="no-hide-descendants"]');
    expect(spacer?.getAttribute('data-accessibilityelementshidden')).toBe('true');
    expect(spacer?.textContent).toBe(shown.textContent);
  });

  it('keeps the time row while a message is sending or failed, with the check hidden until commit', () => {
    const committed = document.createElement('div');
    committed.innerHTML = renderToStaticMarkup(<MessageBubble message={human({})} />);
    const shown = committed.querySelector('[data-testid="message-time"]')!;
    for (const message of [human({ delivery: 'pending' }), human({ delivery: 'failed' })]) {
      const container = document.createElement('div');
      container.innerHTML = renderToStaticMarkup(<MessageBubble message={message} />);
      const unsent = container.querySelector('[data-testid="message-time"]')!;
      expect(unsent.textContent).toBe(shown.textContent);
      expect(unsent.getAttribute('data-accessibilitylabel')).toMatch(/^\d{1,2}:\d{2}/);
      expect(unsent.getAttribute('data-accessibilitylabel')).not.toContain('✓');
      expect(container.querySelector('[data-testid="message-time-unsent"]')?.textContent).toBe(
        '\u00a0✓',
      );
    }
    expect(committed.querySelector('[data-testid="message-time-unsent"]')).toBeNull();
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

  it('puts the time of an uncaptioned image on a pill over the image', () => {
    const container = render(human({ body: '', attachments: [image(1)] }));
    const album = byTest(container, 'message-album')[0]!;
    expect(byTest(album, 'message-album-tile')).toHaveLength(1);
    const pill = byTest(container, 'message-image-time')[0]!;
    expect(album.contains(pill)).toBe(true);
    expect(pill.querySelector('[data-testid="message-time"]')?.textContent).toMatch(/✓$/);
    expect(byTest(container, 'message-time')).toHaveLength(1);
  });

  it('puts a caption below the image with the time after it', () => {
    const container = render(human({ body: 'Sunset', attachments: [image(1)] }));
    const album = byTest(container, 'message-album')[0]!;
    const caption = byTest(container, 'message-text')[0]!;
    expect(album.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(byTest(container, 'message-image-time')).toHaveLength(0);
    expect(album.querySelector('[data-testid="message-time"]')).toBeNull();
    expect(byTest(container, 'message-time')).toHaveLength(1);
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
