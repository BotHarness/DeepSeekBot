// @vitest-environment jsdom
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConversation } from '@botharness/host-client/conversation';
import { createHostClient } from '@botharness/host-client/client';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';

const { native, mockGestureHandler, mockReactNative, mockEnrichedMarkdown, resetNative } =
  await vi.hoisted(() => import('./message-bubble-mocks'));

import { MessageBubble, human, t } from './message-bubble-fixtures';

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

beforeEach(resetNative);

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
    act(() => {
      vi.advanceTimersByTime(2_999);
    });
    expect(view.surface().style.opacity).not.toBe('0.7');
    expect(view.container.textContent).not.toContain('…');
    act(() => {
      vi.advanceTimersByTime(1);
    });
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
    act(() => {
      vi.advanceTimersByTime(2_900);
    });
    await view.settle();
    expect(view.surface().style.opacity).not.toBe('0.7');
    expect(view.container.textContent).not.toContain('…');
    act(() => {
      vi.advanceTimersByTime(3_100);
    });
    expect(view.surface().style.opacity).not.toBe('0.7');
    expect(view.container.textContent).not.toContain('…');
    expect(view.container.textContent).not.toContain(t.sending);
  });

  it.each([100, 3_200])(
    'retains failure and restarts feedback when retrying after %i ms',
    async (delay) => {
      const view = await open();
      await view.send();
      act(() => {
        vi.advanceTimersByTime(delay);
      });
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
      act(() => {
        vi.advanceTimersByTime(2_999);
      });
      expect(view.surface().style.opacity).not.toBe('0.7');
      expect(view.container.textContent).not.toContain('…');
      act(() => {
        vi.advanceTimersByTime(1);
      });
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
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    view.remount();
    expect(view.surface().style.opacity).not.toBe('0.7');
    expect(view.container.textContent).not.toContain('…');
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
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
