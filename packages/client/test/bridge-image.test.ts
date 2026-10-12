// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseChannelMessage } from '../src/client/bridge.js';
import { BridgeImage } from '../src/client/bridge-image.js';
import { ChannelMessageBody } from '../src/client/channel-message-body.js';
import { zhTranslate } from '../src/client/locale.js';
let changed: () => void;
vi.mock('../src/client/messaging-defaults-live.js', () => ({
  subscribeMessagingDefaults: (callback: () => void) => {
    changed = callback;
    return () => {};
  },
}));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Modal: ({ children }: { children: ReactNode }) =>
    createElement('div', { role: 'dialog' }, children),
  MarkdownText: () => null,
  FileTypeIcon: () => null,
  StateDot: () => null,
  Button: () => null,
}));
const observers: { notify: IntersectionObserverCallback; element?: Element }[] = [];
const roots: { root: Root; container: HTMLDivElement }[] = [];
const fetchImage = vi.fn();
const createUrl = vi.fn(() => 'blob:checked-image');
const revokeUrl = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  observers.length = 0;
  fetchImage.mockReset();
  createUrl.mockClear();
  revokeUrl.mockClear();
  vi.stubGlobal('fetch', fetchImage);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      state: { notify: IntersectionObserverCallback; element?: Element };
      constructor(notify: IntersectionObserverCallback) {
        this.state = { notify };
        observers.push(this.state);
      }
      observe(element: Element) {
        this.state.element = element;
      }
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = createUrl;
      static override revokeObjectURL = revokeUrl;
    },
  );
});
afterEach(async () => {
  for (const { root, container } of roots.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
  vi.unstubAllGlobals();
});
async function render(
  element: ReactNode = createElement(BridgeImage, {
    channelId: 'channel',
    sourceEventId: 'source',
    attachmentId: 'a'.repeat(64),
    name: 'image',
    t: zhTranslate,
  }),
) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  await act(async () => root.render(element));
  return container;
}
async function visible(index = 0) {
  const observer = observers[index]!;
  await act(async () =>
    observer.notify(
      [{ isIntersecting: true, target: observer.element! } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
}
const imageResponse = () =>
  new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } });

it('acquires only visible media, uses Channel/source selectors and cancels/releases disposed previews', async () => {
  fetchImage.mockResolvedValue(imageResponse());
  const container = await render();
  expect(fetchImage).not.toHaveBeenCalled();
  await visible();
  expect(fetchImage).toHaveBeenCalledTimes(1);
  const [url, options] = fetchImage.mock.calls[0]!;
  expect(url).toContain('channelId=channel');
  expect(url).toContain('sourceEventId=source');
  expect(url).not.toContain('slug=');
  expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:checked-image');
  await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
  expect(container.querySelector('[role=dialog] img')).not.toBeNull();
  await act(async () => roots[0]!.root.unmount());
  expect(options.signal.aborted).toBe(true);
  expect(revokeUrl).toHaveBeenCalledWith('blob:checked-image');
});

it('shows a recoverable failure, then removes held previews when current authorization changes', async () => {
  fetchImage
    .mockResolvedValueOnce(new Response(null, { status: 500 }))
    .mockResolvedValueOnce(imageResponse())
    .mockResolvedValueOnce(new Response(null, { status: 403 }));
  const container = await render();
  await visible();
  expect(container.textContent).toContain('重试');
  await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
  expect(container.querySelector('img')).not.toBeNull();
  await act(async () => changed());
  expect(container.querySelector('img')).toBeNull();
  expect(container.textContent).toContain('不可访问');
  expect(revokeUrl).toHaveBeenCalledWith('blob:checked-image');
});

it('preserves text/image/text order inside one bubble without rendering native text as Markdown', async () => {
  const id = 'a'.repeat(64);
  const container = await render(
    createElement(ChannelMessageBody, {
      channelId: 'channel',
      t: zhTranslate,
      message: {
        id: 'source',
        at: '2026-10-06T00:00:00Z',
        body: 'BeforeAfter',
        author: { kind: 'bridged', source: 'Alex' },
        bridgeOrigin: {
          sourceEventId: 'source',
          platform: 'feishu',
          conversationId: 'private',
          conversationName: 'QA',
          messageId: 'message',
          senderId: 'actor',
          mentions: [{ id: 'external-user', key: '@_user_1', name: 'Jamie' }],
        },
        bridgeMedia: {
          items: [{ id, kind: 'image', name: 'image' }],
          parts: [
            { kind: 'text', text: '**Before** @_user_1' },
            { kind: 'attachment', id },
            { kind: 'text', text: 'After' },
          ],
        },
      },
    }),
  );
  expect(container.querySelectorAll('[data-media-id]')).toHaveLength(1);
  expect(container.innerHTML.indexOf('**Before**')).toBeLessThan(
    container.innerHTML.indexOf('data-media-id'),
  );
  expect(container.innerHTML.indexOf('data-media-id')).toBeLessThan(
    container.innerHTML.indexOf('After'),
  );
  expect(container.querySelector('[data-external-mention-id="external-user"]')?.textContent).toBe(
    '@Jamie',
  );
  expect(container.innerHTML.indexOf('@Jamie')).toBeLessThan(
    container.innerHTML.indexOf('data-media-id'),
  );
  expect(fetchImage).not.toHaveBeenCalled();
});

it('limits concurrent requests and cancels obsolete queued images before provider acquisition', async () => {
  const pending: (() => void)[] = [];
  fetchImage.mockImplementation(
    (_url: string, options: { signal: AbortSignal }) =>
      new Promise<Response>((resolve, reject) => {
        pending.push(() => resolve(imageResponse()));
        options.signal.addEventListener('abort', () => reject(options.signal.reason), {
          once: true,
        });
      }),
  );
  for (let i = 0; i < 5; i++) {
    await render();
    await visible(i);
  }
  expect(fetchImage).toHaveBeenCalledTimes(3);
  await act(async () => roots[4]!.root.unmount());
  await act(async () => pending[0]!());
  expect(fetchImage).toHaveBeenCalledTimes(4);
  await act(async () => pending.slice(1).forEach((resolve) => resolve()));
  expect(fetchImage).toHaveBeenCalledTimes(4);
});

it.each([
  [413, '25'],
  [422, '格式'],
  [403, '不可访问'],
])('explains status %s without creating an image URL', async (status, text) => {
  fetchImage.mockResolvedValue(new Response(null, { status }));
  const container = await render();
  await visible();
  expect(container.textContent).toContain(text);
  expect(createUrl).not.toHaveBeenCalled();
});

it.each([2048, undefined])(
  'QQ file cards retain their known metadata without inventing size: %s',
  async (sizeBytes) => {
    const id = 'b'.repeat(64);
    const message = parseChannelMessage({
      id: 'source',
      at: '2026-10-08T00:00:00Z',
      body: 'Process file',
      author: { kind: 'bridged', source: 'Alex' },
      bridgeOrigin: {
        sourceEventId: 'source',
        platform: 'qq',
        conversationId: 'app-group',
        conversationName: 'QA',
        messageId: 'native-source',
        senderId: 'actor',
      },
      bridgeMedia: {
        items: [
          {
            id,
            kind: 'file',
            name: 'input.csv',
            ...(sizeBytes === undefined ? {} : { sizeBytes }),
          },
        ],
      },
    });
    expect(message).toBeDefined();
    if (!message) throw new Error('Valid file metadata rejected');
    const container = await render(
      createElement(ChannelMessageBody, { channelId: 'channel', t: zhTranslate, message }),
    );
    const link = container.querySelector<HTMLAnchorElement>('a[download]');
    expect(link?.textContent).toContain('input.csv');
    expect(link?.textContent).toContain('文件');
    expect(link?.textContent?.includes('2 KB')).toBe(sizeBytes !== undefined);
    expect(link?.getAttribute('href')).toContain('sourceEventId=source');
    expect(link?.getAttribute('href')).toContain('attachmentId=' + id);
    expect(fetchImage).not.toHaveBeenCalled();
  },
);
